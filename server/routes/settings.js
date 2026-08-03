import { Router } from 'express'
import Settings from '../models/Settings.js'

// Per-user preferences. Created lazily: a user who never opens settings has no
// document, and GET simply answers the schema defaults.
const router = Router()

const FIELDS = ['preferredPriceSource', 'defaultBinderLayout', 'showUnowned', 'showPricesInGrid']

function shape(doc) {
  const d = doc || {}
  return {
    preferredPriceSource: d.preferredPriceSource ?? 'cardmarket',
    defaultBinderLayout: d.defaultBinderLayout ?? '3x3',
    showUnowned: d.showUnowned ?? true,
    showPricesInGrid: d.showPricesInGrid ?? false,
  }
}

router.get('/settings', async (req, res) => {
  try {
    res.json(shape(await Settings.findOne({ profileId: req.profile.profileId }).lean()))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/settings', async (req, res) => {
  try {
    const patch = {}
    for (const k of FIELDS) if (req.body?.[k] !== undefined) patch[k] = req.body[k]
    const doc = await Settings.findOneAndUpdate(
      { profileId: req.profile.profileId },
      { $set: patch },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean()
    res.json(shape(doc))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
