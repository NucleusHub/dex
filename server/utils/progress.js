import CollectionItem from '../models/CollectionItem.js'
import { toObjectId } from './ids.js'

export async function ownedBySeries(profileId) {
  const pid = toObjectId(profileId)
  if (!pid) return new Map()
  const rows = await CollectionItem.aggregate([
    { $match: { profileId: pid } },
    { $group: { _id: '$seriesId', owned: { $sum: 1 } } },
  ])
  return new Map(rows.map((r) => [r._id, r.owned]))
}

export async function ownedBySet(profileId, seriesId = null) {
  const pid = toObjectId(profileId)
  if (!pid) return new Map()
  const match = seriesId ? { profileId: pid, seriesId } : { profileId: pid }
  const rows = await CollectionItem.aggregate([
    { $match: match },
    { $group: { _id: '$setId', owned: { $sum: 1 } } },
  ])
  return new Map(rows.map((r) => [r._id, r.owned]))
}

export function withProgress(row, owned, total) {
  const o = owned || 0
  const t = total || 0
  let pct = 0
  if (t > 0) {
    pct = Math.round((o / t) * 100)
    if (pct >= 100 && o < t) pct = 99
    if (pct === 0 && o > 0) pct = 1
  }
  return { ...row, progress: { owned: o, total: t, pct, complete: t > 0 && o >= t } }
}
