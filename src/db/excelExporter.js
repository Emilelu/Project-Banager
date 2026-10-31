/**
 * 浏览器端数据导出模块
 *
 * 目标：导出的 xlsx **与 template.xlsx 结构完全一致**，
 * 从而保证「导出 → 编辑 → 再导入」可以无损往返。
 *
 * 三种工作表的真实格式（依据 template.xlsx 实测）：
 *
 *   1) 追番（周历布局）
 *      第 1~8 行留白，第 9 行是表头：
 *        A9 = "      星期 时间      "
 *        B9..H9 = Monday / Tuesday / ... / Sunday
 *      A10 起每行一个时间段，A 列是 **Excel 小数时间**（0.0208 = 00:30），
 *      B..H 列填「番名 集数」。
 *
 *   2) 等番
 *      A1 = "Name"，B1 = "Time"，第 2 行起为数据。
 *
 *   3) 已看（按年份横向排布）
 *      第 1 行是年份表头（2025、2026…），每列自上而下是该年的作品名。
 *
 * 设计约束：
 *  - 列名用数据层标识（Monday、YYYY/MM），不随界面语言变化，保证跨语言可回灌；
 *  - 空值统一写空串，绝不写 undefined（否则 Excel 里出现 "undefined" 字样）。
 */

import * as XLSX from 'xlsx'

// 与导入器使用的英文星期名严格对齐（导入器把 Monday→周一）
const WEEKDAY_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const WEEKDAY_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** "HH:mm" → Excel 小数时间（一天的占比）。无法解析返回 null */
function timeToFraction(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return (h * 60 + mi) / (24 * 60)
}

/** 转成导入器认得的日期字符串（保持原有精度，不强行补全） */
function dateCell(v) {
  const s = String(v ?? '').trim()
  return s || ''
}

/** 追番：周历 25 行 × 8 列（A 时间 + B..H 七天） */
function buildWatchingSheet(rows) {
  const aoa = []

  // 1) 前 8 行留白，第 9 行表头（与模板一致）
  for (let i = 0; i < 8; i++) aoa.push(new Array(8).fill(''))
    aoa.push(['      星期 时间      ', ...WEEKDAY_EN])

  // 2) 按时间槽分组：{ "HH:mm" -> { '周一': item } }
  const bySlot = new Map()
  for (const r of rows) {
    const slot = String(r.time_slot || '').trim()
    if (!slot) continue
    const dayCN = r.day_of_week || ''
    if (!WEEKDAY_CN.includes(dayCN)) continue
    if (!bySlot.has(slot)) bySlot.set(slot, {})
    bySlot.get(slot)[dayCN] = r
  }

  // 时间槽按时刻升序
  const slots = [...bySlot.keys()].sort((a, b) => {
    const fa = timeToFraction(a)
    const fb = timeToFraction(b)
    if (fa === null && fb === null) return String(a).localeCompare(String(b))
    if (fa === null) return 1
    if (fb === null) return -1
    return fa - fb
  })

  for (const slot of slots) {
    const frac = timeToFraction(slot)
    const dayMap = bySlot.get(slot)
    const row = [frac === null ? slot : frac]
    for (const dayCN of WEEKDAY_CN) {
      const item = dayMap[dayCN]
      row.push(item ? `${item.name} ${item.current_episode ?? ''}`.trim() : '')
    }
    aoa.push(row)
  }

  // 3) 补齐到模板的 25 行，保证视觉上与模板一致（空行不影响导入）
  while (aoa.length < 25) aoa.push(new Array(8).fill(''))
  return aoa
}

/** 等番：A=Name, B=Time，两列 */
function buildRemainingSheet(rows) {
  // 第三列 Tags：逗号分隔。导入器只认前两列（Name/Time），多出的列会被忽略，
  // 因此加这一列不会破坏「导出→导入」往返。
  const aoa = [['Name', 'Time', 'Tags']]
  for (const r of rows) {
    aoa.push([String(r.name ?? ''), dateCell(r.expected_date), String(r.tags ?? '')])
  }
  return aoa
}

