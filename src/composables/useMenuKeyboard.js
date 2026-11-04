/**
 * 右键菜单的键盘支持（视觉审计 A-34）。
 *
 * 背景：顶栏「更多」菜单 / 年份菜单 / 每页条数菜单都有完整菜单语义
 * （role=menu、打开聚焦首项、↑↓ 循环、Esc 关闭并归还焦点），但三个页面的
 * 行右键菜单没有 —— 键盘用户打开后焦点仍在 BODY，方向键完全不响应，
 * 只能靠 Tab 穿过整页控件。这里把同一套行为抽成两个小函数，三页共用。
 *
 * 用法：
 *   <div role="menu" ref="menuRef" @keydown="onMenuKeydown($event, close, triggerEl)">
 *     <button role="menuitem">…</button>
 *   </div>
 *
 * 约定：
 *   · 菜单项 = 面板内 [role="menuitem"]，跳过 disabled 项（如无链接时的「打开链接」）；
 *   · Home/End 也一并支持（WAI-ARIA menu 模式的标准键位）；
 *   · Esc 在本层停止冒泡，避免同一按键又触发页面级的「退出批量模式」。
 */
import { nextTick } from 'vue'

/** 打开菜单后把焦点放到第一个可用菜单项 */
export const focusFirstMenuItem = (panel) => {
  nextTick(() => {
    const first = panel?.querySelector?.('[role="menuitem"]:not([disabled])')
    first?.focus?.()
  })
}

/**
 * 菜单面板统一的 keydown 处理。
 * @param {KeyboardEvent} event
 * @param {Function} close 关闭菜单（由调用方提供）
 * @param {Function} [restoreFocus] 关闭后归还焦点（由调用方决定退回到行/卡片还是页面根）
 */
export const onMenuKeydown = (event, close, restoreFocus) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
    restoreFocus?.()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const panel = event.currentTarget
  const items = Array.from(panel?.querySelectorAll?.('[role="menuitem"]:not([disabled])') || [])
  if (!items.length) return
  event.preventDefault()
  const index = items.indexOf(document.activeElement)
  let next
  if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = items.length - 1
  else next = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[next]?.focus()
}
