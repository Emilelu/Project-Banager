<template>
  <div ref="pageRootRef" class="space-y-5" @keydown="handleKeydown" tabindex="-1">
    <!-- 顶部信息栏 + 操作面板合并 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <label class="text-sm font-medium text-gray-700">{{ tt('watched.yearSelect') }}</label>
            <select v-model="selectedYear" @change="fetchData"
              class="px-4 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80">
              <option value="__all__"><AppIcon scale="sm" name="book" /> {{ tt('watched.allYears') }}</option>
              <option v-for="y in sortedYears" :key="y.year_label" :value="y.year_label">{{ y.year_label }}</option>
              <option value="__unclassified__"><AppIcon scale="sm" name="log" /> {{ tt('watched.unclassified') }}</option>
            </select>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <span class="px-4 py-2 bg-gradient-to-r from-primary/10 to-secondary/10 text-primary font-bold rounded-xl">
              {{ tt('watched.thisYear', { count: yearCount }) }}
            </span>
            <span class="px-3 py-1.5 bg-gray-100 text-gray-600 font-bold rounded-xl">
              {{ tt('watched.total', { count: totalCount }) }}
            </span>
          </div>
          <div class="relative">
            <input v-model="searchQuery" type="text" :placeholder="tt('watched.searchPlaceholder')"
              class="pl-8 pr-8 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80 w-48" />
            <svg class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <button v-if="searchQuery" @click="searchQuery=''" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <!-- 按标签筛选（多选 OR），与搜索框并列 -->
          <TagFilter v-model="tagFilter" />
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button @click="openAddDialog" class="btn-base btn-primary"><AppIcon scale="sm" name="sparkle" />{{ tt('watched.addRecord') }}</button>

          <!-- 选中项专属操作：统一由 transition-group 平滑出现/收起 -->
          <transition-group name="sel-anim" tag="div" class="flex items-center gap-2 flex-wrap">
            <button v-for="b in selectedActions" :key="b.key" v-if="!!selected" @click="b.onClick"
              class="btn-base" :class="b.cls"><AppIcon scale="sm" :name="b.icon" />{{ b.label }}</button>
          </transition-group>

          <div class="border-l border-white/30 h-6 mx-1"></div>
          <button @click="toggleBatchMode" class="btn-base" :class="batchMode ? 'btn-primary' : 'btn-neutral'">
            <AppIcon scale="sm" name="checkbox" />{{ tt('watching.batchSelect') }}
          </button>
          <button v-if="batchMode" :disabled="checkedIds.length===0" @click="batchDelete" class="btn-base btn-danger">
            <AppIcon scale="sm" name="trash" />{{ tt('watching.batchDeleteCount', { count: checkedIds.length }) }}
          </button>
          <button v-if="batchMode" @click="toggleSelectAll" class="btn-base btn-neutral">
            <AppIcon scale="sm" name="checkbox" />{{ isAllChecked ? tt('watching.unselectAll') : tt('watching.selectAll') }}
          </button>
          <button @click="openClearDialog" class="btn-base btn-neutral"><AppIcon scale="sm" name="clear" />{{ tt('watching.clearList') }}</button>
          <div class="border-l border-white/30 h-6 mx-1"></div>
          <button @click="openAddYearDialog" class="btn-base btn-toned"><AppIcon scale="sm" name="sparkle" />{{ tt('watched.addYear') }}</button>
          <button v-if="selectedYear && selectedYear !== '__unclassified__'" @click="editYearLabel" class="btn-base btn-toned"><AppIcon scale="sm" name="edit" />{{ tt('watched.editYear') }}</button>
          <button v-if="selectedYear && selectedYear !== '__unclassified__'" @click="openDeleteYearDialog" class="btn-base btn-danger"><AppIcon scale="sm" name="trash" />{{ tt('watched.deleteYear') }}</button>
        </div>
      </div>
      <div v-if="batchMode && checkedIds.length > 0" class="mt-2 text-sm text-danger flex items-center gap-2">
        <span class="inline-block w-2 h-2 rounded-full bg-danger"></span>
        {{ tt('watching.selectedCount', { count: checkedIds.length }) }}
      </div>

      <transition name="sel-anim">
          <div v-if="selected && !batchMode" class="mt-2 text-sm text-gray-500 flex items-center gap-2 selectable-text">
          <span class="inline-block w-2 h-2 rounded-full bg-primary"></span>
          {{ tt('watching.currentSelected') }} <span class="font-bold gradient-text">{{ selected.name }}</span>
          <span class="text-gray-400">{{ selected.watch_date }}</span>
        </div>

      </transition>
    </div>

    <!-- 列表视图 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="bg-gradient-to-r from-primary/10 to-secondary/10 text-sm font-bold border-b border-white/20">
            <th v-if="batchMode" class="text-center px-2 py-2.5 text-primary-dark font-bold cursor-pointer select-none" @click="toggleSelectAll">
              <div role="checkbox" tabindex="0" :aria-checked="isAllChecked ? 'true' : 'false'" :aria-label="tt('watching.selectAll')"
                @keydown.enter.prevent="toggleSelectAll" @keydown.space.prevent="toggleSelectAll"
                class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all mx-auto"
                :class="isAllChecked?'bg-primary border-primary':'border-gray-300 bg-white/80 hover:border-primary'">
                <svg v-if="isAllChecked" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
              </div>
            </th>
            <th class="text-center px-2 py-2.5 text-primary-dark font-bold whitespace-nowrap">#</th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold cursor-pointer select-none hover:bg-primary/5 transition"
              tabindex="0" role="button" :aria-sort="sortField==='name'?(sortOrder==='asc'?'ascending':'descending'):'none'"
              @click="toggleSort('name')" @keydown.enter.prevent="toggleSort('name')" @keydown.space.prevent="toggleSort('name')">
              <AppIcon scale="sm" name="sparkle" /> {{ tt('watched.colName') }} <AppIcon scale="xs" class="inline-block align-middle ml-0.5" v-if="sortField==='name'" :name="sortOrder==='asc'?'arrowUp':'arrowDown'" />
            </th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold cursor-pointer select-none hover:bg-primary/5 transition whitespace-nowrap"
              tabindex="0" role="button" :aria-sort="sortField==='watch_date'?(sortOrder==='asc'?'ascending':'descending'):'none'"
              @click="toggleSort('watch_date')" @keydown.enter.prevent="toggleSort('watch_date')" @keydown.space.prevent="toggleSort('watch_date')">
              <AppIcon scale="sm" name="calendar" /> {{ tt('watched.colDate') }} <AppIcon scale="xs" class="inline-block align-middle ml-0.5" v-if="sortField==='watch_date'" :name="sortOrder==='asc'?'arrowUp':'arrowDown'" />
            </th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold whitespace-nowrap"><AppIcon scale="sm" name="link" /> {{ tt('watched.colUrl') }}</th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold whitespace-nowrap"><AppIcon scale="sm" name="note" /> {{ tt('watched.colNotes') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="paginatedList.length===0">
            <td :colspan="batchMode?6:5" class="py-16 text-center text-gray-400">
              <div class="text-4xl mb-3"><AppIcon scale="sm" name="emptyBox" /></div>
              <div>{{ searchQuery ? tt('watched.emptyNoMatch') : (selectedYear === '__unclassified__' ? tt('watched.emptyUnclassified') : tt('watched.emptyYear', { year: selectedYear })) }}</div>
            </td>
          </tr>
          <tr v-for="(item,idx) in paginatedList" :key="item.id"
            class="cursor-pointer transition-all duration-200 border-b border-white/10 list-item group"
            :class="[batchMode && checkedIds.includes(item.id)?'bg-danger/10':selected?.id===item.id?'bg-primary/10':idx%2===0?'bg-white/20':'bg-white/40']"
            @click="batchMode?toggleCheck(item.id):selectItem(item)"
            @contextmenu.prevent="!batchMode && openContextMenu($event,item)"
            @mousedown.middle.prevent="openItemLink(item)">
            <td v-if="batchMode" class="text-center px-2 py-2.5" @click.stop="toggleCheck(item.id)">
              <div role="checkbox" tabindex="0" :aria-checked="checkedIds.includes(item.id) ? 'true' : 'false'"
                :aria-label="tt('card.checkLabel', { name: item.name })"
                @keydown.enter.prevent="toggleCheck(item.id)" @keydown.space.prevent="toggleCheck(item.id)"
                class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all mx-auto"
                :class="checkedIds.includes(item.id)?'bg-primary border-primary':'border-gray-300 bg-white/80 hover:border-primary'">
                <svg v-if="checkedIds.includes(item.id)" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
              </div>
            </td>
            <td class="text-center px-2 py-2.5 text-xs text-gray-400 font-mono">{{ idx+1 }}</td>
            <td class="px-3 py-2.5" @dblclick.stop="!batchMode && startEdit(item,'name')">
              <input v-if="editing?.id===item.id&&editing?.field==='name'" v-model="editValue"
                :aria-label="tt('card.editWorkNameLabel', { name: item.name })"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full" autofocus />
              <span v-else class="text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors truncate block">{{ item.name }}</span>
            </td>
            <td class="px-3 py-2.5" @dblclick.stop="startEdit(item,'watch_date')">
              <input v-if="editing?.id===item.id&&editing?.field==='watch_date'" v-model="editValue"
                :aria-label="tt('card.editDateLabel', { name: item.name })"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full"
                :placeholder="tt('moveWatched.datePlaceholder')" autofocus />
              <span v-else class="text-sm text-gray-600 truncate block">{{ item.watch_date || '-' }}</span>
            </td>
            <td class="px-3 py-2.5" @dblclick.stop="startEdit(item,'url')">
              <input v-if="editing?.id===item.id&&editing?.field==='url'" v-model="editValue"
                :aria-label="tt('card.editUrlLabel', { name: item.name })"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full"
                :placeholder="tt('record.urlPlaceholder')" autofocus />
              <a v-else :href="item.url ? buildUrl(item) : defaultBgmUrl(item)" target="_blank" rel="noopener"
                @click.stop @mousedown.middle.stop
                :aria-label="tt('card.openLinkLabel', { name: item.name })"
                class="text-xs text-primary hover:text-primary-dark truncate block">{{ item.url || 'bgm.tv' }}</a>
            </td>
            <td class="px-3 py-2.5" @dblclick.stop="startEdit(item,'notes')">
              <input v-if="editing?.id===item.id&&editing?.field==='notes'" v-model="editValue"
                :aria-label="tt('card.editNotesLabel', { name: item.name })"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full" autofocus />
              <span v-else class="text-sm text-gray-400 truncate block">{{ item.notes || '-' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页 -->
    <div v-if="filteredList.length > 0" class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-3">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-2 text-sm text-gray-600">
          <span>{{ tt('watched.totalCount', { count: filteredList.length }) }}</span>
          <div class="relative inline-block">
            <button @click="showPageSizeMenu=!showPageSizeMenu" class="px-2 py-1 border border-primary/20 rounded-lg text-xs hover:bg-primary/5 transition bg-white/80">
              {{ tt('remaining.perPage', { n: pageSize }) }}<AppIcon scale="xs" class="inline-block align-middle ml-0.5" name="caretDown" />
            </button>
            <!-- 与等待更新页完全一致：同样宽度、同样 nowrap、同样向上展开的 pop 过渡 -->
            <transition name="pop">
              <div v-if="showPageSizeMenu" role="menu"
                class="page-size-menu absolute left-0 bottom-full mb-1 z-50 rounded-xl shadow-2xl border border-white/40 py-1 min-w-[12rem] app-menu-surface"
                style="--pop-origin-y: bottom; --pop-from-y: 6px">
                <button v-for="s in pageSizeOptions" :key="s" role="menuitem" @click="setPageSize(s)"
                  class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition whitespace-nowrap" :class="pageSize===s?'text-primary font-bold':'text-gray-700'">{{ tt('remaining.perPage', { n: s }) }}</button>
                <div class="border-t border-gray-200/60 my-1"></div>
                <div class="px-3 py-2 flex items-center gap-2 whitespace-nowrap">
                  <input v-model="customPageSize" type="number" min="1" :placeholder="tt('common.custom')"
                    class="w-[4.5rem] shrink-0 px-2 py-1 border border-primary/20 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white" @keyup.enter="applyCustomPageSize" />
                  <button @click="applyCustomPageSize" class="shrink-0 px-2 py-1 text-xs text-primary hover:text-primary-dark transition whitespace-nowrap">{{ tt('common.confirm') }}</button>
                </div>
              </div>
            </transition>
            <div v-if="showPageSizeMenu" class="fixed inset-0 z-40" @click="showPageSizeMenu=false"></div>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button :disabled="currentPage<=1" @click="currentPage--"
            class="px-3 py-1.5 text-xs rounded-lg transition btn-press" :class="currentPage<=1?'text-gray-300 cursor-not-allowed':'text-gray-600 hover:bg-primary/10'">{{ tt('watched.prevPage') }}</button>
          <template v-for="p in displayPages" :key="p">
            <span v-if="p==='...'" class="px-2 py-1 text-xs text-gray-400">...</span>
            <button v-else @click="currentPage=p"
              class="px-3 py-1.5 text-xs rounded-lg transition btn-press" :class="p===currentPage?'btn-page-active font-bold':'text-gray-600 hover:bg-primary/10'">{{ p }}</button>
          </template>
          <button :disabled="currentPage>=totalPages" @click="currentPage++"
            class="px-3 py-1.5 text-xs rounded-lg transition btn-press" :class="currentPage>=totalPages?'text-gray-300 cursor-not-allowed':'text-gray-600 hover:bg-primary/10'">{{ tt('watched.nextPage') }}</button>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <!-- 右键菜单套统一的 pop 过渡（与每页条数菜单同一套动效） -->
      <transition name="pop">
      <div v-if="contextMenu.show" class="fixed z-[200]"
        style="--pop-origin-y: top; --pop-from-y: -4px"
        :style="{left:contextMenu.x+'px',top:contextMenu.y+'px'}">
        <div class="app-menu-surface rounded-xl shadow-2xl border border-white/40 py-1 min-w-[10rem] context-menu">
          <button @click="ctxEdit" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2"><AppIcon scale="sm" name="edit" /> {{ tt('common.edit') }}</button>
          <button @click="ctxOpenUrl" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2" :class="{'opacity-40':!contextMenu.item?.url}"><AppIcon scale="sm" name="link" /> {{ tt('card.openLink') }}</button>
          <div class="border-t border-white/20 my-1"></div>
          <button @click="ctxDelete" class="w-full text-left px-4 py-2 text-sm hover:bg-danger/10 text-danger transition flex items-center gap-2"><AppIcon scale="sm" name="trash" /> {{ tt('common.delete') }}</button>
        </div>
      </div>
      </transition>
      <div v-if="contextMenu.show" class="fixed inset-0 z-[199]" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu"></div>
    </Teleport>

    <!-- 删除确认对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showConfirmDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showConfirmDialog=false"></div>
      </transition>
      <transition name="modal">
        <div v-if="showConfirmDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[26.25rem] border border-white/40 pointer-events-auto app-dialog" ref="confirmDialogRef" role="dialog" aria-modal="true" aria-labelledby="watched-confirm-title" @keydown.ctrl.enter="confirmActionFn">
            <div class="px-6 py-5 text-center">
              <div class="mb-3 flex justify-center" aria-hidden="true">
                <AppIcon scale="xl" class="text-danger" :name="confirmAction==='clear'?'clear':confirmAction==='deleteYear'?'calendar':'trash'" />
              </div>
              <h3 id="watched-confirm-title" class="text-lg font-bold text-gray-800 mb-2">{{ confirmAction==='clear' ? tt('confirm.clearTitle') : confirmAction==='batchDelete' ? tt('confirm.batchDeleteTitleShort') : confirmAction==='deleteYear' ? tt('watched.deleteYear') : tt('confirm.deleteTitle') }}</h3>
              <p class="text-sm text-gray-500">
                <template v-if="confirmAction==='clear'">
                  <template v-if="clearScope==='year'">{{ tt('confirm.clearYearMessage', { year: selectedYear }) }}</template>
                  <template v-else>{{ tt('confirm.clearAllMessage') }}</template>
                </template>
                <template v-else-if="confirmAction==='batchDelete'">{{ tt('confirm.batchDeleteMessageWatched', { count: confirmTarget }) }}</template>
                <template v-else-if="confirmAction==='deleteYear'">{{ tt('confirm.deleteYearMessage', { year: confirmTarget }) }}</template>
                <template v-else>{{ tt('confirm.deleteOneMessage', { name: confirmTarget }) }}</template>
              </p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button @click="showConfirmDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">{{ tt('common.cancel') }}</button>
              <button @click="confirmActionFn" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-danger to-red-400 rounded-xl hover:shadow-lg hover:shadow-danger/30 transition-all btn-press">{{ confirmAction==='clear' ? tt('confirm.confirmClear') : tt('confirm.confirmDelete') }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 清空选择对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showClearDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showClearDialog=false"></div>
      </transition>
      <transition name="modal">
        <div v-if="showClearDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[26.25rem] border border-white/40 pointer-events-auto app-dialog" ref="clearDialogRef" role="dialog" aria-modal="true" aria-labelledby="watched-clear-title">
            <div class="px-6 py-5 text-center">
              <div class="text-4xl mb-3" aria-hidden="true"><AppIcon scale="sm" name="clear" /></div>
              <h3 id="watched-clear-title" class="text-lg font-bold text-gray-800 mb-2">{{ tt('clearScope.title') }}</h3>
              <p class="text-sm text-gray-500 mb-4">{{ tt('clearScope.hint') }}</p>
              <div class="flex flex-col gap-3">
                <button @click="doClearYear" class="px-5 py-3 text-sm font-medium text-white bg-gradient-to-r from-warning to-amber-400 rounded-xl hover:shadow-lg hover:shadow-warning/30 transition-all btn-press">
                  {{ tt('clearScope.clearYear', { year: selectedYear }) }}
                </button>
                <button @click="doClearAll" class="px-5 py-3 text-sm font-medium text-white bg-gradient-to-r from-danger to-red-400 rounded-xl hover:shadow-lg hover:shadow-danger/30 transition-all btn-press">
                  {{ tt('clearScope.clearAll') }}
                </button>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center">
              <button @click="showClearDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">{{ tt('common.cancel') }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 添加/编辑对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showDialog=false"></div>
      </transition>
      <transition name="modal">
        <div v-if="showDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[28.75rem] border border-white/40 pointer-events-auto app-dialog" ref="recordDialogRef" role="dialog" aria-modal="true" aria-labelledby="watched-record-title" @keydown.ctrl.enter="saveForm">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <AppIcon scale="lg" :name="dialogMode==='add' ? 'sparkle' : 'edit'" />
              <h3 id="watched-record-title" class="text-lg font-bold gradient-text">{{ dialogMode==='add' ? tt('record.addTitle') : tt('record.editTitle') }}</h3>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('watched.colName') }}</label>
                <input ref="dialogNameInput" v-model="form.name" type="text" :placeholder="tt('watched.namePlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>{{ tt('moveWatched.date') }}</span>
                  <button type="button" @click="dateManualInput=!dateManualInput" class="text-xs text-primary hover:text-primary-dark transition">{{ dateManualInput ? tt('record.useDatePicker') : tt('showDialog.manualInput') }}</button>
                </label>
                <input v-if="dateManualInput" v-model="form.watch_date" type="text" :placeholder="tt('moveWatched.datePlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80"
                  :class="{'border-danger/50 ring-danger/20': formDateValidationError}" />
                <input v-else :value="formatToDateInput(form.watch_date)" @input="form.watch_date = dateInputToFormat($event.target.value)" @click="$event.target.showPicker()" type="date"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <p v-if="!dateManualInput && isCoarseDate(form.watch_date)" class="text-xs text-amber-600 mt-1">
                  {{ tt('record.coarseDateHint', { date: form.watch_date }) }}
                </p>
                <p v-if="formDateValidationError" class="text-xs text-danger mt-1">{{ formDateValidationError }}</p>
                <p v-else-if="dateManualInput" class="text-xs text-gray-400 mt-1">{{ tt('record.dateFormatsHint') }}</p>
              </div>
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>{{ tt('moveWatched.time') }}</span>
                  <button type="button" @click="formShowTimePicker=!formShowTimePicker" class="text-xs text-primary hover:text-primary-dark transition">{{ formShowTimePicker ? tt('showDialog.manualInput') : tt('showDialog.clockPicker') }}</button>
                </label>
                <div v-if="!formShowTimePicker" class="relative">
                  <div class="time-picker-trigger w-full h-10 flex items-center justify-center border border-primary/20 rounded-xl bg-white/80 cursor-pointer hover:border-primary/40 transition" @click="formShowTimeDropdown=!formShowTimeDropdown">
                    <span class="text-sm font-mono" :class="formTime?'text-gray-800':'text-gray-400'">{{ formTime || tt('showDialog.clickToPickTime') }}</span>
                    <svg class="w-4 h-4 ml-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </div>
                  <div v-if="formShowTimeDropdown" class="time-picker-dropdown absolute z-50 mt-1 w-full glass rounded-xl shadow-2xl border border-white/30 p-3 max-h-52 overflow-y-auto">
                    <div class="grid grid-cols-6 gap-1">
                      <button v-for="h in 24" :key="'fh'+h" @click="formSelectTimeHour(h-1)"
                        class="px-2 py-1.5 text-xs rounded-lg transition btn-press"
                        :class="parseInt(formTime?.split(':')[0])===h-1?'bg-primary text-white font-bold':'hover:bg-primary/10 text-gray-700'">
                        {{ String(h-1).padStart(2,'0') }}:00
                      </button>
                    </div>
                    <div class="border-t border-white/20 my-2"></div>
                    <div class="grid grid-cols-6 gap-1">
                      <button v-for="m in 12" :key="'fm'+m" @click="formSelectTimeMinute((m-1)*5)"
                        class="px-2 py-1.5 text-xs rounded-lg transition btn-press"
                        :class="parseInt(formTime?.split(':')[1])===(m-1)*5?'bg-secondary text-white font-bold':'hover:bg-secondary/10 text-gray-700'">
                        :{{ String((m-1)*5).padStart(2,'0') }}
                      </button>
                    </div>
                  </div>
                  <div v-if="formShowTimeDropdown" class="fixed inset-0 z-40" @click="formShowTimeDropdown=false"></div>
                </div>
                <div v-else class="flex items-center gap-2">
                  <input v-model="formTime" type="text" placeholder="HH:mm"
                    class="flex-1 px-4 py-2.5 border border-primary/20 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                  <button @click="formTime=''" class="px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">{{ tt('record.clearTime') }}</button>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('showDialog.url') }}</label>
                <input v-model="form.url" type="text" :placeholder="tt('record.urlPlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
              <div v-if="form.url">
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('showDialog.urlParams') }}</label>
                <input v-model="form.url_params" type="text" :placeholder="tt('record.urlParamsPlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <p class="text-xs text-gray-400 mt-1">{{ tt('showDialog.episodeTokenHint') }}</p>
              </div>
              <div>
                <!-- 标签选择：与追番页同一个 TagSelector 组件 -->
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('tags.label') }}</label>
                <TagSelector v-model="form.tags" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('showDialog.notes') }}</label>
                <textarea v-model="form.notes" rows="2" :placeholder="tt('showDialog.notesPlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition resize-none bg-white/80"></textarea>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">{{ tt('common.cancel') }}</button>
              <button @click="saveForm" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all btn-press disabled:opacity-40">{{ tt('common.save') }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 添加年份对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showYearDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showYearDialog=false"></div>
      </transition>
      <transition name="modal">
        <div v-if="showYearDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[25rem] border border-white/40 pointer-events-auto app-dialog" ref="yearDialogRef" role="dialog" aria-modal="true" aria-labelledby="watched-year-title" @keydown.ctrl.enter="saveYearForm">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <AppIcon scale="lg" name="calendar" />
              <h3 id="watched-year-title" class="text-lg font-bold gradient-text">{{ yearDialogMode==='add' ? tt('watched.addYear') : tt('watched.editYear') }}</h3>
            </div>
            <div class="px-6 py-5">
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('watched.yearLabel') }}</label>
              <input v-model="yearForm.year_label" type="text" :placeholder="tt('watched.yearLabelPlaceholder')"
                class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              <p class="text-xs text-gray-400 mt-1">{{ tt('watched.yearLabelHint') }}</p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showYearDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">{{ tt('common.cancel') }}</button>
              <button @click="saveYearForm" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-secondary to-secondary-dark rounded-xl hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press">{{ tt('common.save') }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { watchedApi, watchedYearsApi, batchApi } from '../db/api'
