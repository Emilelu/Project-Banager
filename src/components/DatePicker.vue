<template>
  <div class="dp-root">
    <!-- 触发器：外观与项目里的表单输入框完全一致（见 ImportExportView 的 input 样式），
         但它是 button —— 点击打开自研面板，绝不调用 showPicker()、绝不出现 type="date"。 -->
    <button ref="triggerRef" type="button" class="dp-trigger"
      :class="{ 'is-open': panelOpen, 'is-empty': !displayText, 'is-invalid': invalid }"
      :aria-expanded="panelOpen ? 'true' : 'false'" aria-haspopup="dialog" :aria-label="label('datePicker.open')"
      data-datepicker-trigger @click="togglePanel">
      <AppIcon scale="sm" name="calendar" class="dp-trigger-icon" />
      <span class="dp-trigger-value">{{ displayText || placeholder || label('datePicker.open') }}</span>
      <svg class="dp-caret dp-caret-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M6.5 9.5 12 15l5.5-5.5" />
      </svg>
    </button>

    <!-- 面板：必须 Teleport 到 body + fixed。
         祖先只要带 backdrop-filter（项目大量 .glass 卡片）就会成为 fixed 包含块，
         不 Teleport 会按祖先盒子定位（实测偏移能到 200px）。 -->
    <Teleport to="body">
      <!-- 卸载组件时把动画关掉（:css="false" 且无 JS 钩子 → 立即移除）：
           弹窗随页面一起卸载时，离场过渡会在 DOM 已被移除后仍继续运行，
           jsdom 下会抛出 insertBefore/subTree 的未处理异常。 -->
      <transition name="pop" :css="popCss">
        <div v-if="panelOpen" ref="panelRef" class="dp-panel app-menu-panel shadow-2xl"
          :style="panelStyle" role="dialog" aria-modal="false"
          :aria-label="label('datePicker.panel')" tabindex="-1" data-datepicker-panel @keydown.esc.stop.prevent="closePanel">
          <!-- 顶部：上/下月 + 年月标题（点标题切到年月 / 年份视图） -->
          <div class="dp-head">
            <button type="button" class="dp-nav" :aria-label="prevLabel" data-datepicker-prev @click="step(-1)">
              <svg class="dp-caret dp-caret-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <path d="M6.5 9.5 12 15l5.5-5.5" />
              </svg>
            </button>
            <button type="button" class="dp-title" data-datepicker-title @click="cycleView">{{ titleText }}</button>
            <button type="button" class="dp-nav" :aria-label="nextLabel" data-datepicker-next @click="step(1)">
              <svg class="dp-caret dp-caret-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <path d="M6.5 9.5 12 15l5.5-5.5" />
              </svg>
            </button>
          </div>

          <!-- 月历网格：7 列 × 6 行，周一开头（与项目「周一~周日」习惯一致） -->
          <div v-if="view === 'days'" class="dp-body" data-view="days">
            <div class="dp-weekdays">
              <span v-for="w in weekHeadKeys" :key="w" class="dp-weekday">{{ label(w) }}</span>
            </div>
            <div class="dp-grid">
              <button v-for="cell in dayCells" :key="cell.key" type="button" class="dp-day"
                :class="{
                  'is-outside': cell.outside,
                  'is-today': cell.isToday,
                  'is-in-month': cell.inMonth,
                  'is-selected': cell.isSelected,
                }" :data-date="cell.iso" :aria-label="cell.iso" @click="pickDay(cell)">{{ cell.d }}</button>
            </div>
          </div>

          <!-- 月份快选：3 列 × 4 行 -->
          <div v-else-if="view === 'months'" class="dp-body" data-view="months">
            <div class="dp-grid dp-grid-months">
              <button v-for="m in 12" :key="'m' + m" type="button" class="dp-cell-lg"
                :class="{ 'is-selected': m === selMonth, 'is-today': m === todayMonth && cursor.year === todayYear }"
                :data-month="cursor.year + '/' + pad(m)" :aria-label="cursor.year + '/' + pad(m)" @click="pickMonth(m)">
                {{ pad(m) }}
              </button>
            </div>
          </div>

          <!-- 年份快选：3 列 × 4 行，一格 10 年为一页 -->
          <div v-else class="dp-body" data-view="years">
            <div class="dp-grid dp-grid-months">
              <button v-for="y in yearCells" :key="'y' + y" type="button" class="dp-cell-lg"
                :class="{ 'is-selected': y === selYear, 'is-today': y === todayYear }"
                :data-year="y" :aria-label="String(y)" @click="pickYear(y)">
                {{ y }}
              </button>
            </div>
          </div>

          <!-- 底部：精度切换 + 今天 / 清除 -->
          <div class="dp-foot">
            <div class="dp-precision" role="group" :aria-label="label('datePicker.precision')">
              <button v-for="p in precisionOptions" :key="p.key" type="button" class="dp-precision-btn"
                :class="{ 'is-active': p.key === precisionState }" :data-precision-option="p.key"
                :aria-pressed="p.key === precisionState ? 'true' : 'false'" @click="setPrecision(p.key)">
                {{ label(p.labelKey) }}
              </button>
            </div>
            <div class="dp-actions">
              <button type="button" class="dp-action" data-datepicker-today @click="pickToday">
                {{ label('sidebar.backupToday') }}
              </button>
              <button type="button" class="dp-action" data-datepicker-clear @click="clearValue">
                {{ label('record.clearTime') }}
              </button>
            </div>
          </div>

          <!-- 年份范围（2014~2017）不是单个日期：给出提示，避免用户以为面板能保留范围 -->
          <p v-if="rangeText" class="dp-note">{{ rangeText }}</p>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
