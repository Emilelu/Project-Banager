/**
 * 标签颜色表 —— 全站共享的**模块级**缓存（真正只拉一次）。
 *
 * 为什么必须独立成模块而不是写在 ItemTags.vue 里：
 *   Vue 的 `<script setup>` 会把**所有顶层语句**原样编进组件的 `setup()` 函数体。
 *   也就是说，写在那里的 `let tagColorMap = null` 看着像模块作用域，
 *   实际每个组件实例都会重新执行一遍 —— 一页 20~50 行 = 20~50 次
 *   `tagsApi.getAll()` 全表查询（实测等番页 3 行就会产生 3 次调用）。
 *   只有放进独立的 .js 模块，模块作用域才真正是「一份」。
 *
 * 用法：
 *   import { getTagColorMap, invalidateTagColors } from '../composables/useTagColors'
 *   await getTagColorMap()        // 首次调用拉表，之后直接返回缓存
 *   invalidateTagColors()         // 标签改名/改色后让缓存失效
 */
import { tagsApi } from '../db/api'

/** name -> { name, color, ... }（一次拉取，全站复用） */
let colorMap = null
/** 进行中的请求：并发实例共享同一个 Promise，不会打出 N 个请求 */
let pending = null

/**
 * 取 name→tag 的映射表。首次调用会请求 tags 表，之后命中缓存。
 * 拉表失败不抛出：降级成空表（chip 用主题色兜底），避免整个列表报错。
 * @returns {Promise<Map<string, object>>}
 */
export function getTagColorMap() {
  if (colorMap) return Promise.resolve(colorMap)
  if (!pending) {
    pending = Promise.resolve()
      // 用 then 包一层：tagsApi 缺失 / 同步抛错也会变成 rejection，不会打断渲染
      .then(() => tagsApi.getAll())
      .then((res) => {
        const list = res?.data?.data || []
        colorMap = new Map(list.map((t) => [String(t.name ?? ''), t]))
        return colorMap
      })
      .catch(() => {
        colorMap = new Map()
        return colorMap
      })
      .finally(() => { pending = null })
  }
  return pending
}

/** 同步读取当前缓存（未就绪时返回 null，供渲染期做「有无颜色」判断） */
export function peekTagColorMap() {
  return colorMap
}

/**
 * 让缓存失效：下次 getTagColorMap() 会重新拉表。
 * 供标签管理页在改名/改色/删除后调用，让列表里的 chip 立刻跟上新颜色。
 */
export function invalidateTagColors() {
  colorMap = null
  pending = null
}

/** 立即重新拉一次（内部先失效），返回新的映射表 */
export function reloadTagColors() {
  invalidateTagColors()
  return getTagColorMap()
}
