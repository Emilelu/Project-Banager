<template>
  <div class="flex h-screen overflow-hidden" :class="{ 'dark-mode': isDark }">
    <!-- 侧边栏 -->
    <aside class="w-60 flex flex-col shadow-xl relative overflow-hidden sidebar-bg">
      <!-- 装饰圆 -->
      <!-- ⚠️ 装饰元素勿加无限动画：它们位于 .sidebar-bg（backdrop-filter）子树内，
           动画会使侧栏玻璃每帧重新捕获背景并模糊。实测动画值约 20pt GPU 占用。
           详见 .workbuddy/memory/2026-09-13.md -->
      <div class="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-white/5"></div>
      <div class="absolute bottom-20 -right-8 w-24 h-24 rounded-full bg-secondary/10"></div>

      <!-- Logo区域 -->
      <div class="relative z-10 px-5 py-5 border-b border-white/10">
        <div class="flex items-center gap-3">
          <img :src="logoUrl" alt="PBM Logo" class="w-8 h-8 rounded-lg" width="32" height="32" />
          <div>
            <h1 class="text-white text-base font-bold tracking-wide">{{ tt('app.title') }}</h1>
            <p class="text-white/50 text-xs">{{ tt('app.subtitle') }}</p>
          </div>
        </div>
      </div>

      <!-- 导航菜单 -->
      <nav class="flex-1 py-4 space-y-1 px-3 relative z-10">
        <router-link v-for="(item, idx) in navItems" :key="item.path" :to="item.path"
          class="nav-item flex items-center px-4 py-4 rounded-xl text-sm font-medium transition-all duration-150 group" :class="[
            $route.path === item.path
              ? 'bg-white/20 text-white shadow-lg shadow-black/10 backdrop-blur-sm nav-active'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          ]" :style="{ animationDelay: idx * 80 + 'ms' }">
          <!-- 导航图标与文字**都要跟随整条导航项一起缩放**（见 .nav-item）。
               踩坑：早先给图标单独加 group-hover:scale-110，文字只跟 1.02 的整体缩放，
               两者倍率不同 → 悬浮时"图标放大了、文字没跟上"，看起来没一起动。
               现在去掉图标的独立 scale，统一由 .nav-item 整体 transform 驱动。 -->
          <AppIcon scale="md" class="mr-3" :name="item.icon" />
          <span>{{ tt(item.labelKey) }}</span>
          <span v-if="$route.path === item.path"
            class="ml-auto w-2 h-2 rounded-full bg-sakura"></span>
        </router-link>
      </nav>

      <!-- 底部数据操作 -->
      <div class="relative z-10 px-4 py-3 border-t border-white/10 space-y-2">
        <div class="flex gap-2">
          <!-- 导出备份：上次备份时间改为悬浮气泡，不再常驻占位 -->
          <div class="relative flex-1 group"
            @mouseenter="showBackupTip = true" @mouseleave="showBackupTip = false">
            <button @click="exportDb" class="w-full flex items-center justify-center gap-1 px-2 py-2 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-xl text-xs font-medium transition-all btn-press whitespace-nowrap"
              :aria-label="tt('sidebar.exportBackup')"
              :aria-describedby="'backup-tip'"
              @focus="showBackupTip = true" @blur="showBackupTip = false">
              <AppIcon scale="sm" name="download" /><span class="truncate">{{ tt('sidebar.exportBackupShort') }}</span>
            </button>
            <!-- 气泡用 fixed + 动态坐标：侧栏仅 240px，长文案（尤其中日）绝对居中会横向溢出页面。
                 必须 Teleport 到 body：祖先若带 backdrop-filter(.glass)，会成为 fixed 的包含块，
                 导致坐标相对该元素而非视口（实测偏差近 200px）。 -->
            <Teleport to="body">
              <!-- 气泡改用 app-menu-surface（0.82 白实底 + 强模糊）：
                   原先用 .glass 时底太透，橙色警示文字压在浅色壁纸上对比度不足。
                   文字色同时加深（amber-700 / gray-700），保证 ≥4.5:1。 -->
              <div id="backup-tip" ref="backupTipRef" role="tooltip"
                class="pointer-events-none fixed z-[120] px-3 py-2 rounded-xl app-menu-surface border border-white/40 text-xs transition-opacity duration-200 max-w-[min(22rem,calc(100vw-1rem))]"
                :class="showBackupTip ? 'opacity-100' : 'opacity-0'"
                :style="backupTipStyle">
                <span :class="backupWarning ? 'text-amber-800 font-semibold' : 'text-gray-700 font-medium'">
                  {{ tt('sidebar.lastBackup') }}：{{ backupLabel }}
                </span>
                <span v-if="backupWarning" class="flex items-center gap-1 text-amber-800 font-semibold mt-0.5"><AppIcon scale="xs" name="warning" />{{ tt('sidebar.backupWarning') }}</span>
              </div>
            </Teleport>
          </div>
          <div class="relative flex-1">
            <button @click="triggerImportDb" class="w-full flex items-center justify-center gap-1 px-2 py-2 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-xl text-xs font-medium transition-all btn-press whitespace-nowrap"
              :aria-label="tt('sidebar.importBackup')" :title="tt('sidebar.importTitle')">
              <AppIcon scale="sm" name="folderOpen" /><span class="truncate">{{ tt('sidebar.importBackupShort') }}</span>
            </button>
          </div>
        </div>
        <input ref="fileInputRef" type="file" accept=".db,.sqlite,.bak" class="hidden" @change="onBackupFileChosen" />
        <div class="flex items-center justify-center gap-2 text-white/30 text-xs">
          <AppIcon scale="xs" name="sparkle" />
          <span>{{ appVersion }}</span>
          <AppIcon scale="xs" name="sparkle" />
        </div>
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- 顶部栏 -->
      <header class="h-14 flex items-center justify-between px-6 glass shadow-sm border-b border-white/20">
        <h1 class="text-lg font-bold gradient-text flex items-center gap-2">
          <AppIcon scale="md" :name="currentIcon" />
          {{ currentTitle }}
        </h1>
        <div class="flex items-center gap-3">
          <!-- 图标统一用内联 SVG（stroke=currentColor），与毛玻璃/极简风格一致；
               emoji 在不同平台字重/基线不一致，会和界面其它元素违和 -->
          <button @click="onToggleBg"
            class="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-primary/10 btn-press group"
            :class="{ 'opacity-45': !bgActive }"
            :aria-label="bgActive ? tt('topbar.bgOn') : tt('topbar.bgOff')"
            :aria-pressed="bgActive ? 'true' : 'false'"
            :title="bgActive ? tt('topbar.bgOn') : tt('topbar.bgOff')">
            <svg class="w-5 h-5 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
              <!-- 关闭态：斜杠覆盖，一眼可辨 -->
              <path v-if="!bgActive" d="M3 3l18 18" stroke-width="2.5" />
            </svg>
          </button>
          <button @click="showThemeSettings = true"
            class="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-primary/10 btn-press group"
            :aria-label="tt('topbar.theme')"
            :title="tt('topbar.theme')">
            <svg class="w-5 h-5 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <!-- 调色板 -->
              <path d="M12 21a9 9 0 1 1 0-18c4.97 0 9 3.58 9 8 0 2.21-1.79 4-4 4h-2.5a2 2 0 0 0-1.5 3.32A1.99 1.99 0 0 1 12 21z" />
              <circle cx="7.5" cy="10.5" r="1" />
              <circle cx="12" cy="7.5" r="1" />
              <circle cx="16.5" cy="10.5" r="1" />
            </svg>
          </button>
          <button @click="toggleTheme"
            class="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-primary/10 btn-press group"
            :aria-label="themeLabel"
            :title="themeLabel">
            <!-- 三态：太阳 / 月亮 / 自动（半明半暗） -->
            <svg v-if="theme === 'light'" class="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
            <svg v-else-if="theme === 'dark'" class="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
            <svg v-else class="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" opacity="0.55" />
            </svg>
          </button>
          <!-- 语言切换：图标按钮 + 下拉菜单（直接选目标语言，比轮换更直观） -->
          <div class="relative">
            <button ref="langBtnRef" @click="toggleLangMenu"
              class="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-primary/10 btn-press"
              :class="{ 'bg-primary/10': showLangMenu }"
              :aria-label="tt('lang.switch')"
              :aria-expanded="showLangMenu"
              aria-haspopup="menu"
              :title="tt('lang.switch')">
              <!-- 地球/语言图标，与其他顶栏图标同一套线条风格 -->
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" />
                <path d="M12 3c2.5 2.6 4 5.6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.6-4-9s1.5-6.4 4-9Z" />
              </svg>
            </button>
            <!-- 菜单必须 Teleport 到 body：
                 header 自身是 .glass（带 backdrop-filter），会形成新的层叠上下文，
                 且其 z-index 与内部菜单相互嵌套，菜单会被后续的主内容区遮挡。
                 挂到 body 后是独立的顶层元素，再按按钮位置用 fixed 定位。 -->
            <Teleport to="body">
              <div v-if="showLangMenu" class="fixed inset-0 z-[100]" @click="showLangMenu = false"></div>
              <transition name="fade">
                <div v-if="showLangMenu" ref="langMenuRef" role="menu"
                  class="fixed z-[110] app-menu-surface rounded-xl border border-white/30 py-1 min-w-[8.5rem]"
                  :style="langMenuStyle">
                  <button v-for="l in SUPPORTED_LOCALES" :key="l.code" role="menuitemradio"
                    :aria-checked="locale === l.code"
                    @click="selectLocale(l.code)"
                    class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-primary/10"
                    :class="locale === l.code ? 'text-primary font-bold' : 'text-gray-700'">
                    <span class="w-4 shrink-0" aria-hidden="true">
                      <svg v-if="locale === l.code" class="w-4 h-4" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                      </svg>
                    </span>
                    <span class="flex-1">{{ l.label }}</span>
                    <span class="text-xs text-gray-400 font-mono">{{ l.short }}</span>
                  </button>
                </div>
              </transition>
            </Teleport>
          </div>
          <!-- 帮助：键盘快捷键 + 操作小贴士，统一收纳在弹窗里，不占页面空间 -->
          <button @click="showHelp = true"
            class="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-primary/10 btn-press group"
            :aria-label="tt('help.open')"
            :title="tt('help.open')">
            <svg class="w-5 h-5 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.1 9a3 3 0 1 1 4.2 3.2c-.9.5-1.3 1.1-1.3 2.1" />
              <circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <!-- GitHub 仓库链接：外链按钮，样式与其它顶栏图标一致 -->
          <a :href="REPO_URL" target="_blank" rel="noopener noreferrer"
            class="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-primary/10 btn-press group"
            :aria-label="tt('topbar.github')"
            :title="tt('topbar.github')">
            <AppIcon scale="md" name="github" class="transition-transform duration-300 group-hover:scale-110" />
          </a>
          <!-- 时钟：常驻只显示日期；悬浮/聚焦时气泡显示时分秒 -->
          <div class="relative" tabindex="0"
            @mouseenter="openTimeTip" @mouseleave="showTimeTip = false"
            @focus="openTimeTip" @blur="showTimeTip = false"
            @click="openTimeTip"
            role="group" :aria-label="dateDisplay"
            aria-describedby="clock-tip">
            <div class="text-sm text-gray-500 font-medium cursor-default select-none">
              {{ dateDisplay }}
            </div>
            <Teleport to="body">
              <div id="clock-tip" ref="clockTipRef" role="tooltip"
                class="pointer-events-none fixed z-[120] px-2.5 py-1.5 rounded-lg glass border border-white/30 shadow-xl text-xs font-mono tabular-nums transition-opacity duration-200"
                :class="showTimeTip ? 'opacity-100' : 'opacity-0'"
                :style="clockTipStyle">
                {{ timeDisplay }}
              </div>
            </Teleport>
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

    <!-- 帮助弹窗：键盘快捷键 + 操作小贴士 -->
    <HelpDialog :show="showHelp" @close="showHelp = false" />

    <!-- 导入备份确认对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showImportConfirm" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="cancelImport"></div>
      </transition>
      <transition name="modal">
        <div v-if="showImportConfirm" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div ref="importConfirmRef" class="relative glass rounded-2xl shadow-2xl w-[26.25rem] border border-white/40 pointer-events-auto app-dialog"
            role="dialog" aria-modal="true" aria-labelledby="app-import-confirm-title">
            <div class="px-6 py-5 text-center">
              <div class="mb-3 flex justify-center"><AppIcon scale="xl" class="text-gray-400" name="folderOpen" /></div>
              <h3 id="app-import-confirm-title" class="text-lg font-bold text-gray-800 mb-2">{{ tt('confirm.importBackupTitle') }}</h3>
              <p class="text-sm text-gray-500">
                {{ tt('confirm.importBackupMessage') }}<br />
                {{ tt('confirm.importBackupFile') }}<span class="font-semibold text-gray-700">{{ pendingImportFile?.name }}</span>
              </p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button @click="cancelImport" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">{{ tt('common.cancel') }}</button>
              <button @click="confirmImportDb" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-danger to-red-400 rounded-xl hover:shadow-lg hover:shadow-danger/30 transition-all btn-press">{{ tt('confirm.confirmImport') }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme'