import { validateDate, dateInputToFormat, formatToDateInput, extractYear, extractAllYears, compareDateKey, todayStr } from '../composables/useDatePicker'
import { showToast } from '../composables/useToast'
import { openExternal } from '../composables/useEpisode'
import { placeContextMenu } from '../composables/useContextMenu'
import { useDialogFocus } from '../composables/useDialogFocus'
import { useI18n } from '../composables/useI18n'

const { tt } = useI18n()

const years = ref([])
const watchedList = ref([])
const selected = ref(null)
const selectedYear = ref('')
const yearCount = ref(0)
const totalCount = ref(0)
const showDialog = ref(false)
const showYearDialog = ref(false)
const showClearDialog = ref(false)
const clearScope = ref('year')
const dialogMode = ref('add')
const yearDialogMode = ref('add')
const editingYearId = ref(null)
const searchQuery = ref('')
// 标签筛选：逗号分隔的已选标签名，空串表示不筛选
const tagFilter = ref('')

// 时间选择器
const formTime = ref('')
const formShowTimePicker = ref(false)
const formShowTimeDropdown = ref(false)
const formDateValidationError = ref('')

const formSelectTimeHour = (h) => {
  const currentMin = formTime.value ? formTime.value.split(':')[1] || '00' : '00'
  formTime.value = `${String(h).padStart(2,'0')}:${currentMin}`
}
const formSelectTimeMinute = (m) => {
  const currentHour = formTime.value ? formTime.value.split(':')[0] || '00' : '00'
  formTime.value = `${currentHour}:${String(m).padStart(2,'0')}`
  formShowTimeDropdown.value = false
}

