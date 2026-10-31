/**
 * 全站统一的悬浮气泡指令 `v-tip`。
 *
 * 为什么不是原生 `title`：
 *   · 原生 tooltip 的延迟（约 1s）、字体、配色、圆角全部由浏览器/系统决定，改不了；
 *   · 深色模式下它是一个刺眼的浅灰/白底方块，与液态玻璃的设计语言完全割裂；
 *   · 无法保证不溢出视口。
 *
 * 实现要点（与侧边栏既有的悬浮气泡保持一致）：
 *   1. 气泡节点直接挂到 `document.body`（不是原地渲染）。
 *      必须这么做：祖先只要带 `backdrop-filter`（本项目大量 .glass 卡片都有），
 *      它就会成为 `position: fixed` 的**包含块**，`fixed` 子元素会被按祖先盒子定位，
 *      实测偏移接近 200px。挂到 body 才真正相对视口定位。
 *   2. `fixed` + 由触发元素的 `getBoundingClientRect()` 算出坐标；
 *      默认出现在元素**右侧**，右侧放不下就翻转到左侧，
 *      左右都放不下再退化为「下方 / 上方」，最后统一夹进视口。
 *   3. 样式与侧边栏气泡同一套：`app-menu-surface` + `rounded-lg` + `text-xs`
 *      + `border border-white/40` + `shadow-lg`，垂直居中对齐触发元素。
 *   4. `role="tooltip"`，并通过唯一的 `aria-describedby` 关联触发元素；
 *      触发元素原有的 `aria-label` 一律不动（气泡只补描述，不抢名字）。
 *   5. 鼠标 mouseenter/mouseleave 与键盘 focus/blur 都触发（无障碍必需）。
 *   6. 同一时刻只显示一个气泡；文案为空则不显示。
 *
 * 用法：
 *   <button v-tip="tt('common.cancel')">...</button>
 *   <button v-tip="someEmptyString">...</button>   // 为空 → 不显示
 *
 * 指令已在 `src/main.js` 全局注册，模板里直接写 `v-tip` 即可，无需 import。
 * 若某个 `<script setup>` 里另有局部指令需求，也可以 `import { vTip }` 使用
 * （变量名 `vTip` 会被编译器识别为 `v-tip`）。
 */

/** 气泡与触发元素之间的间距（与侧边栏的 8px 一致） */
const GAP = 8
/** 气泡与视口边缘的最小留白 */
const MARGIN = 8

/**
 * 与侧边栏气泡完全一致的类名集合。
 * 注意：tailwind.config.js 的 content 覆盖 src 下的 vue/js，写在本文件里的类名也会被扫描生成。
 */
const TIP_CLASS = [
  'pointer-events-none',
  'fixed',
  'z-[130]',
  'px-2.5',
  'py-1.5',
  'rounded-lg',
  'app-menu-surface',
  'border',
  'border-white/40',
  'text-xs',
  'font-medium',
  'text-gray-700',
  'shadow-lg',
].join(' ')

/** 气泡 DOM（单例，只在显示期间挂在 body 上） */
let tipEl = null
/** 当前正在显示气泡的触发元素（保证同一时刻只有一个） */
let shownFor = null
/** aria-describedby 用的唯一 id 序号 */
let seq = 0
/** 同一时刻只显示一个气泡：谁的 id 最新，谁拥有气泡（异步 fade-in 回调据此作废） */
let activeId = 0
/** 显示中的滚动/缩放重定位监听是否已挂 */
let tracking = false

/** 每个触发元素的指令状态（WeakMap：元素销毁自动可回收，不泄漏） */
const states = new WeakMap()

const clamp = (v, min, max) => Math.max(min, Math.min(v, max))

/** 视口尺寸（不含滚动条区域之外的部分，取 innerWidth/Height 与侧边栏一致） */
const viewport = () => ({ w: window.innerWidth, h: window.innerHeight })

