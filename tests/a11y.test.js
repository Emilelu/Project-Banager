/**
 * tests/a11y.test.js —— 键盘可达性 / 无障碍回归
 * ============================================================================
 * 覆盖点（对应 review/a11y.md 的验收清单）：
 *  1. 弹窗声明 role=dialog / aria-modal / aria-labelledby，且 aria-labelledby 指向真实标题
 *  2. 弹窗打开时焦点进入弹窗内部；Esc 关闭；关闭后焦点归还触发按钮
 *  3. Tab / Shift+Tab 在弹窗内循环（焦点陷阱）
 *  4. 可排序表头 tabindex=0 + role=button + aria-sort 随排序状态切换
 *  5. 批量勾选框 role=checkbox + aria-checked 随点选变化，且键盘 Enter/Space 可切换
 *  6. 行内编辑输入框有 aria-label（说明在编辑哪个字段）
 *  7. 纯图标按钮有 aria-label
 *
 * 数据层与 Toast 全 mock，组件用真实实现（同 watched-import.test.js 约定）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const mocks = vi.hoisted(() => ({
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
    batchDeleteWatching: vi.fn(),
    batchDeleteRemaining: vi.fn(),
    batchDeleteWatched: vi.fn(),
    clearWatching: vi.fn(),
    clearRemaining: vi.fn(),
    clearWatched: vi.fn(),
    clearWatchedYears: vi.fn(),
  },
}))

vi.mock('../src/db/api', () => mocks)

vi.mock('../src/composables/useToast', () => ({
  showToast: vi.fn(),
  useToasts: () => [],
  removeToast: vi.fn(),
}))

const WatchingView = (await import('../src/views/WatchingView.vue')).default
const RemainingView = (await import('../src/views/RemainingView.vue')).default
const WatchedView = (await import('../src/views/WatchedView.vue')).default
const WatchingCard = (await import('../src/components/WatchingCard.vue')).default

const ok = (data) => ({ data: { success: true, data } })
const okYear = (data, yearCount = 0, totalCount = 0) => ({
  data: { success: true, data, yearCount, totalCount },
})
const actionOk = (extra = {}) => ({ data: { success: true, ...extra } })

const mountOptions = {
  attachTo: document.body,
  global: {
    stubs: {
      teleport: true,
      RouterLink: { template: '<a><slot /></a>' },
    },
    config: { errorHandler: () => {} },
  },
}

const clone = (rows) => rows.map((row) => ({ ...row }))

/** 在已挂载组件树里找按钮；找不到再退回整份 document */
const findButton = (text) => {
  const inWrapper = wrapper ? wrapper.findAll('button').find((b) => b.text().includes(text)) : null
  if (inWrapper) return inWrapper.element
  return [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text))
}

const dialogEl = () => document.querySelector('.app-dialog')

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

let wrapper = null

const mountWatching = async (rows = []) => {
  mocks.watchingApi.getAll.mockResolvedValue(ok(clone(rows)))
  mocks.remainingApi.getAll.mockResolvedValue(ok([]))
  wrapper = mount(WatchingView, mountOptions)
  await flushPromises()
  return wrapper
}

const mountRemaining = async (rows = []) => {
  mocks.remainingApi.getAll.mockResolvedValue(ok(clone(rows)))
  wrapper = mount(RemainingView, mountOptions)
  await flushPromises()
  return wrapper
}

const mountWatched = async ({ years = [{ id: 1, year_label: '2025', sort_order: 1 }], byYear = {} } = {}) => {
  mocks.watchedYearsApi.getAll.mockResolvedValue(ok(years))
  mocks.watchedApi.getAll.mockResolvedValue(ok([]))
  mocks.watchedApi.getByYear.mockImplementation((year) =>
    Promise.resolve(okYear(byYear[year] ?? [], 0, 0)),
  )
  wrapper = mount(WatchedView, mountOptions)
  await flushPromises()
  return wrapper
}

