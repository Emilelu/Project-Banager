<template>
  <div class="space-y-5">
    <!-- 请注意：本页面由弹窗改造而来，三大区块的交互逻辑与弹窗版完全一致，
         仅外壳从 fixed 遮罩换成普通页面流。 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-5 space-y-6">
      <!-- 玻璃风格 -->
            <section>
              <h4 class="text-sm font-bold text-gray-700 mb-2">{{ tt('theme.glassStyle') }}</h4>
              <div class="grid grid-cols-2 gap-3">
                <button @click="setGlass('frost')"
                  class="p-3 rounded-xl border-2 text-left transition-all btn-press"
                  :class="state.glass === 'frost' ? 'border-primary bg-primary/10' : 'border-primary/20 hover:border-primary/40'">
                  <div class="h-10 rounded-lg mb-2 frost-preview"></div>
                  <div class="text-sm font-bold text-gray-800 flex items-center gap-1.5"><AppIcon scale="sm" name="snowflake" class="text-primary" />{{ tt('theme.frosted') }}</div>
                  <div class="text-xs text-gray-400">{{ tt('theme.frostedDesc') }}</div>
                </button>
                <button @click="setGlass('liquid')"
                  class="p-3 rounded-xl border-2 text-left transition-all btn-press"
                  :class="state.glass === 'liquid' ? 'border-primary bg-primary/10' : 'border-primary/20 hover:border-primary/40'">
                  <div class="h-10 rounded-lg mb-2 liquid-preview"></div>
                  <div class="text-sm font-bold text-gray-800 flex items-center gap-1.5"><AppIcon scale="sm" name="droplet" class="text-primary" />{{ tt('theme.liquid') }}</div>
                  <div class="text-xs text-gray-400">{{ tt('theme.liquidDesc') }}</div>
                </button>
              </div>
            </section>

            <!-- 配色：按「选什么颜色 → 颜色从哪来」的决策顺序分层，
                 自定义取色收进折叠，避免一排颜色选择器把主流程冲散。 -->
            <section>
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-bold text-gray-700">{{ tt('theme.palette') }}</h4>
                <div class="flex items-center gap-1.5">
                  <button @click="onRandom" class="btn-base btn-primary !px-3 !py-1 !text-xs">
                    <AppIcon scale="xs" name="sparkle" />{{ tt('theme.randomPalette') }}
                  </button>
                  <button @click="onReset" :title="tt('theme.resetPalette')"
                    class="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10 transition btn-press">
                    <AppIcon scale="xs" name="undo" />
                  </button>
                </div>
              </div>

              <!-- ① 预设配色（最常用，一眼可选） -->
              <div class="flex gap-2.5 flex-wrap">
                <button v-for="preset in presets" :key="preset.key" @click="setPalette({ p: [...preset.p], s: [...preset.s] })"
                  class="w-10 h-10 rounded-full border-2 transition-all btn-press flex items-center justify-center overflow-hidden relative"
                  :class="isActivePreset(preset) ? 'border-gray-700 scale-110' : 'border-transparent hover:scale-105'"
                  :aria-label="tt(preset.key)" :title="tt(preset.key)">
                  <span class="w-full h-full" :style="{ background: `linear-gradient(135deg, ${hslCss(preset.p)}, ${hslCss(preset.s)})` }"></span>
                </button>
              </div>

              <!-- ② 配色来源：跟随壁纸 / 每次随机（互斥二选一，做成清晰的三段式） -->
              <div class="mt-3">
                <div class="text-xs text-gray-500 mb-1.5">{{ tt('theme.paletteSource') }}</div>
                <div class="grid grid-cols-2 gap-2">
                  <button @click="setPaletteMode('auto')" :disabled="noCorsSource"
                    :title="noCorsSource ? tt('theme.noCorsHint') : tt('theme.autoPickHint')"
                    class="seg-btn flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition btn-press border disabled:opacity-40 disabled:cursor-not-allowed"
                    :class="isPaletteAuto ? 'seg-active' : 'seg-idle'">
                    <AppIcon scale="xs" name="palette" />{{ tt('theme.pickFromWallpaper') }}
                  </button>
                  <button @click="setPaletteMode('random')"
                    class="seg-btn flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition btn-press border"
                    :class="state.paletteMode === 'random' ? 'seg-active' : 'seg-idle'">
                    <AppIcon scale="xs" name="refresh" />{{ tt('theme.randomEachRefresh') }}
                  </button>
                </div>
                <!-- 图源不支持跨域取色时，只提示一次（原先分散在按钮后缀 + 底部两条提示里） -->
                <p v-if="noCorsSource" class="tone-warning text-xs text-warning-dark mt-1.5 flex items-start gap-1">
                  <AppIcon scale="xs" name="warning" class="mt-0.5" />{{ tt('theme.noCorsWarning') }}
                </p>
              </div>

              <!-- ③ 自定义取色：低频高级项，默认折叠 -->
              <button @click="showCustomColor = !showCustomColor"
                class="mt-3 flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition btn-press">
                <AppIcon scale="xs" :name="showCustomColor ? 'caretUp' : 'caretDown'" />
                {{ tt('theme.customColor') }}
              </button>
              <!-- 折叠统一走 style.css 的 .collapse 过渡（grid-template-rows 0fr↔1fr）。
                   必须套两层：transition 根（grid 容器）→ 收缩层 → 内容卡片。
                   原因：style.css 的 `.collapse-*-active > *` 只把 overflow:hidden /
                   min-height:0 给了 transition 的**直接子元素**；若直接子元素就是带
                   padding/border/margin 的卡片，它自身的最小高度贡献仍会撑住 0fr
                   （实测 0fr 时仍有 ~30px，动画退化成瞬跳）。
                   故直接子元素必须是一层无 padding/margin 的收缩层，
                   卡片（mt-2 p-3）放它内部，超出部分由 overflow 裁掉。 -->
              <transition name="collapse">
                <div v-if="showCustomColor">
                  <div class="collapse-shell">
                    <div class="tone-panel mt-2 p-3 rounded-xl bg-white/50 border border-primary/15 flex items-center gap-2 flex-wrap">
                      <label class="flex items-center gap-1.5 text-xs text-gray-600">
                        {{ tt('theme.primary') }}
                        <ColorPicker :value="customP" size="2rem" :aria-label="tt('theme.customPrimary')" @input="customP = $event" />
                      </label>
                      <label class="flex items-center gap-1.5 text-xs text-gray-600">
                        {{ tt('theme.secondary') }}
                        <ColorPicker :value="customS" size="2rem" :aria-label="tt('theme.customSecondary')" @input="customS = $event" />
                      </label>
                      <button @click="applyCustom" class="btn-base btn-primary !px-3 !py-1 !text-xs">{{ tt('theme.applyCustom') }}</button>
                    </div>
                  </div>
                </div>
              </transition>
            </section>

            <!-- 背景图 -->
            <section>
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-bold text-gray-700">{{ tt('theme.wallpaper') }}</h4>
                <button @click="toggleBg" role="switch" :aria-checked="state.bgEnabled ? 'true' : 'false'"
                  :aria-label="state.bgEnabled ? tt('theme.bgOff') : tt('theme.bgOn')"
                  class="w-11 h-6 rounded-full transition-all relative btn-press"
                  :class="state.bgEnabled ? 'bg-gradient-to-r from-primary to-primary-dark' : 'bg-gray-300'">
                  <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" :class="state.bgEnabled ? 'left-[1.375rem]' : 'left-0.5'"></span>
                </button>
              </div>
              <template v-if="state.bgEnabled">
                <div class="flex items-center gap-2 flex-wrap">
                  <select v-model="state.bgProvider"
                    class="tone-input flex-1 min-w-0 px-3 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white/80">
                    <option value="alcy">{{ tt('theme.providerAlcy') }}</option>
                    <option value="dmoe">{{ tt('theme.providerDmoe') }}</option>
                    <option value="loliapi">{{ tt('theme.providerLoliapi') }}</option>
                    <option value="custom">{{ tt('theme.customUrl') }}</option>
                  </select>
                  <!-- 改用主题色渐变（.btn-toned）：原先写死 secondary 渐变，
                       主题色偏粉时「白字压浅粉」对比度不足；.btn-toned 的主色→副色深端
                       已按浅色背景收敛，白字始终可读。 -->
                  <button v-if="state.bgProvider !== 'custom'" @click="onShuffle"
                    :aria-label="tt('theme.changeOne')"
                    class="btn-base btn-toned !px-3 !py-2 !text-xs shrink-0">
                    <AppIcon scale="xs" name="refresh" /> {{ tt('theme.changeOne') }}
                  </button>
                </div>
                <input v-if="state.bgProvider === 'custom'" v-model="state.bgCustomUrl" type="text" :placeholder="tt('theme.customUrlPlaceholder')"
                  class="tone-input w-full mt-2 px-3 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white/80" />
                  <p v-if="state.bgProvider === 'custom'" class="text-xs text-gray-400 mt-1.5">{{ tt('theme.customUrlHint') }}</p>
                  <!-- 自动换图 / 固定壁纸：自定义图源由用户指定固定地址，无换图概念，整块隐藏 -->
                  <!-- 两个模式按钮常驻显示、互斥高亮：点「自动换一张」就是开自动换图，
                       点「固定当前壁纸」就是固定当前这张（内部把随机端点解析为稳定地址）。
                       不再用"当前状态即下一步动作"的 toggle，避免点一下反而固定/换掉的歧义 -->
                  <div v-if="state.bgProvider !== 'custom'" class="mt-2 flex items-center gap-2 flex-wrap">
                    <!-- 选中态用「白底 + 主题色描边 + 深色文字」而不是「同色系淡底 + 同色系深字」：
                         后者在主题色偏红/偏粉时会"红字压红底"糊成一片，辨识度差。深色模式由
                         style.css 的 .dark .seg-btn.* 规则反转（半透明白底 + 亮色描边 + 白字）。 -->
                    <button @click="setAutoSwitch(true)"
                      class="seg-btn flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition btn-press border"
                      :class="state.bgAutoSwitch ? 'seg-active' : 'seg-idle'">
                      <AppIcon scale="xs" name="refresh" class="inline-block" /> {{ tt('theme.autoChange') }}
                    </button>
                    <button @click="setAutoSwitch(false)"
                      :title="tt('theme.autoSwitchHint')"
                      class="seg-btn flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition btn-press border"
                      :class="!state.bgAutoSwitch ? 'seg-active' : 'seg-idle'">
                      <AppIcon scale="xs" name="bookmark" class="inline-block" /> {{ tt('theme.fixCurrent') }}
                    </button>
                  </div>
                <div v-if="state.bgUrl" class="mt-3">
                  <!-- 预览走降采样缩略图：大分辨率原图直接解码会造成弹窗卡顿，
                       这里展示 buildPreview 生成的 1600px 内 blob URL（见 script 说明）；
                       生成中显示骨架，降级失败才回退原图直出 -->
                  <div class="tone-preview w-full h-28 rounded-xl border border-white/40 overflow-hidden relative bg-white/40">
                    <img v-if="previewSrc" :src="previewSrc" @error="onBgError" @load="bgLoaded = true"
                      loading="lazy" decoding="async" class="w-full h-full object-cover" :alt="tt('theme.backgroundPreview')" />
                    <img v-else-if="previewFailed" :src="state.bgBlobUrl || state.bgUrl" @error="onBgError" @load="bgLoaded = true"
                      loading="lazy" decoding="async" class="w-full h-full object-cover" :alt="tt('theme.backgroundPreview')" />
                    <div v-else class="absolute inset-0 animate-pulse bg-white/50"></div>
                  </div>
                  <div class="flex items-center gap-2 mt-1.5">
                    <p v-if="bgFailed" class="tone-danger text-xs text-danger flex-1">{{ tt('theme.previewFailed') }}</p>
                    <button @click="openOriginal"
                      class="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition btn-press shrink-0"
                      :title="tt('theme.openOriginalHint')"><AppIcon scale="xs" name="link" />{{ tt('theme.openOriginal') }}</button>
                    <button @click="downloadOriginal"
                      class="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition btn-press shrink-0"
                      :title="tt('theme.downloadOriginalHint')"><AppIcon scale="xs" name="download" />{{ tt('theme.downloadOriginal') }}</button>
                  </div>
                  <p v-if="noCorsSource" class="tone-warning text-xs text-warning-dark/90 mt-1 leading-relaxed">
                    ⓘ {{ tt('theme.noCorsDetail') }}
                  </p>
                </div>
                <!-- 遮罩/模糊属于低频微调：默认折叠，避免弹窗被撑到必须滚动，
                     导致底部控件被裁（原先「遮罩浓度」滑块就被切掉一半）。 -->
                <div class="mt-3 flex items-center justify-between">
                  <button @click="showTuning = !showTuning"
                    class="tone-fold flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition btn-press"
                    :aria-expanded="showTuning">
                    <AppIcon scale="xs" :name="showTuning ? 'caretUp' : 'caretDown'" />
                    {{ tt('theme.tuning') }}
                  </button>
                  <!-- 「恢复默认」是展开后才出现的附属动作：单独淡入，不和折叠主体抢动画 -->
                  <transition name="fade">
                    <button v-if="showTuning" @click="resetBgTuning" :title="tt('theme.resetMaskBlurHint')"
                      class="tone-fold px-2 py-1 rounded-lg text-[0.6875rem] text-gray-400 hover:text-primary hover:bg-primary/5 transition btn-press shrink-0"><AppIcon scale="xs" name="undo" class="mr-0.5 inline-block align-middle" />{{ tt('theme.resetMaskBlur') }}</button>
                  </transition>
                </div>
                <!-- 对比度：容器底是半透明白，透出壁纸后浅灰文字明显不够看。
                     这里把标签与数值统一提到 text-700 级别并加 font-medium，
                     实测在亮/暗壁纸下都 ≥4.5:1。
                     深色模式：容器底会变成深紫半透明（见本文件 <style scoped> 的
                     .tone-tuning），浅色字改由 .tone-num / .tone-label 接管。 -->
                <transition name="collapse">
                  <div v-if="showTuning">
                    <div class="collapse-shell">
                      <div class="tone-tuning mt-2 p-3 rounded-xl bg-white/70 border border-primary/15 space-y-2.5">
                        <label class="tone-label flex items-center gap-3 text-xs font-medium" style="color: rgb(var(--txt-card-700, 55 48 70))">
                          <span class="w-14 shrink-0">{{ tt('theme.maskOpacity') }}</span>
                          <input type="range" min="0" max="0.9" step="0.05" v-model.number="state.bgDim" @input="applyBackground()"
                            class="flex-1 accent-pink-500" :aria-label="tt('theme.maskOpacity')" />
                          <span class="tone-num w-9 text-right font-mono font-semibold">{{ Math.round(state.bgDim * 100) }}%</span>
                        </label>
                        <label class="tone-label flex items-center gap-3 text-xs font-medium" style="color: rgb(var(--txt-card-700, 55 48 70))">
                          <span class="w-14 shrink-0">{{ tt('theme.blur') }}</span>
                          <input type="range" min="0" max="20" step="1" v-model.number="state.bgBlur" @input="applyBackground()"
                            class="flex-1 accent-pink-500" :aria-label="tt('theme.blur')" />
                          <span class="tone-num w-9 text-right font-mono font-semibold">{{ state.bgBlur }}px</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </transition>
              </template>
              <p v-else class="tone-meta text-xs text-gray-400">{{ tt('theme.bgOffHint') }}</p>
            </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAppearance, hexToHsl, hslCss, isCrossOrigin, getWallpaperBlob, providerBlocksPalette, sanitizeImageUrl } from '../composables/useAppearance'
