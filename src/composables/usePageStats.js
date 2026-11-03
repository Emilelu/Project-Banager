/**
 * 页面计数共享状态。
 *
 * 背景：用户要求把「本年 17 部 / 总计 448 部 / 共 7 条」这类**番单计数**
 * 从各页卡片内部移到**顶栏页面标题旁边**。
 *
 * 难点：计数在各自的 view 里算（数据来源不同：追番按月份、等番按排序后列表、
 * 已看按年份筛选），而顶栏在 App.vue 里。所以需要一个轻量的跨组件共享状态：
 *   · 各 view 在数据变化后调用 setPageStats(key, stats) 写入
 *   · App.vue 顶栏读 pageStats[currentRouteKey] 渲染
 *
 * 用模块级 reactive 而不是 provide/inject，是因为 App.vue 与各 view 之间隔了
 * router-view，provide 需要穿透多层；模块级单例更直接，也便于测试。
 */
import { reactive, computed, markRaw } from 'vue'

/**
 * @typedef {{ text: string, tone?: 'primary'|'neutral' }} PageStat
 */

/** 各页当前要展示在顶栏的计数徽章；key 为路由 path */
export const pageStats = reactive({
  '/watching': [],
  '/remaining': [],
  '/watched': [],
  '/tags': [],
})

/**
 * 写入某页的计数徽章。
 * @param {string} key 路由 path，如 '/watched'
 * @param {PageStat[]} stats 徽章数组，空数组表示该页不显示计数
 */
export function setPageStats(key, stats) {
  if (!pageStats[key]) return
  pageStats[key] = stats
}

/** 清空某页计数（页面卸载时用，避免停留旧数字） */
export function clearPageStats(key) {
  if (pageStats[key]) pageStats[key] = []
}

/** 按当前路由取计数徽章 */
export function usePageStats(keyRef) {
  return computed(() => (keyRef?.value ? pageStats[keyRef.value] || [] : []))
}


/* ==================== 页面操作按钮（顶栏） ==================== */

/**
 * 各页要显示在**顶栏**的操作按钮。
 *
 * 结构：
 *   { key: string, icon: string, label: string, cls?: string, onClick: () => void, danger?: boolean }
 *
 * 为什么要把按钮放到顶栏：
 *   用户要求工具栏按钮统一上移，页面内只保留搜索 / 筛选这类内容控件，
 *   这样正文区更干净，按钮位置在所有页面也一致。
 *
 * 顶栏空间有限（标题 + 计数 + 右侧图标已占大半），所以按钮以**图标形态**渲染，
 * 文案通过 v-tip 悬浮气泡显示，不占宽度。
 */
export const pageActions = reactive({
  '/watching': [],
  '/remaining': [],
  '/watched': [],
  '/tags': [],
})

/**
 * 写入某页的顶栏操作按钮。
 * @param {string} key 路由 path
 * @param {Array<{key:string, icon:string, label:string, cls?:string, onClick:Function, danger?:boolean}>} items
 */
export function setPageActions(key, items) {
  if (!pageActions[key]) return
  pageActions[key] = items || []
}

/** 清空某页操作按钮（页面卸载时调用，避免残留上一页的按钮） */
export function clearPageActions(key) {
  if (pageActions[key]) pageActions[key] = []
}

/**
 * 当前路由对应的操作按钮（App.vue 顶栏用）。
 * @param {import('vue').Ref<string>} keyRef
 */
export function usePageActions(keyRef) {
  return computed(() => (keyRef?.value ? pageActions[keyRef.value] || [] : []))
}

/* ==================== 页面内容控件（顶栏） ==================== */

/**
 * 各页要显示在**顶栏**的内容控件（搜索框 / 标签筛选 / 年份选择）。
 *
 * 背景（视觉审计 A-01）：等番/已看页的第一张卡片只承载「搜索 + 标签筛选（+年份）」，
 * 单独占一整卡把正文往下顶。这批控件要迁进共享顶栏 —— 但控件是**有状态的组件**
 * （输入框、下拉菜单），不像 pageActions 那样能用纯数据描述，所以 store 里存组件。
 *
 * 结构：
 *   { key: string, component: Component, props: object }
 *   · component 必须是「页内定义的控件组件」——状态（searchQuery/tagFilter/selectedYear）、
 *     过滤、fetch、年份 CRUD 逻辑全部留在 view，控件只做渲染入口，
 *     经 props 进、事件出与 view 通信（v-model 同构：props.xxx + onUpdate:xxx）。
 *   · markRaw 必须加：component 若被 reactive 代理，渲染性能与 devtools 都会异常。
 *     这里在写入点统一 markRaw，调用方忘写也不会出错（markRaw 幂等）。
 *
 * 为什么与 pageStats/pageActions 同构：同一文件、同一读写形状、同一测试方式，
 * 心智上就是「顶栏四件套」的第 4 件。跨页残留由两层兜底：
 *   1. 各 view onUnmounted 里 clearPageControls（与 clearPageActions 同一先例）；
 *   2. App.vue 的 route.path watch 里 clearPageControls(旧路径)（忘清也不残留）。
 */
export const pageControls = reactive({
  '/watching': [],
  '/remaining': [],
  '/watched': [],
  '/tags': [],
})

/**
 * 写入某页的顶栏内容控件。
 * @param {string} key 路由 path，如 '/watched'
 * @param {Array<{key:string, component:object, props?:object}>} controls
 */
export function setPageControls(key, controls) {
  if (!pageControls[key]) return
  pageControls[key] = (controls || []).map((c) => ({
    ...c,
    component: markRaw(c.component),
  }))
}

/** 清空某页内容控件（页面卸载时调用，避免残留上一页的控件） */
export function clearPageControls(key) {
  if (pageControls[key]) pageControls[key] = []
}

/**
 * 当前路由对应的内容控件（App.vue 顶栏用）。
 * @param {import('vue').Ref<string>} keyRef
 */
export function usePageControls(keyRef) {
  return computed(() => (keyRef?.value ? pageControls[keyRef.value] || [] : []))
}

/* ==================== 当前选中信息 ==================== */

/**
 * 各页「当前选中」信息（显示在顶栏标题右侧，替代卡片内一整行）。
 *
 * 结构：
 *   { name: '第 1 个高亮字段', items: [{ text, tone }], dot: 'primary'|'danger' }
 * items 与计数徽章的 text/tone 同构，渲染时复用 .topbar-stat 样式块。
 */
export const pageSelection = reactive({
  '/watching': null,
  '/remaining': null,
  '/watched': null,
  '/tags': null,
})

/**
 * 写入某页的选中信息；传 null 表示该页当前没有选中项。
 * @param {string} key 路由 path
 * @param {null | { name: string, items: Array<{text:string, tone?:string}>, dot?: string }} sel
 */
export function setPageSelection(key, sel) {
  if (!pageSelection[key] && pageSelection[key] !== null) return
  pageSelection[key] = sel
}

/** 清空某页选中信息（页面卸载时用） */
export function clearPageSelection(key) {
  if (key in pageSelection) pageSelection[key] = null
}

/** 按当前路由取选中信息 */
export function usePageSelection(keyRef) {
  return computed(() => (keyRef?.value ? pageSelection[keyRef.value] || null : null))
}
