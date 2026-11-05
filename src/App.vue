<template>
  <div class="flex h-screen overflow-hidden" :class="{ 'dark-mode': isDark }">
    <!-- 侧边栏 -->
    <!-- 侧边栏可折叠：展开 15rem / 收起 4rem（只留图标）。
         宽度用 transition 平滑变化，收起后文字与分区标题隐藏、图标居中。 -->
    <aside class="app-sidebar flex flex-col shadow-xl relative overflow-hidden sidebar-bg transition-[width] duration-300 ease-out"
      :class="[sidebarCollapsed ? 'w-16' : 'w-60', { 'sidebar-is-collapsed': sidebarCollapsed }]"
      :style="{ '--sb-w': sidebarCollapsed ? '4rem' : '15rem' }">
      <!-- 装饰圆 -->
      <!-- ⚠️ 装饰元素勿加无限动画：它们位于 .sidebar-bg（backdrop-filter）子树内，
           动画会使侧栏玻璃每帧重新捕获背景并模糊。实测动画值约 20pt GPU 占用。
           详见 .workbuddy/memory/2026-09-13.md -->
      <div class="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-white/5"></div>
      <div class="absolute bottom-20 -right-8 w-24 h-24 rounded-full bg-secondary/10"></div>

      <!-- Logo区域：logo 本身就是折叠/展开按钮。
           悬浮时 logo 淡出、面板图标淡入（同一位置、同一尺寸，无位移跳动），
           这样既省掉了独立按钮占用的垂直空间，交互入口也更容易发现。 -->
      <div class="relative z-10 border-b border-white/10 h-14 flex items-center"
        :class="sidebarCollapsed ? 'px-2 justify-center' : 'px-4'">
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
            class="sidebar-section-label px-3 mb-1.5 text-[0.7857rem] font-semibold tracking-wide text-white/60">
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
            :aria-label="sidebarCollapsed ? tt(item.labelKey) : null"
            @mouseenter="sidebarCollapsed && showSidebarTip($event, tt(item.labelKey))"
            @mouseleave="hideSidebarTip" @focus="sidebarCollapsed && showSidebarTip($event, tt(item.labelKey))"
            @blur="hideSidebarTip">
          <!-- 导航图标与文字**都要跟随整条导航项一起缩放**（见 .nav-item）。
               踩坑：早先给图标单独加 group-hover:scale-110，文字只跟 1.02 的整体缩放，
               两者倍率不同 → 悬浮时「图标放大了、文字没跟上」，看起来没一起动。
               现在去掉图标的独立 scale，统一由 .nav-item 整体 transform 驱动。 -->
            <AppIcon scale="md" :class="sidebarCollapsed ? 'shrink-0' : 'mr-3 shrink-0'" :name="item.icon" />
            <!-- 导航文案**不截断**：日语/德语的导航名明显更长（「インポート & エクスポート」
                 远比「导入 & 导出」宽），用 truncate 会被截成「インポート & エクス…」。
                 这里改成「按可用宽度弹性缩放字号」——文字永远完整显示，
                 只在必要时把字号从 0.875rem 平滑缩到 0.75rem。见 .nav-label。 -->
            <span v-if="!sidebarCollapsed" class="nav-label">{{ tt(item.labelKey) }}</span>
            <!-- 收起时用一个小红点表示当前页，替代原来的文字+圆点 -->
            <span v-if="$route.path === item.path"
              class="w-2 h-2 rounded-full bg-sakura"
              :class="sidebarCollapsed ? 'absolute top-1.5 right-1.5' : 'ml-auto'"></span>
          </router-link>
        </div>
      </nav>

      <!-- 底部：壁纸开关 + 深浅切换（原「导入/导出」按钮已迁到 /transfer 页面）。
           这两个原本在顶栏右侧，按要求移到这里；「数据」分区标题也随之删除
           （导入导出已不是底部按钮，而是「设置」分区下的一个导航项）。 -->
      <div class="sidebar-footer relative z-10 border-t border-white/10"
        :class="sidebarCollapsed ? 'px-2 py-2' : 'px-2.5 py-2.5'">
        <div class="sidebar-footer-actions" :class="sidebarCollapsed ? 'flex flex-col gap-1' : 'grid grid-cols-2 gap-1.5'">
          <!-- 壁纸背景开关。
               样式与上方导航项（.nav-item）保持一致：
                 · 收起态：justify-center px-2 py-3.5，配色 text-white/60 hover:bg-white/10 hover:text-white
                 · 展开态：铺满 px-2 py-2 的胶囊按钮
               气泡方向同样按侧栏状态区分（收起→右侧，展开→正上方显示当前状态）。 -->
          <button @click="onToggleBg"
            class="flex items-center rounded-xl font-medium transition-all duration-150 whitespace-nowrap"
            :class="[
              sidebarCollapsed
                ? 'nav-item w-full justify-center px-2 py-3.5 text-white/60 hover:bg-white/10 hover:text-white'
                : 'w-full justify-center gap-1.5 px-2 py-2 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-xl text-sm btn-press',
              { 'opacity-50': !bgActive }
            ]"
            :aria-pressed="appearance.state.bgEnabled ? 'true' : 'false'"
            :aria-label="bgActive ? tt('topbar.bgOff') : tt('topbar.bgOn')"
            @mouseenter="showBottomBtnTip($event, tt('sidebar.bgToggle'), 'bg')"
            @mouseleave="hideSidebarTip"
            @focus="showBottomBtnTip($event, tt('sidebar.bgToggle'), 'bg')"
            @blur="hideSidebarTip">
            <AppIcon scale="sm" :name="bgActive ? 'image' : 'imageOff'" />
            <span v-if="!sidebarCollapsed" class="truncate">{{ tt('sidebar.bgToggle') }}</span>
          </button>

          <!-- 深浅模式切换（浅/深/自动 三态循环）。样式与上方导航项一致，见壁纸按钮的说明。
               气泡方向同上：收起态走右侧，展开态在正上方显示当前主题状态。 -->
          <button @click="toggleTheme"
            class="flex items-center rounded-xl font-medium transition-all duration-150 whitespace-nowrap"
            :class="[
              sidebarCollapsed
                ? 'nav-item w-full justify-center px-2 py-3.5 text-white/60 hover:bg-white/10 hover:text-white'
                : 'w-full justify-center gap-1.5 px-2 py-2 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-xl text-sm btn-press'
            ]"
            :aria-label="themeLabel"
            @mouseenter="showBottomBtnTip($event, tt('sidebar.themeToggle'), 'theme')"
            @mouseleave="hideSidebarTip"
            @focus="showBottomBtnTip($event, tt('sidebar.themeToggle'), 'theme')"
            @blur="hideSidebarTip">
            <AppIcon scale="sm" :name="themeIconName" />
            <span v-if="!sidebarCollapsed" class="truncate">{{ tt('sidebar.themeToggle') }}</span>
          </button>
        </div>
        <div v-if="!sidebarCollapsed" class="mt-2 flex items-center justify-center gap-2 text-white/30 text-xs">
          <AppIcon scale="xs" name="sparkle" />
          <span>{{ appVersion }}</span>
          <AppIcon scale="xs" name="sparkle" />
        </div>
      </div>
    </aside>

    <!-- sidebar tooltip: shown only when sidebar collapsed（侧栏收起态气泡）。
         placement 决定垂直基准：right 模式用 translateY(-50%) 垂直居中，
         top 模式不再居中（坐标已是气泡顶边，居中会让它整体上移压到按钮上）。 -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="sidebarTip.show" id="sidebar-tip" role="tooltip"
          class="pointer-events-none fixed z-[130] px-2.5 py-1.5 rounded-lg app-menu-surface border border-white/40
                 text-xs font-medium text-gray-700 whitespace-nowrap shadow-lg"
          :style="{
            left: sidebarTip.left + 'px',
            top: sidebarTip.top + 'px',
            transform: sidebarTip.placement === 'top' ? 'none' : 'translateY(-50%)',
          }">
          {{ sidebarTipLiveText }}
        </div>
      </transition>
    </Teleport>

    <!-- 主内容区 -->
    <div class="app-content flex-1 min-w-0 flex flex-col overflow-hidden">
      <!-- 顶部栏 -->
      <header class="app-header h-14 flex items-center justify-between px-6 glass shadow-sm relative">
        <!-- 页面标题 + 番单计数：跟随路由做淡入淡出 + 轻微位移。
             图标与文字**放在同一个过渡块里**，保证「同时淡出、同时淡入」。
             计数徽章（本年 N 部 / 总计 N 部 / 共 N 条）也放在这里，
             让用户一眼看到当前页的规模，而不用在卡片内部再占一行（用户要求）。
             mode="out-in"：旧标题先退场，新标题再进场，杜绝两块标题重叠挤压布局。
             不做读屏播报（页面内内容本身已变化），故不加 aria-live。 -->
        <transition name="title-swap" mode="out-in">
          <div :key="currentTitle" class="topbar-heading flex items-center gap-3 min-w-0">
            <h1 class="topbar-title text-lg font-bold gradient-text flex items-center gap-2" :title="currentTitle">
              <AppIcon scale="md" :name="currentIcon" />
              <!-- 文字必须包一层 span：h1 是 flex 容器，text-overflow 对匿名 flex 项
                   不生效；顶栏空间不足时标题先让位收缩（.topbar-title，shrink 999 +
                   4rem 下限），省略号由 .topbar-title-text 呈现，:title 悬浮兜底全名。 -->
              <span class="topbar-title-text">{{ currentTitle }}</span>
            </h1>
            <!-- 计数徽章：视觉与顶栏其它元素协调 —— 高度 24px、圆角 8px、
                 字号 11.5px、左右内边距 8px，与顶栏按钮的 36px 图标块并排不突兀 -->
            <div v-if="topbarStats.length" class="topbar-stats flex items-center gap-2">
              <span v-for="(s, i) in topbarStats" :key="i" class="topbar-stat"
                :class="s.tone === 'neutral' ? 'is-neutral' : ''">{{ s.text }}</span>
            </div>

            <!-- 当前选中：原本在卡片里独占一行，用户要求移到顶栏标题右侧。
                 复用 .topbar-stat 徽章样式，前面加一个状态圆点。
                 不放进上面的 title-swap transition 里 —— 它随选中项变化，
                 但页面标题不变时不该整块重放动画。
                 过渡用独立的 topbar-sel（不用按钮组的 sel-anim）：sel-anim 离场会把元素
                 position:absolute 摆到 flex 容器内容盒起点（实测整块瞬移到标题左侧盖住
                 标题才消失）；topbar-sel 留在文档流内收拢（max-width→0），右侧元素平滑左移。
                 v-tip 显示完整记录名 —— 名称徽章按省略策略可能截断，气泡兜底可读性。 -->
            <transition name="topbar-sel">
              <div v-if="topbarSelection" class="topbar-selection flex items-center gap-2 min-w-0"
                v-tip="topbarSelection.items?.[0]?.text || topbarSelection.name">
                <span class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                  :class="topbarSelection.dot === 'danger' ? 'bg-danger' : 'bg-primary'"></span>
                <span class="topbar-selection-name text-xs text-gray-500">{{ topbarSelection.name }}</span>
                <span v-for="(s, i) in topbarSelection.items" :key="i" class="topbar-stat"
                  :class="s.tone === 'neutral' ? 'is-neutral' : ''">{{ s.text }}</span>
              </div>
            </transition>
          </div>
        </transition>
        <!-- 页面内容控件（搜索 / 标签筛选 / 年份）：由各 view 通过 setPageControls 写入
             （视觉审计 A-01：等番/已看页第一卡迁入顶栏）。组件由 view 提供（markRaw 存入
             store），状态与过滤/年份逻辑留在 view，这里只负责渲染入口。
             过渡与上面的 title-swap 同语言：路由切换时旧控件块先淡出、新控件再淡入，
             mode="out-in" 防止两块控件重叠挤压布局；key 用 route.path 保证跨页隔离。 -->
        <transition name="title-swap" mode="out-in">
          <div :key="route.path" class="topbar-controls flex items-center gap-3 min-w-0">
            <component v-for="c in topbarControls" :key="c.key" :is="c.component" v-bind="c.props" />
          </div>
        </transition>
        <!-- 页面操作按钮：由各 view 通过 setPageActions 写入，统一显示在顶栏。
             用户要求把工具栏按钮从页面内移到这里，正文区只留搜索/筛选等内容控件。
             顶栏空间有限，按钮以图标形态渲染，文案走 v-tip 气泡。 -->
        <transition-group name="sel-anim" tag="div" class="topbar-actions flex items-center gap-1.5 mr-auto ml-4">
          <button v-for="a in topbarActions" :key="a.key" @click="a.onClick()"
            class="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-all duration-150"
            :class="a.danger
              ? 'text-danger hover:bg-danger/10'
              : 'text-gray-500 hover:bg-primary/10 hover:text-primary'"
            :aria-label="a.label" v-tip="a.label">
            <AppIcon scale="sm" :name="a.icon" />
          </button>
        </transition-group>
        <div v-if="topbarActions.length" class="topbar-more">
          <button ref="pageActionsBtnRef" type="button" @click="togglePageActionsMenu"
            class="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-gray-500 hover:bg-primary/10"
            :aria-label="tt('topbar.moreActions')" :aria-expanded="showPageActionsMenu" aria-haspopup="menu"
            v-tip="tt('topbar.moreActions')">
            <svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
          <Teleport to="body">
            <div v-if="showPageActionsMenu" class="fixed inset-0 z-[100]" @click="showPageActionsMenu = false"></div>
            <transition name="pop">
              <div v-if="showPageActionsMenu" ref="pageActionsMenuRef" role="menu" :aria-label="tt('topbar.moreActions')"
                class="app-menu-panel fixed z-[110] topbar-actions-menu" :style="pageActionsMenuStyle"
                @keydown="onPageActionsKeydown">
                <button v-for="a in topbarActions" :key="a.key" type="button" role="menuitem"
                  @click="runPageAction(a)" :class="a.danger ? 'text-danger' : 'text-gray-700'">
                  <AppIcon scale="sm" :name="a.icon" /><span>{{ a.label }}</span>
                </button>
              </div>
            </transition>
          </Teleport>
        </div>

        <div class="topbar-utilities flex items-center gap-3">
          <!-- 壁纸开关与深浅切换已按要求移到侧边栏左下角（替代原「导入/导出」按钮位置），
               顶栏不再保留这两个入口，避免同一功能两处重复。 -->
          <!-- 标签管理与主题背景已改为侧边导航中的独立页面（/tags 与 /appearance），
               顶栏不再保留入口，避免同一功能有两个入口造成困惑。 -->
          <!-- ===== 需求一：语言按钮与 GitHub 按钮互换横向位置 =====
               原顺序：语言(1209) → 帮助(1251) → GitHub(1293) → 时钟(1335)。
               互换「彼此的位置」= 语言占 GitHub 的格子、GitHub 占语言的格子；
               两块都是 36px 宽，所以右侧组总宽不变 → 帮助与时钟零位移。
               用 flex order 显式插槽（默认 order=0）：1=GitHub(原语言位 1209) 2=帮助(原位 1251)
               3=语言(原 GitHub 位 1293) 4=时钟(原位 1335)。
               注：只把语言挪到 GitHub 右侧虽然也反了左右关系，却会把帮助挤左 42px，
               那不叫"互换彼此位置"，故用 order 精确占位。 -->
          <button @click="showHelp = true"
            style="order: 2"
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
          <!-- GitHub 仓库链接：外链按钮，样式与其它顶栏图标一致。
               需求一：order 1 —— 落到语言原来的槽位（右侧组最左，帮助左边）。 -->
          <a :href="REPO_URL" target="_blank" rel="noopener noreferrer"
            style="order: 1"
            class="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-primary/10 btn-press group"
            :aria-label="tt('topbar.github')"
            :title="tt('topbar.github')">
            <AppIcon scale="md" name="github" class="transition-transform duration-300 group-hover:scale-110" />
          </a>
          <!-- 语言切换：图标按钮 + 下拉菜单（直接选目标语言，比轮换更直观）。
               需求一：order 2 —— 占用 GitHub 原来的槽位（帮助与时钟之间）。
               互换后：GitHub 1251 → 语言 1293，帮助/时钟原地不动。 -->
          <div class="relative" style="order: 2">
            <button ref="langBtnRef" @click="(e) => toggleLangMenu(e)"
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
              <!-- 与「每页条数」菜单同一套 pop 过渡；本菜单贴在按钮下方展开，原点在顶边。
                   视觉审计 A-36：这里原来手拼 `app-menu-surface rounded-xl border py-1
                   min-w-[8.5rem]`，是全站唯一没接入 .app-menu-panel 规范的下拉菜单
                   （实测 119px 宽 / 14px 字号 / 31.5px 行高，其余菜单 168/12.25/39.5）。
                   改用统一面板类后宽度、字号、项高自动与其它菜单一致。 -->
              <transition name="pop">
                <div v-if="showLangMenu" ref="langMenuRef" role="menu"
                  class="fixed z-[110] app-menu-panel lang-menu-panel"
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
          <!-- 时钟：常驻只显示日期；悬浮/聚焦时气泡显示时分秒。
               需求二：气泡定位锚点从「时钟元素」改为「鼠标指针」——
               指针进入时记录坐标，之后在时钟区域内的每次 mousemove 都刷新记录值，
               气泡恒在指针正下方（水平以指针为中心），并做视口夹取 / 下边翻上。 -->
          <div class="topbar-clock relative" tabindex="0" style="order: 4"
            @mouseenter="onClockEnter"
            @mousemove="onClockMove"
            @mouseleave="showTimeTip = false"
            @focus="onClockFocus" @blur="showTimeTip = false"
            @click="openTimeTip"
            role="group" :aria-label="dateDisplay"
            aria-describedby="clock-tip">
            <div class="text-sm text-gray-500 font-medium cursor-default select-none">
              {{ dateDisplay }}
            </div>
            <Teleport to="body">
              <!-- 时钟气泡：外观（材质/描边/阴影/圆角/内边距/字号/动画）完全不写在这里，
                   统一由 style.css 的 `#clock-tip` 一段决定，与 #sidebar-tip 和 v-tip
                   生成的 [id^=hover-tip] 是**同一份**声明 —— 全站气泡只有一套皮肤。
                   这里仅保留 tabular-nums：秒数每跳一次宽度都会变，等宽数字能避免
                   气泡左右抖动，属于可读性而非风格差异。

                   视觉审计 A-60：原来用 opacity-0 常驻 body（0,0 处 63×30、
                   内容每秒刷新），读屏/辅助技术查询会先命中这个不可见节点。
                   改为 v-if + fade：隐藏时 DOM 里干脆不存在（与 v-tip 同策略），
                   显示时仍有原来的 0.15s 淡入。 -->
              <transition name="fade">
                <div v-if="showTimeTip" id="clock-tip" ref="clockTipRef" role="tooltip"
                  class="pointer-events-none fixed z-[120] whitespace-nowrap tabular-nums"
                  :style="clockTipStyle">
                  {{ timeDisplay }}
                </div>
              </transition>
            </Teleport>
          </div>
        </div>
      </header>

      <!-- 页面内容 -->
      <!-- 首屏入场：main 挂载时加 .page-appear 播一次（0.45s spring 上浮淡入），
           动画结束即移除，之后的页面切换仍由上面的 <transition name="fade"> 负责。 -->
      <main ref="mainRef" class="flex-1 overflow-auto px-6 py-3" :class="{ 'page-appear': pageAppearing }">
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

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme'
import { getDb } from './db/index'
import ToastHost from './components/ToastHost.vue'
import HelpDialog from './components/HelpDialog.vue'
import { useAppearance } from './composables/useAppearance'
import { useDialogFocus } from './composables/useDialogFocus'
import { useI18n } from './composables/useI18n'
// 顶栏计数徽章共享状态：各页写入，顶栏读取（见 usePageStats.js）
// pageControls：各页写入的**内容控件组件**（搜索/标签/年份），顶栏渲染入口（A-01）
import { pageStats, pageSelection, pageControls, usePageActions, usePageControls, clearPageControls } from './composables/usePageStats'
import logoUrl from './assets/logo.webp'