/**
 * DatePicker —— 自研日期面板，替代浏览器原生 `input[type=date]`。
 * =====================================================================
 * 为什么不用原生控件：
 *   · 原生日历由浏览器绘制（白底/圆角/字体各浏览器完全不同），压在深色玻璃上非常割裂；
 *   · 原生 type="date" **只能表达完整日期**，本项目支持 2025 / 2025/07 / 2025/07/15 /
 *     2025/7 / 2014~2017 五种精度，原生控件会选择"空缺"，过去只能靠自动切手动输入兜底。
 *
 * 设计要点：
 *   1. 触发器是 button（外观与表单 input 一致），点击打开自研面板，绝无 showPicker / type=date；
 *   2. 面板 Teleport 到 body + fixed（祖先 backdrop-filter 会成为 fixed 包含块，实测偏 200px）；
 *   3. 面板材质 app-menu-surface（与全站菜单/气泡同一材质）+ rounded-xl + border-white/40 + shadow-2xl；
 *   4. 动画复用全站 <transition name="pop">，并写入 --pop-origin-y / --pop-from-y 让面板从锚点一侧长出来；
 *   5. 视口边界感知：靠近右侧/底部时夹取或向上翻转，面板始终完整可见；
 *   6. 精度切换（日/月/年）直接输出对应格式，粗精度值不会被迫退化到手动输入；
 *   7. 解析/校验完全复用 useDatePicker（validateDate / normalizeDate），不另写一套解析。
 *
 * 值格式（与项目存储格式一致，见 useDatePicker 文件头）：
 *   日 → 2025/07/15（若原值带时间则保留 " HH:mm"）；月 → 2025/07；年 → 2025。
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import { validateDate, normalizeDate } from '../composables/useDatePicker'
import { useI18n } from '../composables/useI18n'

const props = defineProps({
  // 项目现有的全部日期形态：2025 / 2025/07 / 2025/07/15 / 2025/7 / 2014~2017 / 带时间
  modelValue: { type: String, default: '' },
  // 默认精度（值本身更粗时以值为准，避免编辑时把「2025/07」降级成具体日期）
  precision: { type: String, default: 'day' },
  placeholder: { type: String, default: '' },
  // 校验失败时描红：与各页面手动输入框的 border-danger/50 观感保持一致
  invalid: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'change', 'open', 'close'])

const { tt } = useI18n()

/**
 * 文案：模板里所有可见文案必须走 tt()（本仓库硬性规则）。
 * 但本组件新增的 key 尚未写进 src/locales（严格写入范围不允许改 locales），
 * 因此这里用「有翻译用翻译、没有则用内置中文」的兜底，Lead 后续把同名 key
 * 补进三语包后会自动生效，无需再改组件。
 * 已存在可复用的 key（今天 / 清除 / 星期缩写）直接复用，不重复造词。
 */
