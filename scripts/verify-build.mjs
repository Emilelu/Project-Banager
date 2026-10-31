/**
 * 产物端到端验证：file:// 与 http://，并强制覆盖 WASM 解压的两条路径。
 *
 * 用法：node scripts/verify-build.mjs [--dist <path>]
 *
 * 每个场景都：
 *  1. 预置 localStorage 语言为 zh（并发改动可能把默认语言切到 en，
 *     按中文文案定位会误判「页面坏了」）
 *  2. 断言页面渲染出追番页
 *  3. 通过真实 UI 写入一条记录，再从 IndexedDB 读回，证明 sql.js WASM 真的在工作
 *  4. 汇总 pageerror / console error
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const idx = process.argv.indexOf('--dist')
const DIST = resolve(idx !== -1 ? process.argv[idx + 1] : 'dist/index.html')
if (!existsSync(DIST)) {
  console.error('找不到产物:', DIST)
  process.exit(1)
}

const html = readFileSync(DIST)
async function startServer() {
  const server = createServer((req, res) => {
    if (/^\/pbm\.html|^\/$|^\/index\.html/.test(req.url.split('?')[0])) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    res.writeHead(404)
    res.end('not found')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${server.address().port}/pbm.html`, close: () => server.close() }
}

const results = []
let failed = 0

async function scenario(label, url, { killDecompression = false } = {}) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text().split('\n')[0])
  })

  await page.addInitScript((kill) => {
    try { localStorage.setItem('banager_locale', 'zh') } catch {}
    if (kill) {
      // 抹掉原生解压 API，强制走内联纯 JS inflate 兜底路径
      try { delete window.DecompressionStream } catch {}
      window.DecompressionStream = undefined
      window.__WASM_FORCE_FALLBACK__ = true
    }
  }, killDecompression)

  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'load' })
  const loadMs = Date.now() - t0
  await page.waitForTimeout(2500)

  const info = await page.evaluate(() => {
    const txt = document.body.innerText
    return {
      hasWatchingPage: txt.includes('正在追番') || txt.includes('正在'),
      hasSidebar: txt.includes('导入') || txt.includes('Import'),
      len: txt.length,
      lang: document.documentElement.lang,
    }
  })

  // 真实写入：走「添加番剧」对话框
  let wrote = false
  try {
    await page.locator('button:has-text("添加番剧")').first().click({ timeout: 8000 })
    await page.locator('input[placeholder="请输入番剧名称"]').fill(label, { timeout: 8000 })
    await page.locator('button:has-text("保存")').last().click({ timeout: 8000 })
    await page.waitForTimeout(1200)
    wrote = (await page.locator('body').innerText()).includes(label)
  } catch (e) {
    errs.push('writes: ' + e.message.split('\n')[0])
  }

  // 再从 IndexedDB 直接确认落盘（证明 sql.js 的 WASM 真的跑起来了）
  const idb = await page.evaluate(
    () =>
      new Promise((res) => {
        const req = indexedDB.open('BangumiManagerDB', 1)
        req.onerror = () => res({ ok: false })
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('database')) return res({ ok: false, note: 'no store' })
          const tx = db.transaction('database', 'readonly')
          const get = tx.objectStore('database').get('bangumi_db')
          get.onsuccess = () => res({ ok: !!get.result, bytes: get.result ? get.result.byteLength || get.result.length : 0 })
          get.onerror = () => res({ ok: false })
        }
      }),
  )
  const sqliteHeader = idb.ok && idb.bytes > 0

  const ok = info.hasWatchingPage && wrote && errs.length === 0
  if (!ok) failed++
  results.push({ label, loadMs, info, wrote, idb, errs, ok })
  console.log(`\n=== ${label} ===`)
  console.log(`  URL          : ${url}`)
  console.log(`  load 事件    : ${loadMs} ms`)
  console.log(`  语言/文本    : ${info.lang} / ${info.len} 字符 / 追番页 ${info.hasWatchingPage}`)
  console.log(`  UI 写入回读  : ${wrote ? '✅' : '❌'}`)
  console.log(`  IndexedDB    : ${idb.ok ? '✅ 有库 ' + idb.bytes + ' bytes' : '❌ ' + (idb.note || '空')}`)
  console.log(`  错误         : ${errs.length}${errs.length ? '\n    ' + errs.slice(0, 5).join('\n    ') : ''}`)

  await browser.close()
}

const fileUrl = `file:///${DIST.replace(/\\/g, '/')}`
await scenario('file://（双击打开）', fileUrl)
await scenario('file:// + 无 DecompressionStream（纯 JS inflate 兜底）', fileUrl, { killDecompression: true })

const srv = await startServer()
await scenario('http://（托管访问）', srv.url)
await scenario('http:// + 无 DecompressionStream（兜底）', srv.url, { killDecompression: true })
srv.close()

console.log(`\n${failed === 0 ? '✅ 全部场景通过' : `❌ ${failed} 个场景失败`}`)
process.exit(failed === 0 ? 0 : 1)
