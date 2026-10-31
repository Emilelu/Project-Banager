/**
 * 验证生成的 wasmInline.js 三个契约：
 *   1. loadWasmBytes() 解出的字节 == 原始 wasm（长度 + sha256）
 *   2. 默认导出能被 atob() 直接吃（旧语义，tests/db.test.js 依赖）
 *   3. 默认导出**惰性**：模块里不应再出现第二份原始 base64 字面量
 *
 * 用法：node scripts/test-wasm-inline.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

const M = '../src/db/wasmInline.js'
if (!existsSync('src/db/wasmInline.js')) {
  console.error('先跑 pnpm build 生成 src/db/wasmInline.js')
  process.exit(1)
}
const mod = await import(M)
const wasm = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')
const sha = (b) => createHash('sha256').update(b).digest('hex')

let fail = 0
const ok = (name, cond, extra = '') => {
  if (!cond) fail++
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`)
}

// 1. loadWasmBytes 正确性
const t0 = performance.now()
const bytes = await mod.loadWasmBytes()
const ms = performance.now() - t0
ok('loadWasmBytes 长度', bytes.length === wasm.length, `${bytes.length} vs ${wasm.length}`)
ok('loadWasmBytes sha256', sha(bytes) === sha(wasm))
ok('魔数', bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d)
console.log(`  解压耗时 ${ms.toFixed(1)} ms（Node，非浏览器）`)

// 2. 默认导出仍是「原始 base64」
const legacy = mod.default
const legacyStr = String(legacy)
ok('默认导出可 atob', atob(legacyStr).length === wasm.length)
ok('默认导出内容 == 原始 base64', legacyStr === wasm.toString('base64'))

// 3. 惰性：源码里不应有第二份原始 base64
const src = readFileSync('src/db/wasmInline.js', 'utf8')
const literals = [...src.matchAll(/[A-Za-z0-9+/=]{60000,}/g)].map((m) => m[0])
ok('模块内大 base64 字面量只有一个', literals.length === 1, `找到 ${literals.length} 个`)
ok('该字面量是 gzip 版（长度 ≈ gzip base64）',
  literals[0] && literals[0].length === gzipSync(wasm, { level: 9 }).toString('base64').length,
  literals[0] ? `${literals[0].length} chars` : '')
ok('WASM_META.encoding', mod.WASM_META.encoding === 'gzip+base64')

console.log(`\n${fail === 0 ? '✅ 全部通过' : `❌ ${fail} 项失败`}`)
process.exit(fail === 0 ? 0 : 1)
