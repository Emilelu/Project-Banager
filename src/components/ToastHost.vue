<template>
  <!-- top-[4.5rem]：避开顶部 56px 高的 header（右侧有时钟），否则 Toast 会盖住时间 -->
  <div class="fixed top-[4.5rem] right-6 z-[100] flex flex-col items-end gap-2 pointer-events-none"
    role="status" aria-live="polite" aria-atomic="false">
    <transition-group name="toast">
      <div v-for="t in toasts" :key="t.id"
        class="px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white animate-slide-down max-w-[24rem] pointer-events-auto flex items-start gap-3"
        :class="t.type === 'success' ? 'bg-gradient-to-r from-success to-emerald-400' : t.type === 'error' ? 'bg-gradient-to-r from-danger to-red-400' : 'bg-gradient-to-r from-warning to-amber-400'">
        <span class="flex-1">{{ t.message }}</span>
        <button type="button" class="shrink-0 opacity-70 hover:opacity-100 transition leading-none"
          :aria-label="tt('toast.closeLabel', { message: t.message })" @click="removeToast(t.id)">×</button>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { useToasts, removeToast } from '../composables/useToast'
import { useI18n } from '../composables/useI18n'

const { tt } = useI18n()
const toasts = useToasts()
</script>