import { getDb } from './db/index'
import { showToast } from './composables/useToast'
import ToastHost from './components/ToastHost.vue'
import ThemeSettings from './components/ThemeSettings.vue'
import HelpDialog from './components/HelpDialog.vue'
import { useAppearance } from './composables/useAppearance'
import { useDialogFocus } from './composables/useDialogFocus'
import { useI18n } from './composables/useI18n'
import logoUrl from './assets/logo.webp'

const route = useRoute()
const { tt, locale, setLocale } = useI18n()
// 版本号由 vite.config.js 的 define 注入（与 package.json 保持单一来源）
const appVersion = `v${__APP_VERSION__}`
// 项目主仓库（顶栏 GitHub 图标指向这里）
const REPO_URL = 'https://github.com/Emilelu/Project-Banager'
const showBackupTip = ref(false)
const showTimeTip = ref(false)

// ========== 悬浮气泡定位（fixed + 视口感知） ==========
// 侧边栏只有 240px 宽，气泡若用 absolute 居中，长文案（尤其中日）会横向溢出页面。
// 这里改成 fixed 定位，在显示前按触发元素位置算出坐标，并强制夹在视口内。
const backupTipRef = ref(null)
const clockTipRef = ref(null)
const backupTipPos = ref({ left: 0, top: 0 })
const clockTipPos = ref({ left: 0, top: 0 })

