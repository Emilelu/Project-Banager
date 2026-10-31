import { chromium } from 'playwright'

const BASE = 'http://localhost:5198'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto(`${BASE}/#/watching`, { waitUntil: 'load' })
await page.waitForTimeout(2200)

// 打开语言菜单
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('header button')].find(b => {
    const a = b.getAttribute('aria-label') || b.getAttribute('title') || ''
    return /切换语言|Switch language|言語を切り替え|语言|Language/i.test(a)
  })
  btn?.click()
})
await page.waitForTimeout(900)

const info = await page.evaluate(() => {
  const menu = document.querySelector('[role="menu"]')
  if (!menu) return { open: false }
  const r = menu.getBoundingClientRect()

  // 关键：在菜单中心点上做命中测试，看顶层元素是不是菜单或它的子元素
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const topEl = document.elementFromPoint(cx, cy)
  const inside = menu.contains(topEl)

  // 检查是否被 main 区域遮挡：取菜单与主内容的 z 序
  const cs = getComputedStyle(menu)
  return {
    open: true,
    rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    zIndex: cs.zIndex,
    position: cs.position,
    insideViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
    parentIsBody: menu.parentElement === document.body,
    hitTestPass: inside,
    hitElement: topEl ? `${topEl.tagName}.${(topEl.className || '').toString().slice(0, 40)}` : 'null',
    items: [...menu.querySelectorAll('[role="menuitemradio"]')].map(i => i.textContent.trim()),
  }
})
console.log('菜单:', JSON.stringify(info, null, 1))
console.log('\n判定:')
console.log('  不被遮挡:', info.hitTestPass)
console.log('  挂到 body:', info.parentIsBody)
console.log('  在视口内:', info.insideViewport)

// 点击菜单项应生效
await page.evaluate(() => {
  const items = [...document.querySelectorAll('[role="menuitemradio"]')]
  items.find(i => /日本語/.test(i.textContent))?.click()
})
await page.waitForTimeout(1200)
console.log('  切日文成功:', await page.evaluate(() => document.documentElement.lang === 'ja'))
console.log('  菜单已关闭:', await page.evaluate(() => !document.querySelector('[role="menu"]')))

console.log('错误数:', errs.length)
await page.screenshot({ path: 'D:/Files/Projects/Project-Banager/tests/e2e/lang-menu-fixed.png' })
await browser.close()
