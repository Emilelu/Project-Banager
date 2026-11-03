/**
 * 测试辅助：顶栏内容控件（pageControls）的挂载宿主。
 *
 * 背景（视觉审计 A-01）：等番/已看页的搜索/标签/年份控件已迁入顶栏 ——
 * view 通过 setPageControls 注册组件，App.vue 用 <component :is> 渲染。
 * 单测只挂载 view、没有 App.vue，注册进 store 的控件不会出现在 DOM 里，
 * 所以这里提供一个**与 App.vue 同构**的宿主：读取 pageControls[routeKey]
 * 并渲染控件组件（props 原样透传，v-model 回调因此仍能写回 view）。
 *
 * 用法：先挂 view，再挂宿主；宿主是响应式的，view 重写控件会自动跟上。
 *   const view = await mountRemaining([...])
 *   const controls = mountTopbarControls('/remaining')
 *   await controls.find('input[placeholder="搜索番剧名称..."]').setValue('beta')
 */
import { h, defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { pageControls } from '../../src/composables/usePageStats'

export const TopbarControlsHost = defineComponent({
  name: 'TopbarControlsHost',
  props: { routeKey: { type: String, required: true } },
  setup(props) {
    return () => {
      const list = pageControls[props.routeKey] || []
      return h('div', { class: 'topbar-controls test-topbar-controls' },
        list.map((c) => h(c.component, { key: c.key, ...(c.props || {}) })))
    }
  },
})

/**
 * 挂载指定路由的顶栏控件宿主（attach 到 body，菜单 Teleport 才有落点）。
 * @param {string} routeKey 路由 path，如 '/remaining'
 * @param {object} [options] 追加的 mount 选项（global.stubs 等）
 */
export function mountTopbarControls(routeKey, options = {}) {
  return mount(TopbarControlsHost, {
    props: { routeKey },
    attachTo: document.body,
    ...options,
  })
}
