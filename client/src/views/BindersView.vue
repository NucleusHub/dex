<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { useSettingsModal } from '@core/useSettingsModal.js'
import BackgroundBlobs from '@core/BackgroundBlobs.vue'
import { Icon, Spinner } from '@core/icons'
import DexHeader from '@/components/DexHeader.vue'
import BinderCard from '@/components/BinderCard.vue'
import BinderFormModal from '@/components/BinderFormModal.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import DexIcon from '@/components/DexIcon.vue'
import { useBinders } from '@/composables/useBinders.js'

// The user's binders. A binder is an arrangement the user makes by hand, so
// this page is the one place in Dex that starts empty and stays empty until
// they do something — hence the prominent create action.
const { t } = useI18n()
const { binders, loading, error, load, reload, upsert } = useBinders()
const { open: settingsOpen, closeSettings } = useSettingsModal()

const showForm = ref(false)

// Ones you own vs ones shared with you. Only split the list when both exist —
// two headings over one group is noise.
const mine = computed(() => binders.value.filter((b) => b.role === 'owner'))
const sharedWithMe = computed(() => binders.value.filter((b) => b.role !== 'owner'))

onMounted(load)
</script>

<template>
  <div class="relative min-h-screen bg-slate-100 dark:bg-[#0d0d1a] text-slate-900 dark:text-white overflow-x-hidden">
    <BackgroundBlobs />
    <div class="relative z-10">
      <DexHeader>
        <template #subtitle>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {{ t('dex.binder.count', { count: binders.length }) }}
          </p>
        </template>
        <template #actions>
          <button
            class="group nuc-press cursor-pointer flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 sm:px-4 py-2 rounded-lg transition-colors"
            @click="showForm = true"
          >
            <Icon name="plus" :sw="2.5" class="w-4 h-4 nuc-pop" />
            <span class="hidden sm:inline">{{ t('dex.binder.new') }}</span>
          </button>
        </template>
      </DexHeader>

      <main class="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
        <div v-if="loading && !binders.length" class="py-24 grid place-items-center text-slate-400">
          <Spinner class="w-7 h-7 animate-spin" />
        </div>

        <div v-else-if="error" class="py-24 text-center">
          <p class="text-sm text-red-500">{{ t('dex.state.loadError') }}</p>
          <button class="cursor-pointer mt-3 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white underline" @click="reload">
            {{ t('dex.state.retry') }}
          </button>
        </div>

        <div v-else-if="!binders.length" class="py-24 flex flex-col items-center gap-4 text-center">
          <div class="w-16 h-16 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 grid place-items-center">
            <DexIcon name="binder" class="w-8 h-8" />
          </div>
          <div>
            <p class="text-lg font-semibold">{{ t('dex.binder.emptyTitle') }}</p>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{{ t('dex.binder.emptyHint') }}</p>
          </div>
          <button
            class="nuc-press cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            @click="showForm = true"
          >
            {{ t('dex.binder.new') }}
          </button>
        </div>

        <template v-else>
          <section v-if="mine.length" class="flex flex-col gap-3">
            <h2 v-if="sharedWithMe.length" class="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {{ t('dex.binder.mine') }}
            </h2>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 nuc-stagger" style="--nuc-step: 30ms">
              <BinderCard v-for="b in mine" :key="b.id" :binder="b" />
            </div>
          </section>

          <section v-if="sharedWithMe.length" class="flex flex-col gap-3">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {{ t('dex.binder.sharedWithMe') }}
            </h2>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 nuc-stagger" style="--nuc-step: 30ms">
              <BinderCard v-for="b in sharedWithMe" :key="b.id" :binder="b" />
            </div>
          </section>
        </template>
      </main>

      <BinderFormModal :show="showForm" @close="showForm = false" @saved="upsert" />
      <SettingsModal :show="settingsOpen" @close="closeSettings" />
    </div>
  </div>
</template>
