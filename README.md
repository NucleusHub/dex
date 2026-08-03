# Dex

A Pokémon TCG collection tracker for Nucleus. Browse every card ever released,
track what you own, watch your progress fill in, and arrange cards into binders.

Auto-discovered via `nucleus.app.json` — drop this repo into `apps/dex/`, run
`infra/production`, and it appears in the hub at `/dex`.

- **Client** — Vite + Vue, dev port `5183`, uses the shared `@core` components
  (`BackgroundBlobs`, `AuthGuard`, `AppHeader`, `AppTabs`, `TemplateModal`, the
  `@core/icons` registry, liquid glass).
- **Server** — Express + Mongo, port `3013`, API under `/api/dex`.

The `client/core`, `client/plugins`, `client/widgets` and `client/locales`
symlinks point at the monorepo so `@core/*`, plugin globs and the bundled locale
fallback all resolve. The server reaches `core/` and `plugins/` through the
read-only container mounts declared in `docker-compose.app.yml`.

## The one idea to hold onto

**The catalog is global and immutable; a collection is personal and small.**

Every released card already exists in the database whether anybody owns it or
not. Users never create a card — they attach themselves to one. That single
decision is why:

- progress needs no bookkeeping (`owned / total` is a count against a known
  denominator, so "203 / 207 · 98%" is always true by construction),
- "not owned" is simply the absence of a row, so removing a card can't corrupt
  anything,
- a re-sync can never orphan somebody's collection — everything is keyed on the
  stable upstream card id,
- and two users looking at the same card read the exact same row.

Keep that split intact and most questions about where code belongs answer
themselves.

## Layout

```
server/
  models/
    Series.js  Set.js  Card.js      ← CATALOG: global, immutable, synced
    CatalogState.js                 ← sync bookkeeping + admin source config
    CollectionItem.js  Binder.js    ← USER DATA: per-profile, never synced
    Settings.js
  sources/                          ← the ONLY code that knows an external API exists
    index.js                        ← CardSource contract + registry
    PokemonTcgIoSource.js           ← pokemontcg.io (works keyless)
  sync/runner.js                    ← idempotent, resumable, incremental
  utils/
    normalize.js                    ← shared by sync AND search, so they agree
    progress.js                     ← the owned/total aggregation
    binderAccess.js                 ← permission policy (personal-only by default)
  routes/                           ← catalog · search · collection · binders · settings · admin
  pluginHost.js                     ← discovers plugins targeting `dex`
client/src/
  views/         HomeView (series) → SeriesView (sets) → SetView (cards)
                 SearchView · BindersView · BinderView
  composables/   useCatalog · useCollection · useBinders · useDexSettings · useCardOverlay
  components/    SeriesCard · SetCard · CardTile · CardDetailModal · BinderPage · …
```

`pluginHost.js` lives at the server root on purpose: `server/plugins/` is where
the repo's `/plugins` tree gets bind-mounted, so a directory of that name there
would be shadowed at runtime.

## The card database

Nothing ships in git. An admin populates it from **Settings → Card database**
(the gear in the header; the tab only exists for admins) or from the button on
the empty homepage.

The sync is safe to re-run on a live install:

- **idempotent** — every write is an upsert keyed on the upstream id,
- **resumable** — `CatalogState.cursorSetId` records the last set fully written,
  so a run killed by a restart or a rate limit picks up from the next one,
- **incremental** — a set whose local card count already matches upstream is
  skipped, so a routine re-sync is a few hundred requests rather than 20,000.

Cards are never deleted. Deleting one would silently strip it from every binder
that references it, and the catalog is append-mostly anyway.

A first sync takes roughly 5–10 minutes keyless. A **Pokémon TCG API key** is
optional and only raises the rate limit; paste one into the same settings tab.
It's stored `select: false` and never leaves the server.

> **Note on upstream:** keyless access is rate limited, and pokemontcg.io signals
> throttling with `500`, not `429`. The source treats 5xx and 429 alike and backs
> off exponentially, so a throttled sync pauses instead of failing — and if it
> does give up, the cursor means the next run resumes.

### Adding another source

Implement the `CardSource` duck type documented at the top of
`server/sources/index.js` and register it. Nothing else changes — no route, no
model, no component has ever seen an upstream payload. The same pattern as
Prism's `sources/` and Shelf's `providers/`.

## Prices

`marketValue` is the single headline figure the UI shows: CardMarket's
`trendPrice` (EUR) when present, otherwise the highest TCGplayer `market` across
the card's print variants (USD). Both source payloads are kept verbatim in
`prices` so a richer breakdown needs no re-sync.

**Values are never converted between currencies.** A EUR figure is shown in EUR
and a USD one in USD; inventing a rate we don't have would be worse than showing
two numbers. The user's "preferred price source" only decides which feed wins
when a card carries both.

## Binders

A binder is a book of pages, each a fixed grid of pockets (2×2 or 3×3). Slots
are a sparse list of absolute positions — an empty pocket is a missing entry —
so page N holds positions `N*perPage … N*perPage+perPage-1` and switching layout
re-flows the same list rather than needing a migration.

Deleting a binder never touches the collection: a binder is an arrangement of
cards, not a container that owns them.

The presentation is flat and modern on purpose. No leather, no rings, no page
curl — the page turn is a ~240 ms slide in the direction you moved, and that's
the whole effect.

## Plugins

Dex offers two server extension points, declared in a plugin's manifest:

```jsonc
"extensions": {
  "dexBinderAccess": "server/binderAccess.js",  // replaces the permission model
  "dexRoutes": ["server/route.js"]              // mounted at /api/dex/x/<pluginId>
}
```

and two client ones, globbed by fixed filename:

- `client/dexIndicator.vue` — a badge on card tiles and in the card view
  (props: `card`, `variant`, `binderId`)
- `client/dexBinderPanel.vue` — a panel inside a binder's settings dialog
  (prop: `binder`)

Two plugins use them:

- **`in-common`** (shared with Watchlist and Shelf) — Collection Match. Shows
  who else has a card; inside a shared binder it instead answers "is this card
  already in this binder's collection?"
- **`dex-shared-binders`** — Viewer / Contributor / Admin grants and group
  binders, following Orbit's permission model.

With no sharing plugin installed, `utils/binderAccess.js` falls back to its
personal-only policy and the binder routes are unchanged — the same
"optional plugin owns a whole capability, host degrades cleanly" shape the
localization plugin established.

## What Dex deliberately isn't

Not a marketplace, deck builder, battle simulator, trading system, wishlist,
scanner or notification engine. The first version is small on purpose.
