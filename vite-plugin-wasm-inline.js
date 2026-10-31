/**
 * Vite 插件：把 sql.js 的 WASM 压缩后内联进单文件产物
 * 目的：构建产物可在 file:// 协议下直接打开，无需网络请求
 *
 * 历史与取舍（每一条都记录原因，避免回退时重新踩坑）：
 *  1. 不再从 sql.js.org 联网抓「最新」WASM —— 那与已安装版本存在 ABI 漂移风险；
 *     改为只读本地 `sql.js/dist/sql-wasm.wasm`，与依赖版本严格一致
 *  2. 只在 build 阶段执行（apply: 'build'），`pnpm dev` 不再改写源文件
 *  3. 生成内容按依赖版本 + 内容哈希标注，升级依赖后必然重建
 *  4. 内容未变则不重写，避免无意义的文件 churn
 *  5. **先 gzip 再 base64**（sql.js 1.14.1 实测）：
 *       原始 WASM 659730 字节 → 原始 base64 879640 字符（占单文件 HTML 43%）
 *       gzip 后    322941 字节 →     base64 430588 字符
 *     单文件 HTML 由 1985 KB 降到 1559 KB（gzip 后 765 KB → 695 KB）。
 *     解压两条路：
 *       - 优先浏览器原生 `DecompressionStream('gzip')`
 *         （Chrome 80+ / Safari 16.4+ / Firefox 113+；纯计算 API，**file:// 下可用**）
 *       - 兜底是本文件内嵌的纯 JS inflate（约 4 KB），无任何浏览器 API 依赖，
 *         保证老浏览器 / 受限环境在 file:// 下依然可用，不联网、不走 CDN
 *     解压结果强制校验「长度 + WASM 魔数」；解压器出问题时立刻抛错并让上层走
 *     既有 fallback，绝不给 WebAssembly 喂坏字节（那只会变成难排查的 compile 错误）。
 *
 * ⚠ 导出契约（勿改，改动会导致两类事故）：
 *   - `default`：旧语义「原始 WASM 的 base64」，但**以惰性字符串对象**实现 ——
 *     `atob(默认导出)` 时才真正解压并转 base64，所以打包产物里**不重复存一份原始
 *     base64**（早先直接导出原始 base64 字面量，让产物体积从 1559 KB 反弹到 2443 KB）。
 *     若把它换成字符串或删掉，tests/db.test.js 的 `atob(wasmBase64)` 立刻崩。
 *   - `loadWasmBytes()`：运行时唯一入口，从 gzip 解出 WASM；体积收益全部来自这里。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'

/** 纯 JS gunzip/inflate（puff.c 思路的解码器，只解码不校验 CRC） */
const INFLATE_SOURCE = String.raw`const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59,
  67, 83, 99, 115, 131, 163, 195, 227, 258,
]
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4,
  5, 5, 5, 5, 0,
]
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385,
  513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
]
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
  11, 11, 12, 12, 13, 13,
]
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

/** 读取 gzip 头，返回 deflate 数据起点；非 gzip 容器返回 0 */
function gzipDataOffset(u8) {
  if (!(u8[0] === 0x1f && u8[1] === 0x8b && u8[2] === 0x08)) return 0
  const flg = u8[3]
  let p = 10
  if (flg & 0x04) { const xlen = u8[p] | (u8[p + 1] << 8); p += 2 + xlen }
  if (flg & 0x08) { while (u8[p] !== 0) p++; p++ }
  if (flg & 0x10) { while (u8[p] !== 0) p++; p++ }
  if (flg & 0x02) p += 2
  return p
}

/**
 * 解压 gzip / raw-deflate 数据。
 * @param {Uint8Array} input
 * @param {number} [expectedSize] 已知输出长度（构建期写入），可省一次扩容
 * @returns {Uint8Array}
 */
function inflate(input, expectedSize) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input)
  let pos = gzipDataOffset(u8)

  let out = new Uint8Array(expectedSize || Math.max(1024, u8.length * 4))
  let outLen = 0
  const ensure = (need) => {
    if (outLen + need <= out.length) return
    let cap = out.length * 2
    while (cap < outLen + need) cap *= 2
    const next = new Uint8Array(cap)
    next.set(out.subarray(0, outLen))
    out = next
  }

  // 位读取（LSB first）
  let bitBuf = 0
  let bitCnt = 0
  const bits = (need) => {
    while (bitCnt < need) {
      if (pos >= u8.length) throw new Error('inflate: 数据提前结束')
      bitBuf |= u8[pos++] << bitCnt
      bitCnt += 8
    }
    const v = bitBuf & ((1 << need) - 1)
    bitBuf >>>= need
    bitCnt -= need
    return v
  }

  // 规范 Huffman 解码表
  const buildHuffman = (lengths, n) => {
    const counts = new Uint16Array(16)
    const symbols = new Uint16Array(n)
    for (let i = 0; i < n; i++) counts[lengths[i]]++
    counts[0] = 0
    const offs = new Uint16Array(16)
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1]
    for (let i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i
    return { counts, symbols }
  }

  const decode = (h) => {
    let code = 0
    let first = 0
    let index = 0
    for (let len = 1; len <= 15; len++) {
      code |= bits(1)
      const count = h.counts[len]
      if (code - first < count) return h.symbols[index + (code - first)]
      index += count
      first = (first + count) << 1
      code <<= 1
    }
    throw new Error('inflate: 无效 Huffman 码')
  }

  // 固定 Huffman 表只建一次
  const FIXED_LIT_LEN = new Uint8Array(288)
  for (let i = 0; i < 144; i++) FIXED_LIT_LEN[i] = 8
  for (let i = 144; i < 256; i++) FIXED_LIT_LEN[i] = 9
  for (let i = 256; i < 280; i++) FIXED_LIT_LEN[i] = 7
  for (let i = 280; i < 288; i++) FIXED_LIT_LEN[i] = 8
  const FIXED_DIST_LEN = new Uint8Array(30).fill(5)
  const FIXED_LIT = buildHuffman(FIXED_LIT_LEN, 288)
  const FIXED_DIST = buildHuffman(FIXED_DIST_LEN, 30)

  let final = 0
  while (!final) {
    final = bits(1)
    const type = bits(2)

    if (type === 0) {
      // stored：跳到字节边界
      bitBuf = 0
      bitCnt = 0
      const len = u8[pos] | (u8[pos + 1] << 8)
      const nlen = u8[pos + 2] | (u8[pos + 3] << 8)
      pos += 4
      if (len !== (~nlen & 0xffff)) throw new Error('inflate: stored 块长度不一致')
      ensure(len)
      out.set(u8.subarray(pos, pos + len), outLen)
      outLen += len
      pos += len
      continue
    }
    if (type === 3) throw new Error('inflate: 保留的块类型')

    let lit
    let dist
    if (type === 1) {
      lit = FIXED_LIT
      dist = FIXED_DIST
    } else {
      const hlit = bits(5) + 257
      const hdist = bits(5) + 1
      const hclen = bits(4) + 4
      const clenLens = new Uint8Array(19)
      for (let i = 0; i < hclen; i++) clenLens[CLEN_ORDER[i]] = bits(3)
      const clen = buildHuffman(clenLens, 19)

      const lens = new Uint8Array(hlit + hdist)
      let i = 0
      while (i < hlit + hdist) {
        const sym = decode(clen)
        if (sym < 16) {
          lens[i++] = sym
        } else if (sym === 16) {
          if (i === 0) throw new Error('inflate: 重复码出现在首位')
          const prev = lens[i - 1]
          let rep = 3 + bits(2)
          while (rep-- && i < lens.length) lens[i++] = prev
        } else if (sym === 17) {
          let rep = 3 + bits(3)
          while (rep-- && i < lens.length) lens[i++] = 0
        } else {
          let rep = 11 + bits(7)
          while (rep-- && i < lens.length) lens[i++] = 0
        }
      }
      lit = buildHuffman(lens.subarray(0, hlit), hlit)
      dist = buildHuffman(lens.subarray(hlit, hlit + hdist), hdist)
    }

    while (true) {
      const sym = decode(lit)
      if (sym < 256) {
        ensure(1)
        out[outLen++] = sym
        continue
      }
      if (sym === 256) break
      const li = sym - 257
      if (li >= 29) throw new Error('inflate: 无效长度码')
      const length = LENGTH_BASE[li] + bits(LENGTH_EXTRA[li])
      const di = decode(dist)
      if (di >= 30) throw new Error('inflate: 无效距离码')
      const distance = DIST_BASE[di] + bits(DIST_EXTRA[di])
      if (distance > outLen) throw new Error('inflate: 距离超出已解压数据')
      ensure(length)
      let from = outLen - distance
      for (let k = 0; k < length; k++) out[outLen++] = out[from++]
    }
  }

  return out.subarray(0, outLen)
}`

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)

