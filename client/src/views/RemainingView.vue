<template>
  <div class="space-y-5" @click="handleRootClick">
    <!-- 顶部信息栏 + 操作面板 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-3">
          <span class="px-3 py-1.5 bg-gradient-to-r from-primary/10 to-secondary/10 text-primary font-bold rounded-xl text-sm">
            等番: {{ remainingList.length }}部
          </span>
          <!-- 本月新番链接 -->
          <template v-if="currentSeasonLink.show">
            <a :href="currentSeasonLink.url" target="_blank" rel="noopener"
              class="px-3 py-1.5 bg-gradient-to-r from-secondary to-secondary-light text-white rounded-xl text-xs font-medium hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press inline-flex items-center gap-1">
              📺 {{ currentSeasonLink.label }}
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </a>
          </template>
          <template v-else>
            <span class="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-xl text-xs font-medium">📺 {{ currentSeasonLink.label }}</span>
            <div class="inline-block">
              <button ref="seasonMenuBtn" @click="toggleSeasonMenu" class="px-2 py-1.5 bg-gray-100 text-gray-500 rounded-xl text-xs font-medium hover:bg-gray-200 transition btn-press">📅 查看新番 ▾</button>
            </div>
          </template>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button @click="openAddDialog"
            class="px-3 py-1.5 bg-gradient-to-r from-success to-emerald-400 text-white rounded-xl text-xs font-medium hover:shadow-lg hover:shadow-success/30 transition-all btn-press">✨ 添加等番</button>
          <button @click="openBatchAddDialog"
            class="px-3 py-1.5 bg-gradient-to-r from-success to-emerald-400 text-white rounded-xl text-xs font-medium hover:shadow-lg hover:shadow-success/30 transition-all btn-press">📝 批量添加</button>
          <button :disabled="!selected" @click="openEditDialog"
            class="px-3 py-1.5 bg-gradient-to-r from-primary to-primary-light text-white rounded-xl text-xs font-medium hover:shadow-lg hover:shadow-primary/30 transition-all btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">✏️ 编辑</button>
          <button :disabled="!selected" @click="openMoveDialog"
            class="px-3 py-1.5 bg-gradient-to-r from-secondary to-secondary-light text-white rounded-xl text-xs font-medium hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">📺 移至追番</button>
          <button :disabled="!selected" @click="deleteItem"
            class="px-3 py-1.5 bg-gradient-to-r from-gray-400 to-gray-500 text-white rounded-xl text-xs font-medium hover:shadow-lg transition-all btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">🗑️ 删除</button>
          <div class="border-l border-white/30 h-6 mx-1"></div>
          <button @click="toggleBatchMode"
            class="px-3 py-1.5 text-white rounded-xl text-xs font-medium transition-all btn-press"
            :class="batchMode ? 'bg-gradient-to-r from-primary to-primary-light shadow-lg shadow-primary/30' : 'bg-gradient-to-r from-gray-400 to-gray-500'">☑️ 批量选择</button>
          <button v-if="batchMode" :disabled="checkedIds.length === 0" @click="batchDelete"
            class="px-3 py-1.5 bg-gradient-to-r from-danger to-red-400 text-white rounded-xl text-xs font-medium hover:shadow-lg hover:shadow-danger/30 transition-all btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">🗑️ 批量删除 ({{ checkedIds.length }})</button>
          <button v-if="batchMode" @click="toggleSelectAll"
            class="px-3 py-1.5 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl text-xs font-medium hover:shadow-lg transition-all btn-press">{{ isAllChecked ? '取消全选' : '全选' }}</button>
          <button @click="openClearDialog"
            class="px-3 py-1.5 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl text-xs font-medium hover:shadow-lg transition-all btn-press">💣 清空列表</button>
        </div>
      </div>
      <div v-if="batchMode && checkedIds.length > 0" class="mt-2 text-sm text-danger flex items-center gap-2">
        <span class="inline-block w-2 h-2 rounded-full bg-danger animate-pulse-soft"></span>
        已选择 <span class="font-bold">{{ checkedIds.length }}</span> 项
      </div>
      <div v-if="selected && !batchMode" class="mt-2 text-sm text-gray-500 flex items-center gap-2">
        <span class="inline-block w-2 h-2 rounded-full bg-primary animate-pulse-soft"></span>
        当前选中: <span class="font-bold gradient-text">{{ selected.name }}</span>
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
            <th class="text-left px-4 py-2.5 text-primary-dark font-bold cursor-pointer select-none hover:bg-primary/5 transition" @click="toggleSort('name')">
              🌸 番剧名称 {{ sortField==='name'?(sortOrder==='asc'?'↑':'↓'):'' }}
            </th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold cursor-pointer select-none hover:bg-primary/5 transition whitespace-nowrap" @click="toggleSort('expected_date')">
              📅 预计日期 {{ sortField==='expected_date'?(sortOrder==='asc'?'↑':'↓'):'' }}
            </th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold whitespace-nowrap">🔗 链接</th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold whitespace-nowrap">📝 备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="paginatedList.length === 0">
            <td :colspan="batchMode ? 5 : 4" class="py-16 text-center text-gray-400">
              <div class="text-4xl mb-3 animate-float">📭</div>
              <div>暂无等番记录</div>
            </td>
          </tr>
          <tr v-for="(item, idx) in paginatedList" :key="item.id"
            class="cursor-pointer transition-all duration-200 border-b border-white/10 list-item group"
            :class="[batchMode && checkedIds.includes(item.id) ? 'bg-danger/10' : selected?.id === item.id ? 'bg-primary/10' : idx % 2 === 0 ? 'bg-white/20' : 'bg-white/40']"
            @click="batchMode ? toggleCheck(item.id) : selectItem(item)"
            @contextmenu.prevent="!batchMode && openContextMenu($event, item)"
            @mousedown.middle.prevent="openItemLink(item)">
            <td v-if="batchMode" class="text-center px-2 py-2.5" @click.stop="toggleCheck(item.id)">
              <div class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all mx-auto"
                :class="checkedIds.includes(item.id) ? 'bg-danger border-danger' : 'border-gray-300 bg-white/80 hover:border-primary'">
                <svg v-if="checkedIds.includes(item.id)" class="w-3 h-3 text-white" fill="none" stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </td>
            <td class="px-4 py-2.5" @dblclick.stop="!batchMode && startEdit(item,'name')">
              <input v-if="editing?.id===item.id&&editing?.field==='name'" v-model="editValue"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full" autofocus />
              <span v-else class="text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors truncate block">{{ item.name }}</span>
            </td>
            <td class="px-3 py-2.5" @dblclick.stop="startEdit(item,'expected_date')">
              <input v-if="editing?.id===item.id&&editing?.field==='expected_date'" v-model="editValue"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full"
                placeholder="如: 2025/07" autofocus />
              <span v-else class="text-sm text-gray-600 truncate block">{{ item.expected_date || '-' }}</span>
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
    <div v-if="sortedRemainingList.length > 0" class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-3">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-2 text-sm text-gray-600">
          <span>共 {{ sortedRemainingList.length }} 条</span>
          <div class="relative inline-block">
            <button @click="showPageSizeMenu=!showPageSizeMenu" class="px-2 py-1 border border-primary/20 rounded-lg text-xs hover:bg-primary/5 transition bg-white/80">
              每页 {{ pageSize }} 条 ▾
            </button>
            <div v-if="showPageSizeMenu" class="absolute left-0 bottom-full mb-1 glass rounded-xl shadow-2xl border border-white/30 py-1 min-w-[120px] z-50">
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
      <div v-if="contextMenu.show" class="fixed z-[200]"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
        <div class="glass rounded-xl shadow-2xl border border-white/30 py-1 min-w-[160px] animate-scale-in">
          <button @click="ctxEdit"
            class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2">✏️
            编辑</button>
          <button @click="ctxOpenUrl"
            class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2"
            :class="{ 'opacity-40': !contextMenu.item?.url }">🔗 打开链接</button>
          <button @click="ctxMoveToWatching"
            class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2">📺
            移至追番</button>
          <div class="border-t border-white/20 my-1"></div>
          <button @click="ctxDelete"
            class="w-full text-left px-4 py-2 text-sm hover:bg-danger/10 text-danger transition flex items-center gap-2">🗑️
            删除</button>
        </div>
      </div>
      <div v-if="contextMenu.show" class="fixed inset-0 z-[199]" @click="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"></div>
    </Teleport>

    <!-- 删除确认对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showConfirmDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showConfirmDialog=false"></div>
      </transition>
      <transition name="modal">
        <div v-if="showConfirmDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[380px] border border-white/40 pointer-events-auto" @keydown.ctrl.enter="confirmActionFn">
            <div class="px-6 py-5 text-center">
              <div class="text-4xl mb-3">{{ confirmAction === 'clear' ? '💣' : confirmAction === 'batchDelete' ? '🗑️' :
                '🗑️' }}
              </div>
              <h3 class="text-lg font-bold text-gray-800 mb-2">{{
                confirmAction === 'clear' ? '确认清空' : confirmAction === 'batchDelete' ? '批量删除' : '确认删除' }}</h3>
              <p class="text-sm text-gray-500">
                <template v-if="confirmAction === 'clear'">确定要清空所有等番记录吗？此操作不可撤销。</template>
                <template v-else-if="confirmAction === 'batchDelete'">确定要删除选中的 <span
                    class="font-semibold text-danger">{{
                      confirmTarget }}</span> 项记录吗？此操作不可撤销。</template>
                <template v-else>确定要删除「<span class="font-semibold text-gray-700">{{ confirmTarget
                }}</span>」吗？此操作不可撤销。</template>
              </p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button @click="showConfirmDialog = false"
                class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">取消</button>
              <button @click="confirmActionFn"
                class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-danger to-red-400 rounded-xl hover:shadow-lg hover:shadow-danger/30 transition-all btn-press">{{
                  confirmAction === 'clear' ? '确认清空' : '确认删除' }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 添加/编辑对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showDialog = false">
        </div>
      </transition>
      <transition name="modal">
        <div v-if="showDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[460px] border border-white/40 pointer-events-auto" @keydown.ctrl.enter="saveForm">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <span class="text-xl">{{ dialogMode === 'add' ? '✨' : '✏️' }}</span>
              <h3 class="text-lg font-bold gradient-text">{{ dialogMode === 'add' ? '添加等番' : '编辑等番' }}</h3>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">番剧名称</label>
                <input v-model="form.name" type="text" placeholder="请输入番剧名称"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>预计日期</span>
                  <button type="button" @click="dateManualInput = !dateManualInput"
                    class="text-xs text-primary hover:text-primary-dark transition">{{ dateManualInput ? '使用日期选择器' :
                      '手动输入'
                    }}</button>
                </label>
                <input v-if="dateManualInput" v-model="form.expected_date" type="text"
                  placeholder="如: 2025/07 或 2025/07/15"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <input v-else :value="formatToDateInput(form.expected_date)"
                  @input="form.expected_date = dateInputToFormat($event.target.value)" @click="$event.target.showPicker()" type="date"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <p v-if="dateManualInput" class="text-xs text-gray-400 mt-1">支持: 年月(2025/07)、完整日期(2025/07/15)</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">链接 URL</label>
                <input v-model="form.url" type="text" placeholder="如: https://..."
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
              <div v-if="form.url">
                <label class="block text-sm font-medium text-gray-700 mb-1">URL 动态参数</label>
                <input v-model="form.url_params" type="text" placeholder='如: keyword={集数} 或 keyword={集数}&page=1'
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
              <button @click="showDialog = false"
                class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">取消</button>
              <button @click="saveForm"
                class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all btn-press">保存</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 移至追番对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showMoveDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]"
          @click="showMoveDialog = false">
        </div>
      </transition>
      <transition name="modal">
        <div v-if="showMoveDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[400px] border border-white/40 pointer-events-auto">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <span class="text-xl">📺</span>
              <h3 class="text-lg font-bold gradient-text">移至追番</h3>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">更新星期</label>
                <select v-model="moveForm.day_of_week"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80">
                  <option value="">请选择</option>
                  <option v-for="day in weekDays" :key="day" :value="day">{{ day }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">更新时间</label>
                <input v-model="moveForm.time_slot" type="text" placeholder="如: 23:00"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showMoveDialog = false"
                class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">取消</button>
              <button @click="moveToWatching"
                class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-secondary to-secondary-light rounded-xl hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press">确定</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 季度新番下拉菜单 -->
    <Teleport to="body">
      <div v-if="showSeasonMenu" class="fixed z-[200]" :style="{left: seasonMenuPos.x + 'px', top: seasonMenuPos.y + 'px'}">
        <div class="glass rounded-xl shadow-2xl border border-white/30 py-1 min-w-[180px] animate-scale-in">
          <a v-for="s in seasonLinks" :key="s.label" :href="s.url" target="_blank" rel="noopener"
            class="block px-4 py-2 text-sm hover:bg-primary/10 transition">{{ s.label }}</a>
        </div>
      </div>
      <div v-if="showSeasonMenu" class="fixed inset-0 z-[199]" @click="showSeasonMenu=false"></div>
    </Teleport>

    <!-- 批量添加对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showBatchAddDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showBatchAddDialog=false"></div>
      </transition>
      <transition name="modal">
        <div v-if="showBatchAddDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[460px] border border-white/40 pointer-events-auto" @keydown.ctrl.enter="saveBatchAdd">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <span class="text-xl">📝</span>
              <h3 class="text-lg font-bold gradient-text">批量添加等番</h3>
            </div>
            <div class="px-6 py-5">
              <label class="block text-sm font-medium text-gray-700 mb-1">番剧名称（一行一部）</label>
              <textarea v-model="batchAddText" rows="8" placeholder="番剧1&#10;番剧2&#10;番剧3"
                class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition resize-none bg-white/80"></textarea>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showBatchAddDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">取消</button>
              <button @click="saveBatchAdd" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-success to-emerald-400 rounded-xl hover:shadow-lg hover:shadow-success/30 transition-all btn-press">添加</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- Toast -->
    <Teleport to="body">
      <transition name="toast">
        <div v-if="toast.show" class="fixed top-6 right-6 z-[100]">
          <div class="px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white animate-slide-down"
            :class="toast.type === 'success' ? 'bg-gradient-to-r from-success to-emerald-400' : toast.type === 'error' ? 'bg-gradient-to-r from-danger to-red-400' : 'bg-gradient-to-r from-warning to-amber-400'">
            {{ toast.message }}
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { remainingApi, batchApi } from '../api'
import { dateInputToFormat, formatToDateInput } from '../composables/useDatePicker'

const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const remainingList = ref([])
const selected = ref(null)

// 排序
const sortField = ref('')
const sortOrder = ref('asc')
const toggleSort = (field) => {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortOrder.value = 'asc'
  }
}
const sortedRemainingList = computed(() => {
  let list = remainingList.value
  if (sortField.value) {
    list = [...list].sort((a, b) => {
      const va = String(a[sortField.value] || '')
      const vb = String(b[sortField.value] || '')
      let cmp = va.localeCompare(vb, 'zh-CN')
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

const totalPages = computed(() => Math.max(1, Math.ceil(sortedRemainingList.value.length / pageSize.value)))
const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return sortedRemainingList.value.slice(start, start + pageSize.value)
})

watch([sortedRemainingList, pageSize], () => { currentPage.value = 1 })

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

const showDialog = ref(false)
const showMoveDialog = ref(false)
const dialogMode = ref('add')

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
    if (showMoveDialog.value) { showMoveDialog.value = false; return }
    if (showConfirmDialog.value) { showConfirmDialog.value = false; return }
    if (showBatchAddDialog.value) { showBatchAddDialog.value = false; return }
    if (showSeasonMenu.value) { showSeasonMenu.value = false; return }
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
  confirmTarget.value = '所有等番记录'
  confirmAction.value = 'clear'
  showConfirmDialog.value = true
}

const editing = ref(null)
const editValue = ref('')
const dateManualInput = ref(false)

// 本月新番链接
const currentSeasonLink = computed(() => {
  const now = new Date()
  const month = now.getMonth() + 1
  if ([1, 4, 7, 10].includes(month)) {
    const t = String(now.getFullYear()) + String(month).padStart(2, '0')
    return { show: true, url: `https://xf.hmacg.cn/xfb.php?t=${t}`, label: '本月新番列表' }
  }
  return { show: false, url: '', label: '本月没有新番' }
})

// 季度新番链接（用户可选择查看1/4/7/10月的新番）
const showSeasonMenu = ref(false)
const seasonMenuBtn = ref(null)
const seasonMenuPos = ref({ x: 0, y: 0 })
const seasonLinks = computed(() => {
  const year = new Date().getFullYear()
  return [
    { label: `${year}年 冬季新番 (1月)`, url: `https://xf.hmacg.cn/xfb.php?t=${year}01` },
    { label: `${year}年 春季新番 (4月)`, url: `https://xf.hmacg.cn/xfb.php?t=${year}04` },
    { label: `${year}年 夏季新番 (7月)`, url: `https://xf.hmacg.cn/xfb.php?t=${year}07` },
    { label: `${year}年 秋季新番 (10月)`, url: `https://xf.hmacg.cn/xfb.php?t=${year}10` },
  ]
})

const toggleSeasonMenu = () => {
  if (showSeasonMenu.value) {
    showSeasonMenu.value = false
    return
  }
  if (seasonMenuBtn.value) {
    const rect = seasonMenuBtn.value.getBoundingClientRect()
    seasonMenuPos.value = { x: rect.left, y: rect.bottom + 4 }
  }
  showSeasonMenu.value = true
}

// 点击空白处取消编辑
const handleRootClick = (e) => {
  if (editing.value && !e.target.closest('input, select, textarea')) {
    saveEdit()
  }
}

// 批量添加
const showBatchAddDialog = ref(false)
const batchAddText = ref('')

const openBatchAddDialog = () => {
  batchAddText.value = ''
  showBatchAddDialog.value = true
}

const saveBatchAdd = async () => {
  const names = batchAddText.value.split('\n').map(n => n.trim()).filter(n => n)
  if (names.length === 0) { showToast('请输入番剧名称', 'warning'); return }
  let added = 0
  for (const name of names) {
    const res = await remainingApi.add({ name, expected_date: '', url: '', url_params: '', notes: '' })
    if (res.data.success) added++
  }
  showToast(`已批量添加 ${added} 部等番 ✨`)
  showBatchAddDialog.value = false
  await fetchData()
}

const form = ref({ name: '', expected_date: '', url: '', url_params: '', notes: '' })

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
const moveForm = ref({ day_of_week: '', time_slot: '' })

const contextMenu = ref({ show: false, x: 0, y: 0, item: null })
const openContextMenu = (e, item) => {
  selected.value = item
  contextMenu.value = { show: true, x: e.clientX, y: e.clientY, item }
}
const closeContextMenu = () => { contextMenu.value.show = false }
const ctxEdit = () => { closeContextMenu(); openEditDialog() }
const ctxOpenUrl = () => {
  const item = contextMenu.value.item
  closeContextMenu()
  if (item?.url) window.open(buildUrl(item), '_blank')
}
const ctxMoveToWatching = () => { closeContextMenu(); openMoveDialog() }
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
const confirmActionFn = async () => {
  showConfirmDialog.value = false
  if (confirmAction.value === 'batchDelete') {
    try {
      const res = await batchApi.batchDeleteRemaining(checkedIds.value)
      if (res.data.success) { showToast(`已批量删除 ${checkedIds.value.length} 项 🗑️`); checkedIds.value = []; batchMode.value = false; await fetchData() }
      else showToast(res.data.error || '批量删除失败', 'error')
    } catch { showToast('批量删除失败', 'error') }
  } else if (confirmAction.value === 'clear') {
    try {
      const res = await batchApi.clearRemaining()
      if (res.data.success) { showToast('等番列表已清空 💣'); selected.value = null; batchMode.value = false; checkedIds.value = []; await fetchData() }
      else showToast(res.data.error || '清空失败', 'error')
    } catch { showToast('清空失败', 'error') }
  } else if (confirmAction.value === 'delete') {
    if (!selected.value) return
    try {
      const res = await remainingApi.delete(selected.value.id)
      if (res.data.success) { showToast('等番已删除 🗑️'); selected.value = null; await fetchData() }
      else showToast(res.data.error || '删除失败', 'error')
    } catch { showToast('删除失败', 'error') }
  }
}

const toast = ref({ show: false, message: '', type: 'success' })
const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 2500)
}

