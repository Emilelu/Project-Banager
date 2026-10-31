/**
 * 临时探针 2（完成后删除）：定位崩溃点与 CSV 换行损坏细节
 */
import 'fake-indexeddb/auto'

const { getDb } = await import('../../src/db/index.js')
const { buildExportCsv } = await import('../../src/db/excelExporter.js')
const { importCsv, importJson } = await import('../../src/db/structuredImporter.js')

const db = await getDb()
const mk = (text, name = 'x') => new File([String(text)], name)

console.log('=== A. sql.js 抛出的到底是什么对象 ===')
for (const args of [{}, { name: undefined }, { name: null }]) {
  try {
    db.addWatching(args)
    console.log(JSON.stringify(args), '→ 未抛异常')
  } catch (e) {
    console.log(JSON.stringify(args), '→ thrown:', typeof e, '| isError=', e instanceof Error, '| message=', JSON.stringify(e?.message), '| String(e)=', JSON.stringify(String(e)), '| keys=', Object.keys(e || {}))
  }
}

console.log('\n=== B. 直接调 sql.js 看错误类型 ===')
try {
  db.db.run('INSERT INTO watching (name, day_of_week) VALUES (?, ?)', [undefined, ''])
} catch (e) {
  console.log('db.run undefined →', typeof e, 'message=', JSON.stringify(e?.message), 'String=', JSON.stringify(String(e)))
}
try {
  db.db.run('INSERT INTO watching (day_of_week) VALUES (?)', [''])
  console.log('NOT NULL 缺失 → 未抛异常??')
} catch (e) {
  console.log('NOT NULL 缺失 →', typeof e, 'message=', JSON.stringify(e?.message), 'String=', JSON.stringify(String(e)))
}
try {
  db.db.run('INSERT INTO watching (name) VALUES (?)', [null])
  console.log('NULL name → 未抛异常??')
} catch (e) {
  console.log('NULL name →', typeof e, 'message=', JSON.stringify(e?.message), 'String=', JSON.stringify(String(e)))
}

console.log('\n=== C. CSV 换行：原始导出内容 ===')
db.clearAll()
db.addWatching({ name: 'A\nB 番', day_of_week: '周一', time_slot: '20:30', current_episode: '5' })
const csv = buildExportCsv({ watching: db.getAllWatching(), remaining: [], watched: [] })
console.log(JSON.stringify(csv))

console.log('\n=== D. 已看/等番换行 ===')
db.clearAll()
db.addRemaining({ name: 'C\nD 等', expected_date: '2026/05', tags: '搞笑' })
db.addWatched({ name: 'E\nF 已看', watch_date: '2025/07' })
const csv2 = buildExportCsv({ watching: [], remaining: db.getAllRemaining(), watched: db.getAllWatched() })
console.log(JSON.stringify(csv2))
db.clearAll()
const r = await importCsv(mk(csv2, 'x.csv'))
console.log('导入结果:', JSON.stringify({ i: r.imported, f: r.failed, e: r.errors }))
console.log('remaining:', JSON.stringify(db.getAllRemaining().map(x => [x.name, x.expected_date, x.tags])))
console.log('watched:', JSON.stringify(db.getAllWatched().map(x => [x.name, x.watch_date])))

console.log('\n=== E. 8000 条结构化导入耗时 ===')
db.clearAll()
const many = new File([JSON.stringify({ watching: Array.from({ length: 8000 }, (_, i) => ({ name: '批量' + i })) })], 'many.json')
const t0 = Date.now()
const r10 = await importJson(many)
console.log('8000 条耗时(ms):', Date.now() - t0, JSON.stringify({ i: r10.imported, f: r10.failed }))
await db.flush?.()

console.log('\n=== F. 20 万条（模拟 50MB JSON）耗时 ===')
db.clearAll()
const huge = new File([JSON.stringify({ watching: Array.from({ length: 200000 }, (_, i) => ({ name: '巨量' + i })) })], 'huge.json')
const t1 = Date.now()
const r11 = await importJson(huge)
console.log('20 万条耗时(ms):', Date.now() - t1, JSON.stringify({ i: r11.imported, f: r11.failed }))
await db.flush?.()
