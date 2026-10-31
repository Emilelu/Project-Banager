<template>
  <div class="flex h-screen overflow-hidden" :class="{ 'dark-mode': isDark }">
    <!-- 侧边栏 -->
    <!-- 侧边栏可折叠：展开 15rem / 收起 4rem（只留图标）。
         宽度用 transition 平滑变化，收起后文字与分区标题隐藏、图标居中。 -->
    <aside class="flex flex-col shadow-xl relative overflow-hidden sidebar-bg transition-[width] duration-300 ease-out"
      :class="sidebarCollapsed ? 'w-16' : 'w-60'">
      <!-- 装饰圆 -->
      <!-- ⚠️ 装饰元素勿加无限动画：它们位于 .sidebar-bg（backdrop-filter）子树内，
           动画会使侧栏玻璃每帧重新捕获背景并模糊。实测动画值约 20pt GPU 占用。
           详见 .workbuddy/memory/2026-09-13.md -->
      <div class="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-white/5"></div>
      <div class="absolute bottom-20 -right-8 w-24 h-24 rounded-full bg-secondary/10"></div>

      <!-- Logo区域：logo 本身就是折叠/展开按钮。
           悬浮时 logo 淡出、面板图标淡入（同一位置、同一尺寸，无位移跳动），
           这样既省掉了独立按钮占用的垂直空间，交互入口也更容易发现。 -->
      <div class="relative z-10 border-b border-white/10"
        :class="sidebarCollapsed ? 'px-2 py-4' : 'px-4 py-4'">
        <div class="flex items-center gap-3" :class="sidebarCollapsed ? 'justify-center' : ''">
          <button type="button" @click="toggleSidebar"
            class="relative w-8 h-8 rounded-lg shrink-0 overflow-hidden group cursor-pointer
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            :class="'logo-toggle'"
            :aria-label="sidebarCollapsed ? tt('sidebar.expand') : tt('sidebar.collapse')"
            :aria-expanded="!sidebarCollapsed"
            @mouseenter="showSidebarTip($event, sidebarCollapsed ? tt('sidebar.expand') : tt('sidebar.collapse'))"
            @mouseleave="hideSidebarTip" @focus="showSidebarTip($event, sidebarCollapsed ? tt('sidebar.expand') : tt('sidebar.collapse'))"
            @blur="hideSidebarTip">
            <img :src="logoUrl" alt="PBM Logo" width="32" height="32"
              class="absolute inset-0 w-full h-full rounded-lg object-cover transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0" />
            <span class="absolute inset-0 flex items-center justify-center rounded-lg text-white/70 transition-opacity duration-200 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 bg-white/15">
              <AppIcon scale="sm" :name="sidebarCollapsed ? 'panelRight' : 'panelLeft'" />
            </span>
          </button>
          <div v-if="!sidebarCollapsed" class="min-w-0 flex-1">
            <h1 class="text-white text-base font-bold tracking-wide truncate">{{ tt('app.title') }}</h1>
            <p class="text-white/50 text-xs truncate">{{ tt('app.subtitle') }}</p>
          </div>
        </div>
      </div>

      <!-- 导航菜单（分区渲染） -->
      <nav class="flex-1 py-3 relative z-10 overflow-y-auto overflow-x-hidden"
        :class="sidebarCollapsed ? 'px-2' : 'px-3'">
        <div v-for="(group, gi) in navGroups" :key="group.key"
          :class="gi > 0 ? (sidebarCollapsed ? 'mt-3 pt-3 border-t border-white/10' : 'mt-5') : ''">
          <!-- 分区标题（收起时改为一条细分割线，已由上面的 border 表达） -->
          <div v-if="!sidebarCollapsed"
            class="px-3 mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-white/40">
            {{ tt(group.labelKey) }}
          </div>
          <router-link v-for="item in group.items" :key="item.path" :to="item.path"
            class="nav-item flex items-center rounded-xl text-sm font-medium transition-all duration-150 group"
            :class="[
              $route.path === item.path
                ? 'bg-white/20 text-white shadow-lg shadow-black/10 backdrop-blur-sm nav-active'
                : 'text-white/60 hover:bg-white/10 hover:text-white',
              sidebarCollapsed ? 'justify-center px-2 py-3.5' : 'px-4 py-3.5'
            ]"
            @mouseenter="sidebarCollapsed && showSidebarTip($event, tt(item.labelKey))"
            @mouseleave="hideSidebarTip" @focus="sidebarCollapsed && showSidebarTip($event, tt(item.labelKey))"
            @blur="hideSidebarTip">
          <!-- 导航图标与文字**都要跟随整条导航项一起缩放**（见 .nav-item）。
               踩坑：早先给图标单独加 group-hover:scale-110，文字只跟 1.02 的整体缩放，
               两者倍率不同 → 悬浮时「图标放大了、文字没跟上」，看起来没一起动。
               现在去掉图标的独立 scale，统一由 .nav-item 整体 transform 驱动。 -->
            <AppIcon scale="md" :class="sidebarCollapsed ? '' : 'mr-3'" :name="item.icon" />
            <span v-if="!sidebarCollapsed" class="truncate">{{ tt(item.labelKey) }}</span>
            <!-- 收起时用一个小红点表示当前页，替代原来的文字+圆点 -->
            <span v-if="$route.path === item.path"
              class="w-2 h-2 rounded-full bg-sakura"
              :class="sidebarCollapsed ? 'absolute top-1.5 right-1.5' : 'ml-auto'"></span>
          </router-link>
        </div>
      </nav>

      <!-- 底部数据操作：收起时改为竖排图标按钮，与导航图标列对齐 -->
      <div class="relative z-10 border-t border-white/10 space-y-2"
        :class="sidebarCollapsed ? 'px-2 py-2' : 'px-3 py-3'">
        <!-- 第三分区标题「数据」：导入 / 导出其实就在这个分区里，
             但它们已经是底部常驻按钮，不再作为导航项重复出现在 navGroups
             （旧「导入Excel」导航项已删除，Excel 导入改由这里的导入菜单触发）。
             标题样式与上面 navGroups 的分区标题保持一致；收起时同样隐藏，
             改由容器上的 border-t 作分隔。 -->
        <div v-if="!sidebarCollapsed"
          class="px-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-white/40">
          {{ tt('nav.groupData') }}
        </div>
        <!-- 导入 / 导出：两枚同级按钮，各自弹出菜单。
             「能导出什么就能导入什么」—— 导出菜单有 5 种格式，导入菜单同样列 5 种。
             原先「导出备份」与「导出数据」功能重复（.db 已在导出菜单里），已合并为一。
             ⚠️ 两枚按钮的文案必须同长度（都只留两字 / 一个词）：
             grid-cols-2 让两枚按钮天然等宽，文案长度不一就会把长的那枚截断成省略号。
             测量脚本 tests/e2e/verify-sb-*.mjs 守住「等宽 + 不截断」这条不变量。 -->
        <div :class="sidebarCollapsed ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 gap-2'">
          <!-- 导入 -->
          <div class="relative">
            <button ref="importTriggerRef" @click="toggleImportMenu"
              class="w-full flex items-center justify-center gap-1 px-2 py-2 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-xl text-xs font-medium transition-all btn-press whitespace-nowrap"
              :aria-label="tt('sidebar.import')"
              :aria-expanded="showImportMenu" aria-haspopup="menu"
              @mouseenter="sidebarCollapsed && showSidebarTip($event, tt('sidebar.import'))"
              @mouseleave="hideSidebarTip"
              @focus="sidebarCollapsed && showSidebarTip($event, tt('sidebar.import'))"
              @blur="hideSidebarTip">
              <AppIcon scale="sm" name="folderOpen" /><span v-if="!sidebarCollapsed" class="truncate">{{ tt('sidebar.importShort') }}</span>
              <AppIcon v-if="!sidebarCollapsed" scale="xs" :name="showImportMenu ? 'caretUp' : 'caretDown'" />
            </button>
            <Teleport to="body">
              <div v-if="showImportMenu" class="fixed inset-0 z-[100]" @click="showImportMenu = false"></div>
              <transition name="pop">
                <div v-if="showImportMenu" ref="importMenuRef" role="menu"
                  class="fixed z-[110] app-menu-surface rounded-xl border border-white/40 py-1 min-w-[9rem]"
                  style="--pop-origin-y: top; --pop-from-y: -6px" :style="importMenuStyle">
                  <button v-for="fmt in importFormats" :key="fmt.key" role="menuitem"
                    @click="importData(fmt.key)"
                    class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-gray-700 transition hover:bg-primary/10 whitespace-nowrap">
                    <AppIcon scale="xs" :name="fmt.icon" class="text-primary shrink-0" />
                    <span class="flex-1">{{ tt(fmt.labelKey) }}</span>
                  </button>
                </div>
              </transition>
            </Teleport>
          </div>

          <!-- 导出 -->
          <div class="relative">
            <button ref="exportTriggerRef" @click="toggleExportMenu"
              class="w-full flex items-center justify-center gap-1 px-2 py-2 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-xl text-xs font-medium transition-all btn-press whitespace-nowrap"
              :aria-label="tt('sidebar.exportData')"
              :aria-expanded="showExportMenu" aria-haspopup="menu"
              @mouseenter="sidebarCollapsed && showSidebarTip($event, tt('sidebar.exportData'))"
              @mouseleave="hideSidebarTip"
              @focus="sidebarCollapsed && showSidebarTip($event, tt('sidebar.exportData'))"
              @blur="hideSidebarTip">
              <AppIcon scale="sm" name="log" /><span v-if="!sidebarCollapsed" class="truncate">{{ tt('sidebar.exportDataShort') }}</span>
              <AppIcon v-if="!sidebarCollapsed" scale="xs" :name="showExportMenu ? 'caretUp' : 'caretDown'" />
            </button>
            <Teleport to="body">
              <div v-if="showExportMenu" class="fixed inset-0 z-[100]" @click="showExportMenu = false"></div>
              <transition name="pop">
                <div v-if="showExportMenu" ref="exportMenuRef" role="menu"
                  class="fixed z-[110] app-menu-surface rounded-xl border border-white/40 py-1 min-w-[9rem]"
                  :style="exportMenuStyle">
                  <button v-for="fmt in exportFormats" :key="fmt.key" role="menuitem"
                    @click="exportData(fmt.key)"
                    class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-gray-700 transition hover:bg-primary/10 whitespace-nowrap">
                    <AppIcon scale="xs" :name="fmt.icon" class="text-primary shrink-0" />
                    <span class="flex-1">{{ tt(fmt.labelKey) }}</span>
                  </button>
                </div>
              </transition>
            </Teleport>
          </div>
        </div>
        <!-- 上次备份时间：收进导出按钮的悬浮气泡，不再单独占一行 -->
        <Teleport to="body">
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
        <input ref="fileInputRef" type="file" accept=".db,.sqlite,.bak,.xlsx,.xls,.csv,.json,.md" class="hidden" @change="onBackupFileChosen" />
        <div v-if="!sidebarCollapsed" class="flex items-center justify-center gap-2 text-white/30 text-xs">
          <AppIcon scale="xs" name="sparkle" />
          <span>{{ appVersion }}</span>
          <AppIcon scale="xs" name="sparkle" />
        </div>
      </div>
    </aside>

    <!-- sidebar tooltip: shown only when sidebar collapsed -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="sidebarTip.show" role="tooltip"
          class="pointer-events-none fixed z-[130] px-2.5 py-1.5 rounded-lg app-menu-surface border border-white/40
                 text-xs font-medium text-gray-700 whitespace-nowrap shadow-lg"
          :style="{ left: sidebarTip.left + 'px', top: sidebarTip.top + 'px', transform: 'translateY(-50%)' }">
          {{ sidebarTip.text }}
        </div>
      </transition>
    </Teleport>

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
          <!-- 主题设置已改为侧边导航中的 /appearance 页面，顶栏不再保留入口。
               （上一轮迁移时遗漏了这个按钮，导致同一功能在顶栏和侧栏各有一个入口。） -->

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
              <!-- 与「每页条数」菜单同一套 pop 过渡；本菜单贴在按钮下方展开，原点在顶边 -->
              <transition name="pop">
                <div v-if="showLangMenu" ref="langMenuRef" role="menu"
                  class="fixed z-[110] app-menu-surface rounded-xl border border-white/40 py-1 min-w-[8.5rem]"
                  style="--pop-origin-y: top; --pop-from-y: -6px"
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
          <!-- 标签管理与主题背景已改为侧边导航中的独立页面（/tags 与 /appearance），
               顶栏不再保留入口，避免同一功能有两个入口造成困惑。 -->
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

    <!-- 结构化导入结果（csv / json / md）：只写业务数据，不覆盖数据库，故无需二次确认 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showImportResult" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showImportResult = false"></div>
      </transition>
      <transition name="modal">
        <div v-if="showImportResult" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[min(30rem,calc(100vw-2rem))] max-h-[80vh] flex flex-col border border-white/40 pointer-events-auto"
            role="dialog" aria-modal="true" aria-labelledby="import-result-title">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2 shrink-0">
              <AppIcon scale="lg" :name="importResult?.failed ? 'warning' : 'check'" />
              <h3 id="import-result-title" class="text-lg font-bold gradient-text">{{ tt('importResult.title') }}</h3>
            </div>
            <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="rounded-xl bg-white/60 border border-primary/15 py-2">
                  <div class="text-lg font-bold text-primary">{{ importResult?.imported ?? 0 }}</div>
                  <div class="text-[0.6875rem] text-gray-500">{{ tt('importResult.imported') }}</div>
                </div>
                <div class="rounded-xl bg-white/60 border border-primary/15 py-2">
                  <div class="text-lg font-bold" :class="importResult?.failed ? 'text-danger' : 'text-gray-400'">{{ importResult?.failed ?? 0 }}</div>
                  <div class="text-[0.6875rem] text-gray-500">{{ tt('importResult.failed') }}</div>
                </div>
                <div class="rounded-xl bg-white/60 border border-primary/15 py-2">
                  <div class="text-lg font-bold text-gray-700">{{ (importResult?.byTable?.watching ?? 0) + (importResult?.byTable?.remaining ?? 0) + (importResult?.byTable?.watched ?? 0) }}</div>
                  <div class="text-[0.6875rem] text-gray-500">{{ tt('importResult.total') }}</div>
                </div>
              </div>
              <div v-if="importResult?.errors?.length" class="text-xs text-danger space-y-1">
                <div v-for="(e, i) in importResult.errors.slice(0, 30)" :key="i">· {{ e }}</div>
                <div v-if="importResult.errors.length > 30" class="text-gray-500">
                  {{ tt('importResult.moreErrors', { count: importResult.errors.length - 30 }) }}
                </div>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end shrink-0">
              <button @click="showImportResult = false"
                class="btn-base btn-primary">{{ tt('common.confirm') }}</button>
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
import {
  buildExportWorkbook, buildExportCsv, buildExportJson, buildExportMarkdown,
  downloadBlob, exportTimestamp,
} from './db/excelExporter'
import { importStructured } from './db/structuredImporter'
import { showToast } from './composables/useToast'
import ToastHost from './components/ToastHost.vue'
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

