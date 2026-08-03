<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import BinderPage from '@/components/BinderPage.vue'

// The binder, rendered as an open book: two pages side by side with a real
// page-turn between them.
//
// On a wide screen you see a SPREAD — the left and right pages of one opening,
// the way a binder actually sits on a table. Below `md` there isn't room for
// two pages of pockets, so it falls back to one page at a time and the turn
// becomes a plain slide.
//
// The flip is a genuine 3-D leaf, not a crossfade: a half-width panel hinged on
// the gutter, carrying the OUTGOING page on its front face and the INCOMING one
// (pre-rotated 180°) on its back. As it swings, the page underneath is already
// in place, so you see exactly what you'd see turning a real page. That is the
// only skeuomorphic thing here — there is no leather, no rings, no paper
// texture, and the pages themselves stay flat glass.
const props = defineProps({
  // Array of pages; each page is an array of { position, card, owned }.
  pages: { type: Array, required: true },
  layout: { type: String, default: '3x3' },
  editable: { type: Boolean, default: false },
  binderId: { type: String, default: '' },
  // 0-based index of the page the URL points at.
  pageIndex: { type: Number, default: 0 },
})
const emit = defineEmits(['open', 'fill', 'clear', 'turn'])

const FLIP_MS = 620

// ── Spread vs single page ────────────────────────────────────────────────────
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

// ── Artwork prefetch ─────────────────────────────────────────────────────────
// The turning leaf is mounted the instant a flip starts, so if its artwork is
// only requested then, the page turns blank and the images pop in afterwards —
// the leaf looks like a sheet of white paper. Card tiles are `loading="lazy"`,
// which makes that worse: an off-screen page never requests anything at all.
//
// So the pages on either side of the open spread are warmed in the browser's
// image cache while the user is reading the current one. By the time they turn,
// the art is already decoded and the leaf shows a real page on both faces.
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

// One spread back and one forward — enough for a turn in either direction
// without pulling the whole binder over the wire.
function warmNeighbours() {
  const s = spread.value
  for (const i of [s * 2, s * 2 + 1, s * 2 + 2, s * 2 + 3, s * 2 - 2, s * 2 - 1]) {
    if (i >= 0) prefetchPage(i)
  }
}

// The spread currently open. Spread S shows pages 2S (left) and 2S+1 (right),
// so whichever page the URL names, we open the spread containing it.
const spread = computed(() => Math.floor(props.pageIndex / 2))
const leftIdx = computed(() => spread.value * 2)
const rightIdx = computed(() => spread.value * 2 + 1)

const pageAt = (i) => props.pages[i] ?? null

// What the two halves show during a flip.
//
// The half being UNCOVERED shows its destination page immediately. The leaf is
// opaque and covers that half completely at 0°, so the swap happens unseen and
// the new page is then revealed progressively as the leaf lifts — which is
// exactly what turning a page looks like.
//
// Deferring the swap to the midpoint (an earlier attempt) is worse, not better:
// the leaf is edge-on at 90°, so the half is fully exposed at precisely the
// moment the content changes, and the old page visibly flashes into the new one.
//
// The half being COVERED keeps its old page until the route catches up. The leaf
// is flat over it by then, so that swap is hidden too.
const staticLeft = computed(() => (flipping.value === 'back' ? pageAt(destLeft.value) : pageAt(leftIdx.value)))
const staticRight = computed(() => (flipping.value === 'fwd' ? pageAt(destRight.value) : pageAt(rightIdx.value)))

// ── Flip state ───────────────────────────────────────────────────────────────
const flipping = ref(null) // null | 'fwd' | 'back'
const destSpread = ref(0)
const destLeft = computed(() => destSpread.value * 2)
const destRight = computed(() => destSpread.value * 2 + 1)

// Faces of the turning leaf.
const frontFace = computed(() =>
  flipping.value === 'fwd' ? pageAt(rightIdx.value) : pageAt(leftIdx.value)
)
const backFace = computed(() =>
  flipping.value === 'fwd' ? pageAt(destLeft.value) : pageAt(destRight.value)
)

let timer = null

