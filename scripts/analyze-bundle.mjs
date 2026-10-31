/**
 * 打包模块体积分析：用 Vite 的 build API 在内存中构建一次（write: false），
 * 收集 rollup 的 chunk.modules（每个模块的 renderedLength），按 node_modules 包聚合。
 *
 * 用法：node scripts/analyze-bundle.mjs
 *
 * 注意：vite.config.js 里 `./vite-plugin-wasm-inline` 省略了扩展名，
 * Node 的 ESM 解析器不认，所以这里用 Vite 自己的 loadConfigFromFile 加载配置。
 */
import { build, loadConfigFromFile } from 'vite'
import { gzipSync } from 'node:zlib'

const fmt = (n) => `${(n / 1024).toFixed(1)} KB`
const mods = []

function reporter() {
  return {
    name: 'module-size-reporter',
    generateBundle(_opts, bundle) {
      for (const [file, out] of Object.entries(bundle)) {
        if (out.type !== 'chunk') continue
        for (const [id, m] of Object.entries(out.modules)) {
          mods.push({ id, bytes: m.renderedLength || 0 })
        }
        mods.push({ id: `__output__:${file}`, bytes: out.code.length })
      }
    },
  }
}

const loaded = await loadConfigFromFile(
  { command: 'build', mode: 'production' },
  undefined,
  process.cwd(),
)
const base = loaded?.config || {}
const flat = (base.plugins || []).flat(Infinity).filter((p) => p && p.name)
// 去掉 singlefile：它会改写产物结构，这里只想看模块体积
const plugins = [...flat.filter((p) => !/singlefile/i.test(p.name)), reporter()]

const result = await build({
  ...base,
  configFile: false,
  root: process.cwd(),
  plugins,
  logLevel: 'warn',
  build: {
    ...base.build,
    write: false,
    sourcemap: false,
  },
})

// 按 node_modules 包名聚合；pnpm 的真实路径是 node_modules/.pnpm/<name>@<ver>/node_modules/<name>/...
function packageOf(id) {
  const p = id.replace(/\\/g, '/')
  const marker = 'node_modules/'
  const idx = p.lastIndexOf(marker)
  if (idx === -1) return '(app)'
  let rest = p.slice(idx + marker.length)
  if (rest.startsWith('.pnpm/')) {
    rest = rest.slice('.pnpm/'.length)
    const tail = rest.split('/node_modules/')[1]
    if (tail) rest = tail
  }
  const segs = rest.split('/')
  return segs[0].startsWith('@') ? segs.slice(0, 2).join('/') : segs[0]
}

const byPkg = new Map()
for (const m of mods) {
  if (m.id.startsWith('__output__:')) continue
  const pkg = packageOf(m.id)
  byPkg.set(pkg, (byPkg.get(pkg) || 0) + m.bytes)
}

console.log('=== 按包聚合（rollup renderedLength，压缩前）===')
let total = 0
for (const [p, b] of [...byPkg.entries()].sort((a, b) => b[1] - a[1])) {
  total += b
  console.log(`${p.padEnd(36)} ${fmt(b).padStart(12)}`)
}
console.log(`${'合计'.padEnd(36)} ${fmt(total).padStart(12)}`)

console.log('\n=== 前 25 大模块 ===')
const cwd = process.cwd().replace(/\\/g, '/')
for (const m of [...mods].filter((x) => !x.id.startsWith('__output__')).sort((a, b) => b.bytes - a.bytes).slice(0, 25)) {
  console.log(`${fmt(m.bytes).padStart(10)}  ${m.id.replace(/\\/g, '/').replace(cwd, '.')}`)
}

console.log('\n=== 产物文件 ===')
const outputs = Array.isArray(result) ? result : [result]
for (const o of outputs) {
  for (const item of o?.output || []) {
    const code = item.type === 'chunk' ? item.code : item.source
    const buf = Buffer.isBuffer(code) ? code : Buffer.from(String(code))
    console.log(`${item.fileName}: ${buf.length} (${fmt(buf.length)})  gzip ${gzipSync(buf, { level: 9 }).length}`)
  }
}
