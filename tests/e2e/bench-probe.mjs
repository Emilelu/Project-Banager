import { chromium } from 'playwright'
const BASE = 'http://localhost:5258'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().split('\n')[0]}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack?.split('\n').slice(0, 4).join('\n')}`))
await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
await page.waitForTimeout(4000)
console.log('body text length:', (await page.locator('body').innerText()).length)
console.log('body:', (await page.locator('body').innerText()).slice(0, 400))
console.log('cards:', await page.locator('.watching-card').count())
console.log('LOGS:\n' + logs.slice(0, 30).join('\n'))
await browser.close()
