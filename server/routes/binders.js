import { Router } from 'express'
import path from 'path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'
import Binder, { LAYOUTS, SLOTS_PER_PAGE } from '../models/Binder.js'
import Card from '../models/Card.js'
import Set_ from '../models/Set.js'
import CollectionItem from '../models/CollectionItem.js'
import { shapeCard, shapeItem } from './catalog.js'
import {
  listFilterFor, roleFor, activePolicyId,
  canView, canEditCards, canEditBinder, canDelete,
} from '../utils/binderAccess.js'

const router = Router()
const uploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')

// 404 rather than 403 so binder ids can't be probed for existence.
async function loadFor(req, res) {
  const binder = await Binder.findById(req.params.id).lean().catch(() => null)
  if (!binder) { res.status(404).json({ error: 'Binder not found' }); return null }
  const role = await roleFor(binder, req.profile.profileId)
  if (!canView(role)) { res.status(404).json({ error: 'Binder not found' }); return null }
  return { binder, role }
}

async function resolveCovers(binders) {
  const setIds = binders.filter((b) => b.cover?.kind === 'set').map((b) => b.cover.refId)
  const cardIds = binders.filter((b) => b.cover?.kind === 'card').map((b) => b.cover.refId)
  const [sets, cards] = await Promise.all([
    setIds.length ? Set_.find({ setId: { $in: setIds } }).select('setId logoUrl').lean() : [],
    cardIds.length ? Card.find({ cardId: { $in: cardIds } }).select('cardId images').lean() : [],
  ])
  const setLogo = new Map(sets.map((s) => [s.setId, s.logoUrl]))
  const cardArt = new Map(cards.map((c) => [c.cardId, c.images?.large || c.images?.small]))
  return (b) => {
    const c = b.cover || {}
    if (c.kind === 'upload') return c.url || null
    if (c.kind === 'set') return setLogo.get(c.refId) || null
    if (c.kind === 'card') return cardArt.get(c.refId) || null
    return null
  }
}

