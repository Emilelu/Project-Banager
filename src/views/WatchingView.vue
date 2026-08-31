<template>
  <div class="space-y-5 flex flex-col min-h-full">
    <!-- 等番本月提示 -->
    <div v-if="currentMonthRemaining.length > 0" class="glass rounded-2xl shadow-lg border border-secondary/30 px-6 py-3 shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-lg">📢</span>
          <span class="font-medium text-secondary-dark">本月有 <span class="font-bold">{{ currentMonthRemaining.length }}</span> 部等番即将更新</span>
        </div>
        <router-link to="/remaining" class="px-3 py-1.5 bg-gradient-to-r from-secondary to-secondary-light text-white rounded-xl text-xs font-medium hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press">查看等番 →</router-link>
      </div>
    </div>

    <!-- 操作面板 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-5 py-4 shrink-0">
      <div class="flex items-center gap-2 flex-wrap">
        <button @click="openAddDialog" class="px-4 py-2 bg-gradient-to-r from-success to-emerald-400 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-success/30 transition-all duration-300 btn-press">✨ 添加番剧</button>
        <button :disabled="!selected" @click="openEditDialog" class="px-4 py-2 bg-gradient-to-r from-primary to-primary-light text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">✏️ 编辑</button>
        <button :disabled="!selected" @click="doIncrement" class="px-4 py-2 bg-gradient-to-r from-warning to-amber-400 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-warning/30 transition-all duration-300 btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">➕ +1集</button>
        <button :disabled="!selected" @click="doDecrement" class="px-4 py-2 bg-gradient-to-r from-warning to-amber-400 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-warning/30 transition-all duration-300 btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">➖ -1集</button>
        <button :disabled="!selected" @click="moveToRemaining" class="px-4 py-2 bg-gradient-to-r from-accent to-accent-light text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-accent/30 transition-all duration-300 btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">⏳ 移至等番</button>
        <button :disabled="!selected" @click="openDateDialog" class="px-4 py-2 bg-gradient-to-r from-secondary to-secondary-light text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-secondary/30 transition-all duration-300 btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">✅ 移至已看</button>
        <button :disabled="!selected" @click="deleteItem" class="px-4 py-2 bg-gradient-to-r from-gray-400 to-gray-500 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all duration-300 btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">🗑️ 删除</button>
        <div class="border-l border-white/30 h-6 mx-1"></div>
        <button @click="toggleBatchMode" class="px-4 py-2 text-white rounded-xl text-sm font-medium transition-all duration-300 btn-press" :class="batchMode?'bg-gradient-to-r from-primary to-primary-light shadow-lg shadow-primary/30':'bg-gradient-to-r from-gray-400 to-gray-500'">☑️ 批量选择</button>
        <button v-if="batchMode" :disabled="checkedIds.length===0" @click="batchDelete" class="px-4 py-2 bg-gradient-to-r from-danger to-red-400 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-danger/30 transition-all duration-300 btn-press disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none">🗑️ 批量删除 ({{ checkedIds.length }})</button>
        <button v-if="batchMode" @click="toggleSelectAll" class="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all duration-300 btn-press">{{ isAllChecked?'取消全选':'全选' }}</button>
        <button @click="openClearDialog" class="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all duration-300 btn-press">💣 清空列表</button>
        <div class="border-l border-white/30 h-6 mx-1"></div>
        <button @click="toggleTimeSort" class="px-4 py-2 bg-gradient-to-r from-primary/80 to-secondary/80 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all duration-300 btn-press" title="按更新时间排序">
          🕐 {{ timeSortAsc ? '时间 早→晚' : '时间 晚→早' }}
        </button>
      </div>
      <div v-if="batchMode && checkedIds.length > 0" class="mt-2 text-sm text-danger flex items-center gap-2">
        <span class="inline-block w-2 h-2 rounded-full bg-danger animate-pulse-soft"></span>
        已选择 <span class="font-bold">{{ checkedIds.length }}</span> 项
      </div>
      <div v-if="selected && !batchMode" class="mt-3 text-sm text-gray-500 flex items-center gap-2">
        <span class="inline-block w-2 h-2 rounded-full bg-primary animate-pulse-soft"></span>
        当前选中: <span class="font-bold gradient-text">{{ selected.name }}</span>
        <span class="text-primary font-bold">e{{ selected.current_episode }}</span>
        <span v-if="selected.day_of_week">{{ selected.day_of_week }}</span>
        <span v-if="selected.time_slot">{{ selected.time_slot }}</span>
      </div>
    </div>

    <!-- 周历视图 -->
    <div class="glass rounded-2xl shadow-lg overflow-hidden border border-white/30 flex-1 flex flex-col">
      <div class="grid grid-cols-7 grid-rows-[auto_1fr] flex-1">
        <div v-for="(day, idx) in weekDays" :key="day"
          class="px-3 py-3 text-center text-base font-bold border-b border-r border-white/20 transition-all duration-300"
          :class="[idx===5?'bg-secondary/20 text-secondary-dark':idx===6?'bg-danger/15 text-danger':'bg-primary/10 text-primary-dark']">
          <span class="inline-block transition-transform duration-300 hover:scale-110">{{ dayIcons[idx] }}</span>
          <span class="ml-1">{{ day }}</span>
        </div>
        <div v-for="(day, colIdx) in weekDays" :key="'col-'+day"
          class="border-r border-white/10 last:border-r-0 min-h-[18.75rem] flex flex-col bg-white/30">
          <WatchingCard v-for="item in getItemsByDay(day)" :key="item.id" class="flex-1"
            :item="item"
            :selected="selected?.id===item.id"
            :batch-mode="batchMode"
            :checked="checkedIds.includes(item.id)"
            :editing="editing"
            v-model:editValue="editValue"
            @select="batchMode ? toggleCheck(item.id) : selectItem(item)"
            @toggle-check="toggleCheck(item.id)"
            @context-menu="!batchMode && openContextMenu($event, item)"
            @middle-click="handleCardMiddleClick($event, item)"
            @start-edit="startEdit(item, $event)"
            @save-edit="saveEdit"
            @cancel-edit="cancelEdit"
            @increment="incrementEpisode(item)"
            @decrement="decrementEpisode(item)" />
          <div v-if="getItemsByDay(day).length===0" class="flex-1 flex items-center justify-center text-gray-300 text-sm">
            <span class="animate-pulse-soft">✨ 暂无</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态引导 -->
    <div v-if="watchingList.length === 0" class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-8 text-center shrink-0">
      <div class="text-4xl mb-2 animate-float">📺</div>
      <p class="text-sm text-gray-500 mb-4">还没有追番记录，从添加第一部番剧或导入 Excel 开始吧</p>
      <div class="flex items-center justify-center gap-3">
        <button @click="openAddDialog" class="px-4 py-2 bg-gradient-to-r from-success to-emerald-400 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-success/30 transition-all btn-press">✨ 添加番剧</button>
        <router-link to="/import" class="px-4 py-2 bg-gradient-to-r from-secondary to-secondary-light text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press">📥 从 Excel 导入</router-link>
      </div>
    </div>

    <!-- 未排期：未分配更新星期的番剧 -->
    <div v-if="unscheduledItems.length > 0" class="glass rounded-2xl shadow-lg border border-white/30 px-4 py-3 shrink-0">
      <div class="flex items-center gap-2 mb-2 flex-wrap">
        <span class="px-2.5 py-1 bg-warning/10 text-warning-dark rounded-lg text-sm font-bold">📋 未排期 {{ unscheduledItems.length }} 部</span>
        <span class="text-xs text-gray-400">未分配更新星期，点击选中后「✏️ 编辑」选择星期即可入列</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <WatchingCard v-for="item in unscheduledItems" :key="item.id" class="w-64"
          :item="item"
          :selected="selected?.id===item.id"
          :batch-mode="batchMode"
          :checked="checkedIds.includes(item.id)"
          :editing="editing"
          v-model:editValue="editValue"
          @select="batchMode ? toggleCheck(item.id) : selectItem(item)"
          @toggle-check="toggleCheck(item.id)"
          @context-menu="!batchMode && openContextMenu($event, item)"
          @middle-click="handleCardMiddleClick($event, item)"
          @start-edit="startEdit(item, $event)"
          @save-edit="saveEdit"
          @cancel-edit="cancelEdit"
          @increment="incrementEpisode(item)"
          @decrement="decrementEpisode(item)" />
      </div>
    </div>

    <!-- 添加/编辑对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showDialog=false"></div>
      </transition>
      <transition name="modal">
        <div v-if="showDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[32.5rem] border border-white/40 pointer-events-auto app-dialog" @keydown.ctrl.enter="saveForm">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <span class="text-xl">{{ dialogMode==='add'?'✨':'✏️' }}</span>
              <h3 class="text-lg font-bold gradient-text">{{ dialogMode==='add'?'添加番剧':'编辑番剧' }}</h3>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">番剧名称</label>
                <input ref="dialogNameInput" v-model="form.name" type="text" placeholder="请输入番剧名称"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">更新星期</label>
                  <select v-model="form.day_of_week"
                    class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80">
                    <option value="">请选择</option>
                    <option v-for="day in weekDays" :key="day" :value="day">{{ day }}</option>
                  </select>
                </div>
                <div>
                  <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                    <span>更新时间</span>
                    <button type="button" @click="formShowTimePicker=!formShowTimePicker" class="text-xs text-primary hover:text-primary-dark transition">{{ formShowTimePicker?'时钟选择':'手动输入' }}</button>
                  </label>
                  <div v-if="!formShowTimePicker" class="relative">
                    <div class="time-picker-trigger w-full h-10 flex items-center justify-center border border-primary/20 rounded-xl bg-white/80 cursor-pointer hover:border-primary/40 transition" @click="formShowTimeDropdown=!formShowTimeDropdown">
                      <span class="text-sm font-mono" :class="formTime?'text-gray-800':'text-gray-400'">{{ formTime || '点击选择时间' }}</span>
                      <svg class="w-4 h-4 ml-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </div>
                    <div v-if="formShowTimeDropdown" class="time-picker-dropdown absolute z-50 mt-1 left-0 w-[20rem] glass rounded-xl shadow-2xl border border-white/30 p-3 max-h-52 overflow-y-auto">
                      <div class="grid grid-cols-8 gap-1.5">
                        <button v-for="h in 24" :key="'fh'+h" @click="formSelectTimeHour(h-1)"
                          class="px-1.5 py-1.5 text-xs rounded-lg transition btn-press whitespace-nowrap"
                          :class="parseInt(formTime?.split(':')[0])===h-1?'bg-primary text-white font-bold':'hover:bg-primary/10 text-gray-700'">
                          {{ String(h-1).padStart(2,'0') }}:00
                        </button>
                      </div>
                      <div class="border-t border-white/20 my-2"></div>
                      <div class="grid grid-cols-8 gap-1.5">
                        <button v-for="m in 12" :key="'fm'+m" @click="formSelectTimeMinute((m-1)*5)"
                          class="px-1.5 py-1.5 text-xs rounded-lg transition btn-press whitespace-nowrap"
                          :class="parseInt(formTime?.split(':')[1])===(m-1)*5?'bg-secondary text-white font-bold':'hover:bg-secondary/10 text-gray-700'">
                          :{{ String((m-1)*5).padStart(2,'0') }}
                        </button>
                      </div>
                    </div>
                    <div v-if="formShowTimeDropdown" class="fixed inset-0 z-40" @click="formShowTimeDropdown=false"></div>
                  </div>
                  <div v-else class="flex items-center gap-2">
                    <input v-model="formTime" type="text" placeholder="HH:mm"
                      class="flex-1 min-w-0 px-4 py-2.5 border border-primary/20 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                    <button @click="formTime=''" class="shrink-0 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">清除</button>
                  </div>
                </div>
              </div>
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>当前集数</span>
                  <span class="text-xs text-gray-400">支持 01、02 补零格式</span>
                </label>
                <div class="flex items-center gap-2">
                  <button type="button" @click="formEpisodeDecrement"
                    class="w-10 h-10 flex items-center justify-center border border-primary/20 rounded-xl bg-white/80 hover:bg-primary/10 transition btn-press text-primary font-bold text-lg">−</button>
                  <input v-model="form.current_episode" type="text" inputmode="decimal" placeholder="如: 0、9、01、26.19"
                    class="flex-1 px-4 py-2.5 border border-primary/20 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                  <button type="button" @click="formEpisodeIncrement"
                    class="w-10 h-10 flex items-center justify-center border border-primary/20 rounded-xl bg-white/80 hover:bg-primary/10 transition btn-press text-primary font-bold text-lg">+</button>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">链接 URL</label>
                <input v-model="form.url" @input="onUrlInput" type="text" placeholder="如: https://...（粘贴含 ? 的链接会自动分离参数）"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <div class="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs text-gray-400">快速填充:</span>
                  <button type="button" @click="selectTemplate('video')"
                    class="px-2 py-1 rounded-lg text-xs font-medium border transition btn-press"
                    :class="activeTemplate==='video' ? 'bg-primary text-white border-primary' : 'border-primary/30 text-primary hover:bg-primary/10'">▶ B站视频</button>
                  <button type="button" @click="selectTemplate('space')"
                    class="px-2 py-1 rounded-lg text-xs font-medium border transition btn-press"
                    :class="activeTemplate==='space' ? 'bg-primary text-white border-primary' : 'border-primary/30 text-primary hover:bg-primary/10'">🏠 空间搜索</button>
                  <button type="button" @click="selectTemplate('search')"
                    class="px-2 py-1 rounded-lg text-xs font-medium border transition btn-press"
                    :class="activeTemplate==='search' ? 'bg-primary text-white border-primary' : 'border-primary/30 text-primary hover:bg-primary/10'">🔍 全站搜索</button>
                </div>
                <div v-if="activeTemplate" class="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-2">
                  <template v-if="activeTemplate==='video'">
                    <input v-model="tplVideo.bv" type="text" placeholder="BV 号或视频链接，如 BV1GAuw6HEdd"
                      class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                    <p class="text-xs text-gray-400">填充后 URL 动态参数为 p={集数}，点击链接直达对应分P</p>
                  </template>
                  <template v-else-if="activeTemplate==='space'">
                    <input v-model="tplSpace.uid" type="text" placeholder="UP 主 UID，如 693539400"
                      class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                    <div class="grid grid-cols-2 gap-2">
                      <input v-model="tplSpace.name" type="text" placeholder="番剧名称，如 闇芝居"
                        class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                      <input v-model="tplSpace.season" type="number" min="1" placeholder="季数，如 17"
                        class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                    </div>
                    <p class="text-xs text-gray-400">生成空间内搜索链接：keyword=名称 | 季数季 | 第{集数}集</p>
                  </template>
                  <template v-else>
                    <input v-model="tplSearch.keyword" type="text" placeholder="如: 『尼古喵喵』{集数}【中文字幕】"
                      class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                    <p class="text-xs text-gray-400">关键词中可包含 {集数}，点击链接时自动替换为当前集数</p>
                  </template>
                  <div class="flex justify-end gap-2">
                    <button type="button" @click="activeTemplate=''" class="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition btn-press">取消</button>
                    <button type="button" @click="applyTemplate" class="px-3 py-1.5 text-xs text-white bg-gradient-to-r from-primary to-primary-light rounded-lg hover:shadow-lg hover:shadow-primary/30 transition-all btn-press">填充</button>
                  </div>
                </div>
              </div>
              <div v-if="form.url">
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>URL 动态参数</span>
                  <button type="button" @click="insertEpisodeToken" class="text-xs text-primary hover:text-primary-dark transition btn-press">＋ 插入 {集数}</button>
                </label>
                <input ref="urlParamsInput" v-model="form.url_params" type="text" placeholder='如: keyword={集数} 或 keyword={集数}&page=1'
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <p class="text-xs text-gray-400 mt-1">用 {集数} 代表当前集数，点击链接时自动替换。如: keyword={集数} → keyword=914；集数为 01、02 等补零格式时按原样替换</p>
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

    <!-- 日期选择对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showDateDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showDateDialog=false"></div>
      </transition>
      <transition name="modal">
        <div v-if="showDateDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div class="relative glass rounded-2xl shadow-2xl w-[26.25rem] border border-white/40 pointer-events-auto app-dialog" @keydown.ctrl.enter="moveToWatched">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <span class="text-xl">✅</span>
              <h3 class="text-lg font-bold gradient-text">选择观看日期</h3>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>观看日期</span>
                  <button type="button" @click="dateManualInput=!dateManualInput" class="text-xs text-primary hover:text-primary-dark transition">{{ dateManualInput?'使用日期选择器':'手动输入' }}</button>
                </label>
                <input v-if="dateManualInput" v-model="moveDate" type="text" placeholder="如: 2025 或 2025/07 或 2025/07/15"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80"
                  :class="{'border-danger/50 ring-danger/20': dateValidationError}" />
                <input v-else :value="formatToDateInput(moveDate)" @input="moveDate = dateInputToFormat($event.target.value)" @click="$event.target.showPicker()" type="date"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <p v-if="dateValidationError" class="text-xs text-danger mt-1">{{ dateValidationError }}</p>
                <p v-else-if="dateManualInput" class="text-xs text-gray-400 mt-1">支持: 年份(2025)、年月(2025/07)、完整日期(2025/07/15)、年份范围(2014~2017)</p>
              </div>
              <!-- 时间选择 -->
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>时间（可选）</span>
                  <button type="button" @click="showTimePicker=!showTimePicker" class="text-xs text-primary hover:text-primary-dark transition">{{ showTimePicker?'手动输入':'时钟选择' }}</button>
                </label>
                <!-- 时钟选择器 -->
                <div v-if="!showTimePicker" class="relative">
                  <div class="time-picker-trigger w-full h-10 flex items-center justify-center border border-primary/20 rounded-xl bg-white/80 cursor-pointer hover:border-primary/40 transition" @click="showTimeDropdown=!showTimeDropdown">
                    <span class="text-sm font-mono" :class="moveTime?'text-gray-800':'text-gray-400'">{{ moveTime || '点击选择时间' }}</span>
                    <svg class="w-4 h-4 ml-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </div>
                  <div v-if="showTimeDropdown" class="time-picker-dropdown absolute z-50 mt-1 w-full glass rounded-xl shadow-2xl border border-white/30 p-3 max-h-52 overflow-y-auto">
                    <div class="grid grid-cols-6 gap-1">
                      <button v-for="h in 24" :key="'h'+h" @click="selectTimeHour(h-1)"
                        class="px-2 py-1.5 text-xs rounded-lg transition btn-press"
                        :class="parseInt(moveTime?.split(':')[0])===h-1?'bg-primary text-white font-bold':'hover:bg-primary/10 text-gray-700'">
                        {{ String(h-1).padStart(2,'0') }}:00
                      </button>
                    </div>
                    <div class="border-t border-white/20 my-2"></div>
                    <div class="grid grid-cols-6 gap-1">
                      <button v-for="m in 12" :key="'m'+m" @click="selectTimeMinute((m-1)*5)"
                        class="px-2 py-1.5 text-xs rounded-lg transition btn-press"
                        :class="parseInt(moveTime?.split(':')[1])===(m-1)*5?'bg-secondary text-white font-bold':'hover:bg-secondary/10 text-gray-700'">
                        :{{ String((m-1)*5).padStart(2,'0') }}
                      </button>
                    </div>
                  </div>
                  <div v-if="showTimeDropdown" class="fixed inset-0 z-40" @click="showTimeDropdown=false"></div>
                </div>
                <!-- 手动输入 -->
                <div v-else class="flex items-center gap-2">
                  <input v-model="moveTime" type="text" placeholder="HH:mm"
                    class="flex-1 px-4 py-2.5 border border-primary/20 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                  <button @click="moveTime=''" class="px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">清除</button>
                </div>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showDateDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">取消</button>
              <button @click="moveToWatched" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-secondary to-secondary-light rounded-xl hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press">确定</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="contextMenu.show" class="fixed z-[200]" :style="{left:contextMenu.x+'px',top:contextMenu.y+'px'}">
        <div class="glass rounded-xl shadow-2xl border border-white/30 py-1 min-w-[10rem] animate-scale-in context-menu">
          <button @click="ctxEdit" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2">✏️ 编辑</button>
          <button @click="ctxOpenUrl" :disabled="!contextMenu.item?.url" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2 disabled:cursor-not-allowed disabled:hover:bg-transparent" :class="{'opacity-40':!contextMenu.item?.url}">🔗 打开链接</button>
          <button @click="ctxMoveToRemaining" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2">📋 移至等番</button>
          <button @click="ctxMoveToWatched" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2">✅ 移至已看</button>
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
          <div class="relative glass rounded-2xl shadow-2xl w-[23.75rem] border border-white/40 pointer-events-auto app-dialog" @keydown.ctrl.enter="confirmActionFn">
            <div class="px-6 py-5 text-center">
              <div class="text-4xl mb-3">{{ confirmAction==='clear'?'💣':confirmAction==='batchDelete'?'🗑️':confirmAction==='delete'?'🗑️':'📋' }}</div>
              <h3 class="text-lg font-bold text-gray-800 mb-2">{{ confirmAction==='clear'?'确认清空':confirmAction==='batchDelete'?'批量删除':confirmAction==='delete'?'确认删除':'移至等番' }}</h3>
              <p class="text-sm text-gray-500">
                <template v-if="confirmAction==='clear'">确定要清空所有追番记录吗？此操作不可撤销。</template>
                <template v-else-if="confirmAction==='batchDelete'">确定要删除选中的 <span class="font-semibold text-danger">{{ confirmTarget }}</span> 项记录吗？此操作不可撤销。</template>
                <template v-else>{{ confirmAction==='delete'?'确定要删除':'确定将' }}「<span class="font-semibold text-gray-700">{{ confirmTarget }}</span>」{{ confirmAction==='delete'?'吗？此操作不可撤销。':'移至等番列表吗？' }}</template>
              </p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button @click="showConfirmDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">取消</button>
              <button @click="confirmActionFn" class="px-5 py-2.5 text-sm font-medium text-white rounded-xl hover:shadow-lg transition-all btn-press" :class="confirmAction==='clear'||confirmAction==='batchDelete'||confirmAction==='delete'?'bg-gradient-to-r from-danger to-red-400 hover:shadow-danger/30':'bg-gradient-to-r from-secondary to-secondary-light hover:shadow-secondary/30'">{{ confirmAction==='clear'?'确认清空':confirmAction==='batchDelete'?'确认删除':confirmAction==='delete'?'确认删除':'确认移动' }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { watchingApi, remainingApi, batchApi } from '../db/api'
import { validateDate, dateInputToFormat, formatToDateInput } from '../composables/useDatePicker'
import { smartIncrement, smartDecrement, normalizeEpisodeInput, buildItemUrl } from '../composables/useEpisode'
import { showToast } from '../composables/useToast'
import { placeContextMenu } from '../composables/useContextMenu'
import WatchingCard from '../components/WatchingCard.vue'

const weekDays = ['周一','周二','周三','周四','周五','周六','周日']
const dayIcons = ['🌙','🔥','🌊','⚡','🌸','🎉','☀️']

const SELECTED_KEY = 'watching_selected_id'

const watchingList = ref([])
const remainingList = ref([])
const selected = ref(null)

// 记住选中状态 - 保存 id 到 localStorage
const saveSelectedId = (id) => {
  if (id) localStorage.setItem(SELECTED_KEY, String(id))
  else localStorage.removeItem(SELECTED_KEY)
}

// 恢复选中状态
const restoreSelected = () => {
  const savedId = localStorage.getItem(SELECTED_KEY)
  if (savedId) {
    const item = watchingList.value.find(i => String(i.id) === savedId)
    if (item) selected.value = item
    else localStorage.removeItem(SELECTED_KEY)
  }
}

// 自动同步 selected 到 localStorage
watch(selected, (val) => {
  saveSelectedId(val?.id)
})
const showDialog = ref(false)
const showDateDialog = ref(false)
const dialogMode = ref('add')
const moveDate = ref(String(new Date().getFullYear()))
const moveTime = ref('')
const showTimePicker = ref(false)
const showTimeDropdown = ref(false)
const dateValidationError = ref('')

// 表单时间选择器
const formTime = ref('')
const formShowTimePicker = ref(false)
const formShowTimeDropdown = ref(false)

const formSelectTimeHour = (h) => {
  const currentMin = formTime.value ? formTime.value.split(':')[1] || '00' : '00'
  formTime.value = `${String(h).padStart(2,'0')}:${currentMin}`
}
const formSelectTimeMinute = (m) => {
  const currentHour = formTime.value ? formTime.value.split(':')[0] || '00' : '00'
  formTime.value = `${currentHour}:${String(m).padStart(2,'0')}`
  formShowTimeDropdown.value = false
}

// 等番本月提示
const currentMonthRemaining = computed(() => {
  const now = new Date()
  const currentYM = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}`
  return remainingList.value.filter(item => {
    if (!item.expected_date) return false
    return item.expected_date.startsWith(currentYM) || item.expected_date <= currentYM
  })
})

// 未排期：未分配更新星期的番剧（周历按星期分列，空星期的记录不显示在任何列）
const unscheduledItems = computed(() => watchingList.value.filter(item => !item.day_of_week))

// 点击番剧卡片和交互元素以外的区域时取消选中（document 级监听，覆盖页面留白）
const onDocClick = (e) => {
  if (editing.value && !e.target.closest('input, select, textarea')) {
    saveEdit()
  }
  if (e.target.closest('.watching-card, button, input, select, textarea, a, .app-dialog, .context-menu')) return
  selected.value = null
}

const selectTimeHour = (h) => {
  const currentMin = moveTime.value ? moveTime.value.split(':')[1] || '00' : '00'
  moveTime.value = `${String(h).padStart(2,'0')}:${currentMin}`
}
const selectTimeMinute = (m) => {
  const currentHour = moveTime.value ? moveTime.value.split(':')[0] || '00' : '00'
  moveTime.value = `${currentHour}:${String(m).padStart(2,'0')}`
  showTimeDropdown.value = false
}

// ========== 批量操作 ==========
const batchMode = ref(false)
const checkedIds = ref([])
const isAllChecked = computed(() => watchingList.value.length > 0 && checkedIds.value.length === watchingList.value.length)

const toggleBatchMode = () => {
  batchMode.value = !batchMode.value
  checkedIds.value = []
  if (batchMode.value) selected.value = null
}

const handleKeydown = (e) => {
  if (e.key === 'Escape') {
    if (showDialog.value) { showDialog.value = false; return }
    if (showDateDialog.value) { showDateDialog.value = false; return }
    if (showConfirmDialog.value) { showConfirmDialog.value = false; return }
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
  if (isAllChecked.value) {
    checkedIds.value = []
  } else {
    checkedIds.value = watchingList.value.map(i => i.id)
  }
}

const batchDelete = () => {
  if (checkedIds.value.length === 0) return
  confirmTarget.value = String(checkedIds.value.length)
  confirmAction.value = 'batchDelete'
  showConfirmDialog.value = true
}

const openClearDialog = () => {
  confirmTarget.value = '所有追番记录'
  confirmAction.value = 'clear'
  showConfirmDialog.value = true
}

const editing = ref(null)
const editValue = ref('')
const dateManualInput = ref(false)

const form = ref({ name:'', day_of_week:'', time_slot:'', current_episode:'0', url:'', url_params:'', notes:'' })

// ========== URL 输入辅助 ==========
// 粘贴含 ? 的完整链接时，自动把查询参数移到「URL 动态参数」，URL 只保留基础地址
// 只在用户主动输入时触发（@input），打开编辑弹窗回填存量数据不会误改写
const onUrlInput = () => {
  const val = form.value.url
  if (!val) return
  const qIdx = val.indexOf('?')
  if (qIdx === -1) return
  const base = val.slice(0, qIdx)
  const query = val.slice(qIdx + 1)
  form.value.url = base
  if (query) {
    const cur = (form.value.url_params || '').replace(/&+$/, '')
    form.value.url_params = cur ? `${cur}&${query}` : query
  }
}

// {集数} 快速插入：优先插入到动态参数输入框光标处，否则追加到末尾
const urlParamsInput = ref(null)
const insertEpisodeToken = () => {
  const token = '{集数}'
  const el = urlParamsInput.value
  const cur = form.value.url_params || ''
  if (el && typeof el.selectionStart === 'number') {
    const start = el.selectionStart
    const end = el.selectionEnd
    form.value.url_params = cur.slice(0, start) + token + cur.slice(end)
    nextTick(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + token.length
    })
  } else {
    form.value.url_params = cur + token
  }
}

// ========== 链接快速填充模板 ==========
const activeTemplate = ref('')
const tplVideo = ref({ bv: '' })
const tplSpace = ref({ uid: localStorage.getItem('banager_tpl_space_uid') || '', name: '', season: '1' })
const tplSearch = ref({ keyword: '' })

const selectTemplate = (t) => {
  activeTemplate.value = activeTemplate.value === t ? '' : t
}

const applyTemplate = () => {
  if (activeTemplate.value === 'video') {
    const raw = String(tplVideo.value.bv || '').trim()
    // 支持直接粘贴完整视频链接，自动提取 BV 号
    const m = raw.match(/BV[0-9A-Za-z]{8,12}/)
    const bv = m ? m[0] : raw
    if (!bv) return
    form.value.url = `https://www.bilibili.com/video/${bv}`
    form.value.url_params = 'p={集数}'
  } else if (activeTemplate.value === 'space') {
    const raw = String(tplSpace.value.uid || '').trim()
    // 支持直接粘贴空间链接，自动提取 UID
    const m = raw.match(/\d{3,}/)
    const uid = m ? m[0] : raw
    if (!uid) return
    localStorage.setItem('banager_tpl_space_uid', uid)
    const season = parseInt(tplSpace.value.season, 10) || 1
    form.value.url = `https://space.bilibili.com/${uid}/search`
    form.value.url_params = `keyword=${String(tplSpace.value.name || '').trim()} | ${season}季 | 第{集数}集`
  } else if (activeTemplate.value === 'search') {
    const kw = String(tplSearch.value.keyword || '').trim()
    if (!kw) return
    form.value.url = 'https://search.bilibili.com/all'
    form.value.url_params = `keyword=${kw}`
  }
  activeTemplate.value = ''
}

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
  if (item?.url) window.open(buildItemUrl(item), '_blank')
}
const ctxMoveToRemaining = () => { closeContextMenu(); openMoveToRemainingDialog() }
const ctxMoveToWatched = () => { closeContextMenu(); openDateDialog() }
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
const openMoveToRemainingDialog = () => {
  if (!selected.value) return
  confirmTarget.value = selected.value.name
  confirmAction.value = 'moveToRemaining'
  showConfirmDialog.value = true
}
const confirmActionFn = async () => {
  showConfirmDialog.value = false
  if (confirmAction.value === 'batchDelete') {
    try {
      const res = await batchApi.batchDeleteWatching(checkedIds.value)
      if (res.data.success) { showToast(`已批量删除 ${checkedIds.value.length} 项 🗑️`); checkedIds.value=[]; batchMode.value=false; await fetchData() }
      else showToast(res.data.error||'批量删除失败','error')
    } catch { showToast('批量删除失败','error') }
  } else if (confirmAction.value === 'clear') {
    try {
      const res = await batchApi.clearWatching()
      if (res.data.success) { showToast('追番列表已清空 💣'); selected.value=null; batchMode.value=false; checkedIds.value=[]; await fetchData() }
      else showToast(res.data.error||'清空失败','error')
    } catch { showToast('清空失败','error') }
  } else if (confirmAction.value === 'delete') {
    if (!selected.value) return
    try {
      const res = await watchingApi.delete(selected.value.id)
      if (res.data.success) { showToast('追番已删除 🗑️'); selected.value=null; await fetchData() }
      else showToast(res.data.error||'删除失败','error')
    } catch { showToast('删除失败','error') }
  } else if (confirmAction.value === 'moveToRemaining') {
    if (!selected.value) return
    try {
      const res = await watchingApi.moveToRemaining(selected.value.id)
      if (res.data.success) { showToast('已移至等番列表 ⏳'); selected.value=null; await fetchData() }
      else showToast(res.data.error||'操作失败','error')
    } catch { showToast('操作失败','error') }
  }
}

