/**
 * 浏览器端 Excel 导入模块
 * 使用 SheetJS (xlsx) 浏览器版本解析 Excel 文件
 * 完全兼容 server/excelImporter.js 的业务逻辑
 */

import * as XLSX from 'xlsx'
import { getDb } from './index'

let importedCount = 0
let errorCount = 0
let errors = []
let sortCounter = 0

// 让出主线程：大文件解析与逐行写入会长时间占用 UI 线程，
// 每个批次之间 await 一次，浏览器有机会处理输入与重绘，页面不会"假死"。
const yieldToUI = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => resolve())
  } else {
    setTimeout(resolve, 0)
  }
})

// 进度回调：由 ImportView 注入，用于显示"已处理 N 行"
let progressHook = null
function reportProgress(done, total) {
  if (typeof progressHook === 'function') {
    try { progressHook(done, total) } catch { /* 不影响导入 */ }
  }
}

function nextSortOrder() {
  return ++sortCounter
}

/**
 * 获取单元格的超链接
 */
function getHyperlink(sheet, row, col) {
  try {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
    const cell = sheet[cellRef]
    if (!cell) return ''
    if (cell.l && cell.l.Target) return cell.l.Target
    if (cell.Hyperlink) return cell.Hyperlink
  } catch(e) {}
  return ''
}

/**
 * 解析追番名称，提取番剧名和集数
 */
function parseWatchingName(rawName) {
  let name = String(rawName).trim()
  let current_episode = '0'

  const eMatch = name.match(/^(.+?)\s+[eE](\d+(?:\.\d+)?)$/)
  if (eMatch) {
    name = eMatch[1].trim()
    current_episode = eMatch[2]
    return { name, current_episode }
  }

  const spaceMatch = name.match(/^(.+?)\s+(\d+\.\d+)$/)
  if (spaceMatch) {
    name = spaceMatch[1].trim()
    current_episode = spaceMatch[2]
    return { name, current_episode }
  }

  const numMatch = name.match(/^(.+?)\s+(\d+)$/)
  if (numMatch) {
    name = numMatch[1].trim()
    current_episode = numMatch[2]
    return { name, current_episode }
  }

  return { name, current_episode }
}

/**
 * 解析已看番剧名称，提取纯名称和备注
 */
function parseWatchedName(rawName) {
  let name = String(rawName).trim()
  let notes = ''

  const notesMatch = name.match(/[（(]([^）)]+)[）)]/)
  if (notesMatch) {
    notes = notesMatch[1].trim()
    name = name.replace(/[（(][^）)]*[）)]/g, '').trim()
  }

  return { name, notes }
}

/**
 * 解析年份表头
 */
function parseYear(rawYear) {
  if (typeof rawYear === 'number') {
    if (rawYear >= 1900 && rawYear <= 2100 && Number.isInteger(rawYear)) return String(rawYear)
    return null
  }
  const str = String(rawYear ?? '').trim()
  const rangeMatch = str.match(/^(\d{4})\s*[~\-]\s*(\d{4})$/)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10)
    const end = parseInt(rangeMatch[2], 10)
    if (start >= 1900 && end <= 2100 && start <= end) return rangeMatch[1] + '~' + rangeMatch[2]
    return null
  }
  if (/^\d{4}$/.test(str)) {
    const year = parseInt(str, 10)
    if (year >= 1900 && year <= 2100) return str
  }
  return null
}

/**
 * 导入追番数据
 */
