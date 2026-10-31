// Vitest 全局测试环境准备
import 'fake-indexeddb/auto'

// 注册三语语言包并固定为中文：
// 组件测试大量按中文文案定位按钮（findButton('添加番剧')），
// 若语言包未注册，tt() 会返回裸 key，这些测试会全部失效。
import { registerMessages, setLocale } from '../src/composables/useI18n'
import zh from '../src/locales/zh'
import en from '../src/locales/en'
import ja from '../src/locales/ja'

registerMessages('zh', zh)
registerMessages('en', en)
registerMessages('ja', ja)
setLocale('zh')

// 与 main.js 保持一致：全局注册统一图标组件。
// 测试里直接 mount 视图不会经过 main.js，不注册会报 Failed to resolve component: AppIcon
import { config } from '@vue/test-utils'
import AppIcon from '../src/components/AppIcon.vue'
import TagSelector from '../src/components/TagSelector.vue'
import TagFilter from '../src/components/TagFilter.vue'
import ColorPicker from '../src/components/ColorPicker.vue'
import ItemTags from '../src/components/ItemTags.vue'
config.global.components = { ...(config.global.components || {}), AppIcon, TagSelector, TagFilter, ColorPicker, ItemTags }

// 同理注册全局悬浮气泡指令 v-tip：
// 视图模板里已把原生 title 换成 v-tip，测试不注册会刷屏
// "Failed to resolve directive: tip"，并按 DOM 结构差异导致部分断言失败。
import { vTip } from '../src/composables/useHoverTip'
config.global.directives = { ...(config.global.directives || {}), tip: vTip }

// jsdom 缺失的浏览器 API 兜底
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return false },
    })
  }

  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }

  if (!globalThis.IntersectionObserver) {
    globalThis.IntersectionObserver = class {
      constructor() { this.root = null; this.rootMargin = ''; this.thresholds = [] }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return [] }
    }
  }

  // jsdom 未实现 DataTransfer（HTML5 拖拽需要）；组件会读 effectAllowed / 调 setData
  if (!globalThis.DataTransfer) {
    globalThis.DataTransfer = class {
      constructor() {
        this.effectAllowed = 'all'
        this.dropEffect = 'none'
        this._data = new Map()
      }
      setData(type, val) { this._data.set(type, String(val)) }
      getData(type) { return this._data.get(type) || '' }
      clearData() { this._data.clear() }
      setDragImage() {}
    }
  }

  // jsdom 的 localStorage / sessionStorage 默认可用，但每个用例前清空，避免相互污染
  beforeEach(() => {
    try { localStorage.clear() } catch {}
    try { sessionStorage.clear() } catch {}
  })
}
