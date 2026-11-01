/**
 * 结构化数据导入器 —— 与 excelExporter 的导出格式一一对应。
 *
 * 支持三种「可读格式」回灌：
 *   JSON : 导出时是 { watching:[], remaining:[], watched:[] }，直接按字段写库（最可靠）
 *   CSV  : 导出时按「# 工作表名 + 空行」分段的扁平表，这里按分段名识别表并解析
 *   MD   : 导出时是按星期/年份分节的 Markdown 列表，用行解析提取
 *
 * 设计取舍：
 *   · 三种格式的**信息完整度不同**：JSON 最全（含 url/notes/tags 等所有字段），
 *     CSV 次之（结构化列），MD 最少（只有名称和少量上下文）。
 *     因此解析出来的字段会按「有的就写、没有的不写」处理，不会用空值覆盖已有数据。
 *   · 名称重复时的策略与 Excel 导入保持一致：追番/等番靠 UNIQUE 约束报错并计入失败，
 *     已看允许重名、直接追加。
 *   · 解析失败逐条收集错误，不中断整批（与 Excel 导入的行为一致）。
 *
 * 往返要点（都由 exporter 的输出格式决定）：
 *   · CSV 是 RFC4180：带引号的字段内部可以有逗号、双引号（"" 转义）甚至**换行**。
 *     因此绝不能先按 \n 切行 —— 必须先按记录切分，再逐字段解析，否则一个含换行的
 *     番名会把后面所有段落整体错位（实测会连锁丢失十几条记录）。
 *   · CSV 追番单元格是「名称 集数」，必须像 excelImporter 那样拆开，否则集数并进名称。
 *   · CSV 已看单元格「名称 (2025/07)」的括号里是**日期精度**，要还原成 watch_date；
 *     但括号内容也可能只是普通备注（「作品 (剧场版)」），必须按日期形态判别。
 *   · MD 的列表项里名称可能含换行（导出是裸换行，读回来是下一行），
 *     需要把「不以 - 开头」的行拼回上一项，否则名称被截断、后半截变成新番。
 *   · MD 的标签写成行尾的 `标签`，若只是删除就会丢掉 tags 列。
 */

import { getDb } from './index'

const WEEKDAY_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const WEEKDAY_MAP = {
  Monday: '周一', Tuesday: '周二', Wednesday: '周三', Thursday: '周四',
  Friday: '周五', Saturday: '周六', Sunday: '周日',
}
// 表头里的星期写法可能来自导出（Monday）、模板（周一）或手改（星期一）
const WEEKDAY_ALIASES = [
  ['周一', ['周一', '星期一', 'Monday', 'Mon']],
  ['周二', ['周二', '星期二', 'Tuesday', 'Tue']],
  ['周三', ['周三', '星期三', 'Wednesday', 'Wed']],
  ['周四', ['周四', '星期四', 'Thursday', 'Thu']],
  ['周五', ['周五', '星期五', 'Friday', 'Fri']],
  ['周六', ['周六', '星期六', 'Saturday', 'Sat']],
  ['周日', ['周日', '星期日', 'Sunday', 'Sun']],
]

/**
 * 从 JSON 记录里取出可用名称。
 *
 * 为什么不能直接 String(row.name)：
 *   JSON 是用户可手改的，name 完全可能是对象/数组/纯空白。
 *   String({a:1}) → "[object Object]"、['x'] → "x"、'   ' → 一堆空格，
 *   这些都会被当成合法名称写进库，界面上出现一堆无法辨认的条目，
 *   用户既不知道从哪来的、也删不干净。这里统一判定为「无效名称」并计入失败。
 */
function usableName(raw) {
  if (typeof raw === 'string') {
    const s = raw.trim()
    return s ? s : ''
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  return ''
}

/** 统一的导入结果结构 */
function emptyResult() {
  return { imported: 0, failed: 0, errors: [], byTable: { watching: 0, remaining: 0, watched: 0 } }
}

/**
 * 让出主线程：大文件逐条写库会长时间占用 UI 线程，期间点击/重绘全部排队，
 * 用户看到的是「页面假死」。每 YIELD_EVERY 条 await 一次，浏览器有机会喘口气。
 * 与 excelImporter 的 yieldToUI 同义，只是这里没有进度回调（结构化导入是同步汇总）。
 */
const YIELD_EVERY = 200
const yieldToUI = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
  else setTimeout(resolve, 0)
})

