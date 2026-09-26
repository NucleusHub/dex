export function money(amount, currency = 'EUR', locale = undefined) {
  if (amount == null || Number.isNaN(Number(amount))) return '—'
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 })
      .format(Number(amount))
  } catch {
    return `${Number(amount).toFixed(2)} ${currency}`
  }
}

export const cardValue = (card, locale) =>
  card?.marketValue?.amount != null ? money(card.marketValue.amount, card.marketValue.currency, locale) : '—'

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

export function cardNumber(card, set) {
  const total = set?.printedTotal || 0
  if (!card?.number) return ''
  return total ? `${card.number} / ${total}` : card.number
}

export const count = (n, locale) => new Intl.NumberFormat(locale).format(Number(n) || 0)
