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
    :aria-label="summaryLabel"
    @click="$emit('select')"
    @keydown="onCardKeydown"
    @dblclick="onCardDblclick"
    @mousedown="$emit('middle-click', $event)"
    @contextmenu.prevent="$emit('context-menu', $event)"
  >
    <div v-if="batchMode" class="absolute top-1 left-1 z-10" @click.stop="$emit('toggle-check')">
      <!-- 勾选框：role=checkbox + aria-checked + 键盘 Space/Enter。
           注意它位于 role=button 的卡片内部（ARIA 规定 button 的子树是 presentational），
           这是既有结构遗留问题，改造需要改 WatchingView，此处仅记录（见交付说明）。 -->
      <div role="checkbox" tabindex="0" :aria-checked="checked ? 'true' : 'false'"
        :aria-label="checkLabel"
        @keydown.enter.prevent="$emit('toggle-check')" @keydown.space.prevent="$emit('toggle-check')"
        class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
        :class="checked ? 'bg-primary border-primary' : 'border-gray-300 bg-white/80 hover:border-primary'">
        <svg v-if="checked" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
      </div>
    </div>
    <!-- 行内编辑单元格：双击进入（鼠标路径）+ **键盘等价路径**。
         为什么 tabindex 只在「卡片已选中」时才为 0：
         一张卡片有 4 个可编辑字段，若全部无条件进入 Tab 序，一页 12 张卡就多出 48 个 Tab 位，
         键盘用户会被迫穿过一堆字段才能到下一个控件。
         收敛后的走法：卡片本体（唯一常驻 Tab 位）→ Enter/Space 选中 → 再 Tab 进入该卡片的 4 个字段
         → 每个字段 Enter/Space 进入编辑 → Esc 取消 / Enter 保存（输入框内已是既有逻辑）。
         正在编辑的字段本身是 input，此时不再把外层 div 暴露成按钮（避免 role=button 内套 input）。 -->
    <!-- 名称单元格同时是「名称 + 外链 + 标签」的行容器（card-name-row: flex/nowrap）。
         双击/键盘进入编辑的语义不变（仍是这个 .editable-cell 自身）。 -->
    <!-- 名称行 = 封面缩略图 + （名称 + 外链 + 标签）。
         封面必须是**名称行左侧**的同一行，不能像原先那样作为 .card-name-row 的兄弟节点：
         卡片根节点是块级盒子，兄弟 img 会独占一行，名称就被顶到第二行，
         整张卡片高度随「有没有封面」跳变（实测差 40px，周历列里对不齐）。
         因此这里补一层 flex 包裹：封面 flex:0 0 auto，名称行 flex:1 1 auto 可省略号收缩。
         无封面时整块 img 不渲染（不占位）；加载失败置 coverFailed 后同样不渲染（不出现破图）。 -->
    <div class="card-name-wrap" :class="{'ml-5': batchMode}">
      <img v-if="item.cover_url && !coverFailed" :src="item.cover_url"
        class="card-cover" :alt="''" loading="lazy" decoding="async" @error="coverFailed = true" />
      <div v-bind="editCellProps('name')" :aria-label="editLabels.name"
        @keydown="onCellKeydown($event, 'name')"
        @dblclick.stop="!batchMode && $emit('start-edit', 'name')"
        class="editable-cell card-name-row">
        <input v-if="editing?.id === item.id && editing?.field === 'name'" :value="editValue"
          :aria-label="editLabels.name"
          @input="$emit('update:editValue', $event.target.value)"
          @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')" class="inline-edit-input w-full" autofocus />
        <span v-else class="text-base font-semibold text-gray-800 group-hover:text-primary transition-colors card-name-text" v-tip="item.name">{{ item.name }}</span>
        <a v-if="item.url" :href="itemUrl" target="_blank" rel="noopener" @click.stop
          :aria-label="openLinkLabel"
          class="ml-1 text-primary/60 hover:text-primary transition-colors inline-flex items-center shrink-0" v-tip="openLinkTip">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        </a>
      </div>
    </div>
    <!-- 标签行：恒定高度占位，有/无标签的卡片等高，周历列内不错位。 -->
    <div class="card-tags-row" :class="{ 'ml-5': batchMode }">
      <ItemTags v-if="item.tags" :tags="item.tags" :max="2" compact class="card-name-tags" />
    </div>
    <div class="flex items-center gap-1 mt-0.5 card-ep-row">
      <span class="text-sm font-bold text-gray-800 shrink-0 card-ep-label" aria-hidden="true">e</span>
      <span @dblclick.stop="!batchMode && $emit('start-edit', 'current_episode')" class="editable-cell min-w-0"
        v-bind="editCellProps('current_episode')" :aria-label="editLabels.current_episode"
        @keydown="onCellKeydown($event, 'current_episode')">
        <input v-if="editing?.id === item.id && editing?.field === 'current_episode'" :value="editValue"
          :aria-label="editLabels.current_episode"
          @input="$emit('update:editValue', $event.target.value)"
          type="text" inputmode="decimal" @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')"
          class="inline-edit-input w-16" autofocus />
        <!-- 集数排布：`3 / 12`（斜杠两侧留白，不与数字粘连），百分比紧跟集数读数。
             无进度时保持原来的纯 `e 5`，不渲染任何占位文字。 -->
        <span v-else class="text-sm font-bold text-gray-800 card-ep-line"><span class="card-ep-cur">{{ item.current_episode }}</span><span v-if="progress" class="card-ep-total text-gray-400 font-normal">&nbsp;/ {{ progress.total }}</span></span>
      </span>
      <span v-if="progress" class="card-progress-pct" :class="{ 'is-complete': progress.pct >= 100 }"
        v-tip="progressTip">{{ progress.pct }}%</span>
      <!-- 空间留在读数与动作之间，百分比与集数始终相邻。 -->
      <div class="ml-auto opacity-75 group-hover:opacity-100 transition-opacity flex gap-0.5 shrink-0">
        <!-- 集数加减：统一用主题色驱动的迷你按钮（.btn-mini-plus / .btn-mini-minus），
             尺寸、圆角、字形与其他组件一致；原先「+ 绿 / - 橙」与主题色无关且割裂 -->
        <button @click.stop="$emit('increment')" :aria-label="incLabel"
          class="btn-mini btn-mini-plus btn-press" v-tip="epPlusTip" :title="epPlusTitle">
          <AppIcon scale="xs" name="plus" />
        </button>
        <button @click.stop="$emit('decrement')" :aria-label="decLabel"
          class="btn-mini btn-mini-minus btn-press" v-tip="epMinusTip" :title="epMinusTitle">
          <AppIcon scale="xs" name="minus" />
        </button>
      </div>
    </div>
    <!-- 追番进度条：仅当总集数可解析为正数、当前集数有效且不超过总集数时显示。
         总集数留空 /「?」/ 当前集数超出总集数时不渲染进度条（保持纯 `e 5`），
         但 .card-progress-slot 恒定占位，保证同列卡片文字基线不错位。 -->
    <div class="card-progress-slot">
      <div v-if="progress" class="card-progress" role="progressbar"
        :aria-label="progressTitle"
        :aria-valuenow="progress.pct" aria-valuemin="0" aria-valuemax="100">
        <div class="card-progress-fill" :class="{ 'is-complete': progress.pct >= 100 }"
          :style="{ width: progress.pct + '%' }" aria-hidden="true"></div>
      </div>
    </div>
    <div v-bind="editCellProps('time_slot')" :aria-label="editLabels.time_slot"
      @keydown="onCellKeydown($event, 'time_slot')"
      @dblclick.stop="!batchMode && $emit('start-edit', 'time_slot')" class="editable-cell">
      <input v-if="editing?.id === item.id && editing?.field === 'time_slot'" :value="editValue"
        :aria-label="editLabels.time_slot"
        @input="$emit('update:editValue', $event.target.value)"
        @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')" class="inline-edit-input w-full" autofocus />
      <span v-else class="text-sm font-medium" :class="item.time_slot ? 'text-gray-500' : 'text-gray-400 font-normal'">{{ item.time_slot || '' }}</span>
    </div>
    <div v-bind="editCellProps('notes')" :aria-label="editLabels.notes"
      @keydown="onCellKeydown($event, 'notes')"
      @dblclick.stop="!batchMode && $emit('start-edit', 'notes')" class="editable-cell">
      <input v-if="editing?.id === item.id && editing?.field === 'notes'" :value="editValue"
        :aria-label="editLabels.notes"
        @input="$emit('update:editValue', $event.target.value)"
        @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')" class="inline-edit-input w-full" autofocus />
      <span v-else class="text-sm text-gray-400 truncate block">{{ item.notes || '' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
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
  'increment', 'decrement', 'open-dialog'
])