// 年份降序排列
const sortedYears = computed(() => {
  return [...years.value].sort((a, b) => {
    // 尝试按数字排序，否则按字符串降序
    const numA = parseInt(a.year_label)
    const numB = parseInt(b.year_label)
    if (!isNaN(numA) && !isNaN(numB)) return numB - numA
    return b.year_label.localeCompare(a.year_label)
  })
})

// 排序：默认按观看日期从早到晚（日期格式统一为 YYYY/MM/DD HH:mm，取数字位直接比较即按时间序）
// 排序偏好持久化到 localStorage
const SORT_KEY_F = 'watched_sort_field'
const SORT_KEY_O = 'watched_sort_order'
const sortField = ref(localStorage.getItem(SORT_KEY_F) || 'watch_date')
const sortOrder = ref(localStorage.getItem(SORT_KEY_O) || 'asc')
watch([sortField, sortOrder], ([f, o]) => {
  localStorage.setItem(SORT_KEY_F, f)
  localStorage.setItem(SORT_KEY_O, o)
})
const toggleSort = (field) => {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortOrder.value = 'asc'
  }
}
const compareByField = (a, b) => {
  if (sortField.value === 'watch_date') {
    return compareDateKey(a.watch_date, b.watch_date)
  }
  return String(a[sortField.value] || '').localeCompare(String(b[sortField.value] || ''), 'zh-CN')
}

