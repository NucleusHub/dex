import { createApiClient } from '@core/createApiClient.js'

const api = createApiClient('/api/dex')

export const getCatalogState = () => api.get('/catalog/state')
export const getSeries = () => api.get('/series')
export const getSeriesDetail = (seriesId) => api.get(`/series/${encodeURIComponent(seriesId)}`)
export const getSet = (setId) => api.get(`/sets/${encodeURIComponent(setId)}`)
export const getCard = (cardId) => api.get(`/cards/${encodeURIComponent(cardId)}`)
export const getStats = () => api.get('/stats')

export const searchCards = (params = {}) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) q.set(k, v)
  return api.get(`/search?${q}`)
}
export const getFacets = () => api.get('/facets')

export const getCollection = (params = {}) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) q.set(k, v)
  return api.get(`/collection?${q}`)
}
export const getCollectionValue = () => api.get('/collection/value')
export const addToCollection = (cardId, data = {}) => api.post('/collection', { cardId, ...data })
export const updateCollectionItem = (cardId, data) => api.patch(`/collection/${encodeURIComponent(cardId)}`, data)
export const removeFromCollection = (cardId) => api.del(`/collection/${encodeURIComponent(cardId)}`)

export const getBinders = () => api.get('/binders')
export const getBinder = (id) => api.get(`/binders/${id}`)
export const createBinder = (data) => api.post('/binders', data)
export const updateBinder = (id, data) => api.patch(`/binders/${id}`, data)
export const deleteBinder = (id) => api.del(`/binders/${id}`)
export const setBinderSlot = (id, position, cardId) => api.put(`/binders/${id}/slots/${position}`, { cardId })
export const setBinderSlots = (id, slots) => api.put(`/binders/${id}/slots`, { slots })
export const getCoverArtwork = () => api.get('/binders/covers')

export const getSettings = () => api.get('/settings')
export const saveSettings = (data) => api.put('/settings', data)

export const getAdminCatalog = () => api.get('/admin/catalog')
export const saveAdminCatalog = (data) => api.patch('/admin/catalog', data)
export const startCatalogSync = (force = false) => api.post('/admin/catalog/sync', { force })
export const setSeriesArtwork = (seriesId, artworkUrl) =>
  api.patch(`/admin/series/${encodeURIComponent(seriesId)}/artwork`, { artworkUrl })

export async function uploadCover(file) {
  const form = new FormData()
  form.append('image', file)
  const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: form })
  if (!res.ok) throw new Error('Upload failed')
  return (await res.json()).url
}
