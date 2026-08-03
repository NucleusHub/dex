<script setup>
import { computed } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { Icon } from '@core/icons'
import CardTile from '@/components/CardTile.vue'
import { layoutMeta } from '@/utils/constants.js'

// One page of a binder: a fixed grid of pockets. Empty pockets are real, sized
// slots — a page of nine is always a page of nine, whether it holds one card or
// nine, because that's what makes it a binder page and not a search result.
//
// Deliberately not skeuomorphic: no rings, no leather, no page curl. Just the
// grid, on glass.
const props = defineProps({
  slots: { type: Array, required: true }, // [{ position, card, owned }]
  layout: { type: String, default: '3x3' },
  editable: { type: Boolean, default: false },
  // Set only for a SHARED binder — narrows plugin indicators to this binder's
  // members ("already in this collection") rather than the whole network.
  binderId: { type: String, default: '' },
  // Passed through to the tiles — set on the turning leaf's faces so their
  // artwork paints during the flip rather than after it.
  eager: { type: Boolean, default: false },
  // What can be seen THROUGH each empty pocket: `{ card, depth }` per slot, or
  // null when nothing is visible. BinderBook works out which page each one comes
  // from — it looks through as many sheets as are actually see-through, not just
  // the next one — and `depth` (1 = the sheet's own reverse, 2 = the one behind
  // that, …) drives how faint it renders. Same length as `slots`.
  ghosts: { type: Array, default: () => [] },
})
const emit = defineEmits(['open', 'fill', 'clear'])

const { t } = useI18n()
const meta = computed(() => layoutMeta(props.layout))
</script>

<template>
  <div
    class="grid gap-3 sm:gap-4"
    :style="{ gridTemplateColumns: `repeat(${meta.cols}, minmax(0, 1fr))` }"
  >
    <div v-for="(slot, i) in slots" :key="slot.position" class="relative group/pocket">
      <template v-if="slot.card">
        <CardTile :card="slot.card" :addable="false" :binder-id="binderId" :eager="eager" @open="emit('open', $event)" />
        <!-- Remove from the pocket, not from the collection: taking a card out
             of a binder doesn't mean you sold it. -->
        <button
          v-if="editable"
          type="button"
          class="absolute -top-1.5 -right-1.5 grid place-items-center w-6 h-6 rounded-full bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 shadow-md opacity-0 group-hover/pocket:opacity-100 focus:opacity-100 hover:bg-red-500 hover:text-white transition-all cursor-pointer"
          :title="t('dex.binder.removeFromPage')"
          @click.stop="emit('clear', slot.position)"
        >
          <Icon name="close" :sw="2.5" class="w-3.5 h-3.5" />
        </button>
      </template>

      <!-- Empty pocket. Whatever sits on the other side of the sheet shows
           through it — dimmed and blurred so it reads as "behind", never as a
           card you could tap. -->
      <template v-else>
        <!-- Odd depth = a surface facing AWAY from you, so what shows through is
             the card's back, not its art. Even depth = facing you: real artwork. -->
        <div
          v-if="ghosts[i] && ghosts[i].depth % 2 === 1"
          :style="{ '--d': ghosts[i].depth }"
          aria-hidden="true"
          class="dex-ghost dex-ghost-back absolute inset-0 rounded-xl pointer-events-none"
        />
        <img
          v-else-if="ghosts[i]?.card?.images?.small"
          :src="ghosts[i].card.images.small"
          :style="{ '--d': ghosts[i].depth }"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          class="dex-ghost absolute inset-0 w-full h-full object-cover rounded-xl pointer-events-none"
        />
        <button
          type="button"
          class="dex-card-ratio relative w-full rounded-xl border-2 border-dashed grid place-items-center transition-colors"
          :class="editable
            ? 'cursor-pointer border-slate-700/35 dark:border-white/25 text-slate-700/60 dark:text-white/45 hover:border-indigo-600 hover:text-indigo-700 dark:hover:border-indigo-400 dark:hover:text-indigo-300 hover:bg-white/25 dark:hover:bg-indigo-500/10'
            : 'border-slate-700/15 dark:border-white/10 text-slate-600/35 dark:text-white/15 cursor-default'"
          :disabled="!editable"
          :aria-label="editable ? t('dex.binder.addToPocket') : t('dex.binder.emptyPocket')"
          @click="editable && emit('fill', slot.position)"
        >
          <Icon v-if="editable" name="plus" :sw="2.25" class="w-8 h-8 drop-shadow-sm" />
        </button>
      </template>
    </div>
  </div>
</template>
