/**
 * tests/i18n.test.js —— 三语 i18n 引擎与语言包一致性回归
 * ============================================================================
 * 覆盖点（对应 review/i18n.md 的验收清单）：
 *  1. 三语 key 集合完全一致（en/ja 与 zh 的差集双向为空）
 *  2. 插值占位符集合一致（翻译不得改名/丢占位符）、emoji 保留、英文包无残留汉字
 *  3. t() 回退链：当前语言 → zh → 原样返回 key
 *  4. 插值替换正确（单/多占位符、缺参数、0 与空串、未知占位符）
 *  5. setLocale 持久化到 localStorage；非法值与写失败被安全处理
 *  6. toggleLocale 按 zh → en → ja → zh 循环
 *  7. 切换语言后 document.documentElement.lang 更新
 *  8. 模板里的 tt 随 currentLocale 响应式重渲染（含 computed 缓存的情形）
 *
 * 约定：只测纯逻辑与一个最小探针组件，不碰数据库与 Toast。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, nextTick } from 'vue'

import {
  SUPPORTED,
  currentLocale,
  initLocale,
  registerMessages,
  setLocale,
  t,
  toggleLocale,
  useI18n,
  __resetMessages,
} from '../src/composables/useI18n'
import { dictionaries, keyCounts, registerAllMessages } from '../src/locales'

const STORAGE_KEY = 'banager_locale'
const keysOf = (dict) => Object.keys(dict)

/** 文案里的 {placeholder} 按出现顺序拼接，用于比对占位符集合 */
const placeholders = (text) => (String(text ?? '').match(/\{(\w+)\}/g) || []).join('')

beforeEach(() => {
  __resetMessages()
  registerAllMessages()
  setLocale('zh')
})

afterEach(() => {
  try { localStorage.clear() } catch { /* ignore */ }
})