/**
 * 结构化导入的体积上限。
 * 与 xlsx 的 20MB 一致：file.text() 是**全量读入内存**再 JSON.parse，
 * 50MB 的 JSON 在低配机器上会直接把页面 OOM 掉（白屏，且用户不知道发生了什么）。
 * 在解析之前就拒绝，比解析到一半崩掉更可控。
 */
const MAX_STRUCTURED_BYTES = 20 * 1024 * 1024

/** 体积预检：只拦「超过上限」，空文件交给各解析器给出各自的既有提示 */
function checkFileSize(file) {
  const size = Number(file?.size)
  if (Number.isFinite(size) && size > MAX_STRUCTURED_BYTES) {
    return `文件超过 20MB（当前 ${(size / 1024 / 1024).toFixed(1)}MB），请拆分后再导入`
  }
  return null
}

/** 去掉 BOM 并统一换行 */
function normalizeText(text) {
  return String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
}

/** 把表头里的星期写法归一成「周一」这种数据层标识；无法识别返回空串 */
function resolveWeekday(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  if (WEEKDAY_CN.includes(text)) return text
  if (WEEKDAY_MAP[text]) return WEEKDAY_MAP[text]
  for (const [cn, aliases] of WEEKDAY_ALIASES) {
    if (aliases.some((alias) => text.includes(alias))) return cn
  }
  return ''
}

/**
 * 判断一段文本是否是「日期」而不是普通备注。
 * 既用于 CSV 的「名称 (2025/07)」括号判别，也用于 MD 的日期提取：
 *   2025 / 2025/07 / 2025/07/15 / 2025/07/15 14:30 / 2014~2017 → 日期
 *   剧场版 / 第一季 / 备注 → 普通文本
 */
function looksLikeDate(v) {
  const s = String(v ?? '').trim()
  if (!s) return false
  // 年份范围（2014~2017）是日期
  if (/^\d{4}\s*~\s*\d{4}$/.test(s)) return true
  // 注意：**纯四位年份不算括号里的日期精度**。
  // 理由：exporter 在「仅有年份」精度时根本不写括号，名称直接是裸名称；
  // 一旦出现括号，那一定是比年份更精确的精度标记。因此「作品X (2025)」里的
  // 括号只可能是作品名的一部分，若判成日期会把名称截断、并覆盖年份列。
  // 所以这里要求括号内容**至少含月份**（2025/07、2025-07、2025/07/15、带时间等）。
  return /^\d{4}[/-]\d{1,2}(?:[/-]\d{1,2})?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s)
}

// ============================================================
// JSON
// ============================================================

/**
 * JSON 回灌：最完整的一条路径。
 * 兼容两种输入：
 *   ① 本应用导出的 { watching, remaining, watched, ... }
 *   ② 裸数组 [{...}]（此时按字段特征猜测表：有 watch_date → 已看；
 *      有 expected_date → 等番；否则 → 追番）
 */
