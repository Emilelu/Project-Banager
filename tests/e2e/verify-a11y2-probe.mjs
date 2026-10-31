/** 临时探针：确认页面结构、弹窗入口、主题/壁纸状态 */
import { chromium } from 'playwright'
const BASE = 'http://localhost:5256'

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })).newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.goto(`${BASE}/#/import`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const hasFile = await page.locator('input[accept=".xlsx,.xls"]').count()
console.log('import 文件输入:', hasFile)
if (hasFile) {
  await page.locator('input[accept=".xlsx,.xls"]').setInputFiles('D:/Files/Projects/Project-Banager/template.xlsx')
  await page.waitForTimeout(600)
  await page.locator('button:has-text("开始导入")').click()
  await page.waitForTimeout(5000)
}

for (const r of ['/watching', '/remaining', '/watched', '/tags', '/appearance', '/import']) {
  await page.goto(`${BASE}/#${r}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const info = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('main button, header button')]
      .map((b) => ({ txt: b.textContent.trim().replace(/\s+/g, ' ').slice(0, 28), label: b.getAttribute('aria-label'), title: b.getAttribute('title') }))
      .filter((b) => b.txt || b.label || b.title)
    return {
      theme: document.documentElement.className + '|' + document.body.className,
      dark: !!document.querySelector('.dark-mode'),
      bg: document.body.getAttribute('data-bg'),
      mainText: document.querySelector('main')?.innerText.slice(0, 200).replace(/\n+/g, ' | '),
      buttons: buttons.slice(0, 40),
      cardCount: document.querySelectorAll('.watching-card').length,
    }
  })
  console.log('\n===', r, 'dark=', info.dark, 'card=', info.cardCount, '===')
  console.log('main:', info.mainText)
  console.log('buttons:', JSON.stringify(info.buttons.slice(0, 12)))
}

// 弹窗入口探测
await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const toolbar = await page.evaluate(() => [...document.querySelectorAll('main button')].map((b) => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 20)))
console.log('\nwatching toolbar:', JSON.stringify(toolbar))

await browser.close()
