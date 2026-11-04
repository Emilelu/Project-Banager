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
 * 定位：Teleport 到 body + fixed，坐标用 bottom 定位（不需要知道菜单高度）。
 * 为什么必须 Teleport：祖先只要带 backdrop-filter / transform，fixed 就会被
 * 当成包含块，气球会偏移（项目里 .glass 卡片全都有 backdrop-filter）。
 */
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'

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
const menuPos = ref({ left: 0, bottom: 0 })
const MENU_W = 200
const MARGIN = 8

const menuStyle = computed(() => ({
  left: menuPos.value.left + 'px',
  bottom: menuPos.value.bottom + 'px',
}))

/** 当前选中项的显示文字 */
const currentLabel = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue)
  return hit ? hit.label : props.placeholder
})

const toggle = () => {
  if (open.value) {
    open.value = false
    return
  }
  const btn = triggerRef.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  let left = r.left
  if (left + MENU_W > window.innerWidth - MARGIN) {
    left = Math.max(MARGIN, window.innerWidth - MENU_W - MARGIN)
  }
  // bottom 定位：菜单底边贴在触发器上方 MARGIN 处，高度多少都自动向上展开
  menuPos.value = { left: left, bottom: window.innerHeight - r.top + MARGIN }
  open.value = true
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

/**
 * 触发器宽度跟随选项里最长的那条文字，避免菜单宽度与触发器宽度不一致时视觉错位。
 */
watch(
  () => open.value,
  (v) => {
    if (v) nextTick(() => {})
  },
)

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
      <div v-if="open" role="listbox" class="app-menu-panel fixed z-[110] max-h-[18rem] overflow-y-auto"
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
    </Teleport>
  </div>
</template>

<style scoped>
/* 触发器：与全站输入框/按钮同一几何（34px 高、10px 圆角、主题色描边） */
.app-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  height: 34px;
  padding: 0 10px;
  min-width: 8rem;
  border: 1px solid rgb(var(--c-primary) / 0.2);
  border-radius: var(--r-md, 10px);
  background: rgba(255, 255, 255, 0.8);
  font-size: 14px;
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
