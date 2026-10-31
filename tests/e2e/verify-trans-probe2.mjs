import { chromium } from 'playwright'

const BASE = 'http://localhost:5240'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
page.on('pageerror', e => console.log('[pageerror]', e.message))
await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
await page.evaluate(() => localStorage.setItem('banager_locale', 'zh'))
await page.waitForTimeout(1000)
await page.evaluate(async () => {
  const m = await import('/src/db/index.js')
  const db = await m.getDb()
  await db.clearWatching()
  db.addWatching({ name: '测试番A', day_of_week: '周三', time_slot: '22:00', current_episode: '3' })
})
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(1200)

const res = await page.evaluate(async () => {
  const css = '[data-probe-bar="probe"]{position:relative} [data-probe-bar="probe"]>.sel-anim-leave-active{position:absolute;pointer-events:none}'
  const bars = [...document.querySelectorAll('div.flex')].filter(d => [...d.querySelectorAll(':scope > .btn-base')].some(b => b.textContent.includes('批量')))
  const bar = bars[0]
  bar.setAttribute('data-probe-bar', 'probe')
  const st = document.createElement('style')
  st.textContent = css
  document.head.appendChild(st)

  const diag = []
  const rec = (tag) => {
    const all = [...document.querySelectorAll('[data-probe-bar="probe"]')]
    const btns = [...bar.querySelectorAll('.btn-base')]
    diag.push({
      tag,
      probeCount: all.length,
      barConnected: bar.isConnected,
      btnCount: btns.length,
      batchConnected: btns.find(x => x.textContent.includes('批量'))?.isConnected,
      lefts: btns.map(b => Math.round(b.getBoundingClientRect().left)),
    })
  }
  rec('before-select')
  document.querySelector('.watching-card').click()
  rec('after-click')
  await new Promise(r => setTimeout(r, 900))
  rec('after-900ms')
  return diag
})
console.log(JSON.stringify(res, null, 1))
await browser.close()
