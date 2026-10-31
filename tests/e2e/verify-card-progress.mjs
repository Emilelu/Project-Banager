import { chromium } from 'playwright'

const BASE = 'http://localhost:5253'
const OUT = 'D:/Files/Projects/Project-Banager/tests/e2e'
const browser = await chromium.launch()
const problems = []

async function seed(page) {
  await page.evaluate(async () => {
    const { getDb } = await import('/src/db/index.js')
    const db = await getDb()
    const names = db.getAllWatching().map((r) => r.name)
    const seed = [
      { name: 'PROBE-25', day_of_week: '周一', current_episode: '3', total_episodes: '12' },
      { name: 'PROBE-100', day_of_week: '周二', current_episode: '12', total_episodes: '12' },
      { name: 'PROBE-NOTOTAL', day_of_week: '周三', current_episode: '5', total_episodes: '' },
      { name: 'PROBE-QMARK', day_of_week: '周四', current_episode: '5', total_episodes: '?' },
      { name: 'PROBE-OVER', day_of_week: '周五', current_episode: '15', total_episodes: '12' },
      { name: 'PROBE-UNSCHED-A', day_of_week: '', current_episode: '3', total_episodes: '12' },
      { name: 'PROBE-UNSCHED-B', day_of_week: '', current_episode: '5', total_episodes: '' },
      { name: 'PROBE-LONGNAME', day_of_week: '周六', current_episode: '9', total_episodes: '13', time_slot: '23:30', notes: '很长很长的备注文字测试溢出' },
    ]
    for (const s of seed) if (!names.includes(s.name)) db.addWatching(s)
    await db.persist?.()
  })
}

function collect() {
  const cards = [...document.querySelectorAll('.watching-card')]
  const rows = []
  for (const c of cards) {
    if (!/PROBE-/.test(c.textContent)) continue
    const name = c.textContent.replace(/\s+/g, ' ').trim().split(/PROBE-/)[1].split(/[e0-9]/)[0]
    const r = c.getBoundingClientRect()
    const bar = c.querySelector('.card-progress')
    const fill = c.querySelector('.card-progress-fill')
    const pct = c.querySelector('.card-progress-pct')
    const epLine = c.querySelector('.card-ep-line')
    const epRow = epLine ? epLine.parentElement.parentElement : null
    const barRect = bar ? bar.getBoundingClientRect() : null
    const fillRect = fill ? fill.getBoundingClientRect() : null
    const slot = c.querySelector('.card-progress-slot')
    rows.push({
      fullName: c.querySelector('.text-base')?.textContent.trim(),
      cardText: c.textContent.replace(/\s+/g, ' ').trim(),
      cardW: Math.round(r.width),
      cardH: Math.round(r.height),
      overflowX: c.scrollWidth - c.clientWidth,
      hasBar: !!bar,
      barRole: bar ? bar.getAttribute('role') : null,
      ariaNow: bar ? bar.getAttribute('aria-valuenow') : null,
      ariaMin: bar ? bar.getAttribute('aria-valuemin') : null,
      ariaMax: bar ? bar.getAttribute('aria-valuemax') : null,
      barH: barRect ? Math.round(barRect.height * 10) / 10 : null,
      barW: barRect ? Math.round(barRect.width) : null,
      fillW: fillRect ? Math.round(fillRect.width) : null,
      fillRatio: fillRect && barRect ? Math.round((fillRect.width / barRect.width) * 100) / 100 : null,
      fillBg: fill ? getComputedStyle(fill).backgroundImage : null,
      pctText: pct ? pct.textContent.trim() : null,
      pctColor: pct ? getComputedStyle(pct).color : null,
      pctTitle: pct ? pct.getAttribute('title') : null,
      barBg: bar ? getComputedStyle(bar).backgroundColor : null,
      slotH: slot ? Math.round(slot.getBoundingClientRect().height * 10) / 10 : null,
      epRowH: epRow ? Math.round(epRow.getBoundingClientRect().height * 10) / 10 : null,
      pctRightGap: pct && epRow
        ? Math.round((epRow.getBoundingClientRect().right - pct.getBoundingClientRect().right) * 10) / 10
        : null,
      // 百分比与集数文字之间的空隙（负值 = 糊在一起）
      pctVsEpGap: pct && epLine
        ? Math.round((pct.getBoundingClientRect().left - epLine.getBoundingClientRect().right) * 10) / 10
        : null,
      // 百分比右缘与 +/- 按钮左缘的空隙（应为小正值，说明右对齐到按钮左边）
      pctToBtnGap: pct && c.querySelector('.card-progress-pct') && c.querySelector('.btn-mini-plus')
        ? Math.round((c.querySelector('.btn-mini-plus').getBoundingClientRect().left - pct.getBoundingClientRect().right) * 10) / 10
        : null,
      epLineWraps: epLine ? epLine.getBoundingClientRect().height > 22 : null,
    })
  }
  return rows
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().split('\n')[0]) })

