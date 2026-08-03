import { Router } from 'express'
import path from 'path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'
import Series from '../models/Series.js'
import Binder from '../models/Binder.js'
import CollectionItem from '../models/CollectionItem.js'
import Settings from '../models/Settings.js'
import CatalogState from '../models/CatalogState.js'
import { requireAdmin } from '../middleware/auth.js'
import { describeSources } from '../sources/index.js'
import { runSync, isRunning, loadConfig } from '../sync/runner.js'

// Admin-only catalog management. Everything here operates on the GLOBAL card
// database or on another user's data, which is exactly why it's gated.
const router = Router()
const uploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')

// GET /admin/catalog — sources, current config and sync state, for the admin
// panel. `hasApiKey` is a boolean, never the key itself.
router.get('/admin/catalog', requireAdmin, async (_req, res) => {
  try {
    const config = await loadConfig()
    res.json({
      sourceId: config.sourceId,
      hasApiKey: !!config.apiKey,
      sources: describeSources(config),
      running: isRunning() || config.status === 'running',
      status: config.status,
      phase: config.phase,
      processed: config.processed,
      total: config.total,
      cardsWritten: config.cardsWritten,
      cursorSetId: config.cursorSetId,
      lastSyncAt: config.lastSyncAt,
      error: config.error,
      counts: config.counts,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /admin/catalog — set the source and/or API key. Sending `apiKey: ''`
// clears it (back to keyless, rate-limited access); omitting it leaves it alone,
// so the admin UI never has to round-trip a secret it can't read.
router.patch('/admin/catalog', requireAdmin, async (req, res) => {
  try {
    const patch = {}
    if (req.body?.sourceId !== undefined) patch.sourceId = String(req.body.sourceId)
    if (req.body?.apiKey !== undefined) patch.apiKey = String(req.body.apiKey)
    await CatalogState.findOneAndUpdate({ key: 'catalog' }, { $set: patch }, { upsert: true })
    const config = await loadConfig()
    res.json({ sourceId: config.sourceId, hasApiKey: !!config.apiKey })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /admin/catalog/sync — kick off a sync and return immediately. A full
// first run downloads ~20k cards over several minutes, so it deliberately does
// NOT block the request; the client polls /catalog/state for progress.
router.post('/admin/catalog/sync', requireAdmin, async (req, res) => {
  try {
    if (isRunning()) return res.status(409).json({ error: 'A sync is already running' })
    const force = String(req.body?.force ?? '') === 'true' || req.body?.force === true
    // Fire and forget — runSync writes its own progress and error state.
    runSync({ force }).catch((e) => console.error('[dex] sync crashed:', e))
    res.status(202).json({ started: true, force })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /admin/series/:seriesId/artwork — pin the homepage image for a series to
// a specific official booster-pack image. `{ artworkUrl: null }` hands it back
// to the automatic pick from the series' own set logos.
router.patch('/admin/series/:seriesId/artwork', requireAdmin, async (req, res) => {
  try {
    const raw = req.body?.artworkUrl
    const artworkUrl = raw == null || raw === '' ? null : String(raw)
    const series = await Series.findOneAndUpdate(
      { seriesId: req.params.seriesId },
      { $set: { artworkUrl } },
      { new: true }
    ).lean()
    if (!series) return res.status(404).json({ error: 'Series not found' })
    res.json({ seriesId: series.seriesId, artworkUrl: series.artworkUrl })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /users/:userId/teardown — called by the admin panel when a user is
// deleted: purge all of their Dex data and any binder covers they uploaded.
// The catalog is untouched — it belongs to the install, not to any user.
router.post('/users/:userId/teardown', requireAdmin, async (req, res) => {
  try {
    const binders = await Binder.find({ profileId: req.params.userId }).select('cover').lean()
    for (const b of binders) {
      if (b.cover?.kind === 'upload' && b.cover.url?.startsWith('/uploads/')) {
        fs.unlink(path.join(uploadsDir, path.basename(b.cover.url)), () => {})
      }
    }
    const [items] = await Promise.all([
      CollectionItem.deleteMany({ profileId: req.params.userId }),
      Binder.deleteMany({ profileId: req.params.userId }),
      Settings.deleteMany({ profileId: req.params.userId }),
    ])
    // Also drop them from any binder they were only a guest on, so a deleted
    // profile leaves no dangling grant behind.
    await Binder.updateMany({}, { $pull: { shares: { profileId: req.params.userId } } })
    res.json({ ok: true, deleted: items.deletedCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