import { showToast } from '../composables/useToast'
import { useI18n } from '../composables/useI18n'

const { tt } = useI18n()

const { state, setGlass, setPalette, setPaletteMode, setAutoSwitch, randomizePalette, shuffleBackground, applyCustomBackground, toggleBackground, applyBackground } = useAppearance()

const bgLoaded = ref(false)
const bgFailed = ref(false)

// 当前图源是否「无跨域许可」（alcy/dmoe 不返回 ACAO 头）→ 三处影响：
//   ① 取色不可用 → 禁用「跟随壁纸取色」（自动降级在 useAppearance 的 bgProvider watch 中）
//   ② 无法读取字节 → 「下载原图」降级为打开原图后另存
//   ③ 随机端点 + 无法读取重定向目标 → 预览/原链接打开的图无法保证与背景是同一张
const noCorsSource = computed(() => providerBlocksPalette(state.bgProvider))

// —— 预览图降采样：原图分辨率过高（4K/8K）时，弹窗打开会因解码整张位图而卡顿。
// 这里把预览改为「离主线程解码 + 缩小到 1600px 内 + 编码为小尺寸 blob URL」的缩略图，
// 弹窗内 <img> 只渲染小图，原图永远不在弹窗里解码。
// 注意：tc.alcy.cc 等图床直链无 CORS 头，直接 fetch 会被拦，需走与取色一致的代理链兜底。
const MAX_PREVIEW_SIDE = 1600
const PREVIEW_PROXIES = [
  (u) => `https://proxy.cors.sh/${u}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://images.weserv.nl/?url=${encodeURIComponent(u.replace(/^https?:\/\//, ''))}`,
]
const previewSrc = ref('')       // 降采样后的预览地址（blob URL / 空=生成中）
const previewFailed = ref(false) // 降采样不可用/失败 → 退回原图直出
let previewGen = 0               // 代际计数：迟到的异步结果不覆盖新预览
let previewUrl = ''              // 当前 blob URL，换图/卸载时 revoke

