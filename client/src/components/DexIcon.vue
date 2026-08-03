<script setup>
// Renders a Dex-local glyph (utils/icons.js) with exactly the same contract as
// the shared <Icon> from @core/icons: currentColor, class-driven sizing. Kept
// as a separate component rather than forking core's — a view imports whichever
// one owns the glyph it wants, and the two are interchangeable at the call site.
import { computed } from 'vue'
import { DEX_ICONS } from '@/utils/icons.js'

const props = defineProps({
  name: { type: String, required: true },
  sw: { type: [Number, String], default: 1.75 },
})

const inner = computed(() => {
  const v = DEX_ICONS[props.name]
  if (v == null) {
    if (import.meta.env?.DEV) console.warn(`[DexIcon] unknown icon "${props.name}"`)
    return ''
  }
  if (Array.isArray(v)) return v.map((d) => `<path d="${d}" />`).join('')
  if (v.includes('<')) return v
  return `<path d="${v}" />`
})
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="sw"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="inner"
  />
</template>