// ===== 侧边栏收起态悬浮气泡 =====
// 收起后导航只剩图标，必须靠气泡告知"这个图标是什么"。
// 用 Teleport + fixed 定位：侧栏 overflow 隐藏且带 backdrop-filter，
// 在其内部做绝对定位会被裁掉。
const sidebarTip = ref({ show: false, text: '', left: 0, top: 0 })

const showSidebarTip = (e, text) => {
  if (!text) return
  const el = e?.currentTarget || e?.target
  const r = el?.getBoundingClientRect()
  if (!r) return
  sidebarTip.value = {
    show: true,
    text,
    left: Math.round(r.right + 8),
    top: Math.round(r.top + r.height / 2),
  }
}

const hideSidebarTip = () => {
  sidebarTip.value = { ...sidebarTip.value, show: false }
}

/**
 * 「导出备份」按钮获得焦点（键盘 Tab 或点击）时的气泡处理。
 * 展开态显示「上次备份时间」提示，收起态显示菜单名称（此时按钮没有可见文字）。
 * 两者互斥，避免同一位置叠两个气泡。
 */
const onExportBackupFocus = (e) => {
  if (sidebarCollapsed.value) {
    showSidebarTip(e, tt('sidebar.exportBackup'))
  } else {
    showBackupTip.value = true
  }
}