async function buildPreview(url) {
  // ① 已有主程序缓存的字节：直接把它的 blob URL 交给 <img> 即可，无需降采样。
  //    降采样本意是「避免在弹窗里解码 4K 原图造成卡顿」，而这张图主背景早已解码，
  //    浏览器会复用同一份位图 → 零额外开销，省掉 createImageBitmap + canvas 编码两趟活。
  //    注意：cached.url 与主背景共用，**不可 revoke**，故不记入 previewUrl。
  const cached = getWallpaperBlob()
  if (cached?.url) {
    previewGen++ // 作废在途的降采样任务
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      previewUrl = ''
    }
    previewSrc.value = cached.url
    previewFailed.value = false
    return
  }
  // ② 无字节缓存（无 CORS 图源）：跨域图源既抓不到字节、代理链也已全部失效，
  //    直接标记「原图直出」——<img> 加载跨域图不受 CORS 限制，照常显示。
  //    顺带避免三次注定失败的代理请求刷满 console 红错。
  if (isCrossOrigin(url)) {
    previewFailed.value = true
    return
  }
  // ③ 同源图：本地抓取 + 降采样（避免在弹窗里解码大图造成卡顿）
  // 太老的浏览器不支持 createImageBitmap：直接退回原图
  if (typeof createImageBitmap !== 'function') {
    previewFailed.value = true
    return
  }
  const gen = ++previewGen
  previewFailed.value = false
  let blob = getWallpaperBlob()?.blob || null
  const grab = async (u) => {
    const r = await fetch(u)
    if (!r.ok) throw new Error('fetch failed')
    return r.blob()
  }
  // ② 无缓存时再抓：直连仅用于同源（custom / blob URL）；跨域图床（tc.alcy.cc 等无 CORS 头）
  //    直接走代理链，跳过必败的直连 fetch——避免 console 刷 CORS 红错
  if (!blob) {
    const sources = isCrossOrigin(url)
      ? PREVIEW_PROXIES.map((make) => make(url))
      : [url, ...PREVIEW_PROXIES.map((make) => make(url))]
    for (const u of sources) {
      try {
        blob = await grab(u)
        if (blob) break
      } catch {}
    }
  }
  if (gen !== previewGen) return
  if (!blob) {
    previewFailed.value = true
    return
  }
  let u = ''
  try {
    // 离主线程解码原图，确认尺寸后再决定是否缩小（避免把小图放大糊掉）
    let bmp = await createImageBitmap(blob)
    if (gen !== previewGen) {
      bmp.close()
      return
    }
    if (bmp.width > MAX_PREVIEW_SIDE || bmp.height > MAX_PREVIEW_SIDE) {
      // 只传较长边做等比缩放：resizeWidth 与 resizeHeight 同时传会独立缩放导致变形
      const opts =
        bmp.width >= bmp.height
          ? { resizeWidth: MAX_PREVIEW_SIDE, resizeQuality: 'medium' }
          : { resizeHeight: MAX_PREVIEW_SIDE, resizeQuality: 'medium' }
      const small = await createImageBitmap(bmp, opts)
      bmp.close()
      bmp = small
    }
    if (gen !== previewGen) {
      bmp.close()
      return
    }
    // 编码为小尺寸 blob URL（webp 保留透明通道；不支持时浏览器自动退回 png）
    const cv = document.createElement('canvas')
    cv.width = bmp.width
    cv.height = bmp.height
    const ctx = cv.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    bmp.close()
    const smallBlob = await new Promise((res) => cv.toBlob(res, 'image/webp', 0.9))
    if (gen !== previewGen) return
    if (!smallBlob) throw new Error('encode failed')
    u = URL.createObjectURL(smallBlob)
  } catch {
    if (gen !== previewGen) return
    previewFailed.value = true
    return
  }
  if (gen !== previewGen) {
    URL.revokeObjectURL(u)
    return
  }
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = u
  previewSrc.value = u
  previewFailed.value = false
}

