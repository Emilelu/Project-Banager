<template>
  <div v-if="allTags.length" class="tag-filter">
    <!-- 触发按钮：显示当前筛选状态 -->
    <div class="relative inline-block">
      <!-- 触发按钮：统一成 .filter-trigger（实色底 + text-sm + rounded-xl），
           与「查看新番」等同排按钮一致；点开后的菜单面板仍是 app-menu-surface + pop。 -->
      <button ref="triggerRef" type="button" @click="toggle"
        class="filter-trigger tag-filter-trigger transition"
        :class="{ 'is-active': selected.length > 0 }"
        :aria-expanded="open" aria-haspopup="menu"
        :aria-label="tt('tags.filterLabel')"
        v-tip="tt('tags.filterLabel')">
        <AppIcon scale="sm" name="filter" />
        <!-- filter-trigger-label / filter-trigger-caret：给「顶栏 icon-only 降级」用的语义钩子
             （style.css ≤1100 段据此隐藏文字与箭头，只留 36px 图标；正文里的实例不受影响） -->
        <span v-if="selected.length === 0" class="filter-trigger-label">{{ tt('tags.filter') }}</span>
        <span v-else class="filter-trigger-label">{{ tt('tags.filterCount', { count: selected.length }) }}</span>
        <AppIcon scale="xs" :name="open ? 'caretUp' : 'caretDown'" class="ml-0.5 filter-trigger-caret" />
      </button>

      <Teleport to="body">
        <div v-if="open" class="fixed inset-0 z-[100]" @click="open = false"></div>
        <transition name="pop">
          <!-- a11y：
               · role=menu 必须配 aria-label —— 否则读屏只念「菜单」，不知道是什么菜单
               · 打开后焦点进入菜单（否则键盘用户按 Enter 打开后，焦点还在按钮上，
                 再按 Tab 就跑到下一个工具栏按钮，菜单项永远摸不到）
               · Esc 关闭后焦点回到触发按钮（由 onKeydown 处理） -->
          <div v-if="open" ref="menuRef" role="menu" :aria-label="tt('tags.filterLabel')"
            class="fixed z-[110] app-menu-panel min-w-[12rem] max-h-[60vh] overflow-y-auto"
            :style="menuStyle"
            @keydown="onMenuKeydown">
            <!-- 清空筛选 -->
            <button v-if="selected.length" type="button" @click="clearAll"
              class="flex items-center gap-2 px-3 py-2 text-xs text-left text-gray-500 hover:bg-primary/10 transition whitespace-nowrap">
              <AppIcon scale="xs" name="undo" />{{ tt('tags.clearFilter') }}
            </button>
            <div v-if="selected.length" class="border-t border-gray-200/60 my-1"></div>

            <!-- 标签多选（OR 语义：任一命中即显示） -->
            <button v-for="tag in allTags" :key="tag.name" type="button" role="menuitemcheckbox"
              :aria-checked="selected.includes(tag.name) ? 'true' : 'false'"
              @click="toggleTag(tag.name)"
              class="flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-primary/10 whitespace-nowrap"
              :class="selected.includes(tag.name) ? 'font-semibold text-gray-800' : 'text-gray-600'">
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: tag.color || 'rgb(var(--c-primary))' }"></span>
              <span class="flex-1">{{ tagLabel(tag, tt) }}</span>
              <span :class="selected.includes(tag.name) ? 'text-primary' : 'text-gray-300'">
                <AppIcon v-if="selected.includes(tag.name)" scale="xs" name="check" />
              </span>
            </button>
          </div>
        </transition>
      </Teleport>
    </div>

    <!-- 已选标签：可快速移除。
         tag-filter-chips：顶栏实例（pageControls）在 ≤1100 与宽档都不渲染这排 chips ——
         顶栏高度固定 56px 放不下换行，筛选状态已由触发钮的「已选 N」表达，
         移除入口仍在下拉菜单里（正文实例不受影响）。 -->
    <div v-if="selected.length" class="tag-filter-chips flex items-center gap-1 flex-wrap">
      <button v-for="name in selected" :key="name" type="button"
        class="tag-filter-chip"
        :aria-label="tt('tags.removeFilterLabel', { name: displayTagNames(name, allTags, tt)[0] })"
        @click="toggleTag(name)">
        {{ displayTagNames(name, allTags, tt)[0] }}<AppIcon scale="xs" name="close" class="ml-0.5 opacity-70" />
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * 标签筛选器 —— 三页共用。
 *
 * 语义：多选标签之间是 **OR**（任一所选标签命中即显示该条目）。
 * 为什么用 OR 而不是 AND：用户更常见的诉求是「看看所有热血向的作品」，
 * 选两个标签通常是想要并集（热血 或 日常）；若用 AND，
 * 选得越多结果越少，容易让人误以为筛选坏了。
 *
 * 值通过 v-model 传回：**逗号分隔的已选标签名**（空串代表不筛选）。
 */
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { tagsApi } from '../db/api'
import { useI18n } from '../composables/useI18n'
import { useTagLabel } from '../composables/useTagLabel'

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const { tt } = useI18n()
const { tagLabel, displayTagNames } = useTagLabel()

