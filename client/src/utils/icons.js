// Dex-local glyphs — the handful this app needs that aren't in the shared core
// registry yet (@core/icons). Everything else comes from there; only add here
// when a glyph is genuinely Dex-specific, and promote it to core if a second app
// ever wants it.
//
// Every entry here is a plain path `d` string — deliberately, not the richer
// "array of d, or raw inner-SVG markup" that core/icons/icons.js also accepts.
//
// The reason: these glyphs are consumed in two places with different contracts.
// <DexIcon> can render any of the three forms, but core's <AppTabs> (and the
// `icon` prop on core's tab/menu components) bind the value straight into
// `<path :d="...">`. Handing those raw `<path .../>` markup produces
// `d="<path d=…"` and an SVG parse error, so multi-stroke glyphs use several
// SUBPATHS inside one `d` rather than several <path> elements.
export const DEX_ICONS = {
  // Layout toggles for the set grid.
  viewGrid: 'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6zM13.5 6A2.25 2.25 0 0 1 15.75 3.75H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25zM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25z',
  viewList: 'M3.75 5.25h16.5m-16.5 6h16.5m-16.5 6h16.5',

  // A binder: the app's own object, drawn as a card book rather than a ring
  // binder — no skeuomorphism. Body + spine as two subpaths of one `d`.
  binder: 'M7.5 4.75h9.25a1.75 1.75 0 0 1 1.75 1.75v11a1.75 1.75 0 0 1-1.75 1.75H7.5a1.75 1.75 0 0 1-1.75-1.75v-11A1.75 1.75 0 0 1 7.5 4.75ZM9.5 4.75v14.5',

  // A single card, used for the "card" cover kind and empty binder pockets.
  card: 'M8.25 3.75h7.5a1.75 1.75 0 0 1 1.75 1.75v13a1.75 1.75 0 0 1-1.75 1.75h-7.5a1.75 1.75 0 0 1-1.75-1.75v-13A1.75 1.75 0 0 1 8.25 3.75ZM9.75 7.5h4.5',

  // Series overview / stacked expansions.
  stack: 'M12 3.5 3.5 7.75 12 12l8.5-4.25L12 3.5ZM3.5 12 12 16.25 20.5 12M3.5 16.25 12 20.5l8.5-4.25',

  // Sync / download the catalog.
  cloudDownload: 'M12 9.75v6.75m0 0 2.75-2.75M12 16.5l-2.75-2.75M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z',
}
