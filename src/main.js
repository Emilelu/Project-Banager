import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { initAppearance } from './composables/useAppearance'
import { initTheme } from './composables/useTheme'

// 全局错误兜底：同步异常 / 未处理的 Promise 都打到控制台，便于定位"白屏/卡死"
window.addEventListener('error', (e) =>
  console.error('[boot] window error:', e.message, e.error || ''),
)
window.addEventListener('unhandledrejection', (e) =>
  console.error('[boot] unhandledrejection:', e.reason),
)

console.log('[boot] main.js start')

async function boot() {
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