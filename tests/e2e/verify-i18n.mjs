import { chromium } from 'playwright'
const BASE = 'http://localhost:5186'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

const nav = async () => page.evaluate(() =>
  [...document.querySelectorAll('nav a')].map((a) => a.textContent.trim().replace(/\s+/g, '')))
const langOf = async () => page.evaluate(() => document.documentElement.lang)

console.log('默认语言:', await langOf(), '导航:', JSON.stringify(await nav()))

// 语言按钮的文本随当前语言变化，用 aria-label 定位更稳
const langBtn = () => page.locator('button[aria-label]').last()

// 切到下一个语言
await page.evaluate(() => localStorage.setItem('banager_locale', 'zh'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
console.log('强制中文:', await langOf(), '导航:', JSON.stringify(await nav()))

await langBtn().click()
await page.waitForTimeout(600)
console.log('↑一次:', await langOf(), '导航:', JSON.stringify(await nav()))

await langBtn().click()
await page.waitForTimeout(600)
console.log('↑两次:', await langOf(), '导航:', JSON.stringify(await nav()))

// 持化检查
console.log('localStorage:', await page.evaluate(() => localStorage.getItem('banager_locale')))
console.log('错误数:', errs.length)
if (errs.length) console.log(errs.slice(0, 4).join('\n'))
await browser.close()
