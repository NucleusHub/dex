import { reactive, watch } from 'vue'
import { getSettings, saveSettings } from '@/api/dex.js'

// Per-user Dex preferences. The server is the source of truth so they follow the
// user across devices; localStorage is a no-flash cache so the last-known values
// render instantly before the server hydrate lands. Module-level reactive
// singleton — the settings modal, the set view and the binder form all read and
// write the same live state. Mirrors Shelf's useShelfSettings.
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
    // Debounced: toggling a switch a few times is one write, not four.
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
    // Don't stomp on a change the user made while the request was in flight.
    if (touched) return
    lastSaved = JSON.stringify(server)
    Object.assign(settings, server)
  } catch {
    // Offline / unauthenticated — keep the localStorage-backed values.
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
