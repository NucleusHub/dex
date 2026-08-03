import { reactive, computed } from 'vue'
import { addToCollection, updateCollectionItem, removeFromCollection } from '@/api/dex.js'

// ─────────────────────────────────────────────────────────────────────────────
// The user's ownership, as one live module-level store.
//
// The split that runs through the whole app shows up here too: TOTALS are
// immutable catalog facts and arrive with each catalog response, while OWNED
// counts are user facts and live here. A view therefore never recomputes a
// progress bar by refetching — it reads its total from the catalog row it
// already has and its numerator from this store, which every mutation keeps
// current. Adding a card in the set view moves the set bar, the series bar and
// the homepage bar in the same tick, with no round trip.
//
// Only the slice the user has actually browsed is loaded. Ownership for a set
// arrives when the set view fetches it (`primeSet`); nothing tries to hold
// twenty thousand rows in memory.
// ─────────────────────────────────────────────────────────────────────────────

const state = reactive({
  // cardId → collection item (the user's row for that card)
  items: new Map(),
  // Sets whose ownership has been fully loaded, so `isOwned` is authoritative
  // for every card in them (rather than "not loaded yet").
  primedSets: new Set(),
  // seriesId → owned count, setId → owned count. Seeded from the catalog's own
  // progress payloads and then adjusted locally on every mutation.
  seriesOwned: new Map(),
  setOwned: new Map(),
  // Global owned-card count, for the homepage headline.
  totalOwned: 0,
})

// Reassigning the Map/Set is what makes Vue's reactivity fire — mutating one in
// place doesn't. Cheap at these sizes and keeps every read a plain lookup.
const touchItems = () => { state.items = new Map(state.items) }

// ── Seeding from catalog responses ───────────────────────────────────────────

// Record the owned counts a catalog response reported, so bars are correct
// before (and without) loading the individual cards.
export function seedProgress({ series, sets }) {
  if (series) for (const s of series) state.seriesOwned.set(s.seriesId, s.progress?.owned ?? 0)
  if (sets) for (const s of sets) state.setOwned.set(s.setId, s.progress?.owned ?? 0)
  state.seriesOwned = new Map(state.seriesOwned)
  state.setOwned = new Map(state.setOwned)
}

export function seedTotalOwned(n) {
  state.totalOwned = Number(n) || 0
}

// Load a set's ownership from a /sets/:id response. After this, a card in the
// set that isn't in `items` is genuinely not owned.
export function primeSet(setId, cards) {
  for (const c of cards) {
    if (c.owned) state.items.set(c.cardId, c.owned)
    else state.items.delete(c.cardId)
  }
  state.primedSets.add(setId)
  state.primedSets = new Set(state.primedSets)
  touchItems()
}

// Record ownership for an arbitrary list of cards (search results, binder pages)
// WITHOUT claiming the set is fully known — a missing card here means "not in
// this response", not "not owned".
export function primeCards(cards) {
  for (const c of cards) if (c.owned) state.items.set(c.cardId, c.owned)
  touchItems()
}

// Authoritative ownership for ONE card, from a response that definitively knows
// (i.e. /cards/:id). Unlike primeCards this also CLEARS the entry when the
// server says the card isn't owned, so a stale positive can't survive.
//
// The card detail view must call this. It renders `owned` from this store, and
// on a fresh page load — a deep link, or a reload with `?card=` in the URL —
// the store has never heard of the card. Without priming, a card you already
// own renders "Add to collection", and pressing it just increments the quantity
// on the row that was there all along. That reads exactly like "adding doesn't
// save", which is how this was found.
export function primeCard(cardId, item) {
  if (!cardId) return
  if (item) state.items.set(cardId, item)
  else state.items.delete(cardId)
  touchItems()
}

// ── Local counter bookkeeping ────────────────────────────────────────────────

function bump(seriesId, setId, delta) {
  if (seriesId) state.seriesOwned.set(seriesId, Math.max(0, (state.seriesOwned.get(seriesId) ?? 0) + delta))
  if (setId) state.setOwned.set(setId, Math.max(0, (state.setOwned.get(setId) ?? 0) + delta))
  state.totalOwned = Math.max(0, state.totalOwned + delta)
  state.seriesOwned = new Map(state.seriesOwned)
  state.setOwned = new Map(state.setOwned)
}

// ── Mutations ────────────────────────────────────────────────────────────────
// Each one updates the store immediately and rolls back if the server refuses,
// so the grid responds on tap and still can't drift out of sync.

async function add(card, data = {}) {
  const first = !state.items.has(card.cardId)
  const previous = state.items.get(card.cardId) ?? null

  // Optimistic: show it owned right away.
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
    // Reads
    isOwned: (cardId) => state.items.has(cardId),
    itemFor: (cardId) => state.items.get(cardId) ?? null,
    ownedInSeries: (seriesId) => state.seriesOwned.get(seriesId) ?? 0,
    ownedInSet: (setId) => state.setOwned.get(setId) ?? 0,
    totalOwned: computed(() => state.totalOwned),

    // Seeding
    seedProgress,
    seedTotalOwned,
    primeSet,
    primeCards,
    primeCard,

    // Writes
    add,
    update,
    remove,
  }
}

// Progress helper shared by every bar in the app, so the rounding rule ("never
// show 100% until it really is complete") is stated once. Mirrors the server's
// withProgress so a bar reads the same whether it came from an API payload or
// was computed locally after a mutation.
export function pctOf(owned, total) {
  const o = Number(owned) || 0
  const t = Number(total) || 0
  if (t <= 0) return 0
  let pct = Math.round((o / t) * 100)
  if (pct >= 100 && o < t) pct = 99
  if (pct === 0 && o > 0) pct = 1
  return pct
}
