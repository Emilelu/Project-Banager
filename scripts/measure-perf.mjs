/**
 * 首屏/加载性能对比：优化前产物 vs 优化后产物（均通过 file:// 打开）。
 *
 * 用法：node scripts/measure-perf.mjs
 *
 * 指标：
 *   - HTML 字节数 / gzip 字节数
 *   - 从 goto 到 [boot] first animation frame ok 的耗时（首帧可用）
 *   - 从 goto 到 IndexedDB 里出现 sqlite 库（= WASM 解析 + sql.js 初始化完成）的耗时
 *   - 页面内 navigation timing 的 domContentLoaded / load
 */
import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const candidates = [
  ['优化前（baseline）', '.workbuddy/build/index.baseline.html'],
  ['优化后（当前 dist）', 'dist/index.html'],
]

const fmt = (n) => `${(n / 1024).toFixed(1)} KB`

async function measure(label, path) {
  const abs = resolve(path)
  if (!existsSync(abs)) {
    console.log(`跳过 ${label}：找不到 ${path}`)
    return
  }
  const raw = readFileSync(abs)
  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  // 记录 boot 打点时间（页面 console）
  let firstFrameMs = null
  page.on('console', (m) => {
    if (m.text().includes('first animation frame ok')) firstFrameMs = Date.now() - t0
  })
  let t0 = Date.now()
  await page.goto(`file:///${abs.replace(/\\/g, '/')}`, { waitUntil: 'load' })
  const loadMs = Date.now() - t0

  // 等首帧打点（最多 8s）
  for (let i = 0; i < 80 && firstFrameMs === null; i++) await page.waitForTimeout(100)

  // 等 sql.js 初始化完成：IndexedDB 出现库
  const dbReadyMs = await page.evaluate(async () => {
    const t = performance.now()
    return new Promise((resolve) => {
      const req = indexedDB.open('BangumiManagerDB', 1)
      req.onerror = () => resolve(null)
      req.onsuccess = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('database')) return resolve(null)
        const tx = db.transaction('database', 'readonly')
        const get = tx.objectStore('database').get('bangumi_db')
        get.onsuccess = () => resolve(get.result ? Math.round(performance.now() - t) : null)
        get.onerror = () => resolve(null)
      }
    })
  })

  const nav = await page.evaluate(() => {
    const e = performance.getEntriesByType('navigation')[0]
    return e ? { dcl: Math.round(e.domContentLoadedEventEnd), load: Math.round(e.loadEventEnd), dur: Math.round(e.duration) } : null
  })

  console.log(`\n=== ${label} ===`)
  console.log(`  文件大小   : ${raw.length} bytes (${fmt(raw.length)})  gzip ${fmt(gzipSync(raw, { level: 9 }).length)}`)
  console.log(`  load 事件  : ${loadMs} ms`)
  console.log(`  首帧打点   : ${firstFrameMs === null ? '未捕获' : firstFrameMs + ' ms'}`)
  console.log(`  DB 就绪    : ${dbReadyMs === null ? '（本机已有库，读取很快）' : dbReadyMs + ' ms（页面内计时）'}`)
  console.log(`  nav timing : DCL ${nav?.dcl} ms / load ${nav?.load} ms / duration ${nav?.dur} ms`)

  await browser.close()
  return { raw: raw.length, gz: gzipSync(raw, { level: 9 }).length, loadMs, firstFrameMs }
}

const results = []
for (const [label, p] of candidates) results.push([label, await measure(label, p)])

console.log('\n=== 对比 ===')
if (results.every(([, r]) => r)) {
  const [[, a], [, b]] = results
  console.log(`字节     : ${a.raw} → ${b.raw}  (${b.raw - a.raw}, ${(((b.raw - a.raw) / a.raw) * 100).toFixed(1)}%)`)
  console.log(`gzip     : ${a.gz} → ${b.gz}  (${b.gz - a.gz}, ${(((b.gz - a.gz) / a.gz) * 100).toFixed(1)}%)`)
}
