<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { useSettingsModal } from '@core/useSettingsModal.js'
import BackgroundBlobs from '@core/BackgroundBlobs.vue'
import { Spinner } from '@core/icons'
import DexHeader from '@/components/DexHeader.vue'
import SeriesCard from '@/components/SeriesCard.vue'
import CatalogEmpty from '@/components/CatalogEmpty.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import { useCatalog } from '@/composables/useCatalog.js'
import { useCollection } from '@/composables/useCollection.js'
import { count } from '@/utils/format.js'

// The homepage is the SERIES overview, not the user's collection — every series
// ever released is here whether they own a card from it or not. That's the
// premise the whole app is built on, and showing it first is what makes the
// progress bars mean something.
const { t, locale } = useI18n()
const { series, stats, catalogState, loading, error, load, reload, watchSync, stopWatchingSync } = useCatalog()
const { totalOwned } = useCollection()
const { open: settingsOpen, closeSettings } = useSettingsModal()

// Total across every series — the denominator for the headline bar. Taken from
// the catalog rows rather than /stats so it can't disagree with the tiles.
const totalCards = computed(() => series.value.reduce((n, s) => n + (s.cardCount || 0), 0))

const syncing = computed(() => catalogState.value?.status === 'running')
const catalogEmpty = computed(() => !loading.value && !error.value && !series.value.length)

onMounted(async () => {
  await load()
  // If an admin kicked off the first sync, keep refreshing until the series
  // start appearing instead of leaving the user on an empty page.
  if (syncing.value) watchSync(() => reload())
})

onBeforeUnmount(stopWatchingSync)
</script>

<template>
  <div class="relative min-h-screen bg-slate-100 dark:bg-[#0d0d1a] text-slate-900 dark:text-white overflow-x-hidden">
    <BackgroundBlobs />
    <div class="relative z-10">
      <DexHeader>
        <template #subtitle>
          <p class="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {{ t('dex.home.owned', { count: count(totalOwned, locale) }) }}
          </p>
        </template>
      </DexHeader>

      <main class="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
        <!-- Headline progress. One sentence and one bar: how much of every card
             ever printed you actually have. -->
        <section v-if="series.length" class="glass rounded-2xl p-5 flex flex-col gap-3">
          <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <h1 class="text-2xl font-semibold tracking-tight">{{ t('dex.home.title') }}</h1>
              <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {{ t('dex.home.subtitle', { series: series.length, sets: stats?.setCount ?? 0 }) }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-2xl font-semibold tabular-nums">
                {{ count(totalOwned, locale) }}
                <span class="text-base font-normal text-slate-400">/ {{ count(totalCards, locale) }}</span>
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">{{ t('dex.progress.collected') }}</p>
            </div>
          </div>
          <ProgressBar :owned="totalOwned" :total="totalCards" size="md" />
        </section>

        <!-- States -->
        <div v-if="loading && !series.length" class="py-24 grid place-items-center text-slate-400">
          <Spinner class="w-7 h-7 animate-spin" />
        </div>

        <div v-else-if="error" class="py-24 text-center">
          <p class="text-sm text-red-500">{{ t('dex.state.loadError') }}</p>
          <button
            class="cursor-pointer mt-3 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white underline"
            @click="reload"
          >
            {{ t('dex.state.retry') }}
          </button>
        </div>

        <!-- Nothing synced yet — a genuinely different empty state from "you own
             nothing", and the one that needs an admin, not the user. -->
        <CatalogEmpty v-else-if="catalogEmpty" :state="catalogState" @synced="reload" />

        <template v-else>
          <div v-if="syncing" class="glass rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
            <Spinner class="w-4 h-4 animate-spin shrink-0" />
            {{ t('dex.sync.runningInline', { processed: catalogState?.processed ?? 0, total: catalogState?.total ?? 0 }) }}
          </div>

          <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 nuc-stagger" style="--nuc-step: 40ms">
            <SeriesCard v-for="s in series" :key="s.seriesId" :series="s" />
          </section>
        </template>
      </main>

      <SettingsModal :show="settingsOpen" @close="closeSettings" />
    </div>
  </div>
</template>
