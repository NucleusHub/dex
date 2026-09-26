import mongoose from 'mongoose'

const catalogStateSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'catalog', unique: true, index: true },

    sourceId: { type: String, default: 'pokemontcgio' },
    apiKey: { type: String, default: '', select: false },

    status: { type: String, enum: ['idle', 'running', 'error'], default: 'idle' },
    phase: { type: String, default: '' },
    processed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    cardsWritten: { type: Number, default: 0 },
    cursorSetId: { type: String, default: '' },

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
    error: { type: String, default: '' },

    counts: {
      series: { type: Number, default: 0 },
      sets: { type: Number, default: 0 },
      cards: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
)

export default mongoose.model('DexCatalogState', catalogStateSchema)
