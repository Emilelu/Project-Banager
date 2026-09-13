<template>
  <Teleport to="body">
    <transition name="modal-overlay">
      <div v-if="show" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="$emit('close')"></div>
    </transition>
    <transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <!-- 结构：外层 flex 列 + overflow-hidden；标题栏与底部栏在**滚动容器之外**，
             只有中间内容区滚动。
             此前标题/底部是 sticky、位于滚动容器内，宽度会被滚动条挤掉 6px，
             右侧露出 track 底色 —— 看上去像弹窗上下缺了两块。
             移出滚动容器后二者天然占满全宽，也就不再需要 sticky。 -->
        <div class="relative glass rounded-2xl shadow-2xl w-[34rem] max-h-[85vh] border border-white/40 pointer-events-auto flex flex-col overflow-hidden">
          <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2 glass rounded-t-2xl shrink-0 z-10">
            <span class="text-xl">🎨</span>
            <h3 class="text-lg font-bold gradient-text">主题与背景</h3>
          </div>

          <!-- 唯一滚动容器：滚动条只出现在中间区域，不再与标题/底部栏争宽度 -->
          <div class="flex-1 overflow-y-auto app-dialog px-6 py-5 space-y-6">
            <!-- 玻璃风格 -->
            <section>
              <h4 class="text-sm font-bold text-gray-700 mb-2">玻璃风格</h4>
              <div class="grid grid-cols-2 gap-3">
                <button @click="setGlass('frost')"
                  class="p-3 rounded-xl border-2 text-left transition-all btn-press"
                  :class="state.glass === 'frost' ? 'border-primary bg-primary/10' : 'border-primary/20 hover:border-primary/40'">
                  <div class="h-10 rounded-lg mb-2 frost-preview"></div>
                  <div class="text-sm font-bold text-gray-800">🧊 毛玻璃</div>
                  <div class="text-xs text-gray-400">经典柔和模糊</div>
                </button>
                <button @click="setGlass('liquid')"
                  class="p-3 rounded-xl border-2 text-left transition-all btn-press"
                  :class="state.glass === 'liquid' ? 'border-primary bg-primary/10' : 'border-primary/20 hover:border-primary/40'">
                  <div class="h-10 rounded-lg mb-2 liquid-preview"></div>
                  <div class="text-sm font-bold text-gray-800">💧 液态玻璃</div>
                  <div class="text-xs text-gray-400">高光折射 · 更通透</div>
                </button>
              </div>
            </section>

            <!-- 配色 -->
            <section>
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-bold text-gray-700">配色</h4>
                <button @click="onRandom" class="px-3 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-primary to-primary-light text-white hover:shadow-lg hover:shadow-primary/30 transition-all btn-press">🎲 随机配色</button>
              </div>
              <div class="flex gap-2.5 flex-wrap">
                <button v-for="preset in presets" :key="preset.name" @click="setPalette({ p: [...preset.p], s: [...preset.s] })"
                  class="w-10 h-10 rounded-full border-2 transition-all btn-press flex items-center justify-center overflow-hidden relative"
                  :class="isActivePreset(preset) ? 'border-gray-700 scale-110' : 'border-transparent hover:scale-105'"
                  :title="preset.name">
                  <span class="w-full h-full" :style="{ background: `linear-gradient(135deg, ${hslCss(preset.p)}, ${hslCss(preset.s)})` }"></span>
                </button>
              </div>
              <div class="flex items-center gap-2 mt-3 flex-wrap">
                <label class="flex items-center gap-1.5 text-xs text-gray-500">
                  主色 <input type="color" v-model="customP" class="w-8 h-8 rounded-lg cursor-pointer border border-primary/20 bg-transparent p-0.5" />
                </label>
                <label class="flex items-center gap-1.5 text-xs text-gray-500">
                  副色 <input type="color" v-model="customS" class="w-8 h-8 rounded-lg cursor-pointer border border-primary/20 bg-transparent p-0.5" />
                </label>
                <button @click="applyCustom" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition btn-press">应用自定义</button>
                <button @click="onReset" class="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 transition btn-press">↺ 恢复默认</button>
              </div>
              <div class="mt-3 flex items-center gap-2 flex-wrap">
                <button @click="setPaletteMode('auto')" :disabled="noCorsSource"
                  :title="noCorsSource ? '当前图源无跨域许可，无法读取像素取色；如需取色请改用 Loliapi 或支持 CORS 的自定义图源' : '换壁纸后自动提取主色调'"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition btn-press border disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-inherit"
                  :class="state.paletteMode === 'auto' && !noCorsSource ? 'bg-accent/10 border-accent/50 text-accent-dark' : 'bg-gray-100 border-transparent text-gray-500'">
                  🎨 跟随壁纸取色{{ noCorsSource ? '（当前图源不可用）' : '' }}
                </button>
                <button @click="setPaletteMode('random')"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition btn-press border"
                  :class="state.paletteMode === 'random' ? 'bg-primary/10 border-primary/40 text-primary-dark' : 'bg-gray-100 border-transparent text-gray-500'">
                  🎲 每次刷新随机配色
                </button>
              </div>
              <p class="text-xs text-gray-400 mt-1.5">「跟随壁纸取色」会在换壁纸后自动提取主色调；「每次刷新随机」每次打开随机配色；选用下方预设或自定义则固定。
                <span v-if="noCorsSource" class="text-warning-dark/90">未配置跨域代理：当前图源像素不可读，取色无法进行 —— 部署 Cloudflare Worker 后即可恢复。</span>
              </p>
            </section>

            <!-- 背景图 -->
            <section>
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-bold text-gray-700">随机壁纸背景</h4>
                <button @click="toggleBg" class="w-11 h-6 rounded-full transition-all relative btn-press"
                  :class="state.bgEnabled ? 'bg-gradient-to-r from-primary to-primary-light' : 'bg-gray-300'">
                  <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" :class="state.bgEnabled ? 'left-[1.375rem]' : 'left-0.5'"></span>
                </button>
              </div>
              <template v-if="state.bgEnabled">
                <div class="flex items-center gap-2 flex-wrap">
                  <select v-model="state.bgProvider"
                    class="flex-1 min-w-0 px-3 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white/80">
                    <option value="alcy">Alcy（默认｜图质最佳）</option>
                    <option value="dmoe">dmoe</option>
                    <option value="loliapi">Loliapi（图库较旧）</option>
                    <option value="custom">自定义图片地址</option>
                  </select>
                  <button v-if="state.bgProvider !== 'custom'" @click="onShuffle"
                    class="px-3 py-2 rounded-xl text-xs font-medium bg-gradient-to-r from-secondary to-secondary-light text-white hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press">
                    🔄 换一张
                  </button>
                </div>
                <input v-if="state.bgProvider === 'custom'" v-model="state.bgCustomUrl" type="text" placeholder="https://... 直链图片地址"
                  class="w-full mt-2 px-3 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white/80" />
                <p v-if="state.bgProvider === 'custom'" class="text-xs text-gray-400 mt-1.5">填写直链后点击「完成」即应用并保存，无需再点「换一张」。</p>
                <!-- 自动换图 / 固定壁纸：自定义图源由用户指定固定地址，无换图概念，整块隐藏 -->
                <!-- 两个模式按钮常驻显示、互斥高亮：点「自动换一张」就是开自动换图，
                     点「固定当前壁纸」就是固定当前这张（内部把随机端点解析为稳定地址）。
                     不再用"当前状态即下一步动作"的 toggle，避免点一下反而固定/换掉的歧义 -->
                <div v-if="state.bgProvider !== 'custom'" class="mt-2 flex items-center gap-2 flex-wrap">
                  <button @click="setAutoSwitch(true)"
                    class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition btn-press border"
                    :class="state.bgAutoSwitch ? 'bg-primary/10 border-primary/40 text-primary-dark' : 'bg-gray-100 border-transparent text-gray-500'">
                    🔄 每次打开自动换一张
                  </button>
                  <button @click="setAutoSwitch(false)"
                    title="固定为当前这张壁纸，刷新不再换图（需跨域代理可用才能解析出稳定图床地址）"
                    class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition btn-press border"
                    :class="!state.bgAutoSwitch ? 'bg-primary/10 border-primary/40 text-primary-dark' : 'bg-gray-100 border-transparent text-gray-500'">
                    📌 固定当前壁纸
                  </button>
                </div>
                <div v-if="state.bgUrl" class="mt-3">
                  <!-- 预览走降采样缩略图：大分辨率原图直接解码会造成弹窗卡顿，
                       这里展示 buildPreview 生成的 1600px 内 blob URL（见 script 说明）；
                       生成中显示骨架，降级失败才回退原图直出 -->
                  <div class="w-full h-28 rounded-xl border border-white/40 overflow-hidden relative bg-white/40">
                    <img v-if="previewSrc" :src="previewSrc" @error="onBgError" @load="bgLoaded = true"
                      loading="lazy" decoding="async" class="w-full h-full object-cover" alt="背景预览" />
                    <img v-else-if="previewFailed" :src="state.bgBlobUrl || state.bgUrl" @error="onBgError" @load="bgLoaded = true"
                      loading="lazy" decoding="async" class="w-full h-full object-cover" alt="背景预览" />
                    <div v-else class="absolute inset-0 animate-pulse bg-white/50"></div>
                  </div>
                  <div class="flex items-center gap-2 mt-1.5">
                    <p v-if="bgFailed" class="text-xs text-danger flex-1">⚠️ 图片加载失败，请换一张</p>
                    <button @click="openOriginal"
                      class="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition btn-press shrink-0"
                      title="在新标签页打开当前壁纸链接">🔗 原链接预览</button>
                    <button @click="downloadOriginal"
                      class="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition btn-press shrink-0"
                      title="下载当前壁纸原图；该图源不允许跨域读取时会自动在新标签页打开原图，供右键另存">⬇ 下载原图</button>
                  </div>
                  <p v-if="noCorsSource" class="text-xs text-warning-dark/90 mt-1 leading-relaxed">
                    ⓘ 未配置跨域代理：当前图源不返回跨域许可，取色、下载与「预览一致」均不可用 —— 部署 Cloudflare Worker 后即可全部恢复。
                  </p>
                </div>
                <div class="mt-3 space-y-2">
                  <label class="flex items-center gap-3 text-xs text-gray-500">
                    <span class="w-16 shrink-0">遮罩浓度</span>
                    <input type="range" min="0" max="0.9" step="0.05" v-model.number="state.bgDim" @input="applyBackground()"
                      class="flex-1 accent-pink-500" />
                    <span class="w-10 text-right font-mono">{{ Math.round(state.bgDim * 100) }}%</span>
                  </label>
                  <label class="flex items-center gap-3 text-xs text-gray-500">
                    <span class="w-16 shrink-0">背景模糊</span>
                    <input type="range" min="0" max="20" step="1" v-model.number="state.bgBlur" @input="applyBackground()"
                      class="flex-1 accent-pink-500" />
                    <span class="w-10 text-right font-mono">{{ state.bgBlur }}px</span>
                  </label>
                </div>
                <div class="flex items-center justify-end mt-3">
                  <button @click="resetBgTuning" title="恢复默认（遮罩 25%、模糊 5px）"
                    class="px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-primary hover:bg-primary/5 transition btn-press shrink-0">↺ 恢复默认（遮罩/模糊）</button>
                </div>
              </template>
              <p v-else class="text-xs text-gray-400">开启后从随机二次元壁纸接口获取背景，遮罩与模糊保证页面可读。</p>
            </section>
          </div>

          <div class="px-6 py-4 border-t border-white/20 flex justify-end glass rounded-b-2xl shrink-0">
            <button @click="onFinish" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all btn-press">完成</button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useAppearance, hexToHsl, hslCss, isCrossOrigin, getWallpaperBlob, providerBlocksPalette } from '../composables/useAppearance'
