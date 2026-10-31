import { chromium } from 'playwright'
import path from 'node:path'

const BASE = 'http://localhost:5185'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto(`${BASE}/#/import`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.locator('input[accept=".xlsx,.xls"]').setInputFiles(path.resolve('tests/e2e/large.xlsx'))
await page.waitForTimeout(500)

// 导入期间并发探测 UI 是否响应（每 250ms 检查一次，统计最长阻塞）
const t0 = Date.now()
await page.locator('button:has-text("开始导入")').click()

let maxGap = 0
let last = Date.now()
let done = false
const poll = (async () => {
  while (!done) {
    const gap = Date.now() - last
    if (gap > maxGap) maxGap = gap
    last = Date.now()
    await new Promise((r) => setTimeout(r, 250))
  }
})()

// 等待日志出现完成标志
for (let i = 0; i < 120; i++) {
  const txt = await page.locator('body').innerText()
  if (txt.includes('导入完成') || txt.includes('导入失败')) break
  await page.waitForTimeout(500)
}
done = true
await poll

const body = await page.locator('body').innerText()
console.log('耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's')
console.log('最长无响应间隔:', maxGap + 'ms')
console.log('结果:', (body.match(/成功导入 \d+ 条数据，失败 \d+ 条/) || ['未完成'])[0])
console.log('有进度日志:', body.includes('已处理'))
console.log('错误数:', errs.length)
await browser.close()
