// @vitest-environment jsdom
/**
 * 边界情况回归测试（新建文件，按任务要求不修改任何既有测试文件）
 *
 * 覆盖两层的边界：
 *   1. db 层（src/db/index.js）—— 空名 / 非法参数 / 裸字符串错误 / NaN 排序 / 无 id
 *   2. 导入器（excelImporter / structuredImporter）—— 损坏、空、格式不匹配、超大、
 *      以及「导入失败后原数据必须完好」
 *
 * 约定：
 *   · 与 tests/db.test.js 一致，使用真实内存 SQLite（importer 内部走 getDb 单例），
 *     每个用例前 clearAll()。
 *   · 标题里的 [边界] 是本轮新增的防线；不带标签的是既有行为的回归锁定。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { getDb, __resetIdbConnection } from '../src/db/index.js'
import { importExcel } from '../src/db/excelImporter.js'
import {
  importJson,
  importCsv,
  importMd,
  importStructured,
} from '../src/db/structuredImporter.js'
import {
  buildExportCsv,
  buildExportJson,
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

/** importExcel / 结构化导入器只用到 File 的 arrayBuffer() / text() */
function binaryFile(bytes, name = 'x.xlsx') {
  return new File([bytes], name, { type: 'application/octet-stream' })
}

function textFile(content, name = 'x.dat') {
  const text = String(content ?? '')
  if (typeof File === 'function') {
    try {
      const f = new File([text], name, { type: 'text/plain' })
      if (typeof f.text === 'function' && typeof f.arrayBuffer === 'function') return f
    } catch { /* 降级 */ }
  }
  return { name, size: text.length, text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text) }
}

function exportData() {
  return {
    watching: db.getAllWatching(),
    remaining: db.getAllRemaining(),
    watched: db.getAllWatched(),
  }
}

/** 造一份「原有数据」，用来验证导入失败后没被破坏 */
async function seedBaseline() {
  db.addWatching({ name: '原有追番', day_of_week: '周一', time_slot: '20:00', current_episode: '3' })
  db.addRemaining({ name: '原有等番', expected_date: '2026/05' })
  db.addWatched({ name: '原有已看', watch_date: '2025/07' })
  await db.flush?.()
}

function baselineIntact() {
  return (
    db.getAllWatching().some((r) => r.name === '原有追番' && r.current_episode === '3') &&
    db.getAllRemaining().some((r) => r.name === '原有等番') &&
    db.getAllWatched().some((r) => r.name === '原有已看')
  )
}

// ===========================================================================
// db 层：名称与参数边界
// ===========================================================================

