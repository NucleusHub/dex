import { Router } from 'express'
import Card from '../models/Card.js'
import CollectionItem, { CONDITIONS } from '../models/CollectionItem.js'
import { shapeCard, shapeItem } from './catalog.js'
import { toObjectId } from '../utils/ids.js'

const router = Router()

const FIELDS = ['quantity', 'condition', 'language', 'notes', 'favorite', 'purchase']

function pick(body) {
  const out = {}
  for (const k of FIELDS) if (body[k] !== undefined) out[k] = body[k]
  if (out.quantity !== undefined) out.quantity = Math.max(1, Number(out.quantity) || 1)
  if (out.condition !== undefined && !CONDITIONS.includes(out.condition)) delete out.condition
  if (out.purchase !== undefined && out.purchase !== null && typeof out.purchase !== 'object') {
    delete out.purchase
  }
  return out
}

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

router.get('/collection/value', async (req, res) => {
  try {
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

router.post('/collection', async (req, res) => {
  try {
    const cardId = String(req.body?.cardId ?? '').trim()
    if (!cardId) return res.status(400).json({ error: 'cardId is required' })

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
