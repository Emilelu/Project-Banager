/**
 * 外观引擎：玻璃风格 / 配色 / 背景图
 * 配色以 HSL 存储并派生明暗变体，写入 :root 的 rgb 通道变量（见 style.css）
 * 背景图通过 body.with-bg + CSS 变量渲染，遮罩与模糊保证可读性
 */
import { reactive, watch } from "vue";
import { showToast } from "./useToast";
import { t } from "./useI18n";
import { relLum, deriveTextScale, contrast, rgbWithLum } from "./colorMath.js";

const STORAGE_KEY = "banager_appearance";

const state = reactive({
  glass: "liquid", // 'frost' 毛玻璃 | 'liquid' 液态玻璃（默认）
  palette: null, // null = 默认樱紫；否则 { p: [h,s,l], s: [h,s,l] }
  // 默认「跟随壁纸取色」：接入自建代理（CUSTOM_PROXY）后取色能力已恢复，
  // 故回到最能体现壁纸氛围的模式。无代理时该模式会取色失败并静默保持默认配色。
  paletteMode: "auto", // 'auto' 跟随壁纸取色（默认） | 'random' 每次刷新随机 | 'manual' 预设/自定义固定
  effYWall: null, // 当前壁纸平均相对亮度（0~1），供自适应文字取色使用
  bgEnabled: true, // 随机壁纸背景默认开启
  // 默认 alcy：图质最佳（用户实测对比后选定）。代价是该图源无 CORS 头，
  // 取色与「一键下载」不可用，只能降级为打开原图后另存。
  // 'alcy' 樱花(默认) | 'dmoe' | 'loliapi' ACG(带 CORS，可取色/下载，但图库较旧) | 'custom'
  bgProvider: "alcy",
  bgAutoSwitch: true, // 默认"每次打开自动换一张"（刷新/重开换新壁纸）；用户可在设置中切为固定当前壁纸
  bgCustomUrl: "",
  bgDim: 0.25, // 遮罩浓度 0~0.9（默认 25%）
  bgBlur: 5, // 背景模糊 0~20px（默认 5px）
  bgUrl: "", // 当前生效的图片地址（原始地址，用于持久化）
  // 运行时：壁纸字节的 blob URL（带 CORS 图源抓取而来），**不持久化**。
  // 存在 state 中是为了让它「就绪」这一事件能驱动下游——显示/预览/下载都等它，
  // 从而彻底避免「预览先跑、字节后到」的时序空窗。
  bgBlobUrl: "",
  bgLoading: false,
  bgFailed: false, // 运行时标记：当前图片加载失败（不持久化）
});

// ========== 壁纸图源配置 ==========
// entry：随机端点（每次返回不同图）；api：地址接口（返回最终稳定图床 URL，全程 CORS 许可）。
// 固定壁纸时把随机端点解析成稳定地址，刷新不再换图。
// cors 标记：该图源是否返回 Access-Control-Allow-Origin（决定能否直连 fetch/取色/下载）。
//   2026-09-14 实测：alcy 与 dmoe 全链路（含其 json api 端点）**均无 ACAO 头**，
//   而原注释误标为「全链路带跨域许可」，导致取色与「下载原图」长期静默失败。
//   loliapi 实测返回 `access-control-allow-origin: *`，可直连 fetch → 取色/下载/字节缓存全部可用。
const PROVIDERS = {
  loliapi: {
    entry: () => `https://www.loliapi.com/acg/`,
    cors: true,
  },
  alcy: {
    api: () => `https://t.alcy.cc/ycy/?json=true`,
    cors: false,
  },
  dmoe: {
    api: () => `https://www.dmoe.cc/random.php?json`,
    cors: false,
  },
};

