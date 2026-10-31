/**
 * 临时 i18n 审计脚本（用后删除）
 *
 * 用法：node tests/e2e/audit-i18n-scan.mjs
 *
 * 覆盖 4 类来源：
 *   A. .vue <template> 文本节点里的 CJK（排除注释、mustache 表达式）
 *   B. .vue <template> 属性值里的 CJK（静态属性与 :title/:aria-label/:placeholder/:alt 等绑定值）
 *   C. .js / <script> 里真实字符串字面量中的 CJK（词法扫描：跳过注释），并按上下文分类
 *      - js-console-log        console.* 里的中文（不进 UI，仅记录）
 *      - js-i18n-key-cjk       t()/tt() 的 key 里含中文（可疑）
 *      - js-ui-candidate       其他字面量：可能显示给用户
 *   D. 语言包：key 差异 / 占位符差异 / 英文包 CJK / 与他语言完全相同的值（疑似漏翻）
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
// 汉字 + CJK 标点（、。「」等）+ 全角 ASCII 变体（：（）！？，；／ 等）
// 注意：U+FF61–U+FF9F（半角片假名）属于日文，不算；U+2026（…）各语言通用，不算。
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff01-\uff60]/
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/')

const problems = []
const logOnly = []
const info = []

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(name)) continue
      walk(p, out)
    } else out.push(p)
  }
  return out
}

// ===========================================================================
// 通用小工具
// ===========================================================================
function indexLines(src) {
  const starts = [0]
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1)
  return (idx) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= idx) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

// ===========================================================================
// A + B: .vue 模板
// ===========================================================================
function scanVueTemplate(file, src, lineOf) {
  const open = src.search(/<template[^>]*>/)
  if (open < 0) return
  const openEnd = src.indexOf('>', open) + 1
  // 找到收尾的 </template>（模板里不会嵌套 template 标签）
  const close = src.lastIndexOf('</template>')
  if (close < openEnd) return
  const tpl = src.slice(openEnd, close)

  // 屏蔽 HTML 注释（保留长度与换行）
  const masked = tpl.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))

  let i = 0
  let textStart = 0
  while (i < masked.length) {
    if (masked[i] === '<') {
      // ---- 文本节点 [textStart, i) ----
      const raw = masked.slice(textStart, i)
      if (CJK.test(raw)) {
        // 去掉 mustache 插值后仍有中文才算
        const stripped = raw.replace(/\{\{[\s\S]*?\}\}/g, ' ')
        if (CJK.test(stripped)) {
          problems.push({
            kind: 'template-text',
            file: rel(file),
            line: lineOf(openEnd + textStart),
            text: raw.trim().replace(/\s+/g, ' ').slice(0, 200),
          })
        }
      }
      // ---- 解析标签，收集属性 ----
      const tagEnd = findTagEnd(masked, i)
      if (tagEnd < 0) break
      const tagText = masked.slice(i, tagEnd + 1)
      scanAttrs(file, tagText, masked.slice(0, i).split('\n').length - 1, openEnd, i, lineOf)
      i = tagEnd + 1
      textStart = i
    } else {
      i++
    }
  }
  // 尾部文本
  const tail = masked.slice(textStart)
  if (CJK.test(tail) && CJK.test(tail.replace(/\{\{[\s\S]*?\}\}/g, ' '))) {
    problems.push({
      kind: 'template-text',
      file: rel(file),
      line: lineOf(openEnd + textStart),
      text: tail.trim().replace(/\s+/g, ' ').slice(0, 200),
    })
  }
}

/** 从 '<' 开始找到标签结束的 '>'（跳过引号内内容） */
function findTagEnd(s, start) {
  let i = start + 1
  let quote = null
  while (i < s.length) {
    const c = s[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '>') {
      return i
    }
    i++
  }
  return -1
}

