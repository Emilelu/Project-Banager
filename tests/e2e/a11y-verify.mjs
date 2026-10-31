/**
 * 修复后复测：三页 Tab 序 + 批量勾选框键盘 + 弹窗焦点（真浏览器）
 * 运行：node tests/e2e/a11y-verify.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import path from 'node:path'

const ROOT = 'D:/Files/Projects/Project-Banager'
const BASE = process.argv[2] || 'http://localhost:5182'
const MAX_TABS = 80

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().split('\n')[0]}`) })

const log = (...a) => console.log(...a)

// 灌数据
await page.goto(`${BASE}/#/import`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.locator('input[accept=".xlsx,.xls"]').setInputFiles(path.join(ROOT, 'template.xlsx'))
await page.waitForTimeout(500)
await page.locator('button:has-text("开始导入")').click()
await page.waitForTimeout(4500)

/** 收集当前页「键盘可达」的交互元素（role/tabindex/aria 说明） */
const tabWalk = async (limit = MAX_TABS, { reset = true } = {}) => {
  if (reset) {
    await page.evaluate(() => {
      document.activeElement?.blur?.()
      const root = document.querySelector('main')
      if (root) { root.setAttribute('tabindex', '-1'); root.focus(); root.removeAttribute('tabindex') }
    })
    // Esc 会顺带退出批量模式，批量模式下的探测必须关掉这一步
    await page.keyboard.press('Escape')
  }
  const seen = []
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 34),
        role: el.getAttribute('role'),
        tabindex: el.getAttribute('tabindex'),
        ariaSort: el.getAttribute('aria-sort'),
        ariaChecked: el.getAttribute('aria-checked'),
        ariaLabel: el.getAttribute('aria-label'),
        cls: (el.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 2).join('.'),
      }
    })
    if (!info) break
    const key = `${info.tag}|${info.cls}|${info.text}`
    if (seen.length && seen[0].key === key) break
    seen.push({ key, ...info })
  }
  return seen
}

const show = (label, arr) => {
  log(`\n${label}：Tab 可达 ${arr.length} 项`)
  arr.forEach((x, i) => log(`  ${String(i + 1).padStart(3)}. ${x.tag}${x.role ? '[' + x.role + ']' : ''}${x.ariaSort ? ' aria-sort=' + x.ariaSort : ''}${x.ariaChecked ? ' aria-checked=' + x.ariaChecked : ''} 「${x.text}」`))
}

// ---- 追番页 ----
await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const watchingTabs = await tabWalk()
show('追番 WatchingView', watchingTabs)
log('  卡片本体可达:', watchingTabs.some((x) => x.role === 'button' && x.cls.includes('watching-card')))

// 批量模式：勾选框
await page.locator('button:has-text("批量选择")').first().click()
await page.waitForTimeout(600)
const batchTabs = await tabWalk(MAX_TABS, { reset: false })
const boxes = batchTabs.filter((x) => x.role === 'checkbox')
log(`\n追番页批量模式：Tab 可达复选框 ${boxes.length} 个`)
boxes.slice(0, 3).forEach((b) => log(`  - aria-checked=${b.ariaChecked} 「${b.text}」`))

// 键盘切换第一个复选框
const firstBox = page.locator('main [role="checkbox"]').first()
await firstBox.focus()
await page.keyboard.press('Space')
await page.waitForTimeout(300)
log('  空格后 aria-checked:', await firstBox.getAttribute('aria-checked'))
log('  批量删除按钮出现:', await page.locator('button:has-text("批量删除")').count() > 0)

// ---- 弹窗焦点 ----
await page.locator('button:has-text("批量选择")').first().click()
await page.waitForTimeout(400)
const triggerInfo = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('添加番剧'))
  btn.focus()
  return btn.textContent.trim()
})
await page.locator('button:has-text("添加番剧")').first().click()
await page.waitForTimeout(700)
const openState = await page.evaluate(() => {
  const dlg = document.querySelector('.app-dialog')
  return {
    role: dlg?.getAttribute('role'),
    ariaModal: dlg?.getAttribute('aria-modal'),
    labelledBy: dlg?.getAttribute('aria-labelledby'),
    titleText: dlg?.querySelector('#' + dlg?.getAttribute('aria-labelledby'))?.textContent?.trim(),
    focusInside: !!dlg?.contains(document.activeElement),
    activeTag: document.activeElement?.tagName?.toLowerCase(),
    activeLabel: document.activeElement?.getAttribute('placeholder'),
  }
})
log('\n弹窗打开:', JSON.stringify(openState))
log('  触发按钮:', triggerInfo)

await page.keyboard.press('Escape')
await page.waitForTimeout(600)
const closeState = await page.evaluate(() => ({
  dialogClosed: !document.querySelector('.app-dialog'),
  focusTag: document.activeElement?.tagName?.toLowerCase(),
  focusText: (document.activeElement?.textContent || '').trim().slice(0, 20),
}))
log('  Esc 关闭后:', JSON.stringify(closeState))

// ---- 等番页 ----
await page.goto(`${BASE}/#/remaining`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
show('等番 RemainingView', await tabWalk())

// ---- 已看页 ----
await page.goto(`${BASE}/#/watched`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
show('已看 WatchedView', await tabWalk())

// 表头 aria-sort 随排序切换
const nameTh = page.locator('th:has-text("作品名称")').first()
await nameTh.focus()
log('\n表头初始 aria-sort:', await nameTh.getAttribute('aria-sort'))
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
log('Enter 后 aria-sort:', await nameTh.getAttribute('aria-sort'))
await page.keyboard.press('Space')
await page.waitForTimeout(400)
log('Space 后 aria-sort:', await nameTh.getAttribute('aria-sort'))

log('\n控制台错误:', errors.length ? errors.slice(0, 6) : '无')
await browser.close()
