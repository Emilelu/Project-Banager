/**
 * 数据库模块
 * 使用 sql.js 存储追番数据（纯 WASM，无需原生编译）
 * 支持 sort_order 保持导入顺序，watch_date 支持完整日期
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'bangumi.db');

class BangumiDatabase {
  constructor(db) {
    this.db = db;
    this.initTables();
  }

  static async create() {
    const SQL = await initSqlJs();
    let db;
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
    const instance = new BangumiDatabase(db);
    // 启动时自动修复日期格式
    instance._fixDateFormats();
    return instance;
  }

  /**
   * 统一日期格式：将所有 watch_date 中的 - 替换为 /
   * 确保数据库中只存在 YYYY/MM/DD 格式
   */
  _fixDateFormats() {
    try {
      // 修复 watched 表中的 watch_date
      const watchedRows = this._all("SELECT id, watch_date FROM watched WHERE watch_date LIKE '%-%'");
      for (const row of watchedRows) {
        const fixed = row.watch_date.replace(/-/g, '/');
        this._run('UPDATE watched SET watch_date = ? WHERE id = ?', [fixed, row.id]);
      }
      // 修复 remaining 表中的 expected_date
      const remainingRows = this._all("SELECT id, expected_date FROM remaining WHERE expected_date LIKE '%-%'");
      for (const row of remainingRows) {
        const fixed = row.expected_date.replace(/-/g, '/');
        this._run('UPDATE remaining SET expected_date = ? WHERE id = ?', [fixed, row.id]);
      }
      if (watchedRows.length > 0 || remainingRows.length > 0) {
        console.log(`日期格式修复: watched ${watchedRows.length} 条, remaining ${remainingRows.length} 条`);
      }
    } catch (e) {
      console.error('日期格式修复失败:', e.message);
    }
  }

  /**
   * 标准化日期格式：确保写入数据库的日期统一使用 / 分隔
   */
  _normalizeDate(dateStr) {
    if (!dateStr) return dateStr;
    return String(dateStr).replace(/-/g, '/');
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }

  initTables() {
    // 追番表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS watching (
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
    `);

    // 等番表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS remaining (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        expected_date TEXT,
        url TEXT,
        notes TEXT,
        sort_order REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 已看表 - watch_date 支持年/年~年/完整日期
    this.db.run(`
      CREATE TABLE IF NOT EXISTS watched (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        watch_date TEXT,
        url TEXT,
        notes TEXT,
        sort_order REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 已看年份表 - 独立管理年份分组
    this.db.run(`
      CREATE TABLE IF NOT EXISTS watched_years (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year_label TEXT NOT NULL UNIQUE,
        sort_order REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 迁移：给已有表添加 sort_order 列
    this._migrateAddColumn('watching', 'sort_order', 'REAL DEFAULT 0');
    this._migrateAddColumn('remaining', 'sort_order', 'REAL DEFAULT 0');
    this._migrateAddColumn('watched', 'sort_order', 'REAL DEFAULT 0');
    // 迁移：给 watched 表添加 watch_date 列
    this._migrateAddColumn('watched', 'watch_date', 'TEXT');
    // 迁移：给所有表添加 url 列
    this._migrateAddColumn('watching', 'url', 'TEXT');
    this._migrateAddColumn('remaining', 'url', 'TEXT');
    this._migrateAddColumn('watched', 'url', 'TEXT');
    // 迁移：给所有表添加 url_params 列
    this._migrateAddColumn('watching', 'url_params', 'TEXT');
    this._migrateAddColumn('remaining', 'url_params', 'TEXT');
    this._migrateAddColumn('watched', 'url_params', 'TEXT');

    // 迁移：将 watching 表的 current_episode 从 REAL 改为 TEXT，保留小数位数
    this._migrateWatchingEpisodeToText();

    // 迁移：将已有 watched 记录的 watch_year 复制到 watch_date
    try {
      this.db.run(`UPDATE watched SET watch_date = watch_year WHERE watch_date IS NULL OR watch_date = ''`);
    } catch(e) {}

    this.save();
  }

  /**
   * 迁移：将 watching 表的 current_episode 从 REAL 改为 TEXT
   * SQLite 不支持 ALTER COLUMN，需要重建表
   */
  _migrateWatchingEpisodeToText() {
    try {
      const info = this._all(`PRAGMA table_info(watching)`);
      const episodeCol = info.find(col => col.name === 'current_episode');
      if (episodeCol && episodeCol.type === 'TEXT') return; // 已经迁移过
      // 重建表
      this.db.run(`ALTER TABLE watching RENAME TO watching_old`);
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
      `);
      this.db.run(`
        INSERT INTO watching (id, name, day_of_week, time_slot, current_episode, url, notes, sort_order, created_at, updated_at)
        SELECT id, name, day_of_week, time_slot, CAST(current_episode AS TEXT), url, notes, sort_order, created_at, updated_at
        FROM watching_old
      `);
      this.db.run(`DROP TABLE watching_old`);
    } catch(e) {
      // 如果出错，尝试恢复
      try { this.db.run(`DROP TABLE IF EXISTS watching_old`); } catch(e2) {}
    }
  }

  _migrateAddColumn(table, column, def) {
    try {
      const info = this._all(`PRAGMA table_info(${table})`);
      const exists = info.some(col => col.name === column);
      if (!exists) {
        this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
      }
    } catch(e) {}
  }

  _all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  _get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }

  _run(sql, params = []) {
    this.db.run(sql, params);
    this.save();
  }

  // ========== 追番表操作 ==========

  addWatching({ name, day_of_week = '', time_slot = '', current_episode = '0', url = '', url_params = '', notes = '', sort_order = 0 }) {
    try {
      this._run(
        'INSERT INTO watching (name, day_of_week, time_slot, current_episode, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, day_of_week, time_slot, current_episode, url, url_params, notes, sort_order]
      );
      return { success: true };
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: '该番剧已存在' };
      }
      return { success: false, error: err.message };
    }
  }

  getAllWatching() {
    return this._all(
      'SELECT id, name, day_of_week, time_slot, current_episode, url, url_params, notes, sort_order FROM watching ORDER BY sort_order, id'
    );
  }

  getWatchingByDay(day) {
    return this._all(
      'SELECT id, name, day_of_week, time_slot, current_episode, notes, sort_order FROM watching WHERE day_of_week = ? ORDER BY sort_order, time_slot',
      [day]
    );
  }

  updateWatching(id, fields) {
    const allowedFields = ['name', 'day_of_week', 'time_slot', 'current_episode', 'url', 'url_params', 'notes', 'sort_order'];
    const updateFields = {};
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        // 确保 current_episode 是字符串（TEXT类型）
        if (key === 'current_episode') {
          const numVal = parseFloat(fields[key]);
          updateFields[key] = isNaN(numVal) ? '0' : String(fields[key]);
        } else {
          updateFields[key] = fields[key];
        }
      }
    }
    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: '没有可更新的字段' };
    }
    const setClause = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updateFields), id];
    try {
      this._run(
        `UPDATE watching SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  deleteWatching(id) {
    try {
      this._run('DELETE FROM watching WHERE id = ?', [id]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 智能增减集数
   * 整数: ±1
   * 小数: 小数部分当成独立整数±1，不进位，如 26.19 → 26.20 / 26.18，26.99 → 26.100
   * current_episode 现在是 TEXT 类型，返回字符串
   */
  _smartIncrement(current) {
    const str = String(current || '0');
    if (str.includes('.')) {
      const dotIndex = str.indexOf('.');
      const intPart = str.substring(0, dotIndex);
      const decimalStr = str.substring(dotIndex + 1);
      const newDecimal = parseInt(decimalStr, 10) + 1;
      return intPart + '.' + String(newDecimal);
    }
    const intVal = parseInt(str, 10) || 0;
    return String(intVal + 1);
  }

  _smartDecrement(current) {
    const str = String(current || '0');
    if (str.includes('.')) {
      const dotIndex = str.indexOf('.');
      const intPart = str.substring(0, dotIndex);
      const decimalStr = str.substring(dotIndex + 1);
      const decVal = parseInt(decimalStr, 10);
      if (decVal <= 0) return '0';
      const newDecimal = decVal - 1;
      return intPart + '.' + String(newDecimal);
    }
    const intVal = parseInt(str, 10) || 0;
    return String(Math.max(0, intVal - 1));
  }

  incrementEpisode(id) {
    try {
      const row = this._get('SELECT current_episode FROM watching WHERE id = ?', [id]);
      if (!row) return { success: false, error: '未找到记录' };
      const newVal = this._smartIncrement(row.current_episode);
      this._run(
        'UPDATE watching SET current_episode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newVal, id]
      );
      return { success: true, current_episode: newVal };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  decrementEpisode(id) {
    try {
      const row = this._get('SELECT current_episode FROM watching WHERE id = ?', [id]);
      if (!row) return { success: false, error: '未找到记录' };
      const newVal = this._smartDecrement(row.current_episode);
      this._run(
        'UPDATE watching SET current_episode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newVal, id]
      );
      return { success: true, current_episode: newVal };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ========== 等番表操作 ==========

  addRemaining({ name, expected_date = '', url = '', url_params = '', notes = '', sort_order = 0 }) {
    try {
      const normalizedDate = this._normalizeDate(expected_date);
      this._run(
        'INSERT INTO remaining (name, expected_date, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [name, normalizedDate, url, url_params, notes, sort_order]
      );
      return { success: true };
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: '该等番已存在' };
      }
      return { success: false, error: err.message };
    }
  }

  getAllRemaining() {
    return this._all(
      'SELECT id, name, expected_date, url, url_params, notes, sort_order FROM remaining ORDER BY sort_order, id'
    );
  }

  updateRemaining(id, fields) {
    const allowedFields = ['name', 'expected_date', 'url', 'url_params', 'notes', 'sort_order'];
    const updateFields = {};
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        if (key === 'expected_date') {
          updateFields[key] = this._normalizeDate(fields[key]);
        } else {
          updateFields[key] = fields[key];
        }
      }
    }
    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: '没有可更新的字段' };
    }
    const setClause = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updateFields), id];
    try {
      this._run(
        `UPDATE remaining SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  deleteRemaining(id) {
    try {
      this._run('DELETE FROM remaining WHERE id = ?', [id]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ========== 已看表操作 ==========

  addWatched({ name, watch_date, url = '', url_params = '', notes = '', sort_order = 0 }) {
    try {
      const normalizedDate = this._normalizeDate(watch_date);
      this._run(
        'INSERT INTO watched (name, watch_date, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [name, normalizedDate, url, url_params, notes, sort_order]
      );
      // 自动创建年份分组
      this._ensureYearLabel(normalizedDate);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getAllWatched() {
    return this._all(
      'SELECT id, name, watch_date, url, url_params, notes, sort_order FROM watched ORDER BY sort_order, id'
    );
  }

  getWatchedByYear(year) {
    return this._all(
      "SELECT id, name, watch_date, url, url_params, notes, sort_order FROM watched WHERE watch_date = ? OR watch_date LIKE ? ORDER BY sort_order, id",
      [year, year + '/%']
    );
  }

  getWatchedCountByYear(year) {
    const row = this._get("SELECT COUNT(*) as count FROM watched WHERE watch_date = ? OR watch_date LIKE ?", [year, year + '/%']);
    return row ? row.count : 0;
  }

  getTotalWatchedCount() {
    const row = this._get('SELECT COUNT(*) as count FROM watched');
    return row ? row.count : 0;
  }

  updateWatched(id, fields) {
    const allowedFields = ['name', 'watch_date', 'url', 'url_params', 'notes', 'sort_order'];
    const updateFields = {};
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        // 标准化日期格式
        if (key === 'watch_date') {
          updateFields[key] = this._normalizeDate(fields[key]);
        } else {
          updateFields[key] = fields[key];
        }
      }
    }
    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: '没有可更新的字段' };
    }
    const setClause = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updateFields), id];
    try {
      this._run(
        `UPDATE watched SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  deleteWatched(id) {
    try {
      this._run('DELETE FROM watched WHERE id = ?', [id]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ========== 已看年份操作 ==========

  addWatchedYear({ year_label, sort_order = 0 }) {
    try {
      this._run(
        'INSERT INTO watched_years (year_label, sort_order) VALUES (?, ?)',
        [year_label, sort_order]
      );
      return { success: true };
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: '该年份已存在' };
      }
      return { success: false, error: err.message };
    }
  }

  getAllWatchedYears() {
    return this._all(
      'SELECT id, year_label, sort_order FROM watched_years ORDER BY sort_order, id'
    );
  }

  updateWatchedYear(id, fields) {
    const allowedFields = ['year_label', 'sort_order'];
    const updateFields = {};
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updateFields[key] = fields[key];
      }
    }
    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: '没有可更新的字段' };
    }
    const setClause = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updateFields), id];
    try {
      this._run(`UPDATE watched_years SET ${setClause} WHERE id = ?`, values);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  deleteWatchedYear(id) {
    try {
      this._run('DELETE FROM watched_years WHERE id = ?', [id]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ========== 批量操作 ==========

  batchDeleteWatching(ids) {
    try {
      const placeholders = ids.map(() => '?').join(',');
      this._run(`DELETE FROM watching WHERE id IN (${placeholders})`, ids);
      return { success: true, deleted: ids.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  batchDeleteRemaining(ids) {
    try {
      const placeholders = ids.map(() => '?').join(',');
      this._run(`DELETE FROM remaining WHERE id IN (${placeholders})`, ids);
      return { success: true, deleted: ids.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  batchDeleteWatched(ids) {
    try {
      const placeholders = ids.map(() => '?').join(',');
      this._run(`DELETE FROM watched WHERE id IN (${placeholders})`, ids);
      return { success: true, deleted: ids.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  clearWatching() {
    try {
      this._run('DELETE FROM watching');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  clearRemaining() {
    try {
      this._run('DELETE FROM remaining');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  clearWatched() {
    try {
      this._run('DELETE FROM watched');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  clearWatchedYears() {
    try {
      this._run('DELETE FROM watched_years');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  clearAll() {
    try {
      this._run('DELETE FROM watching');
      this._run('DELETE FROM remaining');
      this._run('DELETE FROM watched');
      this._run('DELETE FROM watched_years');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ========== 状态迁移 ==========

  moveWatchingToRemaining(watchingId) {
    try {
      const row = this._get('SELECT name, url, url_params, notes, sort_order FROM watching WHERE id = ?', [watchingId]);
      if (row) {
        const addResult = this.addRemaining({ name: row.name, expected_date: '', url: row.url || '', url_params: row.url_params || '', notes: row.notes, sort_order: row.sort_order });
        if (addResult.success) {
          this.deleteWatching(watchingId);
          return { success: true };
        }
        return addResult;
      }
      return { success: false, error: '未找到记录' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  moveWatchingToWatched(watchingId, watchDate) {
    try {
      const normalizedDate = this._normalizeDate(watchDate);
      const row = this._get('SELECT name, url, url_params, notes, sort_order FROM watching WHERE id = ?', [watchingId]);
      if (row) {
        const addResult = this.addWatched({ name: row.name, watch_date: normalizedDate, url: row.url || '', url_params: row.url_params || '', notes: row.notes, sort_order: row.sort_order });
        if (addResult.success) {
          // 自动创建年份分组
          this._ensureYearLabel(normalizedDate);
          this.deleteWatching(watchingId);
          return { success: true };
        }
        return addResult;
      }
      return { success: false, error: '未找到记录' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // 从 watch_date 提取年份并确保年份分组存在
  _ensureYearLabel(watchDate) {
    if (!watchDate) return;
    const v = String(watchDate).trim();
    // 年份范围: 2014~2017 -> 取起始年份
    const rangeMatch = v.match(/^(\d{4})\s*~/);
    if (rangeMatch) {
      this._addYearIfNotExists(rangeMatch[1]);
      return;
    }
    // 其他格式取前4位
    const yearMatch = v.match(/^(\d{4})/);
    if (yearMatch) {
      this._addYearIfNotExists(yearMatch[1]);
    }
  }

  _addYearIfNotExists(yearLabel) {
    const existing = this._get('SELECT id FROM watched_years WHERE year_label = ?', [yearLabel]);
    if (!existing) {
      this._run('INSERT INTO watched_years (year_label, sort_order) VALUES (?, 0)', [yearLabel]);
    }
  }

  moveRemainingToWatching(remainingId, { day_of_week = '', time_slot = '' } = {}) {
    try {
      const row = this._get('SELECT name, url, url_params, notes, sort_order FROM remaining WHERE id = ?', [remainingId]);
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
        });
        if (addResult.success) {
          this.deleteRemaining(remainingId);
          return { success: true };
        }
        return addResult;
      }
      return { success: false, error: '未找到记录' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

// 异步初始化并导出 Promise
const dbPromise = BangumiDatabase.create();

module.exports = dbPromise;
