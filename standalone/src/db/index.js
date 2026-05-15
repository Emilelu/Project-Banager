/**
 * 浏览器端数据库模块
 * 使用 sql.js (WASM) + IndexedDB 持久化
 * 完全兼容 server/database.js 的业务逻辑
 */

import initSqlJs from 'sql.js'

const DB_NAME = 'BangumiManagerDB'
const DB_STORE = 'database'
const DB_KEY = 'bangumi_db'

let dbInstance = null
let _SQL = null  // 缓存 initSqlJs 返回的 SQL 构造器

// WASM 内联加载器
// 构建时通过 vite-plugin-wasm-inline 将 WASM 内联为 base64
// 运行时从内联数据解码，无需网络请求，支持 file:// 协议
async function loadWasmBinary() {
  try {
    // 动态导入构建时生成的 WASM base64 数据模块
    const wasmModule = await import('./wasmInline.js')
    if (wasmModule.default) {
      const binaryString = atob(wasmModule.default)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      return bytes
    }
  } catch (e) {
    console.warn('内联 WASM 加载失败，尝试 CDN...', e)
  }

  // 回退：从 CDN 加载（需要网络和 http/https 协议）
  try {
    const response = await fetch('https://sql.js.org/dist/sql-wasm.wasm')
    const arrayBuffer = await response.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  } catch (e) {
    console.error('WASM 加载失败，请通过 http 服务访问或确保网络可用', e)
    throw new Error('无法加载数据库引擎(WASM)，请通过本地服务器访问页面，或确保网络连接正常')
  }
}

class BangumiDatabase {
  constructor(db) {
    this.db = db
    this.initTables()
  }

  static async create() {
    if (dbInstance) return dbInstance

    const wasmBinary = await loadWasmBinary()
    const SQL = await initSqlJs({
      ...(wasmBinary ? { wasmBinary } : { locateFile: file => `https://sql.js.org/dist/${file}` })
    })
    _SQL = SQL  // 缓存 SQL 构造器供 importDb 使用

    let db
    // 尝试从 IndexedDB 恢复
    const savedData = await loadFromIndexedDB()
    if (savedData) {
      db = new SQL.Database(new Uint8Array(savedData))
    } else {
      db = new SQL.Database()
    }

    dbInstance = new BangumiDatabase(db)
    dbInstance._fixDateFormats()
    return dbInstance
  }

  // ========== IndexedDB 持久化 ==========

  save() {
    const data = this.db.export()
    saveToIndexedDB(data)
  }

  // ========== 数据库导入/导出 ==========

  /**
   * 导入外部 .db 文件，覆盖当前数据库
   * @param {Uint8Array} data - SQLite 数据库二进制数据
   */
  importDb(data) {
    // 关闭旧数据库
    try { this.db.close() } catch (e) { /* ignore */ }

    // 用导入的数据创建新的数据库实例
    // sql.js 的 Database 构造函数挂在 SQL 对象上，不能通过 this.db.constructor 获取
    this.db = new _SQL.Database(data)

    // 确保表结构存在
    this.initTables()
  }

  /**
   * 导出当前数据库为 Uint8Array
   * @returns {Uint8Array}
   */
  export() {
    return this.db.export()
  }

  // ========== 日期格式修复 ==========

  _fixDateFormats() {
    try {
      const watchedRows = this._all("SELECT id, watch_date FROM watched WHERE watch_date LIKE '%-%'")
      for (const row of watchedRows) {
        const fixed = row.watch_date.replace(/-/g, '/')
        this._run('UPDATE watched SET watch_date = ? WHERE id = ?', [fixed, row.id])
      }
      const remainingRows = this._all("SELECT id, expected_date FROM remaining WHERE expected_date LIKE '%-%'")
      for (const row of remainingRows) {
        const fixed = row.expected_date.replace(/-/g, '/')
        this._run('UPDATE remaining SET expected_date = ? WHERE id = ?', [fixed, row.id])
      }
    } catch (e) {
      console.error('日期格式修复失败:', e.message)
    }
  }

  _normalizeDate(dateStr) {
    if (!dateStr) return dateStr
    return String(dateStr).replace(/-/g, '/')
  }

