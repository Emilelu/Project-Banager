/**
 * 临时排查/复测脚本（最终版）：全站按钮边框一致性扫描
 * 判定维度：
 *   A. 四边可见且等宽，但颜色不一致 → 左右/上下异色
 *   B. 有边框宽度 + 透明边框 + 渐变背景 → background-origin/clip 不一致，边缘会反色
 *   C. 像素级：1px 边框环与内部像素显著不同，且环色≈外部背景 → 边框「透底」
 *   D. 像素级：渐变按钮的左右环色与内部反端色相同（渐变 tile 平铺痕迹）
 *   E. 深色模式：按钮边框为写死的高亮度浅色（在深底上突然变亮边）
 * 用法：node tests/e2e/verify-borders-scan.mjs light|dark
 */
import { chromium } from 'playwright'
import sharp from 'sharp'

const BASE = 'http://localhost:5250'
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light'
const PAGES = ['#/watching', '#/remaining', '#/watched', '#/tags', '#/appearance', '#/import']

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.addInitScript((t) => { try { localStorage.setItem('bangumi-theme', t) } catch {} }, THEME)

const SEL = 'button, a, label, [role="button"], input[type="button"], input[type="submit"]'

const alpha = (c) => {
  const m = String(c).match(/rgba?\(([^)]+)\)/)
  if (!m) return 1
  const p = m[1].split(',').map((x) => parseFloat(x))
  return p.length === 4 ? p[3] : 1
}
const lum = (c) => {
  const m = String(c).match(/rgba?\(([^)]+)\)/)
  if (!m) return -1
  const p = m[1].split(',').map(parseFloat)
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
}

/** 收集整页截图 + 候选按钮 DOM 信息 */
async function collect() {
  const dom = await page.evaluate((sel) => {
    const out = []
    for (const el of [...document.querySelectorAll(sel)]) {
      const r = el.getBoundingClientRect()
      if (r.width < 10 || r.height < 8) continue
      const st = getComputedStyle(el)
      if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0) continue
      out.push({
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 34),
        cls: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
        area: el.closest('aside') ? 'sidebar' : el.closest('header') ? 'header' : 'main',
        x: r.x, y: r.y, w: r.width, h: r.height,
        bt: st.borderTopColor, bl: st.borderLeftColor, br: st.borderRightColor, bb: st.borderBottomColor,
        btw: parseFloat(st.borderTopWidth) || 0, blw: parseFloat(st.borderLeftWidth) || 0,
        brw: parseFloat(st.borderRightWidth) || 0, bbw: parseFloat(st.borderBottomWidth) || 0,
        bgi: st.backgroundImage.slice(0, 130), bgc: st.backgroundColor,
        bgo: st.backgroundOrigin, bgclip: st.backgroundClip,
      })
    }
    return out
  }, SEL)
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: viewport.width, height: viewport.height } })
  const { data: raw, info } = await sharp(shot).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, C = info.channels
  const px = (x, y) => {
    x = Math.max(0, Math.min(W - 1, x))
    y = Math.max(0, Math.min(info.height - 1, y))
    const i = (y * W + x) * C
    return [raw[i], raw[i + 1], raw[i + 2]]
  }
  return { dom, px }
}

const viewport = { width: 1500, height: 950 }
const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
const fmt = (c) => `${c[0]},${c[1]},${c[2]}`

const findings = []
let btnCount = 0