function importWatching(db, workbook) {
  try {
    let sheetName = workbook.SheetNames.find(name =>
      name.includes('追番') || name.includes('Watching')
    )

    if (!sheetName) return

    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    let headerRow = -1
    const dayKeywords = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      '周一', '周二', '周三', '周四', '周五', '周六', '周日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']

    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (row && row.some(cell => {
        const val = String(cell || '')
        return dayKeywords.some(kw => val.includes(kw))
      })) {
        headerRow = i
        break
      }
    }

    if (headerRow === -1) {
      errors.push('未找到追番表的星期表头行')
      return
    }

    const headerData = data[headerRow]
    const colDayMap = {}
    for (let col = 0; col < headerData.length; col++) {
      const val = String(headerData[col] || '').trim()
      if (val.includes('Monday') || val.includes('周一') || val.includes('星期一')) colDayMap[col] = '周一'
      else if (val.includes('Tuesday') || val.includes('周二') || val.includes('星期二')) colDayMap[col] = '周二'
      else if (val.includes('Wednesday') || val.includes('周三') || val.includes('星期三')) colDayMap[col] = '周三'
      else if (val.includes('Thursday') || val.includes('周四') || val.includes('星期四')) colDayMap[col] = '周四'
      else if (val.includes('Friday') || val.includes('周五') || val.includes('星期五')) colDayMap[col] = '周五'
      else if (val.includes('Saturday') || val.includes('周六') || val.includes('星期六')) colDayMap[col] = '周六'
      else if (val.includes('Sunday') || val.includes('周日') || val.includes('星期日')) colDayMap[col] = '周日'
    }

    for (let row = headerRow + 1; row < data.length; row++) {
      const rowData = data[row]
      if (!rowData) continue

      let timeSlot = ''
      if (rowData[0] != null) {
        const timeVal = parseFloat(rowData[0])
        if (!isNaN(timeVal) && timeVal >= 0 && timeVal < 1) {
          const totalMinutes = Math.round(timeVal * 24 * 60)
          const hours = Math.floor(totalMinutes / 60)
          const minutes = totalMinutes % 60
          timeSlot = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0')
        }
      }

      for (const colText of Object.keys(colDayMap)) {
        const col = Number(colText)
        const cellValue = rowData[col]
        if (cellValue == null || cellValue === '') continue
        if (typeof cellValue === 'number') {
          if (!(cellValue >= 1 && Number.isInteger(cellValue))) continue
        } else if (typeof cellValue !== 'string') {
          continue
        }

        const trimmed = String(cellValue).trim()
        if (!trimmed) continue

        if (trimmed.includes('看完则移至') || trimmed.includes('今天是') || trimmed.includes('现在是') ||
            trimmed.includes('暂不需要') || trimmed.includes('检查') || trimmed.includes('函数参考') ||
            trimmed.includes('本月没有')) {
          continue
        }

        const dayKw = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
          '周一','周二','周三','周四','周五','周六','周日','星期一','星期二','星期三','星期四','星期五','星期六','星期日']
        if (dayKw.some(kw => trimmed.includes(kw))) {
          continue
        }

        const dayOfWeek = colDayMap[col] || ''
        const parsed = parseWatchingName(trimmed)
        const url = getHyperlink(sheet, row, col)

        try {
          const result = db.addWatching({
            name: parsed.name,
            day_of_week: dayOfWeek,
            time_slot: timeSlot,
            current_episode: parsed.current_episode,
            url: url,
            notes: '',
            sort_order: nextSortOrder()
          })
          if (result.success) {
            importedCount++
          } else {
            errorCount++
            errors.push(`追番『${parsed.name}』导入失败（${result.error}）`)
          }
        } catch (err) {
          errorCount++
          errors.push(`追番『${parsed.name}』导入失败: ${err.message}`)
        }
      }
    }
  } catch (err) {
    errors.push('导入追番失败: ' + err.message)
  }
}

/**
 * 导入等番数据
 */
function importRemaining(db, workbook) {
  try {
    const sheetName = workbook.SheetNames.find(name =>
      name.includes('等番') || name.includes('等待') || name.includes('Remaining') || name.includes('Waiting')
    )

    if (!sheetName) return

    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[0]) continue

      const name = String(row[0]).trim()
      if (!name) continue

      let expectedDate = ''
      if (row[1]) {
        if (typeof row[1] === 'number' && row[1] >= 1900 && row[1] <= 2100 && Number.isInteger(row[1])) {
          expectedDate = String(row[1])
        } else if (typeof row[1] === 'number') {
          const date = XLSX.SSF.parse_date_code(row[1])
          if (date) {
            expectedDate = date.y + '/' + String(date.m).padStart(2, '0')
            if (date.d != null) expectedDate += '/' + String(date.d).padStart(2, '0')
          }
        } else {
          expectedDate = String(row[1]).trim()
        }
      }

      const notes = row[2] ? String(row[2]).trim() : ''
      const url = getHyperlink(sheet, i, 0)

      try {
        const result = db.addRemaining({ name, expected_date: expectedDate, url, notes, sort_order: nextSortOrder() })
        if (result.success) {
          importedCount++
        } else {
          errorCount++
          errors.push(`等番『${name}』导入失败（${result.error}）`)
        }
      } catch (err) {
        errorCount++
        errors.push(`等番『${name}』导入失败: ${err.message}`)
      }
    }
  } catch (err) {
    errors.push('导入等番失败: ' + err.message)
  }
}

/**
 * 导入已看数据
 */