const clampToViewport = (left, top, w, h, margin = 8) => {
  const maxLeft = Math.max(margin, window.innerWidth - w - margin)
  const maxTop = Math.max(margin, window.innerHeight - h - margin)
  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  }
}

// 备份气泡：优先放按钮上方；上方放不下就放下方
const measureBackupTip = (anchorEl) => {
  if (!anchorEl) return
  const tip = backupTipRef.value
  if (!tip) return
  const a = anchorEl.getBoundingClientRect()
  const t = tip.getBoundingClientRect()
  const gap = 8
  const left = a.left + a.width / 2 - t.width / 2
  let top = a.top - t.height - gap
  if (top < 8) top = a.bottom + gap
  backupTipPos.value = clampToViewport(left, top, t.width, t.height)
}

const measureClockTip = (anchorEl) => {
  if (!anchorEl) return
  const tip = clockTipRef.value
  if (!tip) return
  const a = anchorEl.getBoundingClientRect()
  // 气泡此时可能还是 opacity-0，宽高未必可信；用实测值加下限兜底
  const w = Math.max(tip.getBoundingClientRect().width, tip.offsetWidth, 60)
  const h = Math.max(tip.getBoundingClientRect().height, tip.offsetHeight, 24)
  const gap = 6
  // 右对齐到触发元素右边，再整体夹进视口
  const left = a.right - w
  let top = a.bottom + gap
  if (top + h > window.innerHeight - 8) top = a.top - h - gap
  clockTipPos.value = clampToViewport(left, top, w, h)
}

