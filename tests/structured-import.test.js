// @vitest-environment jsdom
/**
 * 结构化导入测试：JSON / CSV / Markdown
 *
 * 被测：src/db/structuredImporter.js（importJson / importCsv / importMd / importStructured）
 * 对照：src/db/excelExporter.js（导出格式，往返一致性的另一半）
 *
 * 说明：
 * - 用真实内存 SQLite：importer 内部调用 getDb()（没有可注入口），因此这里同样走单例，
 *   每个用例前 clearAll()，与 tests/db.test.js 的 Excel 导入用例保持一致。
 * - 三种格式的信息完整度不同（JSON > CSV > MD）：往返断言里，CSV/MD 只断言它们
 *   「本来就能承载」的字段；哪些字段属于结构性丢失，在用例里显式写明。
 * - 标题带 [缺陷] 的用例锁定的是导入器曾经的**真实缺陷**（已修复后转绿，用例继续留作回归护栏）：
 *   断言写的是「应有的行为」。修复前的失败表现记录在用例注释里，防止以后再退化。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { getDb } from '../src/db/index.js'
import {
  importJson,
  importCsv,
  importMd,
  importStructured,
} from '../src/db/structuredImporter.js'
import {
  buildExportJson,
  buildExportCsv,
  buildExportMarkdown,
} from '../src/db/excelExporter.js'

let db

beforeAll(async () => {
  db = await getDb()
})

beforeEach(async () => {
  await db.clearAll()
})

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/**
 * importer 只用到 file.text()。
 * jsdom 的 File 支持 text() 时用真 File（尽量贴真实浏览器路径），否则退化为假 File。
 */
function textFile(content, name = 'export.dat') {
  const text = String(content ?? '')
  if (typeof File === 'function') {
    try {
      const file = new File([text], name, { type: 'text/plain' })
      if (typeof file.text === 'function') return file
    } catch { /* 降级为假 File */ }
  }
  return { name, text: async () => text }
}

/** 从库里取出 exporter 需要的三张表（与 App.vue 导出时的数据源一致） */
function exportData() {
  return {
    watching: db.getAllWatching(),
    remaining: db.getAllRemaining(),
    watched: db.getAllWatched(),
  }
}

function pick(row, keys) {
  return Object.fromEntries(keys.map(k => [k, row[k]]))
}

const WATCHING_KEYS = [
  'name', 'day_of_week', 'time_slot', 'current_episode', 'total_episodes',
  'url', 'url_params', 'notes', 'tags', 'sort_order',
]
const REMAINING_KEYS = ['name', 'expected_date', 'url', 'url_params', 'notes', 'tags', 'sort_order']
const WATCHED_KEYS = ['name', 'watch_date', 'url', 'url_params', 'notes', 'tags', 'sort_order']

function readWatching() { return db.getAllWatching().map(r => pick(r, WATCHING_KEYS)) }
function readRemaining() { return db.getAllRemaining().map(r => pick(r, REMAINING_KEYS)) }
function readWatched() { return db.getAllWatched().map(r => pick(r, WATCHED_KEYS)) }

/** 一张覆盖全部字段的三表数据（JSON 往返用） */
function seedFull() {
  db.addWatching({
    name: '甲番剧', day_of_week: '周一', time_slot: '20:30',
    current_episode: '5', total_episodes: '12',
    url: 'https://example.com/a?p=1,2', url_params: 'p={集数}',
    notes: '备注，含逗号与"引号"', tags: '热血,悬疑', sort_order: 1,
  })
  db.addWatching({
    name: '乙番剧', day_of_week: '周六', time_slot: '23:30',
    current_episode: '3', total_episodes: '24',
    url: 'https://example.com/b', notes: '第二行\n换行备注', tags: '日常,音乐',
    sort_order: 2,
  })
  db.addWatching({
    name: '未排期番', day_of_week: '', time_slot: '',
    current_episode: '0', notes: '无排期', sort_order: 3,
  })
  db.addRemaining({
    name: '等番甲', expected_date: '2026/05',
    url: 'https://example.com/r', url_params: 'q={集数}',
    notes: '等番备注', tags: '搞笑,悬疑', sort_order: 4,
  })
  db.addRemaining({
    name: '等番乙', expected_date: '2026/07/15', notes: '带日', tags: '剧场版', sort_order: 5,
  })
  db.addWatched({
    name: '已看甲', watch_date: '2025/07/15',
    url: 'https://example.com/w', url_params: 'r={集数}',
    notes: '已看备注', tags: '治愈', sort_order: 6,
  })
  db.addWatched({ name: '已看乙', watch_date: '2025/06/01 21:00', tags: '剧场版', sort_order: 7 })
  db.addWatched({ name: '已看丙', watch_date: '2024', tags: '旧番', sort_order: 8 })
  db.addWatched({ name: '无日期作品', watch_date: '', sort_order: 9 })
}