const FALLBACK = {
  'datePicker.open': '选择日期',
  'datePicker.panel': '日期选择面板',
  'datePicker.prev': '上一页',
  'datePicker.next': '下一页',
  'datePicker.precision': '精度',
  'datePicker.precisionDay': '精确到日',
  'datePicker.precisionMonth': '精确到月',
  'datePicker.precisionYear': '精确到年',
  'datePicker.rangeNote': '当前值为年份范围（{value}），在面板中选择会替换为单个日期',
}
const label = (key, params) => {
  const text = tt(key, params)
  if (text !== key) return text
  let fb = FALLBACK[key] || key
  if (params) fb = fb.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m))
  return fb
}

const pad = (n) => String(n).padStart(2, '0')
const precisionOptions = [
  { key: 'day', labelKey: 'datePicker.precisionDay' },
  { key: 'month', labelKey: 'datePicker.precisionMonth' },
  { key: 'year', labelKey: 'datePicker.precisionYear' },
]
const weekHeadKeys = ['weekday.short1', 'weekday.short2', 'weekday.short3', 'weekday.short4', 'weekday.short5', 'weekday.short6', 'weekday.short7']

// ===== 值解析（复用 validateDate：日期存储已零填充，normalized 即标准格式）=====
const parseValue = (value) => {
  const raw = String(value == null ? '' : value).trim()
  const empty = { year: null, month: null, day: null, precision: null, hasTime: false, range: null, raw }
  if (!raw) return empty
  const range = raw.match(/^(\d{4})\s*~\s*(\d{4})$/)
  if (range) return { ...empty, year: Number(range[1]), endYear: Number(range[2]), precision: 'year', range: raw }
  const valid = validateDate(raw)
  // 校验通过就用归一化值（补零），否则退回宽松解析（脏数据也能显示，不崩）
  const norm = valid.valid ? valid.normalized : normalizeDate(raw)
  const [datePart, ...rest] = norm.split(/\s+/)
  const parts = datePart.split('/')
  const year = Number(parts[0]) || null
  const month = parts.length > 1 ? Number(parts[1]) || null : null
  const day = parts.length > 2 ? Number(parts[2]) || null : null
  const precision = day ? 'day' : month ? 'month' : year ? 'year' : null
  return { ...empty, year, month, day, precision, hasTime: rest.length > 0, raw, normalized: norm }
}

const parsed = computed(() => parseValue(props.modelValue))
const displayText = computed(() => String(props.modelValue || '').trim())
const rangeText = computed(() => (parsed.value.range
  ? label('datePicker.rangeNote', { value: parsed.value.range })
  : ''))

// 精度：值本身更粗时以值为准（例如已看历史里的 2025/07 打开后仍保持「精确到月」）
const precisionState = ref(props.precision)
const selYear = computed(() => parsed.value.year)
const selMonth = computed(() => (parsed.value.year ? parsed.value.month || 1 : null))

// ===== 面板状态 =====
const panelOpen = ref(false)
const view = ref('days') // days | months | years
const triggerRef = ref(null)
const panelRef = ref(null)
const panelPos = ref({ left: 0, top: 0, placement: 'below' })

const todayDate = () => new Date()
const todayYear = ref(todayDate().getFullYear())
const todayMonth = ref(todayDate().getMonth() + 1)
const todayDay = ref(todayDate().getDate())

const cursor = ref({ year: todayYear.value, month: todayMonth.value })
const yearBase = ref(Math.floor(todayYear.value / 10) * 10 - 1)

const clampYear = (y) => Math.min(2100, Math.max(1900, y))

const syncFromValue = () => {
  const p = parsed.value
  const fallbackPrecision = ['day', 'month', 'year'].includes(props.precision) ? props.precision : 'day'
  precisionState.value = p.precision || fallbackPrecision
  if (p.year) {
    cursor.value = { year: p.year, month: p.month || 1 }
  } else {
    cursor.value = { year: todayYear.value, month: todayMonth.value }
  }
  yearBase.value = Math.floor(cursor.value.year / 10) * 10 - 1
}

// 面板关着时跟外部值同步；打开期间由用户操作驱动，避免打字/程序化改值把视图跳走
watch(() => props.modelValue, () => { if (!panelOpen.value) syncFromValue() })
watch(() => props.precision, (p) => {
  if (!panelOpen.value && !parsed.value.precision && ['day', 'month', 'year'].includes(p)) precisionState.value = p
})

