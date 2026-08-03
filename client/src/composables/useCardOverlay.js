import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// The card detail overlay is addressable: it's driven by a `?card=<id>` query on
// whatever route you're already on. That buys three things for free — a card is
// linkable, a reload reopens it, and Back closes it instead of leaving the page.
//
// Every view that shows cards uses this, so opening a card behaves identically
// from a set, from search, and from inside a binder.
export function useCardOverlay() {
  const route = useRoute()
  const router = useRouter()

  const cardId = computed(() => String(route.query.card ?? ''))
  const showCard = computed(() => !!cardId.value)

  function openCard(card) {
    const id = typeof card === 'string' ? card : card?.cardId
    if (!id) return
    router.push({ query: { ...route.query, card: id } })
  }

  // Move the overlay to a sibling card. `replace` rather than `push` on purpose:
  // arrowing through 200 cards in a set shouldn't bury the page you came from
  // under 200 history entries — Back still returns to the grid.
  function showCard_(card) {
    const id = typeof card === 'string' ? card : card?.cardId
    if (!id) return
    router.replace({ query: { ...route.query, card: id } })
  }

  function closeCard() {
    const query = { ...route.query }
    delete query.card
    // `replace` so closing doesn't stack another history entry on top of the one
    // Back is meant to return to.
    router.replace({ query })
  }

  return { cardId, showCard, openCard, closeCard, replaceCard: showCard_ }
}
