/**
 * 集数处理工具
 * 集数以字符串存储，支持小数与补零格式：
 * - 小数部分当成独立整数增减，不进位：26.19→26.20，26.99→26.100
 * - 补零格式增减时保持位数：01→02，09→10，009→010；26.09→26.10
 * - URL 中的 {集数} 按存储的原样替换（存 01 就输出 01）
 */

// 判断字符串是否带补零前导 0（"01"、"09"，不含 "0" 本身）
const hasPadding = (numStr) => /^0\d/.test(numStr)

const padToWidth = (numStr, width) => numStr.padStart(width, '0')

export function smartIncrement(current) {
  const str = String(current ?? '').trim() || '0'
  if (str.includes('.')) {
    const dotIndex = str.indexOf('.')
    const intPart = str.substring(0, dotIndex) || '0'
    const decStr = str.substring(dotIndex + 1)
    if (!/^\d*$/.test(decStr)) return str
    const newVal = String((parseInt(decStr || '0', 10) || 0) + 1)
    return intPart + '.' + (hasPadding(decStr) ? padToWidth(newVal, decStr.length) : newVal)
  }
  const newVal = String((parseInt(str, 10) || 0) + 1)
  return hasPadding(str) ? padToWidth(newVal, str.length) : newVal
}

export function smartDecrement(current) {
  const str = String(current ?? '').trim() || '0'
  if (str.includes('.')) {
    const dotIndex = str.indexOf('.')
    const intPart = str.substring(0, dotIndex) || '0'
    const decStr = str.substring(dotIndex + 1)
    const decVal = parseInt(decStr, 10)
    if (isNaN(decVal) || decVal <= 0) {
      const width = Math.max(decStr.length, 1)
      return intPart + '.' + padToWidth('0', width)
    }
    // 小数减一后若位数变少，保持原宽度（26.10 → 26.09，不是 26.9）
    const newVal = padToWidth(String(decVal - 1), decStr.length)
    return intPart + '.' + newVal
  }
  const intVal = parseInt(str, 10)
  if (isNaN(intVal) || intVal <= 0) return hasPadding(str) ? padToWidth('0', str.length) : '0'
  const newVal = String(intVal - 1)
  return hasPadding(str) ? padToWidth(newVal, str.length) : newVal
}

// 规范化用户输入：保留补零（01）与小数（26.19），其余非法输入归 0
export function normalizeEpisodeInput(val) {
  const s = String(val ?? '').trim()
  if (!s) return '0'
  if (/^\d+$/.test(s)) return s
  const dotted = s.match(/^(\d*)\.(\d*)$/)
  if (dotted) {
    const intPart = dotted[1] || '0'
    return dotted[2] === '' ? intPart : `${intPart}.${dotted[2]}`
  }
  // 科学计数法（1e3 / 1e-7）按数值展开成十进制，避免伪数字原样入库
  if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(s)) {
    const n = Number(s)
    if (!Number.isFinite(n) || n < 0) return '0'
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6)))
  }
  return '0'
}

/**
 * 把「可读的动态参数」编码成合法的 URL 查询串。
 *
 * 背景：早期 applyTemplate 在**生成时**就 encodeURIComponent，把中文直接编码进数据库，
 * 用户再打开编辑弹窗看到的是 `keyword=%E4%BE%A6%E5%86%96...`，完全没法编辑。
 * 正确做法是「存可读文字，打开链接时才编码」——
 * 这里负责那一步：按 `&` 拆段、按第一个 `=` 拆键值，只对**值**做编码，
 * 保留 key、`=`、`&` 等结构字符；已经是合法转义的序列（%XX）不重复编码。
 */
export function encodeUrlParams(params) {
  if (!params) return ''
  return String(params)
    .replace(/^[?&]+/, '')
    .replace(/[?&]+$/, '')
    .split('&')
    .filter(Boolean)
    .map((seg) => {
      const eq = seg.indexOf('=')
      if (eq < 0) return seg
      const key = seg.slice(0, eq)
      const rawVal = seg.slice(eq + 1)
      // 已是合法 %XX 转义的不再二次编码（避免 %E4 → %25E4）
      const val = /%[0-9A-Fa-f]{2}/.test(rawVal) && !/[^\x00-\x7F]/.test(rawVal)
        ? rawVal
        : encodeURI(rawVal).replace(/#/g, '%23').replace(/&/g, '%26').replace(/=/g, '%3D')
      return `${key}=${val}`
    })
    .join('&')
}

// 拼接条目的动态链接：url + url_params，{集数} 按存储原样替换（存 01 输出 01）
// 参数里若含中文/空格等，此时才编码 —— 数据库里始终保留可读文字
export function buildItemUrl(item) {
  if (!item?.url) return ''
  let url = String(item.url).replace(/[?&]+$/, '')
  if (item.url_params) {
    const episode = item.current_episode == null || item.current_episode === '' ? '0' : String(item.current_episode)
    const substituted = String(item.url_params).replace(/\{集数\}/g, episode)
    const params = encodeUrlParams(substituted)
    if (params) url += (url.includes('?') ? '&' : '?') + params
  }
  return url
}

export function defaultBgmUrl(item) {
  return 'https://bgm.tv/subject_search/' + encodeURIComponent(item?.name || '')
}

export function openExternal(url) {
  if (!url) return
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (opened) opened.opener = null
}
