/**
 * 外观引擎：玻璃风格 / 配色 / 背景图
 * 配色以 HSL 存储并派生明暗变体，写入 :root 的 rgb 通道变量（见 style.css）
 * 背景图通过 body.with-bg + CSS 变量渲染，遮罩与模糊保证可读性
 */
import { reactive, watch } from "vue";
import { showToast } from "./useToast";
import { relLum, deriveTextScale, contrast } from "./colorMath.js";

const STORAGE_KEY = "banager_appearance";

const state = reactive({
  glass: "frost", // 'frost' 毛玻璃 | 'liquid' 液态玻璃
  palette: null, // null = 默认樱紫；否则 { p: [h,s,l], s: [h,s,l] }
  paletteMode: "auto", // 'auto' 跟随壁纸取色 | 'random' 每次随机 | 'manual' 预设/自定义固定
  effYWall: null, // 当前壁纸平均相对亮度（0~1），供自适应文字取色使用
  bgEnabled: false,
  bgProvider: "alcy", // 'alcy' 樱花Alcy(默认,可取色) | 'dmoe' | 'custom'
  bgAutoSwitch: false, // 每次打开页面自动换一张；默认关闭——刷新保持当前壁纸（用户可手动开启）
  bgCustomUrl: "",
  bgDim: 0.55, // 遮罩浓度 0~0.9
  bgBlur: 0, // 背景模糊 0~20px
  bgUrl: "", // 当前生效的图片地址
  bgLoading: false,
  bgFailed: false, // 运行时标记：当前图片加载失败（不持久化）
});

// ========== 壁纸图源配置 ==========
// entry：随机端点（每次返回不同图）；api：地址接口（返回最终稳定图床 URL，全程 CORS 许可）。
// 固定壁纸时把随机端点解析成稳定地址，刷新不再换图。
const PROVIDERS = {
  alcy: {
    api: () => `https://t.alcy.cc/ycy?json=true`,
  },
  dmoe: {
    api: () => `https://www.dmoe.cc/random.php?json`,
  },
};

