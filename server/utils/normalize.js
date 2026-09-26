export function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function escapeRegex(s) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function seriesSlug(name) {
  return normalizeName(name).replace(/\s+/g, '-') || 'unknown'
}

export function numberSortKey(number) {
  const raw = String(number ?? '').trim().toUpperCase()
  const m = raw.match(/^([^0-9]*)(\d*)(.*)$/)
  if (!m) return raw.padStart(8, '0')
  const [, prefix, digits, suffix] = m
  return `${prefix.padEnd(4, ' ')}${(digits || '0').padStart(6, '0')}${suffix}`
}
