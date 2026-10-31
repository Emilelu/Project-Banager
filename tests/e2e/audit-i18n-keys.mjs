/**
 * 临时审计②：所有 tt('key') / t('key') / labelKey 引用是否都能在字典里解析，
 * 以及每页实际渲染出的「裸 key」文本（tt 返回 key 本身说明缺项）。
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const { default: zh } = await import('../../src/locales/zh.js')
const { default: en } = await import('../../src/locales/en.js')
const { default: ja } = await import('../../src/locales/ja.js')

const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.vue') || p.endsWith('.js')) files.push(p)
  }
}
walk(join(ROOT, 'src'))
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/')

const refs = [] // { file, line, key, kind }
for (const f of files) {
  if (rel(f).startsWith('src/locales/')) continue
  if (rel(f).endsWith('wasmInline.js')) continue
  const src = readFileSync(f, 'utf8')
  const lines = src.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // tt('key') / t('key') —— 只算字面量（模板字符串也算）
    for (const m of line.matchAll(/\b(?:tt|t)\(\s*['"`]([\w.]*)['"`]/g)) {
      const key = m[1]
      if (!key || !key.includes('.')) continue
      refs.push({ file: rel(f), line: i + 1, key, kind: 't()' })
    }
    // labelKey: 'key'
    for (const m of line.matchAll(/labelKey\s*:\s*['"`]([\w.]*)['"`]/g)) {
      refs.push({ file: rel(f), line: i + 1, key: m[1], kind: 'labelKey' })
    }
    // 静态 key 表：key: 'module.sub'（仅 module 前缀在白名单里）
    for (const m of line.matchAll(/\bkey\s*:\s*['"`]((?:theme|nav|sidebar|toast|help|tags|watching|watched|remaining|preset|import|confirm|common|card|showDialog|record|lang|topbar|appearance|color|weekday|moveWatched|clearScope|importResult|app)\.[\w.]*)['"`]/g)) {
      refs.push({ file: rel(f), line: i + 1, key: m[1], kind: 'key-field' })
    }
  }
}

const missing = []
for (const r of refs) {
  if (!(r.key in zh)) missing.push(r)
}
// 去重
const seen = new Set()
const uniqMissing = missing.filter((m) => {
  const k = `${m.file}:${m.line}:${m.key}`
  if (seen.has(k)) return false
  seen.add(k)
  return true
})

const lines = []
lines.push('===== key 引用解析审计 =====')
lines.push(`refs=${refs.length} missing=${uniqMissing.length}`)
lines.push('')
for (const m of uniqMissing) lines.push(`  MISSING ${m.file}:${m.line}  ${m.kind} ${m.key}`)
lines.push('')
lines.push('--- 动态 key 引用（无法静态校验，列出供人工核对）---')
for (const f of files) {
  if (rel(f).startsWith('src/locales/')) continue
  const src = readFileSync(f, 'utf8')
  const l = src.split(/\r?\n/)
  for (let i = 0; i < l.length; i++) {
    if (/\b(?:tt|t)\(\s*`/.test(l[i]) || /\b(?:tt|t)\([^'")]*\b(?:tt|t)\(/.test(l[i])) {
      lines.push(`  ${rel(f)}:${i + 1} ${l[i].trim().slice(0, 160)}`)
    }
  }
}
lines.push('')
lines.push(`--- 字典里未被任何地方引用的 key（可能是死键，仅供参考）---`)
const used = new Set(refs.map((r) => r.key))
// 动态拼接的 key 前缀，视为已用
const dynPrefixes = ['weekday.', 'lang.', 'preset.']
const unused = Object.keys(zh).filter((k) => !used.has(k) && !dynPrefixes.some((p) => k.startsWith(p)))
lines.push(`  count=${unused.length}`)
writeFileSync(join(ROOT, 'tests/e2e/audit-i18n-keys.txt'), lines.join('\n'), 'utf8')
console.log(lines.slice(0, 30).join('\n'))
console.log(`\nreport: tests/e2e/audit-i18n-keys.txt  missing=${uniqMissing.length} unused=${unused.length}`)
