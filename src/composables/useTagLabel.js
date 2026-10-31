/**
 * 标签显示名的国际化。
 *
 * 背景：
 *   内置标签（「热血」「剧场版」…）是数据层首次启动时播种进 tags 表的中文名。
 *   数据层不该依赖 UI 语言，库里就保留中文名；但切到英文/日文后界面上仍是汉字，
 *   就是用户报的「中文残留」。
 *
 * 做法（不改数据层）：
 *   用 zh 语言包里 tag.* 的**中文原文**建立「中文名 → 字典 key」的反查表。
 *   显示标签时：名字命中反查表 → 用当前语言翻译；没命中（用户自建或改过名）→ 原样显示。
 *
 * 为什么这样可以不改 db：
 *   - 无需给 tags 表加 builtin_key 列，也不动播种逻辑；
 *   - 用户把内置标签改名成「热血片」后，名字不再等于任何中文原文，自动退回显示
 *     用户自己起的名字 —— 这正是期望行为（名字是用户的，不该被翻译覆盖）。
 *
 * 注意：条目上存的是**标签名**（逗号分隔），筛选、落库必须继续用原名，
 * 只有「显示」才走这里。两组函数命名上做了区分：
 *   tagLabel / displayTagNames  → 仅用于渲染
 */
import zhMessages from '../locales/zh.js'
import { t } from './useI18n'

/** 中文原文 → 字典 key（只收 tag.* 的内置标签名） */
const NAME_TO_KEY = new Map()
for (const [key, value] of Object.entries(zhMessages)) {
  if (!key.startsWith('tag.')) continue
  if (typeof value === 'string' && value && !NAME_TO_KEY.has(value)) {
    NAME_TO_KEY.set(value, key)
  }
}

/**
 * 标签的当前语言显示名。
 * @param {{ name?: string }} tag
 * @param {(key: string, params?: object) => string} [translate] 缺省用引擎的 t()
 * @returns {string} 内置标签返回译文，其它返回原名
 */
export function tagLabel(tag, translate = t) {
  if (!tag) return ''
  const name = String(tag.name ?? '')
  const key = NAME_TO_KEY.get(name)
  if (!key) return name
  const translated = translate(key)
  // 字典缺项时 t() 原样返回 key（如 tag.hot），此时显示中文原名更可读
  return translated === key ? name : translated
}

/**
 * 把条目上存的「逗号分隔标签名」渲染成显示名数组。
 * @param {string} names 形如 "热血,日常"
 * @param {Array} [allTags] 保留参数以兼容调用方签名（当前实现用中文名反查，无需它）
 * @param {(key: string, params?: object) => string} [translate]
 * @returns {string[]}
 */
export function displayTagNames(names, allTags = [], translate = t) {
  const list = String(names || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.map((name) => tagLabel({ name }, translate))
}

/**
 * 组件里用：把 translate 收敛到当前语言。
 * 每次调用都读 t()（内部读 currentLocale），语言切换时模板重渲染即生效。
 */
export function useTagLabel() {
  return {
    tagLabel: (tag) => tagLabel(tag, t),
    displayTagNames: (names, allTags) => displayTagNames(names, allTags, t),
  }
}
