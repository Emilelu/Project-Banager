// 临时探针：改前测主题页按钮 hover 的 transform / 透明度 / 边缘像素，用于定位「透出」根因
import { chromium } from 'playwright'

const BASE = 'http://localhost:5278'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto(`${BASE}/#/appearance`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// 1) 主题页上的按钮清单
const list = await page.evaluate(() => {
  const out = []
  const nodes = document.querySelectorAll('.btn-base, .btn-press')
  nodes.forEach((el, i) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    out.push({
      i,
      tag: el.tagName,
      cls: el.className.slice(0, 90),
      w: Math.round(r.width),
      h: Math.round(r.height),
      bg: cs.backgroundColor,
      bgi: cs.backgroundImage.slice(0, 60),
      border: cs.borderTopColor + ' ' + cs.borderTopWidth,
      tr: cs.transition.slice(0, 120),
      ts: cs.transform,
      pos: cs.position,
      iso: cs.isolation,
    })
  })
  return out
})
console.log('=== 主题页可点元素 ===')
for (const it of list) console.log(JSON.stringify(it))

// 2) 「随机配色」梯度按钮：hover 后采样 transform
const rand = page.locator('button.btn-base.btn-primary').first()
const box = await rand.boundingBox()
console.log('\n=== 随机配色按钮 box ===', JSON.stringify(box))
const samples = []
await rand.hover()
for (const t of [0, 50, 100, 150, 250, 400, 700]) {
  const v = await page.evaluate(() => {
    const el = document.querySelector('button.btn-base.btn-primary')
    return { tf: getComputedStyle(el).transform, z: getComputedStyle(el).zIndex }
  })
  samples.push({ t, ...v })
  await page.waitForTimeout(t === 0 ? 0 : 0)
}
console.log('hover 后瞬间:', JSON.stringify(samples[0]))

// 重新做一次：hover 后分段采样
await page.mouse.move(5, 5)
await page.waitForTimeout(500)
await rand.hover()
const cur = []
let last = 0
for (const t of [40, 120, 200, 300, 450, 650]) {
  await page.waitForTimeout(t - last)
  last = t
  const v = await page.evaluate(() => {
    const el = document.querySelector('button.btn-base.btn-primary')
    const cs = getComputedStyle(el)
    const m = new DOMMatrix(cs.transform)
    return { scale: +m.a.toFixed(4), bl: cs.filter + '|' + cs.backdropFilter }
  })
  cur.push({ t, ...v })
}
console.log('scale 采样:', JSON.stringify(cur))

// 3) hover 态边缘像素：判断 1px 透明描边/抗锯齿是否露出底层
await page.mouse.move(5, 5)
await page.waitForTimeout(400)
const clip = {
  x: Math.round(box.x - 6),
  y: Math.round(box.y - 6),
  width: Math.round(box.width + 12),
  height: Math.round(box.height + 12),
}
const shotBefore = await page.screenshot({ clip })
await rand.hover()
await page.waitForTimeout(600)
const shotAfter = await page.screenshot({ clip })
const fs = await import('node:fs')
fs.writeFileSync('tests/e2e/_motion-btn-before.png', shotBefore)
fs.writeFileSync('tests/e2e/_motion-btn-after.png', shotAfter)

// 用 sharp 采样边缘像素（仓库已有 sharp 依赖）
const sharp = (await import('sharp')).default
async function probe(png, name) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => {
    const o = (y * info.width + x) * 4
    return [data[o], data[o + 1], data[o + 2]]
  }
  // 按钮在裁剪图中的位置：裁剪偏移 -6px
  const bx = 6
  const by = 6
  const w = Math.round(box.width)
  const h = Math.round(box.height)
  const rows = []
  for (const dx of [-2, -1, 0, 1, 2, w - 3, w - 2, w - 1, w, w + 1]) {
    rows.push({ dx, c: px(bx + dx, by + Math.round(h / 2)) })
  }
  console.log(`\n=== ${name} 水平中线上像素（dx 相对按钮左边） ===`)
  for (const r of rows) console.log(JSON.stringify(r))
  console.log(
    `${name} 按钮外 8px 处（页面底色）:`,
    JSON.stringify(px(bx - 6, by + Math.round(h / 2))),
    '上方 8px:',
    JSON.stringify(px(bx + Math.round(w / 2), by - 6)),
  )
}
await probe('tests/e2e/_motion-btn-before.png', 'before-hover')
await probe('tests/e2e/_motion-btn-after.png', 'after-hover')

console.log('\npageerror:', errs.length, errs.slice(0, 3))
await browser.close()
