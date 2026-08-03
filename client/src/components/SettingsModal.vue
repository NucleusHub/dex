<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { useAuth } from '@core/auth/useAuth.js'
import TemplateModal from '@core/TemplateModal.vue'
import { Icon, Spinner } from '@core/icons'
import DexIcon from '@/components/DexIcon.vue'
import { useDexSettings } from '@/composables/useDexSettings.js'
import { useCatalog } from '@/composables/useCatalog.js'
import { getAdminCatalog, saveAdminCatalog, startCatalogSync } from '@/api/dex.js'
import { BINDER_LAYOUTS } from '@/utils/constants.js'
import { count, longDate } from '@/utils/format.js'

// Dex settings. Two tabs, and the second only exists for admins: personal
// display preferences, and the shared card database everybody browses.
const props = defineProps({
  show: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const { t, locale } = useI18n()
const { profile } = useAuth()
const { settings, update } = useDexSettings()
const { reload: reloadCatalog } = useCatalog()

const isAdmin = computed(() => profile.value?.role === 'admin')

const TABS = computed(() => {
  const tabs = [{ key: 'display', label: t('dex.settings.tabDisplay') }]
  if (isAdmin.value) tabs.push({ key: 'catalog', label: t('dex.settings.tabCatalog') })
  return tabs
})

// ── Catalog (admin) ──────────────────────────────────────────────────────────
const catalog = ref(null)
const apiKeyInput = ref('')
const savingKey = ref(false)
const starting = ref(false)
const error = ref('')
let poll = null

async function loadCatalog() {
  if (!isAdmin.value) return
  try {
    catalog.value = await getAdminCatalog()
    // Keep polling only while there's something to watch.
    if (catalog.value.running) startPolling()
    else stopPolling()
  } catch (e) {
    error.value = e.message
  }
}

function startPolling() {
  if (poll) return
  poll = setInterval(async () => {
    try {
      const next = await getAdminCatalog()
      catalog.value = next
      if (!next.running) {
        stopPolling()
        // The homepage's series list is stale the moment a sync finishes.
        reloadCatalog()
      }
    } catch {
      stopPolling()
    }
  }, 3000)
}

function stopPolling() {
  clearInterval(poll)
  poll = null
}

async function saveKey() {
  savingKey.value = true
  error.value = ''
  try {
    await saveAdminCatalog({ apiKey: apiKeyInput.value })
    apiKeyInput.value = ''
    await loadCatalog()
  } catch (e) {
    error.value = e.message
  } finally {
    savingKey.value = false
  }
}

async function sync(force) {
  starting.value = true
  error.value = ''
  try {
    await startCatalogSync(force)
    await loadCatalog()
    startPolling()
  } catch (e) {
    error.value = e.message
  } finally {
    starting.value = false
  }
}

const syncPct = computed(() => {
  const c = catalog.value
  if (!c?.total) return 0
  return Math.min(100, Math.round((c.processed / c.total) * 100))
})

watch(
  () => props.show,
  (show) => {
    if (show) { error.value = ''; loadCatalog() }
    else stopPolling()
  }
)

onBeforeUnmount(stopPolling)

const LABEL = 'text-sm font-medium text-slate-800 dark:text-slate-100'
const HINT = 'text-xs text-slate-500 dark:text-slate-400 mt-0.5'
const INPUT =
  'w-full rounded-lg bg-black/5 dark:bg-white/8 border border-transparent px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500/50 transition-colors'
</script>

<template>
  <TemplateModal
    :show="show"
    header
    size="lg"
    :tabs="TABS"
    :title="t('dex.settings.title')"
    @cancel="emit('close')"
  >
    <template #default="{ activeTab }">
      <!-- ── Display ─────────────────────────────────────────────────────── -->
      <div v-show="activeTab === 'display'" class="flex flex-col divide-y divide-black/[0.06] dark:divide-white/[0.08]">
        <label class="flex items-center justify-between gap-6 py-4 cursor-pointer">
          <span class="min-w-0">
            <span :class="LABEL">{{ t('dex.settings.showUnowned') }}</span>
            <span :class="HINT" class="block">{{ t('dex.settings.showUnownedHint') }}</span>
          </span>
          <input
            type="checkbox"
            class="shrink-0 w-9 h-5 appearance-none rounded-full bg-slate-300 dark:bg-white/20 checked:bg-indigo-600 relative cursor-pointer transition-colors before:absolute before:top-0.5 before:left-0.5 before:w-4 before:h-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4"
            :checked="settings.showUnowned"
            @change="update({ showUnowned: $event.target.checked })"
          />
        </label>

        <label class="flex items-center justify-between gap-6 py-4 cursor-pointer">
          <span class="min-w-0">
            <span :class="LABEL">{{ t('dex.settings.showPrices') }}</span>
            <span :class="HINT" class="block">{{ t('dex.settings.showPricesHint') }}</span>
          </span>
          <input
            type="checkbox"
            class="shrink-0 w-9 h-5 appearance-none rounded-full bg-slate-300 dark:bg-white/20 checked:bg-indigo-600 relative cursor-pointer transition-colors before:absolute before:top-0.5 before:left-0.5 before:w-4 before:h-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4"
            :checked="settings.showPricesInGrid"
            @change="update({ showPricesInGrid: $event.target.checked })"
          />
        </label>

        <div class="flex items-center justify-between gap-6 py-4">
          <span class="min-w-0">
            <span :class="LABEL">{{ t('dex.settings.priceSource') }}</span>
            <span :class="HINT" class="block">{{ t('dex.settings.priceSourceHint') }}</span>
          </span>
          <select
            class="shrink-0 rounded-lg bg-black/5 dark:bg-white/8 border border-transparent px-3 py-1.5 text-sm cursor-pointer focus:outline-none focus:border-indigo-500/50"
            :value="settings.preferredPriceSource"
            @change="update({ preferredPriceSource: $event.target.value })"
          >
            <option value="cardmarket">CardMarket (EUR)</option>
            <option value="tcgplayer">TCGplayer (USD)</option>
          </select>
        </div>

        <div class="flex items-center justify-between gap-6 py-4">
          <span class="min-w-0">
            <span :class="LABEL">{{ t('dex.settings.defaultLayout') }}</span>
            <span :class="HINT" class="block">{{ t('dex.settings.defaultLayoutHint') }}</span>
          </span>
          <select
            class="shrink-0 rounded-lg bg-black/5 dark:bg-white/8 border border-transparent px-3 py-1.5 text-sm cursor-pointer focus:outline-none focus:border-indigo-500/50"
            :value="settings.defaultBinderLayout"
            @change="update({ defaultBinderLayout: $event.target.value })"
          >
            <option v-for="l in BINDER_LAYOUTS" :key="l.key" :value="l.key">{{ t(l.i18n) }}</option>
          </select>
        </div>
      </div>

      <!-- ── Catalog (admin only) ────────────────────────────────────────── -->
      <div v-if="isAdmin" v-show="activeTab === 'catalog'" class="flex flex-col gap-5 pt-3">
        <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          {{ t('dex.settings.catalogIntro') }}
        </p>

        <!-- Current size -->
        <div class="grid grid-cols-3 gap-3">
          <div v-for="k in ['series', 'sets', 'cards']" :key="k" class="glass rounded-xl p-3 text-center">
            <p class="text-xl font-semibold tabular-nums">{{ count(catalog?.counts?.[k] ?? 0, locale) }}</p>
            <p class="text-[11px] uppercase tracking-wide text-slate-400">{{ t(`dex.settings.count.${k}`) }}</p>
          </div>
        </div>

        <!-- Progress / status -->
        <div v-if="catalog?.running" class="glass rounded-xl p-4 flex flex-col gap-2.5">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="inline-flex items-center gap-2 font-medium">
              <Spinner class="w-4 h-4 animate-spin" />
              {{ t(`dex.settings.phase.${catalog.phase || 'sets'}`) }}
            </span>
            <span class="text-slate-500 tabular-nums">{{ catalog.processed }} / {{ catalog.total }}</span>
          </div>
          <div class="h-1.5 rounded-full bg-black/[0.08] dark:bg-white/10 overflow-hidden">
            <div class="h-full rounded-full bg-indigo-500 transition-[width] duration-500" :style="{ width: `${syncPct}%` }" />
          </div>
          <p class="text-xs text-slate-500">{{ t('dex.sync.cardsWritten', { count: catalog.cardsWritten ?? 0 }) }}</p>
        </div>

        <div v-else-if="catalog?.status === 'error'" class="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
          <Icon name="warningTriangle" :sw="2" class="w-4 h-4 shrink-0 mt-px" />
          <span>
            {{ t('dex.sync.failed', { error: catalog.error }) }}
            <span v-if="catalog.cursorSetId" class="block mt-1 opacity-80">{{ t('dex.sync.willResume') }}</span>
          </span>
        </div>

        <p v-else-if="catalog?.lastSyncAt" class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('dex.sync.lastSync', { date: longDate(catalog.lastSyncAt, locale) }) }}
        </p>

        <!-- Actions -->
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="nuc-press cursor-pointer inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
            :disabled="starting || catalog?.running"
            @click="sync(false)"
          >
            <DexIcon name="cloudDownload" class="w-4 h-4" />
            {{ t('dex.sync.start') }}
          </button>
          <button
            class="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
            :disabled="starting || catalog?.running"
            :title="t('dex.sync.fullHint')"
            @click="sync(true)"
          >
            <Icon name="refresh" :sw="2" class="w-4 h-4" />
            {{ t('dex.sync.full') }}
          </button>
        </div>

        <!-- API key -->
        <div class="flex flex-col gap-1.5 pt-1">
          <span :class="LABEL">{{ t('dex.settings.apiKey') }}</span>
          <p :class="HINT">{{ t('dex.settings.apiKeyHint') }}</p>
          <div class="flex gap-2 mt-1">
            <input
              v-model="apiKeyInput"
              type="password"
              autocomplete="off"
              :placeholder="catalog?.hasApiKey ? t('dex.settings.apiKeySet') : t('dex.settings.apiKeyEmpty')"
              :class="INPUT"
            />
            <button
              class="cursor-pointer shrink-0 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
              :disabled="savingKey"
              @click="saveKey"
            >
              <Spinner v-if="savingKey" class="w-4 h-4 animate-spin" />
              <span v-else>{{ t('dex.settings.apiKeySave') }}</span>
            </button>
          </div>
        </div>

        <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
      </div>
    </template>
  </TemplateModal>
</template>
