<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { useCollection } from '@/composables/useCollection.js'
import { seriesArtwork, seriesGradient } from '@/utils/artwork.js'
import { count, year } from '@/utils/format.js'
import ProgressBar from '@/components/ProgressBar.vue'
import ProgressLabel from '@/components/ProgressLabel.vue'

const props = defineProps({
  series: { type: Object, required: true },
})

const { t, locale } = useI18n()
const { ownedInSeries } = useCollection()

const artwork = computed(() => seriesArtwork(props.series))
const gradient = computed(() => seriesGradient(props.series))
const owned = computed(() => ownedInSeries(props.series.seriesId))

const artworkFailed = ref(false)

const span = computed(() => {
  const a = year(props.series.firstRelease)
  const b = year(props.series.lastRelease)
  if (!a) return ''
  return a === b ? a : `${a}–${b}`
})
</script>

<template>
  <RouterLink
    :to="`/series/${series.seriesId}`"
    class="group relative block rounded-3xl overflow-hidden nuc-press focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
  >
    <div class="relative aspect-[16/10] overflow-hidden" :style="{ background: gradient }">
      <img
        v-if="artwork && !artworkFailed"
        :src="artwork"
        :alt="series.name"
        loading="lazy"
        decoding="async"
        class="absolute inset-0 w-full h-full object-contain p-8 drop-shadow-2xl transition-transform duration-500 ease-out group-hover:scale-[1.045]"
        @error="artworkFailed = true"
      />
      <div class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

      <div class="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex flex-col gap-2.5">
        <div class="flex items-end justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-lg sm:text-xl font-semibold text-white truncate drop-shadow-sm">{{ series.name }}</h2>
            <p class="text-[11px] sm:text-xs text-white/75 mt-0.5">
              {{ t('dex.series.sets', { count: series.setCount }) }}
              <template v-if="span"> · {{ span }}</template>
            </p>
          </div>
          <span class="shrink-0 text-xs text-white/85 tabular-nums">
            {{ count(series.cardCount, locale) }} {{ t('dex.series.cardsShort') }}
          </span>
        </div>

        <ProgressBar :owned="owned" :total="series.cardCount" on-artwork size="md" />
        <div class="text-[11px] text-white/85">
          <ProgressLabel :owned="owned" :total="series.cardCount" />
        </div>
      </div>
    </div>
  </RouterLink>
</template>
