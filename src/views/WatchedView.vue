<template>
  <div class="space-y-5" @click="handleRootClick" @keydown="handleKeydown" tabindex="-1">
    <!-- 顶部信息栏 + 操作面板合并 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <label class="text-sm font-medium text-gray-700">选择年份:</label>
            <select v-model="selectedYear" @change="fetchData"
              class="px-4 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80">
              <option value="__all__">📚 全部年份</option>
              <option v-for="y in sortedYears" :key="y.year_label" :value="y.year_label">{{ y.year_label }}</option>
              <option value="__unclassified__">📋 未分类</option>
            </select>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <span class="px-4 py-2 bg-gradient-to-r from-primary/10 to-secondary/10 text-primary font-bold rounded-xl">
              本年: {{ yearCount }}部
            </span>
            <span class="px-3 py-1.5 bg-gray-100 text-gray-600 font-bold rounded-xl">
              总计: {{ totalCount }}部
            </span>
          </div>
          <div class="relative">
            <input v-model="searchQuery" type="text" placeholder="搜索作品名称..."
              class="pl-8 pr-8 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80 w-48" />
            <svg class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <button v-if="searchQuery" @click="searchQuery=''" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button @click="openAddDialog" class="px-4 py-2 bg-gradient-to-r from-success to-emerald-400 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-success/30 transition-all btn-press">✨ 添加记录</button>
          <button :disabled="!selected" @click="openEditDialog" class="px-4 py-2 bg-gradient-to-r from-primary to-primary-light text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-primary/30 transition-all btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">✏️ 编辑</button>
          <button :disabled="!selected" @click="deleteItem" class="px-4 py-2 bg-gradient-to-r from-gray-400 to-gray-500 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">🗑️ 删除</button>
          <div class="border-l border-white/30 h-6 mx-1"></div>
          <button @click="toggleBatchMode" class="px-4 py-2 text-white rounded-xl text-sm font-medium transition-all btn-press" :class="batchMode?'bg-gradient-to-r from-primary to-primary-light shadow-lg shadow-primary/30':'bg-gradient-to-r from-gray-400 to-gray-500'">☑️ 批量选择</button>
          <button v-if="batchMode" :disabled="checkedIds.length===0" @click="batchDelete" class="px-4 py-2 bg-gradient-to-r from-danger to-red-400 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-danger/30 transition-all btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">🗑️ 批量删除 ({{ checkedIds.length }})</button>
          <button v-if="batchMode" @click="toggleSelectAll" class="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all btn-press">{{ isAllChecked?'取消全选':'全选' }}</button>
          <button @click="openClearDialog" class="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all btn-press">💣 清空列表</button>
          <div class="border-l border-white/30 h-6 mx-1"></div>
          <button @click="openAddYearDialog" class="px-4 py-2 bg-gradient-to-r from-secondary to-secondary-light text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press">✨ 添加年份</button>
          <button v-if="selectedYear && selectedYear !== '__unclassified__'" @click="editYearLabel" class="px-4 py-2 bg-gradient-to-r from-primary to-primary-light text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-primary/30 transition-all btn-press">✏️ 编辑年份</button>
          <button v-if="selectedYear && selectedYear !== '__unclassified__'" @click="openDeleteYearDialog" class="px-4 py-2 bg-gradient-to-r from-gray-400 to-gray-500 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all btn-press">🗑️ 删除年份</button>
        </div>
      </div>
      <div v-if="batchMode && checkedIds.length > 0" class="mt-2 text-sm text-danger flex items-center gap-2">
        <span class="inline-block w-2 h-2 rounded-full bg-danger animate-pulse-soft"></span>
        已选择 <span class="font-bold">{{ checkedIds.length }}</span> 项
      </div>
      <div v-if="selected && !batchMode" class="mt-2 text-sm text-gray-500 flex items-center gap-2">
        <span class="inline-block w-2 h-2 rounded-full bg-primary animate-pulse-soft"></span>
        当前选中: <span class="font-bold gradient-text">{{ selected.name }}</span>
        <span class="text-gray-400">{{ selected.watch_date }}</span>
      </div>
    </div>

    <!-- 列表视图 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="bg-gradient-to-r from-primary/10 to-secondary/10 text-sm font-bold border-b border-white/20">
            <th v-if="batchMode" class="text-center px-2 py-2.5 text-primary-dark font-bold cursor-pointer select-none" @click="toggleSelectAll">
              <div class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all mx-auto"
                :class="isAllChecked?'bg-danger border-danger':'border-gray-300 bg-white/80 hover:border-primary'">
                <svg v-if="isAllChecked" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
              </div>
            </th>
            <th class="text-center px-2 py-2.5 text-primary-dark font-bold whitespace-nowrap">#</th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold cursor-pointer select-none hover:bg-primary/5 transition" @click="toggleSort('name')">
              🌸 作品名称 {{ sortField==='name'?(sortOrder==='asc'?'↑':'↓'):'' }}
            </th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold cursor-pointer select-none hover:bg-primary/5 transition whitespace-nowrap" @click="toggleSort('watch_date')">
              📅 日期 {{ sortField==='watch_date'?(sortOrder==='asc'?'↑':'↓'):'' }}
            </th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold whitespace-nowrap">🔗 链接</th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold whitespace-nowrap">📝 备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="paginatedList.length===0">
            <td :colspan="batchMode?6:5" class="py-16 text-center text-gray-400">
              <div class="text-4xl mb-3 animate-float">📭</div>
              <div>{{ searchQuery ? '没有找到匹配的记录' : (selectedYear === '__unclassified__' ? '暂无未分类记录' : selectedYear + ' 暂无已看记录') }}</div>
            </td>
          </tr>
          <tr v-for="(item,idx) in paginatedList" :key="item.id"
            class="cursor-pointer transition-all duration-200 border-b border-white/10 list-item group"
            :class="[batchMode && checkedIds.includes(item.id)?'bg-danger/10':selected?.id===item.id?'bg-primary/10':idx%2===0?'bg-white/20':'bg-white/40']"
            @click="batchMode?toggleCheck(item.id):selectItem(item)"
            @contextmenu.prevent="!batchMode && openContextMenu($event,item)"
            @mousedown.middle.prevent="openItemLink(item)">
            <td v-if="batchMode" class="text-center px-2 py-2.5" @click.stop="toggleCheck(item.id)">
              <div class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all mx-auto"
                :class="checkedIds.includes(item.id)?'bg-danger border-danger':'border-gray-300 bg-white/80 hover:border-primary'">
                <svg v-if="checkedIds.includes(item.id)" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
              </div>
            </td>
            <td class="text-center px-2 py-2.5 text-xs text-gray-400 font-mono">{{ idx+1 }}</td>
            <td class="px-3 py-2.5" @dblclick.stop="!batchMode && startEdit(item,'name')">
              <input v-if="editing?.id===item.id&&editing?.field==='name'" v-model="editValue"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full" autofocus />
              <span v-else class="text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors truncate block">{{ item.name }}</span>
            </td>
            <td class="px-3 py-2.5" @dblclick.stop="startEdit(item,'watch_date')">
              <input v-if="editing?.id===item.id&&editing?.field==='watch_date'" v-model="editValue"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full"
                placeholder="如: 2025" autofocus />
              <span v-else class="text-sm text-gray-600 truncate block">{{ item.watch_date || '-' }}</span>
            </td>
            <td class="px-3 py-2.5" @dblclick.stop="startEdit(item,'url')">
              <input v-if="editing?.id===item.id&&editing?.field==='url'" v-model="editValue"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full"
                placeholder="https://..." autofocus />
              <a v-else :href="item.url ? buildUrl(item) : defaultBgmUrl(item)" target="_blank" rel="noopener"
                @click.stop @mousedown.middle.stop
                class="text-xs text-primary hover:text-primary-dark truncate block">{{ item.url || '🔍 bgm.tv' }}</a>
            </td>
            <td class="px-3 py-2.5" @dblclick.stop="startEdit(item,'notes')">
              <input v-if="editing?.id===item.id&&editing?.field==='notes'" v-model="editValue"
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
          <span>共 {{ filteredList.length }} 条</span>
          <div class="relative inline-block">
            <button @click="showPageSizeMenu=!showPageSizeMenu" class="px-2 py-1 border border-primary/20 rounded-lg text-xs hover:bg-primary/5 transition bg-white/80">
              每页 {{ pageSize }} 条 ▾
            </button>
            <div v-if="showPageSizeMenu" class="absolute left-0 bottom-full mb-1 glass rounded-xl shadow-2xl border border-white/30 py-1 min-w-[7.5rem] z-50">
              <button v-for="s in pageSizeOptions" :key="s" @click="setPageSize(s)"
                class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition" :class="pageSize===s?'text-primary font-bold':'text-gray-700'">{{ s }} 条/页</button>
              <div class="border-t border-white/20 my-1"></div>
              <div class="px-3 py-2 flex items-center gap-2">
                <input v-model="customPageSize" type="number" min="1" placeholder="自定义"
                  class="w-16 px-2 py-1 border border-primary/20 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white/80" @keyup.enter="applyCustomPageSize" />
                <button @click="applyCustomPageSize" class="px-2 py-1 text-xs text-primary hover:text-primary-dark transition">确定</button>
              </div>
            </div>
            <div v-if="showPageSizeMenu" class="fixed inset-0 z-40" @click="showPageSizeMenu=false"></div>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button :disabled="currentPage<=1" @click="currentPage--"
            class="px-3 py-1.5 text-xs rounded-lg transition btn-press" :class="currentPage<=1?'text-gray-300 cursor-not-allowed':'text-gray-600 hover:bg-primary/10'">上一页</button>
          <template v-for="p in displayPages" :key="p">
            <span v-if="p==='...'" class="px-2 py-1 text-xs text-gray-400">...</span>
            <button v-else @click="currentPage=p"
              class="px-3 py-1.5 text-xs rounded-lg transition btn-press" :class="p===currentPage?'bg-primary text-white font-bold':'text-gray-600 hover:bg-primary/10'">{{ p }}</button>
          </template>
          <button :disabled="currentPage>=totalPages" @click="currentPage++"
            class="px-3 py-1.5 text-xs rounded-lg transition btn-press" :class="currentPage>=totalPages?'text-gray-300 cursor-not-allowed':'text-gray-600 hover:bg-primary/10'">下一页</button>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="contextMenu.show" class="fixed z-[200]" :style="{left:contextMenu.x+'px',top:contextMenu.y+'px'}">
        <div class="glass rounded-xl shadow-2xl border border-white/30 py-1 min-w-[10rem] animate-scale-in">
          <button @click="ctxEdit" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2">✏️ 编辑</button>
          <button @click="ctxOpenUrl" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2" :class="{'opacity-40':!contextMenu.item?.url}">🔗 打开链接</button>
          <div class="border-t border-white/20 my-1"></div>
          <button @click="ctxDelete" class="w-full text-left px-4 py-2 text-sm hover:bg-danger/10 text-danger transition flex items-center gap-2">🗑️ 删除</button>
        </div>
      </div>
      <div v-if="contextMenu.show" class="fixed inset-0 z-[199]" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu"></div>
    </Teleport>

    <!-- 删除确认对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showConfirmDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showConfirmDialog=false"></div>
      </transition>
      <transition name="modal">
        <div v-if="showConfirmDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[26.25rem] border border-white/40 pointer-events-auto" @keydown.ctrl.enter="confirmActionFn">
            <div class="px-6 py-5 text-center">
              <div class="text-4xl mb-3">{{ confirmAction==='clear'?'💣':confirmAction==='batchDelete'?'🗑️':confirmAction==='deleteYear'?'📅':'🗑️' }}</div>
              <h3 class="text-lg font-bold text-gray-800 mb-2">{{ confirmAction==='clear'?'确认清空':confirmAction==='batchDelete'?'批量删除':confirmAction==='deleteYear'?'删除年份':'确认删除' }}</h3>
              <p class="text-sm text-gray-500">
                <template v-if="confirmAction==='clear'">
                  <template v-if="clearScope==='year'">确定要清空「<span class="font-semibold text-gray-700">{{ selectedYear }}</span>」年份的所有已看记录吗？此操作不可撤销。</template>
                  <template v-else>确定要清空所有已看记录并删除所有年份吗？此操作不可撤销。</template>
                </template>
                <template v-else-if="confirmAction==='batchDelete'">确定要删除选中的 <span class="font-semibold text-danger">{{ confirmTarget }}</span> 项记录吗？此操作不可撤销。</template>
                <template v-else-if="confirmAction==='deleteYear'">确定要删除年份「<span class="font-semibold text-gray-700">{{ confirmTarget }}</span>」吗？该年份下的番剧记录不会被删除。</template>
                <template v-else>确定要删除「<span class="font-semibold text-gray-700">{{ confirmTarget }}</span>」吗？此操作不可撤销。</template>
              </p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button @click="showConfirmDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">取消</button>
              <button @click="confirmActionFn" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-danger to-red-400 rounded-xl hover:shadow-lg hover:shadow-danger/30 transition-all btn-press">{{ confirmAction==='clear'?'确认清空':confirmAction==='deleteYear'?'确认删除':'确认删除' }}</button>
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
          <div class="relative glass rounded-2xl shadow-2xl w-[26.25rem] border border-white/40 pointer-events-auto">
            <div class="px-6 py-5 text-center">
              <div class="text-4xl mb-3">💣</div>
              <h3 class="text-lg font-bold text-gray-800 mb-2">选择清空范围</h3>
              <p class="text-sm text-gray-500 mb-4">请选择要清空的范围：</p>
              <div class="flex flex-col gap-3">
                <button @click="doClearYear" class="px-5 py-3 text-sm font-medium text-white bg-gradient-to-r from-warning to-amber-400 rounded-xl hover:shadow-lg hover:shadow-warning/30 transition-all btn-press">
                  清空当前年份 ({{ selectedYear }})
                </button>
                <button @click="doClearAll" class="px-5 py-3 text-sm font-medium text-white bg-gradient-to-r from-danger to-red-400 rounded-xl hover:shadow-lg hover:shadow-danger/30 transition-all btn-press">
                  清空所有记录并删除所有年份
                </button>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center">
              <button @click="showClearDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">取消</button>
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
          <div class="relative glass rounded-2xl shadow-2xl w-[28.75rem] border border-white/40 pointer-events-auto" @keydown.ctrl.enter="saveForm">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <span class="text-xl">{{ dialogMode==='add'?'✨':'✏️' }}</span>
              <h3 class="text-lg font-bold gradient-text">{{ dialogMode==='add'?'添加历史记录':'编辑历史记录' }}</h3>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">作品名称</label>
                <input ref="dialogNameInput" v-model="form.name" type="text" placeholder="请输入作品名称"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>观看日期</span>
                  <button type="button" @click="dateManualInput=!dateManualInput" class="text-xs text-primary hover:text-primary-dark transition">{{ dateManualInput?'使用日期选择器':'手动输入' }}</button>
                </label>
                <input v-if="dateManualInput" v-model="form.watch_date" type="text" placeholder="如: 2025 或 2025/07 或 2025/07/15"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80"
                  :class="{'border-danger/50 ring-danger/20': formDateValidationError}" />
                <input v-else :value="formatToDateInput(form.watch_date)" @input="form.watch_date = dateInputToFormat($event.target.value)" @click="$event.target.showPicker()" type="date"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <p v-if="formDateValidationError" class="text-xs text-danger mt-1">{{ formDateValidationError }}</p>
                <p v-else-if="dateManualInput" class="text-xs text-gray-400 mt-1">支持: 年份(2025)、年月(2025/07)、完整日期(2025/07/15)、年份范围(2014~2017)</p>
              </div>
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>时间（可选）</span>
                  <button type="button" @click="formShowTimePicker=!formShowTimePicker" class="text-xs text-primary hover:text-primary-dark transition">{{ formShowTimePicker?'手动输入':'时钟选择' }}</button>
                </label>
                <div v-if="!formShowTimePicker" class="relative">
                  <div class="time-picker-trigger w-full h-10 flex items-center justify-center border border-primary/20 rounded-xl bg-white/80 cursor-pointer hover:border-primary/40 transition" @click="formShowTimeDropdown=!formShowTimeDropdown">
                    <span class="text-sm font-mono" :class="formTime?'text-gray-800':'text-gray-400'">{{ formTime || '点击选择时间' }}</span>
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
                  <button @click="formTime=''" class="px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">清除</button>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">链接 URL</label>
                <input v-model="form.url" type="text" placeholder="如: https://..."
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
              <div v-if="form.url">
                <label class="block text-sm font-medium text-gray-700 mb-1">URL 动态参数</label>
                <input v-model="form.url_params" type="text" placeholder="如: keyword={集数} 或 keyword={集数}&page=1"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <p class="text-xs text-gray-400 mt-1">用 {集数} 代表当前集数，点击链接时自动替换。如: keyword={集数} → keyword=914</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea v-model="form.notes" rows="2" placeholder="可选备注"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition resize-none bg-white/80"></textarea>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">取消</button>
              <button @click="saveForm" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all btn-press">保存</button>
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
          <div class="relative glass rounded-2xl shadow-2xl w-[25rem] border border-white/40 pointer-events-auto" @keydown.ctrl.enter="saveYearForm">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <span class="text-xl">📅</span>
              <h3 class="text-lg font-bold gradient-text">{{ yearDialogMode==='add'?'添加年份':'编辑年份' }}</h3>
            </div>
            <div class="px-6 py-5">
              <label class="block text-sm font-medium text-gray-700 mb-1">年份标签</label>
              <input v-model="yearForm.year_label" type="text" placeholder="如: 2025 或 2014~2017"
                class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              <p class="text-xs text-gray-400 mt-1">支持单个年份(2025)或年份范围(2014~2017)</p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showYearDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">取消</button>
              <button @click="saveYearForm" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-secondary to-secondary-light rounded-xl hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press">保存</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { watchedApi, watchedYearsApi, batchApi } from '../db/api'