// ===== 导出数据（Excel / JSON）=====
// 与「导出备份」(.db) 区分：备份用于整库迁移恢复，这里是给人看/给别的工具处理的表格
const showExportMenu = ref(false)
const exportMenuRef = ref(null)
const exportMenuPos = ref({ left: 0, top: 0 })
// 展开方向：向上弹（菜单在按钮上方）时原点在底边、起始位移朝下；
// 向下弹时相反。写入 CSS 变量，让 pop 动画始终"从按钮那一侧长出来"。
const exportMenuDir = ref('up')
const exportTriggerRef = ref(null)

const exportMenuStyle = computed(() => ({
  left: `${exportMenuPos.value.left}px`,
  top: `${exportMenuPos.value.top}px`,
  '--pop-origin-y': exportMenuDir.value === 'up' ? 'bottom' : 'top',
  '--pop-from-y': exportMenuDir.value === 'up' ? '6px' : '-6px',
}))

// 菜单 Teleport 到 body，需按触发按钮位置算坐标（右对齐、贴上方）
const measureExportMenu = () => {
  const btn = exportTriggerRef.value
  const menu = exportMenuRef.value
  if (!btn) return
  const b = btn.getBoundingClientRect()
  const w = menu?.offsetWidth || 150
  const h = menu?.offsetHeight || 90
  const gap = 6
  const margin = 8
  const left = Math.min(Math.max(b.left, margin), Math.max(margin, window.innerWidth - w - margin))
  // 优先向上弹（侧边栏按钮贴近屏幕底部）；空间不足才向下，并同步方向变量
  let top = b.top - h - gap
  let dir = 'up'
  if (top < margin) {
    top = b.bottom + gap
    dir = 'down'
  }
  exportMenuDir.value = dir
  exportMenuPos.value = { left: Math.round(left), top: Math.round(top) }
}

