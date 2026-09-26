import { Router } from 'express'
import Series from '../models/Series.js'
import Set_ from '../models/Set.js'
import Card from '../models/Card.js'
import CollectionItem from '../models/CollectionItem.js'
import CatalogState from '../models/CatalogState.js'
import { ownedBySeries, ownedBySet, withProgress } from '../utils/progress.js'
import { toObjectId } from '../utils/ids.js'

const router = Router()

router.get('/catalog/state', async (_req, res) => {
  try {
    const doc = await CatalogState.findOne({ key: 'catalog' }).lean()
    res.json({
      status: doc?.status ?? 'idle',
      phase: doc?.phase ?? '',
      processed: doc?.processed ?? 0,
      total: doc?.total ?? 0,
      cardsWritten: doc?.cardsWritten ?? 0,
      lastSyncAt: doc?.lastSyncAt ?? null,
      error: doc?.error ?? '',
      counts: doc?.counts ?? { series: 0, sets: 0, cards: 0 },
      empty: (doc?.counts?.cards ?? 0) === 0,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/series', async (req, res) => {
  try {
    const [rows, owned] = await Promise.all([
      Series.find().sort({ lastRelease: -1, name: 1 }).lean(),
      ownedBySeries(req.profile.profileId),
    ])
    res.json(rows.map((s) => withProgress(shapeSeries(s), owned.get(s.seriesId), s.cardCount)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/series/:seriesId', async (req, res) => {
  try {
    const series = await Series.findOne({ seriesId: req.params.seriesId }).lean()
    if (!series) return res.status(404).json({ error: 'Series not found' })

    const [sets, owned, seriesOwned] = await Promise.all([
      Set_.find({ seriesId: series.seriesId }).sort({ releaseDate: -1, name: 1 }).lean(),
      ownedBySet(req.profile.profileId, series.seriesId),
      ownedBySeries(req.profile.profileId),
    ])

    res.json({
      series: withProgress(shapeSeries(series), seriesOwned.get(series.seriesId), series.cardCount),
      sets: sets.map((s) => withProgress(shapeSet(s), owned.get(s.setId), s.total)),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/sets/:setId', async (req, res) => {
  try {
    const set = await Set_.findOne({ setId: req.params.setId }).lean()
    if (!set) return res.status(404).json({ error: 'Set not found' })

    const [cards, items, series] = await Promise.all([
      Card.find({ setId: set.setId }).sort({ numberSort: 1 }).lean(),
      CollectionItem.find({ profileId: req.profile.profileId, setId: set.setId }).lean(),
      Series.findOne({ seriesId: set.seriesId }).lean(),
    ])

    const byCard = new Map(items.map((i) => [i.cardId, shapeItem(i)]))
    res.json({
      set: withProgress(shapeSet(set), items.length, set.total),
      series: series ? shapeSeries(series) : null,
      cards: cards.map((c) => ({ ...shapeCard(c), owned: byCard.get(c.cardId) ?? null })),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/cards/:cardId', async (req, res) => {
  try {
    const card = await Card.findOne({ cardId: req.params.cardId }).lean()
    if (!card) return res.status(404).json({ error: 'Card not found' })

    const [set, series, item] = await Promise.all([
      Set_.findOne({ setId: card.setId }).lean(),
      Series.findOne({ seriesId: card.seriesId }).lean(),
      CollectionItem.findOne({ profileId: req.profile.profileId, cardId: card.cardId }).lean(),
    ])

    res.json({
      card: shapeCard(card),
      set: set ? shapeSet(set) : null,
      series: series ? shapeSeries(series) : null,
      owned: item ? shapeItem(item) : null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/stats', async (req, res) => {
  try {
    const pid = toObjectId(req.profile.profileId)
    const [totals, owned, seriesCount, setCount] = await Promise.all([
      Series.aggregate([{ $group: { _id: null, cards: { $sum: '$cardCount' } } }]),
      pid
        ? CollectionItem.aggregate([
            { $match: { profileId: pid } },
            { $group: { _id: null, distinct: { $sum: 1 }, copies: { $sum: '$quantity' } } },
          ])
        : [],
      Series.estimatedDocumentCount(),
      Set_.estimatedDocumentCount(),
    ])
    const total = totals[0]?.cards ?? 0
    const distinct = owned[0]?.distinct ?? 0
    res.json({
      ...withProgress({}, distinct, total).progress,
      copies: owned[0]?.copies ?? 0,
      seriesCount,
      setCount,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export function shapeSeries(s) {
  return {
    seriesId: s.seriesId,
    name: s.name,
    artworkUrl: s.artworkUrl || null,
    artworkPool: s.artworkPool || [],
    setCount: s.setCount || 0,
    cardCount: s.cardCount || 0,
    firstRelease: s.firstRelease || null,
    lastRelease: s.lastRelease || null,
  }
}

export function shapeSet(s) {
  return {
    setId: s.setId,
    name: s.name,
    seriesId: s.seriesId,
    seriesName: s.seriesName,
    printedTotal: s.printedTotal || 0,
    total: s.total || 0,
    releaseDate: s.releaseDate || null,
    ptcgoCode: s.ptcgoCode || '',
    symbolUrl: s.symbolUrl || null,
    logoUrl: s.logoUrl || null,
  }
}

export function shapeCard(c) {
  return {
    cardId: c.cardId,
    name: c.name,
    setId: c.setId,
    setName: c.setName,
    seriesId: c.seriesId,
    seriesName: c.seriesName,
    number: c.number,
    rarity: c.rarity || '',
    supertype: c.supertype || '',
    subtypes: c.subtypes || [],
    types: c.types || [],
    artist: c.artist || '',
    flavorText: c.flavorText || '',
    nationalPokedexNumbers: c.nationalPokedexNumbers || [],
    language: c.language || 'en',
    images: c.images || {},
    marketValue: c.marketValue?.amount != null ? c.marketValue : null,
    prices: c.prices || {},
    links: c.links || {},
  }
}

export function shapeItem(i) {
  return {
    cardId: i.cardId,
    quantity: i.quantity,
    condition: i.condition,
    language: i.language,
    notes: i.notes || '',
    favorite: !!i.favorite,
    purchase: i.purchase || null,
    addedAt: i.createdAt,
    updatedAt: i.updatedAt,
  }
}

export default router
