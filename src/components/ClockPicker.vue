<script setup>
/**
 * 时间选择器 —— 按钮网格版。
 *
 * 2026-11-05 用户裁定：表盘（单圈 AOSP / 双圈）都不要，退回 49cbe3c 之前的
 * 「点击时和分」按钮网格交互：
 *   · 点开面板：上排 24 个「HH:00」小时按钮（8 列网格），分隔线，下排 12 个
 *     「:MM」分钟按钮（5 分步进，8 列网格）
 *   · 点小时 → 保留当前分钟并写入；点分钟 → 保留当前小时、写入并收盘
 *   · 面板水平居中于触发按钮（并列宿主弹窗入场动画后的 350ms 校准）
 *   · 面板/按钮/触发器全部 rem 几何，随根字号缩放
 *   · 手动输入 / 清空 作为兜底保留在面板底部
 */
import { computed, nextTick, onBeforeUnmount, onUnmounted, ref } from 'vue'
import { useI18n } from '../composables/useI18n'

const props = defineProps({
  /** 'HH:mm' 格式；空串表示未选 */
  modelValue: { type: String, default: '' },
  /** 无障碍标签 */
  ariaLabel: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const { tt } = useI18n()

const open = ref(false)
const triggerRef = ref(null)
const panelRef = ref(null)
/** 面板定位：top 锚定（镜像 DatePicker），placement 决定弹出方向的原点变量 */
const panelPos = ref({ left: 0, top: 0, placement: 'below' })

/** 卸载时关闭离场过渡：宿主 DOM 移除后过渡继续跑会抛 jsdom 异常（同 DatePicker） */
const popCss = ref(true)
onBeforeUnmount(() => { popCss.value = false })

/** 面板宽度估算（20rem @ 根 14 ≈ 280px）；实测阶段用 offsetWidth 校正 */
const PANEL_W = 280
const MARGIN = 8

const panelStyle = computed(() => ({
  left: `${panelPos.value.left}px`,
  top: `${panelPos.value.top}px`,
  maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
  '--pop-origin-y': panelPos.value.placement === 'above' ? 'bottom' : 'top',
  '--pop-from-y': panelPos.value.placement === 'above' ? '6px' : '-6px',
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

/** 写回 'HH:mm'；未选的段用 0 补齐，避免出现 '23:undefined' */
const commit = (h, m) => {
  const hh = String(h === null ? 0 : h).padStart(2, '0')
  const mm = String(m === null ? 0 : m).padStart(2, '0')
  emit('update:modelValue', `${hh}:${mm}`)
}

/** 点小时：保留当前分钟 */
const selectHour = (h) => {
  commit(h, minute.value === null ? 0 : minute.value)
}

/** 点分钟：保留当前小时，写入并收盘 */
const selectMinute = (m) => {
  commit(hour.value === null ? 0 : hour.value, m)
  open.value = false
  nextTick(() => triggerRef.value?.focus?.())
}

/* ---------------------------- 打开/关闭 + 定位 ---------------------------- */
const placePanel = (measured = true) => {
  const btn = triggerRef.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  // 水平居中于触发按钮（用户要求），两侧越界时夹进视口。
  // 面板宽随根字号缩放（rem），measured 阶段用实测宽，首帧用常量估算。
  const pw = (measured && panelRef.value?.offsetWidth) || PANEL_W
  let left = r.left + r.width / 2 - pw / 2
  left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, window.innerWidth - pw - MARGIN))

  // 纵向：优先向上（与旧版观感一致）；上方放不下且下方放得下翻到下方；
  // 两头都放不下（超小窗口）整体夹进视口（镜像 DatePicker）。
  const ph = (measured && panelRef.value?.offsetHeight) || 200
  const vh = window.innerHeight
  let top = r.top - ph - MARGIN
  let placement = 'above'
  if (top < MARGIN) {
    const below = r.bottom + MARGIN
    if (below + ph <= vh - MARGIN) {
      top = below
      placement = 'below'
    } else {
      top = Math.max(MARGIN, vh - ph - MARGIN)
    }
  }
  top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - ph - MARGIN))
  panelPos.value = { left: Math.round(left), top: Math.round(top), placement }
}

const toggle = () => {
  if (open.value) {
    open.value = false
    return
  }
  if (!triggerRef.value) return
  placePanel(false)
  open.value = true
  nextTick(() => {
    placePanel(true)
    /* 宿主弹窗入场动画是长尾 ease-out：大根字号下触发器在数百毫秒内仍会移动，
       首测会钉在动画尾程坐标上；动画基本结束后再校准一次。 */
    setTimeout(() => {
      if (open.value) placePanel(true)
    }, 350)
  })
}

const onDocPointerDown = (e) => {
  if (!open.value) return
  const t = e.target
  if (panelRef.value && panelRef.value.contains(t)) return
  if (triggerRef.value && triggerRef.value.contains(t)) return
  if (typeof t.closest === 'function' && t.closest('.clock-panel, .clock-trigger')) return
  open.value = false
}

/** Esc 关闭：捕获阶段 + stopPropagation，一次 Esc 只收面板，不连宿主弹窗一起关（A-27） */
const onKeydown = (e) => {
  if (!open.value || e.key !== 'Escape') return
  e.stopPropagation()
  open.value = false
  // 关闭后焦点还给触发按钮：否则焦点随面板卸载退回 body
  nextTick(() => triggerRef.value?.focus?.())
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onKeydown, true)
  onUnmounted(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    document.removeEventListener('keydown', onKeydown, true)
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

      <transition name="pop" :css="popCss">
        <div v-if="open" ref="panelRef" role="dialog" class="clock-panel app-menu-panel fixed z-[110]"
          :style="panelStyle">
        <!-- 小时网格：24 个「HH:00」 -->
        <div class="clock-grid">
          <button v-for="h in 24" :key="'h' + h" type="button"
            class="btn-base btn-sm clock-cell"
            :class="hour === h - 1 ? 'btn-primary font-bold' : 'btn-neutral'"
            @click="selectHour(h - 1)">{{ String(h - 1).padStart(2, '0') }}:00</button>
        </div>
        <div class="clock-sep"></div>
        <!-- 分钟网格：12 个「:MM」（5 分步进） -->
        <div class="clock-grid">
          <button v-for="m in 12" :key="'m' + m" type="button"
            class="btn-base btn-sm clock-cell"
            :class="minute === (m - 1) * 5 ? 'btn-primary font-bold' : 'btn-neutral'"
            @click="selectMinute((m - 1) * 5)">:{{ String((m - 1) * 5).padStart(2, '0') }}</button>
        </div>
        <!-- 底部：手动输入 + 清空 -->
        <div class="clock-foot">
          <input v-if="useManual" v-model="manualInput" type="text" placeholder="23:30"
            class="clock-manual" @keydown.enter="applyManual" />
          <button v-else type="button" class="btn-base btn-sm btn-link" @click="useManual = true">
            {{ tt('showDialog.manualInput') }}
          </button>
          <button v-if="useManual" type="button" class="btn-base btn-sm btn-primary" @click="applyManual">
            {{ tt('common.confirm') }}
          </button>
          <button type="button" class="btn-base btn-sm btn-link ml-auto opacity-70" @click="clear">
            {{ tt('common.clear') }}
          </button>
        </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.clock-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 0.5rem 1rem;
  border: 1px solid rgb(var(--c-primary) / 0.2);
  border-radius: var(--r-md, 10px);
  background: rgba(255, 255, 255, 0.8);
  font-size: 0.875rem;
  line-height: 1.25rem;
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

/* 面板：20rem @ 根 14 ≈ 280px，随根字号等比缩放；maxHeight 由 placePanel 内联
   （calc(100vh - 2×MARGIN)，超小窗口时面板内部滚动） */
.clock-panel {
  width: 20rem;
  padding: 0.75rem;
  overflow-y: auto;
  color: #374151;
}
.dark .clock-panel {
  color: #e5e7eb;
}

/* 8 列网格（与旧版 grid-cols-8 gap-1.5 一致） */
.clock-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 0.375rem;
}
.clock-cell {
  padding-left: 0;
  padding-right: 0;
  min-width: 0;
  font-size: 0.714rem;
  font-variant-numeric: tabular-nums;
}

.clock-sep {
  margin: 0.5rem 0;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}
.dark .clock-sep {
  border-top-color: rgba(255, 255, 255, 0.12);
}

.clock-foot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}
.dark .clock-foot {
  border-top-color: rgba(255, 255, 255, 0.12);
}

.clock-manual {
  width: 5rem;
  padding: 3px 7px;
  font-size: 0.857rem;
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
