import mongoose from 'mongoose'

// `req.profile.profileId` arrives from the JWT as a STRING, while every
// profileId column is an ObjectId. Mongoose quietly casts on find/update, so
// query code works without thinking about it — but the aggregation pipeline does
// NOT cast, and a `$match: { profileId: '<string>' }` silently matches nothing.
//
// That failure mode is nasty precisely because it isn't an error: progress bars
// just read zero. So every aggregate in Dex goes through this.
export function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null
}
