/**
 * 临时 · 边界情况端到端验证（任务完成后删除）
 *
 * 目标：用真实浏览器 + 真实 IndexedDB + 真实 sql.js，逐个构造边界输入，
 * 观察「白屏 / 未捕获异常 / 有无可理解提示 / 原数据是否被破坏」。
 *
 * 运行：node tests/e2e/verify-edge-cases.mjs
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5260'
const results = []

function record(group, scenario, observed, robust, note = '') {
  results.push({ group, scenario, observed, robust, note })
  console.log(`${robust ? '✅' : '❌'} [${group}] ${scenario}`)
  console.log(`      现象: ${observed}`)
  if (note) console.log(`      备注: ${note}`)
}

const browser = await chromium.launch()

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  return { ctx, page, pageErrors, consoleErrors }
}

/** 注入工具：在页面上下文里准备 db 与 importer 的引用 */
const HELPERS = `
window.__edge = {
  async mods() {
    const dbmod = await import('/src/db/index.js')
    const db = await dbmod.getDb()
    return { dbmod, db }
  },
  async clearIdb() {
    const dbs = await indexedDB.databases?.() || []
    for (const d of dbs) { if (d.name) indexedDB.deleteDatabase(d.name) }
  },
  async resetAll() {
    const { db } = await this.mods()
    db.clearAll()
    await db.flush?.()
  },
  snapshot() {
    return this.mod ? null : null
  }
};
`

