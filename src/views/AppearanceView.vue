<template>
  <div class="space-y-5">
    <!-- 请注意：本页面由弹窗改造而来，三大区块的交互逻辑与弹窗版完全一致，
         仅外壳从 fixed 遮罩换成普通页面流。 -->
    <div class="space-y-5">
      <!-- 玻璃风格 -->
      <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
            <section>
              <div class="card-head mb-3">
                <AppIcon scale="md" name="snowflake" class="text-primary" />
                <h4 class="card-head-title gradient-text">{{ tt('theme.glassStyle') }}</h4>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <button @click="setGlass('frost')"
                  class="p-2.5 rounded-xl border-2 text-left transition-all btn-press"
                  v-tip="tt('theme.frostedDesc')" :aria-label="tt('theme.frostedDesc')"
                  :class="state.glass === 'frost' ? 'border-primary bg-primary/10' : 'border-primary/20 hover:border-primary/40'">
                  <div class="h-12 rounded-lg mb-2 frost-preview"></div>
                  <!-- 风格卡片的说明（「经典柔和模糊」「高光折射 · 更通透」）原为卡片内第二行灰字，
                       改为整卡气泡：卡片本身就是触发点，悬停/聚焦时信息仍在，卡片同时收紧一行。 -->
                  <div class="text-sm font-bold text-gray-800 flex items-center gap-1.5"><AppIcon scale="sm" name="snowflake" class="text-primary" />{{ tt('theme.frosted') }}</div>
                </button>
                <button @click="setGlass('liquid')"
                  class="p-2.5 rounded-xl border-2 text-left transition-all btn-press"
                  v-tip="tt('theme.liquidDesc')" :aria-label="tt('theme.liquidDesc')"
                  :class="state.glass === 'liquid' ? 'border-primary bg-primary/10' : 'border-primary/20 hover:border-primary/40'">
                  <div class="h-12 rounded-lg mb-2 liquid-preview"></div>
                  <div class="text-sm font-bold text-gray-800 flex items-center gap-1.5"><AppIcon scale="sm" name="droplet" class="text-primary" />{{ tt('theme.liquid') }}</div>
                </button>
              </div>
            </section>
      </div>

            <!-- 配色：按「选什么颜色 → 颜色从哪来」的决策顺序分层，
                 自定义取色收进折叠，避免一排颜色选择器把主流程冲散。 -->
      <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
            <section>
              <div class="flex items-center justify-between mb-3">
                <div class="card-head">
                  <AppIcon scale="md" name="palette" class="text-primary" />
                  <h4 class="card-head-title gradient-text">{{ tt('theme.palette') }}</h4>
                </div>
                <div class="flex items-center gap-1.5">
                  <button @click="onRandom" class="btn-base btn-primary">
                    <AppIcon scale="sm" name="sparkle" />{{ tt('theme.randomPalette') }}
                  </button>
                  <button @click="onReset" v-tip="tt('theme.resetPalette')"
                    :aria-label="tt('theme.resetPalette')"
                    class="btn-base btn-sm btn-icon btn-neutral">
                    <AppIcon scale="xs" name="undo" />
                  </button>
                </div>
              </div>

              <!-- 配色控制整行：预设色 / 配色来源（下拉）/ 自定义颜色。
                   用户要求：来源做成下拉菜单，且与六种预设色、自定义入口同一行。
                   按钮样式统一到「随机配色」基准 btn-base btn-primary。 -->
              <div class="flex items-center gap-3 flex-wrap">
                <!-- 预设配色（最常用，一眼可选） -->
                <div class="flex gap-3 flex-wrap">
                  <button v-for="preset in presets" :key="preset.key" @click="setPalette({ p: [...preset.p], s: [...preset.s] })"
                    class="w-10 h-10 rounded-full border-2 transition-all btn-press flex items-center justify-center overflow-hidden"
                    :class="isActivePreset(preset) ? 'border-gray-700 scale-110' : 'border-transparent hover:scale-105'"
                    :aria-label="tt(preset.key)" v-tip="tt(preset.key)">
                    <span class="w-full h-full" :style="{ background: 'linear-gradient(135deg, ' + hslCss(preset.p) + ', ' + hslCss(preset.s) + ')' }"></span>
                  </button>
                </div>
              
                <!-- 配色来源：两个互斥选项收进一个下拉菜单（原来是两个并排按钮） -->
                <div class="relative shrink-0">
                  <button @click="togglePaletteSourceMenu($event)"
                    :aria-expanded="showPaletteSourceMenu" aria-haspopup="menu"
                    class="btn-base btn-primary">
                    <AppIcon scale="sm" name="palette" />{{ currentPaletteModeLabel }}
                    <AppIcon scale="xs" :name="showPaletteSourceMenu ? 'caretUp' : 'caretDown'" />
                  </button>
                  <Teleport to="body">
                    <div v-if="showPaletteSourceMenu" class="fixed inset-0 z-[100]"
                      @click="showPaletteSourceMenu = false"></div>
                    <div v-if="showPaletteSourceMenu" role="menu"
                      class="fixed z-[110] app-menu-surface rounded-xl border border-white/40 py-1 min-w-[13rem]"
                      :style="paletteSourceMenuStyle">
                      <button @click="pickPaletteMode('auto')" :disabled="noCorsSource" role="menuitemradio"
                        :aria-checked="isPaletteAuto ? 'true' : 'false'"
                        class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                        :class="isPaletteAuto ? 'text-primary font-bold' : 'text-gray-700'">
                        <span class="w-4 shrink-0" aria-hidden="true">
                          <svg v-if="isPaletteAuto" class="w-4 h-4" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                          </svg>
                        </span>
                        {{ tt('theme.pickFromWallpaper') }}
                      </button>
                      <button @click="pickPaletteMode('random')" role="menuitemradio"
                        :aria-checked="state.paletteMode === 'random' ? 'true' : 'false'"
                        class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-primary/10"
                        :class="state.paletteMode === 'random' ? 'text-primary font-bold' : 'text-gray-700'">
                        <span class="w-4 shrink-0" aria-hidden="true">
                          <svg v-if="state.paletteMode === 'random'" class="w-4 h-4" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                          </svg>
                        </span>
                        {{ tt('theme.randomEachRefresh') }}
                      </button>
                    </div>
                  </Teleport>
                </div>
              
                <!-- 自定义取色：低频高级项，默认折叠，入口与上面同一行 -->
                <button @click="showCustomColor = !showCustomColor" class="btn-base btn-primary shrink-0">
                  <AppIcon scale="sm" :name="showCustomColor ? 'caretUp' : 'caretDown'" />
                  {{ tt('theme.customColor') }}
                </button>
              </div>
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
                    <div class="tone-panel mt-3 p-3 rounded-xl bg-white/50 border border-primary/15 flex items-center gap-2 flex-wrap">
                      <label class="flex items-center gap-1.5 text-xs text-gray-600">
                        {{ tt('theme.primary') }}
                        <ColorPicker :value="customP" size="2rem" :aria-label="tt('theme.customPrimary')" @input="customP = $event" />
                      </label>
                      <label class="flex items-center gap-1.5 text-xs text-gray-600">
                        {{ tt('theme.secondary') }}
                        <ColorPicker :value="customS" size="2rem" :aria-label="tt('theme.customSecondary')" @input="customS = $event" />
                      </label>
                      <button @click="applyCustom" class="btn-base btn-primary">{{ tt('theme.applyCustom') }}</button>
                    </div>
                  </div>
                </div>
              </transition>
            </section>
      </div>

            <!-- 背景图 -->
      <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
            <section>
              <div class="flex items-center justify-between mb-3">
                <div class="card-head">
                  <AppIcon scale="md" name="image" class="text-primary" />
                  <h4 class="card-head-title gradient-text">{{ tt('theme.wallpaper') }}</h4>
                </div>
                <button @click="toggleBg" role="switch" :aria-checked="state.bgEnabled ? 'true' : 'false'"
                  :aria-label="state.bgEnabled ? tt('theme.bgOff') : tt('theme.bgOn')"
                  v-tip="state.bgEnabled ? '' : tt('theme.bgOffHint')"
                  class="w-11 h-6 rounded-full transition-all relative btn-press"
                  :class="state.bgEnabled ? 'bg-gradient-to-r from-primary to-primary-dark' : 'bg-gray-300'">
                  <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" :class="state.bgEnabled ? 'left-[1.375rem]' : 'left-0.5'"></span>
                </button>
              </div>
              <template v-if="state.bgEnabled">
                <div class="flex items-center gap-2 flex-wrap">
                  <select v-model="state.bgProvider" :aria-label="tt('theme.backgroundSource')"
                    class="tone-input flex-1 min-w-[8rem] max-w-[16rem] px-3 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white/80">
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
                    class="btn-base btn-toned shrink-0">
                    <AppIcon scale="sm" name="refresh" />{{ tt('theme.changeOne') }}
                  </button>
                  <!-- 选中态用「白底 + 主题色描边 + 深色文字」而不是「同色系淡底 + 同色系深字」：
                       后者在主题色偏红/偏粉时会"红字压红底"糊成一片，辨识度差。深色模式由
                       style.css 的 .dark .seg-btn.* 规则反转（半透明白底 + 亮色描边 + 白字）。 -->
                  <!-- 自动换图 / 固定壁纸 收进一个下拉菜单（原来是两个并排按钮）。
                       触发器样式与「原链接预览」一致（btn-base btn-neutral）。 -->
                  <div class="relative shrink-0">
                    <button @click="toggleAutoMenu($event)" :aria-expanded="showAutoMenu" aria-haspopup="menu"
                      class="btn-base btn-neutral">
                      <AppIcon scale="sm" :name="state.bgAutoSwitch ? 'refresh' : 'bookmark'" />{{ autoModeLabel }}
                      <AppIcon scale="xs" :name="showAutoMenu ? 'caretUp' : 'caretDown'" />
                    </button>
                    <Teleport to="body">
                      <div v-if="showAutoMenu" class="fixed inset-0 z-[100]" @click="showAutoMenu = false"></div>
                      <div v-if="showAutoMenu" role="menu"
                        class="fixed z-[110] app-menu-surface rounded-xl border border-white/40 py-1 min-w-[12rem]"
                        :style="autoMenuStyle">
                        <button @click="pickAutoMode(true)" role="menuitemradio"
                          :aria-checked="state.bgAutoSwitch ? 'true' : 'false'"
                          class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-primary/10"
                          :class="state.bgAutoSwitch ? 'text-primary font-bold' : 'text-gray-700'">
                          <span class="w-4 shrink-0" aria-hidden="true">
                            <svg v-if="state.bgAutoSwitch" class="w-4 h-4" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                            </svg>
                          </span>
                          {{ tt('theme.autoChange') }}
                        </button>
                        <button @click="pickAutoMode(false)" role="menuitemradio"
                          :aria-checked="!state.bgAutoSwitch ? 'true' : 'false'"
                          class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-primary/10"
                          :class="!state.bgAutoSwitch ? 'text-primary font-bold' : 'text-gray-700'">
                          <span class="w-4 shrink-0" aria-hidden="true">
                            <svg v-if="!state.bgAutoSwitch" class="w-4 h-4" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                            </svg>
                          </span>
                          {{ tt('theme.fixCurrent') }}
                        </button>
                      </div>
                    </Teleport>
                  </div>

                  <!-- 「原链接预览 / 下载原图」居中，「遮罩与模糊」靠右 —— 全部与上面同一行。
                       窄屏用 flex-wrap 换行，不挤坏布局。 -->
                  <div class="flex items-center gap-2.5 flex-1 justify-center min-w-0">
                    <p v-if="bgFailed" class="tone-danger text-xs text-danger truncate">{{ tt('theme.previewFailed') }}</p>
                    <button @click="openOriginal" class="btn-base btn-neutral shrink-0"
                      v-tip="tt('theme.openOriginalHint')"><AppIcon scale="sm" name="link" />{{ tt('theme.openOriginal') }}</button>
                    <button @click="downloadOriginal" class="btn-base btn-neutral shrink-0"
                      v-tip="tt('theme.downloadOriginalHint')"><AppIcon scale="sm" name="download" />{{ tt('theme.downloadOriginal') }}</button>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <button @click="showTuning = !showTuning" class="btn-base btn-neutral tone-fold"
                      :aria-expanded="showTuning">
                      <AppIcon scale="sm" :name="showTuning ? 'caretUp' : 'caretDown'" />
                      {{ tt('theme.tuning') }}
                    </button>
                    <transition name="fade">
                      <button v-if="showTuning" @click="resetBgTuning" v-tip="tt('theme.resetMaskBlurHint')"
                        class="btn-base btn-sm btn-neutral tone-fold shrink-0"><AppIcon scale="xs" name="undo" />
                      </button>
                    </transition>
                  </div>
                </div>
                <input v-if="state.bgProvider === 'custom'" v-model="state.bgCustomUrl" type="text" :placeholder="tt('theme.customUrlPlaceholder')"
                  :aria-label="tt('theme.customUrlHint')" v-tip="tt('theme.customUrlHint')" class="tone-input w-full mt-3 px-3 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white/80" />
                  <!-- 自动换图 / 固定壁纸：自定义图源由用户指定固定地址，无换图概念，整块隐藏 -->
                  <!-- 两个模式按钮常驻显示、互斥高亮：点「自动换一张」就是开自动换图，
                       点「固定当前壁纸」就是固定当前这张（内部把随机端点解析为稳定地址）。
                       不再用"当前状态即下一步动作"的 toggle，避免点一下反而固定/换掉的歧义 -->
                <div v-if="state.bgUrl" class="mt-4">
                  <!-- 预览走降采样缩略图：大分辨率原图直接解码会造成弹窗卡顿，
                       这里展示 buildPreview 生成的 1600px 内 blob URL（见 script 说明）；
                       生成中显示骨架，降级失败才回退原图直出 -->
                  <div class="tone-preview w-full rounded-xl border border-white/40 overflow-hidden relative bg-white/40">
                    <img v-if="previewSrc" :src="previewSrc" @error="onBgError" @load="bgLoaded = true"
                      loading="lazy" decoding="async" class="w-full h-full object-cover" :alt="tt('theme.backgroundPreview')" />
                    <img v-else-if="previewFailed" :src="state.bgBlobUrl || state.bgUrl" @error="onBgError" @load="bgLoaded = true"
                      loading="lazy" decoding="async" class="w-full h-full object-cover" :alt="tt('theme.backgroundPreview')" />
                    <div v-else class="absolute inset-0 animate-pulse bg-white/50"></div>
                  </div>
                  <p v-if="noCorsSource" class="tone-warning card-sub mt-1 flex items-start gap-1">
                    <AppIcon scale="xs" name="warning" class="mt-0.5" />{{ tt('theme.noCorsDetail') }}
                  </p>
                </div>
                <!-- 遮罩/模糊属于低频微调：默认折叠，避免弹窗被撑到必须滚动，
                     导致底部控件被裁（原先「遮罩浓度」滑块就被切掉一半）。 -->
                <!-- 对比度：容器底是半透明白，透出壁纸后浅灰文字明显不够看。
                     这里把标签与数值统一提到 text-700 级别并加 font-medium，
                     实测在亮/暗壁纸下都 ≥4.5:1。
                     深色模式：容器底会变成深紫半透明（见本文件 <style scoped> 的
                     .tone-tuning），浅色字改由 .tone-num / .tone-label 接管。 -->
                <transition name="collapse">
                  <div v-if="showTuning">
                    <div class="collapse-shell">
                      <div class="tone-tuning mt-3 p-3.5 rounded-xl bg-white/70 border border-primary/15 space-y-3.5">
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
            </section>
      </div>
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
const MAX_PREVIEW_SIDE = 800
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
  // ② 无字节缓存（无 CORS 图源）：**不要直接放弃缩略图**。
  //    跨域图虽然 <img> 能显示，但 4K 大图直接解码会明显卡顿，
  //    所以先尝试代理链取字节 + 降采样；只有全部代理都失败才回退「原图直出」。
  //    （原实现这里直接 return previewFailed，导致随机图床下缩略图永远不显示）
  const gen = ++previewGen
  previewFailed.value = false
  let blob = getWallpaperBlob()?.blob || null
  const grab = async (u) => {
    const r = await fetch(u)
    if (!r.ok) throw new Error('fetch failed')
    return r.blob()
  }
  // 无缓存时再抓：直连仅用于同源；跨域图床直接走代理链，跳过必败的直连 fetch
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
  // 太老的浏览器不支持 createImageBitmap：退回原图直出（能显示但可能较慢）
  if (typeof createImageBitmap !== 'function') {
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
onMounted(() => {
  providerAtOpen.value = state.bgProvider
  // 首次进入 / 切走再切回来：主动构建一次预览。
  // （watch 只在地址**变化**时触发，而第二次进入时地址已稳定 → 不触发；
  //   离开时 onUnmounted 又会清空 previewSrc，所以必须在这里补一次。）
  const url = state.bgEnabled ? state.bgBlobUrl || state.bgUrl : ''
  if (url && !previewSrc.value) buildPreview(url)
})

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

/* 配色来源下拉：两个互斥选项（跟随壁纸 / 每次刷新随机）收进一个菜单。
   与「每页条数」菜单同一套做法：Teleport + fixed，坐标用 bottom 定位，
   不需要知道菜单高度（菜单多高都自动向上展开）。 */
const showPaletteSourceMenu = ref(false)
const paletteSourceMenuPos = ref({ left: 0, bottom: 0 })
const paletteSourceMenuStyle = computed(() => ({
  left: paletteSourceMenuPos.value.left + 'px',
  bottom: paletteSourceMenuPos.value.bottom + 'px',
}))

/** 触发器上显示当前模式的文字（而不是固定写「配色来源」） */
const currentPaletteModeLabel = computed(() =>
  state.paletteMode === 'random'
    ? tt('theme.randomEachRefresh')
    : tt('theme.pickFromWallpaper'),
)

const togglePaletteSourceMenu = (e) => {
  if (showPaletteSourceMenu.value) {
    showPaletteSourceMenu.value = false
    return
  }
  const btn = e && e.currentTarget
  if (!btn) return
  const r = btn.getBoundingClientRect()
  const MENU_W = 220
  const MARGIN = 8
  let left = r.left
  if (left + MENU_W > window.innerWidth - MARGIN) {
    left = Math.max(MARGIN, window.innerWidth - MENU_W - MARGIN)
  }
  const bottom = window.innerHeight - r.top + MARGIN
  paletteSourceMenuPos.value = { left: left, bottom: bottom }
  showPaletteSourceMenu.value = true
}

/** 选中模式后关闭菜单 */
const pickPaletteMode = (mode) => {
  setPaletteMode(mode)
  showPaletteSourceMenu.value = false
}

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
  /* 加彩色底衬：透过玻璃能看清「毛玻璃=均匀磨砂」的质感。
     只有白色底衬时，两块预览在不同壁纸下都会趋同成白框，看不出区别。 */
  background:
    linear-gradient(rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.55)),
    linear-gradient(120deg,
      rgb(var(--c-primary) / 0.85) 0%,
      rgb(var(--c-secondary) / 0.85) 45%,
      rgb(var(--c-primary-dark) / 0.85) 100%);
  backdrop-filter: blur(2px);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.liquid-preview {
  /* 液态玻璃：保留 135° 高光渐变，但同样铺彩色底衬，
     让「通透 + 高饱和折射」与毛玻璃的「均匀磨砂」形成可见对比。 */
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.08)),
    linear-gradient(120deg,
      rgb(var(--c-primary) / 0.85) 0%,
      rgb(var(--c-secondary) / 0.85) 45%,
      rgb(var(--c-primary-dark) / 0.85) 100%);
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
.tone-preview {
  /* 固定宽高比：原来 w-full h-28 在宽卡片里变成 13.5:1 的极扁条，
     图片 object-cover 后只剩中间一条，看着像空白框。 */
  aspect-ratio: 2.4 / 1;
  max-height: 22rem;
}

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
