<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { useRegistry } from '@core/useRegistry.js'
import { Icon } from '@core/icons'
import { useCollection } from '@/composables/useCollection.js'
import { useDexSettings } from '@/composables/useDexSettings.js'
import { cardValue } from '@/utils/format.js'
import { cardIndicators } from '@/utils/pluginIndicators.js'

// One card in a grid. Artwork is the entire tile; the interface is what appears
// around it. Owned cards render at full strength, un-owned ones are dimmed and
// desaturated (see .dex-unowned in main.css) so a set's completion is legible at
// a glance from across the room — which is the whole job of this screen.
const props = defineProps({
  card: { type: Object, required: true },
  // Hide the quick-add affordance where adding isn't the point (binder pockets).
  addable: { type: Boolean, default: true },
  // Set inside a SHARED binder. Plugin indicators use it to answer "is this card
  // already in this binder's collection?" instead of the broader "who else has
  // this?" — see the in-common plugin's dexIndicator.
  binderId: { type: String, default: '' },
  // Tiles default to lazy loading — a set is 200+ images. The binder's turning
  // leaf overrides this: it is mounted only for the ~600ms of the flip, and a
  // lazy image would not paint before the page had already turned.
  eager: { type: Boolean, default: false },
})
const emit = defineEmits(['open'])

const { t, locale } = useI18n()
const { isPluginEnabled } = useRegistry()
const { isOwned, itemFor, add } = useCollection()
const { settings } = useDexSettings()

const owned = computed(() => isOwned(props.card.cardId))
const item = computed(() => itemFor(props.card.cardId))
const imageFailed = ref(false)
const adding = ref(false)

// Quick-add straight from the grid: one tap, sensible defaults, no dialog. The
// detail view is where quantity/condition/purchase get filled in.
async function quickAdd() {
  if (adding.value) return
  adding.value = true
  try {
    await add(props.card)
  } catch (err) {
    // useCollection already rolled the optimistic update back, so the tile
    // returns to "not owned" rather than throwing an error over the artwork.
    // It is logged rather than swallowed: a silent rollback is indistinguishable
    // from "adding doesn't work", which is exactly how a real bug once hid.
    console.error('[dex] failed to add card to collection:', props.card.cardId, err)
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div class="group relative">
    <button
      type="button"
      class="relative block w-full dex-card-ratio rounded-xl overflow-hidden bg-black/[0.06] dark:bg-white/[0.06] nuc-press focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      :class="owned ? 'dex-sheen' : ''"
      :aria-label="card.name"
      @click="emit('open', card)"
    >
      <img
        v-if="card.images?.small && !imageFailed"
        :src="card.images.small"
        :alt="card.name"
        :loading="eager ? 'eager' : 'lazy'"
        :fetchpriority="eager ? 'high' : 'auto'"
        decoding="async"
        class="absolute inset-0 w-full h-full object-cover"
        :class="owned ? '' : 'dex-unowned'"
        @error="imageFailed = true"
      />
      <!-- No artwork from the source: still show the card's identity rather than
           an empty box, so the pocket in the grid stays meaningful. -->
      <div
        v-else
        class="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center"
        :class="owned ? '' : 'opacity-60'"
      >
        <span class="text-[11px] font-medium text-slate-600 dark:text-slate-300 line-clamp-3">{{ card.name }}</span>
        <span class="text-[10px] text-slate-400 tabular-nums">{{ card.number }}</span>
      </div>

      <!-- Owned marker, bottom-left and out of the artwork's way. The quantity
           chip rides next to it, but only past the first copy: a "1" on every
           owned card is noise, "×3" is information. -->
      <span v-if="owned" class="absolute bottom-1.5 left-1.5 flex items-center gap-1">
        <span
          class="grid place-items-center w-5 h-5 rounded-full bg-emerald-500 text-white shadow"
          :title="t('dex.card.owned')"
        >
          <Icon name="check" :sw="3.5" class="w-3 h-3" />
        </span>
        <span
          v-if="(item?.quantity ?? 1) > 1"
          class="rounded-md bg-slate-950/70 text-white text-[10px] font-semibold px-1.5 py-0.5 tabular-nums backdrop-blur-sm"
        >×{{ item.quantity }}</span>
      </span>

      <span
        v-if="settings.showPricesInGrid && card.marketValue"
        class="absolute bottom-1.5 right-1.5 rounded-md bg-slate-950/70 text-white text-[10px] px-1.5 py-0.5 tabular-nums backdrop-blur-sm"
      >{{ cardValue(card, locale) }}</span>
    </button>

    <!-- Add (+). Only for cards you don't own — the whole "users never create
         missing entries" idea: the card already exists, you just claim it. -->
    <button
      v-if="addable && !owned"
      type="button"
      class="absolute top-1.5 right-1.5 grid place-items-center w-7 h-7 rounded-full bg-white/85 dark:bg-slate-900/85 text-slate-700 dark:text-white shadow-md backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-indigo-500 hover:bg-indigo-600 hover:text-white transition-all duration-150 cursor-pointer disabled:opacity-60"
      :class="adding ? 'opacity-100' : ''"
      :title="t('dex.card.add')"
      :disabled="adding"
      @click.stop="quickAdd"
    >
      <Icon name="plus" :sw="2.5" class="w-4 h-4 nuc-pop" />
    </button>

    <!-- Plugin badges (e.g. In Common's "someone else has this too"). Gated on
         the plugin's enabled state, same as Shelf and Watchlist do it. -->
    <div v-if="cardIndicators.length" class="absolute top-1.5 left-1.5 flex items-center gap-1">
      <component
        v-for="ind in cardIndicators"
        :key="ind.pluginId"
        :is="ind.component"
        v-show="isPluginEnabled(ind.pluginId)"
        :card="card"
        :binder-id="binderId"
        variant="tile"
      />
    </div>
  </div>
</template>