// 搜索过滤（在当前年份的数据中搜索）+ 排序
const filteredList = computed(() => {
  let list = watchedList.value
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(item => item.name.toLowerCase().includes(q))
  }
  // 标签筛选：多选之间 OR（任一所选标签命中即保留），与搜索是 AND 叠加
  if (tagFilter.value.trim()) {
    const wanted = tagFilter.value.split(',').map(s => s.trim()).filter(Boolean)
    list = list.filter(item => {
      const itemTags = String(item.tags || '').split(',').map(s => s.trim()).filter(Boolean)
      return wanted.some(w => itemTags.includes(w))
    })
  }
  if (sortField.value) {
    list = [...list].sort((a, b) => {
      const cmp = compareByField(a, b)
      return sortOrder.value === 'asc' ? cmp : -cmp
    })
  }
  return list
})

// ========== 分页 ==========
const currentPage = ref(1)
const pageSize = ref(20)
const pageSizeOptions = [10, 20, 50, 100]
const customPageSize = ref('')
const showPageSizeMenu = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(filteredList.value.length / pageSize.value)))
const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

watch([filteredList, pageSize], () => { currentPage.value = 1 })

const setPageSize = (size) => {
  pageSize.value = size
  customPageSize.value = ''
  showPageSizeMenu.value = false
}
const applyCustomPageSize = () => {
  const n = parseInt(customPageSize.value)
  if (n > 0) { pageSize.value = n; showPageSizeMenu.value = false }
}

