// Catalog sync — pulls the complete card database from the configured source
// into Mongo. Isolated from everything else on purpose: routes trigger it and
// poll its state, but no route, model or component knows how it works.
//
// Shape of a run:
//   1. sets    — fetch every set, upsert, and note which ones are new/changed
//   2. cards   — for each set that needs it, fetch and bulk-upsert its cards
//   3. series  — rebuild the derived series aggregate from the synced sets
//
// Three properties make this safe to run against a live install:
//   • Idempotent — everything is an upsert keyed on the stable upstream id, so
//     re-running never duplicates and never orphans a user's CollectionItem.
//   • Resumable — `cursorSetId` records the last set fully written; a run
//     interrupted by a restart resumes from the next one.
//   • Incremental — a set whose card count already matches upstream is skipped,
//     so the routine re-sync costs a few hundred requests, not twenty thousand.
//   Cards are never deleted: the catalog is append-mostly, and deleting one
//   would silently strip it from every binder that references it.
import Series from '../models/Series.js'
import Set_ from '../models/Set.js'
import Card from '../models/Card.js'
import CatalogState from '../models/CatalogState.js'
import { getSourceById, DEFAULT_SOURCE_ID } from '../sources/index.js'
import { normalizeName, numberSortKey, seriesSlug } from '../utils/normalize.js'

// Guards against two syncs racing inside one process. The `status: 'running'`
// flag in Mongo guards the multi-process case.
let inFlight = false

export function isRunning() {
  return inFlight
}

async function patchState(patch) {
  await CatalogState.findOneAndUpdate({ key: 'catalog' }, { $set: patch }, { upsert: true })
}

// Read the state doc including the normally-hidden apiKey.
export async function loadConfig() {
  const doc = await CatalogState.findOneAndUpdate(
    { key: 'catalog' },
    { $setOnInsert: { sourceId: DEFAULT_SOURCE_ID } },
    { upsert: true, new: true }
  ).select('+apiKey').lean()
  return doc
}

/**
 * Run a full catalog sync. Returns immediately if one is already in flight.
 *
 * @param {object}  opts
 * @param {boolean} opts.force  re-fetch every set's cards even when the local
 *                              count already matches upstream (used after a
 *                              schema change or a suspected partial run).
 */
