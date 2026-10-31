import { chromium } from 'playwright'

const BASE = 'http://localhost:5240'
const browser = await chromium.launch()

const run = async (label, css) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
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

  const frames = await page.evaluate(async (css) => {
    const bars = [...document.querySelectorAll('div.flex')].filter(d => [...d.querySelectorAll(':scope > .btn-base')].some(b => b.textContent.includes('批量')))
    const bar = bars[0]
    bar.setAttribute('data-probe-bar', 'probe')
    const st = document.createElement('style')
    st.textContent = css
    document.head.appendChild(st)

    document.querySelector('.watching-card').click()
    await new Promise(r => setTimeout(r, 900))
    const out = []
    const t0 = performance.now()
    document.body.click()
    await new Promise((resolve) => {
      const tick = () => {
        const t = performance.now() - t0
        const b = [...bar.querySelectorAll('.btn-base')].find(x => x.textContent.includes('批量'))
        const tf = getComputedStyle(b).transform
        const m = tf.match(/matrix\(1, 0, 0, 1, ([-\d.]+)/)
        out.push([+t.toFixed(1), Math.round(b.getBoundingClientRect().left), m ? +m[1] : tf])
        if (t < 420) requestAnimationFrame(tick); else resolve()
      }
      requestAnimationFrame(tick)
    })
    return out
  }, css)

  console.log(`\n=== ${label} ===`)
  console.log(frames.map(f => `${f[0]}ms:L${f[1]}(tx${f[2]})`).join('  '))
  const pick = (ms) => frames.reduce((a, b) => Math.abs(b[0] - ms) < Math.abs(a[0] - ms) ? b : a)
  console.log('50/150/400:', [50, 150, 400].map(ms => { const s = pick(ms); return `${ms}->${s[0]}ms L${s[1]}` }).join(' | '))
  await page.close()
}

await run('现状 + relative + abspos', '[data-probe-bar="probe"]{position:relative} [data-probe-bar="probe"]>.sel-anim-leave-active{position:absolute;pointer-events:none}')
await browser.close()
