<template>
  <div class="space-y-5">
    <!-- 新建标签 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
      <div class="flex items-center gap-2 mb-3">
        <AppIcon scale="md" name="plus" class="text-primary" />
        <h3 class="text-base font-bold gradient-text">{{ tt('tags.createNew') }}</h3>
      </div>
      <div class="flex items-center gap-2 flex-wrap min-h-[3.25rem]">
        <input v-model="newName" type="text" :placeholder="tt('tags.namePlaceholder')" maxlength="20"
          class="tag-input flex-1 min-w-[10rem] px-3 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80"
          @keyup.enter="createTag" />
        <ColorPicker :value="newColor" size="2.5rem" :aria-label="tt('tags.color')" :tip="tt('tags.color')" @input="newColor = $event" />
        <button @click="createTag" :disabled="!newName.trim()"
          class="btn-base btn-primary shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
          <AppIcon scale="sm" name="plus" />{{ tt('tags.addShort') }}
        </button>
      </div>
      <p v-if="error" class="tag-error text-xs text-danger mt-2">{{ error }}</p>
    </div>

    <!-- 标签列表 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div class="flex items-center gap-2 mb-3">
          <AppIcon scale="md" name="bookmark" class="text-primary" />
          <!-- 与其它页的 tooltip 标题保持同一几何：inline-flex + gap-1，
               让 info 图标与文字之间有 3.5px 间隙（原 block 布局下图标紧贴文字）。 -->
          <h3 class="text-base font-bold gradient-text cursor-help inline-flex items-center gap-1"
            v-tip="tt('tags.builtinHint')">{{ tt('tags.manageTitle') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></h3>
          <!-- 计数已上提到顶栏（与另外三页规范一致） -->
        </div>
      </div>

      <p v-if="tags.length === 0" class="tag-meta text-sm text-gray-400 text-center py-10">{{ tt('tags.empty') }}</p>
      <div v-else class="grid gap-2 sm:grid-cols-2">
        <div v-for="tag in tags" :key="tag.id"
          class="tag-row flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/50 border border-primary/10"
            @dblclick="onRowDblclick($event, tag)"
            @contextmenu.prevent="onRowContextMenu($event, tag)">
        <!-- 颜色块（点击改色） -->
          <ColorPicker :value="tag.color" size="1.5rem" :aria-label="tt('tags.color')" @input="updateColor(tag, $event)" />

          <!-- 名称（点击进入行内编辑） -->
          <template v-if="editingId === tag.id">
            <input ref="editInput" v-model="editName" type="text" maxlength="20"
              class="tag-input flex-1 min-w-0 px-2 py-1 border border-primary/30 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
              @keyup.enter="saveRename(tag)" @keyup.esc="cancelRename" @blur="saveRename(tag)" />
          </template>
          <template v-else>
            <span class="tag-name flex-1 text-sm text-gray-700 truncate">{{ tagLabel(tag, tt) }}</span>
            <span v-if="tag.is_builtin" class="tag-badge text-xs text-gray-400 shrink-0">{{ tt('tags.builtin') }}</span>
          </template>

          <!-- 鎿嶄綔 -->
          <button v-if="editingId !== tag.id" @click="startRename(tag)" v-tip="tt('tags.rename')"
            class="tag-action w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10 transition btn-press">
            <AppIcon scale="xs" name="edit" />
          </button>
          <button v-if="editingId !== tag.id && !tag.is_builtin" @click="removeTag(tag)" v-tip="tt('tags.delete')"
            class="tag-action w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-danger hover:bg-danger/10 transition btn-press">
            <AppIcon scale="xs" name="trash" />
          </button>
          <button v-if="editingId === tag.id" @click="cancelRename" v-tip="tt('common.cancel')"
            class="tag-action w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 transition btn-press">
            <AppIcon scale="xs" name="close" />
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
/**
 * 标签管理页（原为弹窗，按要求移入侧边导航）。
 *
 * 与弹窗版的差异：
 *  - 布局从单列改为两列网格，宽屏下一屏能看完更多标签；
 *  - 顶部独立「新建」卡片，操作区域更舒展；
 *  - 不再需要 Teleport / 焦点陷阱，作为普通页面由路由承载。
 */
import { ref, nextTick, onMounted, watch } from 'vue'
import { tagsApi } from '../db/api'
import { useI18n } from '../composables/useI18n'
import { setPageStats, clearPageStats } from '../composables/usePageStats'
import { useErrorText } from '../composables/useErrorText'
import { useTagLabel } from '../composables/useTagLabel'
import { showToast } from '../composables/useToast'

const { tt } = useI18n()
const { errorText } = useErrorText()
const { tagLabel } = useTagLabel()

const tags = ref([])

/** 标签计数同步到顶栏（用户要求：计数统一放页面标题旁，不占卡片内一行） */
watch(
  () => tags.value.length,
  (n) => setPageStats('/tags', [{ text: tt('tags.totalCount', { count: n }), tone: 'neutral' }]),
  { immediate: true },
)

const newName = ref('')
const newColor = ref('#7C3AED')
const error = ref('')

const editingId = ref(null)
const editName = ref('')
const editInput = ref(null)

const load = async () => {
  try {
    const res = await tagsApi.getAll()
    tags.value = res?.data?.data || []
  } catch {
    tags.value = []
  }
}

onMounted(load)

const createTag = async () => {
  const name = newName.value.trim()
  if (!name) return
  error.value = ''
  try {
    const res = await tagsApi.add(name, newColor.value)
    if (res?.data?.success) {
      newName.value = ''
      await load()
      showToast(tt('tags.created', { name }))
    } else {
      error.value = errorText(res?.data, tt, 'tags.createFailed')
    }
  } catch (e) {
    error.value = e?.message || tt('tags.createFailed')
  }
}

/**
 * 双击 / 右键标签行 → 直接进入改名。
 *
 * 为什么要判断 target：颜色块（ColorPicker）和右侧操作按钮自己有交互，
 * 双击/右键它们不应触发改名。用 closest 检测这几类容器即可。
 */
const isTagRowControl = (e) =>
  !!e.target?.closest?.('.tag-action, .color-picker-wrapper, input, button, a')

const onRowDblclick = (e, tag) => {
  if (isTagRowControl(e)) return
  if (editingId.value === tag.id) return
  startRename(tag)
}

const onRowContextMenu = (e, tag) => {
  if (isTagRowControl(e)) return
  if (editingId.value === tag.id) return
  startRename(tag)
}

const startRename = async (tag) => {
  editingId.value = tag.id
  editName.value = tag.name
  await nextTick()
  const el = Array.isArray(editInput.value) ? editInput.value[0] : editInput.value
  el?.focus?.()
}

const cancelRename = () => {
  editingId.value = null
  editName.value = ''
}

const saveRename = async (tag) => {
  const name = editName.value.trim()
  if (!name || name === tag.name) { cancelRename(); return }
  try {
    const res = await tagsApi.update(tag.id, { name })
    if (res?.data?.success) {
      cancelRename()
      await load()
      showToast(tt('tags.renamed'))
    } else {
      showToast(errorText(res?.data, tt, 'tags.renameFailed'), 'error')
    }
  } catch (e) {
    showToast(e?.message || tt('tags.renameFailed'), 'error')
  }
}

const updateColor = async (tag, color) => {
  try {
    const res = await tagsApi.update(tag.id, { color })
    if (res?.data?.success) {
      const item = tags.value.find(t => t.id === tag.id)
      if (item) item.color = color
    }
  } catch { /* 改色失败静默，不影响主流程 */ }
}

const removeTag = async (tag) => {
  try {
    const res = await tagsApi.delete(tag.id)
    if (res?.data?.success) {
      await load()
      showToast(tt('tags.deleted', { name: tag.name }))
    } else {
      showToast(errorText(res?.data, tt, 'tags.deleteFailed'), 'error')
    }
  } catch (e) {
    showToast(e?.message || tt('tags.deleteFailed'), 'error')
  }
}

watch(() => tags.value.length, () => { error.value = '' })
</script>

<style scoped>
/*
/*
 * 深色模式下的材质与文字色。
 *
 * 为什么不用 Tailwind 的 dark: 前缀：本项目深色模式是 body/html 上的 .dark 类
 * + style.css 里成组的 `.dark .xxx` 覆盖规则（见「暗色模式」区段），没有配置
 * darkMode: 'class' 的 dark: 变体，所以这里沿用同一套机制：直接写 `.dark .xxx`；
 * 用 scoped 的 data-v 属性把作用域限制在本页，不会外溢到别的页面。
 *
 * 为什么必须覆盖 bg-white/50：style.css 的深色区段只给 bg-white/20、/30、/40
 * 写了反转规则，没有 /50、/70、/80。于是这些半透明白在深色模式下仍是
 * 「浅底」，而文字被 `.dark .text-gray-700` 统一改成浅灰 → 浅底浅字，几乎读不出来。
 * 这里把本页用到的每一处都补成深色材质，浅色模式一律不动。
 */
.dark .tag-row {
  background: rgba(255, 255, 255, 0.06) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

  /* 标签名：正文，目标 ≥4.5:1 */
.dark .tag-name {
  color: #e2e8f0 !important;
}

  /* 「内置」标记：0.75rem 小字，同样按 4.5:1 要求（不用更暗的灰） */
.dark .tag-badge {
  color: #cbd5e1 !important;
}

  /* 计数 / 空状态 / 底部说明：次级文字，小字按 4.5:1 */
.dark .tag-meta {
  color: #a9b6cc !important;
}

  /* 行内图标按钮：默认态在深色下提亮，hover 仍走原有的主色/危险色 */
.dark .tag-action {
  color: #9aa8c0 !important;
}
.dark .tag-action:hover {
  color: rgb(var(--c-primary-light)) !important;
}

  /* 新建 / 行内编辑输入框：深色半透明底 + 浅色字（覆盖 bg-white/80 的白底） */
.dark .tag-input {
  background: rgba(20, 15, 40, 0.55) !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
  color: #e2e8f0 !important;
}

  /* 新建失败提示：danger 原色在深色底上偏暗，提亮到 400 档 */
.dark .tag-error {
  color: #fca5a5 !important;
}
</style>

