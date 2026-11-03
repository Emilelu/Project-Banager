/**
 * 「等待更新」排序测试
 * 锁定：默认按预计日期升序、拖动切换为手动排序并持久化 sort_order、
 *       手动模式下点表头可切回字段排序、批量/搜索时禁用拖动。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { mountTopbarControls } from './helpers/topbarControls'
import RemainingView from '../src/views/RemainingView.vue'

vi.mock('../src/db/api', () => {
  const ok = (data) => ({ data: { success: true, data } })
  return {
    remainingApi: {
      getAll: vi.fn(async () => ok([])),
      add: vi.fn(async () => ({ data: { success: true } })),
      update: vi.fn(async () => ({ data: { success: true } })),
      delete: vi.fn(async () => ({ data: { success: true } })),
      moveToWatching: vi.fn(async () => ({ data: { success: true } })),
    },
    batchApi: {
      batchDeleteRemaining: vi.fn(async () => ({ data: { success: true, deleted: 0 } })),
      clearRemaining: vi.fn(async () => ({ data: { success: true } })),
    },
  }
})

vi.mock('../src/composables/useToast', () => ({
  showToast: vi.fn(),
  useToasts: () => [],
}))

const makeItem = (id, name, date, sortOrder = id) => ({
  id, name, expected_date: date, url: '', url_params: '', notes: '', sort_order: sortOrder,
})

const mountView = async (rows = []) => {
  const { remainingApi } = await import('../src/db/api')
  remainingApi.getAll.mockResolvedValue({ data: { success: true, data: rows } })
  const wrapper = mount(RemainingView, {
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

const rowNames = (wrapper) => wrapper.findAll('tbody tr').map(tr => tr.text())

// jsdom 没有 DataTransfer；组件会访问 e.dataTransfer.effectAllowed / setData
const fakeDataTransfer = () => ({
  effectAllowed: '',
  dropEffect: '',
  setData: () => {},
  getData: () => '',
})

describe('等待更新：默认排序', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('remaining_sort_field', 'expected_date')
    localStorage.setItem('remaining_sort_order', 'asc')
    localStorage.setItem('remaining_sort_default_migrated', '1')
  })

  it('默认按预计日期升序展示', async () => {
    const wrapper = await mountView([
      makeItem(1, 'B番', '2026/12'),
      makeItem(2, 'A番', '2026/03'),
      makeItem(3, 'C番', '2026/07'),
    ])
    const names = rowNames(wrapper)
    expect(names[0]).toContain('A番')
    expect(names[1]).toContain('C番')
    expect(names[2]).toContain('B番')
  })

  it('空日期排在最后', async () => {
    const wrapper = await mountView([
      makeItem(1, '无日期', ''),
      makeItem(2, '有日期', '2026/03'),
    ])
    const names = rowNames(wrapper)
    expect(names[0]).toContain('有日期')
  })
})

describe('等待更新：拖动排序', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('remaining_sort_field', 'expected_date')
    localStorage.setItem('remaining_sort_order', 'asc')
    localStorage.setItem('remaining_sort_default_migrated', '1')
  })

  it('拖动后进入手动模式并持久化新的 sort_order', async () => {
    const rows = [
      makeItem(1, 'A番', '2026/03', 1),
      makeItem(2, 'B番', '2026/07', 2),
      makeItem(3, 'C番', '2026/12', 3),
    ]
    const wrapper = await mountView(rows)
    const { remainingApi } = await import('../src/db/api')

    const trs = wrapper.findAll('tbody tr')
    expect(trs.length).toBe(3)

    // 把第 1 行拖到第 3 行位置
    await trs[0].trigger('dragstart')
    await trs[2].trigger('dragover')
    await trs[2].trigger('drop')
    await flushPromises()

    // 应调用 update 写 sort_order（只写真正变化的项，未变的不写）
    expect(remainingApi.update).toHaveBeenCalled()
    const calls = remainingApi.update.mock.calls
    const orders = calls.map(c => c[1].sort_order).sort((a, b) => a - b)
    // 把 A(1) 拖到末尾后：B→1、C→2、A→3；只有 B/C/A 中发生位移的被写入
    expect(orders.length).toBeGreaterThanOrEqual(2)
    expect(orders).not.toContain(0)
    // 写入的序号必须是连续的新顺序中的合法值
    for (const o of orders) expect(o).toBeGreaterThanOrEqual(1)
  })

  it('拖动后表头失去排序箭头（进入手动模式）', async () => {
    const wrapper = await mountView([
      makeItem(1, 'A番', '2026/03'),
      makeItem(2, 'B番', '2026/07'),
    ])
    const trs = wrapper.findAll('tbody tr')
    await trs[0].trigger('dragstart')
    await trs[1].trigger('dragover')
    await trs[1].trigger('drop')
    await flushPromises()

    // 手动模式下不应再渲染排序箭头图标（排序箭头已改为 AppIcon: arrowUp/arrowDown）
    const sortIcons = () => wrapper.findAll('svg').filter(s => {
      const n = s.attributes('class') || ''
      return /w-3\.5/.test(n)
    })
    expect(wrapper.findAllComponents({ name: 'AppIcon' }).some(c => /arrow/i.test(c.props('name') || ''))).toBe(false)
  })

  it('手动模式下点表头可切回字段排序', async () => {
    const wrapper = await mountView([
      makeItem(1, 'A番', '2026/03'),
      makeItem(2, 'B番', '2026/07'),
    ])
    const trs = wrapper.findAll('tbody tr')
    await trs[0].trigger('dragstart')
    await trs[1].trigger('dragover')
    await trs[1].trigger('drop')
    await flushPromises()

    const dateHeader = wrapper.findAll('thead th').find(th => th.text().includes('预计日期'))
    await dateHeader.trigger('click')
    await flushPromises()

    // 恢复字段排序后应重新出现排序箭头图标
    expect(wrapper.findAllComponents({ name: 'AppIcon' }).some(c => /arrow/i.test(c.props('name') || ''))).toBe(true)
  })

  it('拖到末行之外应追加到最后一位（不是倒数第二位）', async () => {
    const rows = [
      makeItem(1, 'A番', '2026/03', 1),
      makeItem(2, 'B番', '2026/07', 2),
      makeItem(3, 'C番', '2026/12', 3),
    ]
    const wrapper = await mountView(rows)

    // dragstart 后末尾放置带出现
    await wrapper.findAll('tbody tr')[0].trigger('dragstart')
    await flushPromises()

    // jsdom 的 getBoundingClientRect 恒为 0，直接让 clientY 远大于 0 触发 END 分支
    const fake = (clientY) => ({ preventDefault() {}, clientY, dataTransfer: { dropEffect: '' } })
    await wrapper.vm.$.setupState.onTableDragOver(fake(999))
    await wrapper.vm.$.setupState.onTableDrop(fake(999))
    await flushPromises()

    const { remainingApi } = await import('../src/db/api')
    expect(remainingApi.update).toHaveBeenCalled()

    // 被拖走的 A(id=1) 应拿到最大 sort_order（追加语义），而不是倒数第二位
    const calls = remainingApi.update.mock.calls
    const aCall = calls.find((c) => c[0] === 1)
    expect(aCall, 'A 应有落库调用').toBeTruthy()
    const maxOrder = Math.max(...calls.map((c) => c[1].sort_order))
    expect(aCall[1].sort_order).toBe(maxOrder)
  })

  it('搜索过滤时禁用拖动（draggable=false）', async () => {
    const wrapper = await mountView([
      makeItem(1, 'Alpha', '2026/03'),
      makeItem(2, 'Beta', '2026/07'),
    ])
    // 视觉审计 A-01：搜索框已迁入顶栏（pageControls），单测用同构宿主挂出控件
    const controls = mountTopbarControls('/remaining')
    const search = controls.find('input[type="text"]')
    await search.setValue('alpha')
    await flushPromises()

    const tr = wrapper.findAll('tbody tr')[0]
    expect(tr.attributes('draggable')).toBe('false')
  })
})
