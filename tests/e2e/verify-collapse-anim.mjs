/**
 * 临时验收脚本（跑完即删）：验证主题页两个折叠块的 collapse 过渡是「渐进」而非瞬间切换。
 *
 * 采样在页面内完成（rAF + 同步 click），从点击瞬间计时，
 * 避免 Playwright 点击前的可操作性检查（~400ms）把 60/150/350ms 采样点挤到点击之后。
 * 采样对象 = <transition> 的直接子元素（card → .collapse-shell → root），
 * 它是 display:grid + grid-template-rows 0fr↔1fr 的容器，height 随插值变化。
 *
 * 注意：另一个子代理可能正在改其他文件，Vite 的 HMR 会整页 reload 并重置折叠状态。
 * 这里监听 load 事件，一旦中途 reload 就重试，避免误判。
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5248'
const browser = await chromium.launch()

async function attempt() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  let loads = 0
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('load', () => { loads++ })

  await page.goto(`${BASE}/#/appearance`, { waitUntil: 'load' })
  await page.evaluate(() => {
    localStorage.setItem('banager_locale', 'zh')
    localStorage.removeItem('banager_appearance')
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1800)
  const loadsBeforeWork = loads

  const reloadedMidway = () => loads > loadsBeforeWork

  async function runSamples(cardSel, buttonText, ms = 800) {
    await page.evaluate(({ cardSel, buttonText, ms }) => {
      const btn = [...document.querySelectorAll('button')]
        .find((b) => (b.textContent || '').trim() === buttonText)
      if (!btn) throw new Error(`button not found: ${buttonText}`)
      window.__samples = []
      const t0 = performance.now()
      const tick = () => {
        const card = document.querySelector(cardSel)
        const root = card ? card.parentElement?.parentElement : null
        window.__samples.push({
          t: Math.round(performance.now() - t0),
          h: root ? +root.getBoundingClientRect().height.toFixed(2) : null,
        })
        if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      }
      tick()
      btn.click()
    }, { cardSel, buttonText, ms })
    await page.waitForTimeout(ms + 80)
    return page.evaluate(() => window.__samples)
  }

  const win = (samples, lo, hi) => samples.filter((s) => s.h != null && s.t >= lo && s.t <= hi)
  const last = (samples) => [...samples].filter((s) => s.h != null).pop()

  const out = {}
  async function runBlock(name, cardSel, buttonText) {
    const expand = await runSamples(cardSel, buttonText)
    const finalH = Math.max(...expand.filter((s) => s.h != null).map((s) => s.h))
    const collapse = await runSamples(cardSel, buttonText)
    return { name, finalH, expand, collapse }
  }

  const colorBlock = await runBlock('自定义颜色', '.tone-panel', '自定义颜色')
  const tuningBlock = await runBlock('遮罩与模糊', '.tone-tuning', '遮罩与模糊')

  // 「恢复默认」按钮在展开时应淡入（opacity 从 0 走到 1）
  const resetOpacity = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => (b.textContent || '').trim().startsWith('遮罩与模糊'))
    const isOpen = !!document.querySelector('.tone-tuning')
    if (isOpen) btn.click() // 先收起，保证下一次是展开
    await new Promise((r) => setTimeout(r, 700))
    const vals = []
    const t0 = performance.now()
    const tick = () => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => (x.textContent || '').includes('恢复默认'))
      vals.push({ t: Math.round(performance.now() - t0), o: b ? +getComputedStyle(b).opacity : null })
      if (performance.now() - t0 < 400) requestAnimationFrame(tick)
    }
    tick()
    btn.click()
    await new Promise((r) => setTimeout(r, 450))
    return vals
  })

  await ctx.close()
  return { out: { colorBlock, tuningBlock }, resetOpacity, errs, reloadedMidway: reloadedMidway() }
}

let res = await attempt()
if (res.reloadedMidway) {
  console.log('检测到中途 HMR 整页 reload，重试一次…')
  res = await attempt()
}

// ---------- 断言 ----------
const nonNull = (samples) => samples.filter((s) => s.h != null)
const lastOf = (samples) => nonNull(samples).pop()
function evaluateBlock(b) {
  const finalH = b.finalH
  const e = b.expand
  const c = b.collapse
  // 存在严格中间态（这是「渐进」的核心证据）
  const eMid = nonNull(e).find((s) => s.h > 0.5 && s.h < finalH - 0.5)
  const eEarly = nonNull(e).find((s) => s.t <= 160 && s.h > 0.5 && s.h < finalH - 0.5)
  const eLate = nonNull(e).find((s) => s.t >= 200 && s.h >= finalH - 2)
  const eSeq = nonNull(e).filter((s) => s.t <= 320)
  const eMono = eSeq.every((s, i) => i === 0 || s.h >= eSeq[i - 1].h - 0.6)

  const cMid = nonNull(c).find((s) => s.h > 0.5 && s.h < finalH - 0.5)
  const cEarly = nonNull(c).find((s) => s.t <= 200 && s.h > 0.5 && s.h < finalH - 0.5)
  const cEndH = c.some((s) => s.h == null) ? 0 : (lastOf(c)?.h ?? 999)
  const cSeq = nonNull(c).filter((s) => s.t <= 300)
  const cMono = cSeq.every((s, i) => i === 0 || s.h <= cSeq[i - 1].h + 0.6)

  const checks = [
    ['展开存在中间高度（严格介于 0 与最终）', !!eMid],
    ['展开前 160ms 已开始增长（非瞬跳）', !!eEarly],
    ['展开 200ms 后达到最终高度 ±2px', !!eLate],
    ['展开序列单调不降（非闪烁）', eMono],
    ['收起存在中间高度（严格介于 0 与初始）', !!cMid],
    ['收起前 200ms 已在缩小（非瞬跳）', !!cEarly],
    ['收起结束已归零/元素已移除', cEndH < 2],
    ['收起序列单调不增', cMono],
  ]
  return { checks, finalH }
}

console.log('\n========== 实测高度采样 ==========')
let allOk = true
for (const b of [res.out.colorBlock, res.out.tuningBlock]) {
  const { checks, finalH } = evaluateBlock(b)
  const fmt = (arr, lo, hi) => arr
    .filter((s) => s.h != null && s.t >= lo && s.t <= hi)
    .map((s) => `${s.t}ms=${s.h}px`)
    .join(', ')
  console.log(`\n【${b.name}】最终高度 ${finalH}px`)
  console.log(`  展开 0-120ms : ${fmt(b.expand, 0, 120)}`)
  console.log(`  展开 120-250ms: ${fmt(b.expand, 120, 250)}`)
  console.log(`  展开 250-500ms: ${fmt(b.expand, 250, 500)}`)
  console.log(`  收起 0-120ms : ${fmt(b.collapse, 0, 120)}`)
  console.log(`  收起 120-250ms: ${fmt(b.collapse, 120, 250)}`)
  console.log(`  收起 250-500ms: ${fmt(b.collapse, 250, 500)}`)
  for (const [k, ok] of checks) {
    if (!ok) allOk = false
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${k}`)
  }
}

// 「恢复默认」淡入检查
const ro = res.resetOpacity.filter((s) => s.o != null)
const roMid = ro.find((s) => s.t >= 60 && s.t <= 250 && s.o > 0.05 && s.o < 0.95)
console.log(`\n【恢复默认按钮淡入】${ro.filter((s) => s.t <= 320).map((s) => `${s.t}ms=opacity ${s.o}`).join(', ')}`)
const roOk = !!roMid
if (!roOk) allOk = false
console.log(`  ${roOk ? 'PASS' : 'FAIL'}  展开时「恢复默认」按钮淡入（存在 0<opacity<1 的中间态）`)

if (res.errs.length) allOk = false
console.log(`\npage errors: ${res.errs.length}`)
if (res.reloadedMidway) console.log('（重试后仍发生 HMR reload，读数可能受影响）')
console.log(`\nRESULT: ${allOk ? 'PASS' : 'FAIL'}`)

await browser.close()
process.exit(allOk ? 0 : 1)
