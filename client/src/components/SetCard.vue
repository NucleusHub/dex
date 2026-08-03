<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { Icon } from '@core/icons'
import { useCollection } from '@/composables/useCollection.js'
import { count, year } from '@/utils/format.js'
import ProgressBar from '@/components/ProgressBar.vue'
import ProgressLabel from '@/components/ProgressLabel.vue'

// A set inside a series. Smaller and calmer than a SeriesCard — the set logo on
// glass, with the numbers underneath — so a series page of twenty sets reads as
// a list of options rather than twenty competing posters.
const props = defineProps({
  set: { type: Object, required: true },
})

const { t, locale } = useI18n()
const { ownedInSet } = useCollection()

const owned = computed(() => ownedInSet(props.set.setId))
const complete = computed(() => props.set.total > 0 && owned.value >= props.set.total)
const logoFailed = ref(false)
</script>

<template>
  <RouterLink
    :to="`/sets/${set.setId}`"
    class="group glass rounded-2xl p-4 flex flex-col gap-3 nuc-press transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
  >
    <!-- Logo plate. Fixed height so a row of sets stays on a grid even though
         set logos vary wildly in aspect ratio. -->
    <div class="h-20 flex items-center justify-center">
      <img
        v-if="set.logoUrl && !logoFailed"
        :src="set.logoUrl"
        :alt="set.name"
        loading="lazy"
        decoding="async"
        class="max-h-20 max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
        @error="logoFailed = true"
      />
      <span v-else class="text-base font-semibold text-slate-700 dark:text-slate-200 text-center px-2">
        {{ set.name }}
      </span>
    </div>

    <div class="flex items-start justify-between gap-2 min-w-0">
      <div class="min-w-0">
        <h3 class="text-sm font-semibold text-slate-900 dark:text-white truncate">{{ set.name }}</h3>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
          {{ count(set.total, locale) }} {{ t('dex.series.cardsShort') }}
          <template v-if="year(set.releaseDate)"> · {{ year(set.releaseDate) }}</template>
        </p>
      </div>
      <!-- The one badge on the tile: a finished set. Everything else is the bar. -->
      <span
        v-if="complete"
        class="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium px-2 py-0.5"
        :title="t('dex.set.complete')"
      >
        <Icon name="check" :sw="3" class="w-3 h-3" />
        {{ t('dex.set.complete') }}
      </span>
      <img
        v-else-if="set.symbolUrl"
        :src="set.symbolUrl"
        alt=""
        loading="lazy"
        class="shrink-0 w-5 h-5 object-contain opacity-60"
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <ProgressBar :owned="owned" :total="set.total" />
      <div class="text-[11px] text-slate-500 dark:text-slate-400">
        <ProgressLabel :owned="owned" :total="set.total" terse />
      </div>
    </div>
  </RouterLink>
</template>
