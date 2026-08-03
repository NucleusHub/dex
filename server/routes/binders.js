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

// Binders. Permissions are entirely delegated to the active access policy
// (utils/binderAccess.js): with no sharing plugin installed the policy is
// personal-only and these routes behave exactly as if sharing didn't exist.
const router = Router()
const uploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')

// Load a binder and the caller's role on it in one place, so no route forgets
// the permission check. Returns null (and answers 404) when they may not see it
// — a 404 rather than a 403, so binder ids can't be probed for existence.
async function loadFor(req, res) {
  const binder = await Binder.findById(req.params.id).lean().catch(() => null)
  if (!binder) { res.status(404).json({ error: 'Binder not found' }); return null }
  const role = await roleFor(binder, req.profile.profileId)
  if (!canView(role)) { res.status(404).json({ error: 'Binder not found' }); return null }
  return { binder, role }
}

// Resolve a cover descriptor to a URL the client can render. Upload covers are
// already URLs; `set` and `card` covers point at official artwork in the catalog
// and are looked up so a re-sync's better image is picked up automatically.
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
    // Everything the client needs to decide which affordances to show. It still
    // gates on these; the server re-checks on every write regardless.
    role,
    canEditCards: canEditCards(role),
    canEditBinder: canEditBinder(role),
    // Present so shared-binder UI can tell a group binder from a personal one
    // without knowing the plugin's internals.
    groupId: b.groupId ? String(b.groupId) : null,
    shared: !!b.groupId || (b.shares?.length ?? 0) > 0,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}

// GET /binders — every binder the caller may open.
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

// GET /binders/covers — the official artwork a user can pick a cover from.
// Sourced from the synced catalog (set logos), which is genuine official art
// already on hand — so no copyrighted images are vendored into the repo.
//
// Declared before `/binders/:id` because Express matches in order and would
// otherwise read "covers" as a binder id.
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

// POST /binders — create one. Cover and layout are optional; a binder with no
// cover renders a generated gradient rather than a placeholder image.
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

// GET /binders/:id — the binder plus its pages, each pocket resolved to a full
// card (and to the caller's own ownership of that card, so a shared binder can
// show "you don't have this one").
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
    // Always render at least as many pages as the highest filled pocket needs,
    // so a layout change from 3×3 to 2×2 can never hide cards off the end.
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

// PATCH /binders/:id — rename / re-cover / change layout / add pages.
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
      // Replacing an uploaded cover leaves the old file orphaned otherwise.
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

// DELETE /binders/:id — the binder only. The cards inside stay in the user's
// collection: a binder is an arrangement of cards, not a container that owns them.
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

// PUT /binders/:id/slots/:position — put a card in a pocket, or empty it with
// `{ cardId: null }`. One pocket per request: that's exactly the granularity of
// the interaction, and it keeps concurrent edits to a shared binder from
// clobbering each other the way a whole-binder PUT would.
router.put('/binders/:id/slots/:position', async (req, res) => {
  try {
    const loaded = await loadFor(req, res)
    if (!loaded) return
    if (!canEditCards(loaded.role)) return res.status(403).json({ error: 'Not allowed' })

    const position = Number(req.params.position)
    if (!Number.isInteger(position) || position < 0) return res.status(400).json({ error: 'Bad position' })

    const cardId = req.body?.cardId ? String(req.body.cardId) : null
    if (cardId && !(await Card.exists({ cardId }))) return res.status(404).json({ error: 'Card not found' })

    // Clear the pocket first either way, so setting a card is an overwrite and
    // clearing is just the first half on its own.
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

// PUT /binders/:id/slots — reorder/replace the whole layout in one write. Used
// by drag-and-drop, which moves two pockets at once and would otherwise flicker.
router.put('/binders/:id/slots', async (req, res) => {
  try {
    const loaded = await loadFor(req, res)
    if (!loaded) return
    if (!canEditCards(loaded.role)) return res.status(403).json({ error: 'Not allowed' })

    const incoming = Array.isArray(req.body?.slots) ? req.body.slots : []
    // Last write wins per position, so a malformed payload can't create two
    // cards in one pocket.
    const byPosition = new Map()
    for (const s of incoming) {
      const position = Number(s?.position)
      const cardId = s?.cardId ? String(s.cardId) : null
      if (!Number.isInteger(position) || position < 0 || !cardId) continue
      byPosition.set(position, { position, cardId })
    }
    const slots = [...byPosition.values()]

    // Reject unknown cards outright rather than silently dropping pockets.
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeCover(cover) {
  const kind = ['none', 'upload', 'set', 'card'].includes(cover?.kind) ? cover.kind : 'none'
  if (kind === 'upload') return { kind, url: String(cover.url ?? ''), refId: '' }
  if (kind === 'set' || kind === 'card') return { kind, url: '', refId: String(cover.refId ?? '') }
  return { kind: 'none', url: '', refId: '' }
}

// Remove a cover file from disk if (and only if) it's one we uploaded locally.
function unlinkUpload(url) {
  if (url?.startsWith('/uploads/')) {
    fs.unlink(path.join(uploadsDir, path.basename(url)), () => {})
  }
}

export default router
