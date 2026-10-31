<template>
  <div class="space-y-5">
    <!-- 文件选择区域：卡片标题行 + 正文（与「导入 & 导出」页的导入卡片刻度一致） -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
      <div class="card-head mb-1">
        <AppIcon scale="md" name="upload" class="text-primary" />
        <!-- 「只支持 .xlsx / .xls 文件」是**选择文件按钮**的格式限制说明 → 按钮气泡（见下） -->
        <h3 class="card-head-title gradient-text">{{ tt('import.instructions') }}</h3>
      </div>
      <div class="flex items-center gap-3 flex-wrap relative z-10">
        <!-- a11y：原实现是一个包着 `class="hidden"` 文件框的 <label>。
             label 本身不可聚焦、内部 input 又是 display:none，结果**键盘用户完全无法选择文件**
             （实测本页原本只有「开始导入 / 清空日志」两个 Tab 位）。这里补 role=button + tabindex
             + Enter/Space 触发，同时保留同一个 input[type=file]（导入流程与测试都依赖它）。
             外观统一走 .btn-base + .btn-toned（主题色驱动），不再自写渐变。 -->
        <label role="button" tabindex="0"
          class="btn-base btn-toned cursor-pointer"
          v-tip="tt('toast.onlyExcel')" :aria-label="tt('import.browse')"
          @keydown.enter.prevent="openFileDialog"
          @keydown.space.prevent="openFileDialog">
          <AppIcon scale="sm" name="search" />{{ tt('import.browse') }}
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" @change="onFileChange" class="hidden" />
        </label>
        <div class="flex-1 text-sm min-w-0">
          <span v-if="selectedFile" class="inline-flex items-center gap-1.5 text-sm font-medium text-success-dark animate-scale-in">
            <AppIcon scale="sm" name="check" />{{ selectedFile.name }}
          </span>
          <span v-else class="card-sub">{{ tt('import.noFile') }}</span>
        </div>
        <button @click="startImport" :disabled="!selectedFile || importing"
          class="btn-base btn-primary shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
          <AppIcon scale="sm" :name="importing ? 'clock' : 'video'" />{{ importing ? tt('import.importingButton') : tt('import.start') }}
        </button>
      </div>
      <!-- 导入进度：日志里的「已处理 x/y 行」是文字流，读屏只能听到一串数字。
           这里补一个真正的 progressbar（role + aria-valuenow），并在进行中始终可见。 -->
      <div v-if="importing || progressPct > 0" class="mt-3 relative z-10">
        <!-- 复用既有文案 key（不新增 locales）：progressbar 读成「导入中… N%」 -->
        <div role="progressbar" :aria-label="tt('import.importingButton')"
          :aria-valuenow="progressPct" aria-valuemin="0" aria-valuemax="100"
          class="h-1.5 w-full rounded-full bg-primary/15 overflow-hidden">
          <div class="h-full rounded-full bg-gradient-to-r from-primary to-primary-dark transition-[width] duration-300"
            :style="{ width: progressPct + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 导入说明（第一部分） -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
      <div class="card-head mb-3">
        <AppIcon scale="md" name="log" class="text-primary" />
        <h3 class="card-head-title gradient-text">{{ tt('import.instructions') }}</h3>
      </div>
      <div class="text-sm text-gray-600 space-y-2 leading-relaxed">
        <p>{{ tt('import.step1') }}</p>
        <ul class="ml-6 list-disc space-y-1">
          <li>{{ tt('import.step1L1') }}</li>
          <li>{{ tt('import.step1L2') }}</li>
          <li>{{ tt('import.step1L3') }}</li>
        </ul>
        <p>{{ tt('import.step2') }}</p>
        <ul class="ml-6 list-disc space-y-1">
          <li>{{ tt('import.step2L1') }}</li>
          <li>{{ tt('import.step2L2') }}</li>
          <li>{{ tt('import.step2L3') }}</li>
          <li>{{ tt('import.step2L4') }}</li>
        </ul>
        <p>{{ tt('import.step3') }}</p>
        <ul class="ml-6 list-disc space-y-1">
          <li>{{ tt('import.step3L1') }}</li>
          <li>{{ tt('import.step3L2') }}</li>
        </ul>
      </div>
    </div>

    <!-- 导入说明（其余段落） -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
      <div class="card-head mb-3">
        <AppIcon scale="md" name="note" class="text-primary" />
        <h3 class="card-head-title gradient-text">{{ tt('import.step4') }}</h3>
      </div>
      <div class="text-sm text-gray-600 space-y-2 leading-relaxed">
        <ul class="ml-6 list-disc space-y-1">
          <li>{{ tt('import.step4L1') }}</li>
          <li>{{ tt('import.step4L2') }}</li>
          <li>{{ tt('import.step4L3') }}</li>
        </ul>
        <p>{{ tt('import.step5') }}</p>
        <ul class="ml-6 list-disc space-y-1">
          <li>{{ tt('import.step5L1') }}</li>
          <li>{{ tt('import.step5L2') }}</li>
          <li>{{ tt('import.step5L3') }}</li>
        </ul>
      </div>
    </div>

    <!-- 日志区域 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 overflow-hidden">
      <div class="card-head px-6 pt-4 pb-3 border-b border-white/20">
        <AppIcon scale="md" name="log" class="text-primary" />
        <h3 class="card-head-title gradient-text">{{ tt('import.log') }}</h3>
        <button @click="clearLog" class="btn-base btn-neutral log-clear ml-auto">
          <AppIcon scale="sm" name="trash" />{{ tt('import.clearLog') }}
        </button>
      </div>
      <div ref="logContainer"
        class="h-64 overflow-y-auto px-6 py-4 font-mono text-xs space-y-1 rounded-b-2xl"
        style="background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%); color: #a7f3d0;">
        <div v-if="logs.length === 0" class="log-empty inline-flex items-center gap-1.5"><AppIcon scale="sm" name="sparkle" />{{ tt('import.waiting') }}</div>
        <!-- 日志等级色：底是固定的深蓝渐变（#1a1a2e→#16213e），实测各等级对比度
             error #F87171 6.17 / warning #FBBF24 10.22 / success #4ADE80 9.79 / 普通 #9CA3AF 6.72，
             都 ≥4.5。原先 empty 态用 text-gray-500（#6B7280）只有 3.53:1，已改为 gray-400。 -->
        <div v-for="(log, idx) in logs" :key="idx"
          class="transition-all duration-200 animate-slide-up"
          :class="log.type === 'error' ? 'text-red-400' : log.type === 'warning' ? 'text-yellow-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-400'">
          {{ log.message }}
        </div>
      </div>
    </div>

    <!-- Toast 通知由 App.vue 的 ToastHost 统一渲染 -->
  </div>