await page.goto(`${BASE}/#/watching`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await seed(page)
// 用 hash 切页让 WatchingView 重新挂载并重读数据（同 URL goto 只是同文档跳转，不会重新拉库）
await page.waitForTimeout(500)
await page.evaluate(() => { location.hash = '#/remaining' })
await page.waitForTimeout(700)
await page.evaluate(() => { location.hash = '#/watching' })
await page.waitForTimeout(2500)
console.log('route:', await page.evaluate(() => location.href))

const light = await page.evaluate(collect)
console.log('cards found:', light.length, '| total .watching-card:', await page.evaluate(() => document.querySelectorAll('.watching-card').length))
console.log('names:', await page.evaluate(() => [...document.querySelectorAll('.watching-card .text-base')].map((e) => e.textContent.trim()).slice(0, 12)))
console.log('=== LIGHT ===')
console.log(JSON.stringify(light, null, 1))

// 主题色切换实测：改 --c-primary 后填充条是否跟随
const themeProbe = await page.evaluate(() => {
  const fill = document.querySelector('.watching-card .card-progress-fill')
  if (!fill) return null
  const before = getComputedStyle(fill).backgroundImage
  document.documentElement.style.setProperty('--c-primary', '0 128 255')
  document.documentElement.style.setProperty('--c-primary-dark', '0 90 200')
  const after = getComputedStyle(fill).backgroundImage
  document.documentElement.style.removeProperty('--c-primary')
  document.documentElement.style.removeProperty('--c-primary-dark')
  return { before, after, changed: before !== after }
})
console.log('=== THEME FOLLOW ===')
console.log(JSON.stringify(themeProbe, null, 1))

await page.screenshot({ path: `${OUT}/verify-card-light.png` })
// 只截周历卡片区便于肉眼确认
await page.locator('.grid.grid-cols-7').first().screenshot({ path: `${OUT}/verify-card-light-grid.png` })

// 深色模式：与 useTheme 一致，靠 html.dark + body.dark
await page.evaluate(() => {
  document.documentElement.classList.add('dark')
  document.body.classList.add('dark')
})
await page.waitForTimeout(600)
const dark = await page.evaluate(collect)
console.log('=== DARK ===')
console.log(JSON.stringify(dark.map((r) => ({
  name: r.fullName, hasBar: r.hasBar, fillRatio: r.fillRatio, fillBg: r.fillBg,
  pctColor: r.pctColor, barBg: r.barBg, overflowX: r.overflowX,
})), null, 1))
await page.screenshot({ path: `${OUT}/verify-card-dark.png` })
await page.locator('.grid.grid-cols-7').first().screenshot({ path: `${OUT}/verify-card-dark-grid.png` })

// 边界断言
const byName = (list, n) => list.find((r) => r.fullName === n) || {}
const checks = []
const L = light
checks.push(['25% 有进度条', !!byName(L, 'PROBE-25').hasBar])
checks.push(['25% 填充 25%', byName(L, 'PROBE-25').fillRatio === 0.25])
checks.push(['25% 文字 25%', byName(L, 'PROBE-25').pctText === '25%'])
checks.push(['100% 有进度条', !!byName(L, 'PROBE-100').hasBar])
checks.push(['100% 填充 100%', byName(L, 'PROBE-100').fillRatio === 1])
checks.push(['100% 绿色填充', /rgb\(16, 185, 129\)|rgb\(5, 150, 105\)/.test(byName(L, 'PROBE-100').fillBg)])
checks.push(['无总集数 无进度条', !byName(L, 'PROBE-NOTOTAL').hasBar])
checks.push(['? 无进度条', !byName(L, 'PROBE-QMARK').hasBar])
checks.push(['超集数 无进度条', !byName(L, 'PROBE-OVER').hasBar])
checks.push(['超集数 文字仍为 e15', byName(L, 'PROBE-OVER').cardText.includes('e15') && !byName(L, 'PROBE-OVER').cardText.includes('15/12')])
for (const [i, n] of ['PROBE-25', 'PROBE-100', 'PROBE-NOTOTAL', 'PROBE-QMARK', 'PROBE-OVER'].entries()) {
  const c = byName(L, n)
  checks.push([`${n} 无横向溢出`, c.overflowX === 0])
  checks.push([`${n} 进度占位恒定高度`, c.slotH !== null && c.slotH < 5])
  checks.push([`${n} 集数行不折行`, c.epLineWraps === false])
  if (c.hasBar) {
    checks.push([`${n} 百分比与集数不粘连(≥4px)`, c.pctVsEpGap >= 4])
    checks.push([`${n} 百分比右对齐到 +/- 按钮左侧(间隙<8px)`, c.pctToBtnGap !== null && c.pctToBtnGap >= 0 && c.pctToBtnGap < 8])
  }
}
// 有 / 无进度的卡片在自动高度场景下高度差 ≤1px（进度条不撑高卡片）
const hA = byName(L, 'PROBE-UNSCHED-A').cardH
const hB = byName(L, 'PROBE-UNSCHED-B').cardH
checks.push(['未排期卡片 有/无进度 高度一致(±1px)', Math.abs(hA - hB) <= 1])
checks.push(['aria-valuenow=25', byName(L, 'PROBE-25').ariaNow === '25'])
checks.push(['aria min/max', byName(L, 'PROBE-25').ariaMin === '0' && byName(L, 'PROBE-25').ariaMax === '100'])
checks.push(['progressbar role', byName(L, 'PROBE-25').barRole === 'progressbar'])
checks.push(['title 保留', !!byName(L, 'PROBE-25').pctTitle])
checks.push(['主题色切换生效', themeProbe && themeProbe.changed])
checks.push(['深色 25% 填充跟随 primary-light', /rgb\(167, 139, 250\)|rgb\(124, 58, 237\)/.test(byName(dark, 'PROBE-25').fillBg)])
checks.push(['深色 100% 绿色', /rgb\(16, 185, 129\)/.test(byName(dark, 'PROBE-100').fillBg)])
checks.push(['深色轨道可见(非透明)', byName(dark, 'PROBE-25').barBg !== 'rgba(0, 0, 0, 0)'])

console.log('=== CHECKS ===')
let fails = 0
for (const [label, ok] of checks) {
  if (!ok) fails++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`)
}
console.log('fails:', fails)

// 未排期卡片高度对比（w-64 自动高度场景）
const unsch = light.filter((r) => r.fullName && r.fullName.startsWith('PROBE-UNSCHED'))
console.log('=== UNSCHEDULED ===', JSON.stringify(unsch.map((r) => ({
  name: r.fullName, hasBar: r.hasBar, h: r.cardH, overflowX: r.overflowX,
})), null, 1))
console.log('problems:', problems.length)
if (problems.length) console.log(problems.slice(0, 6).join('\n'))
await browser.close()
