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
  bgProvider: 'alcy',       // 'alcy' 樱花Alcy(默认,可取色) | 'dmoe' | 'wallhaven' | 'custom'
  bgAutoSwitch: true,       // 每次打开页面自动换一张；关闭即固定当前壁纸
  bgCustomUrl: '',
  bgDim: 0.55,              // 遮罩浓度 0~0.9
  bgBlur: 0,                // 背景模糊 0~20px
  bgUrl: '',                // 当前生效的图片地址
  bgCors: false,            // 当前图是否可取色
  bgColors: [],             // Wallhaven 返回的壁纸主色（hex 列表）
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

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// 主色亮度钳制在保证白色文字可读的区间
const safeL = l => clamp(l, 40, 58)

// ========== 应用 ==========

function applyPalette() {
  if (typeof document === "undefined") return
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
  if (typeof document === "undefined") return
  if (state.glass === 'liquid') document.body.dataset.glass = 'liquid'
  else delete document.body.dataset.glass
}

function applyBackground() {
  if (typeof document === "undefined") return
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

// 预载探测：加载失败自动摘掉背景层（API 停服 / 图片被删 / 断网时保证页面观感）
function probeBackground() {
  if (typeof Image === 'undefined') return
  if (!state.bgUrl) return
  const img = new Image()
  img.onload = () => {
    state.bgFailed = false
    applyBackground()
  }
  img.onerror = () => {
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
    const timer = setTimeout(() => { img.src = ''; resolve(false) }, timeout)
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

/**
 * Wallhaven 连通性诊断：区分「网络层不可达」「跨域被拦」「瞬时故障」
 * 页面内 fetch 失败的具体原因浏览器不会透露，用对照探测缩小范围
 */
async function diagnoseWallhaven() {
  const steps = []
  steps.push({ name: '浏览器在线状态', ok: navigator.onLine, detail: navigator.onLine ? '在线' : '离线' })

  // 不带跨域语义的请求：失败 = 网络层不可达（DNS/防火墙/代理/扩展拦截）
  let noCorsOk = false, t0 = Date.now()
  try {
    await fetch('https://wallhaven.cc/favicon.ico', { mode: 'no-cors', signal: AbortSignal.timeout(8000) })
    noCorsOk = true
  } catch {}
  steps.push({
    name: '直连请求 (no-cors)',
    ok: noCorsOk,
    detail: noCorsOk ? `${Date.now() - t0}ms，服务器可达` : '失败 — 网络层不可达：DNS 污染 / 防火墙 / 广告拦截扩展'
  })

  // 跨域 API 请求：直连成功而它失败 = 跨域/中间人问题
  let corsOk = false
  t0 = Date.now()
  try {
    const res = await fetch('https://wallhaven.cc/api/v1/search?categories=010&purity=100&sorting=random&atleast=1920x1080', { signal: AbortSignal.timeout(8000) })
    corsOk = res.ok
  } catch {}
  steps.push({
    name: 'API 跨域请求',
    ok: corsOk,
    detail: corsOk ? `${Date.now() - t0}ms，API 正常` : '失败 — 服务器可达但跨域被拦（扩展/代理篡改）或接口故障'
  })

  // 图片加载（无 CORS 要求）：进一步验证静态资源可达性
  let imgOk = false
  t0 = Date.now()
  try {
    imgOk = await probeUrl('https://wallhaven.cc/favicon.ico', 8000)
  } catch {}
  steps.push({
    name: '图片资源加载',
    ok: imgOk,
    detail: imgOk ? `${Date.now() - t0}ms，静态资源可达` : '失败 — 静态资源不可达'
  })

  let conclusion
  if (!navigator.onLine) conclusion = '浏览器处于离线状态，请检查网络连接。'
  else if (!noCorsOk) conclusion = '结论：网络层不可达。可能是 DNS 污染、防火墙拦截或广告拦截扩展，建议改用樱花源（Alcy）。'
  else if (!corsOk) conclusion = '结论：服务器可达但 API 跨域被拦，多为浏览器扩展或代理所致，建议改用樱花源（Alcy）。'
  else if (!imgOk) conclusion = '结论：API 正常但静态资源异常，图片可能加载失败，建议改用樱花源（Alcy）。'
  else conclusion = '结论：Wallhaven 网络与跨域均正常，之前失败应为瞬时故障，可直接重试。'
  steps.push({ name: '诊断结论', ok: true, detail: conclusion })
  return steps
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
 * 从壁纸主色列表（hex）提取配色：主色取饱和度最高者，
 * 副色取色相差 ≥ 30° 的次鲜艳色；找不到合格颜色时返回 false
 */
function pickPaletteFromColors() {
  const candidates = (state.bgColors || [])
    .map(hexToHsl)
    .filter(([, s, l]) => s > 26 && l > 22 && l < 80)
    .sort((a, b) => b[1] - a[1])
  if (!candidates.length) return false
  const p = candidates[0]
  const sec = candidates.find(c => {
    const dh = Math.abs(c[0] - p[0])
    return dh >= 30 && dh <= 200
  })
  state.palette = {
    p: [p[0], clamp(p[1], 48, 85), safeL(p[2])],
    s: sec
      ? [sec[0], clamp(sec[1], 48, 85), safeL(sec[2])]
      : [(p[0] + 55) % 360, clamp(p[1], 48, 80), safeL(p[2] + 6)],
  }
  applyPalette()
  return true
}

/**
 * 通用 canvas 取色：跨域加载图片副本 → 缩样 → 按色相桶统计饱和度权重 →
 * 取主峰为主色、相距 ≥30° 的次峰为副色。
 * 图源未返回 CORS 许可（如樱花接口）时浏览器会拒绝读取像素，reject 并说明原因
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

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

/** 按当前源换一张随机背景图；Wallhaven 同时携带可取色的主色元数据，失败时自动降级 */
async function shuffleBackground() {
  if (state.bgProvider === 'custom') {
    if (!state.bgCustomUrl.trim()) throw new Error('请先填写图片地址')
    _applyNewBg(state.bgCustomUrl.trim(), false, [])
    return
  }
  if (state.bgProvider === 'alcy') {
    // 樱花 Alcy 源：全链路带跨域许可，可直接取色
    _applyNewBg(`https://t.alcy.cc/ycy?t=${Date.now()}`, true, [])
    return
  }
  if (state.bgProvider === 'dmoe') {
    _applyNewBg(`https://www.dmoe.cc/random.php?t=${Date.now()}`, false, [])
    return
  }
  // Wallhaven：动漫分类，SFW，随机排序；不可达时自动降级 Alcy 源
  state.bgLoading = true
  try {
    const seed = Math.random().toString(36).slice(2)
    const res = await fetch(
      `https://wallhaven.cc/api/v1/search?categories=010&purity=100&sorting=random&seed=${seed}&atleast=1920x1080`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) throw new Error(`接口返回 ${res.status}`)
    const json = await res.json()
    const item = json.data?.[0]
    if (!item) throw new Error('未获取到壁纸')
    _applyNewBg(item.path, true, item.colors || [])
  } catch (e) {
    // 降级：本次改用樱花 Alcy 源（不改变用户所选图源，之后仍可重试 Wallhaven）
    _applyNewBg(`https://t.alcy.cc/ycy?t=${Date.now()}`, true, [])
    showToast(`Wallhaven 不可达（${e.message}），已改用樱花 Alcy 源`, 'warning')
  } finally {
    state.bgLoading = false
  }
}

function _applyNewBg(url, cors, colors) {
  state.bgUrl = url
  state.bgCors = cors
  state.bgColors = colors
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
        await shuffleBackground()
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
  const { bgLoading, bgFailed, bgSilentProbe, ...persisted } = state
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)) } catch {}
}, { deep: true })

export function initAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved) {
      // 一次性迁移：Wallhaven 在部分网络不可达，迁移到更稳的樱花 Alcy 源（可在设置中改回）
      if (saved.bgProvider === 'wallhaven' && !localStorage.getItem('banager_wh_migrated')) {
        saved.bgProvider = 'alcy'
        try { localStorage.setItem('banager_wh_migrated', '1') } catch {}
      }
      Object.assign(state, saved)
    }
  } catch {}
  state.bgLoading = false
  state.bgFailed = false
  state.bgSilentProbe = false
  applyAll()
  // 启动时探测上次的壁纸是否仍然可用（API 停服 / 图片被删时自动关闭）
  probeBackground()
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
    pickPaletteFromColors,
    extractPaletteFromImage,
    shuffleBackground,
    toggleBackground,
    applyBackground,
    diagnoseWallhaven,
  }
}

export { hexToHsl }

/** HSL 数组转 CSS 颜色字符串（用于色板预览） */
export function hslCss([h, s, l]) {
  return `hsl(${h} ${s}% ${l}%)`
}
