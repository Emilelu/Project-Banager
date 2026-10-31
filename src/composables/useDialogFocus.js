/**
 * useDialogFocus —— 自定义弹窗（.app-dialog + Teleport）的键盘焦点管理
 * ============================================================
 * 解决的问题：
 *  1. 打开弹窗时把焦点送进弹窗（优先首个输入框），键盘/读屏用户不再在弹窗外空转。
 *  2. Tab / Shift+Tab 在弹窗内循环（焦点陷阱）；焦点被点到弹窗外时按 Tab 拉回。
 *  3. 关闭后把焦点还给打开它的触发控件；触发控件已销毁（右键菜单项、表格行内元素）时
 *     退回到页面根节点（rootRef）。
 *
 * Esc：三个业务页各自已有 document 级 keydown 处理（顺带退出批量模式），
 * 所以默认不接管 Esc，避免一次按键关两层。没有页面级处理的弹窗（App.vue 导入确认、
 * 主题设置面板）传 onEscape，由本组合式负责关闭。
 *
 * 用法：
 *   const rootRef = ref(null)                       // 页面根节点，tabindex="-1"
 *   const addDialogRef = ref(null)                  // .app-dialog 元素
 *   useDialogFocus({
 *     isOpen: () => showDialog.value,
 *     getDialog: () => addDialogRef.value,
 *     root: () => rootRef.value,
 *     onEscape: () => { showDialog.value = false }, // 可选
 *   })
 */
import { onMounted, onUnmounted, nextTick, isRef, watch } from 'vue'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const FIELD_SELECTOR =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'

const unwrap = (value) => (isRef(value) ? value.value : value)

export const canFocus = (el) => {
  if (!el || typeof el.focus !== 'function') return false
  if (el.isConnected === false) return false
  if (el.disabled) return false
  return true
}

/** 弹窗内全部可聚焦元素，顺序即 Tab 序 */
export function collectFocusable(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)]
}

/** 弹窗内第一个输入类控件；没有则退回第一个可聚焦元素 */
export function firstField(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return null
  return root.querySelector(FIELD_SELECTOR) || collectFocusable(root)[0] || null
}

export function useDialogFocus(options = {}) {
  const { isOpen, getDialog, initialFocus, root, onEscape } = options
  let opener = null
  let engaged = false

  const dialogEl = () => unwrap(getDialog?.())
  const rootEl = () => unwrap(root?.())

  const focusFirst = () => {
    const dlg = dialogEl()
    if (!dlg) return false
    const preferred = unwrap(initialFocus?.())
    const target = canFocus(preferred) && dlg.contains(preferred) ? preferred : firstField(dlg)
    if (!canFocus(target)) return false
    target.focus()
    return true
  }

  /** 关闭后归还焦点：触发控件 → 页面根节点 */
  const restore = () => {
    const target = canFocus(opener) ? opener : null
    opener = null
    if (target) {
      target.focus()
      return true
    }
    const r = rootEl()
    if (canFocus(r)) {
      r.focus()
      return true
    }
    return false
  }

  const handleKeydown = (e) => {
    if (!engaged || !isOpen?.()) return
    const dlg = dialogEl()
    if (!dlg) return

    if (e.key === 'Escape' && typeof onEscape === 'function') {
      e.preventDefault()
      onEscape()
      return
    }
    if (e.key !== 'Tab') return

    const items = collectFocusable(dlg)
    if (items.length === 0) {
      e.preventDefault()
      dlg.focus?.()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (!dlg.contains(active)) {
      e.preventDefault()
      first.focus()
      return
    }
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (typeof isOpen === 'function') {
    watch(
      () => isOpen(),
      async (open, wasOpen) => {
        if (open) {
          engaged = true
          const dlg = dialogEl()
          const active = document.activeElement
          opener = active && active !== document.body && !(dlg && dlg.contains(active)) ? active : null
          await nextTick()
          focusFirst()
        } else if (wasOpen) {
          engaged = false
          await nextTick()
          restore()
        }
      },
      { flush: 'post', immediate: true },
    )
  }

  onMounted(() => document.addEventListener('keydown', handleKeydown))
  onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

  return { focusFirst, restore }
}

export default useDialogFocus