// ===== 网格数据 =====
const dayCells = computed(() => {
  const { year, month } = cursor.value
  const leading = (new Date(year, month - 1, 1).getDay() + 6) % 7 // 周一 = 0
  const days = new Date(year, month, 0).getDate()
  const prevDays = new Date(year, month - 1, 0).getDate()
  const p = parsed.value
  const cells = []
  for (let i = 0; i < 42; i++) {
    const offset = i - leading + 1
    let y = year
    let m = month
    let d = offset
    if (offset < 1) {
      m = month === 12 ? 1 : month - 1
      y = month === 12 ? year - 1 : year
      d = prevDays + offset
    } else if (offset > days) {
      m = month === 12 ? 1 : month + 1
      y = month === 12 ? year + 1 : year
      d = offset - days
    }
    // 只有「精确到日」才在日视图里高亮某一天；
    // 月/年精度的值没有具体日，高亮某一天会误导用户（它的高亮出现在月/年视图里）
    const isSelected = precisionState.value === 'day' && !!p.year
      && p.year === y && (p.month || 1) === m && p.day === d
    cells.push({
      y, m, d,
      key: `${y}-${m}-${d}`,
      iso: `${y}-${pad(m)}-${pad(d)}`,
      outside: y !== year || m !== month,
      inMonth: y === year && m === month,
      isToday: y === todayYear.value && m === todayMonth.value && d === todayDay.value,
      isSelected,
    })
  }
  return cells
})

const yearCells = computed(() => {
  const list = []
  for (let i = 0; i < 12; i++) list.push(yearBase.value + i)
  return list
})

const titleText = computed(() => {
  if (view.value === 'days') return `${cursor.value.year}/${pad(cursor.value.month)}`
  if (view.value === 'months') return `${cursor.value.year}`
  return `${yearBase.value}–${yearBase.value + 11}`
})

const prevLabel = computed(() => label('datePicker.prev'))
const nextLabel = computed(() => label('datePicker.next'))

// ===== 提交 =====
const emitValue = (value, close = true) => {
  emit('update:modelValue', value)
  emit('change', value)
  if (close) closePanel(true)
}

const timeSuffix = () => {
  const p = parsed.value
  if (!p.hasTime || !p.normalized) return ''
  const idx = p.normalized.indexOf(' ')
  return idx >= 0 ? p.normalized.slice(idx) : ''
}

const buildValue = (y, m, d, precision) => {
  if (precision === 'year') return `${y}`
  if (precision === 'month') return `${y}/${pad(m)}`
  const suffix = timeSuffix()
  return `${y}/${pad(m)}/${pad(d)}${suffix}`
}

const commit = (y, m, d) => {
  emitValue(buildValue(y, m, d, precisionState.value))
}

const pickDay = (cell) => {
  // 点日视图里的某一天 = 明确想要「具体日期」：即使当前精度停在月/年，也升级为日精度。
  // （否则会出现「点了 15 号却只写回 2025」的怪现象）
  if (precisionState.value !== 'day') precisionState.value = 'day'
  commit(cell.y, cell.m, cell.d)
}

const pickMonth = (m) => {
  if (precisionState.value !== 'day') {
    commit(cursor.value.year, m, 1)
    return
  }
  // 精度到日：先进入该月，再选具体某天
  cursor.value = { year: cursor.value.year, month: m }
  view.value = 'days'
}

const pickYear = (y) => {
  if (precisionState.value === 'year') {
    commit(y, 1, 1)
    return
  }
  cursor.value = { year: clampYear(y), month: cursor.value.month }
  view.value = precisionState.value === 'month' ? 'months' : 'months'
}

const setPrecision = (next) => {
  if (precisionState.value === next) return
  precisionState.value = next
  const p = parsed.value
  // 切换精度立刻按新精度重算当前值（例如 2025/07/15 → 2025），面板保持打开。
  // 值本身缺少更低一级的字段时（"2025" 没有月、"2025/07" 没有日），
  // 必须回落到面板当前浏览的 cursor，否则「2025/07/15 → 年 → 月」会莫名变成 2025/01。
  if (p.year) {
    const value = buildValue(p.year, p.month || cursor.value.month, p.day || 1, next)
    emit('update:modelValue', value)
    emit('change', value)
  }
}

const pickToday = () => {
  const now = todayDate()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  todayYear.value = y
  todayMonth.value = m
  todayDay.value = d
  cursor.value = { year: y, month: m }
  commit(y, m, d)
}

const clearValue = () => {
  emitValue('')
}

// ===== 视图切换 =====
const cycleView = () => {
  view.value = view.value === 'days' ? 'months' : view.value === 'months' ? 'years' : 'days'
  if (view.value === 'years') yearBase.value = Math.max(1900, Math.floor(cursor.value.year / 10) * 10 - 1)
}

