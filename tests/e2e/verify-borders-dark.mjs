/**
 * 临时探针：深色模式下三类「边框在深底上突然变亮 / 失效」的候选
 *  ① 表格复选框 border-gray-300（模板写死浅灰）
 *  ② 配色预设选中环 border-gray-700
 *  ③ seg-active 描边 rgb(--c-primary-light)（被自动提亮到近白）
 * node tests/e2e/verify-borders-dark.mjs
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5250'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.addInitScript(() => { try { localStorage.setItem('bangumi-theme', 'dark') } catch {} })

const probe = async (pageName, fn) => {
  await page.goto(`${BASE}/${pageName}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1600)
  await fn()
}

// ① 复选框
await probe('#/remaining', async () => {
  const r = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('tbody input[type="checkbox"], tbody .rounded.border-2, thead input[type="checkbox"]')]
    return {
      count: boxes.length,
      samples: boxes.slice(0, 3).map((e) => {
        const st = getComputedStyle(e)
        const rc = e.getBoundingClientRect()
        return {
          tag: e.tagName, cls: (e.className || '').toString().slice(0, 80),
          border: st.borderTopColor, w: st.borderTopWidth, bg: st.backgroundColor,
          x: Math.round(rc.x), y: Math.round(rc.y), s: Math.round(rc.width),
        }
      }),
    }
  })
  console.log('① 表格复选框:', JSON.stringify(r, null, 2))
})

// ② 配色预设：点一个再读选中环
await probe('#/appearance', async () => {
  const swatches = page.locator('main button.rounded-full').filter({ hasNotText: '' })
  const n = await page.locator('main .w-10.h-10.rounded-full').count()
  console.log('预设按钮数:', n)
  await page.locator('main .w-10.h-10.rounded-full').nth(1).click()
  await page.waitForTimeout(700)
  const r = await page.evaluate(() => {
    const list = [...document.querySelectorAll('main .w-10.h-10.rounded-full')]
    return list.map((e) => {
      const st = getComputedStyle(e)
      return { cls: e.className.slice(0, 70), border: st.borderTopColor, w: st.borderTopWidth }
    })
  })
  console.log('② 预设选中环:', JSON.stringify(r, null, 2))
  const first = page.locator('main .w-10.h-10.rounded-full').first()
  const box = await first.boundingBox()
  await page.screenshot({ path: 'tests/e2e/_preset-selected-dark.png', clip: { x: box.x - 10, y: box.y - 10, width: 300, height: 60 } })
  console.log('shot: tests/e2e/_preset-selected-dark.png')
})

// ③ seg-active 描边
await probe('#/appearance', async () => {
  const r = await page.evaluate(() => {
    const e = document.querySelector('.seg-btn.seg-active')
    const st = getComputedStyle(e)
    const b = document.querySelector('.btn-neutral') || null
    return {
      segActive: { border: st.borderTopColor, bg: st.backgroundColor },
      neutral: b ? { border: getComputedStyle(b).borderTopColor } : null,
    }
  })
  console.log('③ seg:', JSON.stringify(r, null, 2))
})
await browser.close()
