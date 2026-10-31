/**
 * 「已看历史 / 导入 Excel / 应用外壳」组件级审计测试
 * ---------------------------------------------------------------
 * 约定：
 *  - 只 mock 数据层（db/api、db/index）与全局 Toast，组件本身用真实实现。
 *  - 标记 `it.fails` 的用例是**缺陷复现**：断言的是「期望行为」，当前源码不满足，
 *    因此以「预期失败」形式保留，套件整体仍然绿色。修复缺陷后该用例会变成
 *    「意外通过」并报红，提醒把 it.fails 改回 it 作为回归保护。
 *    缺陷编号对应 review/watched-import.md（#01、#02 … #21）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import * as XLSX from 'xlsx'

// ---------------------------------------------------------------------------
// 依赖桩：必须在 import 组件之前声明（vi.mock 会被提升）
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  watchedApi: {
    getAll: vi.fn(),
    getByYear: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  watchedYearsApi: {
    getAll: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  batchApi: {
    batchDeleteWatched: vi.fn(),
    clearWatched: vi.fn(),
    clearWatchedYears: vi.fn(),
  },
  importApi: { upload: vi.fn() },
  getDb: vi.fn(),
}))

vi.mock('../src/db/api', () => ({
  watchedApi: mocks.watchedApi,
  watchedYearsApi: mocks.watchedYearsApi,
  batchApi: mocks.batchApi,
  importApi: mocks.importApi,
}))

vi.mock('../src/db/index', () => ({
  getDb: mocks.getDb,
  default: {},
}))

// App.vue 模板里的 <img src="/logo.png"> 会被 @vitejs/plugin-vue 重写成
// `import _imports_0 from "/logo.png?import"`；Windows 下该公共资源 id 会被
// 转成无盘符的 file:///logo.png，vite 读文件时直接抛 ERR_INVALID_ARG_VALUE。
// 测试里把这个静态资源桩掉，避免整个套件在收集阶段挂掉。
vi.mock('/logo.png?import', () => ({ default: '/logo.png' }))

vi.mock('../src/composables/useToast', async () => {
  const { reactive } = await import('vue')
  const toasts = reactive([])
  const DURATION = { success: 2500, info: 2500, warning: 3500, error: 4500 }
  let seq = 0
  const showToast = (message, type = 'success') => {
    const id = ++seq
    toasts.push({ id, message, type })
    setTimeout(() => {
      const idx = toasts.findIndex((t) => t.id === id)
      if (idx >= 0) toasts.splice(idx, 1)
    }, DURATION[type] || DURATION.success)
  }
  return { toasts, showToast, useToasts: () => toasts }
})

vi.mock('../src/composables/useAppearance', () => ({
  useAppearance: () => ({
    state: { bgEnabled: false, bgUrl: '', bgFailed: false },
    toggleBackground: vi.fn(),
  }),
  initAppearance: vi.fn(),
}))

vi.mock('../src/composables/useTheme', async () => {
  const { ref } = await import('vue')
  return {
    useTheme: () => ({ theme: ref('light'), isDark: ref(false), toggleTheme: vi.fn() }),
    initTheme: vi.fn(),
  }
})

const WatchedView = (await import('../src/views/WatchedView.vue')).default
const ImportView = (await import('../src/views/ImportView.vue')).default
const App = (await import('../src/App.vue')).default
const ToastHost = (await import('../src/components/ToastHost.vue')).default
const { importExcel } = await import('../src/db/excelImporter')
const { toasts, showToast } = await import('../src/composables/useToast')
const { compareDateKey, extractAllYears } = await import('../src/composables/useDatePicker')

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
const ok = (data) => ({ data: { success: true, data } })
const okYear = (data, yearCount, totalCount) => ({
  data: { success: true, data, yearCount, totalCount },
})

const makeItem = (id, name, watch_date = '2025/01/01', extra = {}) => ({
  id,
  name,
  watch_date,
  url: '',
  url_params: '',
  notes: '',
  sort_order: id,
  ...extra,
})

const dataRows = (wrapper) => wrapper.findAll('tr.list-item')

const buttonByText = (scope, text) =>
  scope.findAll('button').find((b) => b.text().includes(text))

const buttonByExact = (scope, text) =>
  scope.findAll('button').find((b) => b.text().trim() === text)

const buttonByContains = buttonByText

/**
 * 通过「导出」菜单触发 .db 导出。
 * 侧边栏把「导出备份」与「导出数据」合并成一个下拉菜单后，
 * 不能再直接找「导出备份」按钮 —— 需要先开菜单、再点「数据库备份 (.db)」项。
 * 菜单 Teleport 到 body，因此从 document 里找而不是 wrapper。
 */
const triggerExportDbViaMenu = async (wrapperRef) => {
  // 用 includes 而非严格相等：导出按钮除文案外还带一个 caret 图标，
  // 且文案会随 i18n 调整（曾从「导出数据」缩为「导出」），严格相等太脆。
  const exportBtn = wrapperRef.findAll('button').find(b => /导出/.test(b.text()))
  if (!exportBtn) throw new Error('找不到「导出」按钮')
  await exportBtn.trigger('click')
  await flushPromises()
  // 菜单项在 body 上
  const item = Array.from(document.querySelectorAll('[role="menuitem"]'))
    .find(el => el.textContent.includes('.db'))
  if (!item) throw new Error('找不到「数据库备份 (.db)」菜单项')
  item.click()
  await flushPromises()
}

