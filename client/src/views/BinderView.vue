<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@core/useI18n.js'
import { useRegistry } from '@core/useRegistry.js'
import { useSettingsModal } from '@core/useSettingsModal.js'
import BackgroundBlobs from '@core/BackgroundBlobs.vue'
import TemplateModal from '@core/TemplateModal.vue'
import { Icon, Spinner } from '@core/icons'
import TrashIcon from '@core/TrashIcon.vue'
import DexHeader from '@/components/DexHeader.vue'
import BinderBook from '@/components/BinderBook.vue'
import BinderFormModal from '@/components/BinderFormModal.vue'
import CardPickerModal from '@/components/CardPickerModal.vue'
import CardDetailModal from '@/components/CardDetailModal.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import { getBinder, setBinderSlot, updateBinder, deleteBinder } from '@/api/dex.js'
import { binderPanels } from '@/utils/pluginIndicators.js'
import { useBinders } from '@/composables/useBinders.js'
import { primeCards } from '@/composables/useCollection.js'
import { useCardOverlay } from '@/composables/useCardOverlay.js'

// A binder, read the way you'd actually go through a physical one: an open
// spread of two pages on a wide screen, one page below `md`. No infinite
// scroll — you turn to page 4, you're on page 4, and the URL says so.
//
// The spread and its 3-D page turn live in BinderBook.vue; this view owns the
// data, the pocket edits and which page is open.
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { isPluginEnabled } = useRegistry()
const { upsert, remove: removeFromList } = useBinders()

// Sharing is plugin-owned, so the Share button only exists when a plugin is
// actually there to answer it — same gate the settings dialog's tab uses.
const canShare = computed(() => binderPanels.some((p) => isPluginEnabled(p.pluginId)))
const { open: settingsOpen, closeSettings } = useSettingsModal()
const { cardId, showCard, openCard, closeCard } = useCardOverlay()

// Every filled pocket in the binder, in position order — so ← / → in the card
// overlay walks the whole book rather than stopping at a page boundary.
const binderCardIds = computed(() => pages.value.flat().filter((s) => s.card).map((s) => s.card.cardId))

// Stepping onto a card that lives on another page turns the binder to it, so
// closing the overlay leaves you looking at the page you ended on. Page and
// card move in ONE router.replace — two would race and one would win.
function onCardNavigate(nextId) {
  const idx = pages.value.findIndex((p) => p.some((s) => s.card?.cardId === nextId))
  const query = { ...route.query, card: nextId }
  if (idx >= 0 && idx !== pageIndex.value) {
    direction.value = idx > pageIndex.value ? 1 : -1
    query.page = idx + 1
  }
  router.replace({ query })
}

const binder = ref(null)
const pages = ref([])
const loading = ref(false)
const error = ref(null)
const busy = ref(false)

const showEdit = ref(false)
// Which tab the settings dialog opens on — the pencil wants Details, the Share
// button wants Sharing. One dialog, two doors into it.
const editTab = ref('details')
function openSettings(tab = 'details') {
  editTab.value = tab
  showEdit.value = true
}
const showPicker = ref(false)
const confirmDelete = ref(false)
const pickerPosition = ref(null)

// The current page lives in the URL (`?page=2`, 1-based) so a page is linkable
// and Back walks the pages you turned.
const pageIndex = computed(() => {
  const n = Number(route.query.page)
  const max = pages.value.length
  if (!Number.isInteger(n) || n < 1) return 0
  return Math.min(n - 1, Math.max(0, max - 1))
})

// -1 turning back, +1 turning forward. Only used for cross-page card
// navigation now; the book component owns its own flip direction.
const direction = ref(1)

// The book animates the turn and then tells us where it landed, so the URL
// follows the animation rather than fighting it.
function goTo(index) {
  const clamped = Math.max(0, Math.min(index, pages.value.length - 1))
  if (clamped === pageIndex.value) return
  direction.value = clamped > pageIndex.value ? 1 : -1
  router.replace({ query: { ...route.query, page: clamped + 1 } })
}

// Paging is delegated to the book: on a wide screen it steps a whole spread
// (two pages), below `md` a single page.
const book = ref(null)
const canPrev = computed(() => book.value?.canPrev ?? pageIndex.value > 0)
const canNext = computed(() => book.value?.canNext ?? pageIndex.value < pages.value.length - 1)
const turn = (dir) => book.value?.turn(dir)

const editable = computed(() => !!binder.value?.canEditCards)

// Mirrors the book's own breakpoint so the pager label matches what's on screen.
const isWideNow = ref(true)
let mq = null
function syncWide(e) { isWideNow.value = e.matches }

