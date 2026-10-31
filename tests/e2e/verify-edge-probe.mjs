import { chromium } from 'playwright'
const BASE = 'http://localhost:5260'
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const probe = await page.evaluate(async () => {
  const m = await import('/src/db/index.js')
  const db = await m.getDb()
  return { keys: Object.keys(m), count: db.getAllWatching().length }
})
console.log('PROBE', JSON.stringify(probe))
await browser.close()
