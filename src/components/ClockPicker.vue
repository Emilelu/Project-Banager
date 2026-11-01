<script setup>
/**
 * 钟表盘时间选择器 —— 用圆形表盘选「时」和「分」。
 *
 * 设计要点（对齐用户要求「改成钟表那样，可以在时钟上点击时和分」）：
 *   · 表盘是一整个圆，外圈刻度选**小时**（0-23），内圈刻度选**分钟**（0-59）
 *   · 点外圈数字 → 选小时；点内圈 → 选分钟
 *   · 顶部大字显示当前 时:分，选中段高亮
 *   · 可在表盘上按住拖动连续选择（沿圆周滑动）
 *   · 保留手动输入作为兜底（有些用户就想直接打 23:30）
 *
 * 为什么用 SVG 而不是 div 定位：圆盘的刻度按角度计算，SVG 的坐标系天然适合，
 * 且缩放时不会因亚像素累积而错位。
 */
import { ref, computed, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  /** 'HH:mm' 格式；空串表示未选 */
  modelValue: { type: String, default: '' },
  /** 无障碍标签 */
  ariaLabel: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const triggerRef = ref(null)
const panelRef = ref(null)
const menuPos = ref({ left: 0, bottom: 0 })

/** 当前编辑的段：'hour' | 'minute' */
const segment = ref('hour')

/** 拖动状态 */
const dragging = ref(false)

const PANEL_W = 280
const MARGIN = 8
const SIZE = 220
const CENTER = SIZE / 2

const panelStyle = computed(() => ({
  left: menuPos.value.left + 'px',
  bottom: menuPos.value.bottom + 'px',
}))

const hour = computed(() => {
  if (!props.modelValue) return null
  const h = props.modelValue.split(':')[0]
  return h === undefined ? null : Number(h)
})

const minute = computed(() => {
  if (!props.modelValue) return null
  const m = props.modelValue.split(':')[1]
  return m === undefined ? null : Number(m)
})

const hourLabel = computed(() =>
  hour.value === null ? '--' : String(hour.value).padStart(2, '0'),
)
const minuteLabel = computed(() =>
  minute.value === null ? '--' : String(minute.value).padStart(2, '0'),
)

/** 写回 'HH:mm'；未选的段用 0 补齐，避免出现 '23:undefined' */
const commit = (h, m) => {
  const hh = String(h === null ? 0 : h).padStart(2, '0')
  const mm = String(m === null ? 0 : m).padStart(2, '0')
  emit('update:modelValue', `${hh}:${mm}`)
}

/* ---------------------------- 表盘几何 ---------------------------- */
/**
 * 角度约定：12 点方向为 -90°（SVG 的 0° 在 3 点方向），顺时针递增。
 */
const angleOf = (index, total) => (index / total) * 360 - 90

const rad = (deg) => (deg * Math.PI) / 180

const pointOn = (index, total, radius) => {
  const a = rad(angleOf(index, total))
  return {
    x: CENTER + radius * Math.cos(a),
    y: CENTER + radius * Math.sin(a),
  }
}

/** 小时刻度：24 个，外圈 */
const HOUR_R = 88
const hours = Array.from({ length: 24 }, (_, i) => {
  const p = pointOn(i, 24, HOUR_R)
  return { value: i, x: p.x, y: p.y, label: String(i) }
})

/** 分钟刻度：12 个（每 5 分钟一格），内圈 */
const MIN_R = 52
const minutes = Array.from({ length: 12 }, (_, i) => {
  const p = pointOn(i, 12, MIN_R)
  const value = i * 5
  return { value, x: p.x, y: p.y, label: value === 0 ? '00' : String(value) }
})

/** 指针位置（按当前段） */
const handEnd = computed(() => {
  if (segment.value === 'hour') {
    if (hour.value === null) return null
    return pointOn(hour.value, 24, HOUR_R)
  }
  if (minute.value === null) return null
  // 分钟取最近的 5 分钟格（用于指针位置），实际值仍可精确到 1
  const idx = Math.round(minute.value / 5) % 12
  return pointOn(idx, 12, MIN_R)
})

/* ---------------------------- 交互：点击/拖动表盘 ---------------------------- */
const pickFromEvent = (e) => {
  const box = panelRef.value?.querySelector('.clock-face svg')?.getBoundingClientRect()
  if (!box) return
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const dx = e.clientX - cx
  const dy = e.clientY - cy
  const dist = Math.hypot(dx, dy)

  // 角度：atan2 得到 -180..180，转成「从 12 点顺时针」的 0..360
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
  while (deg < 0) deg += 360
  while (deg >= 360) deg -= 360

  if (segment.value === 'hour') {
    const idx = Math.round(deg / 15) % 24
    commit(idx, minute.value)
  } else {
    const idx = Math.round(deg / 30) % 12
    let mm = idx * 5
    // 靠近内圈中心（半径小于 MIN_R 的一半）→ 视为 0 分微调
    if (dist < MIN_R * 0.5) mm = minute.value === null ? 0 : minute.value
    commit(hour.value, mm)
  }
}

const onPointerDown = (e) => {
  dragging.value = true
  pickFromEvent(e)
  e.preventDefault()
}

const onPointerMove = (e) => {
  if (!dragging.value) return
  pickFromEvent(e)
}

const onPointerUp = () => {
  dragging.value = false
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  onUnmounted(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  })
}