export async function importJson(file) {
  const result = emptyResult()
  const sizeIssue = checkFileSize(file)
  if (sizeIssue) { result.failed = 1; result.errors.push(sizeIssue); return result }
  const raw = normalizeText(await file.text())

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    result.errors.push(`JSON 解析失败：${e.message}`)
    result.failed = 1
    return result
  }

  let groups
  if (Array.isArray(parsed)) {
    groups = { watching: [], remaining: [], watched: [] }
    for (const row of parsed) {
      if (typeof row !== 'object' || row === null) continue
      if (row.watch_date !== undefined) groups.watched.push(row)
      else if (row.expected_date !== undefined) groups.remaining.push(row)
      else groups.watching.push(row)
    }
  } else if (parsed && typeof parsed === 'object') {
    groups = {
      watching: Array.isArray(parsed.watching) ? parsed.watching : [],
      remaining: Array.isArray(parsed.remaining) ? parsed.remaining : [],
      watched: Array.isArray(parsed.watched) ? parsed.watched : [],
    }
  } else {
    result.errors.push({ code: 'JSON_UNRECOGNIZED' })
    result.failed = 1
    return result
  }

  const db = await getDb()

  // 逐条写库并定期让出主线程：20 万条 JSON 原先会一条龙同步跑完，
  // 期间页面完全无响应（实测浏览器里跑了 40 秒以上，用户只能强杀标签页）。
  let processed = 0
  const tick = async () => {
    processed++
    if (processed % YIELD_EVERY === 0) await yieldToUI()
  }

  for (const row of groups.watching) {
    await tick()
    const name = usableName(row?.name)
    if (!name) { result.failed++; result.errors.push({ code: 'JSON_MISSING_NAME_WATCHING' }); continue }
    const res = db.addWatching({
      name,
      day_of_week: String(row.day_of_week ?? ''),
      time_slot: String(row.time_slot ?? ''),
      current_episode: String(row.current_episode ?? '0'),
      total_episodes: String(row.total_episodes ?? ''),
      url: String(row.url ?? ''),
      url_params: String(row.url_params ?? ''),
      notes: String(row.notes ?? ''),
      tags: String(row.tags ?? ''),
      sort_order: Number(row.sort_order ?? 0),
    })
    if (res.success) { result.imported++; result.byTable.watching++ }
    else { result.failed++; result.errors.push(`追番「${row.name}」：${res.error}`) }
  }

  for (const row of groups.remaining) {
    await tick()
    const name = usableName(row?.name)
    if (!name) { result.failed++; result.errors.push({ code: 'JSON_MISSING_NAME_REMAINING' }); continue }
    const res = db.addRemaining({
      name,
      expected_date: String(row.expected_date ?? ''),
      url: String(row.url ?? ''),
      url_params: String(row.url_params ?? ''),
      notes: String(row.notes ?? ''),
      tags: String(row.tags ?? ''),
      sort_order: Number(row.sort_order ?? 0),
    })
    if (res.success) { result.imported++; result.byTable.remaining++ }
    else { result.failed++; result.errors.push(`等番「${row.name}」：${res.error}`) }
  }

  for (const row of groups.watched) {
    await tick()
    const name = usableName(row?.name)
    if (!name) { result.failed++; result.errors.push({ code: 'JSON_MISSING_NAME_WATCHED' }); continue }
    const res = db.addWatched({
      name,
      watch_date: String(row.watch_date ?? ''),
      url: String(row.url ?? ''),
      url_params: String(row.url_params ?? ''),
      notes: String(row.notes ?? ''),
      tags: String(row.tags ?? ''),
      sort_order: Number(row.sort_order ?? 0),
    })
    if (res.success) { result.imported++; result.byTable.watched++ }
    else { result.failed++; result.errors.push(`已看「${row.name}」：${res.error}`) }
  }

  // 三张表都是空的：明确告诉用户「文件里没有数据」，而不是给出一次成功的空导入。
  // 空 JSON 对象 `{}` 是最常见的「选错文件」形态。
  if (result.imported === 0 && result.failed === 0 && result.errors.length === 0) {
    result.failed = 1
    result.errors.push({ code: 'JSON_NO_RECORDS' })
  }

  return result
}

// ============================================================
// CSV
// ============================================================

/**
 * 按 RFC4180 切分 CSV 记录。
 *
 * ⚠ 关键：**不能先按 \n 切行**。exporter 的 csvCell() 会给含逗号/引号/换行的字段
 * 整段加双引号，名称里的换行因此横跨多个物理行。正确顺序是：
 *   逐字符扫描 → 引号内的 \n 属于字段内容 → 引号外的 \n 才结束一条记录。
 * 同时支持 "" 转义（还原成一个双引号）；CRLF 已由 normalizeText 归一成 \n。
 *
 * @returns {string[][]} 每条记录是单元格数组
 */
function parseCsvRecords(text) {
  const records = []
  let cells = []
  let cell = ''
  let inQuotes = false
  let hasContent = false // 当前记录是否已有内容（用来区分「末尾空行」与「文件结束」）

  const endCell = () => { cells.push(cell); cell = '' }
  const endRecord = () => { endCell(); records.push(cells); cells = []; hasContent = false }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = false
      } else {
        cell += ch
      }
      hasContent = true
      continue
    }
    if (ch === '"') { inQuotes = true; hasContent = true; continue }
    if (ch === ',') { endCell(); hasContent = true; continue }
    if (ch === '\n') { endRecord(); continue }
    if (ch === '\r') { continue }          // 孤立 \r 不当作换行
    cell += ch
    hasContent = true
  }
  if (hasContent) endRecord()
  return records
}

/** 记录是否为空行（所有单元格都是空白） */
function isBlankRecord(cells) {
  return cells.every((c) => !String(c ?? '').trim())
}