const route = useRoute()
const { tt, locale, setLocale } = useI18n()
// 版本号由 vite.config.js 的 define 注入（与 package.json 保持单一来源）
const appVersion = `v${__APP_VERSION__}`
// 项目主仓库（顶栏 GitHub 图标指向这里）
const REPO_URL = 'https://github.com/Emilelu/Project-Banager'
const showTimeTip = ref(false)

// ===== 侧边栏收起态悬浮气泡 =====
// 收起后导航只剩图标，必须靠气泡告知"这个图标是什么"。
// 用 Teleport + fixed 定位：侧栏 overflow 隐藏且带 backdrop-filter，
// 在其内部做绝对定位会被裁掉。
//
// 方向（placement）：
//   'right' — 默认，贴在按钮右侧并垂直居中（nav 项 / logo 用这个）
//   'top'   — 贴在按钮正上方、水平居中（侧栏左下角的「壁纸」「主题」用这个，
//             它们贴屏幕底部，气泡放右侧会挤在外面，且要"在上方显示当前状态"）
// 纵向空间不足时（气泡顶边会超出视口）自动翻到按钮下方，保证任何尺寸下都不溢出。
const sidebarTip = ref({ show: false, text: '', left: 0, top: 0, placement: 'right' })
// 上方模式下气泡以「中心点」为 left、以「底边」为 top 的候选值；
// 真正写入前要先拿到气泡实测宽高，故记下锚点按钮的矩形供 measureSidebarTipTop 使用。
let sidebarTipAnchor = null

