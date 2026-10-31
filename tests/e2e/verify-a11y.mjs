import { chromium } from 'playwright'
const BASE = 'http://localhost:5185'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// 1. 打开添加弹窗：焦点应自动进入首个输入框
await page.locator('button:has-text("添加番剧")').first().click()
await page.waitForTimeout(600)
const focusedId = await page.evaluate(() => {
  const el = document.activeElement
  return { tag: el.tagName.toLowerCase(), ph: el.getAttribute('placeholder') || '' }
})
console.log('弹窗打开后焦点:', JSON.stringify(focusedId))

// 2. 弹窗有 role=dialog / aria-modal
const role = await page.evaluate(() => {
  const d = document.querySelector('.app-dialog')
  return d ? { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal') } : null
})
console.log('弹窗语义:', JSON.stringify(role))

// 3. Tab 循环：连续 Tab 不应逃出弹窗
const inDialog = []
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab')
  inDialog.push(await page.evaluate(() => {
    const d = document.querySelector('.app-dialog')
    return d ? d.contains(document.activeElement) : false
  }))
}
console.log('Tab 循环全部留在弹窗内:', inDialog.every(Boolean))

// 4. Esc 关闭
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
console.log('Esc 后弹窗关闭:', await page.locator('.app-dialog').count() === 0)

// 5. 图标按钮 aria-label
const labels = await page.evaluate(() => {
  return [...document.querySelectorAll('header button')].map((b) => b.getAttribute('aria-label'))
})
console.log('顶栏按钮 aria-label:', JSON.stringify(labels))

console.log('错误数:', errs.length)
await browser.close()
