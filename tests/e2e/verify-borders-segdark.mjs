/**
 * 临时探针：深色模式 seg-active 描边的三个候选，截图对比
 * node tests/e2e/verify-borders-segdark.mjs
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5250'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.addInitScript(() => { try { localStorage.setItem('bangumi-theme', 'dark') } catch {} })
await page.goto(`${BASE}/#/appearance`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

// 克隆一组 seg 按钮到独立舞台，分别套三个候选描边
await page.evaluate(() => {
  const host = document.createElement('div')
  host.id = '__segtest'
  host.style.cssText =
    'position:fixed;left:20px;top:20px;z-index:99999;padding:16px;display:flex;flex-direction:column;gap:10px;' +
    'background:rgba(26,20,48,.85);border-radius:12px'
  const variants = [
    ['现状 primary-light 全不透明', ''],
    ['primary-light / 0.45', 'border-color:rgb(var(--c-primary-light)/0.45)!important'],
    ['primary-light / 0.28', 'border-color:rgb(var(--c-primary-light)/0.28)!important'],
    ['primary / 60% + primary-light 混', 'border-color:color-mix(in srgb,rgb(var(--c-primary)) 55%,rgb(var(--c-primary-light)))!important'],
  ]
  for (const [label, css] of variants) {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:10px'
    const t = document.createElement('div')
    t.textContent = label
    t.style.cssText = 'color:#cbd5e1;font-size:12px;width:230px'
    const b = document.createElement('button')
    b.className = 'seg-btn seg-active'
    b.textContent = '选中态'
    b.style.cssText =
      'padding:6px 18px;border-radius:8px;font-size:12px;border:1px solid;' + css
    const idle = document.createElement('button')
    idle.className = 'seg-btn seg-idle'
    idle.textContent = '未选中（参照）'
    idle.style.cssText = 'padding:6px 18px;border-radius:8px;font-size:12px;border:1px solid'
    row.append(t, b, idle)
    host.appendChild(row)
  }
  document.body.appendChild(host)
})
await page.waitForTimeout(400)
const host = page.locator('#__segtest')
await host.screenshot({ path: 'tests/e2e/_segdark-variants.png' })
console.log('saved tests/e2e/_segdark-variants.png')
await browser.close()
