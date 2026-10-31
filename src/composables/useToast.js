/**
 * 全局 Toast 队列
 * 所有视图共享一个通知列表（由 App.vue 中的 ToastHost 渲染），
 * 连续通知自动堆叠，错误类停留更久
 */
import { reactive } from 'vue'

const DURATION = { success: 2500, info: 2500, warning: 3500, error: 4500 }
const MAX_TOASTS = 5

export const toasts = reactive([])
let seq = 0
const timers = new Map()

export function removeToast(id) {
  const idx = toasts.findIndex(t => t.id === id)
  if (idx >= 0) toasts.splice(idx, 1)
  const timer = timers.get(id)
  if (timer) { clearTimeout(timer); timers.delete(id) }
}

export function showToast(message, type = 'success') {
  // 同文案同类通知合并：重置计时而不是再叠一条
  const existing = toasts.find(t => t.message === message && t.type === type)
  if (existing) {
    const timer = timers.get(existing.id)
    if (timer) clearTimeout(timer)
    timers.set(existing.id, setTimeout(() => removeToast(existing.id), DURATION[type] || DURATION.success))
    return existing.id
  }

  const id = ++seq
  toasts.push({ id, message, type })
  // 超出上限时丢弃最旧的，避免堆满屏幕
  while (toasts.length > MAX_TOASTS) {
    const oldest = toasts[0]
    removeToast(oldest.id)
  }
  timers.set(id, setTimeout(() => removeToast(id), DURATION[type] || DURATION.success))
  return id
}

export function useToasts() {
  return toasts
}
