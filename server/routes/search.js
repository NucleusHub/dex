import { Router } from 'express'
import Card from '../models/Card.js'
import CollectionItem from '../models/CollectionItem.js'
import { normalizeName, escapeRegex } from '../utils/normalize.js'
import { shapeCard, shapeItem } from './catalog.js'

const router = Router()

const PAGE_SIZE = 60
const MAX_PAGE_SIZE = 120

router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim()
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || PAGE_SIZE))

    const filter = {}
    if (req.query.series) filter.seriesId = String(req.query.series)
    if (req.query.set) filter.setId = String(req.query.set)
    if (req.query.rarity) filter.rarity = String(req.query.rarity)
    if (req.query.type) filter.types = String(req.query.type)

    if (q) {
      const norm = normalizeName(q)
      const ors = []
      if (norm) ors.push({ searchName: new RegExp(escapeRegex(norm)) })
      if (/^[a-z]{0,3}\d{1,4}[a-z]?$/i.test(q)) {
        ors.push({ number: new RegExp(`^0*${escapeRegex(q.replace(/^0+/, ''))}$`, 'i') })
      }
      if (!ors.length) return res.json({ results: [], total: 0, page, pageSize })
      filter.$or = ors
    }

    const ownedFilter = String(req.query.owned ?? '')
    if (ownedFilter === 'yes' || ownedFilter === 'no') {
      const mine = await CollectionItem.find({ profileId: req.profile.profileId }).select('cardId').lean()
      const ids = mine.map((m) => m.cardId)
      filter.cardId = ownedFilter === 'yes' ? { $in: ids } : { $nin: ids }
    }

    if (!q && !req.query.series && !req.query.set && !req.query.rarity && !req.query.type) {
      return res.json({ results: [], total: 0, page, pageSize })
    }

    const [cards, total] = await Promise.all([
      Card.find(filter)
        .sort({ seriesId: 1, setId: 1, numberSort: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Card.countDocuments(filter),
    ])

    const items = await CollectionItem.find({
      profileId: req.profile.profileId,
      cardId: { $in: cards.map((c) => c.cardId) },
    }).lean()
    const byCard = new Map(items.map((i) => [i.cardId, shapeItem(i)]))

    res.json({
      results: cards.map((c) => ({ ...shapeCard(c), owned: byCard.get(c.cardId) ?? null })),
      total,
      page,
      pageSize,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/facets', async (_req, res) => {
  try {
    const [rarities, types] = await Promise.all([
      Card.distinct('rarity'),
      Card.distinct('types'),
    ])
    res.json({
      rarities: rarities.filter(Boolean).sort((a, b) => a.localeCompare(b)),
      types: types.filter(Boolean).sort((a, b) => a.localeCompare(b)),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
