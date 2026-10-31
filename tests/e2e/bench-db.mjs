/**
 * 性能基准：数据库层（sql.js + fake-indexeddb）
 * 运行：node tests/e2e/bench-db.mjs
 * 输出：各场景毫秒数，可直接对比前后
 */
import 'fake-indexeddb/auto'
import initSqlJs from 'sql.js'
import wasmBase64 from '../../src/db/wasmInline.js'
import { BangumiDatabase, __resetIdbConnection } from '../../src/db/index.js'
import { importExcel } from '../../src/db/excelImporter.js'
import * as XLSX from 'xlsx'

const wasmBinary = Uint8Array.from(atob(wasmBase64), ch => ch.charCodeAt(0))
const SQL = await initSqlJs({ wasmBinary })

const N = { watching: 200, remaining: 500, watched: 1000 }

const t = () => performance.now()
const fmt = (ms) => `${ms.toFixed(1)}ms`

function makeDb() {
  return new BangumiDatabase(new SQL.Database())
}

/** 构造一个已含 N 条数据的库（批量写，避免把播种本身算进被测项） */
function seedDatabase() {
  const db = makeDb()
  db.beginBatch()
  for (let i = 0; i < N.watching; i++) {
    db._run(
      'INSERT INTO watching (name, day_of_week, time_slot, current_episode, total_episodes, url, url_params, notes, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [`追番${i}`, ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][i % 7], `${String(i % 24).padStart(2, '0')}:00`, String(i % 12), '12', 'https://e/x', 'p={集数}', '备注', i % 3 ? '热血,原创' : '', i]
    )
  }
  for (let i = 0; i < N.remaining; i++) {
    db._run(
      'INSERT INTO remaining (name, expected_date, url, url_params, notes, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`等番${i}`, `2026/0${(i % 9) + 1}`, '', '', 'n', '', i]
    )
  }
  for (let i = 0; i < N.watched; i++) {
    db._run(
      'INSERT INTO watched (name, watch_date, url, url_params, notes, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`已看${i}`, `${2016 + (i % 10)}/0${(i % 9) + 1}/1${i % 9}`, '', '', 'n', i % 3 ? '治愈' : '', i]
    )
  }
  db.commitBatch()
  return db
}

function section(name) { console.log(`\n== ${name} ==`) }
function row(label, ms) { console.log(`  ${label.padEnd(46)} ${fmt(ms)}`) }

// ---------------------------------------------------------------------------
section('A. 启动：建表/迁移/索引')
{
  const t0 = t()
  const db = makeDb()
  row('构造 BangumiDatabase（含 initTables + 索引）', t() - t0)
  db.save()
}

{
  const db = seedDatabase()
  const bytes = db.export()
  console.log(`  播种库大小: ${(bytes.length / 1024).toFixed(0)} KB (${N.watching}/${N.remaining}/${N.watched})`)
  const t0 = t()
  const restored = new BangumiDatabase(new SQL.Database(new Uint8Array(bytes)))
  row('冷启动还原（反序列化 + initTables）', t() - t0)
}

// ---------------------------------------------------------------------------
section('B. 单条写操作（逐条调用，模拟 UI 增删改）')
{
  const db = makeDb()
  // 预热
  for (let i = 0; i < 5; i++) { db.addWatching({ name: `warm${i}` }); await db.flush() }

  const t0 = t()
  for (let i = 0; i < 100; i++) db.addWatching({ name: `单条新增${i}`, day_of_week: '周一' })
  row('100 次 addWatching（同步段，不含落盘等待）', t() - t0)
  const tFlush = t()
  await db.flush()
  row('  其中 flush（export + IndexedDB）', t() - tFlush)
}

{
  const db = seedDatabase()
  await db.flush()
  const t0 = t()
  for (let i = 0; i < 100; i++) db.updateWatching(i + 1, { current_episode: '5' })
  row('100 次 updateWatching（含逐次落盘调度）', t() - t0)
  const t1 = t()
  await db.flush()
  row('  其中 flush', t() - t1)
}

// 逐条「写 + 等落盘」—— 旧实现每写一次 await 一次 save 的等价路径
{
  const db = seedDatabase()
  await db.flush()
  const t0 = t()
  for (let i = 0; i < 100; i++) {
    db.addWatching({ name: `逐条落盘${i}` })
    await db.save()
  }
  row('100 次「写入 + await save 完成」', t() - t0)
}

