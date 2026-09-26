import { reactive, computed } from 'vue'
import { addToCollection, updateCollectionItem, removeFromCollection } from '@/api/dex.js'

const state = reactive({
  items: new Map(),
  primedSets: new Set(),
  seriesOwned: new Map(),
  setOwned: new Map(),
  totalOwned: 0,
})

// Reassign the Map/Set so Vue reactivity fires; in-place mutation doesn't.
const touchItems = () => { state.items = new Map(state.items) }

export function seedProgress({ series, sets }) {
  if (series) for (const s of series) state.seriesOwned.set(s.seriesId, s.progress?.owned ?? 0)
  if (sets) for (const s of sets) state.setOwned.set(s.setId, s.progress?.owned ?? 0)
  state.seriesOwned = new Map(state.seriesOwned)
  state.setOwned = new Map(state.setOwned)
}

export function seedTotalOwned(n) {
  state.totalOwned = Number(n) || 0
}

export function primeSet(setId, cards) {
  for (const c of cards) {
    if (c.owned) state.items.set(c.cardId, c.owned)
    else state.items.delete(c.cardId)
  }
  state.primedSets.add(setId)
  state.primedSets = new Set(state.primedSets)
  touchItems()
}

export function primeCards(cards) {
  for (const c of cards) if (c.owned) state.items.set(c.cardId, c.owned)
  touchItems()
}

export function primeCard(cardId, item) {
  if (!cardId) return
  if (item) state.items.set(cardId, item)
  else state.items.delete(cardId)
  touchItems()
}

function bump(seriesId, setId, delta) {
  if (seriesId) state.seriesOwned.set(seriesId, Math.max(0, (state.seriesOwned.get(seriesId) ?? 0) + delta))
  if (setId) state.setOwned.set(setId, Math.max(0, (state.setOwned.get(setId) ?? 0) + delta))
  state.totalOwned = Math.max(0, state.totalOwned + delta)
  state.seriesOwned = new Map(state.seriesOwned)
  state.setOwned = new Map(state.setOwned)
}

async function add(card, data = {}) {
  const first = !state.items.has(card.cardId)
  const previous = state.items.get(card.cardId) ?? null

  state.items.set(card.cardId, {
    cardId: card.cardId,
    quantity: (previous?.quantity ?? 0) + (data.quantity ?? 1),
    condition: data.condition ?? previous?.condition ?? 'near_mint',
    language: data.language ?? previous?.language ?? 'en',
    notes: data.notes ?? previous?.notes ?? '',
    favorite: data.favorite ?? previous?.favorite ?? false,
    purchase: data.purchase ?? previous?.purchase ?? null,
  })
  touchItems()
  if (first) bump(card.seriesId, card.setId, +1)

  try {
    const item = await addToCollection(card.cardId, data)
    state.items.set(card.cardId, item)
    touchItems()
    return item
  } catch (err) {
    if (previous) state.items.set(card.cardId, previous)
    else state.items.delete(card.cardId)
    touchItems()
    if (first) bump(card.seriesId, card.setId, -1)
    throw err
  }
}

async function update(card, patch) {
  const previous = state.items.get(card.cardId) ?? null
  if (previous) {
    state.items.set(card.cardId, { ...previous, ...patch })
    touchItems()
  }
  try {
    const item = await updateCollectionItem(card.cardId, patch)
    state.items.set(card.cardId, item)
    touchItems()
    return item
  } catch (err) {
    if (previous) state.items.set(card.cardId, previous)
    touchItems()
    throw err
  }
}

async function remove(card) {
  const previous = state.items.get(card.cardId) ?? null
  if (!previous) return
  state.items.delete(card.cardId)
  touchItems()
  bump(card.seriesId, card.setId, -1)
  try {
    await removeFromCollection(card.cardId)
  } catch (err) {
    state.items.set(card.cardId, previous)
    touchItems()
    bump(card.seriesId, card.setId, +1)
    throw err
  }
}

export function useCollection() {
  return {
    isOwned: (cardId) => state.items.has(cardId),
    itemFor: (cardId) => state.items.get(cardId) ?? null,
    ownedInSeries: (seriesId) => state.seriesOwned.get(seriesId) ?? 0,
    ownedInSet: (setId) => state.setOwned.get(setId) ?? 0,
    totalOwned: computed(() => state.totalOwned),

    seedProgress,
    seedTotalOwned,
    primeSet,
    primeCards,
    primeCard,

    add,
    update,
    remove,
  }
}

export function pctOf(owned, total) {
  const o = Number(owned) || 0
  const t = Number(total) || 0
  if (t <= 0) return 0
  let pct = Math.round((o / t) * 100)
  if (pct >= 100 && o < t) pct = 99
  if (pct === 0 && o > 0) pct = 1
  return pct
}