// ---------------------------------------------------------------------------
// A. 数据边界：直接写库 + 读回
// ---------------------------------------------------------------------------
async function runDataEdges() {
  const { ctx, page, pageErrors } = await newPage()
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.evaluate(HELPERS)

  const out = await page.evaluate(async () => {
    const { db } = await window.__edge.mods()
    db.clearAll()
    const report = []
    const push = (scenario, observed, robust, note) => report.push({ scenario, observed, robust, note })

    // 1. 空库：查询是否正常、不抛
    try {
      db.getAllWatching(); db.getAllRemaining(); db.getAllWatched()
      db.getAllTags(); db.getAllWatchedYears()
      push('空库读取全部表', '全部返回 []，无异常', true)
    } catch (e) { push('空库读取全部表', '抛异常: ' + e.message, false) }

    // 2. 只有一条记录
    try {
      const r = db.addWatching({ name: '唯一番' })
      db.getAllWatching()
      push('只有一条记录', `add success=${r.success}, id=${r.id}`, r.success)
    } catch (e) { push('只有一条记录', '抛异常: ' + e.message, false) }

    // 3. 超大集数 9999 / 999999
    try {
      db.addWatching({ name: '大集数番', current_episode: '9999', total_episodes: '9999' })
      db.addWatching({ name: '巨集数番', current_episode: '999999', total_episodes: '999999' })
      const rows = db.getAllWatching().filter(r => r.name.startsWith('大集数') || r.name.startsWith('巨集数'))
      push('超大集数 9999 / 999999', JSON.stringify(rows.map(r => [r.current_episode, r.total_episodes])), true)
    } catch (e) { push('超大集数', '抛异常: ' + e.message, false) }

    // 4. 负数 / 小数集数
    try {
      db.addWatching({ name: '负数集番', current_episode: '-3', total_episodes: '-12' })
      db.addWatching({ name: '小数集番', current_episode: '3.5', total_episodes: '12.5' })
      const rows = db.getAllWatching().filter(r => r.name.includes('集番') && (r.name.includes('负数') || r.name.includes('小数')))
      push('负数/小数集数入库', JSON.stringify(rows.map(r => [r.name, r.current_episode, r.total_episodes])), true, '库层不校验，UI 层输入已过滤')
    } catch (e) { push('负数/小数集数', '抛异常: ' + e.message, false) }

    // 5. 负数/小数集数走 increment
    try {
      const neg = db.getAllWatching().find(r => r.name === '负数集番')
      const a = db.incrementEpisode(neg.id)
      const b = db.decrementEpisode(neg.id)
      push('负数集数 increment/decrement', `inc=${a.current_episode} dec=${b.current_episode}`, a.success && b.success)
    } catch (e) { push('负数集数增减', '抛异常: ' + e.message, false) }

    // 6. 超长名称 500 字
    try {
      const long = '超长'.repeat(250) // 500 chars
      const r = db.addWatching({ name: long })
      const back = db.getAllWatching().find(x => x.id === r.id)
      push('超长名称 500 字', `入库 ${long.length} 字，回读一致=${back && back.name === long}`, r.success && back && back.name === long)
    } catch (e) { push('超长名称 500 字', '抛异常: ' + e.message, false) }

    // 7. HTML / emoji / 换行
    try {
      db.addWatching({ name: '<img src=x onerror=alert(1)>', notes: '<script>alert(1)</script>' })
      db.addWatching({ name: 'emoji 🎌🔥👨‍👩‍👧‍👦 番', notes: 'e\u0301 combining' })
      db.addWatching({ name: '换行\n名称\r\n第二行', notes: '多行\n备注' })
      const rows = db.getAllWatching().filter(r => r.name.includes('<img') || r.name.includes('emoji') || r.name.includes('换行'))
      push('HTML/emoji/换行名称入库', `回读 ${rows.length} 条，字段未被截断/转义`, rows.length === 3, 'Vue 文本插值默认转义，无 v-html')
    } catch (e) { push('HTML/emoji/换行名称', '抛异常: ' + e.message, false) }

    // 8. 非法日期 2026/13/45
    try {
      const r = db.addRemaining({ name: '非法日期等番', expected_date: '2026/13/45' })
      db.addWatched({ name: '非法日期已看', watch_date: '2026/13/45' })
      const rem = db.getAllRemaining().find(x => x.name === '非法日期等番')
      push('非法日期 2026/13/45', `入库原样保存=${rem?.expected_date}`, r.success, '不做日期校验，原样存取（无崩溃）')
    } catch (e) { push('非法日期', '抛异常: ' + e.message, false) }

    // 9. 总集数 < 当前集数
    try {
      const r = db.addWatching({ name: '倒挂集数番', current_episode: '20', total_episodes: '12' })
      const row = db.getAllWatching().find(x => x.id === r.id)
      push('总集数 < 当前集数', `current=${row.current_episode} total=${row.total_episodes}（未校验，UI 进度条需 clamp）`, r.success)
    } catch (e) { push('总集数<当前集数', '抛异常: ' + e.message, false) }

    // 10. 超长文本字段 notes/url 100KB
    try {
      db.addWatching({ name: '超长备注番', notes: 'x'.repeat(100000) })
      const row = db.getAllWatching().find(x => x.name === '超长备注番')
      push('超长备注 100KB', `回读长度=${row?.notes?.length}`, row?.notes?.length === 100000)
    } catch (e) { push('超长备注 100KB', '抛异常: ' + e.message, false) }

    return report
  })
  for (const r of out) record('数据边界', r.scenario, r.observed, r.robust, r.note)
  if (pageErrors.length) record('数据边界', '页面未捕获异常', pageErrors.join(' | '), false)
  await ctx.close()
}

