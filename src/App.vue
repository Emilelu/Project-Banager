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
          class="flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 group" :class="[
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

      <!-- 底部数据操作 -->
      <div class="relative z-10 px-4 py-3 border-t border-white/10 space-y-2">
        <div class="flex gap-2">
          <button @click="exportDb" class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-xl text-xs font-medium transition-all btn-press" title="导出数据库为文件备份">
            <span>💾</span><span>导出备份</span>
          </button>
          <button @click="triggerImportDb" class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-xl text-xs font-medium transition-all btn-press" title="从备份文件恢复数据库">
            <span>📂</span><span>导入恢复</span>
          </button>
        </div>
        <input ref="fileInputRef" type="file" accept=".db,.sqlite,.bak" class="hidden" @change="onBackupFileChosen" />
        <div class="text-center text-xs" :class="backupWarning ? 'text-amber-300 font-medium' : 'text-white/40'">
          💾 上次备份: {{ backupLabel }}
        </div>
        <div class="flex items-center justify-center gap-2 text-white/30 text-xs">
          <span class="animate-sparkle">✦</span>
          <span>Standalone</span>
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
          <button @click="onToggleBg"
            class="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-primary/10 btn-press"
            :class="{ 'opacity-45': !bgActive }"
            :title="bgActive ? '点击关闭壁纸背景' : '点击开启壁纸背景'">
            <span class="text-lg transition-transform duration-300 hover:scale-110">🖼️</span>
          </button>
          <button @click="showThemeSettings = true"
            class="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-primary/10 btn-press"
            title="主题与背景设置">
            <span class="text-lg transition-transform duration-300 hover:scale-110">🎨</span>
          </button>
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
          <transition name="fade" mode="out-in" appear>
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- 全局 Toast 通知 -->
    <ToastHost />

    <!-- 主题与背景设置 -->
    <ThemeSettings :show="showThemeSettings" @close="showThemeSettings = false" />

    <!-- 导入备份确认对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showImportConfirm" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="cancelImport"></div>
      </transition>
      <transition name="modal">
        <div v-if="showImportConfirm" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[26.25rem] border border-white/40 pointer-events-auto">
            <div class="px-6 py-5 text-center">
              <div class="text-4xl mb-3">📂</div>
              <h3 class="text-lg font-bold text-gray-800 mb-2">导入备份</h3>
              <p class="text-sm text-gray-500">
                导入备份将<b class="text-danger">覆盖当前所有数据</b>！<br />
                文件：<span class="font-semibold text-gray-700">{{ pendingImportFile?.name }}</span>
              </p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button @click="cancelImport" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">取消</button>
              <button @click="confirmImportDb" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-danger to-red-400 rounded-xl hover:shadow-lg hover:shadow-danger/30 transition-all btn-press">确认导入</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme'
import { getDb } from './db/index'
import { showToast } from './composables/useToast'
import ToastHost from './components/ToastHost.vue'
import ThemeSettings from './components/ThemeSettings.vue'
import { useAppearance } from './composables/useAppearance'

const route = useRoute()
const currentTime = ref('')
const fileInputRef = ref(null)
const showThemeSettings = ref(false)

const appearance = useAppearance()
const bgActive = computed(() => appearance.state.bgEnabled && !!appearance.state.bgUrl && !appearance.state.bgFailed)
const onToggleBg = () => { appearance.toggleBackground() }
const { theme, isDark, toggleTheme } = useTheme()

const BACKUP_KEY = 'banager_last_backup'
const lastBackupTs = ref(0)

const backupLabel = computed(() => {
  if (!lastBackupTs.value) return '从未备份'
  const days = Math.floor((Date.now() - lastBackupTs.value) / 86400000)
  return days <= 0 ? '今天' : `${days} 天前`
})
// 从未备份或超过一周未备份时高亮提醒
const backupWarning = computed(() => !lastBackupTs.value || (Date.now() - lastBackupTs.value > 7 * 86400000))

// 导出数据库为 .db 文件
async function exportDb() {
  try {
    const db = await getDb()
    const data = db.export() // Uint8Array
    const blob = new Blob([data], { type: 'application/x-sqlite3' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const now = new Date()
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`
    a.href = url
    a.download = `bangumi_backup_${ts}.db`
    a.click()
    URL.revokeObjectURL(url)
    localStorage.setItem(BACKUP_KEY, String(Date.now()))
    lastBackupTs.value = Date.now()
    showToast('备份已导出 💾')
  } catch (e) {
    console.error('导出失败:', e)
    showToast('导出失败: ' + e.message, 'error')
  }
}

// 触发文件选择
function triggerImportDb() {
  fileInputRef.value?.click()
}

// 选择备份文件后弹确认框（替代原生 confirm）
const showImportConfirm = ref(false)
const pendingImportFile = ref(null)

function onBackupFileChosen(event) {
  const file = event.target.files?.[0]
  if (!file) return
  pendingImportFile.value = file
  showImportConfirm.value = true
}

function cancelImport() {
  showImportConfirm.value = false
  pendingImportFile.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

// 从备份文件恢复数据库
async function confirmImportDb() {
  const file = pendingImportFile.value
  showImportConfirm.value = false
  pendingImportFile.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
  if (!file) return
  try {
    const arrayBuffer = await file.arrayBuffer()
    const db = await getDb()
    db.importDb(new Uint8Array(arrayBuffer))
    db.save() // 持久化到 IndexedDB
    showToast('导入成功！页面即将刷新')
    setTimeout(() => window.location.reload(), 900)
  } catch (e) {
    console.error('导入失败:', e)
    showToast('导入失败: ' + e.message, 'error')
  }
}

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
  lastBackupTs.value = parseInt(localStorage.getItem(BACKUP_KEY)) || 0
  timer = setInterval(updateTime, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>
