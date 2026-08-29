import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { initAppearance } from './composables/useAppearance'

initAppearance() // 挂载前恢复玻璃风格 / 配色 / 背景图，避免闪烁

const app = createApp(App)
app.use(router)
app.mount('#app')