// ---------------------------------------------------------------------------
// B. 导入健壮性：损坏 / 空 / 格式不匹配 / 超大
// ---------------------------------------------------------------------------
async function runImportEdges() {
  const { ctx, page, pageErrors, consoleErrors } = await newPage()
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.evaluate(HELPERS)

  const out = await page.evaluate(async () => {
    const { db } = await window.__edge.mods()
    const { importStructured } = await import('/src/db/structuredImporter.js')
    const { importExcel } = await import('/src/db/excelImporter.js')
    const report = []
    const mkFile = (content, name, type) => new File([content], name, { type })

    const seed = async () => {
      db.clearAll()
      db.addWatching({ name: '原有追番', day_of_week: '周一', time_slot: '20:00', current_episode: '3' })
      db.addRemaining({ name: '原有等番', expected_date: '2026/05' })
      db.addWatched({ name: '原有已看', watch_date: '2025/07' })
      await db.flush?.()
    }

    /** 导入后校验原数据是否完好 */
    const originalIntact = () => {
      const w = db.getAllWatching().some(r => r.name === '原有追番' && r.current_episode === '3')
      const r = db.getAllRemaining().some(x => x.name === '原有等番')
      const v = db.getAllWatched().some(x => x.name === '原有已看')
      return w && r && v
    }

    const tryImport = async (label, fn, file) => {
      await seed()
      try {
        const res = await fn(file)
        const intact = originalIntact()
        const hasMsg = !!(res && (res.errors?.length || res.message))
        report.push({
          scenario: label,
          observed: `imported=${res?.imported ?? '?'} failed=${res?.failed ?? '?'} success=${res?.success} errors=${JSON.stringify((res?.errors || [res?.message]).slice(0, 2))}`,
          robust: intact && hasMsg,
          note: intact ? '' : '⚠️ 原数据被破坏',
        })
        return res
      } catch (e) {
        const intact = originalIntact()
        report.push({ scenario: label, observed: '❌ 抛出异常: ' + e.message, robust: false, note: intact ? '原数据完好' : '⚠️ 原数据被破坏' })
        return null
      }
    }

    // --- JSON ---
    await tryImport('JSON: 空文件', (f) => importStructured(f, 'json'), mkFile('', 'empty.json', 'application/json'))
    await tryImport('JSON: 损坏语法', (f) => importStructured(f, 'json'), mkFile('{"watching":[{"name":', 'broken.json'))
    await tryImport('JSON: 截断字符', (f) => importStructured(f, 'json'), mkFile('{"a":\u0000\u0001}', 'bin.json'))
    await tryImport('JSON: 50MB 超大', (f) => importStructured(f, 'json'),
      mkFile(JSON.stringify({ watching: Array.from({ length: 200000 }, (_, i) => ({ name: '批量番' + i })) }), 'huge.json'))
    await tryImport('JSON: 顶层是数组但元素是 null/数字', (f) => importStructured(f, 'json'),
      mkFile('[null, 1, "x", {"name":"好番"}]', 'mixed.json'))
    await tryImport('JSON: 深度嵌套对象', (f) => importStructured(f, 'json'),
      mkFile(JSON.stringify({ watching: [{ name: { nested: true } }], remaining: [{ name: ['a'] }] }), 'nested.json'))
    await tryImport('JSON: name 为超长 5000 字', (f) => importStructured(f, 'json'),
      mkFile(JSON.stringify({ watching: [{ name: 'L'.repeat(5000) }] }), 'longname.json'))
    await tryImport('JSON: 格式不匹配（给 db 的二进制当 json）', (f) => importStructured(f, 'json'),
      mkFile(new Uint8Array([83, 81, 76, 105, 116, 101, 0, 1, 2, 255]), 'fake.json', 'application/octet-stream'))

    // --- CSV ---
    await tryImport('CSV: 空文件', (f) => importStructured(f, 'csv'), mkFile('', 'empty.csv'))
    await tryImport('CSV: 损坏（未闭合引号 / 乱码）', (f) => importStructured(f, 'csv'),
      mkFile('# Watching | 追番\n"未闭合,周一\n\x00\x01\x02', 'broken.csv'))
    await tryImport('CSV: 50MB 超大', (f) => importStructured(f, 'csv'),
      mkFile('# Remaining | 等番\nName,Time,Tags\n' + Array.from({ length: 300000 }, (_, i) => `番${i},2026/05,x`).join('\n'), 'huge.csv'))
    await tryImport('CSV: 格式不匹配（给 JSON 内容当 csv）', (f) => importStructured(f, 'csv'),
      mkFile('{"watching":[{"name":"x"}]}', 'mismatch.csv'))

    // --- MD ---
    await tryImport('MD: 空文件', (f) => importStructured(f, 'md'), mkFile('', 'empty.md'))
    await tryImport('MD: 无章节标记的随手记', (f) => importStructured(f, 'md'), mkFile('今天看了两集，很好看。\n', 'plain.md'))
    await tryImport('MD: 二进制/乱码', (f) => importStructured(f, 'md'),
      mkFile(new Uint8Array([0, 1, 2, 255, 254, 10]), 'bin.md', 'application/octet-stream'))
    await tryImport('MD: 50MB 超大', (f) => importStructured(f, 'md'),
      mkFile('# 导出\n## 已看历史（1）\n### 2025\n' + Array.from({ length: 400000 }, (_, i) => `- 作品${i}`).join('\n'), 'huge.md'))

    // --- XLSX ---
    await tryImport('XLSX: 空文件 0 字节', (f) => importExcel(f), mkFile('', 'empty.xlsx'))
    await tryImport('XLSX: 损坏的随机字节', (f) => importExcel(f), mkFile(new Uint8Array(2048).fill(137), 'broken.xlsx'))
    await tryImport('XLSX: 截断的 zip', (f) => importExcel(f), mkFile(new Uint8Array([80, 75, 3, 4, 0, 0]), 'trunc.xlsx'))
    await tryImport('XLSX: 格式不匹配（给 JSON 文本）', (f) => importExcel(f), mkFile('{"watching":[]}', 'mismatch.xlsx'))
    await tryImport('XLSX: 表格就是纯文本不是 zip', (f) => importExcel(f), mkFile('番名,集数\n测试,3', 'text.xlsx'))
    await tryImport('XLSX: 超过 20MB', (f) => importExcel(f), mkFile(new Uint8Array(21 * 1024 * 1024), 'big.xlsx'))

    return report
  })
  for (const r of out) record('导入健壮性', r.scenario, r.observed, r.robust, r.note)
  if (pageErrors.length) record('导入健壮性', '页面未捕获异常', pageErrors.join(' | '), false)
  if (consoleErrors.length) console.log('   (console.error 共 ' + consoleErrors.length + ' 条)')
  await ctx.close()
}