/** CSV 往返用的数据（CSV 只承载结构化列） */
function seedForCsv() {
  db.addWatching({
    name: '追番A', day_of_week: '周一', time_slot: '01:30',
    current_episode: '3', url: 'https://example.com/a', tags: '热血', sort_order: 1,
  })
  db.addWatching({
    name: '追番B', day_of_week: '周二', time_slot: '20:30',
    current_episode: '12', sort_order: 2,
  })
  // 周历表无处安放：导出时直接不进 CSV（结构性丢失，不是 bug）
  db.addWatching({ name: '无排期番', day_of_week: '', time_slot: '', sort_order: 3 })

  db.addRemaining({
    name: '等番甲', expected_date: '2026/05',
    tags: '搞笑,悬疑', notes: '等番备注', url: 'https://example.com/r', sort_order: 4,
  })
  db.addRemaining({ name: '等番乙', expected_date: '2026/07/15', sort_order: 5 })

  db.addWatched({ name: '已看甲', watch_date: '2025/07/15', tags: '治愈', sort_order: 6 })
  db.addWatched({ name: '已看乙', watch_date: '2025', tags: '日常', sort_order: 7 })
  db.addWatched({ name: '已看丙', watch_date: '2025/06/01 21:00', sort_order: 8 })
  db.addWatched({ name: '已看丁', watch_date: '2024', sort_order: 9 })
  db.addWatched({ name: '无日期作品', watch_date: '', sort_order: 10 })
}

/** MD 往返用的数据（MD 只有名称 + 少量上下文） */
function seedForMd() {
  db.addWatching({
    name: '晨间番', day_of_week: '周一', time_slot: '07:30',
    current_episode: '5', tags: '日常,治愈', sort_order: 1,
  })
  db.addWatching({
    name: '深夜番', day_of_week: '周六', time_slot: '23:00',
    current_episode: '1.5', sort_order: 2,
  })
  db.addWatching({
    name: '未排期番', day_of_week: '', time_slot: '',
    current_episode: '0', tags: '特殊', sort_order: 3,
  })
  db.addRemaining({ name: '等番甲', expected_date: '2026/05', tags: '搞笑', sort_order: 4 })
  db.addRemaining({ name: '等番乙', expected_date: '2026/07/15', sort_order: 5 })
  db.addWatched({ name: '已看甲', watch_date: '2025/07/15', tags: '治愈', sort_order: 6 })
  db.addWatched({ name: '已看乙', watch_date: '2024', sort_order: 7 })
  db.addWatched({ name: '无日期作品', watch_date: '', sort_order: 8 })
}

// ===========================================================================
// JSON 回灌
// ===========================================================================

