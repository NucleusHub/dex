import { reactive, watch } from 'vue'
import { getSettings, saveSettings } from '@/api/dex.js'

const KEY = 'dex-settings'

const DEFAULT = () => ({
  preferredPriceSource: 'cardmarket',
  defaultBinderLayout: '3x3',
  showUnowned: true,
  showPricesInGrid: false,
})

const withDefaults = (raw) => ({ ...DEFAULT(), ...(raw && typeof raw === 'object' ? raw : {}) })

function loadLocal() {
  try {
    return withDefaults(JSON.parse(localStorage.getItem(KEY)))
  } catch {
    return DEFAULT()
  }
}

const settings = reactive(loadLocal())

let lastSaved = null
let saveTimer = null
let touched = false

watch(
  settings,
  (v) => {
    const json = JSON.stringify(v)
    localStorage.setItem(KEY, json)
    if (json === lastSaved) return
    lastSaved = json
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveSettings({ ...v }).catch(() => {}), 400)
  },
  { deep: true }
)

let hydrated = false
async function hydrate() {
  if (hydrated) return
  hydrated = true
  try {
    const server = withDefaults(await getSettings())
    if (touched) return
    lastSaved = JSON.stringify(server)
    Object.assign(settings, server)
  } catch {
  }
}

export function useDexSettings() {
  hydrate()
  return {
    settings,
    update(partial) {
      touched = true
      Object.assign(settings, partial)
    },
  }
}
