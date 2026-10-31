/**
 * 导入任务状态（模块级单例）
 *
 * 为什么不在 ImportView 里放 ref：
 *   `logs` / `importing` / `selectedFile` 原先是组件局部状态，路由切走即销毁，
 *   但导入是异步的 —— 回来时日志空了、按钮又能点，同一文件可以再导一遍，
 *   已看表没有唯一约束，会直接产生重复数据。
 * 现在把状态提到模块级，组件只是它的视图；并加全局锁禁止并发导入。
 */
import { ref } from 'vue'

export const importState = {
  selectedFile: ref(null),
  importing: ref(false),
  logs: ref([]),
}

const MAX_LOGS = 400

export function addImportLog(message, type = 'info') {
  importState.logs.value.push({ message, type })
  if (importState.logs.value.length > MAX_LOGS) {
    importState.logs.value.splice(0, importState.logs.value.length - MAX_LOGS)
  }
}

export function clearImportLog() {
  importState.logs.value = []
}

export function resetImportTask() {
  importState.selectedFile.value = null
  importState.importing.value = false
  clearImportLog()
}