// ========== 时间排序 ==========
// 每日列内按更新时间排序，默认从早到晚，可切换方向；偏好持久化到 localStorage
const timeSortAsc = ref(localStorage.getItem('watching_time_sort') !== 'desc')
const toggleTimeSort = () => {
  timeSortAsc.value = !timeSortAsc.value
  localStorage.setItem('watching_time_sort', timeSortAsc.value ? 'asc' : 'desc')
}
// 解析 time_slot 中的 HH:mm 为分钟数，无法解析的排在最后
const parseTimeSlot = (slot) => {
  if (!slot) return Infinity
  const m = String(slot).match(/(\d{1,2}):(\d{2})/)
  if (!m) return Infinity
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h > 23 || min > 59) return Infinity
  return h * 60 + min
}
const getItemsByDay = (day) => watchingList.value
  .filter(item => item.day_of_week === day)
  .sort((a, b) => {
    const ta = parseTimeSlot(a.time_slot)
    const tb = parseTimeSlot(b.time_slot)
    return timeSortAsc.value ? ta - tb : tb - ta
  })

const fetchData = async () => {
  try {
    const res = await watchingApi.getAll()
    if (res.data.success) {
      watchingList.value = res.data.data
      // 恢复选中状态
      if (selected.value) {
        const item = watchingList.value.find(i => i.id === selected.value.id)
        if (!item) selected.value = null
      } else {
        restoreSelected()
      }
    }
    // 同时获取等番数据
    const remRes = await remainingApi.getAll()
    if (remRes.data.success) remainingList.value = remRes.data.data
  } catch { showToast('获取数据失败','error') }
}