const allTags = ref([])
const open = ref(false)
const triggerRef = ref(null)
const menuRef = ref(null)
// placement 记录菜单最终在触发点的上/下侧，驱动方向变量：
// 向下弹 = 从顶边长出来（origin top）；向上翻 = 从底边长出来（origin bottom）。
// 此前方向变量写死 top，视口下方放不下翻到上方时动画仍向下长，方向是反的。
const menuPos = ref({ left: 0, top: 0, placement: 'below' })

const selected = computed(() =>
  String(props.modelValue || '').split(',').map(s => s.trim()).filter(Boolean),
)

const menuStyle = computed(() => ({
  left: `${menuPos.value.left}px`,
  top: `${menuPos.value.top}px`,
  '--pop-origin-y': menuPos.value.placement === 'above' ? 'bottom' : 'top',
  '--pop-from-y': menuPos.value.placement === 'above' ? '6px' : '-6px',
}))

const measureMenu = () => {
  const btn = triggerRef.value
  const menu = menuRef.value
  if (!btn) return
  const b = btn.getBoundingClientRect()
  const w = menu?.offsetWidth || 190
  const h = menu?.offsetHeight || 200
  const gap = 6
  const margin = 8
  const left = Math.min(Math.max(b.left, margin), Math.max(margin, window.innerWidth - w - margin))
  let top = b.bottom + gap
  let placement = 'below'
  if (top + h > window.innerHeight - margin) {
    top = b.top - h - gap
    placement = 'above'
  }
  menuPos.value = { left: Math.round(left), top: Math.round(top), placement }
}

/**
 * 菜单内键盘导航（WAI-ARIA menu 模式的最小实现）：
 *  - ↑/↓ 在菜单项之间移动焦点（两端循环），Home/End 跳到首/末项
 *  - Esc 由文档级 onKeydown 关闭，并把焦点还给触发按钮
 *  - Enter/Space 保持浏览器默认的「激活按钮」行为（button 自带）
 * 不接管 Tab：menu 没有模态语义，Tab 离开是合规的。
 *
 * 用 DOM 查询而不是 Set<Element> 收集：菜单项会随筛选状态 / 标签列表变化而重建，
 * Set 需要额外处理注册与注销，直接用当前 DOM 顺序最稳，也天然等于视觉顺序。
 */
const menuItemEls = () => {
  const menu = menuRef.value
  if (!menu) return []
  return [...menu.querySelectorAll('[role^="menuitem"]')].filter((el) => el.getClientRects().length)
}

const focusMenuItem = (index) => {
  const list = menuItemEls()
  if (!list.length) return
  const i = ((index % list.length) + list.length) % list.length
  list[i].focus()
}

