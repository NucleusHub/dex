import mongoose from 'mongoose'

// ── USER DATA ────────────────────────────────────────────────────────────────
// A user's relationship with one catalog card: that they own it, how many, in
// what shape, what they paid. Strictly separate from the Card document — the
// catalog is global and immutable, this is per-profile and fully theirs.
//
// One document per (profileId, cardId). Owning three copies is `quantity: 3`,
// not three documents; per-copy provenance is deliberately out of scope for v1.
// Deleting the document is how a card leaves a collection, so "not owned" is
// simply the absence of a row — which keeps progress a plain count.

export const CONDITIONS = ['mint', 'near_mint', 'excellent', 'good', 'played', 'poor']

const purchaseSchema = new mongoose.Schema(
  {
    price: { type: Number, min: 0, default: null },
    currency: { type: String, default: 'EUR' },
    date: { type: Date, default: null },
    // Free text — a shop name, "trade with Petr", a marketplace, anything.
    source: { type: String, trim: true, default: '' },
  },
  { _id: false }
)

const collectionItemSchema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true, index: true },
    // Catalog pointer. A string id (not an ObjectId ref) because the catalog is
    // keyed by its stable upstream id — a re-sync must never orphan a collection.
    cardId: { type: String, required: true, index: true },
    // Denormalised so progress-per-set and progress-per-series are one grouped
    // query against this collection alone, with no join into the catalog.
    setId: { type: String, required: true, index: true },
    seriesId: { type: String, required: true, index: true },

    quantity: { type: Number, min: 1, default: 1 },
    condition: { type: String, enum: CONDITIONS, default: 'near_mint' },
    // Language of the physical copy the user owns, which need not match the
    // catalog card's print language.
    language: { type: String, default: 'en' },
    notes: { type: String, default: '' },
    favorite: { type: Boolean, default: false },
    // Optional — most cards are added with a single tap and never priced.
    purchase: { type: purchaseSchema, default: null },
  },
  { timestamps: true }
)

// A profile owns a given card at most once. Also the lookup index for "do I own
// this card?" checks across the set/series views.
collectionItemSchema.index({ profileId: 1, cardId: 1 }, { unique: true })
// Progress aggregation: count owned rows grouped by set (or series) for a user.
collectionItemSchema.index({ profileId: 1, seriesId: 1, setId: 1 })

export default mongoose.model('DexCollectionItem', collectionItemSchema)
