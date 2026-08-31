/**
 * 纯色度计算：把"某处背景的亮度"换算成一套可读的文字色。
 * 无 DOM、无框架依赖，可在 node 下直接跑测试。
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- WCAG 相对亮度 ----------

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// HSL 的分量本身就是 sRGB 编码值，直接映射到 0-255 即可，
// 不能再过一次 gamma 编码（否则会被二次提亮，色相/饱和度都跑偏）
const to255 = (v) => Math.round(clamp(v * 255, 0, 255));

/** WCAG 相对亮度 Y ∈ [0,1] */
export function relLum([r, g, b]) {
  return (
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
  );
}

/** WCAG 对比度 */
export function contrast(y1, y2) {
  return (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);
}

// ---------- HSL ----------

export function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
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
  return [h, s * 100, l * 100];
}

export function hslToRgb([h, s, l]) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [to255(f(0)), to255(f(8)), to255(f(4))];
}

/**
 * 保留 base 的色相/饱和度，二分调整 L 直到相对亮度接近 targetY。
 * 这样适配出来的灰阶仍是原来那套蓝灰（slate），不会变成中性灰。
 */
export function rgbWithLum(base, targetY) {
  const [h, s] = rgbToHsl(base);
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (relLum(hslToRgb([h, s, mid])) < targetY) lo = mid;
    else hi = mid;
  }
  return hslToRgb([h, s, (lo + hi) / 2]);
}

export const triplet = (rgb) => rgb.join(" ");

// ---------- 由背景亮度推导文字色 ----------

/**
 * @param {number} effY 该处实际背景（玻璃 + 遮罩 + 壁纸合成后）的相对亮度
 * @param {number[]} base 基准色，用来继承色相/饱和度
 * @param {object} cfg { target 目标对比度, r400, r300 层级倍率, min, max }
 * @param {boolean} darkText 用深色字还是浅色字
 * @returns {string[]} [g300, g400, g500] 三个 "r g b" 三元组
 */
export function deriveTextScale(effY, base, cfg, darkText) {
  const y500 = clamp(
    darkText
      ? (effY + 0.05) / cfg.target - 0.05
      : (effY + 0.05) * cfg.target - 0.05,
    cfg.min,
    cfg.max,
  );
  const y400 = clamp(y500 * cfg.r400, cfg.min, cfg.max);
  const y300 = clamp(y500 * cfg.r300, cfg.min, cfg.max);
  return [
    triplet(rgbWithLum(base, y300)),
    triplet(rgbWithLum(base, y400)),
    triplet(rgbWithLum(base, y500)),
  ];
}

export { clamp };
