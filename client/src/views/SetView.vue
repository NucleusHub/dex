<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '@core/useI18n.js'
import { useSettingsModal } from '@core/useSettingsModal.js'
import BackgroundBlobs from '@core/BackgroundBlobs.vue'
import { Icon, Spinner } from '@core/icons'
import DexHeader from '@/components/DexHeader.vue'
import CardTile from '@/components/CardTile.vue'
import CardDetailModal from '@/components/CardDetailModal.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import ProgressLabel from '@/components/ProgressLabel.vue'
import DexIcon from '@/components/DexIcon.vue'
import { getSet } from '@/api/dex.js'
import { useCollection, primeSet, seedProgress } from '@/composables/useCollection.js'
import { useCardOverlay } from '@/composables/useCardOverlay.js'
import { useDexSettings } from '@/composables/useDexSettings.js'
import { OWNED_FILTERS } from '@/utils/constants.js'
import { year } from '@/utils/format.js'

const route = useRoute()
const { t } = useI18n()
const { ownedInSet, isOwned } = useCollection()
const { settings } = useDexSettings()
const { open: settingsOpen, closeSettings } = useSettingsModal()
const { cardId, showCard, openCard, closeCard, replaceCard } = useCardOverlay()

const set = ref(null)
const seriesRow = ref(null)
const cards = ref([])
const loading = ref(false)
const error = ref(null)
const logoFailed = ref(false)

const owned = computed(() => (set.value ? ownedInSet(set.value.setId) : 0))

const ownedFilter = ref(settings.showUnowned ? '' : 'yes')
const rarityFilter = ref('')
const query = ref('')
const dense = ref(localStorage.getItem('dex-set-dense') === '1')
watch(dense, (v) => localStorage.setItem('dex-set-dense', v ? '1' : '0'))

const rarities = computed(() =>
  [...new Set(cards.value.map((c) => c.rarity).filter(Boolean))].sort((a, b) => a.localeCompare(b))
)

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return cards.value.filter((c) => {
    if (rarityFilter.value && c.rarity !== rarityFilter.value) return false
    if (ownedFilter.value === 'yes' && !isOwned(c.cardId)) return false
    if (ownedFilter.value === 'no' && isOwned(c.cardId)) return false
    if (q && !`${c.name} ${c.number}`.toLowerCase().includes(q)) return false
    return true
  })
})

const hasFilters = computed(() => !!(ownedFilter.value || rarityFilter.value || query.value))
function clearFilters() {
  ownedFilter.value = ''
  rarityFilter.value = ''
  query.value = ''
}

const siblingIds = computed(() => visible.value.map((c) => c.cardId))

const gridClass = computed(() =>
  dense.value
    ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12'
    : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8'
)