const displayPages = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  if (total <= 7) return Array.from({length: total}, (_, i) => i + 1)
  const pages = []
  pages.push(1)
  if (current > 3) pages.push('...')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
})

// ========== 批量操作 ==========
const batchMode = ref(false)
const checkedIds = ref([])
const isAllChecked = computed(() => paginatedList.value.length > 0 && paginatedList.value.every(item => checkedIds.value.includes(item.id)))

const toggleBatchMode = () => {
  batchMode.value = !batchMode.value
  checkedIds.value = []
  if (batchMode.value) selected.value = null
}

const handleKeydown = (e) => {
  if (e.key === 'Escape') {
    if (showDialog.value) { showDialog.value = false; return }
    if (showConfirmDialog.value) { showConfirmDialog.value = false; return }
    if (showClearDialog.value) { showClearDialog.value = false; return }
    if (showYearDialog.value) { showYearDialog.value = false; return }
    if (contextMenu.value.show) { contextMenu.value.show = false; return }
    if (batchMode.value) { batchMode.value = false; checkedIds.value = [] }
  }
}

const toggleCheck = (id) => {
  const idx = checkedIds.value.indexOf(id)
  if (idx >= 0) checkedIds.value.splice(idx, 1)
  else checkedIds.value.push(id)
}

const toggleSelectAll = () => {
  const pageIds = paginatedList.value.map(i => i.id)
  checkedIds.value = isAllChecked.value
    ? checkedIds.value.filter(id => !pageIds.includes(id))
    : [...new Set([...checkedIds.value, ...pageIds])]
}