/* ---------------------------- 打开/关闭 + 定位 ---------------------------- */
const toggle = () => {
  if (open.value) {
    open.value = false
    return
  }
  const btn = triggerRef.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  let left = r.left
  if (left + PANEL_W > window.innerWidth - MARGIN) {
    left = Math.max(MARGIN, window.innerWidth - PANEL_W - MARGIN)
  }

  /*
   * 纵向定位：面板 338px 高，很多触发器在页面上半部，
   * 单纯向上展开会把 top 推到负数（实测 y=-25 被裁）。
   * 因此先试上方，放不下翻到下方，都放不下就夹进视口。
   */
  const PANEL_H = 338
  const vh = window.innerHeight
  const spaceAbove = r.top - MARGIN
  const spaceBelow = vh - r.bottom - MARGIN

  if (spaceAbove >= PANEL_H) {
    // 上方够 → 底边贴按钮上沿
    menuPos.value = { left, bottom: vh - r.top + MARGIN }
  } else if (spaceBelow >= PANEL_H) {
    // 下方够 → 顶边贴按钮下沿（用 bottom 表达：底边 = 视口高 - (按钮底 + 面板高 + 间距)）
    menuPos.value = { left, bottom: vh - (r.bottom + MARGIN + PANEL_H) }
  } else {
    // 都放不下 → 夹进视口（贴顶 MARGIN）
    menuPos.value = { left, bottom: Math.max(MARGIN, vh - PANEL_H - MARGIN) }
  }
  open.value = true
  nextTick(() => {
    // 未选小时时默认进入「选小时」段
    segment.value = hour.value === null ? 'hour' : 'minute'
  })
}

const onDocPointerDown = (e) => {
  if (!open.value) return
  const t = e.target
  /*
   * 用 panel.contains 判断「在面板内」，而不是 closest：
   * 表盘是 SVG，e.target 可能是 <svg>/<text>/<circle> 等 SVGElement，
   * 部分浏览器对 SVGElement.closest() 行为不一致，会把内部点击误判成外部
   * → 面板被自己关掉（实测点表盘后大字不更新，就是被关了）。
   */
  if (panelRef.value && panelRef.value.contains(t)) return
  if (triggerRef.value && triggerRef.value.contains(t)) return
  if (typeof t.closest === 'function' && t.closest('.clock-panel, .clock-trigger')) return
  open.value = false
}

/** Esc 关闭 */
const onKeydown = (e) => {
  if (open.value && e.key === 'Escape') open.value = false
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onKeydown)
  onUnmounted(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
  })
}

/* ---------------------------- 手动输入 ---------------------------- */
const manualInput = ref('')
const useManual = ref(false)

const applyManual = () => {
  const m = manualInput.value.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/)
  if (!m) return
  const h = Math.min(23, Math.max(0, Number(m[1])))
  const mi = Math.min(59, Math.max(0, Number(m[2])))
  commit(h, mi)
  useManual.value = false
  open.value = false
}

/** 清空 */
const clear = () => {
  emit('update:modelValue', '')
  open.value = false
}
</script>

