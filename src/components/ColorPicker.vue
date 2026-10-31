<template>
  <div class="color-picker-wrapper" :style="{ width: size, height: size }">
    <!-- 可见的色块（真正被样式化的部分） -->
    <button type="button" class="color-picker-swatch btn-press"
      :style="{ background: value || 'transparent', width: size, height: size }"
      :aria-label="ariaLabel || tt('color.pick')"
      v-tip="tip || ''"
      @click="openPicker">
      <!-- 当前色为空时显示斜线，表示「未设置」 -->
      <span v-if="!value" class="color-picker-empty" aria-hidden="true"></span>
    </button>
    <!-- 原生 color input 完全透明铺满：保留系统取色器能力，但不暴露原生外观 -->
    <input ref="inputRef" type="color" class="color-picker-native"
      tabindex="-1" aria-hidden="true"
      :value="value || '#888888'"
      @input="onInput" />
  </div>
</template>

<script setup>
/**
 * 统一取色控件。
 *
 * 为什么要包一层：
 *   原生 input[type=color] 的外观由浏览器控制 —— Chrome 会在圆角内再画一个方形色块，
 *   看上去像「圆角里套方块」，Safari/Firefox 又各不相同，做不到全站统一。
 *   解法是把原生 input 做成完全透明、铺满整个容器，由旁边的 button 显示色块与圆角；
 *   点击按钮时转发给 input，仍然使用系统取色器（不重复实现调色板 UI）。
 *
 * 无障碍：
 *   · 原生 input 的 tabindex="-1" + aria-hidden="true"：不进 Tab 序、不进可访问性树，
 *     避免同页多个取色器时出现大量多余 Tab 位与重复朗读。
 *   · 键盘用户聚焦到 button 后按 Enter/Space 即可打开系统取色器。
 */
import { ref } from 'vue'
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
const inputRef = ref(null)

const openPicker = () => {
  // showPicker 需要用户手势，此处正是 click 回调，满足条件；
  // 不支持或抛错时回退到原生 click()。
  const el = inputRef.value
  if (!el) return
  try {
    if (typeof el.showPicker === 'function') el.showPicker()
    else el.click()
  } catch {
    try { el.click() } catch { /* 环境禁用原生取色器时静默忽略 */ }
  }
}

const onInput = (e) => {
  const v = e.target.value
  emit('input', v)
  emit('change', v)
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

/* 原生控件完全透明铺满：可见性交给上面的 button，能力仍来自系统取色器。
   pointer-events: none 让它不参与指针事件（点击落在 button 上，由 openPicker 转发），
   同时保证即使有脚本 focus() 它，也不会抢走 button 的焦点。 */
.color-picker-native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  border: 0;
  padding: 0;
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