const batchDelete = () => {
  if (checkedIds.value.length === 0) return
  confirmTarget.value = String(checkedIds.value.length)
  confirmAction.value = 'batchDelete'
  showConfirmDialog.value = true
}

const openClearDialog = () => {
  showClearDialog.value = true
}

const doClearYear = async () => {
  showClearDialog.value = false
  confirmAction.value = 'clear'
  clearScope.value = 'year'
  confirmTarget.value = selectedYear.value
  showConfirmDialog.value = true
}

const doClearAll = async () => {
  showClearDialog.value = false
  confirmAction.value = 'clear'
  clearScope.value = 'all'
  confirmTarget.value = tt('watched.allRecords')
  showConfirmDialog.value = true
}

const editing = ref(null)
const editValue = ref('')
const dateManualInput = ref(false)

// 新增时的默认观看日期 = 今天（编辑已有记录时仍沿用记录原值）
const form = ref({ name:'', watch_date: todayStr(), url:'', url_params:'', notes:'', tags:'' })

const buildUrl = (item) => {
  if (!item.url) return ''
  let url = item.url
  if (item.url_params) {
    const params = item.url_params.replace(/\{集数\}/g, item.current_episode || 0)
    url += (url.includes('?') ? '&' : '?') + params
  }
  return url
}

const defaultBgmUrl = (item) => {
  return 'https://bgm.tv/subject_search/' + encodeURIComponent(item.name || '')
}

const openItemLink = (item) => {
  const url = item.url ? buildUrl(item) : defaultBgmUrl(item)
  openExternal(url)
}
const yearForm = ref({ year_label:'' })

const contextMenu = ref({ show:false, x:0, y:0, item:null })
const openContextMenu = (e, item) => {
  selected.value = item
  // 贴边/贴底时自动翻转，避免菜单被视口裁掉
  placeContextMenu(contextMenu, e, { item })
}
const closeContextMenu = () => { contextMenu.value.show = false }
const ctxEdit = () => { closeContextMenu(); openEditDialog() }
const ctxOpenUrl = () => {
  const item = contextMenu.value.item
  closeContextMenu()
  if (item?.url) openExternal(buildUrl(item))
}
const ctxDelete = () => { closeContextMenu(); openConfirmDialog() }

const showConfirmDialog = ref(false)
const confirmTarget = ref('')
const confirmAction = ref('delete')
const openConfirmDialog = () => {
  if (!selected.value) return
  confirmTarget.value = selected.value.name
  confirmAction.value = 'delete'
  showConfirmDialog.value = true
}

const openDeleteYearDialog = () => {
  const y = years.value.find(y => y.year_label === selectedYear.value)
  if (!y) return
  confirmTarget.value = y.year_label
  confirmAction.value = 'deleteYear'
  showConfirmDialog.value = true
}

const confirmActionFn = async () => {
  showConfirmDialog.value = false
  if (confirmAction.value === 'batchDelete') {
    try {
      const res = await batchApi.batchDeleteWatched(checkedIds.value)
      if (res.data.success) { showToast(tt('toast.batchDeleted', { count: checkedIds.value.length })); checkedIds.value=[]; batchMode.value=false; await fetchData() }
      else showToast(res.data.error||tt('toast.batchDeleteFailed'),'error')
    } catch { showToast(tt('toast.batchDeleteFailed'),'error') }
  } else if (confirmAction.value === 'clear') {
    try {
      if (clearScope.value === 'year') {
        // 清空当前年份
        const yearItems = watchedList.value.map(i => i.id)
        if (yearItems.length === 0) { showToast(tt('toast.noRecordThisYear'),'warning'); return }
        const res = await batchApi.batchDeleteWatched(yearItems)
        if (res.data.success) { showToast(tt('toast.yearCleared', { year: selectedYear.value })); selected.value=null; batchMode.value=false; checkedIds.value=[]; await fetchData() }
        else showToast(res.data.error||tt('toast.clearFailed'),'error')
      } else {
        // 清空所有
        const res = await batchApi.clearWatched()
        if (res.data.success) {
          await batchApi.clearWatchedYears()
          showToast(tt('toast.allWatchedCleared')); selected.value=null; batchMode.value=false; checkedIds.value=[]; await fetchYears(); await fetchData()
        }
        else showToast(res.data.error||tt('toast.clearFailed'),'error')
      }
    } catch { showToast(tt('toast.clearFailed'),'error') }
  } else if (confirmAction.value === 'deleteYear') {
    const y = years.value.find(y => y.year_label === confirmTarget.value)
    if (!y) return
    try {
      const res = await watchedYearsApi.delete(y.id)
      if (res.data.success) { showToast(tt('toast.yearDeleted')); await fetchYears(); if (years.value.length > 0) { selectedYear.value = years.value[0].year_label } else { selectedYear.value = '' } await fetchData() }
      else showToast(res.data.error||tt('toast.delFailed'),'error')
    } catch { showToast(tt('toast.delFailed'),'error') }
  } else if (confirmAction.value === 'delete') {
    if (!selected.value) return
    try {
      const res = await watchedApi.delete(selected.value.id)
      if (res.data.success) { showToast(tt('toast.deleted')); selected.value=null; await fetchData() }
      else showToast(res.data.error||tt('toast.delFailed'),'error')
    } catch { showToast(tt('toast.delFailed'),'error') }
  }
}

