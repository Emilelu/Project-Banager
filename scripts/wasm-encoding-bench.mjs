/**
 * WASM 内联编码方案的体积对比实验
 * 用法：node scripts/wasm-encoding-bench.mjs
 */
import { readFileSync } from 'node:fs'
import { gzipSync, brotliCompressSync, constants as z } from 'node:zlib'

const wasm = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')
const fmt = (n) => `${(n / 1024).toFixed(1)} KB`
const b64 = (buf) => Buffer.from(buf.toString('base64'), 'utf8')

const gzWasm = gzipSync(wasm, { level: 9 })
const brWasm = brotliCompressSync(wasm, { params: { [z.BROTLI_PARAM_QUALITY]: 11 } })
const rawB64 = b64(wasm)
const gzB64 = b64(gzWasm)
const brB64 = b64(brWasm)

// 模拟「这段内容处于一个更大的 HTML 里，最终 HTML 被 gzip」：给首尾加一点普通文本
const wrap = (s) => `<html><script>${s}</script><p>hello world some html text</p></html>`

const rows = [
  ['wasm 原始', wasm.length, wasm],
  ['base64(wasm) 当前方案', rawB64.length, rawB64],
  ['gzip(wasm)', gzWasm.length, gzWasm],
  ['brotli(wasm)', brWasm.length, brWasm],
  ['base64(gzip(wasm))', gzB64.length, gzB64],
  ['base64(brotli(wasm))', brB64.length, brB64],
]

console.log('=== 各编码的「内联到 HTML 里的字符数」 ===')
for (const [name, len, buf] of rows) {
  console.log(`${name.padEnd(26)} ${String(len).padStart(9)}  ${fmt(len)}`)
}

console.log('\n=== 整个 HTML 经服务器 gzip 后的传输体积（模拟）===')
for (const [name, , buf] of rows) {
  const html = wrap(buf.toString())
  const htmlGz = gzipSync(html, { level: 9 }).length
  console.log(`${('HTML 含 ' + name).padEnd(40)} 未压缩 ${fmt(Buffer.byteLength(html))}  gzip ${fmt(htmlGz)}`)
}

console.log('\n=== 浏览器端解码耗时参考（base64 解码 659730 字节）===')
const t0 = performance.now()
const s = rawB64.toString('base64')
for (let i = 0; i < 5; i++) Buffer.from(s, 'base64')
console.log(`Buffer.from(base64) x5: ${(performance.now() - t0).toFixed(1)} ms（仅 Node 参考）`)
