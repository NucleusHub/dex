<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '@core/useI18n.js'
import { Icon } from '@core/icons'
import DexIcon from '@/components/DexIcon.vue'
import { layoutMeta } from '@/utils/constants.js'
import { seriesGradient } from '@/utils/artwork.js'

const props = defineProps({
  binder: { type: Object, required: true },
})

const { t } = useI18n()
const coverFailed = ref(false)

const gradient = computed(() => seriesGradient({ seriesId: props.binder.id, name: props.binder.name }))
const layout = computed(() => layoutMeta(props.binder.layout))
</script>

<template>
  <RouterLink
    :to="`/binders/${binder.id}`"
    class="group relative block rounded-2xl overflow-hidden nuc-press focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
  >
    <div class="relative aspect-[4/3] overflow-hidden" :style="{ background: gradient }">
      <img
        v-if="binder.coverUrl && !coverFailed"
        :src="binder.coverUrl"
        :alt="binder.name"
        loading="lazy"
        decoding="async"
        class="absolute inset-0 w-full h-full object-contain p-6 drop-shadow-xl transition-transform duration-500 group-hover:scale-105"
        @error="coverFailed = true"
      />
      <div v-else class="absolute inset-0 grid place-items-center text-white/45">
        <DexIcon name="binder" class="w-12 h-12" />
      </div>

      <div class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 to-transparent" />

      <span
        v-if="binder.shared"
        class="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-slate-950/60 text-white text-[10px] font-medium px-2 py-1 backdrop-blur-sm"
        :title="t('dex.binder.shared')"
      >
        <Icon name="users" :sw="2" class="w-3 h-3" />
        {{ binder.groupId ? t('dex.binder.group') : t('dex.binder.shared') }}
      </span>

      <div class="absolute inset-x-0 bottom-0 p-4">
        <h3 class="text-base font-semibold text-white truncate drop-shadow-sm">{{ binder.name }}</h3>
        <p class="text-[11px] text-white/75 mt-0.5 tabular-nums">
          {{ t('dex.binder.cardCount', { count: binder.cardCount }) }}
          · {{ t('dex.binder.pageCount', { count: binder.pageCount }) }}
          · {{ layout.key }}
        </p>
      </div>
    </div>
  </RouterLink>
</template>
