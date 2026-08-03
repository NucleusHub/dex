// pokemontcg.io (API v2) — the reference CardSource.
//
// Free and usable without a key (at a lower rate limit), which is why it is the
// default: a fresh Nucleus install can populate the whole catalog with no setup.
// Supplying a key in Admin → Dex only raises the ceiling.
//
// Both price feeds are carried through verbatim in `prices`, and one of them is
// promoted to the single `marketValue` the UI shows. CardMarket (EUR) is
// preferred per the source's own European pricing being the more complete feed
// for older sets; TCGplayer (USD) is the fallback.
const BASE = 'https://api.pokemontcg.io/v2'
const PAGE_SIZE = 250

// Keyless access is rate limited, and — measured against the live API — upstream
// signals throttling with a plain `500`, not a `429`. So 5xx must be treated as
// "back off and try again", and the patience has to outlast a throttle window:
// six attempts with a capped exponential backoff is a little over a minute of
// waiting before a set is given up on. That matters because a full sync makes
// hundreds of requests, and a run that dies two thirds of the way through is
// only saved by the runner's cursor.
const MAX_RETRIES = 6
const RETRY_BASE_MS = 1200
const RETRY_CAP_MS = 30_000
// Small pace between successive pages so a long sync doesn't throttle itself.
const PACE_MS = 250

export default class PokemonTcgIoSource {
  id = 'pokemontcgio'
  label = 'Pokémon TCG API'
  // Works keyless — a key raises the rate limit but is never required.
  requiresKey = false

  available() { return true }

  // ── HTTP ───────────────────────────────────────────────────────────────────

  async _get(path, { apiKey } = {}) {
    const headers = { Accept: 'application/json', 'User-Agent': 'Nucleus-Dex/0.1' }
    if (apiKey) headers['X-Api-Key'] = apiKey

    let lastErr
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt) await sleep(Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_CAP_MS))
      try {
        const res = await fetch(`${BASE}${path}`, { headers })
        // 429 AND 5xx are worth retrying — this API answers a keyless rate limit
        // with 500, so treating 5xx as fatal would abort perfectly healthy syncs.
        // A non-429 4xx is a real error (bad key, bad query); retrying it just
        // burns quota.
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

  // Walk every page of a paged endpoint and return the concatenated `data`.
  async _getAll(path, config) {
    const out = []
    for (let page = 1; ; page++) {
      if (page > 1) await sleep(PACE_MS)
      const sep = path.includes('?') ? '&' : '?'
      const body = await this._get(`${path}${sep}page=${page}&pageSize=${PAGE_SIZE}`, config)
      const rows = Array.isArray(body?.data) ? body.data : []
      out.push(...rows)
      // `totalCount` is authoritative when present; a short page also means done.
      const total = Number(body?.totalCount)
      if (rows.length < PAGE_SIZE) break
      if (Number.isFinite(total) && out.length >= total) break
    }
    return out
  }

  // ── Contract ───────────────────────────────────────────────────────────────

  async fetchSets(config = {}) {
    const rows = await this._getAll('/sets', config)
    return rows.map((s) => ({
      setId: s.id,
      name: s.name || '',
      seriesName: s.series || '',
      printedTotal: num(s.printedTotal) ?? 0,
      total: num(s.total) ?? 0,
      // Upstream format is "YYYY/MM/DD".
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
      // This feed is English-only; the field is populated so a future
      // multi-language source slots in without a migration.
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Promote one price to the headline market value. CardMarket's `trendPrice` is
// the closest thing to "what this sells for"; TCGplayer has no single figure, so
// the highest `market` across its print variants (holo, reverse, normal) is used
// — a holo's market price is the meaningful one when a card exists in both.
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
