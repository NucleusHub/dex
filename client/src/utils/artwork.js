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

export function seriesGradient(series) {
  const h = hash(series?.seriesId || series?.name || 'dex')
  const a = h % 360
  const b = (a + 40 + (h % 60)) % 360
  return `linear-gradient(135deg, oklch(0.62 0.16 ${a}) 0%, oklch(0.52 0.18 ${b}) 100%)`
}
