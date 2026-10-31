// 临时验收脚本（跑完删除）：侧栏底部按钮等宽/不截断 + 三分区 + 折叠气泡
import { chromium } from 'playwright'

const BASE = 'http://localhost:5246'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().split('\n')[0]) })

await page.goto(BASE + '/#/watching', { waitUntil: 'load' })
await page.evaluate(() => localStorage.setItem('banager_locale', 'zh'))
await page.evaluate(() => localStorage.setItem('banager_sidebar_collapsed', '0'))
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(2400)

// ---------- 辅助：量底部两枚按钮 ----------
const measureButtons = () =>
  page.evaluate(() => {
    const aside = document.querySelector('aside')
    if (!aside) return { error: 'no aside' }
    const btns = [...aside.querySelectorAll('button')].filter(
      (b) => (b.getAttribute('aria-haspopup') || '') === 'menu',
    )
    if (btns.length !== 2) return { error: 'expect 2 menu buttons, got ' + btns.length }
    const rows = btns.map((b) => {
      const r = b.getBoundingClientRect()
      const span = b.querySelector('span')
      return {
        label: b.textContent.trim(),
        aria: b.getAttribute('aria-label'),
        x: Math.round(r.x * 100) / 100,
        width: Math.round(r.width * 100) / 100,
        height: Math.round(r.height * 100) / 100,
        spanScrollW: span ? span.scrollWidth : null,
        spanClientW: span ? span.clientWidth : null,
        spanText: span ? span.textContent.trim() : null,
        truncCls: span ? 'truncate' in span.classList || !!span.className.includes('truncate') : null,
      }
    })
    // 用 button 自身的滚动宽度判断是否被裁切（除了 span 之外还有图标与 caret）
    const overflow = btns.map((b) => ({
      scrollWidth: b.scrollWidth,
      clientWidth: b.clientWidth,
      clipped: b.scrollWidth > b.clientWidth + 1,
    }))
    return { rows, overflow, asideW: aside.getBoundingClientRect().width }
  })

const checkLang = async (code) => {
  await page.evaluate((c) => {
    // 走官方 composable 的等价路径：顶栏语言菜单 -> 点对应项
    const btn = [...document.querySelectorAll('header button')].find((b) =>
      /切换语言|Switch language|言語を切り替え|语言|Language/i.test(
        (b.getAttribute('aria-label') || '') + (b.getAttribute('title') || ''),
      ),
    )
    btn?.click()
  }, code)
  await page.waitForTimeout(500)
  await page.evaluate((c) => {
    const label = { zh: '中文', en: 'English', ja: '日本語' }[c]
    const items = [...document.querySelectorAll('[role="menuitemradio"]')]
    items.find((i) => i.textContent.includes(label))?.click()
  }, code)
  await page.waitForTimeout(900)
}

const widths = (m) => (m.rows ? m.rows.map((r) => r.width) : [])
const fmt = (m) => {
  if (m.error) return 'ERROR ' + m.error
  return m.rows.map((r) => `"${r.label}" w=${r.width} span=${r.spanClientW}/${r.spanScrollW}`).join(' | ')
}

const results = {}
for (const lang of ['zh', 'en', 'ja']) {
  if (lang !== 'zh') await checkLang(lang)
  const m = await measureButtons()
  const ok = !m.error && Math.abs(widths(m)[0] - widths(m)[1]) <= 1 &&
    m.rows.every((r) => r.spanScrollW === null || r.spanScrollW <= r.spanClientW + 1) &&
    m.overflow.every((o) => !o.clipped)
  results[lang] = {
    ok,
    asideW: m.asideW,
    rows: m.rows,
    overflow: m.overflow,
    detail: fmt(m),
  }
  console.log(`[${lang}] 等宽不截断 = ${ok ? '✅' : '❌'}  ${fmt(m)}`)
  if (!lang.startsWith('zh')) {
    // 切回来
    await checkLang('zh')
  }
}

// ---------- 分区结构 ----------
const sections = await page.evaluate(() => {
  const aside = document.querySelector('aside')
  const nav = aside.querySelector('nav')
  const bottom = nav.parentElement.querySelector('.relative.z-10.border-t')
  // 导航区：按分组标题识别
  const navTitles = [...nav.querySelectorAll('div')]
    .filter((d) => /text-\[0\.6875rem\]/.test(d.className))
    .map((d) => d.textContent.trim())
  const groups = [...nav.children].map((c) => ({
    title: (c.querySelector('div')?.textContent || '').trim(),
    links: [...c.querySelectorAll('a')].map((a) => (a.getAttribute('href') || '').replace('#', '')),
  }))
  const navLinks = [...nav.querySelectorAll('a')].map((a) => ({
    href: (a.getAttribute('href') || '').replace('#', ''),
    text: a.textContent.trim(),
  }))
  const bottomTitle = bottom ? bottom.querySelector('div')?.textContent.trim() : null
  return {
    navTitles,
    groups,
    navLinks,
    bottomTitle,
    hasImportNavLink: navLinks.some((l) => l.href === '/import'),
    totalSections: navTitles.length + (bottomTitle ? 1 : 0),
  }
})
console.log('\n分区标题:', JSON.stringify(sections.navTitles), '+ 底部「' + sections.bottomTitle + '」')
console.log('导航项:', JSON.stringify(sections.navLinks))
console.log('旧导入Excel导航项存在:', sections.hasImportNavLink ? '❌ 仍在' : '✅ 已移除')

