// Series artwork selection.
//
// The homepage shows one large image per series. An admin can pin a specific
// official booster-pack image (Series.artworkUrl); otherwise one is chosen from
// the official set logos gathered during sync (Series.artworkPool).
//
// The pick is randomised across the pool but DERIVED FROM THE SERIES ID, not
// from Math.random(). A genuinely random pick would reshuffle on every render
// and every navigation — the homepage would never look the same twice, which
// reads as a glitch rather than as variety. Hashing the id gives each series its
// own stable, arbitrary-looking choice that survives reloads.
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export function seriesArtwork(series) {
  if (!series) return null
  if (series.artworkUrl) return series.artworkUrl
  const pool = series.artworkPool || []
  if (!pool.length) return null
  return pool[hash(series.seriesId || series.name || '') % pool.length]
}

// A deterministic pair of hues for a series, used as the gradient behind its
// artwork (and as the whole tile when a series has no artwork at all). Same
// reasoning as above: stable per series, varied across the grid.
export function seriesGradient(series) {
  const h = hash(series?.seriesId || series?.name || 'dex')
  const a = h % 360
  const b = (a + 40 + (h % 60)) % 360
  return `linear-gradient(135deg, oklch(0.62 0.16 ${a}) 0%, oklch(0.52 0.18 ${b}) 100%)`
}
