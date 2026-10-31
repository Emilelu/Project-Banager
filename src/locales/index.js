/**
 * 语言包注册入口（集中注册 / 集中导出）
 *
 * 为什么要一个 index：
 *   1. main.js 只需要 `registerAllMessages()` + `initLocale()`，不关心语言包怎么拆。
 *   2. 三个语言包与元数据（`dictionaries`、`keyCounts()`）从这里统一出口，
 *      测试与 review 脚本都拿同一份来源核对 key 集合，避免出现「第四个真相」。
 *   3. 导入即注册（副作用），这样即使某处只 `import './locales'` 也能拿到文案，
 *      不会退回内置 FALLBACK_ZH。
 *
 * zh 是源语言（key 最全），en/ja 必须与它逐 key 对齐；
 * 对齐关系由 tests/i18n.test.js 守住。
 */
import { registerMessages, SUPPORTED } from '../composables/useI18n'
import zh from './zh'
import en from './en'
import ja from './ja'

export const dictionaries = { zh, en, ja }

/** 三语 key 数量（自检/报告用，不参与运行时） */
export function keyCounts() {
  const out = {}
  for (const [locale, dict] of Object.entries(dictionaries)) {
    out[locale] = Object.keys(dict).length
  }
  return out
}

/** 把三语全部注册进 i18n 引擎；可重复调用（registerMessages 是浅合并） */
export function registerAllMessages() {
  for (const locale of SUPPORTED) {
    const dict = dictionaries[locale]
    if (dict) registerMessages(locale, dict)
  }
  return dictionaries
}

// 导入即注册：兼容 `import './locales'` 的写法
registerAllMessages()

export { zh, en, ja }
export default dictionaries