async function scan(label) {
  const { dom, px } = await collect()
  btnCount += dom.length
  for (const b of dom) {
    const reasons = []
    const sides = [
      { k: 'T', c: b.bt, w: b.btw }, { k: 'L', c: b.bl, w: b.blw },
      { k: 'R', c: b.br, w: b.brw }, { k: 'B', c: b.bb, w: b.bbw },
    ]
    const drawn = sides.filter((s) => s.w > 0)
    const uniq = new Set(sides.map((s) => s.c))
    const hasGrad = b.bgi !== 'none'

    // A
    if (drawn.length === 4) {
      const sameW = drawn.every((s) => s.w === drawn[0].w)
      if (sameW && uniq.size > 1) reasons.push(`A: 四边等宽${drawn[0].w}px但颜色不一致 ${[...uniq].join(' | ')}`)
      // B
      if (hasGrad && uniq.size === 1 && alpha(drawn[0].c) === 0) {
        // 只有 origin 与 clip 不一致时，渐变才会在边框区被「反色 tile 平铺」
        if (b.bgo !== b.bgclip) {
          reasons.push(`B: 渐变背景 + 全透明边框，且 origin=${b.bgo} 与 clip=${b.bgclip} 不一致 → 边缘反色`)
        }
      }
      // E
      if (THEME === 'dark' && uniq.size === 1 && alpha(drawn[0].c) > 0.5 && lum(drawn[0].c) > 195) {
        reasons.push(`E: 深色模式下写死的亮边框 ${drawn[0].c}`)
      }
    }

    // C / D 像素级：只在有边框宽度或渐变背景时做，避免噪音
    if ((drawn.length > 0 || hasGrad) && b.w >= 24 && b.h >= 14) {
      const yTop = Math.floor(b.y + b.h * 0.45)
      const yBot = Math.floor(b.y + b.h * 0.6)
      const ys = [yTop, yTop + 1, yBot]
      const med = (xs) => {
        const cols = xs.map((x) => {
          const v = [0, 0, 0]
          for (const y of ys) { const p = px(x, y); v[0] += p[0]; v[1] += p[1]; v[2] += p[2] }
          return [v[0] / ys.length, v[1] / ys.length, v[2] / ys.length]
        })
        const m = (i) => cols.map((c) => c[i]).sort((a, c) => a - c)[1]
        return [m(0), m(1), m(2)]
      }
      const xL = Math.round(b.x)
      const xR = Math.round(b.x + b.w - 1)
      const ringL = med([xL]), ringR = med([xR])
      const innerL = med([xL + 3, xL + 5]), innerR = med([xR - 3, xR - 5])
      const outL = med([xL - 2]), outR = med([xR + 2])

      if (drawn.length > 0) {
        // C：环 ≠ 内部，且环 ≈ 外部（透底）
        if (dist(ringL, innerL) > 12 && dist(ringL, outL) < 8) {
          reasons.push(`C: 左缘透底 ring=${fmt(ringL)} vs inner=${fmt(innerL)} vs out=${fmt(outL)}`)
        }
        if (dist(ringR, innerR) > 12 && dist(ringR, outR) < 8) {
          reasons.push(`C: 右缘透底 ring=${fmt(ringR)} vs inner=${fmt(innerR)} vs out=${fmt(outR)}`)
        }
      }
      if (hasGrad) {
        // D：左环接近右内部色 / 右环接近左内部色（渐变 tile 平铺反色）
        if (dist(ringL, innerR) < 6 && dist(ringL, innerL) > 12) {
          reasons.push(`D: 左缘取了渐变末端色 ring=${fmt(ringL)} 而内部=${fmt(innerL)}`)
        }
        if (dist(ringR, innerL) < 6 && dist(ringR, innerR) > 12) {
          reasons.push(`D: 右缘取了渐变起点色 ring=${fmt(ringR)} 而内部=${fmt(innerR)}`)
        }
      }
    }

    if (reasons.length) findings.push({ page: label, ...b, reasons })
  }
}

for (const p of PAGES) {
  await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  await scan(p)
}

// 弹窗 / 批量 / 确认态
async function withState(label, p, prep) {
  await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1300)
  try {
    await prep()
    await page.waitForTimeout(800)
    await scan(label)
  } catch (e) {
    console.log(`(状态 ${label} 准备失败: ${e.message.split('\n')[0]})`)
  }
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(300)
}
for (const p of ['#/watching', '#/remaining', '#/watched']) {
  await withState(`${p} [dialog]`, p, () => page.locator('main button.btn-primary').first().click({ timeout: 4000 }))
  await withState(`${p} [batch]`, p, () => page.locator('main button.btn-neutral').first().click({ timeout: 4000 }))
}
// 主题页的折叠区（seg-btn / btn-step / btn-toned）
await withState('#/appearance [expanded]', '#/appearance', async () => {
  for (const sel of ['main button:has-text("Custom")', 'main button:has-text("Mask")']) {
    const b = page.locator(sel).first()
    if (await b.count()) { await b.click({ timeout: 2000 }).catch(() => {}) ; await page.waitForTimeout(300) }
  }
})

console.log(`\n===== 主题＝${THEME} | 扫描按钮 ${btnCount} 个 =====`)
const byPage = {}
for (const f of findings) (byPage[f.page] ||= []).push(f)
for (const [pg, list] of Object.entries(byPage)) {
  console.log(`\n--- ${pg} : ${list.length} 项 ---`)
  for (const f of list) {
    console.log(
      `[${f.area}] ${f.tag} "${f.text}" ${Math.round(f.w)}x${Math.round(f.h)} | ${f.cls.slice(0, 70)}\n` +
        `   边框 T=${f.bt} L=${f.bl} R=${f.br} B=${f.bb} 宽 ${f.btw}/${f.blw}/${f.brw}/${f.bbw}\n` +
        `   背景 image=${f.bgi.slice(0, 100)}\n` +
        `   ⇒ ${f.reasons.join(' ;; ')}`,
    )
  }
}
console.log(`\n总计可疑: ${findings.length} | pageerror: ${errs.length}`)
if (errs.length) console.log(errs.slice(0, 5).join('\n'))
await browser.close()
process.exitCode = findings.length > 0 ? 0 : 0