async function load(setId) {
  if (!setId) return
  loading.value = true
  error.value = null
  logoFailed.value = false
  try {
    const data = await getSet(setId)
    set.value = data.set
    seriesRow.value = data.series
    cards.value = data.cards
    primeSet(data.set.setId, data.cards)
    seedProgress({ sets: [data.set], series: data.series ? [data.series] : undefined })
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

watch(() => route.params.setId, (id) => load(String(id)), { immediate: true })

const CHIP_BASE = 'rounded-lg py-1.5 text-sm font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40'
const CHIP_IDLE = 'bg-white/70 dark:bg-white/8 border-white/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/12'
const CHIP_ACTIVE = 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-300 dark:border-indigo-400/30 text-indigo-700 dark:text-indigo-300'
</script>

<template>
  <div class="relative min-h-screen bg-slate-100 dark:bg-[#0d0d1a] text-slate-900 dark:text-white overflow-x-hidden">
    <BackgroundBlobs />
    <div class="relative z-10">
      <DexHeader>
        <template #subtitle>
          <RouterLink
            v-if="set"
            :to="`/series/${set.seriesId}`"
            class="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors truncate"
          >
            <Icon name="chevronLeft" :sw="2.5" class="w-3.5 h-3.5 shrink-0" />
            <span class="truncate">{{ set.seriesName }}</span>
          </RouterLink>
        </template>
      </DexHeader>

      <main class="max-w-[110rem] mx-auto px-4 py-6 flex flex-col gap-5">
        <div v-if="loading && !set" class="py-24 grid place-items-center text-slate-400">
          <Spinner class="w-7 h-7 animate-spin" />
        </div>

        <div v-else-if="error" class="py-24 text-center">
          <p class="text-sm text-red-500">{{ t('dex.state.loadError') }}</p>
          <button
            class="cursor-pointer mt-3 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white underline"
            @click="load(String(route.params.setId))"
          >
            {{ t('dex.state.retry') }}
          </button>
        </div>

        <template v-else-if="set">
          <section class="glass rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-5">
            <div class="shrink-0 h-16 sm:h-20 flex items-center">
              <img
                v-if="set.logoUrl && !logoFailed"
                :src="set.logoUrl"
                :alt="set.name"
                class="max-h-16 sm:max-h-20 max-w-[14rem] object-contain"
                @error="logoFailed = true"
              />
              <h1 v-else class="text-xl font-semibold">{{ set.name }}</h1>
            </div>

            <div class="flex-1 min-w-0 flex flex-col gap-2">
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div class="min-w-0">
                  <h1 class="text-lg font-semibold truncate">{{ set.name }}</h1>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ set.seriesName }}
                    <template v-if="year(set.releaseDate)"> · {{ year(set.releaseDate) }}</template>
                    <template v-if="set.ptcgoCode"> · {{ set.ptcgoCode }}</template>
                  </p>
                </div>
                <div class="text-sm text-slate-600 dark:text-slate-300">
                  <ProgressLabel :owned="owned" :total="set.total" />
                </div>
              </div>
              <ProgressBar :owned="owned" :total="set.total" size="md" />
            </div>
          </section>

          <div class="glass rounded-2xl p-2 flex flex-wrap items-center gap-1.5">
            <div class="inline-flex items-center gap-0.5 bg-black/[0.04] dark:bg-white/5 rounded-xl p-1">
              <button
                v-for="f in OWNED_FILTERS"
                :key="f.key"
                @click="ownedFilter = f.key"
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

            <div v-if="rarities.length > 1" class="relative">
              <select
                v-model="rarityFilter"
                :class="['appearance-none cursor-pointer pl-3 pr-8 max-w-[12rem]', CHIP_BASE, rarityFilter ? CHIP_ACTIVE : CHIP_IDLE]"
              >
                <option value="">{{ t('dex.filter.allRarities') }}</option>
                <option v-for="r in rarities" :key="r" :value="r">{{ r }}</option>
              </select>
              <Icon name="chevronDown" :sw="2.5" class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50" />
            </div>

            <div class="relative">
              <Icon name="search" :sw="2" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                v-model="query"
                type="search"
                :placeholder="t('dex.set.filterPlaceholder')"
                :class="['pl-9 pr-3 w-36 sm:w-48', CHIP_BASE, query ? CHIP_ACTIVE : CHIP_IDLE]"
              />
            </div>

            <button
              v-if="hasFilters"
              @click="clearFilters"
              :title="t('dex.filter.clear')"
              class="nuc-press cursor-pointer inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/8 transition-colors"
            >
              <Icon name="close" :sw="2.5" class="w-4 h-4" />
            </button>

            <span class="ml-auto hidden sm:block text-xs text-slate-400 tabular-nums pr-1">
              {{ t('dex.set.showing', { shown: visible.length, total: cards.length }) }}
            </span>

            <div class="flex items-center h-9 bg-black/[0.05] dark:bg-white/5 rounded-lg p-1 gap-0.5">
              <button
                @click="dense = false"
                :title="t('dex.set.comfortable')"
                :class="['cursor-pointer h-full px-2.5 rounded-md inline-flex items-center transition-colors', !dense ? 'text-indigo-600 dark:text-white bg-white dark:bg-white/15 shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-white']"
              >
                <DexIcon name="card" class="w-4 h-4" />
              </button>
              <button
                @click="dense = true"
                :title="t('dex.set.dense')"
                :class="['cursor-pointer h-full px-2.5 rounded-md inline-flex items-center transition-colors', dense ? 'text-indigo-600 dark:text-white bg-white dark:bg-white/15 shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-white']"
              >
                <DexIcon name="viewGrid" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div v-if="!visible.length" class="py-20 text-center text-sm text-slate-400">
            <p>{{ t('dex.set.noMatches') }}</p>
            <button v-if="hasFilters" class="cursor-pointer mt-3 text-indigo-600 dark:text-indigo-400 hover:underline" @click="clearFilters">
              {{ t('dex.filter.clear') }}
            </button>
          </div>

          <div v-else class="grid gap-2.5 sm:gap-3" :class="gridClass">
            <CardTile v-for="c in visible" :key="c.cardId" :card="c" @open="openCard" />
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
