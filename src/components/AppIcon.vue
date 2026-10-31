<template>
  <svg class="app-icon" :class="sizeClass" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">
    <path v-for="(d, i) in paths" :key="i" :d="d" :fill="filledPaths.includes(i) ? 'currentColor' : 'none'" />
    <circle v-for="(c, i) in circles" :key="'c' + i" :cx="c.cx" :cy="c.cy" :r="c.r"
      :fill="c.fill === 'currentColor' ? 'currentColor' : 'none'" />
  </svg>
</template>

<script setup>
/**
 * 统一图标组件 —— 全站唯一图标来源。
 *
 * 设计规范（与顶栏一致）：
 *  - 24×24 视框、1.9 描边、圆头圆角连接、currentColor 继承文字色
 *  - **尺寸只允许使用预设 scale**，禁止模板里零散写 w-4 h-4 / w-5 h-5，
 *    否则同一界面会出现 3px 视觉差、看着不协调。
 *
 * 尺寸预设（按语义而非像素命名）：
 *   xs  → 12px  行内小图标（角标、排序箭头、版本号装饰）
 *   sm  → 16px  常规按钮/表头/单元格内图标（最常用）
 *   md  → 20px  工具栏按钮、导航、顶栏
 *   lg  → 24px  区块标题
 *   xl  → 40px  空态、确认弹窗的大图标
 *
 * 颜色：一律用 currentColor，天然跟随主题色与文字色；
 *       需要主题色时由外层容器给 text-primary / text-xxx。
 */
import { computed } from 'vue'
import { ICONS } from './iconData'

const props = defineProps({
  name: { type: String, required: true },
  // 语义尺寸：xs / sm / md / lg / xl
  scale: { type: String, default: 'sm' },
  // 描边粗细：小尺寸适当加粗保证清晰
  strokeWidth: { type: [Number, String], default: null },
})

const icon = computed(() => ICONS[props.name] || ICONS.help)
const paths = computed(() => icon.value.paths || [])
const circles = computed(() => icon.value.circles || [])
const filledPaths = computed(() => icon.value.filled || [])

const sizeClass = computed(() => ({
  'icon-xs': props.scale === 'xs',
  'icon-sm': props.scale === 'sm',
  'icon-md': props.scale === 'md',
  'icon-lg': props.scale === 'lg',
  'icon-xl': props.scale === 'xl',
}))

// 小尺寸用略粗的描边，避免发灰；大尺寸用细描边，避免笨重
const strokeWidth = computed(() => {
  if (props.strokeWidth) return props.strokeWidth
  return props.scale === 'xs' ? 2 : props.scale === 'xl' ? 1.6 : 1.9
})
</script>

<style scoped>
.app-icon {
  flex-shrink: 0;
  display: inline-block;
  vertical-align: -0.125em;
}
.icon-xs { width: 0.75rem; height: 0.75rem; }
.icon-sm { width: 1rem; height: 1rem; }
.icon-md { width: 1.25rem; height: 1.25rem; }
.icon-lg { width: 1.5rem; height: 1.5rem; }
.icon-xl { width: 2.5rem; height: 2.5rem; }
</style>