  // ========== 表初始化 ==========

  initTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS watching (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        day_of_week TEXT,
        time_slot TEXT,
        current_episode TEXT DEFAULT '0',
        url TEXT,
        url_params TEXT,
        notes TEXT,
        sort_order REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS remaining (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        expected_date TEXT,
        url TEXT,
        url_params TEXT,
        notes TEXT,
        sort_order REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS watched (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        watch_date TEXT,
        url TEXT,
        url_params TEXT,
        notes TEXT,
        sort_order REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS watched_years (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year_label TEXT NOT NULL UNIQUE,
        sort_order REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 迁移
    this._migrateAddColumn('watching', 'sort_order', 'REAL DEFAULT 0')
    this._migrateAddColumn('remaining', 'sort_order', 'REAL DEFAULT 0')
    this._migrateAddColumn('watched', 'sort_order', 'REAL DEFAULT 0')
    this._migrateAddColumn('watched', 'watch_date', 'TEXT')
    this._migrateAddColumn('watching', 'url', 'TEXT')
    this._migrateAddColumn('remaining', 'url', 'TEXT')
    this._migrateAddColumn('watched', 'url', 'TEXT')
    this._migrateAddColumn('watching', 'url_params', 'TEXT')
    this._migrateAddColumn('remaining', 'url_params', 'TEXT')
    this._migrateAddColumn('watched', 'url_params', 'TEXT')

    this._migrateWatchingEpisodeToText()

    try {
      this.db.run(`UPDATE watched SET watch_date = watch_year WHERE watch_date IS NULL OR watch_date = ''`)
    } catch(e) {}

    this.save()
  }

  _migrateWatchingEpisodeToText() {
    try {
      const info = this._all(`PRAGMA table_info(watching)`)
      const episodeCol = info.find(col => col.name === 'current_episode')
      if (episodeCol && episodeCol.type === 'TEXT') return
      this.db.run(`ALTER TABLE watching RENAME TO watching_old`)
      this.db.run(`
        CREATE TABLE watching (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          day_of_week TEXT,
          time_slot TEXT,
          current_episode TEXT DEFAULT '0',
          url TEXT,
          notes TEXT,
          sort_order REAL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      this.db.run(`
        INSERT INTO watching (id, name, day_of_week, time_slot, current_episode, url, notes, sort_order, created_at, updated_at)
        SELECT id, name, day_of_week, time_slot, CAST(current_episode AS TEXT), url, notes, sort_order, created_at, updated_at
        FROM watching_old
      `)
      this.db.run(`DROP TABLE watching_old`)
    } catch(e) {
      try { this.db.run(`DROP TABLE IF EXISTS watching_old`) } catch(e2) {}
    }
  }

  _migrateAddColumn(table, column, def) {
    try {
      const info = this._all(`PRAGMA table_info(${table})`)
      const exists = info.some(col => col.name === column)
      if (!exists) {
        this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
      }
    } catch(e) {}
  }

  _all(sql, params = []) {
    const stmt = this.db.prepare(sql)
    stmt.bind(params)
    const rows = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows
  }

  _get(sql, params = []) {
    const stmt = this.db.prepare(sql)
    stmt.bind(params)
    let row = null
    if (stmt.step()) {
      row = stmt.getAsObject()
    }
    stmt.free()
    return row
  }

  _run(sql, params = []) {
    this.db.run(sql, params)
    this.save()
  }

  // ========== 追番表操作 ==========

  addWatching({ name, day_of_week = '', time_slot = '', current_episode = '0', url = '', url_params = '', notes = '', sort_order = 0 }) {
    try {
      this._run(
        'INSERT INTO watching (name, day_of_week, time_slot, current_episode, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, day_of_week, time_slot, current_episode, url, url_params, notes, sort_order]
      )
      return { success: true }
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: '该番剧已存在' }
      }
      return { success: false, error: err.message }
    }
  }

  getAllWatching() {
    return this._all(
      'SELECT id, name, day_of_week, time_slot, current_episode, url, url_params, notes, sort_order FROM watching ORDER BY sort_order, id'
    )
  }

  getWatchingByDay(day) {
    return this._all(
      'SELECT id, name, day_of_week, time_slot, current_episode, notes, sort_order FROM watching WHERE day_of_week = ? ORDER BY sort_order, time_slot',
      [day]
    )
  }

  updateWatching(id, fields) {
    const allowedFields = ['name', 'day_of_week', 'time_slot', 'current_episode', 'url', 'url_params', 'notes', 'sort_order']
    const updateFields = {}
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        if (key === 'current_episode') {
          const numVal = parseFloat(fields[key])
          updateFields[key] = isNaN(numVal) ? '0' : String(fields[key])
        } else {
          updateFields[key] = fields[key]
        }
      }
    }
    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: '没有可更新的字段' }
    }
    const setClause = Object.keys(updateFields).map(k => `${k} = ?`).join(', ')
    const values = [...Object.values(updateFields), id]
    try {
      this._run(
        `UPDATE watching SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      )
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  deleteWatching(id) {
    try {
      this._run('DELETE FROM watching WHERE id = ?', [id])
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  _smartIncrement(current) {
    const str = String(current || '0')
    if (str.includes('.')) {
      const dotIndex = str.indexOf('.')
      const intPart = str.substring(0, dotIndex)
      const decimalStr = str.substring(dotIndex + 1)
      const newDecimal = parseInt(decimalStr, 10) + 1
      return intPart + '.' + String(newDecimal)
    }
    const intVal = parseInt(str, 10) || 0
    return String(intVal + 1)
  }

  _smartDecrement(current) {
    const str = String(current || '0')
    if (str.includes('.')) {
      const dotIndex = str.indexOf('.')
      const intPart = str.substring(0, dotIndex)
      const decimalStr = str.substring(dotIndex + 1)
      const decVal = parseInt(decimalStr, 10)
      if (decVal <= 0) return '0'
      const newDecimal = decVal - 1
      return intPart + '.' + String(newDecimal)
    }
    const intVal = parseInt(str, 10) || 0
    return String(Math.max(0, intVal - 1))
  }

  incrementEpisode(id) {
    try {
      const row = this._get('SELECT current_episode FROM watching WHERE id = ?', [id])
      if (!row) return { success: false, error: '未找到记录' }
      const newVal = this._smartIncrement(row.current_episode)
      this._run(
        'UPDATE watching SET current_episode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newVal, id]
      )
      return { success: true, current_episode: newVal }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  decrementEpisode(id) {
    try {
      const row = this._get('SELECT current_episode FROM watching WHERE id = ?', [id])
      if (!row) return { success: false, error: '未找到记录' }
      const newVal = this._smartDecrement(row.current_episode)
      this._run(
        'UPDATE watching SET current_episode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newVal, id]
      )
      return { success: true, current_episode: newVal }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // ========== 等番表操作 ==========

  addRemaining({ name, expected_date = '', url = '', url_params = '', notes = '', sort_order = 0 }) {
    try {
      const normalizedDate = this._normalizeDate(expected_date)
      this._run(
        'INSERT INTO remaining (name, expected_date, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [name, normalizedDate, url, url_params, notes, sort_order]
      )
      return { success: true }
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: '该等番已存在' }
      }
      return { success: false, error: err.message }
    }
  }

  getAllRemaining() {
    return this._all(
      'SELECT id, name, expected_date, url, url_params, notes, sort_order FROM remaining ORDER BY sort_order, id'
    )
  }

  updateRemaining(id, fields) {
    const allowedFields = ['name', 'expected_date', 'url', 'url_params', 'notes', 'sort_order']
    const updateFields = {}
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        if (key === 'expected_date') {
          updateFields[key] = this._normalizeDate(fields[key])
        } else {
          updateFields[key] = fields[key]
        }
      }
    }
    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: '没有可更新的字段' }
    }
    const setClause = Object.keys(updateFields).map(k => `${k} = ?`).join(', ')
    const values = [...Object.values(updateFields), id]
    try {
      this._run(
        `UPDATE remaining SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      )
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  deleteRemaining(id) {
    try {
      this._run('DELETE FROM remaining WHERE id = ?', [id])
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // ========== 已看表操作 ==========

  addWatched({ name, watch_date, url = '', url_params = '', notes = '', sort_order = 0 }) {
    try {
      const normalizedDate = this._normalizeDate(watch_date)
      this._run(
        'INSERT INTO watched (name, watch_date, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [name, normalizedDate, url, url_params, notes, sort_order]
      )
      this._ensureYearLabel(normalizedDate)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  getAllWatched() {
    return this._all(
      'SELECT id, name, watch_date, url, url_params, notes, sort_order FROM watched ORDER BY sort_order, id'
    )
  }

  getWatchedByYear(year) {
    return this._all(
      "SELECT id, name, watch_date, url, url_params, notes, sort_order FROM watched WHERE watch_date = ? OR watch_date LIKE ? ORDER BY sort_order, id",
      [year, year + '/%']
    )
  }

  getWatchedCountByYear(year) {
    const row = this._get("SELECT COUNT(*) as count FROM watched WHERE watch_date = ? OR watch_date LIKE ?", [year, year + '/%'])
    return row ? row.count : 0
  }

  getTotalWatchedCount() {
    const row = this._get('SELECT COUNT(*) as count FROM watched')
    return row ? row.count : 0
  }

  updateWatched(id, fields) {
    const allowedFields = ['name', 'watch_date', 'url', 'url_params', 'notes', 'sort_order']
    const updateFields = {}
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        if (key === 'watch_date') {
          updateFields[key] = this._normalizeDate(fields[key])
        } else {
          updateFields[key] = fields[key]
        }
      }
    }
    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: '没有可更新的字段' }
    }
    const setClause = Object.keys(updateFields).map(k => `${k} = ?`).join(', ')
    const values = [...Object.values(updateFields), id]
    try {
      this._run(
        `UPDATE watched SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      )
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  deleteWatched(id) {
    try {
      this._run('DELETE FROM watched WHERE id = ?', [id])
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // ========== 已看年份操作 ==========

  addWatchedYear({ year_label, sort_order = 0 }) {
    try {
      this._run(
        'INSERT INTO watched_years (year_label, sort_order) VALUES (?, ?)',
        [year_label, sort_order]
      )
      return { success: true }
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: '该年份已存在' }
      }
      return { success: false, error: err.message }
    }
  }

  getAllWatchedYears() {
    return this._all(
      'SELECT id, year_label, sort_order FROM watched_years ORDER BY sort_order, id'
    )
  }

  updateWatchedYear(id, fields) {
    const allowedFields = ['year_label', 'sort_order']
    const updateFields = {}
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updateFields[key] = fields[key]
      }
    }
    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: '没有可更新的字段' }
    }
    const setClause = Object.keys(updateFields).map(k => `${k} = ?`).join(', ')
    const values = [...Object.values(updateFields), id]
    try {
      this._run(`UPDATE watched_years SET ${setClause} WHERE id = ?`, values)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  deleteWatchedYear(id) {
    try {
      this._run('DELETE FROM watched_years WHERE id = ?', [id])
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // ========== 批量操作 ==========

  batchDeleteWatching(ids) {
    try {
      const placeholders = ids.map(() => '?').join(',')
      this._run(`DELETE FROM watching WHERE id IN (${placeholders})`, ids)
      return { success: true, deleted: ids.length }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  batchDeleteRemaining(ids) {
    try {
      const placeholders = ids.map(() => '?').join(',')
      this._run(`DELETE FROM remaining WHERE id IN (${placeholders})`, ids)
      return { success: true, deleted: ids.length }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  batchDeleteWatched(ids) {
    try {
      const placeholders = ids.map(() => '?').join(',')
      this._run(`DELETE FROM watched WHERE id IN (${placeholders})`, ids)
      return { success: true, deleted: ids.length }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  clearWatching() {
    try {
      this._run('DELETE FROM watching')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  clearRemaining() {
    try {
      this._run('DELETE FROM remaining')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  clearWatched() {
    try {
      this._run('DELETE FROM watched')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  clearWatchedYears() {
    try {
      this._run('DELETE FROM watched_years')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  clearAll() {
    try {
      this._run('DELETE FROM watching')
      this._run('DELETE FROM remaining')
      this._run('DELETE FROM watched')
      this._run('DELETE FROM watched_years')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // ========== 状态迁移 ==========

  moveWatchingToRemaining(watchingId) {
    try {
      const row = this._get('SELECT name, url, url_params, notes, sort_order FROM watching WHERE id = ?', [watchingId])
      if (row) {
        const addResult = this.addRemaining({ name: row.name, expected_date: '', url: row.url || '', url_params: row.url_params || '', notes: row.notes, sort_order: row.sort_order })
        if (addResult.success) {
          this.deleteWatching(watchingId)
          return { success: true }
        }
        return addResult
      }
      return { success: false, error: '未找到记录' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  moveWatchingToWatched(watchingId, watchDate) {
    try {
      const normalizedDate = this._normalizeDate(watchDate)
      const row = this._get('SELECT name, url, url_params, notes, sort_order FROM watching WHERE id = ?', [watchingId])
      if (row) {
        const addResult = this.addWatched({ name: row.name, watch_date: normalizedDate, url: row.url || '', url_params: row.url_params || '', notes: row.notes, sort_order: row.sort_order })
        if (addResult.success) {
          this._ensureYearLabel(normalizedDate)
          this.deleteWatching(watchingId)
          return { success: true }
        }
        return addResult
      }
      return { success: false, error: '未找到记录' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  _ensureYearLabel(watchDate) {
    if (!watchDate) return
    const v = String(watchDate).trim()
    const rangeMatch = v.match(/^(\d{4})\s*~/)
    if (rangeMatch) {
      this._addYearIfNotExists(rangeMatch[1])
      return
    }
    const yearMatch = v.match(/^(\d{4})/)
    if (yearMatch) {
      this._addYearIfNotExists(yearMatch[1])
    }
  }

  _addYearIfNotExists(yearLabel) {
    const existing = this._get('SELECT id FROM watched_years WHERE year_label = ?', [yearLabel])
    if (!existing) {
      this._run('INSERT INTO watched_years (year_label, sort_order) VALUES (?, 0)', [yearLabel])
    }
  }

  moveRemainingToWatching(remainingId, { day_of_week = '', time_slot = '' } = {}) {
    try {
      const row = this._get('SELECT name, url, url_params, notes, sort_order FROM remaining WHERE id = ?', [remainingId])
      if (row) {
        const addResult = this.addWatching({
          name: row.name,
          day_of_week,
          time_slot,
          current_episode: '0',
          url: row.url || '',
          url_params: row.url_params || '',
          notes: row.notes,
          sort_order: row.sort_order
        })
        if (addResult.success) {
          this.deleteRemaining(remainingId)
          return { success: true }
        }
        return addResult
      }
      return { success: false, error: '未找到记录' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }
}

// ========== IndexedDB 操作 ==========

function openIDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = (e) => {
      const idb = e.target.result
      if (!idb.objectStoreNames.contains(DB_STORE)) {
        idb.createObjectStore(DB_STORE)
      }
    }
    request.onsuccess = (e) => resolve(e.target.result)
    request.onerror = (e) => reject(e.target.error)
  })
}

async function loadFromIndexedDB() {
  try {
    const idb = await openIDB()
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(DB_STORE, 'readonly')
      const store = tx.objectStore(DB_STORE)
      const request = store.get(DB_KEY)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } catch (e) {
    console.warn('从 IndexedDB 加载数据失败:', e)
    return null
  }
}

async function saveToIndexedDB(data) {
  try {
    const idb = await openIDB()
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(DB_STORE, 'readwrite')
      const store = tx.objectStore(DB_STORE)
      store.put(data, DB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('保存到 IndexedDB 失败:', e)
  }
}

/**
 * 获取数据库实例（单例）
 * 供 api.js 和 excelImporter.js 使用
 */
export async function getDb() {
  if (!dbInstance) {
    dbInstance = await BangumiDatabase.create()
  }
  return dbInstance
}

// 同时导出 BangumiDatabase.create 供初始化使用
export { BangumiDatabase }


export default BangumiDatabase
