/**
 * 临时探针（整页截图 + 整数像素读取，避免子像素重采样污染）
 * node tests/e2e/verify-borders-rings.mjs light|dark
 */
import { chromium } from 'playwright'
import sharp from 'sharp'

const BASE = 'http://localhost:5250'
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.addInitScript((t) => { try { localStorage.setItem('bangumi-theme', t) } catch {} }, THEME)

await page.goto(`${BASE}/#/appearance`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const VARIANTS = [
  { k: 'primary', cls: 'btn-base btn-primary' },
  { k: 'primary-transparent', cls: 'btn-base btn-primary', extra: 'border-color:transparent!important' },
  { k: 'toned', cls: 'btn-base btn-toned' },
  { k: 'toned-transparent', cls: 'btn-base btn-toned', extra: 'border-color:transparent!important' },
  { k: 'danger', cls: 'btn-base btn-danger' },
  { k: 'neutral', cls: 'btn-base btn-neutral' },
  { k: 'ghost', cls: 'app-btn-ghost' },
  { k: 'step', cls: 'btn-step' },
  { k: 'segActive', cls: 'seg-btn seg-active' },
  { k: 'segIdle', cls: 'seg-btn seg-idle' },
  { k: 'plain-gradient', cls: '', extra: 'background-image:linear-gradient(to right,rgb(var(--c-primary)),rgb(var(--c-primary-dark)));border-radius:.75rem' },
  { k: 'plain-gradient-border', cls: '', extra: 'background-image:linear-gradient(to right,rgb(var(--c-primary)),rgb(var(--c-primary-dark)));border:1px solid transparent;border-radius:.75rem' },
]

const STAGES = { white: '#ffffff', darkgray: '#374151', colorgrad: 'linear-gradient(90deg,#ef4444,#3b82f6)' }

async function mount(bg) {
  await page.evaluate(
    ({ variants, bg }) => {
      document.getElementById('__probe')?.remove()
      const host = document.createElement('div')
      host.id = '__probe'
      // 固定在整数坐标上，避免亚像素
      host.style.cssText = `position:fixed;left:0;top:0;width:1400px;height:1000px;z-index:99999;background:${bg};padding:16px;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;align-items:flex-start`
      for (const v of variants) {
        const b = document.createElement('button')
        b.className = v.cls
        b.dataset.k = v.k
        b.style.cssText =
          'width:200px;height:30px;padding:0;font-size:0;line-height:0;border-radius:.75rem;' + (v.extra || '')
        host.appendChild(b)
      }
      document.body.appendChild(host)
    },
    { variants: VARIANTS, bg: STAGES[bg] },
  )
  await page.waitForTimeout(300)
}

for (const stage of Object.keys(STAGES)) {
  await mount(stage)
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('#__probe button')].map((e) => {
      const r = e.getBoundingClientRect()
      const st = getComputedStyle(e)
      return {
        k: e.dataset.k,
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        border: `${st.borderTopWidth} ${st.borderTopColor}`,
        clip: st.backgroundClip,
        bgi: st.backgroundImage.slice(0, 90),
        bgc: st.backgroundColor,
        radius: st.borderTopLeftRadius,
      }
    }),
  )
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 1400, height: 1000 } })
  const { data: raw, info } = await sharp(shot).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const C = info.channels
  const px = (x, y) => {
    const i = (y * W + x) * C
    return [raw[i], raw[i + 1], raw[i + 2]]
  }
  const fmt = (c) => `${c[0]},${c[1]},${c[2]}`

  console.log(`\n######## 舞台=${stage}  主题=${THEME} ########`)
  for (const b of boxes) {
    const y = b.y + Math.round(b.h / 2)
    // 左：外(-3..-1) / 边框环(0,1) / 内部(+3,+6)
    const L = [-3, -2, -1, 0, 1, 2, 3, 6].map((d) => `${d}:${fmt(px(b.x + d, y))}`)
    const R = [-6, -3, -2, -1, 0, 1, 2, 3].map((d) => `${d}:${fmt(px(b.x + b.w - 1 + d, y))}`)
    console.log(`\n· ${b.k}  border=${b.border} clip=${b.clip} radius=${b.radius}`)
    console.log(`   bgImage=${b.bgi}  bgColor=${b.bgc}`)
    console.log(`   左(x=框左边界起) ${L.join('  ')}`)
    console.log(`   右(x=框右边界起) ${R.join('  ')}`)
  }
}
await page.evaluate(() => document.getElementById('__probe')?.remove())
await browser.close()
