import { readdirSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import { setBinderAccessPolicy } from './utils/binderAccess.js'

const PLUGINS_DIR =
  process.env.PLUGINS_DIR || join(dirname(fileURLToPath(import.meta.url)), 'plugins')

function dexPlugins() {
  let entries
  try {
    entries = readdirSync(PLUGINS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory())
  } catch {
    return []
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
