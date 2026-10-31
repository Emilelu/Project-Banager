import { chromium } from 'playwright'
const BASE = 'http://localhost:5186'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().split('\n')[0]) })

await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// 1. 顶栏 SVG 图标
const svgCount = await page.evaluate(() => document.querySelectorAll('header button svg').length)
console.log('顶栏 SVG 图标数:', svgCount)
console.log('顶栏还有 emoji:', await page.evaluate(() => {
  const t = [...document.querySelectorAll('header button')].map((b) => b.textContent).join('')
  return /[\u{1F300}-\u{1FAFF}]/u.test(t)
}))

// 2. 时钟默认不含秒
const dateText = await page.evaluate(() => {
  const el = document.querySelector('[aria-describedby="clock-tip"]')
  return el ? el.textContent.trim() : 'none'
})
console.log('时钟常驻:', JSON.stringify(dateText), '| 含秒:', /\d{2}:\d{2}:\d{2}/.test(dateText))

// 悬浮显示秒
await page.locator('[aria-describedby="clock-tip"]').hover()
await page.waitForTimeout(400)
const tipVisible = await page.evaluate(() => {
  const tip = document.querySelector('#clock-tip')
  if (!tip) return 'none'
  return { text: tip.textContent.trim(), opacity: getComputedStyle(tip).opacity }
})
console.log('悬浮气泡:', JSON.stringify(tipVisible))

// 3. 版本号
console.log('版本号:', await page.evaluate(() => {
  const m = document.querySelector('aside').textContent.match(/v\d+\.\d+\.\d+/)
  return m ? m[0] : 'none'
}))
console.log('还有 Standalone:', (await page.locator('body').innerText()).includes('Standalone'))

// 4. 备份气泡
await page.locator('button[aria-label]').filter({ hasText: '' }).first().waitFor({ timeout: 5000 }).catch(() => {})
const exportBtn = page.locator('aside .relative.group').first()
await exportBtn.hover()
await page.waitForTimeout(400)
console.log('备份气泡:', await page.evaluate(() => {
  const tip = document.querySelector('#backup-tip')
  return tip ? { text: tip.textContent.replace(/\s+/g, ' ').trim(), opacity: getComputedStyle(tip).opacity } : 'none'
}))

console.log('错误数:', errs.length)
if (errs.length) console.log(errs.slice(0, 5).join('\n'))
await page.screenshot({ path: 'D:/Files/Projects/Project-Banager/tests/e2e/visual-final.png', fullPage: true })
await browser.close()
