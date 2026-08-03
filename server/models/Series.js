import mongoose from 'mongoose'

// ── CATALOG (immutable, global) ──────────────────────────────────────────────
// A Pokémon TCG series — "Scarlet & Violet", "Sword & Shield", "Sun & Moon", …
//
// The upstream API has no series endpoint: series is just a string on each set.
// So this collection is DERIVED — rebuilt from the synced sets at the end of
// every catalog sync (see sync/runner.js). Nothing user-specific ever lands
// here; a user's relationship with cards lives in CollectionItem.
//
// Artwork: the homepage shows one large image per series. `artworkUrl` is an
// admin-configured override (an official booster-pack image); when it's unset
// the client picks one from `artworkPool` — the official set logos gathered from
// the series' own sets — deterministically, so the choice is stable per series
// instead of reshuffling on every render.
const seriesSchema = new mongoose.Schema(
  {
    // Stable slug derived from the upstream series name ("Scarlet & Violet" →
    // "scarlet-violet"). Used in URLs, so it must not change between syncs.
    seriesId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    // Admin override. Null → the client picks from artworkPool.
    artworkUrl: { type: String, default: null },
    // Official set logos belonging to this series, newest set first.
    artworkPool: { type: [String], default: [] },
    setCount: { type: Number, default: 0 },
    // Sum of each set's `total` (the true card count including secret rares) —
    // the denominator for series-level collection progress.
    cardCount: { type: Number, default: 0 },
    // Release window across the series' sets, for ordering the homepage.
    firstRelease: { type: Date, default: null },
    lastRelease: { type: Date, default: null },
  },
  { timestamps: true }
)

// Homepage order: newest series first, with never-dated series last.
seriesSchema.index({ lastRelease: -1 })

export default mongoose.model('DexSeries', seriesSchema)