/**
 * 识别分段标题记录：「# Watching | 追番」。
 *
 * ⚠ 不能只看「以 # 开头」：已看表的年份列是**第一列**，所以一部叫
 *   「# 标题作品」的番剧在 CSV 里就是一条 `# 标题作品 (2025/07)` 的单单元格记录。
 *   若一律当成分段标题，整段已看会被吞掉（实测 imported=0）。
 * 因此判定要求「像表名」：
 *   · 命中已知表名 / 含 `|`（导出格式固定是「# Watching | 追番」）；或
 *   · 结构上处在分段边界（文件开头或紧跟空行）—— 导出时分段标题前必有空行。
 */
function isSectionRecord(cells, { atBoundary }) {
  const first = String(cells[0] ?? '').trim()
  if (!/^#\s/.test(first)) return false
  // 导出时标题是单独的单元格；若被逗号拆开，则要求出现已知表名
  if (cells.length > 1) {
    return /追番|Watching|等番|Remaining|已看|Watched|回忆|历史|等待/i.test(first)
  }
  if (/追番|Watching|等番|Remaining|已看|Watched|回忆|历史|等待/i.test(first)) return true
  if (first.includes('|')) return true
  // 其余形如 "# 其他表" 的未知分段：只在分段边界处认作标题（随后被忽略），
  // 夹在数据行中间的则按数据解析。
  return atBoundary
}

/**
 * CSV 回灌。
 * 导出格式是「# 工作表名」分段，每段一张表：
 *   # Watching | 追番    → 周历表（前 8 行留白，第 9 行表头，A 列 Excel 小数时间，B-H 英文星期）
 *   # Remaining | 等番  → Name,Time,Tags
 *   # Watched | 已看    → 年份横向：第一行是年份列头
 * 这里按分段名分发到各自的解析器。
 */
export async function importCsv(file) {
  const result = emptyResult()
  const sizeIssue = checkFileSize(file)
  if (sizeIssue) { result.failed = 1; result.errors.push(sizeIssue); return result }
  const text = normalizeText(await file.text())
  const records = parseCsvRecords(text)

  const sections = []
  let current = null
  let prevBlank = true // 文件开头也算分段边界
  for (const cells of records) {
    if (isSectionRecord(cells, { atBoundary: prevBlank })) {
      if (current) sections.push(current)
      current = { title: String(cells[0]).replace(/^#\s*/, '').trim(), rows: [] }
      prevBlank = false
      continue
    }
    if (current) current.rows.push(cells)
    prevBlank = isBlankRecord(cells)
  }
  if (current) sections.push(current)

  if (sections.length === 0) {
    result.errors.push({ code: 'CSV_NO_SECTION' })
    result.failed = 1
    return result
  }

  const db = await getDb()

  for (const sec of sections) {
    const title = sec.title
    if (/追番|Watching/i.test(title)) await importCsvWatching(db, sec.rows, result)
    else if (/等番|Remaining/i.test(title)) await importCsvRemaining(db, sec.rows, result)
    else if (/已看|Watched|回忆|历史/i.test(title)) await importCsvWatched(db, sec.rows, result)
  }

  // 有分段但一条都没解析出来：必须报失败。
  // 典型场景是用户手改过文件、把表头行删了或换了列名，此时各解析器都静默 return，
  // 汇总出来是「成功导入 0 条、失败 0 条」——界面会显示为一次成功的空导入，
  // 用户以为数据进来了，其实什么都没发生（最难排查的一类静默失败）。
  if (result.imported === 0 && result.failed === 0 && result.errors.length === 0) {
    const knownTable = sections.some((sec) => /追番|Watching|等番|Remaining|已看|Watched/i.test(sec.title))
    if (knownTable) {
      result.failed = 1
      result.errors.push({ code: 'CSV_SECTION_EMPTY' })
    }
  }

  return result
}

/** 解析 "0.0625" 这类 Excel 小数时间 → "HH:MM" */
function fractionToTime(v) {
  const n = Number.parseFloat(v)
  if (!Number.isFinite(n) || n < 0 || n >= 1) return String(v || '')
  const mins = Math.round(n * 24 * 60)
  const hh = String(Math.floor(mins / 60)).padStart(2, '0')
  const mm = String(mins % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * 拆分追番单元格「名称 集数」→ { name, current_episode }。
 * 与 excelImporter 的 parseWatchingName 约定一致：导出周历格写的是
 * `${name} ${current_episode}`，不拆开的话集数会并进名称、current_episode 归零。
 * 先试 e/E 前缀，再试小数，最后整数 —— 避免 "26.5" 被整数规则截成 "26"。
 */
function splitWatchingCell(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return { name: '', current_episode: '0' }
  // ⚠ 用 [\s\S] 而不是 . ：番名里可以含换行（CSV 引号字段），
  //   而 . 不匹配 \n，否则含换行的番名无法拆分集数。
  const eMatch = text.match(/^([\s\S]+?)\s+[eE](\d+(?:\.\d+)?)$/)
  if (eMatch) return { name: eMatch[1].trim(), current_episode: eMatch[2] }
  const decMatch = text.match(/^([\s\S]+?)\s+(\d+\.\d+)$/)
  if (decMatch) return { name: decMatch[1].trim(), current_episode: decMatch[2] }
  const intMatch = text.match(/^([\s\S]+?)\s+(\d+)$/)
  if (intMatch) return { name: intMatch[1].trim(), current_episode: intMatch[2] }
  return { name: text, current_episode: '0' }
}

async function importCsvWatching(db, rows, result) {
  // 找到含周一到周日（或 Monday..Sunday / 星期一..星期日）的表头行
  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((c) => resolveWeekday(c))) { headerIdx = i; break }
  }
  if (headerIdx < 0) return

  const header = rows[headerIdx]
  // 列 → 星期：按表头文字映射，而不是假定 B..H 的固定顺序
  const colDay = header.map((c) => resolveWeekday(c))

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const cells = rows[r]
    if (isBlankRecord(cells)) continue
    const time = fractionToTime(cells[0] == null ? '' : String(cells[0]).trim())
    // 以数据行的列数为准：表头短于数据行（被手改过）时也不漏列
    const cols = Math.max(header.length, cells.length)
    for (let c = 1; c < cols; c++) {
      const day = colDay[c]
      if (!day) continue
      const raw = String(cells[c] ?? '').trim()
      if (!raw) continue
      const parsed = splitWatchingCell(raw)
      if (!parsed.name) continue
      const res = db.addWatching({
        name: parsed.name,
        day_of_week: day,
        time_slot: time,
        current_episode: parsed.current_episode,
      })
      if (res.success) { result.imported++; result.byTable.watching++ }
      else { result.failed++; result.errors.push(`追番「${parsed.name}」：${res.error}`) }
    }
  }
}

async function importCsvRemaining(db, rows, result) {
  // 找含 Name/名称 的表头行；找不到就退回第一条非空记录
  let headerIdx = rows.findIndex((cells) => cells.some((c) => /name|名称/i.test(String(c ?? ''))))
  if (headerIdx < 0) headerIdx = rows.findIndex((cells) => !isBlankRecord(cells))
  if (headerIdx < 0) return

  const header = rows[headerIdx]
  const nameIdx = Math.max(0, header.findIndex((h) => /name|名称/i.test(String(h ?? ''))))
  const timeIdx = header.findIndex((h) => /time|时间|日期|date/i.test(String(h ?? '')))
  const tagsIdx = header.findIndex((h) => /tag|标签/i.test(String(h ?? '')))

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const cells = rows[r]
    if (isBlankRecord(cells)) continue
    const name = String(cells[nameIdx] ?? '').trim()
    if (!name) continue
    const res = db.addRemaining({
      name,
      expected_date: timeIdx >= 0 ? String(cells[timeIdx] ?? '').trim() : '',
      tags: tagsIdx >= 0 ? String(cells[tagsIdx] ?? '').trim() : '',
    })
    if (res.success) { result.imported++; result.byTable.remaining++ }
    else { result.failed++; result.errors.push(`等番「${name}」：${res.error}`) }
  }
}

/**
 * 拆已看单元格：
 *   "名称 (2025/07/15)" → { name: 名称, date: 2025/07/15 }   ← 括号里是日期精度
 *   "名称 (剧场版)"      → { name: 名称 (剧场版), date: '' }  ← 括号是名称的一部分
 *   "名称"              → { name: 名称, date: '' }
 * 只认**行尾**的最后一组括号，因此「作品B (剧场版) (2025/07)」也能正确还原。
 */
function splitWatchedCell(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return { name: '', date: '' }
  // [\s\S] 而非 . ：名称里可能含换行（CSV 引号字段），. 不匹配 \n 会拆不掉日期
  const m = text.match(/^([\s\S]+?[^\s])\s*[（(]([^()（）]*)[)）]\s*$/)
  if (m && looksLikeDate(m[2])) return { name: m[1].trim(), date: String(m[2]).trim() }
  return { name: text, date: '' }
}

async function importCsvWatched(db, rows, result) {
  if (rows.length === 0) return

  // 年份列头：形如 2025 / 2026 / 2014~2017 / 未归类
  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i]
    if (cells.some((h) => /^\d{4}/.test(String(h ?? '').trim()) || /未归类|unclassified/i.test(String(h ?? '')))) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) return

  const header = rows[headerIdx]
  const yearCols = header.map((h, i) => ({ i, label: String(h ?? '').trim() }))
    .filter((c) => /^\d{4}/.test(c.label) || /未归类|unclassified/i.test(c.label))
  if (yearCols.length === 0) return

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const cells = rows[r]
    if (isBlankRecord(cells)) continue
    for (const col of yearCols) {
      const cell = String(cells[col.i] ?? '').trim()
      if (!cell) continue
      const parsed = splitWatchedCell(cell)
      // 「未归类」列本身代表「没有日期」，必须回灌成空日期，
      // 否则会把字面量「未归类」当 watch_date 写进库
      const isYear = /^\d{4}/.test(col.label)
      const date = parsed.date || (isYear ? col.label : '')
      const res = db.addWatched({ name: parsed.name, watch_date: date })
      if (res.success) { result.imported++; result.byTable.watched++ }
      else { result.failed++; result.errors.push(`已看「${parsed.name}」：${res.error}`) }
    }
  }
}

