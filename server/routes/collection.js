import { Router } from 'express'
import Card from '../models/Card.js'
import CollectionItem, { CONDITIONS } from '../models/CollectionItem.js'
import { shapeCard, shapeItem } from './catalog.js'
import { toObjectId } from '../utils/ids.js'

// The user's own collection. Every write here is keyed on a catalog cardId that
// must already exist — users never create cards, they only claim them.
const router = Router()

// Fields a client may set. Anything else in the body is ignored rather than
// rejected, so adding a field to the client can't 400 an older server.
const FIELDS = ['quantity', 'condition', 'language', 'notes', 'favorite', 'purchase']

function pick(body) {
  const out = {}
  for (const k of FIELDS) if (body[k] !== undefined) out[k] = body[k]
  if (out.quantity !== undefined) out.quantity = Math.max(1, Number(out.quantity) || 1)
  if (out.condition !== undefined && !CONDITIONS.includes(out.condition)) delete out.condition
  // `purchase: null` clears it; an object is stored as-is (its own sub-schema
  // validates the shape).
  if (out.purchase !== undefined && out.purchase !== null && typeof out.purchase !== 'object') {
    delete out.purchase
  }
  return out
}

// GET /collection — every owned card for the signed-in user, newest first.
// Used by the "my collection" view and the value summary. Paged, because a
// serious collection runs to thousands of rows.
router.get('/collection', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 60))
    const filter = { profileId: req.profile.profileId }
    if (req.query.series) filter.seriesId = String(req.query.series)
    if (req.query.set) filter.setId = String(req.query.set)
    if (String(req.query.favorite) === 'yes') filter.favorite = true

    const [items, total] = await Promise.all([
      CollectionItem.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      CollectionItem.countDocuments(filter),
    ])

    // Join the catalog rows for this page so the client can render straight away.
    const cards = await Card.find({ cardId: { $in: items.map((i) => i.cardId) } }).lean()
    const byId = new Map(cards.map((c) => [c.cardId, shapeCard(c)]))

    res.json({
      items: items.map((i) => ({ ...shapeItem(i), card: byId.get(i.cardId) ?? null })),
      total,
      page,
      pageSize,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /collection/value — what the collection is worth, by source currency.
// No conversion is done: EUR (CardMarket) and USD (TCGplayer) values are
// reported separately rather than invented into one number with a made-up rate.
router.get('/collection/value', async (req, res) => {
  try {
    // Aggregations don't cast the JWT's string id — see utils/ids.js.
    const pid = toObjectId(req.profile.profileId)
    if (!pid) return res.json({ totals: [] })
    const rows = await CollectionItem.aggregate([
      { $match: { profileId: pid } },
      {
        $lookup: {
          from: 'dexcards',
          localField: 'cardId',
          foreignField: 'cardId',
          as: 'card',
          pipeline: [{ $project: { marketValue: 1 } }],
        },
      },
      { $unwind: '$card' },
      { $match: { 'card.marketValue.amount': { $ne: null } } },
      {
        $group: {
          _id: '$card.marketValue.currency',
          // quantity-weighted: three copies are worth three times one.
          amount: { $sum: { $multiply: ['$card.marketValue.amount', '$quantity'] } },
          cards: { $sum: '$quantity' },
        },
      },
    ])
    res.json({ totals: rows.map((r) => ({ currency: r._id || 'EUR', amount: r.amount, cards: r.cards })) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /collection — add a card, or bump an existing entry.
// Body: { cardId, quantity?, condition?, language?, notes?, purchase? }
// Idempotent-ish by design: adding a card you already own increments the count
// rather than erroring, because that's what tapping "+" on a card should do.
router.post('/collection', async (req, res) => {
  try {
    const cardId = String(req.body?.cardId ?? '').trim()
    if (!cardId) return res.status(400).json({ error: 'cardId is required' })

    // The catalog is the authority for which cards exist AND for the set/series
    // stamped onto the item, so progress can never disagree with the catalog.
    const card = await Card.findOne({ cardId }).select('cardId setId seriesId').lean()
    if (!card) return res.status(404).json({ error: 'Card not found' })

    const data = pick(req.body ?? {})
    const existing = await CollectionItem.findOne({ profileId: req.profile.profileId, cardId })

    if (existing) {
      existing.quantity += data.quantity ?? 1
      for (const k of FIELDS) if (k !== 'quantity' && data[k] !== undefined) existing[k] = data[k]
      await existing.save()
      return res.json(shapeItem(existing.toObject()))
    }

    const item = await CollectionItem.create({
      ...data,
      profileId: req.profile.profileId,
      cardId: card.cardId,
      setId: card.setId,
      seriesId: card.seriesId,
    })
    res.status(201).json(shapeItem(item.toObject()))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /collection/:cardId — edit an entry in place (quantity is SET here, not
// incremented; POST is the "add one more" verb).
router.patch('/collection/:cardId', async (req, res) => {
  try {
    const item = await CollectionItem.findOneAndUpdate(
      { profileId: req.profile.profileId, cardId: req.params.cardId },
      { $set: pick(req.body ?? {}) },
      { new: true, runValidators: true }
    ).lean()
    if (!item) return res.status(404).json({ error: 'Not in your collection' })
    res.json(shapeItem(item))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /collection/:cardId — remove the card from the collection entirely.
// The catalog row is untouched; the card simply goes back to "not owned".
router.delete('/collection/:cardId', async (req, res) => {
  try {
    const r = await CollectionItem.deleteOne({ profileId: req.profile.profileId, cardId: req.params.cardId })
    if (!r.deletedCount) return res.status(404).json({ error: 'Not in your collection' })
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
