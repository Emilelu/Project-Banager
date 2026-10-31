<template>
  <div
    class="watching-card px-3 py-2.5 border-b border-white/10 cursor-pointer transition-all duration-200 group relative"
    :class="[
      batchMode && checked
        ? 'bg-danger/10 border-l-3 border-l-danger'
        : selected
          ? 'bg-primary/15 border-l-3 border-l-primary'
          : 'hover:bg-primary/5'
    ]"
    role="button" tabindex="0"
    :aria-pressed="batchMode ? (checked ? 'true' : 'false') : (selected ? 'true' : 'false')"
    :aria-label="tt('card.summaryLabel', { prefix: batchMode ? tt('card.checkPrefix') : tt('card.selectPrefix'), name: item.name, episode: item.current_episode })"
    @click="$emit('select')"
    @keydown="onCardKeydown"
    @mousedown="$emit('middle-click', $event)"
    @contextmenu.prevent="$emit('context-menu', $event)"
  >
    <div v-if="batchMode" class="absolute top-1 left-1 z-10" @click.stop="$emit('toggle-check')">
      <div role="checkbox" tabindex="0" :aria-checked="checked ? 'true' : 'false'"
        :aria-label="tt('card.checkLabel', { name: item.name })"
        @keydown.enter.prevent="$emit('toggle-check')" @keydown.space.prevent="$emit('toggle-check')"
        class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
        :class="checked ? 'bg-primary border-primary' : 'border-gray-300 bg-white/80 hover:border-primary'">
        <svg v-if="checked" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
      </div>
    </div>
    <div @dblclick.stop="!batchMode && $emit('start-edit', 'name')" class="editable-cell" :class="{'ml-5': batchMode}">
      <input v-if="editing?.id === item.id && editing?.field === 'name'" :value="editValue"
        :aria-label="tt('card.editNameLabel', { name: item.name })"
        @input="$emit('update:editValue', $event.target.value)"
        @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')" class="inline-edit-input w-full" autofocus />
      <span v-else class="text-base font-semibold text-gray-800 group-hover:text-primary transition-colors">{{ item.name }}</span>
      <a v-if="item.url" :href="buildItemUrl(item)" target="_blank" rel="noopener" @click.stop
        :aria-label="tt('card.openLinkLabel', { name: item.name })"
        class="ml-1 text-primary/60 hover:text-primary transition-colors inline-flex items-center" :title="tt('card.openLink')">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
      </a>
    </div>
    <div class="flex items-center gap-1 mt-0.5">
      <span class="text-sm font-bold text-gray-800 shrink-0" aria-hidden="true">e</span>
      <span @dblclick.stop="!batchMode && $emit('start-edit', 'current_episode')" class="editable-cell min-w-0">
        <input v-if="editing?.id === item.id && editing?.field === 'current_episode'" :value="editValue"
          :aria-label="tt('card.editEpisodeLabel', { name: item.name })"
          @input="$emit('update:editValue', $event.target.value)"
          type="text" inputmode="decimal" @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')"
          class="inline-edit-input w-16" autofocus />
        <!-- 集数排布：`3 / 12`（斜杠两侧留白，不与数字粘连），百分比独立右对齐到行末。
             无进度时保持原来的纯 `e 5`，不渲染任何占位文字。 -->
        <span v-else class="text-sm font-bold text-gray-800 card-ep-line">{{ item.current_episode }}<span v-if="progress" class="text-gray-400 font-normal"> / {{ progress.total }}</span></span>
      </span>
      <!-- 用弹性占位把百分比推到行末（+/- 按钮之左）；无进度时占位仍撑开，
           按钮位置与原来一致，因此有/无进度的卡片行内元素不跳动 -->
      <span class="flex-1 min-w-0" aria-hidden="true"></span>
      <span v-if="progress" class="card-progress-pct" :class="{ 'is-complete': progress.pct >= 100 }"
        :title="tt('card.progressLabel', { pct: progress.pct })">{{ progress.pct }}%</span>
      <div class="opacity-75 group-hover:opacity-100 transition-opacity flex gap-0.5 shrink-0">
        <!-- 集数加减：统一用主题色驱动的迷你按钮（.btn-mini-plus / .btn-mini-minus），
             尺寸、圆角、字形与其他组件一致；原先「+ 绿 / - 橙」与主题色无关且割裂 -->
        <button @click.stop="$emit('increment')" :aria-label="tt('card.incEpisodeLabel', { name: item.name })"
          class="btn-mini btn-mini-plus btn-press" :title="tt('watching.epPlus')">
          <AppIcon scale="xs" name="plus" />
        </button>
        <button @click.stop="$emit('decrement')" :aria-label="tt('card.decEpisodeLabel', { name: item.name })"
          class="btn-mini btn-mini-minus btn-press" :title="tt('watching.epMinus')">
          <AppIcon scale="xs" name="minus" />
        </button>
      </div>
    </div>
    <!-- 追番进度条：仅当总集数可解析为正数、当前集数有效且不超过总集数时显示。
         总集数留空 /「?」/ 当前集数超出总集数时不渲染进度条（保持纯 `e 5`），
         但 .card-progress-slot 恒定占位，保证同列卡片文字基线不错位。 -->
    <div class="card-progress-slot">
      <div v-if="progress" class="card-progress" role="progressbar"
        :aria-label="tt('card.progressLabel', { pct: progress.pct })"
        :aria-valuenow="progress.pct" aria-valuemin="0" aria-valuemax="100">
        <div class="card-progress-fill" :class="{ 'is-complete': progress.pct >= 100 }"
          :style="{ width: progress.pct + '%' }" aria-hidden="true"></div>
      </div>
    </div>
    <div @dblclick.stop="!batchMode && $emit('start-edit', 'time_slot')" class="editable-cell">
      <input v-if="editing?.id === item.id && editing?.field === 'time_slot'" :value="editValue"
        :aria-label="tt('card.editTimeLabel', { name: item.name })"
        @input="$emit('update:editValue', $event.target.value)"
        @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')" class="inline-edit-input w-full" autofocus />
      <span v-else class="text-sm font-medium" :class="item.time_slot ? 'text-gray-500' : 'text-gray-400 font-normal'">{{ item.time_slot || '' }}</span>
    </div>
    <div @dblclick.stop="!batchMode && $emit('start-edit', 'notes')" class="editable-cell">
      <input v-if="editing?.id === item.id && editing?.field === 'notes'" :value="editValue"
        :aria-label="tt('card.editNotesLabel', { name: item.name })"
        @input="$emit('update:editValue', $event.target.value)"
        @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')" class="inline-edit-input w-full" autofocus />
      <span v-else class="text-sm text-gray-400 truncate block">{{ item.notes || '' }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { buildItemUrl } from '../composables/useEpisode'
import { useI18n } from '../composables/useI18n'

const { tt } = useI18n()

const props = defineProps({
  item: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  batchMode: { type: Boolean, default: false },
  checked: { type: Boolean, default: false },
  editing: { type: Object, default: null },
  editValue: { type: String, default: '' }
})

const emit = defineEmits([
  'select', 'toggle-check', 'context-menu', 'middle-click',
  'start-edit', 'save-edit', 'cancel-edit', 'update:editValue',
  'increment', 'decrement'
])

/**
 * 追番进度：current_episode / total_episodes。
 *
 * 返回 null 的情形（模板据此隐藏进度条，绝不显示 0/0 或假百分比）：
 *   · 总集数未填、非数字、≤0（例如「?」「12+」这类不确定写法）
 *   · 当前集数非数字
 *   · 当前集数 > 总集数（数据没录准，画进度条只会误导，故整条不显示）
 * 百分比夹在 0..100，避免任何情况下填充条溢出轨道。
 */
const progress = computed(() => {
  const cur = Number.parseFloat(String(props.item?.current_episode ?? '').replace(/[^\d.]/g, ''))
  const total = Number.parseFloat(String(props.item?.total_episodes ?? '').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(cur) || !Number.isFinite(total) || total <= 0) return null
  if (cur > total) return null
  const pct = Math.max(0, Math.min(100, Math.round((cur / total) * 100)))
  return { cur, total, pct }
})

/**
 * 卡片本体承载「选中 / 批量勾选」，但卡片内有行内编辑输入框与 +/- 按钮。
 * 只在事件源是卡片自身时才响应 Enter / Space，避免：
 *   · 在名称输入框里打空格被卡片拦掉（preventDefault）
 *   · 输入框回车保存又顺带切换选中
 * 同时阻止 Space 的页面滚动。
 */
const onCardKeydown = (e) => {
  if (e.target !== e.currentTarget) return
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  emit('select')
}
</script>
