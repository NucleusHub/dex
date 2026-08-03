<script setup>
import { computed } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { pctOf } from '@/composables/useCollection.js'
import { count } from '@/utils/format.js'

// "203 / 207 collected · 98%" — the sentence that goes with a ProgressBar.
// Split out because the same numbers appear under a tile, in a header and in the
// set toolbar, and they must read identically in all three.
const props = defineProps({
  owned: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  // Drop the word "collected" where the context already makes it obvious.
  terse: { type: Boolean, default: false },
})

const { t, locale } = useI18n()
const pct = computed(() => pctOf(props.owned, props.total))
const complete = computed(() => props.total > 0 && props.owned >= props.total)
</script>

<template>
  <span class="inline-flex items-baseline gap-1.5 tabular-nums">
    <span class="font-medium">{{ count(owned, locale) }}</span>
    <span class="opacity-50">/</span>
    <span class="opacity-70">{{ count(total, locale) }}</span>
    <span v-if="!terse" class="opacity-70">{{ t('dex.progress.collected') }}</span>
    <span
      class="opacity-80"
      :class="complete ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''"
    >· {{ pct }}%</span>
  </span>
</template>
