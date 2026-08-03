import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { loadPluginRoutes } from '../pluginHost.js'
import catalog from './catalog.js'
import search from './search.js'
import collection from './collection.js'
import binders from './binders.js'
import settings from './settings.js'
import admin from './admin.js'

// Everything under /api/dex requires a signed-in profile. Sub-routers mount on
// the same root; their paths don't collide.
const router = Router()
router.use(requireAuth)

router.use(settings)
router.use(admin)
router.use(search)
router.use(collection)
router.use(binders)
// Catalog last: it owns the broad /series/:id, /sets/:id and /cards/:id verbs.
router.use(catalog)

// Plugin routers, mounted under /x/<pluginId> so they can never shadow a
// first-party endpoint. Awaited at import so the routes exist before listen().
await loadPluginRoutes(router)

export default router
