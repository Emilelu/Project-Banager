<template>
  <div
    class="watching-card px-3 py-2.5 border-b border-white/10 cursor-pointer transition-all duration-200 group relative"
    :class="[
      batchMode && checked
        ? 'bg-danger/10 border-l-3 border-l-danger'
        : selected
          ? 'bg-primary/15 border-l-3 border-l-primary'
          : 'hover:bg-primary/5'
    ]"
    @click="$emit('select')"
    @mousedown="$emit('middle-click', $event)"
    @contextmenu.prevent="$emit('context-menu', $event)"
  >
    <div v-if="batchMode" class="absolute top-1 left-1 z-10" @click.stop="$emit('toggle-check')">
      <div class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
        :class="checked ? 'bg-danger border-danger' : 'border-gray-300 bg-white/80 hover:border-primary'">
        <svg v-if="checked" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
      </div>
    </div>
    <div @dblclick.stop="!batchMode && $emit('start-edit', 'name')" class="editable-cell" :class="{'ml-5': batchMode}">
      <input v-if="editing?.id === item.id && editing?.field === 'name'" :value="editValue"
        @input="$emit('update:editValue', $event.target.value)"
        @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')" class="inline-edit-input w-full" autofocus />
      <span v-else class="text-base font-semibold text-gray-800 group-hover:text-primary transition-colors">{{ item.name }}</span>
      <a v-if="item.url" :href="buildItemUrl(item)" target="_blank" rel="noopener" @click.stop
        class="ml-1 text-primary/60 hover:text-primary transition-colors inline-flex items-center" title="打开链接">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
      </a>
    </div>
    <div class="flex items-center gap-1 mt-0.5">
      <span class="text-sm font-bold text-primary">e</span>
      <span @dblclick.stop="!batchMode && $emit('start-edit', 'current_episode')" class="editable-cell">
        <input v-if="editing?.id === item.id && editing?.field === 'current_episode'" :value="editValue"
          @input="$emit('update:editValue', $event.target.value)"
          type="text" inputmode="decimal" @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')"
          class="inline-edit-input w-16" autofocus />
        <span v-else class="text-sm font-bold text-primary">{{ item.current_episode }}</span>
      </span>
      <div class="opacity-75 group-hover:opacity-100 transition-opacity flex gap-0.5 ml-auto">
        <button @click.stop="$emit('increment')" class="w-6 h-6 rounded bg-success/80 text-white text-sm flex items-center justify-center hover:bg-success transition btn-press" title="+1集">+</button>
        <button @click.stop="$emit('decrement')" class="w-6 h-6 rounded bg-warning/80 text-white text-sm flex items-center justify-center hover:bg-warning transition btn-press" title="-1集">-</button>
      </div>
    </div>
    <div @dblclick.stop="!batchMode && $emit('start-edit', 'time_slot')" class="editable-cell">
      <input v-if="editing?.id === item.id && editing?.field === 'time_slot'" :value="editValue"
        @input="$emit('update:editValue', $event.target.value)"
        @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')" class="inline-edit-input w-full" autofocus />
      <span v-else class="text-sm font-medium" :class="item.time_slot ? 'text-gray-500' : 'text-gray-400 font-normal'">{{ item.time_slot || '' }}</span>
    </div>
    <div @dblclick.stop="!batchMode && $emit('start-edit', 'notes')" class="editable-cell">
      <input v-if="editing?.id === item.id && editing?.field === 'notes'" :value="editValue"
        @input="$emit('update:editValue', $event.target.value)"
        @blur="$emit('save-edit')" @keyup.enter="$emit('save-edit')" @keyup.escape="$emit('cancel-edit')" class="inline-edit-input w-full" autofocus />
      <span v-else class="text-sm text-gray-400 truncate block">{{ item.notes || '' }}</span>
    </div>
  </div>
</template>

<script setup>
import { buildItemUrl } from '../composables/useEpisode'

defineProps({
  item: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  batchMode: { type: Boolean, default: false },
  checked: { type: Boolean, default: false },
  editing: { type: Object, default: null },
  editValue: { type: String, default: '' }
})

defineEmits([
  'select', 'toggle-check', 'context-menu', 'middle-click',
  'start-edit', 'save-edit', 'cancel-edit', 'update:editValue',
  'increment', 'decrement'
])
</script>
