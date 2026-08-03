// Pure normalisation helpers shared by the sync runner and the search route.
// No I/O, no models — so search and sync can never disagree about what a name
// or a card number means.

// Lowercase, strip accents, collapse punctuation to single spaces. Used for the
// indexed `searchName` field AND for incoming search queries, so both sides of
// a comparison are shaped identically ("Pokémon" matches "pokemon").
export function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Escape a user-supplied string for safe use inside a RegExp. Without this a
// query like "Pikachu (" throws, and "a*" turns into an expensive scan.
export function escapeRegex(s) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Series name → stable URL slug. "Scarlet & Violet" → "scarlet-violet".
// Must stay stable across syncs: it is the series' primary key and appears in
// every /dex/series/<id> URL.
export function seriesSlug(name) {
  return normalizeName(name).replace(/\s+/g, '-') || 'unknown'
}

// Build the sort key that puts a set's cards in release order.
//
// Card numbers are not plain integers: a set runs 1…198 and then continues into
// subsets like "TG12", "GG05" or "SV044". Sorting the raw strings puts "10"
// before "2" and scatters the subsets; sorting numerically drops them entirely.
// So the key is <alpha-prefix> + <zero-padded number> + <alpha-suffix>: plain
// numeric cards get an empty prefix and sort first, and each lettered subset
// then forms its own contiguous, correctly-ordered run after them.
export function numberSortKey(number) {
  const raw = String(number ?? '').trim().toUpperCase()
  const m = raw.match(/^([^0-9]*)(\d*)(.*)$/)
  if (!m) return raw.padStart(8, '0')
  const [, prefix, digits, suffix] = m
  return `${prefix.padEnd(4, ' ')}${(digits || '0').padStart(6, '0')}${suffix}`
}
