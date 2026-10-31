<template>
  <!-- 无标签时整块不渲染：不产生任何占位盒，行/卡片高度与「没加标签」完全一致 -->
  <div v-if="visibleTags.length" class="item-tags" :class="{ 'item-tags-compact': compact }">
    <span v-for="t in visibleTags" :key="t.name" class="item-tag"
      :style="{ '--tg': t.color || 'rgb(var(--c-primary))' }"
      :title="t.label">{{ t.label }}</span>
    <!-- 超出部分收成「+N」：title 上列出被收起的标签名，悬停仍可见全 -->
    <span v-if="overflow > 0" class="item-tag item-tag-more" :title="moreTitle">{{ moreText }}</span>
  </div>
</template>

<script setup>
/**
 * 条目标签展示（只读）。
 *
 * 三个页面（追番卡片 / 等番表格 / 已看表格）共用，保证标签外观完全一致。
 *
 * 关键设计：
 *  · 数据里存的 tags 是**逗号分隔的标签名**，颜色要查 tags 表；
 *    为了不在每行都请求一次数据库，这里用一个**模块级缓存**（所有实例共享一次查询）。
 *  · 标签名走 useTagLabel，内置标签（热血/日常/…）会按当前语言显示，
 *    用户自建的标签保持原名。
 *  · 样式用「淡色底 + 标签自身颜色」而不是实色块：列表里几十个实色块会压过正文。
 *  · compact 模式限制显示数量（追番卡片列很窄，塞不下太多）。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { tagsApi } from '../db/api'
import { useTagLabel } from '../composables/useTagLabel'
import { useI18n } from '../composables/useI18n'

const props = defineProps({
  /** 逗号分隔的标签名字符串，或已经是数组 */
  tags: { type: [String, Array], default: '' },
  /** 最多显示几个，超出显示 +N */
  max: { type: Number, default: 3 },
  /** 紧凑模式（卡片列窄时用），会进一步收缩 */
  compact: { type: Boolean, default: false },
})

const { tagLabel } = useTagLabel()
const { tt } = useI18n()

// ==========================================================================
// ⚠️ 缓存必须放在**模块作用域**，不能放进 setup()。
//
// <script setup> 的顶层代码每个组件实例都会执行一次：如果把
// `const tagColorMap = ref(null)` 写在 setup 里，一行 = 一个实例 = 一次
// `tagsApi.getAll()` 全表查询。等番/已看一页 20~50 行就是 20~50 次 IndexedDB
// 往返 + 全表序列化——正是本任务要求「不要每行都请求一次」要避免的。
//
// 放在模块里则所有实例共享同一个 Map / 同一个进行中的 Promise，
// 首屏并发挂载 N 个实例也只发 1 个请求。
// ==========================================================================
/** name -> color（模块级，全站共享） */
let tagColorMap = null
/** 进行中的请求；并发实例 await 同一个 Promise */
let tagsPromise = null

const ensureTags = () => {
  if (tagColorMap) return Promise.resolve(tagColorMap)
  if (!tagsPromise) {
    tagsPromise = Promise.resolve()
      // 用 then 包一层：tagsApi 缺失/同步抛错也变成 rejection，不会打断渲染
      .then(() => tagsApi.getAll())
      .then((res) => {
        const list = res?.data?.data || []
        const map = new Map(list.map((t) => [String(t.name ?? ''), t]))
        tagColorMap = map
        return map
      })
      .catch(() => {
        // 拉表失败不能让列表报错：降级成空表，chip 用主题色兜底
        tagColorMap = new Map()
        return tagColorMap
      })
      .finally(() => { tagsPromise = null })
  }
  return tagsPromise
}

// 缓存是否就绪的**实例侧**标志：只用来触发一次重算（tagColorMap 本身非响应式）
const ready = ref(!!tagColorMap)

