import { chromium } from 'playwright'

const BASE = 'http://localhost:5252'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().split('\n')[0]) })

await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

await page.evaluate(async () => {
  const { getDb } = await import('/src/db/index.js')
  const db = await getDb()
  const existing = db.getAllWatching().map((r) => r.name)
  const seed = [
    { name: 'PROBE-25', day_of_week: '周一', current_episode: '3', total_episodes: '12' },
    { name: 'PROBE-100', day_of_week: '周二', current_episode: '12', total_episodes: '12' },
    { name: 'PROBE-NOTOTAL', day_of_week: '周三', current_episode: '5', total_episodes: '' },
    { name: 'PROBE-QMARK', day_of_week: '周四', current_episode: '5', total_episodes: '?' },
    { name: 'PROBE-OVER', day_of_week: '周五', current_episode: '15', total_episodes: '12' },
  ]
  for (const s of seed) if (!existing.includes(s.name)) db.addWatching(s)
  try { await db.persist?.() } catch (e) { console.log('persist fail', e?.message) }
  return db.getAllWatching().length
}).then((n) => console.log('rows:', n))

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

const info = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.watching-card')]
  const pick = (name) => cards.find((c) => c.textContent.includes(name))
  const out = []
  for (const c of cards.slice(0, 10)) {
    const r = c.getBoundingClientRect()
    out.push({
      text: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 60),
      w: Math.round(r.width),
      h: Math.round(r.height),
      scrollW: c.scrollWidth,
      clientW: c.clientWidth,
    })
  }
  const anyCard = cards[0]
  let colW = 0
  if (anyCard) {
    const p = anyCard.parentElement
    colW = Math.round(p.getBoundingClientRect().width)
  }
  return { out, colW, cols: document.querySelectorAll('.grid-cols-7 > div').length }
})
console.log('column width:', info.colW, 'cols:', info.cols)
console.log(JSON.stringify(info.out, null, 1))
await page.screenshot({ path: 'D:/Files/Projects/Project-Banager/tests/e2e/probe-before.png' })
await browser.close()