// ============================================================
// Markdown
// ============================================================

/**
 * MD 里的日期形态：
 *   2025 · 2025/07 · 2025/07/15 · 2025/07/15 14:30 · 2014~2017
 * 区间放前面，避免 "2014~2017" 被第一条规则只吃到 "2014"。
 */
const MD_DATE_SRC = String.raw`\d{4}\s*~\s*\d{4}|\d{4}(?:[/-]\d{1,2}){0,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?`
const MD_DATE_PREFIX = new RegExp(String.raw`^(${MD_DATE_SRC})\s*·\s*`)
const MD_DATE_SUFFIX = new RegExp(String.raw`\s*·\s*(${MD_DATE_SRC})\s*$`)
const MD_EPISODE_SUFFIX = /\s*·\s*第\s*([0-9.]+)\s*集\s*$/

/**
 * 从行尾反复摘掉 `标签`，返回正文与逗号拼接的标签串。
 * 只认「空白 + 成对反引号」的行尾片段，所以名称中间/结尾的 `·` 不会错位：
 *   "名称 · 第 3 集 `热血` `原创`" → text "名称 · 第 3 集", tags "热血,原创"
 */
function stripMdTags(body) {
  let rest = String(body ?? '').trim()
  const tags = []
  // [\s\S] 而非 . ：名称可含换行（导出的软换行），行尾标签在换行之后
  const re = /^([\s\S]*[^\s])\s+`([^`]*)`$/
  while (true) {
    const m = rest.match(re)
    if (!m) break
    const tag = m[2].trim()
    rest = m[1]
    if (tag) tags.unshift(tag)
  }
  return { text: rest.trim(), tags: tags.join(',') }
}

/**
 * Markdown 回灌：信息量最少，只提取「名称」与可推断的日期/星期/标签。
 * 结构依导出的三段：
 *   ## 正在追番 / ## 等待更新 / ## 已看历史
 * 其下 ### 是分组（星期 / 年份 / 未排期 / 未归类），列表项以 "- " 开头。
 */
export async function importMd(file) {
  const result = emptyResult()
  const sizeIssue = checkFileSize(file)
  if (sizeIssue) { result.failed = 1; result.errors.push(sizeIssue); return result }
  const text = normalizeText(await file.text())
  const db = await getDb()

  // 空文件 / 没有任何「## 章节」标记：明确报失败，
  // 而不是「成功导入 0 条」——静默成功会让用户以为文件没问题。
  if (!text.trim()) {
    result.failed = 1
    result.errors.push({ code: 'FILE_EMPTY' })
    return result
  }
  if (!text.split('\n').some((l) => /^##\s/.test(l.trim())) && !/^##\s/.test(text.trim())) {
    result.failed = 1
    result.errors.push({ code: 'MD_NO_SECTION' })
    return result
  }

  // 1) 把物理行合成逻辑行：名称里的换行在导出时是裸换行，
  //    因此「不以 - 开头」的普通行要拼回上一条列表项（用 \n 还原原始名称）。
  const lines = []
  let lastIsItem = false
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) { lines.push(''); lastIsItem = false; continue }
    if (/^#{1,6}\s/.test(line) || line === '---' || line.startsWith('_')) {
      lines.push(line)
      lastIsItem = false
      continue
    }
    if (line.startsWith('- ')) { lines.push(line); lastIsItem = true; continue }
    if (lastIsItem) {
      lines[lines.length - 1] += '\n' + line
      continue
    }
    lines.push(line)
  }

  let section = ''      // watching / remaining / watched
  let group = ''        // 星期 / 年份 / 未排期 / 未归类

  for (const line of lines) {
    if (!line) continue
    if (/^##\s/.test(line)) {
      if (/追番|Watching/i.test(line)) section = 'watching'
      else if (/等待更新|等番|Remaining/i.test(line)) section = 'remaining'
      else if (/已看|Watched|历史/i.test(line)) section = 'watched'
      else section = ''
      group = ''
      continue
    }
    if (/^###\s/.test(line)) {
      group = line.replace(/^###\s+/, '').trim()
      continue
    }
    if (!section || line.startsWith('_') || line === '---') continue
    if (!line.startsWith('- ')) continue

    // 先剥行尾标签，再剥行尾集数/日期，最后剥行首时间
    const { text: body, tags } = stripMdTags(line.slice(2).trim())
    if (!body) continue

    if (section === 'watching') {
      // 形如 "20:30 名称 · 第 3 集 `标签`"
      let time = ''
      let head = body
      const tm = head.match(/^(\d{1,2}:\d{2})\s+/)
      if (tm) { time = tm[1]; head = head.slice(tm[0].length) }
      let ep = ''
      const em = head.match(MD_EPISODE_SUFFIX)
      if (em) { ep = em[1]; head = head.slice(0, em.index) }
      const day = WEEKDAY_CN.includes(group) ? group : ''
      const name = head.trim()
      if (!name) continue
      const res = db.addWatching({ name, day_of_week: day, time_slot: time, current_episode: ep || '0', tags })
      if (res.success) { result.imported++; result.byTable.watching++ }
      else { result.failed++; result.errors.push(`追番「${name}」：${res.error}`) }
    } else if (section === 'remaining') {
      // 形如 "2026/07/15 14:30 · 名称"（也可能只有年份 "2026 · 名称"）
      let date = ''
      let head = body
      const dm = head.match(MD_DATE_PREFIX)
      if (dm) { date = dm[1]; head = head.slice(dm[0].length) }
      const name = head.trim()
      if (!name) continue
      const res = db.addRemaining({ name, expected_date: date, tags })
      if (res.success) { result.imported++; result.byTable.remaining++ }
      else { result.failed++; result.errors.push(`等番「${name}」：${res.error}`) }
    } else if (section === 'watched') {
      // 形如 "名称 · 2025/07"；group 是年份（可能只有年份，没有更细的日期）
      let date = /^\d{4}/.test(group) ? group : ''
      let head = body
      const dm = head.match(MD_DATE_SUFFIX)
      if (dm) { date = dm[1]; head = head.slice(0, dm.index) }
      const name = head.trim()
      if (!name) continue
      const res = db.addWatched({ name, watch_date: date, tags })
      if (res.success) { result.imported++; result.byTable.watched++ }
      else { result.failed++; result.errors.push(`已看「${name}」：${res.error}`) }
    }
  }

  // 有章节但没有可识别的列表项：同样不能报「成功的空导入」。
  // 例：章节标题被翻译/改写成了导出器不认的写法，此时 section 为空，整段被跳过。
  if (result.imported === 0 && result.failed === 0 && result.errors.length === 0) {
    result.failed = 1
    result.errors.push({ code: 'MD_SECTION_EMPTY' })
  }

  return result
}

// ============================================================
// 统一入口
// ============================================================

/**
 * 按扩展名/指定格式导入。
 * @param {File} file
 * @param {'csv'|'json'|'md'} kind
 */
export async function importStructured(file, kind) {
  switch (kind) {
    case 'json': return importJson(file)
    case 'csv': return importCsv(file)
    case 'md': return importMd(file)
    default: {
      const r = emptyResult()
      r.errors.push(`不支持的格式：${kind}`)
      r.failed = 1
      return r
    }
  }
}
