import mongoose from 'mongoose'

export const CONDITIONS = ['mint', 'near_mint', 'excellent', 'good', 'played', 'poor']

const purchaseSchema = new mongoose.Schema(
  {
    price: { type: Number, min: 0, default: null },
    currency: { type: String, default: 'EUR' },
    date: { type: Date, default: null },
    source: { type: String, trim: true, default: '' },
  },
  { _id: false }
)

const collectionItemSchema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true, index: true },
    cardId: { type: String, required: true, index: true },
    setId: { type: String, required: true, index: true },
    seriesId: { type: String, required: true, index: true },

    quantity: { type: Number, min: 1, default: 1 },
    condition: { type: String, enum: CONDITIONS, default: 'near_mint' },
    language: { type: String, default: 'en' },
    notes: { type: String, default: '' },
    favorite: { type: Boolean, default: false },
    purchase: { type: purchaseSchema, default: null },
  },
  { timestamps: true }
)

collectionItemSchema.index({ profileId: 1, cardId: 1 }, { unique: true })
collectionItemSchema.index({ profileId: 1, seriesId: 1, setId: 1 })

export default mongoose.model('DexCollectionItem', collectionItemSchema)
