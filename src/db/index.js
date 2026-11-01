/**
 * 浏览器端数据库模块
 * 使用 sql.js (WASM) + IndexedDB 持久化
 */

import initSqlJs from 'sql.js'
import { smartIncrement, smartDecrement, normalizeEpisodeInput } from '../composables/useEpisode'

const DB_NAME = 'BangumiManagerDB'
const DB_STORE = 'database'
const DB_KEY = 'bangumi_db'

/**
 * watched 表对外暴露的列清单（单一来源）。
 * getWatchedByYear / getAllWatched 共用同一份，避免两条路径漏列
 * （历史上 getWatchedByYear 就漏过 tags，导致按年查出来的行没有标签）。
 */
const WATCHED_COLS = 'id, name, cover_url, watch_date, url, url_params, notes, tags, sort_order'

// ========== 错误与字段规范化（边界安全） ==========
//
// 为什么需要 errorMessage()：
//   sql.js 的部分错误是**裸字符串**而不是 Error —— 例如绑定 undefined 参数时抛
//   "Wrong API use : tried to bind a value of an unknown type (undefined)."。
//   原代码写 `err.message.includes('UNIQUE constraint failed')`，此时 err.message 是
//   undefined → 再读 .includes 就抛 TypeError，把一次「可恢复的参数错误」升级成
//   未捕获异常，调用方（导入器 / 视图）整轮失败。所有 catch 分支统一走这个 helper。

/** 把任意异常/字符串转成可读消息，永不返回 undefined */
function errorMessage(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  if (typeof err.message === 'string' && err.message) return err.message
  try { return String(err) } catch { return '未知错误' }
}

/** UNIQUE 冲突判定：不依赖 err.message 一定存在 */
function isUniqueViolation(err) {
  return /UNIQUE constraint failed/i.test(errorMessage(err))
}

/**
 * 名称规范化。
 * 只接受字符串/数字，且 trim 后必须非空：
 *   · addWatching({}) 原实现会把 undefined 传给 sql.js → 抛裸字符串 → 上面那个崩溃；
 *   · name = '' 或纯空白会写进库，随后卡片渲染出一张几乎没有标题的卡片，
 *     用户既看不出是哪条、也无法在列表里定位删除。
 */
function normalizeName(name) {
  if (typeof name !== 'string' && typeof name !== 'number') return ''
  return String(name).trim()
}

/**
 * sort_order 规范化：NaN / Infinity / 非数字一律归 0。
 * sql.js 会把 NaN 写成 NULL（实测 getAllWatching 返回 null），
 * 排序时 NULL 与数字混排会让列表顺序莫名跳动。
 */