</template>

<script setup>
import { ref, nextTick, computed } from 'vue'
import { importApi } from '../db/api'
import { showToast } from '../composables/useToast'
import { importState, addImportLog, clearImportLog } from '../composables/useImportTask'
import { useI18n } from '../composables/useI18n'

const { tt } = useI18n()

// 任务状态来自模块级单例：切走路由再回来，日志与进度都还在
const selectedFile = importState.selectedFile
const importing = importState.importing
const logs = importState.logs
const logContainer = ref(null)
const fileInputRef = ref(null)

/**
 * 导入进度（0..100），只用于顶部 progressbar 的 aria-valuenow。
 * 与日志里的「已处理 x/y 行」同源：两者都在 onProgress 里更新，
 * 之所以单独存一份 state，是因为日志是**文本流**，读屏连读数字没有「进度」语义。
 */
const progressPct = ref(0)

/** 键盘等价路径：Enter / Space 打开系统文件选择器（label 本身不是可聚焦控件） */
const openFileDialog = () => {
  if (importing.value) return
  fileInputRef.value?.click()
}

const addLog = (message, type = 'info') => {
  addImportLog(message, type)
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}

const MAX_IMPORT_BYTES = 20 * 1024 * 1024

/** 把任意异常/字符串转成可读消息（导入链路上层可能抛裸字符串或 undefined） */
const safeErrorMessage = (err) => {
  // 兜底文案复用既有 key（toast.failed），避免为极小概率分支新增 i18n 条目
  const fallback = tt('toast.failed')
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (typeof err.message === 'string' && err.message) return err.message
  try {
    const s = String(err)
    return s && s !== '[object Object]' ? s : fallback
  } catch {
    return fallback
  }
}

