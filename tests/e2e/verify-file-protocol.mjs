import { chromium } from 'playwright'
import path from 'node:path'

const FILE = 'file:///D:/Files/Projects/Project-Banager/dist/index.html'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().split('\n')[0]) })

await page.goto(FILE, { waitUntil: 'load' })
await page.waitForTimeout(4000)

const body = await page.locator('body').innerText()
console.log('页面有内容:', body.includes('正在追番'))
console.log('logo 已渲染:', await page.evaluate(() => {
  const img = document.querySelector('img[alt*="Logo"]')
  return !!img && img.complete && img.naturalWidth > 0
}))
console.log('WASM 已加载（数据库可用）:', await page.evaluate(() => {
  return typeof window !== 'undefined' && document.body.innerText.includes('暂无') !== false
}))
console.log('side bar 可见:', body.includes('导入Excel'))

// 能真正写入数据（证明 sql.js WASM 在 file:// 下工作）
await page.locator('button:has-text("添加番剧")').first().click()
await page.locator('input[placeholder="请输入番剧名称"]').fill('file协议测试番')
await page.locator('button:has-text("保存")').last().click()
await page.waitForTimeout(2000)
const after = await page.locator('body').innerText()
console.log('file:// 下可写入:', after.includes('file协议测试番'))
console.log('新增后自动选中:', after.includes('当前选中'))

console.log('错误数:', errs.length)
if (errs.length) console.log(errs.slice(0, 6).join('\n'))
await page.screenshot({ path: 'D:/Files/Projects/Project-Banager/tests/e2e/file-protocol.png', fullPage: true })
await browser.close()
