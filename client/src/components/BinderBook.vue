<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import BinderPage from '@/components/BinderPage.vue'

const props = defineProps({
  pages: { type: Array, required: true },
  layout: { type: String, default: '3x3' },
  editable: { type: Boolean, default: false },
  binderId: { type: String, default: '' },
  pageIndex: { type: Number, default: 0 },
})
const emit = defineEmits(['open', 'fill', 'clear', 'turn'])

const FLIP_MS = 620

const isWide = ref(true)
let mq = null
function syncWide(e) { isWide.value = e.matches }
onMounted(() => {
  mq = window.matchMedia('(min-width: 768px)')
  isWide.value = mq.matches
  mq.addEventListener('change', syncWide)
})
onBeforeUnmount(() => mq?.removeEventListener('change', syncWide))

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const prefetched = new Set()
function prefetchPage(i) {
  const page = props.pages[i]
  if (!page) return
  for (const slot of page) {
    const url = slot.card?.images?.small
    if (!url || prefetched.has(url)) continue
    prefetched.add(url)
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }
}

function warmNeighbours() {
  const s = spread.value
  for (const i of [s * 2, s * 2 + 1, s * 2 + 2, s * 2 + 3, s * 2 - 2, s * 2 - 1]) {
    if (i >= 0) prefetchPage(i)
  }
}

const spread = computed(() => Math.floor(props.pageIndex / 2))
const leftIdx = computed(() => spread.value * 2)
const rightIdx = computed(() => spread.value * 2 + 1)

const pageAt = (i) => props.pages[i] ?? null

const staticLeft = computed(() => (flipping.value === 'back' ? pageAt(destLeft.value) : pageAt(leftIdx.value)))
const staticRight = computed(() => (flipping.value === 'fwd' ? pageAt(destRight.value) : pageAt(rightIdx.value)))

const flipping = ref(null)
const destSpread = ref(0)
const destLeft = computed(() => destSpread.value * 2)
const destRight = computed(() => destSpread.value * 2 + 1)

const frontFace = computed(() =>
  flipping.value === 'fwd' ? pageAt(rightIdx.value) : pageAt(leftIdx.value)
)
const backFace = computed(() =>
  flipping.value === 'fwd' ? pageAt(destLeft.value) : pageAt(destRight.value)
)

let timer = null

const MAX_SEE_THROUGH = 5

function ghostsFor(pageIdx) {
  const page = pageAt(pageIdx)
  if (!page) return []
  const cols = props.layout === '2x2' ? 2 : 3
  const mirror = (i) => {
    const row = Math.floor(i / cols)
    return row * cols + (cols - 1 - (i % cols))
  }
  const dir = pageIdx % 2 === 0 ? -1 : 1

  return page.map((_, i) => {
    for (let d = 1; d <= MAX_SEE_THROUGH; d++) {
      const target = pageAt(pageIdx + dir * d)
      if (!target) return null
      const card = target[d % 2 === 1 ? mirror(i) : i]?.card
      if (card) return { card, depth: d }
    }
    return null
  })
}

const leftGhosts = computed(() =>
  ghostsFor(flipping.value === 'back' ? destLeft.value : leftIdx.value)
)
const rightGhosts = computed(() =>
  ghostsFor(flipping.value === 'fwd' ? destRight.value : rightIdx.value)
)
const frontGhosts = computed(() => (flipping.value ? ghostsFor(flipping.value === 'fwd' ? rightIdx.value : leftIdx.value) : []))
const backGhosts = computed(() => (flipping.value ? ghostsFor(flipping.value === 'fwd' ? destLeft.value : destRight.value) : []))

const totalSpreads = computed(() => Math.max(1, Math.ceil(props.pages.length / 2)))
const leftStack = computed(() => Math.min(3, spread.value))
const rightStack = computed(() => Math.min(3, totalSpreads.value - spread.value - 1))

const canPrev = computed(() => (isWide.value ? spread.value > 0 : props.pageIndex > 0))
const canNext = computed(() =>
  isWide.value ? (spread.value + 1) * 2 < props.pages.length : props.pageIndex < props.pages.length - 1
)