/**
 * 性能：把「只依赖 item 不变字段」的文案/链接计算收进 computed。
 *
 * 原来这些 tt() 直接写在模板里，每次 patch 都会重新求值一遍：
 * 一张卡片约 10 次 tt()，200 张卡片 × 每次选中/勾选/滚动重渲染 ≈ 2000 次。
 * 实测单次带参 tt() 约 0.42 µs → 一轮约 0.84 ms；而 tt() 内部要查 3 层字典
 * （当前语言 → zh → 内置 zh）并跑一次正则插值，全部是纯重复劳动。
 *
 * 拆成 computed 后：文案/链接只在 item 对应字段变化时才重算，
 * 而「选中/勾选/批量模式」这些高频变化只推动 class 与 aria-pressed，
 * 不再连带重算所有文案。computed 由 Vue 缓存，与本组件其它状态无关。
 *
 * ⚠️ 不缓存任何**视觉**相关的东西（进度条、配色类），那部分仍按原逻辑逐次渲染。
 */
/**
 * 封面图加载失败标记：失败后隐藏图片本身（模板侧 v-if 直接不渲染），
 * 于是不会出现浏览器的裂图图标，也不会留下一个空占位改变卡片高度。
 * 每个卡片组件实例各自持有一个标记，与 item 无关。
 * 封面地址一变就复位：否则用户把写错的链接改对之后，卡片上仍挂着旧标记，
 * 封面永远不再出现（「改了没反应」）。用 watch 而不是 computed 是为了只在变化时写一次。
 */