// ===========================================================================
// 1. key 集合一致性
// ===========================================================================
describe('语言包 key 集合：三语必须一一对应', () => {
  it('zh / en / ja 的 key 数量相同且达到可用规模', () => {
    const counts = keyCounts()
    expect(counts.zh).toBeGreaterThan(200)
    expect(counts.en).toBe(counts.zh)
    expect(counts.ja).toBe(counts.zh)
  })

  it('en 与 zh 的 key 差集为空（双向：不缺项、不添项）', () => {
    const missing = keysOf(dictionaries.zh).filter((k) => !(k in dictionaries.en))
    const extra = keysOf(dictionaries.en).filter((k) => !(k in dictionaries.zh))
    expect(missing).toEqual([])
    expect(extra).toEqual([])
  })

  it('ja 与 zh 的 key 差集为空（双向）', () => {
    const missing = keysOf(dictionaries.zh).filter((k) => !(k in dictionaries.ja))
    const extra = keysOf(dictionaries.ja).filter((k) => !(k in dictionaries.zh))
    expect(missing).toEqual([])
    expect(extra).toEqual([])
  })

  it('每条文案都是非空字符串（不允许漏翻成空串）', () => {
    for (const [locale, dict] of Object.entries(dictionaries)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value, `${locale}.${key} 类型应为 string`).toBeTypeOf('string')
        expect(String(value).trim(), `${locale}.${key} 为空串`).not.toBe('')
      }
    }
  })

  it('插值占位符集合与 zh 完全一致（翻译不得改占位符名）', () => {
    const mismatch = []
    for (const key of keysOf(dictionaries.zh)) {
      const src = placeholders(dictionaries.zh[key])
      for (const locale of ['en', 'ja']) {
        const got = placeholders(dictionaries[locale][key])
        if (got !== src) mismatch.push(`${locale}.${key}: zh[${src}] vs ${locale}[${got}]`)
      }
    }
    expect(mismatch).toEqual([])
  })

  it('设计语言里的 emoji 在 en / ja 中保留', () => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u
    const missing = []
    for (const key of keysOf(dictionaries.zh)) {
      if (!EMOJI.test(dictionaries.zh[key])) continue
      for (const locale of ['en', 'ja']) {
        if (!EMOJI.test(dictionaries[locale][key])) missing.push(`${locale}.${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('英文包里不残留未翻译的汉字（lang.* 是语言自称，豁免）', () => {
    const CJK = /[\u4e00-\u9fff]/
    const leftovers = keysOf(dictionaries.en)
      .filter((k) => !k.startsWith('lang.'))
      .filter((k) => CJK.test(dictionaries.en[k]))
    expect(leftovers).toEqual([])
  })
})

// ===========================================================================
// 2. 回退链
// ===========================================================================
describe('t() 回退链：当前语言 → zh → key', () => {
  it('已翻译的 key 直接取当前语言文案', () => {
    setLocale('en')
    expect(t('nav.watching')).toBe('Watching')
    setLocale('ja')
    expect(t('nav.watching')).toBe('視聴中')
  })

  it('当前语言缺 key 时回退到 zh', () => {
    __resetMessages()
    registerMessages('zh', { 'test.onlyZh': '只在中文里有' })
    registerMessages('en', { 'test.onlyEn': 'EN only' })
    setLocale('en')

    expect(t('test.onlyZh')).toBe('只在中文里有')
    expect(t('test.onlyEn')).toBe('EN only')
  })

  it('ja 缺 key 时回退 zh，而不是回退 en', () => {
    __resetMessages()
    registerMessages('zh', { 'test.onlyZh': '中文值' })
    registerMessages('en', { 'test.onlyZh': 'EN value' })
    registerMessages('ja', {})
    setLocale('ja')

    expect(t('test.onlyZh')).toBe('中文值')
  })

  it('语言包整体未注册时仍能回退到 zh 源语言包（组件单测无 import ./locales 的场景）', () => {
    __resetMessages()
    setLocale('en')
    // zh.js 作为内置 fallback，保证裸 key 不会出现在 UI 上
    expect(t('nav.watching')).toBe('正在追番')
    expect(t('sidebar.exportBackup')).toBe('导出备份')
  })

  it('三语都缺 key 时原样返回 key（便于发现漏翻）', () => {
    setLocale('en')
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })

  it('空 key 返回空串，不抛异常', () => {
    expect(t('')).toBe('')
    expect(t(undefined)).toBe('')
    expect(t(null)).toBe('')
  })

  it('回退到 zh 后仍然做插值', () => {
    __resetMessages()
    registerMessages('zh', { 'test.interp': '共 {count} 条' })
    setLocale('en')
    expect(t('test.interp', { count: 5 })).toBe('共 5 条')
  })
})

// ===========================================================================
// 3. 插值
// ===========================================================================
describe('t() 插值', () => {
  it('单占位符替换', () => {
    setLocale('zh')
    expect(t('watched.thisYear', { count: 3 })).toBe('本年: 3部')
  })

  it('多占位符全部替换', () => {
    setLocale('zh')
    expect(t('toast.batchAddedPartial', { added: 2, failed: 1, list: '甲' }))
      .toBe('已添加 2 部，失败 1 部：甲')
  })

  it('三占位符的导入进度文案', () => {
    setLocale('en')
    expect(t('import.progress', { done: 10, total: 20, percent: 50 }))
      .toBe('  Processed 10/20 rows (50%)')
  })

  it('同一 key 在不同语言下都正确插值', () => {
    setLocale('ja')
    expect(t('watched.total', { count: 7 })).toBe('合計: 7件')
    setLocale('en')
    expect(t('watched.total', { count: 7 })).toBe('Total: 7')
  })

  it('缺参数时保留原占位符，不渲染成 undefined', () => {
    setLocale('zh')
    expect(t('toast.batchDeleted', {})).toBe('已批量删除 {count} 项')
    expect(t('toast.batchDeleted')).toBe('已批量删除 {count} 项')
  })

  it('参数值为 0 / 空串时照常代入（不被当成缺失）', () => {
    setLocale('zh')
    expect(t('remaining.count', { count: 0 })).toBe('等番: 0部')
    expect(t('toast.yearCleared', { year: '' })).toBe(' 已清空')
  })

  it('文案里没有占位符时不做任何替换', () => {
    setLocale('en')
    expect(t('common.save', { name: 'x' })).toBe('Save')
  })

  it('未知占位符名保持原样（不误配同名前缀）', () => {
    setLocale('zh')
    expect(t('sidebar.backupDaysAgo', { day: 3 })).toBe('{days} 天前')
  })
})

// ===========================================================================
// 4. setLocale 持久化 / 非法值
// ===========================================================================
describe('setLocale：持久化与非法值', () => {
  it('写入 localStorage', () => {
    setLocale('en')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en')
    setLocale('ja')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ja')
  })

  it('非支持语言被忽略：当前语言与存储都不变', () => {
    setLocale('en')
    for (const bad of ['fr', 'zh-CN', '', null, undefined, 123, {}, []]) {
      setLocale(bad)
    }

    expect(currentLocale.value).toBe('en')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en')
  })

  it('initLocale 读取已存的合法语言', () => {
    localStorage.setItem(STORAGE_KEY, 'ja')
    initLocale()
    expect(currentLocale.value).toBe('ja')
  })

  it('initLocale 对存储里的非法值回落到浏览器语言检测', () => {
    localStorage.setItem(STORAGE_KEY, 'fr')
    initLocale()
    expect(SUPPORTED).toContain(currentLocale.value)
    expect(currentLocale.value).not.toBe('fr')
  })

  it('localStorage 写入抛错时不崩（隐私模式兜底）', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => setLocale('ja')).not.toThrow()
    expect(currentLocale.value).toBe('ja')
    spy.mockRestore()
  })
})

// ===========================================================================
// 5. toggleLocale 循环
// ===========================================================================
describe('toggleLocale：zh → en → ja → zh', () => {
  it('从 zh 开始连续切换三轮回到起点', () => {
    setLocale('zh')
    toggleLocale()
    expect(currentLocale.value).toBe('en')
    toggleLocale()
    expect(currentLocale.value).toBe('ja')
    toggleLocale()
    expect(currentLocale.value).toBe('zh')
  })

  it('从任意语言开始都按 SUPPORTED 顺序前进', () => {
    setLocale('ja')
    toggleLocale()
    expect(currentLocale.value).toBe('zh')
    setLocale('en')
    toggleLocale()
    expect(currentLocale.value).toBe('ja')
  })

  it('每次切换都把新语言写进 localStorage', () => {
    setLocale('zh')
    toggleLocale()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en')
    toggleLocale()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ja')
  })

  it('支持语言清单只有 zh/en/ja', () => {
    expect(SUPPORTED).toEqual(['zh', 'en', 'ja'])
  })
})

// ===========================================================================
// 6. <html lang>
// ===========================================================================
describe('document.documentElement.lang', () => {
  it('zh 映射 zh-CN，en 映射 en，ja 映射 ja', () => {
    setLocale('zh')
    expect(document.documentElement.lang).toBe('zh-CN')
    setLocale('en')
    expect(document.documentElement.lang).toBe('en')
    setLocale('ja')
    expect(document.documentElement.lang).toBe('ja')
  })

  it('initLocale 初始化后 lang 与当前语言一致', () => {
    localStorage.setItem(STORAGE_KEY, 'en')
    initLocale()
    expect(document.documentElement.lang).toBe('en')
  })

  it('toggleLocale 也会同步 lang', () => {
    setLocale('zh')
    toggleLocale()
    expect(document.documentElement.lang).toBe('en')
  })

  it('非法 setLocale 不会改动 lang', () => {
    setLocale('ja')
    setLocale('fr')
    expect(document.documentElement.lang).toBe('ja')
  })
})

// ===========================================================================
// 7. 组件里的响应式
// ===========================================================================
describe('模板中的 tt 随语言切换即时更新', () => {
  const Probe = defineComponent({
    template: `
      <div>
        <span class="label">{{ tt('nav.watching') }}</span>
        <span class="count">{{ tt('watched.total', { count: 7 }) }}</span>
        <span class="lang">{{ locale }}</span>
      </div>`,
    setup() {
      const { tt, locale } = useI18n()
      return { tt, locale }
    },
  })

  it('setLocale 后无需重新挂载，文案立即变', async () => {
    setLocale('zh')
    const wrapper = mount(Probe)

    expect(wrapper.get('.label').text()).toBe('正在追番')
    expect(wrapper.get('.count').text()).toBe('总计: 7部')

    setLocale('en')
    await nextTick()
    expect(wrapper.get('.label').text()).toBe('Watching')
    expect(wrapper.get('.count').text()).toBe('Total: 7')
    expect(wrapper.get('.lang').text()).toBe('en')

    setLocale('ja')
    await nextTick()
    expect(wrapper.get('.label').text()).toBe('視聴中')
    expect(wrapper.get('.count').text()).toBe('合計: 7件')

    wrapper.unmount()
  })

  it('toggleLocale 触发重渲染（顶栏语言按钮的等价路径）', async () => {
    setLocale('zh')
    const wrapper = mount(Probe)
    expect(wrapper.get('.label').text()).toBe('正在追番')

    toggleLocale()
    await nextTick()
    expect(wrapper.get('.label').text()).toBe('Watching')

    wrapper.unmount()
  })

  it('用 computed 包一层 tt 的写法也同样是响应式的', async () => {
    const ComputedProbe = defineComponent({
      template: `<span class="label">{{ label }}</span>`,
      setup() {
        const { tt, locale } = useI18n()
        // 需要在 computed 里读取 locale 才能建立依赖；直接 tt() 不会自动追踪
        const label = computed(() => {
          void locale.value
          return tt('nav.remaining')
        })
        return { label }
      },
    })

    setLocale('zh')
    const wrapper = mount(ComputedProbe)
    expect(wrapper.get('.label').text()).toBe('等待更新')

    setLocale('en')
    await nextTick()
    expect(wrapper.get('.label').text()).toBe('Waiting')

    setLocale('ja')
    await nextTick()
    expect(wrapper.get('.label').text()).toBe('更新待ち')

    wrapper.unmount()
  })
})