function resolveSqlJsDir() {
  const root = process.cwd()
  const flat = join(root, 'node_modules', 'sql.js')
  if (existsSync(join(flat, 'dist', 'sql-wasm.wasm'))) return flat

  const pnpmRoot = join(root, 'node_modules', '.pnpm')
  if (existsSync(pnpmRoot)) {
    for (const entry of readdirSync(pnpmRoot)) {
      if (!entry.startsWith('sql.js@')) continue
      const candidate = join(pnpmRoot, entry, 'node_modules', 'sql.js')
      if (existsSync(join(candidate, 'dist', 'sql-wasm.wasm'))) return candidate
    }
  }
  throw new Error('找不到 sql.js（请先执行 pnpm install）')
}

export default function wasmInlinePlugin() {
  return {
    name: 'wasm-inline',
    apply: 'build',
    buildStart() {
      const sqlJsDir = resolveSqlJsDir()
      const wasmPath = join(sqlJsDir, 'dist', 'sql-wasm.wasm')
      const pkgVersion = JSON.parse(readFileSync(join(sqlJsDir, 'package.json'), 'utf-8')).version
      const wasmBuffer = readFileSync(wasmPath)
      const hash = sha256(wasmBuffer)

      // gzipSync 不写 mtime，相同输入必得相同字节，哈希可复现
      const gzipped = gzipSync(wasmBuffer, { level: 9 })
      const gzipB64 = gzipped.toString('base64')
      const ghash = sha256(gzipped)

      const target = join('src', 'db', 'wasmInline.js')
      const content = `// Auto-generated by vite-plugin-wasm-inline. Do not edit.
// sql.js ${pkgVersion} · wasm sha256:${hash} · ${wasmBuffer.length} bytes
// gzip sha256:${ghash} · ${gzipped.length} bytes · base64 ${gzipB64.length} chars
// 编码：运行时走 loadWasmBytes()（gzip → base64；优先 DecompressionStream，兜底纯 JS inflate）。
// default 导出是「原始 WASM 的 base64」旧语义，但惰性求值（atob 它时才解压），
// 所以产物里只有一份 gzip base64，不会重复存原始 base64。

export const WASM_META = {
  version: ${JSON.stringify(pkgVersion)},
  sha256: ${JSON.stringify(hash)},
  bytes: ${wasmBuffer.length},
  gzipBytes: ${gzipped.length},
  gzipSha256: ${JSON.stringify(ghash)},
  encoding: 'gzip+base64',
}

const WASM_GZIP_BASE64 = ${JSON.stringify(gzipB64)}

${INFLATE_SOURCE}

/** base64 → Uint8Array */
function base64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Uint8Array → base64（分块，避免超长 fromCharCode 参数栈溢出） */
function bytesToBase64(bytes) {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** WASM 魔数前 4 字节：\\0asm */
function looksLikeWasm(bytes) {
  return bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d
}

/** 同步解压（内部用；loadWasmBytes 的兜底路径） */
function inflateWasmSync() {
  const bytes = inflate(base64ToBytes(WASM_GZIP_BASE64), WASM_META.bytes)
  if (bytes.length !== WASM_META.bytes || !looksLikeWasm(bytes)) {
    throw new Error(
      '内联 WASM 解压结果异常（长度 ' + bytes.length + ' / 期望 ' + WASM_META.bytes + '）',
    )
  }
  return bytes
}

/**
 * 解出 sql.js 的 WASM 字节（带长度 + 魔数校验）。
 * 解压异常时抛错，让上层走显式 fallback，绝不给 WebAssembly 喂坏字节。
 * @returns {Promise<Uint8Array>}
 */
export async function loadWasmBytes() {
  const gz = base64ToBytes(WASM_GZIP_BASE64)

  // 快路径：浏览器原生解压（纯计算 API，file:// 可用）
  if (typeof DecompressionStream === 'function' && typeof Response === 'function') {
    try {
      const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
      if (bytes.length === WASM_META.bytes && looksLikeWasm(bytes)) return bytes
      console.warn('[wasm] DecompressionStream 解压长度或魔数不符，改用内置解压器')
    } catch (e) {
      console.warn('[wasm] DecompressionStream 解压失败，改用内置解压器:', e && e.message)
    }
  }

  // 兜底：纯 JS inflate，无任何浏览器 API 依赖
  return inflateWasmSync()
}

/**
 * 旧语义兼容层：默认导出要能被 atob() 直接吃掉（tests/db.test.js 这么用）。
 * 用惰性字符串对象实现：只有真的被转成字符串时才解压 + 转 base64，
 * 因此打包产物里不会出现第二份 859 KB 的原始 base64。
 */
const legacyRawWasmBase64 = {
  toString() { return bytesToBase64(inflateWasmSync()) },
  valueOf() { return this.toString() },
  [Symbol.toPrimitive]() { return this.toString() },
}

export default legacyRawWasmBase64
`

      const existing = existsSync(target) ? readFileSync(target, 'utf-8') : ''
      if (existing !== content) {
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, content)
        console.log(
          `✓ wasmInline.js 已生成（sql.js ${pkgVersion}，WASM ${(wasmBuffer.length / 1024).toFixed(0)} KB ` +
            `→ gzip ${(gzipped.length / 1024).toFixed(0)} KB）`,
        )
      }
    },
  }
}