// ===== 导入菜单 =====
// 与导出菜单对等：能导出什么就能导入什么。
const showImportMenu = ref(false)
const importMenuRef = ref(null)
const importTriggerRef = ref(null)
const importMenuPos = ref({ left: 0, top: 0 })

const importMenuStyle = computed(() => ({
  left: `${importMenuPos.value.left}px`,
  top: `${importMenuPos.value.top}px`,
}))

const measureImportMenu = () => {
  const btn = importTriggerRef.value
  const menu = importMenuRef.value
  if (!btn) return
  const b = btn.getBoundingClientRect()
  const w = menu?.offsetWidth || 150
  const h = menu?.offsetHeight || 90
  const gap = 6
  const margin = 8
  const left = Math.min(Math.max(b.left, margin), Math.max(margin, window.innerWidth - w - margin))
  let top = b.top - h - gap
  if (top < margin) top = b.bottom + gap
  importMenuPos.value = { left: Math.round(left), top: Math.round(top) }
}

const toggleImportMenu = async () => {
  showImportMenu.value = !showImportMenu.value
  if (showImportMenu.value) {
    showExportMenu.value = false
    await nextTick()
    measureImportMenu()
  }
}

const toggleExportMenu = async () => {
  showExportMenu.value = !showExportMenu.value
  if (showExportMenu.value) {
    showImportMenu.value = false
    await nextTick()
    measureExportMenu()
  }
}