const dialogButton = (text) => {
  const dlg = document.querySelector('.app-dialog')
  if (!dlg) return null
  return [...dlg.querySelectorAll('button')].find((b) => b.textContent.includes(text))
}

const bodyButton = (text) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text)

const setFileInput = async (inputWrapper, file) => {
  Object.defineProperty(inputWrapper.element, 'files', {
    configurable: true,
    value: [file],
  })
  await inputWrapper.trigger('change')
}

function makeWorkbook(sheets) {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new File([buf], 'import.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

let wrapper = null

async function mountWatched(opts = {}) {
  const years = opts.years ?? [{ id: 1, year_label: '2025', sort_order: 1 }]
  mocks.watchedYearsApi.getAll.mockResolvedValue(ok(years))
  mocks.watchedApi.getAll.mockResolvedValue(ok(opts.allItems ?? []))
  mocks.watchedApi.getByYear.mockImplementation((year) =>
    Promise.resolve(okYear(opts.byYear?.[year] ?? [], 0, 0)),
  )
  wrapper = mount(WatchedView, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  toasts.splice(0, toasts.length)
  mocks.watchedApi.update.mockResolvedValue({ data: { success: true } })
  mocks.watchedApi.add.mockResolvedValue({ data: { success: true } })
  mocks.watchedApi.delete.mockResolvedValue({ data: { success: true } })
  mocks.watchedYearsApi.update.mockResolvedValue({ data: { success: true } })
  mocks.watchedYearsApi.add.mockResolvedValue({ data: { success: true } })
  mocks.watchedYearsApi.delete.mockResolvedValue({ data: { success: true } })
  mocks.batchApi.batchDeleteWatched.mockResolvedValue({ data: { success: true } })
  mocks.batchApi.clearWatched.mockResolvedValue({ data: { success: true } })
  mocks.batchApi.clearWatchedYears.mockResolvedValue({ data: { success: true } })
})

afterEach(() => {
  if (wrapper) {
    wrapper.unmount()
    wrapper = null
  }
  document.body.innerHTML = ''
  vi.useRealTimers()
})

// ===========================================================================
// 1. 年份分组
// ===========================================================================
describe('已看历史 · 年份分组', () => {
  it('默认选中今年，并分别显示本年与总计数量', async () => {
    const thisYear = String(new Date().getFullYear())
    const items = [makeItem(1, '甲'), makeItem(2, '乙')]
    await mountWatched({
      years: [
        { id: 2, year_label: thisYear, sort_order: 1 },
        { id: 1, year_label: '2014', sort_order: 2 },
      ],
    })
    mocks.watchedApi.getByYear.mockResolvedValue(okYear(items, 2, 7))
    await wrapper.find('select').setValue(thisYear)
    await flushPromises()

    expect(wrapper.text()).toContain('本年: 2部')
    expect(wrapper.text()).toContain('总计: 7部')
    expect(dataRows(wrapper)).toHaveLength(2)
  })

  it('范围标签展开为逐年区间（extractAllYears 基线）', () => {
    expect(extractAllYears('2014~2017')).toEqual(['2014', '2015', '2016', '2017'])
    expect(extractAllYears('2015/03')).toEqual(['2015'])
    expect(extractAllYears('')).toEqual([])
  })

  it('[缺陷#02] 「2014~2017」分组应包含落在区间内的年份记录', async () => {
    const rows = [
      makeItem(1, '组内记录', '2015/03'),
      makeItem(2, '范围字面量', '2014~2017'),
    ]
    await mountWatched({
      years: [{ id: 1, year_label: '2014~2017', sort_order: 1 }],
      byYear: {
        // 复刻修复后的 db.getWatchedByYear('2014~2017')：区间内年份 + 字面量都算命中
        '2014~2017': rows.filter((r) => {
          if (r.watch_date === '2014~2017') return true
          const m = String(r.watch_date).match(/^(\d{4})/)
          if (!m) return false
          const y = parseInt(m[1], 10)
          return y >= 2014 && y <= 2017
        }),
      },
    })
    await wrapper.find('select').setValue('2014~2017')
    await flushPromises()

    expect(wrapper.text()).toContain('组内记录')
    expect(wrapper.text()).toContain('范围字面量')
  })

  it('[缺陷#02] 「未分类」不应重复收录已属于范围分组的记录', async () => {
    const rows = [makeItem(1, '范围字面量', '2014~2017')]
    await mountWatched({
      years: [{ id: 1, year_label: '2014~2017', sort_order: 1 }],
      allItems: rows,
    })
    await wrapper.find('select').setValue('__unclassified__')
    await flushPromises()

    // extractAllYears('2014~2017') 展开为 2014..2017，但 yearLabels 里是字面量
    // '2014~2017'，于是这条记录同时出现在「2014~2017」与「未分类」两个分组里。
    expect(wrapper.text()).not.toContain('范围字面量')
  })
})

// ===========================================================================
// 2. 搜索 + 分页
// ===========================================================================
describe('已看历史 · 搜索与分页', () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    makeItem(i + 1, `作品${String(i + 1).padStart(2, '0')}`),
  )

  it('分页只渲染当前页，并显示总条数', async () => {
    await mountWatched({ byYear: { 2025: many } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()

    expect(dataRows(wrapper)).toHaveLength(20)
    expect(wrapper.text()).toContain('共 25 条')
    expect(wrapper.text()).toContain('作品20')
    expect(wrapper.text()).not.toContain('作品21')
  })

  it('翻页后渲染剩余记录且行序号连续', async () => {
    await mountWatched({ byYear: { 2025: many } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()

    await buttonByText(wrapper, '下一页').trigger('click')
    await flushPromises()

    expect(dataRows(wrapper)).toHaveLength(5)
    expect(dataRows(wrapper)[0].text()).toContain('21')
    expect(wrapper.text()).toContain('作品25')
  })

  it('输入搜索词后回到第 1 页并只保留匹配项', async () => {
    await mountWatched({ byYear: { 2025: many } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()

    await buttonByText(wrapper, '下一页').trigger('click')
    await flushPromises()
    expect(dataRows(wrapper)[0].text()).toContain('21')

    await wrapper.find('input[placeholder="搜索作品名称..."]').setValue('作品2')
    await flushPromises()

    expect(wrapper.text()).toContain('共 6 条')
    expect(dataRows(wrapper)).toHaveLength(6)
    expect(wrapper.text()).toContain('作品20')
  })

  it('搜索无结果时显示空态而不是空表', async () => {
    await mountWatched({ byYear: { 2025: many } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()

    await wrapper.find('input[placeholder="搜索作品名称..."]').setValue('不存在的作品')
    await flushPromises()

    expect(wrapper.text()).toContain('没有找到匹配的记录')
    expect(dataRows(wrapper)).toHaveLength(0)
  })

  it('切换年份时搜索词被保留（当前实现），会继续过滤新一年的列表', async () => {
    await mountWatched({
      years: [
        { id: 1, year_label: '2025', sort_order: 1 },
        { id: 2, year_label: '2024', sort_order: 2 },
      ],
      byYear: { 2025: many, 2024: [makeItem(99, '作品01')] },
    })
    await wrapper.find('input[placeholder="搜索作品名称..."]').setValue('作品01')
    await flushPromises()
    await wrapper.find('select').setValue('2025')
    await flushPromises()
    await wrapper.find('select').setValue('2024')
    await flushPromises()

    expect(wrapper.find('input[placeholder="搜索作品名称..."]').element.value).toBe('作品01')
  })
})

// ===========================================================================
// 3. 批量选择 / 批量删除
// ===========================================================================
describe('已看历史 · 批量选择与删除', () => {
  const forty = Array.from({ length: 40 }, (_, i) => makeItem(i + 1, `A${i + 1}`))

  const enterBatch = async () => {
    await buttonByText(wrapper, '批量选择').trigger('click')
    await flushPromises()
  }

  it('进入批量模式会清空已选，勾选后显示计数', async () => {
    await mountWatched({ byYear: { 2025: forty } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()

    await enterBatch()
    await dataRows(wrapper)[0].trigger('click')
    await dataRows(wrapper)[1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('已选择')
    expect(buttonByText(wrapper, '批量删除 (2)')).toBeTruthy()
  })

  it('批量删除确认后调用 batchApi 并刷新数据', async () => {
    await mountWatched({ byYear: { 2025: forty } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()
    await enterBatch()
    await dataRows(wrapper)[0].trigger('click')
    await dataRows(wrapper)[2].trigger('click')
    await flushPromises()

    mocks.watchedApi.getByYear.mockClear()
    await buttonByText(wrapper, '批量删除 (2)').trigger('click')
    await flushPromises()
    dialogButton('确认删除').click()
    await flushPromises()

    expect(mocks.batchApi.batchDeleteWatched).toHaveBeenCalledWith([1, 3])
    expect(mocks.watchedApi.getByYear).toHaveBeenCalledWith('2025')
    expect(toasts.some((t) => /批量删除/.test(t.message))).toBe(true)
  })

  it('批量删除取消则不调用 API', async () => {
    await mountWatched({ byYear: { 2025: forty } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()
    await enterBatch()
    await dataRows(wrapper)[0].trigger('click')
    await buttonByText(wrapper, '批量删除 (1)').trigger('click')
    await flushPromises()
    dialogButton('取消').click()
    await flushPromises()

    expect(mocks.batchApi.batchDeleteWatched).not.toHaveBeenCalled()
  })

  it('全选只作用于当前页', async () => {
    await mountWatched({ byYear: { 2025: forty } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()
    await enterBatch()

    await buttonByExact(wrapper, '全选').trigger('click')
    await flushPromises()
    expect(buttonByText(wrapper, '批量删除 (20)')).toBeTruthy()
    expect(buttonByExact(wrapper, '取消全选')).toBeTruthy()
  })

  it('[缺陷#03] 跨页勾选后本页「全选」状态不应误判', async () => {
    await mountWatched({ byYear: { 2025: forty } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()
    await enterBatch()

    // 第 1 页（20 条）全选
    await buttonByExact(wrapper, '全选').trigger('click')
    await flushPromises()
    // 翻到第 2 页：本页 20 条一条都没勾
    await buttonByText(wrapper, '下一页').trigger('click')
    await flushPromises()

    // isAllChecked 用 checkedIds.length === paginatedList.length 判断，
    // 跨页累计 20 条时会在第 2 页误显示「已全选」
    expect(buttonByExact(wrapper, '全选')).toBeTruthy()
  })

  it('[缺陷#03] 切换年份应清空批量勾选，避免删除其它年份的记录', async () => {
    await mountWatched({
      years: [
        { id: 1, year_label: '2025', sort_order: 1 },
        { id: 2, year_label: '2024', sort_order: 2 },
      ],
      byYear: { 2025: forty, 2024: [makeItem(500, '旧记录', '2024/05/01')] },
    })
    await wrapper.find('select').setValue('2025')
    await flushPromises()
    await enterBatch()
    await dataRows(wrapper)[0].trigger('click')
    await dataRows(wrapper)[1].trigger('click')
    await flushPromises()

    await wrapper.find('select').setValue('2024')
    await flushPromises()

    // 勾选仍残留：此时点「批量删除 (2)」会删掉不可见的 2025 记录
    expect(wrapper.text()).not.toContain('已选择')
  })

  it('[缺陷#14] 切换年份应清空「当前选中」，否则编辑/删除指向上一年的记录', async () => {
    await mountWatched({
      years: [
        { id: 1, year_label: '2025', sort_order: 1 },
        { id: 2, year_label: '2024', sort_order: 2 },
      ],
      byYear: { 2025: [makeItem(1, '去年的番', '2025/01/01')], 2024: [] },
    })
    await wrapper.find('select').setValue('2025')
    await flushPromises()
    await dataRows(wrapper)[0].trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('当前选中')

    await wrapper.find('select').setValue('2024')
    await flushPromises()

    expect(wrapper.text()).not.toContain('当前选中')
  })
})

// ===========================================================================
// 4. 日期与行内编辑
// ===========================================================================
describe('已看历史 · 日期与行内编辑', () => {
  it('双击日期单元格进入编辑，回车保存调用 update', async () => {
    await mountWatched({ byYear: { 2025: [makeItem(1, '甲', '2025/01/01')] } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()

    const dateCell = dataRows(wrapper)[0].findAll('td')[2]
    await dateCell.trigger('dblclick')
    const input = dateCell.find('input')
    expect(input.element.value).toBe('2025/01/01')

    await input.setValue('2025/03/09')
    await input.trigger('keyup', { key: 'Enter' })
    await flushPromises()

    expect(mocks.watchedApi.update).toHaveBeenCalledWith(1, { watch_date: '2025/03/09' })
  })

  it('保存失败时提示错误并回滚单元格显示', async () => {
    mocks.watchedApi.update.mockResolvedValue({ data: { success: false, error: '写库失败' } })
    await mountWatched({ byYear: { 2025: [makeItem(1, '甲', '2025/01/01')] } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()

    const dateCell = dataRows(wrapper)[0].findAll('td')[2]
    await dateCell.trigger('dblclick')
    await dateCell.find('input').setValue('2025/03/09')
    await dateCell.find('input').trigger('keyup', { key: 'Enter' })
    await flushPromises()

    expect(toasts.some((t) => t.message === '写库失败' && t.type === 'error')).toBe(true)
    expect(dateCell.text()).toContain('2025/01/01')
    expect(dateCell.find('input').exists()).toBe(false)
  })

  it('[缺陷#11] 行内编辑非法日期时不应写库', async () => {
    await mountWatched({ byYear: { 2025: [makeItem(1, '甲', '2025/01/01')] } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()

    const dateCell = dataRows(wrapper)[0].findAll('td')[2]
    await dateCell.trigger('dblclick')
    await dateCell.find('input').setValue('不是日期')
    await dateCell.find('input').trigger('keyup', { key: 'Enter' })
    await flushPromises()

    // 期望：与新增/编辑弹窗一致，先 validateDate 再落库
    expect(mocks.watchedApi.update).not.toHaveBeenCalled()
  })

  it('[缺陷#12] 编辑弹窗对「年月」精度记录应保留原值并给出提示', async () => {
    await mountWatched({ byYear: { 2025: [makeItem(1, '甲', '2025/07')] } })
    await wrapper.find('select').setValue('2025')
    await flushPromises()

    await dataRows(wrapper)[0].trigger('click')
    await buttonByText(wrapper, '编辑').trigger('click')
    await flushPromises()

    // 年月精度无法用 type="date" 表示：自动切手动输入，原值 '2025/07' 完整回显
    const textInput = document.querySelector('.app-dialog input[placeholder*="2025"]')
    expect(textInput).toBeTruthy()
    expect(textInput.value).toBe('2025/07')
    expect(document.querySelector('.app-dialog').textContent).toContain('2025/07')
  })

  it('compareDateKey：纯年份排在同年前面，混合精度按时间递增', () => {
    expect(compareDateKey('2025', '2025/07')).toBe(-1)
    expect(compareDateKey('2025/07', '2025/07/15')).toBe(-1)
    expect(compareDateKey('2025/07/15', '2025/07/15 14:30')).toBe(-1)
    expect(compareDateKey('2024/12/31', '2025/01/01')).toBe(-1)
    expect(compareDateKey('2025/07/15', '2025/07/15')).toBe(0)
  })

  it('[缺陷#13] compareDateKey：范围日期与非零填充月份不应打乱时序', () => {
    // '2014~2017' 取数字得 '20142017'
    expect(compareDateKey('2014~2017', '2017/01/01')).toBe(-1)
    // '2025/7'（Excel 文本导入未补零）取数字得 '20257'，会排到 2025/12/31 之后
    expect(compareDateKey('2025/7', '2025/12/31')).toBe(-1)
  })
})

// ===========================================================================
// 5. 年份维护后的刷新
// ===========================================================================
describe('已看历史 · 年份维护', () => {
  it('[缺陷#09] 删除最后一个年份后列表应清空', async () => {
    await mountWatched({
      years: [{ id: 1, year_label: '2025', sort_order: 1 }],
      byYear: { 2025: [makeItem(1, '甲')] },
    })
    await wrapper.find('select').setValue('2025')
    await flushPromises()
    expect(dataRows(wrapper)).toHaveLength(1)

    mocks.watchedYearsApi.getAll.mockResolvedValue(ok([]))
    await buttonByText(wrapper, '删除年份').trigger('click')
    await flushPromises()
    dialogButton('确认删除').click()
    await flushPromises()

    // selectedYear 被置空后 fetchData() 直接 return，watchedList 保持旧值
    expect(dataRows(wrapper)).toHaveLength(0)
  })

  it('[缺陷#10] 新增记录后年份下拉应刷新（新日期带来的新年份）', async () => {
    await mountWatched({
      years: [{ id: 1, year_label: '2025', sort_order: 1 }],
      byYear: { 2025: [] },
    })
    await wrapper.find('select').setValue('2025')
    await flushPromises()
    const callsBefore = mocks.watchedYearsApi.getAll.mock.calls.length

    await buttonByText(wrapper, '添加记录').trigger('click')
    await flushPromises()
    const nameInput = document.querySelector('.app-dialog input[placeholder="请输入作品名称"]')
    nameInput.value = '新番'
    nameInput.dispatchEvent(new Event('input'))
    const dateInput = document.querySelector('.app-dialog input[type="date"]')
    dateInput.value = '2019-04-01'
    dateInput.dispatchEvent(new Event('input'))
    await flushPromises()
    dialogButton('保存').click()
    await flushPromises()

    // db.addWatched 会 _ensureYearLabel('2019')，但页面从不重新 fetchYears
    expect(mocks.watchedYearsApi.getAll.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('[缺陷#08] 年份改名后原有记录不应掉出分组', async () => {
    await mountWatched({
      years: [{ id: 1, year_label: '2025', sort_order: 1 }],
      byYear: { 2025: [makeItem(1, '甲', '2025/03/01')], '2025~2026': [] },
    })
    await wrapper.find('select').setValue('2025')
    await flushPromises()
    expect(dataRows(wrapper)).toHaveLength(1)

    mocks.watchedYearsApi.getAll.mockResolvedValue(ok([{ id: 1, year_label: '2025~2026', sort_order: 1 }]))
    // 改名后 db 层已把该组记录的 watch_date 迁到新标签，因此新分组能查到
    mocks.watchedApi.getByYear.mockImplementation(async () => ok([makeItem(1, '甲', '2025~2026')]))
    await buttonByText(wrapper, '编辑年份').trigger('click')
    await flushPromises()
    const labelInput = document.querySelector('.app-dialog input[placeholder="如: 2025 或 2014~2017"]')
    labelInput.value = '2025~2026'
    labelInput.dispatchEvent(new Event('input'))
    await flushPromises()
    dialogButton('保存').click()
    await flushPromises()

    expect(dataRows(wrapper)).toHaveLength(1)
  })
})

// ===========================================================================
// 6. 导入 Excel —— ImportView 交互
// ===========================================================================
describe('导入 Excel · ImportView', () => {
  const mountImport = async () => {
    wrapper = mount(ImportView, { attachTo: document.body })
    await flushPromises()
    return wrapper
  }

  it('选择文件后显示文件名，开始导入时把 File 放进 FormData 交给 importApi', async () => {
    await mountImport()
    const file = new File(['a,b'], 'history.xlsx')
    await setFileInput(wrapper.find('input[type="file"]'), file)
    expect(wrapper.text()).toContain('history.xlsx')

    mocks.importApi.upload.mockResolvedValue({
      data: { success: true, message: '导入完成！成功导入 1 条数据，失败 0 条', imported: 1, errors: [] },
    })
    await buttonByText(wrapper, '开始导入').trigger('click')
    await flushPromises()

    const formData = mocks.importApi.upload.mock.calls[0][0]
    expect(formData instanceof FormData).toBe(true)
    expect(formData.get('file')).toBe(file)
  })

  it('导入成功时写日志并弹 Toast', async () => {
    await mountImport()
    await setFileInput(wrapper.find('input[type="file"]'), new File(['x'], 'a.xlsx'))
    mocks.importApi.upload.mockResolvedValue({
      data: { success: true, message: '导入完成！成功导入 3 条数据，失败 0 条', imported: 3, errors: [] },
    })
    await buttonByText(wrapper, '开始导入').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('导入完成！成功导入 3 条数据，失败 0 条')
    expect(wrapper.text()).toContain('成功导入: 3 条')
    expect(toasts.some((t) => /成功导入 3 条/.test(t.message))).toBe(true)
  })

  it('导入返回失败时用 error 样式记录并弹错误 Toast', async () => {
    await mountImport()
    await setFileInput(wrapper.find('input[type="file"]'), new File(['x'], 'a.xlsx'))
    mocks.importApi.upload.mockResolvedValue({
      data: { success: false, message: '无法打开 Excel 文件', imported: 0, errors: ['打开文件失败'] },
    })
    await buttonByText(wrapper, '开始导入').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('无法打开 Excel 文件')
    expect(toasts.some((t) => t.message === '无法打开 Excel 文件' && t.type === 'error')).toBe(true)
  })

  it('导入抛异常时记录 err.message 而不是崩溃', async () => {
    await mountImport()
    await setFileInput(wrapper.find('input[type="file"]'), new File(['x'], 'a.xlsx'))
    mocks.importApi.upload.mockRejectedValue(new Error('boom'))
    await buttonByText(wrapper, '开始导入').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('导入出错: boom')
    expect(buttonByText(wrapper, '开始导入')).toBeTruthy()
  })

  it('导入进行中按钮禁用，完成前不能重复触发', async () => {
    await mountImport()
    await setFileInput(wrapper.find('input[type="file"]'), new File(['x'], 'a.xlsx'))
    let resolveUpload
    mocks.importApi.upload.mockReturnValue(new Promise((r) => { resolveUpload = r }))
    await buttonByContains(wrapper, '开始导入').trigger('click')
    await flushPromises()

    // 按钮图标已改为 SVG（AppIcon），只断言文案
    expect(wrapper.text()).toContain('导入中...')
    expect(buttonByContains(wrapper, '导入中').attributes('disabled')).toBeDefined()
    expect(mocks.importApi.upload).toHaveBeenCalledTimes(1)

    resolveUpload({ data: { success: true, message: 'ok', imported: 1, errors: [] } })
    await flushPromises()
    expect(buttonByText(wrapper, '开始导入')).toBeTruthy()
  })
})

// ===========================================================================
// 7. 导入 Excel —— excelImporter 解析/写库调用链
// ===========================================================================
describe('导入 Excel · excelImporter 调用链', () => {
  let fakeDb

  beforeEach(() => {
    fakeDb = {
      addWatching: vi.fn(() => ({ success: true })),
      addRemaining: vi.fn(() => ({ success: true })),
      addWatched: vi.fn(() => ({ success: true })),
      addWatchedYear: vi.fn(() => ({ success: true })),
    }
    mocks.getDb.mockResolvedValue(fakeDb)
  })

  const watchedNames = () => fakeDb.addWatched.mock.calls.map((c) => c[0].name)

  it('已看表：按列年份写入 watch_date，名称/备注拆分为两个字段', async () => {
    const file = makeWorkbook({
      已看: [
        ['', '2025', '2014~2017'],
        ['', '进击的巨人 (神作)', '轻音少女'],
      ],
    })
    const result = await importExcel(file)

    expect(result.success).toBe(true)
    expect(fakeDb.addWatched).toHaveBeenCalledWith(
      expect.objectContaining({ name: '进击的巨人', watch_date: '2025', notes: '神作' }),
    )
    expect(fakeDb.addWatched).toHaveBeenCalledWith(
      expect.objectContaining({ name: '轻音少女', watch_date: '2014~2017', notes: '' }),
    )
    expect(fakeDb.addWatchedYear).toHaveBeenCalledWith(
      expect.objectContaining({ year_label: '2025' }),
    )
    expect(fakeDb.addWatchedYear).toHaveBeenCalledWith(
      expect.objectContaining({ year_label: '2014~2017' }),
    )
  })

  it('追番表：识别星期表头列、时间小数与「名称 集数」', async () => {
    const file = makeWorkbook({
      追番: [
        ['时间', '周一', '周二'],
        [0.5, '番剧甲 3', '番剧乙'],
      ],
    })
    const result = await importExcel(file)

    expect(result.success).toBe(true)
    expect(fakeDb.addWatching).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '番剧甲',
        current_episode: '3',
        day_of_week: '周一',
        time_slot: '12:00',
      }),
    )
    expect(fakeDb.addWatching).toHaveBeenCalledWith(
      expect.objectContaining({ name: '番剧乙', day_of_week: '周二' }),
    )
  })

  it('[缺陷#04] 数值序号列不应被当成「年份」导入', async () => {
    const file = makeWorkbook({
      已看: [
        ['序号', '2025'],
        [1, '甲'],
        [2, '乙'],
      ],
    })
    await importExcel(file)

    // parseYear(1) 走 typeof number 分支返回 '1'，于是建出「1」年份组，
    // 并把行号 1/2 当作番剧名写进 watched 表
    expect(fakeDb.addWatchedYear).not.toHaveBeenCalledWith(
      expect.objectContaining({ year_label: '1' }),
    )
    expect(watchedNames()).not.toContain('1')
  })

  it('[缺陷#04] 标题行不应导致整表年份错位', async () => {
    const file = makeWorkbook({
      已看: [
        ['我的已看清单'],
        ['2025', '2024'],
        ['甲', '乙'],
      ],
    })
    await importExcel(file)

    // data[0] 被当表头，parseYear('我的已看清单') 无 4 位年份时原样返回字符串
    expect(fakeDb.addWatchedYear).not.toHaveBeenCalledWith(
      expect.objectContaining({ year_label: '我的已看清单' }),
    )
    expect(watchedNames()).not.toContain('2025')
  })

  it('[缺陷#07] 没有「追番」工作表时不应报「未找到星期表头」', async () => {
    const file = makeWorkbook({
      已看: [
        ['', '2025'],
        ['', '甲'],
      ],
    })
    const result = await importExcel(file)

    // importWatching 找不到「追番」表会回落 SheetNames[0]，在纯已看工作簿里必然误报
    expect(result.errors).toEqual([])
  })

  it('[缺陷#06] 全部行失败时不应返回 success:true', async () => {
    fakeDb.addWatched.mockReturnValue({ success: false, error: '该记录已存在' })
    const file = makeWorkbook({
      已看: [
        ['', '2025'],
        ['', '甲'],
        ['', '乙'],
      ],
    })
    const result = await importExcel(file)

    expect(result.imported).toBe(0)
    expect(result.success).toBe(false)
  })

  it('无法识别的文件返回 success:false 而不是抛异常', async () => {
    // 伪造一个损坏的 zip 头（.xlsx 本质是 zip），SheetJS 解析时会抛错
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00])], 'bad.xlsx')
    const result = await importExcel(file)

    expect(result.success).toBe(false)
    expect(result.imported).toBe(0)
    expect(result.message).toBe('无法打开 Excel 文件')
  })

  it('重复导入同一文件是「追加」语义（无去重、无二次确认入口）', async () => {
    const file = makeWorkbook({
      已看: [
        ['', '2025'],
        ['', '甲'],
      ],
    })
    await importExcel(file)
    await importExcel(file)

    expect(fakeDb.addWatched).toHaveBeenCalledTimes(2)
    expect(watchedNames()).toEqual(['甲', '甲'])
  })
})

// ===========================================================================
// 8. App 外壳 —— 备份导出 / 恢复
// ===========================================================================
describe('App · 备份导出与恢复', () => {
  let createObjectURL
  let revokeObjectURL
  let anchorClick
  let downloadName
  let dbMock
  let consoleError

  const mountApp = async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', redirect: '/watching' },
        { path: '/watching', component: { template: '<div>watching</div>' } },
        { path: '/remaining', component: { template: '<div>remaining</div>' } },
        { path: '/watched', component: { template: '<div>watched</div>' } },
        { path: '/import', component: { template: '<div>import</div>' } },
      ],
    })
    await router.push('/')
    await router.isReady()
    wrapper = mount(App, {
      attachTo: document.body,
      // ThemeSettings 已改为独立页面（/appearance），App 不再挂载该组件，无需 stub
      global: { plugins: [router] },
    })
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    downloadName = null
    // App.vue 的失败分支会 console.error，测试里静音保持输出干净
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    createObjectURL = vi.fn(() => 'blob:mock')
    revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function () {
        downloadName = this.download
      })
    dbMock = {
      export: vi.fn(() => new Uint8Array([1, 2, 3, 4])),
      importDb: vi.fn(),
      save: vi.fn(),
    }
    mocks.getDb.mockResolvedValue(dbMock)
    localStorage.clear()
  })

  afterEach(() => {
    anchorClick.mockRestore()
    consoleError.mockRestore()
  })

  it('导出备份：生成 Blob、按时间戳命名并记录上次备份时间', async () => {
    await mountApp()
    await triggerExportDbViaMenu(wrapper)
    await flushPromises()

    expect(dbMock.export).toHaveBeenCalled()
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(downloadName).toMatch(/^bangumi_backup_\d{8}_\d{4}\.db$/)
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:mock')
    expect(localStorage.getItem('banager_last_backup')).toBeTruthy()
    // 上次备份时间已从常驻行改为悬浮气泡（且 Teleport 到 body），故查 DOM 而非 wrapper.text()
    const tip = document.querySelector('#backup-tip')
    expect(tip).toBeTruthy()
    expect(tip.textContent).toContain('今天')
    expect(toasts.some((t) => t.message === '备份已导出')).toBe(true)
  })

  it('导出备份后延迟释放 blob URL，避免下载被中断', async () => {
    vi.useFakeTimers()
    await mountApp()
    await triggerExportDbViaMenu(wrapper)
    vi.advanceTimersByTime(1600)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    vi.useRealTimers()
  })

  it('导出失败：提示错误且不写备份时间', async () => {
    dbMock.export.mockImplementation(() => {
      throw new Error('disk full')
    })
    await mountApp()
    await triggerExportDbViaMenu(wrapper)

    expect(toasts.some((t) => t.type === 'error' && /导出失败/.test(t.message))).toBe(true)
    expect(localStorage.getItem('banager_last_backup')).toBeNull()
    expect(anchorClick).not.toHaveBeenCalled()
  })

  it('选择备份文件后先弹确认框，取消则不触库', async () => {
    await mountApp()
    await setFileInput(wrapper.find('input[type="file"]'), new File(['x'], 'backup.db'))
    await flushPromises()
    expect(document.body.textContent).toContain('backup.db')

    bodyButton('取消').click()
    await flushPromises()

    expect(dbMock.importDb).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('backup.db')
  })

  it('确认后把文件字节交给 importDb 并持久化', async () => {
    const sqliteHeader = new TextEncoder().encode('SQLite format 3\u0000')
    const file = new File([sqliteHeader], 'backup.db')
    await mountApp()
    await setFileInput(wrapper.find('input[type="file"]'), file)
    await flushPromises()
    bodyButton('确认导入').click()
    await flushPromises()

    expect(dbMock.importDb).toHaveBeenCalledTimes(1)
    const arg = dbMock.importDb.mock.calls[0][0]
    expect(arg).toBeInstanceOf(Uint8Array)
    expect(Array.from(arg.slice(0, 16))).toEqual(Array.from(sqliteHeader))
    expect(dbMock.save).toHaveBeenCalled()
  })

  it('非 SQLite 文件在触库前即被拒绝', async () => {
    await mountApp()
    await setFileInput(wrapper.find('input[type="file"]'), new File(['not a db'], 'broken.db'))
    await flushPromises()
    bodyButton('确认导入').click()
    await flushPromises()

    expect(dbMock.importDb).not.toHaveBeenCalled()
    expect(toasts.some((t) => t.type === 'error' && /SQLite/.test(t.message))).toBe(true)
    expect(dbMock.save).not.toHaveBeenCalled()
  })

  it('损坏/非 SQLite 文件：错误提示，不落盘、不刷新页面', async () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const sqliteHeader = new TextEncoder().encode('SQLite format 3\u0000')
    dbMock.importDb.mockImplementation(() => {
      throw new Error('file is not a database')
    })
    await mountApp()

    await setFileInput(wrapper.find('input[type="file"]'), new File([sqliteHeader], 'broken.db'))
    await flushPromises()
    bodyButton('确认导入').click()
    await flushPromises()

    expect(toasts.some((t) => t.type === 'error' && /file is not a database/.test(t.message))).toBe(true)
    expect(timeoutSpy.mock.calls.map((c) => c[1])).not.toContain(900)
    timeoutSpy.mockRestore()
  })

  it('[缺陷#01] 恢复前应先导出一份当前库做快照', async () => {
    const sqliteHeader = new TextEncoder().encode('SQLite format 3\u0000')
    await mountApp()
    await setFileInput(wrapper.find('input[type="file"]'), new File([sqliteHeader], 'backup.db'))
    await flushPromises()
    bodyButton('确认导入').click()
    await flushPromises()

    expect(dbMock.export).toHaveBeenCalled()
  })

  it('[缺陷#01] 非 SQLite 文件应在触库前被拒绝（magic header 校验）', async () => {
    await mountApp()
    await setFileInput(
      wrapper.find('input[type="file"]'),
      new File(['SQLite format 3'.slice(1)], 'not-really.db'),
    )
    await flushPromises()
    bodyButton('确认导入').click()
    await flushPromises()

    expect(dbMock.importDb).not.toHaveBeenCalled()
    expect(toasts.some((t) => t.type === 'error' && /SQLite/.test(t.message))).toBe(true)
  })
})

// ===========================================================================
// 9. Toast 生命周期
// ===========================================================================
describe('Toast 生命周期', () => {
  it('多条 Toast 堆叠渲染，并按类型时长自动消失', async () => {
    vi.useFakeTimers()
    wrapper = mount(ToastHost, { attachTo: document.body })
    showToast('第一条', 'success')
    showToast('第二条', 'error')
    await flushPromises()
    expect(wrapper.text()).toContain('第一条')
    expect(wrapper.text()).toContain('第二条')

    await vi.advanceTimersByTimeAsync(2500)
    await flushPromises()
    expect(wrapper.text()).not.toContain('第一条')
    expect(wrapper.text()).toContain('第二条')

    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()
    expect(wrapper.text()).not.toContain('第二条')
  })

  it('相同内容不会被去重（连续操作会产生多条相同提示）', async () => {
    vi.useFakeTimers()
    wrapper = mount(ToastHost, { attachTo: document.body })
    showToast('更新失败', 'error')
    showToast('更新失败', 'error')
    await flushPromises()
    expect(wrapper.findAll('div.animate-slide-down')).toHaveLength(2)
  })

  it('[缺陷#20] Toast 区域应可被读屏软件播报（aria-live）', async () => {
    wrapper = mount(ToastHost, { attachTo: document.body })
    // 根节点带 transition-group，用查询而非 wrapper.element 更稳
    const host = document.querySelector('[role="status"]')
    expect(host).toBeTruthy()
    expect(host.getAttribute('aria-live')).toBe('polite')
    expect(host.getAttribute('aria-atomic')).toBe('false')
  })
})

// ===========================================================================
// 10. 无障碍 / 键盘
// ===========================================================================
describe('已看历史 · 无障碍与键盘', () => {
  it('Esc 可关闭添加记录弹窗', async () => {
    await mountWatched({ byYear: { 2025: [] } })
    await buttonByText(wrapper, '添加记录').trigger('click')
    await flushPromises()
    expect(document.querySelector('.app-dialog')).toBeTruthy()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.querySelector('.app-dialog')).toBeFalsy()
  })

  it('[缺陷#21] 可排序表头应可键盘触发', async () => {
    await mountWatched({ byYear: { 2025: [] } })
    const th = wrapper.findAll('th').find((h) => h.text().includes('作品名称'))
    expect(th.attributes('tabindex')).toBe('0')
    expect(th.attributes('aria-sort')).toBeTruthy()
  })

  it('[缺陷#21] 批量勾选框应暴露 role=checkbox / aria-checked', async () => {
    await mountWatched({ byYear: { 2025: [makeItem(1, '甲')] } })
    await buttonByText(wrapper, '批量选择').trigger('click')
    await flushPromises()
    const box = wrapper.find('tbody td .rounded.border-2')
    expect(box.attributes('role')).toBe('checkbox')
    expect(box.attributes('aria-checked')).toBe('false')
  })

  it('[缺陷#21] 自定义弹窗应声明 role=dialog / aria-modal', async () => {
    await mountWatched({ byYear: { 2025: [] } })
    await buttonByText(wrapper, '添加记录').trigger('click')
    await flushPromises()
    const dialog = document.querySelector('.app-dialog')
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})