describe('db 边界：名称与参数', () => {
  it('[边界] 缺少 name / 空对象不应抛异常，而是返回可读错误', () => {
    // 原实现把 undefined 传给 sql.js，抛的是**裸字符串**，随后
    // err.message.includes(...) 再抛 TypeError —— 一次参数错误升级成未捕获异常。
    for (const call of [
      () => db.addWatching({}),
      () => db.addWatching(),
      () => db.addRemaining({}),
      () => db.addWatched({}),
      () => db.addWatchedYear({}),
    ]) {
      const res = call()
      expect(res.success).toBe(false)
      expect(typeof res.error).toBe('string')
      expect(res.error.length).toBeGreaterThan(0)
    }
    expect(db.getAllWatching()).toHaveLength(0)
    expect(db.getAllRemaining()).toHaveLength(0)
    expect(db.getAllWatched()).toHaveLength(0)
  })

  it('[边界] 纯空白名称不落库（避免列表出现无法辨认的空标题卡片）', () => {
    expect(db.addWatching({ name: '   ' }).success).toBe(false)
    expect(db.addWatching({ name: '\n\t ' }).success).toBe(false)
    expect(db.addWatching({ name: '' }).success).toBe(false)
    expect(db.getAllWatching()).toHaveLength(0)
  })

  it('[边界] 名称两端空白会被 trim，中间空白与内部换行保留', () => {
    const res = db.addWatching({ name: '  番名 A  ' })
    expect(res.success).toBe(true)
    expect(db.getAllWatching()[0].name).toBe('番名 A')

    db.addWatched({ name: '多行\n名称' })
    expect(db.getAllWatched()[0].name).toBe('多行\n名称')
  })

  it('[边界] 名称中的 HTML / emoji 不被转义也不被截断（只做存储，不解释）', () => {
    db.addWatching({ name: '<img src=x onerror=alert(1)>' })
    db.addWatching({ name: '🎌🔥👨‍👩‍👧‍👦' })
    expect(db.getAllWatching().map((r) => r.name)).toEqual([
      '<img src=x onerror=alert(1)>',
      '🎌🔥👨‍👩‍👧‍👦',
    ])
  })

  it('[边界] 超长名称（500 字 / 5000 字）可写入并原样读回', () => {
    const name500 = '长'.repeat(500)
    const name5000 = 'L'.repeat(5000)
    expect(db.addWatching({ name: name500 }).success).toBe(true)
    expect(db.addWatching({ name: name5000 }).success).toBe(true)
    // 不依赖自增 id：AUTOINCREMENT 计数器会跨用例前进
    const rows = db.getAllWatching()
    expect(rows.some((r) => r.name === name500)).toBe(true)
    expect(rows.some((r) => r.name === name5000)).toBe(true)
  })

  it('[边界] sort_order 为 NaN / Infinity / 非数字时归 0，不写成 NULL', () => {
    db.addWatching({ name: '排序脏值A', sort_order: NaN })
    db.addWatching({ name: '排序脏值B', sort_order: Infinity })
    db.addWatching({ name: '排序脏值C', sort_order: 'abc' })
    db.addWatching({ name: '排序正常', sort_order: 5 })
    const rows = db.getAllWatching()
    const dirty = rows.filter((r) => r.name.startsWith('排序脏值'))
    // NaN 在 sql.js 里会变成 NULL；NULL 与数字混排会让列表顺序莫名跳动
    expect(dirty.every((r) => r.sort_order === 0)).toBe(true)
    expect(rows.find((r) => r.name === '排序正常').sort_order).toBe(5)
  })
})

describe('db 边界：集数与操作不存在目标', () => {
  it('[边界] 不存在的 id：增减/删除返回可读错误，不抛异常', () => {
    for (const res of [
      db.incrementEpisode(99999),
      db.decrementEpisode(99999),
      db.deleteWatching(99999),
      db.deleteRemaining(99999),
      db.deleteWatched(99999),
    ]) {
      // 删除幂等（0 行受影响）可以返回 success，但绝不能抛异常
      expect(res.success === false ? typeof res.error === 'string' : true).toBe(true)
    }
    expect(db.incrementEpisode(99999).success).toBe(false)
    expect(db.incrementEpisode(99999).error).toBe('未找到记录')
  })

  it('[边界] 超大集数 9999 / 999999 与小数、负数都能存取（由 UI 层负责校验）', () => {
    db.addWatching({ name: '大集数', current_episode: '9999', total_episodes: '9999' })
    db.addWatching({ name: '巨集数', current_episode: '999999', total_episodes: '999999' })
    db.addWatching({ name: '小数集数', current_episode: '3.5', total_episodes: '12.5' })
    const rows = db.getAllWatching()
    expect(rows.find((r) => r.name === '大集数')).toMatchObject({
      current_episode: '9999', total_episodes: '9999',
    })
    expect(rows.find((r) => r.name === '小数集数')).toMatchObject({
      current_episode: '3.5', total_episodes: '12.5',
    })
  })

  it('[边界] 总集数小于当前集数不产生崩溃（进度需要 UI clamp）', () => {
    const res = db.addWatching({ name: '倒挂', current_episode: '20', total_episodes: '12' })
    expect(res.success).toBe(true)
    const row = db.getAllWatching()[0]
    // 库层只存原值，不做业务校验：这是刻意的（允许「12+」「?」这类不确定值）
    expect(row.current_episode).toBe('20')
    expect(row.total_episodes).toBe('12')
  })

  it('[边界] 集数增减对非法存量值不抛异常', () => {
    db.addWatching({ name: '脏集数', current_episode: 'abc' })
    const id = db.getAllWatching()[0].id
    expect(() => db.incrementEpisode(id)).not.toThrow()
    expect(db.incrementEpisode(id).success).toBe(true)
  })
})