const selectItem = (item) => { selected.value = item }

// 鼠标中键打开链接
const handleCardMiddleClick = (e, item) => {
  if (e.button === 1) {
    e.preventDefault()
    const url = item.url ? buildItemUrl(item) : defaultBgmUrl(item)
    window.open(url, '_blank')
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
  let val = editValue.value
  if (field === 'current_episode') {
    val = normalizeEpisodeInput(val)
  }
  const item = watchingList.value.find(i => i.id === id)
  // current_episode 用字符串比较
  if (field === 'current_episode') {
    if (String(val) === String(item?.[field] ?? '0')) { editing.value = null; return }
  } else {
    if (String(val) === String(item?.[field] ?? '')) { editing.value = null; return }
  }
  try {
    const res = await watchingApi.update(id, { [field]: val })
    if (res.data.success) {
      if (item) item[field] = val
    } else {
      showToast(res.data.error || '更新失败','error')
    }
  } catch { showToast('更新失败','error') }
  editing.value = null
}

// ========== 对话框操作 ==========
const dialogNameInput = ref(null)
const focusNameInput = () => { nextTick(() => dialogNameInput.value?.focus()) }

const openAddDialog = () => {
  dialogMode.value = 'add'
  form.value = { name:'', day_of_week:'', time_slot:'', current_episode:'0', url:'', url_params:'', notes:'' }
  formTime.value = ''
  formShowTimePicker.value = false
  formShowTimeDropdown.value = false
  activeTemplate.value = ''
  showDialog.value = true
  focusNameInput()
}

const openEditDialog = () => {
  if (!selected.value) return
  dialogMode.value = 'edit'
  form.value = {
    name: selected.value.name,
    day_of_week: selected.value.day_of_week || '',
    time_slot: '',
    current_episode: String(selected.value.current_episode || '0'),
    url: selected.value.url || '',
    url_params: selected.value.url_params || '',
    notes: selected.value.notes || ''
  }
  formTime.value = selected.value.time_slot || ''
  formShowTimePicker.value = false
  formShowTimeDropdown.value = false
  activeTemplate.value = ''
  showDialog.value = true
  focusNameInput()
}

// 对话框中集数智能增减（共享逻辑：小数不进位，补零格式保持位数）
const formEpisodeIncrement = () => {
  form.value.current_episode = smartIncrement(form.value.current_episode)
}

const formEpisodeDecrement = () => {
  form.value.current_episode = smartDecrement(form.value.current_episode)
}

const saveForm = async () => {
  if (!form.value.name.trim()) { showToast('请输入番剧名称','warning'); return }
  // 规范化集数：保留补零（01）与小数（26.19），非法输入归 0
  form.value.current_episode = normalizeEpisodeInput(form.value.current_episode)
  // 合并时间选择到 time_slot
  form.value.time_slot = formTime.value || ''
  try {
    if (dialogMode.value === 'add') {
      const res = await watchingApi.add(form.value)
      if (res.data.success) { showToast('番剧已添加 ✨'); showDialog.value = false; await fetchData() }
      else showToast(res.data.error || '添加失败','error')
    } else {
      const res = await watchingApi.update(selected.value.id, form.value)
      if (res.data.success) { showToast('番剧已更新 ✏️'); showDialog.value = false; selected.value = null; await fetchData() }
      else showToast(res.data.error || '更新失败','error')
    }
  } catch { showToast('操作失败','error') }
}

const incrementEpisode = async (item) => {
  try {
    const res = await watchingApi.increment(item.id)
    if (res.data.success) { await fetchData(); const u = watchingList.value.find(i=>i.id===item.id); if(u) selected.value=u }
  } catch { showToast('操作失败','error') }
}

const decrementEpisode = async (item) => {
  try {
    const res = await watchingApi.decrement(item.id)
    if (res.data.success) { await fetchData(); const u = watchingList.value.find(i=>i.id===item.id); if(u) selected.value=u }
  } catch { showToast('操作失败','error') }
}

const doIncrement = () => { if(selected.value) incrementEpisode(selected.value) }
const doDecrement = () => { if(selected.value) decrementEpisode(selected.value) }

const moveToRemaining = () => { openMoveToRemainingDialog() }

const openDateDialog = () => {
  if (!selected.value) return
  moveDate.value = String(new Date().getFullYear())
  moveTime.value = ''
  dateValidationError.value = ''
  showTimePicker.value = false
  showTimeDropdown.value = false
  showDateDialog.value = true
}

const moveToWatched = async () => {
  if (!selected.value) return
  // 校验日期
  const validation = validateDate(moveDate.value)
  if (!validation.valid) {
    dateValidationError.value = validation.error
    return
  }
  dateValidationError.value = ''
  // 合并日期和时间
  let finalDate = validation.normalized
  if (moveTime.value) {
    // 如果日期只有年或年月，不追加时间
    if (/^\d{4}$/.test(finalDate) || /^\d{4}\/\d{2}$/.test(finalDate) || /~/.test(finalDate)) {
      // 纯年份/年月/范围不追加时间
    } else {
      finalDate += ' ' + moveTime.value
    }
  }
  try {
    const res = await watchingApi.moveToWatched(selected.value.id, finalDate)
    if (res.data.success) { showToast(`已移至 ${finalDate} 已看列表 ✅`); showDateDialog.value=false; selected.value=null; await fetchData() }
    else showToast(res.data.error||'操作失败','error')
  } catch { showToast('操作失败','error') }
}

const deleteItem = () => { openConfirmDialog() }

onMounted(async () => {
  await fetchData()
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', onDocClick)
})
</script>