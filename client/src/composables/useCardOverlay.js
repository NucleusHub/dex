import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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

  function showCard_(card) {
    const id = typeof card === 'string' ? card : card?.cardId
    if (!id) return
    router.replace({ query: { ...route.query, card: id } })
  }

  function closeCard() {
    const query = { ...route.query }
    delete query.card
    router.replace({ query })
  }

  return { cardId, showCard, openCard, closeCard, replaceCard: showCard_ }
}
