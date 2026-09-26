<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { useRegistry } from '@core/useRegistry.js'
import TemplateModal from '@core/TemplateModal.vue'
import { Icon, Spinner } from '@core/icons'
import TrashIcon from '@core/TrashIcon.vue'
import { getCard } from '@/api/dex.js'
import { useCollection, primeCard } from '@/composables/useCollection.js'
import { CONDITIONS, CONDITION_META, TYPE_TINT } from '@/utils/constants.js'
import { money, cardNumber, longDate } from '@/utils/format.js'
import { cardIndicators } from '@/utils/pluginIndicators.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  cardId: { type: String, default: '' },
  siblings: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'navigate'])

const { t, locale } = useI18n()
const { isPluginEnabled } = useRegistry()
const { itemFor, isOwned, add, update, remove } = useCollection()

const detail = ref(null)
const loading = ref(false)
const error = ref(null)
const busy = ref(false)
const confirmRemove = ref(false)
const imageFailed = ref(false)

const form = ref({ quantity: 1, condition: 'near_mint', language: 'en', notes: '', purchase: null })
const showPurchase = ref(false)

const card = computed(() => detail.value?.card ?? null)
const owned = computed(() => !!card.value && isOwned(card.value.cardId))
const item = computed(() => (card.value ? itemFor(card.value.cardId) : null))

const priceRows = computed(() => {
  const out = []
  const p = card.value?.prices ?? {}
  const cm = p.cardmarket
  if (cm?.trendPrice != null) out.push({ label: t('dex.price.cmTrend'), amount: cm.trendPrice, currency: 'EUR' })
  if (cm?.averageSellPrice != null) out.push({ label: t('dex.price.cmAverage'), amount: cm.averageSellPrice, currency: 'EUR' })
  if (cm?.lowPrice != null) out.push({ label: t('dex.price.cmLow'), amount: cm.lowPrice, currency: 'EUR' })
  for (const [variant, v] of Object.entries(p.tcgplayer ?? {})) {
    if (v?.market != null) out.push({ label: `${t('dex.price.tcgMarket')} · ${variant}`, amount: v.market, currency: 'USD' })
  }
  return out
})

const index = computed(() => props.siblings.indexOf(props.cardId))
const canPrev = computed(() => index.value > 0)
const canNext = computed(() => index.value >= 0 && index.value < props.siblings.length - 1)

function step(delta) {
  const i = index.value
  if (i < 0) return
  const next = props.siblings[i + delta]
  if (next) emit('navigate', next)
}

function onKeydown(e) {
  if (!props.show) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const el = document.activeElement
  const tag = el?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  e.preventDefault()
  step(e.key === 'ArrowLeft' ? -1 : 1)
}

