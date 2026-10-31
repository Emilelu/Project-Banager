import { chromium } from 'playwright'
const BASE = 'http://localhost:5240'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
page.on('pageerror', e => console.log('[pageerror]', e.message))
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().split('\n')[0]) })
await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
await page.evaluate(() => localStorage.setItem('banager_locale', 'zh'))
await page.waitForTimeout(1200)
const r = await page.evaluate(async () => {
  try {
    const m = await import('/src/db/index.js')
    const db = await m.getDb()
    db.clearWatching(); db.clearRemaining(); db.clearWatched()
    db.addWatching({ name: 'A', day_of_week: '周三', current_episode: '3' })
    db.addRemaining({ name: 'R1', expected_date: '2026/10' })
    db.addWatched({ name: 'W1', watch_date: '2026/10/01' })
    return { ok: true, w: db.getWatchingAll?.()?.length }
  } catch (e) { return { ok: false, err: e.message + ' | ' + e.stack?.slice(0, 300) } }
})
console.log(JSON.stringify(r))
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(1500)
console.log('cards:', await page.locator('.watching-card').count())
await page.goto(`${BASE}/#/remaining`, { waitUntil: 'load' }); await page.waitForTimeout(1500)
console.log('remaining rows:', await page.locator('tbody tr.list-item').count())
await page.goto(`${BASE}/#/watched`, { waitUntil: 'load' }); await page.waitForTimeout(1500)
console.log('watched rows:', await page.locator('tbody tr.list-item').count())
await browser.close()
