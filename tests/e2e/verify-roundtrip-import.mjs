/**
 * 临时端到端校验脚本（任务完成后删除）
 * 真实走一遍 「导出 → 写成文件 → 读回 → 导入 → 比对」 的往返。
 * 运行： node --import ./tests/e2e/resolve-loader.mjs tests/e2e/verify-roundtrip-import.mjs
 */
import 'fake-indexeddb/auto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { getDb } = await import('../../src/db/index.js')
const { buildExportCsv, buildExportJson, buildExportMarkdown } = await import('../../src/db/excelExporter.js')
const { importCsv, importJson, importMd } = await import('../../src/db/structuredImporter.js')

// ---------------------------------------------------------------------------
// 样本数据（覆盖任务要求的各类字段与特殊字符）
// ---------------------------------------------------------------------------
const SAMPLE = {
  watching: [
    { name: '欢迎来到实力至上主义的教室4', day_of_week: '周一', time_slot: '20:30', current_episode: '11', total_episodes: '12', url: 'https://e/x?p={集数}', url_params: 'p={集数}', notes: '备注一', tags: '热血,原创', sort_order: 1 },
    { name: '带逗号, 的番名', day_of_week: '周三', time_slot: '22:30', current_episode: '7', total_episodes: '24', url: 'https://e/y', url_params: '', notes: '逗号', tags: '日常', sort_order: 2 },
    { name: 'He said "hi" 番', day_of_week: '周二', time_slot: '18:00', current_episode: '01', total_episodes: '', url: '', url_params: '', notes: '引号', tags: '', sort_order: 3 },
    { name: 'New\nLine 番', day_of_week: '周五', time_slot: '20:00', current_episode: '5', total_episodes: '12', url: '', url_params: '', notes: '换行', tags: '治愈', sort_order: 4 },
    { name: '零集番', day_of_week: '周日', time_slot: '00:30', current_episode: '0', total_episodes: '', url: '', url_params: '', notes: '', tags: '', sort_order: 5 },
    { name: '86', day_of_week: '周一', time_slot: '20:30', current_episode: '3', total_episodes: '', url: '', url_params: '', notes: '', tags: '', sort_order: 6 },
    { name: '夏目友人帳 · 肆', day_of_week: '周四', time_slot: '01:00', current_episode: '2', total_episodes: '', url: '', url_params: '', notes: '', tags: '治愈', sort_order: 7 },
    { name: '未排期番', day_of_week: '', time_slot: '', current_episode: '4', total_episodes: '', url: '', url_params: '', notes: '', tags: '', sort_order: 8 },
    { name: '带分号; 番', day_of_week: '周六', time_slot: '23:00', current_episode: '6', total_episodes: '13', url: '', url_params: '', notes: '', tags: '科幻', sort_order: 9 },
  ],
  remaining: [
    { name: 'VIVANT 2', expected_date: '2026/07', url: 'https://e/r1', url_params: '', notes: '等番备注', tags: '悬疑', sort_order: 1 },
    { name: '年份等番', expected_date: '2026', url: '', url_params: '', notes: '', tags: '', sort_order: 2 },
    { name: '时刻等番', expected_date: '2026/07/15 14:30', url: '', url_params: '', notes: '', tags: '', sort_order: 3 },
    { name: '日期未知 등番', expected_date: '', url: '', url_params: '', notes: '', tags: '日常', sort_order: 4 },
    { name: '逗号"引号 等番', expected_date: '2026/08', url: '', url_params: '', notes: '', tags: '热血,原创', sort_order: 5 },
  ],
  watched: [
    { name: '作品A', watch_date: '2025/07/15', url: 'https://e/d1', url_params: 'p={集数}', notes: '已看备注A', tags: '热血', sort_order: 1 },
    { name: '作品B (剧场版)', watch_date: '2025/07', url: '', url_params: '', notes: '', tags: '剧场版', sort_order: 2 },
    { name: '作品C', watch_date: '2025', url: '', url_params: '', notes: '', tags: '', sort_order: 3 },
    { name: '无日期作品', watch_date: '', url: '', url_params: '', notes: '无日期', tags: '', sort_order: 4 },
    { name: '范围作品', watch_date: '2014~2017', url: '', url_params: '', notes: '', tags: '', sort_order: 5 },
    { name: '带时间作品', watch_date: '2025/07/15 14:30', url: '', url_params: '', notes: '', tags: '', sort_order: 6 },
    { name: 'A, B 作品', watch_date: '2026', url: '', url_params: '', notes: '', tags: '原创', sort_order: 7 },
    { name: 'Name · Sub', watch_date: '2025/07', url: '', url_params: '', notes: '', tags: '', sort_order: 8 },
    { name: 'X\nY 作品', watch_date: '2024/03/01', url: '', url_params: '', notes: '', tags: '', sort_order: 9 },
    { name: '重复已看', watch_date: '2025/02', url: '', url_params: '', notes: '', tags: '', sort_order: 10 },
    { name: '重复已看', watch_date: '2025/01', url: '', url_params: '', notes: '', tags: '', sort_order: 11 },
  ],
}

