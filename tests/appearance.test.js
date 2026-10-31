// @vitest-environment jsdom
/**
 * 外观引擎审计测试。
 *
 * 覆盖：
 *  1) colorMath 纯函数（WCAG 相对亮度/对比度、HSL 往返、文字色阶推导）；
 *  2) useAppearance 的状态机与纯逻辑（配色钳制、随机配色范围、模式切换、
 *     壁纸加载失败回退、持久化字段裁剪、localStorage 损坏/配额异常恢复）。
 *
 * 说明：本文件是"当前实现的行为基线"，不修改 src。评审中记录的对比度缺口
 * （白字压在 primary-light 渐变上、--c-primary-light 在深底上达不到 4.5）
 * 属于已知缺陷，见 review/appearance.md；此处只断言当前确实成立的不变量。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import {
  relLum,
  contrast,
  rgbToHsl,
  hslToRgb,
  deriveTextScale,
  clamp,
} from '../src/composables/colorMath.js'

const STORAGE_KEY = 'banager_appearance'

// jsdom 默认没有 rAF（取决于环境配置）；useAppearance 的调度器依赖它。
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** 每个用例重新加载模块，拿到全新的模块级 state / 缓存（applyPalette._lastKey 等） */
async function loadAppearance() {
  vi.resetModules()
  return import('../src/composables/useAppearance.js')
}

function cssVar(name) {
  return document.documentElement.style.getPropertyValue(name).trim()
}

function rgbTripletToArray(triplet) {
  return triplet.split(/\s+/).map(Number)
}

/** 复刻 applyPalette 里 pick 的选向逻辑：深/浅两套取对比度更高者 */
function bestTextContrast(effY, target = 4.6) {
  const cfg = { target, r400: 0.8, r300: 0.62, min: 0, max: 0.98 }
  const dark = deriveTextScale(effY, [100, 116, 139], cfg, true)
  const light = deriveTextScale(effY, [100, 116, 139], cfg, false)
  const cr = (g) => contrast(relLum(g.split(' ').map(Number)), effY)
  return Math.max(cr(dark[2]), cr(light[2]))
}

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {}
  document.documentElement.removeAttribute('style')
  document.body.innerHTML = ''
  document.body.className = ''
  document.body.removeAttribute('data-glass')
  document.body.removeAttribute('data-bg-fx')
  window.history.replaceState({}, '', '/?nobg')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
  document.body.innerHTML = ''
  document.body.className = ''
})

// ==================== colorMath ====================

describe('colorMath：WCAG 亮度与对比度', () => {
  it('黑白相对亮度与极限对比度为 21:1', () => {
    expect(relLum([255, 255, 255])).toBeCloseTo(1, 5)
    expect(relLum([0, 0, 0])).toBeCloseTo(0, 5)
    expect(contrast(1, 0)).toBeCloseTo(21, 5)
    expect(contrast(0.5, 0.5)).toBeCloseTo(1, 5)
  })

  it('HSL ↔ RGB 往返在 1 个色阶内', () => {
    for (const rgb of [
      [124, 58, 237],
      [236, 72, 153],
      [16, 185, 129],
      [0, 0, 0],
      [255, 255, 255],
    ]) {
      const back = hslToRgb(rgbToHsl(rgb))
      expect(back[0]).toBeCloseTo(rgb[0], 0)
      expect(back[1]).toBeCloseTo(rgb[1], 0)
      expect(back[2]).toBeCloseTo(rgb[2], 0)
    }
  })

  it('clamp 对上下界均生效', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
    expect(clamp(5, 0, 10)).toBe(5)
  })
})

