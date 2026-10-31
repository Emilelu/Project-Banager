import { chromium } from 'playwright'

const BASE = 'http://localhost:5207'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()

await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
await page.evaluate(() => localStorage.setItem('banager_locale', 'zh'))
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(2000)
await page.evaluate(async () => {
  const m = await import('/src/db/index.js')
  const db = await m.getDb()
  await db.clearWatching()
  db.addWatching({ name: '测试番A', day_of_week: '周三', current_episode: '3' })
})
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(2500)

// 1) 点击卡片（获得焦点）
await page.click('.watching-card')
await page.waitForTimeout(400)
const afterClick = await page.evaluate(() => {
  const el = document.querySelector('.watching-card')
  const cs = getComputedStyle(el)
  return {
    isFocused: document.activeElement === el,
    outlineStyle: cs.outlineStyle,
    outlineWidth: cs.outlineWidth,
    outlineColor: cs.outlineColor,
    matchesFocusVisible: el.matches(':focus-visible'),
  }
})
console.log('点击卡片后:')
console.log(JSON.stringify(afterClick, null, 1))

// 2) 按 Shift，看是否变为 focus-visible
await page.keyboard.down('Shift')
await page.waitForTimeout(300)
await page.keyboard.up('Shift')
await page.waitForTimeout(300)

const afterShift = await page.evaluate(() => {
  const el = document.querySelector('.watching-card')
  const cs = getComputedStyle(el)
  const active = document.activeElement
  return {
    isFocused: active === el,
    activeTag: active?.tagName,
    activeClass: (active?.className || '').toString().slice(0, 50),
    matchesFocusVisible: el.matches(':focus-visible'),
    outlineStyle: cs.outlineStyle,
    outlineWidth: cs.outlineWidth,
    outlineColor: cs.outlineColor,
  }
})
console.log('\n按 Shift 后:')
console.log(JSON.stringify(afterShift, null, 1))

await browser.close()
