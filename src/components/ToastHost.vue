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
      <!-- 入场动画只留 Vue <transition-group>（.toast-enter-active/.toast-enter-from）。
           视觉审计 A-31：这里原来还挂着 Tailwind animate-slide-down（0.3s，关键帧含
           opacity 0→1）。两套动画启动时序是竞态的 —— Vue enter 先跑完 slide-down 才从
           ct=0 起播，把 opacity 拉回 0 再放一遍（实测「滑入→闪没→再淡入」，入场
           0.77~0.86s）。只保留一套后 opacity 单调 0→1（设计 0.4s）。 -->
      <div v-for="t in toasts" :key="t.id"
        class="toast-item px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white max-w-[24rem] pointer-events-auto flex items-start gap-3"
        :class="t.type === 'success' ? 'toast-success' : t.type === 'error' ? 'toast-error' : 'toast-warning'">
        <!-- A-32：flex-1 子项默认 min-width:auto，无空格长 token（URL/长英文词）不换行，
             span 被撑到 1500~1809px（文本画出 336px 的 toast 盒，关闭按钮被推出视口）。
             min-w-0 允许收缩，overflow-wrap:anywhere 在盒内强制断行（见 .toast-message）。 -->
        <span class="toast-message flex-1 min-w-0">{{ t.message }}</span>
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
/* A-32：长无空格 token（URL/长英文词）必须在 toast 盒内断行。
   overflow-wrap:anywhere 比 break-word 更狠（连超长 token 也允许在任意位置断开），
   否则 span 会把盒子撑宽、文本直接画出圆角背景之外。 */
.toast-message {
  overflow-wrap: anywhere;
  word-break: break-word;
}
/* 关闭按钮命中区（视觉审计 A-54）：纯文字 × 原来只有 16.73×14px，低于 WCAG 2.2
   AA 2.5.8 的 24×24。这里用 min-width/min-height 撑到 24×24 并居中字形
   （不靠 padding 扩，避免与 .toast-item 的 gap 叠加把盒子撑高）。
   用半透明白底代替 opacity：opacity 会同时淡化文字与底，把对比度一起拖下去；
   背景色只影响按钮区域、不影响文字颜色，因此不会降低可读性。
   全局 :focus-visible 会给出可见外描边（键盘用户能看到焦点位置）。 */
.toast-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
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
