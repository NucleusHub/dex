import mongoose from 'mongoose'

// ── CATALOG (immutable, global) ──────────────────────────────────────────────
// One released Pokémon card. Every card exists here whether anybody owns it or
// not — that's the whole premise of Dex: users never create catalog entries,
// they only attach themselves to one (see CollectionItem).
//
// Nothing in this document is user-specific. Two users looking at the same card
// read the same row; only their CollectionItem differs.

// The card's price, normalised down to the one number the UI shows. The source
// payloads are kept verbatim in `prices` so a future view can break out
// low/mid/high or holo-vs-reverse without another sync.
const marketValueSchema = new mongoose.Schema(
  {
    amount: { type: Number, default: null },
    currency: { type: String, default: 'EUR' },
    // 'cardmarket' | 'tcgplayer' — which feed produced `amount`.
    source: { type: String, default: '' },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
)

const cardSchema = new mongoose.Schema(
  {
    // Upstream id, e.g. 'sv3pt5-25'. The id used everywhere in URLs and by the
    // collection/binder documents that point at a card.
    cardId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    // Lowercased, accent-stripped name used by search. Indexed so a name lookup
    // over the full ~20k-card catalog stays cheap.
    searchName: { type: String, default: '', index: true },

    // Denormalised set/series links, so a card row renders (and filters) without
    // joining two more collections.
    setId: { type: String, required: true, index: true },
    setName: { type: String, default: '' },
    seriesId: { type: String, required: true, index: true },
    seriesName: { type: String, default: '' },

    // The number as printed ("25", "TG12", "SV044"). Kept as a string because it
    // is not always numeric; `numberSort` is what release order sorts on.
    number: { type: String, default: '' },
    numberSort: { type: String, default: '' },

    rarity: { type: String, default: '', index: true },
    supertype: { type: String, default: '' },      // Pokémon | Trainer | Energy
    subtypes: { type: [String], default: [] },
    types: { type: [String], default: [] },        // Fire, Water, …
    artist: { type: String, default: '' },
    flavorText: { type: String, default: '' },
    nationalPokedexNumbers: { type: [Number], default: [] },
    // Print language. The primary source is English-only, so this is 'en' for
    // now; the field exists so a second source can populate it without a
    // migration ("language (where available)").
    language: { type: String, default: 'en' },

    images: {
      small: { type: String, default: null },
      large: { type: String, default: null },
    },

    marketValue: { type: marketValueSchema, default: () => ({}) },
    // Verbatim source price payloads: { cardmarket: {...}, tcgplayer: {...} }.
    prices: { type: mongoose.Schema.Types.Mixed, default: {} },
    // External links (cardmarket.url, tcgplayer.url).
    links: { type: mongoose.Schema.Types.Mixed, default: {} },

    source: { type: String, default: 'pokemontcgio' },
  },
  { timestamps: true }
)

// Release order within a set — the order the set view renders cards in.
cardSchema.index({ setId: 1, numberSort: 1 })
// Search by name inside a series/set, and the national-dex lookups.
cardSchema.index({ seriesId: 1, searchName: 1 })

export default mongoose.model('DexCard', cardSchema)