const backupTipStyle = computed(() => ({
  left: `${backupTipPos.value.left}px`,
  top: `${backupTipPos.value.top}px`,
}))
const clockTipStyle = computed(() => ({
  left: `${clockTipPos.value.left}px`,
  top: `${clockTipPos.value.top}px`,
}))

// 显示/隐藏时重新测量（文案与语言变化会改变气泡宽高）
watch(showBackupTip, async (on) => {
  if (!on) return
  await nextTick()
  const btn = backupTipRef.value?.parentElement?.querySelector('button')
  measureBackupTip(btn)
})
// 时钟气泡：先显示（让 DOM 可测量），再同步定位，避免依赖 watch 时序
const openTimeTip = async () => {
  showTimeTip.value = true
  await nextTick()
  const box = clockTipRef.value?.parentElement
  if (box) measureClockTip(box)
}

// 顶栏语言按钮显示「点击后会切换到的语言」简称（中 → EN → 日 轮换）
// ===== 语言下拉菜单 =====
// 改成「图标 + 菜单」：用户直接点选目标语言，不必记忆轮换顺序。
// 每种语言都用其自身文字标注（中文 / English / 日本語），并附 ISO 短码便于识别。
const SUPPORTED_LOCALES = [
  { code: 'zh', label: '中文', short: 'ZH' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ja', label: '日本語', short: 'JA' },
]
const showLangMenu = ref(false)
const langBtnRef = ref(null)
const langMenuRef = ref(null)
const langMenuPos = ref({ left: 0, top: 0 })

// Teleport 后的菜单是 fixed 定位，需要按按钮位置算出坐标：
// 右对齐到按钮右边、下沿贴按钮下方；超出视口时整体夹回来。
const measureLangMenu = () => {
  const btn = langBtnRef.value
  const menu = langMenuRef.value
  if (!btn) return
  const b = btn.getBoundingClientRect()
  const w = menu?.offsetWidth || 136
  const h = menu?.offsetHeight || 120
  const gap = 6
  const margin = 8
  const left = Math.min(Math.max(b.right - w, margin), Math.max(margin, window.innerWidth - w - margin))
  let top = b.bottom + gap
  if (top + h > window.innerHeight - margin) top = b.top - h - gap
  langMenuPos.value = { left: Math.round(left), top: Math.round(top) }
}

const langMenuStyle = computed(() => ({
  left: `${langMenuPos.value.left}px`,
  top: `${langMenuPos.value.top}px`,
}))

const toggleLangMenu = async () => {
  showLangMenu.value = !showLangMenu.value
  if (showLangMenu.value) {
    await nextTick()
    measureLangMenu()
  }
}
const selectLocale = (code) => {
  setLocale(code)
  showLangMenu.value = false
}
// 点菜单外部或按 Esc 关闭
const onDocClickLang = (e) => {
  if (!showLangMenu.value) return
  if (langBtnRef.value && langBtnRef.value.contains(e.target)) return
  // 菜单已 Teleport 到 body，需单独判断是否点在菜单内
  if (langMenuRef.value && langMenuRef.value.contains(e.target)) return
  if (e.target.closest?.('[role="menu"]')) return
  showLangMenu.value = false
}
const onKeydownLang = (e) => {
  if (e.key === 'Escape' && showLangMenu.value) showLangMenu.value = false
}
// 窗口尺寸变化时重新定位（菜单打开期间）
const onResizeLang = () => {
  if (showLangMenu.value) measureLangMenu()
}
const fileInputRef = ref(null)
const showThemeSettings = ref(false)
const showHelp = ref(false)

const appearance = useAppearance()
const bgActive = computed(() => appearance.state.bgEnabled && !!appearance.state.bgUrl && !appearance.state.bgFailed)
const onToggleBg = () => { appearance.toggleBackground() }
const { theme, isDark, toggleTheme } = useTheme()

const BACKUP_KEY = 'banager_last_backup'
const lastBackupTs = ref(0)

const backupLabel = computed(() => {
  if (!lastBackupTs.value) return tt('sidebar.neverBackedUp')
  const days = Math.floor((Date.now() - lastBackupTs.value) / 86400000)
  return days <= 0 ? tt('sidebar.backupToday') : tt('sidebar.backupDaysAgo', { days })
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
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
    localStorage.setItem(BACKUP_KEY, String(Date.now()))
    lastBackupTs.value = Date.now()
    showToast(tt('toast.backupExported'))
  } catch (e) {
    console.error('导出失败:', e)
    showToast(tt('toast.exportFailed', { message: e.message }), 'error')
  }
}

// 触发文件选择
function triggerImportDb() {
  fileInputRef.value?.click()
}

// 选择备份文件后弹确认框（替代原生 confirm）
const showImportConfirm = ref(false)
const pendingImportFile = ref(null)

// 导入确认弹窗：打开聚焦弹窗内首个按钮、Esc 关闭、关闭后焦点还给触发按钮
const importConfirmRef = ref(null)
useDialogFocus({
  isOpen: () => showImportConfirm.value,
  getDialog: () => importConfirmRef.value,
  onEscape: () => cancelImport(),
})

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
    const bytes = new Uint8Array(arrayBuffer)
    const header = new TextDecoder().decode(bytes.slice(0, 16))
    if (header !== 'SQLite format 3\u0000') throw new Error(tt('toast.importNotSqlite'))
    const db = await getDb()
    const rollback = db.export()
    // 覆盖前先把当前库落一份快照文件，出问题时用户有回滚点
    try {
      const snapBlob = new Blob([rollback], { type: 'application/x-sqlite3' })
      const snapUrl = URL.createObjectURL(snapBlob)
      const tag = document.createElement('a')
      tag.href = snapUrl
      tag.download = `bangumi_pre_restore_${Date.now()}.db`
      document.body.appendChild(tag)
      tag.click()
      tag.remove()
      setTimeout(() => URL.revokeObjectURL(snapUrl), 1500)
    } catch (e) {
      console.warn('恢复前快照导出失败（继续执行恢复）:', e)
    }
    try {
      db.importDb(bytes)
      await db.save()
    } catch (importError) {
      try {
        db.importDb(rollback)
        await db.save()
      } catch { /* 旧库已在 importDb 失败路径保留 */ }
      throw importError
    }
    showToast(tt('toast.importSuccessReload'))
    setTimeout(() => window.location.reload(), 900)
  } catch (e) {
    console.error('导入失败:', e)
    showToast(tt('toast.importFailed', { message: e.message }), 'error')
  }
}

