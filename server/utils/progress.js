// Collection progress.
//
// Because every released card already exists in the catalog, progress needs no
// bookkeeping of its own: the denominator is the catalog's own card total and
// the numerator is how many CollectionItem rows the user has. One row per owned
// card (quantity lives inside the row) means "owned distinct cards" is a plain
// count, and the whole figure is two grouped queries rather than a join.
import CollectionItem from '../models/CollectionItem.js'
import { toObjectId } from './ids.js'

// Owned-card counts for one profile, grouped by series id.
export async function ownedBySeries(profileId) {
  const pid = toObjectId(profileId)
  if (!pid) return new Map()
  const rows = await CollectionItem.aggregate([
    { $match: { profileId: pid } },
    { $group: { _id: '$seriesId', owned: { $sum: 1 } } },
  ])
  return new Map(rows.map((r) => [r._id, r.owned]))
}

// Owned-card counts for one profile, grouped by set id. Scoped to a single
// series when `seriesId` is given (the series → sets view), otherwise global.
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

// Attach { owned, total, pct } to a catalog row. `pct` is rounded to a whole
// number for display but clamped at 99 until the set is genuinely complete, so
// "99%" never reads as finished when four cards are still missing.
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