describe('db 边界：日期与超长文本', () => {
  it('[边界] 非法日期 2026/13/45 原样存取，不抛异常', () => {
    expect(db.addRemaining({ name: '非法日期等番', expected_date: '2026/13/45' }).success).toBe(true)
    expect(db.getAllRemaining()[0].expected_date).toBe('2026/13/45')
  })

  it('日期分隔符 - 归一化为 /', () => {
    db.addRemaining({ name: '短横线', expected_date: '2026-05-01' })
    expect(db.getAllRemaining()[0].expected_date).toBe('2026/05/01')
  })

  it('[边界] 100KB 超长备注可存取', () => {
    const notes = 'x'.repeat(100000)
    expect(db.addWatching({ name: '长备注', notes }).success).toBe(true)
    expect(db.getAllWatching()[0].notes).toHaveLength(100000)
  })
})

// ===========================================================================
// 导入器边界：XLSX
// ===========================================================================

describe('导入边界：XLSX 损坏与格式不匹配', () => {
  it('[边界] 空文件（0 字节）返回失败并说明原因，不抛异常', async () => {
    await seedBaseline()
    const res = await importExcel(binaryFile(new Uint8Array(0), 'empty.xlsx'))
    expect(res.success).toBe(false)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(res.errors.join(' ')).toContain('空')
    expect(baselineIntact()).toBe(true)
  })

  it('[边界] 损坏的随机字节 / 截断的 zip 返回失败并说明原因', async () => {
    await seedBaseline()
    for (const bytes of [
      new Uint8Array(2048).fill(137),
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]),
    ]) {
      const res = await importExcel(binaryFile(bytes, 'broken.xlsx'))
      expect(res.success).toBe(false)
      expect(res.imported).toBe(0)
      // 必须能说出失败原因（要么是「打不开」，要么是「没有可识别的工作表」）
      expect(res.errors.length).toBeGreaterThan(0)
    expect(res.errors.map((e) => (e && e.code) || String(e)).join(' ')).toMatch(/XLSX_|打不开|打开文件失败|没有找到可识别/)
    }
    expect(baselineIntact()).toBe(true)
  })

  it('[边界] 传入的不是 File（缺 arrayBuffer）时不抛 TypeError', async () => {
    await seedBaseline()
    const res = await importExcel({ name: 'nope.xlsx', size: 10 })
    expect(res.success).toBe(false)
    expect(res.errors.join(' ')).toContain('没有拿到文件内容')
    expect(baselineIntact()).toBe(true)
  })

  it('[边界] 超过 20MB 在读取内容前就被拒绝（避免 OOM 白屏）', async () => {
    await seedBaseline()
    // 只声明 size，不真的生成 21MB 内容：实现应当在 arrayBuffer() 之前用 size 拦截
    let readCalled = false
    const fake = {
      name: 'big.xlsx',
      size: 21 * 1024 * 1024,
      arrayBuffer: async () => { readCalled = true; return new Uint8Array(0) },
    }
    const res = await importExcel(fake)
    expect(res.success).toBe(false)
    expect(res.errors.join(' ')).toContain('20MB')
    expect(readCalled).toBe(false)
    expect(baselineIntact()).toBe(true)
  })

  it('[边界] 格式不匹配（把 JSON 文本当 xlsx）：失败且原数据完好', async () => {
    await seedBaseline()
    const res = await importExcel(textFile('{"watching":[{"name":"x"}]}', 'mismatch.xlsx'))
    expect(res.success).toBe(false)
    expect(baselineIntact()).toBe(true)
  })

  it('[边界] 没有可识别工作表时失败原因可读（不再只显示「失败 0 条」）', async () => {
    await seedBaseline()
    const res = await importExcel(textFile('not a workbook', 'plain.xlsx'))
    expect(res.success).toBe(false)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(baselineIntact()).toBe(true)
  })
})

// ===========================================================================
// 导入器边界：JSON / CSV / MD
// ===========================================================================

