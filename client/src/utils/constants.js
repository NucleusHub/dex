export const CONDITIONS = ['mint', 'near_mint', 'excellent', 'good', 'played', 'poor']

export const CONDITION_META = {
  mint:      { i18n: 'dex.condition.mint',      short: 'M' },
  near_mint: { i18n: 'dex.condition.near_mint', short: 'NM' },
  excellent: { i18n: 'dex.condition.excellent', short: 'EX' },
  good:      { i18n: 'dex.condition.good',      short: 'GD' },
  played:    { i18n: 'dex.condition.played',    short: 'PL' },
  poor:      { i18n: 'dex.condition.poor',      short: 'PO' },
}

export const BINDER_LAYOUTS = [
  { key: '2x2', cols: 2, rows: 2, perPage: 4, i18n: 'dex.binder.layout.2x2' },
  { key: '3x3', cols: 3, rows: 3, perPage: 9, i18n: 'dex.binder.layout.3x3' },
]

export const layoutMeta = (key) => BINDER_LAYOUTS.find((l) => l.key === key) || BINDER_LAYOUTS[1]

export const OWNED_FILTERS = [
  { key: '', i18n: 'dex.filter.all' },
  { key: 'yes', i18n: 'dex.filter.owned' },
  { key: 'no', i18n: 'dex.filter.missing' },
]

export const TYPE_TINT = {
  Fire: 'text-orange-600 dark:text-orange-400',
  Water: 'text-sky-600 dark:text-sky-400',
  Grass: 'text-emerald-600 dark:text-emerald-400',
  Lightning: 'text-amber-600 dark:text-amber-400',
  Psychic: 'text-fuchsia-600 dark:text-fuchsia-400',
  Fighting: 'text-red-700 dark:text-red-400',
  Darkness: 'text-slate-700 dark:text-slate-300',
  Metal: 'text-zinc-600 dark:text-zinc-300',
  Fairy: 'text-pink-600 dark:text-pink-400',
  Dragon: 'text-yellow-700 dark:text-yellow-500',
  Colorless: 'text-slate-500 dark:text-slate-400',
}
