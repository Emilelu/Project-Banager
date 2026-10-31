// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('../src/db/api.js', () => ({
  watchingApi: {
    getAll: vi.fn(),
    getByDay: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    increment: vi.fn(),
    decrement: vi.fn(),
    moveToRemaining: vi.fn(),
    moveToWatched: vi.fn(),
  },
  remainingApi: {
    getAll: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    moveToWatching: vi.fn(),
  },
  batchApi: {
    batchDeleteWatching: vi.fn(),
    batchDeleteRemaining: vi.fn(),
    clearWatching: vi.fn(),
    clearRemaining: vi.fn(),
  },
}))

vi.mock('../src/composables/useToast.js', () => ({
  showToast: vi.fn(),
}))

import WatchingView from '../src/views/WatchingView.vue'
import RemainingView from '../src/views/RemainingView.vue'
import { watchingApi, remainingApi, batchApi } from '../src/db/api.js'
import { buildItemUrl, normalizeEpisodeInput } from '../src/composables/useEpisode.js'
import { todayStr } from '../src/composables/useDatePicker.js'

enableAutoUnmount(afterEach)

const ok = (data) => ({ data: { success: true, data } })
const actionOk = (extra = {}) => ({ data: { success: true, ...extra } })

const mountOptions = {
  global: {
    stubs: {
      teleport: true,
      RouterLink: { template: '<a><slot /></a>' },
    },
    config: {
      // 缺失函数等运行时错误只影响当前事件，不应让审计用例直接中断
      errorHandler: () => {},
    },
  },
}

const watchingItem = (overrides = {}) => ({
  id: 1,
  name: '番剧A',
  day_of_week: '周一',
  time_slot: '23:00',
  current_episode: '1',
  url: '',
  url_params: '',
  notes: '',
  ...overrides,
})

const remainingItem = (overrides = {}) => ({
  id: 1,
  name: '等番A',
  expected_date: '2026/12',
  url: '',
  url_params: '',
  notes: '',
  ...overrides,
})

const clone = (rows) => rows.map((row) => ({ ...row }))

async function mountWatching(watching = [], remaining = []) {
  watchingApi.getAll.mockResolvedValue(ok(clone(watching)))
  remainingApi.getAll.mockResolvedValue(ok(clone(remaining)))
  const wrapper = mount(WatchingView, mountOptions)
  await flushPromises()
  return wrapper
}

async function mountRemaining(remaining = []) {
  remainingApi.getAll.mockResolvedValue(ok(clone(remaining)))
  const wrapper = mount(RemainingView, mountOptions)
  await flushPromises()
  return wrapper
}

function buttonByText(wrapper, text) {
  return wrapper.findAll('button').find((button) => button.text().includes(text))
}

function buttonByExactText(wrapper, text) {
  return wrapper.findAll('button').find((button) => button.text().trim() === text)
}

function cardByName(wrapper, name) {
  return wrapper.findAll('.watching-card').find((card) => card.text().includes(name))
}

