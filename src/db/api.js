/**
 * 浏览器端 API 层
 * 将原来的 axios HTTP 调用替换为直接调用本地数据库
 * 返回格式与原 API 保持一致: { data: { success, data, ... } }
 */

import { getDb } from './index'

// ========== 追番 API ==========

export const watchingApi = {
  getAll: async () => {
    const db = await getDb()
    return { data: { success: true, data: db.getAllWatching() } }
  },
  getByDay: async (day) => {
    const db = await getDb()
    return { data: { success: true, data: db.getWatchingByDay(day) } }
  },
  add: async (data) => {
    const db = await getDb()
    const result = db.addWatching(data)
    return { data: result }
  },
  update: async (id, data) => {
    const db = await getDb()
    const result = db.updateWatching(id, data)
    return { data: result }
  },
  delete: async (id) => {
    const db = await getDb()
    const result = db.deleteWatching(id)
    return { data: result }
  },
  increment: async (id) => {
    const db = await getDb()
    const result = db.incrementEpisode(id)
    return { data: result }
  },
  decrement: async (id) => {
    const db = await getDb()
    const result = db.decrementEpisode(id)
    return { data: result }
  },
  moveToRemaining: async (id) => {
    const db = await getDb()
    const result = db.moveWatchingToRemaining(id)
    return { data: result }
  },
  moveToWatched: async (id, watchDate) => {
    const db = await getDb()
    const result = db.moveWatchingToWatched(id, watchDate)
    return { data: result }
  }
}

// ========== 等番 API ==========

export const remainingApi = {
  getAll: async () => {
    const db = await getDb()
    return { data: { success: true, data: db.getAllRemaining() } }
  },
  add: async (data) => {
    const db = await getDb()
    const result = db.addRemaining(data)
    return { data: result }
  },
  update: async (id, data) => {
    const db = await getDb()
    const result = db.updateRemaining(id, data)
    return { data: result }
  },
  delete: async (id) => {
    const db = await getDb()
    const result = db.deleteRemaining(id)
    return { data: result }
  },
  moveToWatching: async (id, data) => {
    const db = await getDb()
    const result = db.moveRemainingToWatching(id, data)
    return { data: result }
  }
}

// ========== 已看 API ==========

export const watchedApi = {
  getAll: async () => {
    const db = await getDb()
    return { data: { success: true, data: db.getAllWatched() } }
  },
  getByYear: async (year) => {
    const db = await getDb()
    const data = db.getWatchedByYear(year)
    const yearCount = db.getWatchedCountByYear(year)
    const totalCount = db.getTotalWatchedCount()
    return { data: { success: true, data, yearCount, totalCount } }
  },
  add: async (data) => {
    const db = await getDb()
    const result = db.addWatched(data)
    return { data: result }
  },
  update: async (id, data) => {
    const db = await getDb()
    const result = db.updateWatched(id, data)
    return { data: result }
  },
  delete: async (id) => {
    const db = await getDb()
    const result = db.deleteWatched(id)
    return { data: result }
  }
}

// ========== 已看年份 API ==========

export const watchedYearsApi = {
  getAll: async () => {
    const db = await getDb()
    return { data: { success: true, data: db.getAllWatchedYears() } }
  },
  add: async (data) => {
    const db = await getDb()
    const result = db.addWatchedYear(data)
    return { data: result }
  },
  update: async (id, data) => {
    const db = await getDb()
    const result = db.updateWatchedYear(id, data)
    return { data: result }
  },
  delete: async (id) => {
    const db = await getDb()
    const result = db.deleteWatchedYear(id)
    return { data: result }
  }
}

// ========== 批量操作 API ==========

export const batchApi = {
  batchDeleteWatching: async (ids) => {
    const db = await getDb()
    const result = db.batchDeleteWatching(ids)
    return { data: result }
  },
  batchDeleteRemaining: async (ids) => {
    const db = await getDb()
    const result = db.batchDeleteRemaining(ids)
    return { data: result }
  },
  batchDeleteWatched: async (ids) => {
    const db = await getDb()
    const result = db.batchDeleteWatched(ids)
    return { data: result }
  },
  clearWatching: async () => {
    const db = await getDb()
    const result = db.clearWatching()
    return { data: result }
  },
  clearRemaining: async () => {
    const db = await getDb()
    const result = db.clearRemaining()
    return { data: result }
  },
  clearWatched: async () => {
    const db = await getDb()
    const result = db.clearWatched()
    return { data: result }
  },
  clearWatchedYears: async () => {
    const db = await getDb()
    const result = db.clearWatchedYears()
    return { data: result }
  },
  clearAll: async () => {
    const db = await getDb()
    const result = db.clearAll()
    return { data: result }
  }
}

// ========== 导入 API ==========

export const importApi = {
  upload: async (formData) => {
    const { importExcel } = await import('./excelImporter')
    const file = formData.get('file')
    const result = await importExcel(file)
    return { data: result }
  }
}
