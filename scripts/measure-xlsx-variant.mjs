/**
 * 量化 SheetJS 换用预构建变体（xlsx.core.min.js / xlsx.mini.min.js）的体积收益。
 *
 * 用法：node scripts/measure-xlsx-variant.mjs
 *
 * 只改 vite 的 alias（构建期），不改业务 import。
 */
import { build, loadConfigFromFile } from 'vite'
import { gzipSync } from 'node:zlib'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const fmt = (n) => `${(n / 1024).toFixed(1)} KB`

async function run(name, alias) {
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, undefined, process.cwd())
  const config = loaded.config
  const outDir = resolve('.workbuddy/xlsx-variant', name.replace(/[^\w.-]+/g, '_'))
  mkdirSync(outDir, { recursive: true })
  await build({
    ...config,
    configFile: false,
    root: process.cwd(),
    resolve: { ...(config.resolve || {}), alias: { ...(config.resolve?.alias || {}), ...alias } },
    logLevel: 'silent',
    build: { ...config.build, outDir, emptyOutDir: true, write: true },
  })
  const html = readFileSync(resolve(outDir, 'index.html'))
  console.log(`${name.padEnd(26)} raw ${fmt(html.length).padStart(10)}  gzip ${fmt(gzipSync(html, { level: 9 }).length).padStart(9)}  (${html.length})`)
}

await run('baseline (xlsx.mjs)')
await run('xlsx.core.min', { xlsx: 'xlsx/dist/xlsx.core.min.js' })
await run('xlsx.mini.min', { xlsx: 'xlsx/dist/xlsx.mini.min.js' })
