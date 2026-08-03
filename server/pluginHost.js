// Server-side plugin surfaces for Dex.
//
// Plugins are bind-mounted read-only at /app/plugins (see docker-compose.app.yml
// — which is also why this loader lives at the server root rather than in a
// `plugins/` directory of its own: that path is the mount point). At startup we
// scan them for the two extension points Dex offers and wire up what we find.
//
// Same discovery shape as Shelf's provider loader: read each
// nucleus.plugin.json, keep the ones targeting `dex`, import the declared files.
// Never throws — a broken plugin is skipped with a warning rather than taking
// Dex down.
//
//   "extensions": {
//     // Replaces the binder permission model (see utils/binderAccess.js).
//     "dexBinderAccess": "server/binderAccess.js",
//     // Extra routers, each mounted at /api/dex/x/<pluginId>.
//     "dexRoutes": ["server/route.js"]
//   }
import { readdirSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import { setBinderAccessPolicy } from './utils/binderAccess.js'

// This file is /app/pluginHost.js; the mounted plugin tree is /app/plugins.
const PLUGINS_DIR =
  process.env.PLUGINS_DIR || join(dirname(fileURLToPath(import.meta.url)), 'plugins')

// Every installed plugin manifest that targets `dex`, as [pluginId, manifest].
function dexPlugins() {
  let entries
  try {
    entries = readdirSync(PLUGINS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory())
  } catch {
    return [] // no /plugins mount → nothing to load
  }
  const out = []
  for (const entry of entries) {
    const manifestPath = join(PLUGINS_DIR, entry.name, 'nucleus.plugin.json')
    if (!existsSync(manifestPath)) continue
    let manifest
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch { continue }
    const targets = Array.isArray(manifest.target) ? manifest.target : [manifest.target]
    if (!targets.includes('dex')) continue
    out.push([entry.name, manifest])
  }
  return out
}

async function importFrom(pluginId, rel) {
  const abs = join(PLUGINS_DIR, pluginId, rel)
  if (!existsSync(abs)) throw new Error(`${rel} not found`)
  return import(pathToFileURL(abs).href)
}

/**
 * Install the binder access policy contributed by a plugin, if any.
 * At most one plugin may own the policy — a second one is refused rather than
 * silently overriding the first, since two permission models can't both be
 * right and the loser would fail open or closed unpredictably.
 */
export async function loadBinderAccess() {
  let installedBy = null
  for (const [pluginId, manifest] of dexPlugins()) {
    const rel = manifest.extensions?.dexBinderAccess
    if (typeof rel !== 'string') continue
    if (installedBy) {
      console.warn(`[dex] plugin "${pluginId}" also declares dexBinderAccess — "${installedBy}" already owns it, skipped`)
      continue
    }
    try {
      const mod = await importFrom(pluginId, rel)
      if (setBinderAccessPolicy(mod.default)) {
        installedBy = pluginId
        console.log(`[dex] binder access policy provided by plugin "${pluginId}"`)
      }
    } catch (err) {
      console.warn(`[dex] failed to load binder access from "${pluginId}": ${err.message}`)
    }
  }
  return installedBy
}

/**
 * Mount plugin-contributed routers under /api/dex/x/<pluginId>. The `x/`
 * segment keeps the plugin namespace clearly separate from Dex's own routes, so
 * a plugin can never shadow (or be shadowed by) a first-party endpoint.
 */
export async function loadPluginRoutes(router) {
  for (const [pluginId, manifest] of dexPlugins()) {
    const specs = manifest.extensions?.dexRoutes
    if (!Array.isArray(specs)) continue
    for (const rel of specs) {
      if (typeof rel !== 'string') continue
      try {
        const mod = await importFrom(pluginId, rel)
        if (typeof mod.default !== 'function') throw new Error('no default-exported router')
        router.use(`/x/${pluginId}`, mod.default)
        console.log(`[dex] mounted routes from plugin "${pluginId}" at /api/dex/x/${pluginId}`)
      } catch (err) {
        console.warn(`[dex] failed to mount route "${rel}" from "${pluginId}": ${err.message}`)
      }
    }
  }
}
