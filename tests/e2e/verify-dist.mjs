import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto('file:///D:/Files/Projects/Project-Banager/dist/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3500)

// 常驻文本是容器内第一个 text 节点（气泡是同级 div），只取直接子元素
const dateText = await page.evaluate(() => {
  const el = document.querySelector('[aria-describedby="clock-tip"]')
  if (!el) return 'none'
  const first = el.querySelector('div')
  return first ? first.textContent.trim() : el.textContent.trim()
})
console.log('dist 时钟常驻:', JSON.stringify(dateText))
console.log('含秒:', /\d{2}:\d{2}:\d{2}/.test(dateText))
console.log('SVG 图标数:', await page.evaluate(() => document.querySelectorAll('header button svg').length))
console.log('版本号:', await page.evaluate(() => {
  const m = document.querySelector('aside').textContent.match(/v\d+\.\d+\.\d+/)
  return m ? m[0] : 'none'
}))
console.log('Standalone 残留:', (await page.locator('body').innerText()).includes('Standalone'))
console.log('错误数:', errs.length)
await browser.close()
