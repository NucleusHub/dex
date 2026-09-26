import mongoose from 'mongoose'

const seriesSchema = new mongoose.Schema(
  {
    seriesId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    artworkUrl: { type: String, default: null },
    artworkPool: { type: [String], default: [] },
    setCount: { type: Number, default: 0 },
    cardCount: { type: Number, default: 0 },
    firstRelease: { type: Date, default: null },
    lastRelease: { type: Date, default: null },
  },
  { timestamps: true }
)

seriesSchema.index({ lastRelease: -1 })

export default mongoose.model('DexSeries', seriesSchema)
