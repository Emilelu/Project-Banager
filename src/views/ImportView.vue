<template>
  <div class="space-y-5">
    <!-- 文件选择区域 -->
    <div class="glass rounded-2xl shadow-lg border-2 border-primary/20 px-6 py-5 shine-border">
      <div class="flex items-center gap-4 flex-wrap relative z-10">
        <label class="px-5 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 btn-press cursor-pointer">
          <AppIcon scale="sm" name="search" /> {{ tt('import.browse') }}
          <input type="file" accept=".xlsx,.xls" @change="onFileChange" class="hidden" />
        </label>
        <div class="flex-1 text-sm text-gray-600">
          <span v-if="selectedFile" class="text-success font-medium animate-scale-in inline-block"><AppIcon scale="sm" name="check" /> {{ selectedFile.name }}</span>
          <span v-else class="text-gray-400">{{ tt('import.noFile') }}</span>
        </div>
        <button @click="startImport" :disabled="!selectedFile || importing"
          class="px-5 py-2.5 bg-gradient-to-r from-success to-emerald-400 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-success/30 transition-all duration-300 btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">
          <span v-if="importing" class="inline-flex items-center gap-1.5"><AppIcon scale="sm" name="clock" />{{ tt('import.importingButton') }}</span>
          <span v-else class="inline-flex items-center gap-1.5"><AppIcon scale="sm" name="video" />{{ tt('import.start') }}</span>
        </button>
      </div>
    </div>

    <!-- 导入说明 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-5">
      <h3 class="text-sm font-bold gradient-text mb-3"><AppIcon scale="lg" name="log" /> {{ tt('import.instructions') }}</h3>
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
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-5">
      <div class="text-sm text-gray-600 space-y-2 leading-relaxed">
        <p>{{ tt('import.step4') }}</p>
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
      <div class="px-6 py-3 border-b border-white/20 flex items-center justify-between">
        <h3 class="text-sm font-bold gradient-text"><AppIcon scale="lg" name="log" /> {{ tt('import.log') }}</h3>
        <button @click="clearLog" class="text-xs text-gray-400 hover:text-primary transition btn-press"><AppIcon scale="lg" name="trash" /> {{ tt('import.clearLog') }}</button>
      </div>
      <div ref="logContainer"
        class="h-64 overflow-y-auto px-6 py-4 font-mono text-xs space-y-1 rounded-b-2xl"
        style="background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%); color: #a7f3d0;">
        <div v-if="logs.length === 0" class="text-gray-500"><AppIcon scale="sm" name="sparkle" /> {{ tt('import.waiting') }}</div>
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

const addLog = (message, type = 'info') => {
  addImportLog(message, type)
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}

const MAX_IMPORT_BYTES = 20 * 1024 * 1024
const onFileChange = (event) => {
  const file = event.target.files[0]
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
  addLog(tt('import.fileChosen', { name: file.name }))
}

const startImport = async () => {
  if (importing.value) return          // 全局锁：禁止并发/重复导入
  if (!selectedFile.value) {
    showToast(tt('toast.pleaseSelectExcel'), 'warning')
    return
  }

  importing.value = true
  addLog(tt('import.importing'))
  addLog('─'.repeat(50))

  try {
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
        addLog(tt('import.progress', { done, total, percent: tenth * 10 }))
      },
    })
    const result = res.data

    if (result.success) {
      addLog(tt('import.success', { message: result.message }), 'success')
      addLog(tt('import.importedCount', { count: result.imported }), 'success')

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

      showToast(result.message)
    } else {
      addLog(`✗ ${result.message}`, 'error')
      showToast(result.message, 'error')
    }
  } catch (err) {
    const errorMsg = tt('import.errorPrefix', { message: err.message })
    addLog(`✗ ${errorMsg}`, 'error')
    showToast(errorMsg, 'error')
  }

  addLog('─'.repeat(50))
  importing.value = false
}

const clearLog = () => {
  clearImportLog()
}
</script>
