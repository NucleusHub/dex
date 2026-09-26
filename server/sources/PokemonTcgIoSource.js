const BASE = 'https://api.pokemontcg.io/v2'
const PAGE_SIZE = 250

const MAX_RETRIES = 6
const RETRY_BASE_MS = 1200
const RETRY_CAP_MS = 30_000
const PACE_MS = 250

export default class PokemonTcgIoSource {
  id = 'pokemontcgio'
  label = 'Pokémon TCG API'
  requiresKey = false

  available() { return true }

  async _get(path, { apiKey } = {}) {
    const headers = { Accept: 'application/json', 'User-Agent': 'Nucleus-Dex/0.1' }
    if (apiKey) headers['X-Api-Key'] = apiKey

    let lastErr
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt) await sleep(Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_CAP_MS))
      try {
        const res = await fetch(`${BASE}${path}`, { headers })
        // Upstream answers keyless rate limits with 500, so 5xx is retried too.
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`upstream ${res.status}`)
          continue
        }
        if (!res.ok) throw new Error(`upstream ${res.status}`)
        return await res.json()
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr || new Error('request failed')
  }

  async _getAll(path, config) {
    const out = []
    for (let page = 1; ; page++) {
      if (page > 1) await sleep(PACE_MS)
      const sep = path.includes('?') ? '&' : '?'
      const body = await this._get(`${path}${sep}page=${page}&pageSize=${PAGE_SIZE}`, config)
      const rows = Array.isArray(body?.data) ? body.data : []
      out.push(...rows)
      const total = Number(body?.totalCount)
      if (rows.length < PAGE_SIZE) break
      if (Number.isFinite(total) && out.length >= total) break
    }
    return out
  }

  async fetchSets(config = {}) {
    const rows = await this._getAll('/sets', config)
    return rows.map((s) => ({
      setId: s.id,
      name: s.name || '',
      seriesName: s.series || '',
      printedTotal: num(s.printedTotal) ?? 0,
      total: num(s.total) ?? 0,
      releaseDate: parseDate(s.releaseDate),
      ptcgoCode: s.ptcgoCode || '',
      symbolUrl: s.images?.symbol || null,
      logoUrl: s.images?.logo || null,
      legalities: s.legalities || {},
    }))
  }

  async fetchCards(setId, config = {}) {
    const q = encodeURIComponent(`set.id:${setId}`)
    const rows = await this._getAll(`/cards?q=${q}&orderBy=number`, config)
    return rows.map((c) => this._toCard(c))
  }

  _toCard(c) {
    const cardmarket = c.cardmarket || null
    const tcgplayer = c.tcgplayer || null
    return {
      cardId: c.id,
      name: c.name || '',
      number: String(c.number ?? ''),
      rarity: c.rarity || '',
      supertype: c.supertype || '',
      subtypes: Array.isArray(c.subtypes) ? c.subtypes : [],
      types: Array.isArray(c.types) ? c.types : [],
      artist: c.artist || '',
      flavorText: c.flavorText || '',
      nationalPokedexNumbers: Array.isArray(c.nationalPokedexNumbers) ? c.nationalPokedexNumbers : [],
      language: 'en',
      images: { small: c.images?.small || null, large: c.images?.large || null },
      marketValue: pickMarketValue(cardmarket, tcgplayer),
      prices: {
        ...(cardmarket?.prices ? { cardmarket: cardmarket.prices } : {}),
        ...(tcgplayer?.prices ? { tcgplayer: tcgplayer.prices } : {}),
      },
      links: {
        ...(cardmarket?.url ? { cardmarket: cardmarket.url } : {}),
        ...(tcgplayer?.url ? { tcgplayer: tcgplayer.url } : {}),
      },
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseDate(v) {
  if (!v) return null
  const d = new Date(String(v).replace(/\//g, '-'))
  return Number.isNaN(d.getTime()) ? null : d
}

function pickMarketValue(cardmarket, tcgplayer) {
  const trend = num(cardmarket?.prices?.trendPrice) ?? num(cardmarket?.prices?.averageSellPrice)
  if (trend != null) {
    return { amount: trend, currency: 'EUR', source: 'cardmarket', updatedAt: parseDate(cardmarket.updatedAt) }
  }
  const markets = Object.values(tcgplayer?.prices || {})
    .map((p) => num(p?.market) ?? num(p?.mid))
    .filter((n) => n != null)
  if (markets.length) {
    return { amount: Math.max(...markets), currency: 'USD', source: 'tcgplayer', updatedAt: parseDate(tcgplayer.updatedAt) }
  }
  return null
}