const fetchData = async () => {
  try {
    const res = await remainingApi.getAll()
    if (res.data.success) remainingList.value = res.data.data
  } catch { showToast('获取数据失败', 'error') }
}

const selectItem = (item) => { selected.value = item }

// ========== 内联编辑 ==========
const startEdit = (item, field) => {
  editing.value = { id: item.id, field }
  editValue.value = String(item[field] ?? '')
}

const cancelEdit = () => { editing.value = null }

const saveEdit = async () => {
  if (!editing.value) return
  const { id, field } = editing.value
  const item = remainingList.value.find(i => i.id === id)
  const originalValue = String(item?.[field] ?? '')
  if (editValue.value === originalValue) { editing.value = null; return }
  try {
    const res = await remainingApi.update(id, { [field]: editValue.value })
    if (res.data.success) {
      if (item) item[field] = editValue.value
    } else { showToast(res.data.error || '更新失败', 'error') }
  } catch { showToast('更新失败', 'error') }
  editing.value = null
}

// ========== 对话框操作 ==========
const openAddDialog = () => {
  dialogMode.value = 'add'
  form.value = { name: '', expected_date: '', url: '', url_params: '', notes: '' }
  showDialog.value = true
}

const openEditDialog = () => {
  if (!selected.value) return
  dialogMode.value = 'edit'
  form.value = {
    name: selected.value.name,
    expected_date: selected.value.expected_date || '',
    url: selected.value.url || '',
    url_params: selected.value.url_params || '',
    notes: selected.value.notes || ''
  }
  showDialog.value = true
}