/**
 * 视觉审计 A-35：侧栏气泡此前从不与触发元素建立 aria 关系（#sidebar-tip 有
 * role=tooltip，但触发元素没有 aria-describedby），读屏永远读不到气泡内容。
 * 这里照 useHoverTip.js:230-232 的做法：显示时给触发元素挂 aria-describedby，
 * 隐藏时还原原来的值（按钮若本来就有描述，不能把它覆盖掉）。
 */
let sidebarTipDescribedEl = null
let sidebarTipPrevDescribedby = null
const describeSidebarTip = (el) => {
  if (!el || typeof el.setAttribute !== 'function') return
  if (sidebarTipDescribedEl === el) return
  releaseSidebarTipDescription()
  sidebarTipPrevDescribedby = el.getAttribute('aria-describedby')
  el.setAttribute('aria-describedby', sidebarTipPrevDescribedby ? `${sidebarTipPrevDescribedby} sidebar-tip` : 'sidebar-tip')
  sidebarTipDescribedEl = el
}
const releaseSidebarTipDescription = () => {
  if (!sidebarTipDescribedEl) return
  if (sidebarTipPrevDescribedby) sidebarTipDescribedEl.setAttribute('aria-describedby', sidebarTipPrevDescribedby)
  else sidebarTipDescribedEl.removeAttribute('aria-describedby')
  sidebarTipDescribedEl = null
  sidebarTipPrevDescribedby = null
}