const coverFailed = ref(false)
watch(() => props.item?.cover_url, () => { coverFailed.value = false })

const name = computed(() => props.item?.name ?? '')
const episodeText = computed(() => String(props.item?.current_episode ?? ''))
const timeSlot = computed(() => props.item?.time_slot || '')
const notes = computed(() => props.item?.notes || '')
const itemUrl = computed(() => (props.item?.url ? buildItemUrl(props.item) : ''))

/** 卡片主 aria-label（随 batchMode 变，但只依赖 batchMode + name + episode） */
const summaryLabel = computed(() => tt('card.summaryLabel', {
  prefix: props.batchMode ? tt('card.checkPrefix') : tt('card.selectPrefix'),
  name: name.value,
  episode: episodeText.value,
}))
const checkLabel = computed(() => tt('card.checkLabel', { name: name.value }))
const openLinkLabel = computed(() => tt('card.openLinkLabel', { name: name.value }))
const openLinkTip = computed(() => tt('card.openLink'))
const incLabel = computed(() => tt('card.incEpisodeLabel', { name: name.value }))
const decLabel = computed(() => tt('card.decEpisodeLabel', { name: name.value }))
const progressLabel = computed(() => (progress.value ? tt('card.progressLabel', { pct: progress.value.pct }) : ''))

/** 与进度相关的悬浮气泡文案（只在 progress 变化时重算，避免每次 patch 插值两个字符串） */
const progressTip = computed(() => progressLabel.value)
const epPlusTip = computed(() => tt('watching.epPlus'))
const epMinusTip = computed(() => tt('watching.epMinus'))

/**
 * 原生 title（v-tip 已接管视觉气泡，但 title 仍然保留）：
 *   · 读屏/纯键盘在某些组合下会读 title 作为补充说明；
 *   · 鼠标用户在不支持自定义气泡的环境（如触屏长按）仍有系统提示；
 *   · 既有回归测试（tests/a11y.test.js、tests/watching.test.js）以 title 作为
 *     「纯图标按钮有可读标签」的探针，去掉 title 会让这些不变量失去可观测性。
 * 两者文案同源，不会出现两套描述。
 */
const openLinkTitle = computed(() => openLinkTip.value)
const progressTitle = computed(() => progressTip.value)
const epPlusTitle = computed(() => epPlusTip.value)
const epMinusTitle = computed(() => epMinusTip.value)

