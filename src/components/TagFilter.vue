<template>
  <div v-if="allTags.length" class="tag-filter">
    <!-- 触发按钮：显示当前筛选状态 -->
    <div class="relative inline-block">
      <button ref="triggerRef" type="button" @click="toggle"
        class="app-btn-ghost tag-filter-trigger inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition whitespace-nowrap"
        :class="{ 'tag-filter-active': selected.length > 0 }"
        :aria-expanded="open" aria-haspopup="menu"
        :aria-label="tt('tags.filterLabel')">
        <AppIcon scale="xs" name="filter" />
        <span v-if="selected.length === 0">{{ tt('tags.filter') }}</span>
        <span v-else>{{ tt('tags.filterCount', { count: selected.length }) }}</span>
        <AppIcon scale="xs" :name="open ? 'caretUp' : 'caretDown'" class="ml-0.5" />
      </button>

      <Teleport to="body">
        <div v-if="open" class="fixed inset-0 z-[100]" @click="open = false"></div>
        <transition name="pop">
          <div v-if="open" ref="menuRef" role="menu"
            class="fixed z-[110] app-menu-surface rounded-xl border border-white/40 py-1 min-w-[12rem] max-h-[60vh] overflow-y-auto"
            style="--pop-origin-y: top; --pop-from-y: -6px"
            :style="menuStyle">
            <!-- 清空筛选 -->
            <button v-if="selected.length" type="button" @click="clearAll"
              class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-gray-500 hover:bg-primary/10 transition whitespace-nowrap">
              <AppIcon scale="xs" name="undo" />{{ tt('tags.clearFilter') }}
            </button>
            <div v-if="selected.length" class="border-t border-gray-200/60 my-1"></div>

            <!-- 标签多选（OR 语义：任一命中即显示） -->
            <button v-for="tag in allTags" :key="tag.name" type="button" role="menuitemcheckbox"
              :aria-checked="selected.includes(tag.name) ? 'true' : 'false'"
              @click="toggleTag(tag.name)"
              class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition hover:bg-primary/10 whitespace-nowrap"
              :class="selected.includes(tag.name) ? 'font-semibold text-gray-800' : 'text-gray-600'">
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: tag.color || 'rgb(var(--c-primary))' }"></span>
              <span class="flex-1">{{ tag.name }}</span>
              <span :class="selected.includes(tag.name) ? 'text-primary' : 'text-gray-300'">
                <AppIcon v-if="selected.includes(tag.name)" scale="xs" name="check" />
              </span>
            </button>
          </div>
        </transition>
      </Teleport>
    </div>

    <!-- 已选标签：可快速移除 -->
    <div v-if="selected.length" class="flex items-center gap-1 flex-wrap">
      <button v-for="name in selected" :key="name" type="button"
        class="tag-filter-chip"
        :aria-label="tt('tags.removeFilterLabel', { name })"
        @click="toggleTag(name)">
        {{ name }}<AppIcon scale="xs" name="close" class="ml-0.5 opacity-70" />
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

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const { tt } = useI18n()

const allTags = ref([])
const open = ref(false)
const triggerRef = ref(null)
const menuRef = ref(null)
const menuPos = ref({ left: 0, top: 0 })

const selected = computed(() =>
  String(props.modelValue || '').split(',').map(s => s.trim()).filter(Boolean),
)

const menuStyle = computed(() => ({
  left: `${menuPos.value.left}px`,
  top: `${menuPos.value.top}px`,
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
  if (top + h > window.innerHeight - margin) top = b.top - h - gap
  menuPos.value = { left: Math.round(left), top: Math.round(top) }
}

const toggle = async () => {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    measureMenu()
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
  if (e.key === 'Escape' && open.value) open.value = false
}
const onResize = () => { if (open.value) measureMenu() }

onMounted(() => {
  loadTags()
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
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
  background: rgba(var(--c-primary), 0.1);
}
.tag-filter-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.6875rem;
  line-height: 1.25rem;
  background: rgba(var(--c-primary), 0.12);
  color: rgb(var(--c-primary-dark));
  border: 1px solid rgba(var(--c-primary), 0.3);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.tag-filter-chip:hover {
  background: rgba(var(--c-primary), 0.2);
}
:global(.dark) .tag-filter-chip {
  color: rgb(var(--c-primary-light));
  background: rgba(var(--c-primary-light), 0.16);
}
</style>
