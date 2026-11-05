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
            <!-- 全部年份 -->
            <button type="button" role="menuitemradio"
              :aria-checked="selectedYear === '__all__' ? 'true' : 'false'"
              @click="pickYear('__all__')"
              class="flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-primary/10 whitespace-nowrap"
              :class="selectedYear === '__all__' ? 'font-semibold text-gray-800' : 'text-gray-600'">
              <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-primary"></span>
              <span class="flex-1">{{ tt('watched.allYears') }}</span>
              <span :class="selectedYear === '__all__' ? 'text-primary' : 'text-gray-300'">
                <AppIcon v-if="selectedYear === '__all__'" scale="xs" name="check" />
              </span>
            </button>

            <!-- 各年份 -->
            <button v-for="y in years" :key="y.year_label" type="button" role="menuitemradio"
              :aria-checked="selectedYear === y.year_label ? 'true' : 'false'"
              @click="pickYear(y.year_label)"
              class="flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-primary/10 whitespace-nowrap"
              :class="selectedYear === y.year_label ? 'font-semibold text-gray-800' : 'text-gray-600'">
              <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-sakura"></span>
              <span class="flex-1">{{ y.year_label }}</span>
              <span :class="selectedYear === y.year_label ? 'text-primary' : 'text-gray-300'">
                <AppIcon v-if="selectedYear === y.year_label" scale="xs" name="check" />
              </span>
            </button>

            <!-- 未归类 -->
            <div class="menu-sep"></div>
            <button type="button" role="menuitemradio"
              :aria-checked="selectedYear === '__unclassified__' ? 'true' : 'false'"
              @click="pickYear('__unclassified__')"
              class="flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-primary/10 whitespace-nowrap"
              :class="selectedYear === '__unclassified__' ? 'font-semibold text-gray-800' : 'text-gray-600'">
              <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-warning"></span>
              <span class="flex-1">{{ tt('watched.unclassified') }}</span>
              <span :class="selectedYear === '__unclassified__' ? 'text-primary' : 'text-gray-300'">
                <AppIcon v-if="selectedYear === '__unclassified__'" scale="xs" name="check" />
              </span>
            </button>

            <!-- 年份 CRUD 收进本菜单（原第一卡迁顶栏时一并跟过来，弹窗逻辑仍在 view） -->
            <div class="menu-sep"></div>
            <button type="button" role="menuitem" @click="runCrud('add-year')"
              class="flex items-center gap-2 text-left transition hover:bg-primary/10 whitespace-nowrap">
              <AppIcon scale="xs" name="plus" /><span class="flex-1">{{ tt('watched.addYear') }}</span>
            </button>
            <button v-if="hasRealYear" type="button" role="menuitem" @click="runCrud('edit-year')"
              class="flex items-center gap-2 text-left transition hover:bg-primary/10 whitespace-nowrap">
              <AppIcon scale="xs" name="edit" /><span class="flex-1">{{ tt('watched.editYear') }}</span>
            </button>
            <button v-if="hasRealYear" type="button" role="menuitem" @click="runCrud('delete-year')"
              class="flex items-center gap-2 text-left transition hover:bg-danger/10 text-danger whitespace-nowrap">
              <AppIcon scale="xs" name="trash" /><span class="flex-1">{{ tt('watched.deleteYear') }}</span>
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
 * 怎么增删改」留在 view —— 菜单项只 emit，view 的 pickYear/openAddYearDialog/
 * editYearLabel/openDeleteYearDialog 原逻辑不动。
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

/** 是否选中了真实年份（CRUD 菜单项只在此时出现，与 view 原条件一致） */
const hasRealYear = computed(() =>
  !!props.selectedYear && props.selectedYear !== '__unclassified__' && props.selectedYear !== '__all__')

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

/** 年份 CRUD：先关菜单再交给 view（view 打开对应弹窗） */
const runCrud = (event) => {
  showYearMenu.value = false
  emit(event)
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