const FIELD_SETS = {
  json: {
    watching: ['name', 'day_of_week', 'time_slot', 'current_episode', 'total_episodes', 'url', 'url_params', 'notes', 'tags', 'sort_order'],
    remaining: ['name', 'expected_date', 'url', 'url_params', 'notes', 'tags', 'sort_order'],
    watched: ['name', 'watch_date', 'url', 'url_params', 'notes', 'tags', 'sort_order'],
  },
  csv: {
    watching: ['name', 'day_of_week', 'time_slot', 'current_episode'],
    remaining: ['name', 'expected_date', 'tags'],
    watched: ['name', 'watch_date'],
  },
  md: {
    watching: ['name', 'day_of_week', 'time_slot', 'current_episode', 'tags'],
    remaining: ['name', 'expected_date', 'tags'],
    watched: ['name', 'watch_date', 'tags'],
  },
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bangumi-rt-'))

function norm(v) {
  return String(v ?? '')
}

async function seed(db) {
  db.clearAll()
  for (const r of SAMPLE.watching) db.addWatching(r)
  for (const r of SAMPLE.remaining) db.addRemaining(r)
  for (const r of SAMPLE.watched) db.addWatched(r)
  await db.flush?.()
}

function collect(db) {
  return {
    watching: db.getAllWatching(),
    remaining: db.getAllRemaining(),
    watched: db.getAllWatched(),
  }
}

function matchRows(expected, actual, keys) {
  const used = new Set()
  const pairs = []
  const missing = []
  for (const e of expected) {
    let idx = actual.findIndex((a, i) => !used.has(i) && e.name === a.name)
    if (idx < 0) idx = actual.findIndex((a, i) => !used.has(i) && keys.every(k => norm(a[k]) === norm(e[k])))
    if (idx >= 0) {
      used.add(idx)
      pairs.push([e, actual[idx]])
    } else missing.push(e)
  }
  const extra = actual.filter((_, i) => !used.has(i))
  return { pairs, missing, extra }
}

function compare(exported, imported, fieldsByTable, label) {
  const out = { label, tables: {}, diffs: [] }
  for (const table of ['watching', 'remaining', 'watched']) {
    const exp = exported[table]
    const act = imported[table]
    const { pairs, missing, extra } = matchRows(exp, act, table === 'watched' ? ['name', 'watch_date'] : ['name'])
    const fields = fieldsByTable[table]
    const stats = {}
    for (const f of fields) stats[f] = { ok: 0, total: 0 }
    for (const [e, a] of pairs) {
      for (const f of fields) {
        stats[f].total++
        if (norm(e[f]) === norm(a[f])) stats[f].ok++
        else out.diffs.push({ table, name: e.name, field: f, expected: e[f], actual: a[f] })
      }
    }
    for (const m of missing) out.diffs.push({ table, name: m.name, field: '(整条记录丢失)', expected: m, actual: null })
    for (const x of extra) out.diffs.push({ table, name: x.name, field: '(多出记录)', expected: null, actual: x })
    out.tables[table] = { expected: exp.length, actual: act.length, matched: pairs.length, missing: missing.length, extra: extra.length, fields: stats }
  }
  return out
}

function pct(ok, total) {
  if (!total) return '  n/a'
  return (ok * 100 / total).toFixed(1) + '%'
}

function printReport(reports) {
  const lines = []
  for (const rep of reports) {
    lines.push(`\n=== ${rep.label} ===`)
    for (const table of ['watching', 'remaining', 'watched']) {
      const t = rep.tables[table]
      lines.push(`  [${table}] 样本 ${t.expected} 条 / 导入 ${t.actual} 条 / 匹配 ${t.matched} 条 / 丢失 ${t.missing} / 多出 ${t.extra}`)
      for (const [f, s] of Object.entries(t.fields)) {
        lines.push(`     ${f.padEnd(16)} ${pct(s.ok, s.total)} (${s.ok}/${s.total})`)
      }
    }
    if (rep.diffs.length) {
      lines.push(`  差异清单（${rep.diffs.length} 条，最多显示 40 条）：`)
      for (const d of rep.diffs.slice(0, 40)) {
        const exp = d.expected == null ? '<无>' : (typeof d.expected === 'object' ? JSON.stringify(d.expected) : JSON.stringify(d.expected))
        const act = d.actual == null ? '<无>' : (typeof d.actual === 'object' ? JSON.stringify(d.actual) : JSON.stringify(d.actual))
        lines.push(`   - [${d.table}] ${JSON.stringify(d.name)} 字段 ${d.field}: 期望 ${exp} / 实际 ${act}`)
      }
    } else {
      lines.push('  差异清单：无（全部一致）')
    }
  }
  console.log(lines.join('\n'))
}

function summarize(reports) {
  const agg = {}
  for (const rep of reports) {
    for (const table of ['watching', 'remaining', 'watched']) {
      for (const [f, s] of Object.entries(rep.tables[table].fields)) {
        const k = `${table}.${f}`
        agg[k] = agg[k] || { ok: 0, total: 0 }
        agg[k].ok += s.ok
        agg[k].total += s.total
      }
    }
  }
  return agg
}

// ---------------------------------------------------------------------------
// 三种格式的往返
// ---------------------------------------------------------------------------
const FORMATS = {
  json: {
    build: buildExportJson,
    importer: importJson,
    ext: 'json',
    fields: FIELD_SETS.json,
  },
  csv: {
    build: buildExportCsv,
    importer: importCsv,
    ext: 'csv',
    fields: FIELD_SETS.csv,
  },
  md: {
    build: buildExportMarkdown,
    importer: importMd,
    ext: 'md',
    fields: FIELD_SETS.md,
  },
}

async function runFormat(kind, { fileLevel }) {
  const db = await getDb()
  await seed(db)
  const exported = collect(db)
  const text = FORMATS[kind].build({ watching: exported.watching, remaining: exported.remaining, watched: exported.watched })

  let buffer
  let filename
  if (fileLevel) {
    filename = path.join(TMP, `export.${FORMATS[kind].ext}`)
    fs.writeFileSync(filename, text, 'utf8')
    buffer = fs.readFileSync(filename)
  } else {
    buffer = text
  }

  db.clearAll()
  const result = await FORMATS[kind].importer(new File([buffer], `export.${FORMATS[kind].ext}`))
  const imported = collect(db)
  const rep = compare(exported, imported, FORMATS[kind].fields, `${kind}${fileLevel ? '（真实文件）' : '（内存字符串）'}`)
  rep.result = result
  return rep
}

const main = async () => {
  const reports = []
  for (const kind of ['json', 'csv', 'md']) {
    reports.push(await runFormat(kind, { fileLevel: false }))
    reports.push(await runFormat(kind, { fileLevel: true }))
  }
  printReport(reports)

  console.log('\n--- 导入结果统计（imported / failed / errors）---')
  for (const rep of reports) {
    console.log(`${rep.label}: imported=${rep.result.imported} failed=${rep.result.failed} byTable=${JSON.stringify(rep.result.byTable)} errors=${JSON.stringify(rep.result.errors.slice(0, 6))}`)
  }

  const agg = summarize(reports)
  console.log('\n--- 汇总（所有格式 × 内存/文件）---')
  const byTable = {}
  for (const [k, v] of Object.entries(agg)) {
    const [table, f] = k.split('.')
    byTable[table] = byTable[table] || []
    byTable[table].push(`${f} ${pct(v.ok, v.total)}`)
  }
  for (const [t, list] of Object.entries(byTable)) console.log(`${t}: ${list.join(' | ')}`)

  fs.rmSync(TMP, { recursive: true, force: true })
}

main().catch((e) => {
  console.error('校验脚本异常', e)
  process.exitCode = 1
})
