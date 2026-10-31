<template>
  <div class="tag-selector">
    <!-- 已选标签：可点击移除 -->
    <div v-if="selected.length" class="flex items-center gap-1.5 flex-wrap mb-2">
      <button v-for="tag in selected" :key="tag.name" type="button"
        class="tag-chip tag-chip-on"
        :style="{ '--tag-color': tag.color || 'rgb(var(--c-primary))' }"
        :aria-label="tt('tags.removeLabel', { name: tagLabel(tag, tt) })"
        @click="removeTag(tag.name)">
        {{ tagLabel(tag, tt) }}<AppIcon scale="xs" name="close" class="ml-0.5 opacity-70" />
      </button>
    </div>

    <!-- 可选标签：内置 + 自定义 -->
    <div class="flex items-center gap-1.5 flex-wrap">
      <button v-for="tag in available" :key="tag.name" type="button"
        class="tag-chip tag-chip-off"
        :style="{ '--tag-color': tag.color || 'rgb(var(--c-primary))' }"
        @click="addTag(tag.name)">
        {{ tagLabel(tag, tt) }}
      </button>

      <!-- 新建标签：内联输入，回车即建 -->
      <button v-if="!creating" type="button" @click="creating = true"
        class="tag-chip tag-chip-add" v-tip="tt('tags.addNew')">
        <AppIcon scale="xs" name="plus" />{{ tt('tags.addShort') }}
      </button>
      <input v-else ref="newTagInput" v-model="newTagName" type="text"
        :placeholder="tt('tags.namePlaceholder')"
        maxlength="20"
        class="w-24 px-2 py-1 rounded-lg border border-primary/30 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
        @keyup.enter="createTag" @keyup.esc="cancelCreate" @blur="onBlur" />
    </div>

    <p v-if="hint" class="text-[0.6875rem] text-gray-400 mt-1.5">{{ hint }}</p>
  </div>
</template>

<script setup>
/**
 * 标签选择器 —— 三个页面（追番/等番/已看）的弹窗共用。
 *
 * 设计：
 *  - 值用 `v-model` 双向绑定**逗号分隔的标签名字符串**，与数据库存储格式一致；
 *  - 已选标签在下方以高亮 chip 展示，可点击移除；
 *  - 未选标签以淡色 chip 展示，可点击加入；
 *  - 支持内联新建标签（回车提交），新标签同时写入 tags 表，供其它条目复用。
 *
 * 为什么用标签名而非 id 作为存储值：
 * 数据库里三张表的 tags 字段是文本，导出到 Excel/CSV 时可直接读；
 * 代价是改名要同步更新条目（已在 updateTag 里处理）。
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { tagsApi } from '../db/api'
import { useI18n } from '../composables/useI18n'
import { useErrorText } from '../composables/useErrorText'
import { useTagLabel } from '../composables/useTagLabel'
import { showToast } from '../composables/useToast'

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const { tt } = useI18n()
const { errorText } = useErrorText()
const { tagLabel } = useTagLabel()

const allTags = ref([])       // 全部标签（含内置与自定义）
const creating = ref(false)
const newTagName = ref('')
const newTagInput = ref(null)
const hint = ref('')

// 当前选中：把字符串解析成标签对象（找不到的标签名也保留，避免丢失数据）
const selected = computed(() => {
  const names = String(props.modelValue || '').split(',').map(s => s.trim()).filter(Boolean)
  return names.map(name => allTags.value.find(t => t.name === name) || { name, color: '' })
})

// 可选：全部标签中排除已选
const available = computed(() => {
  const picked = new Set(selected.value.map(t => t.name))
  return allTags.value.filter(t => !picked.has(t.name))
})

const loadTags = async () => {
  try {
    const res = await tagsApi.getAll()
    allTags.value = res?.data?.data || []
  } catch {
    allTags.value = []
  }
}

const emitNames = (names) => {
  emit('update:modelValue', names.join(','))
}

const addTag = (name) => {
  const names = selected.value.map(t => t.name)
  if (!names.includes(name)) emitNames([...names, name])
}

const removeTag = (name) => {
  emitNames(selected.value.map(t => t.name).filter(n => n !== name))
}

const startCreate = async () => {
  creating.value = true
  await nextTick()
  newTagInput.value?.focus()
}

const cancelCreate = () => {
  creating.value = false
  newTagName.value = ''
  hint.value = ''
}

const createTag = async () => {
  const name = newTagName.value.trim()
  if (!name) { cancelCreate(); return }
  // 已存在则直接选中，不重复创建
  const existing = allTags.value.find(t => t.name === name)
  if (existing) {
    addTag(existing.name)
    cancelCreate()
    return
  }
  try {
    const res = await tagsApi.add(name)
    if (res?.data?.success) {
      await loadTags()
      addTag(name)
      cancelCreate()
      hint.value = ''
    } else {
      hint.value = errorText(res?.data, tt, 'tags.createFailed')
    }
  } catch (e) {
    hint.value = e?.message || tt('tags.createFailed')
  }
}

// 失焦时若已有内容则提交，否则取消（避免用户点了别处丢输入）
const onBlur = () => {
  if (newTagName.value.trim()) createTag()
  else cancelCreate()
}

onMounted(loadTags)

// 外部数据变化（如切换编辑对象）时刷新可选列表
watch(() => props.modelValue, () => { hint.value = '' })

defineExpose({ loadTags, startCreate })
</script>

<style scoped>
.tag-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.6875rem;
  line-height: 1.25rem;
  transition: all 0.15s ease;
  white-space: nowrap;
  cursor: pointer;
}

/* 已选：实色底 + 白字，颜色取标签自身的 color */
.tag-chip-on {
  background: var(--tag-color);
  color: #fff;
  border: 1px solid var(--tag-color);
}
.tag-chip-on:hover {
  filter: brightness(1.1);
}

/* 未选：淡色底 + **同色但显著压暗**的文字。
   为什么不直接 `color: var(--tag-color)`：标签色是 500 级高饱和色
   （#EF4444 / #10B981 / #EC4899 / #8B5CF6…），压在「12% 同色淡底 + 白色玻璃」上
   实测约 2.5:1，远低于正文 4.5:1。
   与黑色的混合比例是**按最差色相反推**的：只混 72% 时紫/青/灰几档仍只有 3.3~4.1:1
   （实测 日常 3.8 / 科幻 4.07 / 搞笑 3.35 / 治愈 3.74），压到 55% 后全部 ≥4.6:1。
   代价是颜色更沉，但保留了色相区分度，且「已选/未选」仍靠底色的有无来区分。
   深色模式在下方另有规则反转为亮阶。 */
.tag-chip-off {
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  color: color-mix(in srgb, var(--tag-color) 55%, black);
  border: 1px solid color-mix(in srgb, var(--tag-color) 30%, transparent);
}
.tag-chip-off:hover {
  background: color-mix(in srgb, var(--tag-color) 20%, transparent);
}

/* 新建：虚线描边，与普通标签区分 */
.tag-chip-add {
  background: transparent;
  color: rgb(var(--c-primary));
  border: 1px dashed rgb(var(--c-primary) / 0.45);
}
.tag-chip-add:hover {
  background: rgb(var(--c-primary) / 0.08);
}

/* 深色模式下未选标签：淡底提亮（否则看不见），文字同步反转为亮阶，
   避免沿用浅色模式的深阶字压在深紫卡片上（深字压深底同样不可读）。 */
:global(.dark) .tag-chip-off {
  background: color-mix(in srgb, var(--tag-color) 22%, transparent);
  color: color-mix(in srgb, var(--tag-color) 55%, white);
}
</style>
