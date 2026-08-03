<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@core/useI18n.js'
import { useSettingsModal } from '@core/useSettingsModal.js'
import BackgroundBlobs from '@core/BackgroundBlobs.vue'
import { Icon, Spinner } from '@core/icons'
import DexHeader from '@/components/DexHeader.vue'
import CardTile from '@/components/CardTile.vue'
import CardDetailModal from '@/components/CardDetailModal.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import { searchCards, getFacets } from '@/api/dex.js'
import { useCatalog } from '@/composables/useCatalog.js'
import { primeCards } from '@/composables/useCollection.js'
import { useCardOverlay } from '@/composables/useCardOverlay.js'
import { OWNED_FILTERS } from '@/utils/constants.js'
import { count } from '@/utils/format.js'

// Search across the COMPLETE catalog — name, number, series, set, rarity, type.
// Ownership is an annotation on the results (the same lit/dimmed treatment as
// the set grid) and an optional filter, never a precondition.
//
// The URL is the state: every control writes a query param, so a search is
// shareable and Back steps through refinements. The header's search box owns
// `q`; this view owns the facets.
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { series, load: loadCatalog } = useCatalog()
const { open: settingsOpen, closeSettings } = useSettingsModal()
const { cardId, showCard, openCard, closeCard, replaceCard } = useCardOverlay()

const results = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(60)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref(null)
const facets = ref({ rarities: [], types: [] })

const q = computed(() => String(route.query.q ?? ''))
const hasMore = computed(() => results.value.length < total.value)
// Arrows walk the results you've actually loaded — including pages pulled in by
// "Load more", since those are appended to the same array.
const siblingIds = computed(() => results.value.map((c) => c.cardId))

// Facet controls write straight to the URL; the watcher below re-runs the query.
function setParam(key, value) {
  const query = { ...route.query }
  if (value) query[key] = value
  else delete query[key]
  delete query.card // a facet change closes the card overlay
  router.replace({ query })
}

const seriesFilter = computed(() => String(route.query.series ?? ''))
const rarityFilter = computed(() => String(route.query.rarity ?? ''))
const typeFilter = computed(() => String(route.query.type ?? ''))
const ownedFilter = computed(() => String(route.query.owned ?? ''))

const hasFilters = computed(() =>
  !!(seriesFilter.value || rarityFilter.value || typeFilter.value || ownedFilter.value)
)

function clearFilters() {
  router.replace({ query: q.value ? { q: q.value } : {} })
}

