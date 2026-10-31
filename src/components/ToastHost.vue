<template>
  <!-- top-[4.5rem]：避开顶部 56px 高的 header（右侧有时钟），否则 Toast 会盖住时间 -->
  <div class="fixed top-[4.5rem] right-6 z-[100] flex flex-col items-end gap-2 pointer-events-none"
    role="status" aria-live="polite" aria-atomic="false">
    <transition-group name="toast">
      <!-- 对比度修复（a11y 审计实测）：
           原渐变 success→emerald-400 / danger→red-400 / warning→amber-400，
           白字最差只有 1.67~2.77:1，远低于正文 4.5:1。
           toast 是浮层，没有「大字号」豁免，这里改成「语义色的深阶混色渐变」：
           仍一眼能分出成功/失败/警告（保留色相），但每个端点都压到 ≥4.7:1。
           用 color-mix(in srgb, <token> N%, black) 而不是写死十六进制，
           这样用户在 /appearance 里改主题色/配色时 toast 会跟着走。 -->
      <div v-for="t in toasts" :key="t.id"
        class="toast-item px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white animate-slide-down max-w-[24rem] pointer-events-auto flex items-start gap-3"
        :class="t.type === 'success' ? 'toast-success' : t.type === 'error' ? 'toast-error' : 'toast-warning'">
        <span class="flex-1">{{ t.message }}</span>
        <!-- 关闭按钮：**不能靠 opacity 调淡**——opacity 会把白字和底一起合成，
             实测 opacity:0.9 时按钮文字只有 4.0~4.2:1（正文需要 4.5）。
             改成不做透明度，靠「hover 加底色」表达可点状态（见 .toast-close）。
             它本身是有 aria-label 的真按钮，键盘 Tab 可达（role=status 不阻断子元素焦点）。 -->
        <button type="button" class="shrink-0 transition leading-none toast-close"
          :aria-label="tt('toast.closeLabel', { message: t.message })" @click="removeToast(t.id)">×</button>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { useToasts, removeToast } from '../composables/useToast'
import { useI18n } from '../composables/useI18n'

const { tt } = useI18n()
const toasts = useToasts()
</script>

<style scoped>
/* 语义色渐变（每档都保证白字 ≥4.7:1，详见模板注释）。
   两端点比例刻意不对称：较亮的那一端只用很小一段，避免整条渐变的
   「中间亮度」把可读区吃掉。 */
.toast-success {
  background-image: linear-gradient(
    to right,
    color-mix(in srgb, rgb(var(--c-success)) 62%, black),
    color-mix(in srgb, rgb(var(--c-success)) 70%, black)
  );
}
.toast-error {
  background-image: linear-gradient(
    to right,
    color-mix(in srgb, rgb(var(--c-danger)) 75%, black),
    color-mix(in srgb, rgb(var(--c-danger)) 88%, black)
  );
}
.toast-warning {
  background-image: linear-gradient(
    to right,
    color-mix(in srgb, rgb(var(--c-warning)) 50%, black),
    color-mix(in srgb, rgb(var(--c-warning)) 65%, black)
  );
}
/* 关闭按钮稍微放大命中区（纯文字 × 的可点区域只有 1 个字宽）。
   用半透明白底代替 opacity：opacity 会同时淡化文字与底，把对比度一起拖下去；
   背景色只影响按钮区域、不影响文字颜色，因此不会降低可读性。
   全局 :focus-visible 会给出可见外描边（键盘用户能看到焦点位置）。 */
.toast-close {
  font-size: 1rem;
  line-height: 1;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  /* 与全站交互同一套：颜色过渡走 iOS spring（小元素档 0.25s）。
     模板里只写了 `transition`（未指定属性），Tailwind 的 utilities 兜底会把曲线统一，
     这里显式声明一次，避免依赖层序。 */
  transition: background-color 0.25s var(--ease-spring), color 0.25s var(--ease-spring);
}
.toast-close:hover {
  background-color: rgb(255 255 255 / 0.16);
}
</style>