const step = (dir) => {
  if (view.value === 'days') {
    let { year, month } = cursor.value
    month += dir
    if (month < 1) { month = 12; year = clampYear(year - 1) }
    if (month > 12) { month = 1; year = clampYear(year + 1) }
    cursor.value = { year, month }
  } else if (view.value === 'months') {
    cursor.value = { year: clampYear(cursor.value.year + dir), month: cursor.value.month }
  } else {
    yearBase.value = Math.max(1900, Math.min(2090, yearBase.value + dir * 10))
  }
}

// ===== 定位（视口边界感知）=====
const PANEL_W = 336
const PANEL_H = 388
const MARGIN = 8
const GAP = 6

const placePanel = (measure = true) => {
  const trigger = triggerRef.value
  if (!trigger) return
  const anchor = trigger.getBoundingClientRect()
  const w = (measure && panelRef.value?.offsetWidth) || PANEL_W
  const h = (measure && panelRef.value?.offsetHeight) || PANEL_H
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = anchor.left
  // 右侧空间不足就向左夹取（始终保持面板完整可见）
  left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - w - MARGIN))

  let top = anchor.bottom + GAP
  let placement = 'below'
  if (top + h > vh - MARGIN) {
    const above = anchor.top - h - GAP
    if (above >= MARGIN) {
      top = above
      placement = 'above'
    } else {
      // 上下一齐放不下（超小窗口）：整体夹取，顶部优先级最高
      top = Math.max(MARGIN, vh - h - MARGIN)
    }
  }
  top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - h - MARGIN))
  panelPos.value = { left: Math.round(left), top: Math.round(top), placement }
}

const panelStyle = computed(() => ({
  left: `${panelPos.value.left}px`,
  top: `${panelPos.value.top}px`,
  maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
  '--pop-origin-y': panelPos.value.placement === 'above' ? 'bottom' : 'top',
  '--pop-from-y': panelPos.value.placement === 'above' ? '6px' : '-6px',
}))

// ===== 开关 =====
/**
 * 卸载前把离场过渡关掉：
 *   · 弹窗（.app-dialog）整体卸载时，DatePicker 的面板正开着的场景在测试/真实里都会出现；
 *   · 离场过渡若在宿主 DOM 已被移除后还在跑，Vue 会抛 "insertBefore of null"/"subTree of null"。
 *   · 卸载时把 transition 设为「无 css、无 JS 钩子」，元素立即移除，不留下未完成钩子。
 */
const popCss = ref(true)
onBeforeUnmount(() => { popCss.value = false })

const openPanel = async () => {
  if (props.disabled) return
  syncFromValue()
  view.value = 'days'
  // 先按估算尺寸摆一次，避免面板从 (0,0) 闪一下
  placePanel(false)
  panelOpen.value = true
  emit('open')
  await nextTick()
  placePanel(true)
  panelRef.value?.focus?.()
}

const closePanel = (returnFocus = false) => {
  if (!panelOpen.value) return
  panelOpen.value = false
  emit('close')
  if (returnFocus) nextTick(() => triggerRef.value?.focus?.())
}

const togglePanel = () => { panelOpen.value ? closePanel(true) : openPanel() }

// 点击外部 / Esc 关闭；滚轮与 resize 重新定位
const onDocPointerDown = (e) => {
  if (!panelOpen.value) return
  const target = e.target
  if (triggerRef.value?.contains(target)) return
  if (panelRef.value?.contains(target)) return
  closePanel()
}
const onDocKeydown = (e) => {
  if (!panelOpen.value) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    closePanel(true)
  }
}
const onViewportChange = () => { if (panelOpen.value) placePanel(true) }

onMounted(() => {
  syncFromValue()
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onDocKeydown, true)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onDocKeydown, true)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})

defineExpose({ open: openPanel, close: () => closePanel(), parsed })
</script>

<style scoped>
/* ==================== 触发器：与表单 input 同款 ==================== */
.dp-root {
  position: relative;
  width: 100%;
}

