<template>
  <!-- 已看页顶栏内容控件（视觉审计 A-01：原第一卡的年份选择 + 搜索 + 标签筛选迁入顶栏）。

       职责边界（方案 A）：本组件只做**渲染入口 + 下拉菜单的纯 UI 机制**
       （开合/定位/外点与 Esc 关闭）；selectedYear 的维护、按年 fetch、
       年份增删改的弹窗与 API 全部留在 WatchedView，经事件回调过去。
       年份菜单照旧 Teleport 到 body —— header 是 .glass（backdrop-filter），
       是 position:fixed 的包含块，fixed 子元素必须挂 body 才不会偏移。 -->
  <div class="topbar-page-controls flex items-center gap-3 min-w-0">
    <!-- 年份选择：与「标签筛选」完全一致的下拉样式（.filter-trigger） -->
    <!-- 年份/标签筛选是紧凑胶囊，不参与挤压（搜索框负责弹性缩减长度） -->
    <div class="relative inline-block shrink-0">
      <button ref="yearTriggerRef" type="button" @click="toggleYearMenu"
        class="filter-trigger year-filter-trigger transition"
        :class="{ 'is-active': selectedYear !== '__all__' }"
        :aria-expanded="showYearMenu" aria-haspopup="menu"
        :aria-label="tt('watched.yearSelect')"
        v-tip="tt('watched.yearFilter')">
        <AppIcon scale="sm" name="book" />
        <span class="filter-trigger-label">{{ yearMenuLabel }}</span>
        <AppIcon scale="xs" :name="showYearMenu ? 'caretUp' : 'caretDown'" class="ml-0.5 filter-trigger-caret" />
      </button>

      <Teleport to="body">
        <div v-if="showYearMenu" class="fixed inset-0 z-[100]" @click="showYearMenu = false"></div>
        <transition name="pop">
          <div v-if="showYearMenu" ref="yearMenuRef" role="menu"
            class="fixed z-[110] app-menu-panel min-w-[10rem] max-h-[60vh] overflow-y-auto"
            style="--pop-origin-y: top; --pop-from-y: -6px"
            :style="yearMenuStyle"
            :aria-label="tt('watched.yearSelect')">
            <!-- 全部年份（内置行，无行内操作） -->
            <button type="button" role="menuitemradio"
              :aria-checked="selectedYear === '__all__' ? 'true' : 'false'"
              @click="pickYear('__all__')"
              class="flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-primary/10 whitespace-nowrap"
              :class="selectedYear === '__all__' ? 'font-semibold text-gray-800' : 'text-gray-600'">
              <span class="year-dot w-1.5 h-1.5 rounded-full shrink-0 bg-primary"></span>
              <span class="flex-1">{{ tt('watched.allYears') }}</span>
              <span :class="selectedYear === '__all__' ? 'text-primary' : 'text-gray-300'">
                <AppIcon v-if="selectedYear === '__all__'" scale="xs" name="check" />
              </span>
            </button>

            <!-- 各年份：行内带 编辑/删除 小图标钮。结构必须是 row div[role=none] >
                 主按钮 + 操作钮，不能 button 套 button（HTML 非法）；
                 主按钮几何仍由全局 .app-menu-panel > div > button 规则统一，
                 操作钮用 .year-row-btn 压掉该规则的 width:100%/padding（先例
                 .page-size-menu .pager-confirm-btn）。 -->
            <div v-for="y in years" :key="y.year_label" role="none" class="year-row flex items-center pr-1.5">
              <button type="button" role="menuitemradio"
                :aria-checked="selectedYear === y.year_label ? 'true' : 'false'"
                @click="pickYear(y.year_label)"
                class="year-row-main flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-sm text-left transition whitespace-nowrap"
                :class="selectedYear === y.year_label ? 'font-semibold text-gray-800' : 'text-gray-600'">
                <span class="year-dot w-1.5 h-1.5 rounded-full shrink-0 bg-sakura"></span>
                <span class="flex-1">{{ y.year_label }}</span>
                <span :class="selectedYear === y.year_label ? 'text-primary' : 'text-gray-300'">
                  <AppIcon v-if="selectedYear === y.year_label" scale="xs" name="check" />
                </span>
              </button>
              <span class="year-row-actions flex items-center shrink-0">
                <button type="button" role="menuitem" class="year-row-btn"
                  :aria-label="tt('watched.editYear')" v-tip="tt('watched.editYear')"
                  @click.stop="emitYearEdit(y.year_label)">
                  <AppIcon scale="xs" name="edit" />
                </button>
                <button type="button" role="menuitem" class="year-row-btn text-danger"
                  :aria-label="tt('watched.deleteYear')" v-tip="tt('watched.deleteYear')"
                  @click.stop="emitYearDelete(y.year_label)">
                  <AppIcon scale="xs" name="trash" />
                </button>
              </span>
            </div>

            <!-- 未归类（内置行，无行内操作） -->
            <div class="menu-sep"></div>
            <button type="button" role="menuitemradio"
              :aria-checked="selectedYear === '__unclassified__' ? 'true' : 'false'"
              @click="pickYear('__unclassified__')"
              class="flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-primary/10 whitespace-nowrap"
              :class="selectedYear === '__unclassified__' ? 'font-semibold text-gray-800' : 'text-gray-600'">
              <span class="year-dot w-1.5 h-1.5 rounded-full shrink-0 bg-warning"></span>
              <span class="flex-1">{{ tt('watched.unclassified') }}</span>
              <span :class="selectedYear === '__unclassified__' ? 'text-primary' : 'text-gray-300'">
                <AppIcon v-if="selectedYear === '__unclassified__'" scale="xs" name="check" />
              </span>
            </button>

            <!-- 年份 CRUD：编辑/删除已上移到各年份行内（带该行 label 给 view），
                 底部只保留「添加年份」。 -->
            <div class="menu-sep"></div>
            <button type="button" role="menuitem" @click="runCrud('add-year')"
              class="flex items-center gap-2 text-left transition hover:bg-primary/10 whitespace-nowrap">
              <AppIcon scale="xs" name="plus" /><span class="flex-1">{{ tt('watched.addYear') }}</span>
            </button>
          </div>
        </transition>
      </Teleport>
    </div>

    <TopbarSearchBox :model-value="search" :placeholder="tt('watched.searchPlaceholder')"
      @update:model-value="emit('update:search', $event)" />
    <TagFilter :model-value="tagFilter" @update:model-value="emit('update:tagFilter', $event)" class="shrink-0" />
  </div>