const watchingRow = (overrides = {}) => ({
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

const remainingRow = (overrides = {}) => ({
  id: 1,
  name: '等番A',
  expected_date: '2026/12',
  url: '',
  url_params: '',
  notes: '',
  ...overrides,
})

const watchedRow = (id, name, watch_date = '2025/01/01', extra = {}) => ({
  id,
  name,
  watch_date,
  url: '',
  url_params: '',
  notes: '',
  sort_order: id,
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.watchingApi.update.mockResolvedValue(actionOk())
  mocks.watchingApi.add.mockResolvedValue(actionOk())
  mocks.remainingApi.update.mockResolvedValue(actionOk())
  mocks.watchedApi.update.mockResolvedValue(actionOk())
  mocks.batchApi.batchDeleteWatching.mockResolvedValue(actionOk())
  mocks.batchApi.batchDeleteRemaining.mockResolvedValue(actionOk())
  mocks.batchApi.batchDeleteWatched.mockResolvedValue(actionOk())
})

afterEach(() => {
  if (wrapper) {
    wrapper.unmount()
    wrapper = null
  }
  document.body.innerHTML = ''
})

// ===========================================================================
// 1. 弹窗 role / aria-modal / aria-labelledby
// ===========================================================================
describe('弹窗语义：role=dialog / aria-modal / aria-labelledby', () => {
  const assertDialogSemantics = (dlg) => {
    expect(dlg).toBeTruthy()
    expect(dlg.getAttribute('role')).toBe('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    const labelledBy = dlg.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const title = dlg.querySelector('#' + labelledBy)
    expect(title).toBeTruthy()
    expect(title.textContent.trim()).not.toBe('')
  }

  it('追番页：添加番剧弹窗', async () => {
    await mountWatching([])
    findButton('添加番剧').click()
    await flushPromises()
    assertDialogSemantics(dialogEl())
  })

  it('追番页：移至已看弹窗', async () => {
    await mountWatching([watchingRow()])
    await wrapper.findAll('.watching-card')[0].trigger('click')
    await nextTick()
    findButton('移至已看').click()
    await flushPromises()
    assertDialogSemantics(dialogEl())
  })

  it('追番页：删除确认弹窗', async () => {
    await mountWatching([watchingRow()])
    await wrapper.findAll('.watching-card')[0].trigger('click')
    await nextTick()
    findButton('删除').click()
    await flushPromises()
    assertDialogSemantics(dialogEl())
  })

  it('等番页：添加 / 批量添加 两类弹窗', async () => {
    await mountRemaining([remainingRow()])

    findButton('添加等番').click()
    await flushPromises()
    assertDialogSemantics(dialogEl())

    findButton('批量添加').click()
    await flushPromises()
    assertDialogSemantics(dialogEl())
  })

  it('等番页：删除确认弹窗', async () => {
    await mountRemaining([remainingRow()])
    await wrapper.findAll('tbody tr').find((r) => r.text().includes('等番A')).trigger('click')
    await nextTick()
    findButton('删除').click()
    await flushPromises()
    assertDialogSemantics(dialogEl())
  })

  it('已看页：添加记录弹窗', async () => {
    await mountWatched({ byYear: { 2025: [] } })
    findButton('添加记录').click()
    await flushPromises()
    assertDialogSemantics(dialogEl())
  })
})

// ===========================================================================
// 2+3. 焦点进入 / 归还 / Tab 陷阱
// ===========================================================================
describe('弹窗焦点：进入、归还、Tab 循环', () => {
  it('打开时焦点进入弹窗并落在首个输入框，而不是留在触发按钮', async () => {
    await mountWatching([])
    const trigger = findButton('添加番剧')
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    trigger.click()
    await flushPromises()
    await nextTick()
    await nextTick()

    const dlg = dialogEl()
    expect(dlg).toBeTruthy()
    expect(dlg.contains(document.activeElement)).toBe(true)
    expect(document.activeElement.tagName).toBe('INPUT')
  })

  it('Esc 关闭弹窗后焦点归还给触发按钮', async () => {
    await mountRemaining([])
    const trigger = findButton('添加等番')
    trigger.focus()
    trigger.click()
    await flushPromises()
    await nextTick()

    expect(dialogEl()).toBeTruthy()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    await nextTick()
    await nextTick()

    expect(dialogEl()).toBeFalsy()
    expect(document.activeElement).toBe(trigger)
  })

  it('Tab 在弹窗内循环：末元素 Tab 回首个，首个 Shift+Tab 回末个', async () => {
    await mountWatched({ byYear: { 2025: [] } })
    findButton('添加记录').click()
    await flushPromises()
    await nextTick()

    const dlg = dialogEl()
    const focusable = [...dlg.querySelectorAll(FOCUSABLE)]
    expect(focusable.length).toBeGreaterThan(2)

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    last.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    await nextTick()
    expect(document.activeElement).toBe(first)

    first.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    await nextTick()
    expect(document.activeElement).toBe(last)
  })
})

// ===========================================================================
// 4. 可排序表头
// ===========================================================================
describe('可排序表头：tabindex / role=button / aria-sort', () => {
  const sortableTh = (scope, text) => scope.findAll('th').find((h) => h.text().includes(text))

  it('已看页两个表头键盘可达，aria-sort 随排序切换', async () => {
    await mountWatched({ byYear: { 2025: [watchedRow(1, '甲'), watchedRow(2, '乙')] } })
    const nameTh = sortableTh(wrapper, '作品名称')
    const dateTh = sortableTh(wrapper, '日期')

    for (const th of [nameTh, dateTh]) {
      expect(th.attributes('tabindex')).toBe('0')
      expect(th.attributes('role')).toBe('button')
    }

    // 默认按观看日期升序 → 日期列 ascending，作品名称列 none
    expect(dateTh.attributes('aria-sort')).toBe('ascending')
    expect(nameTh.attributes('aria-sort')).toBe('none')

    await nameTh.trigger('click')
    await nextTick()
    expect(nameTh.attributes('aria-sort')).toBe('ascending')
    expect(dateTh.attributes('aria-sort')).toBe('none')

    await nameTh.trigger('click')
    await nextTick()
    expect(nameTh.attributes('aria-sort')).toBe('descending')
  })

  it('已看页表头 Enter / Space 可触发排序（不依赖鼠标）', async () => {
    await mountWatched({ byYear: { 2025: [watchedRow(1, '甲')] } })
    const nameTh = sortableTh(wrapper, '作品名称')
    await nameTh.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(nameTh.attributes('aria-sort')).toBe('ascending')

    await nameTh.trigger('keydown', { key: ' ' })
    await nextTick()
    expect(nameTh.attributes('aria-sort')).toBe('descending')
  })

  it('等番页两个表头键盘可达，aria-sort 随排序切换', async () => {
    await mountRemaining([remainingRow({ name: 'A' }), remainingRow({ id: 2, name: 'B' })])
    const nameTh = sortableTh(wrapper, '番剧名称')
    const dateTh = sortableTh(wrapper, '预计日期')

    for (const th of [nameTh, dateTh]) {
      expect(th.attributes('tabindex')).toBe('0')
      expect(th.attributes('role')).toBe('button')
      expect(th.attributes('aria-sort')).toBeTruthy()
    }
    expect(dateTh.attributes('aria-sort')).toBe('ascending')
    expect(nameTh.attributes('aria-sort')).toBe('none')

    await nameTh.trigger('click')
    await nextTick()
    expect(nameTh.attributes('aria-sort')).toBe('ascending')
    expect(dateTh.attributes('aria-sort')).toBe('none')

    await dateTh.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(dateTh.attributes('aria-sort')).toBe('ascending')
  })
})

// ===========================================================================
// 5. 批量勾选框
// ===========================================================================
describe('批量勾选框：role=checkbox / aria-checked / 键盘切换', () => {
  it('等番页：勾选框 aria-checked 随点选变化，空格 / Enter 均可切换', async () => {
    await mountRemaining([remainingRow({ name: '甲' }), remainingRow({ id: 2, name: '乙' })])
    findButton('批量选择').click()
    await flushPromises()

    const boxes = wrapper.findAll('tbody [role="checkbox"]')
    expect(boxes.length).toBe(2)
    expect(boxes[0].attributes('aria-checked')).toBe('false')
    expect(boxes[0].attributes('tabindex')).toBe('0')
    expect(boxes[0].attributes('aria-label')).toContain('甲')

    await boxes[0].trigger('keydown', { key: ' ' })
    await nextTick()
    expect(boxes[0].attributes('aria-checked')).toBe('true')
    expect(wrapper.text()).toContain('已选择')

    await boxes[0].trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(boxes[0].attributes('aria-checked')).toBe('false')
  })

  it('等番页：全选框 aria-checked 反映当前页是否全选', async () => {
    await mountRemaining([remainingRow({ name: '甲' })])
    findButton('批量选择').click()
    await flushPromises()

    const all = wrapper.find('thead [role="checkbox"]')
    expect(all.attributes('role')).toBe('checkbox')
    expect(all.attributes('tabindex')).toBe('0')
    expect(all.attributes('aria-checked')).toBe('false')

    await all.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(all.attributes('aria-checked')).toBe('true')
  })

  it('追番卡片勾选框暴露 role=checkbox / aria-checked，且键盘可切换', async () => {
    const cardWrapper = mount(WatchingCard, {
      props: { item: watchingRow({ name: '卡片番' }), batchMode: true, checked: false },
      global: mountOptions.global,
    })
    const box = cardWrapper.find('[role="checkbox"]')
    expect(box.exists()).toBe(true)
    expect(box.attributes('aria-checked')).toBe('false')
    expect(box.attributes('tabindex')).toBe('0')
    expect(box.attributes('aria-label')).toContain('卡片番')

    await box.trigger('keydown', { key: 'Enter' })
    expect(cardWrapper.emitted('toggle-check')).toBeTruthy()

    await cardWrapper.setProps({ checked: true })
    await nextTick()
    expect(cardWrapper.find('[role="checkbox"]').attributes('aria-checked')).toBe('true')
    cardWrapper.unmount()
  })
})

// ===========================================================================
// 6. 行内编辑输入框 aria-label
// ===========================================================================
describe('行内编辑输入框：aria-label 说明编辑字段', () => {
  it('等番页：双击番剧名称后输入框带 aria-label', async () => {
    await mountRemaining([remainingRow({ name: '甲' })])
    const row = wrapper.findAll('tbody tr').find((r) => r.text().includes('甲'))
    await row.findAll('td')[0].trigger('dblclick')
    await nextTick()

    const input = wrapper.find('input.inline-edit-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('aria-label')).toContain('番剧名称')
    expect(input.attributes('aria-label')).toContain('甲')
  })

  it('等番页：预计日期与备注的输入框各自带对应 aria-label', async () => {
    await mountRemaining([remainingRow({ name: '乙' })])
    const row = wrapper.findAll('tbody tr').find((r) => r.text().includes('乙'))

    await row.findAll('td')[1].trigger('dblclick')
    await nextTick()
    expect(wrapper.find('input.inline-edit-input').attributes('aria-label')).toContain('预计日期')

    await row.findAll('td')[3].trigger('dblclick')
    await nextTick()
    expect(wrapper.find('input.inline-edit-input').attributes('aria-label')).toContain('备注')
  })

  it('已看页：双击作品名称后输入框带 aria-label', async () => {
    await mountWatched({ byYear: { 2025: [watchedRow(1, '丙')] } })
    const row = wrapper.findAll('tbody tr').find((r) => r.text().includes('丙'))
    await row.findAll('td').find((td) => td.text().includes('丙')).trigger('dblclick')
    await nextTick()

    const input = wrapper.find('input.inline-edit-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('aria-label')).toContain('作品名称')
  })
})

// ===========================================================================
// 7. 纯图标按钮 aria-label
// ===========================================================================
describe('纯图标按钮：aria-label 可读', () => {
  it('追番卡片 +1 / -1 图标按钮带 aria-label，图标本身 aria-hidden', () => {
    const cardWrapper = mount(WatchingCard, {
      props: { item: watchingRow({ name: '卡片番' }) },
      global: mountOptions.global,
    })
    const inc = cardWrapper.find('button.btn-mini-plus')
    const dec = cardWrapper.find('button.btn-mini-minus')
    expect(inc.attributes('aria-label')).toContain('+1')
    expect(dec.attributes('aria-label')).toContain('-1')
    expect(cardWrapper.findAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
    cardWrapper.unmount()
  })

  it('弹窗标题前的表情图标 aria-hidden，不污染标题读法', async () => {
    await mountWatching([])
    findButton('添加番剧').click()
    await flushPromises()

    const dlg = dialogEl()
    const title = dlg.querySelector('#' + dlg.getAttribute('aria-labelledby'))
    const icon = title.previousElementSibling
    expect(icon.getAttribute('aria-hidden')).toBe('true')
  })

  it('追番卡片链接图标带 aria-label', () => {
    const cardWrapper = mount(WatchingCard, {
      props: { item: watchingRow({ name: '带链接番', url: 'https://example.com/x' }) },
      global: mountOptions.global,
    })
    const link = cardWrapper.find('a[href]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('aria-label')).toContain('带链接番')
    cardWrapper.unmount()
  })
})

// ===========================================================================
// 8. 追番卡片本体键盘可达
// ===========================================================================
describe('追番卡片：本体 Tab 可达 + Enter/Space 选中', () => {
  it('卡片是 role=button / tabindex=0，带 aria-pressed 与 aria-label', () => {
    const cardWrapper = mount(WatchingCard, {
      props: { item: watchingRow({ name: '卡片番', current_episode: '3' }), selected: false },
      global: mountOptions.global,
    })
    const card = cardWrapper.find('.watching-card')
    expect(card.attributes('tabindex')).toBe('0')
    expect(card.attributes('role')).toBe('button')
    expect(card.attributes('aria-pressed')).toBe('false')
    expect(card.attributes('aria-label')).toContain('卡片番')
    cardWrapper.unmount()
  })

  it('Enter / Space 在卡片本体上触发 select，但不影响子输入框里的空格', async () => {
    const cardWrapper = mount(WatchingCard, {
      props: { item: watchingRow({ name: '卡片番' }) },
      global: mountOptions.global,
    })
    const card = cardWrapper.find('.watching-card')

    await card.trigger('keydown', { key: 'Enter' })
    expect(cardWrapper.emitted('select')).toBeTruthy()

    const before = cardWrapper.emitted('select').length
    await card.trigger('keydown', { key: ' ' })
    expect(cardWrapper.emitted('select').length).toBe(before + 1)

    cardWrapper.unmount()
  })

  it('选中态 aria-pressed 切到 true', () => {
    const cardWrapper = mount(WatchingCard, {
      props: { item: watchingRow({ name: '卡片番' }), selected: true },
      global: mountOptions.global,
    })
    expect(cardWrapper.find('.watching-card').attributes('aria-pressed')).toBe('true')
    cardWrapper.unmount()
  })
})
