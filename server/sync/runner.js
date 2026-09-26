import Series from '../models/Series.js'
import Set_ from '../models/Set.js'
import Card from '../models/Card.js'
import CatalogState from '../models/CatalogState.js'
import { getSourceById, DEFAULT_SOURCE_ID } from '../sources/index.js'
import { normalizeName, numberSortKey, seriesSlug } from '../utils/normalize.js'

let inFlight = false

export function isRunning() {
  return inFlight
}

async function patchState(patch) {
  await CatalogState.findOneAndUpdate({ key: 'catalog' }, { $set: patch }, { upsert: true })
}

export async function loadConfig() {
  const doc = await CatalogState.findOneAndUpdate(
    { key: 'catalog' },
    { $setOnInsert: { sourceId: DEFAULT_SOURCE_ID } },
    { upsert: true, new: true }
  ).select('+apiKey').lean()
  return doc
}

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

    const ordered = [...sets].sort((a, b) => (a.releaseDate?.getTime() ?? 0) - (b.releaseDate?.getTime() ?? 0))

    const resumeAt = force ? '' : (config.cursorSetId || '')
    let skipping = !!resumeAt && ordered.some((s) => s.setId === resumeAt)

    const localCounts = new Map(
      (await Card.aggregate([{ $group: { _id: '$setId', n: { $sum: 1 } } }])).map((r) => [r._id, r.n])
    )

    await patchState({ phase: 'cards', total: ordered.length, processed: 0 })

    let processed = 0
    let cardsWritten = 0
    const failedSets = []
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

    await patchState({ phase: 'series' })
    await rebuildSeries()

    const [seriesCount, setCount, cardCount] = await Promise.all([
      Series.estimatedDocumentCount(),
      Set_.estimatedDocumentCount(),
      Card.estimatedDocumentCount(),
    ])

    const counts = { series: seriesCount, sets: setCount, cards: cardCount }
    const partial = failedSets.length > 0

    await patchState({
      status: partial ? 'error' : 'idle',
      phase: '',
      error: partial
        ? `${failedSets.length} of ${ordered.length} sets could not be fetched${abortedEarly ? ' (stopped early — upstream unavailable)' : ''}. Run the sync again to retry just those.`
        : '',
      finishedAt: new Date(),
      ...(partial ? {} : { lastSyncAt: new Date() }),
      cursorSetId: '',
      counts,
    })

    return { started: true, sets: ordered.length, cards: cardsWritten, failed: failedSets }
  } catch (err) {
    console.error('[dex] catalog sync failed:', err)
    await patchState({ status: 'error', error: String(err.message || err), finishedAt: new Date() })
    return { started: true, error: String(err.message || err) }
  } finally {
    inFlight = false
  }
}

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
          $setOnInsert: { artworkUrl: null },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  )
}
