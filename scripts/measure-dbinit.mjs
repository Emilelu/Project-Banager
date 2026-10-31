/**
 * 数据库初始化耗时对比（就绪信号 = 「首次真正落库」，用只读探测避免脚本自己建库）。
 *
 * 用法：node scripts/measure-dbinit.mjs
 *
 * ⚠ 探测必须用 indexedDB.databases()（只读）：
 *   早先版本用 indexedDB.open('BangumiManagerDB') 轮询，当库不存在时**这个探测本身**
 *   会创建出一个 version 1、没有 object store 的空库；应用随后 open 同一个名字时
 *   不再触发 onupgradeneeded，于是永远拿不到 store、永远不落库 —— 看起来像产物坏了。
 *
 * 就绪判据：bangumi_db 键已有数据。该键只在 create() → initTables() → save() 之后写入，
 * 因此严格晚于「WASM 解码 + WebAssembly 编译 + sql.js 初始化 + 建表」。
 *
 * 变体：
 *   A 优化前（原始 base64 内联）
 *   B 优化后（原生 DecompressionStream）
 *   C 优化后（纯 JS inflate 兜底，禁用 DecompressionStream）
 */
import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const variants = [
  ['A 优化前（原始 base64）', '.workbuddy/build/index.baseline.html', false],
  ['B 优化后（DecompressionStream）', 'dist/index.html', false],
  ['C 优化后（纯 JS inflate 兜底）', 'dist/index.html', true],
]

const fmt = (n) => `${(n / 1024).toFixed(1)} KB`
const median = (arr) => {
  const v = [...arr].sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}

const WAIT_READY = `async (deadline) => {
  const t0 = performance.now()
  while (performance.now() - t0 < deadline) {
    const dbs = await indexedDB.databases()
    if (dbs.some((d) => d.name === 'BangumiManagerDB')) {
      const has = await new Promise((res) => {
        const req = indexedDB.open('BangumiManagerDB')
        req.onerror = req.onblocked = () => res(false)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('database')) { db.close(); return res(false) }
          const tx = db.transaction('database', 'readonly')
          const g = tx.objectStore('database').get('bangumi_db')
          g.onsuccess = () => { const v = g.result; db.close(); res(!!v) }
          g.onerror = () => { db.close(); res(false) }
        }
      })
      if (has) return Math.round(performance.now() - t0)
    }
    await new Promise((r) => setTimeout(r, 25))
  }
  return null
}`

async function run(label, path, killDS) {
  const abs = resolve(path)
  if (!existsSync(abs)) return console.log(`跳过 ${label}: 缺 ${path}`)
  const browser = await chromium.launch()
  const samples = []

  for (let i = 0; i < 5; i++) {
    const ctx = await browser.newContext() // 全新 profile：无缓存 DB
    const page = await ctx.newPage()
    if (killDS) {
      await page.addInitScript(() => {
        try { delete window.DecompressionStream } catch {}
        window.DecompressionStream = undefined
      })
    }
    const t0 = Date.now()
    await page.goto(`file:///${abs.replace(/\\/g, '/')}`, { waitUntil: 'load' })
    const loadMs = Date.now() - t0
    const readyIn = await page.evaluate(new Function(`return (${WAIT_READY})(8000)`))
    samples.push({ loadMs, readyMs: readyIn == null ? null : Date.now() - t0 })
    await ctx.close()
  }

  const raw = readFileSync(abs)
  const okSamples = samples.filter((s) => s.readyMs)
  console.log(`\n=== ${label} ===`)
  console.log(`  大小      : ${raw.length} (${fmt(raw.length)})  gzip ${fmt(gzipSync(raw, { level: 9 }).length)}`)
  console.log(`  load 事件 : ${samples.map((s) => s.loadMs).join(' / ')} ms`)
  console.log(`  DB 落库   : ${samples.map((s) => s.readyMs ?? 'X').join(' / ')} ms   中位 ${median(okSamples.map((s) => s.readyMs))} ms`)

  await browser.close()
  return {
    bytes: raw.length,
    gz: gzipSync(raw, { level: 9 }).length,
    load: median(samples.map((s) => s.loadMs)),
    ready: median(okSamples.map((s) => s.readyMs)),
    failRate: `${samples.length - okSamples.length}/${samples.length}`,
  }
}

const out = []
for (const [l, p, k] of variants) out.push([l, await run(l, p, k)])

console.log('\n=== 汇总（中位数，5 次全新 profile）===')
for (const [l, r] of out) if (r) {
  console.log(`${l.padEnd(32)} ${String(r.bytes).padStart(8)} B  gzip ${String(r.gz).padStart(7)}  load ${r.load} ms  DB ${r.ready} ms  未就绪 ${r.failRate}`)
}