describe('JSON 回灌', () => {
  it('完整字段往返：exporter 产物经 File 回灌后三表关键字段一致', async () => {
    seedFull()
    const expected = {
      watching: readWatching(),
      remaining: readRemaining(),
      watched: readWatched(),
    }
    const jsonText = buildExportJson(exportData())
    await db.clearAll()

    const res = await importJson(textFile(jsonText, 'bangumi-export.json'))

    expect(res).toMatchObject({
      imported: expected.watching.length + expected.remaining.length + expected.watched.length,
      failed: 0,
      errors: [],
      byTable: {
        watching: expected.watching.length,
        remaining: expected.remaining.length,
        watched: expected.watched.length,
      },
    })
    // 名称/星期/时间/集数/总集数/日期/标签/链接/备注/排序全部逐项比对
    expect(readWatching()).toEqual(expected.watching)
    expect(readRemaining()).toEqual(expected.remaining)
    expect(readWatched()).toEqual(expected.watched)
  })

  it('裸数组输入：按字段特征自动分表（watch_date→已看、expected_date→等番、其余→追番）', async () => {
    const rows = [
      { name: '追番裸A', day_of_week: '周三', time_slot: '21:00', current_episode: '4', tags: '热血' },
      { name: '等番裸B', expected_date: '2026/08' },
      { name: '已看裸C', watch_date: '2025/07' },
      // watch_date 存在但为空串 → 仍按「已看」处理（字段存在即判表）
      { name: '已看裸D', watch_date: '' },
    ]
    const res = await importJson(textFile(JSON.stringify(rows), 'bare-array.json'))

    expect(res).toMatchObject({
      imported: 4,
      failed: 0,
      errors: [],
      byTable: { watching: 1, remaining: 1, watched: 2 },
    })
    expect(db.getAllWatching().find(r => r.name === '追番裸A')).toMatchObject({
      day_of_week: '周三', time_slot: '21:00', current_episode: '4', tags: '热血',
    })
    expect(db.getAllRemaining().find(r => r.name === '等番裸B')).toMatchObject({
      expected_date: '2026/08',
    })
    expect(db.getAllWatched().map(r => [r.name, r.watch_date])).toEqual([
      ['已看裸C', '2025/07'],
      ['已看裸D', ''],
    ])
  })

  it('缺少 name 的记录计入 failed 并给出说明，其余记录照常入库', async () => {
    const json = JSON.stringify({
      watching: [{ day_of_week: '周一' }, { name: '正常番' }],
      remaining: [{ expected_date: '2026/05' }],
      watched: [{ name: '正常已看', watch_date: '2025/07' }],
    })
    const res = await importJson(textFile(json))

    expect(res).toMatchObject({ imported: 2, failed: 2 })
    expect(res.errors).toHaveLength(2)
    expect(res.errors.every(e => e && e.code && /MISSING_NAME/.test(e.code))).toBe(true)
    expect(db.getAllWatching().map(r => r.name)).toEqual(['正常番'])
    expect(db.getAllRemaining()).toHaveLength(0)
    expect(db.getAllWatched().map(r => r.name)).toEqual(['正常已看'])
  })

  it('非法 JSON：返回 failed>0 且 errors 有说明，不抛异常', async () => {
    const res = await importJson(textFile('{ "watching": [ 坏掉的,,, ] }', 'broken.json'))

    expect(res.imported).toBe(0)
    expect(res.failed).toBeGreaterThan(0)
    expect(res.errors.length).toBeGreaterThan(0)
    // A-55：解析异常不再透出「JSON 解析失败：{V8英文message}」，改走 errorCode 体系，
    // UI 层按 impErr.jsonParseFailed 出本地化文案；这里断言 code（定位同步，用例不删）
    expect(String((res.errors[0] && res.errors[0].code) || res.errors[0])).toContain('JSON_PARSE_FAILED')
    expect(db.getAllWatching()).toHaveLength(0)
  })

  it('空文件 / 顶层不是数组或对象：返回 failed>0 且不抛异常', async () => {
    const empty = await importJson(textFile(''))
    expect(empty.failed).toBeGreaterThan(0)
    expect(String((empty.errors[0] && empty.errors[0].code) || empty.errors[0])).toContain('JSON_PARSE_FAILED')

    const scalar = await importJson(textFile('123'))
    expect(scalar.failed).toBeGreaterThan(0)
    expect(String((scalar.errors[0] && scalar.errors[0].code) || scalar.errors[0])).toContain('JSON_UNRECOGNIZED')
  })

  it('名称重复：追番/等番计入 failed（UNIQUE），已看允许重名追加', async () => {
    seedFull()
    const jsonText = buildExportJson(exportData())
    await db.clearAll()

    const first = await importJson(textFile(jsonText))
    const second = await importJson(textFile(jsonText))

    expect(first).toMatchObject({ failed: 0 })
    expect(second.imported).toBe(4)              // 只有已看的 4 条能重复追加
    expect(second.failed).toBe(5)                // 追番 3 + 等番 2 撞 UNIQUE
    expect(second.errors.filter(e => e.startsWith('追番'))).toHaveLength(3)
    expect(second.errors.filter(e => e.startsWith('等番'))).toHaveLength(2)
    expect(second.errors.every(e => e.includes('已存在'))).toBe(true)

    expect(db.getAllWatching()).toHaveLength(3)
    expect(db.getAllRemaining()).toHaveLength(2)
    expect(db.getAllWatched()).toHaveLength(8)
  })

  it('单文件内已看同名记录直接追加（watched 无 UNIQUE 约束）', async () => {
    const json = JSON.stringify({
      watched: [
        { name: '同名已看', watch_date: '2025/07/01' },
        { name: '同名已看', watch_date: '2025/07/02' },
      ],
    })
    const res = await importJson(textFile(json))

    expect(res).toMatchObject({ imported: 2, failed: 0, errors: [] })
    expect(db.getAllWatched().map(r => [r.name, r.watch_date])).toEqual([
      ['同名已看', '2025/07/01'],
      ['同名已看', '2025/07/02'],
    ])
  })
})

// ===========================================================================
// CSV 回灌
// ===========================================================================