function resetPreview() {
  previewGen++ // 作废在途降采样请求
  previewSrc.value = ''
  previewFailed.value = false
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl)
    previewUrl = ''
  }
}

watch(
  // 监听「实际渲染用的地址」：带 CORS 图源抓取到字节后会更新 bgBlobUrl，此处随之重建预览，
  // 确保预览用的是与背景同一份字节（随机端点才不会预览成另一张）。
  () => (state.bgEnabled ? state.bgBlobUrl || state.bgUrl : ''),
  (url) => {
    if (!url) {
      resetPreview()
      return
    }
    previewSrc.value = ''
    buildPreview(url)
  },
)

onUnmounted(resetPreview)

// 记录进入页面时的图源，用于判断是否切换了图源并立即应用。
// 弹窗版靠 watch(props.show) 重置；页面版在挂载时记录一次即可。
const providerAtOpen = ref(state.bgProvider)
onMounted(() => { providerAtOpen.value = state.bgProvider })

const presets = [
  { key: 'preset.sakura', p: [263, 67, 55], s: [329, 81, 60] },
  { key: 'preset.ocean', p: [215, 85, 55], s: [190, 85, 46] },
  { key: 'preset.pink', p: [340, 80, 60], s: [280, 55, 62] },
  { key: 'preset.mint', p: [172, 70, 42], s: [200, 85, 55] },
  { key: 'preset.dusk', p: [25, 90, 55], s: [345, 80, 58] },
  { key: 'preset.berry', p: [288, 60, 55], s: [320, 75, 55] },
]

