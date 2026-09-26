<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { useRegistry } from '@core/useRegistry.js'
import TemplateModal from '@core/TemplateModal.vue'
import { Icon, Spinner } from '@core/icons'
import DexIcon from '@/components/DexIcon.vue'
import { createBinder, updateBinder, getCoverArtwork, uploadCover } from '@/api/dex.js'
import { useDexSettings } from '@/composables/useDexSettings.js'
import { BINDER_LAYOUTS } from '@/utils/constants.js'
import { binderPanels } from '@/utils/pluginIndicators.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  binder: { type: Object, default: null },
  initialTab: { type: String, default: 'details' },
})
const emit = defineEmits(['close', 'saved'])

const { t } = useI18n()
const { isPluginEnabled } = useRegistry()
const { settings } = useDexSettings()

const editing = computed(() => !!props.binder)

const form = ref({ name: '', layout: '3x3', cover: { kind: 'none', url: '', refId: '' } })
const busy = ref(false)
const error = ref('')
const uploading = ref(false)

const artwork = ref([])
const artworkQuery = ref('')
const artworkLoaded = ref(false)
const filteredArtwork = computed(() => {
  const q = artworkQuery.value.trim().toLowerCase()
  const rows = q
    ? artwork.value.filter((a) => `${a.name} ${a.seriesName}`.toLowerCase().includes(q))
    : artwork.value
  return rows.slice(0, 60)
})

const panels = computed(() => (editing.value ? binderPanels : []))

const TABS = computed(() => {
  const tabs = [
    { key: 'details', label: t('dex.binder.tabDetails') },
    { key: 'cover', label: t('dex.binder.tabCover') },
  ]
  if (panels.value.length) tabs.push({ key: 'sharing', label: t('dex.binder.tabSharing') })
  return tabs
})

// Bind with v-model:tab: TemplateModal lets a bound tab override its internal state.
const tab = ref('details')

watch(
  () => [props.show, props.binder],
  ([show]) => {
    if (!show) return
    error.value = ''
    artworkQuery.value = ''
    tab.value = TABS.value.some((x) => x.key === props.initialTab) ? props.initialTab : 'details'
    form.value = props.binder
      ? {
          name: props.binder.name,
          layout: props.binder.layout,
          cover: { ...(props.binder.cover ?? { kind: 'none', url: '', refId: '' }) },
        }
      : { name: '', layout: settings.defaultBinderLayout, cover: { kind: 'none', url: '', refId: '' } }
    ensureArtwork()
  },
  { immediate: true }
)

async function ensureArtwork() {
  if (artworkLoaded.value) return
  artworkLoaded.value = true
  try {
    artwork.value = (await getCoverArtwork()).sets ?? []
  } catch {
    artworkLoaded.value = false
  }
}

function pickSet(a) {
  form.value.cover = { kind: 'set', url: '', refId: a.setId }
}

function clearCover() {
  form.value.cover = { kind: 'none', url: '', refId: '' }
}

async function onFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  uploading.value = true
  error.value = ''
  try {
    const url = await uploadCover(file)
    form.value.cover = { kind: 'upload', url, refId: '' }
  } catch (err) {
    error.value = err.message
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}

const previewUrl = computed(() => {
  const c = form.value.cover
  if (c.kind === 'upload') return c.url
  if (c.kind === 'set') return artwork.value.find((a) => a.setId === c.refId)?.url || props.binder?.coverUrl || null
  return null
})

