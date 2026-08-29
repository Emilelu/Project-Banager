<template>
  <Teleport to="body">
    <transition name="modal-overlay">
      <div v-if="show" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="$emit('close')"></div>
    </transition>
    <transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div class="relative glass rounded-2xl shadow-2xl w-[34rem] max-h-[85vh] overflow-y-auto border border-white/40 pointer-events-auto app-dialog">
          <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2 sticky top-0 glass rounded-t-2xl z-10">
            <span class="text-xl">🎨</span>
            <h3 class="text-lg font-bold gradient-text">主题与背景</h3>
          </div>

          <div class="px-6 py-5 space-y-6">
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
                <button @click="setPalette(null)" class="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 transition btn-press">↺ 恢复默认</button>
              </div>
              <p class="text-xs text-gray-400 mt-1.5">建议选中等亮度的颜色（保证白色文字可读）。开启背景图后可从壁纸取色。</p>
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
                    <option value="alcy">樱花随机二次元 · Alcy（默认，可取色）</option>
                    <option value="dmoe">樱花随机壁纸 · dmoe</option>
                    <option value="custom">自定义图片地址</option>
                  </select>
                  <button @click="onShuffle"
                    class="px-3 py-2 rounded-xl text-xs font-medium bg-gradient-to-r from-secondary to-secondary-light text-white hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press">
                    🔄 换一张
                  </button>
                </div>
                <input v-if="state.bgProvider === 'custom'" v-model="state.bgCustomUrl" type="text" placeholder="https://... 直链图片地址"
                  class="w-full mt-2 px-3 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white/80" />
                <!-- 自动换图 / 固定壁纸 -->
                <div class="mt-2 flex items-center gap-2 flex-wrap">
                  <button @click="state.bgAutoSwitch = !state.bgAutoSwitch"
                    class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition btn-press border"
                    :class="state.bgAutoSwitch ? 'bg-primary/10 border-primary/40 text-primary-dark' : 'bg-gray-100 border-transparent text-gray-500'">
                    <span>{{ state.bgAutoSwitch ? '🔄' : '📌' }}</span>
                    {{ state.bgAutoSwitch ? '每次打开自动换一张' : '已固定当前壁纸' }}
                  </button>
                  <button v-if="state.bgAutoSwitch" @click="state.bgAutoSwitch = false"
                    class="px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-primary hover:bg-primary/5 transition btn-press"
                    title="关闭自动换图，固定当前这张壁纸">固定这张</button>
                </div>
                <div v-if="state.bgUrl" class="mt-3">
                  <img :src="state.bgUrl" @error="onBgError" @load="bgLoaded = true"
                    class="w-full h-28 object-cover rounded-xl border border-white/40" alt="背景预览" />
                  <p v-if="bgFailed" class="text-xs text-danger mt-1">⚠️ 图片加载失败，请换一张</p>
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
                <div class="flex items-center gap-2 mt-3">
                  <button @click="onPickFromBg" :disabled="!canPickFromBg"
                    class="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-accent to-accent-light text-white hover:shadow-lg hover:shadow-accent/30 transition-all btn-press disabled:opacity-40 disabled:cursor-not-allowed">
                    🎨 从壁纸取色
                  </button>
                  <span v-if="!canPickFromBg" class="text-xs text-gray-400">先获取一张壁纸</span>
                  <span v-else class="text-xs text-gray-400">读取壁纸像素取色（图源需开放跨域权限）</span>
                  <button @click="resetBgTuning" title="恢复默认（遮罩 55%、无模糊）"
                    class="ml-auto px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-primary hover:bg-primary/5 transition btn-press shrink-0">↺ 恢复默认</button>
                </div>
              </template>
              <p v-else class="text-xs text-gray-400">开启后从随机二次元壁纸接口获取背景，遮罩与模糊保证页面可读。</p>
            </section>
          </div>

          <div class="px-6 py-4 border-t border-white/20 flex justify-end sticky bottom-0 glass rounded-b-2xl">
            <button @click="$emit('close')" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all btn-press">完成</button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useAppearance, hexToHsl, hslCss } from '../composables/useAppearance'
import { showToast } from '../composables/useToast'

defineProps({ show: Boolean })
const emit = defineEmits(['close'])

const { state, setGlass, setPalette, randomizePalette, extractPaletteFromImage, shuffleBackground, toggleBackground, applyBackground } = useAppearance()

const bgLoaded = ref(false)
const bgFailed = ref(false)

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

const canPickFromBg = computed(() => state.bgEnabled && !!state.bgUrl)

// 恢复遮罩/模糊默认值
const resetBgTuning = () => {
  state.bgDim = 0.55
  state.bgBlur = 0
  applyBackground()
  showToast('已恢复默认遮罩与模糊')
}

const onRandom = () => {
  randomizePalette()
  showToast('已随机配色 🎲')
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

const onPickFromBg = async () => {
  // 读取壁纸像素取色（Alcy 源已开放跨域权限；图源无跨域许可时会明确提示）
  try {
    await extractPaletteFromImage(state.bgUrl)
    showToast('已从壁纸取色 🎨')
  } catch (e) {
    showToast(e.message, 'warning')
  }
}

const onBgError = () => {
  bgFailed.value = true
  showToast('背景图片加载失败，请换一张', 'error')
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
