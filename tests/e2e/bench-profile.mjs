/**
 * CPU 采样：反复触发「选中卡片 → 200 张卡片重渲染」，用 CDP Profiler 聚合自耗时。
 * 运行：node tests/e2e/bench-profile.mjs
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5258'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(() => {
  try { localStorage.setItem('banager_locale', 'zh') } catch {}
  try { localStorage.setItem('banager_bg_enabled', 'false') } catch {}
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelectorAll('.watching-card').length >= 200, null, { timeout: 30000 })

const cdp = await ctx.newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
await cdp.send('Profiler.start')

// 20 次「选中不同卡片」，每次都让 200 张卡全部重渲染
for (let i = 0; i < 20; i++) {
  await page.evaluate(async (i) => {
    const cards = document.querySelectorAll('.watching-card')
    cards[40 + i].click()
    await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => requestAnimationFrame(r))
  }, i)
}

const { profile } = await cdp.send('Profiler.stop')

// 聚合：self time per function
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const selfById = new Map()
const total = profile.samples.length
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i]
  const dt = profile.timeDeltas[i] || 0
  selfById.set(id, (selfById.get(id) || 0) + dt)
}
const rows = []
for (const [id, us] of selfById) {
  const n = byId.get(id)
  if (!n) continue
  const cf = n.callFrame
  const name = cf.functionName || '(anonymous)'
  const url = (cf.url || '').replace(/^.*\/(src|node_modules\/(?:\.vite\/deps|[^/]+))\//, '$1/')
  rows.push({ name, url, line: cf.lineNumber, ms: us / 1000 })
}
rows.sort((a, b) => b.ms - a.ms)
console.log(`样本 ${total} 个，总采样 ${(profile.endTime - profile.startTime) / 1000} ms\n`)
console.log('自耗时 Top 30:')
for (const r of rows.slice(0, 30)) {
  console.log(`  ${r.ms.toFixed(1).padStart(6)} ms  ${r.name.padEnd(28)} ${r.url}:${r.line}`)
}

// 按文件聚合
const byUrl = new Map()
for (const r of rows) byUrl.set(r.url, (byUrl.get(r.url) || 0) + r.ms)
console.log('\n按文件聚合 Top 15:')
for (const [u, ms] of [...byUrl].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${ms.toFixed(1).padStart(6)} ms  ${u || '(native/idle)'}`)
}

await browser.close()
