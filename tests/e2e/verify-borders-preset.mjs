/**
 * 临时探针：深色模式下「模板配色预设」选中环 border-gray-700 是否可见
 * node tests/e2e/verify-borders-preset.mjs light|dark
 */
import { chromium } from 'playwright'
import sharp from 'sharp'

const BASE = 'http://localhost:5250'
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.addInitScript((t) => { try { localStorage.setItem('bangumi-theme', t) } catch {} }, THEME)
await page.goto(`${BASE}/#/appearance`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)

const info = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('main .rounded-full')]
  return btns.slice(0, 8).map((e) => {
    const st = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return {
      cls: e.className.slice(0, 90),
      border: st.borderTopColor, w: st.borderTopWidth,
      x: Math.round(r.x), y: Math.round(r.y), size: Math.round(r.width),
    }
  })
})
console.log(JSON.stringify(info, null, 2))

const active = page.locator('main button.rounded-full.scale-110, main button.rounded-full').first()
const box = await active.boundingBox()
await page.screenshot({
  path: `tests/e2e/_preset-${THEME}.png`,
  clip: { x: box.x - 20, y: box.y - 20, width: box.width + 240, height: box.height + 40 },
})
console.log(`crop → tests/e2e/_preset-${THEME}.png`)
await browser.close()
