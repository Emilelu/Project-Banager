<template>
  <div ref="pageRootRef" class="space-y-5 flex flex-col min-h-full" tabindex="-1">
    <!-- 等番本月提示 -->
    <div v-if="currentMonthRemaining.length > 0" class="glass rounded-2xl shadow-lg border border-secondary/30 px-6 py-3 shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm">
          <AppIcon scale="md" class="text-secondary-dark" name="info" />
          <span class="font-medium text-secondary-dark">{{ tt('watching.monthReminder', { count: currentMonthRemaining.length }) }}</span>
        </div>
        <router-link to="/remaining" class="px-3 py-1.5 bg-gradient-to-r from-secondary to-secondary-dark text-white rounded-xl text-xs font-medium hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press">{{ tt('watching.viewRemaining') }}</router-link>
      </div>
    </div>

    <!-- 操作面板 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-5 py-4 shrink-0">
        <!-- 按钮配色统一由主题色驱动（.btn-primary/.btn-toned/.btn-neutral/.btn-danger），
             不再为每个按钮写死不同渐变；图标全为 currentColor，天然跟随按钮配色。 -->
        <!-- 整个工具栏是一个 transition-group：
             若只把「选中项按钮」放进组内，取消选中时该组宽度骤减，
             **组外的分隔线与其后按钮会瞬间跳位**（没有过渡）。
             全部元素共处一组后，任一元素出入场时其余元素都会平滑归位（.sel-anim-move）。 -->
        <!-- 注意：tag 容器不能是 display:contents —— 那样元素不参与布局，
             Vue 的 -move 位移计算失去参照，归位动画不会播放。用正常 flex 盒子。 -->
        <transition-group name="sel-anim" tag="div" class="flex items-center gap-2 flex-wrap">
        <button key="add" @click="openAddDialog" class="btn-base btn-primary">
          <AppIcon scale="sm" name="plus" />{{ tt('watching.addShow') }}
        </button>

        <button v-for="btn in selectedActions" :key="btn.key" v-if="!!selected" @click="btn.onClick"
          class="btn-base" :class="btn.cls">
          <AppIcon scale="sm" :name="btn.icon" />{{ btn.label }}
        </button>

        <div key="sep-1" class="border-l border-white/30 h-6 mx-1"></div>
        <button key="batch" @click="toggleBatchMode" class="btn-base" :class="batchMode ? 'btn-primary' : 'btn-neutral'">
          <AppIcon scale="sm" name="checkbox" />{{ tt('watching.batchSelect') }}
        </button>
        <button v-if="batchMode" key="batch-del" :disabled="checkedIds.length===0" @click="batchDelete"
          class="btn-base btn-danger disabled:opacity-40 disabled:cursor-not-allowed">
          <AppIcon scale="sm" name="trash" />{{ tt('watching.batchDeleteCount', { count: checkedIds.length }) }}
        </button>
        <button v-if="batchMode" key="sel-all" @click="toggleSelectAll" class="btn-base btn-neutral">
          <AppIcon scale="sm" name="checkbox" />{{ isAllChecked ? tt('watching.unselectAll') : tt('watching.selectAll') }}
        </button>
        <button key="clear" @click="openClearDialog" class="btn-base btn-neutral">
          <AppIcon scale="sm" name="clear" />{{ tt('watching.clearList') }}
        </button>
        <div key="sep-2" class="border-l border-white/30 h-6 mx-1"></div>
        <button key="time-sort" @click="toggleTimeSort" class="btn-base btn-toned" :title="tt('watching.timeAsc')">
          <AppIcon scale="sm" name="timeSort" /> {{ timeSortAsc ? tt('watching.timeAsc') : tt('watching.timeDesc') }}
        </button>
        </transition-group>
      <transition name="sel-anim">
          <div v-if="batchMode && checkedIds.length > 0" class="mt-2 text-sm text-danger flex items-center gap-2">
            <span class="inline-block w-2 h-2 rounded-full bg-danger"></span>
            {{ tt('watching.selectedCount', { count: checkedIds.length }) }}
          </div>
      </transition>

      <transition name="sel-anim">
          <div v-if="selected && !batchMode" class="mt-3 text-sm text-gray-500 flex items-center gap-2 selectable-text">
          <span class="inline-block w-2 h-2 rounded-full bg-primary"></span>
          {{ tt('watching.currentSelected') }} <span class="font-bold gradient-text">{{ selected.name }}</span>
          <span class="text-primary font-bold">e{{ selected.current_episode }}</span>
          <span v-if="selected.day_of_week">{{ dayLabel(selected.day_of_week) }}</span>
          <span v-if="selected.time_slot">{{ selected.time_slot }}</span>
        </div>

      </transition>
    </div>

    <!-- 周历视图 -->
    <div class="glass rounded-2xl shadow-lg overflow-hidden border border-white/30 flex-1 flex flex-col">
      <div class="grid grid-cols-7 grid-rows-[auto_1fr] flex-1">
        <!-- 星期表头配色：每个星期用契合「月火水木金土日」意象的颜色，
             而非「周末才区分、平时全一样」。统一低透明度底 + 对应深色文字，
             与玻璃背景协调且对比度达标。 -->
        <div v-for="(day, idx) in weekDays" :key="day"
          class="px-3 py-3 text-center text-base font-bold border-b border-r border-white/20 transition-all duration-300 day-head"
          :class="dayHeaderClass(idx)">
          <AppIcon scale="sm" class="inline-block transition-transform duration-300 hover:scale-110" :name="dayIcons[idx]" />
          <span class="ml-1">{{ dayLabel(day) }}</span>
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
          <!-- ⚠️ 勿在此处加无限动画：本元素在 .glass（backdrop-filter）子树内，
               动画会使这块占屏 62% 的玻璃每帧重新捕获背景并模糊，导致 GPU 持续满载。
               详见 .workbuddy/memory/2026-09-13.md -->
          <div v-if="getItemsByDay(day).length===0" class="flex-1 flex items-center justify-center text-gray-300 text-sm">
            <span><AppIcon scale="sm" name="sparkle" /> {{ tt('watching.noItem') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态引导：dataLoaded 为 false 时不渲染，避免"有数据用户"首帧闪一下空状态 -->
    <div v-if="dataLoaded && watchingList.length === 0" class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-8 text-center shrink-0">
      <div class="text-4xl mb-2"><AppIcon scale="sm" name="tv" /></div>
      <p class="text-sm text-gray-500 mb-4">{{ tt('watching.emptyTitle') }}</p>
      <div class="flex items-center justify-center gap-3">
        <button @click="openAddDialog" class="px-4 py-2 bg-gradient-to-r from-success to-emerald-400 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-success/30 transition-all btn-press">{{ tt('watching.addShow') }}</button>
        <router-link to="/import" class="px-4 py-2 bg-gradient-to-r from-secondary to-secondary-dark text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press"><AppIcon scale="sm" name="upload" /> {{ tt('watching.importFromExcel') }}</router-link>
      </div>
    </div>

    <!-- 未排期：未分配更新星期的番剧 -->
    <div v-if="unscheduledItems.length > 0" class="glass rounded-2xl shadow-lg border border-white/30 px-4 py-3 shrink-0">
      <div class="flex items-center gap-2 mb-2 flex-wrap">
        <span class="px-2.5 py-1 bg-warning/10 text-warning-dark rounded-lg text-sm font-bold"><AppIcon scale="sm" name="log" /> {{ tt('watching.unscheduledCount', { count: unscheduledItems.length }) }}</span>
        <span class="text-xs text-gray-400">{{ tt('watching.unscheduledHint') }}</span>
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
          <div class="relative glass rounded-2xl shadow-2xl w-[32.5rem] border border-white/40 pointer-events-auto app-dialog" ref="addDialogRef" role="dialog" aria-modal="true" aria-labelledby="watching-form-title" @keydown.ctrl.enter="saveForm">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <AppIcon scale="lg" :name="dialogMode==='add' ? 'sparkle' : 'edit'" />
              <h3 id="watching-form-title" class="text-lg font-bold gradient-text">{{ dialogMode==='add' ? tt('showDialog.addTitle') : tt('showDialog.editTitle') }}</h3>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('showDialog.name') }}</label>
                <input ref="dialogNameInput" v-model="form.name" type="text" :placeholder="tt('showDialog.namePlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('showDialog.day') }}</label>
                  <select v-model="form.day_of_week"
                    class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80">
                    <option value="">{{ tt('showDialog.chooseDay') }}</option>
                    <option v-for="day in weekDays" :key="day" :value="day">{{ dayLabel(day) }}</option>
                  </select>
                </div>
                <div>
                  <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                    <span>{{ tt('showDialog.time') }}</span>
                    <button type="button" @click="formShowTimePicker=!formShowTimePicker" class="text-xs text-primary hover:text-primary-dark transition">{{ formShowTimePicker ? tt('showDialog.clockPicker') : tt('showDialog.manualInput') }}</button>
                  </label>
                  <div v-if="!formShowTimePicker" class="relative">
                    <div class="time-picker-trigger w-full h-10 flex items-center justify-center border border-primary/20 rounded-xl bg-white/80 cursor-pointer hover:border-primary/40 transition" @click="formShowTimeDropdown=!formShowTimeDropdown">
                      <span class="text-sm font-mono" :class="formTime?'text-gray-800':'text-gray-400'">{{ formTime || tt('showDialog.clickToPickTime') }}</span>
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
                    <button @click="formTime=''" class="shrink-0 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">{{ tt('record.clearTime') }}</button>
                  </div>
                </div>
              </div>
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>{{ tt('showDialog.episode') }}<span v-if="formTotalEpisodes > 0" class="text-primary"> / {{ formTotalEpisodes }}</span></span>
                  <span class="text-xs text-gray-400">{{ tt('showDialog.episodeHint') }}</span>
                </label>
                <div class="flex items-center gap-2">
                  <!-- 步进按钮统一为 .btn-step（与输入框同几何、跟随主题色） -->
                  <button type="button" @click="formEpisodeDecrement" class="btn-step btn-press" :aria-label="tt('watching.epMinus')">
                    <AppIcon scale="sm" name="minus" />
                  </button>
                  <input v-model="form.current_episode" type="text" inputmode="decimal" :placeholder="tt('showDialog.timePlaceholder')"
                    class="flex-1 min-w-0 px-4 py-2.5 border border-primary/20 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                  <button type="button" @click="formEpisodeIncrement" class="btn-step btn-press" :aria-label="tt('watching.epPlus')">
                    <AppIcon scale="sm" name="plus" />
                  </button>
                  <!-- 总集数：用于显示追番进度百分比；留空则不显示进度 -->
                  <input v-model="form.total_episodes" type="text" inputmode="numeric"
                    :placeholder="tt('showDialog.totalEpisodesPlaceholder')"
                    :aria-label="tt('showDialog.totalEpisodes')"
                    class="w-20 shrink-0 px-2 py-2.5 border border-primary/20 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                </div>
                <p v-if="formProgressPct !== null" class="text-[0.6875rem] text-gray-400 mt-1">
                  {{ tt('showDialog.progressPreview', { pct: formProgressPct }) }}
                </p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('showDialog.url') }}</label>
                <input v-model="form.url" @input="onUrlInput" type="text" :placeholder="tt('showDialog.urlPlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <div class="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs text-gray-400">{{ tt('showDialog.quickFill') }}</span>
                  <button type="button" @click="selectTemplate('video')"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition btn-press"
                    :class="activeTemplate==='video' ? 'bg-primary text-white border-primary' : 'border-primary/30 text-primary hover:bg-primary/10'"><AppIcon scale="xs" name="video" />{{ tt('showDialog.bilibiliVideo') }}</button>
                  <button type="button" @click="selectTemplate('space')"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition btn-press"
                    :class="activeTemplate==='space' ? 'bg-primary text-white border-primary' : 'border-primary/30 text-primary hover:bg-primary/10'"><AppIcon scale="xs" name="home" />{{ tt('showDialog.bilibiliSpace') }}</button>
                  <button type="button" @click="selectTemplate('search')"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition btn-press"
                    :class="activeTemplate==='search' ? 'bg-primary text-white border-primary' : 'border-primary/30 text-primary hover:bg-primary/10'"><AppIcon scale="xs" name="search" />{{ tt('showDialog.bilibiliSearch') }}</button>
                </div>
                <div v-if="activeTemplate" class="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-2">
                  <template v-if="activeTemplate==='video'">
                    <input v-model="tplVideo.bv" type="text" :placeholder="tt('showDialog.bvPlaceholder')"
                      class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                    <p class="text-xs text-gray-400">{{ tt('showDialog.bvHint') }}</p>
                  </template>
                  <template v-else-if="activeTemplate==='space'">
                    <input v-model="tplSpace.uid" type="text" :placeholder="tt('showDialog.uidPlaceholder')"
                      class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                    <div class="grid grid-cols-2 gap-2">
                      <input v-model="tplSpace.name" type="text" :placeholder="tt('showDialog.namePlaceholder')"
                        class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                      <input v-model="tplSpace.season" type="number" min="1" :placeholder="tt('showDialog.seasonPlaceholder')"
                        class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                    </div>
                    <p class="text-xs text-gray-400">{{ tt('showDialog.spaceHint') }}</p>
                  </template>
                  <template v-else>
                    <input v-model="tplSearch.keyword" type="text" :placeholder="tt('showDialog.searchExample')"
                      class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                    <p class="text-xs text-gray-400">{{ tt('showDialog.searchHint') }}</p>
                  </template>
                  <div class="flex justify-end gap-2">
                    <button type="button" @click="activeTemplate=''" class="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition btn-press">{{ tt('common.cancel') }}</button>
                    <button type="button" @click="applyTemplate" class="px-3 py-1.5 text-xs text-white bg-gradient-to-r from-primary to-primary-dark rounded-lg hover:shadow-lg hover:shadow-primary/30 transition-all btn-press">{{ tt('showDialog.applyTemplate') }}</button>
                  </div>
                </div>
              </div>
              <div v-if="form.url">
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>{{ tt('showDialog.urlParams') }}</span>
                  <button type="button" @click="insertEpisodeToken" class="text-xs text-primary hover:text-primary-dark transition btn-press">{{ tt('showDialog.insertEpisode') }}</button>
                </label>
                <input ref="urlParamsInput" v-model="form.url_params" type="text" :placeholder="tt('showDialog.urlParamsPlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <p class="text-xs text-gray-400 mt-1">{{ tt('showDialog.episodeTokenDetail') }}</p>
              </div>
              <div>
                <!-- 标签选择：可复用 TagSelector，支持内置标签勾选与内联新建 -->
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
              <button @click="saveForm" :disabled="saving" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all btn-press disabled:opacity-40">{{ saving ? tt('common.saving') : tt('common.save') }}</button>
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
          <div class="relative glass rounded-2xl shadow-2xl w-[26.25rem] border border-white/40 pointer-events-auto app-dialog" ref="dateDialogRef" role="dialog" aria-modal="true" aria-labelledby="watching-date-title" @keydown.ctrl.enter="moveToWatched">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <AppIcon scale="lg" name="check" />
              <h3 id="watching-date-title" class="text-lg font-bold gradient-text">{{ tt('moveWatched.title') }}</h3>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>{{ tt('moveWatched.date') }}</span>
                  <button type="button" @click="dateManualInput=!dateManualInput" class="text-xs text-primary hover:text-primary-dark transition">{{ dateManualInput ? tt('record.useDatePicker') : tt('showDialog.manualInput') }}</button>
                </label>
                <input v-if="dateManualInput" v-model="moveDate" type="text" :placeholder="tt('moveWatched.datePlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80"
                  :class="{'border-danger/50 ring-danger/20': dateValidationError}" />
                <input v-else :value="formatToDateInput(moveDate)" @input="moveDate = dateInputToFormat($event.target.value)" @click="$event.target.showPicker()" type="date"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <p v-if="dateValidationError" class="text-xs text-danger mt-1">{{ dateValidationError }}</p>
                <p v-else-if="dateManualInput" class="text-xs text-gray-400 mt-1">{{ tt('record.dateFormatsHint') }}</p>
              </div>
              <!-- 时间选择 -->
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>{{ tt('moveWatched.time') }}</span>
                  <button type="button" @click="showTimePicker=!showTimePicker" class="text-xs text-primary hover:text-primary-dark transition">{{ showTimePicker ? tt('showDialog.manualInput') : tt('showDialog.clockPicker') }}</button>
                </label>
                <!-- 时钟选择器 -->
                <div v-if="!showTimePicker" class="relative">
                  <div class="time-picker-trigger w-full h-10 flex items-center justify-center border border-primary/20 rounded-xl bg-white/80 cursor-pointer hover:border-primary/40 transition" @click="showTimeDropdown=!showTimeDropdown">
                    <span class="text-sm font-mono" :class="moveTime?'text-gray-800':'text-gray-400'">{{ moveTime || tt('showDialog.clickToPickTime') }}</span>
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
                  <button @click="moveTime=''" class="px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">{{ tt('record.clearTime') }}</button>
                </div>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showDateDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">{{ tt('common.cancel') }}</button>
              <button @click="moveToWatched" class="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-secondary to-secondary-dark rounded-xl hover:shadow-lg hover:shadow-secondary/30 transition-all btn-press">{{ tt('common.confirm') }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <!-- 右键菜单同样套统一的 pop 过渡：从指针处向下展开 -->
      <transition name="pop">
      <div v-if="contextMenu.show" class="fixed z-[200]"
        style="--pop-origin-y: top; --pop-from-y: -4px"
        :style="{left:contextMenu.x+'px',top:contextMenu.y+'px'}">
        <div class="app-menu-surface rounded-xl shadow-2xl border border-white/40 py-1 min-w-[10rem] context-menu">
          <button @click="ctxEdit" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2">{{ tt('watching.edit') }}</button>
          <button @click="ctxOpenUrl" :disabled="!contextMenu.item?.url" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2 disabled:cursor-not-allowed disabled:hover:bg-transparent" :class="{'opacity-40':!contextMenu.item?.url}"><AppIcon scale="sm" name="link" /> {{ tt('card.openLink') }}</button>
          <button @click="ctxMoveToRemaining" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2"><AppIcon scale="sm" name="log" /> {{ tt('watching.moveToRemaining') }}</button>
          <button @click="ctxMoveToWatched" class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2"><AppIcon scale="sm" name="check" />{{ tt('watching.moveToWatched') }}</button>
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
          <div class="relative glass rounded-2xl shadow-2xl w-[23.75rem] border border-white/40 pointer-events-auto app-dialog" ref="confirmDialogRef" role="dialog" aria-modal="true" aria-labelledby="watching-confirm-title" @keydown.ctrl.enter="confirmActionFn">
            <div class="px-6 py-5 text-center">
              <div class="text-4xl mb-3" aria-hidden="true">{{ confirmAction==='clear'?'clear':confirmAction==='batchDelete'?'trash':confirmAction==='delete'?'trash':'log' }}</div>
              <h3 id="watching-confirm-title" class="text-lg font-bold text-gray-800 mb-2">{{ confirmAction==='clear' ? tt('confirm.clearTitle') : confirmAction==='batchDelete' ? tt('confirm.batchDeleteTitleShort') : confirmAction==='delete' ? tt('confirm.deleteTitle') : tt('watching.moveToRemaining') }}</h3>
              <p class="text-sm text-gray-500">
                <template v-if="confirmAction==='clear'">{{ tt('confirm.clearWatchingMessage') }}</template>
                <template v-else-if="confirmAction==='batchDelete'">{{ tt('confirm.batchDeleteMessageWatching', { count: confirmTarget }) }}</template>
                <template v-else-if="confirmAction==='delete'">{{ tt('confirm.deleteOneMessage', { name: confirmTarget }) }}</template>
                <template v-else>{{ tt('confirm.moveToRemainingMessage', { name: confirmTarget }) }}</template>
              </p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button @click="showConfirmDialog=false" class="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition btn-press">{{ tt('common.cancel') }}</button>
              <button @click="confirmActionFn" class="px-5 py-2.5 text-sm font-medium text-white rounded-xl hover:shadow-lg transition-all btn-press" :class="confirmAction==='clear'||confirmAction==='batchDelete'||confirmAction==='delete'?'bg-gradient-to-r from-danger to-red-400 hover:shadow-danger/30':'bg-gradient-to-r from-secondary to-secondary-dark hover:shadow-secondary/30'">{{ confirmAction==='clear' ? tt('confirm.confirmClear') : confirmAction==='batchDelete'||confirmAction==='delete' ? tt('confirm.confirmDelete') : tt('common.confirm') }}</button>
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
import { validateDate, dateInputToFormat, formatToDateInput, todayStr } from '../composables/useDatePicker'
import { smartIncrement, smartDecrement, normalizeEpisodeInput, buildItemUrl, defaultBgmUrl, openExternal } from '../composables/useEpisode'
import { showToast } from '../composables/useToast'
import { placeContextMenu } from '../composables/useContextMenu'
import { useDialogFocus } from '../composables/useDialogFocus'
import { useI18n } from '../composables/useI18n'
import WatchingCard from '../components/WatchingCard.vue'

const { tt } = useI18n()

const weekDays = ['周一','周二','周三','周四','周五','周六','周日']
// 星期表头装饰图标：统一走 AppIcon（与顶栏同一套线条规范）
// 月=月亮 火=火焰 水=水滴 木=叶子 金=星 土=云 日=太阳
const dayIcons = ['moon', 'flame', 'droplet', 'leaf', 'star', 'cloud', 'sun']

/**
 * 星期表头配色：按「月火水木金土日」的意象各配一色。
 *  - 月（周一）紫：夜的静谧
 *  - 火（周二）橙红：火
 *  - 水（周三）青蓝：水
 *  - 木（周四）绿：木
 *  - 金（周五）琥珀金：金
 *  - 土（周六）土褐：土
 *  - 日（周日）正红：日/休息日
 * 底色透明度压到 10~18，确保压在毛玻璃上不脏；文字用对应深色保证对比度 ≥4.5:1。
 * 深色模式下由 CSS 的 .dark .day-head-* 覆盖为更亮的文字色。
 */
// 文字色全部取到「压在 15~18% 同色淡底上 ≥4.5:1」的深度（实测校准；
// 原先橙/青/绿三档实测只有 3.9~4.2，故各下压一档）
const DAY_THEMES = [
  { bg: 'bg-[#8B5CF6]/15', text: 'text-[#5B21B6]' },  // 月 紫
  { bg: 'bg-[#F97316]/15', text: 'text-[#9A3412]' },  // 火 橙
  { bg: 'bg-[#0EA5E9]/15', text: 'text-[#075985]' },  // 水 青
  { bg: 'bg-[#10B981]/15', text: 'text-[#065F46]' },  // 木 绿
  { bg: 'bg-[#D97706]/18', text: 'text-[#78350F]' },  // 金 琥珀
  { bg: 'bg-[#78716C]/15', text: 'text-[#44403C]' },  // 土 土褐
  { bg: 'bg-[#EF4444]/15', text: 'text-[#991B1B]' },  // 日 红
]

const dayHeaderClass = (idx) => {
  const t = DAY_THEMES[idx] || DAY_THEMES[0]
  return [t.bg, t.text, `day-head-${idx}`]
}

// 星期是数据层的中文标识（数据里存「周一」），展示时按当前语言翻译
const dayLabel = (cn) => {
  const idx = weekDays.indexOf(cn)
  if (idx < 0) return cn
  return tt(`weekday.${idx + 1}`)
}

const SELECTED_KEY = 'watching_selected_id'

// 数据就绪门闩：初始为 false，首帧不渲染空状态引导（避免有数据用户一闪而过）。
// 首次 fetchData 完成后置 true，空状态引导（若确实无数据）才开始渲染。
// 主区淡入不在此处理——交给路由 <transition fade appear>（首次挂载即播），
// 这里不挂任何透明度/动画类，避免 backdrop root 吞掉 .glass 玻璃与锁住离场淡出
const dataLoaded = ref(false)

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
// 编辑目标的 id 快照：打开编辑弹窗时记住，提交时用它。
// 这样即使中途 selected 被清空（点空白/切批量），保存依然能定位到目标。
const editingId = ref(null)
// 默认值 = 今天（原为「当前年份」，用户要求统一改为今天）
const moveDate = ref(todayStr())
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
    return item.expected_date.startsWith(currentYM)
  })
})