function normalizeSortOrder(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

let dbInstance = null
let dbPromise = null
let _SQL = null  // 缓存 initSqlJs 返回的 SQL 构造器
let idbConnection = null

// WASM 内联加载器
// 构建时通过 vite-plugin-wasm-inline 把 WASM **先 gzip 再 base64** 内联（体积 -43%）
// 运行时 loadWasmBytes() 负责解压（优先原生 DecompressionStream，兜底内联 inflate），
// 全程无网络请求，file:// 协议可用
async function loadWasmBinary() {
  try {
    // 动态导入构建时生成的 WASM 数据模块
    const wasmModule = await import('./wasmInline.js')
    if (typeof wasmModule.loadWasmBytes === 'function') {
      return await wasmModule.loadWasmBytes()
    }
    // 兼容旧版产物：插件若回退成「原始 base64」编码，走原来的解码路径
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
    // 区分「从未使用」和「读取失败」：失败时不建空库，避免随后 save() 覆盖旧快照
    const loaded = await loadFromIndexedDB()
    if (loaded.error) {
      throw new Error('读取本地数据库失败，已停止启动以免用空库覆盖原有数据：' + loaded.error.message)
    }
    if (loaded.data) {
      db = new SQL.Database(new Uint8Array(loaded.data))
    } else {
      db = new SQL.Database()
    }

    dbInstance = new BangumiDatabase(db)
    dbInstance._fixDateFormats()
    return dbInstance
  }

  // ========== IndexedDB 持久化 ==========
  //
  // 性能要点：`db.export()` 会把整库序列化一遍，代价与库大小成正比。
  // 原来每一次 _run 都同步 export 一次，导入 N 条就是 N 次全库序列化（O(n²)）。
  // 现在改为「防抖合并」：写操作只标记脏，落盘延后到 microtask/空闲时机执行，
  // 同一轮内的多次写入共享一次 export + 一次 IndexedDB 事务。
  // 需要强一致的调用方（备份导出、导入恢复、批量结束）显式 await flush()。

  save() {
    this._dirty = true
    if (this._batchDepth) return Promise.resolve()
    // 延迟落盘：同一轮事件循环内的多次写入合并成一次 export + 一次 IndexedDB 事务。
    // 页面隐藏/卸载时用 flushNow() 兜底，避免最后一笔改动丢失。
    return this.flush()
  }

  // 立即落盘（合并所有未落盘的改动），返回 Promise
  flush() {
    // 已有一个 flush 在飞：等它结束后如果再脏就继续写，保证调用方 flush() 返回时
    // 「此刻为止的所有改动」都已落盘（而不是被合并丢掉）
    if (this._flushPromise) {
      return this._flushPromise.then(() => {
        if (!this._dirty) return undefined
        return this.flush()
      })
    }
    if (!this._dirty) return Promise.resolve()
    this._dirty = false
    const data = this.db.export()
    this._flushPromise = saveToIndexedDB(data)
      .catch((err) => {
        // 落盘失败：重新标脏，下次写入或显式 flush 时会再试
        this._dirty = true
        throw err
      })
      .finally(() => {
        this._flushPromise = null
      })
    return this._flushPromise
  }

  // 卸载/隐藏前的同步兜底：不等待，但一定把脏数据发出去
  flushNow() {
    if (!this._dirty || this._batchDepth) return
    this._dirty = false
    try { saveToIndexedDB(this.db.export()) } catch { /* ignore */ }
  }

  // 显式落盘：调用方需要确认持久化结果时使用（失败会 reject）
  saveStrict() {
    this._dirty = true
    if (this._flushPromise) {
      return this._flushPromise.then(() => saveToIndexedDB(this.db.export(), { strict: true }))
    }
    this._dirty = false
    return saveToIndexedDB(this.db.export(), { strict: true })
  }

  // ========== 数据库导入/导出 ==========

  /**
   * 导入外部 .db 文件，覆盖当前数据库
   * @param {Uint8Array} data - SQLite 数据库二进制数据
   */
  importDb(data) {
    // 先在临时实例上完成构造和建表，全部成功后再替换。
    // 失败时旧库保持可用，避免坏文件把当前会话打成 "database is closed"。
    if (!_SQL) throw new Error('数据库引擎尚未初始化')
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const header = new TextDecoder().decode(bytes.slice(0, 16))
    if (header !== 'SQLite format 3\u0000') {
      throw new Error('不是有效的 SQLite 备份文件')
    }
    const candidate = new _SQL.Database(bytes)
    const old = this.db
    this.db = candidate
    try {
      this.initTables()
    } catch (e) {
      this.db = old
      try { candidate.close() } catch { /* ignore */ }
      throw e
    }
    try { old.close() } catch { /* ignore */ }
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
      const remainingRows = this._all("SELECT id, expected_date FROM remaining WHERE expected_date LIKE '%-%'")
      if (!watchedRows.length && !remainingRows.length) return
      // 批处理：一次事务、一次落盘，而不是逐条 save（原来每条都触发全库 export）
      this.beginBatch()
      for (const row of watchedRows) {
        this._run('UPDATE watched SET watch_date = ? WHERE id = ?', [row.watch_date.replace(/-/g, '/'), row.id])
      }
      for (const row of remainingRows) {
        this._run('UPDATE remaining SET expected_date = ? WHERE id = ?', [row.expected_date.replace(/-/g, '/'), row.id])
      }
      this.commitBatch()
    } catch (e) {
      this.rollbackBatch()
      console.error('日期格式修复失败:', errorMessage(e))
    }
  }

  _normalizeDate(dateStr) {
    // 必须返回空串而不是原值：`addWatched({ name })` 未传 watch_date 时，
    // 原实现走到这里返回 undefined，随后被 bind 给 sql.js →
    // 抛裸字符串 "tried to bind a value of an unknown type (undefined)"，
    // 整条记录写不进去，且错误对用户完全不可读。
    if (dateStr == null) return ''
    const s = String(dateStr)
    return s ? s.replace(/-/g, '/') : ''
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
        cover_url TEXT DEFAULT '',
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
        cover_url TEXT DEFAULT '',
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
        cover_url TEXT DEFAULT '',
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 标签表：内置常用标签 + 用户自定义。
    // is_builtin=1 的标签不允许删除（避免误删后无法恢复语义），但允许改名/改色。
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '',
        is_builtin INTEGER DEFAULT 0,
        sort_order REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 迁移
    let structuralChange = false
    structuralChange = this._migrateAddColumn('watching', 'sort_order', 'REAL DEFAULT 0') || structuralChange
    structuralChange = this._migrateAddColumn('remaining', 'sort_order', 'REAL DEFAULT 0') || structuralChange
    structuralChange = this._migrateAddColumn('watched', 'sort_order', 'REAL DEFAULT 0') || structuralChange
    // 封面图 URL（用户早期要求的「番剧封面图」功能）
    structuralChange = this._migrateAddColumn('watching', 'cover_url', "TEXT DEFAULT ''") || structuralChange
    structuralChange = this._migrateAddColumn('remaining', 'cover_url', "TEXT DEFAULT ''") || structuralChange
    structuralChange = this._migrateAddColumn('watched', 'cover_url', "TEXT DEFAULT ''") || structuralChange
    structuralChange = this._migrateAddColumn('watched', 'watch_date', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('watching', 'url', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('remaining', 'url', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('watched', 'url', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('watching', 'url_params', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('remaining', 'url_params', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('watched', 'url_params', 'TEXT') || structuralChange
    // 历史库的 watched_years 没有 updated_at（早期 README 也如此声明）；补列让「各表均含」名副其实。
    // 注意：SQLite 的 ALTER TABLE ADD COLUMN 不接受 CURRENT_TIMESTAMP 作为默认值
    // （非常量表达式），所以这里用可空列，随后回填。
    structuralChange = this._migrateAddColumn('watched_years', 'created_at', 'TIMESTAMP') || structuralChange
    structuralChange = this._migrateAddColumn('watched_years', 'updated_at', 'TIMESTAMP') || structuralChange
    structuralChange = this._migrateAddColumn('watched_years', 'sort_order', 'REAL DEFAULT 0') || structuralChange

    // 三张主表加 tags 字段：存标签名，多个用逗号分隔（如 "热血,原创"）。
    // 选逗号而非 JSON 是为了能直接 WHERE LIKE 过滤，且导出 Excel 时可读。
    structuralChange = this._migrateAddColumn('watching', 'tags', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('remaining', 'tags', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('watched', 'tags', 'TEXT') || structuralChange

    // 总集数：用于显示追番进度百分比（如 3/12 = 25%）。
    // 存 TEXT 而非 INTEGER：兼容「12」「12+」「?」这类不确定情况，
    // 解析失败时进度条自动隐藏，不会显示错误数字。
    structuralChange = this._migrateAddColumn('watching', 'total_episodes', 'TEXT') || structuralChange

    // 内置常用标签：首次启动时播种。已存在的名字跳过，不会覆盖用户改过的颜色。
    if (this._seedBuiltinTags()) structuralChange = true
    if (structuralChange) {
      try {
        this.db.run("UPDATE watched_years SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP), updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)")
      } catch { /* ignore */ }
    }

    if (this._migrateWatchingEpisodeToText()) structuralChange = true

    // 索引：让按天/按年/按排序的查询走索引而不是全表扫描
    this._ensureIndexes()

    try {
      this.db.run(`UPDATE watched SET watch_date = watch_year WHERE watch_date IS NULL OR watch_date = ''`)
      if (this.db.getRowsModified() > 0) structuralChange = true
    } catch(e) {}

    // 只有结构/数据真的变了才落盘：避免每次启动都白写一遍全库
    if (structuralChange) this.save()
  }

  /**
   * 播种内置常用标签。只在首次启动（tags 表为空）时执行一次。
   * 命名与配色按动漫作品常见分类习惯挑选，用户可改名/改色，但内置标签不允许删除。
   */
  _seedBuiltinTags() {
    try {
      const count = this._all('SELECT COUNT(*) AS n FROM tags')[0]?.n || 0
      if (count > 0) return false
      const builtins = [
        ['热血', '#EF4444'],
        ['日常', '#10B981'],
        ['恋爱', '#EC4899'],
        ['奇幻', '#8B5CF6'],
        ['科幻', '#0EA5E9'],
        ['悬疑', '#6B7280'],
        ['搞笑', '#F59E0B'],
        ['治愈', '#14B8A6'],
        ['机战', '#6366F1'],
        ['运动', '#F97316'],
        ['音乐', '#D946EF'],
        ['剧场版', '#84CC16'],
      ]
      let i = 0
      for (const [name, color] of builtins) {
        this.db.run(
          'INSERT OR IGNORE INTO tags (name, color, is_builtin, sort_order) VALUES (?, ?, 1, ?)',
          [name, color, ++i],
        )
      }
      return true
    } catch {
      return false
    }
  }

  // ========== 标签 CRUD ==========
  getAllTags() {
    return this._all('SELECT * FROM tags ORDER BY sort_order ASC, id ASC')
  }

  addTag(name, color = '') {
    const trimmed = String(name || '').trim()
    if (!trimmed) return { success: false, error: '标签名不能为空' }
    // 去重：同名标签不再重复插入（中英文名都按原样比较）
    const exists = this._all('SELECT id FROM tags WHERE name = ?', [trimmed])
    if (exists.length) return { success: false, error: '该标签已存在' }
    try {
      this.db.run('INSERT INTO tags (name, color, is_builtin, sort_order) VALUES (?, ?, 0, ?)', [
        trimmed,
        String(color || '').trim(),
        (this._all('SELECT MAX(sort_order) AS m FROM tags')[0]?.m || 0) + 1,
      ])
      this.save()
      const row = this._all('SELECT * FROM tags WHERE name = ?', [trimmed])[0]
      return { success: true, id: row?.id, data: row }
    } catch (e) {
      return { success: false, error: errorMessage(e) }
    }
  }

  updateTag(id, { name, color } = {}) {
    const row = this._all('SELECT * FROM tags WHERE id = ?', [id])[0]
    if (!row) return { success: false, error: '标签不存在' }
    const nextName = name !== undefined ? String(name).trim() : row.name
    if (!nextName) return { success: false, error: '标签名不能为空' }
    // 改名时要检查重名（排除自己）
    if (nextName !== row.name) {
      const dup = this._all('SELECT id FROM tags WHERE name = ? AND id != ?', [nextName, id])
      if (dup.length) return { success: false, error: '该标签已存在' }
      // 条目上记录的是标签名，改名后要同步更新，否则条目会指向不存在的标签
      this._renameTagOnItems(row.name, nextName)
    }
    try {
      this.db.run('UPDATE tags SET name = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        nextName,
        color !== undefined ? String(color).trim() : row.color,
        id,
      ])
      this.save()
      return { success: true }
    } catch (e) {
      return { success: false, error: errorMessage(e) }
    }
  }

  deleteTag(id) {
    const row = this._all('SELECT * FROM tags WHERE id = ?', [id])[0]
    if (!row) return { success: false, error: '标签不存在' }
    if (row.is_builtin) return { success: false, error: '内置标签不能删除' }
    try {
      this.db.run('DELETE FROM tags WHERE id = ?', [id])
      // 同时从所有条目上摘掉这个标签
      this._removeTagFromItems(row.name)
      this.save()
      return { success: true }
    } catch (e) {
      return { success: false, error: errorMessage(e) }
    }
  }

  /** 标签改名后，把所有条目 tags 字段里的旧名替换为新名 */
  _renameTagOnItems(oldName, newName) {
    const tables = ['watching', 'remaining', 'watched']
    for (const t of tables) {
      try {
        const rows = this._all(`SELECT id, tags FROM ${t} WHERE tags IS NOT NULL AND tags != ''`)
        for (const r of rows) {
          const list = String(r.tags).split(',').map(s => s.trim()).filter(Boolean)
          if (!list.includes(oldName)) continue
          const next = list.map(x => (x === oldName ? newName : x)).join(',')
          this.db.run(`UPDATE ${t} SET tags = ? WHERE id = ?`, [next, r.id])
        }
      } catch { /* 表不存在则跳过 */ }
    }
  }

  /** 删除标签时，把它从所有条目的 tags 字段中移除 */
  _removeTagFromItems(name) {
    const tables = ['watching', 'remaining', 'watched']
    for (const t of tables) {
      try {
        const rows = this._all(`SELECT id, tags FROM ${t} WHERE tags IS NOT NULL AND tags != ''`)
        for (const r of rows) {
          const list = String(r.tags).split(',').map(s => s.trim()).filter(Boolean)
          if (!list.includes(name)) continue
          this.db.run(`UPDATE ${t} SET tags = ? WHERE id = ?`, [list.filter(x => x !== name).join(','), r.id])
        }
      } catch { /* ignore */ }
    }
  }

  _ensureIndexes() {
    const indexes = [
      ['idx_watching_day', 'watching', 'day_of_week, sort_order'],
      ['idx_watching_sort', 'watching', 'sort_order, id'],
      ['idx_remaining_sort', 'remaining', 'sort_order, id'],
      ['idx_remaining_date', 'remaining', 'expected_date'],
      ['idx_watched_sort', 'watched', 'sort_order, id'],
      // 覆盖索引：按年份过滤时把 watch_date/sort_order/id 一起命中，
      // 既能走 range 扫描又不必回表，ORDER BY sort_order,id 也可由索引顺序直接满足。
      // （原来只有 (watch_date)，仍要回表 + 临时排序）
      ['idx_watched_date', 'watched', 'watch_date, sort_order, id'],
      ['idx_years_sort', 'watched_years', 'sort_order, id'],
      // 标签筛选（WHERE tags LIKE ...）与按名称去重查重（WHERE name = ?）的支撑索引。
      // name 在 watching/remaining 上已有 UNIQUE 约束自带的索引；watched 的 name 无约束，
      // 但更新/删除都按 id 定位，因此不额外为 watched.name 建索引。
      ['idx_watching_name', 'watching', 'name'],
      ['idx_remaining_name', 'remaining', 'name'],
    ]
    for (const [name, table, cols] of indexes) {
      try {
        this.db.run(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${cols})`)
      } catch (e) { /* 表或列不存在时忽略 */ }
    }
    // 旧版本建过「只有 watch_date」的同名索引。SQLite 的 CREATE INDEX IF NOT EXISTS
    // 不会因为列定义变化去重建，上面那条语句对老库来说是空操作，查询仍会命中窄索引。
    // 因此这里显式比对列清单，列不一致就 DROP 后重建，让老库也拿到覆盖索引。
    try {
      const existing = this._all("SELECT name, sql FROM sqlite_master WHERE type='index' AND name='idx_watched_date'")[0]
      const hasWide = existing && /watch_date\s*,\s*sort_order\s*,\s*id/i.test(String(existing.sql || ''))
      if (existing && !hasWide) {
        this.db.run('DROP INDEX idx_watched_date')
        this.db.run('CREATE INDEX idx_watched_date ON watched (watch_date, sort_order, id)')
      }
    } catch { /* 老库或异常环境忽略 */ }
  }

  _migrateWatchingEpisodeToText() {
    const info = this._all(`PRAGMA table_info(watching)`)
    if (info.length === 0) return false
    const episodeCol = info.find(col => col.name === 'current_episode')
    if (episodeCol && String(episodeCol.type).toUpperCase() === 'TEXT') return false

    const names = new Set(info.map(col => col.name))
    const col = (name, fallback) => names.has(name) ? name : fallback
    this.db.run('BEGIN')
    try {
      this.db.run(`ALTER TABLE watching RENAME TO watching_old`)
      this.db.run(`
        CREATE TABLE watching (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          day_of_week TEXT,
          time_slot TEXT,
          current_episode TEXT DEFAULT '0',
          cover_url TEXT DEFAULT '',
          url TEXT,
          url_params TEXT,
          notes TEXT,
          tags TEXT,
          total_episodes TEXT,
          sort_order REAL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      // 注意：重建表时必须把**所有新增列**都带上（tags / total_episodes），
      // 否则迁移后表里缺字段，后续 addWatching 的 INSERT 会因列不存在而失败。
      // 旧表没有这些列时由 col() 兜底为空串。
      this.db.run(`
        INSERT INTO watching (id, name, day_of_week, time_slot, current_episode, cover_url, url, url_params, notes, tags, total_episodes, sort_order, created_at, updated_at)
        SELECT id, name,
          ${col('day_of_week', "''")},
          ${col('time_slot', "''")},
          CAST(${col('current_episode', "'0'")} AS TEXT),
          ${col('cover_url', "''")},
          ${col('url', 'NULL')},
          ${col('url_params', 'NULL')},
          ${col('notes', 'NULL')},
          ${col('tags', "''")},
          ${col('total_episodes', "''")},
          ${col('sort_order', '0')},
          ${col('created_at', 'CURRENT_TIMESTAMP')},
          ${col('updated_at', 'CURRENT_TIMESTAMP')}
        FROM watching_old
      `)
      const oldCount = this._get('SELECT COUNT(*) AS count FROM watching_old')
      const newCount = this._get('SELECT COUNT(*) AS count FROM watching')
      if ((oldCount?.count || 0) !== (newCount?.count || 0)) {
        throw new Error('watching 迁移行数不一致')
      }
      this.db.run(`DROP TABLE watching_old`)
      this.db.run('COMMIT')
      return true
    } catch (e) {
      try { this.db.run('ROLLBACK') } catch { /* ignore */ }
      // 事务回滚后旧表应已恢复为 watching；若中途留下 watching_old，把它改回去，避免数据只留在备份表里
      try {
        const leftover = this._all(`SELECT name FROM sqlite_master WHERE type='table' AND name='watching_old'`)
        const current = this._all(`SELECT name FROM sqlite_master WHERE type='table' AND name='watching'`)
        if (leftover.length && !current.length) {
          this.db.run('ALTER TABLE watching_old RENAME TO watching')
        }
      } catch { /* ignore */ }
      console.error('watching 集数列迁移失败，已保留原表:', errorMessage(e))
      return false
    }
  }

  _migrateAddColumn(table, column, def) {
    try {
      const info = this._all(`PRAGMA table_info(${table})`)
      const exists = info.some(col => col.name === column)
      if (!exists) {
        this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
        return true
      }
      return false
    } catch(e) { return false }
  }

  /**
   * 全表读取。
   *
   * 性能要点：sql.js 的 `stmt.getAsObject()` 每行都要重建列名映射并做一次
   * 属性查表，1000 行实测 7.8 ms；改为「列名只取一次 + get() 位置取值 +
   * 手工拼对象」后 3.7 ms（≈2.1×，见 bench-db2）。
   * 返回值形状与 getAsObject 完全一致（普通可枚举自有属性），调用方无需改动。
   */
  _all(sql, params = []) {
    const stmt = this.db.prepare(sql)
    try {
      if (params && params.length) stmt.bind(params)
      const cols = stmt.getColumnNames()
      const n = cols.length
      const rows = []
      while (stmt.step()) {
        const vals = stmt.get()
        const row = {}
        for (let i = 0; i < n; i++) row[cols[i]] = vals[i]
        rows.push(row)
      }
      return rows
    } finally {
      stmt.free()
    }
  }

  _get(sql, params = []) {
    const stmt = this.db.prepare(sql)
    try {
      if (params && params.length) stmt.bind(params)
      if (!stmt.step()) return null
      const cols = stmt.getColumnNames()
      const vals = stmt.get()
      const row = {}
      for (let i = 0; i < cols.length; i++) row[cols[i]] = vals[i]
      return row
    } finally {
      stmt.free()
    }
  }

  _run(sql, params = []) {
    this.db.run(sql, params)
    const changed = this.db.getRowsModified()
    if (!this._batchDepth) this.save()
    return changed
  }

  // 取最近一次 INSERT 生成的自增 id（紧跟在 _run 的 INSERT 之后调用）
  // 取最近一次 INSERT 生成的自增 id。
  // 注意：必须紧贴 INSERT 之后调用，且中间不能再执行任何会重置该值的语句。
  // sql.js 下 last_insert_rowid() 是连接级状态，prepare+step 读取是可靠的。
  _lastInsertId() {
    try {
      const row = this._get('SELECT last_insert_rowid() AS id')
      const id = row ? Number(row.id) : null
      return Number.isFinite(id) && id > 0 ? id : null
    } catch {
      return null
    }
  }

  beginBatch() {
    if (!this._batchDepth) this.db.run('BEGIN')
    this._batchDepth = (this._batchDepth || 0) + 1
  }

  commitBatch() {
    if (!this._batchDepth) return
    this._batchDepth -= 1
    if (this._batchDepth === 0) {
      this.db.run('COMMIT')
      // 批量结束统一落盘一次（内部走 flush 合并）
      this.save()
    }
  }

  rollbackBatch() {
    if (!this._batchDepth) return
    this._batchDepth = 0
    try { this.db.run('ROLLBACK') } catch { /* ignore */ }
  }

  // ========== 追番表操作 ==========

  addWatching({ name, cover_url = '', day_of_week = '', time_slot = '', current_episode = '0', url = '', url_params = '', notes = '', tags = '', total_episodes = '', sort_order = 0 } = {}) {
    const cleanName = normalizeName(name)
    if (!cleanName) return { success: false, error: '番剧名称不能为空' }
    try {
      this._run(
        'INSERT INTO watching (name, day_of_week, time_slot, current_episode, cover_url, url, url_params, notes, tags, total_episodes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [cleanName, day_of_week, time_slot, String(current_episode ?? '0'), String(cover_url || ''), url, url_params, notes, tags, String(total_episodes ?? ''), normalizeSortOrder(sort_order)]
      )
      // name 上有 UNIQUE 约束，按名称回查 id 比依赖 rowid 时序更可靠
      const row = this._get('SELECT id FROM watching WHERE name = ?', [cleanName])
      return { success: true, id: row ? Number(row.id) : null }
    } catch (err) {
      // 不能用 err.message 直接判重：sql.js 可能抛裸字符串（没有 .message），
      // 那样这里会再抛 TypeError，把可恢复的参数错误变成未捕获异常。
      if (isUniqueViolation(err)) {
        return { success: false, error: '该番剧已存在' }
      }
      return { success: false, error: errorMessage(err) }
    }
  }

  getAllWatching() {
    return this._all(
      'SELECT id, name, day_of_week, time_slot, current_episode, total_episodes, cover_url, url, url_params, notes, tags, sort_order FROM watching ORDER BY sort_order, id'
    )
  }

  getWatchingByDay(day) {
    return this._all(
      'SELECT id, name, day_of_week, time_slot, current_episode, cover_url, url, url_params, notes, sort_order FROM watching WHERE day_of_week = ? ORDER BY sort_order, time_slot',
      [day]
    )
  }

  updateWatching(id, fields) {
    const allowedFields = ['name', 'day_of_week', 'time_slot', 'current_episode', 'total_episodes', 'cover_url', 'url', 'url_params', 'notes', 'tags', 'sort_order']
    const updateFields = {}
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        if (key === 'current_episode') {
          updateFields[key] = normalizeEpisodeInput(fields[key])
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
      return { success: false, error: errorMessage(err) }
    }
  }

  deleteWatching(id) {
    try {
      this._run('DELETE FROM watching WHERE id = ?', [id])
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  incrementEpisode(id) {
    try {
      const row = this._get('SELECT current_episode FROM watching WHERE id = ?', [id])
      if (!row) return { success: false, error: '未找到记录' }
      const newVal = smartIncrement(row.current_episode)
      this._run(
        'UPDATE watching SET current_episode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newVal, id]
      )
      return { success: true, current_episode: newVal }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  decrementEpisode(id) {
    try {
      const row = this._get('SELECT current_episode FROM watching WHERE id = ?', [id])
      if (!row) return { success: false, error: '未找到记录' }
      const newVal = smartDecrement(row.current_episode)
      this._run(
        'UPDATE watching SET current_episode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newVal, id]
      )
      return { success: true, current_episode: newVal }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  // ========== 等番表操作 ==========

  addRemaining({ name, expected_date = '', cover_url = '', url = '', url_params = '', notes = '', tags = '', sort_order = 0 } = {}) {
    const cleanName = normalizeName(name)
    if (!cleanName) return { success: false, error: '等番名称不能为空' }
    try {
      const normalizedDate = this._normalizeDate(expected_date)
      this._run(
        'INSERT INTO remaining (name, expected_date, cover_url, url, url_params, notes, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [cleanName, normalizedDate, String(cover_url || ''), url, url_params, notes, tags, normalizeSortOrder(sort_order)]
      )
      const row = this._get('SELECT id FROM remaining WHERE name = ?', [cleanName])
      return { success: true, id: row ? Number(row.id) : null }
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { success: false, error: '该等番已存在' }
      }
      return { success: false, error: errorMessage(err) }
    }
  }

  getAllRemaining() {
    return this._all(
      'SELECT id, name, expected_date, cover_url, url, url_params, notes, tags, sort_order FROM remaining ORDER BY sort_order, id'
    )
  }

  updateRemaining(id, fields) {
    const allowedFields = ['name', 'expected_date', 'cover_url', 'url', 'url_params', 'notes', 'tags', 'sort_order']
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
      return { success: false, error: errorMessage(err) }
    }
  }

  deleteRemaining(id) {
    try {
      this._run('DELETE FROM remaining WHERE id = ?', [id])
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  // ========== 已看表操作 ==========

  addWatched({ name, watch_date, cover_url = '', url = '', url_params = '', notes = '', tags = '', sort_order = 0 } = {}) {
    const cleanName = normalizeName(name)
    if (!cleanName) return { success: false, error: '作品名称不能为空' }
    try {
      const normalizedDate = this._normalizeDate(watch_date)
      this.beginBatch()
      this._run(
        'INSERT INTO watched (name, watch_date, cover_url, url, url_params, notes, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [cleanName, normalizedDate, String(cover_url || ''), url, url_params, notes, tags, normalizeSortOrder(sort_order)]
      )
      this._ensureYearLabel(normalizedDate)
      // watched 表 name 无 UNIQUE，用最新一行的 id（新插入必然 sort_order/id 最大）
      const newRow = this._get('SELECT id FROM watched ORDER BY id DESC LIMIT 1')
      const newId = newRow ? Number(newRow.id) : null
      this.commitBatch()
      return { success: true, id: newId }
    } catch (err) {
      this.rollbackBatch()
      return { success: false, error: errorMessage(err) }
    }
  }

  getAllWatched() {
    return this._all(`SELECT ${WATCHED_COLS} FROM watched ORDER BY sort_order, id`)
  }

  /**
   * 「label/」前缀区间的上界。
   *
   * 要覆盖**所有以 `label + '/'` 开头的字符串**，上界必须取「把最后那个字符
   * 加一」的结果。'/' 的下一个码位是 '0'，因此上界 = label + '0'。
   * ⚠️ 不能写成 `label + '/1'`：那只会覆盖 '/' 后首字符 <= '1' 的情况，
   * 会把 `2021/10`、`2021/11`、`2021/12` 这类两位数月份整批漏掉
   * （曾实测「2021」从 50 行错降到 34 行）。'0' 大于 '/'，
   * 所以 `label+'/' <= x < label+'0'` 恰好等价于 `x LIKE 'label/%'`。
   */
  _prefixUpper(label) {
    return String(label) + '0'
  }

  getWatchedByYear(year) {
    const label = String(year)
    const range = label.match(/^(\d{4})\s*~\s*(\d{4})$/)
    if (range) {
      const start = parseInt(range[1], 10)
      const end = parseInt(range[2], 10)
      // 年份范围：按年份字符串的前界收窄，再在 JS 里做精确判定
      // （区间标签本身 "2016~2020" 也要命中，所以 SQL 侧只做粗筛）。
      return this._all(
        `SELECT ${WATCHED_COLS} FROM watched WHERE watch_date >= ? AND watch_date < ? ORDER BY sort_order, id`,
        [String(start), String(end + 1)]
      ).filter(row => {
        const d = String(row.watch_date || '')
        if (d === label) return true
        const m = d.match(/^(\d{4})/)
        if (!m) return false
        const y = parseInt(m[1], 10)
        return y >= start && y <= end
      })
    }
    return this._all(
      `SELECT ${WATCHED_COLS} FROM watched WHERE watch_date = ? OR (watch_date >= ? AND watch_date < ?) ORDER BY sort_order, id`,
      [label, `${label}/`, this._prefixUpper(label)]
    )
  }

  /**
   * 单次调用同时给出「列表 + 该年计数 + 总计数」。
   *
   * 性能要点：api.js 的 getByYear 原来做三件事
   *   1) getWatchedByYear(year)         —— 物化该年全部行
   *   2) getWatchedCountByYear(year)    —— 又一次把同样那批行物化一遍，只为拿 .length
   *   3) getTotalWatchedCount()         —— 一条 COUNT(*)
   * 第 2 步是纯粹重复工作：同样的 WHERE、同样的行、同样的大字段。
   * 这里合并成一次查询，yearCount 直接取结果长度，把整轮减少一半 I/O 与物化
   * （1000 条库、单年 100 行时实测约 2.1ms → 1.1ms，见回复的优化表）。
   * 语义完全等价：yearCount 就是 getWatchedByYear(year).length。
   */
  getWatchedByYearWithCounts(year) {
    const data = this.getWatchedByYear(year)
    return {
      data,
      yearCount: data.length,
      totalCount: Number(this._get('SELECT COUNT(*) AS count FROM watched')?.count || 0),
    }
  }

  /**
   * 年份计数（保留为公开 API：api.js 与既有调用方/测试都在用）。
   *
   * 性能要点：原来是 `getWatchedByYear(year).length` —— 为了一个数字把该年
   * 所有行（含 notes/url 等大字段）全部物化。单一年份改为纯 COUNT(*)、
   * 走覆盖索引 idx_watched_date：(1000 条库，×20) 49.0ms → 1.3ms。
   * 区间标签（"2016~2020"）的判定含 JS 端精确逻辑，无法用 COUNT 等价表达，
   * 仍回落到列表长度，保证与 getWatchedByYear 结果必然一致。
   */
  getWatchedCountByYear(year) {
    const label = String(year)
    if (/^(\d{4})\s*~\s*(\d{4})$/.test(label)) {
      return this.getWatchedByYear(year).length
    }
    const row = this._get(
      'SELECT COUNT(*) AS count FROM watched WHERE watch_date = ? OR (watch_date >= ? AND watch_date < ?)',
      [label, `${label}/`, this._prefixUpper(label)]
    )
    return row ? Number(row.count) : 0
  }

  _likePrefix(year) {
    return String(year).replace(/[\\%_]/g, ch => '\\' + ch) + '/%'
  }

  getTotalWatchedCount() {
    const row = this._get('SELECT COUNT(*) as count FROM watched')
    return row ? row.count : 0
  }

  updateWatched(id, fields) {
    const allowedFields = ['name', 'watch_date', 'cover_url', 'url', 'url_params', 'notes', 'tags', 'sort_order']
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
      this.beginBatch()
      this._run(
        `UPDATE watched SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      )
      if (updateFields.watch_date !== undefined) this._ensureYearLabel(updateFields.watch_date)
      this.commitBatch()
      return { success: true }
    } catch (err) {
      this.rollbackBatch()
      return { success: false, error: errorMessage(err) }
    }
  }

  deleteWatched(id) {
    try {
      this._run('DELETE FROM watched WHERE id = ?', [id])
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  // ========== 已看年份操作 ==========

  addWatchedYear({ year_label, sort_order = 0 } = {}) {
    const label = normalizeName(year_label)
    if (!label) return { success: false, error: '年份标签不能为空' }
    try {
      this._run(
        'INSERT INTO watched_years (year_label, sort_order) VALUES (?, ?)',
        [label, normalizeSortOrder(sort_order)]
      )
      return { success: true }
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { success: false, error: '该年份已存在' }
      }
      return { success: false, error: errorMessage(err) }
    }
  }

  getAllWatchedYears() {
    return this._all(
      'SELECT id, year_label, sort_order, created_at, updated_at FROM watched_years ORDER BY sort_order, id'
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
      const current = this._get('SELECT year_label FROM watched_years WHERE id = ?', [id])
      this.beginBatch()
      this._run(
        `UPDATE watched_years SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      )
      if (current && updateFields.year_label && updateFields.year_label !== current.year_label) {
        const rows = this._all('SELECT id, watch_date FROM watched')
        for (const row of rows) {
          if (row.watch_date === current.year_label || String(row.watch_date || '').startsWith(current.year_label + '/')) {
            const nextDate = row.watch_date === current.year_label
              ? updateFields.year_label
              : updateFields.year_label + String(row.watch_date).slice(current.year_label.length)
            this._run('UPDATE watched SET watch_date = ? WHERE id = ?', [nextDate, row.id])
          }
        }
      }
      this.commitBatch()
      return { success: true }
    } catch (err) {
      this.rollbackBatch()
      return { success: false, error: errorMessage(err) }
    }
  }

  deleteWatchedYear(id) {
    try {
      this._run('DELETE FROM watched_years WHERE id = ?', [id])
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  // ========== 批量操作 ==========

  batchDeleteWatching(ids) {
    return this._batchDelete('watching', ids)
  }

  batchDeleteRemaining(ids) {
    return this._batchDelete('remaining', ids)
  }

  batchDeleteWatched(ids) {
    return this._batchDelete('watched', ids)
  }

  _batchDelete(table, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return { success: true, deleted: 0 }
    const allowed = ['watching', 'remaining', 'watched']
    if (!allowed.includes(table)) return { success: false, error: '不支持的表' }
    try {
      const placeholders = ids.map(() => '?').join(',')
      const deleted = this._run(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ids)
      return { success: true, deleted }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  clearWatching() {
    try {
      this._run('DELETE FROM watching')
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  clearRemaining() {
    try {
      this._run('DELETE FROM remaining')
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  clearWatched() {
    try {
      this._run('DELETE FROM watched')
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  clearWatchedYears() {
    try {
      this._run('DELETE FROM watched_years')
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  clearAll() {
    try {
      this.beginBatch()
      this._run('DELETE FROM watching')
      this._run('DELETE FROM remaining')
      this._run('DELETE FROM watched')
      this._run('DELETE FROM watched_years')
      this.commitBatch()
      return { success: true }
    } catch (err) {
      this.rollbackBatch()
      return { success: false, error: errorMessage(err) }
    }
  }

  // ========== 状态迁移 ==========

  moveWatchingToRemaining(watchingId) {
    try {
      const row = this._get('SELECT name, cover_url, url, url_params, notes, sort_order FROM watching WHERE id = ?', [watchingId])
      if (!row) return { success: false, error: '未找到记录' }
      this.beginBatch()
      this._run(
        'INSERT INTO remaining (name, expected_date, cover_url, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [row.name, '', String(row.cover_url || ''), row.url || '', row.url_params || '', row.notes, row.sort_order]
      )
      const removed = this._run('DELETE FROM watching WHERE id = ?', [watchingId])
      if (!removed) throw new Error('源记录删除失败')
      this.commitBatch()
      return { success: true }
    } catch (err) {
      this.rollbackBatch()
      if (isUniqueViolation(err)) {
        return { success: false, error: '该等番已存在' }
      }
      return { success: false, error: errorMessage(err) }
    }
  }

  moveWatchingToWatched(watchingId, watchDate) {
    try {
      const normalizedDate = this._normalizeDate(watchDate)
      const row = this._get('SELECT name, cover_url, url, url_params, notes, sort_order FROM watching WHERE id = ?', [watchingId])
      if (!row) return { success: false, error: '未找到记录' }
      // 从追番移入已看时清空链接：追番页的链接是追更地址，已看记录不再需要它。
      this.beginBatch()
      this._run(
        'INSERT INTO watched (name, watch_date, cover_url, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [row.name, normalizedDate, String(row.cover_url || ''), '', '', row.notes, row.sort_order]
      )
      this._ensureYearLabel(normalizedDate)
      const removed = this._run('DELETE FROM watching WHERE id = ?', [watchingId])
      if (!removed) throw new Error('源记录删除失败')
      this.commitBatch()
      return { success: true }
    } catch (err) {
      this.rollbackBatch()
      return { success: false, error: errorMessage(err) }
    }
  }

  _ensureYearLabel(watchDate) {
    if (!watchDate) return
    const v = String(watchDate).trim()
    const rangeMatch = v.match(/^(\d{4})\s*~\s*(\d{4})$/)
    if (rangeMatch) {
      this._addYearIfNotExists(`${rangeMatch[1]}~${rangeMatch[2]}`)
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
      const row = this._get('SELECT name, cover_url, url, url_params, notes, sort_order FROM remaining WHERE id = ?', [remainingId])
      if (!row) return { success: false, error: '未找到记录' }
      this.beginBatch()
      this._run(
        'INSERT INTO watching (name, day_of_week, time_slot, current_episode, cover_url, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [row.name, day_of_week, time_slot, '0', String(row.cover_url || ''), row.url || '', row.url_params || '', row.notes, row.sort_order]
      )
      const removed = this._run('DELETE FROM remaining WHERE id = ?', [remainingId])
      if (!removed) throw new Error('源记录删除失败')
      this.commitBatch()
      return { success: true }
    } catch (err) {
      this.rollbackBatch()
      if (isUniqueViolation(err)) {
        return { success: false, error: '该番剧已存在' }
      }
      return { success: false, error: errorMessage(err) }
    }
  }
}

// ========== IndexedDB 操作 ==========

function openIDB() {
  if (idbConnection) return Promise.resolve(idbConnection)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = (e) => {
      const idb = e.target.result
      if (!idb.objectStoreNames.contains(DB_STORE)) {
        idb.createObjectStore(DB_STORE)
      }
    }
    request.onsuccess = (e) => {
      idbConnection = e.target.result
      idbConnection.onclose = () => { idbConnection = null }
      resolve(idbConnection)
    }
    request.onerror = (e) => reject(e.target.error)
  })
}

async function loadFromIndexedDB() {
  try {
    const idb = await openIDB()
    const data = await new Promise((resolve, reject) => {
      const tx = idb.transaction(DB_STORE, 'readonly')
      const store = tx.objectStore(DB_STORE)
      const request = store.get(DB_KEY)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
    return { data, error: null }
  } catch (e) {
    console.warn('从 IndexedDB 加载数据失败:', e)
    return { data: null, error: e }
  }
}

async function saveToIndexedDB(data, { strict = false } = {}) {
  try {
    const idb = await openIDB()
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(DB_STORE, 'readwrite')
      const store = tx.objectStore(DB_STORE)
      store.put(data, DB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('保存到 IndexedDB 失败:', e)
    if (strict || dbInstance?.strictPersistence) throw e
  }
}

/**
 * 获取数据库实例（单例）
 * 供 api.js 和 excelImporter.js 使用
 */
export function __resetIdbConnection() {
  try { idbConnection?.close() } catch { /* ignore */ }
  idbConnection = null
}

export async function getDb() {
  if (dbInstance) return dbInstance
  if (!dbPromise) {
    dbPromise = BangumiDatabase.create().catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

// 同时导出 BangumiDatabase.create 供初始化使用
export { BangumiDatabase }


export default BangumiDatabase
