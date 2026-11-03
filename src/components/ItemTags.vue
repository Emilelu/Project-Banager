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
import { getTagColorMap, peekTagColorMap } from '../composables/useTagColors'
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
// 标签颜色表来自 composables/useTagColors.js（**独立的 .js 模块**）。
//
// ⚠️ 不能把缓存写在本文件里：`<script setup>` 会把所有顶层语句原样编进 setup()，
// 于是「模块级」变量实际是每个实例一份 —— 等番页 3 行就会发 3 次 tagsApi.getAll()
// （首版实现踩过这个坑，实测一页多一次全表查询）。只有独立的 .js 模块才真正共享。
// 并发首屏的 N 个实例都 await 同一个 Promise，合计只发 1 个请求。
// ==========================================================================

// 缓存是否就绪的**实例侧**标志：只用来触发一次重算（Map 本身非响应式）
const ready = ref(!!peekTagColorMap())

const ensureTags = () => {
  if (peekTagColorMap()) { ready.value = true; return Promise.resolve(peekTagColorMap()) }
  return getTagColorMap().then((map) => { ready.value = true; return map })
}

onMounted(ensureTags)

// 父级在本实例挂载之后才填数据（翻页/切年份）时兜一下：缓存若还没建立就先拉一次
watch(() => props.tags, (v) => {
  if (v && !peekTagColorMap()) ensureTags()
})

/** 解析成 [{ name, color, label }] */
const parsed = computed(() => {
  void ready.value // 颜色表到位后重算一次
  const raw = props.tags
  const names = (Array.isArray(raw) ? raw : String(raw || '').split(','))
    .map(s => String(s).trim())
    .filter(Boolean)
  if (!names.length) return []
  const map = peekTagColorMap()
  return names.map(name => ({
    name,
    color: map?.get(name)?.color || '',
    // tagLabel 接收的是标签对象（{ name }），不是裸字符串
    label: tagLabel({ name }),
  }))
})

/**
 * 显示上限：compact（追番周历窄列）收敛到 2 个 —— 实测列宽 960→约 100px、
 * 1440→约 169px 时塞 3 个 chip 会把名称挤成「标…」、chip 压成「Ac…」，两边都读不出来。
 * 表格页列宽充裕，保持 max=3。
 */
const limit = computed(() => (props.compact ? Math.min(2, props.max) : props.max))

const visibleTags = computed(() => parsed.value.slice(0, limit.value))
const overflow = computed(() => Math.max(0, parsed.value.length - limit.value))

/**
 * 「+N」文案。
 * 优先走 i18n（key: tags.moreCount = "还有 {count} 个"），但**该 key 目前三语包都还没有**
 * （本任务的写入范围禁止改 locales，需要 Lead 统一加，清单见交付说明）。
 * t() 在字典缺项时会原样返回 key 名，界面上就会出现字面量 "tags.moreCount" ——
 * 所以在 key 未落地前退化为纯符号「+N」：无语言依赖，也不会露出 key。
 * 一旦 Lead 补上 tags.moreCount，这里的 tt() 命中字典，会自动切成完整文案（含数字）。
 */
const moreText = computed(() => {
  const translated = tt('tags.moreCount', { count: overflow.value })
  // 未命中字典时 t() 返回的就是 key 本身
  return translated === 'tags.moreCount' ? `+${overflow.value}` : translated
})
/** 收进「+N」的标签名，挂在 title 上，鼠标悬停仍能看全（分隔符不翻译，纯符号） */
const moreTitle = computed(() =>
  parsed.value.slice(limit.value).map((t) => t.label).join(' / '),
)
</script>

<style scoped>
/* 徽章保持其内容宽度，不被相邻名称压缩成半个字；长自定义标签仍用省略号。 */
.item-tags {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 0.25rem;
  vertical-align: middle;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

/* 追番卡片里与名称同排的小块（卡片是纵向布局，这块本身不再单独占一行） */
.item-tags-block {
  display: flex;
  flex-wrap: nowrap;
  margin-top: 0.125rem;
}

.item-tag {
  --tg: rgb(var(--c-primary));
  display: inline-block;
  flex: 0 0 auto;
  min-width: 0;
  padding: 0 0.375rem;
  border-radius: 0.375rem;
  /* 视觉审计 A-47：常规档原 0.6875rem（1440 下 9.625px）是全站最小字号档，
     低于 V-13 确立的 10.5px 徽章规格，也小于本组件 compact 档（0.75rem）。
     对齐到 0.75rem（10.5px@1440）；max-width 6.5rem 按 rem 计不随字号变化，
     种子最长标签（4 字 CJK）远未触顶，实测无新增截断。 */
  font-size: 0.75rem;
  line-height: 1.15rem;
  white-space: nowrap;
  max-width: 6.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 淡色底 + 同色系压暗文字：与 TagSelector 的 .tag-chip-off 同一套 color-mix 手法。
     列表里几十个实色块会压过正文（名称/集数才是主内容），所以用淡底；
     文字压到同色深阶是为了对比度达标（500 级高饱和色压在 12% 淡底上实测仅 ~2.5:1）。 */
  background: color-mix(in srgb, var(--tg) 14%, transparent);
  color: color-mix(in srgb, var(--tg) 62%, black);
  border: 1px solid color-mix(in srgb, var(--tg) 28%, transparent);
}

/* 紧凑档：追番周历列宽只有约 1/7 屏，字号/内边距/最大宽再收一档 */
.item-tags-compact {
  gap: 0.1875rem;
}
.item-tags-compact .item-tag {
  font-size: 0.75rem;
  line-height: 1.25rem;
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

/* 深色模式：淡底在深底上要更亮才看得见；
   文字同步反转为亮阶，否则「混黑」的深色字压在深紫卡片上会糊成一片。
   ⚠️ 本工程直接写 `.dark .xxx`（scoped 会编译成 .dark .xxx[data-v-xxx]），
   不要写 :global(.dark) .foo —— 那个写法在本仓库会被编译成空选择器，规则完全不生效。 */
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
