/**
 * 轻量 i18n 引擎（无第三方依赖）
 *
 * 为什么不引 vue-i18n：
 *   本项目是单文件离线应用，产物要尽量小；文案量与语言数（3 种）都在可控范围，
 *   自建 60 行核心即可，且能完全控制「缺失 key 时的回退链」与「插值语法」。
 *
 * 用法：
 *   import { t, setLocale, currentLocale, availableLocales } from './useI18n'
 *   t('nav.watching')                       // 纯文案
 *   t('toast.movedTo', { date: '2025/07' }) // 插值：文案里写 {date}
 *
 * 回退链：当前语言 → 中文（zh 是源语言，key 最全）→ 原样返回 key（便于发现漏翻）
 */
import { ref, computed } from 'vue'
import zhMessages from '../locales/zh.js'

export const SUPPORTED = ['zh', 'en', 'ja']
export const LOCALE_LABELS = {
  zh: '简体中文',
  en: 'English',
  ja: '日本語',
}

const STORAGE_KEY = 'banager_locale'

// 语言包：按模块拆开注册，避免单文件过大时难以维护
const messages = Object.create(null)

// 中文兜底：直接引用完整的 zh 源语言包（zh.js 不依赖本模块，无循环）。
// 作用是在「语言包还没注册」的早期阶段/单元测试/组件单测里，回退链的第二环永远可用，
// 不会把界面显示成裸 key。registerMessages('zh', …) 之后依然是同一份内容。
const FALLBACK_ZH = zhMessages

export const currentLocale = ref('zh')

export function registerMessages(locale, dict) {
  if (!SUPPORTED.includes(locale)) return
  messages[locale] = { ...(messages[locale] || {}), ...dict }
}

/** 取浏览器首选语言映射到支持列表 */
function detectLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && SUPPORTED.includes(saved)) return saved
  } catch { /* ignore */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : ''
  const lower = nav.toLowerCase()
  if (lower.startsWith('ja')) return 'ja'
  if (lower.startsWith('en')) return 'en'
  // 2026-11-07（用户裁定）：系统语言无匹配时回退英文，不再回退中文 ——
  // 仅首次启动生效（有保存值后永远用保存值，用户改语言不会被自动改回）。
  return 'en'
}

export function initLocale() {
  currentLocale.value = detectLocale()
  applyHtmlLang()
}

function applyHtmlLang() {
  if (typeof document === 'undefined') return
  const map = { zh: 'zh-CN', en: 'en', ja: 'ja' }
  document.documentElement.lang = map[currentLocale.value] || 'zh-CN'
}

export function setLocale(locale) {
  if (!SUPPORTED.includes(locale)) return
  currentLocale.value = locale
  applyHtmlLang()
  try { localStorage.setItem(STORAGE_KEY, locale) } catch { /* ignore */ }
}

export function toggleLocale() {
  const idx = SUPPORTED.indexOf(currentLocale.value)
  setLocale(SUPPORTED[(idx + 1) % SUPPORTED.length])
}

/** 文案查找 + {name} 插值 */
export function t(key, params) {
  if (!key) return ''
  const dict = messages[currentLocale.value]
  let text = dict && dict[key]
  if (text === undefined) {
    // 回退到中文源语言
    text = messages.zh && messages.zh[key]
  }
  if (text === undefined) {
    // 语言包尚未注册（例如单元测试只挂了组件、没有 import './locales'）：
    // 回退到内置中文，保证 UI 不会显示成裸 key
    text = FALLBACK_ZH[key]
  }
  if (text === undefined) return key
  if (params && typeof text === 'string' && text.indexOf('{') >= 0) {
    text = text.replace(/\{(\w+)\}/g, (m, name) => (
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m
    ))
  }
  return text
}

/** 组件里用：返回随语言变化的响应式 t，模板中可直接 tt('key') */
export function useI18n() {
  const locale = currentLocale
  const tt = (key, params) => t(key, params)
  return {
    locale,
    tt,
    setLocale,
    toggleLocale,
    available: SUPPORTED,
    labels: LOCALE_LABELS,
    isRtl: computed(() => false),
  }
}

/** 测试用：清空已注册文案 */
export function __resetMessages() {
  for (const k of Object.keys(messages)) delete messages[k]
}
