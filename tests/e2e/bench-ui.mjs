/**
 * 性能基准：UI / 渲染（Playwright，真实浏览器）
 * 运行：node tests/e2e/bench-ui.mjs
 *
 * 数据：200 追番 + 500 等番 + 1000 已看（写入 IndexedDB 快照，冷启动加载）
 * 测量：首屏渲染、路由切换、交互延迟、long task、内存
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5258'
const ROUNDS = Number(process.env.ROUNDS || 5)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(() => {
  window.__docStart = performance.now()
  try { localStorage.setItem('banager_locale', 'zh') } catch {}
  try { localStorage.setItem('banager_bg_enabled', 'false') } catch {}
})
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

const out = {}
const log = (...a) => console.log(...a)

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const sum = s.reduce((a, b) => a + b, 0)
  const p = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]
  return { min: s[0], med: p(0.5), p90: p(0.9), max: s[s.length - 1], mean: sum / s.length }
}
function report(label, arr, extra = '') {
  const st = stats(arr)
  log(`  ${label.padEnd(40)} min ${st.min.toFixed(1)} / med ${st.med.toFixed(1)} / p90 ${st.p90.toFixed(1)} / max ${st.max.toFixed(1)} ms ${extra}`)
  out[label] = st
}

async function go(route) {
  await page.evaluate(async (r) => { const mod = (await import('/src/router/index.js')).default; await mod.push(r) }, route)
}
async function waitCards(n = 1) {
  await page.waitForFunction((n) => document.querySelectorAll('.watching-card').length >= n, n, { timeout: 20000 })
}

// ---------------------------------------------------------------------------
// 0. 播种（先让 Vite 完成首次 transform/optimize，避免污染冷启动数字）
// ---------------------------------------------------------------------------
await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
await page.waitForFunction(() => document.body.innerText.includes('添加番剧') || document.querySelectorAll('.watching-card').length > 0, null, { timeout: 60000 })

const seeded = await page.evaluate(async () => {
  const mod = await import('/src/db/index.js')
  const db = await mod.getDb()
  if (db.getAllWatching().length >= 200) return { skipped: true, watching: db.getAllWatching().length }
  db.beginBatch()
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  for (let i = 0; i < 200; i++) {
    db._run(
      'INSERT INTO watching (name, day_of_week, time_slot, current_episode, total_episodes, url, url_params, notes, tags, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [`追番${i}`, days[i % 7], `${String(i % 24).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, String(i % 12), '12', i % 2 ? 'https://www.bilibili.com/video/BV1xx411c7mD' : '', i % 2 ? 'p={集数}' : '', `备注${i}`, i % 3 ? '热血,原创' : '', i],
    )
  }
  for (let i = 0; i < 500; i++) {
    db._run('INSERT INTO remaining (name, expected_date, url, url_params, notes, tags, sort_order) VALUES (?,?,?,?,?,?,?)',
      [`等番${i}`, `2026/${String((i % 12) + 1).padStart(2, '0')}`, '', '', `备注${i}`, i % 4 ? '治愈' : '', i])
  }
  const years = new Set()
  for (let i = 0; i < 1000; i++) {
    const y = 2016 + (i % 10)
    years.add(String(y))
    db._run('INSERT INTO watched (name, watch_date, url, url_params, notes, tags, sort_order) VALUES (?,?,?,?,?,?,?)',
      [`已看${i}`, `${y}/${String((i % 9) + 1).padStart(2, '0')}/${String((i % 9) + 1).padStart(2, '0')}`, '', '', `备注${i}`, i % 3 ? '治愈' : '', i])
  }
  let so = 0
  for (const y of years) db._run('INSERT OR IGNORE INTO watched_years (year_label, sort_order) VALUES (?, ?)', [y, ++so])
  db.commitBatch()
  await db.flush()
  return { seeded: true, watching: db.getAllWatching().length, remaining: db.getAllRemaining().length, watched: db.getTotalWatchedCount() }
})
log('播种:', JSON.stringify(seeded))

// ---------------------------------------------------------------------------
log('\n== A. 冷启动（document start → 首屏卡片绘制完成） ==')
{
  const arr = []
  for (let i = 0; i < 3; i++) {
    await page.goto('about:blank')
    await page.goto(`${BASE}/#/watching?nocache=${i}`, { waitUntil: 'load' })
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('.watching-card').length
      if (cards > 0) { window.__firstCardAt = performance.now(); return true }
      return false
    }, null, { timeout: 40000 })
    const v = await page.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(r))
      return { total: performance.now() - window.__docStart, cards: document.querySelectorAll('.watching-card').length }
    })
    log(`  第 ${i + 1} 次（${v.cards} 张卡片）: ${v.total.toFixed(1)} ms`)
    arr.push(v.total)
  }
  report('冷启动（doc start → 首屏卡片）', arr)
}

// ---------------------------------------------------------------------------
log('\n== B. 启动阶段拆分（in-page） ==')
const phases = await page.evaluate(async () => {
  const t = () => performance.now()
  const r = {}
  const prev = await import('/src/db/index.js')
  const db = await prev.getDb()
  r.snapshotKB = Math.round(db.export().length / 1024)

  let t0 = t()
  const b64mod = await import('/src/db/wasmInline.js')
  r.importWasmModule = t() - t0

  t0 = t()
  const bin = atob(b64mod.default)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  r.atobDecode = t() - t0
  r.wasmKB = Math.round(bytes.length / 1024)

  t0 = t()
  const initSqlJs = (await import('/node_modules/.vite/deps/sql__js.js?v=1').catch(() => import('/node_modules/sql.js/dist/sql-wasm.js'))).default
  const SQL = await initSqlJs({ wasmBinary: bytes })
  r.initSqlJs = t() - t0

  t0 = t()
  const idb = await new Promise((res, rej) => {
    const q = indexedDB.open('BangumiManagerDB', 1)
    q.onupgradeneeded = () => { const d = q.result; if (!d.objectStoreNames.contains('database')) d.createObjectStore('database') }
    q.onsuccess = () => res(q.result)
    q.onerror = () => rej(q.error)
  })
  const raw = await new Promise((res, rej) => {
    const tx = idb.transaction('database', 'readonly')
    const g = tx.objectStore('database').get('bangumi_db')
    g.onsuccess = () => res(g.result)
    g.onerror = () => rej(g.error)
  })
  r.idbRead = t() - t0

  t0 = t()
  const db2 = new SQL.Database(new Uint8Array(raw))
  r.deserialize = t() - t0

  t0 = t()
  const stmt = db2.prepare('SELECT id, name, day_of_week, time_slot, current_episode, total_episodes, url, url_params, notes, tags, sort_order FROM watching ORDER BY sort_order, id')
  while (stmt.step()) stmt.getAsObject()
  stmt.free()
  r.readAllWatching200 = t() - t0
  db2.close()
  return r
}).catch((e) => ({ error: String(e) }))
for (const [k, v] of Object.entries(phases)) log(`  ${k.padEnd(20)} ${typeof v === 'number' ? v.toFixed(1) : v}`)
out.phases = phases

// ---------------------------------------------------------------------------
log('\n== C. 路由切换（进入页面 → 两帧后） ==')
const routes = [
  ['追番周历 (200 卡片)', '/watching', '.watching-card'],
  ['等番 (500 行)', '/remaining', 'tbody tr'],
  ['已看 (1000 条·分页 20)', '/watched', 'tbody tr'],
]
for (const [label, route, marker] of routes) {
  const arr = []
  let count = 0
  for (let i = 0; i < ROUNDS; i++) {
    await go(route === '/watching' ? '/watched' : '/watching')
    await page.waitForTimeout(150)
    const ms = await page.evaluate(async ({ route, marker }) => {
      const router = (await import('/src/router/index.js')).default
      const t0 = performance.now()
      await router.push(route)
      await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => requestAnimationFrame(r))
      return { ms: performance.now() - t0, count: document.querySelectorAll(marker).length }
    }, { route, marker })
    arr.push(ms.ms)
    count = ms.count
  }
  report(label, arr, `(元素 ${count})`)
}

// ---------------------------------------------------------------------------
log('\n== D. 交互延迟 ==')
{
  await go('/watching'); await waitCards(200); await page.waitForTimeout(300)
  const arr = []
  for (let i = 0; i < ROUNDS; i++) {
    arr.push(await page.evaluate(async () => {
      const btn = document.querySelector('.watching-card button.btn-mini-plus')
      if (!btn) return -1
      const t0 = performance.now()
      btn.click()
      await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => requestAnimationFrame(r))
      return performance.now() - t0
    }))
    await page.waitForTimeout(150)
  }
  report('追番 +1 集（点击→渲染）', arr)
}
{
  await go('/watching'); await waitCards(200); await page.waitForTimeout(300)
  const arr = []
  for (let i = 0; i < ROUNDS; i++) {
    arr.push(await page.evaluate(async () => {
      const cards = document.querySelectorAll('.watching-card')
      if (!cards.length) return -1
      const idx = 60 + ((window.__i = (window.__i || 0) + 1) % 100)
      const card = cards[Math.min(cards.length - 1, idx)]
      const t0 = performance.now()
      card.click()
      await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => requestAnimationFrame(r))
      return performance.now() - t0
    }))
    await page.waitForTimeout(80)
  }
  report('追番 选中一张卡（200 卡重渲染）', arr)
}
{
  await go('/watched'); await page.waitForTimeout(300)
  const arr = []
  for (const q of ['已看1', '已看12', '已看123', '2020', '治愈']) {
    arr.push(await page.evaluate(async (q) => {
      const input = document.querySelector('input[placeholder*="搜索"]') || document.querySelectorAll('input[type="text"]')[0]
      if (!input) return -1
      const t0 = performance.now()
      input.value = q
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => requestAnimationFrame(r))
      return performance.now() - t0
    }, q))
    await page.waitForTimeout(80)
  }
  report('已看 搜索输入（全量 filter+sort）', arr)
}

// ---------------------------------------------------------------------------
log('\n== E. 内存 ==')
{
  const mem = () => page.evaluate(() => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1))
  await go('/watching'); await page.waitForTimeout(300)
  const before = await mem()
  for (let i = 0; i < 6; i++) {
    await go('/watching'); await page.waitForTimeout(120)
    await go('/watched'); await page.waitForTimeout(120)
  }
  const after = await mem()
  log(`  usedJSHeapSize: ${before} MB → ${after} MB (Δ ${(after - before).toFixed(1)} MB)`)
  out.mem = { before, after }
}

// ---------------------------------------------------------------------------
log('\n== F. long task ==')
{
  const r = await page.evaluate(async () => {
    const list = []
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) list.push(Math.round(e.duration)) })
    try { po.observe({ type: 'longtask' }) } catch { return { unsupported: true } }
    const router = (await import('/src/router/index.js')).default
    await router.push('/watched')
    await new Promise((r) => setTimeout(r, 500))
    await router.push('/watching')
    await new Promise((r) => setTimeout(r, 500))
    po.disconnect()
    return { tasks: list }
  })
  log(`  ${JSON.stringify(r)}`)
  out.longTasks = r
}

log(`\n控制台错误: ${pageErrors.length}`)
if (pageErrors.length) log(pageErrors.slice(0, 5).join('\n'))
log('\nJSON:', JSON.stringify(out))
await browser.close()
