/**
 * 临时视觉探针：深色模式下 seg-active 与其他按钮的「边框亮度」对比
 * node tests/e2e/verify-borders-darkseg.mjs
 */
import { chromium } from 'playwright'
import sharp from 'sharp'

const BASE = 'http://localhost:5250'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.addInitScript(() => { try { localStorage.setItem('bangumi-theme', 'dark') } catch {} })
await page.goto(`${BASE}/#/appearance`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

const info = await page.evaluate(() => {
  const grab = (sel) => {
    const e = document.querySelector(sel)
    if (!e) return null
    const st = getComputedStyle(e)
    return {
      border: st.borderTopColor, bg: st.backgroundColor,
      text: (e.innerText || '').trim().slice(0, 30),
    }
  }
  const vars = {}
  for (const k of ['--c-primary', '--c-primary-light', '--c-primary-dark']) {
    vars[k] = getComputedStyle(document.body).getPropertyValue(k).trim()
  }
  return {
    vars,
    segActive: grab('.seg-btn.seg-active'),
    segIdle: grab('.seg-btn.seg-idle'),
    neutral: grab('.btn-neutral'),
    step: null,
  }
})
console.log(JSON.stringify(info, null, 2))

// 裁图：seg 区域 + 顺手取整页缩略，人工看图判断「是不是刺眼亮边」
const seg = page.locator('.seg-btn.seg-active').first()
const box = await seg.boundingBox()
await page.screenshot({ path: 'tests/e2e/_dark-seg.png', clip: { x: box.x - 16, y: box.y - 16, width: box.width + 32, height: box.height + 32 } })
console.log('crop →', 'tests/e2e/_dark-seg.png')
const stats = await sharp('tests/e2e/_dark-seg.png').stats()
console.log('channel means:', stats.channels.map((c) => Math.round(c.mean)))
await browser.close()
