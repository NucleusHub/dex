import mongoose from 'mongoose'

// ── CATALOG BOOKKEEPING (global, admin-owned) ────────────────────────────────
// A single document tracking the state of the external card-database sync, plus
// the admin's source configuration. It is the only mutable piece of the catalog
// side, and it is deliberately separate from the catalog data itself so that
// "how we fetched" never contaminates "what a card is".
//
// The sync is resumable: `cursorSetId` records the last set fully written, so a
// run interrupted by a restart or a rate-limit picks up where it stopped rather
// than re-downloading twenty thousand cards.
const catalogStateSchema = new mongoose.Schema(
  {
    // Enforces the singleton — findOneAndUpdate({ key: 'catalog' }, …, upsert).
    key: { type: String, default: 'catalog', unique: true, index: true },

    // Which registered source drives the sync (see server/sources).
    sourceId: { type: String, default: 'pokemontcgio' },
    // Optional upstream API key. `select: false` so it never rides along in a
    // routine read — the routes explicitly ask for it when calling the source.
    // Mirrors the Home app's connector-token handling.
    apiKey: { type: String, default: '', select: false },

    status: { type: String, enum: ['idle', 'running', 'error'], default: 'idle' },
    // Human-readable stage for the admin progress UI: 'sets' | 'cards' | 'series'.
    phase: { type: String, default: '' },
    // Sets processed / total sets this run — the progress bar's numerator and
    // denominator. Cards are counted cumulatively in `cardsWritten`.
    processed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    cardsWritten: { type: Number, default: 0 },
    // Resume point: the setId whose cards were last fully written.
    cursorSetId: { type: String, default: '' },

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
    error: { type: String, default: '' },

    // Catalog size after the last completed run, so the admin UI can show the
    // shape of the database without counting three collections on every poll.
    counts: {
      series: { type: Number, default: 0 },
      sets: { type: Number, default: 0 },
      cards: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
)

export default mongoose.model('DexCatalogState', catalogStateSchema)
