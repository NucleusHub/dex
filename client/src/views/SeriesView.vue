<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '@core/useI18n.js'
import { useSettingsModal } from '@core/useSettingsModal.js'
import BackgroundBlobs from '@core/BackgroundBlobs.vue'
import { Icon, Spinner } from '@core/icons'
import DexHeader from '@/components/DexHeader.vue'
import SetCard from '@/components/SetCard.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import ProgressLabel from '@/components/ProgressLabel.vue'
import { getSeriesDetail } from '@/api/dex.js'
import { useCollection, seedProgress } from '@/composables/useCollection.js'
import { seriesArtwork, seriesGradient } from '@/utils/artwork.js'
import { count } from '@/utils/format.js'

const route = useRoute()
const { t, locale } = useI18n()
const { ownedInSeries, ownedInSet } = useCollection()
const { open: settingsOpen, closeSettings } = useSettingsModal()

const series = ref(null)
const sets = ref([])
const loading = ref(false)
const error = ref(null)
const artworkFailed = ref(false)

const owned = computed(() => (series.value ? ownedInSeries(series.value.seriesId) : 0))
const artwork = computed(() => seriesArtwork(series.value))
const gradient = computed(() => seriesGradient(series.value))

const onlyIncomplete = ref(false)
const visibleSets = computed(() =>
  onlyIncomplete.value
    ? sets.value.filter((s) => s.total > 0 && ownedInSet(s.setId) < s.total)
    : sets.value
)

async function load(seriesId) {
  if (!seriesId) return
  loading.value = true
  error.value = null
  artworkFailed.value = false
  try {
    const data = await getSeriesDetail(seriesId)
    series.value = data.series
    sets.value = data.sets
    seedProgress({ series: [data.series], sets: data.sets })
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

watch(() => route.params.seriesId, (id) => load(String(id)), { immediate: true })
</script>

<template>
  <div class="relative min-h-screen bg-slate-100 dark:bg-[#0d0d1a] text-slate-900 dark:text-white overflow-x-hidden">
    <BackgroundBlobs />
    <div class="relative z-10">
      <DexHeader>
        <template #subtitle>
          <RouterLink
            to="/"
            class="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <Icon name="chevronLeft" :sw="2.5" class="w-3.5 h-3.5" />
            {{ t('dex.nav.allSeries') }}
          </RouterLink>
        </template>
      </DexHeader>

      <main class="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
        <div v-if="loading && !series" class="py-24 grid place-items-center text-slate-400">
          <Spinner class="w-7 h-7 animate-spin" />
        </div>

        <div v-else-if="error" class="py-24 text-center">
          <p class="text-sm text-red-500">{{ t('dex.state.loadError') }}</p>
          <button
            class="cursor-pointer mt-3 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white underline"
            @click="load(String(route.params.seriesId))"
          >
            {{ t('dex.state.retry') }}
          </button>
        </div>

        <template v-else-if="series">
          <section class="relative rounded-3xl overflow-hidden" :style="{ background: gradient }">
            <img
              v-if="artwork && !artworkFailed"
              :src="artwork"
              :alt="series.name"
              decoding="async"
              class="absolute right-4 top-1/2 -translate-y-1/2 h-[78%] max-w-[45%] object-contain drop-shadow-2xl opacity-90"
              @error="artworkFailed = true"
            />
            <div class="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-transparent" />

            <div class="relative p-6 sm:p-8 flex flex-col gap-4 max-w-2xl">
              <div>
                <h1 class="text-2xl sm:text-3xl font-semibold text-white tracking-tight">{{ series.name }}</h1>
                <p class="text-sm text-white/75 mt-1">
                  {{ t('dex.series.sets', { count: series.setCount }) }} ·
                  {{ count(series.cardCount, locale) }} {{ t('dex.series.cardsShort') }}
                </p>
              </div>
              <div class="flex flex-col gap-2 max-w-md">
                <ProgressBar :owned="owned" :total="series.cardCount" on-artwork size="md" />
                <div class="text-xs text-white/85">
                  <ProgressLabel :owned="owned" :total="series.cardCount" />
                </div>
              </div>
            </div>
          </section>

          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {{ t('dex.series.expansions') }}
            </h2>
            <button
              class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
              :class="onlyIncomplete
                ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-300 dark:border-indigo-400/30 text-indigo-700 dark:text-indigo-300'
                : 'bg-white/70 dark:bg-white/8 border-white/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'"
              @click="onlyIncomplete = !onlyIncomplete"
            >
              <Icon name="eyeOff" :sw="2" class="w-4 h-4" />
              {{ t('dex.series.hideComplete') }}
            </button>
          </div>

          <div v-if="!visibleSets.length" class="py-16 text-center text-sm text-slate-400">
            {{ onlyIncomplete ? t('dex.series.allComplete') : t('dex.series.noSets') }}
          </div>

          <section v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 nuc-stagger" style="--nuc-step: 30ms">
            <SetCard v-for="s in visibleSets" :key="s.setId" :set="s" />
          </section>
        </template>
      </main>

      <SettingsModal :show="settingsOpen" @close="closeSettings" />
    </div>
  </div>
</template>
