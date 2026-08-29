/**
 * 外观引擎：玻璃风格 / 配色 / 背景图
 * 配色以 HSL 存储并派生明暗变体，写入 :root 的 rgb 通道变量（见 style.css）
 * 背景图通过 body.with-bg + CSS 变量渲染，遮罩与模糊保证可读性
 */
import { reactive, watch } from 'vue'
import { showToast } from './useToast'

const STORAGE_KEY = 'banager_appearance'

const state = reactive({
  glass: 'frost',           // 'frost' 毛玻璃 | 'liquid' 液态玻璃
  palette: null,            // null = 默认樱紫；否则 { p: [h,s,l], s: [h,s,l] }
  bgEnabled: false,
  bgProvider: 'alcy',       // 'alcy' 樱花Alcy(默认,可取色) | 'dmoe' | 'custom'
  bgAutoSwitch: true,       // 每次打开页面自动换一张；关闭即固定当前壁纸
  bgCustomUrl: '',
  bgDim: 0.55,              // 遮罩浓度 0~0.9
  bgBlur: 0,                // 背景模糊 0~20px
  bgUrl: '',                // 当前生效的图片地址
  bgLoading: false,
  bgFailed: false,          // 运行时标记：当前图片加载失败（不持久化）
})

// ========== 颜色工具 ==========

function hslToRgbTriplet([h, s, l]) {
  s /= 100
  l /= 100
  const k = n => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to255 = v => Math.round(v * 255)
  return `${to255(f(0))} ${to255(f(8))} ${to255(f(4))}`
}

