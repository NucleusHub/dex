import { ref } from 'vue'
import { getBinders } from '@/api/dex.js'

const binders = ref([])
const policy = ref('personal')
const loaded = ref(false)
const loading = ref(false)
const error = ref(null)

async function load(force = false) {
  if (loaded.value && !force) return
  loading.value = true
  error.value = null
  try {
    const res = await getBinders()
    binders.value = res.binders ?? []
    policy.value = res.policy ?? 'personal'
    loaded.value = true
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

function upsert(binder) {
  if (!binder?.id) return
  const i = binders.value.findIndex((b) => b.id === binder.id)
  if (i === -1) binders.value.unshift(binder)
  else binders.value.splice(i, 1, binder)
}

function remove(id) {
  binders.value = binders.value.filter((b) => b.id !== id)
}

export function useBinders() {
  return {
    binders,
    policy,
    loaded,
    loading,
    error,
    load,
    reload: () => load(true),
    upsert,
    remove,
  }
}