import { showToast } from '../composables/useToast'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['close'])

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

// 记录打开面板时的图源，用于「完成」时判断是否切换了图源并立即应用
const providerAtOpen = ref(state.bgProvider)
watch(() => props.show, (v) => {
  if (v) providerAtOpen.value = state.bgProvider
})

const presets = [
  { name: '樱紫（默认）', p: [263, 67, 55], s: [329, 81, 60] },
  { name: '蔚蓝海', p: [215, 85, 55], s: [190, 85, 46] },
  { name: '樱花粉', p: [340, 80, 60], s: [280, 55, 62] },
  { name: '薄荷青', p: [172, 70, 42], s: [200, 85, 55] },
  { name: '暖橙暮', p: [25, 90, 55], s: [345, 80, 58] },
  { name: '莓果紫', p: [288, 60, 55], s: [320, 75, 55] },
]

const isActivePreset = (preset) =>
  state.palette && state.palette.p[0] === preset.p[0] && state.palette.s[0] === preset.s[0]

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
  showToast('已恢复默认遮罩与模糊')
}

const onRandom = () => {
  setPaletteMode('manual')
  randomizePalette()
  showToast('已随机配色 🎲')
}

// 恢复默认配色：回到默认模式「跟随壁纸取色」（须与 state.paletteMode 的默认值保持一致）
const onReset = () => {
  setPaletteMode('auto')
  showToast('已恢复默认配色（跟随壁纸取色）')
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
    showToast('背景已更换 🖼️')
  } catch (e) {
    showToast(e.message || '获取壁纸失败', 'error')
  }
}

