<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { useAuth } from '@core/auth/useAuth.js'
import { Icon, Spinner } from '@core/icons'
import DexIcon from '@/components/DexIcon.vue'
import { startCatalogSync } from '@/api/dex.js'

// "The card database hasn't been downloaded yet" — a fundamentally different
// empty state from "you don't own anything", and one only an admin can fix.
// Admins get the button; everyone else gets a plain explanation rather than an
// action they'd only be refused.
const props = defineProps({
  state: { type: Object, default: null },
})
const emit = defineEmits(['synced'])

const { t } = useI18n()
const { profile } = useAuth()

const isAdmin = computed(() => profile.value?.role === 'admin')
const running = computed(() => props.state?.status === 'running')
const failed = computed(() => props.state?.status === 'error')

const starting = ref(false)
const error = ref('')

async function sync() {
  if (starting.value) return
  starting.value = true
  error.value = ''
  try {
    await startCatalogSync(false)
    emit('synced')
  } catch (e) {
    error.value = e.message
  } finally {
    starting.value = false
  }
}
</script>

<template>
  <div class="py-20 flex flex-col items-center text-center gap-5">
    <div class="w-16 h-16 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 grid place-items-center">
      <DexIcon name="stack" class="w-8 h-8" />
    </div>

    <div class="max-w-md">
      <p class="text-lg font-semibold text-slate-900 dark:text-white">
        {{ running ? t('dex.sync.running') : t('dex.empty.title') }}
      </p>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
        {{ running
          ? t('dex.sync.runningHint', { processed: state?.processed ?? 0, total: state?.total ?? 0 })
          : isAdmin ? t('dex.empty.adminHint') : t('dex.empty.userHint') }}
      </p>
    </div>

    <div v-if="running" class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <Spinner class="w-4 h-4 animate-spin" />
      {{ t('dex.sync.cardsWritten', { count: state?.cardsWritten ?? 0 }) }}
    </div>

    <button
      v-else-if="isAdmin"
      class="nuc-press cursor-pointer inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
      :disabled="starting"
      @click="sync"
    >
      <Spinner v-if="starting" class="w-4 h-4 animate-spin" />
      <DexIcon v-else name="cloudDownload" class="w-4 h-4" />
      {{ t('dex.sync.start') }}
    </button>

    <p v-if="failed && state?.error" class="max-w-md text-xs text-red-500 inline-flex items-start gap-1.5">
      <Icon name="warningTriangle" :sw="2" class="w-4 h-4 shrink-0 mt-px" />
      {{ t('dex.sync.failed', { error: state.error }) }}
    </p>
    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
  </div>
</template>