describe('colorMath：自适应文字色阶', () => {
  it.each([0.02, 0.1, 0.3, 0.5, 0.8, 0.93])(
    '背景亮度 %s 时至少一种文字方向达到 4.5:1',
    (effY) => {
      expect(bestTextContrast(effY)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('输出的三档色阶都是合法的 0-255 三元组且亮度递减', () => {
    const cfg = { target: 4.6, r400: 0.8, r300: 0.62, min: 0, max: 0.98 }
    const scale = deriveTextScale(0.3, [100, 116, 139], cfg, true)
    expect(scale).toHaveLength(3)
    const lums = scale.map((g) => {
      const rgb = g.split(' ').map(Number)
      expect(rgb).toHaveLength(3)
      rgb.forEach((v) => {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(255)
      })
      return relLum(rgb)
    })
    // g300 最浅、g500 最深（深色文字场景）
    expect(lums[0]).toBeLessThanOrEqual(lums[1])
    expect(lums[1]).toBeLessThanOrEqual(lums[2])
  })
})

// ==================== useAppearance：配色 ====================

describe('useAppearance：配色钳制', () => {
  it('饱和度/亮度越界时按 45-85 / 40-58 钳制后写入 CSS 变量', async () => {
    const { useAppearance } = await loadAppearance()
    const { setPalette } = useAppearance()

    setPalette({ p: [200, 10, 10], s: [300, 100, 90] })

    expect(cssVar('--c-primary')).toBe(hslToRgb([200, 45, 40]).join(' '))
    expect(cssVar('--c-secondary')).toBe(hslToRgb([300, 85, 58]).join(' '))
    for (const name of [
      '--c-primary-light',
      '--c-primary-dark',
      '--c-secondary-light',
      '--c-secondary-dark',
    ]) {
      const rgb = rgbTripletToArray(cssVar(name))
      expect(rgb).toHaveLength(3)
      rgb.forEach((v) => {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(255)
      })
    }
  })

  it('自定义纯黑会被静默改成中棕红（记录当前钳制行为）', async () => {
    const { useAppearance } = await loadAppearance()
    const { setPalette } = useAppearance()

    setPalette({ p: [0, 0, 0], s: [0, 0, 100] })

    // 用户选 #000000，实际得到 hsl(0 45% 40%) = 148 56 56
    expect(cssVar('--c-primary')).toBe('148 56 56')
    // 用户选 #FFFFFF，实际得到 hsl(0 45% 58%)，不是白色
    expect(cssVar('--c-secondary')).toBe(hslToRgb([0, 45, 58]).join(' '))
  })

  it('palette=null 时移除全部六个主题变量', async () => {
    const { useAppearance } = await loadAppearance()
    const { setPalette } = useAppearance()

    setPalette({ p: [263, 67, 55], s: [329, 81, 60] })
    expect(cssVar('--c-primary')).not.toBe('')

    setPalette(null)
    for (const name of [
      '--c-primary',
      '--c-primary-light',
      '--c-primary-dark',
      '--c-secondary',
      '--c-secondary-light',
      '--c-secondary-dark',
    ]) {
      expect(cssVar(name)).toBe('')
    }
  })
})

describe('useAppearance：随机配色', () => {
  /** 固定种子的伪随机，保证多次运行结果一致 */
  function seeded(seed) {
    let s = seed >>> 0
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 0x100000000
    }
  }

  it('主/副色落在声明区间，色相相距 40-99°', async () => {
    const { useAppearance } = await loadAppearance()
    const { state, randomizePalette } = useAppearance()
    const rand = seeded(20261031)
    const spy = vi.spyOn(Math, 'random').mockImplementation(rand)

    for (let i = 0; i < 80; i++) {
      randomizePalette()
      const { p, s } = state.palette
      expect(p[0]).toBeGreaterThanOrEqual(0)
      expect(p[0]).toBeLessThan(360)
      expect(s[0]).toBeGreaterThanOrEqual(0)
      expect(s[0]).toBeLessThan(360)
      // 主色：S 62-77 / L 46-55；副色：S 55-72 / L 50-59
      expect(p[1]).toBeGreaterThanOrEqual(62)
      expect(p[1]).toBeLessThanOrEqual(77)
      expect(p[2]).toBeGreaterThanOrEqual(46)
      expect(p[2]).toBeLessThanOrEqual(55)
      expect(s[1]).toBeGreaterThanOrEqual(55)
      expect(s[1]).toBeLessThanOrEqual(72)
      expect(s[2]).toBeGreaterThanOrEqual(50)
      expect(s[2]).toBeLessThanOrEqual(59)
      const raw = (s[0] - p[0] + 360) % 360
      const dist = Math.min(raw, 360 - raw)
      expect(dist).toBeGreaterThanOrEqual(40)
      expect(dist).toBeLessThanOrEqual(99)
    }
    spy.mockRestore()
  })

  it('随机配色的 dark 变体在浅色玻璃卡片上保持 4.5:1', async () => {
    const { useAppearance } = await loadAppearance()
    const { randomizePalette } = useAppearance()
    const rand = seeded(42)
    const spy = vi.spyOn(Math, 'random').mockImplementation(rand)

    let min = Infinity
    for (let i = 0; i < 120; i++) {
      randomizePalette()
      const [r, g, b] = rgbTripletToArray(cssVar('--c-primary-dark'))
      min = Math.min(min, contrast(relLum([r, g, b]), 0.82))
      for (const name of ['--c-primary', '--c-primary-light', '--c-primary-dark']) {
        const rgb = rgbTripletToArray(cssVar(name))
        expect(rgb).toHaveLength(3)
        rgb.forEach((v) => expect(v).toBeGreaterThanOrEqual(0))
        rgb.forEach((v) => expect(v).toBeLessThanOrEqual(255))
      }
    }
    expect(min).toBeGreaterThanOrEqual(4.5)
    spy.mockRestore()
  })
})

describe('useAppearance：模式与玻璃状态', () => {
  it('setPaletteMode 状态机：manual 保持配色、random 立即随机、auto 无壁纸时不变', async () => {
    const { useAppearance } = await loadAppearance()
    const { state, setPaletteMode, setPalette } = useAppearance()

    setPalette({ p: [10, 60, 50], s: [50, 60, 50] })
    const fixed = JSON.parse(JSON.stringify(state.palette))

    setPaletteMode('manual')
    expect(state.paletteMode).toBe('manual')
    expect(state.palette).toEqual(fixed)

    setPaletteMode('random')
    expect(state.paletteMode).toBe('random')
    expect(state.palette).not.toEqual(fixed)

    const afterRandom = JSON.parse(JSON.stringify(state.palette))
    setPaletteMode('auto') // 无 bgUrl → 不触发 analyzeWallpaper
    expect(state.paletteMode).toBe('auto')
    expect(state.palette).toEqual(afterRandom)
  })

  it('setGlass 在 liquid 时挂 data-glass，frost 时移除', async () => {
    const { useAppearance } = await loadAppearance()
    const { setGlass } = useAppearance()

    setGlass('liquid')
    expect(document.body.getAttribute('data-glass')).toBe('liquid')
    setGlass('frost')
    expect(document.body.hasAttribute('data-glass')).toBe(false)
  })
})

// ==================== useAppearance：壁纸 ====================

describe('useAppearance：壁纸回退', () => {
  it('bgFailed=true 时回到渐变底色，恢复后重新渲染壁纸', async () => {
    const { useAppearance } = await loadAppearance()
    const { state, applyBackground } = useAppearance()

    state.bgEnabled = true
    state.bgUrl = 'https://cdn.example.com/wall/a.jpg'
    state.bgFailed = true
    applyBackground()

    expect(document.body.classList.contains('with-bg')).toBe(false)
    expect(cssVar('--bg-image')).toBe('none')
    expect(cssVar('--bg-dim')).toBe('0')

    state.bgFailed = false
    applyBackground()

    expect(document.body.classList.contains('with-bg')).toBe(true)
    expect(cssVar('--bg-image')).toContain('https://cdn.example.com/wall/a.jpg')
    expect(cssVar('--bg-dim')).not.toBe('0')
  })

  it('图片加载失败时自动标记 bgFailed 并摘掉背景层', async () => {
    const { useAppearance } = await loadAppearance()
    const { state, toggleBackground } = useAppearance()

    class FailingImage {
      set src(_v) {
        // probeBackground 先挂 onerror 再赋 src，这里同步触发即可
        this.onerror && this.onerror(new Event('error'))
      }
    }
    vi.stubGlobal('Image', FailingImage)

    state.bgEnabled = false
    state.bgUrl = 'https://cdn.invalid.example/broken.jpg'
    state.bgFailed = false

    await toggleBackground()
    await flush()

    expect(state.bgFailed).toBe(true)
    expect(document.body.classList.contains('with-bg')).toBe(false)
  })

  it('isCrossOrigin 对相对/blob 地址与跨域地址判断正确', async () => {
    const mod = await loadAppearance()
    expect(mod.isCrossOrigin('/logo.png')).toBe(false)
    expect(mod.isCrossOrigin(`${location.origin}/x.png`)).toBe(false)
    expect(mod.isCrossOrigin('https://cdn.example.com/x.png')).toBe(true)
    expect(mod.isCrossOrigin('http://[invalid')).toBe(true)
  })
})

// ==================== useAppearance：持久化 ====================

describe('useAppearance：localStorage', () => {
  it('损坏的 JSON 不会中断初始化，回退默认外观', async () => {
    localStorage.setItem(STORAGE_KEY, '{ this is not json')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mod = await loadAppearance()

    await expect(mod.initAppearance()).resolves.toBeUndefined()

    const { state } = mod.useAppearance()
    expect(state.glass).toBe('liquid')
    expect(document.body.getAttribute('data-glass')).toBe('liquid')
    expect(err).toHaveBeenCalled()
  })

  it('合法配置会被恢复，且 bgBlobUrl/bgFailed/bgLoading 不落盘', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        glass: 'frost',
        bgEnabled: false,
        bgDim: 0.4,
        palette: { p: [200, 60, 50], s: [300, 60, 50] },
      }),
    )
    const mod = await loadAppearance()
    await mod.initAppearance()

    const { state } = mod.useAppearance()
    expect(state.glass).toBe('frost')
    expect(state.bgEnabled).toBe(false)
    expect(state.bgDim).toBe(0.4)
    expect(state.palette.p[0]).toBe(200)
    expect(document.body.hasAttribute('data-glass')).toBe(false)
    expect(cssVar('--c-primary')).not.toBe('')

    state.bgBlobUrl = 'blob:https://example/123'
    state.bgFailed = true
    state.bgLoading = true
    state.bgDim = 0.42
    await flush()

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(saved.bgBlobUrl).toBeUndefined()
    expect(saved.bgFailed).toBeUndefined()
    expect(saved.bgLoading).toBeUndefined()
    expect(saved.bgDim).toBe(0.42)
    expect(saved.palette.p).toEqual([200, 60, 50])
  })

  it('setItem 抛配额异常时不影响状态更新', async () => {
    const mod = await loadAppearance()
    const { state } = mod.useAppearance()
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      })

    expect(() => {
      state.bgDim = 0.65
    }).not.toThrow()
    await nextTick()
    await flush()

    expect(state.bgDim).toBe(0.65)
    spy.mockRestore()
  })
})