// ---------- 底部导入菜单里仍能选 .xlsx ----------
const importMenu = await page.evaluate(() => {
  const aside = document.querySelector('aside')
  const btn = [...aside.querySelectorAll('button')].find((b) => (b.getAttribute('aria-haspopup') || '') === 'menu')
  btn?.click()
  return null
})
await page.waitForTimeout(600)
const importItems = await page.evaluate(() => {
  const m = [...document.querySelectorAll('[role="menu"]')].find((x) => x.getBoundingClientRect().width > 0)
  return m ? [...m.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim()) : []
})
console.log('导入菜单项:', JSON.stringify(importItems))
const hasXlsx = importItems.some((t) => t.includes('.xlsx') || t.includes('Excel'))
console.log('底部导入菜单含 .xlsx:', hasXlsx ? '✅' : '❌')
await page.evaluate(() => document.body.click())
await page.waitForTimeout(400)

// ---------- 折叠态：每个导航项 + logo 悬浮都要出气泡 ----------
await page.evaluate(() => localStorage.setItem('banager_sidebar_collapsed', '1'))
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(2200)

// 页面里有 3 个 role="tooltip"（备份气泡 #backup-tip、时钟气泡 #clock-tip、
// 侧栏气泡），前两个常驻但 opacity-0。这里只看「可见且有文字」的那个。
const TIP_JS = () => {
  const all = [...document.querySelectorAll('[role="tooltip"]')].filter((t) => t.id !== 'backup-tip' && t.id !== 'clock-tip')
  const t = all.find((x) => getComputedStyle(x).opacity !== '0' && x.getBoundingClientRect().width > 0)
  if (!t) return null
  return { text: t.textContent.trim(), visible: true, rect: t.getBoundingClientRect().toJSON() }
}

const tipProbe = async (selectorList) => {
  const out = []
  for (const sel of selectorList) {
    const el = await page.evaluateHandle((s) => {
      const aside = document.querySelector('aside')
      const list = s === 'logo'
        ? [...aside.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height <= 40 && (b.getAttribute('aria-expanded') !== null))
        : [...aside.querySelectorAll(s)]
      return list[0] || null
    }, sel)
    const box = await el.asElement()?.boundingBox()
    if (!box) { out.push({ sel, ok: false, why: 'not found' }); continue }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(450)
    const tip = await page.evaluate(() => {
      const t = document.querySelector('[role="tooltip"]')
      if (!t) return null
      const r = t.getBoundingClientRect()
      const cs = getComputedStyle(t)
      return { text: t.textContent.trim(), opacity: cs.opacity, visible: r.width > 0 && cs.opacity !== '0' }
    })
    out.push({ sel, ok: !!tip && tip.visible, text: tip?.text || null })
    await page.mouse.move(5, 5)
    await page.waitForTimeout(200)
  }
  return out
}

await page.evaluate(() => document.querySelector('aside')?.scrollTo(0, 0))
const tips = await tipProbe(['logo', 'a.nav-item'])
// 全部导航项逐个探测
const navHrefs = await page.evaluate(() =>
  [...document.querySelectorAll('aside nav a')].map((a) => a.getAttribute('href').replace('#', '')),
)

const perLink = []
for (const href of navHrefs) {
  const box = await page.evaluate((h) => {
    const a = document.querySelector(`aside nav a[href="#${h}"]`)
    if (!a) return null
    const r = a.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }, href)
  if (!box) { perLink.push({ href, ok: false, text: null }); continue }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(450)
  const tip = await page.evaluate(() => {
    const t = document.querySelector('[role="tooltip"]')
    if (!t) return null
    const cs = getComputedStyle(t)
    return { text: t.textContent.trim(), visible: cs.opacity !== '0' && t.getBoundingClientRect().width > 0 }
  })
  perLink.push({ href, ok: !!tip?.visible, text: tip?.text || null })
  await page.mouse.move(5, 5)
  await page.waitForTimeout(150)
}

const logoBox = await page.evaluate(() => {
  const aside = document.querySelector('aside')
  const b = [...aside.querySelectorAll('button')].find((x) => x.hasAttribute('aria-expanded'))
  if (!b) return null
  const r = b.getBoundingClientRect()
  return { x: r.x, y: r.y, width: r.width, height: r.height }
})
let logoOk = null
if (logoBox) {
  await page.mouse.move(logoBox.x + logoBox.width / 2, logoBox.y + logoBox.height / 2)
  await page.waitForTimeout(450)
  logoOk = await page.evaluate(() => {
    const t = document.querySelector('[role="tooltip"]')
    if (!t) return null
    return { text: t.textContent.trim(), visible: getComputedStyle(t).opacity !== '0' }
  })
  await page.mouse.move(5, 5)
}

console.log('\n折叠态导航项气泡:')
perLink.forEach((p) => console.log(`  ${p.href}: ${p.ok ? '✅ ' + p.text : '❌ 无气泡'}`))
console.log(`  logo: ${logoOk?.visible ? '✅ ' + logoOk.text : '❌ 无气泡'}`)
const allTipsOk = perLink.every((p) => p.ok) && !!logoOk?.visible

// 折叠态截图
await page.screenshot({ path: 'D:/Files/Projects/Project-Banager/tests/e2e/verify-sb-collapsed.png' })
await page.evaluate(() => localStorage.setItem('banager_sidebar_collapsed', '0'))
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(2000)
await page.screenshot({ path: 'D:/Files/Projects/Project-Banager/tests/e2e/verify-sb-expanded.png' })

console.log('\n错误数:', errs.length)
if (errs.length) console.log(errs.slice(0, 5).join('\n'))

const pass =
  results.zh.ok && results.en.ok && results.ja.ok &&
  !sections.hasImportNavLink && hasXlsx && allTipsOk && errs.length === 0
console.log('\n总判定:', pass ? '✅ PASS' : '❌ FAIL')
await browser.close()
