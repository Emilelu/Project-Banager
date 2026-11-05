<template>
  <div class="color-picker-wrapper" :style="{ width: size, height: size }">
    <!-- 可见的色块（真正被样式化的部分） -->
    <button
      ref="triggerRef"
      type="button"
      class="color-picker-swatch btn-press"
      :style="{ background: value || 'transparent', width: size, height: size }"
      :aria-label="ariaLabel || tt('color.pick')"
      :aria-expanded="panelOpen ? 'true' : 'false'"
      aria-haspopup="dialog"
      v-tip="tip || ''"
      @click="togglePanel"
    >
      <!-- 当前色为空时显示斜线，表示「未设置」 -->
      <span v-if="!value" class="color-picker-empty" aria-hidden="true"></span>
    </button>

    <!-- 自研取色面板：必须 Teleport 到 body + fixed。
         祖先带 backdrop-filter 会成为 fixed 的包含块（项目踩过 200px 偏移的坑）。
         过渡复用全站 pop（缩放 + 位移 + 方向变量），弹出/关闭与其他自制弹层同一语言；
         :css="popCss" 是卸载保护：宿主（弹窗/页面）整体卸载时离场过渡若还在跑，
         会在 DOM 已移除后继续操作子树（jsdom 抛 insertBefore/subTree 异常，同 DatePicker）。 -->
    <Teleport to="body">
      <transition name="pop" :css="popCss">
        <div
          v-if="panelOpen"
          ref="panelRef"
          class="cp-panel app-menu-surface rounded-xl border p-3"
          role="dialog"
          aria-modal="false"
          :aria-label="tt('color.pick')"
          data-colorpicker-panel
          :style="panelStyle"
        >
        <!-- 饱和度 / 明度面板：横向饱和度、纵向明度 -->
        <div
          ref="svRef"
          class="cp-sv"
          :style="{ background: `hsl(${hue} 100% 50%)` }"
          @pointerdown="startSv"
        >
          <div class="cp-sv-white"></div>
          <div class="cp-sv-black"></div>
          <div class="cp-sv-cursor" :style="{ left: sat + '%', top: (100 - val) + '%' }"></div>
        </div>

        <!-- 色相条 -->
        <div class="cp-hue" @pointerdown="startHue">
          <div class="cp-hue-cursor" :style="{ left: (hue / 360) * 100 + '%' }"></div>
        </div>

        <!-- 底部：当前色预览 + HEX 输入 -->
        <div class="cp-foot">
          <div class="cp-preview" :style="{ background: hex }"></div>
          <label class="cp-hex-label">
            <span class="cp-hex-hash">#</span>
            <input
              v-model="hexInput"
              class="cp-hex-input"
              type="text"
              maxlength="6"
              spellcheck="false"
              :aria-label="tt('color.hex')"
              @keyup.enter="applyHex"
              @blur="applyHex"
            />
          </label>
        </div>

        <div class="cp-presets" role="listbox" :aria-label="tt('color.presets')">
          <button
            v-for="p in PRESETS"
            :key="p"
            type="button"
            class="cp-preset"
            :style="{ background: p }"
            :aria-label="p"
            role="option"
            :aria-selected="hex.toLowerCase() === p ? 'true' : 'false'"
            @click="pickPreset(p)"
          ></button>
        </div>

        <div class="cp-actions">
          <button type="button" class="btn-base btn-sm btn-neutral" @click="cancel">{{ tt('common.cancel') }}</button>
          <button type="button" class="btn-base btn-sm btn-primary" @click="confirm">{{ tt('common.confirm') }}</button>
        </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
/**
 * 统一取色控件（**自研面板**，不依赖浏览器原生 input[type=color]）。
 *
 * 为什么换成自研：
 *   原实现把原生 input 做成透明铺满、点击调 showPicker() —— 色块外观是统一的，
 *   但弹出的**面板仍是浏览器原生的**（Chrome 的方形色域 + RGB 数字输入框 + 系统取色环），
 *   与全站毛玻璃风格割裂，且各浏览器样式各不相同，根本无法统一。
 *   用户明确要求：取色器要自研，不要浏览器自带。
 *
 * 本实现：HSV 模型 + 自绘饱和度/明度面板 + 色相条 + HEX 输入 + 14 个预设色。
 * 面板走 Teleport + fixed（祖先 backdrop-filter 会劫持 fixed 定位，项目已踩过），
 * 弹出/关闭复用全站 pop 过渡并写入 --pop-origin-y / --pop-from-y 方向变量，
 * 面板打开期间跟随 resize / 滚动重新锚定；卸载时关掉过渡（:css="popCss"）。
 *
 * 交互：
 *   · 点色块开/关面板；面板内按住拖动实时改色
 *   · 点面板外 / Esc = 取消（恢复打开前的颜色）
 *   · 点「确定」才提交
 *   · HEX 输入支持 3 位缩写与 6 位
 *
 * 无障碍：aria-haspopup / aria-expanded、role=dialog、预设色 role=option、Esc 关闭后焦点归位。
 */