.dp-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.625rem 1rem;
  border: 1px solid rgb(var(--c-primary) / 0.2);
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.8);
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: #1f2937; /* gray-800 */
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}
.dp-trigger:hover {
  border-color: rgb(var(--c-primary) / 0.4);
}
.dp-trigger:focus-visible,
.dp-trigger.is-open {
  outline: none;
  border-color: rgb(var(--c-primary));
  box-shadow: 0 0 0 2px rgb(var(--c-primary) / 0.3);
}
/* 校验失败：与页面上手动输入框的 border-danger/50 + ring-danger/20 一致 */
.dp-trigger.is-invalid {
  border-color: rgb(var(--c-danger) / 0.5);
  box-shadow: 0 0 0 2px rgb(var(--c-danger) / 0.2);
}
.dp-trigger-icon {
  color: rgb(var(--c-primary));
}
.dp-trigger-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
/* 空值时用灰字 —— 与输入框 placeholder 的观感一致 */
.dp-trigger.is-empty .dp-trigger-value {
  color: #9ca3af; /* gray-400 */
}
.dp-caret {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: #9ca3af;
  transition: transform 0.2s ease;
}
.dp-trigger.is-open .dp-caret-down {
  transform: rotate(180deg);
}

/* 深色：触发器底色必须自己反转。
   这里写的是 scoped 原生 background，而不是 Tailwind 的 bg-white/80 类，
   所以 style.css 的 `.dark .bg-white\/80 { rgba(20,15,40,.55) }` 对它不生效 ——
   不补这条深色下会是一块 0.8 白底，和手动输入框（走了 bg-white/80）明显割裂。 */
.dark .dp-trigger {
  background: rgba(20, 15, 40, 0.55);
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.14);
}
.dark .dp-trigger:hover {
  border-color: rgb(var(--c-primary-light) / 0.5);
}
.dark .dp-trigger.is-empty .dp-trigger-value,
.dark .dp-caret {
  color: #94a3b8;
}
.dark .dp-trigger-icon {
  color: rgb(var(--c-primary-light));
}

/* ==================== 面板 ==================== */
.dp-panel {
  position: fixed;
  z-index: 240;
  width: 21rem; /* 336px：7 列 × 40px + 内边距 */
  padding: 0.75rem;
  overflow-y: auto;
  color: #1f2937;
}

.dp-head {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}
.dp-nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.5rem;
  border: 0;
  background: transparent;
  color: #4b5563;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.dp-nav:hover {
  background: rgb(var(--c-primary) / 0.12);
  color: rgb(var(--c-primary));
}
.dp-title {
  flex: 1;
  padding: 0.25rem 0.5rem;
  border-radius: 0.5rem;
  border: 0;
  background: transparent;
  font-size: 0.875rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.dp-title:hover {
  background: rgb(var(--c-primary) / 0.12);
}
.dp-title:focus-visible,
.dp-nav:focus-visible,
.dp-day:focus-visible,
.dp-cell-lg:focus-visible,
.dp-precision-btn:focus-visible,
.dp-action:focus-visible {
  outline: 2px solid rgb(var(--c-primary) / 0.6);
  outline-offset: 1px;
}

.dp-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 0.125rem;
}
.dp-weekday {
  text-align: center;
  font-size: 0.6875rem;
  line-height: 1.5rem;
  color: #6b7280;
}

.dp-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.dp-grid-months {
  grid-template-columns: repeat(3, 1fr);
  gap: 0.375rem;
  padding: 0.25rem 0.125rem;
}

