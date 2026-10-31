// 诊断「放大后透过/叠加」到底发生在哪：半透明底？还是相邻兄弟绘制在上面（层叠交错）？
import { chromium } from 'playwright'
import sharp from 'sharp'

const BASE = 'http://localhost:5278'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await page.goto(`${BASE}/#/appearance`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// 找到「配色来源」的两个并排 seg-btn（grid-cols-2 gap-2）
const segs = page.locator('.seg-btn')
const n = await segs.count()
console.log('seg-btn 数量:', n)
const first = segs.nth(0)
const second = segs.nth(1)
const b1 = await first.boundingBox()
const b2 = await second.boundingBox()
console.log('seg#0 box', JSON.stringify(b1))
console.log('seg#1 box', JSON.stringify(b2))
console.log('gap px:', b2.x - (b1.x + b1.width))

// 1) 命中测试：hover 第一个（放大后跨过接缝），接缝处最上层是谁？
await page.mouse.move(5, 5)
await page.waitForTimeout(400)
await first.hover()
await page.waitForTimeout(600)
const midY = Math.round(b1.y + b1.height / 2)
const seamX = b1.x + b1.width // 第 0 个按钮原始右边缘
const hits = await page.evaluate(
  ({ ys, xs }) => {
    const out = []
    for (const x of xs) {
      const el = document.elementFromPoint(x, ys)
      out.push({
        x: Math.round(x),
        tag: el ? el.tagName : null,
        cls: el ? String(el.className).slice(0, 60) : null,
        txt: el ? el.textContent.trim().slice(0, 12) : null,
      })
    }
    return out
  },
  { ys: midY, xs: [seamX - 8, seamX - 4, seamX, seamX + 2, seamX + 4, seamX + 6] },
)
console.log('hover seg#0 后接缝命中:', JSON.stringify(hits, null, 0))

// 2) 像素：接缝两侧截图
const clip = {
  x: Math.round(seamX - 20),
  y: Math.round(b1.y - 12),
  width: 44,
  height: Math.round(b1.height + 24),
}
const fs = await import('node:fs')
fs.writeFileSync('tests/e2e/_seam-hover0.png', await page.screenshot({ clip }))
const { data, info } = await sharp('tests/e2e/_seam-hover0.png').ensureAlpha().raw().toBuffer({
  resolveWithObject: true,
})
const rowY = 12 + Math.round(b1.height / 2)
const row = []
for (let x = 0; x < info.width; x += 1) {
  const o = (rowY * info.width + x) * 4
  row.push({ dx: x - 20, c: [data[o], data[o + 1], data[o + 2]] })
}
console.log('接缝水平扫描（dx 相对原始右边缘）:')
for (const r of row) console.log(`  ${r.dx} ${r.c.join(',')}`)

// 3) 半透明按钮（seg-idle 本身 hover）时按钮内部像素 vs 卡片像素 —— 看是否透出
await page.mouse.move(5, 5)
await page.waitForTimeout(500)
await second.hover()
await page.waitForTimeout(600)
fs.writeFileSync('tests/e2e/_seam-hover1.png', await page.screenshot({ clip }))

// 4) 无背景的图标按钮放大后是否会「露出」隔壁
const iconBtn = page.locator('button.btn-press.text-gray-400').first()
const ib = await iconBtn.boundingBox()
console.log('\n图标按钮 box', JSON.stringify(ib))
await page.mouse.move(5, 5)
await page.waitForTimeout(400)
await iconBtn.hover()
await page.waitForTimeout(500)
console.log(
  '图标按钮 hover 生效?',
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    return getComputedStyle(el).transform
  }, 'button.btn-press.text-gray-400'),
)

await browser.close()