const isActivePreset = (preset) =>
  state.palette && state.palette.p[0] === preset.p[0] && state.palette.s[0] === preset.s[0]

// 自定义取色：低频高级项，默认折叠起来，避免一排颜色选择器冲散主流程
const showCustomColor = ref(false)
// 遮罩浓度 / 背景模糊属于低频微调项，默认折叠以压缩弹窗高度
const showTuning = ref(false)

// 「跟随壁纸取色」是否处于可用且选中状态（图源不支持跨域取色时视为不可用）
const isPaletteAuto = computed(() => state.paletteMode === 'auto' && !noCorsSource.value)

// 自定义取色器（默认给当前色 / 默认色）
const customP = ref('#7C3AED')
const customS = ref('#EC4899')
const applyCustom = () => {
  setPalette({ p: hexToHsl(customP.value), s: hexToHsl(customS.value) })
}

// 恢复遮罩/模糊默认值（与应用默认一致：25% / 5px）
const resetBgTuning = () => {
  state.bgDim = 0.25
  state.bgBlur = 5
  applyBackground()
  showToast(tt('toast.maskBlurReset'))
}

const onRandom = () => {
  setPaletteMode('manual')
  randomizePalette()
  showToast(tt('toast.paletteRandomized'))
}

// 恢复默认配色：回到默认模式「跟随壁纸取色」（须与 state.paletteMode 的默认值保持一致）
const onReset = () => {
  setPaletteMode('auto')
  showToast(tt('toast.paletteReset'))
}

