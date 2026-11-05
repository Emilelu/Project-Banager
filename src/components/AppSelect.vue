<script setup>
/**
 * 通用下拉选择器 —— 用来替掉全站的原生 <select>。
 *
 * 为什么要替：原生 <select> 的下拉由**操作系统绘制**，无法套用项目的毛玻璃风格，
 * 在「查看新番」「标签筛选」这类自绘菜单旁边显得完全割裂（用户明确要求统一）。
 *
 * 视觉规范严格对齐「查看新番」季节菜单：
 *   面板 .app-menu-panel（14px 圆角 / blur(20px) / 白 82% 底 / 白 40% 描边 / 双层阴影）
 *   菜单项整行可点、左对齐、hover 主题色低透底、选中项主题色加粗。
 *
 * 定位（2026-11-05 对齐 DatePicker 参照实现）：
 *   · Teleport 到 body + fixed + top 锚定；优先向上展开（与旧版观感一致），
 *     上方放不下翻到下方，两头都放不下整体夹进视口 + 内部滚动；
 *   · placement 写入 --pop-origin-y / --pop-from-y，弹出动画从锚点一侧长出来
 *     （此前本菜单没有弹出动画，用户要求全站统一补全）；
 *   · 必须 Teleport：祖先带 backdrop-filter / transform 时 fixed 会被当包含块，实测偏移 200px。
 */
import { ref, computed, onBeforeUnmount, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  /** v-model 绑定值 */
  modelValue: { type: [String, Number], default: '' },
  /** 选项：{ value, label }[] */
  options: { type: Array, required: true },
  /** 无值时的占位文字 */
  placeholder: { type: String, default: '' },
  /** 触发器宽度类（默认自适应内容） */
  triggerClass: { type: String, default: '' },
  /** 无障碍标签 */
  ariaLabel: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

const open = ref(false)
const triggerRef = ref(null)
const panelRef = ref(null)
const panelPos = ref({ left: 0, top: 0, placement: 'above' })
const MENU_W = 200
const MARGIN = 8

/** 卸载时关闭离场过渡：宿主 DOM 移除后过渡继续跑会抛异常（同 DatePicker） */
const popCss = ref(true)
onBeforeUnmount(() => { popCss.value = false })

const menuStyle = computed(() => ({
  left: `${panelPos.value.left}px`,
  top: `${panelPos.value.top}px`,
  maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
  '--pop-origin-y': panelPos.value.placement === 'above' ? 'bottom' : 'top',
  '--pop-from-y': panelPos.value.placement === 'above' ? '6px' : '-6px',
}))

/** 当前选中项的显示文字 */
const currentLabel = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue)
  return hit ? hit.label : props.placeholder
})

const placeMenu = (measured = true) => {
  const btn = triggerRef.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = (measured && panelRef.value?.offsetWidth) || MENU_W
  const h = (measured && panelRef.value?.offsetHeight) || 180

  let left = Math.min(Math.max(r.left, MARGIN), Math.max(MARGIN, vw - w - MARGIN))

  // 优先向上展开（旧版观感）；上方放不下且下方放得下翻到下方；
  // 两头都放不下（超小窗口）整体夹进视口，maxHeight 兜底内部滚动。
  let top = r.top - h - MARGIN
  let placement = 'above'
  if (top < MARGIN) {
    const below = r.bottom + MARGIN
    if (below + h <= vh - MARGIN) {
      top = below
      placement = 'below'
    } else {
      top = Math.max(MARGIN, vh - h - MARGIN)
    }
  }
  top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - h - MARGIN))
  panelPos.value = { left: Math.round(left), top: Math.round(top), placement }
}

const toggle = () => {
  if (open.value) {
    open.value = false
    return
  }
  if (!triggerRef.value) return
  placeMenu(false)
  open.value = true
  nextTick(() => placeMenu(true))
}

const pick = (opt) => {
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  open.value = false
}

/** 点外部关闭（捕获阶段，避免被内部按钮的处理吞掉） */
const onDocPointerDown = (e) => {
  if (!open.value) return
  if (e.target.closest('.app-menu-panel, .app-select-trigger')) return
  open.value = false
}

/** Esc 关闭：捕获阶段 + stopPropagation —— 一次 Esc 只收下拉，不连宿主弹窗一起关（A-27） */
const onKeydown = (e) => {
  if (!open.value || e.key !== 'Escape') return
  e.stopPropagation()
  open.value = false
  // 关闭后焦点还给触发器
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
</script>

<template>
  <div class="relative app-select">
    <button ref="triggerRef" type="button" class="app-select-trigger" :class="triggerClass"
      :aria-label="ariaLabel" :aria-expanded="open" aria-haspopup="listbox" @click="toggle">
      <span class="truncate">{{ currentLabel }}</span>
      <svg class="w-3.5 h-3.5 shrink-0 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path :d="open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'" />
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="open" class="fixed inset-0 z-[100]" @click="open = false"></div>
      <transition name="pop" :css="popCss">
        <div v-if="open" ref="panelRef" role="listbox" class="app-menu-panel fixed z-[110] overflow-y-auto"
          :style="menuStyle">
          <button v-for="opt in options" :key="String(opt.value)" type="button" role="option"
            :aria-selected="opt.value === modelValue ? 'true' : 'false'"
            class="app-select-item" @click="pick(opt)">
            <span class="w-4 shrink-0" aria-hidden="true">
              <svg v-if="opt.value === modelValue" class="w-4 h-4" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
              </svg>
            </span>
            <span class="truncate">{{ opt.label }}</span>
          </button>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* 触发器：与全站输入框/按钮同一几何（随根字号缩放、10px 圆角、主题色描边）。
   原先 height:34px / font-size:14px 是固定 px，大根字号（4K）下不缩放，
   与 rem 制的按钮和菜单项脱节 —— 全部改 rem 后与 .btn-base 完全同高（≈2.25rem+2px）。 */
.app-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  padding: 0.5rem 1rem;
  min-width: 8rem;
  border: 1px solid rgb(var(--c-primary) / 0.2);
  border-radius: var(--r-md, 10px);
  background: rgba(255, 255, 255, 0.8);
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: #374151;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.app-select-trigger:hover {
  border-color: rgb(var(--c-primary) / 0.4);
}
/* 深色模式：与 tone-input 反转一致 */
.dark .app-select-trigger {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgb(var(--c-primary) / 0.3);
  color: #e5e7eb;
}
.app-select-trigger:focus-visible {
  outline: 2px solid rgb(var(--c-primary) / 0.7);
  outline-offset: 1px;
}
</style>
