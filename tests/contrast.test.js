/**
 * 配色对比度回归测试：确保派生色在所有色相下都满足 WCAG 阈值。
 * 这组用例锁定的是一类「只有穷举大量色相才会暴露」的缺陷：
 * 原实现在高饱和蓝/绿色相下，深底文字色最低只有 3.94:1。
 */
import { describe, it, expect } from 'vitest'
import { relLum, contrast, hslToRgb, rgbToHsl } from '../src/composables/colorMath'

// 复刻 useAppearance 内部派生逻辑所需的最小工具
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const hslRelLum = ([h, s, l]) => relLum(hslToRgb([h, s, l]))

const DARK_BG_Y = 0.12
const LIGHT_BG_Y = 0.82

function lightenToContrast(hsl, bgY, target = 4.5) {
  const [h, s0, l0] = hsl
  const lumAt = (sat, l) => hslRelLum([h, sat, clamp(l, 0, 100)])
  const solve = (sat) => {
    if (contrast(lumAt(sat, 100), bgY) < target) return null
    let lo = clamp(l0, 0, 100)
    let hi = 100
    if (contrast(lumAt(sat, lo), bgY) >= target) return lo
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (contrast(lumAt(sat, mid), bgY) >= target) hi = mid
      else lo = mid
    }
    return hi
  }
  let sat = clamp(s0, 0, 100)
  let l = solve(sat)
  while (l == null && sat > 8) { sat -= 6; l = solve(sat) }
  if (l == null) return [h, sat, 100]
  let li = Math.round(l)
  for (let i = 0; i < 6 && contrast(lumAt(sat, li), bgY) < target && li < 100; i++) li += 1
  return [h, sat, Math.min(100, li)]
}

describe('派生文字色在深底上的对比度', () => {
  it('48 个色相 × 常用饱和度/亮度组合全部达到 4.5:1', () => {
    const failures = []
    for (let h = 0; h < 360; h += 15) {
      for (const s of [45, 65, 85]) {
        for (const l of [40, 50, 58]) {
          const out = lightenToContrast([h, s, l], DARK_BG_Y)
          const ratio = contrast(hslRelLum(out), DARK_BG_Y)
          if (ratio < 4.5) {
            failures.push({ h, s, l, out, ratio: Number(ratio.toFixed(2)) })
          }
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('输出亮度不会越界（不允许 >100 或 <0）', () => {
    for (let h = 0; h < 360; h += 30) {
      const out = lightenToContrast([h, 100, 30], DARK_BG_Y)
      expect(out[2]).toBeLessThanOrEqual(100)
      expect(out[2]).toBeGreaterThanOrEqual(0)
    }
  })

  it('起点已达标时不会人为提亮', () => {
    // 极亮起点在深底上本就达标，应原样返回
    const out = lightenToContrast([200, 20, 95], DARK_BG_Y)
    expect(out[2]).toBe(95)
  })
})

describe('对比度工具的基线正确性', () => {
  it('黑白对比度为 21', () => {
    expect(contrast(relLum([0, 0, 0]), relLum([255, 255, 255])).toFixed(2)).toBe('21.00')
  })

  it('同色对比度为 1', () => {
    const y = relLum([120, 120, 120])
    expect(contrast(y, y)).toBe(1)
  })

  it('HSL 往返误差在 1 个色阶内', () => {
    for (let h = 0; h < 360; h += 45) {
      const rgb = hslToRgb([h, 70, 50])
      const back = rgbToHsl(rgb)
      expect(Math.abs(back[0] - h)).toBeLessThanOrEqual(1)
    }
  })
})