function scanAttrs(file, tagText, lineBase, openEnd, tagOffset, lineOf) {
  const attrRe = /([:@#a-zA-Z_][a-zA-Z0-9_:.\-\[\]]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m
  while ((m = attrRe.exec(tagText)) !== null) {
    const attr = m[1]
    const value = m[2] ?? m[3] ?? ''
    if (!CJK.test(value)) continue
    const offset = tagText.indexOf(m[0]) + m[0].indexOf(m[2] ?? m[3] ?? '')
    problems.push({
      kind: 'template-attr',
      file: rel(file),
      line: lineOf(openEnd + tagOffset + offset),
      attr,
      text: value.trim().replace(/\s+/g, ' ').slice(0, 200),
    })
    break // 同一标签只取第一个匹配，避免 indexOf 复用在重复文本上跳动
  }
  // 重新做一遍（上面 break 只用于避免 offset 计算错误，正常遍历所有属性）
  attrRe.lastIndex = 0
  while ((m = attrRe.exec(tagText)) !== null) {
    const attr = m[1]
    const value = m[2] ?? m[3] ?? ''
    if (!CJK.test(value)) continue
    // 用 exec 的 index（相对 tagText 起点）计算真实偏移，跳过上一轮已报告的第一个
    const offset = m.index + m[0].indexOf(value)
    problems.push({
      kind: 'template-attr',
      file: rel(file),
      line: lineOf(openEnd + tagOffset + offset),
      attr,
      text: value.trim().replace(/\s+/g, ' ').slice(0, 200),
    })
  }
}

// ===========================================================================
// C: JS 词法扫描（字符串字面量 / 注释区分）
// ===========================================================================
function lexJs(src) {
  const out = [] // { kind: 'string'|'comment'|'code', start, end, value }
  let i = 0
  let prevSignificant = ''
  const n = src.length
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === '/' && c2 === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? n : end
      out.push({ kind: 'comment', start: i, end: stop })
      i = stop
      continue
    }
    if (c === '/' && c2 === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? n : end + 2
      out.push({ kind: 'comment', start: i, end: stop })
      i = stop
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      let j = i + 1
      let val = ''
      while (j < n) {
        const d = src[j]
        if (d === '\\') {
          val += d + (src[j + 1] ?? '')
          j += 2
          continue
        }
        if (d === quote) break
        val += d
        j++
      }
      out.push({ kind: 'string', start: i, end: j + 1, value: val, quote })
      i = j + 1
      prevSignificant = 'string'
      continue
    }
    if (!/\s/.test(c)) prevSignificant = c
    i++
  }
  return out
}

function enclosingCall(src, start) {
  // 粗略判断字符串外层的调用名：向前找最近的标识符 + '('
  const before = src.slice(Math.max(0, start - 200), start)
  const m = before.match(/\b(I18n\w*|console\.\w+|t|tt)\s*\(\s*(?:[^()]*)$/)
  if (m) return m[1]
  const con = before.match(/console\.\w+[\s\S]*$/)
  if (con && !/[)\]]/.test(con[0])) return con[0].slice(0, 20)
  return null
}