/**
 * 上方模式定位（需求三）：气泡水平居中于按钮、贴在按钮正上方。
 * 纵向空间不够（气泡顶边会超出视口）时翻到按钮下方，保证不纵向溢出；
 * 横向同样夹进视口 —— 收起态侧栏只有 64px，而「壁纸/主题」的气泡文案
 * （尤其中日文的「壁纸背景已开启」）比按钮宽得多，纯居中必然会探出屏幕左边，
 * 因此夹取后气泡会靠右停靠（此时右边缘仍在侧栏内，视觉上仍然"在按钮上方"）。
 */
const measureSidebarTipTop = () => {
  const a = sidebarTipAnchor
  const tip = document.getElementById('sidebar-tip')
  if (!a) return
  const w = Math.max(tip?.offsetWidth || 0, tip?.getBoundingClientRect().width || 0)
  const h = Math.max(tip?.offsetHeight || 0, tip?.getBoundingClientRect().height || 0)
  const gap = 8
  let left = a.left + a.width / 2 - w / 2
  let top = a.top - h - gap
  if (top < 8) top = a.bottom + gap
  const pos = clampToViewport(left, top, w, h, 8)
  sidebarTip.value = { ...sidebarTip.value, left: Math.round(pos.left), top: Math.round(pos.top) }
}