import { ref, computed, watch, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { useI18n } from '../composables/useI18n'

const props = defineProps({
  value: { type: String, default: '' },
  size: { type: String, default: '2rem' },
  ariaLabel: { type: String, default: '' },
  // 悬浮气泡文案（由 v-tip 渲染成自定义气泡，不再是原生 title）
  tip: { type: String, default: '' },
})
const emit = defineEmits(['input', 'change'])

const { tt } = useI18n()

/** 预设色：覆盖常用语义（红/橙/黄/绿/青/蓝/紫/粉/灰/黑） */
const PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
  '#ec4899', '#f43f5e', '#64748b', '#111827',
]

const triggerRef = ref(null)
const panelRef = ref(null)
const svRef = ref(null)
const panelOpen = ref(false)
// 面板定位：left/top + placement（below/above）。
// placement 驱动 --pop-origin-y / --pop-from-y，弹出动画从锚点一侧长出来
// （与 DatePicker / ClockPicker / AppSelect 同一套全站 pop 语言）。
const panelPos = ref({ left: 0, top: 0, placement: 'below' })
const panelStyle = computed(() => ({
  left: `${panelPos.value.left}px`,
  top: `${panelPos.value.top}px`,
  '--pop-origin-y': panelPos.value.placement === 'above' ? 'bottom' : 'top',
  '--pop-from-y': panelPos.value.placement === 'above' ? '6px' : '-6px',
}))

const hue = ref(0)
const sat = ref(100)
const val = ref(100)
const hexInput = ref('')

/** 打开面板时的原始颜色：取消时用它回滚 */
let colorBeforeOpen = ''

const hex = computed(() => hsvToHex(hue.value, sat.value, val.value))

// ---------- 颜色转换 ----------
function hsvToHex(h, s, v) {
  const vv = v / 100
  const sv = s / 100
  const c = vv * sv
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = vv - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return '#' + to(r) + to(g) + to(b)
}

function hexToHsv(hexStr) {
  const s = String(hexStr || '').replace('#', '').trim()
  let full = s
  if (s.length === 3) full = s.split('').map((x) => x + x).join('')
  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) return null
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  const sv = max === 0 ? 0 : (d / max) * 100
  return { h: Math.round(h), s: Math.round(sv), v: Math.round(max * 100) }
}

/** 外部 value → 内部 HSV */
function syncFromValue(v) {
  const parsed = hexToHsv(v)
  if (!parsed) {
    // 空值 / 非法值：回到纯白，HEX 输入框保留原文供用户继续修正
    hue.value = 0
    sat.value = 0
    val.value = 100
    hexInput.value = String(v || '').replace('#', '').toUpperCase()
    return
  }
  hue.value = parsed.h
  sat.value = parsed.s
  val.value = parsed.v
  hexInput.value = String(v || '').replace('#', '').toUpperCase()
}
syncFromValue(props.value)

watch(
  () => props.value,
  (v) => {
    // 面板打开时不接受外部回写，否则拖动过程会被父组件的旧值打断
    if (panelOpen.value) return
    syncFromValue(v)
  },
)

// ---------- 面板定位与开关 ----------
// 卸载保护：宿主卸载时关掉离场过渡，元素立即移除（同 DatePicker / ClockPicker）
const popCss = ref(true)

/** 面板尺寸估算（打开前先摆一次，避免首帧落在 (0,0)/静态位置闪一下）：
 *  16.5rem 面板 + SV/色相条/预设/actions，根字号 14 时实测约 231×314。
 *  估算只用于首帧，下一帧用 offsetWidth/offsetHeight 校正。 */
const PANEL_W = 240
const PANEL_H = 330
const MARGIN = 8
const GAP = 8

/** 面板定位：优先出现在色块下方，下方空间不足则翻到上方，并夹进视口。
 *  placement 同时决定弹出方向变量（above → 从底边长出来）。 */
