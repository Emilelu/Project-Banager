<template>
  <div class="color-picker-wrapper" :style="{ width: size, height: size }">
    <!-- 鍙鐨勮壊鍧楋紙鐪熸琚牱寮忓寲鐨勯儴鍒嗭級 -->
    <button type="button" class="color-picker-swatch rounded-xl btn-press"
      :style="{ background: value || 'transparent', width: size, height: size }"
      :aria-label="ariaLabel || tt('color.pick')"
      :title="title || value || ''"
      @click="openPicker">
      <!-- 褰撳墠鑹蹭负绌烘椂鏄剧ず鏂滅嚎锛岃〃绀?鏈缃? -->
      <span v-if="!value" class="color-picker-empty" aria-hidden="true"></span>
    </button>
    <!-- 鍘熺敓 color input 瑕嗙洊鍏朵笂銆佸畬鍏ㄩ€忔槑锛氫繚鐣欑郴缁熷彇鑹插櫒鑳藉姏锛屼絾涓嶆毚闇插師鐢熷瑙?-->
    <input ref="inputRef" type="color" class="color-picker-native"
      :value="value || '#888888'"
      :aria-label="ariaLabel || tt('color.pick')"
      @input="onInput" />
  </div>
</template>

<script setup>
/**
 * 缁熶竴鍙栬壊鎺т欢銆? *
 * 涓轰粈涔堣鍖呬竴灞傦細
 *   鍘熺敓 input[type=color] 鐨勫瑙傜敱娴忚鍣ㄦ帶鍒?鈥斺€?Chrome 浼氬湪鍦嗚鍐呭啀鐢讳竴涓? *   鏂瑰舰鑹插潡锛堢湅涓婂幓鍍?鍦嗚閲屽鏂瑰潡"锛夛紝Safari/Firefox 鍙堝悇涓嶇浉鍚岋紝鍋氫笉鍒板叏绔欑粺涓€銆? *   瑙ｆ硶鏄妸鍘熺敓 input 鍋氭垚瀹屽叏閫忔槑銆侀摵婊℃暣涓鍣紝鐢辨梺杈圭殑 button 璐熻矗鏄剧ず鑹插潡涓庡渾瑙掞紱
 *   鐐瑰嚮鎸夐挳鏃惰浆鍙戝埌 input锛屼粛鐒朵娇鐢ㄧ郴缁熷彇鑹插櫒锛堜笉閲嶅瀹炵幇璋冭壊鏉?UI锛夈€? *
 * 灏哄鐢?CSS 鍙橀噺鎺у埗锛岄伩鍏嶇埗绾?Tailwind 绫伙紙w-8 / w-6锛変笌缁勪欢鍐呴儴鍐茬獊銆? */
import { ref } from 'vue'
import { useI18n } from '../composables/useI18n'

const props = defineProps({
  value: { type: String, default: '' },
  size: { type: String, default: '2rem' },
  ariaLabel: { type: String, default: '' },
  title: { type: String, default: '' },
})
const emit = defineEmits(['input', 'change'])

const { tt } = useI18n()
const inputRef = ref(null)

const openPicker = () => {
  // showPicker 鍦ㄩ儴鍒嗘祻瑙堝櫒闇€瑕佺敤鎴锋墜鍔匡紱姝ゅ灏辨槸 click 鍥炶皟锛屾弧瓒虫潯浠躲€?  // 涓嶆敮鎸佹椂鍥為€€鍒板師鐢?click()銆?  const el = inputRef.value
  if (!el) return
  try {
    if (typeof el.showPicker === 'function') el.showPicker()
    else el.click()
  } catch {
    el.click()
  }
}

const onInput = (e) => {
  const v = e.target.value
  emit('input', v)
  emit('change', v)
}
</script>

<style scoped>
.color-picker-wrapper {
  position: relative;
  flex-shrink: 0;
  border-radius: 0.75rem;
  /* 鎻忚竟鐢?wrapper 璐熻矗锛岃壊鍧楁湰韬笉鍐嶅崟鐙弿杈癸紝閬垮厤鍙屽眰鎻忚竟 */
  box-shadow: 0 0 0 1px rgba(var(--c-primary), 0.25) inset;
  overflow: hidden;
}

.color-picker-swatch {
  display: block;
  border: 0;
  padding: 0;
  margin: 0;
  cursor: pointer;
  transition: filter 0.15s ease;
}
.color-picker-swatch:hover {
  filter: brightness(1.08);
}

/* 鏈缃鑹叉椂鐢ㄦ枩绾胯〃杈?绌?锛岃€屼笉鏄樉绀轰竴涓瀵兼€х殑鐏拌壊鍧椼€?   搴曚笌鏂滅嚎閮借蛋涓婚鑹插彉閲忥細娣辫壊妯″紡涓?rgba(255,255,255,.6) 鐨勭櫧搴曚細褰㈡垚涓€涓?   鍒虹溂鐨勪寒鍧楋紝杩欓噷鏀圭敤 .dark 瑙勫垯鍙嶈浆鎴愭繁鑹插崐閫忔槑搴?+ 浜壊鏂滅嚎銆?*/
.color-picker-empty {
  display: block;
  width: 100%;
  height: 100%;
  background-image: linear-gradient(
    135deg,
    transparent 46%,
    rgba(var(--c-primary), 0.55) 46%,
    rgba(var(--c-primary), 0.55) 54%,
    transparent 54%
  );
  background-color: rgba(255, 255, 255, 0.6);
}

/* 娣辫壊妯″紡锛氭繁鑹插簳 + 浜壊鏂滅嚎锛岄伩鍏?浜簳鐧界嚎"鐪嬩笉娓?*/
.dark .color-picker-empty {
  background-color: rgba(40, 30, 70, 0.9);
  background-image: linear-gradient(
    135deg,
    transparent 46%,
    rgb(var(--c-primary-light)) 46%,
    rgb(var(--c-primary-light)) 54%,
    transparent 54%
  );
}

/* 鍘熺敓鎺т欢瀹屽叏閫忔槑閾烘弧锛氬彲瑙佹€т氦缁欎笂闈㈢殑 button锛岃兘鍔涗粛鏉ヨ嚜绯荤粺鍙栬壊鍣?*/
.color-picker-native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  border: 0;
  padding: 0;
}

/* 娣辫壊妯″紡锛氭弿杈圭敱涓婚鑹叉敼浜彉浣擄紝鍚﹀垯鍘嬪湪娣辩传鍗＄墖涓婂嚑涔庣湅涓嶈 */
.dark .color-picker-wrapper {
  box-shadow: 0 0 0 1px rgba(var(--c-primary-light), 0.45) inset;
}
</style>

