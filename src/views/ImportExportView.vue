<template>
  <div ref="pageRootRef" class="space-y-5" tabindex="-1">
    <!-- ==================== 导入（不选格式：一个按钮 + 系统文件对话框） ==================== -->
    <section class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4" data-test="import-card">
      <div class="flex items-center gap-2 mb-3">
        <AppIcon scale="md" name="upload" class="text-primary" />
        <!-- 「点击下方按钮选择文件。支持 Excel / CSV …会按文件类型自动识别…」是**卡片用法说明**，
             改为标题上的悬浮气泡；卡片正文直接从按钮开始，少两行灰字。 -->
        <h2 class="text-base font-bold gradient-text inline-flex items-center gap-1 border-b border-dashed border-gray-400/50 cursor-help"
          v-tip="tm('transfer.importHint')">{{ tm('transfer.importTitle') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></h2>
      </div>

      <div class="flex items-center gap-3 flex-wrap min-h-[3.25rem]">
        <!-- 支持格式清单（xlsx · xls · csv …）是「这个按钮接受什么」的说明：
             清单本身移入按钮气泡，按钮旁只留一个 info 图标提示「此处可悬浮」。
             文案 key 未删除，只是渲染位置从正文变成气泡。 -->
        <button type="button" data-test="import-btn" @click="pickFile"
          :disabled="importing || exporting"
          class="btn-base btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          :aria-label="tm('transfer.importBtn')">
          <AppIcon scale="sm" name="upload" />
          {{ importing ? tm('transfer.importing') : tm('transfer.importBtn') }}
        </button>
        <span class="xfer-muted inline-flex items-center gap-1 cursor-help border-b border-dashed border-gray-400/50"
          v-tip="tm('transfer.supportedFormats')" :aria-label="tm('transfer.supportedFormats')"
          data-test="supported-formats">
          <AppIcon scale="xs" name="info" class="text-gray-400" />
        </span>
      </div>

      <!-- 同一个隐藏 input 覆盖全部扩展名；accept 是「自动识别」在系统对话框层的第一步 -->
      <input ref="fileInput" data-test="import-input" type="file" :accept="ACCEPT"
        class="hidden" @change="onFileChosen" />

      <p v-if="importing && activeFileName" class="text-xs mt-2 break-all" data-test="importing-file">
        <!-- 语言包里 transfer.importingFile 是「正在处理」这类短句（不含 {name} 占位），
             所以文件名单独跟在后面；塞进插值位会原样显示成 {name}。 -->
        <span class="xfer-muted">{{ tm('transfer.importingFile') }}</span>
        <span class="xfer-text ml-1 font-mono">{{ activeFileName }}</span>
      </p>

      <!-- ========== 导入结果面板（成功/失败/按表分布/错误明细） ========== -->
      <div v-if="result" class="mt-4 rounded-xl px-4 py-3 border"
        :class="result.failed ? 'xfer-panel-bad' : 'xfer-panel-ok'" data-test="import-result">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-1.5 text-sm font-semibold"
            :class="result.failed ? 'xfer-danger' : 'xfer-success'">
            <AppIcon scale="sm" :name="result.failed ? 'warning' : 'check'" />
            {{ tm('transfer.resultTitle') }}
          </div>
          <button type="button" data-test="result-clear" @click="result = null"
            class="xfer-link text-xs">{{ tm('transfer.clearResult') }}</button>
        </div>

        <!-- 成功 / 失败 / 总计 -->
        <div class="grid grid-cols-3 gap-2 text-center mt-2">
          <div class="xfer-stat rounded-lg py-1.5">
            <div class="text-base font-bold xfer-success" data-test="result-imported">{{ result.imported }}</div>
            <div class="xfer-muted text-[0.6875rem]">{{ tm('importResult.imported') }}</div>
          </div>
          <div class="xfer-stat rounded-lg py-1.5">
            <div class="text-base font-bold" :class="result.failed ? 'xfer-danger' : 'xfer-muted'"
              data-test="result-failed">{{ result.failed }}</div>
            <div class="xfer-muted text-[0.6875rem]">{{ tm('importResult.failed') }}</div>
          </div>
          <div class="xfer-stat rounded-lg py-1.5">
            <div class="text-base font-bold xfer-text" data-test="result-total">{{ result.imported + result.failed }}</div>
            <div class="xfer-muted text-[0.6875rem]">{{ tm('importResult.total') }}</div>
          </div>
        </div>

        <!-- 按表分布 -->
        <div class="xfer-muted text-xs mt-3 mb-1">{{ tm('transfer.tableDistribution') }}</div>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="xfer-stat rounded-lg py-1" data-test="result-table-watching">
            <div class="text-sm font-bold text-primary">{{ result.byTable.watching }}</div>
            <div class="xfer-muted text-[0.6875rem]">{{ tm('nav.watching') }}</div>
          </div>
          <div class="xfer-stat rounded-lg py-1" data-test="result-table-remaining">
            <div class="text-sm font-bold text-secondary">{{ result.byTable.remaining }}</div>
            <div class="xfer-muted text-[0.6875rem]">{{ tm('nav.remaining') }}</div>
          </div>
          <div class="xfer-stat rounded-lg py-1" data-test="result-table-watched">
            <div class="text-sm font-bold text-accent">{{ result.byTable.watched }}</div>
            <div class="xfer-muted text-[0.6875rem]">{{ tm('nav.watched') }}</div>
          </div>
        </div>

        <!-- 整库恢复：提示回滚快照文件名，出问题时用户知道从哪回滚 -->
        <!-- 回滚快照：语言包里 transfer.restored 是短句「数据库已恢复」，
             快照文件名不适合塞进这条文案的插值位，这里用「短句 + 文件名」两段拼装，
             既保持三语文案原样，也确保用户能看到真正的回滚文件名。 -->
        <p v-if="result.snapshotName" class="xfer-muted text-xs mt-2 break-all" data-test="result-snapshot">
          {{ tm('transfer.restored') }}
          <span class="font-mono">{{ result.snapshotName }}</span>
        </p>

        <!-- 错误明细：最多 30 条，其余折叠成「还有 N 条」 -->
        <div v-if="result.errors.length" class="mt-2 text-xs xfer-danger space-y-0.5 max-h-40 overflow-y-auto"
          data-test="result-errors">
          <div v-for="(e, i) in result.errors.slice(0, MAX_ERRORS)" :key="i" class="break-all">· {{ errText(e) }}</div>
          <div v-if="result.errors.length > MAX_ERRORS" class="xfer-muted" data-test="result-more-errors">
            {{ tm('importResult.moreErrors', { count: result.errors.length - MAX_ERRORS }) }}
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 导出（必须显式选五种格式之一） ==================== -->
    <section class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4" data-test="export-card">
      <div class="flex items-center gap-2 mb-3">
        <AppIcon scale="md" name="download" class="text-primary" />
        <!-- 「选择需要导出的格式，文件会直接下载。」是导出选项的用法说明 → 标题气泡 -->
        <h2 class="text-base font-bold gradient-text inline-flex items-center gap-1 border-b border-dashed border-gray-400/50 cursor-help"
          v-tip="tm('transfer.exportHint')">{{ tm('transfer.exportTitle') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></h2>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        <button v-for="fmt in exportFormats" :key="fmt.key" type="button"
          :data-test="'export-' + fmt.key" @click="runExport(fmt.key)"
          :disabled="exporting || importing"
          class="xfer-option flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition
                 disabled:opacity-40 disabled:cursor-not-allowed"
          :aria-label="tm(fmt.labelKey)">
          <AppIcon scale="sm" :name="fmt.icon" class="text-primary shrink-0" />
          <span class="flex-1 min-w-0">
            <!-- labelKey 的文案本身已含扩展名（如「数据库备份 (.db)」），
                 所以这里不再额外渲染 fmt.ext，否则会显示成「…(.db).db」。 -->
            <span class="xfer-text block text-sm truncate">{{ tm(fmt.labelKey) }}</span>
          </span>
          <AppIcon scale="xs" name="download" class="xfer-muted shrink-0" />
        </button>
      </div>

      <p v-if="exporting" class="xfer-muted text-xs mt-2">{{ tm('transfer.exporting') }}</p>
    </section>

    <!-- ==================== 整库恢复二次确认 ==================== -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showDbConfirm" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]"
          @click="cancelDbRestore"></div>
      </transition>
      <transition name="modal">
        <div v-if="showDbConfirm" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div ref="dbConfirmRef" data-test="db-confirm"
            class="relative glass rounded-2xl shadow-2xl w-[min(26.25rem,calc(100vw-2rem))] border border-white/40 pointer-events-auto app-dialog"
            role="dialog" aria-modal="true" aria-labelledby="transfer-db-confirm-title">
            <div class="px-6 py-5 text-center">
              <div class="mb-3 flex justify-center"><AppIcon scale="xl" class="xfer-muted" name="folderOpen" /></div>
              <!-- 确认框文案复用既有 key（confirm.*）：与 App.vue 原来的导入确认完全一致，
                   既不用新增条目，也保持「覆盖当前全部数据」的措辞强度。 -->
              <h3 id="transfer-db-confirm-title" class="text-lg font-bold xfer-text mb-2">
                {{ tm('confirm.importBackupTitle') }}
              </h3>
              <p class="text-sm xfer-muted leading-relaxed">
                {{ tm('confirm.importBackupMessage') }}
              </p>
              <p class="text-sm xfer-text mt-2 break-all">
                {{ tm('confirm.importBackupFile') }}
                <span class="font-semibold">{{ pendingDbFile?.name }}</span>
              </p>
              <p class="xfer-muted text-xs mt-2 leading-relaxed">{{ tm('transfer.dbConfirmSnapshot') }}</p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button type="button" @click="cancelDbRestore" class="btn-base btn-neutral" data-test="db-confirm-cancel">
                {{ tm('common.cancel') }}
              </button>
              <button type="button" @click="doRestore" class="btn-base btn-danger" data-test="db-confirm-ok">
                {{ tm('confirm.confirmImport') }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
/**
 * 导入 & 导出（单页）
 * ============================================================
 * 为什么同页、且导入不选格式：
 *   用户原话「导入和导出功能要在同一个页面。点导入弹出的系统文件对话框，可以选那五种
 *   类型的文件，而不需要菜单手动选哪一类。导出才需要有五种选择。」
 *   于是这里刻意把两种交互拆开：
 *     · 导入：一个按钮 → 系统文件对话框（accept 覆盖 5 种格式）→ 按扩展名自动分派；
 *     · 导出：5 个格式选项，用户必须明确点选要哪种产物。
 *
 * 分派规则（与 App.vue 既有逻辑等价，此处搬到独立页面，不改 App.vue）：
 *   .db/.sqlite/.bak → 整库恢复（覆盖前先导出一份带时间戳的回滚快照 + 二次确认）
 *   .xlsx/.xls       → importExcel()（自带分段识别 / 超链接 / 年份列解析）
 *   .csv/.json/.md   → importStructured(file, kind)
 *   其它             → 「不支持的文件类型」
 *
 * 结果面板结构沿用 ImportView.vue / App.vue 的既有版式：
 *   成功 / 失败 / 总计 + 按表分布 + 错误明细（前 30 条，其余折叠成「还有 N 条」）。
 *   按表分布用「导入前后各表行数差」计算——Excel 导入器不返回 byTable，
 *   用差集既统一了三种来源的展示口径，也能正确反映 UNIQUE 冲突导致的失败行。
 *
 * 样式纪律：
 *   · 卡片一律 `glass rounded-2xl shadow-lg border border-white/30 px-6 py-4`（与追番页一致），
 *     不自创新材质/新背景；
 *   · 深色模式走 `body/html` 上的 .dark 类 + `:global(.dark)` 覆盖（本项目没有 dark: 前缀变体），
 *     文字色浅色模式用 `rgb(var(--txt-card-*))`，深色模式单独提亮（见文末 scoped 样式），
 *     不写死 `text-gray-700`。
 */
import { ref } from 'vue'
import { getDb } from '../db/index'
import { importExcel } from '../db/excelImporter'
import { importStructured } from '../db/structuredImporter'
import {
  buildExportWorkbook, buildExportCsv, buildExportJson, buildExportMarkdown,
  downloadBlob, exportTimestamp,
} from '../db/excelExporter'
import { useI18n } from '../composables/useI18n'
import { showToast } from '../composables/useToast'
import { useDialogFocus } from '../composables/useDialogFocus'

const { tt } = useI18n()

/**
 * 文案别名：本页一律用 tt() 取词，tm 只是历史命名的保留（两者等价）。
 *
 * 曾经这里挂过一份「临时中文兜底表」，因为本页新增的 key 当时还没进 src/locales/*；
 * key 合入三语后兜底表变成了第二个真相来源（文案会与语言包不一致、插值参数也会漂移，
 * 例如语言包写 {ok} 而兜底写 {imported}），所以已整块删除。
 * 现在三语缺失会由 t() 的回退链接管：当前语言 → zh → 原样 key，不会静默出错。
 */
const tm = (key, params) => tt(key, params)

/** 五种导入格式在系统对话框里的统一 accept（顺序与文档一致，便于核对） */
const ACCEPT = '.xlsx,.xls,.csv,.json,.md,.db,.sqlite,.bak'

/** 结果面板最多展示的条数；其余折叠成「还有 N 条」 */
const MAX_ERRORS = 30

const EXPORT_FORMATS = [
  { key: 'xlsx', labelKey: 'sidebar.exportXlsx', icon: 'log', ext: '.xlsx' },
  { key: 'csv', labelKey: 'sidebar.exportCsv', icon: 'log', ext: '.csv' },
  { key: 'json', labelKey: 'sidebar.exportJson', icon: 'note', ext: '.json' },
  { key: 'md', labelKey: 'sidebar.exportMd', icon: 'note', ext: '.md' },
  { key: 'db', labelKey: 'sidebar.exportDb', icon: 'download', ext: '.db' },
]
const exportFormats = EXPORT_FORMATS

const BACKUP_KEY = 'banager_last_backup'

const pageRootRef = ref(null)
const fileInput = ref(null)
const dbConfirmRef = ref(null)

const importing = ref(false)
const exporting = ref(false)
const activeFileName = ref('')
const result = ref(null)
const pendingDbFile = ref(null)
const showDbConfirm = ref(false)

// 确认弹窗：打开时焦点进入、Esc 关闭、关闭后焦点归还（与 App.vue 的导入确认一致）
useDialogFocus({
  isOpen: () => showDbConfirm.value,
  getDialog: () => dbConfirmRef.value,
  root: () => pageRootRef.value,
  onEscape: () => cancelDbRestore(),
})

const ZERO_TABLE = () => ({ watching: 0, remaining: 0, watched: 0 })

/** 按扩展名判定导入类型 —— 用户不需要自己选 */
function detectKind(file) {
  const name = String(file?.name || '').toLowerCase()
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot) : ''
  if (ext === '.db' || ext === '.sqlite' || ext === '.bak') return 'db'
  if (ext === '.xlsx' || ext === '.xls') return 'xlsx'
  if (ext === '.csv') return 'csv'
  if (ext === '.json') return 'json'
  if (ext === '.md') return 'md'
  return ''
}

/** 类型 → 既有 locale key（与 App.vue 导入菜单同一套文案） */
const KIND_LABEL_KEY = {
  db: 'sidebar.importDb',
  xlsx: 'sidebar.importXlsx',
  csv: 'sidebar.importCsv',
  json: 'sidebar.importJson',
  md: 'sidebar.importMd',
}

/** 错误项可能是字符串，也可能是 { code, params, message }，统一取可读文案 */
function errText(e) {
  if (!e) return ''
  if (typeof e === 'string') return e
  if (e.code) {
    // 导入器错误（impErr.*）：kind 参数要翻成「追番 / 等番 / 已看」再传给模板
    const params = { ...(e.params || {}) }
    if (params.kind) {
      params.kindName = tm(`importKind.${params.kind}`)
      delete params.kind
    }
    const text = importErrorText(e, tt)
    if (text) return text
    // 兜底：也试 dbErr.*（有些错误来自 db 层）
    const key = `dbErr.${e.code}`
    const translated = tt(key, e.params || {})
    if (translated && translated !== key) return translated
  }
  return e.message || String(e)
}

function failCount(r) {
  const n = Number(r?.failed ?? r?.errorCount)
  if (Number.isFinite(n) && n > 0) return n
  // Excel 导入器的失败只体现在 success=false + errors 上，没有 errorCount
  if (r?.success === false) return Math.max(1, Array.isArray(r?.errors) ? r.errors.length : 0)
  return 0
}

/** 直接读三张表的行数（导入前后各取一次，差集即「按表分布」） */
function readCounts(db) {
  try {
    return {
      watching: (db.getAllWatching?.() || []).length,
      remaining: (db.getAllRemaining?.() || []).length,
      watched: (db.getAllWatched?.() || []).length,
    }
  } catch {
    return ZERO_TABLE()
  }
}

const sumTable = (t) => (t.watching || 0) + (t.remaining || 0) + (t.watched || 0)

const pickFile = () => {
  if (importing.value || exporting.value) return
  result.value = null
  if (fileInput.value) {
    // 先清空 value：否则连续两次选同一个文件时 change 不会触发
    fileInput.value.value = ''
    fileInput.value.click()
  }
}

const onFileChosen = async (event) => {
  const file = event.target.files?.[0]
  if (fileInput.value) fileInput.value.value = ''
  if (!file) return

  const kind = detectKind(file)
  if (!kind) {
    // accept 已限制类型，但用户在系统对话框里仍可能切到「所有文件」
    showToast(tm('transfer.unknownType'), 'error')
    return
  }
  if (kind === 'db') {
    // 整库恢复是破坏性操作：先弹二次确认，确认后才覆盖
    pendingDbFile.value = file
    showDbConfirm.value = true
    return
  }
  await runImport(file, kind)
}

const cancelDbRestore = () => {
  showDbConfirm.value = false
  pendingDbFile.value = null
}

/** 整库恢复：先校验，覆盖前导出带时间戳的回滚快照；失败时回滚到快照 */
async function doRestore() {
  const file = pendingDbFile.value
  showDbConfirm.value = false
  pendingDbFile.value = null
  if (!file || importing.value) return

  importing.value = true
  activeFileName.value = file.name
  result.value = null
  try {
    const db = await getDb()

    // 1) 先校验 magic header。顺序很重要：坏文件不应在磁盘上留下一个「无意义快照」，
    //    所以校验先于快照导出（App.vue 的旧实现是反过来的，会白下载一份快照）。
    const bytes = new Uint8Array(await file.arrayBuffer())
    const header = new TextDecoder().decode(bytes.slice(0, 16))
    if (header !== 'SQLite format 3\u0000') {
      result.value = {
        imported: 0, failed: 1, byTable: ZERO_TABLE(),
        errors: [tt('toast.importNotSqlite')], snapshotName: '',
      }
      showToast(tt('toast.importNotSqlite'), 'error')
      return
    }

    // 2) 当前库的整体字节：同一份既写成「回滚快照文件」（带时间戳），
    //    也在覆盖异常时充当内存回滚点 —— 只调一次 export()，避免整库序列化两遍。
    let before = null
    let snapshotName = ''
    try {
      before = db.export()
      snapshotName = `bangumi_pre_restore_${exportTimestamp()}.db`
      downloadBlob(new Blob([before], { type: 'application/x-sqlite3' }), snapshotName)
    } catch (e) {
      // 快照失败不阻断恢复（用户仍有导入前的既有备份），但结果面板不谎报快照名
      console.warn('[transfer] 恢复前快照导出失败，继续恢复:', e)
      snapshotName = ''
    }

    // 3) 覆盖 + 落盘；失败时把旧库写回去，避免用户停留在「半覆盖」状态
    try {
      db.importDb(bytes)
      await db.save()
    } catch (importError) {
      if (before) {
        try {
          db.importDb(before)
          await db.save()
        } catch { /* 旧库已由 importDb 的失败路径保留 */ }
      }
      throw importError
    }

    localStorage.setItem(BACKUP_KEY, String(Date.now()))
    const counts = readCounts(db)
    result.value = {
      imported: sumTable(counts),
      failed: 0,
      byTable: counts,
      errors: [],
      snapshotName,
    }
    showToast(tm('transfer.restoreDone'))
  } catch (e) {
    console.error('[transfer] 整库恢复失败:', e)
    const message = e?.message || String(e || '')
    result.value = {
      imported: 0, failed: 1, byTable: ZERO_TABLE(),
      errors: [tm('toast.importFailed', { message })], snapshotName: '',
    }
    showToast(tm('toast.importFailed', { message }), 'error')
  } finally {
    importing.value = false
    activeFileName.value = ''
  }
}

/** 结构化 / Excel 导入：按自动识别出的 kind 分派，结束后统一成结果面板形状 */
async function runImport(file, kind) {
  if (importing.value) return
  importing.value = true
  activeFileName.value = file.name
  result.value = null
  try {
    const db = await getDb()
    const before = readCounts(db)

    let raw
    if (kind === 'xlsx') raw = await importExcel(file)
    else raw = await importStructured(file, kind)

    const after = readCounts(db)
    // Excel 导入器不返回 byTable；统一用「行数差」计算分布，三种来源口径一致
    const delta = {
      watching: Math.max(0, after.watching - before.watching),
      remaining: Math.max(0, after.remaining - before.remaining),
      watched: Math.max(0, after.watched - before.watched),
    }
    const byTable = sumTable(delta) > 0 ? delta : (raw?.byTable || ZERO_TABLE())

    const imported = Number(raw?.imported ?? 0)
    const failed = failCount(raw)
    result.value = {
      imported,
      failed,
      byTable,
      errors: Array.isArray(raw?.errors) ? raw.errors.map(errText).filter(Boolean) : [],
      snapshotName: '',
    }

    if (result.value.errors.length === 0 && failed === 0) {
      showToast(tm('transfer.importDone', { count: imported }))
    } else if (imported > 0) {
      showToast(tm('transfer.importDoneWithFailed', { ok: imported, failed }), 'warning')
    } else {
      showToast(tm('toast.importFailed', { message: errText(raw?.errors?.[0]) || tt('toast.failed') }), 'error')
    }
  } catch (e) {
    console.error('[transfer] 导入失败:', e)
    result.value = {
      imported: 0, failed: 1, byTable: ZERO_TABLE(),
      errors: [e?.message || String(e || '')], snapshotName: '',
    }
    showToast(tm('toast.importFailed', { message: e?.message || 'unknown' }), 'error')
  } finally {
    importing.value = false
    activeFileName.value = ''
    if (fileInput.value) fileInput.value.value = ''
  }
}

/** 导出：5 种格式各一个明确的按钮，点击即下载 */
const runExport = async (kind) => {
  if (exporting.value || importing.value) return
  exporting.value = true
  try {
    const ts = exportTimestamp()
    const db = await getDb()

    // .db 是「整库备份」，放在「无数据」拦截之前：
    // 空库导出的 .db 仍是合法的备份文件（用户可能在建库前先存一份），
    // 这一点与 App.vue 既有 exportData() 的顺序完全一致（它也先处理 db 再判总数）。
    if (kind === 'db') {
      downloadBlob(
        new Blob([db.export()], { type: 'application/x-sqlite3' }),
        `bangumi_backup_${ts}.db`,
      )
      localStorage.setItem(BACKUP_KEY, String(Date.now()))
      showToast(tt('toast.backupExported'))
      return
    }

    const counts = readCounts(db)
    const total = sumTable(counts)
    // 其余四种是「业务数据导出」：没有记录时给出明确提示，不生成空文件
    if (total === 0) {
      showToast(tm('transfer.noDataToExport'), 'warning')
      return
    }

    const data = {
      watching: db.getAllWatching() || [],
      remaining: db.getAllRemaining() || [],
      watched: db.getAllWatched() || [],
    }

    switch (kind) {
      case 'xlsx': {
        const bytes = buildExportWorkbook(data)
        downloadBlob(
          new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
          `bangumi_data_${ts}.xlsx`,
        )
        showToast(tt('toast.exportedXlsx', { count: total }))
        break
      }
      case 'csv':
        downloadBlob(buildExportCsv(data), `bangumi_data_${ts}.csv`, 'text/csv;charset=utf-8')
        showToast(tt('toast.exportedCsv', { count: total }))
        break
      case 'json':
        downloadBlob(buildExportJson(data), `bangumi_data_${ts}.json`, 'application/json')
        showToast(tt('toast.exportedJson', { count: total }))
        break
      case 'md':
        downloadBlob(buildExportMarkdown(data), `bangumi_data_${ts}.md`, 'text/markdown;charset=utf-8')
        showToast(tt('toast.exportedMd', { count: total }))
        break
      default:
        break
    }
  } catch (e) {
    console.error('[transfer] 导出失败:', e)
    showToast(tt('toast.exportDataFailed', { message: e?.message || 'unknown' }), 'error')
  } finally {
    exporting.value = false
  }
}

defineExpose({ detectKind, ACCEPT })
</script>

<style scoped>
/*
 * 深色模式说明（与 TagsView / AppearanceView 同一套机制）：
 * 本项目深色模式是 html/body 上的 .dark 类 + style.css 里成组的 `.dark .xxx` 覆盖规则，
 * 没有配置 darkMode:'class' 的 dark: 前缀变体，所以这里沿用 `.dark .xxx` 写法
 * （scoped 会编译成 `.dark .xxx[data-v-xxx]`），作用域仍锁在本页。
 *
 * 文字色纪律：
 *  · 浅色模式正文用 rgb(var(--txt-card-700))（由 useAppearance 按卡片有效亮度推算），
 *    不用写死的 text-gray-700；
 *  · 深色模式卡片是深紫底，--txt-card-* 会被算成深色系（压在上面不可读），
 *    因此这些文字在深色下显式提亮（与 AppearanceView 的处理一致）。
 */

/* 正文 / 次级文字 / 链接 */
.xfer-text { color: rgb(var(--txt-card-700, 55 48 70)); }
.xfer-muted { color: rgb(var(--txt-card-500, 55 65 81)); }
.xfer-link {
  color: rgb(var(--c-primary));
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.xfer-link:hover { color: rgb(var(--c-primary-dark)); }

.dark .xfer-text { color: #e2e8f0; }
.dark .xfer-muted { color: #a9b6cc; }
.dark .xfer-link { color: rgb(var(--c-primary-light)); }
.dark .xfer-link:hover { color: #c4b5fd; }

/* 语义色：浅色模式用主题变量原色，深色模式提亮到 300 档（深底上 4.5:1） */
.xfer-success { color: rgb(var(--c-success)); }
.xfer-danger { color: rgb(var(--c-danger)); }
.dark .xfer-success { color: #6ee7b7; }
.dark .xfer-danger { color: #fca5a5; }

/* 统计小格 / 导出格式选项：半透明白底，深色下换成深紫半透明
   （不用 bg-white/60：style.css 的深色区段只反转了 /20 /30 /40 /50 /70 /80 /90，
    没有 /60，深色下会留一块「浅底浅字」） */
.xfer-stat {
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgb(var(--c-primary) / 0.15);
}
.dark .xfer-stat {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}

.xfer-option {
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgb(var(--c-primary) / 0.2);
}
.xfer-option:hover {
  background: rgb(var(--c-primary) / 0.1);
  border-color: rgb(var(--c-primary) / 0.38);
}
.dark .xfer-option {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.14);
}
.dark .xfer-option:hover {
  background: rgb(var(--c-primary-light) / 0.16);
  border-color: rgb(var(--c-primary-light) / 0.4);
}

/* 结果面板底色：成功偏绿、失败偏红，都保持低饱和，不抢卡片主色 */
.xfer-panel-ok {
  background: rgb(var(--c-success) / 0.08);
  border-color: rgb(var(--c-success) / 0.28);
}
.xfer-panel-bad {
  background: rgb(var(--c-danger) / 0.08);
  border-color: rgb(var(--c-danger) / 0.28);
}
.dark .xfer-panel-ok {
  background: rgb(var(--c-success) / 0.14);
  border-color: rgb(var(--c-success) / 0.34);
}
.dark .xfer-panel-bad {
  background: rgb(var(--c-danger) / 0.14);
  border-color: rgb(var(--c-danger) / 0.34);
}
</style>