function placePanel(measure = true) {
  const t = triggerRef.value
  if (!t) return
  const tr = t.getBoundingClientRect()
  const pw = (measure && panelRef.value?.offsetWidth) || PANEL_W
  const ph = (measure && panelRef.value?.offsetHeight) || PANEL_H

  let left = tr.left
  if (left + pw > window.innerWidth - MARGIN) left = window.innerWidth - pw - MARGIN
  if (left < MARGIN) left = MARGIN

  let top = tr.bottom + GAP
  let placement = 'below'
  if (top + ph > window.innerHeight - MARGIN) {
    const above = tr.top - GAP - ph
    if (above >= MARGIN) {
      top = above
      placement = 'above'
    } else {
      // 上下都放不下（超小窗口）：整体夹进视口
      top = Math.max(MARGIN, window.innerHeight - ph - MARGIN)
    }
  }
  panelPos.value = { left: Math.round(left), top: Math.round(top), placement }
}

async function open() {
  colorBeforeOpen = props.value || ''
  syncFromValue(props.value)
  // 先按估算尺寸摆一次再打开：transition 进场首帧就必须已在锚点位置
  placePanel(false)
  panelOpen.value = true
  await nextTick()
  placePanel(true)
}

/** 面板开着时跟随视口/容器变化：滚动（capture 捕获容器内滚动）与 resize 都重新锚定 */
function onViewportChange() {
  if (panelOpen.value) placePanel(true)
}

function close() {
  panelOpen.value = false
  triggerRef.value?.focus?.()
}

function commit() {
  const v = hex.value
  emit('input', v)
  emit('change', v)
  hexInput.value = v.replace('#', '').toUpperCase()
}

function togglePanel() {
  if (panelOpen.value) cancel()
  else open()
}

function confirm() {
  commit()
  close()
}

/** 取消：把颜色回滚到打开前的值，然后关闭 */
function cancel() {
  if (colorBeforeOpen) {
    emit('input', colorBeforeOpen)
    emit('change', colorBeforeOpen)
  }
  close()
}

function onOutside(e) {
  // 监听器常驻（面板开着才动作）：与 DatePicker 同款，避免 open/close 反复增删
  if (!panelOpen.value) return
  if (panelRef.value?.contains(e.target)) return
  if (triggerRef.value?.contains(e.target)) return
  cancel()
}

function onKey(e) {
  if (!panelOpen.value || e.key !== 'Escape') return
  e.stopPropagation()
  cancel()
}

onMounted(() => {
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})

onBeforeUnmount(() => {
  popCss.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})

// ---------- 拖动选取 ----------
function startSv(e) {
  e.preventDefault()
  const rect = svRef.value.getBoundingClientRect()
  const apply = (ev) => {
    const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width)
    const y = Math.min(Math.max(ev.clientY - rect.top, 0), rect.height)
    sat.value = Math.round((x / rect.width) * 100)
    val.value = Math.round(100 - (y / rect.height) * 100)
  }
  apply(e)
  const move = (ev) => apply(ev)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function startHue(e) {
  e.preventDefault()
  const el = e.currentTarget
  const apply = (ev) => {
    const x = Math.min(Math.max(ev.clientX - el.getBoundingClientRect().left, 0), el.getBoundingClientRect().width)
    hue.value = Math.round((x / el.getBoundingClientRect().width) * 360)
  }
  apply(e)
  const move = (ev) => apply(ev)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function pickPreset(p) {
  syncFromValue(p)
}

function applyHex() {
  const raw = String(hexInput.value || '').replace(/[^0-9a-fA-F]/g, '')
  if (raw.length !== 6 && raw.length !== 3) return
  const norm = '#' + raw.toLowerCase()
  const parsed = hexToHsv(norm)
  if (!parsed) return
  hue.value = parsed.h
  sat.value = parsed.s
  val.value = parsed.v
  hexInput.value = norm.replace('#', '').toUpperCase()
}
</script>

<style scoped>
.color-picker-wrapper {
  position: relative;
  flex-shrink: 0;
  border-radius: 0.75rem;
  /* 描边由 wrapper 负责，色块本身不再单独描边，避免双层描边 */
  box-shadow: 0 0 0 1px rgb(var(--c-primary) / 0.25) inset;
  overflow: hidden;
}

.color-picker-swatch {
  display: block;
  border: 0;
  padding: 0;
  margin: 0;
  cursor: pointer;
  transition: filter 0.15s ease;
}
.color-picker-swatch:hover {
  filter: brightness(1.08);
}

/* 未设置颜色时用斜线表达「空」，而不是显示一个误导性的灰色块 */
.color-picker-empty {
  display: block;
  width: 100%;
  height: 100%;
  background-image: linear-gradient(
    135deg,
    transparent 46%,
    rgb(var(--c-primary) / 0.55) 46%,
    rgb(var(--c-primary) / 0.55) 54%,
    transparent 54%
  );
  background-color: rgba(255, 255, 255, 0.6);
}

/* ========== 自研取色面板 ========== */
.cp-panel {
  position: fixed;
  z-index: 160;
  width: 16.5rem;
  border-color: rgb(255 255 255 / 0.45);
  box-shadow: 0 16px 48px rgb(31 38 135 / 0.24), 0 4px 12px rgb(0 0 0 / 0.12);
}
.dark .cp-panel {
  border-color: rgb(255 255 255 / 0.14);
  box-shadow: 0 16px 48px rgb(0 0 0 / 0.6), 0 4px 12px rgb(0 0 0 / 0.4);
}

/* 饱和度/明度面板 */
.cp-sv {
  position: relative;
  height: 8.5rem;
  border-radius: 0.5rem;
  cursor: crosshair;
  overflow: hidden;
  touch-action: none;
}
.cp-sv-white {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, #fff, rgb(255 255 255 / 0));
}
.cp-sv-black {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, #000, rgb(0 0 0 / 0));
}
.cp-sv-cursor {
  position: absolute;
  width: 0.75rem;
  height: 0.75rem;
  margin: -0.375rem 0 0 -0.375rem;
  border-radius: 9999px;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4), 0 1px 4px rgb(0 0 0 / 0.3);
  pointer-events: none;
}