// 顶栏主题按钮已改为内联 SVG 三态图标（太阳/月亮/自动），此处旧的 emoji 映射已删除
const themeLabel = computed(() => {
  if (theme.value === 'dark') return tt('topbar.themeDark')
  if (theme.value === 'light') return tt('topbar.themeLight')
  return tt('topbar.themeAuto')
})

const navItems = [
  { path: '/watching', labelKey: 'nav.watching', icon: 'tv' },
  { path: '/remaining', labelKey: 'nav.remaining', icon: 'clock' },
  { path: '/watched', labelKey: 'nav.watched', icon: 'book' },
  { path: '/import', labelKey: 'nav.import', icon: 'upload' }
]

const currentTitle = computed(() => {
  const item = navItems.find(n => n.path === route.path)
  return item ? tt(item.labelKey) : tt('app.title')
})

const currentIcon = computed(() => {
  const item = navItems.find(n => n.path === route.path)
  return item ? item.icon : 'tv'
})

let timer = null
const onUnmountedHooks = []

// 时钟：默认只显示日期 + 星期；时间（时:分:秒）放在悬浮气泡里，减少常驻视觉噪音。
// 星期用 Intl 按当前语言取，切语言即时跟着变。
const now = ref(new Date())
const dateDisplay = computed(() => {
  const d = now.value
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
  let weekDay = ''
  try {
    weekDay = new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : locale.value, { weekday: 'short' }).format(d)
  } catch { /* 极老环境无 Intl 时省略星期 */ }
  return `${date}${weekDay ? ' ' + weekDay : ''}`
})
const timeDisplay = computed(() => {
  const d = now.value
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

const updateTime = () => { now.value = new Date() }

onMounted(() => {
  updateTime()
  lastBackupTs.value = parseInt(localStorage.getItem(BACKUP_KEY)) || 0
  timer = setInterval(updateTime, 1000)

  // 落盘兜底：写操作改为防抖合并后，页面隐藏/关闭前必须把脏数据发出去
  const flushOnHide = () => {
    if (document.visibilityState === 'hidden') {
      getDb().then((db) => db.flushNow?.()).catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', flushOnHide)
  window.addEventListener('pagehide', () => {
    getDb().then((db) => db.flushNow?.()).catch(() => {})
  })

  // 语言菜单：点外部关闭 + Esc 关闭 + 窗口变化时重新定位
  document.addEventListener('click', onDocClickLang)
  document.addEventListener('keydown', onKeydownLang)
  window.addEventListener('resize', onResizeLang)

  onUnmountedHooks.push(() => {
    document.removeEventListener('visibilitychange', flushOnHide)
    document.removeEventListener('click', onDocClickLang)
    document.removeEventListener('keydown', onKeydownLang)
    window.removeEventListener('resize', onResizeLang)
  })
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  onUnmountedHooks.forEach((fn) => fn())
})
</script>
