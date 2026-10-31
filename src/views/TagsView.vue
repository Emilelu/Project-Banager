<template>
  <div class="space-y-5">
    <!-- 鏂板缓鏍囩 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-5 py-4">
      <div class="flex items-center gap-2 mb-3">
        <AppIcon scale="md" name="plus" class="text-primary" />
        <h3 class="text-base font-bold gradient-text">{{ tt('tags.createNew') }}</h3>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <input v-model="newName" type="text" :placeholder="tt('tags.namePlaceholder')" maxlength="20"
          class="tag-input flex-1 min-w-[10rem] px-3 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80"
          @keyup.enter="createTag" />
        <ColorPicker :value="newColor" size="2.5rem" :aria-label="tt('tags.color')" :title="tt('tags.color')" @input="newColor = $event" />
        <button @click="createTag" :disabled="!newName.trim()"
          class="btn-base btn-primary shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
          <AppIcon scale="sm" name="plus" />{{ tt('tags.addShort') }}
        </button>
      </div>
      <p v-if="error" class="tag-error text-xs text-danger mt-2">{{ error }}</p>
    </div>

    <!-- 鏍囩鍒楄〃 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-5 py-4">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <AppIcon scale="md" name="bookmark" class="text-primary" />
          <h3 class="text-base font-bold gradient-text">{{ tt('tags.manageTitle') }}</h3>
          <span class="tag-meta text-xs text-gray-400">{{ tt('tags.totalCount', { count: tags.length }) }}</span>
        </div>
      </div>

      <p v-if="tags.length === 0" class="tag-meta text-sm text-gray-400 text-center py-10">{{ tt('tags.empty') }}</p>
      <div v-else class="grid gap-2 sm:grid-cols-2">
        <div v-for="tag in tags" :key="tag.id"
          class="tag-row flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/50 border border-primary/10">
          <!-- 棰滆壊鍧楋紙鐐瑰嚮鏀硅壊锛?-->
          <ColorPicker :value="tag.color" size="1.5rem" :aria-label="tt('tags.color')" @input="updateColor(tag, $event)" />

          <!-- 鍚嶇О锛堢偣鍑昏繘鍏ヨ鍐呯紪杈戯級 -->
          <template v-if="editingId === tag.id">
            <input ref="editInput" v-model="editName" type="text" maxlength="20"
              class="tag-input flex-1 min-w-0 px-2 py-1 border border-primary/30 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
              @keyup.enter="saveRename(tag)" @keyup.esc="cancelRename" @blur="saveRename(tag)" />
          </template>
          <template v-else>
            <span class="tag-name flex-1 text-sm text-gray-700 truncate">{{ tag.name }}</span>
            <span v-if="tag.is_builtin" class="tag-badge text-[0.625rem] text-gray-400 shrink-0">{{ tt('tags.builtin') }}</span>
          </template>

          <!-- 鎿嶄綔 -->
          <button v-if="editingId !== tag.id" @click="startRename(tag)" :title="tt('tags.rename')"
            class="tag-action w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10 transition btn-press">
            <AppIcon scale="xs" name="edit" />
          </button>
          <button v-if="editingId !== tag.id && !tag.is_builtin" @click="removeTag(tag)" :title="tt('tags.delete')"
            class="tag-action w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-danger hover:bg-danger/10 transition btn-press">
            <AppIcon scale="xs" name="trash" />
          </button>
          <button v-if="editingId === tag.id" @click="cancelRename" :title="tt('common.cancel')"
            class="tag-action w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 transition btn-press">
            <AppIcon scale="xs" name="close" />
          </button>
        </div>
      </div>

      <p class="tag-meta text-xs text-gray-400 mt-3 leading-relaxed">{{ tt('tags.builtinHint') }}</p>
    </div>
  </div>
</template>

<script setup>
/**
 * 鏍囩绠＄悊椤碉紙鍘熶负寮圭獥锛屾寜瑕佹眰绉诲叆渚ц竟瀵艰埅锛夈€? *
 * 涓庡脊绐楃増鐨勫樊寮傦細
 *  - 甯冨眬浠庡崟鍒楁敼涓轰袱鍒楃綉鏍硷紝瀹藉睆涓嬭兘涓€灞忕湅瀹屾洿澶氭爣绛撅紱
 *  - 椤堕儴鐙珛銆屾柊寤恒€嶅崱鐗囷紝鎿嶄綔鍖哄煙鏇磋垝灞曪紱
 *  - 涓嶅啀闇€瑕?Teleport / 鐒︾偣闄烽槺锛屼綔涓烘櫘閫氶〉闈㈢敱璺敱鎵胯浇銆? */
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
  } catch { /* 鏀硅壊澶辫触闈欓粯锛屼笉褰卞搷涓绘祦绋?*/ }
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

