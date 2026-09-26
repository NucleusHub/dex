import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { loadPluginRoutes } from '../pluginHost.js'
import catalog from './catalog.js'
import search from './search.js'
import collection from './collection.js'
import binders from './binders.js'
import settings from './settings.js'
import admin from './admin.js'

const router = Router()
router.use(requireAuth)

router.use(settings)
router.use(admin)
router.use(search)
router.use(collection)
router.use(binders)
// Catalog last: it owns the broad /:id routes.
router.use(catalog)

await loadPluginRoutes(router)

export default router