</template>

<script setup>
/**
 * 已看页顶栏控件（pageControls 项）。
 *
 * 年份菜单的 UI 机制（开合/测量/外点/Esc/resize 重定位）从 WatchedView 原样搬过来，
 * 因为触发按钮与菜单面板的 refs 都在这个组件里；「选了哪个年份、怎么拉数据、
 * 怎么增删改」留在 view —— 菜单项只 emit。各年份行的行内 编辑/删除 钮带该行
 * { label } emit，view 用它定位年份（弹窗预填 / 确认框瞄准），不再依赖当前选中态。
 */
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import TopbarSearchBox from './TopbarSearchBox.vue'
import TagFilter from '../components/TagFilter.vue'
import { useI18n } from '../composables/useI18n'

const props = defineProps({
  /** 搜索词（view 的 searchQuery） */
  search: { type: String, default: '' },
  /** 标签筛选，逗号分隔（view 的 tagFilter） */
  tagFilter: { type: String, default: '' },
  /** 当前选中年份：year_label / '__all__' / '__unclassified__'（view 维护） */
  selectedYear: { type: String, default: '' },
  /** 年份列表（view 的 sortedYears，已按年份降序） */
  years: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:search', 'update:tagFilter', 'pick-year', 'add-year', 'edit-year', 'delete-year'])

const { tt } = useI18n()

// ===== 年份下拉（与 TagFilter 同一套交互与样式，机制自 view 原样迁入）=====
const showYearMenu = ref(false)
const yearTriggerRef = ref(null)
const yearMenuRef = ref(null)
const yearMenuPos = ref({ left: 0, top: 0 })

const yearMenuStyle = computed(() => ({
  left: `${yearMenuPos.value.left}px`,
  top: `${yearMenuPos.value.top}px`,
}))

/** 触发按钮上的文案：当前年份 / 全部 / 未归类 */
const yearMenuLabel = computed(() => {
  if (props.selectedYear === '__all__') return tt('watched.allYears')
  if (props.selectedYear === '__unclassified__') return tt('watched.unclassified')
  return props.selectedYear || tt('watched.allYears')
})

const measureYearMenu = () => {
  const btn = yearTriggerRef.value
  const menu = yearMenuRef.value
  if (!btn) return
  const b = btn.getBoundingClientRect()
  const w = menu?.offsetWidth || 160
  const h = menu?.offsetHeight || 200
  const gap = 6
  const margin = 8
  const left = Math.min(Math.max(b.left, margin), Math.max(margin, window.innerWidth - w - margin))
  let top = b.bottom + gap
  if (top + h > window.innerHeight - margin) top = b.top - h - gap
  yearMenuPos.value = { left: Math.round(left), top: Math.round(Math.max(margin, top)) }
}

const toggleYearMenu = async () => {
  showYearMenu.value = !showYearMenu.value
  if (showYearMenu.value) {
    await nextTick()
    measureYearMenu()
  }
}

/** 选择某年：交给 view（view 会重新拉数据；重复选当前年份也会拉，先例见 view 注释） */
const pickYear = (label) => {
  showYearMenu.value = false
  emit('pick-year', label)
}

/** 年份 CRUD：先关菜单再交给 view（view 打开对应弹窗）；目前只有「添加年份」走这里 */
const runCrud = (event) => {
  showYearMenu.value = false
  emit(event)
}

/** 行内编辑/删除：带该行的年份 label 交给 view —— view 用它定位年份，
 *  编辑弹窗预填该年份、删除确认框瞄准该年份（不再依赖「当前选中年份」） */
const emitYearEdit = (label) => {
  showYearMenu.value = false
  emit('edit-year', { label })
}
const emitYearDelete = (label) => {
  showYearMenu.value = false
  emit('delete-year', { label })
}

// 点击外部 / Esc / 滚动时关闭；Esc 后焦点归还触发按钮
const onYearDocClick = (e) => {
  if (!showYearMenu.value) return
  if (yearTriggerRef.value?.contains(e.target)) return
  if (yearMenuRef.value?.contains(e.target)) return
  if (e.target.closest?.('[role="menu"]')) return
  showYearMenu.value = false
}
const onYearKeydown = (e) => {
  if (e.key === 'Escape' && showYearMenu.value) {
    showYearMenu.value = false
    nextTick(() => yearTriggerRef.value?.focus?.())
  }
}
const onYearResize = () => { if (showYearMenu.value) measureYearMenu() }

onMounted(() => {
  document.addEventListener('click', onYearDocClick)
  document.addEventListener('keydown', onYearKeydown)
  window.addEventListener('resize', onYearResize)
})
onUnmounted(() => {
  document.removeEventListener('click', onYearDocClick)
  document.removeEventListener('keydown', onYearKeydown)
  window.removeEventListener('resize', onYearResize)
})
</script>

<style scoped>
/* ===== 年份菜单行内操作（fix-topbar） =====
 * 菜单 Teleport 到 body，scoped 的 data-v 属性仍在节点上，规则照常生效；
 * 深色直接写 .dark 前缀（本工程 scoped 里 :global(.dark) 会编译成空选择器，见 AGENTS.md）。 */

/* ① 色点与文字间距：全局菜单项规则 .app-menu-panel [role=menuitemradio] 给的 gap 是
 *    7px（特异性 (0,2,0) 压过模板上的 gap-2，实测色点右缘→文字左缘 6.9px，太贴），
 *    给色点加 5px 外距凑到 ≈12px。 */
.year-dot { margin-right: 5px; }

/* 行内 编辑/删除 小图标钮：压掉全局 .app-menu-panel > div > button 的
 * width:100% / 菜单项 padding / gap（同 .page-size-menu .pager-confirm-btn 先例），
 * 固定 24×24 方钮，圆角走 --r-* 令牌。 */
.year-row-btn {
  width: 1.7143rem; /* 24px @ root 14 */
  height: 1.7143rem;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 0;
  border-radius: var(--r-sm);
}
/* 危险项悬停底色跟语义走红，不用全局菜单项的主题色底 */
.year-row-btn.text-danger:hover { background: rgb(var(--c-danger) / 0.12); }
.dark .year-row-btn.text-danger:hover { background: rgb(var(--c-danger) / 0.2); }

/* 年份行整体悬停高亮（含操作钮区，避免高亮在主按钮与操作钮之间断开）；
   主按钮自带的菜单项 hover 底色让位 —— 用后代链抬高特异性压过全局
   .app-menu-panel [role=menuitemradio]:hover，不依赖源码顺序。 */
.year-row:hover { background: rgb(var(--c-primary) / 0.1); }
.year-row .year-row-main:hover { background: transparent; }
</style>