.dp-day {
  height: 2.25rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  background: transparent;
  font-size: 0.8125rem;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.dp-day:hover {
  background: rgb(var(--c-primary) / 0.14);
  color: rgb(var(--c-primary));
}
/* 非当前月：「灰显」用 gray-500 而不是更浅的灰 —— 太浅（gray-400 及以下）在浅底上会跌破 4.5:1，
   但灰显本身又必须"淡下去"。gray-500 在 0.82 白底上实测 ≈4.6:1，既弱化又不影响读。 */
.dp-day.is-outside {
  color: #6b7280;
}
.dp-day.is-outside:hover {
  color: rgb(var(--c-primary));
}
/* 今天：虚线/描边圈出，与「选中」区分 */
.dp-day.is-today {
  border-color: rgb(var(--c-primary) / 0.55);
  font-weight: 700;
  color: rgb(var(--c-primary));
}
.dp-day.is-selected,
.dp-day.is-selected:hover {
  background: rgb(var(--c-primary));
  border-color: rgb(var(--c-primary));
  color: #ffffff;
  font-weight: 700;
}

.dp-cell-lg {
  padding: 0.5rem 0;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  background: transparent;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.dp-cell-lg:hover {
  background: rgb(var(--c-primary) / 0.14);
  color: rgb(var(--c-primary));
}
.dp-cell-lg.is-today {
  border-color: rgb(var(--c-primary) / 0.55);
  color: rgb(var(--c-primary));
  font-weight: 700;
}
.dp-cell-lg.is-selected,
.dp-cell-lg.is-selected:hover {
  background: rgb(var(--c-primary));
  border-color: rgb(var(--c-primary));
  color: #ffffff;
  font-weight: 700;
}

.dp-foot {
  margin-top: 0.625rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.35);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.dp-precision {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.25rem;
  padding: 2px;
  border-radius: 0.625rem;
  background: rgb(var(--c-primary) / 0.08);
}
.dp-precision-btn {
  padding: 0.3125rem 0.25rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  font-size: 0.6875rem;
  color: #4b5563;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.dp-precision-btn:hover {
  color: rgb(var(--c-primary));
}
.dp-precision-btn.is-active {
  background: rgb(var(--c-primary));
  color: #ffffff;
  font-weight: 700;
  box-shadow: 0 1px 4px rgb(var(--c-primary) / 0.35);
}

.dp-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.375rem;
}
.dp-action {
  padding: 0.375rem 0.5rem;
  border: 1px solid rgb(var(--c-primary) / 0.22);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.72);
  font-size: 0.75rem;
  color: rgb(var(--c-primary));
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.dp-action:hover {
  background: rgb(var(--c-primary) / 0.12);
  border-color: rgb(var(--c-primary) / 0.4);
}

.dp-note {
  margin: 0.5rem 0 0;
  font-size: 0.6875rem;
  line-height: 1.3;
  color: #b45309; /* amber-700 */
}

/* ==================== 深色（本工程用 body.dark + CSS 变量，不是 Tailwind dark:） ==================== */
/* 注意：scoped 里必须直接写 `.dark .xxx`，写 :global(.dark) 会被编译成空选择器 */
.dark .dp-panel {
  color: #e5e7eb;
}
.dark .dp-nav {
  color: #cbd5e1;
}
.dark .dp-nav:hover,
.dark .dp-title:hover {
  background: rgb(var(--c-primary-light) / 0.18);
  color: rgb(var(--c-primary-light));
}
.dark .dp-weekday {
  color: #94a3b8;
}
.dark .dp-day,
.dark .dp-cell-lg {
  color: #d1d5db;
}
.dark .dp-day:hover,
.dark .dp-cell-lg:hover {
  background: rgb(var(--c-primary-light) / 0.2);
  color: rgb(var(--c-primary-light));
}
.dark .dp-day.is-outside {
  /* 非本月日期需要「灰显」以弱化，但仍要过 4.5:1 —— 用全站统一次级文字色 gray-400 的深色变体，
     在深紫面板底上实测约 5.1:1，既淡下去又能看清 */
  color: #7c8ba5;
}
.dark .dp-day.is-outside:hover {
  color: rgb(var(--c-primary-light));
}
.dark .dp-day.is-today,
.dark .dp-cell-lg.is-today {
  border-color: rgb(var(--c-primary-light) / 0.7);
  color: rgb(var(--c-primary-light));
}
/* 深底上实色主紫对比度略紧，选中态改用亮变体底 + 深色字（对比度 > 7:1） */
.dark .dp-day.is-selected,
.dark .dp-day.is-selected:hover,
.dark .dp-cell-lg.is-selected,
.dark .dp-cell-lg.is-selected:hover {
  background: rgb(var(--c-primary-light));
  border-color: rgb(var(--c-primary-light));
  color: #1b1033;
}
.dark .dp-foot {
  border-top-color: rgba(255, 255, 255, 0.14);
}
.dark .dp-precision {
  background: rgba(255, 255, 255, 0.06);
}
.dark .dp-precision-btn {
  color: #cbd5e1;
}
.dark .dp-precision-btn:hover {
  color: rgb(var(--c-primary-light));
}
.dark .dp-precision-btn.is-active {
  background: rgb(var(--c-primary-light));
  color: #1b1033;
  box-shadow: none;
}
.dark .dp-action {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.16);
  color: rgb(var(--c-primary-light));
}
.dark .dp-action:hover {
  background: rgb(var(--c-primary-light) / 0.2);
  border-color: rgb(var(--c-primary-light) / 0.5);
}
.dark .dp-note {
  color: #fcd34d; /* amber-300 */
}
</style>
