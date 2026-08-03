import mongoose from 'mongoose'

// ── USER DATA ────────────────────────────────────────────────────────────────
// One per-user preferences document, created lazily on first save. Only holds
// preferences that must follow the user across devices; anything purely local
// (the last series they scrolled to) stays in localStorage.
const settingsSchema = new mongoose.Schema(
  {
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      required: true,
      unique: true,
      index: true,
    },
    // Currency the UI renders market values in. The catalog stores CardMarket
    // prices in EUR and TCGplayer in USD; conversion is deliberately NOT done —
    // a value is shown in its own source currency and this only picks which
    // source is preferred when a card carries both.
    preferredPriceSource: { type: String, enum: ['cardmarket', 'tcgplayer'], default: 'cardmarket' },
    // Default page layout applied to newly created binders.
    defaultBinderLayout: { type: String, enum: ['2x2', '3x3'], default: '3x3' },
    // Set view: keep un-owned cards visible (dimmed) or hide them entirely.
    showUnowned: { type: Boolean, default: true },
    // Show each card's market value on the grid tiles, not just in detail.
    showPricesInGrid: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export default mongoose.model('DexSettings', settingsSchema)