const fetchYears = async () => {
  try {
    const res = await watchedYearsApi.getAll()
    if (res.data.success) {
      years.value = res.data.data
      if (years.value.length > 0 && !selectedYear.value) {
        // 默认选择今年
        const thisYear = String(new Date().getFullYear())
        const found = years.value.find(y => y.year_label === thisYear)
        selectedYear.value = found ? found.year_label : years.value[0].year_label
      }
    }
  } catch {}
}

const fetchData = async () => {
  if (!selectedYear.value) {
    watchedList.value = []
    yearCount.value = 0
    selected.value = null
    checkedIds.value = []
    return
  }
  try {
    if (selectedYear.value === '__all__') {
      const res = await watchedApi.getAll()
      if (res.data.success) {
        watchedList.value = res.data.data
        yearCount.value = res.data.data.length
        totalCount.value = res.data.data.length
      }
    } else if (selectedYear.value === '__unclassified__') {
      const res = await watchedApi.getAll()
      if (res.data.success) {
        const ranges = years.value.map(y => String(y.year_label)).map(label => {
          const m = label.match(/^(\d{4})\s*~\s*(\d{4})$/)
          if (m) return { label, start: parseInt(m[1], 10), end: parseInt(m[2], 10) }
          const single = label.match(/^(\d{4})$/)
          if (single) { const y = parseInt(single[1], 10); return { label, start: y, end: y } }
          return { label, start: null, end: null }
        })
        watchedList.value = res.data.data.filter(item => {
          const d = String(item.watch_date || '')
          if (!d) return true
          const matched = ranges.some(r => {
            if (d === r.label) return true
            if (r.start == null) return false
            const m = d.match(/^(\d{4})/)
            if (!m) return false
            const y = parseInt(m[1], 10)
            return y >= r.start && y <= r.end
          })
          return !matched
        })
        yearCount.value = watchedList.value.length
        totalCount.value = res.data.data.length
      }
    } else {
      const res = await watchedApi.getByYear(selectedYear.value)
      if (res.data.success) {
        watchedList.value = res.data.data
        yearCount.value = res.data.yearCount
        totalCount.value = res.data.totalCount
      }
    }
    const visible = new Set(watchedList.value.map(item => item.id))
    checkedIds.value = checkedIds.value.filter(id => visible.has(id))
    selected.value = selected.value ? watchedList.value.find(item => item.id === selected.value.id) || null : null
  } catch { showToast(tt('toast.fetchFailed'),'error') }
}

const selectItem = (item) => { selected.value = item }

// 年份 / 年月 / 年份范围精度的日期无法表示在 type="date" 里
const isCoarseDate = (value) => {
  const v = String(value || '').trim()
  if (!v) return false
  return !/^\d{4}\/\d{1,2}\/\d{1,2}/.test(v)
}

// 点击表格行和交互元素以外的区域时取消选中（document 级监听，覆盖页面留白）
const onDocClick = (e) => {
  if (editing.value && !e.target.closest('input, select, textarea')) {
    cancelEdit()
  }
  if (e.target.closest('tbody tr, button, input, select, textarea, a, .app-dialog, .context-menu, .selectable-text')) return
  selected.value = null
}

// ========== 内联编辑 ==========
const startEdit = (item, field) => {
  editing.value = { id: item.id, field }
  editValue.value = String(item[field] ?? '')
}

const cancelEdit = () => { editing.value = null }

const saveEdit = async () => {
  if (!editing.value) return
  const token = editing.value
  const { id, field } = token
  let val = editValue.value
  if (field === 'name') {
    val = val.trim()
    if (!val) { showToast(tt('toast.pleaseEnterWorkName'), 'warning'); return }
  }
  if (field === 'watch_date') {
    const validation = validateDate(val)
    if (!validation.valid) { showToast(validation.error, 'warning'); return }
    val = validation.normalized
  }
  const item = watchedList.value.find(i => i.id === id)
  const originalValue = String(item?.[field] ?? '')
  if (val === originalValue) { if (editing.value === token) editing.value = null; return }
  try {
    const res = await watchedApi.update(id, { [field]: val })
    if (res.data.success) {
      if (item) item[field] = val
      if (field === 'watch_date') await fetchYears()
    } else { showToast(res.data.error||tt('toast.updateFailed'),'error') }
  } catch { showToast(tt('toast.updateFailed'),'error') }
  if (editing.value === token) editing.value = null
}

// ========== 年份操作 ==========
const openAddYearDialog = () => {
  yearDialogMode.value = 'add'
  yearForm.value = { year_label: '' }
  showYearDialog.value = true
}

const editYearLabel = () => {
  const y = years.value.find(y => y.year_label === selectedYear.value)
  if (!y) return
  yearDialogMode.value = 'edit'
  editingYearId.value = y.id
  yearForm.value = { year_label: y.year_label }
  showYearDialog.value = true
}

