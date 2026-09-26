import PokemonTcgIoSource from './PokemonTcgIoSource.js'

const REGISTRY = [new PokemonTcgIoSource()]

const byId = new Map(REGISTRY.map((s) => [s.id, s]))

export function getSourceById(id) {
  return byId.get(id) || null
}

export const DEFAULT_SOURCE_ID = REGISTRY[0].id

export function describeSources(config = {}) {
  return REGISTRY.map((s) => ({
    id: s.id,
    label: s.label,
    requiresKey: !!s.requiresKey,
    available: s.available(config),
  }))
}