describe('导入边界：结构化格式的损坏输入', () => {
  it('[边界] JSON 空文件 / 损坏语法 / 二进制：失败 + 有说明，不抛异常', async () => {
    await seedBaseline()
    for (const [content, name] of [
      ['', 'empty.json'],
      ['{"watching":[{"name":', 'broken.json'],
      ['{"a":\u0000\u0001}', 'bin.json'],
      ['123', 'scalar.json'],
    ]) {
      const res = await importJson(textFile(content, name))
      expect(res.imported).toBe(0)
      expect(res.failed).toBeGreaterThan(0)
      expect(res.errors.length).toBeGreaterThan(0)
    }
    expect(baselineIntact()).toBe(true)
  })

  it('[边界] CSV 空文件 / 无分段 / 未闭合引号：失败 + 有说明', async () => {
    await seedBaseline()
    for (const [content, name] of [
      ['', 'empty.csv'],
      ['Name,Time\n等番,2026/05', 'plain.csv'],
      ['# Watching | 追番\n"未闭合,周一\n\x00\x01', 'broken.csv'],
    ]) {
      const res = await importCsv(textFile(content, name))
      // 关键：不能出现「成功导入 0 条」的静默成功
      expect(res.imported).toBe(0)
      expect(res.failed).toBeGreaterThan(0)
      expect(res.errors.length).toBeGreaterThan(0)
    }
    expect(baselineIntact()).toBe(true)
  })

  it('[边界] MD 空文件与无章节内容：失败 + 有说明（不再静默成功导入 0 条）', async () => {
    await seedBaseline()
    const empty = await importMd(textFile('', 'empty.md'))
    const plain = await importMd(textFile('随手记：今天看了两集\n', 'plain.md'))
    const bin = await importMd(textFile(new Uint8Array([0, 1, 2, 255]), 'bin.md'))
    for (const res of [empty, plain, bin]) {
      expect(res.imported).toBe(0)
      expect(res.failed).toBeGreaterThan(0)
      expect(res.errors.length).toBeGreaterThan(0)
    }
    expect(baselineIntact()).toBe(true)
  })

  it('[边界] 超过 20MB 的结构化文件在解析前被拒绝', async () => {
    await seedBaseline()
    const big = { name: 'big.json', size: 21 * 1024 * 1024, text: async () => '{}' }
    const res = await importJson(big)
    expect(res.failed).toBeGreaterThan(0)
    expect(res.errors.join(' ')).toContain('20MB')
    expect(baselineIntact()).toBe(true)
  })

  it('[边界] JSON 的 name 不是字符串：对象/数组/纯空白计入失败，不写入脏名称', async () => {
    await seedBaseline()
    const res = await importJson(textFile(JSON.stringify({
      watching: [{ name: { a: 1 } }, { name: ['x'] }, { name: '   ' }, { name: 123 }, { name: '正常番' }],
      watched: [{ name: { a: 1 }, watch_date: '2025/07' }],
    }), 'badname.json'))

    // 只有 123（数字，可转成名称）与「正常番」是有效的
    expect(res.imported).toBe(2)
    expect(res.failed).toBeGreaterThan(0)
    const names = db.getAllWatching().map((r) => r.name)
    expect(names).toContain('正常番')
    expect(names).not.toContain('[object Object]')
    expect(names.some((n) => /^\s+$/.test(n))).toBe(false)
    expect(db.getAllWatched().map((r) => r.name)).not.toContain('[object Object]')
  })

  it('[边界] 不支持的格式返回 failed>0 与说明，不抛异常', async () => {
    const res = await importStructured(textFile('随便什么', 'a.xlsx'), 'xlsx')
    expect(res.failed).toBeGreaterThan(0)
    expect(res.errors[0]).toContain('不支持的格式')
  })
})

// ===========================================================================
// 导入器边界：失败后原数据完好 + 半完成状态
// ===========================================================================

