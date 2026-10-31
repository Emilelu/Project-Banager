import { chromium } from 'playwright'
import path from 'node:path'

const ROOT = 'D:/Files/Projects/Project-Banager'
const BASE = 'http://localhost:5180'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
const logs = []
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().split('\n')[0]}`) })
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
const body = () => page.locator('body').innerText()
const step = (label, v) => console.log(`${label}: ${v}`)

await page.goto(`${BASE}/#/import`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.locator('input[accept=".xlsx,.xls"]').setInputFiles(path.join(ROOT, 'template.xlsx'))
await page.waitForTimeout(600)
await page.locator('button:has-text("开始导入")').click()
await page.waitForTimeout(5000)
const impText = await body()
step('导入结果', (impText.match(/成功导入 \d+ 条数据，失败 \d+ 条/) || ['无'])[0])
step('导入有错误块', impText.includes('警告/错误'))

await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
step('追番卡片数', await page.locator('.watching-card').count())
step('本月横幅存在', (await body()).includes('本月有'))

await page.goto(`${BASE}/#/watched`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
step('已看页总计', ((await body()).match(/总计: \d+部/) || ['无'])[0])

const dlPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null)
await page.locator('button:has-text("导出备份")').click()
const dl = await dlPromise
step('导出文件', dl ? dl.suggestedFilename() : 'NONE')
if (dl) await dl.saveAs(path.join(ROOT, 'tests/e2e/backup-v2.db'))

await page.locator('input[accept=".db,.sqlite,.bak"]').setInputFiles(path.join(ROOT, 'template.xlsx'))
await page.waitForTimeout(600)
await page.locator('button:has-text("确认导入")').click()
await page.waitForTimeout(2000)
step('非法恢复被拒', (await body()).match(/不是有效的 SQLite[^\n]*/)?.[0] || 'none')

await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.locator('button:has-text("添加番剧")').first().click()
await page.locator('input[placeholder="请输入番剧名称"]').fill('恢复失败后仍可添加')
await page.locator('button:has-text("保存")').last().click()
await page.waitForTimeout(1500)
step('失败后仍能写入', (await body()).includes('恢复失败后仍可添加'))

step('控制台错误数', logs.length)
if (logs.length) console.log(logs.slice(0, 12).join('\n'))
await browser.close()
