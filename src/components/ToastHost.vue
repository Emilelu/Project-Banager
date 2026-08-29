<template>
  <div class="fixed top-6 right-6 z-[100] flex flex-col items-end gap-2 pointer-events-none">
    <transition-group name="toast">
      <div v-for="t in toasts" :key="t.id"
        class="px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white animate-slide-down max-w-[24rem]"
        :class="t.type === 'success' ? 'bg-gradient-to-r from-success to-emerald-400' : t.type === 'error' ? 'bg-gradient-to-r from-danger to-red-400' : 'bg-gradient-to-r from-warning to-amber-400'">
        {{ t.message }}
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { useToasts } from '../composables/useToast'

const toasts = useToasts()
</script>
