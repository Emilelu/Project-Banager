/**
 * 临时自检：把所有 .vue 的 <template> 区段抽出来，落盘供 grep 复核；
 * 同时统计文本节点 / 属性数量，验证审计脚本的提取逻辑没有漏。
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.vue')) files.push(p)
  }
}
walk(join(ROOT, 'src'))

const CJK = /[\u4e00-\u9fff]/
const out = []
let textNodes = 0
let cjkTextNodes = 0
let attrs = 0
let cjkAttrs = 0

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const open = src.search(/<template[^>]*>/)
  const openEnd = src.indexOf('>', open) + 1
  const close = src.lastIndexOf('</template>')
  const tpl = src.slice(openEnd, close)
  const masked = tpl.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
  const rel = relative(ROOT, f).replace(/\\/g, '/')
  out.push(`\n===== ${rel} =====`)
  // 逐行输出“去掉标签后的文本”以便 grep
  let i = 0
  let text = ''
  while (i < masked.length) {
    if (masked[i] === '<') {
      if (text.trim()) {
        textNodes++
        if (CJK.test(text)) {
          cjkTextNodes++
          out.push(`  TEXT-CJK: ${JSON.stringify(text.trim().replace(/\\s+/g, ' ').slice(0, 180))}`)
        }
        text = ''
      }
      const e = masked.indexOf('>', i)
      if (e < -1) break
      i = e === -1 ? masked.length : e + 1
    } else {
      text += masked[i]
      i++
    }
  }
  if (text.trim()) {
    textNodes++
    if (CJK.test(text)) {
      cjkTextNodes++
      out.push(`  TEXT-CJK(tail): ${JSON.stringify(text.trim().replace(/\\s+/g, ' ').slice(0, 180))}`)
    }
  }
  const attrRe = /([:@#a-zA-Z_][a-zA-Z0-9_:.\-\[\]]*)\s*=\s*"([^"]*)"/g
  let m
  while ((m = attrRe.exec(masked)) !== null) {
    attrs++
    if (CJK.test(m[2])) {
      cjkAttrs++
      out.push(`  ATTR-CJK ${m[1]}=${JSON.stringify(m[2].slice(0, 180))}`)
    }
  }
}
out.unshift(`vue files=${files.length} textNodes=${textNodes} cjkTextNodes=${cjkTextNodes} attrs=${attrs} cjkAttrs=${cjkAttrs}`)
writeFileSync(join(ROOT, 'tests/e2e/audit-templates.txt'), out.join('\n'), 'utf8')
console.log(out[0])
