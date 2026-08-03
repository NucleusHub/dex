// Card indicators contributed by installed plugins — small badges a plugin can
// hang on each card tile and on the card detail view. A plugin targeting `dex`
// ships `client/dexIndicator.vue` (a component taking a `card` prop); we glob
// that fixed filename (so unrelated plugin client code is never imported),
// verify the manifest target, and expose the components. The host renders the
// enabled ones — gating on isPluginEnabled(pluginId) — in CardTile.vue and
// CardDetailModal.vue.
//
// Mirrors Shelf's pluginIndicators.js. `../../plugins` is the client-dir
// `plugins` symlink → repo /plugins, wired like `core`.
import { defineAsyncComponent } from 'vue'

const manifests = import.meta.glob('../../plugins/*/nucleus.plugin.json', { eager: true, import: 'default' })

const dirOf = (file) => file.match(/\/plugins\/([^/]+)\//)?.[1]

function build(modules, target = 'dex') {
  const manifestByDir = {}
  for (const [file, m] of Object.entries(manifests)) manifestByDir[dirOf(file)] = m

  const out = []
  for (const [file, loader] of Object.entries(modules)) {
    const dir = dirOf(file)
    const manifest = manifestByDir[dir]
    const targets = Array.isArray(manifest?.target) ? manifest.target : [manifest?.target]
    if (!targets.includes(target)) continue
    out.push({ pluginId: manifest?.id || dir, component: defineAsyncComponent(loader) })
  }
  return out
}

// "Someone else has this card too" badges (the in-common plugin).
export const cardIndicators = build(import.meta.glob('../../plugins/*/client/dexIndicator.vue'))

// Binder panels — a plugin owning binder sharing mounts its UI here, rendered
// inside the binder's own settings modal. Resolved at load; the plugin set is
// fixed for a given bundle.
export const binderPanels = build(import.meta.glob('../../plugins/*/client/dexBinderPanel.vue'))