// ── Seeing through an empty pocket ───────────────────────────────────────────
// A binder sheet has pockets on BOTH sides, so an empty one lets you see the
// card in the pocket behind it. Which page is "behind" follows from how the
// sheets are bound: the leaf that turns carries the RIGHT page on its front and
// the next LEFT page on its back, so one physical sheet is (2S+1, 2S+2). Hence
// the reverse of page p is p+1 when p is odd, and p-1 when p is even.
//
// Three things flip with every surface you look through, and all three follow
// the same parity — odd depths are the far side of a sheet, even depths the near:
//   • COLUMNS mirror. Pocket 0 of a 3-wide page is top-left from the front and
//     top-right from the back; without this the ghosts sit on the wrong side.
//   • The CARD FACES AWAY, so what shows through at odd depth is its back, not
//     its artwork (BinderPage renders .dex-ghost-back for those).
//   • Only the FIRST card found is visible — it blocks everything behind it.
//
// How many sheets deep the eye is allowed to travel. Past this the ghost is
// invisible anyway, and it bounds the work per pocket.
const MAX_SEE_THROUGH = 5

function ghostsFor(pageIdx) {
  const page = pageAt(pageIdx)
  if (!page) return []
  const cols = props.layout === '2x2' ? 2 : 3
  const mirror = (i) => {
    const row = Math.floor(i / cols)
    return row * cols + (cols - 1 - (i % cols))
  }
  // Even pages sit on the left stack and you look backwards through them; odd
  // pages sit on the right and you look forwards.
  const dir = pageIdx % 2 === 0 ? -1 : 1

  return page.map((_, i) => {
    // Walk sheet by sheet until something blocks the view. The first card found
    // IS the blocker, which is exactly the one you'd see — anything behind it is
    // genuinely hidden, so the loop stops there.
    for (let d = 1; d <= MAX_SEE_THROUGH; d++) {
      const target = pageAt(pageIdx + dir * d)
      if (!target) return null // ran out of binder
      // The view flips left-for-right with every surface crossed, so odd depths
      // are seen mirrored and even depths the right way round.
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
// The leaf's own two faces ARE the two sides of one sheet, so each is the
// other's ghost layer — no extra lookup needed.
const frontGhosts = computed(() => (flipping.value ? ghostsFor(flipping.value === 'fwd' ? rightIdx.value : leftIdx.value) : []))
const backGhosts = computed(() => (flipping.value ? ghostsFor(flipping.value === 'fwd' ? destLeft.value : destRight.value) : []))

// ── The stack you're holding ─────────────────────────────────────────────────
// A real binder shows the edges of the pages either side of the opening. These
// counts drive a few offset sheets behind each half, so a thick binder visibly
// has more to go than a thin one. Capped at 3 — beyond that it's just noise.
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

  // Single-page mode (or reduced motion): no leaf, just move.
  if (!isWide.value || reduceMotion()) {
    emit('turn', clampPage(props.pageIndex + (isWide.value ? dir * 2 : dir)))
    return
  }

  destSpread.value = spread.value + dir
  flipping.value = dir > 0 ? 'fwd' : 'back'
  clearTimeout(timer)

  // When the leaf lands, ask for the page change — but DON'T clear `flipping`
  // here. `router.replace` resolves asynchronously, so tearing the leaf down in
  // this tick leaves a frame where the leaf is gone and the static halves still
  // show the OLD spread: the page visibly snaps back before jumping forward.
  //
  // Instead the leaf stays put, held at its final angle by `animation-fill-mode:
  // forwards`, with the destination page already on its upturned face. The watch
  // below retires it only once the route has actually caught up, so the swap
  // happens underneath a leaf that already looks like the thing it becomes.
  timer = setTimeout(() => {
    emit('turn', clampPage(destSpread.value * 2))
    // Safety net: if the route can't move (clamped at the ends, or a navigation
    // guard swallows it) the leaf must not stay stuck on screen.
    clearTimeout(timer)
    timer = setTimeout(() => { flipping.value = null }, 400)
  }, FLIP_MS)
}

// The route caught up with the leaf. Its back face and the static page beneath
// now show the SAME page, so fading it out changes nothing but the doubled
// brightness — then it unmounts once it's already invisible.
watch(spread, (s) => {
  if (flipping.value && s === destSpread.value) {
    clearTimeout(timer)
    flipping.value = null
  }
})

function clampPage(i) {
  return Math.max(0, Math.min(i, props.pages.length - 1))
}

// A layout change (2×2 ↔ 3×3) or a reload re-flows the pages under us; never
// leave a half-finished leaf hanging over the new content.
watch(() => [props.pages.length, props.layout], () => {
  clearTimeout(timer)
  flipping.value = null
  prefetched.clear()
  warmNeighbours()
})

// Warm the neighbours whenever the open spread settles (and on first paint).
watch(spread, warmNeighbours, { immediate: true })
watch(() => props.pages, warmNeighbours, { immediate: true, deep: false })
onBeforeUnmount(() => clearTimeout(timer))

defineExpose({ turn, canPrev, canNext })
</script>

<template>
  <div class="binder-book" :class="{ 'is-flipping': !!flipping }">
    <!-- ── Wide: an open spread ─────────────────────────────────────────── -->
    <div v-if="isWide" class="spread">
      <!-- Edges of the pages before and after this opening. Purely depth; they
           carry no content and never receive pointer events. -->
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

      <!-- The gutter: a soft crease, not a spine graphic. -->
      <div class="gutter" aria-hidden="true" />

      <!-- No `page-surface` when there IS no page: the last opening in a binder
           with an odd page count has nothing facing it, and painting the glass
           there left an empty panel hanging in space — a white stripe where a
           page isn't. -->
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

      <!-- The turning leaf. Inert to pointers: it's a transient visual. -->
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

    <!-- ── Narrow: one page, plain slide ────────────────────────────────── -->
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
  /* Deep enough that the leaf arcs rather than shearing. */
  perspective: 2600px;
  perspective-origin: 50% 50%;
}

.spread {
  /* One source of truth for the gutter: the column width, the leaf width and —
     critically — the hinge position are all derived from it. */
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

/* ── The page surface ─────────────────────────────────────────────────────────
   Every page is the same sheet of Nucleus glass — the two static halves AND
   both faces of the turning leaf. Sharing one class is the point: the leaf can
   never look like a different material from the pages it sits between, which is
   what made it read as a white sheet dropped on top of the binder. */
.page-surface {
  padding: 12px;
  border-radius: 16px;
  /* SOLID, deliberately. A translucent page and a translucent leaf stacked on
     top of each other composite brighter than either alone, which is what made
     the turn flash on and off. Opaque means a page looks the same whether it is
     lying flat or in mid-air — the invariant the eye actually notices. The glass
     feel still comes from the panel and blobs around and behind the book. */
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

/* ── Pages either side of the opening ─────────────────────────────────────────
   Offset sheets peeking out beyond the outer edge, so the binder has visible
   thickness and you can see there's more before and after this spread. Each
   one sits a little further out and lower, and fades as it goes back. */
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
/* Fan outwards from the spine — left pages to the left, right pages to the right. */
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

/* ── The turning leaf ────────────────────────────────────────────────────── */
.leaf {
  position: absolute;
  top: 0;
  bottom: 0;
  /* Half the spread minus half the gutter — exactly one page. */
  width: calc(50% - var(--gutter) / 2);
  transform-style: preserve-3d;
  pointer-events: none;
  will-change: transform;
  z-index: 5;
}

/* THE HINGE IS THE CENTRE OF THE SPREAD, NOT THE EDGE OF THE PAGE.
   This is the whole trick, and getting it wrong is why the turn used to land
   crooked and then jump.
     right page = [c + g/2, c + w]        (c = centre, g = gutter, w = half width)
     left  page = [c - w, c - g/2]
   Reflecting the right page about `c` lands it exactly on the left page. Hinging
   on the leaf's own left edge instead reflects about `c + g/2`, which overshoots
   by a full gutter — the page settles one gutter to the right of the real left
   page, then snaps into place the moment the leaf is retired.
   So the origin is pulled half a gutter OUTSIDE the leaf, onto the centre line. */
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

/* The leaf carries the very same .page-surface as a resting page, so a page
   looks identical flat or in mid-air. Only the 3-D bits and a lifted shadow
   differ — that shadow is the one honest cue that this sheet is off the stack. */
.face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  /* Heavier than a resting page — this sheet is off the stack and in the air. */
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

/* Shading that deepens as the leaf reaches vertical, so it reads as a solid
   sheet catching the light rather than a flat rectangle rotating. */
.leaf-shade {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  pointer-events: none;
  /* The page catching the light as it lifts: a soft brightening that eases in
     and back out, so it never pops on or off. Paired with a touch of shade at
     the hinge for form. */
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
/* Ramps up and back down within the turn — the fade-out is the point: the sheen
   is gone before the leaf is retired, so nothing changes at the handover. */
@keyframes leaf-shade {
  0%   { opacity: 0; }
  45%  { opacity: 1; }
  100% { opacity: 0; }
}

/* ── Narrow-screen slide ─────────────────────────────────────────────────── */
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
