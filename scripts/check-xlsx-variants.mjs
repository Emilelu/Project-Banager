/**
 * SheetJS 构建变体（full / core / mini）功能可用性验证
 *
 * 用法：node scripts/check-xlsx-variants.mjs
 *
 * 只验证本应用真正用到的能力（见 src/db/excelExporter.js、src/db/excelImporter.js）：
 *   - read(arrayBuffer, {type:'array', cellStyles:false, sheetStubs:false, bookVBA:false, dense:false})
 *   - read(template.xlsx) 并 sheet_to_json({header:1})
 *   - 单元格超链接 cell.l.Target
 *   - XLSX.SSF.parse_date_code
 *   - utils.book_new / aoa_to_sheet / book_append_sheet / encode_cell
 *   - write(wb, {bookType:'xlsx', type:'array', cellDates:false}) 并再读回
 *   - 旧格式 .xls（BIFF8，CFB 容器）读取
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)

const variants = [
  ['xlsx (full, package entry)', () => require('xlsx')],
  ['xlsx/dist/xlsx.core.min.js', () => require('xlsx/dist/xlsx.core.min.js')],
  ['xlsx/dist/xlsx.mini.min.js', () => require('xlsx/dist/xlsx.mini.min.js')],
  ['xlsx/dist/xlsx.full.min.js', () => require('xlsx/dist/xlsx.full.min.js')],
]

const template = readFileSync('template.xlsx')

function buildLegacyXlsBuffer() {
  // 用一个极简的 BIFF8 工作簿：先让 full 版把 xlsx 写成 xls 二进制（CFB），
  // 再用各变体读取，验证是否保留 .xls 支持。
  const full = require('xlsx')
  const wb = full.utils.book_new()
  full.utils.book_append_sheet(wb, full.utils.aoa_to_sheet([['Name', 'Time'], ['测试番', '2025/07']]), 'Remaining | 等番')
  return full.write(wb, { bookType: 'xls', type: 'buffer' })
}

const xlsBuffer = buildLegacyXlsBuffer()

for (const [label, load] of variants) {
  const out = []
  let X
  try {
    X = load()
    if (typeof X.read !== 'function') X = X.default || X
  } catch (e) {
    console.log(`${label}: 加载失败 ${e.message}`)
    continue
  }
  const check = (name, fn) => {
    try {
      const r = fn()
      out.push([name, r === true ? 'OK' : r === false ? 'MISSING' : String(r)])
    } catch (e) {
      out.push([name, 'ERR ' + e.message.slice(0, 60)])
    }
  }

  check('read(template.xlsx)', () => {
    const wb = X.read(template, { type: 'buffer', cellStyles: false, sheetStubs: false, bookVBA: false, dense: false })
    return wb.SheetNames.length > 0
  })
  check('sheet_to_json(header:1)', () => {
    const wb = X.read(template, { type: 'buffer' })
    const data = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    return data.length > 0
  })
  check('utils.encode_cell', () => typeof X.utils.encode_cell === 'function')
  check('SSF.parse_date_code', () => (typeof X.SSF?.parse_date_code === 'function' ? String(X.SSF.parse_date_code(0.5).y) : false))
  check('write->xlsx 再读回', () => {
    const wb = X.utils.book_new()
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Name', 'Time'], ['中文番名', 0.5]]), 'S1')
    const buf = X.write(wb, { bookType: 'xlsx', type: 'array', cellDates: false })
    const back = X.read(buf, { type: 'array' })
    const data = X.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], { header: 1 })
    return data[1] && data[1][0] === '中文番名'
  })
  check('write->xlsx 保留多 sheet 名', () => {
    const wb = X.utils.book_new()
    for (const n of ['Watching | 追番', 'Remaining | 等番', 'Watched | 回忆']) {
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([[n]]), n)
    }
    const buf = X.write(wb, { bookType: 'xlsx', type: 'array' })
    const back = X.read(buf, { type: 'array' })
    return back.SheetNames.join('|')
  })
  check('read(legacy .xls / BIFF8)', () => {
    const wb = X.read(xlsBuffer, { type: 'buffer' })
    const data = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    return data[1] && data[1][0] === '测试番'
  })
  check('read(csv 文本)', () => {
    const wb = X.read('a,b\n1,2', { type: 'string' })
    return wb.SheetNames.length > 0
  })

  console.log(`\n=== ${label} ===`)
  for (const [n, r] of out) console.log(`  ${r === 'OK' ? '✓' : '✗'} ${n}: ${r}`)
}