describe('导入边界：失败不破坏原数据', () => {
  it('[边界] 部分失败：成功条目入库、失败条目计入 failed，原有数据一条不少', async () => {
    await seedBaseline()
    const res = await importJson(textFile(JSON.stringify({
      watching: [{ name: '新番' }, { name: '' }, { name: '原有追番' }],
    }), 'partial.json'))

    // 新番成功；空名失败；原有追番撞 UNIQUE 失败
    expect(res.imported).toBe(1)
    expect(res.failed).toBe(2)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(baselineIntact()).toBe(true)
    expect(db.getAllWatching().map((r) => r.name).sort()).toEqual(['原有追番', '新番'])
  })

  it('[边界] 全量失败：原有数据完全不变（回到导入前的快照）', async () => {
    await seedBaseline()
    const before = {
      watching: db.getAllWatching(),
      remaining: db.getAllRemaining(),
      watched: db.getAllWatched(),
    }
    // 每条都与已有记录同名 → 全部撞 UNIQUE
    const res = await importJson(textFile(JSON.stringify({
      watching: [{ name: '原有追番' }],
      remaining: [{ name: '原有等番', expected_date: '2026/05' }],
    }), 'allfail.json'))

    expect(res.imported).toBe(0)
    expect(res.failed).toBe(2)
    expect(db.getAllWatching()).toEqual(before.watching)
    expect(db.getAllRemaining()).toEqual(before.remaining)
    expect(db.getAllWatched()).toEqual(before.watched)
  })

  it('[边界] 损坏文件连续导入 3 次不累积脏数据', async () => {
    await seedBaseline()
    for (let i = 0; i < 3; i++) {
      await importExcel(binaryFile(new Uint8Array(512).fill(0), `bad${i}.xlsx`))
      await importJson(textFile('{oops', `bad${i}.json`))
    }
    expect(db.getAllWatching()).toHaveLength(1)
    expect(db.getAllRemaining()).toHaveLength(1)
    expect(db.getAllWatched()).toHaveLength(1)
    expect(baselineIntact()).toBe(true)
  })
})

// ===========================================================================
// 往返：边界数据经导出再导入后仍可用
// ===========================================================================

describe('边界数据的导出→导入往返', () => {
  it('[边界] 含换行的名称经 CSV 往返后不被拆散（RFC4180 引号字段）', async () => {
    db.addWatching({ name: 'A\nB 番', day_of_week: '周一', time_slot: '20:30', current_episode: '5' })
    db.addRemaining({ name: 'C\nD 等', expected_date: '2026/05' })
    db.addWatched({ name: 'E\nF 已看', watch_date: '2025/07' })
    const csv = buildExportCsv(exportData())
    await db.clearAll()
    await importCsv(textFile(csv, 'nl.csv'))

    // 若先按 \n 切行，换行会把后续记录整体错位（连锁损坏）：
    // 「A」进库、「B 番 5」变成另一条，剩余两段也跟着错位。
    const w = db.getAllWatching()
    expect(w.map((r) => r.name)).toEqual(['A\nB 番'])
    expect(w[0]).toMatchObject({ day_of_week: '周一', time_slot: '20:30', current_episode: '5' })

    expect(db.getAllRemaining().map((r) => r.name)).toEqual(['C\nD 等'])
    expect(db.getAllWatched().map((r) => r.name)).toEqual(['E\nF 已看'])
    // 总条数必须恰好是 3，多出来就说明换行把记录拆散了
    expect(
      db.getAllWatching().length + db.getAllRemaining().length + db.getAllWatched().length,
    ).toBe(3)
  })

  it('[边界] JSON 往返保留 HTML / emoji / 超长名称', async () => {
    const names = ['<b>x</b>', '🎌', '长'.repeat(500)]
    for (const n of names) db.addWatching({ name: n })
    const json = buildExportJson(exportData())
    await db.clearAll()
    await importJson(textFile(json, 'rt.json'))
    expect(db.getAllWatching().map((r) => r.name)).toEqual(names)
  })

  it('[边界] MD 往返后空日期记录仍是空日期，不变成字面量「未归类」', async () => {
    db.addWatched({ name: '无日期作品', watch_date: '' })
    const md = buildExportMarkdown(exportData())
    await db.clearAll()
    await importMd(textFile(md, 'rt.md'))
    const row = db.getAllWatched().find((r) => r.name === '无日期作品')
    expect(row).toBeTruthy()
    expect(row.watch_date).toBe('')
  })
})

// ===========================================================================
// 存储边界：IndexedDB 失败可感知
// ===========================================================================

describe('存储边界：IndexedDB 写失败', () => {
  it('[边界] 配额超限（quota exceeded）：内存保留数据，saveStrict 能感知失败', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { open() { throw new Error('quota exceeded') } },
    })
    try {
      __resetIdbConnection?.()
      const res = db.addWatching({ name: '写不进' })
      // 内存里必须还在：否则用户刚输入的内容瞬间消失
      expect(res.success).toBe(true)
      expect(db.getAllWatching().some((r) => r.name === '写不进')).toBe(true)
      // 严格落盘必须把失败抛给调用方（UI 据此提示「数据未能保存」）
      await expect(db.saveStrict()).rejects.toThrow()
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
      else delete globalThis.indexedDB
      __resetIdbConnection?.()
    }
  })
})
