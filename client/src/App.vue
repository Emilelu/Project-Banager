<template>
  <div class="flex h-screen overflow-hidden" :class="{ 'dark-mode': isDark }">
    <!-- 侧边栏 -->
    <aside class="w-60 flex flex-col shadow-xl relative overflow-hidden sidebar-bg">
      <!-- 装饰圆 -->
      <div class="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-white/5 animate-pulse-soft"></div>
      <div class="absolute bottom-20 -right-8 w-24 h-24 rounded-full bg-secondary/10 animate-float"></div>

      <!-- Logo区域 -->
      <div class="relative z-10 px-5 py-5 border-b border-white/10">
        <div class="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" class="w-8 h-8 animate-bounce-soft" />
          <div>
            <h1 class="text-white text-base font-bold tracking-wide">追番管理</h1>
            <p class="text-white/50 text-xs">Project Bangumi Manager</p>
          </div>
        </div>
      </div>

      <!-- 导航菜单 -->
      <nav class="flex-1 py-4 space-y-1 px-3 relative z-10">
        <router-link v-for="(item, idx) in navItems" :key="item.path" :to="item.path"
          class="flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group" :class="[
            $route.path === item.path
              ? 'bg-white/20 text-white shadow-lg shadow-black/10 backdrop-blur-sm scale-[1.02]'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          ]" :style="{ animationDelay: idx * 80 + 'ms' }">
          <span class="text-xl mr-3 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12">{{
            item.icon }}</span>
          <span>{{ item.label }}</span>
          <span v-if="$route.path === item.path"
            class="ml-auto w-2 h-2 rounded-full bg-sakura animate-pulse-soft"></span>
        </router-link>
      </nav>

      <!-- 底部装饰 -->
      <div class="relative z-10 px-5 py-4 border-t border-white/10">
        <div class="flex items-center gap-2 text-white/40 text-xs">
          <span class="animate-sparkle">✦</span>
          <span>v26.5.16</span>
          <span class="animate-sparkle" style="animation-delay: 0.5s">✦</span>
        </div>
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- 顶部栏 -->
      <header class="h-14 flex items-center justify-between px-6 glass shadow-sm border-b border-white/20">
        <h1 class="text-lg font-bold gradient-text flex items-center gap-2">
          <span class="text-xl">{{ currentIcon }}</span>
          {{ currentTitle }}
        </h1>
        <div class="flex items-center gap-3">
          <button @click="toggleTheme"
            class="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-primary/10 btn-press"
            :title="themeLabel">
            <span class="text-lg transition-transform duration-300 hover:scale-110">{{ themeIcon }}</span>
          </button>
          <div class="text-sm text-gray-500 font-medium">
            {{ currentTime }}
          </div>
        </div>
      </header>

      <!-- 页面内容 -->
      <main class="flex-1 overflow-auto p-6">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme'

const route = useRoute()
const currentTime = ref('')
const { theme, isDark, toggleTheme } = useTheme()

const themeIcon = computed(() => {
  if (theme.value === 'dark') return '🌙'
  if (theme.value === 'light') return '☀️'
  return '🔄'
})
const themeLabel = computed(() => {
  if (theme.value === 'dark') return '暗色模式 (点击切换)'
  if (theme.value === 'light') return '日间模式 (点击切换)'
  return '跟随系统 (点击切换)'
})

const navItems = [
  { path: '/watching', label: '正在追番', icon: '📺' },
  { path: '/remaining', label: '等待更新', icon: '⏳' },
  { path: '/watched', label: '已看历史', icon: '📚' },
  { path: '/import', label: '导入Excel', icon: '📥' }
]

const currentTitle = computed(() => {
  const item = navItems.find(n => n.path === route.path)
  return item ? item.label : '追番管理'
})

const currentIcon = computed(() => {
  const item = navItems.find(n => n.path === route.path)
  return item ? item.icon : '📺'
})

let timer = null

const updateTime = () => {
  const now = new Date()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const weekDay = weekDays[now.getDay()]
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  currentTime.value = `${year}/${month}/${day} 周${weekDay} ${hours}:${minutes}:${seconds}`
}

onMounted(() => {
  updateTime()
  timer = setInterval(updateTime, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>