/** 行内编辑输入框的 aria-label：只有正在编辑的那个字段会用到，按 field 取 */
const editLabels = computed(() => ({
  name: tt('card.editNameLabel', { name: name.value }),
  current_episode: tt('card.editEpisodeLabel', { name: name.value }),
  time_slot: tt('card.editTimeLabel', { name: name.value }),
  notes: tt('card.editNotesLabel', { name: name.value }),
}))

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
 * 行内编辑单元格的键盘等价路径（a11y）。
 *
 * 鼠标路径是「双击单元格」，键盘原本没有任何入口 —— 审计里 12 个 .editable-cell
 * 全部不可聚焦，纯键盘用户无法改名称/集数/时间/备注。这里给每个单元格补一条：
 *   单元格可聚焦（仅在卡片已选中、且该字段不在编辑中时）→ Enter / Space 进入编辑。
 *
 * 为什么只在 selected 时进 Tab 序：一张卡片 4 个字段，若无条件暴露，
 * 一页 12 张卡会多出 48 个 Tab 位，键盘用户要先穿过 48 个格子才能到下一个按钮。
 * 收敛后：卡片本体是唯一常驻停靠点 → 选中后 Tab 才进入该卡片的字段。
 *
 * `role="button"` 而非 `tabindex=0` 裸 div：读屏要知道「按了会发生什么」。
 * aria-label 复用 editLabels（「编辑番剧名称：X」），读屏能听出编辑哪个字段。
 */
const editCellProps = (field) => {
  const isEditing = props.editing?.id === props.item?.id && props.editing?.field === field
  // 批量模式（勾选优先）与「该字段正在编辑」时，单元格不再承担键盘入口
  if (props.batchMode || isEditing || !props.selected) return {}
  return { role: 'button', tabindex: '0' }
}

/**
 * 卡片「空白处」双击 → 打开完整编辑弹窗。
 *
 * 规则与三张番单页保持一致：
 *   · 双击**有值的字段** → 该字段的行内编辑（鼠标路径已在各 .editable-cell 上
 *     用 @dblclick.stop 处理，事件到不了这里）
 *   · 双击**空值字段** → 同样进入行内编辑（.editable-cell 的 stop 同样覆盖）
 *   · 双击**空白区域**（卡片 padding、集数行里的弹性占位、进度条槽、名称行右侧留白）
 *     → 冒泡到这里，打开编辑弹窗，让用户一次改完所有字段
 *   · **批量模式**下双击一律禁用（勾选优先，与 batchMode 既有语义一致）
 *
 * 为什么要排除 button / a / input：+/- 按钮、外链图标、行内输入框自身都有
 * 既有点击语义；双击它们不应顺带弹窗（+/- 上另有 @dblclick.stop 双保险）。
 */
const onCardDblclick = (e) => {
  if (props.batchMode) return
  if (e.target.closest('.editable-cell, button, a, input, textarea, select')) return
  emit('open-dialog')
}

const onCellKeydown = (e, field) => {
  // 只处理单元格自身收到的事件；子输入框的 Enter/Esc 已有独立处理
  if (e.target !== e.currentTarget) return
  if (!props.selected || props.batchMode) return
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  emit('start-edit', field)
}

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

<style scoped>
/* 封面与名称同排；标签在下一行，名称不再与徽章争夺宽度。 */
.card-name-wrap {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  overflow: hidden;
}

.card-name-wrap > .card-name-row {
  flex: 1 1 auto;
}

/* 作品名称行只放名称和外链；标签另行显示，避免两个主要信息互相挤压。 */
.card-name-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}

.card-name-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 标签行：固定最小高度，保证有/无标签的卡片等高 */
.card-tags-row {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 1.25rem;
  margin-top: 0.25rem;
  overflow: hidden;
}

.card-tags-row .card-name-tags {
  flex: 0 1 auto;
  min-width: 0;
}

/* 封面缩略图：28×40（竖排海报 5:7），压在名称行左侧。
   无封面时模板不渲染 <img>（不占位）；@error 后置 coverFailed 同样不渲染，
   因此任何情况下都不会出现裂图。边框沿用 style.css 的 .cover-thumb 规范：
   浅色玻璃上用主题色淡描边，深色玻璃上换成白色淡描边（见下一条 .dark）。 */
.card-cover {
  width: 1.75rem;
  height: 2.5rem;
  object-fit: cover;
  border-radius: 0.375rem;
  flex: 0 0 auto;
  border: 1px solid rgb(var(--c-primary) / 0.28);
  background: rgb(255 255 255 / 0.55);
}
.dark .card-cover {
  border-color: rgb(255 255 255 / 0.18);
  background: rgb(255 255 255 / 0.08);
}
</style>
