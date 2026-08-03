// Small, pure display helpers. No state, no imports — safe to use anywhere.

// Money in the value's OWN currency. Dex never converts between EUR (CardMarket)
// and USD (TCGplayer): showing a converted figure would imply a rate we don't
// have. `null` in, em-dash out.
export function money(amount, currency = 'EUR', locale = undefined) {
  if (amount == null || Number.isNaN(Number(amount))) return '—'
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 })
      .format(Number(amount))
  } catch {
    // Unknown currency code — fall back to a plain number rather than throwing.
    return `${Number(amount).toFixed(2)} ${currency}`
  }
}

// A card's headline value, or an em-dash when the source has no price.
export const cardValue = (card, locale) =>
  card?.marketValue?.amount != null ? money(card.marketValue.amount, card.marketValue.currency, locale) : '—'

// "2023" — a release year is all a set row needs; the full date lives in detail.
export function year(date) {
  if (!date) return ''
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? '' : String(d.getFullYear())
}

export function longDate(date, locale) {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
}

// "025 / 165" — a card's position in its set, zero-padded to match the print.
export function cardNumber(card, set) {
  const total = set?.printedTotal || 0
  if (!card?.number) return ''
  return total ? `${card.number} / ${total}` : card.number
}

// Big counts read better grouped: 2 867 rather than 2867.
export const count = (n, locale) => new Intl.NumberFormat(locale).format(Number(n) || 0)
