import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { initAppearance } from './composables/useAppearance'

// 外观初始化失败不能阻塞应用挂载（否则白屏）
try {
  initAppearance() // 挂载前恢复玻璃风格 / 配色 / 背景图，避免闪烁
} catch (e) {
  console.error('外观初始化失败，已跳过', e)
}

const app = createApp(App)
app.use(router)
app.mount('#app')