// "Pages 3–4 of 12" on a spread, "Page 3 of 12" on a single page.
const spreadLabel = computed(() => {
  const total = pages.value.length
  if (!isWideNow.value) return t('dex.binder.pageOf', { page: pageIndex.value + 1, total })
  const left = Math.floor(pageIndex.value / 2) * 2
  const right = left + 1
  if (right >= total) return t('dex.binder.pageOf', { page: left + 1, total })
  return t('dex.binder.pagesOf', { from: left + 1, to: right + 1, total })
})

async function load(id) {
  if (!id) return
  loading.value = true
  error.value = null
  try {
    const data = await getBinder(id)
    binder.value = data.binder
    pages.value = data.pages
    upsert(data.binder)
    // Pocket cards carry the viewer's own ownership — prime it so an owned card
    // renders lit, and one they don't have reads as un-owned.
    //
    // A binder slot is `{ position, card, owned }`: ownership sits BESIDE the
    // card, not on it. Mapping to `s.card` (which has no `.owned`) silently
    // primed nothing, so every card in every binder rendered greyed-out until
    // its detail view was opened. Reshape to what primeCards actually reads.
    primeCards(
      data.pages
        .flat()
        .filter((s) => s.card)
        .map((s) => ({ cardId: s.card.cardId, owned: s.owned }))
    )
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

// ── Pocket edits ─────────────────────────────────────────────────────────────
// Applied optimistically to the local page, then confirmed. On failure the whole
// binder is reloaded rather than guessed at — a shared binder may have moved
// under us, and the server's copy is the one that's true.

async function applySlot(position, card) {
  const page = Math.floor(position / (binder.value?.slotsPerPage ?? 9))
  const slot = pages.value[page]?.find((s) => s.position === position)
  if (!slot) return
  const previous = slot.card
  slot.card = card
  busy.value = true
  try {
    const updated = await setBinderSlot(binder.value.id, position, card?.cardId ?? null)
    binder.value = { ...binder.value, ...updated }
    upsert(binder.value)
  } catch (e) {
    slot.card = previous
    error.value = e
    await load(binder.value.id)
  } finally {
    busy.value = false
  }
}

function openPicker(position) {
  pickerPosition.value = position
  showPicker.value = true
}

function onPick(card) {
  showPicker.value = false
  if (pickerPosition.value != null) applySlot(pickerPosition.value, card)
  pickerPosition.value = null
}

// Add a page and turn to it — the binder grows the way a real one does, by
// putting another sheet in when you run out.
async function addPage() {
  if (!binder.value || busy.value) return
  busy.value = true
  try {
    const updated = await updateBinder(binder.value.id, { pageCount: pages.value.length + 1 })
    binder.value = { ...binder.value, ...updated }
    upsert(binder.value)
    const perPage = binder.value.slotsPerPage ?? 9
    pages.value = [
      ...pages.value,
      Array.from({ length: perPage }, (_, i) => ({ position: pages.value.length * perPage + i, card: null, owned: null })),
    ]
    goTo(pages.value.length - 1)
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}

async function doDelete() {
  if (!binder.value || busy.value) return
  busy.value = true
  try {
    await deleteBinder(binder.value.id)
    removeFromList(binder.value.id)
    router.replace('/binders')
  } catch (e) {
    error.value = e
    busy.value = false
  }
}

// Changing the layout re-flows the pockets, so reload rather than re-paginate
// locally — the server already owns that arithmetic.
async function onSaved(updated) {
  binder.value = { ...binder.value, ...updated }
  upsert(binder.value)
  await load(binder.value.id)
}

// Arrow keys turn pages, as long as focus isn't in a field and no dialog is up.
function onKeydown(e) {
  if (showEdit.value || showPicker.value || showCard.value || confirmDelete.value) return
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if (e.key === 'ArrowLeft') turn(-1)
  if (e.key === 'ArrowRight') turn(1)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  mq = window.matchMedia('(min-width: 768px)')
  isWideNow.value = mq.matches
  mq.addEventListener('change', syncWide)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  mq?.removeEventListener('change', syncWide)
})

watch(() => route.params.id, (id) => load(String(id)), { immediate: true })
</script>

<template>
  <div class="relative min-h-screen bg-slate-100 dark:bg-[#0d0d1a] text-slate-900 dark:text-white overflow-x-hidden">
    <BackgroundBlobs />
    <div class="relative z-10">
      <DexHeader :show-tabs="false">
        <template #subtitle>
          <RouterLink
            to="/binders"
            class="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <Icon name="chevronLeft" :sw="2.5" class="w-3.5 h-3.5" />
            {{ t('dex.nav.binders') }}
          </RouterLink>
        </template>
        <template #actions>
          <button
            v-if="binder?.canEditBinder"
            class="cursor-pointer p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            :title="t('dex.binder.edit')"
            @click="openSettings()"
          >
            <Icon name="pencil" :sw="2" class="w-4 h-4" />
          </button>
        </template>
      </DexHeader>

      <!-- Wider than the other views: an open spread is two pages of pockets. -->
      <main class="max-w-[88rem] mx-auto px-4 py-6 flex flex-col gap-5">
        <div v-if="loading && !binder" class="py-24 grid place-items-center text-slate-400">
          <Spinner class="w-7 h-7 animate-spin" />
        </div>

        <div v-else-if="error && !binder" class="py-24 text-center">
          <p class="text-sm text-red-500">{{ t('dex.binder.notFound') }}</p>
          <RouterLink to="/binders" class="mt-3 inline-block text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
            {{ t('dex.nav.binders') }}
          </RouterLink>
        </div>

        <template v-else-if="binder">
          <!-- Binder header -->
          <section class="glass rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-4 min-w-0">
              <div class="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-black/5 dark:bg-white/8 grid place-items-center">
                <img v-if="binder.coverUrl" :src="binder.coverUrl" alt="" class="w-full h-full object-contain p-1.5" />
                <Icon v-else name="folderSimple" :sw="1.75" class="w-6 h-6 text-slate-400" />
              </div>
              <div class="min-w-0">
                <h1 class="text-lg font-semibold truncate">{{ binder.name }}</h1>
                <p class="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {{ t('dex.binder.cardCount', { count: binder.cardCount }) }}
                  · {{ binder.layout }}
                  <template v-if="!editable"> · {{ t(`dex.binder.role.${binder.role}`) }}</template>
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button
                v-if="binder.canEditBinder"
                class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
                :disabled="busy"
                @click="addPage"
              >
                <Icon name="plus" :sw="2.5" class="w-4 h-4" />
                {{ t('dex.binder.addPage') }}
              </button>
              <!-- Sharing used to be reachable only through the pencil, which
                   reads as "rename and re-cover" — nobody found it there. -->
              <button
                v-if="binder.canEditBinder && canShare"
                class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 px-3 py-2 text-sm font-medium transition-colors"
                :title="t('dex.binder.share')"
                @click="openSettings('sharing')"
              >
                <Icon name="users" :sw="2" class="w-4 h-4" />
                {{ t('dex.binder.share') }}
              </button>
              <button
                v-if="binder.canEditBinder"
                class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                @click="confirmDelete = true"
              >
                <TrashIcon class="w-4 h-4" />
                <span class="hidden sm:inline">{{ t('dex.binder.delete') }}</span>
              </button>
            </div>
          </section>

          <!-- The open binder -->
          <section class="glass rounded-3xl p-4 sm:p-6">
            <BinderBook
              ref="book"
              :pages="pages"
              :layout="binder.layout"
              :editable="editable"
              :binder-id="binder.shared ? binder.id : ''"
              :page-index="pageIndex"
              @open="openCard"
              @fill="openPicker"
              @clear="applySlot($event, null)"
              @turn="goTo"
            />
          </section>

          <!-- Pager -->
          <nav class="flex items-center justify-center gap-4">
            <button
              class="cursor-pointer grid place-items-center w-10 h-10 rounded-full glass transition-opacity disabled:opacity-30 disabled:cursor-default hover:shadow-lg"
              :disabled="!canPrev"
              :aria-label="t('dex.binder.prevPage')"
              @click="turn(-1)"
            >
              <Icon name="chevronLeft" :sw="2" class="w-5 h-5" />
            </button>

            <span class="text-sm text-slate-500 dark:text-slate-400 tabular-nums select-none">
              {{ spreadLabel }}
            </span>

            <button
              class="cursor-pointer grid place-items-center w-10 h-10 rounded-full glass transition-opacity disabled:opacity-30 disabled:cursor-default hover:shadow-lg"
              :disabled="!canNext"
              :aria-label="t('dex.binder.nextPage')"
              @click="turn(1)"
            >
              <Icon name="chevronRight" :sw="2" class="w-5 h-5" />
            </button>
          </nav>

          <p v-if="error" class="text-center text-xs text-red-500">{{ error.message }}</p>
        </template>
      </main>

      <BinderFormModal :show="showEdit" :binder="binder" :initial-tab="editTab" @close="showEdit = false" @saved="onSaved" />
      <CardPickerModal :show="showPicker" @close="showPicker = false" @pick="onPick" />
      <CardDetailModal
        :show="showCard"
        :card-id="cardId"
        :siblings="binderCardIds"
        @close="closeCard"
        @navigate="onCardNavigate"
      />
      <SettingsModal :show="settingsOpen" @close="closeSettings" />

      <TemplateModal
        :show="confirmDelete"
        :title="t('dex.binder.deleteTitle')"
        :message="t('dex.binder.deleteMessage', { name: binder?.name })"
        :confirm-label="t('dex.binder.delete')"
        :busy="busy"
        @confirm="doDelete"
        @cancel="confirmDelete = false"
      />
    </div>
  </div>
</template>

<!-- The page turn itself lives in BinderBook.vue, which owns the spread and the
     3-D leaf. This view only decides which page is open. -->