/** 创建（或复用）气泡节点。仅当需要显示时才建，隐藏即销毁。 */
const ensureTip = () => {
  if (tipEl && tipEl.isConnected) return tipEl
  const el = document.createElement('div')
  el.className = TIP_CLASS
  el.setAttribute('role', 'tooltip')
  // 与侧边栏气泡（App.vue 的 #sidebar-tip）**完全对齐**：
  //   · 短文案单行显示（不折行）—— 侧栏是 whitespace-nowrap；
  //   · 只有超长文案才允许折行，靠 maxWidth 限制 + break-word 兜底，
  //     否则「主题设置里十几字的提示」会把文字顶出视口，夹取也救不回来。
  el.style.whiteSpace = 'normal'
  el.style.overflowWrap = 'break-word'
  el.style.maxWidth = 'min(22rem, calc(100vw - 1rem))'
  el.style.transform = 'translateY(-50%)'
  // 动效与侧栏一致：侧栏走 <transition name="fade">，其
  // .fade-enter-active/.fade-leave-active 是 `opacity 0.15s ease-out`，
  // 这里用同样的 150ms / ease-out，两处观感才真正统一（原来是 120ms ease）。
  el.style.transition = 'opacity 150ms ease-out'
  el.style.opacity = '0'
  el.style.visibility = 'hidden'
  el.style.willChange = 'opacity'
  tipEl = el
  document.body.appendChild(el)
  return el
}

/**
 * 计算并写入气泡坐标。
 * 竖直方向用 `translateY(-50%)`（与侧边栏一致），因此 top 传的是「居中点」，
 * 夹取时按半高换算，保证气泡整体落在视口内。
 */
const place = (el, tip) => {
  const r = el.getBoundingClientRect()
  const w = tip.offsetWidth
  const h = tip.offsetHeight
  const { w: vw, h: vh } = viewport()
  const maxLeft = Math.max(MARGIN, vw - MARGIN - w)
  const minCenter = MARGIN + h / 2
  const maxCenter = Math.max(minCenter, vh - MARGIN - h / 2)

  // ---------- 横向 ----------
  let left = r.right + GAP
  let beside = true // 气泡是否仍在元素「侧面」（决定竖直怎么对齐）
  if (left > maxLeft) {
    const flipped = r.left - GAP - w // 翻转到左侧
    if (flipped >= MARGIN) {
      left = flipped
    } else {
      // 左右都放不下（元素几乎贴满整行）：改为上/下，并水平居中于元素
      beside = false
      left = clamp(r.left + r.width / 2 - w / 2, MARGIN, maxLeft)
    }
  }
  left = clamp(left, MARGIN, maxLeft)

  // ---------- 纵向 ----------
  let centerY
  if (beside) {
    centerY = r.top + r.height / 2
  } else {
    const below = r.bottom + GAP + h / 2 // 下方居中点
    const above = r.top - GAP - h / 2 // 上方居中点
    centerY = below <= maxCenter ? below : above
  }
  centerY = clamp(centerY, minCenter, maxCenter)

  tip.style.left = `${Math.round(left)}px`
  tip.style.top = `${Math.round(centerY)}px`
}

const unbindTracking = () => {
  if (!tracking) return
  tracking = false
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
}

/** 滚动/缩放时跟随（捕获阶段监听，内层滚动容器也能收到） */
const onViewportChange = () => {
  if (!shownFor || !tipEl) return
  if (!shownFor.isConnected) {
    hide(shownFor)
    return
  }
  place(shownFor, tipEl)
}

const bindTracking = () => {
  if (tracking) return
  tracking = true
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
}

/** 把 aria-describedby 恢复到触发元素原本的样子（只移除我们加的那一段） */
const releaseDescribedBy = (el) => {
  const st = states.get(el)
  if (!st) return
  if (st.prevDescribedby) el.setAttribute('aria-describedby', st.prevDescribedby)
  else el.removeAttribute('aria-describedby')
  st.prevDescribedby = null
}

const hide = (el) => {
  // 只允许隐藏「当前正在显示的那个」，避免 A 的 mouseleave 误关 B 的气泡
  if (el && shownFor !== el) return
  if (shownFor) releaseDescribedBy(shownFor)
  shownFor = null
  activeId++ // 让仍在飞行中的 fade-in 回调失效
  unbindTracking()
  if (tipEl) {
    tipEl.remove() // 隐藏即销毁：DOM 里不留隐藏的 role=tooltip 幽灵元素
    tipEl = null
  }
}

/** 外部（例如切换主题、路由变化）强制关闭当前气泡 */
export const hideAllTips = () => hide(null)

/**
 * 展示气泡。
 * @param {Element} el 触发元素
 * @param {*} text 文案（为空则什么都不显示）
 */