describe('CSV 回灌', () => {
  it('三段（追番/等番/已看）解析：按段名识别表，byTable 计数正确', async () => {
    seedForCsv()
    const csvText = buildExportCsv(exportData())
    await db.clearAll()

    // 导出产物以 BOM 开头、三段以「# 表名」分隔
    expect(csvText.startsWith('\uFEFF# Watching | 追番')).toBe(true)

    const res = await importCsv(textFile(csvText, 'bangumi-export.csv'))

    expect(res).toMatchObject({
      imported: 9,                               // 追番 2 + 等番 2 + 已看 5
      failed: 0,
      errors: [],
      byTable: { watching: 2, remaining: 2, watched: 5 },
    })

    // 追番：周历的星期与时间槽可以回灌（名称里的集数见 [缺陷] 用例）
    const watching = db.getAllWatching()
    expect(watching).toHaveLength(2)
    expect(watching.find(r => r.day_of_week === '周一')).toMatchObject({ time_slot: '01:30' })
    expect(watching.find(r => r.day_of_week === '周二')).toMatchObject({ time_slot: '20:30' })
    // 没有时间槽/星期的追番根本不会被导出，因此不会反过来产生脏数据
    expect(watching.some(r => r.name === '无排期番')).toBe(false)

    // 等番：名称 / 日期 / 标签（标签里的逗号由 CSV 引号转义）
    const remaining = db.getAllRemaining()
    expect(remaining).toHaveLength(2)
    expect(remaining.find(r => r.name === '等番甲')).toMatchObject({
      expected_date: '2026/05', tags: '搞笑,悬疑',
    })
    expect(remaining.find(r => r.name === '等番乙')).toMatchObject({
      expected_date: '2026/07/15',
    })

    // 已看：年份列 + 「名称 (日期)」括号语法还原日期精度
    const watched = db.getAllWatched()
    expect(watched).toHaveLength(5)
    expect(watched.find(r => r.name === '已看甲')).toMatchObject({ watch_date: '2025/07/15' })
    expect(watched.find(r => r.name === '已看乙')).toMatchObject({ watch_date: '2025' })
    expect(watched.find(r => r.name === '已看丙')).toMatchObject({ watch_date: '2025/06/01 21:00' })
    expect(watched.find(r => r.name === '已看丁')).toMatchObject({ watch_date: '2024' })
  })

  it('Excel 小数时间转换为 HH:MM（0.0625→01:30、0.5→12:00、0.75→18:00）', async () => {
    const csv = [
      '# Watching | 追番',
      '      星期 时间      ,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
      '0.0625,零点半番,,,,,,',
      '0.5,,正午番,,,,,',
      '0.75,,,,,,晚间番,',
    ].join('\n')

    const res = await importCsv(textFile(csv, 'fraction.csv'))
    expect(res).toMatchObject({ imported: 3, failed: 0, errors: [] })

    expect(db.getAllWatching().find(r => r.name === '零点半番')).toMatchObject({
      day_of_week: '周一', time_slot: '01:30',
    })
    expect(db.getAllWatching().find(r => r.name === '正午番')).toMatchObject({
      day_of_week: '周二', time_slot: '12:00',
    })
    expect(db.getAllWatching().find(r => r.name === '晚间番')).toMatchObject({
      day_of_week: '周六', time_slot: '18:00',
    })
  })

  it('等番段：带逗号/引号的 Tags 走 CSV 引号转义后能原样解析', async () => {
    const csv = [
      '# Remaining | 等番',
      'Name,Time,Tags',
      '"等番甲",2026/05,"搞笑,悬疑"',
      '"等番乙",2026/07/15,"带""引号"""',
    ].join('\n')

    const res = await importCsv(textFile(csv, 'quoted.csv'))
    expect(res).toMatchObject({ imported: 2, failed: 0, errors: [] })
    expect(db.getAllRemaining().map(r => [r.name, r.expected_date, r.tags])).toEqual([
      ['等番甲', '2026/05', '搞笑,悬疑'],
      ['等番乙', '2026/07/15', '带"引号"'],
    ])
  })

  it('已看段：年份列头与「名称 (YYYY/MM/DD)」括号日期都还原', async () => {
    const csv = [
      '# Watched | 已看',
      '2024,2025,2026',
      '已看丁,已看甲 (2025/07/15),已看戊 (2026/03)',
      ',已看乙,',
      ',已看丙 (2025/06/01 21:00),',
    ].join('\n')

    const res = await importCsv(textFile(csv, 'watched.csv'))
    expect(res).toMatchObject({ imported: 5, failed: 0, errors: [] })
    expect(db.getAllWatched().map(r => [r.name, r.watch_date])).toEqual([
      ['已看丁', '2024'],
      ['已看甲', '2025/07/15'],
      ['已看戊', '2026/03'],
      ['已看乙', '2025'],
      ['已看丙', '2025/06/01 21:00'],
    ])
  })

  it('[缺陷] 追番单元格「番名 集数」应拆成名称 + 集数（曾经集数被拼进名称且归零）', async () => {
    // exporter 周历格写的是 `${name} ${current_episode}`（见 buildWatchingSheet），
    // 与 excelImporter.parseWatchingName 的约定一致；structuredImporter 却整格当名称。
    const csv = [
      '# Watching | 追番',
      '      星期 时间      ,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
      '20:30,某番剧 12,,,,,,',
    ].join('\n')

    await importCsv(textFile(csv, 'episode.csv'))

    expect(db.getAllWatching()).toHaveLength(1)
    expect(db.getAllWatching()[0]).toMatchObject({
      name: '某番剧',
      current_episode: '12',
      day_of_week: '周一',
      time_slot: '20:30',
    })
  })

  it('[缺陷] 已看「未归类」列应回灌为空日期，而不是字符串「未归类」', async () => {
    // exporter 给无日期记录的表头是「未归类」（见 buildWatchedSheet），
    // 导入时它被当成日期字面量，日期实际丢失且污染数据。
    const csv = [
      '# Watched | 已看',
      '2025,未归类',
      '已看X,无日期作品',
    ].join('\n')

    await importCsv(textFile(csv, 'unclassified.csv'))

    expect(db.getAllWatched().find(r => r.name === '无日期作品')).toMatchObject({
      watch_date: '',
    })
  })

  it('[缺陷] 已看作品名自带括号时不应把括号内容当成日期（仅年份列）', async () => {    // 年份精度时 exporter 直接写名称（不加日期括号）。名称本身含括号时，
    // importer 的 `名称 (备注)` 语法会把「剧场版」当成 watch_date。
    db.addWatched({ name: '剧场版作品 (剧场版)', watch_date: '2025' })
    const csvText = buildExportCsv(exportData())
    await db.clearAll()
    await importCsv(textFile(csvText))

    const row = db.getAllWatched().find(r => r.name.includes('剧场版作品'))
    expect(row).toMatchObject({
      name: '剧场版作品 (剧场版)',
      watch_date: '2025',
    })
  })

  it('没有分段的 CSV：返回 failed>0 且 errors 有说明，不抛异常', async () => {
    const res = await importCsv(textFile('Name,Time\n等番,2026/05', 'plain.csv'))

    expect(res.imported).toBe(0)
    expect(res.failed).toBeGreaterThan(0)
    expect(res.errors.map((e) => (e && e.code) || String(e)).join(' ')).toContain('CSV_NO_SECTION')
    expect(db.getAllRemaining()).toHaveLength(0)
  })

  it('空文件：返回 failed>0 且 errors 有说明，不抛异常', async () => {
    const res = await importCsv(textFile('', 'empty.csv'))

    expect(res.imported).toBe(0)
    expect(res.failed).toBeGreaterThan(0)
    expect(res.errors.map((e) => (e && e.code) || String(e)).join(' ')).toContain('CSV_NO_SECTION')
  })

  it('未知分段（# 其他表）被忽略：不报错、也不产生数据', async () => {
    const res = await importCsv(textFile('# 其他表\nfoo,bar\nbaz,qux', 'unknown-section.csv'))

    expect(res).toMatchObject({ imported: 0, failed: 0, errors: [] })
    expect(db.getAllWatching()).toHaveLength(0)
    expect(db.getAllRemaining()).toHaveLength(0)
    expect(db.getAllWatched()).toHaveLength(0)
  })

  it('重复导入同一份 CSV：追番/等番计入 failed，已看重复追加', async () => {
    seedForCsv()
    const csvText = buildExportCsv(exportData())
    await db.clearAll()

    await importCsv(textFile(csvText))
    const second = await importCsv(textFile(csvText))

    expect(second.imported).toBe(5)              // 已看 5 条可重复
    expect(second.failed).toBe(4)                // 追番 2 + 等番 2
    expect(second.errors.every(e => e.includes('已存在'))).toBe(true)
    expect(db.getAllWatching()).toHaveLength(2)
    expect(db.getAllRemaining()).toHaveLength(2)
    expect(db.getAllWatched()).toHaveLength(10)
  })
})