// 「完成」：图源或地址有变化时立即应用并持久化，无需刷新或点「换一张」
const onFinish = async () => {
  if (state.bgEnabled) {
    if (state.bgProvider === 'custom') {
      // 自定义图源：应用地址（为空则报错并留在面板内让用户补填）
      const url = state.bgCustomUrl.trim()
      if (!url) {
        showToast('请先填写图片地址', 'error')
        return
      }
      if (state.bgUrl !== url) {
        applyCustomBackground()
        bgFailed.value = false
        showToast('自定义壁纸已应用 🖼️')
      }
    } else if (state.bgProvider !== providerAtOpen.value) {
      // 随机图源：切换了图源，立即取一张
      bgLoaded.value = false
      bgFailed.value = false
      try {
        await shuffleBackground()
        showToast('壁纸已更新 🖼️')
      } catch (e) {
        showToast(e.message || '获取壁纸失败', 'error')
        return
      }
    }
  }
  emit('close')
}

const onBgError = () => {
  bgFailed.value = true
  showToast('背景图片加载失败，请换一张', 'error')
}

// 在新标签页打开当前壁纸链接。
// 有本地字节缓存（带 CORS 的图源）时用缓存的 blob —— 打开的必是背景这张；
// 无缓存（无 CORS 图源）时打开原始链接，此时因服务端是随机端点，可能抽到另一张。
const openOriginal = () => {
  const url = getWallpaperBlob()?.url || state.bgUrl
  if (!url) return
  window.open(url, '_blank', 'noopener')
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
  showToast('正在下载原图…')
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
    const fallback = state.bgUrl
    if (fallback) {
      window.open(fallback, '_blank', 'noopener')
      showToast('该图源不允许直接下载，已在新标签页打开原图，请右键「图片另存为」', 'warning')
    } else {
      showToast('当前没有可下载的壁纸', 'error')
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
  showToast('原图下载已开始 🖼️')
}

// 切换图源后提示重新换图
watch(() => state.bgProvider, () => { bgLoaded.value = false; bgFailed.value = false })
</script>

<style scoped>
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
</style>