/**
 * 已看：年份横向排布。
 * 第 1 行是年份，每列自上而下是该年作品名；未归类（无日期）的放最后一列「未归类」。
 *
 * ⚠ 精度保留：模板的列头只有「年份」，若只写作品名，导出再导入会把
 * `2025/07` 退化成 `2025`（月份丢失）。导入器支持「作品名 (备注)」语法，
 * 因此当日期**精度高于年份**时，把完整日期写进括号，导入时由导入器还原。
 * 仅当年份是唯一信息时不加括号，避免产生无意义的 `(2025)` 噪音。
 */
function buildWatchedSheet(rows) {
  const groups = new Map()          // yearLabel -> string[]
  const order = []
  for (const r of rows) {
    const y = String(r.watch_date || '').trim()
    // 取年份：2025 / 2025/07 / 2025/07/15 / 2014~2017 都取首个四位年
    const m = y.match(/\d{4}/)
    const label = m ? m[0] : '__unclassified__'
    if (!groups.has(label)) { groups.set(label, []); order.push(label) }

    // 只有当原始日期比「年份」更精确（含月份/日/时间）时，才把完整日期带上
    const hasMorePrecision = m && y.replace(/\d{4}/, '').match(/[\/\-\d:]/)
    const name = String(r.name ?? '')
    const cellText = hasMorePrecision ? `${name} (${y})`.trim() : name
    groups.get(label).push(cellText)
  }

  // 年份升序；未归类放最后
  order.sort((a, b) => {
    if (a === '__unclassified__') return 1
    if (b === '__unclassified__') return -1
    return Number(a) - Number(b)
  })

  const header = order.map(l => (l === '__unclassified__' ? '未归类' : Number(l)))
  const maxLen = Math.max(0, ...order.map(l => groups.get(l).length))
  const aoa = [header]
  for (let i = 0; i < maxLen; i++) {
    aoa.push(order.map(l => groups.get(l)[i] ?? ''))
  }
  return aoa
}

/** 设置列宽：首列宽一些，其余 16 */
function withColWidths(aoa, first = 24) {
  return aoa[0].map((_, i) => ({ wch: i === 0 ? first : 16 }))
}

/** 生成 xlsx（Uint8Array） */
export function buildExportWorkbook(data) {
  const wb = XLSX.utils.book_new()

  const add = (name, aoa, first = 24) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = withColWidths(aoa, first)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  add('Watching | 追番', buildWatchingSheet(data.watching || []), 22)
  add('Remaining | 等番', buildRemainingSheet(data.remaining || []), 32)
  add('Watched | 回忆', buildWatchedSheet(data.watched || []), 30)

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: false })
}

/** 生成可读 JSON */
export function buildExportJson(data) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'Project Bangumi Manager',
      counts: {
        watching: (data.watching || []).length,
        remaining: (data.remaining || []).length,
        watched: (data.watched || []).length,
      },
      watching: data.watching || [],
      remaining: data.remaining || [],
      watched: data.watched || [],
    },
    null,
    2,
  )
}