/* 色相条 */
.cp-hue {
  position: relative;
  height: max(16px, 1.125rem);
  margin-top: 0.625rem;
  border-radius: 9999px;
  cursor: pointer;
  background: linear-gradient(
    to right,
    #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%
  ) center / 100% 0.75rem no-repeat;
  touch-action: none;
}
.cp-hue-cursor {
  position: absolute;
  top: 50%;
  width: 0.875rem;
  height: 0.875rem;
  margin: -0.4375rem 0 0 -0.4375rem;
  border-radius: 9999px;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4), 0 1px 4px rgb(0 0 0 / 0.3);
  pointer-events: none;
}

/* 底部：预览 + HEX */
.cp-foot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.cp-preview {
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
  border-radius: 0.5rem;
  border: 1px solid rgb(255 255 255 / 0.5);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
}
.cp-hex-label {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 0.125rem;
  min-width: 0;
  padding: 0 0.5rem;
  height: 2rem;
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.7);
  border: 1px solid rgb(var(--c-primary) / 0.2);
}
.dark .cp-hex-label {
  background: rgb(255 255 255 / 0.1);
  border-color: rgb(255 255 255 / 0.18);
}
.cp-hex-hash {
  color: rgb(148 163 184);
  font-size: 0.75rem;
}
.cp-hex-input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  background: transparent;
  border: 0;
  outline: none;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: inherit;
}

/* 预设色 */
.cp-presets {
  display: grid;
  grid-template-columns: repeat(7, minmax(24px, 1fr));
  gap: 0.375rem;
  margin-top: 0.75rem;
}
.cp-preset {
  min-width: 24px;
  min-height: 24px;
  height: max(24px, 1.5rem);
  padding: 0;
  border-radius: 0.3125rem;
  border: 1px solid rgb(255 255 255 / 0.5);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.06);
  cursor: pointer;
  transition: transform 0.15s var(--ease-spring, ease-out);
}
.cp-preset:hover {
  transform: scale(1.15);
}
.cp-preset[aria-selected='true'] {
  box-shadow: 0 0 0 2px rgb(var(--c-primary));
}

/* 动作按钮 */
.cp-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

/* 深色模式：空色斜线块的白底会变成刺眼亮块，反转为深紫底 + 亮色斜线 */
.dark .color-picker-empty {
  background-color: rgba(255, 255, 255, 0.12);
  background-image: linear-gradient(
    135deg,
    transparent 46%,
    rgb(var(--c-primary-light) / 0.7) 46%,
    rgb(var(--c-primary-light) / 0.7) 54%,
    transparent 54%
  );
}

/* 深色模式：wrapper 描边改用亮变体，否则压在深紫卡片上几乎看不见 */
.dark .color-picker-wrapper {
  box-shadow: 0 0 0 1px rgb(var(--c-primary-light) / 0.45) inset;
}
</style>
