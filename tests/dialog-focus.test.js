/**
 * 弹窗焦点管理测试
 * 锁定：打开时聚焦首个输入、Tab 在弹窗内循环、关闭后焦点归还触发控件。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineComponent, ref, nextTick, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useDialogFocus, collectFocusable, firstField, canFocus } from '../src/composables/useDialogFocus'

const mountDialogHost = async (openInitially = false) => {
  const isOpen = ref(openInitially)
  const dialogEl = ref(null)
  const rootEl = ref(null)

  const Comp = defineComponent({
    setup() {
      useDialogFocus({
        isOpen: () => isOpen.value,
        getDialog: () => dialogEl.value,
        root: () => rootEl.value,
      })
      return () => [
        h('div', { ref: rootEl, tabindex: '-1' }, [
          h('button', { id: 'trigger' }, '打开'),
          isOpen.value
            ? h('div', { ref: dialogEl, class: 'dlg' }, [
                h('input', { id: 'a' }),
                h('input', { id: 'b' }),
                h('button', { id: 'ok' }, '确定'),
                h('button', { id: 'cancel' }, '取消'),
              ])
            : null,
        ]),
      ]
    },
  })

  const wrapper = mount(Comp, { attachTo: document.body })
  await nextTick()
  return { wrapper, isOpen }
}

describe('useDialogFocus', () => {
  let wrapper
  afterEach(() => { wrapper?.unmount() })

  it('打开弹窗时焦到第一个输入框', async () => {
    const host = await mountDialogHost(true)
    wrapper = host.wrapper
    // 初次打开：watch(flush:'post') + 内部 nextTick，需要多等一拍
    await flushPromises()
    await nextTick()
    await nextTick()
    expect(document.activeElement?.id).toBe('a')
  })

  it('关闭后焦点归还给触发按钮', async () => {
    const host = await mountDialogHost(false)
    wrapper = host.wrapper
    // 模拟用户点击触发按钮后打开
    const trigger = document.querySelector('#trigger')
    trigger.focus()
    host.isOpen.value = true
    await flushPromises()
    await nextTick()
    await nextTick()
    expect(document.activeElement?.id).toBe('a')

    host.isOpen.value = false
    await flushPromises()
    await nextTick()
    await nextTick()
    expect(document.activeElement?.id).toBe('trigger')
  })

  it('collectFocusable 按 DOM 顺序返回可聚焦元素', async () => {
    const host = await mountDialogHost(true)
    wrapper = host.wrapper
    const dlg = document.querySelector('.dlg')
    const items = collectFocusable(dlg)
    expect(items.map((el) => el.id)).toEqual(['a', 'b', 'ok', 'cancel'])
  })

  it('firstField 优先返回输入框而不是按钮', () => {
    const dlg = document.createElement('div')
    dlg.innerHTML = '<button>btn</button><input id="x">'
    expect(firstField(dlg)?.id).toBe('x')
  })

  it('没有输入框时 firstField 退回第一个可聚焦元素', () => {
    const dlg = document.createElement('div')
    dlg.innerHTML = '<button id="b1">b1</button>'
    expect(firstField(dlg)?.id).toBe('b1')
  })

  it('canFocus 拒绝 disabled 与未挂载元素', () => {
    const btn = document.createElement('button')
    btn.disabled = true
    expect(canFocus(btn)).toBe(false)
    expect(canFocus(document.createElement('input'))).toBe(false)
    expect(canFocus(null)).toBe(false)
  })
})

describe('无障碍属性', () => {
  it('弹窗容器声明 role=dialog 与 aria-modal', () => {
    const dlg = document.createElement('div')
    dlg.setAttribute('role', 'dialog')
    dlg.setAttribute('aria-modal', 'true')
    expect(dlg.getAttribute('role')).toBe('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
  })
})