async function run(reset = true) {
  // Nothing to search on: the server would answer empty anyway, and this avoids
  // a request on every keystroke that clears the box.
  if (!q.value && !hasFilters.value) {
    results.value = []
    total.value = 0
    return
  }
  if (reset) { page.value = 1; loading.value = true } else { loadingMore.value = true }
  error.value = null
  try {
    const res = await searchCards({
      q: q.value,
      series: seriesFilter.value,
      rarity: rarityFilter.value,
      type: typeFilter.value,
      owned: ownedFilter.value,
      page: page.value,
      pageSize: pageSize.value,
    })
    results.value = reset ? res.results : [...results.value, ...res.results]
    total.value = res.total
    // Results carry ownership, but only for the cards in them — prime, don't
    // claim their whole sets are known.
    primeCards(res.results)
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  page.value += 1
  await run(false)
}

// Re-run whenever the query or any facet changes — but NOT when only `card`
// changes, which is just the overlay opening.
watch(
  () => [route.query.q, route.query.series, route.query.rarity, route.query.type, route.query.owned],
  () => run(true),
  { immediate: true }
)

loadCatalog()
getFacets().then((f) => (facets.value = f)).catch(() => {})

const CHIP_BASE = 'rounded-lg py-1.5 text-sm font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40'
const CHIP_IDLE = 'bg-white/70 dark:bg-white/8 border-white/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
const CHIP_ACTIVE = 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-300 dark:border-indigo-400/30 text-indigo-700 dark:text-indigo-300'
</script>

<template>
  <div class="relative min-h-screen bg-slate-100 dark:bg-[#0d0d1a] text-slate-900 dark:text-white overflow-x-hidden">
    <BackgroundBlobs />
    <div class="relative z-10">
      <DexHeader>
        <template #subtitle>
          <p class="text-xs text-slate-500 dark:text-slate-400">{{ t('dex.search.title') }}</p>
        </template>
      </DexHeader>

      <main class="max-w-[110rem] mx-auto px-4 py-6 flex flex-col gap-5">
        <!-- Facets -->
        <div class="glass rounded-2xl p-2 flex flex-wrap items-center gap-1.5">
          <div class="inline-flex items-center gap-0.5 bg-black/[0.04] dark:bg-white/5 rounded-xl p-1">
            <button
              v-for="f in OWNED_FILTERS"
              :key="f.key"
              @click="setParam('owned', f.key)"
              :class="[
                'cursor-pointer whitespace-nowrap px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all',
                ownedFilter === f.key
                  ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white',
              ]"
            >
              {{ t(f.i18n) }}
            </button>
          </div>

          <div class="relative">
            <select
              :value="seriesFilter"
              @change="setParam('series', $event.target.value)"
              :class="['appearance-none cursor-pointer pl-3 pr-8 max-w-[13rem]', CHIP_BASE, seriesFilter ? CHIP_ACTIVE : CHIP_IDLE]"
            >
              <option value="">{{ t('dex.filter.allSeries') }}</option>
              <option v-for="s in series" :key="s.seriesId" :value="s.seriesId">{{ s.name }}</option>
            </select>
            <Icon name="chevronDown" :sw="2.5" class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50" />
          </div>

          <div class="relative">
            <select
              :value="rarityFilter"
              @change="setParam('rarity', $event.target.value)"
              :class="['appearance-none cursor-pointer pl-3 pr-8 max-w-[13rem]', CHIP_BASE, rarityFilter ? CHIP_ACTIVE : CHIP_IDLE]"
            >
              <option value="">{{ t('dex.filter.allRarities') }}</option>
              <option v-for="r in facets.rarities" :key="r" :value="r">{{ r }}</option>
            </select>
            <Icon name="chevronDown" :sw="2.5" class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50" />
          </div>

          <div class="relative">
            <select
              :value="typeFilter"
              @change="setParam('type', $event.target.value)"
              :class="['appearance-none cursor-pointer pl-3 pr-8 max-w-[11rem]', CHIP_BASE, typeFilter ? CHIP_ACTIVE : CHIP_IDLE]"
            >
              <option value="">{{ t('dex.filter.allTypes') }}</option>
              <option v-for="ty in facets.types" :key="ty" :value="ty">{{ ty }}</option>
            </select>
            <Icon name="chevronDown" :sw="2.5" class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50" />
          </div>

          <button
            v-if="hasFilters"
            @click="clearFilters"
            :title="t('dex.filter.clear')"
            class="nuc-press cursor-pointer inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/8 transition-colors"
          >
            <Icon name="close" :sw="2.5" class="w-4 h-4" />
          </button>

          <span v-if="total" class="ml-auto text-xs text-slate-400 tabular-nums pr-1">
            {{ t('dex.search.results', { count: count(total, locale) }) }}
          </span>
        </div>

        <!-- States -->
        <div v-if="loading" class="py-24 grid place-items-center text-slate-400">
          <Spinner class="w-7 h-7 animate-spin" />
        </div>

        <div v-else-if="error" class="py-24 text-center text-sm text-red-500">{{ t('dex.state.loadError') }}</div>

        <div v-else-if="!q && !hasFilters" class="py-24 flex flex-col items-center gap-3 text-center">
          <div class="w-14 h-14 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 grid place-items-center">
            <Icon name="search" :sw="1.75" class="w-7 h-7" />
          </div>
          <div>
            <p class="text-base font-semibold">{{ t('dex.search.promptTitle') }}</p>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">{{ t('dex.search.promptHint') }}</p>
          </div>
        </div>

        <div v-else-if="!results.length" class="py-24 text-center text-sm text-slate-400">
          {{ t('dex.search.noResults', { q }) }}
        </div>

        <template v-else>
          <div class="grid gap-2.5 sm:gap-3 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
            <CardTile v-for="c in results" :key="c.cardId" :card="c" @open="openCard" />
          </div>

          <div v-if="hasMore" class="flex justify-center pt-2">
            <button
              class="nuc-press cursor-pointer inline-flex items-center gap-2 glass rounded-xl px-5 py-2.5 text-sm font-medium hover:shadow-lg transition-shadow disabled:opacity-60"
              :disabled="loadingMore"
              @click="loadMore"
            >
              <Spinner v-if="loadingMore" class="w-4 h-4 animate-spin" />
              {{ t('dex.search.loadMore') }}
            </button>
          </div>
        </template>
      </main>

      <CardDetailModal
        :show="showCard"
        :card-id="cardId"
        :siblings="siblingIds"
        @close="closeCard"
        @navigate="replaceCard"
      />
      <SettingsModal :show="settingsOpen" @close="closeSettings" />
    </div>
  </div>
</template>
