<template>
  <Teleport to="body">
    <transition name="modal-overlay">
      <div v-if="show" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="$emit('close')"></div>
    </transition>
    <transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div ref="panelEl" class="relative glass rounded-2xl shadow-2xl w-[min(34rem,calc(100vw-2rem))] max-h-[calc(100vh-4rem)] border border-white/40 pointer-events-auto app-dialog flex flex-col"
          role="dialog" aria-modal="true" aria-labelledby="help-title">
          <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2 shrink-0">
            <AppIcon scale="lg" name="help" />
            <h3 id="help-title" class="text-lg font-bold gradient-text">{{ tt('help.title') }}</h3>
          </div>

          <div class="flex-1 overflow-y-auto app-dialog px-6 py-5 space-y-6">
            <!-- 键盘快捷键 -->
            <section>
              <h4 class="text-sm font-bold text-gray-700 mb-2">{{ tt('help.shortcuts') }}</h4>
              <ul class="space-y-1.5 text-sm text-gray-600">
                <li v-for="s in shortcutList" :key="s.keys" class="flex items-center justify-between gap-3">
                  <span>{{ s.desc }}</span>
                  <!-- 按键标签：必须显式给深色文字。
                       原先没写 color，继承了父级 text-gray-600 且被深色模式的
                       "浅色文字"规则覆盖 → 浅字压浅底，几乎不可读。
                       这里固定 kbd-token 类，浅色/深色模式各自取正确色。 -->
                  <kbd class="kbd-token shrink-0 px-2 py-0.5 rounded-[6px] border text-xs font-mono">{{ s.keys }}</kbd>
                </li>
              </ul>
            </section>

            <!-- 操作小贴士 -->
            <section>
              <h4 class="text-sm font-bold text-gray-700 mb-2">{{ tt('help.tips') }}</h4>
              <ul class="space-y-2 text-sm text-gray-600 leading-relaxed">
                <li v-for="(tip, i) in tipList" :key="i" class="flex gap-2">
                  <span class="text-primary shrink-0" aria-hidden="true">•</span>
                  <span>{{ tip }}</span>
                </li>
              </ul>
            </section>
          </div>

          <div class="px-6 py-4 border-t border-white/20 flex justify-end shrink-0">
            <button @click="$emit('close')" class="btn-base btn-primary">{{ tt('common.confirm') }}</button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useDialogFocus } from '../composables/useDialogFocus'
import { useI18n } from '../composables/useI18n'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['close'])
const { tt } = useI18n()

const panelEl = ref(null)
useDialogFocus({
  isOpen: () => props.show,
  getDialog: () => panelEl.value,
  onEscape: () => emit('close'),
})

// 键盘快捷键（与各页面实现对齐；改键位时这里要同步）
const shortcutList = computed(() => [
  { keys: 'Esc', desc: tt('help.kb.esc') },
  { keys: 'Tab', desc: tt('help.kb.tab') },
  { keys: 'Enter / Space', desc: tt('help.kb.enter') },
  { keys: 'Ctrl + Enter', desc: tt('help.kb.ctrlEnter') },
  { keys: tt('help.kb.dblclickKey'), desc: tt('help.kb.dblclick') },
  { keys: tt('help.kb.middleKey'), desc: tt('help.kb.middle') },
  { keys: tt('help.kb.rightclickKey'), desc: tt('help.kb.rightclick') },
])

// 操作小贴士：把原先散落在页面里的说明集中到这里
const tipList = computed(() => [
  tt('help.tip.drag'),
  tt('help.tip.episode'),
  tt('help.tip.url'),
  tt('help.tip.batch'),
  tt('help.tip.backup'),
  tt('help.tip.select'),
  tt('help.tip.lang'),
])
</script>