<template>
  <div class="relative clock-picker">
    <button ref="triggerRef" type="button" class="clock-trigger" :aria-label="ariaLabel"
      :aria-expanded="open" aria-haspopup="dialog" @click="toggle">
      <span class="font-mono tabular-nums" :class="modelValue ? 'text-gray-800' : 'text-gray-400'">
        {{ modelValue || '--:--' }}
      </span>
      <svg class="w-4 h-4 shrink-0 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="open" class="fixed inset-0 z-[100]" @click="open = false"></div>

      <div v-if="open" ref="panelRef" role="dialog" class="clock-panel app-menu-panel fixed z-[110]"
        :style="panelStyle">
        <!-- 顶部：时 : 分 大字 + 段切换 -->
        <div class="flex items-center justify-center gap-1 py-2 border-b border-black/5">
          <button type="button" class="clock-digit" :class="segment === 'hour' ? 'is-active' : ''"
            @click="segment = 'hour'">{{ hourLabel }}</button>
          <span class="text-xl font-bold opacity-40">:</span>
          <button type="button" class="clock-digit" :class="segment === 'minute' ? 'is-active' : ''"
            @click="segment = 'minute'">{{ minuteLabel }}</button>
        </div>

        <!-- 表盘 -->
        <div class="clock-face px-2 pt-1">
          <svg :width="SIZE" :height="SIZE" :viewBox="`0 0 ${SIZE} ${SIZE}`"
            @pointerdown="onPointerDown">
            <!-- 外圈底盘 -->
            <circle :cx="CENTER" :cy="CENTER" :r="HOUR_R + 14" fill="rgba(255,255,255,0.5)"
              stroke="rgba(0,0,0,0.06)" />

            <!-- 指针 -->
            <line v-if="handEnd" :x1="CENTER" :y1="CENTER" :x2="handEnd.x" :y2="handEnd.y"
              stroke="currentColor" stroke-width="2" class="clock-hand" />

            <!-- 圆心 -->
            <circle :cx="CENTER" :cy="CENTER" r="3" fill="currentColor" class="clock-hand" />

            <!-- 小时刻度（24 格，外圈） -->
            <g v-for="h in hours" :key="'h' + h.value">
              <circle :cx="h.x" :cy="h.y" r="9"
                :fill="segment === 'hour' && hour === h.value ? 'rgb(var(--c-primary))' : 'transparent'"
                class="clock-dot" />
              <text :x="h.x" :y="h.y + 3.5" text-anchor="middle" class="clock-num"
                :class="{
                  'is-on': segment === 'hour' && hour === h.value,
                  'is-dim': segment === 'minute',
                }">{{ h.label }}</text>
            </g>

            <!-- 分钟刻度（12 格，内圈） -->
            <g v-for="m in minutes" :key="'m' + m.value">
              <circle :cx="m.x" :cy="m.y" r="8"
                :fill="segment === 'minute' && Math.round((minute ?? -1) / 5) * 5 === m.value ? 'rgb(var(--c-primary))' : 'transparent'"
                class="clock-dot" />
              <text :x="m.x" :y="m.y + 3" text-anchor="middle" class="clock-num clock-num-min"
                :class="{
                  'is-on': segment === 'minute' && Math.round((minute ?? -1) / 5) * 5 === m.value,
                  'is-dim': segment === 'hour',
                }">{{ m.label }}</text>
            </g>
          </svg>
        </div>

        <!-- 底部：手动输入 + 清空 -->
        <div class="flex items-center gap-2 px-3 py-2 border-t border-black/5">
          <input v-if="useManual" v-model="manualInput" type="text" placeholder="23:30"
            class="clock-manual" @keydown.enter="applyManual" />
          <button v-else type="button" class="btn-base btn-sm btn-link" @click="useManual = true">
            {{ '手动输入' }}
          </button>
          <button v-if="useManual" type="button" class="btn-base btn-sm btn-primary" @click="applyManual">
            确定
          </button>
          <button type="button" class="btn-base btn-sm btn-link ml-auto opacity-70" @click="clear">
            清空
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.clock-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 34px;
  width: 100%;
  padding: 0 10px;
  border: 1px solid rgb(var(--c-primary) / 0.2);
  border-radius: var(--r-md, 10px);
  background: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.clock-trigger:hover {
  border-color: rgb(var(--c-primary) / 0.4);
}
.dark .clock-trigger {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgb(var(--c-primary) / 0.3);
  color: #e5e7eb;
}
.clock-trigger:focus-visible {
  outline: 2px solid rgb(var(--c-primary) / 0.7);
  outline-offset: 1px;
}

.clock-panel {
  width: 280px;
  color: #374151;
}
.dark .clock-panel {
  color: #e5e7eb;
}

/* 顶部大字：选中的段用主题色 + 白底凸出 */
.clock-digit {
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 1px 8px;
  border-radius: var(--r-sm, 8px);
  opacity: 0.45;
  cursor: pointer;
  transition: all 0.15s ease;
}
.clock-digit.is-active {
  opacity: 1;
  color: rgb(var(--c-primary));
  background: rgb(var(--c-primary) / 0.12);
}

.clock-face {
  cursor: crosshair;
  user-select: none;
  touch-action: none;
}

/* 刻度数字 */
.clock-num {
  font-size: 10.5px;
  font-weight: 600;
  fill: currentColor;
  pointer-events: none;
  transition: opacity 0.15s ease, fill 0.15s ease;
}
.clock-num-min {
  font-size: 9px;
  opacity: 0.55;
}
.clock-num.is-off,
.clock-num.is-dim {
  opacity: 0.35;
}
.clock-num.is-on {
  fill: #fff;
  opacity: 1;
}

.clock-dot {
  transition: fill 0.15s ease;
}
.clock-hand {
  color: rgb(var(--c-primary));
  transition: all 0.18s ease;
}

.clock-manual {
  width: 5rem;
  padding: 3px 7px;
  font-size: 12px;
  border: 1px solid rgb(var(--c-primary) / 0.2);
  border-radius: var(--r-sm, 8px);
  background: #fff;
  color: #374151;
}
.dark .clock-manual {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgb(var(--c-primary) / 0.3);
  color: #e5e7eb;
}
</style>