// ---------------------------------------------------------------------------
section('C. 批量写入（beginBatch/commitBatch）')
{
  const db = seedDatabase()
  await db.flush()
  const t0 = t()
  db.beginBatch()
  for (let i = 0; i < 100; i++) db.addWatching({ name: `批量${i}` })
  db.commitBatch()
  await db.flush()
  row('100 条批量新增（事务 + 一次落盘）', t() - t0)
}

// ---------------------------------------------------------------------------
section('D. 单次落盘（export + IndexedDB）')
for (const [label, db] of [['空库', makeDb()], ['200/500/1000 条', seedDatabase()]]) {
  db._dirty = true
  const t0 = t()
  await db.flush()
  row(`flush（${label}）`, t() - t0)
  const t1 = t()
  db.db.export()
  row(`  其中 db.export()`, t() - t1)
}

// ---------------------------------------------------------------------------
section('E. 查询')
{
  const db = seedDatabase()
  const q = (label, fn) => {
    fn() // 预热
    const t0 = t()
    for (let i = 0; i < 20; i++) fn()
    row(label + ' (×20)', t() - t0)
  }
  q('getAllWatching', () => db.getAllWatching())
  q('getWatchingByDay(周一)', () => db.getWatchingByDay('周一'))
  q('getAllRemaining', () => db.getAllRemaining())
  q('getAllWatched', () => db.getAllWatched())
  q('getWatchedByYear(2020)', () => db.getWatchedByYear('2020'))
  q('getWatchedCountByYear(2020)  ← api 二次调用', () => db.getWatchedCountByYear('2020'))
  q('getAllWatchedYears', () => db.getAllWatchedYears())

  // EXPLAIN QUERY PLAN：确认索引是否命中
  section('E2. 查询计划')
  const plans = [
    ['getAllWatching', 'SELECT id, name, day_of_week FROM watching ORDER BY sort_order, id'],
    ['getWatchingByDay', "SELECT id FROM watching WHERE day_of_week = '周一' ORDER BY sort_order, time_slot"],
    ['getAllRemaining', 'SELECT id FROM remaining ORDER BY sort_order, id'],
    ['getAllWatched', 'SELECT id FROM watched ORDER BY sort_order, id'],
    ['getWatchedByYear', "SELECT id FROM watched WHERE watch_date = '2020' OR watch_date LIKE '2020/%' ORDER BY sort_order, id"],
    ['getAllWatchedYears', 'SELECT id FROM watched_years ORDER BY sort_order, id'],
    ['年份过滤仅按日期', "SELECT id FROM watched WHERE watch_date = '2020'"],
  ]
  for (const [label, sql] of plans) {
    const rows = db._all(`EXPLAIN QUERY PLAN ${sql}`)
    console.log(`  ${label}: ${rows.map(r => r.detail).join(' | ')}`)
  }
}

// ---------------------------------------------------------------------------
section('F. Excel 导入（100 条）')
{
  const wb = XLSX.utils.book_new()
  const header = ['时间', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const aoa = [header]
  for (let i = 0; i < 100; i++) {
    const row = [0.5, null, null, null, null, null, null, null]
    row[1 + (i % 7)] = `导入番${i} e${i % 12}`
    aoa.push(row)
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  XLSX.utils.book_append_sheet(wb, ws, '追番')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const file = new File([buf], 'bench.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

  const db = await (async () => {
    const fresh = makeDb()
    // 让 importExcel 使用同一实例：用全局单例路径不方便，这里直接测 db 层循环
    return fresh
  })()

  const model = () => {
    const t0 = t()
    db.beginBatch()
    for (let i = 0; i < 100; i++) db.addWatching({ name: `模拟导入${i}`, day_of_week: '周一' })
    db.commitBatch()
    return t() - t0
  }
  row('100 条导入（批量事务）', model())

  // 真实 excelImporter 路径（watching 表逐条、无外层事务）
  const t0 = t()
  const res = await importExcel(file)
  row('importExcel 100 追番（真实路径）', t() - t0)
  console.log(`  导入结果: success=${res.success} imported=${res.imported} errors=${res.errors.length}`)
  await db.flush?.()
}

__resetIdbConnection()
