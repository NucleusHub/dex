import mongoose from 'mongoose'

// Aggregation pipelines don't cast string ids; a string $match silently matches nothing.
export function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null
}
