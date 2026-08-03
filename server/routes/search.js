import { Router } from 'express'
import Card from '../models/Card.js'
import CollectionItem from '../models/CollectionItem.js'
import { normalizeName, escapeRegex } from '../utils/normalize.js'
import { shapeCard, shapeItem } from './catalog.js'

// Search runs over the COMPLETE catalog, not the user's collection — that's the
// point: you look a card up, then decide whether to add it. Ownership is only an
// annotation on the results (and an optional filter).
const router = Router()

const PAGE_SIZE = 60
const MAX_PAGE_SIZE = 120

// GET /search?q=&series=&set=&rarity=&owned=&page=&pageSize=
//
// `q` matches a card's name OR its printed number, so "charizard", "025" and
// "TG12" all work. Everything else is an exact facet filter. Results are paged
// because a bare rarity filter can match thousands of cards.
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
      // Name: substring match on the normalised, indexed field, so "pikachu"
      // finds "Pikachu V" and accents/punctuation don't matter either side.
      if (norm) ors.push({ searchName: new RegExp(escapeRegex(norm)) })
      // Number: anchored, and only when the query looks like one — otherwise a
      // plain word query would scan every card number for nothing.
      if (/^[a-z]{0,3}\d{1,4}[a-z]?$/i.test(q)) {
        ors.push({ number: new RegExp(`^0*${escapeRegex(q.replace(/^0+/, ''))}$`, 'i') })
      }
      if (!ors.length) return res.json({ results: [], total: 0, page, pageSize })
      filter.$or = ors
    }

    // "Owned only" / "missing only" is applied as a card-id filter rather than a
    // post-filter, so paging stays correct.
    const ownedFilter = String(req.query.owned ?? '')
    if (ownedFilter === 'yes' || ownedFilter === 'no') {
      const mine = await CollectionItem.find({ profileId: req.profile.profileId }).select('cardId').lean()
      const ids = mine.map((m) => m.cardId)
      filter.cardId = ownedFilter === 'yes' ? { $in: ids } : { $nin: ids }
    }

    // A query with no terms and no facets would page through the entire
    // catalog; that's a browse, not a search, and the series view does it better.
    if (!q && !req.query.series && !req.query.set && !req.query.rarity && !req.query.type) {
      return res.json({ results: [], total: 0, page, pageSize })
    }

    const [cards, total] = await Promise.all([
      Card.find(filter)
        // Newest first, then release order within the set — a search for a
        // Pokémon should surface its modern printings before its 1999 one.
        .sort({ seriesId: 1, setId: 1, numberSort: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Card.countDocuments(filter),
    ])

    // Annotate just this page's cards with ownership — one indexed lookup.
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

// GET /facets — the distinct values the search filters offer. Derived from the
// catalog so the dropdowns only ever list rarities/types that actually exist.
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