// 未排期：未分配更新星期的番剧（周历按星期分列，空星期的记录不显示在任何列）
const unscheduledItems = computed(() => watchingList.value.filter(item => !item.day_of_week))

// 点击番剧卡片和交互元素以外的区域时取消选中（document 级监听，覆盖页面留白）
const onDocClick = (e) => {
  if (editing.value && !e.target.closest('input, select, textarea')) {
    saveEdit()
  }
  if (e.target.closest('.watching-card, button, input, select, textarea, a, .app-dialog, .context-menu, .selectable-text')) return
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
const isAllChecked = computed(() => watchingList.value.length > 0 && watchingList.value.every(item => checkedIds.value.includes(item.id)))

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
  confirmTarget.value = tt('watching.allWatching')
  confirmAction.value = 'clear'
  showConfirmDialog.value = true
}

const editing = ref(null)
const editValue = ref('')
const dateManualInput = ref(false)

const form = ref({ name:'', day_of_week:'', time_slot:'', current_episode:'0', total_episodes:'', url:'', url_params:'', notes:'', tags:'' })

/** 总集数（数字形式，无法解析时为 0） */
const formTotalEpisodes = computed(() => {
  const n = Number.parseFloat(String(form.value.total_episodes ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
})

/** 弹窗内的进度预览：与卡片上显示的百分比用同一套算法，保持一致 */
const formProgressPct = computed(() => {
  const cur = Number.parseFloat(String(form.value.current_episode ?? '').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(cur) || formTotalEpisodes.value <= 0) return null
  return Math.max(0, Math.min(100, Math.round((cur / formTotalEpisodes.value) * 100)))
})

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
    // 存**可读文字**，不做 URL 编码 —— 编码推迟到打开链接时（buildItemUrl 里）。
    // 否则数据库里会存成 %E4%BE%A6%E5%86%96…，用户在「动态参数」框里根本没法编辑。
    form.value.url_params = `keyword=${String(tplSpace.value.name || '').trim()} | ${season}季 | 第{集数}集`
  } else if (activeTemplate.value === 'search') {
    const kw = String(tplSearch.value.keyword || '').trim()
    if (!kw) return
    form.value.url = 'https://search.bilibili.com/all'
    // 同上：存可读文字，编码延迟到打开链接时
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
  if (item?.url) openExternal(buildItemUrl(item))
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
      if (res.data.success) { showToast(tt('toast.batchDeleted', { count: checkedIds.value.length })); checkedIds.value=[]; batchMode.value=false; await fetchData() }
      else showToast(res.data.error||tt('toast.batchDeleteFailed'),'error')
    } catch { showToast(tt('toast.batchDeleteFailed'),'error') }
  } else if (confirmAction.value === 'clear') {
    try {
      const res = await batchApi.clearWatching()
      if (res.data.success) { showToast(tt('toast.watchingCleared')); selected.value=null; batchMode.value=false; checkedIds.value=[]; await fetchData() }
      else showToast(res.data.error||tt('toast.clearFailed'),'error')
    } catch { showToast(tt('toast.clearFailed'),'error') }
  } else if (confirmAction.value === 'delete') {
    if (!selected.value) return
    try {
      const res = await watchingApi.delete(selected.value.id)
      if (res.data.success) { showToast(tt('toast.watchingDeleted')); selected.value=null; await fetchData() }
      else showToast(res.data.error||tt('toast.delFailed'),'error')
    } catch { showToast(tt('toast.delFailed'),'error') }
  } else if (confirmAction.value === 'moveToRemaining') {
    if (!selected.value) return
    try {
      const res = await watchingApi.moveToRemaining(selected.value.id)
      if (res.data.success) { showToast(tt('toast.movedToRemaining')); selected.value=null; await fetchData() }
      else showToast(res.data.error||tt('toast.operationFailed'),'error')
    } catch { showToast(tt('toast.operationFailed'),'error') }
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
        selected.value = watchingList.value.find(i => i.id === selected.value.id) || null
      } else {
        restoreSelected()
      }
    }
    // 同时获取等番数据
    const remRes = await remainingApi.getAll()
    if (remRes.data.success) remainingList.value = remRes.data.data
  } catch { showToast(tt('toast.fetchFailed'),'error') } finally {
    dataLoaded.value = true
  }
}

