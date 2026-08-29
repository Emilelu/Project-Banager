/**
 * 全局 Toast 队列
 * 所有视图共享一个通知列表（由 App.vue 中的 ToastHost 渲染），
 * 连续通知自动堆叠，错误类停留更久
 */
import { reactive } from 'vue'

const DURATION = { success: 2500, info: 2500, warning: 3500, error: 4500 }

export const toasts = reactive([])
let seq = 0

export function showToast(message, type = 'success') {
  const id = ++seq
  toasts.push({ id, message, type })
  setTimeout(() => {
    const idx = toasts.findIndex(t => t.id === id)
    if (idx >= 0) toasts.splice(idx, 1)
  }, DURATION[type] || DURATION.success)
}

export function useToasts() {
  return toasts
}
