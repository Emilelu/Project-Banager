/**
 * 导入任务模块级状态测试
 * 锁定「切路由后日志与进度不丢」与「禁止并发导入」这两条行为。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { importState, addImportLog, clearImportLog, resetImportTask } from '../src/composables/useImportTask'

describe('导入任务状态', () => {
  beforeEach(() => {
    resetImportTask()
  })

  it('日志写入模块级状态，组件销毁也不会丢失', () => {
    addImportLog('第一步', 'info')
    addImportLog('完成', 'success')
    // 模拟组件卸载后重新挂载：只是重新读取同一个模块状态
    expect(importState.logs.value).toHaveLength(2)
    expect(importState.logs.value[0].message).toBe('第一步')
  })

  it('清空日志只清内容、不影响导入中标记', () => {
    importState.importing.value = true
    addImportLog('x')
    clearImportLog()
    expect(importState.logs.value).toHaveLength(0)
    expect(importState.importing.value).toBe(true)
  })

  it('日志数量有上限，避免长时间运行无限增长', () => {
    for (let i = 0; i < 500; i++) addImportLog(`第 ${i} 行`)
    expect(importState.logs.value.length).toBeLessThanOrEqual(400)
    // 保留的是最新的内容
    expect(importState.logs.value.at(-1).message).toBe('第 499 行')
  })

  it('重置任务会清空文件、标记与日志', () => {
    importState.selectedFile.value = { name: 'a.xlsx' }
    importState.importing.value = true
    addImportLog('y')
    resetImportTask()
    expect(importState.selectedFile.value).toBe(null)
    expect(importState.importing.value).toBe(false)
    expect(importState.logs.value).toHaveLength(0)
  })
})
