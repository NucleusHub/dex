import mongoose from 'mongoose'

// ── CATALOG (immutable, global) ──────────────────────────────────────────────
// A single expansion — "151", "Obsidian Flames", "Base Set". Belongs to exactly
// one series and owns an ordered run of cards.
//
// Two totals come off the source and they differ on purpose:
//   • printedTotal — the number printed on the card ("102" in "025/102")
//   • total        — every card actually in the set, secret rares included
// Progress is measured against `total`, because a secret rare is a card you can
// own; `printedTotal` is only ever displayed as part of a card's number.
const setSchema = new mongoose.Schema(
  {
    // Upstream id, e.g. 'sv3pt5' (151) or 'base1'. Stable across syncs.
    setId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    // Denormalised series link — the slug in Series.seriesId plus the raw name,
    // so a set can be rendered without a join.
    seriesId: { type: String, required: true, index: true },
    seriesName: { type: String, default: '' },
    printedTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    releaseDate: { type: Date, default: null },
    // Pokémon TCG Online set code ("MEW"), handy for search and for matching
    // cards a user identifies by code rather than name.
    ptcgoCode: { type: String, default: '' },
    symbolUrl: { type: String, default: null },
    logoUrl: { type: String, default: null },
    // Open map from the source (standard/expanded/unlimited legality, …).
    legalities: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Which source produced this row, so a future second source can coexist.
    source: { type: String, default: 'pokemontcgio' },
  },
  { timestamps: true }
)

// Sets within a series are listed in release order (newest first).
setSchema.index({ seriesId: 1, releaseDate: -1 })

export default mongoose.model('DexSet', setSchema)