const toggleBg = async () => {
  // 复用引擎的一键开关：开启时无图自动取一张，错误统一由引擎提示
  await toggleBackground()
}

const onShuffle = async () => {
  bgLoaded.value = false
  bgFailed.value = false
  try {
    await shuffleBackground()
    showToast(tt('toast.wallpaperChanged'))
  } catch (e) {
    showToast(e.message || tt('toast.fetchWallpaperFailed'), 'error')
  }
}

/**
 * 应用壁纸变更：图源或地址有变化时立即生效并持久化。
 * 弹窗版由「完成」按钮触发；页面版改为图源/地址变化时自动调用，
 * 用户改完立刻能看到效果，不需要额外确认动作。
 */
const applyWallpaperChanges = async () => {
  if (state.bgEnabled) {
    if (state.bgProvider === 'custom') {
      // 自定义图源：应用地址（为空则报错并留在面板内让用户补填）
      const url = state.bgCustomUrl.trim()
      if (!url) {
        showToast(tt('toast.pleaseEnterUrl'), 'error')
        return
      }
      if (state.bgUrl !== url) {
        applyCustomBackground()
        bgFailed.value = false
        showToast(tt('toast.customWallpaperApplied'))
      }
    } else if (state.bgProvider !== providerAtOpen.value) {
      // 随机图源：切换了图源，立即取一张
      bgLoaded.value = false
      bgFailed.value = false
      try {
        await shuffleBackground()
        showToast(tt('toast.wallpaperUpdated'))
      } catch (e) {
        showToast(e.message || tt('toast.fetchWallpaperFailed'), 'error')
        return
      }
    }
  }
}