function tableRows(wrapper) {
  return wrapper.findAll('tbody tr').filter((row) => row.findAll('td').length > 0)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WatchingView 周历 / 集数 / 增删改', () => {
  it('按星期渲染卡片，未排期记录进入未排期区', async () => {
    const wrapper = await mountWatching([
      watchingItem({ id: 1, name: '周一番', day_of_week: '周一' }),
      watchingItem({ id: 2, name: '未排期番', day_of_week: '' }),
    ])
    expect(wrapper.text()).toContain('周一番')
    expect(wrapper.text()).toContain('未排期番')
    expect(wrapper.text()).toContain('未排期 1 部')
  })

  it('+1 / -1 按钮调用 API，并在刷新后同步选中项集数', async () => {
    let episode = '1'
    watchingApi.getAll.mockImplementation(async () =>
      ok([watchingItem({ id: 1, current_episode: episode })])
    )
    remainingApi.getAll.mockResolvedValue(ok([]))
    watchingApi.increment.mockImplementation(async () => {
      episode = '2'
      return actionOk({ current_episode: episode })
    })
    watchingApi.decrement.mockImplementation(async () => {
      episode = '1'
      return actionOk({ current_episode: episode })
    })

    const wrapper = mount(WatchingView, mountOptions)
    await flushPromises()
    const card = cardByName(wrapper, '番剧A')
    await card.find('button[title="+1集"]').trigger('click')
    await flushPromises()
    expect(watchingApi.increment).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toMatch(/当前选中:[\s\S]*e2/)
    expect(card.text()).toContain('2')

    await card.find('button[title="-1集"]').trigger('click')
    await flushPromises()
    expect(watchingApi.decrement).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toMatch(/当前选中:[\s\S]*e1/)
  })

  it('双击集数内联编辑会规范化并更新本地卡片', async () => {
    watchingApi.update.mockResolvedValue(actionOk())
    const wrapper = await mountWatching([watchingItem({ current_episode: '1' })])
    const card = cardByName(wrapper, '番剧A')
    const episodeCell = card.findAll('.editable-cell')[1]
    await episodeCell.trigger('dblclick')
    const input = card.find('input.inline-edit-input')
    await input.setValue('005')
    await input.trigger('keyup.enter')
    await flushPromises()

    expect(watchingApi.update).toHaveBeenCalledWith(1, { current_episode: '005' })
    expect(card.text()).toContain('005')
  })

  it('新增时自动分离 URL 的 ? 查询参数，并保留补零集数', async () => {
    watchingApi.add.mockResolvedValue(actionOk())
    const wrapper = await mountWatching([])
    await buttonByText(wrapper, '添加番剧').trigger('click')
    const dialog = wrapper.find('.app-dialog')
    await dialog.find('input[placeholder="请输入番剧名称"]').setValue('新番')
    await dialog.find('select').setValue('周三')
    await dialog.find('input[placeholder^="如: 0"]').setValue('01')
    await dialog.find('input[placeholder^="如: https://"]').setValue('https://example.com/path?foo=1&bar=2')
    await nextTick()

    // URL 处理逻辑与文案无关，用 ref/顺序定位更稳（文案已 i18n 化）
    const urlInput = dialog.find('input[ref="urlParamsInput"]')
    const paramsInput = wrapper.findAll('input').find((i) => i.element.value === 'foo=1&bar=2')
    expect(paramsInput, 'URL 参数应被分离到动态参数框').toBeTruthy()

    await buttonByExactText(dialog, '保存').trigger('click')
    await flushPromises()
    expect(watchingApi.add).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '新番',
        day_of_week: '周三',
        current_episode: '01',
        url: 'https://example.com/path',
        url_params: 'foo=1&bar=2',
      })
    )
  })

  it('移至已看默认日期为今天，并传递当前选中 id', async () => {
    watchingApi.moveToWatched.mockResolvedValue(actionOk())
    const wrapper = await mountWatching([watchingItem()])
    await cardByName(wrapper, '番剧A').trigger('click')
    await buttonByText(wrapper, '移至已看').trigger('click')
    const dialog = wrapper.find('.app-dialog')
    const dateInput = dialog.find('input[type="date"]')
    expect(dateInput.element.value).toBe(todayStr().replace(/\//g, '-'))

    await buttonByExactText(dialog, '确定').trigger('click')
    await flushPromises()
    expect(watchingApi.moveToWatched).toHaveBeenCalledWith(1, todayStr())
  })

  it('批量选择后可以批量删除选中项', async () => {
    batchApi.batchDeleteWatching.mockResolvedValue(actionOk())
    const wrapper = await mountWatching([
      watchingItem({ id: 1, name: '番剧A' }),
      watchingItem({ id: 2, name: '番剧B' }),
    ])
    await buttonByText(wrapper, '批量选择').trigger('click')
    await cardByName(wrapper, '番剧B').trigger('click')
    expect(wrapper.text()).toContain('批量删除 (1)')
    await buttonByText(wrapper, '批量删除').trigger('click')
    await buttonByExactText(wrapper, '确认删除').trigger('click')
    await flushPromises()
    expect(batchApi.batchDeleteWatching).toHaveBeenCalledWith([2])
  })
})