// ===========================================================================
// Markdown 回灌
// ===========================================================================

describe('Markdown 回灌', () => {
  it('按「## 章节 + ### 分组 + - 列表项」提取名称、星期、时间、集数与日期', async () => {
    seedForMd()
    const mdText = buildExportMarkdown(exportData())
    await db.clearAll()

    const res = await importMd(textFile(mdText, 'bangumi-export.md'))

    expect(res).toMatchObject({
      imported: 8,
      failed: 0,
      errors: [],
      byTable: { watching: 3, remaining: 2, watched: 3 },
    })

    // 追番：### 星期 → day_of_week；行首 "HH:MM " → time_slot；"· 第 N 集" → 集数
    const watching = db.getAllWatching()
    expect(watching).toHaveLength(3)
    expect(watching.find(r => r.name === '晨间番')).toMatchObject({
      day_of_week: '周一', time_slot: '07:30', current_episode: '5',
    })
    expect(watching.find(r => r.name === '深夜番')).toMatchObject({
      day_of_week: '周六', time_slot: '23:00', current_episode: '1.5',
    })
    // 未排期分组不是星期 → day_of_week 为空
    expect(watching.find(r => r.name === '未排期番')).toMatchObject({
      day_of_week: '', time_slot: '',
    })

    // 等番："YYYY/MM · 名称" → expected_date
    const remaining = db.getAllRemaining()
    expect(remaining.map(r => [r.name, r.expected_date])).toEqual([
      ['等番甲', '2026/05'],
      ['等番乙', '2026/07/15'],
    ])

    // 已看：分组年份 + 行尾「· 完整日期」都能还原；未归类分组保持空日期
    const watched = db.getAllWatched()
    expect(watched).toHaveLength(3)
    expect(watched.find(r => r.name === '已看甲')).toMatchObject({ watch_date: '2025/07/15' })
    expect(watched.find(r => r.name === '已看乙')).toMatchObject({ watch_date: '2024' })
    expect(watched.find(r => r.name === '无日期作品')).toMatchObject({ watch_date: '' })
  })

  it('[缺陷] 等番只有年份的日期（2026）应保留在 expected_date，当前会被拼进名称', async () => {
    db.addRemaining({ name: '年度等番', expected_date: '2026' })
    const mdText = buildExportMarkdown(exportData())
    await db.clearAll()
    await importMd(textFile(mdText))

    expect(db.getAllRemaining()).toHaveLength(1)
    expect(db.getAllRemaining()[0]).toMatchObject({
      name: '年度等番',
      expected_date: '2026',
    })
  })

  it('[缺陷] 已看非「YYYY/MM」形态的日期（时间精度、年份范围）应完整保留', async () => {
    // exporter 会把 watch_date 原样写进行尾（见 buildExportMarkdown 已看分支），
    // importer 的正则只认 `YYYY[/-][...]`：带时间的日期被截断成「名称 · 日期」，
    // 年份范围（2014~2017）整段被丢掉。
    db.addWatched({ name: '精确时间作品', watch_date: '2025/06/01 21:00' })
    db.addWatched({ name: '范围作品', watch_date: '2014~2017' })
    const mdText = buildExportMarkdown(exportData())
    await db.clearAll()
    await importMd(textFile(mdText))

    const rows = db.getAllWatched()
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.name === '精确时间作品')).toMatchObject({
      watch_date: '2025/06/01 21:00',
    })
    expect(rows.find(r => r.name === '范围作品')).toMatchObject({
      watch_date: '2014~2017',
    })
  })

  it('[缺陷] 第一段缺失（无 ## 正在追番）时不应把后面的列表项当成追番', async () => {
    // importer 的 section 初值是空串，但「## 等待更新 / ## 已看历史」之前的
    // `- xxx` 行在 section==='' 时被跳过；这里锁定的是相反情形：
    // 文件被截断、只剩「### 周一」+ 列表项（section 仍为空）时应直接忽略，
    // 而不是把它们记成 failed 之外的脏数据。
    const md = [
      '### 周一',
      '- 20:30 孤立番 · 第 2 集',
      '',
      '## 已看历史（1）',
      '',
      '### 2025',
      '- 正常已看 · 2025/07',
    ].join('\n')

    const res = await importMd(textFile(md, 'orphan-group.md'))

    expect(res.byTable.watching).toBe(0)
    expect(res.byTable.watched).toBe(1)
    expect(db.getAllWatching()).toHaveLength(0)
    expect(db.getAllWatched().map(r => [r.name, r.watch_date])).toEqual([
      ['正常已看', '2025/07'],
    ])
  })

  it('[缺陷] 空 MD / 无章节标记的内容应返回 failed>0，而不是静默成功导入 0 条', async () => {
    const empty = await importMd(textFile('', 'empty.md'))
    const plain = await importMd(textFile('随手记：今天看了两集\n', 'plain.md'))

    expect(empty.imported).toBe(0)
    expect(empty.failed).toBeGreaterThan(0)
    expect(empty.errors.length).toBeGreaterThan(0)
    expect(plain.failed).toBeGreaterThan(0)
  })

  it('重复导入同一份 MD：追番/等番计入 failed，已看重复追加', async () => {
    seedForMd()
    const mdText = buildExportMarkdown(exportData())
    await db.clearAll()

    const first = await importMd(textFile(mdText))
    const second = await importMd(textFile(mdText))

    expect(first).toMatchObject({ imported: 8, failed: 0 })
    expect(second.imported).toBe(3)              // 已看 3 条可重复
    expect(second.failed).toBe(5)                // 追番 3 + 等番 2
    expect(second.errors.every(e => e.includes('已存在'))).toBe(true)
    expect(db.getAllWatching()).toHaveLength(3)
    expect(db.getAllRemaining()).toHaveLength(2)
    expect(db.getAllWatched()).toHaveLength(6)
  })
})

