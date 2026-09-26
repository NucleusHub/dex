<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { useRegistry } from '@core/useRegistry.js'
import { Icon } from '@core/icons'
import { useCollection } from '@/composables/useCollection.js'
import { useDexSettings } from '@/composables/useDexSettings.js'
import { cardValue } from '@/utils/format.js'
import { cardIndicators } from '@/utils/pluginIndicators.js'

const props = defineProps({
  card: { type: Object, required: true },
  addable: { type: Boolean, default: true },
  binderId: { type: String, default: '' },
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

async function quickAdd() {
  if (adding.value) return
  adding.value = true
  try {
    await add(props.card)
  } catch (err) {
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
      <div
        v-else
        class="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center"
        :class="owned ? '' : 'opacity-60'"
      >
        <span class="text-[11px] font-medium text-slate-600 dark:text-slate-300 line-clamp-3">{{ card.name }}</span>
        <span class="text-[10px] text-slate-400 tabular-nums">{{ card.number }}</span>
      </div>

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
