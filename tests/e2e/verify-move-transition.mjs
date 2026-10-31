import { chromium } from 'playwright'

const BASE = 'http://localhost:5207'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

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

// 布局检查：transition-group 的 contents 是否让 flex 正常工作
const layout = await page.evaluate(() => {
  const bar = document.querySelector('main .glass .flex.items-center.gap-2')
  if (!bar) return null
  const btns = [...bar.querySelectorAll('.btn-base')]
  const tops = [...new Set(btns.map(b => Math.round(b.getBoundingClientRect().top)))]
  return {
    containerClass: bar.className.slice(0, 60),
    btnCount: btns.length,
    rows: tops.length,
    firstBtnTop: btns[0] ? Math.round(btns[0].getBoundingClientRect().top) : null,
  }
})
console.log('工具栏布局:', JSON.stringify(layout))

// 选中 → 记录位置
await page.click('.watching-card')
await page.waitForTimeout(900)
const withSel = await page.evaluate(() => {
  const bar = document.querySelector('main .glass .flex.items-center.gap-2')
  const btns = [...bar.querySelectorAll('.btn-base')]
  return {
    count: btns.length,
    positions: btns.map(b => ({ t: b.textContent.trim().slice(0, 6), x: Math.round(b.getBoundingClientRect().left) })),
  }
})
console.log('\n选中后按钮数:', withSel.count)
withSel.positions.slice(0, 8).forEach(p => console.log(`  ${p.t} @x=${p.x}`))

// 取消选中 → 立刻抓中间态（检查是否有 transform 过渡，说明归位在动）
await page.click('body', { position: { x: 1300, y: 700 } })
await page.waitForTimeout(100)  // 过渡区间
const mid = await page.evaluate(() => {
  const bar = document.querySelector('main .glass .flex.items-center.gap-2')
  const btns = [...bar.querySelectorAll('.btn-base')]
  const moving = btns.filter(b => {
    const tf = getComputedStyle(b).transform
    return tf !== 'none'
  })
  return {
    count: btns.length,
    movingCount: moving.length,
    moves: moving.slice(0, 3).map(b => ({ t: b.textContent.trim().slice(0, 6), tf: getComputedStyle(b).transform.slice(0, 30) })),
  }
})
console.log('\n取消选中 100ms 后:')
console.log('  内存中按钮数:', mid.count)
console.log('  正在 transform 的元素数:', mid.movingCount)
mid.moves.forEach(m => console.log(`    ${m.t}: ${m.tf}`))

await page.waitForTimeout(800)
const after = await page.evaluate(() => {
  const bar = document.querySelector('main .glass .flex.items-center.gap-2')
  return { count: [...bar.querySelectorAll('.btn-base')].length }
})
console.log('\n最终按钮数:', after.count)

console.log('\n错误数:', errs.length)
if (errs.length) console.log(errs.slice(0, 3).join('\n'))
await browser.close()