/**
 * 三种格式的「结构性无损」往返：只有名称 + 格式能承载的字段。
 * CSV 周历/年份横向布局、MD 列表都无法承载 URL / 备注 / 排序 ——
 * 那属于格式本身的容量限制（exporter 的设计取舍），不算 importer 的缺陷；
 * 但名称、星期、时间、集数、日期、标签这些**格式声称能带**的字段必须一致。
 */
describe('往返一致性（逐格式）', () => {
  it('CSV：名称 / 星期 / 时间 / 集数 / 等番日期 / 标签 / 已看日期 全部一致', async () => {
    db.addWatching({
      name: '带逗号, 与"引号"的番', day_of_week: '周三', time_slot: '22:30',
      current_episode: '7', total_episodes: '24', tags: '日常', sort_order: 1,
    })
    db.addWatching({
      name: '零集番', day_of_week: '周日', time_slot: '00:30',
      current_episode: '0', sort_order: 2,
    })
    db.addWatching({
      name: '小数集番', day_of_week: '周五', time_slot: '20:00',
      current_episode: '1.5', sort_order: 3,
    })
    db.addRemaining({
      name: '等番带标签', expected_date: '2026/07/15',
      tags: '搞笑,悬疑', sort_order: 4,
    })
    db.addWatched({ name: '已看年月日', watch_date: '2025/07/15', tags: '治愈', sort_order: 5 })
    db.addWatched({ name: '已看仅年', watch_date: '2024', sort_order: 6 })
    db.addWatched({ name: '已看年月', watch_date: '2026/03', sort_order: 7 })

    const before = {
      watching: db.getAllWatching().map(r => ({
        name: r.name, day_of_week: r.day_of_week, time_slot: r.time_slot,
        current_episode: r.current_episode,
      })),
      remaining: db.getAllRemaining().map(r => ({
        name: r.name, expected_date: r.expected_date, tags: r.tags,
      })),
      watched: db.getAllWatched().map(r => ({ name: r.name, watch_date: r.watch_date })),
    }
    const csvText = buildExportCsv(exportData())
    await db.clearAll()

    const res = await importCsv(textFile(csvText, 'roundtrip.csv'))
    expect(res).toMatchObject({ failed: 0, errors: [] })

    const after = {
      watching: db.getAllWatching().map(r => ({
        name: r.name, day_of_week: r.day_of_week, time_slot: r.time_slot,
        current_episode: r.current_episode,
      })),
      remaining: db.getAllRemaining().map(r => ({
        name: r.name, expected_date: r.expected_date, tags: r.tags,
      })),
      watched: db.getAllWatched().map(r => ({ name: r.name, watch_date: r.watch_date })),
    }
    // 排序不同（导出按时间槽、年份升序），按名称排序后逐字段比对
    const sortByName = rows => rows.slice().sort((a, b) => a.name.localeCompare(b.name))
    expect(sortByName(after.watching)).toEqual(sortByName(before.watching))
    expect(sortByName(after.remaining)).toEqual(sortByName(before.remaining))
    expect(sortByName(after.watched)).toEqual(sortByName(before.watched))
  })

  it('MD：名称 / 星期 / 时间 / 集数 / 等番日期 / 已看日期 全部一致', async () => {
    db.addWatching({
      name: '晨间番', day_of_week: '周一', time_slot: '07:30',
      current_episode: '5', tags: '日常,治愈', sort_order: 1,
    })
    db.addWatching({
      name: '深夜番', day_of_week: '周六', time_slot: '23:00',
      current_episode: '1.5', tags: '原创', sort_order: 2,
    })
    db.addWatching({
      name: '无集数番', day_of_week: '周四', time_slot: '01:00',
      current_episode: '0', sort_order: 3,
    })
    db.addRemaining({ name: '等番带标签', expected_date: '2026/07/15', tags: '剧场版', sort_order: 4 })
    db.addRemaining({ name: '等番无日期', expected_date: '', sort_order: 5 })
    db.addWatched({ name: '已看年月日', watch_date: '2025/07/15', tags: '治愈', sort_order: 6 })
    db.addWatched({ name: '已看仅年', watch_date: '2024', sort_order: 7 })

    const before = {
      watching: db.getAllWatching().map(r => ({
        name: r.name, day_of_week: r.day_of_week, time_slot: r.time_slot,
        current_episode: r.current_episode,
      })),
      remaining: db.getAllRemaining().map(r => ({ name: r.name, expected_date: r.expected_date })),
      watched: db.getAllWatched().map(r => ({ name: r.name, watch_date: r.watch_date })),
    }
    const mdText = buildExportMarkdown(exportData())
    await db.clearAll()

    const res = await importMd(textFile(mdText, 'roundtrip.md'))
    expect(res).toMatchObject({ failed: 0, errors: [] })

    const after = {
      watching: db.getAllWatching().map(r => ({
        name: r.name, day_of_week: r.day_of_week, time_slot: r.time_slot,
        current_episode: r.current_episode,
      })),
      remaining: db.getAllRemaining().map(r => ({ name: r.name, expected_date: r.expected_date })),
      watched: db.getAllWatched().map(r => ({ name: r.name, watch_date: r.watch_date })),
    }
    const sortByName = rows => rows.slice().sort((a, b) => a.name.localeCompare(b.name))
    expect(sortByName(after.watching)).toEqual(sortByName(before.watching))
    expect(sortByName(after.remaining)).toEqual(sortByName(before.remaining))
    expect(sortByName(after.watched)).toEqual(sortByName(before.watched))
  })

  it('[缺陷] CSV：番名以数字结尾时集数与名称错位（「作品A e」+集数 4 → 名称被吃掉）', async () => {
    // exporter 周历格是 `${name} ${current_episode}`，导入侧 splitNameAndEpisode
    // 把末尾数字当集数。名称本身以「e」+数字或纯数字结尾时无法区分，
    // 这里锁定最典型的一种：「作品A e 4」（名称「作品A e」、集数 4）。
    db.addWatching({ name: '作品A e', day_of_week: '周一', time_slot: '20:30', current_episode: '4' })
    const before = db.getAllWatching().map(r => [r.name, r.current_episode])
    const csvText = buildExportCsv(exportData())
    await db.clearAll()
    await importCsv(textFile(csvText, 'name-ending-with-e.csv'))

    expect(db.getAllWatching().map(r => [r.name, r.current_episode])).toEqual(before)
  })

  it('[缺陷] CSV：作品名自带「(YYYY)」括号时不应被当成日期覆盖年份列', async () => {
    // exporter 只在日期**比年份更精确**时才把完整日期写进括号：
    //   watch_date '2025/07' → 「名称 (2025/07)」；watch_date '2024' → 只写名称。
    // 因此「作品X (2025)」在年份列 2024 下只可能是**名称本身**含括号，
    // 而 importer 按「括号内容以四位年份开头即日期」判别，把名称截成「作品X」、
    // watch_date 改成 2025，年份列 2024 丢失 —— 名称与日期两处都错。
    db.addWatched({ name: '作品X (2025)', watch_date: '2024' })
    const csvText = buildExportCsv(exportData())
    await db.clearAll()
    await importCsv(textFile(csvText, 'name-with-year-paren.csv'))

    expect(db.getAllWatched()).toHaveLength(1)
    expect(db.getAllWatched()[0]).toMatchObject({
      name: '作品X (2025)',
      watch_date: '2024',
    })
  })

  it('[缺陷] MD：番名里含反引号时会被当成行内标签整段删除', async () => {
    // exporter 用反引号写标签（`标签`），importer 用 /\s*`[^`]*`/g 无条件剔除；
    // 名称内的反引号会被吃掉，名称退化成「名称带的作品」。
    db.addWatching({ name: '名称带`反引号`的作品', day_of_week: '周一', time_slot: '20:30', current_episode: '2' })
    const mdText = buildExportMarkdown(exportData())
    await db.clearAll()
    await importMd(textFile(mdText, 'name-with-backtick.md'))

    expect(db.getAllWatching().map(r => r.name)).toEqual(['名称带`反引号`的作品'])
  })
})