function scanJs(file, src, lineOf) {
  const tokens = lexJs(src)
  const strTokens = tokens.filter((t) => t.kind === 'string')
  for (const tok of strTokens) {
    if (!CJK.test(tok.value)) continue
    const line = lineOf(tok.start)
    const lineText = src.slice(src.lastIndexOf('\n', tok.start) + 1, src.indexOf('\n', tok.start) === -1 ? src.length : src.indexOf('\n', tok.start))
    const lineBefore = src.slice(src.lastIndexOf('\n', tok.start) + 1, tok.start)
    let kind = 'js-ui-candidate'
    if (/console\.(log|warn|error|info|debug|trace)\s*\(/.test(lineBefore)) kind = 'js-console-log'
    else if (/[$A-Za-z_][$\w]*\s*\(\s*$/.test(lineBefore)) {
      const fn = (lineBefore.match(/[$A-Za-z_][$\w]*\s*\(\s*$/) || [''])[0].replace(/\s*\(\s*$/, '')
      if (fn === 't' || fn === 'tt') kind = 'js-i18n-key-cjk'
    }
    const rec = {
      kind,
      file: rel(file),
      line,
      value: tok.value.replace(/\s+/g, ' ').slice(0, 200),
      ctx: lineText.trim().slice(0, 220),
    }
    if (kind === 'js-console-log') logOnly.push(rec)
    else problems.push(rec)
  }
}

// ===========================================================================
// D: 语言包
// ===========================================================================
async function scanLocales() {
  const [{ default: zh }, { default: en }, { default: ja }] = await Promise.all([
    import('../../src/locales/zh.js'),
    import('../../src/locales/en.js'),
    import('../../src/locales/ja.js'),
  ])
  const dicts = { zh, en, ja }
  const zhKeys = Object.keys(zh)
  info.push(`key counts zh=${zhKeys.length} en=${Object.keys(en).length} ja=${Object.keys(ja).length}`)

  const push = (kind, context, strings) =>
    problems.push({ kind, file: 'src/locales', line: 0, context, strings })

  for (const [label, list] of [
    ['zh→en 缺失', zhKeys.filter((k) => !(k in en))],
    ['en 多出', Object.keys(en).filter((k) => !(k in zh))],
    ['zh→ja 缺失', zhKeys.filter((k) => !(k in ja))],
    ['ja 多出', Object.keys(ja).filter((k) => !(k in zh))],
  ]) {
    if (list.length) push('locale-key-diff', label, list)
  }

  const ph = (t) => (String(t ?? '').match(/\{(\w+)\}/g) || []).join('|')
  for (const k of zhKeys) {
    for (const loc of ['en', 'ja']) {
      const v = dicts[loc][k]
      if (typeof v !== 'string') {
        if (v !== undefined) push('locale-type', `${loc}.${k}`, [String(v)])
        continue
      }
      if (ph(v) !== ph(zh[k])) push('locale-placeholder', `${loc}.${k}`, [`zh:[${ph(zh[k])}]`, `${loc}:[${ph(v)}]`])
      if (!v.trim()) push('locale-empty', `${loc}.${k}`, [])
    }
  }

  for (const k of Object.keys(en)) {
    if (CJK.test(en[k]) && !k.startsWith('lang.')) push('en-cjk', k, [en[k]])
  }

  // 与源语言完全相同的值（疑似漏翻；纯符号/纯数字不算）
  for (const k of zhKeys) {
    const z = zh[k]
    if (typeof z !== 'string' || !/\p{L}/u.test(z)) continue
    for (const loc of ['en', 'ja']) {
      if (dicts[loc][k] === z) info.push(`same-as-zh ${loc}.${k} = ${JSON.stringify(z)}`)
    }
  }
  // en 与 ja 完全相同（可能有语言没翻）
  for (const k of Object.keys(en)) {
    if (typeof en[k] === 'string' && en[k] === ja[k] && /\p{L}/u.test(en[k])) {
      info.push(`en==ja ${k} = ${JSON.stringify(en[k])}`)
    }
  }
}

// ===========================================================================
// 主流程
// ===========================================================================
const files = walk(join(ROOT, 'src'))
const vueFiles = files.filter((f) => f.endsWith('.vue'))
const jsFiles = files.filter((f) => f.endsWith('.js') && !f.endsWith('wasmInline.js'))

for (const f of vueFiles) {
  const src = readFileSync(f, 'utf8')
  const lineOf = indexLines(src)
  scanVueTemplate(f, src, lineOf)
  const s = src.search(/<script[^>]*>/)
  if (s >= 0) {
    const bodyStart = src.indexOf('>', s) + 1
    const bodyEnd = src.indexOf('</script>', bodyStart)
    if (bodyEnd > bodyStart) scanJs(f, src.slice(bodyStart, bodyEnd), (idx) => lineOf(bodyStart + idx))
  }
}

for (const f of jsFiles) {
  if (rel(f).startsWith('src/locales/')) continue
  const src = readFileSync(f, 'utf8')
  scanJs(f, src, indexLines(src))
}

await scanLocales()

// 输出
const order = [
  'template-text',
  'template-attr',
  'js-ui-candidate',
  'js-i18n-key-cjk',
  'locale-key-diff',
  'locale-placeholder',
  'locale-type',
  'locale-empty',
  'en-cjk',
]
const out = []
out.push('==================== I18N AUDIT ====================')
out.push(`scanned: vue=${vueFiles.length} js=${jsFiles.length}`)
out.push(`problems=${problems.length} (console-log-only=${logOnly.length})`)
for (const kind of order) {
  const list = problems.filter((p) => p.kind === kind)
  if (!list.length) continue
  out.push('')
  out.push(`--- ${kind} (${list.length}) ---`)
  for (const p of list) {
    const where = p.line ? `${p.file}:${p.line}` : p.file
    if (p.kind === 'template-text' || p.kind === 'template-attr') {
      out.push(`  ${where}${p.attr ? ` [${p.attr}]` : ''} ${JSON.stringify(p.text)}`)
    } else if (p.kind.startsWith('js-')) {
      out.push(`  ${where} ${JSON.stringify(p.value)}`)
      out.push(`      ctx: ${p.ctx}`)
    } else {
      out.push(`  ${p.context ?? ''} ${p.strings ? JSON.stringify(p.strings) : ''}`)
    }
  }
}
const unknown = problems.filter((p) => !order.includes(p.kind))
if (unknown.length) {
  out.push('')
  out.push(`--- other (${unknown.length}) ---`)
  for (const p of unknown) out.push(`  ${rel(p.file ?? '')}:${p.line} ${JSON.stringify(p.context ?? p.value ?? '')}`)
}
out.push('')
out.push('--- console-only 中文日志（不进 UI） ---')
for (const p of logOnly) out.push(`  ${p.file}:${p.line} ${JSON.stringify(p.value)}`)
out.push('')
out.push(`--- info (${info.length}) ---`)
for (const line of info) out.push(`  ${line}`)
out.push('')
out.push(`TOTAL PROBLEMS: ${problems.length}`)

const text = out.join('\n')
writeFileSync(join(ROOT, 'tests/e2e/audit-i18n-report.txt'), text, 'utf8')
console.log(`report: tests/e2e/audit-i18n-report.txt  problems=${problems.length} logOnly=${logOnly.length} info=${info.length}`)
for (const kind of order) {
  const n = problems.filter((p) => p.kind === kind).length
  if (n) console.log(`  ${kind}: ${n}`)
}
