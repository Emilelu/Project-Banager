/**
 * Vite 插件：构建时下载 sql.js 的 WASM 文件并内联为 base64
 * 这样生成的 HTML 文件可以在 file:// 协议下直接打开
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const WASM_URL = 'https://sql.js.org/dist/sql-wasm.wasm'
const CACHE_DIR = 'node_modules/.wasm-cache'
const CACHE_FILE = join(CACHE_DIR, 'sql-wasm.wasm')
const BASE64_FILE = join(CACHE_DIR, 'sql-wasm.base64')

export default function wasmInlinePlugin() {
  return {
    name: 'wasm-inline',
    async buildStart() {
      // 确保缓存目录存在
      if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

      // 下载 WASM 文件（带缓存）
      if (!existsSync(CACHE_FILE)) {
        console.log('⬇️  下载 sql-wasm.wasm...')
        const response = await fetch(WASM_URL)
        if (!response.ok) throw new Error(`下载 WASM 失败: ${response.status}`)
        const buffer = Buffer.from(await response.arrayBuffer())
        writeFileSync(CACHE_FILE, buffer)
        console.log(`✓ WASM 已缓存 (${(buffer.length / 1024).toFixed(0)} KB)`)
      }

      // 生成 base64 文件
      if (!existsSync(BASE64_FILE)) {
        const wasmBuffer = readFileSync(CACHE_FILE)
        const base64 = wasmBuffer.toString('base64')
        writeFileSync(BASE64_FILE, base64)
        console.log(`✓ base64 已生成 (${(base64.length / 1024).toFixed(0)} KB)`)
      }

      // 生成 wasmInline.js 模块
      const inlineModulePath = join('src', 'db', 'wasmInline.js')
      const base64Data = readFileSync(BASE64_FILE, 'utf-8')
      const moduleContent = `// Auto-generated - WASM binary data (base64 encoded)\n// This file is regenerated on each build\nexport default "${base64Data}"\n`
      writeFileSync(inlineModulePath, moduleContent)
      console.log('✓ wasmInline.js 已生成')
    }
  }
}
