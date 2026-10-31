import { createApp } from 'vue'
import App from './App.vue'
import AppIcon from './components/AppIcon.vue'
import router from './router'
import './style.css'
import { initAppearance } from './composables/useAppearance'
import { initTheme } from './composables/useTheme'
import { initLocale } from './composables/useI18n'
import { registerAllMessages } from './locales'

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
  app.use(router)
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
}

boot()