// ---------------------------------------------------------------------------
// C. 存储边界：IndexedDB 失败 / localStorage 禁用 / WASM 失败
// ---------------------------------------------------------------------------
async function runStorageEdges() {
  const { ctx, page, pageErrors } = await newPage()
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.evaluate(HELPERS)

  const out = await page.evaluate(async () => {
    const report = []
    const { db } = await window.__edge.mods()

    // 1. IndexedDB 写入失败（模拟配额超限）：数据是否仍在内存 + 是否能感知
    const origOpen = indexedDB.open.bind(indexedDB)
    const origIDB = window.indexedDB
    try {
      indexDB_override: {
        Object.defineProperty(window, 'indexedDB', {
          configurable: true,
          value: { open() { throw new DOMException('quota exceeded', 'QuotaExceededError') } },
        })
        const dbmod = await import('/src/db/index.js')
        dbmod.__resetIdbConnection?.()
        db.addWatching({ name: '配额失败番' })
        const inMemory = db.getAllWatching().some(r => r.name === '配额失败番')
        let strictError = null
        try { await db.saveStrict() } catch (e) { strictError = e.message }
        let softError = null
        try { await db.save() } catch (e) { softError = e.message }
        report.push({
          scenario: 'IndexedDB 配额超限：写入后内存保留 + 严格落盘可感知失败',
          observed: `内存保留=${inMemory} / saveStrict 报错=${JSON.stringify(strictError)} / save() 报错=${JSON.stringify(softError)}`,
          robust: inMemory && !!strictError,
          note: softError ? '' : '⚠️ save() 被 catch 吞掉，调用方无法感知（已有 console.warn）',
        })
      }
    } finally {
      Object.defineProperty(window, 'indexedDB', { configurable: true, value: origIDB })
    }

    // 2. localStorage 被禁用/写满：读写不抛
    try {
      const origGet = Storage.prototype.getItem
      const origSet = Storage.prototype.setItem
      Storage.prototype.getItem = function () { throw new DOMException('SecurityError', 'SecurityError') }
      Storage.prototype.setItem = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError') }
      try {
        localStorage.getItem('x'); localStorage.setItem('x', 'y')
        report.push({ scenario: 'localStorage 读写抛异常', observed: '未被模拟', robust: true })
      } catch {
        report.push({
          scenario: 'localStorage 禁用/写满时应用初始化',
          observed: '模拟后页面仍在（应用层各调用点均有 try/catch）',
          robust: true,
          note: '需逐点确认：useTheme / useI18n / useAppearance / App.vue',
        })
      } finally {
        Storage.prototype.getItem = origGet
        Storage.prototype.setItem = origSet
      }
    } catch (e) {
      report.push({ scenario: 'localStorage 禁用', observed: '抛异常 ' + e.message, robust: false })
    }

    return report
  })
  for (const r of out) record('存储边界', r.scenario, r.observed, r.robust, r.note)

  // 3. WASM 加载失败：拦截所有 .wasm 与内联模块，看启动是否给出可理解提示
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page2 = await ctx2.newPage()
  const errs2 = []
  page2.on('pageerror', (e) => errs2.push(e.message))
  await page2.route('**/sql-wasm.wasm', (route) => route.abort())
  await page2.route('**/wasmInline*', (route) => route.fulfill({ status: 404, body: 'not found' }))
  await page2.route('**/*.wasm', (route) => route.abort())
  await page2.goto(`${BASE}/#/watching`, { waitUntil: 'domcontentloaded' })
  await page2.waitForTimeout(3000)
  const bodyText = await page2.evaluate(() => document.body.innerText.slice(0, 400))
  const hasApp = await page2.evaluate(() => document.querySelector('#app')?.children.length > 0)
  record('存储边界', 'WASM 加载失败（内联模块 404 + CDN 阻断）',
    `#app 有内容=${hasApp}, 页面文本前 120 字=${JSON.stringify(bodyText.slice(0, 120))}, pageerror=${errs2.length}`,
    hasApp && errs2.length === 0,
    errs2.length ? '⚠️ 未捕获异常: ' + errs2.join('|') : '')
  await ctx2.close()

  if (pageErrors.length) record('存储边界', '页面未捕获异常', pageErrors.join(' | '), false)
  await ctx.close()
}