const showSidebarTip = (e, text, placement = 'right') => {
  if (!text) return
  const el = e?.currentTarget || e?.target
  const r = el?.getBoundingClientRect()
  if (!r) return
  describeSidebarTip(el)
  sidebarTipAnchor = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
  if (placement === 'top') {
    // 上方模式：先落一个占位坐标让气泡渲染出来，下一帧再按实测宽高精确对齐
    sidebarTip.value = {
      show: true,
      text,
      placement: 'top',
      left: Math.round(r.left + r.width / 2),
      top: Math.round(r.top),
    }
    nextTick(() => measureSidebarTipTop())
  } else {
    sidebarTip.value = {
      show: true,
      text,
      placement: 'right',
      left: Math.round(r.right + 8),
      top: Math.round(r.top + r.height / 2),
    }
  }
}

const hideSidebarTip = () => {
  releaseSidebarTipDescription()
  sidebarTip.value = { ...sidebarTip.value, show: false }
}

/**
 * 侧边栏左下角「壁纸」「主题」两个按钮的气泡文案与方向。
 *
 * 两个状态用**不同文案**，因为用户此时能获取的信息不同：
 *   · 收起态：按钮只剩图标，用户看不出这是"壁纸"还是"主题"，
 *     所以文案必须是「名称 + 状态」（如「壁纸 · 已开启」）；
 *   · 展开态：按钮上已有「壁纸」「主题」两个字，用户明确了它是什么，
 *     此时再重复名称就是废话，气泡只报**状态**（如「已开启」/「跟随系统」）。
 * 方向同理按状态切换：收起走右侧（与其它导航图标一致），展开在正上方。
 *
 * @param {MouseEvent|FocusEvent} e
 * @param {string} name  按钮名称（收起态拼进文案）
 * @param {string} state 当前状态文案
 */
const showBottomBtnTip = (e, name, stateSource) => {
  /*
   * 关键：不把状态文本快照进去，而是存「状态来源标记」（bg / theme）。
   * 用户点按钮切换状态时鼠标仍停在按钮上、不会重新触发 mouseenter，
   * 气泡里若是快照文本就会一直显示旧值（如已开启却仍写「已关闭」）。
   * 存标记后由 sidebarTipLiveText 这个 computed 在渲染时实时算出文本。
   */
  const el = e?.currentTarget || e?.target
  const r = el?.getBoundingClientRect()
  if (!r) return
  describeSidebarTip(el)
  sidebarTipAnchor = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
  const placement = sidebarCollapsed.value ? 'right' : 'top'
  sidebarTip.value = {
    show: true,
    text: '',
    stateKey: stateSource,
    btnName: name,
    placement,
    left: placement === 'top' ? Math.round(r.left + r.width / 2) : Math.round(r.right + 8),
    top: placement === 'top' ? Math.round(r.top) : Math.round(r.top + r.height / 2),
  }
  if (placement === 'top') nextTick(() => measureSidebarTipTop())
}

/**
 * 气泡文本 —— 实时计算，不取快照。
 *
 * 收起态必须带按钮名：此时按钮只有图标，用户看不出这是「壁纸」还是「主题」；
 * 展开态按钮上已有文字，再重复名字就是废话，只报当前状态。
 */
