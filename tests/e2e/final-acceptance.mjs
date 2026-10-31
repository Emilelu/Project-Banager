import { chromium } from 'playwright'

const BASE = 'http://localhost:5188'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

// 中日共用汉字的字符集较难区分，这里用「简体中文特有字/词」来判断泄漏
const ZH_ONLY = /[这那个们说时见让给对从还没为么应当经过开关闭页面选择删除编辑导入测试]/

async function checkLocale(locale) {
  await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
  await page.evaluate((l) => localStorage.setItem('banager_locale', l), locale)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
  const text = await page.locator('body').innerText()
  const leftovers = (text.match(ZH_ONLY) || []).length
  return { text, leftovers }
}

for (const [locale, name] of [['zh', '中文'], ['en', '英文'], ['ja', '日文']]) {
  const { text, leftovers } = await checkLocale(locale)
  console.log(`[${name}] 疑似中文残留字符数: ${leftovers}`)
  if (locale !== 'zh') {
    const lines = text.split('\n').filter((l) => ZH_ONLY.test(l)).slice(0, 6)
    if (lines.length) lines.forEach((l) => console.log('   →', l.slice(0, 60)))
  }
  await page.screenshot({ path: `D:/Files/Projects/Project-Banager/tests/e2e/final-${locale}.png` })
}

// 各页面切换一遍，确认无编译/运行时错误
for (const route of ['watching', 'remaining', 'watched', 'import']) {
  await page.goto(`${BASE}/#/${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  console.log(`/${route} 加载正常:`, (await page.locator('body').innerText()).length > 100)
}

console.log('错误数:', errs.length)
if (errs.length) console.log(errs.slice(0, 4).join('\n'))
await browser.close()
