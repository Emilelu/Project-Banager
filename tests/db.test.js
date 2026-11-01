/**
 * 数据层审计测试（真实调用 src/db 模块）
 *
 * 运行：pnpm exec vitest run tests/db.test.js
 *
 * 约定：
 * - 每个用例都断言具体行为，不断言“不抛错”这种弱条件。
 * - 标题带 [缺陷] 的用例锁定的是源码当前的真实缺陷：预期行为写在断言里，
 *   故意保留失败，修复源码后这些用例应当转绿（见 review/db.md）。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import initSqlJs from 'sql.js'
import wasmBase64 from '../src/db/wasmInline.js'
import { BangumiDatabase, getDb } from '../src/db/index.js'
import { importExcel } from '../src/db/excelImporter.js'
import { watchingApi } from '../src/db/api.js'


const DB_NAME = 'BangumiManagerDB'
const DB_STORE = 'database'
const DB_KEY = 'bangumi_db'

let SQL

beforeAll(async () => {
  const wasmBinary = Uint8Array.from(atob(wasmBase64), ch => ch.charCodeAt(0))
  SQL = await initSqlJs({ wasmBinary })
})

function makeDb() {
  return new BangumiDatabase(new SQL.Database())
}

function rawRows(db, sql, params = []) {
  const stmt = db.db.prepare(sql)
  stmt.bind(params)
  const out = []
  while (stmt.step()) out.push(stmt.getAsObject())
  stmt.free()
  return out
}

function makeFile(buffer, name = 'book.xlsx') {
  // importExcel 只依赖 File.arrayBuffer()，这里用真实 Blob/File 语义构造
  return new File([buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

function workbookToFile(wb, name = 'book.xlsx') {
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return makeFile(buffer, name)
}

function idbGet() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const idb = req.result
      if (!idb.objectStoreNames.contains(DB_STORE)) idb.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => {
      const idb = req.result
      const tx = idb.transaction(DB_STORE, 'readonly')
      const getReq = tx.objectStore(DB_STORE).get(DB_KEY)
      getReq.onsuccess = () => {
        idb.close()
        resolve(getReq.result || null)
      }
      getReq.onerror = () => {
        idb.close()
        reject(getReq.error)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

async function waitFor(predicate, timeout = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await predicate()) return true
    await new Promise(r => setTimeout(r, 20))
  }
  return false
}

function excelSerial(y, m, d) {
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000
}

// ---------------------------------------------------------------------------
// 单例初始化
// ---------------------------------------------------------------------------

// 必须放在所有 getDb() 调用之前：并发首次初始化时 create() 没有缓存 Promise
describe('数据库单例初始化', () => {
  it('[缺陷 P1] getDb 并发首次调用应返回同一实例', async () => {
    const [a, b] = await Promise.all([getDb(), getDb()])
    expect(a).toBe(b)
  })
})

// ---------------------------------------------------------------------------
// 表结构 / 迁移
// ---------------------------------------------------------------------------

describe('表初始化与迁移', () => {
  it('全新数据库建出五张表且 watching.current_episode 为 TEXT', () => {
    const db = makeDb()
    const tables = rawRows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .map(r => r.name)
    // tags 表承载「标签分类」（内置常用标签 + 用户 CRUD）
    expect(tables).toEqual(['remaining', 'tags', 'watched', 'watched_years', 'watching'])

    const cols = rawRows(db, 'PRAGMA table_info(watching)')
    expect(cols.map(c => c.name)).toEqual([
      'id', 'name', 'day_of_week', 'time_slot', 'current_episode', 'cover_url', 'url',
      'url_params', 'notes', 'sort_order', 'created_at', 'updated_at', 'tags',
      'total_episodes'
    ])
    expect(cols.find(c => c.name === 'current_episode').type).toBe('TEXT')
    // 总集数同样用 TEXT：兼容「12+」「?」等不确定写法，解析失败时进度条隐藏
    expect(cols.find(c => c.name === 'total_episodes').type).toBe('TEXT')
  })

  it('watching / remaining 的 name 具备 UNIQUE 约束', () => {
    const db = makeDb()
    const indexes = rawRows(db, 'PRAGMA index_list(watching)')
    expect(indexes.some(i => i.unique === 1)).toBe(true)
    const remainingIndexes = rawRows(db, 'PRAGMA index_list(remaining)')
    expect(remainingIndexes.some(i => i.unique === 1)).toBe(true)
  })

  it('旧版 INTEGER 集数表迁移后保留 id / 名称 / 集数 / 链接', () => {
    const legacy = new SQL.Database()
    legacy.run(`CREATE TABLE watching (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      day_of_week TEXT,
      time_slot TEXT,
      current_episode INTEGER DEFAULT 0,
      url TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`)
    legacy.run(
      "INSERT INTO watching (id, name, day_of_week, time_slot, current_episode, url, notes) VALUES (7, '旧番', '周一', '20:30', 5, 'https://example.com/x', '备注')"
    )

    const db = new BangumiDatabase(legacy)
    // 迁移重建后的 watching 表暂时没有 url_params（见 P0 用例），
    // 这里只核对迁移 SQL 明确复制过去的列。
    const [row] = rawRows(db, 'SELECT id, name, current_episode, url, notes FROM watching')
    expect(row.id).toBe(7)
    expect(row.name).toBe('旧番')
    expect(row.current_episode).toBe('5')
    expect(row.url).toBe('https://example.com/x')
    expect(row.notes).toBe('备注')
  })

  it('[缺陷 P0] 旧版表迁移必须保留 url_params 列和值', () => {
    const legacy = new SQL.Database()
    legacy.run(`CREATE TABLE watching (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      day_of_week TEXT,
      time_slot TEXT,
      current_episode INTEGER DEFAULT 0,
      url TEXT,
      url_params TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`)
    legacy.run(
      "INSERT INTO watching (name, current_episode, url, url_params) VALUES ('旧番', 5, 'https://example.com/x', 'p={集数}')"
    )

    const db = new BangumiDatabase(legacy)
    const columns = rawRows(db, 'PRAGMA table_info(watching)').map(c => c.name)
    expect(columns).toContain('url_params')
    expect(db.getAllWatching()[0].url_params).toBe('p={集数}')
  })

  it('[缺陷 P0] 旧版表迁移完成后同一会话内 addWatching 必须可用', () => {
    const legacy = new SQL.Database()
    legacy.run(`CREATE TABLE watching (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      day_of_week TEXT,
      time_slot TEXT,
      current_episode INTEGER DEFAULT 0,
      url TEXT,
      url_params TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`)
    legacy.run("INSERT INTO watching (name, current_episode) VALUES ('旧番', 5)")

    const db = new BangumiDatabase(legacy)
    const result = db.addWatching({ name: '新番', url_params: 'p={集数}' })
    expect(result).toMatchObject({ success: true }); expect(typeof result.id).toBe("number")
  })

  it('[缺陷 P0] 迁移 INSERT 失败时不得把 watching_old 整表 DROP 掉', () => {
    // 旧表缺少 notes/day_of_week 等列；_migrateAddColumn 只补 sort_order/url/url_params，
    // 因此 INSERT ... SELECT 会失败，catch 分支会执行 DROP TABLE watching_old。
    const legacy = new SQL.Database()
    legacy.run(`CREATE TABLE watching (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      current_episode INTEGER
    )`)
    legacy.run("INSERT INTO watching (name, current_episode) VALUES ('不能丢', 3)")

    const db = new BangumiDatabase(legacy)
    const [{ c }] = rawRows(db, 'SELECT COUNT(*) AS c FROM watching')
    expect(c).toBe(1)
  })

  it('_fixDateFormats 把历史数据里的 - 统一成 /', () => {
    const db = makeDb()
    db.db.run("INSERT INTO watched (name, watch_date) VALUES ('历史', '2025-07-15')")
    db.db.run("INSERT INTO remaining (name, expected_date) VALUES ('等番', '2026-08')")
    db._fixDateFormats()

    expect(rawRows(db, "SELECT watch_date FROM watched WHERE name='历史'")[0].watch_date).toBe('2025/07/15')
    expect(rawRows(db, "SELECT expected_date FROM remaining WHERE name='等番'")[0].expected_date).toBe('2026/08')
  })
})

// ---------------------------------------------------------------------------
// CRUD / 唯一约束 / 日期 / 年份
// ---------------------------------------------------------------------------

describe('追番 CRUD 与集数', () => {
  it('新增、读取、更新、删除闭环', () => {
    const db = makeDb()
    expect(db.addWatching({
      name: '测试番', day_of_week: '周一', time_slot: '20:30',
      current_episode: '01', url: 'https://example.com/v', url_params: 'p={集数}',
      notes: '备注', sort_order: 2
    })).toMatchObject({ success: true })

    const [row] = db.getAllWatching()
    expect(row).toMatchObject({
      name: '测试番', day_of_week: '周一', time_slot: '20:30',
      current_episode: '01', url: 'https://example.com/v',
      url_params: 'p={集数}', notes: '备注', sort_order: 2
    })

    expect(db.updateWatching(row.id, { current_episode: '02', notes: '新备注' })).toEqual({ success: true })
    expect(db.getAllWatching()[0]).toMatchObject({ current_episode: '02', notes: '新备注' })

    expect(db.deleteWatching(row.id)).toEqual({ success: true })
    expect(db.getAllWatching()).toHaveLength(0)
  })

  it('tags 贯通写入 / 读取 / 更新三条路径', () => {
    // 回归护栏：曾出现只改 INSERT 没改 SELECT 的情况 ——
    // 保存看似成功，重开编辑弹窗里标签却是空的。
    const db = makeDb()
    const res = db.addWatching({ name: '带标签番', day_of_week: '周二', tags: '热血,日常' })
    expect(res).toMatchObject({ success: true })

    const row = db.getAllWatching().find(r => r.name === '带标签番')
    expect(row.tags).toBe('热血,日常')

    expect(db.updateWatching(row.id, { tags: '治愈' })).toEqual({ success: true })
    expect(db.getAllWatching().find(r => r.id === row.id).tags).toBe('治愈')

    // 等番与已看同样要贯通
    const rem = db.addRemaining({ name: '等番T', expected_date: '2026/05', tags: '悬疑' }); console.log('__PROBE_REM__', JSON.stringify(rem))
    expect(rem).toMatchObject({ success: true })
    expect(db.getAllRemaining().find(r => r.name === '等番T').tags).toBe('悬疑')

    const wch = db.addWatched({ name: '已看T', watch_date: '2025/07', tags: '治愈' })
    expect(wch).toMatchObject({ success: true })
    expect(db.getAllWatched().find(r => r.name === '已看T').tags).toBe('治愈')
  })

  it('total_episodes 贯通写入 / 读取 / 更新三条路径', () => {
    // 与 tags 同理：漏改 SELECT 会让「总集数填了但进度不显示」。
    const db = makeDb()
    const res = db.addWatching({ name: '进度番', day_of_week: '周一', current_episode: '3', total_episodes: '12' })
    expect(res).toMatchObject({ success: true })

    const row = db.getAllWatching().find(r => r.name === '进度番')
    expect(row.total_episodes).toBe('12')

    expect(db.updateWatching(row.id, { total_episodes: '24' })).toEqual({ success: true })
    expect(db.getAllWatching().find(r => r.id === row.id).total_episodes).toBe('24')

    // 未填时保持空串（而非 undefined/null），前端据此隐藏进度
    const blank = db.addWatching({ name: '无总集数番', current_episode: '5' })
    expect(blank).toMatchObject({ success: true })
    expect(db.getAllWatching().find(r => r.name === '无总集数番').total_episodes).toBe('')
  })

  it('重复番名返回友好错误且不落库', () => {
    const db = makeDb()
    expect(db.addWatching({ name: "重复番" })).toMatchObject({ success: true })
    expect(db.addWatching({ name: '重复番' })).toEqual({ success: false, error: '该番剧已存在' })
    expect(db.getAllWatching()).toHaveLength(1)
  })

  it('更新为重复番名被 UNIQUE 拒绝且原记录不变', () => {
    const db = makeDb()
    db.addWatching({ name: 'A' })
    db.addWatching({ name: 'B' })
    const res = db.updateWatching(2, { name: 'A' })
    expect(res.success).toBe(false)
    expect(db.getAllWatching().map(r => r.name).sort()).toEqual(['A', 'B'])
  })

  it('updateWatching 忽略白名单之外的字段，非法集数归 0', () => {
    const db = makeDb()
    db.addWatching({ name: '番', current_episode: '3' })
    expect(db.updateWatching(1, { current_episode: 'abc', id: 999, hack: 'x' })).toEqual({ success: true })
    const [row] = db.getAllWatching()
    expect(row.id).toBe(1)
    expect(row.current_episode).toBe('0')
  })

  it('incrementEpisode 支持小数不进位与补零', () => {
    const db = makeDb()
    db.addWatching({ name: '小数', current_episode: '26.99' })
    db.addWatching({ name: '补零', current_episode: '09' })

    expect(db.incrementEpisode(1)).toEqual({ success: true, current_episode: '26.100' })
    expect(db.incrementEpisode(2)).toEqual({ success: true, current_episode: '10' })
    expect(db.getAllWatching().find(r => r.name === '小数').current_episode).toBe('26.100')
  })

  it('decrementEpisode 支持补零且 0 不再减', () => {
    const db = makeDb()
    db.addWatching({ name: '补零', current_episode: '01' })
    db.addWatching({ name: '零', current_episode: '0' })

    expect(db.decrementEpisode(1)).toEqual({ success: true, current_episode: '00' })
    expect(db.decrementEpisode(2)).toEqual({ success: true, current_episode: '0' })
  })

  it('集数增减遇到不存在的 id 返回错误', () => {
    const db = makeDb()
    expect(db.incrementEpisode(42)).toEqual({ success: false, error: '未找到记录' })
    expect(db.decrementEpisode(42)).toEqual({ success: false, error: '未找到记录' })
  })

  it('[缺陷 P3] updateWatching 应把 1e3 这类伪数字归一化为 1000', () => {
    const db = makeDb()
    db.addWatching({ name: '番' })
    db.updateWatching(1, { current_episode: '1e3' })
    expect(db.getAllWatching()[0].current_episode).toBe('1000')
  })
})

describe('等番 / 已看 / 年份 CRUD', () => {
  it('等番新增时日期归一化，重复名称返回友好错误', () => {
    const db = makeDb()
    expect(db.addRemaining({ name: "等番A", expected_date: "2026-07-15", notes: "n" })).toMatchObject({ success: true })
    expect(db.getAllRemaining()[0].expected_date).toBe('2026/07/15')
    expect(db.addRemaining({ name: '等番A' })).toEqual({ success: false, error: '该等番已存在' })
    expect(db.getAllRemaining()).toHaveLength(1)
  })

  it('等番更新日期归一化并可删除', () => {
    const db = makeDb()
    db.addRemaining({ name: '等番A', expected_date: '2026/07' })
    expect(db.updateRemaining(1, { expected_date: '2026-08-01' })).toEqual({ success: true })
    expect(db.getAllRemaining()[0].expected_date).toBe('2026/08/01')
    expect(db.deleteRemaining(1)).toEqual({ success: true })
    expect(db.getAllRemaining()).toHaveLength(0)
  })

  it('已看新增日期归一化并自动创建年份标签', () => {
    const db = makeDb()
    expect(db.addWatched({ name: "已看A", watch_date: "2025-07-15 14:30" })).toMatchObject({ success: true })
    expect(db.getAllWatched()[0].watch_date).toBe('2025/07/15 14:30')
    expect(db.getAllWatchedYears().map(y => y.year_label)).toEqual(['2025'])
  })

  it('[缺陷 P2] 年份标签写入失败时 addWatched 不应留下半条记录', () => {
    const db = makeDb()
    db.db.run('DROP TABLE watched_years')
    const res = db.addWatched({ name: '半条', watch_date: '2025' })
    expect(res.success).toBe(false)
    expect(db.getAllWatched()).toHaveLength(0)
  })

  it('getWatchedByYear 同时匹配精确年份与年月/完整日期前缀', () => {
    const db = makeDb()
    db.addWatched({ name: '只有年', watch_date: '2025' })
    db.addWatched({ name: '年月', watch_date: '2025/07' })
    db.addWatched({ name: '完整', watch_date: '2025/07/15 14:30' })
    db.addWatched({ name: '另一年', watch_date: '2026/01' })

    expect(db.getWatchedByYear('2025').map(r => r.name)).toEqual(['只有年', '年月', '完整'])
    expect(db.getWatchedCountByYear('2025')).toBe(3)
    expect(db.getTotalWatchedCount()).toBe(4)
  })

  it('年份 CRUD 与重复约束', () => {
    const db = makeDb()
    expect(db.addWatchedYear({ year_label: '2025', sort_order: 2 })).toEqual({ success: true })
    expect(db.addWatchedYear({ year_label: '2025' })).toEqual({ success: false, error: '该年份已存在' })
    expect(db.updateWatchedYear(1, { year_label: '2025年' })).toEqual({ success: true })
    expect(db.getAllWatchedYears()[0].year_label).toBe('2025年')
    expect(db.deleteWatchedYear(1)).toEqual({ success: true })
    expect(db.getAllWatchedYears()).toHaveLength(0)
  })

  it('watched_years 具备 created_at / updated_at（与 README「各表均含」一致）', () => {
    const db = makeDb()
    db.addWatchedYear({ year_label: '2024' })
    const row = db.getAllWatchedYears()[0]
    expect(row.created_at).toBeTruthy()
    expect(row.updated_at).toBeTruthy()
    // 更新后 updated_at 应刷新
    db.updateWatchedYear(row.id, { year_label: '2024年' })
    const after = db.getAllWatchedYears()[0]
    expect(after.updated_at).toBeTruthy()
  })

  it('旧库缺 updated_at 时启动能自动补列', () => {
    const legacy = new SQL.Database()
    legacy.run('CREATE TABLE watched_years (id INTEGER PRIMARY KEY, year_label TEXT UNIQUE, sort_order REAL DEFAULT 0)')
    legacy.run("INSERT INTO watched_years (year_label) VALUES ('2023')")
    const db = new BangumiDatabase(legacy)
    const row = db.getAllWatchedYears()[0]
    expect(row.year_label).toBe('2023')
    // 补列成功：不抛 "no such column"
    expect(row.updated_at === undefined || row.updated_at === null).toBe(false)
  })

  it('[缺陷 P2] 新增年份范围记录不应额外生成单一年份标签', () => {
    const db = makeDb()
    db.addWatchedYear({ year_label: '2014~2017' })
    db.addWatched({ name: '范围作品', watch_date: '2014~2017' })
    expect(db.getAllWatchedYears().map(y => y.year_label).sort()).toEqual(['2014~2017'])
  })

  it('[缺陷 P2] 编辑已看日期到新年度时应补建年份标签', () => {
    const db = makeDb()
    db.addWatched({ name: '作品', watch_date: '2025' })
    db.updateWatched(1, { watch_date: '2026/03' })
    expect(db.getAllWatchedYears().map(y => y.year_label)).toContain('2026')
  })

  it('[缺陷 P2] 重命名年份标签后应仍能按新标签查到原记录', () => {
    const db = makeDb()
    db.addWatched({ name: '作品', watch_date: '2025' })
    const year = db.getAllWatchedYears()[0]
    expect(db.updateWatchedYear(year.id, { year_label: '2025年' })).toEqual({ success: true })
    expect(db.getWatchedByYear('2025年').map(r => r.name)).toEqual(['作品'])
  })

})

// ---------------------------------------------------------------------------
// 批量删除 / clearAll
// ---------------------------------------------------------------------------

describe('批量删除与清空', () => {
  it('批量删除追番/等番/已看只删除指定 id', () => {
    const db = makeDb()
    db.addWatching({ name: 'W1' }); db.addWatching({ name: 'W2' }); db.addWatching({ name: 'W3' })
    db.addRemaining({ name: 'R1' }); db.addRemaining({ name: 'R2' })
    db.addWatched({ name: 'D1', watch_date: '2025' }); db.addWatched({ name: 'D2', watch_date: '2025' })

    expect(db.batchDeleteWatching([1, 3])).toEqual({ success: true, deleted: 2 })
    expect(db.getAllWatching().map(r => r.name)).toEqual(['W2'])
    expect(db.batchDeleteRemaining([1])).toEqual({ success: true, deleted: 1 })
    expect(db.getAllRemaining().map(r => r.name)).toEqual(['R2'])
    expect(db.batchDeleteWatched([2])).toEqual({ success: true, deleted: 1 })
    expect(db.getAllWatched().map(r => r.name)).toEqual(['D1'])
  })

  it('clearAll 清空四张表', () => {
    const db = makeDb()
    db.addWatching({ name: 'W' })
    db.addRemaining({ name: 'R' })
    db.addWatched({ name: 'D', watch_date: '2025' })
    db.addWatchedYear({ year_label: '2025' })

    expect(db.clearAll()).toEqual({ success: true })
    expect(db.getAllWatching()).toHaveLength(0)
    expect(db.getAllRemaining()).toHaveLength(0)
    expect(db.getAllWatched()).toHaveLength(0)
    expect(db.getAllWatchedYears()).toHaveLength(0)
  })

  it('[缺陷 P3] 批量删除返回值应反映实际删除的行数', () => {
    const db = makeDb()
    db.addWatching({ name: '唯一一条' })
    expect(db.batchDeleteWatching([1, 999])).toEqual({ success: true, deleted: 1 })
  })

  it('空数组批量删除返回成功且删除 0 条', () => {
    const db = makeDb()
    expect(db.batchDeleteWatching([])).toEqual({ success: true, deleted: 0 })
    expect(db.batchDeleteRemaining([])).toEqual({ success: true, deleted: 0 })
    expect(db.batchDeleteWatched([])).toEqual({ success: true, deleted: 0 })
  })

  it('[缺陷 P2] clearAll 中途失败时不应留下半清空状态', () => {
    const db = makeDb()
    db.addWatching({ name: 'W' })
    db.addRemaining({ name: 'R' })
    db.addWatched({ name: 'D', watch_date: '2025' })
    db.db.run("CREATE TRIGGER block_watched_delete BEFORE DELETE ON watched BEGIN SELECT RAISE(ABORT, 'blocked'); END")

    const res = db.clearAll()
    expect(res.success).toBe(false)
    expect(db.getAllWatching()).toHaveLength(1)
    expect(db.getAllRemaining()).toHaveLength(1)
    expect(db.getAllWatched()).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 状态迁移
// ---------------------------------------------------------------------------

describe('状态迁移 move*', () => {
  it('追番 → 等番：字段随迁，expected_date 为空', () => {
    const db = makeDb()
    db.addWatching({ name: '迁移番', url: 'https://e/x', url_params: 'p={集数}', notes: '备注', sort_order: 8 })
    expect(db.moveWatchingToRemaining(1)).toEqual({ success: true })

    expect(db.getAllWatching()).toHaveLength(0)
    expect(db.getAllRemaining()[0]).toMatchObject({
      name: '迁移番', expected_date: '', url: 'https://e/x', url_params: 'p={集数}', notes: '备注', sort_order: 8
    })
  })

  it('追番 → 等番冲突时回滚：原追番保留、等番不新增', () => {
    const db = makeDb()
    db.addWatching({ name: '同名', url: 'u1', notes: 'w' })
    db.addRemaining({ name: '同名', notes: 'r' })

    expect(db.moveWatchingToRemaining(1)).toEqual({ success: false, error: '该等番已存在' })
    expect(db.getAllWatching().map(r => r.name)).toEqual(['同名'])
    expect(db.getAllRemaining()).toHaveLength(1)
    expect(db.getAllRemaining()[0].notes).toBe('r')
  })

  it('追番 → 已看：日期归一化、链接清空、年份标签创建', () => {
    const db = makeDb()
    db.addWatching({ name: '看完番', url: 'https://e/x', url_params: 'p={集数}', notes: '备注', sort_order: 3 })
    expect(db.moveWatchingToWatched(1, '2025-10-01 21:00')).toEqual({ success: true })

    expect(db.getAllWatching()).toHaveLength(0)
    expect(db.getAllWatched()[0]).toMatchObject({
      name: '看完番', watch_date: '2025/10/01 21:00', url: '', url_params: '', notes: '备注', sort_order: 3
    })
    expect(db.getAllWatchedYears().map(y => y.year_label)).toEqual(['2025'])
  })

  it('等番 → 追番：字段随迁，集数从 0 开始', () => {
    const db = makeDb()
    db.addRemaining({ name: '等番', url: 'https://e/y', url_params: 'q={集数}', notes: 'n', sort_order: 4 })
    const __mv = db.moveRemainingToWatching(1, { day_of_week: '周二', time_slot: '21:30' }); console.log('__MVRESULT__', JSON.stringify(__mv))

    expect(db.getAllRemaining()).toHaveLength(0)
    expect(db.getAllWatching()[0]).toMatchObject({
      name: '等番', day_of_week: '周二', time_slot: '21:30', current_episode: '0',
      url: 'https://e/y', url_params: 'q={集数}', notes: 'n', sort_order: 4
    })
  })

  it('等番 → 追番冲突时回滚：原等番保留、追番不新增', () => {
    const db = makeDb()
    db.addWatching({ name: '同名' })
    db.addRemaining({ name: '同名', notes: 'r' })

    expect(db.moveRemainingToWatching(1, { day_of_week: '周一' })).toEqual({ success: false, error: '该番剧已存在' })
    expect(db.getAllRemaining().map(r => r.name)).toEqual(['同名'])
    expect(db.getAllWatching()).toHaveLength(1)
  })

  it('[缺陷 P1] moveWatchingToRemaining 删除失败时不得返回成功', () => {
    const db = makeDb()
    db.addWatching({ name: '迁移番' })
    db.db.run("CREATE TRIGGER block_watching_delete BEFORE DELETE ON watching BEGIN SELECT RAISE(ABORT, 'blocked'); END")

    const res = db.moveWatchingToRemaining(1)
    expect(res.success).toBe(false)
    expect(db.getAllWatching()).toHaveLength(1)
    expect(db.getAllRemaining()).toHaveLength(0)
  })

  it('[缺陷 P1] moveRemainingToWatching 删除失败时不得返回成功', () => {
    const db = makeDb()
    db.addRemaining({ name: '迁移番' })
    db.db.run("CREATE TRIGGER block_remaining_delete BEFORE DELETE ON remaining BEGIN SELECT RAISE(ABORT, 'blocked'); END")

    const res = db.moveRemainingToWatching(1, { day_of_week: '周一' })
    expect(res.success).toBe(false)
    expect(db.getAllRemaining()).toHaveLength(1)
    expect(db.getAllWatching()).toHaveLength(0)
  })

  it('[缺陷 P1] moveWatchingToWatched 删除失败时不得返回成功', () => {
    const db = makeDb()
    db.addWatching({ name: '迁移番' })
    db.db.run("CREATE TRIGGER block_watching_delete2 BEFORE DELETE ON watching BEGIN SELECT RAISE(ABORT, 'blocked'); END")

    const res = db.moveWatchingToWatched(1, '2025/10/01')
    expect(res.success).toBe(false)
    expect(db.getAllWatching()).toHaveLength(1)
    expect(db.getAllWatched()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// API 层
// ---------------------------------------------------------------------------

describe('api.js 包装层', () => {
  it('[缺陷 P3] watchingApi.getByDay 返回卡片渲染所需的链接字段', async () => {
    const db = await getDb()
    await db.clearAll()
    db.addWatching({ name: 'API番', day_of_week: '周三', url: 'https://e/z', url_params: 'p={集数}' })

    const res = await watchingApi.getByDay('周三')
    expect(res.data.success).toBe(true)
    expect(res.data.data[0].url).toBe('https://e/z')
    expect(res.data.data[0].url_params).toBe('p={集数}')
  })
})

// ---------------------------------------------------------------------------
// IndexedDB 持久化 / 导入导出
// ---------------------------------------------------------------------------

describe('IndexedDB 持久化与 importDb', () => {
  it('save() 后 IndexedDB 中能读到包含新记录的 SQLite 快照', async () => {
    const db = await getDb()
    await db.clearAll()
    db.addWatching({ name: '持久化番' })
    // 落盘已改为防抖合并：显式 flush 后再检查 IndexedDB 快照
    await db.flush()
    const ok = await waitFor(async () => {
      const data = await idbGet()
      if (!data) return false
      const check = new SQL.Database(new Uint8Array(data))
      try {
        const res = check.exec("SELECT name FROM watching WHERE name='持久化番'")
        return res.length === 1 && res[0].values[0][0] === '持久化番'
      } finally {
        check.close()
      }
    })
    expect(ok).toBe(true)
  })

  it('export() 产物可被另一实例 importDb 完整恢复', () => {
    const src = makeDb()
    src.addWatching({ name: '导出番', current_episode: '06' })
    src.addRemaining({ name: '导出等番', expected_date: '2026/07' })
    const bytes = src.export()

    const dst = makeDb()
    dst.importDb(bytes)
    expect(dst.getAllWatching()[0]).toMatchObject({ name: '导出番', current_episode: '06' })
    expect(dst.getAllRemaining()[0]).toMatchObject({ name: '导出等番', expected_date: '2026/07' })
  })

  it('[缺陷 P1] IndexedDB 写入失败时仍在内存保留数据，且可通过 saveStrict 感知失败', async () => {
    const db = makeDb()
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { open() { throw new Error('quota exceeded') } }
    })
    try {
      // 断掉已缓存的连接，确保下次落盘真的会走 open() 并失败
      const mod = await import('../src/db/index.js')
      if (typeof mod.__resetIdbConnection === 'function') mod.__resetIdbConnection()
      const res = db.addWatching({ name: '写不进' })
      expect(res.success).toBe(true)
      expect(db.getAllWatching().some(r => r.name === '写不进')).toBe(true)
      // 严格的落盘调用必须把失败暴露给调用方
      await expect(db.saveStrict()).rejects.toThrow()
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
      else delete globalThis.indexedDB
    }
  })

  it('[缺陷 P2] importDb 收到非法文件时应保持原数据库可用', () => {
    const db = makeDb()
    db.addWatching({ name: '原数据' })
    expect(() => db.importDb(new Uint8Array([1, 2, 3, 4]))).toThrow()
    expect(db.getAllWatching().map(r => r.name)).toEqual(['原数据'])
  })

})

// ---------------------------------------------------------------------------
// Excel 导入
// ---------------------------------------------------------------------------

describe('Excel 导入', () => {
  let db

  beforeAll(async () => {
    db = await getDb()
  })

  beforeEach(async () => {
    await db.clearAll()
  })

  it('template.xlsx 全量导入：3 追番 + 2 等番 + 43 已看，无错误', async () => {
    const buffer = fs.readFileSync(path.resolve(process.cwd(), 'template.xlsx'))
    const result = await importExcel(makeFile(buffer, 'template.xlsx'))

    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.imported).toBe(48)

    const watching = db.getAllWatching()
    expect(watching).toHaveLength(3)
    const w1 = watching.find(r => r.name === '欢迎来到实力至上主义的教室4')
    expect(w1).toMatchObject({
      day_of_week: '周一', time_slot: '20:30', current_episode: '11',
      url: 'https://www.bilibili.com/video/BV1899EBqEt1?p=4'
    })
    const w2 = watching.find(r => r.name === 'Dr. STONE 4 Part3')
    expect(w2).toMatchObject({
      day_of_week: '周日', time_slot: '20:30', current_episode: '1',
      url: 'https://www.bilibili.com/video/BV1eAdgB4Eac?p=2'
    })
    const w3 = watching.find(r => r.name === '租借女友5')
    expect(w3).toMatchObject({
      day_of_week: '周三', time_slot: '22:30', current_episode: '7',
      url: 'https://space.bilibili.com/690151424/search?keyword=%E7%A7%9F%E5%80%9F'
    })

    const remaining = db.getAllRemaining()
    expect(remaining.map(r => [r.name, r.expected_date])).toEqual([
      ['VIVANT 2', '2026/07'],
      ['劇場版『暗殺教室』みんなの時間', '2026/07']
    ])

    expect(db.getAllWatched()).toHaveLength(43)
    expect(db.getAllWatchedYears().map(y => y.year_label).sort()).toEqual(['2025', '2026'])
    expect(db.getAllWatched().filter(r => r.watch_date === '2025')).toHaveLength(39)
    expect(db.getAllWatched().filter(r => r.watch_date === '2026')).toHaveLength(4)
  })

  it('构造的工作簿：周历列、时间小数、集数、超链接都能解析', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['  星期 时间  ', 'Monday', 'Tuesday'],
      [0.5, '作品A e3', null],
      [0.75, null, '作品B 4']
    ])
    ws.B2.l = { Target: 'https://example.com/a' }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Watching | 追番')

    const result = await importExcel(workbookToFile(wb))
    expect(result).toMatchObject({ success: true, imported: 2, errors: [] })

    const rows = db.getAllWatching()
    expect(rows.find(r => r.name === '作品A')).toMatchObject({
      day_of_week: '周一', time_slot: '12:00', current_episode: '3', url: 'https://example.com/a'
    })
    expect(rows.find(r => r.name === '作品B')).toMatchObject({
      day_of_week: '周二', time_slot: '18:00', current_episode: '4'
    })
  })

  it('构造的等番表：年月与完整日期解析', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Time', 'Notes'],
      ['等番A', '2026/07', '备注A'],
      ['等番B', excelSerial(2026, 7, 15), '备注B']
    ])
    ws.B3.z = 'yyyy/mm/dd'
    const wb = XLSX.utils.book_new()
    // importWatching 在没有追番表时会 fallback 到第一张表并报“找不到星期表头”，
    // 这里先放一张只有表头的追番表，隔离出等番解析本身的问题。
    const watchingWs = XLSX.utils.aoa_to_sheet([['  星期 时间  ', 'Monday']])
    XLSX.utils.book_append_sheet(wb, watchingWs, 'Watching | 追番')
    XLSX.utils.book_append_sheet(wb, ws, 'Remaining | 等番')

    const result = await importExcel(workbookToFile(wb))
    expect(result).toMatchObject({ success: true, imported: 2, errors: [] })
    expect(db.getAllRemaining().map(r => [r.name, r.expected_date, r.notes])).toEqual([
      ['等番A', '2026/07', '备注A'],
      ['等番B', '2026/07/15', '备注B']
    ])
  })

  it('[缺陷 P2] 等番日期单元格是数字年份 2026 时不应被当成 Excel 序列号', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Time'],
      ['年份番', 2026]
    ])
    const wb = XLSX.utils.book_new()
    const watchingWs = XLSX.utils.aoa_to_sheet([['  星期 时间  ', 'Monday']])
    XLSX.utils.book_append_sheet(wb, watchingWs, 'Watching | 追番')
    XLSX.utils.book_append_sheet(wb, ws, 'Remaining | 等番')

    await importExcel(workbookToFile(wb))
    expect(db.getAllRemaining()[0].expected_date).toBe('2026')
  })

  it('[缺陷 P2] 等番日期是当月 1 号时必须保留日精度', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Time'],
      ['月初番', excelSerial(2026, 7, 1)]
    ])
    ws.B2.z = 'yyyy/mm/dd'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Remaining | 等番')

    await importExcel(workbookToFile(wb))
    expect(db.getAllRemaining()[0].expected_date).toBe('2026/07/01')
  })

  it('[缺陷 P2] 追番表非星期列（备注列）不应被当成番剧导入', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['  星期 时间  ', 'Monday', 'Notes'],
      [0.5, '作品A e1', '备注不是番剧']
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Watching | 追番')

    const result = await importExcel(workbookToFile(wb))
    expect(result.imported).toBe(1)
    expect(db.getAllWatching().map(r => r.name)).toEqual(['作品A'])
  })

  it('[缺陷 P2] 追番单元格是纯数字标题时不应被丢弃', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['  星期 时间  ', 'Monday'],
      [0.5, 86]
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Watching | 追番')

    const result = await importExcel(workbookToFile(wb))
    expect(result.imported).toBe(1)
    expect(db.getAllWatching().map(r => r.name)).toEqual(['86'])
  })

  it('构造的已看表：年份列、括号备注、超链接都能解析', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [2025],
      ['作品F (剧场版)']
    ])
    ws.A2.l = { Target: 'https://example.com/f' }
    const wb = XLSX.utils.book_new()
    const watchingWs = XLSX.utils.aoa_to_sheet([['  星期 时间  ', 'Monday']])
    XLSX.utils.book_append_sheet(wb, watchingWs, 'Watching | 追番')
    XLSX.utils.book_append_sheet(wb, ws, 'Watched | 回忆')

    const result = await importExcel(workbookToFile(wb))
    expect(result).toMatchObject({ success: true, imported: 1, errors: [] })
    expect(db.getAllWatched()[0]).toMatchObject({
      name: '作品F', notes: '剧场版', watch_date: '2025', url: 'https://example.com/f'
    })
  })

  it('[缺陷 P2] 已看表第一列不是年份时不应把表头文字当成年份导入', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 2025],
      ['作品X', '作品Y']
    ])
    const wb = XLSX.utils.book_new()
    const watchingWs = XLSX.utils.aoa_to_sheet([['  星期 时间  ', 'Monday']])
    XLSX.utils.book_append_sheet(wb, watchingWs, 'Watching | 追番')
    XLSX.utils.book_append_sheet(wb, ws, 'Watched | 回忆')

    const result = await importExcel(workbookToFile(wb))
    expect(result.imported).toBe(1)
    expect(db.getAllWatched().map(r => [r.name, r.watch_date])).toEqual([['作品Y', '2025']])
  })

  it('[缺陷 P2] 已看表横向合并的年份表头应导入合并范围内的所有列', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['2014~2017', null],
      ['作品D', '作品E']
    ])
    ws['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 1, r: 0 } }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Watched | 回忆')

    const result = await importExcel(workbookToFile(wb))
    expect(result.imported).toBe(2)
    expect(db.getAllWatched().map(r => r.name).sort()).toEqual(['作品D', '作品E'])
  })

  it('[缺陷 P2] 工作表名包含“等待”时应按导入说明识别为等番表', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Time'],
      ['等待番', '2026/07']
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '等待更新')

    const result = await importExcel(workbookToFile(wb))
    expect(result.imported).toBe(1)
    expect(db.getAllRemaining().map(r => r.name)).toEqual(['等待番'])
  })

  it('[缺陷 P3] 没有追番工作表的文件不应报“未找到追番表的星期表头行”', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Time'],
      ['只有等番', '2026/07']
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Remaining | 等番')

    const result = await importExcel(workbookToFile(wb))
    expect(result.imported).toBe(1)
    expect(result.errors).toEqual([])
  })

  it('[缺陷 P3] 未提供任何工作表的文件应返回失败而不是“成功导入 0 条”', async () => {
    const ws = XLSX.utils.aoa_to_sheet([])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')

    const result = await importExcel(workbookToFile(wb))
    expect(result.success).toBe(false)
  })

  it('[缺陷 P2] 第二次导入的 sort_order 应追加在已有记录之后', async () => {
    db.addWatching({ name: '已有番', sort_order: 100 })
    const ws = XLSX.utils.aoa_to_sheet([
      ['  星期 时间  ', 'Monday'],
      [0.5, '新导入番 e1']
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Watching | 追番')

    await importExcel(workbookToFile(wb))
    const imported = db.getAllWatching().find(r => r.name === '新导入番')
    expect(imported.sort_order).toBeGreaterThan(100)
  })

  it('template.xlsx 重复导入时追番/等番因 UNIQUE 报错、已看重复追加（记录当前语义）', async () => {
    const buffer = fs.readFileSync(path.resolve(process.cwd(), 'template.xlsx'))
    await importExcel(makeFile(buffer, 'template.xlsx'))
    const second = await importExcel(makeFile(buffer, 'template.xlsx'))

    expect(second.success).toBe(true)
    expect(second.errors).toHaveLength(5)
    expect(db.getAllWatching()).toHaveLength(3)
    expect(db.getAllRemaining()).toHaveLength(2)
    // 已看没有唯一约束，重复导入直接追加
    expect(db.getAllWatched()).toHaveLength(86)
  })
})