const onMenuKeydown = (e) => {
  const list = menuItemEls()
  if (!list.length) return
  const idx = list.indexOf(document.activeElement)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    focusMenuItem(idx < 0 ? 0 : idx + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    focusMenuItem(idx < 0 ? list.length - 1 : idx - 1)
  } else if (e.key === 'Home') {
    e.preventDefault()
    focusMenuItem(0)
  } else if (e.key === 'End') {
    e.preventDefault()
    focusMenuItem(list.length - 1)
  }
}

const toggle = async () => {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    measureMenu()
    // 打开后把焦点送进第一项：键盘用户按 Enter / Space 打开也能立刻在菜单里移动
    focusMenuItem(0)
  }
}

const toggleTag = (name) => {
  const cur = selected.value
  const next = cur.includes(name) ? cur.filter(n => n !== name) : [...cur, name]
  emit('update:modelValue', next.join(','))
}

const clearAll = () => emit('update:modelValue', '')

const loadTags = async () => {
  try {
    const res = await tagsApi.getAll()
    allTags.value = res?.data?.data || []
  } catch {
    allTags.value = []
  }
}

// 点击外部 / Esc 关闭
const onDocClick = (e) => {
  if (!open.value) return
  if (triggerRef.value?.contains(e.target)) return
  if (menuRef.value?.contains(e.target)) return
  if (e.target.closest?.('[role="menu"]')) return
  open.value = false
}
const onKeydown = (e) => {
  if (e.key === 'Escape' && open.value) {
    // 捕获阶段监听 + stopPropagation：面板上的 Esc 只收筛选菜单。
    // 否则事件继续冒泡到各页 document 级 Esc 处理（等番页会把批量模式一并退出，A-27）。
    e.stopPropagation()
    open.value = false
    // 关闭后焦点归还触发按钮：否则焦点此时落在已被移除的菜单项上，会退回 body
    nextTick(() => triggerRef.value?.focus?.())
  }
}
const onResize = () => { if (open.value) measureMenu() }

onMounted(() => {
  loadTags()
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown, true)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', onResize)
})

// 其他组件新建标签后，重新打开菜单时会刷新
watch(open, (v) => { if (v) loadTags() })

defineExpose({ loadTags })
</script>

<style scoped>
.tag-filter {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}
.tag-filter-trigger.tag-filter-active {
  border-color: rgb(var(--c-primary));
  color: rgb(var(--c-primary));
  background: rgb(var(--c-primary) / 0.1);
}
.tag-filter-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 0.5rem;
  /* 视觉审计 A-15：字号从 0.6875rem(9.625px) 提到 0.75rem(10.5px，根字号 14 档)，
     与 V-13 统一后的全站徽章档一致；浅色文字用 78% 混黑的钳暗主色深端、底改淡
     （primary/0.08）—— 修复前浅色合成底上仅 1.97~3.85:1，钳暗后以同条件像素法复测。 */
  font-size: 0.75rem;
  line-height: 1.25rem;
  background: rgb(var(--c-primary) / 0.08);
  color: color-mix(in srgb, rgb(var(--c-primary-dark)) 78%, black);
  border: 1px solid rgb(var(--c-primary) / 0.3);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.tag-filter-chip:hover {
  background: rgb(var(--c-primary) / 0.2);
}
/* 深色反色（A-03）：scoped 里必须直接写 `.dark .xxx`；
   写成 `:global(.dark) .xxx` 会被本工程 Vue 编译成空选择器，规则完全不生效，
   深色下会沿用浅色的深色文字，压在深底上只剩 1.3~2.6:1。
   文字取纯白而不是 --c-primary-light：该变量只保证「压在 0.12 亮度的深色玻璃上
   4.5:1」，而 chip 自身还叠了 16% 同色底，背景会被提亮；白字在该底上实测 ~9:1，
   随机配色（wallpaper 取色）下也不会掉到 4.5 以下。 */
.dark .tag-filter-chip {
  color: #fff;
  background: rgb(var(--c-primary-light) / 0.16);
  border-color: rgb(var(--c-primary-light) / 0.45);
}
</style>
