import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5248'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await page.goto(`${BASE}/#/appearance`, { waitUntil: 'load' })
await page.evaluate(() => { localStorage.setItem('banager_locale', 'zh') })
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(1800)

// 展开
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '遮罩与模糊')
  b.click()
})
await page.waitForTimeout(900)
console.log('open:', await page.evaluate(() => !!document.querySelector('.tone-tuning')))

// 收起并记录完整时间线
const seq = await page.evaluate(async () => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '遮罩与模糊')
  const out = []
  const t0 = performance.now()
  const tick = () => {
    const card = document.querySelector('.tone-tuning')
    const root = card ? card.parentElement?.parentElement : null
    out.push({
      t: Math.round(performance.now() - t0),
      present: !!card,
      h: root ? +root.getBoundingClientRect().height.toFixed(2) : null,
      cls: root ? root.className : null,
      rows: root ? getComputedStyle(root).gridTemplateRows : null,
    })
    if (performance.now() - t0 < 1000) requestAnimationFrame(tick)
  }
  tick()
  b.click()
  await new Promise((r) => setTimeout(r, 1050))
  return out
})
for (const s of seq) console.log(JSON.stringify(s))
await browser.close()