/** CSV 单元格转义：含逗号/引号/换行时用双引号包裹，内部引号翻倍 */
function csvCell(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * 生成 CSV（三张表分别成段，用空行 + 表名分隔）。
 * 不拆成三个文件，是因为浏览器一次点击只能下载一个文件；
 * 单文件 CSV 也能被 Excel / Numbers / Google Sheets 直接打开。
 */
export function buildExportCsv(data) {
  const lines = []
  const section = (title, aoa) => {
    lines.push(`# ${title}`)
    for (const row of aoa) lines.push(row.map(csvCell).join(','))
    lines.push('')
  }

  section('Watching | 追番', buildWatchingSheet(data.watching || []))
  section('Remaining | 等番', buildRemainingSheet(data.remaining || []))
  section('Watched | 已看', buildWatchedSheet(data.watched || []))

  // BOM 让 Excel 正确识别 UTF-8 中文；否则中文会变乱码
  return '\uFEFF' + lines.join('\r\n')
}

/**
 * 生成 Markdown：适合贴进笔记/博客。
 * 按「追番（按星期）/ 等番 / 已看（按年份）」分节，用列表而非表格，
 * 因为番名长度差异大，表格在窄屏会挤成一团。
 */
export function buildExportMarkdown(data, t = null) {
  const L = []
  const now = new Date()
  const stamp = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`
  L.push(`# Project Bangumi Manager — 数据导出`)
  L.push('')
  L.push(`> 导出时间：${stamp}`)
  L.push('')

  // 追番：按星期分组
  const watching = data.watching || []
  L.push(`## 正在追番（${watching.length}）`)
  L.push('')
  if (watching.length === 0) {
    L.push('_暂无_')
  } else {
    for (const dayCN of WEEKDAY_CN) {
      const items = watching.filter(r => r.day_of_week === dayCN)
      if (items.length === 0) continue
      L.push(`### ${dayCN}`)
      for (const r of items) {
        const time = r.time_slot ? `${r.time_slot} ` : ''
        const ep = r.current_episode ? `第 ${r.current_episode} 集` : ''
        const tags = r.tags ? ` \`${r.tags.split(',').join('` `')}\`` : ''
        L.push(`- ${time}${r.name}${ep ? ` · ${ep}` : ''}${tags}`)
      }
      L.push('')
    }
    // 未排期
    const unscheduled = watching.filter(r => !WEEKDAY_CN.includes(r.day_of_week))
    if (unscheduled.length) {
      L.push('### 未排期')
      for (const r of unscheduled) {
        const tg = r.tags ? ` ${String(r.tags).split(',').filter(Boolean).map(x => '`' + x.trim() + '`').join(' ')}` : ''
        L.push(`- ${r.name}${tg}`)
      }
      L.push('')
    }
  }
  L.push('')

  // 等番
  const remaining = data.remaining || []
  L.push(`## 等待更新（${remaining.length}）`)
  L.push('')
  if (remaining.length === 0) {
    L.push('_暂无_')
  } else {
    const sorted = [...remaining].sort((a, b) =>
      String(a.expected_date || '~').localeCompare(String(b.expected_date || '~')))
    for (const r of sorted) {
      const d = r.expected_date ? `${r.expected_date} · ` : ''
      // 标签以 `标签` 形式追加，与追番部分保持一致
      const tg = r.tags ? ` ${String(r.tags).split(',').filter(Boolean).map(x => '`' + x.trim() + '`').join(' ')}` : ''
      L.push(`- ${d}${r.name}${tg}`)
    }
  }
  L.push('')

  // 已看：按年份分组
  const watched = data.watched || []
  L.push(`## 已看历史（${watched.length}）`)
  L.push('')
  if (watched.length === 0) {
    L.push('_暂无_')
  } else {
    const byYear = new Map()
    for (const r of watched) {
      const m = String(r.watch_date || '').match(/\d{4}/)
      const y = m ? m[0] : '未归类'
      if (!byYear.has(y)) byYear.set(y, [])
      byYear.get(y).push(r)
    }
    const years = [...byYear.keys()].sort((a, b) => {
      if (a === '未归类') return 1
      if (b === '未归类') return -1
      return Number(b) - Number(a)   // 新的年份在前
    })
    for (const y of years) {
      L.push(`### ${y}`)
      for (const r of byYear.get(y)) {
        const d = r.watch_date && String(r.watch_date).replace(/\d{4}/, '').trim()
          ? ` · ${r.watch_date}` : ''
        const tg = r.tags ? ` ${String(r.tags).split(',').filter(Boolean).map(x => '`' + x.trim() + '`').join(' ')}` : ''
        L.push(`- ${r.name}${d}${tg}`)
      }
      L.push('')
    }
  }

  L.push('')
  L.push(`---`)
  L.push(`_由 Project Bangumi Manager 生成_`)
  return L.join('\n')
}

/** 触发下载 */
export function downloadBlob(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** 文件名时间戳 YYYYMMDD_HHmm */
export function exportTimestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}