function turn(dir) {
  if (flipping.value) return
  if (dir > 0 ? !canNext.value : !canPrev.value) return

  if (!isWide.value || reduceMotion()) {
    emit('turn', clampPage(props.pageIndex + (isWide.value ? dir * 2 : dir)))
    return
  }

  destSpread.value = spread.value + dir
  flipping.value = dir > 0 ? 'fwd' : 'back'
  clearTimeout(timer)

  // Don't clear `flipping` here: router.replace is async and the old spread would flash back.
  timer = setTimeout(() => {
    emit('turn', clampPage(destSpread.value * 2))
    clearTimeout(timer)
    timer = setTimeout(() => { flipping.value = null }, 400)
  }, FLIP_MS)
}

watch(spread, (s) => {
  if (flipping.value && s === destSpread.value) {
    clearTimeout(timer)
    flipping.value = null
  }
})

function clampPage(i) {
  return Math.max(0, Math.min(i, props.pages.length - 1))
}

watch(() => [props.pages.length, props.layout], () => {
  clearTimeout(timer)
  flipping.value = null
  prefetched.clear()
  warmNeighbours()
})

watch(spread, warmNeighbours, { immediate: true })
watch(() => props.pages, warmNeighbours, { immediate: true, deep: false })
onBeforeUnmount(() => clearTimeout(timer))

defineExpose({ turn, canPrev, canNext })
</script>

<template>
  <div class="binder-book" :class="{ 'is-flipping': !!flipping }">
    <div v-if="isWide" class="spread">
      <span
        v-for="n in leftStack"
        :key="'sl' + n"
        class="stack-sheet l"
        :style="{ '--i': n }"
        aria-hidden="true"
      />
      <span
        v-for="n in rightStack"
        :key="'sr' + n"
        class="stack-sheet r"
        :style="{ '--i': n }"
        aria-hidden="true"
      />

      <div class="half" :class="{ 'page-surface': !!staticLeft }">
        <BinderPage
          v-if="staticLeft"
          :slots="staticLeft"
          :ghosts="leftGhosts"
          :layout="layout"
          :editable="editable"
          :binder-id="binderId"
          @open="emit('open', $event)"
          @fill="emit('fill', $event)"
          @clear="emit('clear', $event)"
        />
      </div>

      <div class="gutter" aria-hidden="true" />

      <div class="half" :class="{ 'page-surface': !!staticRight }">
        <BinderPage
          v-if="staticRight"
          :slots="staticRight"
          :ghosts="rightGhosts"
          :layout="layout"
          :editable="editable"
          :binder-id="binderId"
          @open="emit('open', $event)"
          @fill="emit('fill', $event)"
          @clear="emit('clear', $event)"
        />
      </div>

      <div v-if="flipping" class="leaf" :class="flipping" aria-hidden="true">
        <div class="face front page-surface">
          <BinderPage v-if="frontFace" :slots="frontFace" :ghosts="frontGhosts" :layout="layout" :editable="editable" :binder-id="binderId" eager />
        </div>
        <div class="face back page-surface">
          <BinderPage v-if="backFace" :slots="backFace" :ghosts="backGhosts" :layout="layout" :editable="editable" :binder-id="binderId" eager />
        </div>
        <div class="leaf-shade" />
      </div>
    </div>

    <div v-else class="single">
      <Transition :name="'pg'" mode="out-in">
        <BinderPage
          :key="pageIndex"
          :slots="pages[pageIndex] ?? []"
          :layout="layout"
          :editable="editable"
          :binder-id="binderId"
          @open="emit('open', $event)"
          @fill="emit('fill', $event)"
          @clear="emit('clear', $event)"
        />
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.binder-book {
  perspective: 2600px;
  perspective-origin: 50% 50%;
}

.spread {
  --gutter: 26px;
  position: relative;
  display: grid;
  grid-template-columns: 1fr var(--gutter) 1fr;
  align-items: start;
  transform-style: preserve-3d;
}

.half {
  position: relative;
  z-index: 1;
}