// 拉取三类数据 → 交给导出器
const collectAllData = async () => {
  const db = await getDb()
  return {
    watching: db.getAllWatching() || [],
    remaining: db.getAllRemaining() || [],
    watched: db.getAllWatched() || [],
  }
}

/**
 * 导出格式清单。一个按钮 + 下拉菜单即可覆盖全部格式，避免侧边栏堆一排按钮。
 * 顺序按「最常用 → 最特殊」排列：xlsx 给 Excel 看，md 给笔记，db 是整库备份。
 */
const exportFormats = [
  { key: 'xlsx', labelKey: 'sidebar.exportXlsx', icon: 'log' },
  { key: 'csv', labelKey: 'sidebar.exportCsv', icon: 'log' },
  { key: 'json', labelKey: 'sidebar.exportJson', icon: 'note' },
  { key: 'md', labelKey: 'sidebar.exportMd', icon: 'note' },
  { key: 'db', labelKey: 'sidebar.exportDb', icon: 'download' },
]

/**
 * 导入格式清单 —— 与导出格式一一对应（能导出什么就能导入什么）。
 * 目前 xlsx 走既有的 excelImporter；db 走整库恢复；
 * csv/json/md 走「结构化回灌」（见 db/structuredImporter.js）。
 */
const importFormats = [
  { key: 'xlsx', labelKey: 'sidebar.importXlsx', icon: 'log', accept: '.xlsx,.xls' },
  { key: 'csv', labelKey: 'sidebar.importCsv', icon: 'log', accept: '.csv' },
  { key: 'json', labelKey: 'sidebar.importJson', icon: 'note', accept: '.json' },
  { key: 'md', labelKey: 'sidebar.importMd', icon: 'note', accept: '.md' },
  { key: 'db', labelKey: 'sidebar.importDb', icon: 'download', accept: '.db,.sqlite,.bak' },
]

