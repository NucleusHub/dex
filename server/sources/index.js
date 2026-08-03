// ─────────────────────────────────────────────────────────────────────────────
// Card sources — the ONLY place that knows an external card database exists.
//
// Everything upstream-shaped stops here: the sync runner asks a source for
// normalised sets and cards and writes them to Mongo, and no route, model or
// client component ever sees an upstream payload. Swapping pokemontcg.io for
// another feed (or adding a second one for non-English printings) is adding a
// class here and registering it — nothing else changes.
//
// This mirrors Prism's `server/sources/` and Shelf's `server/providers/`: a
// documented duck-typed contract plus a registry.
//
//   interface CardSource {
//     id: string                    // stable id, e.g. 'pokemontcgio'
//     label: string                 // human name for the admin UI
//     requiresKey: boolean          // true if a key is mandatory (not just faster)
//     available(config): boolean    // usable with the given { apiKey }?
//     fetchSets(config): Promise<SetResult[]>
//     fetchCards(setId, config): Promise<CardResult[]>
//   }
//
//   type SetResult = {
//     setId, name, seriesName, printedTotal, total,
//     releaseDate: Date | null, ptcgoCode, symbolUrl, logoUrl, legalities,
//   }
//
//   type CardResult = {
//     cardId, name, number, rarity, supertype, subtypes: string[],
//     types: string[], artist, flavorText, nationalPokedexNumbers: number[],
//     language, images: { small, large },
//     marketValue: { amount, currency, source, updatedAt } | null,
//     prices: object,               // verbatim source payloads
//     links: object,                // { cardmarket, tcgplayer } urls
//   }
// ─────────────────────────────────────────────────────────────────────────────
import PokemonTcgIoSource from './PokemonTcgIoSource.js'

// Registry — first entry is the default source for a fresh install.
const REGISTRY = [new PokemonTcgIoSource()]

const byId = new Map(REGISTRY.map((s) => [s.id, s]))

export function getSourceById(id) {
  return byId.get(id) || null
}

// The default source id, used when the catalog has never been configured.
export const DEFAULT_SOURCE_ID = REGISTRY[0].id

// Serialisable descriptors for the admin UI (no methods).
export function describeSources(config = {}) {
  return REGISTRY.map((s) => ({
    id: s.id,
    label: s.label,
    requiresKey: !!s.requiresKey,
    available: s.available(config),
  }))
}
