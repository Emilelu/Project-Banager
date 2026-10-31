// 决定性实验：把相邻兄弟涂成纯红，看 hover 放大的按钮覆盖区里是否透出红色（= 半透明底）。
// 仅在浏览器会话内改 DOM，不动源码。
import { chromium } from 'playwright'
import sharp from 'sharp'

const BASE = 'http://localhost:5278'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// 找到工具栏里成对的按钮：btn-neutral（半透明白玻璃底）
const neutral = page.locator('.btn-base.btn-neutral').first()
const box = await neutral.boundingBox()
console.log('btn-neutral box', JSON.stringify(box))

// 找一个相邻兄弟（同一 flex 行）
const sib = await page.evaluate(() => {
  const el = document.querySelector('.btn-base.btn-neutral')
  const parent = el.parentElement
  const kids = [...parent.children].filter((k) => k.getBoundingClientRect().width > 0)
  const i = kids.indexOf(el)
  const r = (k) => {
    const b = k.getBoundingClientRect()
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }
  return {
    n: kids.length,
    idx: i,
    self: r(el),
    prev: kids[i - 1] ? r(kids[i - 1]) : null,
    next: kids[i + 1] ? r(kids[i + 1]) : null,
    nextCls: kids[i + 1] ? String(kids[i + 1].className).slice(0, 80) : null,
  }
})
console.log('兄弟布局', JSON.stringify(sib))

// 把「下一个兄弟」涂成纯红（只影响浏览器内存）
await page.evaluate(() => {
  const el = document.querySelector('.btn-base.btn-neutral')
  const kids = [...el.parentElement.children].filter((k) => k.getBoundingClientRect().width > 0)
  const i = kids.indexOf(el)
  const nx = kids[i + 1]
  if (nx) {
    nx.style.setProperty('background-image', 'none', 'important')
    nx.style.setProperty('background-color', 'rgb(255,0,0)', 'important')
    nx.style.setProperty('box-shadow', 'none', 'important')
    nx.style.setProperty('filter', 'none', 'important')
  }
  // 同时给整行父容器涂成纯红，让并列元素放大的重叠区一眼可见
  el.parentElement.style.setProperty('background-color', 'rgb(255,0,0)', 'important')
  el.parentElement.style.setProperty('background-image', 'none', 'important')
})

await page.mouse.move(5, 5)
await page.waitForTimeout(400)
const clip = { x: box.x - 14, y: box.y - 14, width: box.width + 28, height: box.height + 28 }
const fs = await import('node:fs')
fs.writeFileSync('tests/e2e/_alpha-idle.png', await page.screenshot({ clip }))
await neutral.hover()
await page.waitForTimeout(700)
const hoverBox = await neutral.boundingBox()
fs.writeFileSync('tests/e2e/_alpha-hover.png', await page.screenshot({ clip })
)

async function centerRow(png, label) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const y = Math.round(info.height / 2)
  const px = (x) => {
    const o = (y * info.width + x) * 4
    return [data[o], data[o + 1], data[o + 2]]
  }
  const w = Math.round(box.width)
  const picks = [14, 18, 22, 30, Math.round(w / 2), w + 6, w + 10, w + 14, w + 18]
  console.log(`\n=== ${label} 中线像素（x 相对按钮原始左边） ===`)
  for (const dx of picks) console.log(`  dx=${dx}  ${px(14 + dx).join(',')}`)
  console.log(`  （纯红基准 = 255,0,0）`)
}
console.log('hover 前 box', JSON.stringify(box), 'hover 后 box', JSON.stringify(hoverBox))
await centerRow('tests/e2e/_alpha-idle.png', 'idle')
await centerRow('tests/e2e/_alpha-hover.png', 'hover(放大后)')

await browser.close()