.page-surface {
  padding: 12px;
  border-radius: 16px;
  /* Opaque on purpose: stacked translucent page and leaf flash during the turn. */
  background: linear-gradient(135deg, #aab4cc, #9ea9c6);
  border: 1px solid rgba(255, 255, 255, 0.38);
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, 0.6) inset,
    0 10px 30px -18px rgba(30, 27, 75, 0.45);
}
:global(.dark) .page-surface {
  background: linear-gradient(135deg, #221c40, #120f22);
  border-color: rgba(160, 135, 235, 0.22);
  box-shadow:
    0 1px 0 0 rgba(190, 170, 255, 0.12) inset,
    0 10px 30px -16px rgba(0, 0, 0, 0.6);
}

.stack-sheet {
  position: absolute;
  top: 6px;
  bottom: 0;
  width: calc(50% - var(--gutter) / 2);
  border-radius: 16px;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(140, 152, 180, 0.62), rgba(118, 132, 175, 0.52));
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 8px 20px -14px rgba(30, 27, 75, 0.5);
  opacity: calc(1 - var(--i) * 0.22);
}
:global(.dark) .stack-sheet {
  background: linear-gradient(135deg, rgba(42, 35, 78, 0.66), rgba(14, 12, 26, 0.56));
  border-color: rgba(160, 135, 235, 0.16);
}
.stack-sheet.l {
  left: 0;
  transform: translate(calc(var(--i) * -5px), calc(var(--i) * 4px));
}
.stack-sheet.r {
  right: 0;
  transform: translate(calc(var(--i) * 5px), calc(var(--i) * 4px));
}

.gutter {
  align-self: stretch;
  background:
    linear-gradient(90deg, transparent, rgba(15, 23, 42, 0.13) 42%, rgba(15, 23, 42, 0.18) 50%, rgba(15, 23, 42, 0.13) 58%, transparent);
  border-radius: 999px;
}
:global(.dark) .gutter {
  background:
    linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.30) 42%, rgba(0, 0, 0, 0.42) 50%, rgba(0, 0, 0, 0.30) 58%, transparent);
}

.leaf {
  position: absolute;
  top: 0;
  bottom: 0;
  width: calc(50% - var(--gutter) / 2);
  transform-style: preserve-3d;
  pointer-events: none;
  will-change: transform;
  z-index: 5;
}

/* Hinge on the spread centre, not the leaf edge, or the leaf lands one gutter off. */
.leaf.fwd {
  right: 0;
  transform-origin: calc(var(--gutter) / -2) center;
  animation: leaf-fwd 620ms cubic-bezier(0.46, 0.03, 0.35, 1) forwards;
}
.leaf.back {
  left: 0;
  transform-origin: calc(100% + var(--gutter) / 2) center;
  animation: leaf-back 620ms cubic-bezier(0.46, 0.03, 0.35, 1) forwards;
}

@keyframes leaf-fwd {
  from { transform: rotateY(0deg); }
  to   { transform: rotateY(-180deg); }
}
@keyframes leaf-back {
  from { transform: rotateY(0deg); }
  to   { transform: rotateY(180deg); }
}

.face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, 0.6) inset,
    0 24px 50px -22px rgba(30, 27, 75, 0.6);
}
:global(.dark) .face {
  box-shadow:
    0 1px 0 0 rgba(190, 170, 255, 0.12) inset,
    0 24px 50px -20px rgba(0, 0, 0, 0.8);
}
.face.back {
  transform: rotateY(180deg);
}

.leaf-shade {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  pointer-events: none;
  background:
    linear-gradient(100deg, rgba(255, 255, 255, 0.42) 0%, rgba(255, 255, 255, 0.10) 45%, transparent 70%),
    linear-gradient(270deg, rgba(49, 46, 129, 0.16), transparent 40%);
  opacity: 0;
  animation: leaf-shade 620ms ease-in-out forwards;
}
:global(.dark) .leaf-shade {
  background:
    linear-gradient(100deg, rgba(214, 205, 255, 0.22) 0%, rgba(214, 205, 255, 0.06) 45%, transparent 70%),
    linear-gradient(270deg, rgba(0, 0, 0, 0.30), transparent 40%);
}
@keyframes leaf-shade {
  0%   { opacity: 0; }
  45%  { opacity: 1; }
  100% { opacity: 0; }
}

.pg-enter-active, .pg-leave-active {
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease;
}
.pg-enter-from { transform: translateX(3%); opacity: 0; }
.pg-leave-to   { transform: translateX(-3%); opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .leaf, .leaf-shade { animation: none; }
  .pg-enter-active, .pg-leave-active { transition: opacity 0.12s ease; }
  .pg-enter-from, .pg-leave-to { transform: none; }
}
</style>
