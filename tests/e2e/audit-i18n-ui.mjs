/**
 * 临时 UI 残留中文实测（用后删除）
 * 起点：pnpm dev --port 5254
 * 用法：node tests/e2e/audit-i18n-ui.mjs [tag]
 *
 * 对 en / ja 各跑一遍：
 *   6 个路由页 + 帮助弹窗 + 等番季度菜单 + 语言菜单
 *   + 各页主对话框（添加番剧 / 添加记录 / 批量添加 / 新建标签 / 外观页）
 * 抓取所有可见文本节点与 title/aria-label/placeholder/alt 属性。
 * 英文页出现汉字 = 问题；日文页允许汉字，仅单列供人工复核中文表达。
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = 'http://localhost:5254'
const TAG = process.argv[2] || 'run'
const ROUTES = ['#/watching', '#/remaining', '#/watched', '#/tags', '#/appearance', '#/import']
// 汉字 + CJK/全角标点（英文页这些同样是不允许的残留）
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff01-\uff60]/

// 允许出现的中文（语言自称）
const ALLOWED = new Set(['中文', 'English', '日本語', '简体中文'])

const report = []
const errors = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(e.message))

async function collect() {
  return page.evaluate(() => {
    const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff01-\uff60]/
    const out = { texts: [], attrs: [], lang: document.documentElement.lang }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
        const p = node.parentElement
        if (!p) return NodeFilter.FILTER_REJECT
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName)) return NodeFilter.FILTER_REJECT
        const cs = getComputedStyle(p)
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
    while (walker.nextNode()) {
      const v = walker.currentNode.nodeValue.replace(/\s+/g, ' ').trim()
      if (v && CJK.test(v)) out.texts.push({ v, tag: walker.currentNode.parentElement.tagName })
    }
    for (const el of document.querySelectorAll('*')) {
      for (const a of ['title', 'aria-label', 'placeholder', 'alt']) {
        const val = el.getAttribute(a)
        if (val && CJK.test(val)) out.attrs.push({ a, v: val, tag: el.tagName })
      }
    }
    return out
  })
}

async function snapshot(section) {
  const { texts, attrs, lang } = await collect()
  for (const t of texts) {
    if (ALLOWED.has(t.v)) continue
    report.push({ section: `${section} [lang=${lang}]`, where: 'text', text: t.v })
  }
  for (const a of attrs) {
    if (ALLOWED.has(a.v)) continue
    report.push({ section: `${section} [lang=${lang}]`, where: `attr:${a.a}`, text: a.v })
  }
}

async function clickByButtonText(re) {
  return page.evaluate((src) => {
    const rx = new RegExp(src, 'i')
    const btns = [...document.querySelectorAll('button, a, label')]
    const hit = btns.find((b) => rx.test((b.textContent || '').trim()) || rx.test(b.getAttribute('aria-label') || '') || rx.test(b.getAttribute('title') || ''))
    if (hit) {
      hit.click()
      return (hit.textContent || '').trim().slice(0, 40)
    }
    return null
  }, re.source)
}

async function setLocale(locale) {
  await page.evaluate((l) => localStorage.setItem('banager_locale', l), locale)
}

async function visitAll(locale) {
  // 先落到任意页，写入语言，然后硬刷新确保 i18n 初始化读到新语言
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
  await setLocale(locale)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1600)
  let lang = await page.evaluate(() => document.documentElement.lang)
  if (lang !== locale) {
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(1600)
    lang = await page.evaluate(() => document.documentElement.lang)
  }

  for (const route of ROUTES) {
    await page.goto(`${BASE}/${route}`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    await snapshot(`${locale} ${route}`)

    if (route.includes('remaining')) {
      await clickByButtonText(/本季|season|新番|シーズン/i)
      await page.waitForTimeout(400)
      await snapshot(`${locale} ${route} +seasonMenu`)
      await page.keyboard.press('Escape').catch(() => {})
    }
  }
}

// ---- 帮助弹窗（每个语言各一）----
async function helpDialog(locale) {
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header button')].find((b) =>
      /help|帮助|ヘルプ/i.test(b.getAttribute('aria-label') || '') || /help|帮助|ヘルプ/i.test(b.getAttribute('title') || ''))
    if (btn) btn.click()
    else {
      const b2 = [...document.querySelectorAll('header button')].find((b) => !b.getAttribute('aria-label')?.match(/lang|语言|言語|theme|主题|テーマ/))
      b2?.click()
    }
  })
  await page.waitForTimeout(700)
  await snapshot(`${locale} helpDialog`)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(400)
}

// ---- 语言菜单（语言自称允许，但检测其它）----
async function langMenu(locale) {
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header button')].find((b) =>
      /lang|语言|言語/i.test(b.getAttribute('aria-label') || '') || /lang|语言|言語/i.test(b.getAttribute('title') || ''))
    btn?.click()
  })
  await page.waitForTimeout(500)
  await snapshot(`${locale} langMenu`)
  await page.keyboard.press('Escape').catch(() => {})
}

// ---- 主对话框（每个语言各一遍）----
async function dialogs(locale) {
  // 追番页：添加番剧
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
  await clickByButtonText(/添加番剧|Add Show|作品を追加|添加/i)
  await page.waitForTimeout(700)
  await snapshot(`${locale} watching addDialog`)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(400)

  // 已看页：添加记录 / 添加年份
  await page.goto(`${BASE}/#/watched`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
  await clickByButtonText(/添加记录|Add Record|記録を追加/i)
  await page.waitForTimeout(700)
  await snapshot(`${locale} watched addRecordDialog`)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(400)
  await clickByButtonText(/添加年份|Add Year|年を追加/i)
  await page.waitForTimeout(700)
  await snapshot(`${locale} watched addYearDialog`)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(400)

  // 等番页：批量添加
  await page.goto(`${BASE}/#/remaining`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
  await clickByButtonText(/批量添加|Batch|まとめて追加/i)
  await page.waitForTimeout(700)
  await snapshot(`${locale} remaining batchAddDialog`)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(400)

  // 标签页：新建标签（内联输入）
  await page.goto(`${BASE}/#/tags`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
  await clickByButtonText(/新建标签|New tag|新しいタグ/i)
  await page.waitForTimeout(600)
  await snapshot(`${locale} tags inlineCreate`)
  await page.keyboard.press('Escape').catch(() => {})
}

// ---- 空数据库分支：清空后看空态文案（避免被数据掩盖）----
async function emptyStates(locale) {
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    // 清空 localStorage 里的数据快照（若有）
    localStorage.clear()
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1500)
  await page.goto(`${BASE}/#/remaining`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await snapshot(`${locale} remaining (post-clear)`)
}

for (const locale of ['en', 'ja']) {
  await visitAll(locale)
  await helpDialog(locale)
  await langMenu(locale)
  await dialogs(locale)
}

await browser.close()

// ---- 汇总（同一文案去重，便于阅读）----
const lines = []
lines.push(`===== UI 残留中文实测 (${TAG}) =====`)
lines.push(`pageerrors=${errors.length}`)
for (const e of errors.slice(0, 10)) lines.push(`  ! ${e}`)
lines.push(`findings=${report.length}`)

const bySection = {}
for (const r of report) (bySection[r.section] ||= []).push(r)
for (const [section, items] of Object.entries(bySection)) {
  const uniq = [...new Set(items.map((i) => `${i.where}|${i.text}`))]
  lines.push('')
  lines.push(`--- ${section} (${uniq.length}) ---`)
  for (const u of uniq) {
    const [where, text] = u.split('|')
    lines.push(`  [${where}] ${JSON.stringify(text)}`)
  }
}

writeFileSync(new URL(`audit-i18n-ui-${TAG}.txt`, import.meta.url), lines.join('\n'), 'utf8')
console.log(lines.join('\n'))
