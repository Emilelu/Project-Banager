/**
 * 构建产物体积构成分析（单一文件 dist/index.html）
 *
 * 用法：node scripts/analyze-dist.mjs [dist/index.html]
 *
 * 单文件产物没有独立 chunk 可看，所以这里按「HTML 里的代码块 / 内联数据块」切分：
 *   1. 内联 WASM base64（vite-plugin-wasm-inline 生成的 base64 字面量）
 *   2. JS bundle（去掉 WASM base64 后的剩余 JS）
 *   3. CSS（vite-plugin-singlefile 注入的 <style>）
 *   4. data: URI 静态资源（favicon / logo 等）
 *   5. HTML 骨架
 */
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib'
import { resolve } from 'node:path'

const file = resolve(process.argv[2] || 'dist/index.html')
if (!existsSync(file)) {
  console.error('找不到产物:', file)
  process.exit(1)
}
const raw = readFileSync(file)
const text = raw.toString('utf8')
const B = (s) => Buffer.byteLength(s, 'utf8')
const fmt = (n) => `${(n / 1024).toFixed(1)} KB`
const pct = (n) => `${((n / raw.length) * 100).toFixed(1)}%`

const gz = gzipSync(raw, { level: 9 }).length
const br = brotliCompressSync(raw, {
  params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length },
}).length

/** 用顶层标签切块（script 内部可能含 "<style" 字符串，所以先切 script，再切其外的 style） */
function topBlocks(tag, skipRanges = []) {
  const out = []
  const openRe = new RegExp(`<${tag}[^>]*>`, 'g')
  const close = `</${tag}>`
  let m
  while ((m = openRe.exec(text))) {
    const start = m.index + m[0].length
    const end = text.indexOf(close, start)
    const stop = end === -1 ? text.length : end
    if (skipRanges.some(([a, b]) => m.index >= a && m.index < b)) continue
    out.push({ start, end: stop, len: stop - start })
    if (end === -1) break
    openRe.lastIndex = stop
  }
  return out
}

const scriptBlocks = topBlocks('script')
const styleBlocks = topBlocks('style', scriptBlocks.map((b) => [b.start, b.end]))

// WASM base64 字面量：最长的纯 base64 引号字符串
let wasmLen = 0
for (const m of text.matchAll(/"([A-Za-z0-9+/=]{50000,})"/g)) {
  if (m[1].length > wasmLen) wasmLen = m[1].length
}

// data: URI 资源
const uriList = [...text.matchAll(/data:[a-z0-9/+-]+;base64,[A-Za-z0-9+/=]+/gi)].map((m) => ({
  len: m[0].length,
  head: m[0].slice(0, 36),
}))

const jsTotal = scriptBlocks.reduce((a, b) => a + b.len, 0)
const cssTotal = styleBlocks.reduce((a, b) => a + b.len, 0)
const jsNonWasm = jsTotal - wasmLen
const markup = raw.length - jsTotal - cssTotal

console.log(`=== 产物: ${file}`)
console.log(`总字节: ${raw.length} (${fmt(raw.length)})`)
console.log(`gzip  : ${gz} (${fmt(gz)})`)
console.log(`brotli: ${br} (${fmt(br)})`)
console.log('\n--- 构成 ---')
const rows = [
  ['sql.js WASM base64 字面量', wasmLen],
  ['JS 其余部分（vue/router/xlsx/业务）', jsNonWasm],
  ['CSS', cssTotal],
  ['HTML 骨架', markup],
]
for (const [name, bytes] of rows) {
  console.log(`${name.padEnd(40)} ${fmt(bytes).padStart(12)}  ${pct(bytes).padStart(7)}`)
}
const uriTotal = uriList.reduce((a, b) => a + b.len, 0)
console.log(`${'（其中）data: URI 总计（在骨架里）'.padEnd(40)} ${fmt(uriTotal).padStart(12)}  ${pct(uriTotal).padStart(7)}`)
console.log(`\n校验: JS ${jsTotal} + CSS ${cssTotal} + 骨架 ${markup} = ${jsTotal + cssTotal + markup} / ${raw.length}`)
console.log(`script 块 ${scriptBlocks.length} 个；style 块 ${styleBlocks.length} 个`)
console.log(`WASM base64 字符数 ${wasmLen}（解码后 ${Math.round((wasmLen * 3) / 4)} 字节 ≈ ${((wasmLen * 3) / 4 / 1024).toFixed(0)} KB）`)

console.log('\n--- data: URI 明细 ---')
for (const u of uriList.sort((a, b) => b.len - a.len)) console.log(`  ${fmt(u.len).padStart(9)}  ${u.head}`)

// 大依赖痕迹
const probe = [
  ['xlsx: cpexcel/codepage 编码表', /cpexcel|codepage|cptable/i],
  ['xlsx: XLSX 解析', /parse_xlsx/i],
  ['xlsx: XLSX 写出', /write_zip/i],
  ['xlsx: ODS', /parse_ods|write_ods/i],
  ['xlsx: CFB', /parse_cfb/i],
  ['xlsx: SSF', /custom_fmt|SSF/],
  ['xlsx: Biff8(xls)', /Biff8|biff8/i],
  ['xlsx: SYLK/DIF', /SYLK|DIF/],
  ['xlsx: 公式', /parse_formula/i],
  ['vue runtime', /createVNode/],
  ['vue-router', /createRouter/],
  ['sql.js JS 胶水', /initSqlJs|sql-wasm\.js/],
  ['tailwind', /--tw-/],
]
console.log('\n--- 大依赖痕迹 ---')
for (const [n, re] of probe) console.log(`${re.test(text) ? '✓' : '✗'} ${n}`)