describe('WatchingView 缺陷复现（it.fails 保留）', () => {
  it('中键点击无链接卡片应搜索 bgm.tv（当前 defaultBgmUrl 未定义）', async () => {
    const wrapper = await mountWatching([watchingItem({ name: '无链接番', url: '' })])
    await cardByName(wrapper, '无链接番').trigger('mousedown', { button: 1 })
    expect(window.open).toHaveBeenCalledWith(
      'https://bgm.tv/subject_search/' + encodeURIComponent('无链接番'),
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('本月等番横幅只统计本月（当前把历史月份全部算入）', async () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const wrapper = await mountWatching([], [
      remainingItem({ id: 1, name: '历史等番', expected_date: `${year - 1}/01` }),
      remainingItem({ id: 2, name: '本月等番', expected_date: `${year}/${month}/05` }),
      remainingItem({ id: 3, name: '未来等番', expected_date: `${year + 1}/01` }),
    ])
    expect(wrapper.text()).toContain('本月有 1 部等番即将更新')
  })

  it('新增记录触发 fetchData 后 selected 应重新绑定到新数组对象', async () => {
    const rows = [watchingItem({ id: 1, name: '番剧A', current_episode: '1' })]
    watchingApi.getAll.mockImplementation(async () => ok(clone(rows)))
    remainingApi.getAll.mockResolvedValue(ok([]))
    watchingApi.add.mockImplementation(async (data) => {
      rows.push(watchingItem({ id: 2, name: data.name, current_episode: '0' }))
      return actionOk()
    })
    watchingApi.update.mockResolvedValue(actionOk())

    const wrapper = mount(WatchingView, mountOptions)
    await flushPromises()
    await buttonByText(wrapper, '添加番剧').trigger('click')
    const dialog = wrapper.find('.app-dialog')
    await dialog.find('input[placeholder="请输入番剧名称"]').setValue('番剧B')
    await buttonByExactText(dialog, '保存').trigger('click')
    await flushPromises()

    // 新增后自动选中新番剧（更顺手的交互）；再手动切回 A 验证重绑定
    await cardByName(wrapper, '番剧A').trigger('click')
    const card = cardByName(wrapper, '番剧A')
    await card.findAll('.editable-cell')[1].trigger('dblclick')
    const input = card.find('input.inline-edit-input')
    await input.setValue('5')
    await input.trigger('keyup.enter')
    await flushPromises()

    const selectedHint = wrapper.findAll('div').find((el) => el.text().trim().startsWith('当前选中:'))
    expect(selectedHint.text()).toMatch(/e5/)

    // 新增后应默认选中刚添加的番剧，让用户能立刻 +1 集
    const rowsAfterAdd = await wrapper.findAll('.watching-card')
    expect(rowsAfterAdd.length).toBe(2)
  })
})

describe('WatchingView 并发 / 重复提交（it.fails 保留）', () => {
  it('旧字段保存返回时不应关闭另一个刚开始编辑的字段', async () => {
    let resolveUpdate
    const pending = new Promise((resolve) => { resolveUpdate = resolve })
    watchingApi.update.mockReturnValue(pending)
    const wrapper = await mountWatching([watchingItem({ name: '番剧A', current_episode: '1' })])
    const card = cardByName(wrapper, '番剧A')
    const nameCell = card.findAll('.editable-cell')[0]
    await nameCell.trigger('dblclick')
    const nameInput = card.find('input.inline-edit-input')
    await nameInput.setValue('番剧A改')
    await nameInput.trigger('keyup.enter')

    await card.findAll('.editable-cell')[1].trigger('dblclick')
    expect(card.find('input.inline-edit-input').exists()).toBe(true)
    resolveUpdate(actionOk())
    await flushPromises()
    expect(card.find('input.inline-edit-input').exists()).toBe(true)
  })

  it('双击保存按钮只应发送一次新增请求', async () => {
    let resolveAdd
    const pending = new Promise((resolve) => { resolveAdd = resolve })
    watchingApi.add.mockReturnValue(pending)
    const wrapper = await mountWatching([])
    await buttonByText(wrapper, '添加番剧').trigger('click')
    const dialog = wrapper.find('.app-dialog')
    await dialog.find('input[placeholder="请输入番剧名称"]').setValue('重复番')
    const save = buttonByExactText(dialog, '保存')
    try {
      await save.trigger('click')
      await save.trigger('click')
      expect(watchingApi.add).toHaveBeenCalledTimes(1)
    } finally {
      resolveAdd(actionOk())
      await flushPromises()
    }
  })

  it('手动输入的非法时间 25:99 应被拒绝', async () => {
    watchingApi.moveToWatched.mockResolvedValue(actionOk())
    const wrapper = await mountWatching([watchingItem()])
    await cardByName(wrapper, '番剧A').trigger('click')
    await buttonByText(wrapper, '移至已看').trigger('click')
    const dialog = wrapper.find('.app-dialog')
    await buttonByExactText(dialog, '时钟选择').trigger('click')
    await dialog.find('input[placeholder="HH:mm"]').setValue('25:99')
    await buttonByExactText(dialog, '确定').trigger('click')
    await flushPromises()
    expect(watchingApi.moveToWatched).not.toHaveBeenCalled()
  })
})

describe('RemainingView 搜索 / 分页 / 迁移 / 新增', () => {
  it('搜索按番剧名称实时过滤', async () => {
    const wrapper = await mountRemaining([
      remainingItem({ id: 1, name: 'Alpha', expected_date: '2026/11' }),
      remainingItem({ id: 2, name: 'Beta', expected_date: '2026/12' }),
      remainingItem({ id: 3, name: 'Gamma', expected_date: '2027/01' }),
    ])
    await wrapper.find('input[placeholder="搜索番剧名称..."]').setValue('beta')
    await nextTick()
    expect(tableRows(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('Beta')
    expect(wrapper.text()).not.toContain('Alpha')
  })

  it('空列表显示空状态且不渲染分页', async () => {
    const wrapper = await mountRemaining([])
    expect(wrapper.text()).toContain('暂无等番记录')
    expect(wrapper.text()).not.toContain('每页')
  })

  it('删除最后一页唯一记录后回到第一页并展示剩余记录', async () => {
    let rows = Array.from({ length: 21 }, (_, index) =>
      remainingItem({
        id: index + 1,
        name: `等番${index + 1}`,
        expected_date: `2026/01/${String(index + 1).padStart(2, '0')}`,
      })
    )
    remainingApi.getAll.mockImplementation(async () => ok(clone(rows)))
    remainingApi.delete.mockImplementation(async (id) => {
      rows = rows.filter((row) => row.id !== id)
      return actionOk()
    })
    const wrapper = mount(RemainingView, mountOptions)
    await flushPromises()
    expect(tableRows(wrapper)).toHaveLength(20)

    await buttonByExactText(wrapper, '下一页').trigger('click')
    await nextTick()
    expect(tableRows(wrapper)).toHaveLength(1)
    await tableRows(wrapper)[0].trigger('click')
    await buttonByText(wrapper, '删除').trigger('click')
    await buttonByExactText(wrapper, '确认删除').trigger('click')
    await flushPromises()

    expect(remainingApi.delete).toHaveBeenCalledWith(21)
    expect(tableRows(wrapper)).toHaveLength(20)
    expect(wrapper.text()).toContain('共 20 条')
    expect(buttonByExactText(wrapper, '上一页').attributes('disabled')).toBeDefined()
  })

  it('移至追番会传递选择的星期和时间', async () => {
    remainingApi.moveToWatching.mockResolvedValue(actionOk())
    const wrapper = await mountRemaining([remainingItem({ id: 7, name: '迁移番' })])
    await tableRows(wrapper)[0].trigger('click')
    await buttonByText(wrapper, '移至追番').trigger('click')
    const dialog = wrapper.find('.app-dialog')
    await dialog.find('select').setValue('周五')
    await dialog.find('input[placeholder="23:00"]').setValue('23:30')
    await buttonByExactText(dialog, '确定').trigger('click')
    await flushPromises()

    expect(remainingApi.moveToWatching).toHaveBeenCalledWith(7, {
      day_of_week: '周五',
      time_slot: '23:30',
    })
  })

  it('新增等番默认预计日期为今天', async () => {
    remainingApi.add.mockResolvedValue(actionOk())
    const wrapper = await mountRemaining([])
    await buttonByText(wrapper, '添加等番').trigger('click')
    const dialog = wrapper.find('.app-dialog')
    expect(dialog.find('input[type="date"]').element.value).toBe(todayStr().replace(/\//g, '-'))
    await dialog.find('input[placeholder="请输入番剧名称"]').setValue('新等番')
    await buttonByExactText(dialog, '保存').trigger('click')
    await flushPromises()
    expect(remainingApi.add).toHaveBeenCalledWith(expect.objectContaining({
      name: '新等番',
      expected_date: todayStr(),
    }))
  })
})

describe('RemainingView 批量选择 / 分页边界缺陷', () => {
  const makeRows = (count) => Array.from({ length: count }, (_, index) =>
    remainingItem({
      id: index + 1,
      name: `Item ${index + 1}`,
      expected_date: `2026/${String((index % 9) + 1).padStart(2, '0')}/01`,
    })
  )

  it('批量选择跨页后 isAllChecked 应只判断当前页（当前为长度比较）', async () => {
    const wrapper = await mountRemaining(makeRows(25))
    await buttonByText(wrapper, '批量选择').trigger('click')
    await buttonByText(wrapper, '每页 20 条').trigger('click')
    // 页大小选项文案与当前页按钮同源（tt('remaining.perPage')）
    await wrapper.findAll('button').find((b) => b.text().trim() === '每页 10 条').trigger('click')
    await nextTick()
    await wrapper.find('thead th').trigger('click')
    expect(buttonByExactText(wrapper, '取消全选')).toBeTruthy()

    await buttonByExactText(wrapper, '下一页').trigger('click')
    await nextTick()
    expect(buttonByExactText(wrapper, '全选')).toBeTruthy()
  })

  it('缺陷证据：搜索后隐藏页的选择仍会被批量删除', async () => {
    batchApi.batchDeleteRemaining.mockResolvedValue(actionOk())
    const wrapper = await mountRemaining(makeRows(25))
    await buttonByText(wrapper, '批量选择').trigger('click')
    await tableRows(wrapper)[0].trigger('click')
    await wrapper.find('input[placeholder="搜索番剧名称..."]').setValue('Item 25')
    await nextTick()
    expect(tableRows(wrapper)).toHaveLength(1)
    await tableRows(wrapper)[0].trigger('click')
    expect(wrapper.text()).toContain('已选择 2 项')
    await buttonByText(wrapper, '批量删除').trigger('click')
    await buttonByExactText(wrapper, '确认删除').trigger('click')
    await flushPromises()
    expect(batchApi.batchDeleteRemaining).toHaveBeenCalledWith([1, 25])
  })
})

describe('RemainingView 排序缺陷', () => {
  it('预计日期升序时空日期应排在最后', async () => {
    const wrapper = await mountRemaining([
      remainingItem({ id: 1, name: '无日期', expected_date: '' }),
      remainingItem({ id: 2, name: '有日期', expected_date: '2026/12/01' }),
    ])
    expect(tableRows(wrapper)[0].text()).toContain('有日期')
  })

  it('非补零日期 2025/7 应排在 2025/10 之前', async () => {
    const wrapper = await mountRemaining([
      remainingItem({ id: 1, name: '十月', expected_date: '2025/10' }),
      remainingItem({ id: 2, name: '七月', expected_date: '2025/7' }),
    ])
    expect(tableRows(wrapper)[0].text()).toContain('七月')
  })
})

describe('RemainingView 链接缺陷 / 并发', () => {
  it('中键点击表格行应打开链接（当前 openItemLink 未定义）', async () => {
    const wrapper = await mountRemaining([
      remainingItem({ id: 1, name: '链接番', url: 'https://example.com/anime' }),
    ])
    await tableRows(wrapper)[0].trigger('mousedown', { button: 1 })
    expect(window.open).toHaveBeenCalledWith('https://example.com/anime', '_blank', 'noopener,noreferrer')
  })

  it('等番没有集数，{集数} 占位符原样保留而不是静默填 0', async () => {
    const wrapper = await mountRemaining([
      remainingItem({
        id: 1,
        name: '占位符番',
        url: 'https://search.example.com/',
        url_params: 'keyword={集数}',
      }),
    ])
    expect(tableRows(wrapper)[0].find('a').attributes('href')).toContain('keyword={集数}')
  })

  it('旧字段保存返回时不应关闭另一个刚开始编辑的字段', async () => {
    let resolveUpdate
    const pending = new Promise((resolve) => { resolveUpdate = resolve })
    remainingApi.update.mockReturnValue(pending)
    const wrapper = await mountRemaining([remainingItem({ id: 1, name: '等番A' })])
    const row = tableRows(wrapper)[0]
    await row.findAll('td')[0].trigger('dblclick')
    const nameInput = row.find('input.inline-edit-input')
    await nameInput.setValue('等番A改')
    await nameInput.trigger('keyup.enter')

    await row.findAll('td')[1].trigger('dblclick')
    expect(row.find('input.inline-edit-input').exists()).toBe(true)
    resolveUpdate(actionOk())
    await flushPromises()
    expect(row.find('input.inline-edit-input').exists()).toBe(true)
  })
})

describe('useEpisode 纯函数缺陷', () => {
  it('负数集数应归零而不是原样保存', () => {
    expect(normalizeEpisodeInput('-2')).toBe('0')
  })

  it('常规 URL 参数拼接保留 {集数} 原样补零值', () => {
    expect(buildItemUrl({
      url: 'https://example.com/video',
      url_params: 'p={集数}',
      current_episode: '01',
    })).toBe('https://example.com/video?p=01')
    // 参数里含中文时，**打开链接这一步**必须做 URL 编码（否则浏览器/服务端解析失败）；
    // 存储层保留可读文字，编码只发生在 buildItemUrl。
    expect(buildItemUrl({
      url: 'https://example.com/search?page=1',
      url_params: 'keyword=测试',
      current_episode: '2',
    })).toBe('https://example.com/search?page=1&keyword=%E6%B5%8B%E8%AF%95')
  })

  it('动态参数值中的 # 应被编码，不能截断查询串', () => {
    expect(buildItemUrl({
      url: 'https://example.com/search',
      url_params: 'keyword=C#',
      current_episode: '1',
    })).toContain('C%23')
  })
})