// 说明：`<script setup>` 里不允许出现 ES module `export`（Vue 编译器会直接报错），
// 所以「让缓存失效」这件事不做成对外 API：缓存的生命周期与一次页面加载对齐。
// 标签改名/改色后，用户回到列表页时列表是重新挂载的，但模块缓存仍在——
// 若将来需要「改色后立即刷新列表 chip」，应把本缓存挪到独立 composable
// （src/composables/useTagColors.js）再导出 invalidate/reload，而不是从 SFC 导出。

onMounted(() => {
  ensureTags().then(() => { ready.value = true })
})

// 父级在本实例挂载之后才填数据（翻页/切年份）时兜一下：缓存若还没建立就先拉一次
watch(() => props.tags, (v) => {
  if (v && !tagColorMap) ensureTags().then(() => { ready.value = true })
})

/** 解析成 [{ name, color, label }] */
const parsed = computed(() => {
  void ready.value // 颜色表到位后重算一次
  const raw = props.tags
  const names = (Array.isArray(raw) ? raw : String(raw || '').split(','))
    .map(s => String(s).trim())
    .filter(Boolean)
  if (!names.length) return []
  const map = tagColorMap
  return names.map(name => ({
    name,
    color: map?.get(name)?.color || '',
    // tagLabel 接收的是标签对象（{ name }），不是裸字符串
    label: tagLabel({ name }),
  }))
})

const visibleTags = computed(() => parsed.value.slice(0, props.max))
const overflow = computed(() => Math.max(0, parsed.value.length - props.max))
/** 「+N」的读法走 i18n（key 待 Lead 补：tags.moreCount） */
const moreText = computed(() => tt('tags.moreCount', { count: overflow.value }))
/** 收进「+N」的标签名，挂在 title 上，鼠标悬停仍能看全 */
const moreTitle = computed(() =>
  parsed.value.slice(props.max).map((t) => t.label).join('、'),
)
</script>

<style scoped>
.item-tags {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: nowrap;
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
}

.item-tag {
  --tg: rgb(var(--c-primary));
  display: inline-block;
  /* 可由 flex 压缩：列窄时先缩 chip 宽度（内部省略号），而不是把整行撑出父盒 */
  flex: 0 1 auto;
  min-width: 0;
  padding: 0 0.375rem;
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  line-height: 1.15rem;
  white-space: nowrap;
  max-width: 6.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 淡色底 + 同色系压暗文字：与 TagSelector 的 .tag-chip-off 同一套 color-mix 手法。 */
  background: color-mix(in srgb, var(--tg) 14%, transparent);
  color: color-mix(in srgb, var(--tg) 62%, black);
  border: 1px solid color-mix(in srgb, var(--tg) 28%, transparent);
}

/* 紧凑模式：字更小、内边距更窄，给窄列让位 */
.item-tags-compact {
  gap: 0.1875rem;
}
.item-tags-compact .item-tag {
  font-size: 0.625rem;
  line-height: 1rem;
  padding: 0 0.25rem;
  max-width: 4rem;
  border-radius: 0.3125rem;
}

/* 「+N」不带描边、不参与压缩，视觉上比真标签更轻 */
.item-tag-more {
  --tg: rgb(var(--c-primary));
  flex: 0 0 auto;
  max-width: none;
  background: color-mix(in srgb, var(--tg) 8%, transparent);
  color: color-mix(in srgb, var(--tg) 45%, black);
  border-color: transparent;
}

/* 深色模式：淡色底在深底上要更亮才看得见；
   文字也要反向提亮（混黑在深底上会糊成一片）。 */
.dark .item-tag {
  background: color-mix(in srgb, var(--tg) 26%, transparent);
  color: color-mix(in srgb, var(--tg) 45%, white);
  border-color: color-mix(in srgb, var(--tg) 40%, transparent);
}
.dark .item-tag-more {
  background: color-mix(in srgb, var(--tg) 18%, transparent);
  color: color-mix(in srgb, var(--tg) 55%, white);
}
</style>