function hexToHsl(hex) {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// 主色亮度钳制在保证白色文字可读的区间
const safeL = l => clamp(l, 40, 58)

// ========== 应用 ==========

function applyPalette() {
  if (typeof document === 'undefined') return
  const root = document.documentElement.style
  if (!state.palette) {
    ;['--c-primary', '--c-primary-light', '--c-primary-dark', '--c-secondary', '--c-secondary-light', '--c-secondary-dark']
      .forEach(v => root.removeProperty(v))
    return
  }
  const [ph, ps, pl] = state.palette.p
  const [sh, ss, sl] = state.palette.s
  const p = [ph, clamp(ps, 45, 85), safeL(pl)]
  const s = [sh, clamp(ss, 45, 85), safeL(sl)]
  root.setProperty('--c-primary', hslToRgbTriplet(p))
  root.setProperty('--c-primary-light', hslToRgbTriplet([p[0], p[1] * 0.9, Math.min(p[2] + 14, 74)]))
  root.setProperty('--c-primary-dark', hslToRgbTriplet([p[0], p[1], Math.max(p[2] - 10, 28)]))
  root.setProperty('--c-secondary', hslToRgbTriplet(s))
  root.setProperty('--c-secondary-light', hslToRgbTriplet([s[0], s[1] * 0.9, Math.min(s[2] + 12, 74)]))
  root.setProperty('--c-secondary-dark', hslToRgbTriplet([s[0], s[1], Math.max(s[2] - 10, 28)]))
}

function applyGlass() {
  if (typeof document === 'undefined') return
  if (state.glass === 'liquid') document.body.dataset.glass = 'liquid'
  else delete document.body.dataset.glass
}

function applyBackground() {
  if (typeof document === 'undefined') return
  // 图片加载失败时彻底回到原渐变底色，不留遮罩层影响可读性
  const active = state.bgEnabled && state.bgUrl && !state.bgFailed
  document.body.classList.toggle('with-bg', active)
  const root = document.documentElement.style
  if (active) {
    root.setProperty('--bg-image', `url("${state.bgUrl}")`)
    root.setProperty('--bg-blur', `${state.bgBlur}px`)
    root.setProperty('--bg-dim', String(clamp(state.bgDim, 0, 0.9)))
  } else {
    root.setProperty('--bg-image', 'none')
    root.setProperty('--bg-blur', '0px')
    root.setProperty('--bg-dim', '0')
  }
}

// ========== 壁纸加载探测 ==========

// 预载探测：加载失败自动摘掉背景层（接口停服 / 图片被删 / 断网时保证页面观感）
function probeBackground() {
  if (typeof Image === 'undefined') return
  if (!state.bgUrl) return
  const img = new Image()
  img.onload = () => {
    state.bgFailed = false
    applyBackground()
    // 启动入场：壁纸就绪后由糊渐清晰
    clearBootFocus()
  }
  img.onerror = () => {
    bootFocusPending = false
    if (state.bgFailed) return
    state.bgFailed = true
    applyBackground()
    if (!state.bgSilentProbe) {
      showToast('背景图加载失败，已自动关闭背景（可稍后在设置中重试）', 'warning')
    }
  }
  img.src = state.bgUrl
}

// 带超时的探测，返回 Promise<boolean>（用于启动自动换图失败时回退旧壁纸）
function probeUrl(url, timeout = 8000) {
  return new Promise(resolve => {
    if (typeof Image === 'undefined' || !url) { resolve(false); return }
    const img = new Image()
    const timer = setTimeout(() => {
      // 不能置空 src：空字符串会解析为当前页面地址（file:// 下触发安全警告），改为移除属性
      img.onload = img.onerror = null
      img.removeAttribute('src')
      resolve(false)
    }, timeout)
    img.onload = () => { clearTimeout(timer); resolve(true) }
    img.onerror = () => { clearTimeout(timer); resolve(false) }
    img.src = url
  })
}

/** 启动时自动换一张：新图加载失败则回退到上一张可用的壁纸 */
async function autoSwitchOnStartup() {
  const prev = state.bgUrl
  state.bgSilentProbe = true
  try {
    await shuffleBackground()
    if (state.bgUrl && state.bgUrl !== prev) {
      const ok = await probeUrl(state.bgUrl)
      if (!ok && prev) {
        state.bgUrl = prev
        state.bgFailed = false
        applyBackground()
        probeBackground()
        showToast('新壁纸加载失败，已保留原壁纸', 'warning')
      }
    }
  } catch {}
  finally { state.bgSilentProbe = false }
}

// ========== iOS 风格壁纸聚焦动画 ==========
// 有弹窗打开时壁纸加深模糊（进入"应用"状态），关闭后渐清晰（回到"桌面"状态）；
// 页面启动/刷新时保持模糊直到壁纸加载完成，再由糊渐清晰入场
let focusObserverStarted = false
let bootFocusPending = false

function hasFullscreenDialog() {
  return !!document.querySelector('body > .fixed.inset-0.z-50')
}

function startFocusObserver() {
  if (focusObserverStarted || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return
  focusObserverStarted = true
  const update = () => {
    // 启动入场期间保持模糊（壁纸就绪后由 clearBootFocus 渐清晰）
    if (bootFocusPending) { document.body.classList.add('bg-focus'); return }
    document.body.classList.toggle('bg-focus', hasFullscreenDialog())
  }
  // class 属性变化也要监听：弹窗进出场只改类，元素可能保留
  const mo = new MutationObserver(update)
  mo.observe(document.body, { childList: true, attributes: true, attributeFilter: ['class'], subtree: false })
  update()
}

/** 启动入场：壁纸就绪前保持模糊，就绪后 150ms 渐清晰；6s 兜底防挂起 */
function startupSharpen() {
  if (!document.body.classList.contains('with-bg')) return
  bootFocusPending = true
  document.body.classList.add('bg-focus')
  setTimeout(() => clearBootFocus(), 6000)
}

function clearBootFocus() {
  if (!bootFocusPending) return
  bootFocusPending = false
  if (typeof document === 'undefined') return
  if (!hasFullscreenDialog()) document.body.classList.remove('bg-focus')
}

function applyAll() {
  applyGlass()
  applyPalette()
  applyBackground()
}

// ========== 对外操作 ==========

function setGlass(g) {
  state.glass = g
  applyGlass()
}

function setPalette(p) {
  state.palette = p
  applyPalette()
}

/** 随机配色：主色随机色相，副色取相距 40~100° 的邻近色相，整体保持柔和可读 */
function randomizePalette() {
  const ph = Math.floor(Math.random() * 360)
  const dir = Math.random() > 0.5 ? 1 : -1
  const sh = (ph + dir * (40 + Math.floor(Math.random() * 60)) + 360) % 360
  state.palette = {
    p: [ph, 62 + Math.floor(Math.random() * 16), 46 + Math.floor(Math.random() * 10)],
    s: [sh, 55 + Math.floor(Math.random() * 18), 50 + Math.floor(Math.random() * 10)],
  }
  applyPalette()
}

/**
 * 通用 canvas 取色：跨域加载图片副本 → 缩样 → 按色相桶统计饱和度权重 →
 * 取主峰为主色、相距 ≥30° 的次峰为副色。
 * 图源未返回 CORS 许可时浏览器会拒绝读取像素，reject 并说明原因
 */
function extractPaletteFromImage(url) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      reject(new Error('当前环境不支持取色')); return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 64
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        const bins = new Array(36).fill(0)
        const binStat = new Array(36).fill(null).map(() => ({ s: 0, l: 0, n: 0 }))
        for (let i = 0; i < data.length; i += 4) {
          const [h, s, l] = hexToHsl(rgbToHex(data[i], data[i + 1], data[i + 2]))
          if (s < 24 || l < 18 || l > 82) continue // 跳过灰、黑、白
          const b = Math.min(35, Math.floor(h / 10))
          bins[b] += s
          binStat[b].s += s
          binStat[b].l += l
          binStat[b].n++
        }
        const order = bins.map((w, i) => [i, w]).sort((a, b) => b[1] - a[1]).filter(([, w]) => w > 0)
        if (!order.length) { reject(new Error('这张壁纸颜色太素，取不到合适配色')); return }
        const pBin = order[0][0]
        const secBin = order.find(([i]) => {
          const dh = Math.abs(i - pBin) * 10
          return dh >= 30 && dh <= 200
        })
        const pick = (bin) => {
          const st = binStat[bin]
          return [bin * 10 + 5, clamp(st.s / st.n, 48, 85), safeL(st.l / st.n)]
        }
        const p = pick(pBin)
        const s = secBin ? pick(secBin[0]) : [(p[0] + 55) % 360, clamp(p[1], 48, 80), safeL(p[2] + 6)]
        state.palette = { p, s }
        applyPalette()
        resolve(true)
      } catch (e) {
        reject(new Error('该图源未开放跨域读取权限，无法取色'))
      }
    }
    img.onerror = () => reject(new Error('取色图片加载失败（图源未开放跨域权限或地址无效）'))
    img.src = url
  })
}

