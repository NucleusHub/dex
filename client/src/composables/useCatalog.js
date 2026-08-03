import { ref } from 'vue'
import { getSeries, getStats, getCatalogState } from '@/api/dex.js'
import { seedProgress, seedTotalOwned } from '@/composables/useCollection.js'

// The catalog side of the homepage: the series list, the headline stats, and
// whether the card database has been synced at all.
//
// Module-level singleton so navigating series → set → back doesn't refetch the
// homepage. The rows themselves are immutable catalog facts; the user's owned
// counts inside them are handed straight to useCollection, which owns them from
// then on and keeps them live through every add/remove.
const series = ref([])
const stats = ref(null)
const catalogState = ref(null)
const loaded = ref(false)
const loading = ref(false)
const error = ref(null)

async function load(force = false) {
  if (loaded.value && !force) return
  loading.value = true
  error.value = null
  try {
    const [rows, s, cs] = await Promise.all([getSeries(), getStats(), getCatalogState()])
    series.value = rows
    stats.value = s
    catalogState.value = cs
    seedProgress({ series: rows })
    seedTotalOwned(s?.owned ?? 0)
    loaded.value = true
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

// Poll the sync state while a catalog sync is running, so a user staring at an
// empty homepage sees it fill in. Stops as soon as the sync leaves 'running'.
let pollTimer = null
function watchSync(onDone) {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    try {
      const cs = await getCatalogState()
      catalogState.value = cs
      if (cs.status !== 'running') {
        stopWatchingSync()
        onDone?.()
      }
    } catch {
      stopWatchingSync()
    }
  }, 4000)
}

function stopWatchingSync() {
  clearInterval(pollTimer)
  pollTimer = null
}

export function useCatalog() {
  return {
    series,
    stats,
    catalogState,
    loaded,
    loading,
    error,
    load,
    reload: () => load(true),
    watchSync,
    stopWatchingSync,
  }
}
