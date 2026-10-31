/**
 * 娴忚鍣ㄧ鏁版嵁搴撴ā鍧?
 * 浣跨敤 sql.js (WASM) + IndexedDB 鎸佷箙鍖?
 */

import initSqlJs from 'sql.js'
import { smartIncrement, smartDecrement, normalizeEpisodeInput } from '../composables/useEpisode'

const DB_NAME = 'BangumiManagerDB'
const DB_STORE = 'database'
const DB_KEY = 'bangumi_db'

// ========== 閿欒涓庡瓧娈佃鑼冨寲锛堣竟鐣屽畨鍏級 ==========
//
// 涓轰粈涔堥渶瑕?errorMessage()锛?
//   sql.js 鐨勯儴鍒嗛敊璇槸**瑁稿瓧绗︿覆**鑰屼笉鏄?Error 鈥斺€?渚嬪缁戝畾 undefined 鍙傛暟鏃舵姏
//   "Wrong API use : tried to bind a value of an unknown type (undefined)."銆?
//   鍘熶唬鐮佸啓 `err.message.includes('UNIQUE constraint failed')`锛屾鏃?err.message 鏄?
//   undefined 鈫?鍐嶈 .includes 灏辨姏 TypeError锛屾妸涓€娆°€屽彲鎭㈠鐨勫弬鏁伴敊璇€嶅崌绾ф垚
//   鏈崟鑾峰紓甯革紝璋冪敤鏂癸紙瀵煎叆鍣?/ 瑙嗗浘锛夋暣杞け璐ャ€傛墍鏈?catch 鍒嗘敮缁熶竴璧拌繖涓猦elper銆?

/** 鎶婁换鎰忓紓甯?瀛楃涓茶浆鎴愬彲璇绘秷鎭紝姘镐笉杩斿洖 undefined */
function errorMessage(err) {
  if (!err) return '鏈煡閿欒'
  if (typeof err === 'string') return err
  if (typeof err.message === 'string' && err.message) return err.message
  try { return String(err) } catch { return '鏈煡閿欒' }
}

/** UNIQUE 鍐茬獊鍒ゅ畾锛氫笉渚濊禆 err.message 涓€瀹氬瓨鍦?*/
function isUniqueViolation(err) {
  return /UNIQUE constraint failed/i.test(errorMessage(err))
}

/**
 * 鍚嶇О瑙勮寖鍖栥€?
 * 鍙帴鍙楀瓧绗︿覆/鏁板瓧锛屼笖 trim 鍚庡繀椤婚潪绌猴細
 *   路 addWatching({}) 鍘熷疄鐜颁細鎶?undefined 浼犵粰 sql.js 鈫?鎶涜８瀛楃涓?鈫?涓婇潰閭ｄ釜宕╂簝锛?
 *   路 name = '' 鎴栫函绌虹櫧浼氬啓杩涘簱锛岄殢鍚庡崱鐗囨覆鏌撳嚭涓€寮犲嚑涔庢病鏈夋爣棰樼殑鍗＄墖锛?
 *     鐢ㄦ埛鏃㈢湅涓嶅嚭鏄摢鏉°€佷篃鏃犳硶鍦ㄥ垪琛ㄩ噷瀹氫綅鍒犻櫎銆?
 */
function normalizeName(name) {
  if (typeof name !== 'string' && typeof name !== 'number') return ''
  return String(name).trim()
}

/**
 * sort_order 瑙勮寖鍖栵細NaN / Infinity / 闈炴暟瀛椾竴寰嬪綊 0銆?
 * sql.js 浼氭妸 NaN 鍐欐垚 NULL锛堝疄娴?getAllWatching 閲岃繑鍥?null锛夛紝
 * 鎺掑簭鏃?NULL 涓庢暟瀛楁贩鎺掍細璁╁垪琛ㄩ『搴忚帿鍚嶈烦鍔ㄣ€?
 */