function shapeBinder(b, role, coverUrl) {
  return {
    id: String(b._id),
    name: b.name,
    layout: b.layout,
    pageCount: b.pageCount,
    slotsPerPage: SLOTS_PER_PAGE[b.layout] ?? 9,
    cardCount: (b.slots || []).length,
    cover: b.cover || { kind: 'none' },
    coverUrl,
    role,
    canEditCards: canEditCards(role),
    canEditBinder: canEditBinder(role),
    groupId: b.groupId ? String(b.groupId) : null,
    shared: !!b.groupId || (b.shares?.length ?? 0) > 0,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}

router.get('/binders', async (req, res) => {
  try {
    const filter = await listFilterFor(req.profile.profileId)
    const binders = await Binder.find(filter).sort({ updatedAt: -1 }).lean()
    const coverFor = await resolveCovers(binders)
    const rows = await Promise.all(
      binders.map(async (b) => shapeBinder(b, await roleFor(b, req.profile.profileId), coverFor(b)))
    )
    res.json({ binders: rows, policy: activePolicyId() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Declared before /binders/:id so "covers" isn't matched as an id.
router.get('/binders/covers', async (_req, res) => {
  try {
    const sets = await Set_.find({ logoUrl: { $ne: null } })
      .select('setId name seriesName logoUrl releaseDate')
      .sort({ releaseDate: -1 })
      .limit(300)
      .lean()
    res.json({
      sets: sets.map((s) => ({ setId: s.setId, name: s.name, seriesName: s.seriesName, url: s.logoUrl })),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/binders', async (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim()
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const layout = LAYOUTS.includes(req.body?.layout) ? req.body.layout : '3x3'

    const binder = await Binder.create({
      profileId: req.profile.profileId,
      name,
      layout,
      pageCount: Math.max(1, Number(req.body?.pageCount) || 1),
      cover: sanitizeCover(req.body?.cover),
    })
    const doc = binder.toObject()
    const coverFor = await resolveCovers([doc])
    res.status(201).json(shapeBinder(doc, 'owner', coverFor(doc)))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/binders/:id', async (req, res) => {
  try {
    const loaded = await loadFor(req, res)
    if (!loaded) return
    const { binder, role } = loaded

    const cardIds = (binder.slots || []).map((s) => s.cardId)
    const [cards, items] = await Promise.all([
      cardIds.length ? Card.find({ cardId: { $in: cardIds } }).lean() : [],
      cardIds.length
        ? CollectionItem.find({ profileId: req.profile.profileId, cardId: { $in: cardIds } }).lean()
        : [],
    ])
    const byCard = new Map(cards.map((c) => [c.cardId, shapeCard(c)]))
    const byOwned = new Map(items.map((i) => [i.cardId, shapeItem(i)]))

    const perPage = SLOTS_PER_PAGE[binder.layout] ?? 9
    const highest = (binder.slots || []).reduce((m, s) => Math.max(m, s.position), -1)
    const pageCount = Math.max(binder.pageCount || 1, Math.floor(highest / perPage) + 1)

    const pages = Array.from({ length: pageCount }, (_, p) =>
      Array.from({ length: perPage }, (_, i) => {
        const position = p * perPage + i
        const slot = (binder.slots || []).find((s) => s.position === position)
        if (!slot) return { position, card: null, owned: null }
        return {
          position,
          card: byCard.get(slot.cardId) ?? null,
          owned: byOwned.get(slot.cardId) ?? null,
        }
      })
    )

    const coverFor = await resolveCovers([binder])
    res.json({ binder: { ...shapeBinder(binder, role, coverFor(binder)), pageCount }, pages })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/binders/:id', async (req, res) => {
  try {
    const loaded = await loadFor(req, res)
    if (!loaded) return
    if (!canEditBinder(loaded.role)) return res.status(403).json({ error: 'Not allowed' })

    const patch = {}
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim()
      if (!name) return res.status(400).json({ error: 'Name cannot be empty' })
      patch.name = name
    }
    if (req.body?.layout !== undefined && LAYOUTS.includes(req.body.layout)) patch.layout = req.body.layout
    if (req.body?.pageCount !== undefined) patch.pageCount = Math.max(1, Number(req.body.pageCount) || 1)
    if (req.body?.cover !== undefined) {
      const prev = loaded.binder.cover
      patch.cover = sanitizeCover(req.body.cover)
      if (prev?.kind === 'upload' && prev.url !== patch.cover.url) unlinkUpload(prev.url)
    }

    const binder = await Binder.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true }).lean()
    const coverFor = await resolveCovers([binder])
    res.json(shapeBinder(binder, loaded.role, coverFor(binder)))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.delete('/binders/:id', async (req, res) => {
  try {
    const loaded = await loadFor(req, res)
    if (!loaded) return
    if (!canDelete(loaded.role)) return res.status(403).json({ error: 'Not allowed' })
    if (loaded.binder.cover?.kind === 'upload') unlinkUpload(loaded.binder.cover.url)
    await Binder.deleteOne({ _id: req.params.id })
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/binders/:id/slots/:position', async (req, res) => {
  try {
    const loaded = await loadFor(req, res)
    if (!loaded) return
    if (!canEditCards(loaded.role)) return res.status(403).json({ error: 'Not allowed' })

    const position = Number(req.params.position)
    if (!Number.isInteger(position) || position < 0) return res.status(400).json({ error: 'Bad position' })

    const cardId = req.body?.cardId ? String(req.body.cardId) : null
    if (cardId && !(await Card.exists({ cardId }))) return res.status(404).json({ error: 'Card not found' })

    await Binder.updateOne({ _id: req.params.id }, { $pull: { slots: { position } } })
    if (cardId) {
      await Binder.updateOne({ _id: req.params.id }, { $push: { slots: { position, cardId } } })
    }

    const binder = await Binder.findById(req.params.id).lean()
    const coverFor = await resolveCovers([binder])
    res.json(shapeBinder(binder, loaded.role, coverFor(binder)))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.put('/binders/:id/slots', async (req, res) => {
  try {
    const loaded = await loadFor(req, res)
    if (!loaded) return
    if (!canEditCards(loaded.role)) return res.status(403).json({ error: 'Not allowed' })

    const incoming = Array.isArray(req.body?.slots) ? req.body.slots : []
    const byPosition = new Map()
    for (const s of incoming) {
      const position = Number(s?.position)
      const cardId = s?.cardId ? String(s.cardId) : null
      if (!Number.isInteger(position) || position < 0 || !cardId) continue
      byPosition.set(position, { position, cardId })
    }
    const slots = [...byPosition.values()]

    const ids = [...new Set(slots.map((s) => s.cardId))]
    if (ids.length) {
      const known = await Card.countDocuments({ cardId: { $in: ids } })
      if (known !== ids.length) return res.status(400).json({ error: 'Unknown card in slots' })
    }

    const binder = await Binder.findByIdAndUpdate(req.params.id, { $set: { slots } }, { new: true }).lean()
    const coverFor = await resolveCovers([binder])
    res.json(shapeBinder(binder, loaded.role, coverFor(binder)))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

function sanitizeCover(cover) {
  const kind = ['none', 'upload', 'set', 'card'].includes(cover?.kind) ? cover.kind : 'none'
  if (kind === 'upload') return { kind, url: String(cover.url ?? ''), refId: '' }
  if (kind === 'set' || kind === 'card') return { kind, url: '', refId: String(cover.refId ?? '') }
  return { kind: 'none', url: '', refId: '' }
}

function unlinkUpload(url) {
  if (url?.startsWith('/uploads/')) {
    fs.unlink(path.join(uploadsDir, path.basename(url)), () => {})
  }
}

export default router
