<script setup>
import { ref, watch, computed } from 'vue'
import { useI18n } from '@core/useI18n.js'
import TemplateModal from '@core/TemplateModal.vue'
import { Spinner } from '@core/icons'
import { getCollection, searchCards } from '@/api/dex.js'
import { cardNumber } from '@/utils/format.js'

// Pick a card to slot into a binder pocket.
//
// Defaults to the user's OWN collection — you fill a physical binder with cards
// you have — but a toggle searches the whole catalog, because people do build
// "want" pages. The distinction is explicit rather than hidden behind a filter.
const props = defineProps({
  show: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'pick'])

const { t } = useI18n()

const scope = ref('collection') // 'collection' | 'catalog'
const query = ref('')
const rows = ref([])
const loading = ref(false)
let seq = 0

const SCOPES = computed(() => [
  { key: 'collection', label: t('dex.picker.myCollection') },
  { key: 'catalog', label: t('dex.picker.allCards') },
])

async function run() {
  // Guard against a slow earlier request overwriting a newer one's results.
  const mine = ++seq
  loading.value = true
  try {
    let next
    if (scope.value === 'catalog') {
      const q = query.value.trim()
      next = q ? (await searchCards({ q, pageSize: 60 })).results : []
    } else {
      const res = await getCollection({ pageSize: 120 })
      const q = query.value.trim().toLowerCase()
      next = res.items
        .map((i) => i.card)
        .filter(Boolean)
        .filter((c) => !q || `${c.name} ${c.number} ${c.setName}`.toLowerCase().includes(q))
    }
    if (mine === seq) rows.value = next
  } catch {
    if (mine === seq) rows.value = []
  } finally {
    if (mine === seq) loading.value = false
  }
}

let timer = null
watch([query, scope], () => {
  clearTimeout(timer)
  timer = setTimeout(run, 220)
})

watch(
  () => props.show,
  (show) => {
    if (!show) return
    query.value = ''
    scope.value = 'collection'
    run()
  }
)
</script>

<template>
  <TemplateModal
    :show="show"
    header
    searchable
    size="lg"
    fixed-height
    :tabs="SCOPES"
    v-model:tab="scope"
    v-model:search="query"
    :title="t('dex.picker.title')"
    :search-placeholder="t('dex.picker.search')"
    z="z-[205]"
    @cancel="emit('close')"
  >
    <div v-if="loading" class="py-16 grid place-items-center text-slate-400">
      <Spinner class="w-6 h-6 animate-spin" />
    </div>

    <div v-else-if="!rows.length" class="py-16 text-center text-sm text-slate-400">
      {{ scope === 'catalog' && !query.trim() ? t('dex.picker.typeToSearch') : t('dex.picker.noCards') }}
    </div>

    <div v-else class="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
      <button
        v-for="c in rows"
        :key="c.cardId"
        type="button"
        class="group text-left cursor-pointer rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        :title="`${c.name} · ${c.setName}`"
        @click="emit('pick', c)"
      >
        <span class="relative block dex-card-ratio rounded-lg overflow-hidden bg-black/[0.06] dark:bg-white/[0.06]">
          <img
            v-if="c.images?.small"
            :src="c.images.small"
            :alt="c.name"
            loading="lazy"
            class="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </span>
        <span class="block mt-1 text-[11px] leading-tight text-slate-600 dark:text-slate-300 truncate">{{ c.name }}</span>
        <span class="block text-[10px] text-slate-400 tabular-nums truncate">{{ cardNumber(c) }} · {{ c.setName }}</span>
      </button>
    </div>
  </TemplateModal>
</template>
