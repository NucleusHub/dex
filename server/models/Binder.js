import mongoose from 'mongoose'

// ── USER DATA ────────────────────────────────────────────────────────────────
// A binder stands in for a physical one: a named book of pages, each page a
// fixed grid of pockets the user slots cards into by hand. Unlike the set view
// (which is generated from the catalog) a binder's order is entirely the user's.
//
// Slots are stored as a sparse list of absolute positions rather than a dense
// 2-D array: an empty pocket is simply a missing position. Page N of a 3×3
// binder holds positions N*9 … N*9+8, so paging is arithmetic, never a
// migration — switching a binder from 2×2 to 3×3 re-flows the same list.

export const LAYOUTS = ['2x2', '3x3']
export const SLOTS_PER_PAGE = { '2x2': 4, '3x3': 9 }

// Where a binder's cover image comes from. `upload` is the user's own file;
// `set` and `card` point at official artwork already in the catalog (a set's
// logo, or a card's own art), which is how "choose from bundled official
// artwork" is satisfied without shipping copyrighted images in the repo.
const coverSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['none', 'upload', 'set', 'card'], default: 'none' },
    // kind 'upload' → the /uploads/<file> path returned by the upload endpoint.
    url: { type: String, default: '' },
    // kind 'set' → a DexSet.setId; kind 'card' → a DexCard.cardId.
    refId: { type: String, default: '' },
  },
  { _id: false }
)

const slotSchema = new mongoose.Schema(
  {
    // Absolute pocket index across the whole binder, 0-based.
    position: { type: Number, min: 0, required: true },
    cardId: { type: String, required: true },
  },
  { _id: false }
)

const binderSchema = new mongoose.Schema(
  {
    // The creator. Remains the owner even after the binder is shared.
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true, index: true },
    name: { type: String, required: true, trim: true },
    cover: { type: coverSchema, default: () => ({}) },
    layout: { type: String, enum: LAYOUTS, default: '3x3' },
    // How many pages the book has. Kept explicit (rather than derived from the
    // highest filled slot) so a user can flip to a blank page and fill it.
    pageCount: { type: Number, min: 1, default: 1 },
    slots: { type: [slotSchema], default: [] },

    // ── Owned by the shared-binders plugin ──────────────────────────────────
    // Inert here: with the plugin absent or disabled, the base app treats every
    // binder as personal and never reads these (see utils/binderAccess.js).
    // Mirrors how Orbit/Prism carry `groupId` for their group shares.
    //
    // `groupId` marks a group binder — the Dex equivalent of Orbit's immutable
    // "Group - {name}" directory, created for a group with `sharedDex` set.
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
    // Per-profile grants: [{ profileId, role: viewer|contributor|admin }].
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

// "Binders shared with me" — the plugin's list query.
binderSchema.index({ 'shares.profileId': 1 })

export default mongoose.model('DexBinder', binderSchema)
