/**
 * 临时审计③：语言包里的「跨语言不一致」细查
 *  - en 包里出现 CJK 标点（：（）！？，；、）→ 英文页会显示中文标点
 *  - ja 包里出现中文标点（，；（）！？、）→ 日文应用日式标点（、。（）！？）
 *  - ja 里疑似中文词汇（不是日语常用写法）
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { default: zh } = await import('../../src/locales/zh.js')
const { default: en } = await import('../../src/locales/en.js')
const { default: ja } = await import('../../src/locales/ja.js')

const HAN = /[\u4e00-\u9fff]/
const CN_PUNCT = /[\u3000-\u303f\uff01-\uff60]/ // 全角标点集合（含中文逗号、句号、括号）

// 英文包：任何汉字或中文标点都算问题（lang.* 例外）
const enBad = []
for (const [k, v] of Object.entries(en)) {
  if (typeof v !== 'string') continue
  if (k.startsWith('lang.')) continue
  if (HAN.test(v) || CN_PUNCT.test(v)) enBad.push({ k, v })
}

// 日文包：中文专用标点（英文逗号式「，」、中文双引号「」在日语里其实是正常引号）
// 日语正常：、（）。「」！？：；～ 等。中文特征：，；：（）！
const JA_BAD_PUNCT = /[，；：（）！？]/  // 这些在日语里应为 、；（：）！？ 但全角冒号：在日语里其实也用…
const jaPunct = []
for (const [k, v] of Object.entries(ja)) {
  if (typeof v !== 'string') continue
  if (k.startsWith('lang.')) continue
  const bad = v.match(JA_BAD_PUNCT)
  if (bad) jaPunct.push({ k, v, chars: [...new Set(bad)].join('') })
}

// 日文包里与中文完全相同的条目（人工复核清单）
const sameZh = []
for (const [k, v] of Object.entries(ja)) {
  if (k.startsWith('lang.')) continue
  if (v === zh[k] && HAN.test(v)) sameZh.push({ k, v })
}

const lines = []
lines.push('===== 语言包细查 =====')
lines.push('')
lines.push(`--- en 包含汉字/中文标点 (${enBad.length}) ---`)
for (const x of enBad) lines.push(`  ${x.k} = ${JSON.stringify(x.v)}`)
lines.push('')
lines.push(`--- ja 包含疑似中文标点 (${jaPunct.length}) ---`)
for (const x of jaPunct) lines.push(`  ${x.k} [${x.chars}] = ${JSON.stringify(x.v)}`)
lines.push('')
lines.push(`--- ja 与 zh 完全相同的含汉字条目 (${sameZh.length}) ---`)
for (const x of sameZh) lines.push(`  ${x.k} = ${JSON.stringify(x.v)}`)

writeFileSync(fileURLToPath(new URL('audit-i18n-locales.txt', import.meta.url)), lines.join('\n'), 'utf8')
console.log(lines.join('\n'))
