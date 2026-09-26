import { ref } from 'vue'
import { getSeries, getStats, getCatalogState } from '@/api/dex.js'
import { seedProgress, seedTotalOwned } from '@/composables/useCollection.js'

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