const importData = (kind) => {
  showImportMenu.value = false
  const fmt = importFormats.find(f => f.key === kind)
  if (!fmt) return
  // 复用同一个隐藏 input，只切换 accept 与模式标记
  importMode.value = kind
  if (fileInputRef.value) {
    fileInputRef.value.accept = fmt.accept
    fileInputRef.value.value = ''
    fileInputRef.value.click()
  }
}

const exportData = async (kind) => {
  showExportMenu.value = false
  try {
    const ts = exportTimestamp()

    // .db 是整库备份：走 database 的 export()，与「导出备份」完全等价
    if (kind === 'db') {
      await exportDb()
      return
    }

    const data = await collectAllData()
    const total = data.watching.length + data.remaining.length + data.watched.length
    if (total === 0) {
      showToast(tt('toast.noDataToExport'), 'warning')
      return
    }

    switch (kind) {
      case 'xlsx': {
        const bytes = buildExportWorkbook(data)
        downloadBlob(
          new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
          `bangumi_data_${ts}.xlsx`,
        )
        showToast(tt('toast.exportedXlsx', { count: total }))
        break
      }
      case 'csv': {
        // 带 BOM，Excel 打开不会把中文显示成乱码
        downloadBlob(buildExportCsv(data), `bangumi_data_${ts}.csv`, 'text/csv;charset=utf-8')
        showToast(tt('toast.exportedCsv', { count: total }))
        break
      }
      case 'json': {
        downloadBlob(buildExportJson(data), `bangumi_data_${ts}.json`, 'application/json')
        showToast(tt('toast.exportedJson', { count: total }))
        break
      }
      case 'md': {
        downloadBlob(buildExportMarkdown(data), `bangumi_data_${ts}.md`, 'text/markdown;charset=utf-8')
        showToast(tt('toast.exportedMd', { count: total }))
        break
      }
      default:
        break
    }
  } catch (e) {
    console.error('[export] failed:', e)
    showToast(tt('toast.exportDataFailed', { message: e?.message || 'unknown' }), 'error')
  }
}

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
// 当前导入格式（'db' | 'xlsx' | 'csv' | 'json' | 'md'），由导入菜单设置，
// 文件选择回调据此决定走整库恢复还是结构化回灌。
const importMode = ref('db')
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
// 结构化导入（csv/json/md）的结果弹窗：逐条汇总成功/失败数，失败原因可展开查看
const showImportResult = ref(false)
const importResult = ref(null)
const pendingImportFile = ref(null)

// 导入确认弹窗：打开聚焦弹窗内首个按钮、Esc 关闭、关闭后焦点还给触发按钮
const importConfirmRef = ref(null)
useDialogFocus({
  isOpen: () => showImportConfirm.value,
  getDialog: () => importConfirmRef.value,
  onEscape: () => cancelImport(),
})