const sidebarTipLiveText = computed(() => {
  const t = sidebarTip.value
  if (!t.stateKey) return t.text
  const state = t.stateKey === 'bg' ? bgStateLabel.value : themeStateLabel.value
  return sidebarCollapsed.value ? `${t.btnName} · ${state}` : state
})

// ========== 悬浮气泡定位（fixed + 视口感知） ==========
// 侧边栏只有 240px 宽，气泡若用 absolute 居中，长文案（尤其中日）会横向溢出页面。
// 这里改成 fixed 定位，在显示前按触发元素位置算出坐标，并强制夹在视口内。
const clockTipRef = ref(null)
const clockTipPos = ref({ left: 0, top: 0 })
// 时钟气泡的锚点：鼠标指针坐标（需求二）。
// 与「跟随时钟元素」的区别：指针不一定在元素中心，靠右/靠下时按元素定位会跑偏到视口外。
// 取值优先级 = 最近一次指针坐标（若有）→ 时钟元素中心（键盘 focus / 无指针事件时兜底）。
const clockPointer = ref(null)

const clampToViewport = (left, top, w, h, margin = 8) => {
  const maxLeft = Math.max(margin, window.innerWidth - w - margin)
  const maxTop = Math.max(margin, window.innerHeight - h - margin)
  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  }
}

/**
 * 时钟气泡定位（需求二）：出现在**鼠标指针正下方**。
 *   · 水平：以指针 x 为中心居中；靠近左右边缘时夹进视口（不会溢出）。
 *   · 垂直：指针 y + gap；指针靠近屏幕下边缘时自动翻到指针上方。
 * 锚点用的是指针坐标（clockPointer），不是时钟元素位置 —— 后者在指针靠右/靠下时
 * 会把气泡推到视口外。仅当没有指针信息（键盘 focus 等）时退回元素中心。
 */
const measureClockTip = (anchorEl) => {
  const tip = clockTipRef.value
  if (!tip) return
  // 气泡此时可能还是 opacity-0，宽高未必可信；用实测值加下限兜底
  const t = tip.getBoundingClientRect()
  const w = Math.max(t.width, tip.offsetWidth, 60)
  const h = Math.max(t.height, tip.offsetHeight, 24)
  const gap = 8
  const margin = 8
  let px, py
  if (clockPointer.value) {
    px = clockPointer.value.x
    py = clockPointer.value.y
  } else if (anchorEl) {
    const a = anchorEl.getBoundingClientRect()
    px = a.left + a.width / 2
    py = a.bottom
  } else {
    return
  }
  // 水平以指针为中心；空间不足时 clampToViewport 会把它夹回来（靠右时等价于左翻）
  const left = px - w / 2
  // 默认在指针下方；下方放不下（指针贴近屏幕下边缘）就翻到指针上方
  let top = py + gap
  if (top + h > window.innerHeight - margin) top = py - h - gap
  clockTipPos.value = clampToViewport(left, top, w, h, margin)
}

// 指针进入时钟：先记下坐标并打开气泡，DOM 就绪后再定位（气泡本身 pointer-events-none，不会挡事件）
const onClockEnter = async (e) => {
  clockPointer.value = { x: e.clientX, y: e.clientY }
  showTimeTip.value = true
  await nextTick()
  measureClockTip(e.currentTarget)
}
// 时钟区域内移动：刷新指针坐标并重新定位，让气泡始终贴在指针下方
const onClockMove = (e) => {
  clockPointer.value = { x: e.clientX, y: e.clientY }
  if (showTimeTip.value) measureClockTip(e.currentTarget)
}
// 键盘 focus 没有指针坐标 → 清掉旧坐标，退回按时钟元素定位
const onClockFocus = async (e) => {
  clockPointer.value = null
  showTimeTip.value = true
  await nextTick()
  measureClockTip(e.currentTarget)
}

const clockTipStyle = computed(() => ({
  left: `${clockTipPos.value.left}px`,
  top: `${clockTipPos.value.top}px`,
}))

