/**
 * 日期选择器工具
 * 统一日期格式为 YYYY/MM/DD HH:mm
 * 支持多种输入格式的解析和校验
 */

// 将 type="date" 的 YYYY-MM-DD 格式转为 YYYY/MM/DD
export function normalizeDate(value) {
  if (!value) return ''
  let v = String(value).trim().replace(/-/g, '/')
  return v
}

// 校验日期格式是否合规
export function validateDate(value) {
  if (!value || !value.trim()) return { valid: false, error: '请输入日期' }
  const v = value.trim()

  if (/^\d{4}\s*~\s*\d{4}$/.test(v)) {
    const [start, end] = v.split('~').map(s => parseInt(s.trim()))
    if (start > end) return { valid: false, error: '起始年份不能大于结束年份' }
    if (start < 1900 || end > 2100) return { valid: false, error: '年份范围应在 1900~2100 之间' }
    return { valid: true, normalized: v.replace(/\s*/g, '') }
  }

  if (/^\d{4}$/.test(v)) {
    const year = parseInt(v)
    if (year < 1900 || year > 2100) return { valid: false, error: '年份应在 1900~2100 之间' }
    return { valid: true, normalized: v }
  }

  if (/^\d{4}\/\d{1,2}$/.test(v)) {
    const [y, m] = v.split('/').map(Number)
    if (y < 1900 || y > 2100) return { valid: false, error: '年份应在 1900~2100 之间' }
    if (m < 1 || m > 12) return { valid: false, error: '月份应在 1~12 之间' }
    return { valid: true, normalized: `${y}/${String(m).padStart(2, '0')}` }
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(v)) {
    const [y, m, d] = v.split('/').map(Number)
    if (y < 1900 || y > 2100) return { valid: false, error: '年份应在 1900~2100 之间' }
    if (m < 1 || m > 12) return { valid: false, error: '月份应在 1~12 之间' }
    const maxDay = new Date(y, m, 0).getDate()
    if (d < 1 || d > maxDay) return { valid: false, error: `该月天数应在 1~${maxDay} 之间` }
    return { valid: true, normalized: `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}` }
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}$/.test(v)) {
    const [datePart, timePart] = v.split(/\s+/)
    const [y, m, d] = datePart.split('/').map(Number)
    const [h, min] = timePart.split(':').map(Number)
    if (y < 1900 || y > 2100) return { valid: false, error: '年份应在 1900~2100 之间' }
    if (m < 1 || m > 12) return { valid: false, error: '月份应在 1~12 之间' }
    const maxDay = new Date(y, m, 0).getDate()
    if (d < 1 || d > maxDay) return { valid: false, error: `该月天数应在 1~${maxDay} 之间` }
    if (h < 0 || h > 23) return { valid: false, error: '小时应在 0~23 之间' }
    if (min < 0 || min > 59) return { valid: false, error: '分钟应在 0~59 之间' }
    return { valid: true, normalized: `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` }
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2}$/.test(v)) {
    const [datePart, timePart] = v.split(/\s+/)
    const [y, m, d] = datePart.split('/').map(Number)
    const [h, min, sec] = timePart.split(':').map(Number)
    if (y < 1900 || y > 2100) return { valid: false, error: '年份应在 1900~2100 之间' }
    if (m < 1 || m > 12) return { valid: false, error: '月份应在 1~12 之间' }
    const maxDay = new Date(y, m, 0).getDate()
    if (d < 1 || d > maxDay) return { valid: false, error: `该月天数应在 1~${maxDay} 之间` }
    if (h < 0 || h > 23) return { valid: false, error: '小时应在 0~23 之间' }
    if (min < 0 || min > 59) return { valid: false, error: '分钟应在 0~59 之间' }
    if (sec < 0 || sec > 59) return { valid: false, error: '秒数应在 0~59 之间' }
    return { valid: true, normalized: `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}` }
  }

  return { valid: false, error: '格式不正确，支持: 2025、2025/07、2025/07/15、2025/07/15 14:30、2014~2017' }
}

export function extractYear(watchDate) {
  if (!watchDate) return null
  const v = String(watchDate).trim()
  if (/^\d{4}\s*~/.test(v)) return null
  const yearMatch = v.match(/^(\d{4})/)
  if (yearMatch) return yearMatch[1]
  return null
}

export function extractAllYears(watchDate) {
  if (!watchDate) return []
  const v = String(watchDate).trim()
  const rangeMatch = v.match(/^(\d{4})\s*~\s*(\d{4})$/)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1])
    const end = parseInt(rangeMatch[2])
    const years = []
    for (let y = start; y <= end; y++) years.push(String(y))
    return years
  }
  const year = extractYear(v)
  return year ? [year] : []
}

export function dateInputToFormat(dateValue) {
  if (!dateValue) return ''
  return String(dateValue).replace(/-/g, '/')
}

export function formatToDateInput(formattedValue) {
  if (!formattedValue) return ''
  const datePart = formattedValue.split(' ')[0]
  return datePart.replace(/\//g, '-')
}