const onBgError = () => {
  bgFailed.value = true
  showToast(tt('toast.wallpaperLoadFailed'), 'error')
}

// 在新标签页打开当前壁纸链接。
// 有本地字节缓存（带 CORS 的图源）时用缓存的 blob —— 打开的必是背景这张；
// 无缓存（无 CORS 图源）时打开原始链接，此时因服务端是随机端点，可能抽到另一张。
const openOriginal = () => {
  const url = getWallpaperBlob()?.url || state.bgUrl
  const safe = sanitizeImageUrl(url || '')
  if (!safe) return
  window.open(safe, '_blank', 'noopener,noreferrer')
}

// 下载原图：优先使用主程序缓存的壁纸字节——它与背景、预览是**同一张**，且无需任何代理。
// 无缓存（无 CORS 图源）时才退回代理链；代理已全部失效，此时给出可执行的替代提示。
const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}
const downloadOriginal = async () => {
  showToast(tt('toast.downloading'))
  let blob = getWallpaperBlob()?.blob || null
  if (!blob) {
    const url = state.bgUrl
    if (!url) return
    // 跨域图床直连必被拦：走代理链兜底（当前三家代理均已失效，仅作最后尝试）
    const sources = isCrossOrigin(url)
      ? PREVIEW_PROXIES.map((make) => make(url))
      : [url, ...PREVIEW_PROXIES.map((make) => make(url))]
    for (const u of sources) {
      try {
        const r = await fetch(u)
        if (!r.ok) continue
        const b = await r.blob()
        if (b && b.size) {
          blob = b
          break
        }
      } catch {}
    }
  }
  if (!blob || !blob.size) {
    // 跨域图源无法用 JS 取字节：能「渲染」不等于能「读取」（同源策略），
    // 且跨域 <a download> 的 download 属性会被浏览器直接忽略；代理链也已全部失效。
    // 降级为「打开原图」——浏览器能正常显示图片，用户右键另存即可，不再报错了事。
    const fallback = sanitizeImageUrl(state.bgUrl || '')
    if (fallback) {
      window.open(fallback, '_blank', 'noopener,noreferrer')
      showToast(tt('toast.downloadNotAllowed'), 'warning')
    } else {
      showToast(tt('toast.noWallpaperToDownload'), 'error')
    }
    return
  }
  const objUrl = URL.createObjectURL(blob)
  // 扩展名以实际 MIME 为准：URL 多数无扩展名，旧逻辑一律写 .jpg 与实际 webp 不符
  const urlExt = (state.bgUrl.match(/\.(jpg|jpeg|png|webp|gif|avif)(?:\?|$)/i) || [])[1]
  const ext = MIME_EXT[blob.type] || (urlExt ? urlExt.toLowerCase() : 'jpg')
  const a = document.createElement('a')
  a.href = objUrl
  a.download = `banager-wallpaper-${Date.now()}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objUrl), 60000)
  showToast(tt('toast.downloadStarted'))
}

// 切换图源后提示重新换图
watch(() => state.bgProvider, () => { bgLoaded.value = false; bgFailed.value = false })
</script>

<style scoped>
/*
 * 折叠过渡的收缩层（transition 的直接子元素）。
 *
 * style.css 里 `.collapse-*-active > *` 已经给了 overflow:hidden / min-height:0，
 * 但这里再显式声明一次：该选择器带一个元素选择器通配，scoped 样式编译后 specificity
 * 可能不足/受顺序影响，显式写在本组件更稳妥（且不依赖 style.css 的书写顺序）。
 * 同时把 margin 归零：折叠层不允许自身携带外边距，否则 0fr 时仍会留白。
 */
.collapse-shell {
  overflow: hidden;
  min-height: 0;
  margin: 0;
}

.frost-preview {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.liquid-preview {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.25));
  backdrop-filter: blur(6px) saturate(1.6);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.9), 0 4px 14px rgba(31, 38, 135, 0.18);
}
.dark .frost-preview,
.dark .liquid-preview {
  background: rgba(255, 255, 255, 0.12);
}

/*
 * 深色模式下的材质与文字色。
 *
 * 机制说明：本项目深色模式是 html/body 上的 .dark 类 + style.css「暗色模式」区段里
 * 成组的 `.dark .xxx` 覆盖规则，没有配 darkMode: 'class' 的 dark: 前缀变体。
 * 所以这里沿用同一套写法：`.dark .xxx`（scoped 会编译成 `.dark .xxx[data-v-xxx]`），
 * 作用域仍锁在本页。浅色模式完全不进入这些规则，观感与原来一致。
 *
 * 为什么必须逐处补：style.css 的深色区段只反转了 bg-white/20、/30、/40，
 * 本页用到的 bg-white/50、/70、/80 没有对应规则 —— 深色下仍是浅色半透明白底，
 * 而文字已被 `.dark .text-gray-xxx` 统一改成浅灰，于是出现「浅底白字」。
 */

/* 「遮罩与模糊」折叠区：深色下改成深紫半透明，与 .glass 卡片拉开层次 */
.dark .tone-tuning {
  background: rgba(20, 15, 40, 0.55);
  border-color: rgba(255, 255, 255, 0.12);
}

/* 滑块标签：0.75rem 属小字，按 4.5:1 要求，用 #e2e8f0 而不是原来压浅底用的深色。
   注意：深色下不能用 rgb(var(--txt-card-700))——applyAdaptiveText 会把 --txt-card-*
   按「深色卡片」重算成深色系，压在深底上反而不可读。 */
.dark .tone-label {
  color: #e2e8f0 !important;
}

/* 右侧数值（原来是引用了并不存在的 --txt-card-800，回退值实际未生效） */
.dark .tone-num {
  color: #f1f5f9 !important;
}

/* 浅色模式：标签与数值统一用 --txt-card-700。
   实测：开壁纸后 applyAdaptiveText 按「卡片有效亮度」把 --txt-card-700 算成
   rgb(101 115 139)，压在半透明白折叠区（透出壁纸后约 rgb(241 235 255)）上
   只有 4.13:1，不到 4.5。这里直接把这两个元素的底色压得更实（bg-white/70 →
   更高不透明度），让「卡片有效亮度」与实际呈现一致，从而把对比度拉回 4.5 以上。 */
html:not(.dark) .tone-tuning {
  background: rgba(255, 255, 255, 0.9);
}

/* 浅色模式：数值沿用与标签同档的 --txt-card-700，保证与原设计一致且 ≥4.5:1 */
html:not(.dark) .tone-num {
  color: rgb(var(--txt-card-700, 55 48 70));
}

/* 自定义取色面板：深色半透明底替代 bg-white/50 */
.dark .tone-panel {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.14);
}

/* 壁纸预览框：深色下改深底，避免浅底把图片边缘吃掉 */
.dark .tone-preview {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.14);
}

/* 输入框 / 下拉：覆盖 bg-white/80 的白底与浅色字 */
.dark .tone-input {
  background: rgba(20, 15, 40, 0.55) !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
  color: #e2e8f0 !important;
}

/* 折叠标题（「自定义取色」「遮罩与模糊」等入口按钮）与说明文字：
   原为 text-gray-400（深色下被 .dark 规则提到 #7c8ba5，压在深底仅 ~3.4:1），
   这里再提一档到 #a9b6cc 以满足小字 4.5:1。
   注：hover 不要用 --c-primary-light（实测压在深底只有 4.33:1），
   改用更亮的 #c4b5fd，小字仍 ≥4.5:1 且仍能看出「被高亮」。 */
.dark .tone-fold,
.dark .tone-meta {
  color: #a9b6cc !important;
}
.dark .tone-fold:hover {
  color: #c4b5fd !important;
}

/* 危险 / 警告文字：原色在深底偏暗，提亮到 300 档 */
.dark .tone-danger {
  color: #fca5a5 !important;
}
.dark .tone-warning {
  color: #fcd34d !important;
}
</style>