// 把"随机端点"解析为"稳定图床地址"（固定壁纸用）。
//   ① no-cors 跟随重定向：拿到 302 后的最终图床直链（最稳定）
//   ② api 端点：alcy 的 api 接口返回 JSON 字符串形式 `https://tc...webp`（实测形态）
//   ③ 兜底：返回原 URL（可能是端点本身，调用方应能感知仍可能刷新换图）
async function resolveStableUrl(url, provider) {
  if (provider === "custom") return url || "";
  const p = PROVIDERS[provider] || PROVIDERS.alcy;
  // ① no-cors 跟随重定向：r.url 就是 302 后最终地址
  try {
    const r = await fetch(url, { mode: "no-cors", redirect: "follow" });
    if (r.url && /^https?:\/\//.test(r.url) && r.url !== url) return r.url;
  } catch {}
  // ② api 端点：alcy 的 json 接口实测返回 `https://tc.alcy.cc/...webp` 形式的纯文本
  try {
    const res = await fetch(p.api());
    if (res.ok) {
      const txt = (await res.text()).trim().replace(/^["']|["']$/g, "");
      // 优先匹配 URL 行；若是 JSON 形式（{"url":"..."}），也兜住
      const m =
        txt.match(/https?:\/\/[^\s"<>]+\.(?:jpg|jpeg|png|webp|gif|avif)/i) ||
        txt.match(/"url"\s*:\s*"(https?:[^"]+)"/) ||
        (/^https?:\/\//.test(txt) ? [null, txt] : null);
      if (m && m[1]) return m[1];
    }
  } catch {}
  return url;
}

// 启动时若已持久化的 bgUrl 仍是随机端点（旧配置/被回退破坏），自动重新解析为稳定地址。
// 关键：识别 alcy 的根端点本身 `t.alcy.cc/ycy[/?]` 而不依赖 ?t=... 参数（很多旧/被截断的链接没参数）
async function migratePinnedEndpoint() {
  if (!state.bgEnabled || !state.bgUrl || state.bgAutoSwitch) return;
  const u = state.bgUrl;
  const isRandom =
    /t\.alcy\.cc\/ycy(\/?|\/?\?|\?|$)/.test(u) || // alcy 端点本体（含末尾/、?、?json）
    /dmoe\.cc\/random/.test(u) ||
    /[?&]t=\d{8,}/.test(u);
  if (!isRandom) return;
  try {
    const stable = await resolveStableUrl(u, state.bgProvider);
    if (stable && stable !== u) {
      state.bgUrl = stable;
      state.bgFailed = false;
      applyBackground();
      probeBackground();
    }
  } catch {}
}

// 自动换图开关：关闭即“固定当前壁纸”——把当前随机端点解析为稳定地址再保存
async function setAutoSwitch(v) {
  state.bgAutoSwitch = v;
  if (!v && state.bgUrl) {
    try {
      const stable = await resolveStableUrl(state.bgUrl, state.bgProvider);
      if (stable && stable !== state.bgUrl) {
        state.bgUrl = stable;
        state.bgFailed = false;
        applyBackground();
        probeBackground();
      }
    } catch {}
  }
}

// ========== 颜色工具 ==========

function hslToRgbTriplet([h, s, l]) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to255 = (v) => Math.round(v * 255);
  return `${to255(f(0))} ${to255(f(8))} ${to255(f(4))}`;
}

function hexToHsl(hex) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// 主色亮度钳制在保证白色文字可读的区间
const safeL = (l) => clamp(l, 40, 58);

// ========== 应用 ==========

function applyPalette() {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  if (!state.palette) {
    [
      "--c-primary",
      "--c-primary-light",
      "--c-primary-dark",
      "--c-secondary",
      "--c-secondary-light",
      "--c-secondary-dark",
    ].forEach((v) => root.removeProperty(v));
    return;
  }
  // 配色变更时短暂挂 .palette-animating，让全树色彩过渡 ~0.3s 平滑切换，
  // 避免取色/切换模式/随机化时子元素硬跳。350ms 后自动卸下。
  if (typeof document !== "undefined") {
    document.body.classList.add("palette-animating");
    if (applyPalette._t) clearTimeout(applyPalette._t);
    applyPalette._t = setTimeout(() => {
      document.body.classList.remove("palette-animating");
    }, 360);
  }
  const [ph, ps, pl] = state.palette.p;
  const [sh, ss, sl] = state.palette.s;
  const p = [ph, clamp(ps, 45, 85), safeL(pl)];
  const s = [sh, clamp(ss, 45, 85), safeL(sl)];
  root.setProperty("--c-primary", hslToRgbTriplet(p));
  root.setProperty(
    "--c-primary-light",
    hslToRgbTriplet([p[0], p[1] * 0.9, Math.min(p[2] + 14, 74)]),
  );
  root.setProperty(
    "--c-primary-dark",
    hslToRgbTriplet([p[0], p[1], Math.max(p[2] - 10, 28)]),
  );
  root.setProperty("--c-secondary", hslToRgbTriplet(s));
  root.setProperty(
    "--c-secondary-light",
    hslToRgbTriplet([s[0], s[1] * 0.9, Math.min(s[2] + 12, 74)]),
  );
  root.setProperty(
    "--c-secondary-dark",
    hslToRgbTriplet([s[0], s[1], Math.max(s[2] - 10, 28)]),
  );
}

function applyGlass() {
  if (typeof document === "undefined") return;
  if (state.glass === "liquid") document.body.dataset.glass = "liquid";
  else delete document.body.dataset.glass;
  // 玻璃风格影响侧栏背景亮度，需重算自适应文字色
  applyAdaptiveText();
}

// ========== 自适应文字取色（保证任意背景上文字都可读） ==========
// 分「有壁纸 / 无壁纸」两种背景建模：有壁纸时按「玻璃 + 遮罩 + 壁纸」合成各区域
// 有效亮度；无壁纸时用各区域固定底色的亮度常数；壁纸亮度未知（取色失败）时按中值
// 估计——遮罩主导下文字色仍随明暗模式保持可读。再用 colorMath.deriveTextScale
// 推导出可读文字色阶（深/浅自适应），写入 --txt-* 变量并挂 body.adaptive。
function applyAdaptiveText() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = root.classList.contains("dark");
  const withBg = state.bgEnabled && state.bgUrl && !state.bgFailed;
  const yWall = state.effYWall == null ? 0.5 : state.effYWall;
  let effYMain, effYSb;
  if (withBg) {
    const bgDim = clamp(state.bgDim, 0, 0.9);
    const scrimLum = dark ? 0.02 : 0.9;
    effYMain = (1 - bgDim) * yWall + bgDim * scrimLum;
    if (state.glass === "liquid") {
      // 液态玻璃底色随模式：浅色亮玻璃 / 深色暗玻璃，文字色需相应翻转
      effYSb = dark ? 0.1 : 0.86;
    } else {
      const sbAlpha = dark ? 0.78 : 0.62;
      effYSb = (1 - sbAlpha) * yWall + sbAlpha * 0.02;
    }
  } else {
    // 无壁纸：取固定底色亮度（body 渐变 / 侧栏渐变）。
    // 侧栏随玻璃风格区分：液态玻璃浅色是白玻璃（亮，需深字），磨砂/深色是深底（需浅字）
    effYMain = dark ? 0.07 : 0.93;
    effYSb = dark ? 0.12 : state.glass === "liquid" ? 0.85 : 0.16;
  }
  document.body.classList.add("adaptive");
  const base = [100, 116, 139]; // 继承蓝灰色相/饱和，避免变成中性灰
  const cfg = { target: 4.6, r400: 0.8, r300: 0.62, min: 0, max: 0.98 };
  // 深/浅两个方向都算一遍，取对比度更高的一组：中间亮度区（约 0.18~0.45）单独任一
  // 方向都够不到 4.5，选对比度大者至少保证可读
  const pick = (effY) => {
    const darkScale = deriveTextScale(effY, base, cfg, true);
    const lightScale = deriveTextScale(effY, base, cfg, false);
    const cr = (g) => contrast(relLum(g.split(" ").map(Number)), effY);
    return cr(darkScale[2]) >= cr(lightScale[2]) ? darkScale : lightScale;
  };
  const main = pick(effYMain);
  const sb = pick(effYSb);
  root.style.setProperty("--txt-main-300", main[0]);
  root.style.setProperty("--txt-main-400", main[1]);
  root.style.setProperty("--txt-main-500", main[2]);
  root.style.setProperty("--txt-sb-300", sb[0]);
  root.style.setProperty("--txt-sb-400", sb[1]);
  root.style.setProperty("--txt-sb-500", sb[2]);
}

function applyBackground() {
  if (typeof document === "undefined") return;
  // 图片加载失败时彻底回到原渐变底色，不留遮罩层影响可读性
  const active = state.bgEnabled && state.bgUrl && !state.bgFailed;
  document.body.classList.toggle("with-bg", active);
  document.body.classList.toggle("bg-nofx", !!state.bgNoFx);
  ensureBlurLayer();
  const root = document.documentElement.style;
  if (active) {
    root.setProperty("--bg-image", `url("${state.bgUrl}")`);
    root.setProperty("--bg-blur", `${state.bgBlur}px`);
    root.setProperty("--bg-dim", String(clamp(state.bgDim, 0, 0.9)));
  } else {
    root.setProperty("--bg-image", "none");
    root.setProperty("--bg-blur", "0px");
    root.setProperty("--bg-dim", "0");
  }
  // 壁纸开关变化后同步自适应文字取色状态
  applyAdaptiveText();
}

// 常驻模糊层（见 style.css #bg-blur-layer）：与清晰层做 opacity 交叉淡入淡出，
// 全程合成器处理，避免全屏 blur 动画每帧重栅格化拖垮 4K 渲染
function ensureBlurLayer() {
  if (typeof document === "undefined" || !document.body) return;
  if (!document.getElementById("bg-blur-layer")) {
    const el = document.createElement("div");
    el.id = "bg-blur-layer";
    document.body.insertBefore(el, document.body.firstChild);
  }
}

// ========== 壁纸加载探测 ==========

// 启动面包屑：每步落一条 console 日志，页面卡住时 F12 Console 的最后一行即卡点
export function crumb(msg) {
  try {
    console.log(`[appearance] ${msg}`);
  } catch {}
}

// 预载探测：加载失败自动摘掉背景层（接口停服 / 图片被删 / 断网时保证页面观感）
function probeBackground() {
  if (typeof Image === "undefined") return;
  if (!state.bgUrl) return;
  crumb(`probe start: ${state.bgUrl.slice(0, 60)}`);
  const img = new Image();
  img.onload = () => {
    crumb("probe ok");
    state.bgFailed = false;
    applyBackground();
    // 跟随壁纸取色（paletteMode==='auto' 时生效；失败静默，不影响页面）
    analyzeWallpaper(state.bgUrl);
    // 启动入场：壁纸就绪后由糊渐清晰
    clearBootFocus();
  };
  img.onerror = () => {
    crumb("probe error");
    bootFocusPending = false;
    if (state.bgFailed) return;
    state.bgFailed = true;
    applyBackground();
    if (!state.bgSilentProbe) {
      showToast(
        "背景图加载失败，已自动关闭背景（可稍后在设置中重试）",
        "warning",
      );
    }
  };
  img.src = state.bgUrl;
}

// 带超时的探测，返回 Promise<boolean>（用于启动自动换图失败时回退旧壁纸）
function probeUrl(url, timeout = 8000) {
  return new Promise((resolve) => {
    if (typeof Image === "undefined" || !url) {
      resolve(false);
      return;
    }
    const img = new Image();
    const timer = setTimeout(() => {
      // 不能置空 src：空字符串会解析为当前页面地址（file:// 下触发安全警告），改为移除属性
      img.onload = img.onerror = null;
      img.removeAttribute("src");
      resolve(false);
    }, timeout);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}
/** 启动时自动换一张：新图加载失败则回退到上一张可用的壁纸 */
async function autoSwitchOnStartup() {
  const prev = state.bgUrl;
  crumb("autoswitch start");
  state.bgSilentProbe = true;
  try {
    await shuffleBackground();
    crumb("autoswitch shuffled");
    if (state.bgUrl && state.bgUrl !== prev) {
      const ok = await probeUrl(state.bgUrl);
      crumb(`autoswitch probe: ${ok ? "ok" : "fail"}`);
      if (!ok && prev) {
        state.bgUrl = prev;
        state.bgFailed = false;
        applyBackground();
        probeBackground();
        showToast("新壁纸加载失败，已保留原壁纸", "warning");
      }
    }
  } catch (e) {
    crumb(`autoswitch error: ${e?.message || e}`);
  } finally {
    state.bgSilentProbe = false;
  }
}

// ========== iOS 风格壁纸聚焦动画 ==========
// 有弹窗打开时壁纸加深模糊（进入"应用"状态），关闭后渐清晰（回到"桌面"状态）；
// 页面启动/刷新时保持模糊直到壁纸加载完成，再由糊渐清晰入场
let focusObserverStarted = false;
let bootFocusPending = false;

function hasFullscreenDialog() {
  return !!document.querySelector("body > .fixed.inset-0.z-50");
}

function startFocusObserver() {
  if (
    focusObserverStarted ||
    typeof MutationObserver === "undefined" ||
    typeof document === "undefined"
  )
    return;
  focusObserverStarted = true;
  const update = () => {
    try {
      // 启动入场期间保持模糊（壁纸就绪后由 clearBootFocus 渐清晰）
      if (bootFocusPending) {
        document.body.classList.add("bg-focus");
        return;
      }
      // 减少动效模式：无聚焦模糊
      if (state.bgNoFx) {
        document.body.classList.remove("bg-focus");
        return;
      }
      document.body.classList.toggle("bg-focus", hasFullscreenDialog());
    } catch (e) {
      console.error(e);
    }
  };
  const mo = new MutationObserver(update);
  mo.observe(document.body, {
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
    subtree: false,
  });
  update();
}

/** 启动入场：壁纸就绪前保持模糊，就绪后渐清晰。
 *  双保险收尾：图片 onload/onerror 事件 + 2.5s 硬超时，任一先到都结束入场，
 *  不存在永久停留模糊态的路径 */
function startupSharpen() {
  ensureBlurLayer();
  if (!document.body.classList.contains("with-bg") || state.bgNoFx) return;
  crumb("boot sharpen start");
  bootFocusPending = true;
  document.body.classList.add("bg-focus");
  let settled = false;
  const finish = (why) => {
    if (settled) return;
    settled = true;
    crumb(`boot sharpen finish (${why})`);
    setTimeout(clearBootFocus, 150);
  };
  try {
    const img = new Image();
    img.onload = () => finish("loaded");
    img.onerror = () => finish("imgerr");
    img.src = state.bgUrl;
  } catch {
    finish("exception");
  }
  setTimeout(() => finish("timeout"), 2500);
}

function clearBootFocus() {
  if (!bootFocusPending) return;
  bootFocusPending = false;
  if (typeof document === "undefined") return;
  if (!hasFullscreenDialog()) document.body.classList.remove("bg-focus");
}

function applyAll() {
  applyGlass();
  applyPalette();
  applyBackground();
}

// ========== 对外操作 ==========

function setGlass(g) {
  state.glass = g;
  applyGlass();
}

function setPalette(p) {
  state.palette = p;
  applyPalette();
}

/** 随机配色：主色随机色相，副色取相距 40~100° 的邻近色相，整体保持柔和可读 */
function randomizePalette() {
  const ph = Math.floor(Math.random() * 360);
  const dir = Math.random() > 0.5 ? 1 : -1;
  const sh = (ph + dir * (40 + Math.floor(Math.random() * 60)) + 360) % 360;
  state.palette = {
    p: [
      ph,
      62 + Math.floor(Math.random() * 16),
      46 + Math.floor(Math.random() * 10),
    ],
    s: [
      sh,
      55 + Math.floor(Math.random() * 18),
      50 + Math.floor(Math.random() * 10),
    ],
  };
  applyPalette();
}

/** 配色模式切换：'auto' 跟随壁纸取色、'random' 随机、'manual'/预设/自定义则保持当前配色 */
function setPaletteMode(mode) {
  state.paletteMode = mode;
  if (mode === "auto") {
    // 切回「跟随壁纸」：立即用当前壁纸重新取色（无壁纸则保持现状）
    if (state.bgEnabled && state.bgUrl) analyzeWallpaper(state.bgUrl);
  } else if (mode === "random") {
    randomizePalette();
  }
  // 'manual' / 预设 / 自定义：配色已由对应入口（setPalette / applyCustomBackground）设定，保持不变
}

/** 应用自定义图片地址为壁纸（「完成」时调用） */
function applyCustomBackground() {
  if (state.bgProvider !== "custom") state.bgProvider = "custom";
  const url = (state.bgCustomUrl || "").trim();
  if (!url) return;
  _applyNewBg(url);
}

/**
 * 通用 canvas 取色：跨域加载图片副本 → 缩样 → 按色相桶统计饱和度权重 →
 * 取主峰为主色、相距 ≥30° 的次峰为副色。
 * 纯取色器：resolve 返回色板 { p, s }，并写入 state.effYWall（平均亮度），
 * **不**直接改 state.palette / 应用主题——是否应用由 analyzeWallpaper 按模式决定。
 * 图源未返回 CORS 许可时浏览器会拒绝读取像素，reject 并说明原因
 */
function extractPaletteFromImage(url) {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined" || typeof document === "undefined") {
      reject(new Error("当前环境不支持取色"));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        // 平均亮度（供自适应文字取色）：取全像素均值，代表壁纸整体明暗。
        // 必须在取色逻辑之前计算——即便壁纸“太素”取不到主色，亮度仍可用于文字可读性。
        {
          let sumR = 0, sumG = 0, sumB = 0;
          for (let i = 0; i < data.length; i += 4) {
            sumR += data[i];
            sumG += data[i + 1];
            sumB += data[i + 2];
          }
          const px = data.length / 4;
          state.effYWall = relLum([sumR / px, sumG / px, sumB / px]);
        }
        const bins = new Array(36).fill(0);
        const binStat = new Array(36)
          .fill(null)
          .map(() => ({ s: 0, l: 0, n: 0 }));
        for (let i = 0; i < data.length; i += 4) {
          const [h, s, l] = hexToHsl(
            rgbToHex(data[i], data[i + 1], data[i + 2]),
          );
          if (s < 24 || l < 18 || l > 82) continue; // 跳过灰、黑、白
          const b = Math.min(35, Math.floor(h / 10));
          bins[b] += s;
          binStat[b].s += s;
          binStat[b].l += l;
          binStat[b].n++;
        }
        const order = bins
          .map((w, i) => [i, w])
          .sort((a, b) => b[1] - a[1])
          .filter(([, w]) => w > 0);
        if (!order.length) {
          reject(new Error("这张壁纸颜色太素，取不到合适配色"));
          return;
        }
        const pBin = order[0][0];
        const secBin = order.find(([i]) => {
          const dh = Math.abs(i - pBin) * 10;
          return dh >= 30 && dh <= 200;
        });
        const pick = (bin) => {
          const st = binStat[bin];
          return [bin * 10 + 5, clamp(st.s / st.n, 48, 85), safeL(st.l / st.n)];
        };
        const p = pick(pBin);
        const s = secBin
          ? pick(secBin[0])
          : [(p[0] + 55) % 360, clamp(p[1], 48, 80), safeL(p[2] + 6)];
        resolve({ p, s });
      } catch (e) {
        reject(new Error("该图源未开放跨域读取权限，无法取色"));
      }
    };
    img.onerror = () =>
      reject(new Error("取色图片加载失败（图源未开放跨域权限或地址无效）"));
    img.src = url;
  });
}

// ========== 壁纸取色（含跨域代理回退） ==========

// 部分图源（dmoe / 自定义直链）不返回 CORS 许可，直连 canvas 取色会被污染而失败。
// 依次走这些图片代理拿到「带 CORS 头、像素可读」的副本再取色。
const CORS_PROXIES = [
  // weserv：专为图片设计、稳定且返回 Access-Control-Allow-Origin: *，需去掉协议头
  (u) => `https://images.weserv.nl/?url=${encodeURIComponent(u.replace(/^https?:\/\//, ""))}`,
  // cors.sh：经验证稳定返回 200 + ACAO:*（可读像素）
  (u) => `https://proxy.cors.sh/${u}`,
  // allorigins：通用代理，返回原始字节并带 CORS 头（偶发不稳定，兜底）
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

/**
 * 跟随壁纸取色：壁纸加载成功后提取主色并应用到主题（仅 paletteMode==='auto' 时）。
 * 直连 crossOrigin 取色失败（图源未开放 CORS）时，依次走图片代理再取色；
 * 全部失败则静默放弃（不抛错、不改动当前主题）。
 * 随机/预设/自定义模式下**不**覆盖当前配色，只更新亮度（effYWall）供文字自适应。
 */
async function analyzeWallpaper(url) {
  if (!url) return;
  let got = null;
  const attempt = async (src) => {
    const pal = await extractPaletteFromImage(src);
    got = pal;
    return true;
  };
  let paletteDone = false;
  try {
    await attempt(url);
    paletteDone = true;
    crumb("wallpaper palette: direct ok");
  } catch (e) {
    crumb(`wallpaper palette direct failed: ${e?.message || e}`);
  }
  // 直连失败 → 依次走代理（仍会写入 state.effYWall 供文字取色）
  if (!paletteDone) {
    for (const make of CORS_PROXIES) {
      try {
        const res = await fetch(make(url));
        if (!res.ok) continue;
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        try {
          await attempt(objUrl);
          paletteDone = true;
          crumb("wallpaper palette: proxy ok");
          break;
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      } catch (e) {
        crumb(`wallpaper palette proxy failed: ${e?.message || e}`);
      }
    }
  }
  // 应用取色：仅「跟随壁纸取色」模式把壁纸色板写为主题色
  if (got && state.paletteMode === "auto") {
    state.palette = got;
    applyPalette();
  }
  // 自适应文字取色：只要拿到壁纸亮度就应用，与 paletteMode 无关（固定/随机配色下文字仍需可读）
  applyAdaptiveText();
  if (!paletteDone && state.paletteMode === "auto") {
    crumb("wallpaper palette: all methods failed, keep current theme");
  }
}

/** 按当前源换一张随机背景图 */
async function shuffleBackground() {
  if (state.bgProvider === "custom") {
    if (!state.bgCustomUrl.trim()) throw new Error("请先填写图片地址");
    await _applyNewBg(state.bgCustomUrl.trim());
    return;
  }
  if (state.bgProvider === "dmoe") {
    await _applyNewBg(`https://www.dmoe.cc/random.php?t=${Date.now()}`);
    return;
  }
  // 樱花 Alcy 源（默认）：全链路带跨域许可，背景与取色都可用
  await _applyNewBg(`https://t.alcy.cc/ycy?t=${Date.now()}`);
}

async function _applyNewBg(url) {
  // 随机配色模式：每次换图（含刷新）都重新生成配色
  if (state.paletteMode === "random") randomizePalette();
  // 关键修复：先把随机端点解析成稳定地址，再 set state.bgUrl + applyBackground。
  // 否则首屏用端点渲染，迁移解析后换图 = 「啪」地切一张。
  // 自定义直链本身就是稳定地址，resolveStableUrl 会原样返回。
  let stable = url;
  try {
    stable = (await resolveStableUrl(url, state.bgProvider)) || url;
  } catch {}
  state.bgUrl = stable;
  state.bgFailed = false;
  applyBackground();
  probeBackground();
}

/** 顶栏一键开关背景：开启时无图则自动取一张 */
async function toggleBackground() {
  state.bgEnabled = !state.bgEnabled;
  state.bgFailed = false;
  if (state.bgEnabled) {
    applyBackground();
    if (!state.bgUrl) {
      try {
        shuffleBackground();
        showToast("壁纸背景已开启 🖼️");
      } catch (e) {
        showToast(e.message || "获取壁纸失败", "error");
      }
    } else {
      probeBackground();
      showToast(state.bgFailed ? "壁纸背景开启失败" : "壁纸背景已开启 🖼️");
    }
  } else {
    applyBackground();
    showToast("壁纸背景已关闭");
  }
}

// ========== 持久化与初始化 ==========

watch(
  state,
  () => {
    const { bgLoading, bgFailed, ...persisted } = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {}
  },
  { deep: true },
);

export async function initAppearance() {
  // ?nobg / #nobg 逃生通道：URL 带此标记时跳过整个背景系统，保证页面永远能打开
  const nobg =
    /[?&]nobg/.test(location.search) || /#.*[?&]nobg/.test(location.hash);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      // 归一化：Wallhaven API 无跨域许可已移除，历史配置迁移到樱花 Alcy 源
      if (!saved.bgProvider || saved.bgProvider === "wallhaven")
        saved.bgProvider = "alcy";
      // 迁移：旧版默认「每次打开自动换一张」=true，导致刷新即换图；一次性改为固定（保留当前壁纸）。
      // 之后用户仍可在设置里手动开启自动换图。
      try {
        if (!localStorage.getItem("banager_autoswitch_migrated")) {
          if (saved.bgAutoSwitch === true) saved.bgAutoSwitch = false;
          localStorage.setItem("banager_autoswitch_migrated", "1");
        }
      } catch {}
      Object.assign(state, saved);
      // 关键修复：先 AWAIT 迁移到稳定地址，再 applyBackground。
      // 否则首屏会用随机端点加载一张图，几百毫秒后迁移解析换稳定地址，
      // 用户看到「刷新后壁纸突然从一张切到另一张」。
      await migratePinnedEndpoint();
    }
    crumb(
      `config loaded: enabled=${state.bgEnabled} provider=${state.bgProvider} auto=${state.bgAutoSwitch} url=${state.bgUrl?.slice(0, 60) || "(empty)"}`,
    );
  } catch (e) {
    console.error("外观配置读取失败，已重置", e);
  }
  state.bgLoading = false;
  state.bgFailed = false;
  if (nobg) {
    crumb("nobg escape active");
    state.bgEnabled = false;
    applyGlass();
    applyPalette();
    startFocusObserver();
    return;
  }
  crumb("applyAll");
  applyAll();
  // 每次刷新随机配色：随机模式在每次加载时重新生成配色
  if (state.paletteMode === "random") randomizePalette();
  startFocusObserver();
  // 暗色模式切换会改 scrim 亮度，需重算自适应文字色
  try {
    new MutationObserver(() => applyAdaptiveText()).observe(
      document.documentElement,
      { attributes: true, attributeFilter: ["class"] },
    );
  } catch {}
  // 启动时探测上次的壁纸是否仍然可用（接口停服 / 图片被删时自动关闭）
  try {
    probeBackground();
  } catch (e) {
    console.error(e);
  }
  // 自动换图模式：每次打开换一张（新图加载失败自动回退到上一张可用的壁纸）
  if (state.bgEnabled && state.bgAutoSwitch) {
    autoSwitchOnStartup();
  }
  crumb("init done (sync part)");
}

export function useAppearance() {
  return {
    state,
    setGlass,
    setPalette,
    setPaletteMode,
    setAutoSwitch,
    randomizePalette,
    extractPaletteFromImage,
    shuffleBackground,
    toggleBackground,
    applyBackground,
    applyCustomBackground,
    analyzeWallpaper,
  };
}

export { hexToHsl, setPaletteMode, setAutoSwitch, applyCustomBackground, analyzeWallpaper };

/** HSL 数组转 CSS 颜色字符串（用于色板预览） */
export function hslCss([h, s, l]) {
  return `hsl(${h} ${s}% ${l}%)`;
}
