import { chromium } from 'playwright'
const BASE = process.argv[2] || 'http://localhost:5240'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
await page.evaluate(() => localStorage.setItem('banager_locale', 'zh'))
await page.waitForTimeout(1000)
await page.evaluate(async () => {
  const m = await import('/src/db/index.js')
  const db = await m.getDb()
  db.clearWatching()
  db.addWatching({ name: '测试番A', day_of_week: '周三', current_episode: '3' })
})
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(1400)

const before = await page.evaluate(() => {
  const bar = [...document.querySelectorAll('.sel-anim-wrap')][0]
  return [...bar.querySelectorAll('.btn-base')].map(b => ({ t: b.textContent.trim().slice(0,2), l: Math.round(b.getBoundingClientRect().left) }))
})
await page.locator('.watching-card').first().click()
await page.waitForTimeout(900)
const sel = await page.evaluate(() => {
  const bar = [...document.querySelectorAll('.sel-anim-wrap')][0]
  return [...bar.querySelectorAll('.btn-base')].map(b => ({ t: b.textContent.trim().slice(0,2), l: Math.round(b.getBoundingClientRect().left) }))
})
console.log('未选中:', JSON.stringify(before))
console.log('选中态  :', JSON.stringify(sel))

const frames = await page.evaluate(async () => {
  const bar = [...document.querySelectorAll('.sel-anim-wrap')][0]
  const out = []
  const t0 = performance.now()
  document.body.click()
  await new Promise((resolve) => {
    const tick = () => {
      const t = Math.round(performance.now() - t0)
      const leavers = [...bar.querySelectorAll('.sel-anim-leave-active')].map(e => `${e.textContent.trim().slice(0,2)}:${Math.round(e.getBoundingClientRect().left)}`)
      const batch = [...bar.querySelectorAll('.btn-base')].find(b => b.textContent.includes('批量'))
      out.push({ t, batch: Math.round(batch.getBoundingClientRect().left), leavers })
      if (t < 300) requestAnimationFrame(tick); else resolve()
    }
    requestAnimationFrame(tick)
  })
  return out
})
frames.forEach(f => console.log(`${String(f.t).padStart(4)}ms batch=${f.batch} leavers=[${f.leavers.join(' ')}]`))

await page.screenshot({ path: 'tests/e2e/_mid.png', clip: { x: 240, y: 70, width: 960, height: 110 } })
await browser.close()
