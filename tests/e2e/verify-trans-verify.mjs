/**
 * 三页工具栏「取消选中 → 专属按钮消失 → 其余按钮平滑归位」实测脚本。
 * 运行：node tests/e2e/verify-trans-verify.mjs [baseUrl]
 * 前置：pnpm dev --port 5240 --strictPort
 *
 * 判定：
 *   - 记录「批量选择」按钮 left 起点（选中态）与终点（取消选中稳定后）；
 *   - 在 ~50ms / 150ms / 400ms 采样 left；
 *   - 50ms 与 150ms 的采样必须严格落在 (起点, 终点) 开区间内（渐进移动而非瞬跳）；
 *   - 400ms 已到达终点（过渡 0.22s，留余量）。
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5240'
const BATCH_WORD = '批量选择'
const browser = await chromium.launch()

const ROWS = {
  watching: '.watching-card',
  remaining: 'tbody tr.list-item',
  watched: 'tbody tr.list-item',
}

const seed = async (page) => {
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
  await page.evaluate(() => localStorage.setItem('banager_locale', 'zh'))
  await page.evaluate(async () => {
    const m = await import('/src/db/index.js')
    const db = await m.getDb()
    await db.clearWatching()
    await db.clearRemaining()
    await db.clearWatched()
    db.addWatching({ name: '测试番A', day_of_week: '周三', time_slot: '22:00', current_episode: '3' })
    db.addRemaining({ name: '待看测试A', expected_date: '2026/10' })
    db.addRemaining({ name: '待看测试B', expected_date: '2026/11' })
    db.addWatched({ name: '已看测试A', watch_date: '2026/10/01' })
    db.addWatched({ name: '已看测试B', watch_date: '2026/10/02' })
  })
  // 写库后必须重新加载，否则首屏仍是空列表（同 URL 的 goto 不会重新拉数据）
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1400)
}

const goto = async (page, view) => {
  await page.goto(`${BASE}/#/${view}`, { waitUntil: 'load' })
  await page.waitForTimeout(1400)
}

const read = (page, w) => page.evaluate((w) => {
  const bar = [...document.querySelectorAll('.sel-anim-wrap')].find((d) =>
    [...d.querySelectorAll('.btn-base')].some((b) => b.textContent.includes(w)))
  if (!bar) return { err: 'no bar' }
  const batch = [...bar.querySelectorAll('.btn-base')].find((b) => b.textContent.includes(w))
  return {
    left: Math.round(batch.getBoundingClientRect().left),
    tf: getComputedStyle(batch).transform,
    moveCls: batch.className.includes('sel-anim-move'),
    leaving: bar.querySelectorAll('.sel-anim-leave-active').length,
    count: bar.querySelectorAll('.btn-base').length,
  }
}, w)

const measure = async (page, view) => {
  const rowSel = ROWS[view]
  await goto(page, view)
  const rows = await page.locator(rowSel).count()
  if (!rows) throw new Error(`${view}: 没有列表行`)

  // 选中第一条
  await page.locator(rowSel).first().click()
  await page.waitForTimeout(1100)
  const start = await read(page, BATCH_WORD)
  if (start.count <= 1) throw new Error(`${view}: 选中后专属按钮未出现`)

  // 取消选中，页内 rAF 逐帧采样（避免跨进程往返抖动）
  const frames = await page.evaluate(async (w) => {
    const bar = [...document.querySelectorAll('.sel-anim-wrap')].find((d) =>
      [...d.querySelectorAll('.btn-base')].some((b) => b.textContent.includes(w)))
    const get = () => {
      const batch = [...bar.querySelectorAll('.btn-base')].find((b) => b.textContent.includes(w))
      return {
        left: Math.round(batch.getBoundingClientRect().left),
        tf: getComputedStyle(batch).transform,
        moveCls: batch.className.includes('sel-anim-move'),
        leaving: bar.querySelectorAll('.sel-anim-leave-active').length,
      }
    }
    const out = []
    const t0 = performance.now()
    document.body.click()
    await new Promise((resolve) => {
      const tick = () => {
        const t = performance.now() - t0
        out.push([+t.toFixed(1), get()])
        if (t < 520) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    return out
  }, BATCH_WORD)

  await page.waitForTimeout(250)
  const end = await read(page, BATCH_WORD)

  const pick = (ms) => frames.reduce((a, b) => (Math.abs(b[0] - ms) < Math.abs(a[0] - ms) ? b : a))
  const s50 = pick(50)
  const s150 = pick(150)
  const s400 = pick(400)
  const lo = Math.min(start.left, end.left)
  const hi = Math.max(start.left, end.left)
  const between = (v) => v > lo && v < hi

  console.log(`\n=== #/${view} ===`)
  console.log(`  起点 left（选中态，${start.count} 个按钮）      = ${start.left}`)
  console.log(`  终点 left（取消选中后稳定，${end.count} 个）    = ${end.left}`)
  console.log(`  @ ~50ms  (${s50[0]}ms)  left=${s50[1].left}  tx=${s50[1].tf.slice(0, 34)}  move=${s50[1].moveCls}  leaving=${s50[1].leaving}`)
  console.log(`  @ ~150ms (${s150[0]}ms)  left=${s150[1].left}  tx=${s150[1].tf.slice(0, 34)}  move=${s150[1].moveCls}  leaving=${s150[1].leaving}`)
  console.log(`  @ ~400ms (${s400[0]}ms)  left=${s400[1].left}`)
  const ok = between(s50[1].left) && between(s150[1].left) && s400[1].left === end.left
  console.log(`  50/150ms 严格落在 (${lo}, ${hi}) 内: ${between(s50[1].left)} / ${between(s150[1].left)}`)
  console.log(`  400ms 到位: ${s400[1].left === end.left}`)
  console.log(`  结果: ${ok ? 'PASS' : 'FAIL'}`)
  return { view, start: start.left, end: end.left, at50: s50[1].left, at150: s150[1].left, at400: s400[1].left, ok }
}

const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })).newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('[console error]', m.text().split('\n')[0]) })

await seed(page)
const results = []
for (const view of ['watching', 'remaining', 'watched']) {
  results.push(await measure(page, view))
}

console.log('\n===== 汇总 =====')
for (const r of results) {
  console.log(`#/${r.view.padEnd(10)} start=${r.start}  50ms=${r.at50}  150ms=${r.at150}  400ms=${r.at400}  end=${r.end}  ${r.ok ? 'PASS' : 'FAIL'}`)
}
await browser.close()
process.exitCode = results.every((r) => r.ok) ? 0 : 1
