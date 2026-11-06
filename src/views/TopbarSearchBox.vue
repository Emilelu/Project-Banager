<template>
  <!-- 顶栏搜索框（等番/已看页共用，视觉审计 A-01 随第一卡迁入顶栏）。

       两档形态（视觉审计方案 D1 的降级设计，断点与 style.css ≤1100 顶栏图标化对齐）：
       · >1100：28rem 内联输入框常驻（.tb-search-inline）；
       · ≤1100：折叠成 36px 放大镜钮（.tb-search-btn），点开 Teleport 浮层面板输入。
       两档显示切换**纯 CSS**（media query），JS 不感知档位 —— 面板只在被点击时打开，
       而按钮在 >1100 是 display:none，因此不会在宽档误开。

       面板为什么 Teleport 到 body：header 是 .glass（带 backdrop-filter），
       会成为 position:fixed 的包含块，fixed 子元素按祖先盒子定位（实测偏移可达 200px）。
       与全站弹窗/菜单同一纪律。 -->
  <div class="tb-search relative flex items-center min-w-0">
    <!-- 宽档：内联输入框。收缩优先级最高（shrink-999）：2026-11-06 用户要求
         空间不足时先收搜索栏、其他元素不动；下限 7rem（拥挤顶栏实测再让一步）。 -->
    <div class="tb-search-inline relative w-[28rem] max-w-full min-w-[7rem] shrink-[999]">
      <input v-model="valueModel" type="text" :placeholder="placeholder" :aria-label="placeholder"
        class="w-full pl-8 pr-8 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
      <AppIcon scale="sm" name="search" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <button v-if="modelValue" type="button" @click="setValue('')" :aria-label="tt('common.clear')"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
        <AppIcon scale="xs" name="close" />
      </button>
    </div>

    <!-- 窄档：36px 放大镜钮（>1100 时由 CSS 隐藏） -->
    <button ref="btnRef" type="button" @click="togglePanel"
      class="tb-search-btn w-9 h-9 shrink-0 rounded-lg items-center justify-center text-gray-500 hover:bg-primary/10 hover:text-primary transition-all duration-150"
      :class="{ 'bg-primary/10 text-primary': panelOpen }"
      :aria-label="tt('common.search')" :aria-expanded="panelOpen" aria-haspopup="dialog"
      v-tip="tt('common.search')">
      <AppIcon scale="sm" name="search" />
    </button>

    <Teleport to="body">
      <!-- 遮罩：点面板外即关闭（与语言菜单 / 年份菜单同款交互） -->
      <div v-if="panelOpen" class="fixed inset-0 z-[100]" @click="closePanel"></div>
      <transition name="pop">
        <div v-if="panelOpen" ref="panelRef" role="search" :aria-label="placeholder"
          class="fixed z-[110] app-menu-panel tb-search-panel"
          style="--pop-origin-y: top; --pop-from-y: -6px"
          :style="panelStyle"
          @keydown="onPanelKeydown">
          <div class="relative">
            <input ref="panelInputRef" v-model="valueModel" type="text" :placeholder="placeholder" :aria-label="placeholder"
              class="w-full pl-8 pr-8 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
            <AppIcon scale="sm" name="search" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <button v-if="modelValue" type="button" @click="setValue('')" :aria-label="tt('common.clear')"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
              <AppIcon scale="xs" name="close" />
            </button>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
/**
 * 顶栏搜索框（等番/已看页的 pageControls 控件内部件）。
 *
 * v-model 直接透传：状态（searchQuery）与过滤逻辑都在各自 view 里，
 * 本组件只负责「顶栏里怎么渲染、窄档怎么降级」。
 *
 * 窄档浮层面板的定位/键盘/外点关闭复用 pageActionsMenu 的成熟模式：
 * fixed + 触发按钮矩形锚定 + 视口夹取；Esc 归还焦点到触发按钮。
 */
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from '../composables/useI18n'

const props = defineProps({
  /** 搜索词（view 的 searchQuery，v-model 透传） */
  modelValue: { type: String, default: '' },
  /** 占位文案（各页自己算好传入，如 tt('remaining.searchPlaceholder')） */
  placeholder: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const { tt } = useI18n()

const valueModel = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
const setValue = (v) => emit('update:modelValue', v)

// ===== 窄档浮层面板 =====
const panelOpen = ref(false)
const btnRef = ref(null)
const panelRef = ref(null)
const panelInputRef = ref(null)
const panelPos = ref({ left: 0, top: 0 })

const panelStyle = computed(() => ({
  left: `${panelPos.value.left}px`,
  top: `${panelPos.value.top}px`,
}))

/** 锚定触发按钮、夹进视口；下方放不下翻上方（与 pageActionsMenu 同一套算法） */
const measurePanel = () => {
  const btn = btnRef.value
  const panel = panelRef.value
  if (!btn) return
  const b = btn.getBoundingClientRect()
  const w = panel?.offsetWidth || 320
  const h = panel?.offsetHeight || 48
  const margin = 8
  const left = Math.min(Math.max(b.right - w, margin), Math.max(margin, window.innerWidth - w - margin))
  let top = b.bottom + 6
  if (top + h > window.innerHeight - margin) top = b.top - h - 6
  panelPos.value = { left: Math.round(left), top: Math.round(Math.max(margin, top)) }
}

const togglePanel = async () => {
  panelOpen.value = !panelOpen.value
  if (panelOpen.value) {
    await nextTick()
    measurePanel()
    // 焦点直接进输入框：这是窄档搜索的唯一入口，多一次跳转都是浪费
    panelInputRef.value?.focus()
  }
}

const closePanel = async () => {
  if (!panelOpen.value) return
  panelOpen.value = false
  // 焦点归还触发按钮：面板卸载后焦点会落回 body，键盘用户就丢失位置了
  await nextTick()
  btnRef.value?.focus?.()
}

const onPanelKeydown = (e) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closePanel()
  }
}

// 窗口变化：窄档内重新定位；一旦跨过 1100 升回宽档就收起面板（内联框已经接管）
const onResize = () => {
  if (!panelOpen.value) return
  if (window.innerWidth > 1100) {
    panelOpen.value = false
    return
  }
  measurePanel()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})
</script>
