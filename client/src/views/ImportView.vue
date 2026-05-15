<template>
  <div class="space-y-5">
    <!-- 文件选择区域 -->
    <div class="glass rounded-2xl shadow-lg border-2 border-primary/20 px-6 py-5 shine-border">
      <div class="flex items-center gap-4 flex-wrap relative z-10">
        <label class="px-5 py-2.5 bg-gradient-to-r from-primary to-primary-light text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 btn-press cursor-pointer">
          🔍 浏览文件
          <input type="file" accept=".xlsx,.xls" @change="onFileChange" class="hidden" />
        </label>
        <div class="flex-1 text-sm text-gray-600">
          <span v-if="selectedFile" class="text-success font-medium animate-scale-in inline-block">✓ {{ selectedFile.name }}</span>
          <span v-else class="text-gray-400">未选择文件</span>
        </div>
        <button @click="startImport" :disabled="!selectedFile || importing"
          class="px-5 py-2.5 bg-gradient-to-r from-success to-emerald-400 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-success/30 transition-all duration-300 btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">
          <span v-if="importing" class="animate-pulse-soft">⏳ 导入中...</span>
          <span v-else>▶️ 开始导入</span>
        </button>
      </div>
    </div>

    <!-- 导入说明 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-5">
      <h3 class="text-sm font-bold gradient-text mb-3">📖 导入说明</h3>
      <div class="text-sm text-gray-600 space-y-2 leading-relaxed">
        <p>1. 准备 Excel 文件（.xlsx 或 .xls）：</p>
        <ul class="ml-6 list-disc space-y-1">
          <li>包含 "正在" 或 "追番" 的工作表 → 导入为追番数据</li>
          <li>包含 "等待" 或 "等番" 的工作表 → 导入为等番数据</li>
          <li>包含 "已看" 或 "历史" 的工作表 → 导入为已看历史数据</li>
        </ul>
        <p>2. 追番表格式（周历布局）：</p>
        <ul class="ml-6 list-disc space-y-1">
          <li>第一行为星期表头（Monday/周二 等），自动识别列对应的星期</li>
          <li>每行第一列为更新时间（Excel 小数格式，如 0.5=12:00）</li>
          <li>番剧名支持 "名称 集数" 格式自动提取集数</li>
          <li>单元格中的超链接会自动导入为 URL 字段</li>
        </ul>
        <p>3. 等番表格式：</p>
        <ul class="ml-6 list-disc space-y-1">
          <li>每行一条：番剧名称 | 预计日期 | 备注</li>
          <li>预计日期支持：2025/07、2025/07/15、2025/07/15 14:30 等格式</li>
        </ul>
        <p>4. 已看历史表格式：</p>
        <ul class="ml-6 list-disc space-y-1">
          <li>支持合并单元格年份（如 2014~2017）</li>
          <li>作品名支持 "名称 (备注)" 格式自动提取备注</li>
          <li>日期支持：年份(2025)、年月(2025/07)、完整日期(2025/07/15 14:30)、年份范围(2014~2017)</li>
        </ul>
        <p>5. 通用说明：</p>
        <ul class="ml-6 list-disc space-y-1">
          <li>导入顺序与 Excel 中的排列完全一致</li>
          <li>表头行、星期关键词等会自动跳过，不会被当作数据导入</li>
          <li>重复导入会追加数据，不会覆盖已有记录</li>
        </ul>
      </div>
    </div>

    <!-- 日志区域 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 overflow-hidden">
      <div class="px-6 py-3 border-b border-white/20 flex items-center justify-between">
        <h3 class="text-sm font-bold gradient-text">📋 导入日志</h3>
        <button @click="clearLog" class="text-xs text-gray-400 hover:text-primary transition btn-press">🗑️ 清空日志</button>
      </div>
      <div ref="logContainer"
        class="h-64 overflow-y-auto px-6 py-4 font-mono text-xs space-y-1 rounded-b-2xl"
        style="background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%); color: #a7f3d0;">
        <div v-if="logs.length === 0" class="text-gray-500 animate-pulse-soft">✨ 等待导入...</div>
        <div v-for="(log, idx) in logs" :key="idx"
          class="transition-all duration-200 animate-slide-up"
          :class="log.type === 'error' ? 'text-red-400' : log.type === 'warning' ? 'text-yellow-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-400'">
          {{ log.message }}
        </div>
      </div>
    </div>

    <!-- Toast -->
    <Teleport to="body">
      <transition name="toast">
        <div v-if="toast.show" class="fixed top-6 right-6 z-[100]">
          <div class="px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white animate-slide-down"
            :class="toast.type==='success'?'bg-gradient-to-r from-success to-emerald-400':toast.type==='error'?'bg-gradient-to-r from-danger to-red-400':'bg-gradient-to-r from-warning to-amber-400'">
            {{ toast.message }}
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { importApi } from '../api'

const selectedFile = ref(null)
const importing = ref(false)
const logs = ref([])
const logContainer = ref(null)

const toast = ref({ show: false, message: '', type: 'success' })

const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

const addLog = (message, type = 'info') => {
  logs.value.push({ message, type })
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}

const onFileChange = (event) => {
  const file = event.target.files[0]
  if (file) {
    selectedFile.value = file
    addLog(`已选择文件: ${file.name}`)
  }
}

const startImport = async () => {
  if (!selectedFile.value) {
    showToast('请先选择一个 Excel 文件', 'warning')
    return
  }

  importing.value = true
  addLog('正在导入数据...')
  addLog('─'.repeat(50))

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)

    const res = await importApi.upload(formData)
    const result = res.data

    if (result.success) {
      addLog(`✓ ${result.message}`, 'success')
      addLog(`成功导入: ${result.imported} 条`, 'success')

      if (result.errors && result.errors.length > 0) {
        addLog('', 'info')
        addLog('⚠️ 警告/错误:', 'warning')
        const displayErrors = result.errors.slice(0, 20)
        for (const error of displayErrors) {
          addLog(`  • ${error}`, 'error')
        }
        if (result.errors.length > 20) {
          addLog(`  ... 还有 ${result.errors.length - 20} 个错误`, 'warning')
        }
      }

      showToast(result.message)
    } else {
      addLog(`✗ ${result.message}`, 'error')
      showToast(result.message, 'error')
    }
  } catch (err) {
    const errorMsg = `导入出错: ${err.message}`
    addLog(`✗ ${errorMsg}`, 'error')
    showToast(errorMsg, 'error')
  }

  addLog('─'.repeat(50))
  importing.value = false
}

const clearLog = () => {
  logs.value = []
}
</script>
