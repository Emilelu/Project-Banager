<template>
  <div class="space-y-5">
    <!-- 新建标签 -->
    <div class="page-card px-5 py-4">
      <div class="flex items-center gap-2 mb-3">
        <AppIcon scale="md" name="plus" class="text-primary" />
        <h3 class="text-base font-bold gradient-text">{{ tt('tags.createNew') }}</h3>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <input v-model="newName" type="text" :placeholder="tt('tags.namePlaceholder')" maxlength="20"
          class="flex-1 min-w-[10rem] px-3 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80"
          @keyup.enter="createTag" />
        <input v-model="newColor" type="color"
          class="w-10 h-10 shrink-0 rounded-xl cursor-pointer border border-primary/20 bg-transparent p-0.5"
          :title="tt('tags.color')" />
        <button @click="createTag" :disabled="!newName.trim()"
          class="btn-base btn-primary shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
          <AppIcon scale="sm" name="plus" />{{ tt('tags.addShort') }}
        </button>
      </div>
      <p v-if="error" class="text-xs text-danger mt-2">{{ error }}</p>
    </div>

    <!-- 标签列表 -->
    <div class="page-card px-5 py-4">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <AppIcon scale="md" name="bookmark" class="text-primary" />
          <h3 class="text-base font-bold gradient-text">{{ tt('tags.manageTitle') }}</h3>
          <span class="text-xs text-gray-400">{{ tt('tags.totalCount', { count: tags.length }) }}</span>
        </div>
      </div>

      <p v-if="tags.length === 0" class="text-sm text-gray-400 text-center py-10">{{ tt('tags.empty') }}</p>
      <div v-else class="grid gap-2 sm:grid-cols-2">
        <div v-for="tag in tags" :key="tag.id"
          class="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/50 border border-primary/10">
          <!-- 颜色块（点击改色） -->
          <input type="color" :value="tag.color || '#888888'"
            class="w-6 h-6 shrink-0 rounded cursor-pointer border border-primary/20 bg-transparent p-0"
            @input="updateColor(tag, $event.target.value)" :title="tt('tags.color')" />

          <!-- 名称（点击进入行内编辑） -->
          <template v-if="editingId === tag.id">
            <input ref="editInput" v-model="editName" type="text" maxlength="20"
              class="flex-1 min-w-0 px-2 py-1 border border-primary/30 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
              @keyup.enter="saveRename(tag)" @keyup.esc="cancelRename" @blur="saveRename(tag)" />
          </template>
          <template v-else>
            <span class="flex-1 text-sm text-gray-700 truncate">{{ tag.name }}</span>
            <span v-if="tag.is_builtin" class="text-[0.625rem] text-gray-400 shrink-0">{{ tt('tags.builtin') }}</span>
          </template>

          <!-- 操作 -->
          <button v-if="editingId !== tag.id" @click="startRename(tag)" :title="tt('tags.rename')"
            class="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10 transition btn-press">
            <AppIcon scale="xs" name="edit" />
          </button>
          <button v-if="editingId !== tag.id && !tag.is_builtin" @click="removeTag(tag)" :title="tt('tags.delete')"
            class="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-danger hover:bg-danger/10 transition btn-press">
            <AppIcon scale="xs" name="trash" />
          </button>
          <button v-if="editingId === tag.id" @click="cancelRename" :title="tt('common.cancel')"
            class="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 transition btn-press">
            <AppIcon scale="xs" name="close" />
          </button>
        </div>
      </div>

      <p class="text-xs text-gray-400 mt-3 leading-relaxed">{{ tt('tags.builtinHint') }}</p>
    </div>
  </div>
</template>

<script setup>
/**
 * 标签管理页（原为弹窗，按要求移入侧边导航）。
 *
 * 与弹窗版的差异：
 *  - 布局从单列改为两列网格，宽屏下能一屏看完更多标签；
 *  - 顶部独立「新建」卡片，操作区域更舒展；
 *  - 不再需要 Teleport / 焦点陷阱，作为普通页面由路由承载。
 */
import { ref, nextTick, onMounted, watch } from 'vue'
import { tagsApi } from '../db/api'
import { useI18n } from '../composables/useI18n'
import { showToast } from '../composables/useToast'

const { tt } = useI18n()

const tags = ref([])
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
      error.value = res?.data?.error || tt('tags.createFailed')
    }
  } catch (e) {
    error.value = e?.message || tt('tags.createFailed')
  }
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
      showToast(res?.data?.error || tt('tags.renameFailed'), 'error')
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
      showToast(res?.data?.error || tt('tags.deleteFailed'), 'error')
    }
  } catch (e) {
    showToast(e?.message || tt('tags.deleteFailed'), 'error')
  }
}

watch(() => tags.value.length, () => { error.value = '' })
</script>