async function save() {
  const name = form.value.name.trim()
  if (!name) { error.value = t('dex.binder.nameRequired'); return }
  busy.value = true
  error.value = ''
  try {
    const payload = { name, layout: form.value.layout, cover: form.value.cover }
    const saved = editing.value
      ? await updateBinder(props.binder.id, payload)
      : await createBinder(payload)
    emit('saved', saved)
    emit('close')
  } catch (err) {
    error.value = err.message
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
    footer
    size="lg"
    :tabs="TABS"
    v-model:tab="tab"
    :title="editing ? t('dex.binder.editTitle') : t('dex.binder.newTitle')"
    :confirm-label="editing ? t('dex.binder.save') : t('dex.binder.create')"
    :busy="busy"
    @confirm="save"
    @cancel="emit('close')"
  >
    <template #default="{ activeTab }">
      <div v-show="activeTab === 'details'" class="flex flex-col gap-5 pt-3">
        <div class="flex flex-col gap-1.5">
          <label :class="LABEL" for="dex-binder-name">{{ t('dex.binder.name') }}</label>
          <input
            id="dex-binder-name"
            v-model="form.name"
            type="text"
            :placeholder="t('dex.binder.namePlaceholder')"
            :class="INPUT"
            @keyup.enter="save"
          />
        </div>

        <div class="flex flex-col gap-2">
          <span :class="LABEL">{{ t('dex.binder.layout') }}</span>
          <p class="text-xs text-slate-500 dark:text-slate-400 -mt-1">{{ t('dex.binder.layoutHint') }}</p>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="l in BINDER_LAYOUTS"
              :key="l.key"
              type="button"
              class="cursor-pointer rounded-xl border p-3 flex flex-col items-center gap-2.5 transition-colors"
              :class="form.layout === l.key
                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/15 dark:border-indigo-400/40'
                : 'border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/5'"
              @click="form.layout = l.key"
            >
              <span class="grid gap-1" :style="{ gridTemplateColumns: `repeat(${l.cols}, minmax(0, 1fr))` }">
                <span
                  v-for="n in l.perPage"
                  :key="n"
                  class="w-4 h-[22px] rounded-sm"
                  :class="form.layout === l.key ? 'bg-indigo-400/70' : 'bg-slate-300 dark:bg-white/20'"
                />
              </span>
              <span class="text-sm font-medium">{{ t(l.i18n) }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'cover'" class="flex flex-col gap-4 pt-3">
        <div class="flex items-center gap-4">
          <div class="shrink-0 w-24 h-20 rounded-xl bg-black/5 dark:bg-white/8 grid place-items-center overflow-hidden">
            <img v-if="previewUrl" :src="previewUrl" alt="" class="w-full h-full object-contain p-2" />
            <DexIcon v-else name="binder" class="w-7 h-7 text-slate-400" />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <label class="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 px-3 py-2 text-sm font-medium transition-colors">
              <Spinner v-if="uploading" class="w-4 h-4 animate-spin" />
              <Icon v-else name="upload" :sw="2" class="w-4 h-4" />
              {{ t('dex.binder.upload') }}
              <input type="file" accept="image/*" class="hidden" @change="onFile" />
            </label>
            <button
              v-if="form.cover.kind !== 'none'"
              type="button"
              class="cursor-pointer text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              @click="clearCover"
            >
              {{ t('dex.binder.clearCover') }}
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span :class="LABEL">{{ t('dex.binder.officialArtwork') }}</span>
          <div class="relative">
            <Icon name="search" :sw="2" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input v-model="artworkQuery" type="search" :placeholder="t('dex.binder.searchArtwork')" :class="[INPUT, 'pl-9']" />
          </div>

          <div v-if="!artworkLoaded && !artwork.length" class="py-8 grid place-items-center text-slate-400">
            <Spinner class="w-5 h-5 animate-spin" />
          </div>
          <div v-else-if="!filteredArtwork.length" class="py-8 text-center text-sm text-slate-400">
            {{ t('dex.binder.noArtwork') }}
          </div>
          <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
            <button
              v-for="a in filteredArtwork"
              :key="a.setId"
              type="button"
              class="cursor-pointer rounded-lg border p-2 h-16 grid place-items-center transition-colors"
              :class="form.cover.kind === 'set' && form.cover.refId === a.setId
                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/15'
                : 'border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/5'"
              :title="`${a.name} · ${a.seriesName}`"
              @click="pickSet(a)"
            >
              <img :src="a.url" :alt="a.name" loading="lazy" class="max-h-full max-w-full object-contain" />
            </button>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'sharing'" class="pt-3">
        <component
          v-for="p in panels"
          :key="p.pluginId"
          :is="p.component"
          v-show="isPluginEnabled(p.pluginId)"
          :binder="binder"
          @saved="emit('saved', $event)"
        />
      </div>

      <p v-if="error" class="mt-4 text-xs text-red-500">{{ error }}</p>
    </template>
  </TemplateModal>
</template>