async function importWatched(db, workbook) {
  try {
    const sheetName = workbook.SheetNames.find(name =>
      name.includes('已看') || name.includes('回忆') || name.includes('Watched') || name.includes('历史') || name.includes('完成')
    )

    if (!sheetName) return

    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

    if (data.length === 0) return

    let headerIndex = 0
    for (let i = 0; i < Math.min(data.length, 5); i++) {
      const row = data[i] || []
      if (row.some(cell => parseYear(cell))) { headerIndex = i; break }
    }
    const headerRow = data[headerIndex] || []
    const colYearMap = {}
    const yearOrder = []

    for (let col = 0; col < headerRow.length; col++) {
      const cellVal = headerRow[col]
      if (cellVal != null) {
        const year = parseYear(cellVal)
        if (year) {
          colYearMap[col] = year
          if (!yearOrder.includes(year)) yearOrder.push(year)
        }
      }
    }

    const merges = sheet['!merges'] || []
    for (const merge of merges) {
      if (merge.s.r !== headerIndex) continue
      const year = colYearMap[merge.s.c]
      if (!year) continue
      for (let col = merge.s.c; col <= merge.e.c; col++) colYearMap[col] = year
    }

    // 将年份存入 watched_years 表
    let yearSortOrder = 0
    for (const year of yearOrder) {
      try {
        db.addWatchedYear({ year_label: year, sort_order: ++yearSortOrder })
      } catch (err) {
        // 年份可能已存在，忽略
      }
    }

    // 按行优先导入，保持 Excel 里的视觉顺序
    // 每处理 YIELD_EVERY 行让出一次主线程，避免大表导入时页面假死
    const YIELD_EVERY = 50
    const yearCols = Object.keys(colYearMap).map(Number).sort((a, b) => a - b)
    const totalRows = Math.max(1, data.length - headerIndex - 1)
    for (let row = headerIndex + 1; row < data.length; row++) {
      if ((row - headerIndex) % YIELD_EVERY === 0) {
        reportProgress(row - headerIndex, totalRows)
        await yieldToUI()
      }
      for (const col of yearCols) {
        const year = colYearMap[col]
        const cellValue = data[row] ? data[row][col] : null
        if (!cellValue) continue

        const trimmed = String(cellValue).trim()
        if (!trimmed) continue

        const parsed = parseWatchedName(trimmed)
        const url = getHyperlink(sheet, row, col)

        if (parsed.name) {
          // 日期精度还原：导出的 xlsx 会把「作品名 (2025/07/15)」写成括号形式，
          // 用于保留模板列头（只有年份）装不下的月份/日。这里若括号内容
          // **形如更精确的日期**且包含与列头一致的年份，就用它代替列头年份；
          // 否则视为普通备注，保持原样。这样「导出→导入」不再丢失日期精度。
          const notesLooksLikeDate =
            parsed.notes &&
            /\d{4}/.test(parsed.notes) &&
            /[\/\-:~]/.test(parsed.notes) &&
            String(parsed.notes).includes(String(year))
          const effectiveDate = notesLooksLikeDate ? String(parsed.notes).trim() : year
          const effectiveNotes = notesLooksLikeDate ? '' : parsed.notes

          try {
            const result = db.addWatched({
              name: parsed.name,
              watch_date: effectiveDate,
              url: url,
              notes: effectiveNotes,
              sort_order: nextSortOrder()
            })
            if (result.success) {
              importedCount++
            } else {
              errorCount++
              errors.push(`已看『${parsed.name}』(${year}) 导入失败（${result.error}）`)
            }
          } catch (err) {
            errorCount++
            errors.push(`已看『${parsed.name}』(${year}) 导入失败: ${err.message}`)
          }
        }
      }
    }
  } catch (err) {
    errors.push('导入已看数据失败: ' + err.message)
  }
}

/**
 * 主导入函数 - 从 File 对象读取并导入
 */
export async function importExcel(file, { onProgress } = {}) {
  importedCount = 0
  errorCount = 0
  errors = []
  progressHook = onProgress || null

  const db = await getDb()
  sortCounter = 0
  for (const getter of ['getAllWatching', 'getAllRemaining', 'getAllWatched']) {
    try {
      const rows = db[getter]?.()
      if (Array.isArray(rows)) {
        for (const row of rows) sortCounter = Math.max(sortCounter, Number(row.sort_order) || 0)
      }
    } catch { /* 取不到就按 0 起算 */ }
  }

  // 读取文件
  let workbook
  try {
    const arrayBuffer = await file.arrayBuffer()
    if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
      return { success: false, message: '文件超过 20MB', imported: 0, errors: ['文件超过 20MB，请拆分后再导入'] }
    }
    workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellStyles: false,
      sheetStubs: false,
      bookVBA: false,
      dense: false
    })
  } catch (err) {
    return {
      success: false,
      message: '无法打开 Excel 文件',
      imported: 0,
      errors: ['打开文件失败: ' + err.message]
    }
  }

  // 整批导入放进一个事务：命中 UNIQUE 的行单独回滚该行的写法不可行，
  // 因此这里按「表级批」分批提交——每张表一个事务，避免逐条落盘的 O(n²)
  try {
    importWatching(db, workbook)
    importRemaining(db, workbook)
    await importWatched(db, workbook)
  } catch (err) {
    errors.push('导入过程异常: ' + err.message)
  } finally {
    // 无论成功与否都把未落盘的改动刷一次；失败时批已被 rollbackBatch 处理
    try { await db.flush?.() } catch { /* ignore */ }
  }

  const recognized = workbook.SheetNames.some(name => /追番|Watching|等番|等待|Remaining|Waiting|已看|回忆|Watched|历史|完成/.test(name))
  const success = recognized && (importedCount > 0 || (errorCount === 0 && errors.length === 0))
  return {
    success,
    message: success
      ? '导入完成！成功导入 ' + importedCount + ' 条数据，失败 ' + errorCount + ' 条'
      : '导入失败：成功 ' + importedCount + ' 条，失败 ' + errorCount + ' 条',
    imported: importedCount,
    errors: errors
  }
}