/** 按当前源换一张随机背景图 */
function shuffleBackground() {
  if (state.bgProvider === 'custom') {
    if (!state.bgCustomUrl.trim()) throw new Error('请先填写图片地址')
    _applyNewBg(state.bgCustomUrl.trim())
    return
  }
  if (state.bgProvider === 'dmoe') {
    _applyNewBg(`https://www.dmoe.cc/random.php?t=${Date.now()}`)
    return
  }
  // 樱花 Alcy 源（默认）：全链路带跨域许可，背景与取色都可用
  _applyNewBg(`https://t.alcy.cc/ycy?t=${Date.now()}`)
}

function _applyNewBg(url) {
  state.bgUrl = url
  state.bgFailed = false
  applyBackground()
  probeBackground()
}

/** 顶栏一键开关背景：开启时无图则自动取一张 */
async function toggleBackground() {
  state.bgEnabled = !state.bgEnabled
  state.bgFailed = false
  if (state.bgEnabled) {
    applyBackground()
    if (!state.bgUrl) {
      try {
        shuffleBackground()
        showToast('壁纸背景已开启 🖼️')
      } catch (e) {
        showToast(e.message || '获取壁纸失败', 'error')
      }
    } else {
      probeBackground()
      showToast(state.bgFailed ? '壁纸背景开启失败' : '壁纸背景已开启 🖼️')
    }
  } else {
    applyBackground()
    showToast('壁纸背景已关闭')
  }
}

// ========== 持久化与初始化 ==========

watch(state, () => {
  const { bgLoading, bgFailed, ...persisted } = state
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)) } catch {}
}, { deep: true })

export function initAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved) {
      // 归一化：Wallhaven API 无跨域许可已移除，历史配置迁移到樱花 Alcy 源
      if (!saved.bgProvider || saved.bgProvider === 'wallhaven') saved.bgProvider = 'alcy'
      Object.assign(state, saved)
    }
  } catch {}
  state.bgLoading = false
  state.bgFailed = false
  applyAll()
  startFocusObserver()
  // 启动时探测上次的壁纸是否仍然可用（接口停服 / 图片被删时自动关闭）
  probeBackground()
  // 壁纸入场：保持模糊直到壁纸就绪，再由糊渐清晰（iOS 风格）
  startupSharpen()
  // 自动换图模式：每次打开换一张（新图加载失败自动回退到上一张可用的壁纸）
  if (state.bgEnabled && state.bgAutoSwitch) {
    autoSwitchOnStartup()
  }
}

export function useAppearance() {
  return {
    state,
    setGlass,
    setPalette,
    randomizePalette,
    extractPaletteFromImage,
    shuffleBackground,
    toggleBackground,
    applyBackground,
  }
}

export { hexToHsl }

/** HSL 数组转 CSS 颜色字符串（用于色板预览） */
export function hslCss([h, s, l]) {
  return `hsl(${h} ${s}% ${l}%)`
}
