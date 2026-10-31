/**
 * 在当前（已启用 WASM gzip）基线上，量化几个纯构建配置候选项的收益。
 *
 * 用法：node scripts/measure-vue-flags.mjs
 *
 * 候选项（全部只改 vite.config.js 的 define，不动业务代码）：
 *   baseline                    —— 现状
 *   +prod devtools false        —— __VUE_PROD_DEVTOOLS__ = false
 *   +options api false          —— __VUE_OPTIONS_API__ = false（组件全用 <script setup>）
 *   +两者都关
 */
import { build, loadConfigFromFile } from 'vite'
import { gzipSync } from 'node:zlib'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const fmt = (n) => `${(n / 1024).toFixed(1)} KB`

async function run(name, extraDefine = {}) {
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, undefined, process.cwd())
  const config = loaded.config
  const outDir = resolve('.workbuddy/vue-flags', name.replace(/[^\w.-]+/g, '_'))
  mkdirSync(outDir, { recursive: true })
  await build({
    ...config,
    configFile: false,
    root: process.cwd(),
    define: { ...(config.define || {}), ...extraDefine },
    logLevel: 'silent',
    build: { ...config.build, outDir, emptyOutDir: true, write: true },
  })
  const html = readFileSync(resolve(outDir, 'index.html'))
  const gz = gzipSync(html, { level: 9 }).length
  console.log(`${name.padEnd(28)} raw ${fmt(html.length).padStart(10)}  gzip ${fmt(gz).padStart(9)}  (${html.length} / ${gz})`)
  return { raw: html.length, gz }
}

const b = await run('baseline')
const d = await run('prod devtools false', { __VUE_PROD_DEVTOOLS__: 'false' })
const o = await run('options api false', { __VUE_OPTIONS_API__: 'false' })
const both = await run('两者都关', {
  __VUE_PROD_DEVTOOLS__: 'false',
  __VUE_OPTIONS_API__: 'false',
})

console.log('\n=== 差值 ===')
for (const [label, r] of [['prod devtools false', d], ['options api false', o], ['两者都关', both]]) {
  console.log(`${label.padEnd(22)} raw ${`${r.raw - b.raw}`.padStart(9)}  gzip ${`${r.gz - b.gz}`.padStart(9)}`)
}
