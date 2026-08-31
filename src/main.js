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
  // 外观初始化失败不能阻塞应用挂载（否则白屏）
  try {
    await initAppearance() // 挂载前恢复玻璃风格 / 配色 / 背景图；async 等迁移解析稳定地址完才挂载
    console.log('[boot] initAppearance done')
  } catch (e) {
    console.error('[boot] 外观初始化失败，已跳过', e)
  }

  // 主题（暗/浅）同样在挂载前同步应用，避免首帧错误配色再"突然变色"
  try {
    initTheme()
    console.log('[boot] initTheme done')
  } catch (e) {
    console.error('[boot] 主题初始化失败，已跳过', e)
  }

  console.log('[boot] mounting app...')
  const app = createApp(App)
  app.use(router)
  app.mount('#app')
  console.log('[boot] mounted')
  // 首帧渲染后再打点：若卡死在渲染/响应式循环，这里不会出现
  requestAnimationFrame(() => console.log('[boot] first animation frame ok'))
}

boot()