const saveForm = async () => {
  if (!form.value.name.trim()) { showToast('请输入番剧名称', 'warning'); return }
  try {
    if (dialogMode.value === 'add') {
      const res = await remainingApi.add(form.value)
      if (res.data.success) { showToast('等番已添加 ✨'); showDialog.value = false; await fetchData() }
      else showToast(res.data.error || '添加失败', 'error')
    } else {
      const res = await remainingApi.update(selected.value.id, form.value)
      if (res.data.success) { showToast('等番已更新 ✏️'); showDialog.value = false; selected.value = null; await fetchData() }
      else showToast(res.data.error || '更新失败', 'error')
    }
  } catch { showToast('操作失败', 'error') }
}

const openMoveDialog = () => {
  if (!selected.value) return
  moveForm.value = { day_of_week: '', time_slot: '' }
  showMoveDialog.value = true
}

const moveToWatching = async () => {
  if (!selected.value) return
  try {
    const res = await remainingApi.moveToWatching(selected.value.id, moveForm.value)
    if (res.data.success) { showToast('已移至追番列表 📺'); showMoveDialog.value = false; selected.value = null; await fetchData() }
    else showToast(res.data.error || '操作失败', 'error')
  } catch { showToast('操作失败', 'error') }
}

const deleteItem = () => { openConfirmDialog() }

onMounted(() => {
  fetchData()
  document.addEventListener('keydown', handleKeydown)
})
</script>