function normalizeSortOrder(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

let dbInstance = null
let dbPromise = null
let _SQL = null  // 缂撳瓨 initSqlJs 杩斿洖鐨?SQL 鏋勯€犲櫒
let idbConnection = null

// WASM 鍐呰仈鍔犺浇鍣?
// 鏋勫缓鏃堕€氳繃 vite-plugin-wasm-inline 灏?WASM 鍐呰仈涓?base64
// 杩愯鏃朵粠鍐呰仈鏁版嵁瑙ｇ爜锛屾棤闇€缃戠粶璇锋眰锛屾敮鎸?file:// 鍗忚
async function loadWasmBinary() {
  try {
    // 鍔ㄦ€佸鍏ユ瀯寤烘椂鐢熸垚鐨?WASM base64 鏁版嵁妯″潡
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
    console.warn('鍐呰仈 WASM 鍔犺浇澶辫触锛屽皾璇?CDN...', e)
  }

  // 鍥為€€锛氫粠 CDN 鍔犺浇锛堥渶瑕佺綉缁滃拰 http/https 鍗忚锛?
  try {
    const response = await fetch('https://sql.js.org/dist/sql-wasm.wasm')
    const arrayBuffer = await response.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  } catch (e) {
    console.error('WASM 鍔犺浇澶辫触锛岃閫氳繃 http 鏈嶅姟璁块棶鎴栫‘淇濈綉缁滃彲鐢?, e)
    throw new Error('鏃犳硶鍔犺浇鏁版嵁搴撳紩鎿?WASM)锛岃閫氳繃鏈湴鏈嶅姟鍣ㄨ闂〉闈紝鎴栫‘淇濈綉缁滆繛鎺ユ甯?)
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
    _SQL = SQL  // 缂撳瓨 SQL 鏋勯€犲櫒渚?importDb 浣跨敤

    let db
    // 鍖哄垎銆屼粠鏈娇鐢ㄣ€嶅拰銆岃鍙栧け璐ャ€嶏細澶辫触鏃朵笉寤虹┖搴擄紝閬垮厤闅忓悗 save() 瑕嗙洊鏃у揩鐓?
    const loaded = await loadFromIndexedDB()
    if (loaded.error) {
      throw new Error('璇诲彇鏈湴鏁版嵁搴撳け璐ワ紝宸插仠姝㈠惎鍔ㄤ互鍏嶇敤绌哄簱瑕嗙洊鍘熸湁鏁版嵁锛? + loaded.error.message)
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

  // ========== IndexedDB 鎸佷箙鍖?==========
  //
  // 鎬ц兘瑕佺偣锛歚db.export()` 浼氭妸鏁村簱搴忓垪鍖栦竴閬嶏紝浠ｄ环涓庡簱澶у皬鎴愭姣斻€?
  // 鍘熸潵姣忎竴娆?_run 閮藉悓姝?export 涓€娆★紝瀵煎叆 N 鏉″氨鏄?N 娆″叏搴撳簭鍒楀寲锛圤(n虏)锛夈€?
  // 鐜板湪鏀逛负銆岄槻鎶栧悎骞躲€嶏細鍐欐搷浣滃彧鏍囪鑴忥紝钀界洏寤跺悗鍒?microtask/绌洪棽鏃舵満鎵ц锛?
  // 鍚屼竴杞唴鐨勫娆″啓鍏ュ叡浜竴娆?export + 涓€娆?IndexedDB 浜嬪姟銆?
  // 闇€瑕佸己涓€鑷寸殑璋冪敤鏂癸紙澶囦唤瀵煎嚭銆佸鍏ユ仮澶嶃€佹壒閲忕粨鏉燂級鏄惧紡 await flush()銆?

  save() {
    this._dirty = true
    if (this._batchDepth) return Promise.resolve()
    // 寤惰繜钀界洏锛氬悓涓€杞簨浠跺惊鐜唴鐨勫娆″啓鍏ュ悎骞舵垚涓€娆?export + 涓€娆?IndexedDB 浜嬪姟銆?
    // 椤甸潰闅愯棌/鍗歌浇鏃剁敤 flushNow() 鍏滃簳锛岄伩鍏嶆渶鍚庝竴绗旀敼鍔ㄤ涪澶便€?
    return this.flush()
  }

  // 绔嬪嵆钀界洏锛堝悎骞舵墍鏈夋湭钀界洏鐨勬敼鍔級锛岃繑鍥?Promise
  flush() {
    // 宸叉湁涓€涓?flush 鍦ㄩ锛氱瓑瀹冪粨鏉熷悗濡傛灉鍐嶈剰灏辩户缁啓锛屼繚璇佽皟鐢ㄦ柟 flush() 杩斿洖鏃?
    // 銆屾鍒讳负姝㈢殑鎵€鏈夋敼鍔ㄣ€嶉兘宸茶惤鐩橈紙鑰屼笉鏄鍚堝苟涓㈡帀锛?
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
        // 钀界洏澶辫触锛氶噸鏂版爣鑴忥紝涓嬫鍐欏叆鎴栨樉寮?flush 鏃朵細鍐嶈瘯
        this._dirty = true
        throw err
      })
      .finally(() => {
        this._flushPromise = null
      })
    return this._flushPromise
  }

  // 鍗歌浇/闅愯棌鍓嶇殑鍚屾鍏滃簳锛氫笉绛夊緟锛屼絾涓€瀹氭妸鑴忔暟鎹彂鍑哄幓
  flushNow() {
    if (!this._dirty || this._batchDepth) return
    this._dirty = false
    try { saveToIndexedDB(this.db.export()) } catch { /* ignore */ }
  }

  // 鏄惧紡钀界洏锛氳皟鐢ㄦ柟闇€瑕佺‘璁ゆ寔涔呭寲缁撴灉鏃朵娇鐢紙澶辫触浼?reject锛?
  saveStrict() {
    this._dirty = true
    if (this._flushPromise) {
      return this._flushPromise.then(() => saveToIndexedDB(this.db.export(), { strict: true }))
    }
    this._dirty = false
    return saveToIndexedDB(this.db.export(), { strict: true })
  }

  // ========== 鏁版嵁搴撳鍏?瀵煎嚭 ==========

  /**
   * 瀵煎叆澶栭儴 .db 鏂囦欢锛岃鐩栧綋鍓嶆暟鎹簱
   * @param {Uint8Array} data - SQLite 鏁版嵁搴撲簩杩涘埗鏁版嵁
   */
  importDb(data) {
    // 鍏堝湪涓存椂瀹炰緥涓婂畬鎴愭瀯閫犲拰寤鸿〃锛屽叏閮ㄦ垚鍔熷悗鍐嶆浛鎹€?
    // 澶辫触鏃舵棫搴撲繚鎸佸彲鐢紝閬垮厤鍧忔枃浠舵妸褰撳墠浼氳瘽鎵撴垚 "database is closed"銆?
    if (!_SQL) throw new Error('鏁版嵁搴撳紩鎿庡皻鏈垵濮嬪寲')
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const header = new TextDecoder().decode(bytes.slice(0, 16))
    if (header !== 'SQLite format 3\u0000') {
      throw new Error('涓嶆槸鏈夋晥鐨?SQLite 澶囦唤鏂囦欢')
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
   * 瀵煎嚭褰撳墠鏁版嵁搴撲负 Uint8Array
   * @returns {Uint8Array}
   */
  export() {
    return this.db.export()
  }

  // ========== 鏃ユ湡鏍煎紡淇 ==========

  _fixDateFormats() {
    try {
      const watchedRows = this._all("SELECT id, watch_date FROM watched WHERE watch_date LIKE '%-%'")
      const remainingRows = this._all("SELECT id, expected_date FROM remaining WHERE expected_date LIKE '%-%'")
      if (!watchedRows.length && !remainingRows.length) return
      // 鎵瑰鐞嗭細涓€娆′簨鍔°€佷竴娆¤惤鐩橈紝鑰屼笉鏄€愭潯 save锛堝師鏉ユ瘡鏉￠兘瑙﹀彂鍏ㄥ簱 export锛?
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
      console.error('鏃ユ湡鏍煎紡淇澶辫触:', e.message)
    }
  }

  _normalizeDate(dateStr) {
    if (!dateStr) return dateStr
    return String(dateStr).replace(/-/g, '/')
  }

  // ========== 琛ㄥ垵濮嬪寲 ==========

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 鏍囩琛細鍐呯疆甯哥敤鏍囩 + 鐢ㄦ埛鑷畾涔夈€?
    // is_builtin=1 鐨勬爣绛句笉鍏佽鍒犻櫎锛堥伩鍏嶈鍒犲悗鏃犳硶鎭㈠璇箟锛夛紝浣嗗厑璁告敼鍚?鏀硅壊銆?
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

    // 杩佺Щ
    let structuralChange = false
    structuralChange = this._migrateAddColumn('watching', 'sort_order', 'REAL DEFAULT 0') || structuralChange
    structuralChange = this._migrateAddColumn('remaining', 'sort_order', 'REAL DEFAULT 0') || structuralChange
    structuralChange = this._migrateAddColumn('watched', 'sort_order', 'REAL DEFAULT 0') || structuralChange
    structuralChange = this._migrateAddColumn('watched', 'watch_date', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('watching', 'url', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('remaining', 'url', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('watched', 'url', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('watching', 'url_params', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('remaining', 'url_params', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('watched', 'url_params', 'TEXT') || structuralChange
    // 鍘嗗彶搴撶殑 watched_years 娌℃湁 updated_at锛堟棭鏈?README 涔熷姝ゅ０鏄庯級锛涜ˉ鍒楄銆屽悇琛ㄥ潎鍚€嶅悕鍓叾瀹炪€?
    // 娉ㄦ剰锛歋QLite 鐨?ALTER TABLE ADD COLUMN 涓嶆帴鍙?CURRENT_TIMESTAMP 浣滀负榛樿鍊?
    // 锛堥潪甯搁噺琛ㄨ揪寮忥級锛屾墍浠ヨ繖閲岀敤鍙┖鍒楋紝闅忓悗鍥炲～銆?
    structuralChange = this._migrateAddColumn('watched_years', 'created_at', 'TIMESTAMP') || structuralChange
    structuralChange = this._migrateAddColumn('watched_years', 'updated_at', 'TIMESTAMP') || structuralChange
    structuralChange = this._migrateAddColumn('watched_years', 'sort_order', 'REAL DEFAULT 0') || structuralChange

    // 涓夊紶涓昏〃鍔?tags 瀛楁锛氬瓨鏍囩鍚嶏紝澶氫釜鐢ㄩ€楀彿鍒嗛殧锛堝 "鐑,鍘熷垱"锛夈€?
    // 閫夐€楀彿鑰岄潪 JSON 鏄负浜嗚兘鐩存帴 WHERE LIKE 杩囨护锛屼笖瀵煎嚭 Excel 鏃跺彲璇汇€?
    structuralChange = this._migrateAddColumn('watching', 'tags', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('remaining', 'tags', 'TEXT') || structuralChange
    structuralChange = this._migrateAddColumn('watched', 'tags', 'TEXT') || structuralChange

    // 鎬婚泦鏁帮細鐢ㄤ簬鏄剧ず杩界暘杩涘害鐧惧垎姣旓紙濡?3/12 = 25%锛夈€?
    // 瀛?TEXT 鑰岄潪 INTEGER锛氬吋瀹广€?2銆嶃€?2+銆嶃€?銆嶈繖绫讳笉纭畾鎯呭喌锛?
    // 瑙ｆ瀽澶辫触鏃惰繘搴︽潯鑷姩闅愯棌锛屼笉浼氭樉绀洪敊璇暟瀛椼€?
    structuralChange = this._migrateAddColumn('watching', 'total_episodes', 'TEXT') || structuralChange

    // 鍐呯疆甯哥敤鏍囩锛氶娆″惎鍔ㄦ椂鎾銆傚凡瀛樺湪鐨勫悕瀛楄烦杩囷紝涓嶄細瑕嗙洊鐢ㄦ埛鏀硅繃鐨勯鑹层€?
    if (this._seedBuiltinTags()) structuralChange = true
    if (structuralChange) {
      try {
        this.db.run("UPDATE watched_years SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP), updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)")
      } catch { /* ignore */ }
    }

    if (this._migrateWatchingEpisodeToText()) structuralChange = true

    // 绱㈠紩锛氳鎸夊ぉ/鎸夊勾/鎸夋帓搴忕殑鏌ヨ璧扮储寮曡€屼笉鏄叏琛ㄦ壂鎻?
    this._ensureIndexes()

    try {
      this.db.run(`UPDATE watched SET watch_date = watch_year WHERE watch_date IS NULL OR watch_date = ''`)
      if (this.db.getRowsModified() > 0) structuralChange = true
    } catch(e) {}

    // 鍙湁缁撴瀯/鏁版嵁鐪熺殑鍙樹簡鎵嶈惤鐩橈細閬垮厤姣忔鍚姩閮界櫧鍐欎竴閬嶅叏搴?
    if (structuralChange) this.save()
  }

  /**
   * 鎾鍐呯疆甯哥敤鏍囩銆傚彧鍦ㄩ娆″惎鍔紙tags 琛ㄤ负绌猴級鏃舵墽琛屼竴娆°€?
   * 鍛藉悕涓庨厤鑹叉寜鍔ㄦ极浣滃搧甯歌鍒嗙被涔犳儻鎸戦€夛紝鐢ㄦ埛鍙敼鍚?鏀硅壊锛屼絾鍐呯疆鏍囩涓嶅厑璁稿垹闄ゃ€?
   */
  _seedBuiltinTags() {
    try {
      const count = this._all('SELECT COUNT(*) AS n FROM tags')[0]?.n || 0
      if (count > 0) return false
      const builtins = [
        ['鐑', '#EF4444'],
        ['鏃ュ父', '#10B981'],
        ['鎭嬬埍', '#EC4899'],
        ['濂囧够', '#8B5CF6'],
        ['绉戝够', '#0EA5E9'],
        ['鎮枒', '#6B7280'],
        ['鎼炵瑧', '#F59E0B'],
        ['娌绘剤', '#14B8A6'],
        ['鏈烘垬', '#6366F1'],
        ['杩愬姩', '#F97316'],
        ['闊充箰', '#D946EF'],
        ['鍓у満鐗?, '#84CC16'],
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

  // ========== 鏍囩 CRUD ==========
  getAllTags() {
    return this._all('SELECT * FROM tags ORDER BY sort_order ASC, id ASC')
  }

  addTag(name, color = '') {
    const trimmed = String(name || '').trim()
    if (!trimmed) return { success: false, error: '鏍囩鍚嶄笉鑳戒负绌? }
    // 鍘婚噸锛氬悓鍚嶆爣绛句笉鍐嶉噸澶嶆彃鍏ワ紙涓嫳鏂囧悕閮芥寜鍘熸牱姣旇緝锛?
    const exists = this._all('SELECT id FROM tags WHERE name = ?', [trimmed])
    if (exists.length) return { success: false, error: '璇ユ爣绛惧凡瀛樺湪' }
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
    if (!row) return { success: false, error: '鏍囩涓嶅瓨鍦? }
    const nextName = name !== undefined ? String(name).trim() : row.name
    if (!nextName) return { success: false, error: '鏍囩鍚嶄笉鑳戒负绌? }
    // 鏀瑰悕鏃惰妫€鏌ラ噸鍚嶏紙鎺掗櫎鑷繁锛?
    if (nextName !== row.name) {
      const dup = this._all('SELECT id FROM tags WHERE name = ? AND id != ?', [nextName, id])
      if (dup.length) return { success: false, error: '璇ユ爣绛惧凡瀛樺湪' }
      // 鏉＄洰涓婅褰曠殑鏄爣绛惧悕锛屾敼鍚嶅悗瑕佸悓姝ユ洿鏂帮紝鍚﹀垯鏉＄洰浼氭寚鍚戜笉瀛樺湪鐨勬爣绛?
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
    if (!row) return { success: false, error: '鏍囩涓嶅瓨鍦? }
    if (row.is_builtin) return { success: false, error: '鍐呯疆鏍囩涓嶈兘鍒犻櫎' }
    try {
      this.db.run('DELETE FROM tags WHERE id = ?', [id])
      // 鍚屾椂浠庢墍鏈夋潯鐩笂鎽樻帀杩欎釜鏍囩
      this._removeTagFromItems(row.name)
      this.save()
      return { success: true }
    } catch (e) {
      return { success: false, error: errorMessage(e) }
    }
  }

  /** 鏍囩鏀瑰悕鍚庯紝鎶婃墍鏈夋潯鐩?tags 瀛楁閲岀殑鏃у悕鏇挎崲涓烘柊鍚?*/
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
      } catch { /* 琛ㄤ笉瀛樺湪鍒欒烦杩?*/ }
    }
  }

  /** 鍒犻櫎鏍囩鏃讹紝鎶婂畠浠庢墍鏈夋潯鐩殑 tags 瀛楁涓Щ闄?*/
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
      ['idx_watched_date', 'watched', 'watch_date'],
      ['idx_years_sort', 'watched_years', 'sort_order, id']
    ]
    for (const [name, table, cols] of indexes) {
      try {
        this.db.run(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${cols})`)
      } catch (e) { /* 琛ㄦ垨鍒椾笉瀛樺湪鏃跺拷鐣?*/ }
    }
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
      // 娉ㄦ剰锛氶噸寤鸿〃鏃跺繀椤绘妸**鎵€鏈夋柊澧炲垪**閮藉甫涓婏紙tags / total_episodes锛夛紝
      // 鍚﹀垯杩佺Щ鍚庤〃閲岀己瀛楁锛屽悗缁?addWatching 鐨?INSERT 浼氬洜鍒椾笉瀛樺湪鑰屽け璐ャ€?
      // 鏃ц〃娌℃湁杩欎簺鍒楁椂鐢?col() 鍏滃簳涓虹┖涓层€?
      this.db.run(`
        INSERT INTO watching (id, name, day_of_week, time_slot, current_episode, url, url_params, notes, tags, total_episodes, sort_order, created_at, updated_at)
        SELECT id, name,
          ${col('day_of_week', "''")},
          ${col('time_slot', "''")},
          CAST(${col('current_episode', "'0'")} AS TEXT),
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
        throw new Error('watching 杩佺Щ琛屾暟涓嶄竴鑷?)
      }
      this.db.run(`DROP TABLE watching_old`)
      this.db.run('COMMIT')
      return true
    } catch (e) {
      try { this.db.run('ROLLBACK') } catch { /* ignore */ }
      // 浜嬪姟鍥炴粴鍚庢棫琛ㄥ簲宸叉仮澶嶄负 watching锛涜嫢涓€旂暀涓?watching_old锛屾妸瀹冩敼鍥炲幓锛岄伩鍏嶆暟鎹彧鐣欏湪澶囦唤琛ㄩ噷
      try {
        const leftover = this._all(`SELECT name FROM sqlite_master WHERE type='table' AND name='watching_old'`)
        const current = this._all(`SELECT name FROM sqlite_master WHERE type='table' AND name='watching'`)
        if (leftover.length && !current.length) {
          this.db.run('ALTER TABLE watching_old RENAME TO watching')
        }
      } catch { /* ignore */ }
      console.error('watching 闆嗘暟鍒楄縼绉诲け璐ワ紝宸蹭繚鐣欏師琛?', e.message)
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
    const changed = this.db.getRowsModified()
    if (!this._batchDepth) this.save()
    return changed
  }

  // 鍙栨渶杩戜竴娆?INSERT 鐢熸垚鐨勮嚜澧?id锛堢揣璺熷湪 _run 鐨?INSERT 涔嬪悗璋冪敤锛?
  // 鍙栨渶杩戜竴娆?INSERT 鐢熸垚鐨勮嚜澧?id銆?
  // 娉ㄦ剰锛氬繀椤荤揣璐?INSERT 涔嬪悗璋冪敤锛屼笖涓棿涓嶈兘鍐嶆墽琛屼换浣曚細閲嶇疆璇ュ€肩殑璇彞銆?
  // sql.js 涓?last_insert_rowid() 鏄繛鎺ョ骇鐘舵€侊紝prepare+step 璇诲彇鏄彲闈犵殑銆?
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
      // 鎵归噺缁撴潫缁熶竴钀界洏涓€娆★紙鍐呴儴璧?flush 鍚堝苟锛?
      this.save()
    }
  }

  rollbackBatch() {
    if (!this._batchDepth) return
    this._batchDepth = 0
    try { this.db.run('ROLLBACK') } catch { /* ignore */ }
  }

  // ========== 杩界暘琛ㄦ搷浣?==========

  addWatching({ name, day_of_week = '', time_slot = '', current_episode = '0', url = '', url_params = '', notes = '', tags = '', total_episodes = '', sort_order = 0 } = {}) {
    const cleanName = normalizeName(name)
    if (!cleanName) return { success: false, error: '鐣墽鍚嶇О涓嶈兘涓虹┖' }
    try {
      this._run(
        'INSERT INTO watching (name, day_of_week, time_slot, current_episode, url, url_params, notes, tags, total_episodes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [cleanName, day_of_week, time_slot, current_episode, url, url_params, notes, tags, String(total_episodes ?? ''), normalizeSortOrder(sort_order)]
      )
      // name 涓婃湁 UNIQUE 绾︽潫锛屾寜鍚嶇О鍥炴煡 id 姣斾緷璧?rowid 鏃跺簭鏇村彲闈?
      const row = this._get('SELECT id FROM watching WHERE name = ?', [cleanName])
      return { success: true, id: row ? Number(row.id) : null }
    } catch (err) {
      // 娉ㄦ剰锛氫笉鑳界敤 err.message 鐩存帴鍒ら噸鈥斺€攕ql.js 鍙兘鎶涜８瀛楃涓诧紙鏃?.message锛?
      if (isUniqueViolation(err)) {
        return { success: false, error: '璇ョ暘鍓у凡瀛樺湪' }
      }
      return { success: false, error: errorMessage(err) }
    }
  }

  getAllWatching() {
    return this._all(
      'SELECT id, name, day_of_week, time_slot, current_episode, total_episodes, url, url_params, notes, tags, sort_order FROM watching ORDER BY sort_order, id'
    )
  }

  getWatchingByDay(day) {
    return this._all(
      'SELECT id, name, day_of_week, time_slot, current_episode, url, url_params, notes, sort_order FROM watching WHERE day_of_week = ? ORDER BY sort_order, time_slot',
      [day]
    )
  }

  updateWatching(id, fields) {
    const allowedFields = ['name', 'day_of_week', 'time_slot', 'current_episode', 'total_episodes', 'url', 'url_params', 'notes', 'tags', 'sort_order']
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
      return { success: false, error: '娌℃湁鍙洿鏂扮殑瀛楁' }
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
      if (!row) return { success: false, error: '鏈壘鍒拌褰? }
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
      if (!row) return { success: false, error: '鏈壘鍒拌褰? }
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

  // ========== 绛夌暘琛ㄦ搷浣?==========

  addRemaining({ name, expected_date = '', url = '', url_params = '', notes = '', tags = '', sort_order = 0 } = {}) {
    const cleanName = normalizeName(name)
    if (!cleanName) return { success: false, error: '绛夌暘鍚嶇О涓嶈兘涓虹┖' }
    try {
      const normalizedDate = this._normalizeDate(expected_date)
      this._run(
        'INSERT INTO remaining (name, expected_date, url, url_params, notes, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [cleanName, normalizedDate, url, url_params, notes, tags, normalizeSortOrder(sort_order)]
      )
      const row = this._get('SELECT id FROM remaining WHERE name = ?', [cleanName])
      return { success: true, id: row ? Number(row.id) : null }
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { success: false, error: '璇ョ瓑鐣凡瀛樺湪' }
      }
      return { success: false, error: errorMessage(err) }
    }
  }

  getAllRemaining() {
    return this._all(
      'SELECT id, name, expected_date, url, url_params, notes, tags, sort_order FROM remaining ORDER BY sort_order, id'
    )
  }

  updateRemaining(id, fields) {
    const allowedFields = ['name', 'expected_date', 'url', 'url_params', 'notes', 'tags', 'sort_order']
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
      return { success: false, error: '娌℃湁鍙洿鏂扮殑瀛楁' }
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

  // ========== 宸茬湅琛ㄦ搷浣?==========

  addWatched({ name, watch_date, url = '', url_params = '', notes = '', tags = '', sort_order = 0 } = {}) {
    const cleanName = normalizeName(name)
    if (!cleanName) return { success: false, error: '浣滃搧鍚嶇О涓嶈兘涓虹┖' }
    try {
      const normalizedDate = this._normalizeDate(watch_date)
      this.beginBatch()
      this._run(
        'INSERT INTO watched (name, watch_date, url, url_params, notes, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [cleanName, normalizedDate, url, url_params, notes, tags, normalizeSortOrder(sort_order)]
      )
      this._ensureYearLabel(normalizedDate)
      // watched 琛?name 鏃?UNIQUE锛岀敤鏈€鏂颁竴琛岀殑 id锛堟柊鎻掑叆蹇呯劧 sort_order/id 鏈€澶э級
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
    return this._all(
      'SELECT id, name, watch_date, url, url_params, notes, tags, sort_order FROM watched ORDER BY sort_order, id'
    )
  }

  getWatchedByYear(year) {
    const label = String(year)
    const range = label.match(/^(\d{4})\s*~\s*(\d{4})$/)
    if (range) {
      const start = parseInt(range[1], 10)
      const end = parseInt(range[2], 10)
      return this._all(
        'SELECT id, name, watch_date, url, url_params, notes, tags, sort_order FROM watched ORDER BY sort_order, id'
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
      "SELECT id, name, watch_date, url, url_params, notes, sort_order FROM watched WHERE watch_date = ? OR watch_date LIKE ? ESCAPE '\\' ORDER BY sort_order, id",
      [label, this._likePrefix(label)]
    )
  }

  getWatchedCountByYear(year) {
    return this.getWatchedByYear(year).length
  }

  _likePrefix(year) {
    return String(year).replace(/[\\%_]/g, ch => '\\' + ch) + '/%'
  }

  getTotalWatchedCount() {
    const row = this._get('SELECT COUNT(*) as count FROM watched')
    return row ? row.count : 0
  }

  updateWatched(id, fields) {
    const allowedFields = ['name', 'watch_date', 'url', 'url_params', 'notes', 'tags', 'sort_order']
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
      return { success: false, error: '娌℃湁鍙洿鏂扮殑瀛楁' }
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

  // ========== 宸茬湅骞翠唤鎿嶄綔 ==========

  addWatchedYear({ year_label, sort_order = 0 } = {}) {
    const label = normalizeName(year_label)
    if (!label) return { success: false, error: '骞翠唤鏍囩涓嶈兘涓虹┖' }
    try {
      this._run(
        'INSERT INTO watched_years (year_label, sort_order) VALUES (?, ?)',
        [label, normalizeSortOrder(sort_order)]
      )
      return { success: true }
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { success: false, error: '璇ュ勾浠藉凡瀛樺湪' }
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
      return { success: false, error: '娌℃湁鍙洿鏂扮殑瀛楁' }
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

  // ========== 鎵归噺鎿嶄綔 ==========

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
    if (!allowed.includes(table)) return { success: false, error: '涓嶆敮鎸佺殑琛? }
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

  // ========== 鐘舵€佽縼绉?==========

  moveWatchingToRemaining(watchingId) {
    try {
      const row = this._get('SELECT name, url, url_params, notes, sort_order FROM watching WHERE id = ?', [watchingId])
      if (!row) return { success: false, error: '鏈壘鍒拌褰? }
      this.beginBatch()
      this._run(
        'INSERT INTO remaining (name, expected_date, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [row.name, '', row.url || '', row.url_params || '', row.notes, row.sort_order]
      )
      const removed = this._run('DELETE FROM watching WHERE id = ?', [watchingId])
      if (!removed) throw new Error('婧愯褰曞垹闄ゅけ璐?)
      this.commitBatch()
      return { success: true }
    } catch (err) {
      this.rollbackBatch()
      if (isUniqueViolation(err)) {
        return { success: false, error: '璇ョ瓑鐣凡瀛樺湪' }
      }
      return { success: false, error: errorMessage(err) }
    }
  }

  moveWatchingToWatched(watchingId, watchDate) {
    try {
      const normalizedDate = this._normalizeDate(watchDate)
      const row = this._get('SELECT name, url, url_params, notes, sort_order FROM watching WHERE id = ?', [watchingId])
      if (!row) return { success: false, error: '鏈壘鍒拌褰? }
      // 浠庤拷鐣Щ鍏ュ凡鐪嬫椂娓呯┖閾炬帴锛氳拷鐣〉鐨勯摼鎺ユ槸杩芥洿鍦板潃锛屽凡鐪嬭褰曚笉鍐嶉渶瑕佸畠銆?
      this.beginBatch()
      this._run(
        'INSERT INTO watched (name, watch_date, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [row.name, normalizedDate, '', '', row.notes, row.sort_order]
      )
      this._ensureYearLabel(normalizedDate)
      const removed = this._run('DELETE FROM watching WHERE id = ?', [watchingId])
      if (!removed) throw new Error('婧愯褰曞垹闄ゅけ璐?)
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
      const row = this._get('SELECT name, url, url_params, notes, sort_order FROM remaining WHERE id = ?', [remainingId])
      if (!row) return { success: false, error: '鏈壘鍒拌褰? }
      this.beginBatch()
      this._run(
        'INSERT INTO watching (name, day_of_week, time_slot, current_episode, url, url_params, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [row.name, day_of_week, time_slot, '0', row.url || '', row.url_params || '', row.notes, row.sort_order]
      )
      const removed = this._run('DELETE FROM remaining WHERE id = ?', [remainingId])
      if (!removed) throw new Error('婧愯褰曞垹闄ゅけ璐?)
      this.commitBatch()
      return { success: true }
    } catch (err) {
      this.rollbackBatch()
      if (isUniqueViolation(err)) {
        return { success: false, error: '璇ョ暘鍓у凡瀛樺湪' }
      }
      return { success: false, error: errorMessage(err) }
    }
  }
}

// ========== IndexedDB 鎿嶄綔 ==========

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
    console.warn('浠?IndexedDB 鍔犺浇鏁版嵁澶辫触:', e)
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
    console.warn('淇濆瓨鍒?IndexedDB 澶辫触:', e)
    if (strict || dbInstance?.strictPersistence) throw e
  }
}

/**
 * 鑾峰彇鏁版嵁搴撳疄渚嬶紙鍗曚緥锛?
 * 渚?api.js 鍜?excelImporter.js 浣跨敤
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

// 鍚屾椂瀵煎嚭 BangumiDatabase.create 渚涘垵濮嬪寲浣跨敤
export { BangumiDatabase }


export default BangumiDatabase