// ===========================================================================
// importStructured 统一入口
// ===========================================================================

describe('importStructured 统一入口', () => {
  it('kind=json 走 JSON 解析器', async () => {
    db.addWatching({ name: '分发JSON番', day_of_week: '周一', time_slot: '20:00', current_episode: '2' })
    const jsonText = buildExportJson(exportData())
    await db.clearAll()

    const res = await importStructured(textFile(jsonText, 'a.json'), 'json')
    expect(res).toMatchObject({ imported: 1, failed: 0, byTable: { watching: 1, remaining: 0, watched: 0 } })
    expect(db.getAllWatching()[0]).toMatchObject({
      name: '分发JSON番', day_of_week: '周一', time_slot: '20:00', current_episode: '2',
    })
  })

  it('kind=csv 走 CSV 解析器', async () => {
    seedForCsv()
    const csvText = buildExportCsv(exportData())
    await db.clearAll()

    const res = await importStructured(textFile(csvText, 'a.csv'), 'csv')
    expect(res).toMatchObject({ imported: 9, failed: 0 })
    expect(db.getAllWatching()).toHaveLength(2)
    expect(db.getAllRemaining()).toHaveLength(2)
    expect(db.getAllWatched()).toHaveLength(5)
  })

  it('kind=md 走 Markdown 解析器', async () => {
    seedForMd()
    const mdText = buildExportMarkdown(exportData())
    await db.clearAll()

    const res = await importStructured(textFile(mdText, 'a.md'), 'md')
    expect(res).toMatchObject({ imported: 8, failed: 0 })
    expect(db.getAllWatching()).toHaveLength(3)
    expect(db.getAllRemaining()).toHaveLength(2)
    expect(db.getAllWatched()).toHaveLength(3)
  })

  it('不支持的格式：返回 failed>0 与说明，不抛异常', async () => {
    const res = await importStructured(textFile('随便什么', 'a.xlsx'), 'xlsx')

    expect(res).toMatchObject({
      imported: 0,
      failed: 1,
      byTable: { watching: 0, remaining: 0, watched: 0 },
    })
    expect(res.errors[0]).toContain('不支持的格式')
    expect(res.errors[0]).toContain('xlsx')
    expect(db.getAllWatching()).toHaveLength(0)
  })
})
