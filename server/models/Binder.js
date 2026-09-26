import mongoose from 'mongoose'

export const LAYOUTS = ['2x2', '3x3']
export const SLOTS_PER_PAGE = { '2x2': 4, '3x3': 9 }

const coverSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['none', 'upload', 'set', 'card'], default: 'none' },
    url: { type: String, default: '' },
    refId: { type: String, default: '' },
  },
  { _id: false }
)

const slotSchema = new mongoose.Schema(
  {
    position: { type: Number, min: 0, required: true },
    cardId: { type: String, required: true },
  },
  { _id: false }
)

const binderSchema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true, index: true },
    name: { type: String, required: true, trim: true },
    cover: { type: coverSchema, default: () => ({}) },
    layout: { type: String, enum: LAYOUTS, default: '3x3' },
    pageCount: { type: Number, min: 1, default: 1 },
    slots: { type: [slotSchema], default: [] },

    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
    shares: {
      type: [
        new mongoose.Schema(
          {
            profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
            role: { type: String, enum: ['viewer', 'contributor', 'admin'], default: 'viewer' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
)

binderSchema.index({ 'shares.profileId': 1 })

export default mongoose.model('DexBinder', binderSchema)