// 时钟气泡：先显示（让 DOM 可测量），再同步定位，避免依赖 watch 时序。
// 无指针信息（如被程序化调用）时按时钟元素兜底定位。
const openTimeTip = async (e) => {
  showTimeTip.value = true
  await nextTick()
  const el = (e && (e.currentTarget || e.target)) || clockTipRef.value?.parentElement
  measureClockTip(el)
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

// 语言菜单挂到 body（fixed 定位），按**鼠标指针**位置算坐标：
// 水平以指针为中心、垂直落在指针下方；靠右/靠下时夹进视口，下方放不下则翻到上方。
// 键盘打开（无指针坐标）时退化为「按按钮右侧对齐」，保证键盘用户也能用。
let langMenuPointer = null

const measureLangMenu = () => {
  const btn = langBtnRef.value
  const menu = langMenuRef.value
  if (!btn) return
  const b = btn.getBoundingClientRect()
  const w = menu?.offsetWidth || 136
  const h = menu?.offsetHeight || 120
  const gap = 6
  const margin = 8

  // 有指针坐标 → 以指针为中心；否则退化为按钮锚点
  const anchorX = langMenuPointer ? langMenuPointer.x : b.right - w / 2
  const anchorTop = langMenuPointer ? langMenuPointer.y : b.bottom

  const left = Math.min(Math.max(anchorX - w / 2, margin), Math.max(margin, window.innerWidth - w - margin))
  let top = anchorTop + gap
  if (top + h > window.innerHeight - margin) {
    // 下方放不下 → 翻到指针上方
    top = langMenuPointer ? langMenuPointer.y - h - gap : b.top - h - gap
  }
  top = Math.max(margin, top)
  langMenuPos.value = { left: Math.round(left), top: Math.round(top) }
}

/** 记录打开菜单前的鼠标位置（键盘打开时该值为 null） */
const rememberLangPointer = (e) => {
  if (e && typeof e.clientX === 'number') {
    langMenuPointer = { x: e.clientX, y: e.clientY }
  }
}

const langMenuStyle = computed(() => ({
  left: `${langMenuPos.value.left}px`,
  top: `${langMenuPos.value.top}px`,
}))

const toggleLangMenu = async (e) => {
  showLangMenu.value = !showLangMenu.value
  if (showLangMenu.value) {
    // 记录本次点击的指针位置：菜单要出现在**指针下方居中**
    rememberLangPointer(e)
    await nextTick()
    measureLangMenu()
  } else {
    langMenuPointer = null
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
const showHelp = ref(false)

const appearance = useAppearance()
const bgActive = computed(() => appearance.state.bgEnabled && !!appearance.state.bgUrl && !appearance.state.bgFailed)
/**
 * 壁纸按钮气泡的文案：**当前状态**（已开启 / 已关闭），供需求三使用。
 * 复用「设置页」已有的 toast 文案 key（appearance.bgEnabledToast / bgDisabledToast，
 * 三语都已存在，语义正好是「壁纸背景已开启 / 已关闭」），因此无需新增 i18n key。
 *
 * 判定用 state.bgEnabled（用户的开关意图），而不是 bgActive：
 * 后者还要求「已取到图且没加载失败」，网络抖动时会瞬间翻成「已关闭」，
 * 与用户刚点下的开关自相矛盾。按钮的 aria-pressed 也会同步成同一个开关状态。
 */
/**
 * 壁纸按钮的**纯状态**文案（已开启 / 已关闭）。
 * 展开态用它（按钮上已有「壁纸」二字，再重复名称会啰嗦）；
 * 收起态由 showBottomBtnTip 拼成「壁纸 · 已开启」，此时名称是必要信息。
 */
const bgStateLabel = computed(() =>
  appearance.state.bgEnabled ? tt('sidebar.bgStateOn') : tt('sidebar.bgStateOff'))
const onToggleBg = () => { appearance.toggleBackground() }
const { theme, isDark, toggleTheme } = useTheme()

// 顶栏主题按钮已改为内联 SVG 三态图标（太阳/月亮/自动），此处旧的 emoji 映射已删除
/**
 * 主题按钮的**纯状态**文案（日间 / 暗色 / 跟随系统），供侧边栏气泡使用。
 * 顶栏的 aria-label 仍用 themeLabel（完整句，含「点击切换」的动作提示），
 * 因为那里是读屏唯一的信息来源，需要说明可点击。
 */
const themeStateLabel = computed(() => {
  if (theme.value === 'dark') return tt('sidebar.themeStateDark')
  if (theme.value === 'light') return tt('sidebar.themeStateLight')
  return tt('sidebar.themeStateAuto')
})
const themeLabel = computed(() => {
  if (theme.value === 'dark') return tt('topbar.themeDark')
  if (theme.value === 'light') return tt('topbar.themeLight')
  return tt('topbar.themeAuto')
})

/**
 * 侧边栏底部深浅切换按钮的图标名（三态）：
 *   浅色 → sun（点了会变深）／深色 → moon／自动 → auto（半日半月）
 * 与顶栏原三态图标保持同一套语义，这样用户从顶栏迁移过来不会有认知落差。
 */
const themeIconName = computed(() => {
  if (theme.value === 'dark') return 'moon'
  if (theme.value === 'light') return 'sun'
  return 'auto'
})

/**
 * 侧边导航分区（可滚动区只放「番单」与「设置」两组）：
 *   lists     — 正在追番 / 等待更新 / 已看历史（日常主流程，最高频）
 *   appearance— 标签管理 / 导入&导出 / 主题与背景（低频设置项）
 *
 * 需求四：appearance 分组内「标签管理」与「主题与背景」互换位置 ——
 * 标签管理提到最前，主题与背景落到最后；「导入&导出」保持原位（中间）。
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
      // 标签管理（原第三位，现提到最前）：与「主题与背景」交换横向位置
      { path: '/tags', labelKey: 'nav.tags', icon: 'bookmark' },
      // 「导入&导出」合并成单页，归在「设置」分区下（原先它是底部独立按钮组）
      { path: '/transfer', labelKey: 'nav.transfer', icon: 'swap' },
      // 主题与背景（原第一位，现落到最后）
      { path: '/appearance', labelKey: 'nav.appearance', icon: 'palette' },
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
const savedSidebarCollapsed = ref(false)
const narrowSidebar = ref(typeof window !== 'undefined' && window.innerWidth <= 900)
const mobileSidebarExpanded = ref(false)
try {
  savedSidebarCollapsed.value = localStorage.getItem(SIDEBAR_KEY) === '1'
} catch { /* localStorage 不可用时保持默认展开 */ }
const sidebarCollapsed = computed(() => narrowSidebar.value
  ? !mobileSidebarExpanded.value : savedSidebarCollapsed.value)

const toggleSidebar = () => {
  hideSidebarTip()
  if (narrowSidebar.value) {
    mobileSidebarExpanded.value = !mobileSidebarExpanded.value
    return
  }
  savedSidebarCollapsed.value = !savedSidebarCollapsed.value
  try {
    localStorage.setItem(SIDEBAR_KEY, savedSidebarCollapsed.value ? '1' : '0')
  } catch { /* ignore */ }
}
const onShellResize = () => {
  narrowSidebar.value = window.innerWidth <= 900
  mobileSidebarExpanded.value = false
  showPageActionsMenu.value = false
}

const currentTitle = computed(() => {
  const item = allNavItems.find(n => n.path === route.path)
  return item ? tt(item.labelKey) : tt('app.title')
})

const currentIcon = computed(() => {
  const item = allNavItems.find(n => n.path === route.path)
  return item ? item.icon : 'tv'
})

/**
 * 顶栏计数徽章：由各页通过 setPageStats() 写入（见 composables/usePageStats.js）。
 * 用户要求把「本年 N 部 / 总计 N 部 / 共 N 条」这类番单计数从卡片内部移到
 * 顶栏页面标题旁边，避免每个 div 都占一行标题。
 */
const topbarStats = computed(() => pageStats[route.path] || [])

/** 当前页在顶栏显示的操作按钮（由各 view 写入 pageActions） */
const topbarActions = usePageActions(computed(() => route.path))

/** 当前页的顶栏内容控件（搜索/标签/年份，由各 view 写入 pageControls，A-01） */
const topbarControls = usePageControls(computed(() => route.path))
const showPageActionsMenu = ref(false)
const pageActionsBtnRef = ref(null)
const pageActionsMenuRef = ref(null)
const pageActionsMenuStyle = ref({})
const togglePageActionsMenu = async () => {
  showPageActionsMenu.value = !showPageActionsMenu.value
  if (!showPageActionsMenu.value) return
  await nextTick()
  const btn = pageActionsBtnRef.value?.getBoundingClientRect()
  const menu = pageActionsMenuRef.value
  if (!btn || !menu) return
  const w = menu.offsetWidth
  const h = menu.offsetHeight
  const top = btn.bottom + h + 8 > window.innerHeight ? btn.top - h - 6 : btn.bottom + 6
  const p = clampToViewport(btn.right - w, top, w, h)
  pageActionsMenuStyle.value = { left: p.left + 'px', top: p.top + 'px', '--pop-origin-y': 'top' }
  menu.querySelector('button')?.focus()
}
const runPageAction = (action) => {
  showPageActionsMenu.value = false
  pageActionsBtnRef.value?.focus()
  action.onClick()
}
const onPageActionsKeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    showPageActionsMenu.value = false
    pageActionsBtnRef.value?.focus()
  } else if (event.key === 'Tab') {
    // 视觉审计 A-68：原来没有 Tab 分支，焦点从末项移出后落到 body，
    // 而 Esc 处理器绑在菜单元素上 —— 焦点不在菜单里就永不触发，菜单滞留。
    // WAI-ARIA 菜单惯例：Tab/Shift+Tab 关闭菜单并把焦点交还触发器。
    event.preventDefault()
    showPageActionsMenu.value = false
    pageActionsBtnRef.value?.focus()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const buttons = Array.from(pageActionsMenuRef.value?.querySelectorAll('button') || [])
    const index = buttons.indexOf(document.activeElement)
    buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
  }
}
/**
 * A-68 兜底：焦点若已逃出菜单（例如点击菜单外但未点遮罩），Esc 仍应关闭。
 * 菜单内的 Esc 由面板 @keydown 处理并 stopPropagation，不会走到这里。
 */