// 把"随机端点"解析为"稳定图床地址"（固定壁纸用）。
//   ① 已是稳定图床直链（tc./img. 等）直接短路返回，避免多余网络往返（启动不再为已固定壁纸做无谓解析）
//   ② no-cors 跟随重定向：拿到 302 后的最终图床直链（最稳定）
//   ③ api 端点：alcy 的 api 接口返回 JSON 字符串形式 `https://tc...webp`（实测形态）
//   ④ 兜底：返回原 URL（可能是端点本身，调用方应能感知仍可能刷新换图）
async function resolveStableUrl(url, provider) {
  if (provider === "custom") return url || "";
  // 已带图床域名/扩展名的直链无需再解析（例如 tc.alcy.cc/xxx.webp）
  if (/^https?:\/\/[^/]+\/[^\s"<>]+\.(?:jpg|jpeg|png|webp|gif|avif)/i.test(url))
    return url;
  const p = PROVIDERS[provider] || PROVIDERS.alcy;
  // ① 自建代理（CUSTOM_PROXY）：它跟随 302 后把最终图床地址用 X-Final-Url 回传 ——
  //    这是唯一可靠的途径。注意下面 ② 的 no-cors 方案其实拿不到 r.url：
  //    opaque response 的 url 按 Fetch 规范是**空字符串**，这正是此前
  //    「固定当前壁纸」始终失效的根因（不是功能设计问题）。
  if (CUSTOM_PROXY) {
    try {
      const res = await fetch(CUSTOM_PROXY + encodeURIComponent(url));
      const final = res.headers.get("X-Final-Url");
      if (final && /^https?:\/\//.test(final) && final !== url) return final;
    } catch {}
  }
  // ② no-cors 跟随重定向（对同源等场景仍可能有效，保留作兜底）
  try {
    const r = await fetch(url, { mode: "no-cors", redirect: "follow" });
    if (r.url && /^https?:\/\//.test(r.url) && r.url !== url) return r.url;
  } catch {}
  // ② api 端点：alcy 的 json 接口实测返回 `https://tc.alcy.cc/...webp` 形式的纯文本
  try {
    const res = await fetch(p.api());
    if (res.ok) {
      const txt = (await res.text()).trim().replace(/^["']|["']$/g, "");
      // 直接匹配完整 URL：正则无捕获组时 match()[0] 才是完整匹配，[1] 是 undefined
      const m = txt.match(
        /https?:\/\/[^\s"<>]+\.(?:jpg|jpeg|png|webp|gif|avif)/i,
      );
      if (m && m[0]) return m[0];
      // JSON 形式兜底：{"url":"https://..."}
      const j = txt.match(/"url"\s*:\s*"(https?:[^"]+)"/);
      if (j && j[1]) return j[1];
      // 纯 URL 文本兜底
      if (/^https?:\/\//.test(txt)) return txt;
    }
  } catch {}
  return url;
}

// 该地址是否为「随机端点」（每次请求可能返回不同图）。用于启动时判断是否需要先解析/换图。
function isRandomEndpoint(u) {
  return (
    /t\.alcy\.cc\/ycy(\/?|\/?\?|\?|$)/.test(u) || // alcy 端点本体（含末尾/、?、?json）
    /dmoe\.cc\/random/.test(u) ||
    /loliapi\.com\/acg/.test(u) || // loliapi 随机端点（无稳定地址接口，每次请求换图）
    /[?&]t=\d{8,}/.test(u)
  );
}

// 启动时若已持久化的 bgUrl 仍是随机端点（旧配置/被回退破坏），自动重新解析为稳定地址。
// 关键：识别 alcy 的根端点本身 `t.alcy.cc/ycy[/?]` 而不依赖 ?t=... 参数（很多旧/被截断的链接没参数）
// 返回是否发生了「迁移换图」（调用方据此决定是否还要再取一张/再探测）。
async function migratePinnedEndpoint() {
  if (!state.bgEnabled || !state.bgUrl || state.bgAutoSwitch) return false;
  const u = state.bgUrl;
  if (!isRandomEndpoint(u)) return false;
  try {
    const stable = await resolveStableUrl(u, state.bgProvider);
    if (stable && stable !== u) {
      bgGen++; // 迁移也算一次换图，使旧的 probeBackground 回调作废
      state.bgUrl = stable;
      state.bgFailed = false;
      applyBackground();
      probeBackground();
      return true;
    }
  } catch {}
  return false;
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

// 把 HSL 换算成相对亮度——用于按「实际亮度」而非 HSL 的 L 来判断可读性。
// 为什么必须这样：同样的 L=50，黄色系的相对亮度远高于蓝色系。只按 L 做加减来派生
// 深/浅变体，会让黄、青系配色下的 text-primary-dark 压在浅色玻璃卡片上直接糊掉
// （用户实测：随机配色转到某些色相时，选中按钮与星期表头的文字看不清）。
function hslRelLum([h, s, l]) {
  return relLum(hslToRgbTriplet([h, s, l]).split(" ").map(Number));
}

/** 朝暗处收敛，直到在 bgY 亮度的背景上达到 target 对比度 */
/** 朝暗处收敛，直到在 bgY 亮度的背景上达到 target 对比度（供浅色背景使用）
 *  与 lightenToContrast 对称：二分找达标的最大 L，达不到就降饱和兜底。 */
function darkenToContrast(hsl, bgY, target = 4.5, minL = 14) {
  const [h, s0, l0] = hsl;
  const lumAt = (sat, l) => hslRelLum([h, sat, clamp(l, 0, 100)]);

  const solve = (sat) => {
    // 纯黑是下界：若纯黑都不达标（背景本身很暗），该饱和度无解
    if (contrast(lumAt(sat, 0), bgY) < target) return null;
    let lo = 0;
    let hi = clamp(l0, 0, 100);
    if (contrast(lumAt(sat, hi), bgY) >= target) return hi;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (contrast(lumAt(sat, mid), bgY) >= target) lo = mid;
      else hi = mid;
    }
    return Math.max(minL, lo);
  };

  let sat = clamp(s0, 0, 100);
  let l = solve(sat);
  while (l == null && sat > 8) {
    sat -= 6;
    l = solve(sat);
  }
  if (l == null) return [h, sat, 0];
  // 二分得到的是浮点阈值；取整时朝「更安全」的方向对齐，避免因舍入跌破 target
  let li = Math.round(l);
  for (let i = 0; i < 6 && contrast(lumAt(sat, li), bgY) < target && li > 0; i++) li -= 1;
  return [h, sat, Math.max(minL, li)];
}

/** 朝亮处收敛，直到在 bgY 亮度的背景上达到 target 对比度（供暗色背景使用）
 *
 * 原实现用固定 maxL=88 且步进 +2，两个问题：
 *   1. 循环条件先判断后自增，可能返回 89/90，越出上限；
 *   2. 高饱和蓝色在 L=88 仍达不到 4.5:1（实测 3.94:1），函数却不报也不降饱和。
 * 现改为：先在 sRGB 可达的 L 范围内二分出「刚好达标」的最大 L；
 * 若整条亮度轴都达不到，则逐步降饱和再二分（降饱和能提高相对亮度），
 * 直到达标或饱和度触底。
 */
function lightenToContrast(hsl, bgY, target = 4.5) {
  const [h, s0, l0] = hsl;
  const lumAt = (sat, l) => hslRelLum([h, sat, clamp(l, 0, 100)]);

  // 给定饱和度，二分找「对比度达标」所需的最小 L
  const solve = (sat) => {
    if (contrast(lumAt(sat, 100), bgY) < target) return null; // 该饱和度下纯白也不达标
    let lo = clamp(l0, 0, 100);
    let hi = 100;
    // 起点已达标就直接用它（不要人为提亮）
    if (contrast(lumAt(sat, lo), bgY) >= target) return lo;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (contrast(lumAt(sat, mid), bgY) >= target) hi = mid;
      else lo = mid;
    }
    return hi;
  };

  let sat = clamp(s0, 0, 100);
  let l = solve(sat);
  while (l == null && sat > 8) {
    sat -= 6;
    l = solve(sat);
  }
  if (l == null) {
    // 极端情况（例如背景本身极亮）：回退到纯白，保证文字至少可见
    return [h, sat, 100];
  }
  let li = Math.round(l);
  for (let i = 0; i < 6 && contrast(lumAt(sat, li), bgY) < target && li < 100; i++) li += 1;
  return [h, sat, Math.min(100, li)];
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
  const [ph, ps, pl] = state.palette.p;
  const [sh, ss, sl] = state.palette.s;
  const p = [ph, clamp(ps, 45, 85), safeL(pl)];
  const s = [sh, clamp(ss, 45, 85), safeL(sl)];
  // 结果缓存：色板没变化（同一套主/副色）就直接返回，
  // 不重复写 6 个 CSS 变量、不挂 .palette-animating 全树过渡类（取色/重算触发时可省下大量样式重算）
  const key = `${p[0]},${p[1]},${p[2]}|${s[0]},${s[1]},${s[2]}`;
  if (key === applyPalette._lastKey) return;
  applyPalette._lastKey = key;
  // 配色变更时短暂挂 .palette-animating，让全树色彩过渡平滑切换，
  // 避免取色/切换模式/随机化时子元素硬跳。时长已收窄（0.18s，见 style.css）——
  // 过长会拉长“变色期间操作掉帧”的窗口，过短则失去平滑感。240ms 后自动卸下。
  if (typeof document !== "undefined") {
    document.body.classList.add("palette-animating");
    if (applyPalette._t) clearTimeout(applyPalette._t);
    applyPalette._t = setTimeout(() => {
      document.body.classList.remove("palette-animating");
    }, 240);
  }
  root.setProperty("--c-primary", hslToRgbTriplet(p));
  // 派生变体不再用「固定加减 L」，而是各自朝目标背景亮度收敛到可读：
  //   · light 变体服务于**深色**玻璃卡片（相对亮度约 0.12）→ 朝亮收敛
  //   · dark  变体服务于**浅色**玻璃卡片（约 0.82，与 --txt-card-* 的推导同源）→ 朝暗收敛
  // 这样无论随机配色抽到黄、青还是紫，选中态按钮与星期表头的文字都能保持可读。
  const DARK_BG_Y = 0.12;
  const LIGHT_BG_Y = 0.82;
  root.setProperty(
    "--c-primary-light",
    hslToRgbTriplet(
      lightenToContrast([p[0], p[1] * 0.9, Math.min(p[2] + 14, 74)], DARK_BG_Y),
    ),
  );
  root.setProperty(
    "--c-primary-dark",
    hslToRgbTriplet(
      darkenToContrast([p[0], p[1], Math.max(p[2] - 10, 28)], LIGHT_BG_Y),
    ),
  );
  root.setProperty("--c-secondary", hslToRgbTriplet(s));
  root.setProperty(
    "--c-secondary-light",
    hslToRgbTriplet(
      lightenToContrast([s[0], s[1] * 0.9, Math.min(s[2] + 12, 74)], DARK_BG_Y),
    ),
  );
  root.setProperty(
    "--c-secondary-dark",
    hslToRgbTriplet(
      darkenToContrast([s[0], s[1], Math.max(s[2] - 10, 28)], LIGHT_BG_Y),
    ),
  );
}

function applyGlass() {
  if (typeof document === "undefined") return;
  if (state.glass === "liquid") document.body.dataset.glass = "liquid";
  else delete document.body.dataset.glass;
  // 玻璃风格影响侧栏背景亮度，需重算自适应文字色（合并到帧内，避免与其它动画叠加）
  scheduleAdaptiveText();
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
  // 启动延迟应用背景期间（bgDeferred），背景图尚未显示，按"无壁纸"建模文字色
  const withBg =
    state.bgEnabled && state.bgUrl && !state.bgFailed && !bgDeferred;
  const yWall = state.effYWall == null ? 0.5 : state.effYWall;
  // 高对比度模式（prefers-contrast: more）目标对比度提到 7:1（WCAG AAA）
  // 系统/浏览器开启"高对比度"时自动启用，覆盖全组件、全模式、全场景
  const targetContrast =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-contrast: more)").matches
      ? 7
      : 4.6;
  // 结果缓存：输入（明暗/有无壁纸/玻璃风格/壁纸亮度/遮罩/目标对比度）不变就跳过，
  // 避免取色、开关壁纸、切换模式等高频路径重复写 6 个 CSS 变量触发样式重算
  const key = `${dark}|${withBg}|${state.glass}|${yWall}|${state.bgDim}|${targetContrast}`;
  if (key === applyAdaptiveText._lastKey) return;
  applyAdaptiveText._lastKey = key;
  let effYMain, effYSb;
  if (withBg) {
    const bgDim = clamp(state.bgDim, 0, 0.9);
    const scrimLum = dark ? 0.02 : 0.9;
    effYMain = (1 - bgDim) * yWall + bgDim * scrimLum;
    // 侧栏是固定玻璃底色（毛玻璃 0.7 白 / 0.8 深紫黑；液态白/黑渐变），
    // 有效亮度与壁纸亮度无关，取常数——保证侧栏文字色不随壁纸明暗翻转
    //
    // 注：曾尝试按「液态玻璃半透明 → 壁纸透出 → 视觉更暗」来改估算，
    // 但实测侧栏像素是浅灰紫 rgb(200,197,205)（亮度 ~0.78，属亮底），
    // 原常数 0.85 与之吻合，选出的深色字是**正确**的。已回滚，勿再改。
    effYSb = dark ? 0.12 : 0.85;
  } else {
    // 无壁纸：取固定底色亮度（body 渐变 / 侧栏玻璃）。
    // 侧栏毛玻璃与液态同为固定玻璃底色（浅色亮玻璃需深字 / 暗色暗玻璃需浅字）
    effYMain = dark ? 0.07 : 0.93;
    effYSb = dark ? 0.12 : 0.85;
  }
  document.body.classList.add("adaptive");
  const base = [100, 116, 139]; // 继承蓝灰色相/饱和，避免变成中性灰
  const cfg = {
    target: targetContrast,
    r400: 0.8,
    r300: 0.62,
    min: 0,
    max: 0.98,
  };
  // 深/浅两个方向都算一遍，取对比度更高的一组：中间亮度区（约 0.18~0.45）单独任一
  // 方向都够不到 4.5，选对比度大者至少保证可读
  // deepTowardDark：第四档（deeper）的推进方向。传 true 时按「文字相对模型背景的
  // 实际位置」决定——中间偏暗的背景（深壁纸浅色模式）会选中深色字，此时第四档必须
  // 继续变深；旧的 `effY > 0.5 ? 深 : 浅` 推断在这种中间区会反向提亮，
  // 把 --txt-card-700 推成 1.2:1 的不可读灰（A-07）。仅 --txt-card-700 消费 [3] 档，
  // main/sb 两套不受影响；深色模式保持旧行为避免连带变化（卡片文字由 .dark 规则接管）。
  const pick = (effY, deepTowardDark) => {
    const darkScale = deriveTextScale(effY, base, cfg, true);
    const lightScale = deriveTextScale(effY, base, cfg, false);
    const cr = (g) => contrast(relLum(g.split(" ").map(Number)), effY);
    const scale = cr(darkScale[2]) >= cr(lightScale[2]) ? darkScale : lightScale;
    // 第四档：专供压在浅色玻璃上的次级小字（计数 / 链接 / 说明）。
    // 实测前三档在亮壁纸下仍可能低于 4.5:1，故再推一档：把当前最深档的亮度
    // 朝"远离背景"方向再压/提一截，用 rgbWithLum 保证方向正确且不过冲。
    const [r, g, b] = scale[2].split(" ").map(Number);
    const curY = relLum([r, g, b]);
    const targetY = deepTowardDark
      ? Math.max(0, curY - 0.12)
      : effY > 0.5
        ? Math.max(0.06, curY - 0.12)
        : Math.min(0.94, curY + 0.12);
    const deeper = rgbWithLum([r, g, b], targetY).join(" ");
    return [scale[0], scale[1], scale[2], deeper];
  };
  const main = pick(effYMain);
  const sb = pick(effYSb);
  root.style.setProperty("--txt-main-300", main[0]);
  root.style.setProperty("--txt-main-400", main[1]);
  root.style.setProperty("--txt-main-500", main[2]);
  root.style.setProperty("--txt-sb-300", sb[0]);
  root.style.setProperty("--txt-sb-400", sb[1]);
  root.style.setProperty("--txt-sb-500", sb[2]);
  // —— 玻璃卡片内的文字色阶 ——
  // 卡片底色是半透明白，其**有效亮度**并非壁纸亮度：需按不透明度把「卡片底色」与「壁纸亮度」混合。
  // 液态玻璃沿 135° 从 0.62 渐变到 0.30，取最不利的 0.30（壁纸透上来最多、卡片最暗的角落）计算，
  // 保证卡片最暗处依然可读；毛玻璃是 0.70 更亮，套用同一结果只会更安全。
  // 仅用于浅色模式（暗色模式的卡片是深紫底，由 .dark 规则的浅色字接管）。
  const wallY = typeof state.effYWall === "number" ? state.effYWall : 0.5;
  // A-07：卡片有效亮度改为「sRGB 空间逐通道 alpha 合成 → 再取相对亮度」。
  // 原来在亮度空间线性混合（0.3×1 + 0.7×wallY）会高估深壁纸下的卡片亮度：
  // 近黑壁纸实测卡角 ~rgb(122,119,136)（亮度 ≈0.19），模型却给 0.303，
  // 派生的 --txt-card-500/700 偏深且 700 档方向反转，压在中灰卡上仅 1.21~1.43:1。
  // 合成链与渲染一致：壁纸(按灰阶近似) → 遮罩(dim×scrim) → 液态玻璃最不利角 0.30 白。
  // 灰阶近似不影响亮度合成；亮壁纸结果与旧模型几乎一致（0.93 vs 0.93），仅深壁纸被修正。
  // 暗色模式保持旧公式：卡片文字由 .dark 规则接管，避免连带改动（见上方 pick 注释）。
  const effYCard = (() => {
    if (dark) return 0.3 * 1.0 + 0.7 * wallY;
    const y = clamp(wallY, 0, 1);
    const wallV =
      y <= 0.04045 ? 12.92 * y * 255 : 255 * (1.055 * Math.pow(y, 1 / 2.4) - 0.055);
    const scrimV = 247; // --bg-scrim-light: 245 243 255 的近似灰
    const dim = clamp(state.bgDim, 0, 0.9);
    const masked = (1 - dim) * wallV + dim * scrimV;
    const carded = 0.3 * 255 + 0.7 * masked;
    return relLum([carded, carded, carded]);
  })();
  const card = pick(effYCard, !dark);
  root.style.setProperty("--txt-card-300", card[0]);
  root.style.setProperty("--txt-card-400", card[1]);
  root.style.setProperty("--txt-card-500", card[2]);
  // 更深一档：压在浅色玻璃上的次级文字（说明文字、计数、链接等）需要 ≥4.5:1，
  // 前三档只保证到 500 的灰度，遇到亮壁纸仍可能不足，故补一档 700。
  root.style.setProperty("--txt-card-700", card[3] ?? card[2]);
}

// 自适应文字取色的 rAF 合并器：高频路径（遮罩/模糊滑块拖动、开关壁纸、明暗切换等）
// 每帧最多重算一次。--txt-* 写在 :root 上会传播到所有引用它的元素，拖动滑块时
// 每个 @input 事件同步触发一次全树样式重算，叠加在其它过渡动画上就是卡顿。
// 合并后同一帧内的多次触发只落地一次（读取最新 state，天然幂等）。
let _adaptRaf = 0;
function scheduleAdaptiveText() {
  if (_adaptRaf) return;
  _adaptRaf = requestAnimationFrame(() => {
    _adaptRaf = 0;
    applyAdaptiveText();
  });
}

// ========== 壁纸字节缓存 ==========
// 目的：让「背景显示 / 取色 / 弹窗预览 / 下载原图」四者使用**同一份字节**。
// 背景：图源多为随机端点（同一 URL 每次请求返回不同图），仅凭 URL 无法复现同一张，
//   直接导致「预览/下载拿到的图 ≠ 当前背景」。带 CORS 的图源可 fetch 成 blob 缓存，
//   四者共用该 blob 即可彻底一致；无 CORS 图源（alcy/dmoe）跳过缓存，退回旧行为。
// blob URL 本体存放在 state.bgBlobUrl（响应式，用于驱动预览/显示重建）；
// 这里只保留**非响应式**的 Blob 引用——避免 Vue 深度代理一个 Blob 对象。
let bgBlobObj = null; // 对应的 Blob 对象，供 createImageBitmap 直接离线程解码取色
let bgBlobType = ""; // 图片 MIME，供下载时决定文件扩展名
let bgBlobGen = 0; // 代际：换图时递增，使在途的缓存结果作废

/**
 * 校验并白名单过滤壁纸图片 URL：
 * 只接受 http/https 绝对地址、以及同源相对路径 / blob:（预览用）。
 * 明确拒绝 javascript:、data:、file: 等任何可能被顶层打开的 scheme。
 * @returns {string} 合法则返回规范化后的 URL，否则返回空串
 */
export function sanitizeImageUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  try {
    const parsed = new URL(s, typeof location !== "undefined" ? location.href : "http://localhost/");
    if (parsed.username || parsed.password) return "";
    const proto = parsed.protocol;
    if (proto === "http:" || proto === "https:" || proto === "blob:") return parsed.href;
    return "";
  } catch {
    return "";
  }
}

/** 相对/同源路径也允许（例如 ./assets/x.png 这类），但必须不含危险 scheme */
function isSafeRelativePath(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  if (/^(javascript|data|vbscript|file|about):/i.test(s)) return false;
  return /^(\.\/|\.\.\/|\/)/.test(s) || /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif|avif)/i.test(s);
}

/** 对外统一入口：绝对 URL 走白名单，相对路径单独判断 */
export function sanitizeBackgroundUrl(raw) {
  const abs = sanitizeImageUrl(raw);
  if (abs) return abs;
  return isSafeRelativePath(raw) ? String(raw).trim() : "";
}

// ========== 本地配置 schema 校验 ==========
const APPEARANCE_DEFAULTS = {
  glass: "liquid",
  palette: null,
  paletteMode: "auto",
  bgEnabled: true,
  bgProvider: "alcy",
  bgCustomUrl: "",
  bgUrl: "",
  bgDim: 0.25,
  bgBlur: 5,
  bgAutoSwitch: true,
};

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizePalette(p) {
  if (p == null) return null;
  if (!isPlainObject(p)) return null;
  const pv = p.p;
  const sv = p.s;
  if (!Array.isArray(pv) || pv.length !== 3 || !Array.isArray(sv) || sv.length !== 3) return null;
  const tuple = (t) => t.every((n) => typeof n === "number" && Number.isFinite(n));
  if (!tuple(pv) || !tuple(sv)) return null;
  return { p: pv.map(Number), s: sv.map(Number) };
}

function normalizeAppearance(raw) {
  if (!isPlainObject(raw)) return null;
  const out = { ...APPEARANCE_DEFAULTS };
  // 只接受已知 key，逐字段按类型/范围校验；未知字段单过滤，不整体丢弃
  if (typeof raw.glass === "string" && ["frost", "liquid"].includes(raw.glass)) {
    out.glass = raw.glass;
  }
  out.palette = normalizePalette(raw.palette);
  if (typeof raw.paletteMode === "string" && ["auto", "manual", "random"].includes(raw.paletteMode)) {
    out.paletteMode = raw.paletteMode;
  }
  if (typeof raw.bgEnabled === "boolean") out.bgEnabled = raw.bgEnabled;
  // A-24：'custom' 是 UI 支持的图源（AppearanceView 下拉第 4 项）但不在这张 PROVIDERS
  // 表里——原先每次启动都会把持久化的 custom 重置回 alcy，而 bgUrl 仍是自定义地址，
  // UI 与实际壁纸自相矛盾（用户点「换一张」就会被随机图悄悄覆盖）。白名单放行 custom。
  if (
    typeof raw.bgProvider === "string" &&
    (raw.bgProvider in PROVIDERS || raw.bgProvider === "custom")
  ) {
    out.bgProvider = raw.bgProvider;
  }
  if (typeof raw.bgCustomUrl === "string") out.bgCustomUrl = sanitizeBackgroundUrl(raw.bgCustomUrl);
  if (typeof raw.bgUrl === "string") out.bgUrl = sanitizeBackgroundUrl(raw.bgUrl);
  if (typeof raw.bgDim === "number" && raw.bgDim >= 0 && raw.bgDim <= 1) out.bgDim = raw.bgDim;
  if (typeof raw.bgBlur === "number" && raw.bgBlur >= 0 && raw.bgBlur <= 40) out.bgBlur = raw.bgBlur;
  if (typeof raw.bgAutoSwitch === "boolean") out.bgAutoSwitch = raw.bgAutoSwitch;
  return out;
}

function providerHasCors(p) {
  return !!(PROVIDERS[p] && PROVIDERS[p].cors);
}

// 代理运行时健康度：最近一次经自建代理请求的结果。
// 之前 providerBlocksPalette 只看「常量是否非空」，导致代理挂了 UI 仍宣称可取色，
// 这里改为结合真实运行结果判断。
const proxyHealth = { lastOkAt: 0, lastFailAt: 0, consecutiveFails: 0 };

export function markProxyResult(ok) {
  if (ok) {
    proxyHealth.lastOkAt = Date.now();
    proxyHealth.consecutiveFails = 0;
  } else {
    proxyHealth.lastFailAt = Date.now();
    proxyHealth.consecutiveFails += 1;
  }
}

export function getProxyHealth() {
  return {
    configured: !!CUSTOM_PROXY,
    healthy: proxyHealth.consecutiveFails === 0 && proxyHealth.lastOkAt > 0,
    consecutiveFails: proxyHealth.consecutiveFails,
    lastOkAt: proxyHealth.lastOkAt,
    lastFailAt: proxyHealth.lastFailAt,
  };
}

/**
 * 该图源是否「取色不可用」。
 * 判定链：图源自带 CORS → 可用；否则看自建代理是否配置且运行时健康。
 */
export function providerBlocksPalette(p) {
  const cfg = PROVIDERS[p];
  // 图源自己支持 CORS，无需代理
  if (cfg && cfg.cors === true) return false;
  // custom：未知，允许用户尝试
  if (p === "custom") return false;
  // 无 CORS 的内置图源：必须有代理，且代理不能处于连续失败状态
  if (!CUSTOM_PROXY) return true;
  if (proxyHealth.consecutiveFails >= 2) return true;
  return false;
}

/** 供弹窗预览 / 下载读取当前壁纸字节；无缓存返回 null（调用方退回旧逻辑） */
export function getWallpaperBlob() {
  return state.bgBlobUrl
    ? { url: state.bgBlobUrl, type: bgBlobType, blob: bgBlobObj }
    : null;
}

function clearWallpaperBlob() {
  bgBlobGen++;
  const prev = state.bgBlobUrl;
  state.bgBlobUrl = "";
  bgBlobObj = null;
  bgBlobType = "";
  // 延迟 revoke：立即撤销会让仍在引用该 blob 的 CSS 背景在「清除 → 新图就绪」的空窗里失效
  // （表现为换图瞬间壁纸闪没）。延迟到新图早该就绪之后再回收。
  if (prev)
    setTimeout(() => {
      try {
        URL.revokeObjectURL(prev);
      } catch {}
    }, 3000);
}

/** 抓取壁纸字节并缓存为 blob URL。仅供带 CORS 的图源调用。 */
async function cacheWallpaperBlob(url) {
  const gen = bgBlobGen;
  // 隐私约束：只有「内置图源」（alcy/dmoe/loliapi，其 URL 由代码自己生成、不含用户私密信息）
  // 才允许经自建代理 / 第三方代理外发。
  // 用户自定义 URL 可能携带 token / 内网地址，默认绝不外发，只做直连尝试。
  const isBuiltinProvider = !!(PROVIDERS[state.bgProvider] && state.bgProvider !== "custom");
  const allowProxy = isBuiltinProvider && !!CUSTOM_PROXY;
  const viaProxy = allowProxy ? CUSTOM_PROXY + encodeURIComponent(url) : "";
  // 直连可行性闸：cors:false 的内置图源（alcy/dmoe，实测响应无 ACAO 头）跨域直连
  // fetch 必被 CORS 拦截（读不到字节），尝试注定失败、还会以「CORS policy +
  // Failed to load resource」两条 console error 落地。自建代理失败时不再做这种
  // 必败直连，让失败静默降级（背景/预览显示走 <img>/CSS，不受 CORS 限制）。
  // 同源地址与 cors:true 图源（loliapi）直连仍保留。
  const directFetchAllowed = !(
    isCrossOrigin(url) &&
    PROVIDERS[state.bgProvider] &&
    PROVIDERS[state.bgProvider].cors === false
  );
  const sources = (isCrossOrigin(url) ? [viaProxy, url] : [url, viaProxy]).filter(
    (s) => s && (s === viaProxy || directFetchAllowed),
  );
  for (const src of sources) {
    try {
      const res = await fetch(src, { mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob || !blob.size) throw new Error("empty blob");
      if (gen !== bgBlobGen) return false; // 抓取期间已换图，丢弃本次结果
      const prev = state.bgBlobUrl;
      state.bgBlobUrl = URL.createObjectURL(blob);
      bgBlobObj = blob;
      bgBlobType = blob.type || "image/webp";
      if (prev) setTimeout(() => URL.revokeObjectURL(prev), 1000);
      // 经自建代理成功 → 标记代理健康，供 providerBlocksPalette 判断
      if (src.startsWith(CUSTOM_PROXY || "\u0000")) markProxyResult(true);
      crumb(
        `wallpaper blob cached: ${(blob.size / 1024).toFixed(0)}KB ${bgBlobType}`,
      );
      return true;
    } catch (e) {
      if (src.startsWith(CUSTOM_PROXY || "\u0000")) markProxyResult(false);
      // 日志里不打印完整 URL，避免 token 落入 console
      crumb(`wallpaper blob failed (${src.split("?")[0].slice(0, 46)}): ${e?.message || e}`);
    }
  }
  return false;
}

// 启动"延迟应用背景"标记：启动需要换图/解析时，首屏先不显示旧壁纸（避免 A→B 硬切闪烁），
// 等后台就绪后一次性应用新壁纸 + 淡入（revealWallpaper）。仅启动路径设置。
let bgDeferred = false;

function applyBackground() {
  if (typeof document === "undefined") return;
  // 图片加载失败或延迟应用期间，彻底回到原渐变底色，不留遮罩层影响可读性
  const active =
    state.bgEnabled && state.bgUrl && !state.bgFailed && !bgDeferred;
  document.body.classList.toggle("with-bg", active);
  document.body.classList.toggle("bg-nofx", !!state.bgNoFx);
  // 自定义壁纸标记：弹窗聚焦时对自定义大图降级（不做额外模糊，见 style.css .bg-custom.bg-focus）
  document.body.classList.toggle("bg-custom", state.bgProvider === "custom");
  ensureBlurLayer();
  const root = document.documentElement.style;
  if (active) {
    // 优先使用本地缓存的 blob（带 CORS 图源）：与预览/下载/取色同源同字节，
    // 避免随机端点被二次请求时拿到另一张图；无缓存时退回原始 URL。
    const src = state.bgBlobUrl || state.bgUrl;
    root.setProperty("--bg-image", `url("${src}")`);
    root.setProperty("--bg-blur", `${state.bgBlur}px`);
    root.setProperty("--bg-dim", String(clamp(state.bgDim, 0, 0.9)));
  } else {
    root.setProperty("--bg-image", "none");
    root.setProperty("--bg-blur", "0px");
    root.setProperty("--bg-dim", "0");
  }
  // 壁纸开关/遮罩/模糊变化后同步自适应文字取色状态（合并到帧内，滑块拖动不逐事件重算）
  scheduleAdaptiveText();
}

// 壁纸"入场"：挂 bg-reveal（opacity:0）→ 双 rAF 摘除 → CSS 0.4s 淡入。
// 纯 opacity 过渡（合成器属性），不触碰模糊/缩放，无重栅格化风险。
function revealWallpaper() {
  try {
    document.body.classList.add("bg-reveal");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.body.classList.remove("bg-reveal")),
    );
  } catch {}
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
  const gen = bgGen; // 捕获探测启动时的代际
  // 有本地 blob 时探测 blob：同源必定成功，既避免对随机端点重复请求（会抽到另一张），
  // 也避免网络抖动误判为「加载失败」而把好好的背景关掉。
  const url = state.bgBlobUrl || state.bgUrl;
  crumb(`probe start: ${url.slice(0, 60)}`);
  const img = new Image();
  let settled = false;
  // 悬挂保护：TCP 已连但不返回内容时 onerror 永不触发，必须有超时兜底
  const timer = setTimeout(() => {
    if (settled || gen !== bgGen) return;
    settled = true;
    img.onload = img.onerror = null;
    img.removeAttribute("src");
    crumb("probe timeout");
    handleProbeError();
  }, 10000);
  const cleanup = () => {
    clearTimeout(timer);
  };
  const handleProbeError = () => {
    bootFocusPending = false;
    const startup = startupProbeActive;
    startupProbeActive = false;
    if (state.bgFailed) return;
    if (startup && !state.bgAutoSwitch && state.bgEnabled) {
      crumb("probe error @startup → self-heal shuffle");
      shuffleBackground().catch(() => {
        state.bgFailed = true;
        applyBackground();
        showToast(t("appearance.bgLoadFailedAutoOff"), "warning");
      });
      return;
    }
    state.bgFailed = true;
    applyBackground();
    if (!state.bgSilentProbe) {
      // A-22：这里原先硬编码中文，en/ja 界面会弹出中文提示（相邻 toast 均走 i18n）。
      // key appearance.bgLoadFailedAutoOff 三语早已存在（自愈分支 758 行在用）。
      showToast(t("appearance.bgLoadFailedAutoOff"), "warning");
    }
  };
  img.onload = () => {
    if (settled) return;
    settled = true;
    cleanup();
    if (gen !== bgGen) return; // 壁纸已换，本次探测作废
    startupProbeActive = false;
    crumb("probe ok");
    state.bgFailed = false;
    applyBackground();
    // 跟随壁纸取色（paletteMode==='auto' 时生效；失败静默，不影响页面）
    analyzeWallpaper(url);
  };
  img.onerror = () => {
    if (settled) return;
    settled = true;
    cleanup();
    if (gen !== bgGen) return; // 壁纸已换，本次探测作废
    crumb("probe error");
    handleProbeError();
  };
  img.src = url;
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
      // 探测优先用字节缓存（blob 同源零网络）：缓存就绪本身就证明新图可用，
      // 不必再对图床直连发起 Image 请求 —— 该直连请求若被页面导航/关闭打断，
      // 会以 net::ERR_ABORTED console error 落地（验收 dark@1440 /#/remaining 实测 1 例）。
      // 无缓存（代理失败）时才退回直连探测，保持原有自愈语义。
      const ok = await probeUrl(state.bgBlobUrl || state.bgUrl);
      crumb(`autoswitch probe: ${ok ? "ok" : "fail"}`);
      if (!ok && prev) {
        state.bgUrl = prev;
        state.bgFailed = false;
        applyBackground();
        probeBackground();
        showToast(t("appearance.newWallpaperFailed"), "warning");
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
  // 只有**真正的全屏对话框**才触发壁纸聚焦（加深模糊 + 缩放）。
  //
  // 判据：对话框的遮罩层带半透明黑底（bg-black/30 + backdrop-blur-[8px]），
  // 而右键菜单 / 下拉菜单的遮罩层是**完全透明的点击捕获层**
  // （只有 fixed inset-0 z-*，没有任何背景色）。
  //
  // 用「是否有背景色」区分比用 z 值可靠：
  //   · 对话框  z-50 + bg-black/30
  //   · 菜单    z-40 / z-[100] / z-[199]，背景 transparent
  //
  // 用户要求：打开弹窗时壁纸才缩放，打开右键菜单/下拉菜单时不要缩放。
  const overlays = document.querySelectorAll("body > .fixed.inset-0");
  for (const el of overlays) {
    const bg = getComputedStyle(el).backgroundColor;
    // transparent / rgba(0,0,0,0) 表示透明遮罩 → 是菜单，不算对话框
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return true;
  }
  return false;
}

// 弹窗是否处于「关闭过渡」中：Vue 的 <transition name="modal|modal-overlay"> 在 v-if 置 false 时
// 会先给元素挂 modal-leave-active / modal-leave-from 类跑完 0.25s 离场动画，之后才把元素从 DOM 移除。
// 壁纸缩放必须在「离场动画开始」那一刻就同步启动，而不是等元素移除。
function hasClosingModal() {
  return !!document.querySelector(
    "body > .fixed.inset-0.z-50.modal-leave-from, body > .fixed.inset-0.z-50.modal-leave-active, " +
      "body > .fixed.inset-0.z-50.modal-overlay-leave-from, body > .fixed.inset-0.z-50.modal-overlay-leave-active",
  );
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
      const closing = hasClosingModal();
      const open = hasFullscreenDialog() && !closing;
      // 弹窗打开期间挂 modal-active：CSS 据此让取色/文字变色在开窗动画期间平滑过渡
      setModalActive(open);
      // 关闭过渡一开始就摘掉 bg-focus（不等元素移除），壁纸缩放/模糊用与打开一致的
      // 0.8s 缓动回桌面态，呈现自然平缓的过渡（不再用 0.25s 快进）
      document.body.classList.toggle("bg-focus", open);
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

// ========== 启动“内容先行、外观后续”时序 ==========
// 背景图解析/取色是网络+画布异步，挂载前 await 会挡住首帧内容（白屏窗口）。
// 改为：先同步应用「本地能立刻算出的外观」（玻璃/配色/自适应文字），再在空闲帧
// 里异步补背景图与取色；应用过程中给 <html> 挂 pre-app-ready，禁止动画类，
// 结束后摘除，让动画回放（切页 fade / 弹窗开合）自然生效。

function prepAppReadyTag() {
  try {
    document.documentElement.classList.add("pre-app-ready");
    setTimeout(
      () => document.documentElement.classList.remove("pre-app-ready"),
      600,
    );
  } catch {}
}

// 空闲执行：优先 requestIdleCallback（后台低优先级，不抢主线程），否则降级 setTimeout
function scheduleIdle(fn, timeout = 150) {
  if (typeof window !== "undefined" && window.requestIdleCallback) {
    try {
      window.requestIdleCallback(() => fn(), { timeout });
      return;
    } catch {}
  }
  setTimeout(fn, 1);
}

// 每帧最多做一件事的“空闲调度器”：把耗时回写（取色应用 / 文字变色应用）拆成
// 多次 rAF（必要时穿插 IdleCallback），避免一次任务里连续触发多次样式重算，
// 降低进入页面后“取色→改文字色”时的卡顿与变色延迟感。
const frameQueue = [];
let frameScheduled = false;
function scheduleFrameTask(fn) {
  frameQueue.push(fn);
  if (frameScheduled) return;
  frameScheduled = true;
  const run = () => {
    frameScheduled = false;
    const next = frameQueue.shift();
    if (next) {
      try {
        next();
      } catch (e) {
        console.error(e);
      }
      // 队列里若还有任务，继续放到下一帧执行（一次只做一件）
      if (frameQueue.length) scheduleFrameTask(run);
    }
  };
  requestAnimationFrame(run);
}

// 弹窗开启期间挂 class，供 CSS 让取色/文字色在弹窗打开动画期间平滑过渡
function setModalActive(active) {
  try {
    document.body.classList.toggle("modal-active", !!active);
  } catch {}
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

/**
 * 应用自定义图片地址为壁纸（「完成」时调用）。
 * A-21：sanitizeImageUrl/sanitizeBackgroundUrl 原先只在「下次启动」的
 * normalizeAppearance 里生效，运行时输入 javascript: 等非法 scheme 会原样直通
 * state.bgUrl 并持久化、无任何提示。这里在入口先过安全闸：
 *   - 空：toast pleaseEnterUrl（原先静默 return）
 *   - 非法：toast invalidWallpaperUrl（三语 key）
 *   - 合法：按返回的规范化 URL 应用
 * @returns {boolean} 是否真正发起了应用（false = 被拦截，调用方不应再报成功）
 */
function applyCustomBackground() {
  if (state.bgProvider !== "custom") state.bgProvider = "custom";
  const url = (state.bgCustomUrl || "").trim();
  if (!url) {
    showToast(t("toast.pleaseEnterUrl"), "error");
    return false;
  }
  const safe = sanitizeBackgroundUrl(url);
  if (!safe) {
    showToast(t("toast.invalidWallpaperUrl"), "error");
    return false;
  }
  if (safe !== url) state.bgCustomUrl = safe; // 绝对地址规范化后回填输入框，持久化值与显示一致
  _applyNewBg(safe);
  return true;
}

/**
 * 通用取色：把图源（url 或 Blob）缩成 64x64 采样图，按色相桶统计饱和度权重，
 * 取主峰为主色、相距 ≥30° 的次峰为副色。
 * 纯取色器：resolve 返回色板 { p, s }，并写入 state.effYWall（平均亮度），
 * **不**直接改 state.palette / 应用主题——是否应用由 analyzeWallpaper 按模式决定。
 * 性能：解码用 createImageBitmap（离主线程，且 resize 在解码管线内直接缩到 256，
 * 不占全尺寸位图开销）——替代旧的 new Image() 主线程解码整张高清原图（4K/8K
 * 时解码即掉帧源）。主线程只做 64x64 绘制 + 色相统计（微秒级）。
 * src 为 url 时先 fetch（无 CORS 许可会 reject，由 analyzeWallpaper 走代理）；为 Blob 时直接用。
 */
async function extractPaletteFromImage(src) {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    throw new Error("当前环境不支持取色");
  }
  const blob =
    typeof src === "string"
      ? await fetch(src).then((r) => {
          if (!r.ok) throw new Error("取色图片加载失败");
          return r.blob();
        })
      : src;
  let bmp;
  try {
    // 取色只看全局色彩分布，不关心几何比例：resize 同时传宽高做非等比缩放不影响统计结果
    bmp = await createImageBitmap(blob, {
      resizeWidth: 256,
      resizeHeight: 256,
      resizeQuality: "low",
    });
  } catch {
    // 部分环境不支持 resize 选项：退化为全尺寸离线程解码（不阻塞主线程，仅内存略大）
    bmp = await createImageBitmap(blob);
  }
  try {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, size, size);
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
      throw new Error("这张壁纸颜色太素，取不到合适配色");
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
    return { p, s };
  } finally {
    bmp.close();
  }
}

// ========== 跨域判断工具（供取色/预览/下载共用） ==========
// 图床（tc.alcy.cc 等）不返回 Access-Control-Allow-Origin，页面 fetch 必被 CORS 拦截。
// 判断图片地址是否为跨域：与当前站点 origin 不同即算跨域，直接走代理链、跳过必败的直连
// （避免 console 刷 CORS 红错，也省一次注定失败的请求）。相对地址/blob 视为同源。
export function isCrossOrigin(url) {
  if (typeof location === "undefined" || !url) return false;
  try {
    const u = new URL(url, location.href);
    return u.origin !== location.origin;
  } catch {
    return true; // 解析失败按跨域处理，走代理兜底
  }
}

// ========== 壁纸取色（含跨域代理回退） ==========

// 部分图源（dmoe / 自定义直链 / alcy 稳定图床地址 tc.alcy.cc）不返回 CORS 许可，
// 直连 canvas 取色会被污染而失败。走图片代理拿到「带 CORS 头、像素可读」的副本再取色。
// ★ 自建 CORS 代理（推荐）：部署方法与代码见 .workbuddy/cors-worker.js（Cloudflare Worker，免费 5 分钟）。
//   第三方免费代理都不可靠 —— weserv 策略屏蔽 alcy.cc、allorigins 常年超时、cors.sh 要 key、
//   cors.lol / cors.eu.org 对数据中心 IP 限流。自建一个才能让
//   「取色 / 下载原图 / 预览与背景一致 / 固定当前壁纸」**全部稳定恢复**。
//   把 Worker 地址填进来（结尾的 /?url= 要保留），例如：
//     const CUSTOM_PROXY = 'https://pbm-proxy.xxx.workers.dev/?url='
//   留空则代理链为空，取色/预览/下载按各自逻辑静默降级。
const CUSTOM_PROXY = "https://pbm-proxy.realemilelu.workers.dev/?url=";

// 2026-11-05 全站验收实测（本轮修复现场复测确认）：第三方兜底已全部失效，
// 且每次失败都会以 console error 落地（验收①要求页面 console error 为 0）——
//   · proxy.cors.sh：连接被远端关闭（ERR_CONNECTION_CLOSED）
//   · api.allorigins.win：域名已死（CORS 拦截 / 请求超时）
//   · images.weserv.nl：策略性屏蔽 alcy.cc（400 Domain or TLD blocked by policy）
//   · cors.lol / cors.eu.org / test.cors.workers.dev：对 alcy 不可用（限流/空响应）
// 逐条试错的网络噪声远大于兜底价值 → 整体移除，链上只留自建代理；
// 它失败时上层（取色/预览/下载）按既有逻辑静默降级，不再产生任何 console error。
const CORS_PROXIES = [
  // 自建代理置顶：它还会用 X-Final-Url 回传「302 之后的稳定图床地址」，
  // 这是「固定当前壁纸」唯一可靠的实现途径（详见 resolveStableUrl）。
  ...(CUSTOM_PROXY ? [(u) => CUSTOM_PROXY + encodeURIComponent(u)] : []),
];

/** 供视图层（预览/下载）复用同一代理链，避免两处各养一份会漂移的名单 */
export function wallpaperProxyUrls(url) {
  return CORS_PROXIES.map((make) => make(url));
}

/**
 * 跟随壁纸取色：壁纸加载成功后提取主色并应用到主题（仅 paletteMode==='auto' 时）。
 * 直连 crossOrigin 取色失败（图源未开放 CORS）时，依次走图片代理再取色；
 * 全部失败则静默放弃（不抛错、不改动当前主题）。
 * 随机/预设/自定义模式下**不**覆盖当前配色，只更新亮度（effYWall）供文字自适应。
 */
async function analyzeWallpaper(url) {
  if (!url) return;
  const gen = bgGen; // 捕获取色启动时的代际
  let got = null;
  const attempt = async (src) => {
    const pal = await extractPaletteFromImage(src);
    got = pal;
    return true;
  };
  let paletteDone = false;
  // ① 首选：本地已缓存的 blob（由带 CORS 的图源抓取而来）。同源不受 CORS 限制，
  //    且与「背景显示 / 预览 / 下载」是同一张图，随机端点也能得到正确配色。
  if (bgBlobObj) {
    try {
      await attempt(bgBlobObj);
      paletteDone = true;
      crumb("wallpaper palette: from cached blob");
    } catch (e) {
      crumb(`wallpaper palette blob failed: ${e?.message || e}`);
    }
  }
  // ② 无缓存时：跨域图床（tc.alcy.cc 等无 CORS 头）直连 fetch 必被拦截：直接跳过直连、走代理链，
  // 避免 console 刷 CORS 红错、也省一次注定失败的请求；同源（自定义同站图片）才直连。
  if (!paletteDone && !isCrossOrigin(url)) {
    try {
      await attempt(url);
      paletteDone = true;
      crumb("wallpaper palette: direct ok");
    } catch (e) {
      crumb(`wallpaper palette direct failed: ${e?.message || e}`);
    }
  } else {
    crumb("wallpaper palette: cross-origin, go proxy directly");
  }
  // 直连失败或跨域 → 依次走代理（仍会写入 state.effYWall 供文字取色）
  // 每个代理独立 4s 超时，且换图（bgGen 变化）立即中止整轮，避免旧代际把链跑完
  if (!paletteDone) {
    for (const make of CORS_PROXIES) {
      if (gen !== bgGen) { crumb("wallpaper palette: superseded, abort proxy chain"); return; }
      try {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller
          ? setTimeout(() => controller.abort(), 4000)
          : null;
        try {
          const res = await fetch(make(url), controller ? { signal: controller.signal } : undefined);
          if (!res.ok) continue;
          const blob = await res.blob();
          if (gen !== bgGen) { crumb("wallpaper palette: superseded after fetch"); return; }
          await attempt(blob);
          paletteDone = true;
          crumb("wallpaper palette: proxy ok");
          break;
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch (e) {
        crumb(`wallpaper palette proxy failed: ${e?.message || e}`);
      }
    }
  }
  // 取色期间壁纸若已更换，丢弃本次结果，避免旧图配色覆盖新图
  if (gen !== bgGen) return;
  // 应用取色（与“弹窗开启”解耦）：不在这里同步连写两套 CSS 变量，
  // 交给 rAF 空闲队列分帧回写——文字色一帧、主题色板一帧，互不抢占同一帧。
  if (got && state.paletteMode === "auto") {
    // auto：主色板 + 文字色都按取色结果更新
    scheduleFrameTask(() => {
      if (gen !== bgGen) return;
      state.palette = got;
      applyPalette();
    });
    scheduleFrameTask(() => {
      if (gen !== bgGen) return;
      applyAdaptiveText();
    });
  } else {
    // 固定/随机/预设：只更新文字取色所需亮度，不覆盖用户主题色
    scheduleFrameTask(() => {
      if (gen !== bgGen) return;
      applyAdaptiveText();
    });
  }
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
  if (state.bgProvider === "alcy") {
    // 樱花 Alcy：实测图床无 CORS 头 —— 显示走 <img>/CSS 不受限；字节（预览/下载/取色）
    // 依赖自建代理抓取，代理失败时静默降级（无 CORS 头的直连读取已被排除，见 cacheWallpaperBlob）
    await _applyNewBg(`https://t.alcy.cc/ycy?t=${Date.now()}`);
    return;
  }
  // loliapi ACG 随机图：返回 `access-control-allow-origin: *`，
  // 可直连 fetch → 能抓字节缓存，从而实现取色 / 下载 / 预览与背景完全一致
  // （图库偏旧，故不作默认；需要取色/下载时由用户主动选择）
  await _applyNewBg(`https://www.loliapi.com/acg/?t=${Date.now()}`);
}

// 壁纸代际计数：每次「换图/迁移」递增。异步回调（resolveStableUrl、probeBackground 的
// onload/onerror、analyzeWallpaper）返回时若代际已变，说明有新壁纸取代了旧任务，丢弃本次结果，
// 避免迟到的回调把新壁纸覆盖回旧壁纸（否则预览与实际会出现不一致）。
let bgGen = 0;

// 启动「固定模式」探测激活标记：启动时探测失败会自动换一张自愈（见 probeBackground onerror），
// 而非把背景整个关掉。仅启动路径设置，用户手动换图/开关不触发自愈。
let startupProbeActive = false;

async function _applyNewBg(url) {
  const gen = ++bgGen;
  // 换图先作废上一张的字节缓存 —— 否则 applyBackground 会继续优先渲染旧 blob，
  // 出现「切了图源/点了换一张，背景纹丝不动」的假死现象（从带 CORS 图源切到无 CORS 图源时必现）。
  clearWallpaperBlob();
  // 随机配色模式：每次换图（含刷新）都重新生成配色
  if (state.paletteMode === "random") randomizePalette();
  // 关键修复：先把随机端点解析成稳定地址，再 set state.bgUrl + applyBackground。
  // 否则首屏用端点渲染，迁移解析后换图 = 「啪」地切一张。
  // 自定义直链本身就是稳定地址，resolveStableUrl 会原样返回。
  let stable = url;
  try {
    stable = (await resolveStableUrl(url, state.bgProvider)) || url;
  } catch {}
  if (gen !== bgGen) return; // 已被更新的换图请求取代，丢弃本次结果
  // 带 CORS 的图源：先把字节抓成 blob，**再**写 bgUrl。
  // 顺序是关键——下游（预览 / 显示 / 取色）都以 bgUrl 或 bgBlobUrl 的变化为触发点，
  // 先抓后写可保证它们被触发时字节已就绪，不出现「预览先跑代理链失败、字节后到再重建」的中间态。
  // 抓取失败则静默回退原始 URL 的旧行为。
  // 有自建代理时，无 CORS 图源同样能取到字节（经代理），故一并启用缓存 ——
  // 这是让「预览与背景一致」对 alcy / dmoe 也成立的唯一途径。
  if (providerHasCors(state.bgProvider) || CUSTOM_PROXY) {
    await cacheWallpaperBlob(stable);
    if (gen !== bgGen) return;
  }
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
        showToast(t("appearance.bgEnabledToast"));
      } catch (e) {
        showToast(e.message || t("appearance.bgFetchFailed"), "error");
      }
    } else {
      probeBackground();
      showToast(state.bgFailed ? t("appearance.bgEnableFailed") : t("appearance.bgEnabledToast"));
    }
  } else {
    applyBackground();
    showToast(t("appearance.bgDisabledToast"));
  }
}

// ========== 持久化与初始化 ==========

// 切到「无法跨域取色」的图源时，若当前是「跟随壁纸取色」，自动改为「每次刷新随机」。
// 否则该模式永远取不到色，用户只会看到主题色卡住不动，误以为功能坏了。
watch(
  () => state.bgProvider,
  (p) => {
    if (providerBlocksPalette(p) && state.paletteMode === "auto") {
      // 改为「固定」而非「随机」：用户此刻看到的配色原样保留，只是不再尝试取色。
      // 若改成随机，切换图源的瞬间主题色也会跟着跳变，像是一次改了俩设置。
      state.paletteMode = "manual";
      showToast(t("appearance.noCorsPaletteFallback"), "warning");
    }
  },
);

watch(
  state,
  () => {
    // bgBlobUrl 是页面级 blob URL，无法跨会话复用，不持久化
    const { bgLoading, bgFailed, bgBlobUrl, ...persisted } = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {}
  },
  { deep: true },
);

// 取色完成后可能正好赶上弹窗开启/主题切换，用空闲队列分帧回写（见 analyzeWallpaper）。
export async function initAppearance() {
  // ?nobg / #nobg 逃生通道：URL 带此标记时跳过整个背景系统，保证页面永远能打开
  const nobg =
    /[?&]nobg/.test(location.search) || /#.*[?&]nobg/.test(location.hash);

  // —— 同步快路径：先应用「本地能立刻算出的外观」，不等待任何网络 ——
  // 玻璃/配色/自适应文字都是纯计算，同步应用后首帧内容即为正确观感；
  // 背景图与取色随后台异步补上，避免"已有底色但内容迟迟不出现"的白屏窗口。
  try {
    const rawSaved = localStorage.getItem(STORAGE_KEY);
    if (rawSaved) {
      let parsed = null;
      try {
        parsed = JSON.parse(rawSaved);
      } catch (e) {
        console.error("外观配置 JSON 损坏，已重置为默认");
        localStorage.removeItem(STORAGE_KEY);
      }
      if (parsed) {
        // 仅迁移「已废弃」的图源值：wallhaven 早已下线，无有效地址可言。
        if (parsed.bgProvider === "wallhaven") {
          parsed.bgProvider = "alcy";
          if (parsed.bgUrl && /wallhaven/i.test(parsed.bgUrl)) parsed.bgUrl = "";
        }
        const normalized = normalizeAppearance(parsed);
        if (normalized) {
          Object.assign(state, normalized);
        } else {
          // 结构非法（例如 palette 是字符串）→ 丢弃并回写默认，避免整段初始化中断
          console.warn("外观配置结构非法，已回退默认");
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
  } catch (e) {
    console.error("外观配置读取失败，已重置", e);
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }
  state.bgLoading = false;
  state.bgFailed = false;
  // 启动路径的静默降级：配置为「跟随壁纸取色」但图源不支持取色时改为「固定配色」，
  // 否则该模式永远取不到色、主题色会一直卡住。不弹 toast（非用户主动操作）。
  if (providerBlocksPalette(state.bgProvider) && state.paletteMode === "auto") {
    state.paletteMode = "manual";
  }

  if (nobg) {
    crumb("nobg escape active");
    state.bgEnabled = false;
    applyGlass();
    applyPalette();
    startFocusObserver();
    return;
  }

  // 首帧外观立即生效（内容先行）；pre-app-ready 在短暂窗口内禁止动画类，
  // 避免"先透明后淡入"的二次闪烁，随后摘除恢复动画
  prepAppReadyTag();
  // 启动需要换图/解析稳定地址时，先不显示旧壁纸（避免"先旧图、后台换新图"的闪烁）：
  // 保持渐变底色 + 内容即时渲染，后台就绪后一次性应用新壁纸 + 淡入（revealWallpaper）
  bgDeferred =
    state.bgEnabled &&
    (state.bgAutoSwitch || !state.bgUrl || isRandomEndpoint(state.bgUrl));
  applyAll();
  if (state.paletteMode === "random") randomizePalette();
  startFocusObserver();
  // 暗色模式切换会改 scrim 亮度，需重算自适应文字色
  try {
    new MutationObserver(() => scheduleAdaptiveText()).observe(
      document.documentElement,
      { attributes: true, attributeFilter: ["class"] },
    );
  } catch {}
  // 系统"高对比度"开关变化（prefers-contrast: more）也需重算（target 由 4.6 改 7）
  try {
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-contrast: more)");
      const handler = () => scheduleAdaptiveText();
      if (mq.addEventListener) mq.addEventListener("change", handler);
      else if (mq.addListener) mq.addListener(handler);
    }
  } catch {}
  crumb(
    `config loaded: enabled=${state.bgEnabled} provider=${state.bgProvider} auto=${state.bgAutoSwitch} url=${state.bgUrl?.slice(0, 60) || "(empty)"}`,
  );
  crumb("applyAll (sync fast path)");

  // —— 后台网络步骤：不阻塞挂载，交给空闲/延时调度 ——
  scheduleIdle(async () => {
    try {
      if (!state.bgEnabled) return;
      if (state.bgAutoSwitch) {
        // 自动换图：打开时换一张（内部含稳定性探测与失败回退）
        await autoSwitchOnStartup();
      } else if (state.bgUrl) {
        // 固定壁纸：若持久化地址仍是随机端点（旧数据/被回退破坏），先迁移到稳定地址；
        // 未发生迁移则正常探测当前地址是否仍可用；探测失败会自动换一张自愈
        startupProbeActive = true;
        const migrated = await migratePinnedEndpoint();
        if (!migrated) {
          try {
            probeBackground();
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        // 固定模式但从未加载过图：取一张（此后保持固定，刷新不再换图）
        startupProbeActive = true;
        try {
          await shuffleBackground();
        } catch (e) {
          console.error(e);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      // 结束延迟应用：新壁纸（或失败后的回退状态）一次性生效 + 淡入入场
      startupProbeActive = false;
      if (bgDeferred) {
        bgDeferred = false;
        try {
          applyBackground();
          revealWallpaper();
        } catch (e) {
          console.error(e);
        }
      }
    }
    crumb("init done (async part)");
  });
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
    getWallpaperBlob,
  };
}

export { hexToHsl, setPaletteMode, setAutoSwitch, applyCustomBackground, analyzeWallpaper };

/** HSL 数组转 CSS 颜色字符串（用于色板预览） */
export function hslCss([h, s, l]) {
  return `hsl(${h} ${s}% ${l}%)`;
}
