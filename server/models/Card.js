import mongoose from 'mongoose'

const marketValueSchema = new mongoose.Schema(
  {
    amount: { type: Number, default: null },
    currency: { type: String, default: 'EUR' },
    source: { type: String, default: '' },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
)

const cardSchema = new mongoose.Schema(
  {
    cardId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    searchName: { type: String, default: '', index: true },

    setId: { type: String, required: true, index: true },
    setName: { type: String, default: '' },
    seriesId: { type: String, required: true, index: true },
    seriesName: { type: String, default: '' },

    number: { type: String, default: '' },
    numberSort: { type: String, default: '' },

    rarity: { type: String, default: '', index: true },
    supertype: { type: String, default: '' },
    subtypes: { type: [String], default: [] },
    types: { type: [String], default: [] },
    artist: { type: String, default: '' },
    flavorText: { type: String, default: '' },
    nationalPokedexNumbers: { type: [Number], default: [] },
    language: { type: String, default: 'en' },

    images: {
      small: { type: String, default: null },
      large: { type: String, default: null },
    },

    marketValue: { type: marketValueSchema, default: () => ({}) },
    prices: { type: mongoose.Schema.Types.Mixed, default: {} },
    links: { type: mongoose.Schema.Types.Mixed, default: {} },

    source: { type: String, default: 'pokemontcgio' },
  },
  { timestamps: true }
)

cardSchema.index({ setId: 1, numberSort: 1 })
cardSchema.index({ seriesId: 1, searchName: 1 })

export default mongoose.model('DexCard', cardSchema)