const onDocKeydownPageActions = (event) => {
  if (event.key === 'Escape' && showPageActionsMenu.value) {
    showPageActionsMenu.value = false
    pageActionsBtnRef.value?.focus()
  }
}
watch(() => route.path, (path, oldPath) => {
  showPageActionsMenu.value = false
  mobileSidebarExpanded.value = false
  // 兜底清空旧页的内容控件（A-01）：view 卸载时会自己 clearPageControls，
  // 但万一某页忘清（先例：等番页曾漏清 pageActions），路由切换时在这里强制清掉，
  // 控件不会跨页残留在顶栏。
  if (oldPath && oldPath !== path) clearPageControls(oldPath)
})
/** 顶栏「当前选中」信息（各页写入，见 usePageStats.js 的 pageSelection） */
const topbarSelection = computed(() => pageSelection[route.path] || null)

let timer = null
/** 首屏入场动画开关：main 挂载时置 true，动画结束即置 false（只播一次） */
const pageAppearing = ref(false)
const mainRef = ref(null)
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
  window.addEventListener('resize', onShellResize)
  onUnmountedHooks.push(() => window.removeEventListener('resize', onShellResize))
  updateTime()
  timer = setInterval(updateTime, 1000)

  // 首屏入场动画：main 首次挂载时播一次 0.45s 上浮淡入。
  // 用 animationend 精确移除类，不靠固定延时猜时长；同时留一个兜底定时器，
  // 防止 reduced-motion（animation:none 不触发 animationend）时类一直挂着。
  pageAppearing.value = true
  const clearAppear = () => { pageAppearing.value = false }
  mainRef.value?.addEventListener('animationend', clearAppear, { once: true })
  setTimeout(clearAppear, 600)

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
  // A-68：顶栏「更多」菜单的 Esc 兜底（焦点逃出菜单后仍可关闭）
  document.addEventListener('keydown', onDocKeydownPageActions)
  window.addEventListener('resize', onResizeLang)

  onUnmountedHooks.push(() => {
    document.removeEventListener('visibilitychange', flushOnHide)
    document.removeEventListener('click', onDocClickLang)
    document.removeEventListener('keydown', onKeydownLang)
    document.removeEventListener('keydown', onDocKeydownPageActions)
    window.removeEventListener('resize', onResizeLang)
  })
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  onUnmountedHooks.forEach((fn) => fn())
})
</script>