/**
 * 选定文件后的分派：
 *   db         → 走整库恢复确认弹窗（覆盖前会导出一份回滚快照）
 *   xlsx       → 走既有 Excel 导入页（它带完整的预览/冲突处理 UI）
 *   csv/json/md→ 走结构化回灌
 * 用户在菜单里选的是格式，这里据此决定后续流程，避免"选 csv 却按 db 处理"。
 */
function onBackupFileChosen(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const mode = importMode.value || 'db'

  if (mode !== 'db') {
    // 非整库格式：交给对应的导入流程
    handleStructuredImport(file, mode)
    if (fileInputRef.value) fileInputRef.value.value = ''
    return
  }

  pendingImportFile.value = file
  showImportConfirm.value = true
}

function cancelImport() {
  showImportConfirm.value = false
  pendingImportFile.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

/**
 * 结构化回灌（csv / json / md）。
 * 与整库恢复不同：这些格式只包含业务数据，不覆盖数据库文件本身，
 * 因此不需要「覆盖确认」弹窗，而是直接逐条写入并汇报结果。
 */
async function handleStructuredImport(file, kind) {
  try {
    const res = await importStructured(file, kind)
    importResult.value = res
    showImportResult.value = true
  } catch (e) {
    console.error('[structured import] failed:', e)
    showToast(tt('toast.importFailed', { message: e?.message || 'unknown' }), 'error')
  }
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

/**
 * 侧边导航分区（可滚动区只放「番单」与「设置」两组）：
 *   lists     — 正在追番 / 等待更新 / 已看历史（日常主流程，最高频）
 *   appearance— 主题与背景 / 标签管理（低频设置项）
 *
 * 第三组「数据」（导入 / 导出）**故意不在 navGroups 里**：
 * 那两个入口是固定在侧栏底部的常驻按钮（见模板底部数据区），
 * 若再作为导航项列一次就是同一功能两个入口。
 * 因此旧的「导入Excel」导航项（/import）已从这里移除 —— 路由与 ImportView.vue
 * 仍然保留（老书签 / 直链仍可打开），只是不再从侧栏进入；
 * Excel 导入统一走底部「导入」菜单 → Excel 表格 (.xlsx)。
 *
 * 分区让「每天用的」和「偶尔调的」在视觉上分层，不再是一长条平铺菜单。
 */
const navGroups = [
  {
    key: 'lists',
    labelKey: 'nav.groupLists',
    items: [
      { path: '/watching', labelKey: 'nav.watching', icon: 'tv' },
      { path: '/remaining', labelKey: 'nav.remaining', icon: 'clock' },
      { path: '/watched', labelKey: 'nav.watched', icon: 'book' },
    ],
  },
  {
    key: 'appearance',
    labelKey: 'nav.groupAppearance',
    items: [
      { path: '/appearance', labelKey: 'nav.appearance', icon: 'palette' },
      { path: '/tags', labelKey: 'nav.tags', icon: 'bookmark' },
    ],
  },
]

// 扁平化后用于「当前页标题/图标」查找
const navItems = navGroups.flatMap(g => g.items)

/**
 * 仍保留路由、但不再出现在侧栏的页面（仅用于顶栏标题/图标解析）。
 * /import：Excel 导入已并入侧栏底部「导入」菜单，侧栏不再有导航项，
 * 但直接访问 #/import（老书签）时仍要显示正确的标题与图标，不能掉成 app.title。
 */
const orphanNavItems = [
  { path: '/import', labelKey: 'nav.import', icon: 'upload' },
]
const allNavItems = [...navItems, ...orphanNavItems]

// ===== 侧边栏折叠 =====
// 持久化到 localStorage：用户收起后重开页面仍是收起状态，不必每次再点。
const SIDEBAR_KEY = 'banager_sidebar_collapsed'
const sidebarCollapsed = ref(false)
try {
  sidebarCollapsed.value = localStorage.getItem(SIDEBAR_KEY) === '1'
} catch { /* localStorage 不可用时保持默认展开 */ }

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
  try {
    localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed.value ? '1' : '0')
  } catch { /* ignore */ }
}

const currentTitle = computed(() => {
  const item = allNavItems.find(n => n.path === route.path)
  return item ? tt(item.labelKey) : tt('app.title')
})

const currentIcon = computed(() => {
  const item = allNavItems.find(n => n.path === route.path)
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
