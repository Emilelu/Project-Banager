// 临时脚本：折叠态气泡逐个探测（跑完删除）
import { chromium } from 'playwright'

const BASE = 'http://localhost:5246'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto(BASE + '/#/watching', { waitUntil: 'load' })
await page.evaluate(() => localStorage.setItem('banager_locale', 'zh'))
await page.evaluate(() => localStorage.setItem('banager_sidebar_collapsed', '1'))
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(2400)

// 页面上 role="tooltip" 有三个：#backup-tip / #clock-tip 常驻但 opacity-0，
// 侧栏气泡没有 id。只认「可见」的那个。
const readTip = () =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('[role="tooltip"]')].filter(
      (t) => t.id !== 'backup-tip' && t.id !== 'clock-tip',
    )
    const t = all.find((x) => getComputedStyle(x).opacity !== '0' && x.getBoundingClientRect().width > 0)
    if (!t) return null
    const r = t.getBoundingClientRect()
    return {
      text: t.textContent.trim(),
      left: Math.round(r.left),
      top: Math.round(r.top),
      right: Math.round(r.right),
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
    }
  })

const asideW = await page.evaluate(() => document.querySelector('aside').getBoundingClientRect().width)
console.log('侧栏宽度(折叠):', asideW)

const probe = async (label, boxGetter) => {
  const box = await boxGetter()
  if (!box) return { label, ok: false, why: 'not found' }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(500)
  const tip = await readTip()
  await page.mouse.move(3, 3)
  await page.waitForTimeout(220)
  return { label, ok: !!tip, tip }
}

// logo 按钮（带 aria-expanded 的那个）
const logo = await probe('logo', () =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll('aside button')].find((x) => x.hasAttribute('aria-expanded'))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }),
)

// 每个导航项
const hrefs = await page.evaluate(() =>
  [...document.querySelectorAll('aside nav a')].map((a) => a.getAttribute('href')),
)
const links = []
for (const href of hrefs) {
  const p = await probe(href, () =>
    page.evaluate((h) => {
      const a = document.querySelector(`aside nav a[href="${h}"]`)
      if (!a) return null
      const r = a.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }, href),
  )
  links.push(p)
}

// 底部两枚菜单按钮
const bottomBtns = []
const btnCount = await page.evaluate(
  () => [...document.querySelectorAll('aside button')].filter((b) => b.hasAttribute('aria-haspopup')).length,
)
for (let i = 0; i < btnCount; i++) {
  bottomBtns.push(
    await probe('bottom#' + i, () =>
      page.evaluate((idx) => {
        const list = [...document.querySelectorAll('aside button')].filter((b) => b.hasAttribute('aria-haspopup'))
        const b = list[idx]
        if (!b) return null
        const r = b.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }, i),
    ),
  )
}

console.log('\nlogo:', logo.ok ? '✅ ' + logo.tip.text : '❌ 无气泡')
for (const l of links) console.log(`${l.label}: ${l.ok ? '✅ ' + l.tip.text : '❌ 无气泡'}  (视口内: ${l.tip?.inViewport})`)
for (const b of bottomBtns) console.log(`${b.label}: ${b.ok ? '✅ ' + b.tip.text : '❌ 无气泡'}`)

const pass = logo.ok && links.every((l) => l.ok) && bottomBtns.every((b) => b.ok) && links.every((l) => l.tip.inViewport)
console.log('\n判定:', pass ? '✅ PASS（每个入口都有气泡且在视口内）' : '❌ FAIL')
console.log('错误数:', errs.length)
await page.screenshot({ path: 'D:/Files/Projects/Project-Banager/tests/e2e/verify-sb-collapsed.png' })
await browser.close()
