import { createApp } from 'vue'
import App from './App.vue'
import AppIcon from './components/AppIcon.vue'
import TagSelector from './components/TagSelector.vue'
import TagFilter from './components/TagFilter.vue'
import ColorPicker from './components/ColorPicker.vue'
import ItemTags from './components/ItemTags.vue'
import AppSelect from './components/AppSelect.vue'
import ClockPicker from './components/ClockPicker.vue'
import router from './router'
import './style.css'
import { initAppearance } from './composables/useAppearance'
import { initTheme } from './composables/useTheme'
import { initLocale } from './composables/useI18n'
import { registerAllMessages } from './locales'
import { vTip } from './composables/useHoverTip'

// 动态 Dark Reader 锁（兜底）：index.html 已有静态 <meta name="darkreader-lock">，
// 但 DR 的 content script 在 document_start 注入，可能早于静态 meta 解析。
// 此处再动态追加一次（官方文档方式），确保任何时机都能禁用 DR——
// 本应用自带 .dark 深色模式，且壁纸用伪元素背景，DR 动态模式会剥掉
// ::before/::after 导致壁纸消失，必须整站禁用 DR。
try {
  const lock = document.createElement('meta')
  lock.name = 'darkreader-lock'
  document.head.appendChild(lock)
} catch {}

// 全局错误兜底：同步异常 / 未处理的 Promise 都打到控制台，便于定位"白屏/卡死"
window.addEventListener('error', (e) =>
  console.error('[boot] window error:', e.message, e.error || ''),
)
window.addEventListener('unhandledrejection', (e) =>
  console.error('[boot] unhandledrejection:', e.reason),
)


/**
 * 兜底拦截「Shift / 三击 / Ctrl+A 触发文本选区」。
 *
 * 为什么 CSS 之外还要 JS：user-select: none 在部分浏览器/元素上
 * 仍会被 Shift+单击、三击、拖拽越过元素边界等操作绕过（尤其 tr/td）。
 * 这里在 selectstart 阶段直接 preventDefault —— 但**放行**输入控件与
 * 明确标记为可复制的区域（.selectable-text），否则用户无法选中输入内容
 * 或复制「当前选中」那类文本。
 *
 * 用捕获阶段（第三个参数 true）：确保在选择开始之前就拦到，
 * 不被任何子元素的处理抢先。
 */
document.addEventListener(
  'selectstart',
  (e) => {
    const t = e.target
    if (!t || typeof t.closest !== 'function') return
    // 放行：输入类控件、contenteditable、显式可复制区域
    if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .selectable-text')) {
      return
    }
    e.preventDefault()
  },
  true,
)

console.log('[boot] main.js start')

async function boot() {
  // 语言必须在挂载前就绪：`<html lang>` 与首帧文案都依赖它。
  // 顺序：先注三语包（zh/en/ja），再读 localStorage / navigator 决定当前语言，
  // 这样首帧渲染时 t() 已经有完整文案，不会闪一下 key 名或中文。
  try {
    registerAllMessages()
    initLocale()
    console.log('[boot] initLocale done:', document.documentElement.lang)
  } catch (e) {
    console.error('[boot] 语言初始化失败，已回退中文', e)
  }

  // 主题（暗/浅）挂载前同步应用：首帧直接用正确配色渲染，避免挂载后再"突然变色"
  try {
    initTheme()
    console.log('[boot] initTheme done')
  } catch (e) {
    console.error('[boot] 主题初始化失败，已跳过', e)
  }

  // 挂载应用：不等待 initAppearance 的异步网络解析（壁纸迁移/换图）。
  // 先渲染出内容，背景图与取色就绪后再叠加，避免"主体已有底色但内容迟迟不出现"的白屏窗口。
  console.log('[boot] mounting app...')
  const app = createApp(App)
  // 统一图标组件全局注册：全站图标唯一来源，风格与顶栏一致（24 视框 / 1.9 描边 / round 端点）
  app.component('AppIcon', AppIcon)
  app.component('TagSelector', TagSelector)
  app.component('TagFilter', TagFilter)
  app.component('ColorPicker', ColorPicker)
  app.component('ItemTags', ItemTags)
  app.component('AppSelect', AppSelect)
  app.component('ClockPicker', ClockPicker)
  // 全站悬浮气泡指令：替代原生 title（样式与侧边栏气泡一致，见 useHoverTip.js）
  app.directive('tip', vTip)
  app.use(router)
  // 视觉审计 A-46：直载 /#/remaining 时顶栏 h1 先显示 app.title「追番管理」约 0.3s
  // 再经 out-in 过渡换成路由标题 —— 根因是挂载早于 router 初始导航解析，首帧
  // route.path 仍为 '/'，currentTitle 回落到 app.title，路由就绪后又触发一次
  // title-swap 换标题。改为等初始导航就绪再挂载：首帧直接渲染最终标题，
  // 且初始渲染不播 title-swap 进入动画。解析失败也照常挂载（不因路由错误白屏）。
  try { await router.isReady() } catch { /* 路由解析失败也照常挂载，保持可用性 */ }
  app.mount('#app')

  console.log('[boot] mounted')

  // 外观初始化（玻璃/配色/壁纸/取色）移到挂载后异步执行，不再阻塞首帧
  try {
    initAppearance() // 不 await：内部已把网络步骤拆到空闲调度
    console.log('[boot] initAppearance started')
  } catch (e) {
    console.error('[boot] 外观初始化失败，已跳过', e)
  }

  // 首帧渲染后再打点：若卡死在渲染/响应式循环，这里不会出现
  requestAnimationFrame(() => console.log('[boot] first animation frame ok'))

  // 视觉审计 A-56：/transfer 是路由懒加载 chunk，页内首次进入该页时主区（两张卡）
  // 要等 chunk 拉完才挂载（dev 实测 171~851ms），期间只有侧栏/顶栏壳。
  // 本页无数据依赖，故在首帧渲染完成后的空闲时段预取该 chunk：用户点侧栏进入
  // 导入导出页时组件已就绪，不再出现空白窗。（prod 是 vite-plugin-singlefile 的
  // inlineDynamicImports 单文件产物，本就无独立 chunk 请求，此预取只服务 dev/慢网。）
  const preloadTransferView = () => import('./views/ImportExportView.vue')
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(preloadTransferView, { timeout: 3000 })
  } else {
    setTimeout(preloadTransferView, 1200)
  }
}

boot()