watch(
  () => props.show,
  (show) => {
    if (show) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true }
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

watch(
  () => [props.show, props.cardId],
  async ([show, id]) => {
    if (!show || !id) return
    detail.value = null
    error.value = null
    imageFailed.value = false
    confirmRemove.value = false
    showPurchase.value = false
    loading.value = true
    try {
      detail.value = await getCard(id)
      primeCard(detail.value.card?.cardId, detail.value.owned)
      syncForm()
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

watch(item, syncForm)

function syncForm() {
  const i = item.value
  form.value = {
    quantity: i?.quantity ?? 1,
    condition: i?.condition ?? 'near_mint',
    language: i?.language ?? 'en',
    notes: i?.notes ?? '',
    purchase: i?.purchase ?? null,
  }
  showPurchase.value = !!i?.purchase
}

async function addToCollection() {
  if (!card.value || busy.value) return
  busy.value = true
  try {
    await add(card.value, { quantity: 1 })
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}

async function persist(patch) {
  if (!card.value || !owned.value) return
  try {
    await update(card.value, patch)
  } catch (e) {
    error.value = e
  }
}

async function setQuantity(n) {
  const quantity = Math.max(1, Number(n) || 1)
  form.value.quantity = quantity
  await persist({ quantity })
}

async function savePurchase() {
  const p = form.value.purchase
  await persist({
    purchase: p
      ? {
          price: p.price === '' || p.price == null ? null : Number(p.price),
          currency: p.currency || 'EUR',
          date: p.date || null,
          source: p.source || '',
        }
      : null,
  })
}

function togglePurchase() {
  showPurchase.value = !showPurchase.value
  if (showPurchase.value && !form.value.purchase) {
    form.value.purchase = { price: '', currency: 'EUR', date: '', source: '' }
  } else if (!showPurchase.value) {
    form.value.purchase = null
    persist({ purchase: null })
  }
}

async function doRemove() {
  if (!card.value || busy.value) return
  busy.value = true
  try {
    await remove(card.value)
    confirmRemove.value = false
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}

const INPUT =
  'w-full rounded-lg bg-black/5 dark:bg-white/8 border border-transparent px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500/50 focus:bg-white dark:focus:bg-white/12 transition-colors'
const LABEL = 'text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500'
</script>

<template>
  <TemplateModal
    :show="show"
    header
    size="xl"
    :title="card?.name || t('dex.card.loading')"
    :description="card ? `${card.setName} · ${cardNumber(card, detail?.set)}` : ''"
    body-class="px-5 sm:px-6 pb-6 pt-4"
    @cancel="emit('close')"
  >
    <div v-if="loading" class="py-20 grid place-items-center text-slate-400">
      <Spinner class="w-6 h-6 animate-spin" />
    </div>

    <div v-else-if="!card" class="py-20 text-center text-sm text-slate-400">
      {{ t('dex.card.notFound') }}
    </div>

    <div v-else class="grid gap-6 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div class="flex flex-col gap-3">
        <div class="relative dex-card-ratio rounded-2xl overflow-hidden bg-black/[0.06] dark:bg-white/[0.06] shadow-xl">
          <img
            v-if="(card.images?.large || card.images?.small) && !imageFailed"
            :src="card.images.large || card.images.small"
            :alt="card.name"
            decoding="async"
            class="absolute inset-0 w-full h-full object-cover"
            :class="owned ? '' : 'dex-unowned'"
            @error="imageFailed = true"
          />
          <div v-else class="absolute inset-0 grid place-items-center text-slate-400">
            <Icon name="image" class="w-10 h-10" />
          </div>

          <button
            v-if="canPrev"
            type="button"
            class="absolute left-2 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 rounded-full bg-slate-950/55 text-white backdrop-blur-sm shadow-lg hover:bg-slate-950/80 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            :title="t('dex.card.previous')"
            :aria-label="t('dex.card.previous')"
            @click="step(-1)"
          >
            <Icon name="chevronLeft" :sw="2.5" class="w-5 h-5" />
          </button>
          <button
            v-if="canNext"
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 rounded-full bg-slate-950/55 text-white backdrop-blur-sm shadow-lg hover:bg-slate-950/80 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            :title="t('dex.card.next')"
            :aria-label="t('dex.card.next')"
            @click="step(1)"
          >
            <Icon name="chevronRight" :sw="2.5" class="w-5 h-5" />
          </button>
        </div>

        <p v-if="index >= 0 && siblings.length > 1" class="text-center text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
          {{ index + 1 }} / {{ siblings.length }}
          <span class="hidden sm:inline opacity-70"> · {{ t('dex.card.arrowHint') }}</span>
        </p>

        <div v-if="cardIndicators.length" class="flex flex-wrap items-center gap-2">
          <component
            v-for="ind in cardIndicators"
            :key="ind.pluginId"
            :is="ind.component"
            v-show="isPluginEnabled(ind.pluginId)"
            :card="card"
            variant="detail"
          />
        </div>
      </div>

      <div class="flex flex-col gap-5 min-w-0">
        <div class="glass rounded-2xl p-4">
          <template v-if="!owned">
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-slate-900 dark:text-white">{{ t('dex.card.notOwnedTitle') }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{{ t('dex.card.notOwnedHint') }}</p>
              </div>
              <button
                class="nuc-press shrink-0 cursor-pointer inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                :disabled="busy"
                @click="addToCollection"
              >
                <Spinner v-if="busy" class="w-4 h-4 animate-spin" />
                <Icon v-else name="plus" :sw="2.5" class="w-4 h-4 nuc-pop" />
                {{ t('dex.card.addToCollection') }}
              </button>
            </div>
          </template>

          <template v-else>
            <div class="flex flex-col gap-4">
              <div class="flex items-center justify-between gap-3">
                <span class="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <span class="grid place-items-center w-5 h-5 rounded-full bg-emerald-500 text-white">
                    <Icon name="check" :sw="3.5" class="w-3 h-3" />
                  </span>
                  {{ t('dex.card.inCollection') }}
                </span>
                <button
                  class="cursor-pointer inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  @click="confirmRemove = true"
                >
                  <TrashIcon class="w-4 h-4" />
                  {{ t('dex.card.remove') }}
                </button>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label :class="LABEL">{{ t('dex.card.quantity') }}</label>
                  <div class="flex items-center gap-1">
                    <button
                      class="cursor-pointer grid place-items-center w-9 h-9 rounded-lg bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/15 text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-40"
                      :disabled="form.quantity <= 1"
                      :aria-label="t('dex.card.decrease')"
                      @click="setQuantity(form.quantity - 1)"
                    >
                      <Icon name="minus" :sw="2.5" class="w-4 h-4" />
                    </button>
                    <input
                      v-model.number="form.quantity"
                      type="number"
                      min="1"
                      class="w-14 text-center rounded-lg bg-black/5 dark:bg-white/8 border border-transparent py-2 text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500/50"
                      @change="setQuantity(form.quantity)"
                    />
                    <button
                      class="cursor-pointer grid place-items-center w-9 h-9 rounded-lg bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/15 text-slate-600 dark:text-slate-300 transition-colors"
                      :aria-label="t('dex.card.increase')"
                      @click="setQuantity(form.quantity + 1)"
                    >
                      <Icon name="plus" :sw="2.5" class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div class="flex flex-col gap-1.5">
                  <label :class="LABEL" for="dex-condition">{{ t('dex.card.condition') }}</label>
                  <select
                    id="dex-condition"
                    v-model="form.condition"
                    :class="[INPUT, 'cursor-pointer']"
                    @change="persist({ condition: form.condition })"
                  >
                    <option v-for="c in CONDITIONS" :key="c" :value="c">{{ t(CONDITION_META[c].i18n) }}</option>
                  </select>
                </div>
              </div>

              <div class="flex flex-col gap-1.5">
                <label :class="LABEL" for="dex-notes">{{ t('dex.card.notes') }}</label>
                <textarea
                  id="dex-notes"
                  v-model="form.notes"
                  rows="2"
                  :placeholder="t('dex.card.notesPlaceholder')"
                  :class="INPUT"
                  @blur="persist({ notes: form.notes })"
                />
              </div>

              <div>
                <button
                  class="cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  @click="togglePurchase"
                >
                  <Icon :name="showPurchase ? 'chevronDown' : 'chevronRight'" :sw="2.5" class="w-3.5 h-3.5" />
                  {{ t('dex.card.purchase') }}
                  <span class="opacity-60">{{ t('dex.card.optional') }}</span>
                </button>

                <div v-if="showPurchase && form.purchase" class="mt-3 grid gap-3 sm:grid-cols-3">
                  <div class="flex flex-col gap-1.5">
                    <label :class="LABEL">{{ t('dex.card.price') }}</label>
                    <input v-model="form.purchase.price" type="number" step="0.01" min="0" :class="INPUT" @blur="savePurchase" />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label :class="LABEL">{{ t('dex.card.date') }}</label>
                    <input v-model="form.purchase.date" type="date" :class="INPUT" @change="savePurchase" />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label :class="LABEL">{{ t('dex.card.source') }}</label>
                    <input v-model="form.purchase.source" type="text" :placeholder="t('dex.card.sourcePlaceholder')" :class="INPUT" @blur="savePurchase" />
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <section class="flex flex-col gap-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {{ t('dex.card.marketValue') }}
          </h3>
          <div v-if="card.marketValue" class="flex items-baseline gap-2">
            <span class="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
              {{ money(card.marketValue.amount, card.marketValue.currency, locale) }}
            </span>
            <span class="text-xs text-slate-400">
              {{ card.marketValue.source === 'cardmarket' ? 'CardMarket' : 'TCGplayer' }}
              <template v-if="card.marketValue.updatedAt"> · {{ longDate(card.marketValue.updatedAt, locale) }}</template>
            </span>
          </div>
          <p v-else class="text-sm text-slate-400">{{ t('dex.card.noPrice') }}</p>

          <dl v-if="priceRows.length" class="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-xs">
            <div v-for="(row, i) in priceRows" :key="i" class="flex justify-between gap-3 border-b border-black/[0.05] dark:border-white/[0.07] py-1">
              <dt class="text-slate-500 dark:text-slate-400 truncate">{{ row.label }}</dt>
              <dd class="tabular-nums text-slate-700 dark:text-slate-200">{{ money(row.amount, row.currency, locale) }}</dd>
            </div>
          </dl>

          <div v-if="card.links?.cardmarket || card.links?.tcgplayer" class="flex flex-wrap gap-3 pt-1">
            <a
              v-if="card.links.cardmarket"
              :href="card.links.cardmarket"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <Icon name="externalLink" :sw="2" class="w-3.5 h-3.5" /> CardMarket
            </a>
            <a
              v-if="card.links.tcgplayer"
              :href="card.links.tcgplayer"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <Icon name="externalLink" :sw="2" class="w-3.5 h-3.5" /> TCGplayer
            </a>
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {{ t('dex.card.information') }}
          </h3>
          <dl class="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">{{ t('dex.card.number') }}</dt>
              <dd class="tabular-nums text-slate-800 dark:text-slate-100">{{ cardNumber(card, detail?.set) }}</dd>
            </div>
            <div v-if="card.rarity" class="flex justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">{{ t('dex.card.rarity') }}</dt>
              <dd class="text-slate-800 dark:text-slate-100 truncate">{{ card.rarity }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">{{ t('dex.card.set') }}</dt>
              <dd class="truncate">
                <RouterLink :to="`/sets/${card.setId}`" class="text-indigo-600 dark:text-indigo-400 hover:underline" @click="emit('close')">
                  {{ card.setName }}
                </RouterLink>
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">{{ t('dex.card.series') }}</dt>
              <dd class="truncate">
                <RouterLink :to="`/series/${card.seriesId}`" class="text-indigo-600 dark:text-indigo-400 hover:underline" @click="emit('close')">
                  {{ card.seriesName }}
                </RouterLink>
              </dd>
            </div>
            <div v-if="card.supertype" class="flex justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">{{ t('dex.card.type') }}</dt>
              <dd class="text-slate-800 dark:text-slate-100 truncate">
                {{ [card.supertype, ...card.subtypes].join(' · ') }}
              </dd>
            </div>
            <div v-if="card.types?.length" class="flex justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">{{ t('dex.card.energy') }}</dt>
              <dd class="truncate">
                <span v-for="(ty, i) in card.types" :key="ty" :class="TYPE_TINT[ty] || 'text-slate-700 dark:text-slate-200'">
                  {{ ty }}<span v-if="i < card.types.length - 1" class="text-slate-400"> · </span>
                </span>
              </dd>
            </div>
            <div v-if="card.artist" class="flex justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">{{ t('dex.card.artist') }}</dt>
              <dd class="text-slate-800 dark:text-slate-100 truncate">{{ card.artist }}</dd>
            </div>
            <div v-if="card.language" class="flex justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">{{ t('dex.card.language') }}</dt>
              <dd class="text-slate-800 dark:text-slate-100 uppercase">{{ card.language }}</dd>
            </div>
            <div v-if="detail?.set?.releaseDate" class="flex justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">{{ t('dex.card.released') }}</dt>
              <dd class="text-slate-800 dark:text-slate-100">{{ longDate(detail.set.releaseDate, locale) }}</dd>
            </div>
            <div v-if="card.nationalPokedexNumbers?.length" class="flex justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">{{ t('dex.card.pokedex') }}</dt>
              <dd class="tabular-nums text-slate-800 dark:text-slate-100">#{{ card.nationalPokedexNumbers.join(', #') }}</dd>
            </div>
          </dl>

          <p v-if="card.flavorText" class="mt-1 text-sm italic text-slate-500 dark:text-slate-400 leading-relaxed">
            {{ card.flavorText }}
          </p>
        </section>

        <p v-if="error" class="text-xs text-red-500">{{ error.message }}</p>
      </div>
    </div>
  </TemplateModal>

  <TemplateModal
    :show="confirmRemove"
    :title="t('dex.card.removeTitle')"
    :message="t('dex.card.removeMessage', { name: card?.name })"
    :confirm-label="t('dex.card.remove')"
    :busy="busy"
    z="z-[210]"
    @confirm="doRemove"
    @cancel="confirmRemove = false"
  />
</template>