import { validateDate, dateInputToFormat, formatToDateInput, extractYear, extractAllYears, compareDateKey } from '../composables/useDatePicker'
import { showToast } from '../composables/useToast'

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
const isAllChecked = computed(() => paginatedList.value.length > 0 && checkedIds.value.length === paginatedList.value.length)

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
    if (batchMode.value) { batchMode.value = false; checkedIds.value = [] }
  }
}

const toggleCheck = (id) => {
  const idx = checkedIds.value.indexOf(id)
  if (idx >= 0) checkedIds.value.splice(idx, 1)
  else checkedIds.value.push(id)
}

const toggleSelectAll = () => {
  checkedIds.value = isAllChecked.value ? [] : paginatedList.value.map(i => i.id)
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
  confirmTarget.value = '所有记录'
  showConfirmDialog.value = true
}

const editing = ref(null)
const editValue = ref('')
const dateManualInput = ref(false)

const form = ref({ name:'', watch_date:'', url:'', url_params:'', notes:'' })

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
  window.open(url, '_blank')
}
const yearForm = ref({ year_label:'' })

const contextMenu = ref({ show:false, x:0, y:0, item:null })
const openContextMenu = (e, item) => {
  selected.value = item
  contextMenu.value = { show:true, x:e.clientX, y:e.clientY, item }
}
const closeContextMenu = () => { contextMenu.value.show = false }
const ctxEdit = () => { closeContextMenu(); openEditDialog() }
const ctxOpenUrl = () => {
  const item = contextMenu.value.item
  closeContextMenu()
  if (item?.url) window.open(buildUrl(item), '_blank')
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
      if (res.data.success) { showToast(`已批量删除 ${checkedIds.value.length} 项 🗑️`); checkedIds.value=[]; batchMode.value=false; await fetchData() }
      else showToast(res.data.error||'批量删除失败','error')
    } catch { showToast('批量删除失败','error') }
  } else if (confirmAction.value === 'clear') {
    try {
      if (clearScope.value === 'year') {
        // 清空当前年份
        const yearItems = watchedList.value.map(i => i.id)
        if (yearItems.length === 0) { showToast('当前年份没有记录','warning'); return }
        const res = await batchApi.batchDeleteWatched(yearItems)
        if (res.data.success) { showToast(`${selectedYear.value} 已清空 💣`); selected.value=null; batchMode.value=false; checkedIds.value=[]; await fetchData() }
        else showToast(res.data.error||'清空失败','error')
      } else {
        // 清空所有
        const res = await batchApi.clearWatched()
        if (res.data.success) {
          await batchApi.clearWatchedYears()
          showToast('所有已看记录已清空 💣'); selected.value=null; batchMode.value=false; checkedIds.value=[]; await fetchYears(); await fetchData()
        }
        else showToast(res.data.error||'清空失败','error')
      }
    } catch { showToast('清空失败','error') }
  } else if (confirmAction.value === 'deleteYear') {
    const y = years.value.find(y => y.year_label === confirmTarget.value)
    if (!y) return
    try {
      const res = await watchedYearsApi.delete(y.id)
      if (res.data.success) { showToast('年份已删除 🗑️'); await fetchYears(); if (years.value.length > 0) { selectedYear.value = years.value[0].year_label } else { selectedYear.value = '' } await fetchData() }
      else showToast(res.data.error||'删除失败','error')
    } catch { showToast('删除失败','error') }
  } else if (confirmAction.value === 'delete') {
    if (!selected.value) return
    try {
      const res = await watchedApi.delete(selected.value.id)
      if (res.data.success) { showToast('已删除 🗑️'); selected.value=null; await fetchData() }
      else showToast(res.data.error||'删除失败','error')
    } catch { showToast('删除失败','error') }
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
  if (!selectedYear.value) return
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
        const yearLabels = new Set(years.value.map(y => y.year_label))
        watchedList.value = res.data.data.filter(item => {
          const itemYears = extractAllYears(item.watch_date)
          if (itemYears.length === 0) return true
          return !itemYears.some(y => yearLabels.has(y))
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
  } catch { showToast('获取数据失败','error') }
}

const selectItem = (item) => { selected.value = item }

// 点击空白处取消编辑
const handleRootClick = (e) => {
  if (editing.value && !e.target.closest('input, select, textarea')) {
    cancelEdit()
  }
}

// ========== 内联编辑 ==========
const startEdit = (item, field) => {
  editing.value = { id: item.id, field }
  editValue.value = String(item[field] ?? '')
}

const cancelEdit = () => { editing.value = null }

const saveEdit = async () => {
  if (!editing.value) return
  const { id, field } = editing.value
  const item = watchedList.value.find(i => i.id === id)
  const originalValue = String(item?.[field] ?? '')
  if (editValue.value === originalValue) { editing.value = null; return }
  try {
    const res = await watchedApi.update(id, { [field]: editValue.value })
    if (res.data.success) {
      if (item) item[field] = editValue.value
    } else { showToast(res.data.error||'更新失败','error') }
  } catch { showToast('更新失败','error') }
  editing.value = null
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
  if (!yearForm.value.year_label.trim()) { showToast('请输入年份标签','warning'); return }
  try {
    if (yearDialogMode.value === 'add') {
      const res = await watchedYearsApi.add(yearForm.value)
      if (res.data.success) {
        showToast('年份已添加 ✨')
        showYearDialog.value = false
        await fetchYears()
        selectedYear.value = yearForm.value.year_label
        await fetchData()
      } else { showToast(res.data.error||'添加失败','error') }
    } else {
      const res = await watchedYearsApi.update(editingYearId.value, yearForm.value)
      if (res.data.success) {
        showToast('年份已更新 ✏️')
        showYearDialog.value = false
        await fetchYears()
        selectedYear.value = yearForm.value.year_label
        await fetchData()
      } else { showToast(res.data.error||'更新失败','error') }
    }
  } catch { showToast('操作失败','error') }
}

// ========== 记录操作 ==========
const dialogNameInput = ref(null)
const focusNameInput = () => { nextTick(() => dialogNameInput.value?.focus()) }

// 仅当选中的是真实年份标签时才预填观看日期（排除「全部年份」「未分类」两个哨兵值）
const isRealYear = (y) => !!y && y !== '__all__' && y !== '__unclassified__'

const openAddDialog = () => {
  dialogMode.value = 'add'
  form.value = { name:'', watch_date: isRealYear(selectedYear.value) ? selectedYear.value : '', url:'', url_params:'', notes:'' }
  formTime.value = ''
  formDateValidationError.value = ''
  formShowTimePicker.value = false
  formShowTimeDropdown.value = false
  showDialog.value = true
  focusNameInput()
}

const openEditDialog = () => {
  if (!selected.value) return
  dialogMode.value = 'edit'
  const watchDate = selected.value.watch_date || ''
  const parts = watchDate.split(' ')
  const datePart = parts[0] || ''
  const timePart = parts.length > 1 ? parts.slice(1).join(' ') : ''
  form.value = {
    name: selected.value.name,
    watch_date: datePart,
    url: selected.value.url || '',
    url_params: selected.value.url_params || '',
    notes: selected.value.notes || ''
  }
  formTime.value = timePart
  formDateValidationError.value = ''
  formShowTimePicker.value = false
  formShowTimeDropdown.value = false
  showDialog.value = true
  focusNameInput()
}

const saveForm = async () => {
  if (!form.value.name.trim()) { showToast('请输入作品名称','warning'); return }
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
    const dateStr = form.value.watch_date
    if (/^\d{4}$/.test(dateStr) || /^\d{4}\/\d{2}$/.test(dateStr) || /~/.test(dateStr)) {
    } else {
      form.value.watch_date = dateStr + ' ' + formTime.value
    }
  }
  try {
    if (dialogMode.value === 'add') {
      const res = await watchedApi.add(form.value)
      if (res.data.success) { showToast('历史记录已添加 ✨'); showDialog.value=false; await fetchData() }
      else showToast(res.data.error||'添加失败','error')
    } else {
      const res = await watchedApi.update(selected.value.id, form.value)
      if (res.data.success) { showToast('历史记录已更新 ✏️'); showDialog.value=false; selected.value=null; await fetchData() }
      else showToast(res.data.error||'更新失败','error')
    }
  } catch { showToast('操作失败','error') }
}

const deleteItem = async () => {
  if (!selected.value) return
  confirmTarget.value = selected.value.name
  confirmAction.value = 'delete'
  showConfirmDialog.value = true
}

onMounted(async () => {
  await fetchYears()
  await fetchData()
  document.addEventListener('keydown', handleKeydown)
})
</script>