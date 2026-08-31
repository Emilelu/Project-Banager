/**
 * 右键菜单定位：菜单渲染后按视口剩余空间自动翻转/收拢，
 * 避免贴边右击时菜单被裁掉（尤其是页面底部时向上翻转）。
 */
import { nextTick } from 'vue'

const GAP = 8 // 与视口边缘保留的间距

/**
 * 把菜单放到鼠标位置，并在下方/右侧空间不足时翻转。
 * 用 offsetWidth/offsetHeight 量尺寸：它们是布局尺寸，不受 scale-in 动画
 * 的 transform 影响（getBoundingClientRect 会返回被缩放后的尺寸，导致误判）。
 */
export function placeContextMenu(contextMenu, e, extra = {}) {
  const x = e.clientX
  const y = e.clientY
  contextMenu.value = { show: true, x, y, ...extra }
  nextTick(() => {
    const el = document.querySelector('.context-menu')
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    let nx = x
    let ny = y
    // 右侧放不下则贴右翻转（从鼠标点向左展开）
    if (nx + w > window.innerWidth - GAP) {
      nx = Math.max(GAP, window.innerWidth - w - GAP)
    }
    // 下方放不下则向上翻转，仍有不足时贴底收拢
    if (ny + h > window.innerHeight - GAP) {
      ny = Math.max(GAP, e.clientY - h)
      if (ny + h > window.innerHeight - GAP) {
        ny = Math.max(GAP, window.innerHeight - h - GAP)
      }
    }
    if (nx !== x || ny !== y) {
      contextMenu.value = { ...contextMenu.value, x: nx, y: ny }
    }
  })
}