const selectItem = (item) => { selected.value = item }

// 鼠标中键打开链接
const handleCardMiddleClick = (e, item) => {
  if (e.button === 1) {
    e.preventDefault()
    openExternal(item.url ? buildItemUrl(item) : defaultBgmUrl(item))
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
  const token = editing.value
  const { id, field } = token
  let val = editValue.value
  if (field === 'name') {
    val = val.trim()
    if (!val) { showToast(tt('toast.pleaseEnterShowName'), 'warning'); return }
  }
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
      showToast(res.data.error || tt('toast.updateFailed'),'error')
    }
  } catch { showToast(tt('toast.updateFailed'),'error') }
  if (editing.value === token) editing.value = null
}

// ========== 对话框操作 ==========
const dialogNameInput = ref(null)
const focusNameInput = () => { nextTick(() => dialogNameInput.value?.focus()) }

const openAddDialog = () => {
  dialogMode.value = 'add'
  form.value = { name:'', day_of_week:'', time_slot:'', current_episode:'0', total_episodes:'', url:'', url_params:'', notes:'', tags:'' }
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
    total_episodes: String(selected.value.total_episodes || ''),
    url: selected.value.url || '',
    url_params: selected.value.url_params || '',
    notes: selected.value.notes || '',
    tags: selected.value.tags || ''
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

const saving = ref(false)
const saveForm = async () => {
  if (saving.value) return
  if (!form.value.name.trim()) { showToast(tt('toast.pleaseEnterShowName'),'warning'); return }
  if (formTime.value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(formTime.value)) {
    showToast(tt('toast.timeFormatInvalid'), 'warning')
    return
  }
  saving.value = true
  // 规范化集数：保留补零（01）与小数（26.19），非法输入归 0
  form.value.current_episode = normalizeEpisodeInput(form.value.current_episode)
  // 总集数：只保留数字部分（用户可能写成「12 集」），空值保持空串以便隐藏进度
  form.value.total_episodes = String(form.value.total_episodes ?? '').replace(/[^\d.]/g, '')
  // 合并时间选择到 time_slot
  form.value.time_slot = formTime.value || ''
  try {
    if (dialogMode.value === 'add') {
      const res = await watchingApi.add(form.value)
      if (res.data.success) {
        showToast(tt('toast.showAdded'))
        showDialog.value = false
        const newId = res.data.id
        const preSelected = form.value.name
        await fetchData()
        // 新增后自动选中刚添加的番剧：用户往往紧接着就要 +1 集
        const created = newId != null
          ? watchingList.value.find(i => Number(i.id) === Number(newId))
          : watchingList.value.find(i => i.name === preSelected)
        if (created) selected.value = created
      }
      else showToast(res.data.error || tt('toast.addFailed'),'error')
    } else {
      // 编辑态必须拿到被编辑项的 id。原先直接读 selected.value.id ——
      // 若编辑期间选中被清空（点页面空白 / 切换批量模式 / 快速填充后误触），
      // selected 为 null 会抛 "reading 'id' of null"，被 catch 吞成「操作失败」，
      // 用户完全不知道原因（这就是"有时候编辑操作失败"的根因）。
      // 现在打开编辑时把 id 快照到 editingId，提交时优先用它，与选中状态解耦。
      const targetId = editingId.value ?? selected.value?.id
      if (targetId == null) {
        showToast(tt('toast.noTargetSelected'), 'warning')
        return
      }
      const res = await watchingApi.update(targetId, form.value)
      if (res.data.success) {
        showToast(tt('toast.showUpdated'))
        showDialog.value = false
        selected.value = null
        editingId.value = null
        await fetchData()
      } else showToast(res.data.error || tt('toast.updateFailed'), 'error')
    }
  } catch (e) {
    // 不再静默吞异常：控制台留真实堆栈，提示里带上原因
    console.error('[watching] saveForm failed:', e)
    showToast(tt('toast.operationFailedWith', { message: e?.message || 'unknown' }), 'error')
  }
  finally { saving.value = false }
}

const incrementEpisode = async (item) => {
  try {
    const res = await watchingApi.increment(item.id)
    if (res.data.success) { await fetchData(); const u = watchingList.value.find(i=>i.id===item.id); if(u) selected.value=u }
  } catch { showToast(tt('toast.operationFailed'),'error') }
}

const decrementEpisode = async (item) => {
  try {
    const res = await watchingApi.decrement(item.id)
    if (res.data.success) { await fetchData(); const u = watchingList.value.find(i=>i.id===item.id); if(u) selected.value=u }
  } catch { showToast(tt('toast.operationFailed'),'error') }
}

const doIncrement = () => { if(selected.value) incrementEpisode(selected.value) }
const doDecrement = () => { if(selected.value) decrementEpisode(selected.value) }

const moveToRemaining = () => { openMoveToRemainingDialog() }

/**
 * 选中项专属操作按钮：集中定义，模板用 v-for 渲染。
 * 好处：① 新增/调整操作只改这一处；② transition-group 能对整组做统一的出现/收起动画，
 * 不会因为逐个 v-show 导致工具栏高度跳变。
 */
const selectedActions = computed(() => [
  { key: 'edit', icon: 'edit', label: tt('watching.edit'), cls: 'btn-toned', onClick: openEditDialog },
  { key: 'inc', icon: 'plus', label: tt('watching.epPlus'), cls: 'btn-primary', onClick: doIncrement },
  { key: 'dec', icon: 'minus', label: tt('watching.epMinus'), cls: 'btn-neutral', onClick: doDecrement },
  { key: 'move', icon: 'clock', label: tt('watching.moveToRemaining'), cls: 'btn-toned', onClick: () => moveToRemaining() },
  { key: 'watched', icon: 'check', label: tt('watching.moveToWatched'), cls: 'btn-toned', onClick: () => openDateDialog() },
  { key: 'del', icon: 'trash', label: tt('watching.delete'), cls: 'btn-danger', onClick: deleteItem },
])

const openDateDialog = () => {
  if (!selected.value) return
  moveDate.value = todayStr()
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
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(moveTime.value)) {
      dateValidationError.value = tt('toast.timeFormatInvalid')
      return
    }
    // 如果日期只有年或年月，不追加时间
    if (!(/^\d{4}$/.test(finalDate) || /^\d{4}\/\d{2}$/.test(finalDate) || /~/.test(finalDate))) {
      finalDate += ' ' + moveTime.value
    }
  }
  try {
    const res = await watchingApi.moveToWatched(selected.value.id, finalDate)
    if (res.data.success) { showToast(tt('toast.movedToWatched', { date: finalDate })); showDateDialog.value=false; selected.value=null; await fetchData() }
    else showToast(res.data.error||tt('toast.operationFailed'),'error')
  } catch { showToast(tt('toast.operationFailed'),'error') }
}

const deleteItem = () => { openConfirmDialog() }

// 弹窗焦点管理：打开时聚焦首个输入框、Tab 在弹窗内循环、关闭后焦点还给触发按钮
const addDialogRef = ref(null)
const dateDialogRef = ref(null)
const confirmDialogRef = ref(null)
const pageRootRef = ref(null)

useDialogFocus({
  isOpen: () => showDialog.value,
  getDialog: () => addDialogRef.value,
  root: () => pageRootRef.value,
  initialFocus: () => dialogNameInput.value,
})
useDialogFocus({
  isOpen: () => showDateDialog.value,
  getDialog: () => dateDialogRef.value,
  root: () => pageRootRef.value,
})
useDialogFocus({
  isOpen: () => showConfirmDialog.value,
  getDialog: () => confirmDialogRef.value,
  root: () => pageRootRef.value,
})

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
