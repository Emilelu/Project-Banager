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
    const intPart = str.substring(0, dotIndex)
    const decStr = str.substring(dotIndex + 1)
    const newVal = String(parseInt(decStr, 10) + 1)
    return intPart + '.' + (hasPadding(decStr) ? padToWidth(newVal, decStr.length) : newVal)
  }
  const newVal = String((parseInt(str, 10) || 0) + 1)
  return hasPadding(str) ? padToWidth(newVal, str.length) : newVal
}

export function smartDecrement(current) {
  const str = String(current ?? '').trim() || '0'
  if (str.includes('.')) {
    const dotIndex = str.indexOf('.')
    const intPart = str.substring(0, dotIndex)
    const decStr = str.substring(dotIndex + 1)
    const decVal = parseInt(decStr, 10)
    if (isNaN(decVal) || decVal <= 0) return '0'
    const newVal = String(decVal - 1)
    return intPart + '.' + (hasPadding(decStr) ? padToWidth(newVal, decStr.length) : newVal)
  }
  const intVal = parseInt(str, 10) || 0
  if (intVal <= 0) return '0'
  const newVal = String(intVal - 1)
  return hasPadding(str) ? padToWidth(newVal, str.length) : newVal
}

// 规范化用户输入：保留补零（01）与小数（26.19），其余非法输入归 0
export function normalizeEpisodeInput(val) {
  const s = String(val ?? '').trim()
  if (!s) return '0'
  if (/^\d+(\.\d+)?$/.test(s)) return s
  const n = parseFloat(s)
  return isNaN(n) ? '0' : String(n)
}

// 拼接条目的动态链接：url + url_params，{集数} 按存储原样替换（存 01 输出 01）
export function buildItemUrl(item) {
  if (!item?.url) return ''
  let url = item.url
  if (item.url_params) {
    const params = item.url_params.replace(/\{集数\}/g, item.current_episode || 0)
    url += (url.includes('?') ? '&' : '?') + params
  }
  return url
}