<style scoped>
/*
 * 娣辫壊妯″紡涓嬬殑鏉愯川涓庢枃瀛楄壊銆? *
 * 涓轰粈涔堜笉鐢?Tailwind 鐨?dark: 鍓嶇紑锛氭湰椤圭洰娣辫壊妯″紡鏄?body/html 涓婄殑 .dark 绫? * + style.css 閲屾垚缁勭殑 `.dark .xxx` 瑕嗙洊瑙勫垯锛堣銆屾殫鑹叉ā寮忋€嶅尯娈碉級锛屾病鏈夐厤缃? * darkMode: 'class' 鐨?dark: 鍙樹綋锛屾墍浠ヨ繖閲屾部鐢ㄥ悓涓€濂楁満鍒讹細`:global(.dark)` 鍓嶇紑锛? * 鐢?scoped 鐨?data-v 灞炴€ф妸浣滅敤鍩熼檺鍒跺湪鏈〉锛屼笉浼氬娉勫埌鍒殑椤甸潰銆? *
 * 涓轰粈涔堝繀椤昏鐩?bg-white/50锛歴tyle.css 鐨勬繁鑹插尯娈靛彧缁?bg-white/20銆?30銆?40
 * 鍐欎簡鍙嶈浆瑙勫垯锛?*娌℃湁 /50銆?70銆?80**銆備簬鏄繖浜涘崐閫忔槑鐧藉湪娣辫壊妯″紡涓嬩粛鏄? * 銆屾祬搴曘€嶏紝鑰屾枃瀛楄 `.dark .text-gray-700` 缁熶竴鏀规垚娴呯伆 鈫?娴呭簳娴呭瓧锛屽嚑涔庤涓嶅嚭鏉ャ€? * 杩欓噷鎶婃湰椤电敤鍒扮殑姣忎竴澶勯兘琛ユ垚娣辫壊鏉愯川锛屾祬鑹叉ā寮忎竴寰嬩笉鍔ㄣ€? */

/* 鍒楄〃琛岋細娣辫壊鍗＄墖涓婂啀鎶竴妗ｄ寒搴︼紝鐢ㄤ簬鍖哄垎琛屼笌鍗＄墖搴?*/
.dark .tag-row {
  background: rgba(255, 255, 255, 0.06) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

/* 鏍囩鍚嶏細姝ｆ枃锛岀洰鏍?鈮?.5:1 */
.dark .tag-name {
  color: #e2e8f0 !important;
}

/* 銆屽唴缃€嶆爣璁帮細0.625rem 灞炰簬灏忓瓧锛屽悓鏍锋寜 4.5:1 瑕佹眰锛堜笉鐢ㄦ洿鏆楃殑鐏帮級 */
.dark .tag-badge {
  color: #cbd5e1 !important;
}

/* 璁℃暟 / 绌虹姸鎬?/ 搴曢儴璇存槑锛氭绾ф枃瀛楋紝灏忓瓧鎸?4.5:1 */
.dark .tag-meta {
  color: #a9b6cc !important;
}

/* 琛屽唴鍥炬爣鎸夐挳锛氶粯璁ゆ€佸湪娣辫壊涓嬫彁浜紝hover 浠嶈蛋鍘熸湁鐨勪富鑹?鍗遍櫓鑹?*/
.dark .tag-action {
  color: #9aa8c0 !important;
}
.dark .tag-action:hover {
  color: rgb(var(--c-primary-light)) !important;
}

/* 鏂板缓 / 琛屽唴缂栬緫杈撳叆妗嗭細娣辫壊鍗婇€忔槑搴?+ 娴呰壊瀛楋紙瑕嗙洊 bg-white/80 鐨勭櫧搴曪級 */
.dark .tag-input {
  background: rgba(20, 15, 40, 0.55) !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
  color: #e2e8f0 !important;
}

/* 鏂板缓澶辫触鎻愮ず锛歞anger 鍘熻壊鍦ㄦ繁鑹插簳涓婂亸鏆楋紝鎻愪寒鍒?400 妗?*/
.dark .tag-error {
  color: #fca5a5 !important;
}
</style>

