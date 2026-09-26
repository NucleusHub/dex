import mongoose from 'mongoose'

const settingsSchema = new mongoose.Schema(
  {
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      required: true,
      unique: true,
      index: true,
    },
    preferredPriceSource: { type: String, enum: ['cardmarket', 'tcgplayer'], default: 'cardmarket' },
    defaultBinderLayout: { type: String, enum: ['2x2', '3x3'], default: '3x3' },
    showUnowned: { type: Boolean, default: true },
    showPricesInGrid: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export default mongoose.model('DexSettings', settingsSchema)