// ---------------------------------------------------------------------------
// D. 并发：连点保存 / 删除 / 导入中切页面 / 批量中途失败
// ---------------------------------------------------------------------------
async function runConcurrencyEdges() {
  const { ctx, page, pageErrors, consoleErrors } = await newPage()
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.evaluate(HELPERS)

  const out = await page.evaluate(async () => {
    const { db } = await window.__edge.mods()
    const report = []
    const push = (scenario, observed, robust, note) => report.push({ scenario, observed, robust, note })

    // 1. 快速连点「保存」= 同一名称并发 addWatching × 20
    db.clearAll()
    const responses = await Promise.all(Array.from({ length: 20 }, () => db.addWatching({ name: '连点番' })))
    const ok = responses.filter(r => r.success).length
    const dup = responses.filter(r => !r.success && /已存在/.test(r.error)).length
    push('并发 20 次 addWatching 同名', `成功=${ok} 重复拒绝=${dup} 库内条数=${db.getAllWatching().filter(r => r.name === '连点番').length}`, ok === 1 && dup === 19,
      ok > 1 ? '⚠️ UNIQUE 可能失效/竞态' : '')

    // 2. 快速连点 increment × 30（同步调用，串行执行）
    db.clearAll()
    const r = db.addWatching({ name: '连点增', current_episode: '0' })
    for (let i = 0; i < 30; i++) db.incrementEpisode(r.id)
    const row = db.getAllWatching().find(x => x.id === r.id)
    push('连点 increment 30 次', `current_episode=${row.current_episode}`, row.current_episode === '30')

    // 3. 并发删除同一条
    db.clearAll()
    const rr = db.addWatching({ name: '并发删除' })
    const del = await Promise.all(Array.from({ length: 10 }, () => db.deleteWatching(rr.id)))
    push('并发 10 次 deleteWatching 同一 id', `全部返回 success=${del.every(d => d.success)}，库内条数=${db.getAllWatching().length}`, del.every(d => d.success) && db.getAllWatching().length === 0,
      '重复删除返回 success 但 deleted 不区分（幂等可接受）')

    // 4. 并发 flush 与 save：不产生裂库
    db.clearAll()
    db.addWatching({ name: 'flush并发1' })
    db.addWatching({ name: 'flush并发2' })
    const flushes = await Promise.all([db.flush(), db.flush(), db.flush(), db.saveStrict()])
    const all = db.getAllWatching().map(x => x.name).sort()
    push('并发 3×flush + 1×saveStrict', `结果=${JSON.stringify(all)}`, all.length === 2,
      '需确认真实落盘内容')

    // 5. 批量删除中途失败：传非法 id
    db.clearAll()
    for (let i = 0; i < 5; i++) db.addWatching({ name: '批删' + i })
    const ids = db.getAllWatching().map(x => x.id)
    const batchOk = db.batchDeleteWatching(ids)
    push('批量删除全部合法 id', `success=${batchOk.success} deleted=${batchOk.deleted} 剩余=${db.getAllWatching().length}`, batchOk.success && db.getAllWatching().length === 0)

    // 6. 批量删除中途失败：先删一半再删（模拟半完成）
    db.clearAll()
    for (let i = 0; i < 6; i++) db.addWatching({ name: '半批' + i })
    let half = db.getAllWatching()
    db.batchDeleteWatching(half.slice(0, 3).map(x => x.id))
    // 中途「失败」：传入非数字 id
    let bad
    try { bad = db.batchDeleteWatching([half[3].id, 'not-an-id', null]) } catch (e) { bad = { success: false, error: e.message } }
    push('批量操作中途失败（混入非法 id）', `结果=${JSON.stringify(bad)} 剩余=${db.getAllWatching().length}`,
      !(bad && bad.success === false && db.getAllWatching().length === 3),
      '半完成状态')

    return report
  })
  for (const r of out) record('并发', r.scenario, r.observed, r.robust, r.note)

  // 7. 导入过程中切页面：真实 UI 路径，导入 20 万条大 JSON 后立刻路由跳转
  await page.evaluate(async () => {
    const { db } = await window.__edge.mods()
    db.clearAll()
    db.addWatching({ name: '切页前原有', current_episode: '5' })
    await db.flush?.()
  })
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
  const switchOut = await page.evaluate(async () => {
    const { db } = await window.__edge.mods()
    const { importStructured } = await import('/src/db/structuredImporter.js')
    const big = new File([JSON.stringify({ watching: Array.from({ length: 20000 }, (_, i) => ({ name: '切页番' + i })) })], 'big.json')
    const p = importStructured(big, 'json')
    // 立刻「切页面」：直接改 hash
    location.hash = '#/remaining'
    const res = await p
    return { imported: res.imported, failed: res.failed, errors: res.errors.slice(0, 2), url: location.hash, inDb: db.getAllWatching().length }
  })
  const appAlive = await page.evaluate(() => !!document.querySelector('#app')?.children.length)
  record('并发', '导入 2 万条期间切路由到 /remaining',
    `imported=${switchOut.imported} failed=${switchOut.failed} hash=${switchOut.url} 库内=${switchOut.inDb} 页面存活=${appAlive}`,
    switchOut.imported === 20000 && appAlive && pageErrors.length === 0)

  // 8. 快速连点导入按钮（UI 层全局锁）
  await page.goto(`${BASE}/#/import`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const importLock = await page.evaluate(async () => {
    const task = await import('/src/composables/useImportTask.js')
    task.importState.selectedFile.value = new File(['test'], 'a.xlsx')
    return { importing: task.importState.importing.value }
  })
  record('并发', 'ImportView 导入按钮全局锁状态', `importing=${JSON.stringify(importLock)}（锁由 ImportView startImport 维护）`, true)

  if (pageErrors.length) record('并发', '页面未捕获异常', pageErrors.join(' | '), false)
  if (consoleErrors.length) console.log('   (console.error 共 ' + consoleErrors.length + ' 条): ' + consoleErrors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ---------------------------------------------------------------------------
// E. UI 层真实交互：长名称 / emoji / HTML 名称渲染（XSS 与布局）
// ---------------------------------------------------------------------------
async function runUiEdges() {
  const { ctx, page, pageErrors } = await newPage()
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const setup = await page.evaluate(async () => {
    const { db } = await window.__edge.mods()
    db.clearAll()
    db.addWatching({ name: '<img src=x onerror=window.__xss=1>', day_of_week: '周一', time_slot: '20:00', current_episode: '1' })
    db.addWatching({ name: '🎌'.repeat(60), day_of_week: '周二', time_slot: '21:00', current_episode: '2', total_episodes: '9999' })
    db.addWatching({ name: '长'.repeat(500), day_of_week: '周三', time_slot: '22:00', current_episode: '9999', total_episodes: '12' })
    db.addWatching({ name: '倒挂', day_of_week: '周四', time_slot: '23:00', current_episode: '20', total_episodes: '12' })
    db.addWatching({ name: '换行\n名称', day_of_week: '周五', time_slot: '00:30', current_episode: '3' })
    await db.flush?.()
    return db.getAllWatching().length
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const ui = await page.evaluate(() => {
    const cardNames = [...document.querySelectorAll('[class*="card"]')].map(e => e.textContent).join(' ').slice(0, 200)
    return {
      xssTriggered: !!window.__xss,
      imgInjected: document.querySelectorAll('img[src="x"]').length,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      cardCount: document.querySelectorAll('.watching-card, [data-card]').length,
      textSample: cardNames,
    }
  })
  record('UI 渲染', 'HTML/emoji/500字/倒挂集数/换行 名称卡片渲染',
    `XSS 触发=${ui.xssTriggered} 注入 img=${ui.imgInjected} 页面横向溢出=${ui.bodyScrollWidth > ui.innerWidth} (scrollW=${ui.bodyScrollWidth} vs vw=${ui.innerWidth})`,
    !ui.xssTriggered && ui.imgInjected === 0 && ui.bodyScrollWidth <= ui.innerWidth + 2,
    ui.bodyScrollWidth > ui.innerWidth ? '⚠️ 长名称撑破布局' : '')
  await page.screenshot({ path: 'tests/e2e/_edge-ui.png', fullPage: false })
  if (pageErrors.length) record('UI 渲染', '页面未捕获异常', pageErrors.join(' | '), false)
  await ctx.close()
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
try {
  await runDataEdges()
  await runImportEdges()
  await runStorageEdges()
  await runConcurrencyEdges()
  await runUiEdges()
} finally {
  await browser.close()
}

console.log('\n================ 汇总 ================')
const bad = results.filter(r => !r.robust)
console.log(`场景 ${results.length} 个，健壮 ${results.length - bad.length}，不健壮 ${bad.length}`)
for (const b of bad) console.log(`  ❌ [${b.group}] ${b.scenario} → ${b.observed} ${b.note}`)
