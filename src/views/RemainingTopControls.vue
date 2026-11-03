<template>
  <!-- 等番页顶栏内容控件（视觉审计 A-01：原第一卡的搜索 + 标签筛选迁入顶栏）。

       为什么只是个壳：搜索词/标签筛选的状态与过滤逻辑全部留在 RemainingView，
       这里经 v-model 同构的 props/事件 与 view 通信 —— 与 pageActions「view 写数据、
       顶栏渲染」同一个心智。 -->
  <div class="topbar-page-controls flex items-center gap-3 min-w-0">
    <TopbarSearchBox :model-value="search" :placeholder="tt('remaining.searchPlaceholder')"
      @update:model-value="emit('update:search', $event)" />
    <TagFilter :model-value="tagFilter" @update:model-value="emit('update:tagFilter', $event)" />
  </div>
</template>

<script setup>
/**
 * 等番页顶栏控件（pageControls 项）。
 *
 * props/事件与 v-model 同构：view 里
 *   setPageControls('/remaining', [{ key: 'remaining-controls', component: RemainingTopControls, props: {...} }])
 * props 携带当前值 + onUpdate 处理器，h() 渲染时即等价于 v-model。
 */
import TopbarSearchBox from './TopbarSearchBox.vue'
import TagFilter from '../components/TagFilter.vue'
import { useI18n } from '../composables/useI18n'

defineProps({
  /** 搜索词（view 的 searchQuery） */
  search: { type: String, default: '' },
  /** 标签筛选，逗号分隔（view 的 tagFilter） */
  tagFilter: { type: String, default: '' },
})
const emit = defineEmits(['update:search', 'update:tagFilter'])

const { tt } = useI18n()
</script>
