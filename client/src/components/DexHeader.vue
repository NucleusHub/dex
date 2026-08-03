<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from '@core/useI18n.js'
import { useSettingsModal } from '@core/useSettingsModal.js'
import AppHeader from '@core/AppHeader.vue'
import AppSidebar from '@core/AppSidebar.vue'
import AppTabs from '@core/AppTabs.vue'
import { Icon } from '@core/icons'
import { DEX_ICONS } from '@/utils/icons.js'

// The app shell: the Nucleus header bar, the cross-app sidebar, top-level nav
// and the always-present catalog search. Every view renders through it so the
// chrome is identical everywhere and no view re-implements the search box.
//
// Views fill #subtitle (a breadcrumb / context line) and #actions (their own
// buttons) rather than building their own header.
defineProps({
  // Hide the top-level tabs on views that are already a level deep and want the
  // breadcrumb to carry navigation instead.
  showTabs: { type: Boolean, default: true },
})

const { t } = useI18n()
const { openSettings } = useSettingsModal()
const router = useRouter()
const route = useRoute()

const sidebarOpen = ref(false)

// Top-level nav in the shared underline tab bar. Select mode rather than
// router mode: RouterLink's active-class is a prefix match, so a tab pointing at
// '/' would light up on every route. Deriving the active key from the route
// section instead also lets a set page keep "Series" lit while three levels deep.
const TABS = [
  { key: 'series', label: t('dex.nav.series'), icon: DEX_ICONS.stack },
  { key: 'binders', label: t('dex.nav.binders'), icon: DEX_ICONS.binder },
]
const TAB_ROUTE = { series: '/', binders: '/binders' }

const activeTab = computed(() =>
  route.path.startsWith('/binders') ? 'binders' : 'series'
)

function selectTab(key) {
  if (key !== activeTab.value) router.push(TAB_ROUTE[key])
}

// ── Search ───────────────────────────────────────────────────────────────────
// Typing anywhere in the app searches the whole catalog. The box owns the `q`
// query param on /search, so the URL stays the source of truth (shareable,
// reloadable) while the input stays responsive.
const query = ref(String(route.query.q ?? ''))
let timer = null

// Keep the box in step when the route changes underneath it (Back, a link, or
// leaving /search entirely — which clears it).
watch(
  () => [route.name, route.query.q],
  ([name, q]) => {
    const next = name === 'search' ? String(q ?? '') : ''
    if (next !== query.value) query.value = next
  }
)

function onInput() {
  clearTimeout(timer)
  // Long enough that a fast typist makes one request, short enough to feel live.
  timer = setTimeout(() => {
    const q = query.value.trim()
    if (!q) {
      // Emptying the box on /search goes back where you came from rather than
      // stranding the user on an empty results page.
      if (route.name === 'search') router.replace({ name: 'search', query: {} })
      return
    }
    const to = { name: 'search', query: { ...route.query, q } }
    // Replace while already searching so Back doesn't step through every
    // keystroke; push the first time so Back leaves search entirely.
    if (route.name === 'search') router.replace(to)
    else router.push(to)
  }, 220)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <AppHeader>
    <template #left>
      <button
        @click="sidebarOpen = !sidebarOpen"
        class="cursor-pointer flex flex-col justify-center gap-[5px] p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        :title="t('dex.header.menu')"
      >
        <span class="block w-5 h-0.5 rounded-full bg-current transition-all duration-200" :class="sidebarOpen ? 'rotate-45 translate-y-[7px]' : ''" />
        <span class="block w-5 h-0.5 rounded-full bg-current transition-all duration-200" :class="sidebarOpen ? 'opacity-0 scale-x-0' : ''" />
        <span class="block w-5 h-0.5 rounded-full bg-current transition-all duration-200" :class="sidebarOpen ? '-rotate-45 -translate-y-[7px]' : ''" />
      </button>
      <div class="hidden sm:block min-w-0">
        <slot name="subtitle" />
      </div>
    </template>

    <AppTabs
      v-if="showTabs"
      :tabs="TABS"
      :model-value="activeTab"
      class="hidden md:flex"
      @update:model-value="selectTab"
    />

    <template #right>
      <div class="relative">
        <Icon name="search" :sw="2" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
        <input
          v-model="query"
          @input="onInput"
          type="search"
          :placeholder="t('dex.header.search')"
          autocomplete="off"
          class="w-32 sm:w-56 pl-9 pr-3 py-1.5 text-sm bg-black/5 dark:bg-white/8 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg border border-transparent focus:border-indigo-500/50 focus:outline-none focus:bg-white dark:focus:bg-white/12 transition-all duration-200"
        />
      </div>

      <slot name="actions" />

      <button
        @click="openSettings"
        :title="t('dex.header.settings')"
        class="group cursor-pointer p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
      >
        <Icon name="cog" :sw="2" class="w-4 h-4 nuc-cog" />
      </button>
    </template>
  </AppHeader>

  <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
</template>
