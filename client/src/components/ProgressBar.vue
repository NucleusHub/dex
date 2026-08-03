<script setup>
import { computed } from 'vue'
import { pctOf } from '@/composables/useCollection.js'

// The one progress bar in Dex. Every level of the hierarchy — a set, a series,
// the whole collection — is the same shape at a different scale, so they all
// render through here and a completed one always looks the same.
const props = defineProps({
  owned: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  // 'sm' on tiles, 'md' on headers.
  size: { type: String, default: 'sm' },
  // Light track + white fill, for bars sitting on top of artwork.
  onArtwork: { type: Boolean, default: false },
})

const pct = computed(() => pctOf(props.owned, props.total))
const complete = computed(() => props.total > 0 && props.owned >= props.total)
</script>

<template>
  <div
    class="w-full rounded-full overflow-hidden"
    :class="[
      size === 'md' ? 'h-1.5' : 'h-1',
      onArtwork ? 'bg-white/25' : 'bg-black/[0.08] dark:bg-white/10',
    ]"
    role="progressbar"
    :aria-valuenow="pct"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <!-- A completed set earns a distinct colour; everything in progress uses the
         Nucleus indigo so the grid reads as one system. -->
    <div
      class="h-full rounded-full transition-[width] duration-500 ease-out"
      :class="
        onArtwork
          ? 'bg-white'
          : complete
            ? 'bg-emerald-500 dark:bg-emerald-400'
            : 'bg-indigo-500 dark:bg-indigo-400'
      "
      :style="{ width: `${pct}%` }"
    />
  </div>
</template>