const saveYearForm = async () => {
  if (!yearForm.value.year_label.trim()) { showToast(tt('toast.pleaseEnterYearLabel'),'warning'); return }
  try {
    if (yearDialogMode.value === 'add') {
      const res = await watchedYearsApi.add(yearForm.value)
      if (res.data.success) {
        showToast(tt('toast.yearAdded'))
        showYearDialog.value = false
        await fetchYears()
        selectedYear.value = yearForm.value.year_label
        await fetchData()
      } else { showToast(res.data.error||tt('toast.addFailed'),'error') }
    } else {
      const res = await watchedYearsApi.update(editingYearId.value, yearForm.value)
      if (res.data.success) {
        showToast(tt('toast.yearUpdated'))
        showYearDialog.value = false
        await fetchYears()
        selectedYear.value = yearForm.value.year_label
        await fetchData()
      } else { showToast(res.data.error||tt('toast.updateFailed'),'error') }
    }
  } catch { showToast(tt('toast.operationFailed'),'error') }
}

// ========== 记录操作 ==========
const dialogNameInput = ref(null)
const focusNameInput = () => { nextTick(() => dialogNameInput.value?.focus()) }

// 仅当选中的是真实年份标签时才预填观看日期（排除「全部年份」「未分类」两个哨兵值）

// 判断是否为「真实年份」（而非全部 / 未分类这类虚拟分组）
const isRealYear = (y) => !!y && y !== '__all__' && y !== '__unclassified__'

const openAddDialog = () => {
  dialogMode.value = 'add'
  // 默认日期：在某个**真实年份**视图下添加时填该年份（保留原有的便利性）；
  // 其余情况（全部 / 未分类）回落为今天。
  form.value = {
    name:'',
    watch_date: isRealYear(selectedYear.value) ? selectedYear.value : todayStr(),
    url:'', url_params:'', notes:'', tags:''
  }
  formTime.value = ''
  formDateValidationError.value = ''
  formShowTimePicker.value = false
  formShowTimeDropdown.value = false
  showDialog.value = true
  focusNameInput()
}

/**
 * 选中项专属操作按钮：集中定义，模板 v-for 渲染。
 * 颜色由语义类决定（全部跟随主题色），配合 transition-group 统一动效。
 */
const selectedActions = computed(() => [
  { key: 'edit', icon: 'edit', label: tt('common.edit'), cls: 'btn-toned', onClick: () => openEditDialog() },
  { key: 'del', icon: 'trash', label: tt('common.delete'), cls: 'btn-danger', onClick: () => deleteItem() },
])

const openEditDialog = () => {
  if (!selected.value) return
  dialogMode.value = 'edit'
  const watchDate = selected.value.watch_date || ''
  // 年 / 年月精度无法用 type="date" 表示，自动切手动输入避免显示为空
  dateManualInput.value = isCoarseDate(watchDate)
  const parts = watchDate.split(' ')
  const datePart = parts[0] || ''
  const timePart = parts.length > 1 ? parts.slice(1).join(' ') : ''
  form.value = {
    name: selected.value.name,
    watch_date: datePart,
    url: selected.value.url || '',
    url_params: selected.value.url_params || '',
    notes: selected.value.notes || '',
    tags: selected.value.tags || ''
  }
  formTime.value = timePart
  formDateValidationError.value = ''
  formShowTimePicker.value = false
  formShowTimeDropdown.value = false
  showDialog.value = true
  focusNameInput()
}

const saveForm = async () => {
  if (!form.value.name.trim()) { showToast(tt('toast.pleaseEnterWorkName'),'warning'); return }
  if (form.value.watch_date && form.value.watch_date.trim()) {
    const validation = validateDate(form.value.watch_date)
    if (!validation.valid) {
      formDateValidationError.value = validation.error
      return
    }
    formDateValidationError.value = ''
    form.value.watch_date = validation.normalized
  }
  if (formTime.value) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(formTime.value)) {
      formDateValidationError.value = tt('toast.timeFormatInvalid')
      return
    }
    const dateStr = form.value.watch_date
    if (!(/^\d{4}$/.test(dateStr) || /^\d{4}\/\d{2}$/.test(dateStr) || /~/.test(dateStr))) {
      form.value.watch_date = dateStr + ' ' + formTime.value
    }
  }
  try {
    if (dialogMode.value === 'add') {
      const res = await watchedApi.add(form.value)
      if (res.data.success) { showToast(tt('toast.historyAdded')); showDialog.value=false; await fetchYears(); await fetchData() }
      else showToast(res.data.error||tt('toast.addFailed'),'error')
    } else {
      const res = await watchedApi.update(selected.value.id, form.value)
      if (res.data.success) { showToast(tt('toast.historyUpdated')); showDialog.value=false; selected.value=null; await fetchYears(); await fetchData() }
      else showToast(res.data.error||tt('toast.updateFailed'),'error')
    }
  } catch { showToast(tt('toast.operationFailed'),'error') }
}

const deleteItem = async () => {
  if (!selected.value) return
  confirmTarget.value = selected.value.name
  confirmAction.value = 'delete'
  showConfirmDialog.value = true
}

// 弹窗焦点管理：打开聚焦首个输入、Tab 在弹窗内循环、关闭后焦点归还
const confirmDialogRef = ref(null)
const clearDialogRef = ref(null)
const recordDialogRef = ref(null)
const yearDialogRef = ref(null)
const pageRootRef = ref(null)

useDialogFocus({
  isOpen: () => showDialog.value,
  getDialog: () => recordDialogRef.value,
  root: () => pageRootRef.value,
  initialFocus: () => dialogNameInput.value,
})
useDialogFocus({
  isOpen: () => showConfirmDialog.value,
  getDialog: () => confirmDialogRef.value,
  root: () => pageRootRef.value,
})
useDialogFocus({
  isOpen: () => showClearDialog.value,
  getDialog: () => clearDialogRef.value,
  root: () => pageRootRef.value,
})
useDialogFocus({
  isOpen: () => showYearDialog.value,
  getDialog: () => yearDialogRef.value,
  root: () => pageRootRef.value,
})

onMounted(async () => {
  await fetchYears()
  await fetchData()
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', onDocClick)
})
</script>
