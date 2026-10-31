/**
 * 临时探针（完成后删除）：验证候选缺陷
 * node --import ./tests/e2e/resolve-loader.mjs tests/e2e/verify-edge-probe2.mjs
 */
import 'fake-indexeddb/auto'

const { getDb } = await import('../../src/db/index.js')
const { buildExportCsv, buildExportMarkdown, buildExportJson } = await import('../../src/db/excelExporter.js')
const { importCsv, importMd, importJson } = await import('../../src/db/structuredImporter.js')

const db = await getDb()
const mk = (text, name = 'x') => new File([String(text)], name)

async function fresh() { db.clearAll(); await db.flush?.() }
const dump = () => ({
  w: db.getAllWatching().map(r => [r.name, r.day_of_week, r.time_slot, r.current_episode]),
  r: db.getAllRemaining().map(r => [r.name, r.expected_date]),
  v: db.getAllWatched().map(r => [r.name, r.watch_date]),
})

console.log('\n=== P1: CSV 单元格含换行（导出时用引号包裹） ===')
await fresh()
db.addWatching({ name: 'A\nB 番', day_of_week: '周一', time_slot: '20:30', current_episode: '5' })
db.addRemaining({ name: 'C\nD 等', expected_date: '2026/05' })
db.addWatched({ name: 'E\nF 已看', watch_date: '2025/07' })
const csv = buildExportCsv({ watching: db.getAllWatching(), remaining: db.getAllRemaining(), watched: db.getAllWatched() })
console.log('CSV 相关行：', JSON.stringify(csv.split(/\r?\n/).filter(l => /"A|"C|"E|#/.test(l)).slice(0, 8)))
await fresh()
const r1 = await importCsv(mk(csv, 'nl.csv'))
console.log('import result:', JSON.stringify({ i: r1.imported, f: r1.failed, e: r1.errors }))
console.log('db:', JSON.stringify(dump()))

console.log('\n=== P2: MD 名称含换行 / 含 · / 含反引号 ===')
await fresh()
db.addWatching({ name: 'M\nN 番', day_of_week: '周一', time_slot: '20:30', current_episode: '5' })
db.addRemaining({ name: 'O · P 等', expected_date: '2026/05' })
db.addWatched({ name: 'Q · R 已看', watch_date: '2025/07' })
const md = buildExportMarkdown({ watching: db.getAllWatching(), remaining: db.getAllRemaining(), watched: db.getAllWatched() })
await fresh()
const r2 = await importMd(mk(md, 'nl.md'))
console.log('import result:', JSON.stringify({ i: r2.imported, f: r2.failed, e: r2.errors }))
console.log('db:', JSON.stringify(dump()))

console.log('\n=== P3: JSON 非法 name（对象/数组/纯空白/数字） ===')
await fresh()
const badJson = JSON.stringify({
  watching: [{ name: { a: 1 } }, { name: ['x'] }, { name: '   ' }, { name: 123 }, { name: true }],
  watched: [{ name: { a: 1 }, watch_date: '2025/07' }],
})
const r3 = await importJson(mk(badJson, 'badname.json'))
console.log('import result:', JSON.stringify({ i: r3.imported, f: r3.failed, e: r3.errors }))
console.log('db:', JSON.stringify(dump()))

console.log('\n=== P4: CSV 段头后有空白行（用户手改过） ===')
await fresh()
const csv2 = ['# Remaining | 等番', '', 'Name,Time,Tags', '等番甲,2026/05,搞笑'].join('\n')
const r4 = await importCsv(mk(csv2, 'blank.csv'))
console.log('import result:', JSON.stringify({ i: r4.imported, f: r4.failed }))
console.log('db.remaining:', JSON.stringify(dump().r))

console.log('\n=== P5: CSV 已知段但解析出 0 条（表头缺失） ===')
await fresh()
const csv3 = ['# Watching | 追番', '时间,备注', '20:30,随便写'].join('\n')
const r5 = await importCsv(mk(csv3, 'noheader.csv'))
console.log('import result:', JSON.stringify({ i: r5.imported, f: r5.failed, e: r5.errors }))

console.log('\n=== P6: sort_order 非法（NaN / 超长数字 / 字符串） ===')
await fresh()
const r6 = await importJson(mk(JSON.stringify({ watching: [{ name: '排序NaN', sort_order: 'abc' }, { name: '排序大', sort_order: 1e308 }] }), 'sort.json'))
console.log('import result:', JSON.stringify({ i: r6.imported, f: r6.failed, e: r6.errors }))
console.log('db:', JSON.stringify(db.getAllWatching().map(r => [r.name, r.sort_order])))

console.log('\n=== P7: 超长名称会不会撑爆 UNIQUE/索引 ===')
await fresh()
const longName = 'L'.repeat(5000)
const r7 = db.addWatching({ name: longName })
console.log('5000 字名称 add:', JSON.stringify(r7))

console.log('\n=== P8: name 为空串 / NULL ===')
console.log('addWatching({name:""}):', JSON.stringify(db.addWatching({ name: '' })))
console.log('addWatching({}):', JSON.stringify(db.addWatching({})))
console.log('库内:', JSON.stringify(db.getAllWatching().map(r => [r.id, r.name])).slice(0, 120))

console.log('\n=== P9: total_episodes 为超长/异味值 ===')
await fresh()
db.addWatching({ name: '怪总集数', current_episode: '3', total_episodes: '9999999999999999999' })
db.addWatching({ name: 'HTML总集数', current_episode: '3', total_episodes: '<b>x</b>' })
console.log('db:', JSON.stringify(db.getAllWatching().map(r => [r.name, r.total_episodes])))

console.log('\n=== P10: 8000 条导入耗时（结构化无分批/无进度） ===')
await fresh()
const many = JSON.stringify({ watching: Array.from({ length: 8000 }, (_, i) => ({ name: '批量' + i })) })
const t0 = Date.now()
const r10 = await importJson(mk(many, 'many.json'))
console.log('8000 条耗时(ms):', Date.now() - t0, 'result:', JSON.stringify({ i: r10.imported, f: r10.failed }))
await db.flush?.()
console.log('落盘完成')
