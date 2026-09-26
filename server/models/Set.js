import mongoose from 'mongoose'

const setSchema = new mongoose.Schema(
  {
    setId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    seriesId: { type: String, required: true, index: true },
    seriesName: { type: String, default: '' },
    printedTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    releaseDate: { type: Date, default: null },
    ptcgoCode: { type: String, default: '' },
    symbolUrl: { type: String, default: null },
    logoUrl: { type: String, default: null },
    legalities: { type: mongoose.Schema.Types.Mixed, default: {} },
    source: { type: String, default: 'pokemontcgio' },
  },
  { timestamps: true }
)

setSchema.index({ seriesId: 1, releaseDate: -1 })

export default mongoose.model('DexSet', setSchema)
