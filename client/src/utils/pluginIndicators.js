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

export const cardIndicators = build(import.meta.glob('../../plugins/*/client/dexIndicator.vue'))

export const binderPanels = build(import.meta.glob('../../plugins/*/client/dexBinderPanel.vue'))
