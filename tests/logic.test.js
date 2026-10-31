// @vitest-environment jsdom
/**
 * 组合式函数 / 全局逻辑审计测试。
 *
 * 说明：源码审计确认的缺陷用例统一用 `it.fails` 保留——当前源码下它们必须失败；
 * 修复源码后这些用例会转红（说明缺陷已消失），届时去掉 `.fails` 即可转成回归用例。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick, h, defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

import {
  smartIncrement,
  smartDecrement,
  normalizeEpisodeInput,
  buildItemUrl,
} from '../src/composables/useEpisode.js'
import {
  todayStr,
  normalizeDate,
  validateDate,
  extractYear,
  extractAllYears,
  dateInputToFormat,
  formatToDateInput,
  compareDateKey,
} from '../src/composables/useDatePicker.js'
import {
  relLum,
  contrast,
  rgbToHsl,
  hslToRgb,
  rgbWithLum,
  triplet,
  deriveTextScale,
  clamp,
} from '../src/composables/colorMath.js'
import { toasts, showToast, useToasts } from '../src/composables/useToast.js'
import { placeContextMenu } from '../src/composables/useContextMenu.js'
import { initTheme, useTheme } from '../src/composables/useTheme.js'

const parseTriplet = (s) => s.split(' ').map(Number)
const baseCfg = { target: 4.6, r400: 0.8, r300: 0.62, min: 0, max: 0.98 }
const base = [100, 116, 139]

describe('useEpisode.smartIncrement', () => {
  it.each([
    ['0', '1'],
    ['9', '10'],
    ['09', '10'],
    ['99', '100'],
    ['009', '010'],
    ['099', '100'],
    ['000', '001'],
    ['01', '02'],
    ['1.0', '1.1'],
    ['1.09', '1.10'],
    ['26.09', '26.10'],
    ['26.19', '26.20'],
    ['26.99', '26.100'],
    ['0.99', '0.100'],
    ['1.000', '1.001'],
    ['', '1'],
    [null, '1'],
  ])('smartIncrement(%j) === %j', (input, expected) => {
    expect(smartIncrement(input)).toBe(expected)
  })

  it('不修改调用方传入的字符串，也不产生小数进位', () => {
    expect(smartIncrement('26.99')).toBe('26.100')
    expect(smartIncrement('09.09')).toBe('09.10')
  })

  it('空小数位 "1." 不应生成 NaN', () => {
    expect(smartIncrement('1.')).toBe('1.1')
  })
})

describe('useEpisode.smartDecrement', () => {
  it.each([
    ['1', '0'],
    ['10', '9'],
    ['100', '99'],
    ['01', '00'],
    ['09', '08'],
    ['099', '098'],
    ['26.19', '26.18'],
    ['26.09', '26.08'],
    ['0.5', '0.4'],
    ['0', '0'],
    ['', '0'],
    [null, '0'],
  ])('smartDecrement(%j) === %j', (input, expected) => {
    expect(smartDecrement(input)).toBe(expected)
  })

  it('26.00 减一不应把整集清成 0', () => {
    expect(smartDecrement('26.00')).toBe('26.00')
  })

  it('1.0 减一不应把整集清成 0', () => {
    expect(smartDecrement('1.0')).toBe('1.0')
  })

  it('00 减一应保持两位补零', () => {
    expect(smartDecrement('00')).toBe('00')
  })

  it('26.10 减一应保持两位小数位宽 → 26.09（缺陷保留）', () => {
    expect(smartDecrement('26.10')).toBe('26.09')
  })
})

describe('useEpisode.normalizeEpisodeInput', () => {
  it.each([
    ['', '0'],
    ['   ', '0'],
    [null, '0'],
    [undefined, '0'],
    ['01', '01'],
    ['00', '00'],
    ['26.19', '26.19'],
    ['1.', '1'],
    ['.5', '0.5'],
    ['abc', '0'],
    ['NaN', '0'],
    ['１２３', '0'],
    [12.5, '12.5'],
  ])('normalizeEpisodeInput(%j) === %j', (input, expected) => {
    expect(normalizeEpisodeInput(input)).toBe(expected)
  })

  it('Infinity 是非法输入，应归 0', () => {
    expect(normalizeEpisodeInput('Infinity')).toBe('0')
  })

  it('1e999 溢出后不应以 Infinity 入库', () => {
    expect(normalizeEpisodeInput('1e999')).toBe('0')
  })

  it('负数集数应归 0', () => {
    expect(normalizeEpisodeInput('-5')).toBe('0')
  })

  it('科学计数法 1e-7 不应原样入库', () => {
    expect(normalizeEpisodeInput('1e-7')).toBe('0')
  })
})

describe('useEpisode.buildItemUrl', () => {
  it('无 url 返回空串', () => {
    expect(buildItemUrl(null)).toBe('')
    expect(buildItemUrl({})).toBe('')
    expect(buildItemUrl({ url: '' })).toBe('')
  })

  it('无动态参数时原样返回 url', () => {
    expect(buildItemUrl({ url: 'https://a.test/x' })).toBe('https://a.test/x')
  })

  it('替换 {集数} 并保留补零', () => {
    expect(
      buildItemUrl({
        url: 'https://a.test/x',
        url_params: 'kw={集数}&p=1',
        current_episode: '01',
      }),
    ).toBe('https://a.test/x?kw=01&p=1')
  })

  it('替换全部占位符，并在已有查询串后使用 &', () => {
    expect(
      buildItemUrl({
        url: 'https://a.test/x?z=1',
        url_params: 'a={集数}&b={集数}',
        current_episode: '7',
      }),
    ).toBe('https://a.test/x?z=1&a=7&b=7')
  })

  it('current_episode 缺失时按 0 替换', () => {
    expect(
      buildItemUrl({ url: 'https://a.test/x', url_params: 'p={集数}' }),
    ).toBe('https://a.test/x?p=0')
  })

  it('url 以 ? 结尾时不应生成 ?&', () => {
    expect(
      buildItemUrl({
        url: 'https://a.test/x?',
        url_params: 'p={集数}',
        current_episode: '1',
      }),
    ).toBe('https://a.test/x?p=1')
  })
})

describe('useDatePicker.todayStr / normalizeDate / input conversion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('使用本地日期，而不是 UTC 的 toISOString', () => {
    vi.setSystemTime(new Date(2025, 6, 15, 0, 30, 0))
    expect(todayStr()).toBe('2025/07/15')
    vi.setSystemTime(new Date(2025, 0, 1, 23, 59, 0))
    expect(todayStr()).toBe('2025/01/01')
    vi.setSystemTime(new Date(2024, 1, 29, 12, 0, 0))
    expect(todayStr()).toBe('2024/02/29')
  })

  it.each([
    ['2025-07-15', '2025/07/15'],
    ['2025-07-15 14:30', '2025/07/15 14:30'],
    ['', ''],
    [null, ''],
    [undefined, ''],
  ])('normalizeDate(%j) === %j', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected)
  })

  it('dateInputToFormat 把 date input 的短横线换回斜杠', () => {
    expect(dateInputToFormat('2025-07-15')).toBe('2025/07/15')
    expect(dateInputToFormat('')).toBe('')
  })

  it('formatToDateInput 只取日期部分', () => {
    expect(formatToDateInput('2025/07/15 14:30')).toBe('2025-07-15')
    expect(formatToDateInput('2025/07/15')).toBe('2025-07-15')
    expect(formatToDateInput('')).toBe('')
    // 年份/年月/范围无法塞进 <input type="date">；当前原样返回（见 review 的调用契约问题）
    expect(formatToDateInput('2025')).toBe('2025')
    expect(formatToDateInput('2025/07')).toBe('2025-07')
    expect(formatToDateInput('2014~2017')).toBe('2014~2017')
  })
})

describe('useDatePicker.validateDate', () => {
  it.each([
    ['2025', { valid: true, normalized: '2025' }],
    ['2025/7', { valid: true, normalized: '2025/07' }],
    ['2025/07', { valid: true, normalized: '2025/07' }],
    ['2025/7/5', { valid: true, normalized: '2025/07/05' }],
    ['2025/07/15', { valid: true, normalized: '2025/07/15' }],
    ['2024/02/29', { valid: true, normalized: '2024/02/29' }],
    ['2000/02/29', { valid: true, normalized: '2000/02/29' }],
    ['2025/7/5 9:05', { valid: true, normalized: '2025/07/05 09:05' }],
    ['2025/07/15 14:30', { valid: true, normalized: '2025/07/15 14:30' }],
    ['2025/07/15 14:30:59', { valid: true, normalized: '2025/07/15 14:30:59' }],
    ['2014~2017', { valid: true, normalized: '2014~2017' }],
    ['2014 ~ 2017', { valid: true, normalized: '2014~2017' }],
  ])('接受合法日期 %j', (input, expected) => {
    expect(validateDate(input)).toMatchObject(expected)
  })

  it.each([
    ['2025/02/29', '该月天数应在 1~28 之间'],
    ['2100/02/29', '该月天数应在 1~28 之间'],
    ['2025/13', '月份应在 1~12 之间'],
    ['2025/00', '月份应在 1~12 之间'],
    ['2025/07/00', '该月天数应在 1~31 之间'],
    ['2025/07/32', '该月天数应在 1~31 之间'],
    ['2025/07/15 24:00', '小时应在 0~23 之间'],
    ['2025/07/15 23:60', '分钟应在 0~59 之间'],
    ['2025/07/15 23:59:60', '秒数应在 0~59 之间'],
    ['2017~2014', '起始年份不能大于结束年份'],
    ['1899', '年份应在 1900~2100 之间'],
    ['2101', '年份应在 1900~2100 之间'],
    ['', '请输入日期'],
  ])('拒绝非法日期 %j', (input, error) => {
    expect(validateDate(input)).toMatchObject({ valid: false, error })
  })

  it('拒绝格式不正确的字符串', () => {
    expect(validateDate('abc')).toMatchObject({ valid: false })
    expect(validateDate('2025-07-15')).toMatchObject({ valid: false })
    expect(validateDate('2025/07/15T14:30')).toMatchObject({ valid: false })
  })

  it('数字年份传入也应校验可用（不再抛 value.trim 异常）', () => {
    expect(validateDate(2025)).toMatchObject({ valid: true, normalized: '2025' })
  })
})

describe('useDatePicker.extractYear / extractAllYears', () => {
  it.each([
    ['2025', '2025'],
    ['2025/07', '2025'],
    ['2025/07/15', '2025'],
    ['2025/07/15 14:30', '2025'],
    ['  2025/07/15  ', '2025'],
    ['2014~2017', null],
    ['2014 ~ 2017', null],
    ['', null],
    ['abc', null],
  ])('extractYear(%j) === %j', (input, expected) => {
    expect(extractYear(input)).toBe(expected)
  })

  it('extractAllYears 展开年份范围', () => {
    expect(extractAllYears('2014~2017')).toEqual(['2014', '2015', '2016', '2017'])
    expect(extractAllYears('2014 ~ 2017')).toEqual(['2014', '2015', '2016', '2017'])
    expect(extractAllYears('2025/07/15')).toEqual(['2025'])
    expect(extractAllYears('')).toEqual([])
    expect(extractAllYears('2017~2014')).toEqual([])
  })

  it('年份范围记录应归属于该范围分组，不应同时落入未分类', () => {
    // 复刻 WatchedView.fetchData 的未分类判定：范围标签按区间匹配
    const ranges = [{ label: '2014~2017', start: 2014, end: 2017 }]
    const matched = ranges.some((r) => {
      if ('2014~2017' === r.label) return true
      const m = '2014~2017'.match(/^(\d{4})/)
      if (!m) return false
      const y = parseInt(m[1], 10)
      return y >= r.start && y <= r.end
    })
    expect(matched).toBe(true)
  })
})

describe('useDatePicker.compareDateKey', () => {
  it('同值/不同精度的已补零日期按时间序排列', () => {
    expect(compareDateKey('2025/07/15', '2025/07/15')).toBe(0)
    expect(compareDateKey('2025', '2025/07')).toBeLessThan(0)
    expect(compareDateKey('2025/07', '2025/07/15')).toBeLessThan(0)
    expect(compareDateKey('2025/07/15', '2025/07/15 14:30')).toBeLessThan(0)
    expect(compareDateKey('2025/07/15 14:30', '2025/07/15 15:00')).toBeLessThan(0)
    expect(compareDateKey('2014~2017', '2015/01')).toBeLessThan(0)
    expect(compareDateKey('', '2025')).toBeGreaterThan(0)
    expect(compareDateKey('2025', '')).toBeLessThan(0)
  })

  it('未补零月份 2025/7 应排在 2025/10 前', () => {
    expect(compareDateKey('2025/7/15', '2025/10/01')).toBe(-1)
  })

  it('同一日期未补零/补零写法应视为相等', () => {
    expect(compareDateKey('2025/7', '2025/07')).toBe(0)
  })

  it('未补零小时 9:05 应排在 14:30 前', () => {
    expect(compareDateKey('2025/07/15 9:05', '2025/07/15 14:30')).toBe(-1)
  })
})

describe('colorMath', () => {
  it('clamp 上下界', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })

  it('WCAG 相对亮度：黑白与三原色', () => {
    expect(relLum([255, 255, 255])).toBeCloseTo(1, 12)
    expect(relLum([0, 0, 0])).toBe(0)
    expect(relLum([255, 0, 0])).toBeCloseTo(0.2126, 12)
    expect(relLum([0, 255, 0])).toBeCloseTo(0.7152, 12)
    expect(relLum([0, 0, 255])).toBeCloseTo(0.0722, 12)
  })

  it('WCAG 对比度公式对称且黑白为 21', () => {
    expect(contrast(1, 0)).toBe(21)
    expect(contrast(0, 1)).toBe(21)
    expect(contrast(0.5, 0.5)).toBe(1)
    expect(contrast(0.2, 0.9)).toBeCloseTo(3.8, 12)
  })

  it('RGB ↔ HSL 已知值', () => {
    expect(rgbToHsl([255, 0, 0])).toEqual([0, 100, 50])
    expect(rgbToHsl([0, 255, 0])).toEqual([120, 100, 50])
    expect(rgbToHsl([0, 0, 255])).toEqual([240, 100, 50])
    expect(rgbToHsl([0, 0, 0])).toEqual([0, 0, 0])
    expect(rgbToHsl([255, 255, 255])).toEqual([0, 0, 100])
    expect(hslToRgb([0, 100, 50])).toEqual([255, 0, 0])
    expect(hslToRgb([120, 100, 50])).toEqual([0, 255, 0])
    expect(hslToRgb([240, 100, 50])).toEqual([0, 0, 255])
    expect(hslToRgb([0, 0, 150])).toEqual([255, 255, 255])
    expect(hslToRgb([0, 0, -50])).toEqual([0, 0, 0])
  })

  it('HSL 往返在 1 个色阶内', () => {
    for (const rgb of [
      [100, 116, 139],
      [12, 200, 77],
      [240, 240, 240],
    ]) {
      const back = hslToRgb(rgbToHsl(rgb))
      for (let i = 0; i < 3; i++) expect(Math.abs(back[i] - rgb[i])).toBeLessThanOrEqual(1)
    }
  })

  it('rgbWithLum 保持色相并逼近目标亮度', () => {
    const out = rgbWithLum(base, 0.2)
    expect(relLum(out)).toBeCloseTo(0.2, 2)
    const [h, s] = rgbToHsl(out)
    expect(h).toBeGreaterThan(205)
    expect(h).toBeLessThan(225)
    expect(s).toBeGreaterThan(10)
    expect(s).toBeLessThan(25)
  })

  it('triplet 输出空格分隔字符串', () => {
    expect(triplet([1, 2, 3])).toBe('1 2 3')
  })

  it('deriveTextScale 在深/浅两个方向都达到目标对比度', () => {
    const dark = deriveTextScale(0.93, base, baseCfg, true)
    const light = deriveTextScale(0.07, base, baseCfg, false)
    for (const scale of [dark, light]) {
      expect(scale).toHaveLength(3)
      for (const g of scale) {
        expect(g).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
        expect(parseTriplet(g).every((v) => v >= 0 && v <= 255)).toBe(true)
      }
    }
    expect(contrast(relLum(parseTriplet(dark[2])), 0.93)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(relLum(parseTriplet(light[2])), 0.07)).toBeGreaterThanOrEqual(4.5)
  })

  it('deriveTextScale 对目标亮度做上下界钳制', () => {
    const scale = deriveTextScale(1, base, { ...baseCfg, target: 100 }, true)
    const g = parseTriplet(scale[2])
    expect(g.every((v) => v >= 0 && v <= 255)).toBe(true)
    expect(contrast(relLum(g), 1)).toBeGreaterThan(15)
  })
})

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    toasts.splice(0)
  })
  afterEach(() => {
    vi.useRealTimers()
    toasts.splice(0)
  })

  it('showToast 入队并保留消息/类型', () => {
    showToast('保存成功')
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ message: '保存成功', type: 'success' })
    expect(typeof toasts[0].id).toBe('number')
  })

  it.each([
    ['success', 2500],
    ['info', 2500],
    ['warning', 3500],
    ['error', 4500],
  ])('%s 类型在 %i ms 后自动移除', (type, duration) => {
    showToast('x', type)
    expect(toasts).toHaveLength(1)
    vi.advanceTimersByTime(duration - 1)
    expect(toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts).toHaveLength(0)
  })

  it('未知类型按 success 时长兜底', () => {
    showToast('x', 'mystery')
    vi.advanceTimersByTime(2500)
    expect(toasts).toHaveLength(0)
  })

  it('多条通知按 id 独立移除', () => {
    showToast('a', 'success')
    showToast('b', 'error')
    expect(toasts).toHaveLength(2)
    const ids = toasts.map((t) => t.id)
    expect(new Set(ids).size).toBe(2)
    vi.advanceTimersByTime(2500)
    expect(toasts.map((t) => t.message)).toEqual(['b'])
    vi.advanceTimersByTime(2000)
    expect(toasts).toHaveLength(0)
  })

  it('useToasts 返回同一个响应式队列', () => {
    expect(useToasts()).toBe(toasts)
  })
})

describe('useContextMenu.placeContextMenu', () => {
  const originalWidth = window.innerWidth
  const originalHeight = window.innerHeight

  const setViewport = (width, height) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  }

  const addMenu = (width, height) => {
    const el = document.createElement('div')
    el.className = 'context-menu'
    Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width })
    Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
    document.body.appendChild(el)
    return el
  }

  const settle = async () => {
    await nextTick()
    await nextTick()
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    setViewport(1024, 768)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    setViewport(originalWidth, originalHeight)
  })

  it('空间足够时贴着鼠标位置显示并保留 extra', async () => {
    addMenu(120, 80)
    const menu = ref({ show: false, x: 0, y: 0 })
    placeContextMenu(menu, { clientX: 100, clientY: 200 }, { item: { id: 1 } })
    expect(menu.value).toMatchObject({ show: true, x: 100, y: 200, item: { id: 1 } })
    await settle()
    expect(menu.value).toMatchObject({ show: true, x: 100, y: 200 })
  })

  it('右侧放不下时贴右收拢', async () => {
    setViewport(400, 300)
    addMenu(200, 100)
    const menu = ref({ show: false, x: 0, y: 0 })
    placeContextMenu(menu, { clientX: 300, clientY: 50 })
    await settle()
    expect(menu.value.x).toBe(192)
    expect(menu.value.y).toBe(50)
  })

  it('下方放不下时向上翻转', async () => {
    setViewport(400, 300)
    addMenu(200, 100)
    const menu = ref({ show: false, x: 0, y: 0 })
    placeContextMenu(menu, { clientX: 50, clientY: 250 })
    await settle()
    expect(menu.value.x).toBe(50)
    expect(menu.value.y).toBe(150)
  })

  it('菜单比视口还大时贴左上角，不产生负坐标', async () => {
    setViewport(200, 200)
    addMenu(300, 300)
    const menu = ref({ show: false, x: 0, y: 0 })
    placeContextMenu(menu, { clientX: 50, clientY: 50 })
    await settle()
    expect(menu.value.x).toBe(8)
    expect(menu.value.y).toBe(8)
  })
})

describe('useTheme', () => {
  let originalMatchMedia

  const mqMock = (matches) => ({
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn(() => mqMock(false))
    localStorage.setItem('bangumi-theme', 'auto')
    initTheme()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    document.documentElement.classList.remove('dark')
  })

  it('initTheme 读取 localStorage 的 dark', () => {
    localStorage.setItem('bangumi-theme', 'dark')
    initTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('initTheme 读取 localStorage 的 light', () => {
    localStorage.setItem('bangumi-theme', 'light')
    initTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('initTheme 遇到非法值回落到 auto（并跟随系统）', () => {
    localStorage.setItem('bangumi-theme', 'garbage')
    window.matchMedia = vi.fn(() => mqMock(true))
    initTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setTheme / toggleTheme 更新 class、isDark 与持久化', async () => {
    let api
    const wrapper = mount(
      defineComponent({
        setup() {
          api = useTheme()
          return () => h('div')
        },
      }),
    )
    await nextTick()
    expect(api.isDark.value).toBe(false)

    api.setTheme('dark')
    await nextTick()
    expect(api.isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('bangumi-theme')).toBe('dark')

    api.toggleTheme() // dark -> auto（系统浅色）
    await nextTick()
    expect(api.theme.value).toBe('auto')
    expect(api.isDark.value).toBe(false)

    api.toggleTheme() // auto -> light
    await nextTick()
    expect(api.theme.value).toBe('light')

    wrapper.unmount()
  })

  it('useTheme 卸载时应移除 matchMedia change 监听（缺陷保留）', async () => {
    const mq = mqMock(false)
    window.matchMedia = vi.fn(() => mq)
    const wrapper = mount(
      defineComponent({
        setup() {
          useTheme()
          return () => h('div')
        },
      }),
    )
    await nextTick()
    expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    wrapper.unmount()
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})

describe('router 配置', () => {
  it('四条业务路由与根重定向存在', async () => {
    const { default: router } = await import('../src/router/index.js')
    const paths = router.getRoutes().map((r) => r.path)
    expect(paths).toEqual(
      expect.arrayContaining(['/', '/watching', '/remaining', '/watched', '/import']),
    )
    expect(router.getRoutes().find((r) => r.path === '/').redirect).toBe('/watching')
    expect(router.resolve('/watching').name).toBe('Watching')
    expect(router.resolve('/remaining').meta.title).toBe('等待更新')
    expect(router.resolve('/watched').meta.title).toBe('已看历史')
    expect(router.resolve('/import').meta.title).toBe('导入Excel')
  })

  it('使用 hash history（单文件/静态部署可直接打开）', async () => {
    const { default: router } = await import('../src/router/index.js')
    expect(router.options.history.createHref('/watching')).toBe('#/watching')
  })

  it('未知路径当前没有兜底路由', async () => {
    const { default: router } = await import('../src/router/index.js')
    const catchAll = router
      .getRoutes()
      .filter((r) => r.path.includes(':pathMatch') || r.path.includes('(.*)'))
    expect(catchAll).toHaveLength(0)
  })
})
