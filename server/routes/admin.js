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

const router = Router()
const uploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')

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

router.post('/admin/catalog/sync', requireAdmin, async (req, res) => {
  try {
    if (isRunning()) return res.status(409).json({ error: 'A sync is already running' })
    const force = String(req.body?.force ?? '') === 'true' || req.body?.force === true
    runSync({ force }).catch((e) => console.error('[dex] sync crashed:', e))
    res.status(202).json({ started: true, force })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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
    await Binder.updateMany({}, { $pull: { shares: { profileId: req.params.userId } } })
    res.json({ ok: true, deleted: items.deletedCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