const onFileChange = (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    showToast(tt('toast.onlyExcel'), 'error')
    return
  }
  if (file.size > MAX_IMPORT_BYTES) {
    showToast(tt('toast.fileTooLarge'), 'error')
    return
  }
  selectedFile.value = file
  progressPct.value = 0
  addLog(tt('import.fileChosen', { name: file.name }))
}

const startImport = async () => {
  if (importing.value) return          // 全局锁：禁止并发/重复导入
  if (!selectedFile.value) {
    showToast(tt('toast.pleaseSelectExcel'), 'warning')
    return
  }

  // 锁必须在 finally 里释放：任何一条异常路径（包括导入器抛裸字符串、
  // 或 addLog/showToast 本身抛错）都不能把 importing 永久卡在 true ——
  // 那样「开始导入」按钮会一直是禁用态，用户以为页面坏了，只能刷新。
  importing.value = true
  progressPct.value = 0
  try {
    addLog(tt('import.importing'))
    addLog('─'.repeat(50))

    const formData = new FormData()
    formData.append('file', selectedFile.value)

    // 进度回调：每处理一批行回报一次，让用户知道没有卡死
    let lastTenth = -1
    const res = await importApi.upload(formData, {
      onProgress: (done, total) => {
        if (!total) return
        const tenth = Math.floor((done / total) * 10)
        if (tenth <= lastTenth || tenth < 1) return
        lastTenth = tenth
        progressPct.value = Math.min(100, tenth * 10)
        addLog(tt('import.progress', { done, total, percent: tenth * 10 }))
      },
    })
    // 防御：导入器可能返回 undefined / null（例如被意外短路），
    // 直接读 result.success 会抛 TypeError，看起来就是「导入崩溃」。
    const result = res?.data
    if (!result || typeof result !== 'object') {
      throw new Error(tt('toast.failed'))
    }

    if (result.success) {
      addLog(tt('import.success', { message: result.message ?? '' }), 'success')
      addLog(tt('import.importedCount', { count: result.imported ?? 0 }), 'success')

      if (result.errors && result.errors.length > 0) {
        addLog('', 'info')
        addLog(tt('import.errorsTitle'), 'warning')
        const displayErrors = result.errors.slice(0, 20)
        for (const error of displayErrors) {
          addLog(`  • ${error}`, 'error')
        }
        if (result.errors.length > 20) {
          addLog(tt('import.moreErrors', { count: result.errors.length - 20 }), 'warning')
        }
      }

      showToast(result.message || tt('import.importedCount', { count: result.imported ?? 0 }))
    } else {
      addLog(`✗ ${result.message}`, 'error')
      showToast(result.message, 'error')
    }
  } catch (err) {
    const errorMsg = tt('import.errorPrefix', { message: safeErrorMessage(err) })
    addLog(`✗ ${errorMsg}`, 'error')
    showToast(errorMsg, 'error')
  } finally {
    addLog('─'.repeat(50))
    importing.value = false
  }
}

const clearLog = () => {
  clearImportLog()
}
</script>
<style scoped>
/*
 * 日志区专用：底是固定深蓝渐变（#1a1a2e → #16213e），与卡片玻璃底完全不同，
 * 因此空态文字不能用 .empty-inline 的浅色灰（那是给玻璃底算的），
 * 这里单独给一档更亮的灰（gray-300 ≈ 11:1）。
 * 注意：不能复用 .text-gray-400 —— 深色模式的全局 `.dark .text-gray-400`
 * 会把它压到 #7c8ba5，压在这块深蓝上就偏暗了。
 */
.log-empty {
  color: #d1d5db;
}

/* 日志区右上角的「清空日志」：深蓝底上要浅色描边 + 浅色字，
   而 .btn-neutral 是按玻璃底算的深色字，直接放上来会糊住。 */
.log-clear {
  color: #cbd5e1 !important;
  border-color: rgba(255, 255, 255, 0.18) !important;
  background: rgba(255, 255, 255, 0.08) !important;
}

.log-clear:hover {
  color: #f1f5f9 !important;
  background: rgba(255, 255, 255, 0.16) !important;
}
</style>