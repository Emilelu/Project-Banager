import { chromium } from 'playwright'

const BASE = 'http://localhost:5253'
const OUT = 'D:/Files/Projects/Project-Banager/tests/e2e'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 })
const page = await ctx.newPage()
await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.evaluate(async () => {
  const { getDb } = await import('/src/db/index.js')
  const db = await getDb()
  const names = db.getAllWatching().map((r) => r.name)
  const seed = [
    { name: 'PROBE-25', day_of_week: '周一', current_episode: '3', total_episodes: '12' },
    { name: 'PROBE-100', day_of_week: '周二', current_episode: '12', total_episodes: '12' },
    { name: 'PROBE-NOTOTAL', day_of_week: '周三', current_episode: '5', total_episodes: '' },
    { name: 'PROBE-QMARK', day_of_week: '周四', current_episode: '5', total_episodes: '?' },
    { name: 'PROBE-OVER', day_of_week: '周五', current_episode: '15', total_episodes: '12' },
    { name: 'PROBE-UNSCHED-A', day_of_week: '', current_episode: '3', total_episodes: '12' },
    { name: 'PROBE-UNSCHED-B', day_of_week: '', current_episode: '5', total_episodes: '' },
  ]
  for (const s of seed) if (!names.includes(s.name)) db.addWatching(s)
  await db.persist?.()
})
await page.evaluate(() => { location.hash = '#/remaining' })
await page.waitForTimeout(800)
await page.evaluate(() => { location.hash = '#/watching' })
await page.waitForTimeout(2500)

// 特效图：整卡放大 3x
for (const [tag, name] of [['25-light', 'PROBE-25'], ['100-light', 'PROBE-100'], ['none-light', 'PROBE-NOTOTAL']]) {
  await page.locator('.watching-card').filter({ hasText: name }).first().screenshot({ path: `${OUT}/verify-card-zoom-${tag}.png` })
}
await page.evaluate(() => { document.documentElement.classList.add('dark'); document.body.classList.add('dark') })
await page.waitForTimeout(500)
for (const [tag, name] of [['25-dark', 'PROBE-25'], ['100-dark', 'PROBE-100'], ['none-dark', 'PROBE-NOTOTAL']]) {
  await page.locator('.watching-card').filter({ hasText: name }).first().screenshot({ path: `${OUT}/verify-card-zoom-${tag}.png` })
}
await page.evaluate(() => { document.documentElement.classList.remove('dark'); document.body.classList.remove('dark') })
await page.waitForTimeout(300)

// 窄屏特写：1024 / 1152 的周一列
for (const w of [1152, 1024]) {
  await page.setViewportSize({ width: w, height: 860 })
  await page.waitForTimeout(700)
  await page.locator('.grid.grid-cols-7').first().screenshot({ path: `${OUT}/verify-card-narrow-${w}-light.png` })
}
await browser.close()