export async function runSync({ force = false } = {}) {
  if (inFlight) return { started: false, reason: 'already-running' }
  inFlight = true

  try {
    const config = await loadConfig()
    const source = getSourceById(config.sourceId) || getSourceById(DEFAULT_SOURCE_ID)
    if (!source) throw new Error(`unknown card source "${config.sourceId}"`)
    if (!source.available(config)) throw new Error(`source "${source.id}" is not configured`)

    await patchState({
      status: 'running', phase: 'sets', error: '',
      processed: 0, total: 0, cardsWritten: 0,
      startedAt: new Date(), finishedAt: null,
    })

    // ── 1. Sets ──────────────────────────────────────────────────────────────
    const sets = await source.fetchSets(config)
    if (!sets.length) throw new Error('source returned no sets')

    await Set_.bulkWrite(
      sets.map((s) => ({
        updateOne: {
          filter: { setId: s.setId },
          update: {
            $set: {
              name: s.name,
              seriesId: seriesSlug(s.seriesName),
              seriesName: s.seriesName,
              printedTotal: s.printedTotal,
              total: s.total,
              releaseDate: s.releaseDate,
              ptcgoCode: s.ptcgoCode,
              symbolUrl: s.symbolUrl,
              logoUrl: s.logoUrl,
              legalities: s.legalities,
              source: source.id,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    )

    // ── 2. Cards, set by set ─────────────────────────────────────────────────
    // Oldest first so an interrupted first run leaves a coherent prefix of
    // history rather than a scattering of modern sets.
    const ordered = [...sets].sort((a, b) => (a.releaseDate?.getTime() ?? 0) - (b.releaseDate?.getTime() ?? 0))

    // Resume: skip everything up to and including the last completed set.
    const resumeAt = force ? '' : (config.cursorSetId || '')
    let skipping = !!resumeAt && ordered.some((s) => s.setId === resumeAt)

    // One grouped count instead of a per-set count query.
    const localCounts = new Map(
      (await Card.aggregate([{ $group: { _id: '$setId', n: { $sum: 1 } } }])).map((r) => [r._id, r.n])
    )

    await patchState({ phase: 'cards', total: ordered.length, processed: 0 })

    let processed = 0
    let cardsWritten = 0
    // Sets upstream refused this run. Collected rather than thrown: one flaky
    // expansion must not discard the other 173. They're simply left un-synced,
    // and the incremental check above picks them up on the next run.
    const failedSets = []
    // …unless upstream is actually down, in which case grinding through every
    // remaining set just to fail each one wastes minutes and hammers a service
    // that's already struggling. A run of consecutive failures ends the sync.
    let consecutiveFailures = 0
    const MAX_CONSECUTIVE_FAILURES = 8
    let abortedEarly = false

    for (const set of ordered) {
      processed++

      if (skipping) {
        if (set.setId === resumeAt) skipping = false
        await patchState({ processed })
        continue
      }

      // Incremental skip: upstream's `total` is the true card count for the set,
      // so an equal local count means nothing new was printed into it.
      const have = localCounts.get(set.setId) ?? 0
      if (!force && set.total > 0 && have >= set.total) {
        await patchState({ processed, cursorSetId: set.setId })
        continue
      }

      let cards
      try {
        cards = await source.fetchCards(set.setId, config)
      } catch (err) {
        failedSets.push(set.setId)
        consecutiveFailures++
        console.warn(`[dex] set "${set.setId}" failed (${err.message}) — skipping, will retry next run`)
        await patchState({ processed, cardsWritten })
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`[dex] ${MAX_CONSECUTIVE_FAILURES} sets failed in a row — stopping; upstream looks unavailable`)
          abortedEarly = true
          break
        }
        continue
      }
      consecutiveFailures = 0

      if (cards.length) {
        const seriesId = seriesSlug(set.seriesName)
        await Card.bulkWrite(
          cards.map((c) => ({
            updateOne: {
              filter: { cardId: c.cardId },
              update: {
                $set: {
                  name: c.name,
                  searchName: normalizeName(c.name),
                  setId: set.setId,
                  setName: set.name,
                  seriesId,
                  seriesName: set.seriesName,
                  number: c.number,
                  numberSort: numberSortKey(c.number),
                  rarity: c.rarity,
                  supertype: c.supertype,
                  subtypes: c.subtypes,
                  types: c.types,
                  artist: c.artist,
                  flavorText: c.flavorText,
                  nationalPokedexNumbers: c.nationalPokedexNumbers,
                  language: c.language,
                  images: c.images,
                  // A null marketValue means "no price known"; storing the empty
                  // object keeps the field present so the client needn't guard.
                  marketValue: c.marketValue || {},
                  prices: c.prices,
                  links: c.links,
                  source: source.id,
                },
              },
              upsert: true,
            },
          })),
          { ordered: false }
        )
        cardsWritten += cards.length
      }

      await patchState({ processed, cardsWritten, cursorSetId: set.setId })
    }

    // ── 3. Derived series aggregate ──────────────────────────────────────────
    // Always rebuilt, even after a partial run: the sets that DID land should
    // show up on the homepage rather than the user staring at "catalog empty"
    // while a hundred expansions sit in the database.
    await patchState({ phase: 'series' })
    await rebuildSeries()

    const [seriesCount, setCount, cardCount] = await Promise.all([
      Series.estimatedDocumentCount(),
      Set_.estimatedDocumentCount(),
      Card.estimatedDocumentCount(),
    ])

    // Counts are written on every outcome, so `/catalog/state` reports what is
    // actually in the database rather than only what a flawless run produced.
    const counts = { series: seriesCount, sets: setCount, cards: cardCount }
    const partial = failedSets.length > 0

    await patchState({
      status: partial ? 'error' : 'idle',
      phase: '',
      error: partial
        ? `${failedSets.length} of ${ordered.length} sets could not be fetched${abortedEarly ? ' (stopped early — upstream unavailable)' : ''}. Run the sync again to retry just those.`
        : '',
      finishedAt: new Date(),
      // Only a completed pass counts as a sync; a partial one shouldn't read as
      // "last synced" on the admin screen.
      ...(partial ? {} : { lastSyncAt: new Date() }),
      // Cleared either way: the loop ran to a decision for every set, and the
      // incremental count check is what resumes the missing ones next time.
      // The cursor exists for a hard process death mid-run, not for this.
      cursorSetId: '',
      counts,
    })

    return { started: true, sets: ordered.length, cards: cardsWritten, failed: failedSets }
  } catch (err) {
    // Only a failure OUTSIDE the per-set loop reaches here (fetching the set
    // list, a Mongo error) — an individual set failing is handled above.
    console.error('[dex] catalog sync failed:', err)
    // The cursor is deliberately left in place so the next run resumes.
    await patchState({ status: 'error', error: String(err.message || err), finishedAt: new Date() })
    return { started: true, error: String(err.message || err) }
  } finally {
    inFlight = false
  }
}

/**
 * Rebuild the derived Series collection from the synced sets.
 *
 * Series are not fetched — the upstream feed only names them on each set — so
 * they are folded up here: one row per distinct series with its set count, its
 * true card total, its release window, and the pool of official set logos the
 * homepage picks its artwork from. An admin's `artworkUrl` override is
 * preserved, because it is the one field on a catalog row a human owns.
 */
export async function rebuildSeries() {
  const grouped = await Set_.aggregate([
    { $sort: { releaseDate: -1 } },
    {
      $group: {
        _id: '$seriesId',
        name: { $first: '$seriesName' },
        setCount: { $sum: 1 },
        cardCount: { $sum: '$total' },
        firstRelease: { $min: '$releaseDate' },
        lastRelease: { $max: '$releaseDate' },
        // Newest set first, so the default artwork is the series' latest look.
        logos: { $push: '$logoUrl' },
      },
    },
  ])

  if (!grouped.length) return

  await Series.bulkWrite(
    grouped.map((g) => ({
      updateOne: {
        filter: { seriesId: g._id },
        update: {
          $set: {
            name: g.name || g._id,
            artworkPool: g.logos.filter(Boolean),
            setCount: g.setCount,
            cardCount: g.cardCount,
            firstRelease: g.firstRelease,
            lastRelease: g.lastRelease,
          },
          // Never clobber an admin's chosen booster-pack image on re-sync.
          $setOnInsert: { artworkUrl: null },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  )
}