const show = (el, text) => {
  const value = String(text ?? '').trim()
  if (!value || !el || !el.isConnected) {
    hide(el)
    return
  }
  // 同一时刻只显示一个：切换触发元素时先关掉旧的
  if (shownFor && shownFor !== el) hide(shownFor)

  // 串行号：异步的 requestAnimationFrame 回来时据此判断气泡是否已被别人接管
  const token = ++activeId

  const tip = ensureTip()
  tip.textContent = value

  // 先隐身上屏测量尺寸，再定位，避免"先出现在错误位置再跳"的闪烁
  tip.style.visibility = 'hidden'
  tip.style.opacity = '0'
  place(el, tip)
  tip.style.visibility = 'visible'

  const id = `hover-tip-${++seq}`
  tip.id = id

  const st = states.get(el)
  releaseDescribedBy(el)
  st.prevDescribedby = el.getAttribute('aria-describedby')
  el.setAttribute(
    'aria-describedby',
    st.prevDescribedby ? `${st.prevDescribedby} ${id}` : id,
  )

  shownFor = el
  bindTracking()

  requestAnimationFrame(() => {
    if (token === activeId && shownFor === el && tipEl === tip) tip.style.opacity = '1'
  })
}

/**
 * 抑制浏览器原生 tooltip。
 *
 * 少数位置上原生 `title` 必须保留（例如卡片 +1/-1 按钮，既有测试用
 * `button[title="+1集"]` 定位，且那些测试文件不允许改）。只要元素同时带 v-tip，
 * 原生 tooltip 与自定义气泡就会双管齐下 —— 鼠标停留 1 秒后蹦出一个系统灰框。
 * 处理办法：鼠标进入时临时摘掉 title，离开时原样写回；键盘聚焦不触发原生 tooltip，
 * 因此不影响读屏与可访问性。
 */
const suppressNativeTitle = (el) => {
  if (!el.hasAttribute('title')) return null
  const title = el.getAttribute('title')
  el.removeAttribute('title')
  return title
}

const restoreNativeTitle = (el, title) => {
  if (title !== null && title !== undefined && !el.hasAttribute('title')) {
    el.setAttribute('title', title)
  }
}

/**
 * 指令本体。挂到元素上后：
 *   · mouseenter / mouseleave + focus / blur 四个入口
 *   · updated 时同步最新文案（v-tip 的值可能来自 computed/tt()）
 *   · beforeUnmount 清理监听、aria 关联与仍然显示的气泡
 */
export const vTip = {
  mounted(el, binding) {
    if (typeof document === 'undefined') return
    const state = {
      text: binding.value,
      prevDescribedby: null,
      savedTitle: null,
      handlers: null,
    }
    states.set(el, state)

    const onEnter = () => {
      // 有气泡文案时才抑制原生 title；文案为空则让原生 title 照常工作
      if (String(state.text ?? '').trim() && state.savedTitle === null) {
        state.savedTitle = suppressNativeTitle(el)
      }
      show(el, state.text)
    }
    const onLeave = () => {
      hide(el)
      restoreNativeTitle(el, state.savedTitle)
      state.savedTitle = null
    }
    const onFocus = () => show(el, state.text)
    const onBlur = () => hide(el)
    state.handlers = { onEnter, onLeave, onFocus, onBlur }

    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)
    el.addEventListener('focus', onFocus)
    el.addEventListener('blur', onBlur)

    // 便于调试与端到端巡检：无 title 时也能枚举出「带气泡」的元素
    el.dataset.tip = String(binding.value ?? '')
  },

  updated(el, binding) {
    const st = states.get(el)
    if (!st) return
    const next = String(binding.value ?? '')
    if (st.text === next) return
    st.text = next
    el.dataset.tip = next
    if (shownFor === el) {
      if (!next.trim()) hide(el)
      else {
        tipEl.textContent = next.trim()
        place(el, tipEl)
      }
    }
  },

  beforeUnmount(el) {
    const st = states.get(el)
    if (st?.handlers) {
      el.removeEventListener('mouseenter', st.handlers.onEnter)
      el.removeEventListener('mouseleave', st.handlers.onLeave)
      el.removeEventListener('focus', st.handlers.onFocus)
      el.removeEventListener('blur', st.handlers.onBlur)
      st.handlers = null
    }
    hide(el)
    // 元素销毁时把临时摘掉的 title 还回去：属性属于模板，不该被指令永久改写
    if (st) restoreNativeTitle(el, st.savedTitle)
    states.delete(el)
  },
}

/** 给非模板场景（例如程序化浮层）用的显式入口，正常业务无需调用 */
export const hoverTip = { show, hide }
