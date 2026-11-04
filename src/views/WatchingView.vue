<template>
  <div ref="pageRootRef" class="space-y-5 flex flex-col min-h-full" tabindex="-1">
    <!-- 等番本月提示 -->
    <div v-if="currentMonthRemaining.length > 0" class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4 shrink-0">
      <div class="toolbar-enter flex items-center justify-between gap-2 flex-wrap">
        <div class="card-head">
          <AppIcon scale="md" name="info" class="text-primary" />
          <h3 class="card-head-title gradient-text">{{ tt('watching.monthReminder', { count: currentMonthRemaining.length }) }}</h3>
          <!-- 需求 B：本页计数（共 N 部追番）也在这里给一份 —— 本卡是页面**最顶部**那张，
               计数紧贴页面标题行右侧，与等番/已看两页同一位置同一套 .topbar-stat 样式。 -->
        </div>
        <router-link to="/remaining" class="btn-base btn-toned shrink-0">
          <AppIcon scale="sm" name="clock" />{{ tt('watching.viewRemaining') }}
        </router-link>
      </div>
    </div>

    <!-- 周历视图（独立卡片：卡片标题行 + 周历本体） -->
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
          class="border-r border-white/10 last:border-r-0 min-h-[18.75rem] flex flex-col bg-white/30"
          :class="{ 'col-drag-over': dragOverDay === day }"
          @contextmenu.prevent.self="openEmptyAreaMenu($event)"
          @dragover="onColumnDragOver($event, day)"
          @drop.prevent="onColumnDrop($event, day)">
          <WatchingCard v-for="item in getItemsByDay(day)" :key="item.id" class="flex-1"
            :draggable="canDrag" :class="{ 'is-dragging': draggingId === item.id }"
            @dragstart="onCardDragStart($event, item)" @dragend="onCardDragEnd"
            :item="item"
            :selected="selected?.id===item.id"
            :batch-mode="batchMode"
            :checked="checkedIds.includes(item.id)"
            :editing="editing"
            v-model:editValue="editValue"
            @select="batchMode ? toggleCheck(item.id) : selectItem(item)"
            @toggle-check="toggleCheck(item.id)"
            @context-menu="handleCardContextMenu($event, item)"
            @open-dialog="openCardDialog(item)"
            @middle-click="handleCardMiddleClick($event, item)"
            @start-edit="startEdit(item, $event)"
            @save-edit="saveEdit"
            @cancel-edit="cancelEdit"
            @increment="incrementEpisode(item)"
            @decrement="decrementEpisode(item)" />
          <!-- ⚠️ 勿在此处加无限动画：本元素在 .glass（backdrop-filter）子树内，
               动画会使这块占屏 62% 的玻璃每帧重新捕获背景并模糊，导致 GPU 持续满载。
               详见 .workbuddy/memory/2026-09-13.md -->
          <!-- 周历空白处右键 → 添加番剧（用户要求：不再需要按钮）。
               视觉审计 A-08：「暂无」是**数据已到且该列确实为空**才成立的结论。
               dataLoaded 之前 7 列全都会命中空判断，有数据的用户首帧看到 7 个「暂无」，
               数据到位后卡片突然替换。门闩前改渲染静态细条占位（与 V-19 门闩同思路）。 -->
          <div v-if="!dataLoaded" class="day-col-skeleton" aria-hidden="true">
            <span class="day-col-skeleton-bar"></span>
            <span class="day-col-skeleton-bar is-short"></span>
          </div>
          <div v-else-if="getItemsByDay(day).length===0" class="flex-1 flex items-center justify-center cursor-default"
            @contextmenu.prevent="openEmptyAreaMenu($event)">
            <span class="empty-inline"><AppIcon scale="sm" name="sparkle" />{{ tt('watching.noItem') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态引导：dataLoaded 为 false 时不渲染，避免"有数据用户"首帧闪一下空状态。
         「图标 + 主文案 + 操作」三段式本身就是这张卡片的标题区，不再额外叠一个 card-head。 -->
    <div v-if="dataLoaded && watchingList.length === 0" class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4 shrink-0">
      <div class="empty-state">
        <AppIcon scale="xl" name="tv" class="empty-state-icon" />
        <p class="empty-state-title">{{ tt('watching.emptyTitle') }}</p>
        <div class="flex items-center justify-center gap-2 flex-wrap mt-2">
          <button @click="openAddDialog" class="btn-base btn-primary">
            <AppIcon scale="sm" name="plus" />{{ tt('watching.addShow') }}
          </button>
          <router-link to="/transfer" class="btn-base btn-toned">
            <AppIcon scale="sm" name="upload" />{{ tt('transfer.importTitle') }}
          </router-link>
        </div>
      </div>
    </div>

    <!-- 未排期：未分配更新星期的番剧 -->
    <div v-if="unscheduledItems.length > 0" class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4 shrink-0">
      <div class="card-head mb-3 flex-wrap">
        <AppIcon scale="md" name="log" class="text-primary" />
        <!-- 「未分配更新星期，选中后『编辑』选择星期即可入列」是在解释「怎么操作」，
             属于控件用法说明 → 改为标题上的悬浮气泡；卡片标题行的下间距由 mb-1 收到 mb-3 之外不再多占一行。 -->
        <h3 class="card-head-title gradient-text inline-flex items-center gap-1 cursor-help"
          v-tip="tt('watching.unscheduledHint')">{{ tt('watching.unscheduled') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></h3>
        <span class="stat-chip">{{ tt('watching.unscheduledCount', { count: unscheduledItems.length }) }}</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <WatchingCard v-for="item in unscheduledItems" :key="item.id" class="w-64"
          :draggable="canDrag" :class="{ 'is-dragging': draggingId === item.id }"
          @dragstart="onCardDragStart($event, item)" @dragend="onCardDragEnd"
          :item="item"
          :selected="selected?.id===item.id"
          :batch-mode="batchMode"
          :checked="checkedIds.includes(item.id)"
          :editing="editing"
          v-model:editValue="editValue"
          @select="batchMode ? toggleCheck(item.id) : selectItem(item)"
          @toggle-check="toggleCheck(item.id)"
          @context-menu="handleCardContextMenu($event, item)"
          @open-dialog="openCardDialog(item)"
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
                  <AppSelect v-model="form.day_of_week"
                    :options="weekDayOptions"
                    :placeholder="tt('showDialog.chooseDay')"
                    :aria-label="tt('showDialog.day')"
                    trigger-class="w-full" />
                </div>
                <div>
                  <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                    <span>{{ tt('showDialog.time') }}</span>
                  </label>
                  <!-- 钟表盘选择器：点表盘可直接选时/分（原为 24+12 按钮网格） -->
                  <ClockPicker v-model="formTime" :aria-label="tt('showDialog.time')" />
                </div>
              </div>
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <!-- 「支持 01、02 补零格式」原为标签右侧外显小字，改为标签自身的悬浮气泡：
                       文案 key 原样保留，只是渲染位置从段落移到气泡；视觉上用虚线底 + info 图标提示可悬浮。 -->
                  <span class="inline-flex items-center gap-1 cursor-help"
                    v-tip="tt('showDialog.episodeHint')">{{ tt('showDialog.episode') }}<AppIcon scale="xs" name="info" class="text-gray-400" /><span v-if="formTotalEpisodes > 0" class="text-primary"> / {{ formTotalEpisodes }}</span></span>
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
                <!-- 封面图 URL（用户早期明确要求过的「番剧封面图，可参考 Bangumi 番组计划」）。
                     数据层已支持 cover_url，这里只负责录入 + 实时预览：
                     · 不做 Bangumi API 搜索（跨域 + 需要 UA + 限流，且本应用离线优先），
                       只让用户粘贴直链；placeholder 给一条真实可访问的示例，方便照抄格式。
                     · 预览 40×56（竖排海报 5:7）；URL 为空时整块不渲染（不留空槽、不改变弹窗高度）。
                     · 加载失败换成占位图标（.is-failed 的虚线描边做弱提示），绝不出现浏览器裂图。
                       URL 每变一次就把失败标记复位（见脚本里的 watch），换了链接即可重试。 -->
                <label v-tip="tt('showDialog.coverUrlHint')"
                  class="block text-sm font-medium text-gray-700 mb-1 cursor-help w-fit">
                {{ tt('showDialog.coverUrl') }}<AppIcon scale="xs" name="info" class="text-gray-400" />
              </label>
                <div class="flex items-center gap-2">
                  <input v-model="form.cover_url" type="text" data-cover-input
                    :placeholder="tt('showDialog.coverUrlPlaceholder')"
                    :aria-label="tt('showDialog.coverUrl')"
                    class="flex-1 min-w-0 px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                  <div v-if="form.cover_url" class="cover-thumb cover-thumb--preview w-10 h-14 shrink-0"
                    :class="{ 'is-failed': formCoverFailed }" data-cover-preview>
                    <img v-if="!formCoverFailed" :src="trimmedCoverUrl" alt="" loading="lazy" decoding="async"
                      @error="formCoverFailed = true" />
                    <!-- 占位图标用 image（空心相框）而不是 imageOff：
                         imageOff 会把相框填充成实色，16px 下看起来就是一个纯黑方块，
                         读不出「图片缺失」的语义。 -->
                    <AppIcon v-else scale="sm" name="image" />
                  </div>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('showDialog.url') }}</label>
                <input v-model="form.url" @input="onUrlInput" type="text" :placeholder="tt('showDialog.urlPlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                <div class="mt-2 flex items-center gap-1.5 flex-wrap">
                  <!-- 「快速填充:」是三个按钮的组标题，保留外显（它标的是这组按钮本身，不是控件用法说明）。
                       三个模板各自的用法说明（原来摊在展开面板里的小字）改为按钮上的悬浮气泡：
                       说明与触发点同处一处，面板收起后也不再占一行。 -->
                  <span class="text-xs text-gray-400">{{ tt('showDialog.quickFill') }}</span>
                  <button type="button" @click="selectTemplate('video')"
                    class="btn-base btn-sm quick-fill-btn"
                    v-tip="tt('showDialog.bvHint')" :aria-label="tt('showDialog.bilibiliVideo')"
                    :class="activeTemplate==='video' ? 'btn-primary' : 'btn-neutral'"><AppIcon scale="xs" name="video" />{{ tt('showDialog.bilibiliVideo') }}</button>
                  <button type="button" @click="selectTemplate('space')"
                    class="btn-base btn-sm quick-fill-btn"
                    v-tip="tt('showDialog.spaceHint')" :aria-label="tt('showDialog.bilibiliSpace')"
                    :class="activeTemplate==='space' ? 'btn-primary' : 'btn-neutral'"><AppIcon scale="xs" name="home" />{{ tt('showDialog.bilibiliSpace') }}</button>
                  <button type="button" @click="selectTemplate('search')"
                    class="btn-base btn-sm quick-fill-btn"
                    v-tip="tt('showDialog.searchHint')" :aria-label="tt('showDialog.bilibiliSearch')"
                    :class="activeTemplate==='search' ? 'btn-primary' : 'btn-neutral'"><AppIcon scale="xs" name="search" />{{ tt('showDialog.bilibiliSearch') }}</button>
                </div>
                <div v-if="activeTemplate" class="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-2">
                  <template v-if="activeTemplate==='video'">
                    <input v-model="tplVideo.bv" type="text" :placeholder="tt('showDialog.bvPlaceholder')"
                      :aria-label="tt('showDialog.bvPlaceholder')"
                      class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                  </template>
                  <template v-else-if="activeTemplate==='space'">
                    <input v-model="tplSpace.uid" type="text" :placeholder="tt('showDialog.uidPlaceholder')"
                      :aria-label="tt('showDialog.uidPlaceholder')"
                      class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                    <div class="grid grid-cols-2 gap-2">
                      <input v-model="tplSpace.name" type="text" :placeholder="tt('showDialog.namePlaceholder')"
                        :aria-label="tt('showDialog.namePlaceholder')"
                        class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                      <input v-model="tplSpace.season" type="number" min="1" :placeholder="tt('showDialog.seasonPlaceholder')"
                        :aria-label="tt('showDialog.seasonPlaceholder')"
                        class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                    </div>
                  </template>
                  <template v-else>
                    <input v-model="tplSearch.keyword" type="text" :placeholder="tt('showDialog.searchExample')"
                      :aria-label="tt('showDialog.searchExample')"
                      class="w-full px-3 py-2 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
                  </template>
                  <div class="flex justify-end gap-2">
                    <button type="button" @click="activeTemplate=''" class="btn-base btn-sm btn-neutral">{{ tt('common.cancel') }}</button>
                    <button type="button" @click="applyTemplate" class="btn-base btn-sm btn-primary">{{ tt('showDialog.applyTemplate') }}</button>
                  </div>
                </div>
              </div>
              <div v-if="form.url">
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <!-- 输入框下方那段长解释（「用 {episode} 代表当前集数…补零格式按原样替换」）
                       整段移入标签气泡；原占的一行随之收回，纵向节奏不变。 -->
                  <span class="inline-flex items-center gap-1 cursor-help"
                    v-tip="tt('showDialog.episodeTokenDetail')">{{ tt('showDialog.urlParams') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></span>
                  <button type="button" @click="insertEpisodeToken" class="btn-base btn-sm btn-link">{{ tt('showDialog.insertEpisode') }}</button>
                </label>
                <input ref="urlParamsInput" v-model="form.url_params" type="text" :placeholder="tt('showDialog.urlParamsPlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
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
              <button @click="showDialog=false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
              <button @click="saveForm" :disabled="saving" class="btn-base btn-primary disabled:opacity-40">{{ saving ? tt('common.saving') : tt('common.save') }}</button>
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
                  <!-- 日期格式说明移入标签气泡（虚线 + info 图标提示可悬浮），原灰字一行收回 -->
                  <span class="inline-flex items-center gap-1 cursor-help"
                    v-tip="tt('record.dateFormatsHint')">{{ tt('moveWatched.date') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></span>
                  <button type="button" @click="dateManualInput=!dateManualInput" class="btn-base btn-sm btn-link">{{ dateManualInput ? tt('record.useDatePicker') : tt('showDialog.manualInput') }}</button>
                </label>
                <input v-if="dateManualInput" v-model="moveDate" type="text" :placeholder="tt('moveWatched.datePlaceholder')"
                  :aria-label="tt('record.dateFormatsHint')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80"
                  :class="{'border-danger/50 ring-danger/20': dateValidationError}" />
                <!-- 日期：自研面板（DatePicker）替代原生 input[type=date]（浏览器自带白色日历
                     压在深色玻璃上非常割裂，且只能表达完整日期）。「手动输入」开关仍然保留。 -->
                <DatePicker v-else v-model="moveDate" :placeholder="tt('moveWatched.datePlaceholder')"
                  :invalid="!!dateValidationError" />
                <!-- 校验错误必须外显（用户要立刻看到）；「支持的日期格式」这类用法说明
                     改为输入框自身的 aria-label + 悬浮气泡，不再单独占一行灰字 -->
                <p v-if="dateValidationError" class="text-xs text-danger mt-1">{{ dateValidationError }}</p>
              </div>
              <!-- 时间选择 -->
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>{{ tt('moveWatched.time') }}</span>
                </label>
                <!-- 钟表盘选择器：点表盘直接选时/分（原为 24+12 按钮网格） -->
                <ClockPicker v-model="moveTime" :aria-label="tt('moveWatched.time')" />
              </div>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showDateDialog=false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
              <button @click="moveToWatched" class="btn-base btn-toned">{{ tt('common.confirm') }}</button>
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
        <div class="app-dialog app-menu-panel min-w-[10rem] context-menu">
          <button @click="ctxEdit" class="text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2"><AppIcon scale="sm" name="edit" /> {{ tt('watching.edit') }}</button>
          <button @click="ctxOpenUrl" :disabled="!contextMenu.item?.url" class="text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2 disabled:cursor-not-allowed disabled:hover:bg-transparent" :class="{'opacity-40':!contextMenu.item?.url}"><AppIcon scale="sm" name="link" /> {{ tt('card.openLink') }}</button>
          <button @click="ctxMoveToRemaining" class="text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2"><AppIcon scale="sm" name="log" /> {{ tt('watching.moveToRemaining') }}</button>
          <button @click="ctxMoveToWatched" class="text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2"><AppIcon scale="sm" name="check" />{{ tt('watching.moveToWatched') }}</button>
          <div class="border-t border-white/20 my-1"></div>
          <button @click="ctxDelete" class="text-left px-4 py-2 text-sm hover:bg-danger/10 text-danger transition flex items-center gap-2"><AppIcon scale="sm" name="trash" /> {{ tt('common.delete') }}</button>
        </div>
      </div>
      </transition>
      <div v-if="contextMenu.show" class="fixed inset-0 z-[199]" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu"></div>
    </Teleport>

    <!-- 周历空白处右键 → 添加番剧（用户要求移除「添加番剧」按钮） -->
    <Teleport to="body">
      <transition name="pop">
        <div v-if="emptyAreaMenu.show" class="fixed z-[200]"
          style="--pop-origin-y: top; --pop-from-y: -4px"
          :style="{ left: emptyAreaMenu.x + 'px', top: emptyAreaMenu.y + 'px' }">
          <div class="app-menu-panel min-w-[10rem] context-menu">
            <button type="button" role="menuitem" @click="emptyAreaAddShow"
              class="flex items-center gap-2 text-left transition hover:bg-primary/10 whitespace-nowrap">
              <AppIcon scale="xs" name="plus" /><span class="flex-1">{{ tt('watching.addShow') }}</span>
            </button>
          </div>
        </div>
      </transition>
      <div v-if="emptyAreaMenu.show" class="fixed inset-0 z-[199]" @click="closeEmptyAreaMenu"
        @contextmenu.prevent="closeEmptyAreaMenu"></div>
    </Teleport>

    <!-- 批量勾选后右键 → 批量删除 / 移至等番 / 移至已看 -->
    <Teleport to="body">
      <transition name="pop">
        <div v-if="batchMenu.show" class="fixed z-[200]"
          style="--pop-origin-y: top; --pop-from-y: -4px"
          :style="{ left: batchMenu.x + 'px', top: batchMenu.y + 'px' }">
          <div class="app-menu-panel min-w-[10rem] context-menu">
            <button type="button" role="menuitem" @click="batchDeleteFromMenu"
              class="flex items-center gap-2 text-left transition hover:bg-danger/10 text-danger whitespace-nowrap">
              <AppIcon scale="xs" name="trash" /><span class="flex-1">{{ tt('watching.batchDeleteCount', { count: checkedIds.length }) }}</span>
            </button>
            <div class="menu-sep"></div>
            <button type="button" role="menuitem" @click="batchMoveToRemaining"
              class="flex items-center gap-2 text-left transition hover:bg-primary/10 whitespace-nowrap">
              <AppIcon scale="xs" name="clock" /><span class="flex-1">{{ tt('watching.moveToRemaining') }}</span>
            </button>
            <button type="button" role="menuitem" @click="batchMoveToWatched"
              class="flex items-center gap-2 text-left transition hover:bg-primary/10 whitespace-nowrap">
              <AppIcon scale="xs" name="check" /><span class="flex-1">{{ tt('watching.moveToWatched') }}</span>
            </button>
          </div>
        </div>
      </transition>
      <div v-if="batchMenu.show" class="fixed inset-0 z-[199]" @click="closeBatchMenu"
        @contextmenu.prevent="closeBatchMenu"></div>
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
              <!-- 确认弹窗大图标：与等番/已看两页同一写法（AppIcon scale=xl + flex 居中）。
                   历史缺陷：这里曾直接输出图标名字符串（{{ 'trash' }}），
                   导致弹窗顶部显示大号文字 "trash" / "clear"，图标完全丢失。
                   是 emoji → SVG 迁移时唯一漏改的一处（另外两页都已正确）。 -->
              <div class="mb-3 flex justify-center" aria-hidden="true">
                <AppIcon scale="xl" class="text-danger"
                  :name="confirmAction==='clear' ? 'clear' : (confirmAction==='batchDelete'||confirmAction==='delete') ? 'trash' : 'log'" />
              </div>
              <h3 id="watching-confirm-title" class="text-lg font-bold text-gray-800 mb-2">{{ confirmAction==='clear' ? tt('confirm.clearTitle') : confirmAction==='batchDelete' ? tt('confirm.batchDeleteTitleShort') : confirmAction==='delete' ? tt('confirm.deleteTitle') : tt('watching.moveToRemaining') }}</h3>
              <p class="text-sm text-gray-500">
                <template v-if="confirmAction==='clear'">{{ tt('confirm.clearWatchingMessage') }}</template>
                <template v-else-if="confirmAction==='batchDelete'">{{ tt('confirm.batchDeleteMessageWatching', { count: confirmTarget }) }}</template>
                <template v-else-if="confirmAction==='delete'">{{ tt('confirm.deleteOneMessage', { name: confirmTarget }) }}</template>
                <template v-else>{{ tt('confirm.moveToRemainingMessage', { name: confirmTarget }) }}</template>
              </p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button @click="showConfirmDialog=false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
              <button @click="confirmActionFn" class="btn-base"
                :class="confirmAction==='clear'||confirmAction==='batchDelete'||confirmAction==='delete' ? 'btn-danger' : 'btn-toned'">{{ confirmAction==='clear' ? tt('confirm.confirmClear') : confirmAction==='batchDelete'||confirmAction==='delete' ? tt('confirm.confirmDelete') : tt('common.confirm') }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, onBeforeUpdate, watch, nextTick } from 'vue'
import { watchingApi, remainingApi, batchApi } from '../db/api'
import { validateDate, todayStr } from '../composables/useDatePicker'
import DatePicker from '../components/DatePicker.vue'
import { smartIncrement, smartDecrement, normalizeEpisodeInput, buildItemUrl, defaultBgmUrl, openExternal } from '../composables/useEpisode'
import { showToast } from '../composables/useToast'
import { setPageStats, setPageSelection, clearPageSelection, setPageActions, clearPageActions } from '../composables/usePageStats'
import { placeContextMenu } from '../composables/useContextMenu'
import { useDialogFocus } from '../composables/useDialogFocus'
import { useI18n } from '../composables/useI18n'
import { useErrorText } from '../composables/useErrorText'
import { spaceCJK } from '../composables/useCjkSpace'
import WatchingCard from '../components/WatchingCard.vue'

const { tt } = useI18n()
const { errorText } = useErrorText()

const weekDays = ['周一','周二','周三','周四','周五','周六','周日']

/** AppSelect 用的星期选项（含空占位，与原 <select> 的 chooseDay 一致） */
const weekDayOptions = computed(() => [
  { value: '', label: tt('showDialog.chooseDay') },
  ...weekDays.map((d) => ({ value: d, label: dayLabel(d) })),
])
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
  { bg: 'bg-[#D97706]/15', text: 'text-[#78350F]' },  // 金 琥珀
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
  // 点周历空白 / 页面其它区域 → 清空批量勾选并退出批量模式（用户要求）
  if ((batchMode.value || checkedIds.value.length > 0)
      && !e.target.closest('.watching-card, button, input, select, textarea, a, .app-dialog, .context-menu, .app-menu-panel, .sel-anim-wrap')) {
    checkedIds.value = []
    batchMode.value = false
  }
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


/**
 * 反选：把已选的取消、未选的选中。
 *
 * 追番页是周历卡片视图、不分页，所以作用于 watchingList 全量
 * （另两页表格有分页，那边作用于当前页）。
 */
const invertSelection = () => {
  const allIds = watchingList.value.map(i => i.id)
  const cur = new Set(checkedIds.value)
  for (const id of allIds) {
    if (cur.has(id)) cur.delete(id)
    else cur.add(id)
  }
  checkedIds.value = [...cur]
}

const batchDelete = () => {
  if (checkedIds.value.length === 0) return
  confirmTarget.value = String(checkedIds.value.length)
  confirmAction.value = 'batchDelete'
  showConfirmDialog.value = true
}

/**
 * 批量移动：把勾选记录移到目标页。
 *
 * 项目只有**单条**移动 API，所以逐个调用。数量不大（一页最多几十条），
 * 串行足够，且失败时能精确定位是哪一条出错。
 */
const batchMoveTo = async (target) => {
  const ids = [...checkedIds.value]
  if (ids.length === 0) return
  try {
    const move = target === 'remaining'
      ? watchingApi.moveWatchingToRemaining
      : watchingApi.moveWatchingToWatched
    for (const id of ids) {
      await move(id)
    }
    checkedIds.value = []
    batchMode.value = false
    await fetchData()
    showToast(tt('toast.movedCount', { count: ids.length }), 'success')
  } catch (err) {
    showToast(String(err?.message || err), 'error')
  }
}

const openClearDialog = () => {
  confirmTarget.value = tt('watching.allWatching')
  confirmAction.value = 'clear'
  showConfirmDialog.value = true
}

const editing = ref(null)
const editValue = ref('')
const dateManualInput = ref(false)

const form = ref({ name:'', day_of_week:'', time_slot:'', current_episode:'0', total_episodes:'', cover_url:'', url:'', url_params:'', notes:'', tags:'' })

// ========== 封面图预览 ==========
// 只做「粘贴 URL → 预览」这一件事：不在客户端调用 Bangumi API（跨域 + 需要 UA + 限流），
// 也就不需要任何网络权限或新增依赖。
// formCoverFailed 记录「当前这个 URL 加载失败」，URL 一变就复位（见下方 watch），
// 这样用户把写错的链接改成正确链接时预览能立刻恢复，而不是永远停在占位图标。
const formCoverFailed = ref(false)
/** 去掉首尾空白后的封面地址：用户从聊天窗口复制时常带空格/换行，直接塞给 <img> 会 404 */
const trimmedCoverUrl = computed(() => String(form.value.cover_url ?? '').trim())
watch(trimmedCoverUrl, () => { formCoverFailed.value = false })

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
    // 排版：这里是**运行时拼接**（季数/集数是变量），写不进语言包，
    // 因此交给 spaceCJK 统一处理「数字 ↔ 汉字」之间的半角空格（幂等）。
    form.value.url_params = spaceCJK(`keyword=${String(tplSpace.value.name || '').trim()} | ${season}季 | 第{集数}集`)
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

/*
 * 周历空白处右键菜单。
 *
 * 用户要求：移除「添加番剧」按钮，改为在周历空白处右键即可添加。
 * 单独一套 state（不复用卡片右键菜单），因为两者菜单项完全不同：
 * 卡片右键是「编辑/打开链接/移至…/删除」，空白处只有「添加番剧」。
 */
const emptyAreaMenu = ref({ show: false, x: 0, y: 0 })

const openEmptyAreaMenu = (e) => {
  emptyAreaMenu.value = { show: true, x: e.clientX, y: e.clientY }
}

const closeEmptyAreaMenu = () => { emptyAreaMenu.value.show = false }

/** 空白右键菜单 → 添加番剧 */
const emptyAreaAddShow = () => {
  closeEmptyAreaMenu()
  openAddDialog()
}

/** 批量勾选后右键 → 批量操作菜单（删除 / 移至等番 / 移至已看） */
const batchMenu = ref({ show: false, x: 0, y: 0 })

const openBatchMenu = (e) => {
  if (!batchMode.value || checkedIds.value.length === 0) return false
  batchMenu.value = { show: true, x: e.clientX, y: e.clientY }
  return true
}

const closeBatchMenu = () => { batchMenu.value.show = false }

/** 批量移到等番：逐个调用 moveToRemaining */
const batchMoveToRemaining = async () => {
  closeBatchMenu()
  await batchMoveTo('remaining')
}

/** 批量移到已看 */
const batchMoveToWatched = async () => {
  closeBatchMenu()
  await batchMoveTo('watched')
}

const batchDeleteFromMenu = () => {
  closeBatchMenu()
  batchDelete()
}
const openContextMenu = (e, item) => {
  selected.value = item
  // 贴边/贴底时自动翻转，避免菜单被视口裁掉
  placeContextMenu(contextMenu, e, { item })
}

/**
 * 卡片右键分发。
 *
 * 三种情况：
 *   批量模式 + 有勾选 → 批量操作菜单（删除 / 移至等番 / 移至已看）
 *   非批量模式       → 原有的单卡片操作菜单
 *   批量模式但无勾选  → 不弹菜单（没有可操作对象）
 */
const handleCardContextMenu = (e, item) => {
  if (batchMode.value) {
    if (checkedIds.value.length > 0) {
      e.preventDefault()
      openBatchMenu(e)
    }
    return
  }
  openContextMenu(e, item)
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
      else showToast(errorText(res.data, tt, 'toast.batchDeleteFailed'),'error')
    } catch { showToast(tt('toast.batchDeleteFailed'),'error') }
  } else if (confirmAction.value === 'clear') {
    try {
      const res = await batchApi.clearWatching()
      if (res.data.success) { showToast(tt('toast.watchingCleared')); selected.value=null; batchMode.value=false; checkedIds.value=[]; await fetchData() }
      else showToast(errorText(res.data, tt, 'toast.clearFailed'),'error')
    } catch { showToast(tt('toast.clearFailed'),'error') }
  } else if (confirmAction.value === 'delete') {
    if (!selected.value) return
    try {
      const res = await watchingApi.delete(selected.value.id)
      if (res.data.success) { showToast(tt('toast.watchingDeleted')); selected.value=null; await fetchData() }
      else showToast(errorText(res.data, tt, 'toast.delFailed'),'error')
    } catch { showToast(tt('toast.delFailed'),'error') }
  } else if (confirmAction.value === 'moveToRemaining') {
    if (!selected.value) return
    try {
      const res = await watchingApi.moveToRemaining(selected.value.id)
      if (res.data.success) { showToast(tt('toast.movedToRemaining')); selected.value=null; await fetchData() }
      else showToast(errorText(res.data, tt, 'toast.operationFailed'),'error')
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
// 解析 time_slot 中的 HH:mm 为分钟数，无法解析的排在最后。
// 深夜时段沿用业界 24+ 时制（24:00~29:00，数据层允许录入）：按实际分钟数参与排序
// （24:00=1440，排在 23:00=1380 之后、24:30=1470 之前）；超出该范围仍视为无法解析。
// 此前 h>23 一律归 Infinity，两条 Infinity 相减为 NaN，同列深夜条目只能回落插入序。
const parseTimeSlot = (slot) => {
  if (!slot) return Infinity
  const m = String(slot).match(/(\d{1,2}):(\d{2})/)
  if (!m) return Infinity
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h > 29 || min > 59) return Infinity
  return h * 60 + min
}
const getItemsByDay = (day) => watchingList.value
  .filter(item => item.day_of_week === day)
  .sort((a, b) => {
    const ta = parseTimeSlot(a.time_slot)
    const tb = parseTimeSlot(b.time_slot)
    return timeSortAsc.value ? ta - tb : tb - ta
  })

// ========== 周历拖拽：跨列改星期（任务书「拖拽排序跨列」，审计 A-40） ==========
// HTML5 DnD：卡片为拖源（draggable/@dragstart 走 WatchingCard 根节点 attr 透传），
// 七个星期列为落点，drop 即改写 day_of_week（未排期卡拖入即入列；同列/同值 no-op）。
// 边界处理与 placeContextMenu 同一取向：只认本页发起的拖拽（draggingId 为 null 时
// dragover 不 preventDefault，外部拖入的文本/文件无法落列），dragend 兜底清理状态。
// 键盘等价路径不缺位：改星期仍可走编辑弹窗的星期下拉（行内编辑/批量模式下禁拖）。
const draggingId = ref(null)   // 正被拖拽的卡片 id（拖源降透明度，提示「拖的是它」）
const dragOverDay = ref('')    // 悬停中的落点列（整列高亮）
const canDrag = computed(() => !batchMode.value && !editing.value)
const onCardDragStart = (e, item) => {
  draggingId.value = item.id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(item.id))
}
const onCardDragEnd = () => { draggingId.value = null; dragOverDay.value = '' }
const onColumnDragOver = (e, day) => {
  // 外部拖入（文件/文本/外链）不 preventDefault：列不成为系统拖拽的落点
  if (draggingId.value === null) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dragOverDay.value = day
}
const moveItemToDay = async (item, day) => {
  if (!item || item.day_of_week === day) return
  try {
    const res = await watchingApi.update(item.id, { day_of_week: day })
    if (res.data.success) {
      showToast(tt('toast.movedToDay', { day: dayLabel(day) }), 'success')
      await fetchData()
    } else {
      showToast(errorText(res.data, tt, 'toast.updateFailed'), 'error')
    }
  } catch { showToast(tt('toast.updateFailed'), 'error') }
}
const onColumnDrop = (e, day) => {
  dragOverDay.value = ''
  const id = Number(e.dataTransfer.getData('text/plain'))
  moveItemToDay(watchingList.value.find(i => i.id === id), day)
}

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
      showToast(errorText(res.data, tt, 'toast.updateFailed'),'error')
    }
  } catch { showToast(tt('toast.updateFailed'),'error') }
  if (editing.value === token) editing.value = null
}

// ========== 对话框操作 ==========
const dialogNameInput = ref(null)
const focusNameInput = () => { nextTick(() => dialogNameInput.value?.focus()) }

const openAddDialog = () => {
  dialogMode.value = 'add'
  form.value = { name:'', day_of_week:'', time_slot:'', current_episode:'0', total_episodes:'', cover_url:'', url:'', url_params:'', notes:'', tags:'' }
  formCoverFailed.value = false
  formTime.value = ''
  formShowTimePicker.value = false
  formShowTimeDropdown.value = false
  activeTemplate.value = ''
  showDialog.value = true
  focusNameInput()
}

/**
 * 卡片空白处双击 → 打开完整编辑弹窗（需求 A）。
 *
 * 为什么不直接复用 openEditDialog：那个函数读 `selected.value`，而双击空白处
 * 时卡片可能尚未选中（用户只是「想改这一张」，并不想先点它一下）。
 * 所以先把该卡片设为选中，再走同一条 openEditDialog 路径 —— 这样弹窗里的
 * 「当前选中」信息、保存后的选中等行为全都沿用既有逻辑，零分叉。
 *
 * 批量模式由 WatchingCard 内部拦截（onCardDblclick 直接 return），
 * 这里再兜一层，防止将来别处也 emit 这个事件。
 */
const openCardDialog = (item) => {
  if (batchMode.value || !item) return
  selected.value = item
  openEditDialog()
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
    // 编辑路径与新增路径都必须带 cover_url：漏掉它，保存时 update 白名单里
    // 这个字段会被当成「未提供」，用户改过的封面等于白改。
    cover_url: selected.value.cover_url || '',
    url: selected.value.url || '',
    url_params: selected.value.url_params || '',
    notes: selected.value.notes || '',
    tags: selected.value.tags || ''
  }
  formCoverFailed.value = false
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
  // 封面地址去空白：从聊天/网页复制来时经常带首尾空格或换行，原样存进库会让 <img> 404
  form.value.cover_url = trimmedCoverUrl.value
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
      else showToast(errorText(res.data, tt, 'toast.addFailed'),'error')
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
      } else showToast(errorText(res.data, tt, 'toast.updateFailed'), 'error')
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
    else showToast(errorText(res.data, tt, 'toast.operationFailed'),'error')
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


// 计数同步到顶栏（追番总数）
// 首帧门闩（视觉审计 A-08）：dataLoaded 之前不写，否则顶栏先亮「共 0 条」，
// 与列内 7 个「暂无」叠加成「数据全丢了」的错觉；数据到达后随 length 变化正常更新。
watch(
  [() => watchingList.value.length, dataLoaded],
  ([n, loaded]) => {
    if (!loaded) return
    setPageStats('/watching', [
      { text: tt('watched.totalCount', { count: n }), tone: 'neutral' },
    ])
  },
  { immediate: true },
)

const ROUTE_KEY = '/watching'

/**
 * 顶栏操作按钮。
 *
 * 用户要求：「添加番剧」改为周历空白处右键（已移除按钮），
 * 其余（批量选择 / 清空列表 / 时间排序 / 批量操作）移到顶栏。
 */
watch(
  [() => batchMode.value, () => checkedIds.value.length, () => isAllChecked.value, () => selected.value, () => timeSortAsc.value],
  () => {
    const items = [
      { key: 'batch', icon: 'checkbox', label: batchMode.value ? tt('watching.cancelBatchSelect') : tt('watching.batchSelect'), onClick: toggleBatchMode },
    ]
    if (selected.value && !batchMode.value) {
      for (const a of selectedActions.value) {
        items.push({ key: 'sel-' + a.key, icon: a.icon, label: a.label, onClick: a.onClick, danger: a.cls === 'btn-danger' })
      }
    }
    if (batchMode.value || checkedIds.value.length > 0) {
      items.push({ key: 'sel-all', icon: 'checkbox', label: isAllChecked.value ? tt('watching.unselectAll') : tt('watching.selectAll'), onClick: toggleSelectAll })
      items.push({ key: 'invert', icon: 'swap', label: tt('watching.invertSelection'), onClick: invertSelection })
      items.push({ key: 'batch-del', icon: 'trash', label: tt('watching.batchDeleteCount', { count: checkedIds.value.length }), onClick: batchDelete, danger: true })
    }
    items.push({ key: 'clear', icon: 'clear', label: tt('watching.clearList'), onClick: openClearDialog, danger: true })
    items.push({ key: 'time-sort', icon: 'timeSort', label: timeSortAsc.value ? tt('watching.timeAsc') : tt('watching.timeDesc'), onClick: toggleTimeSort })
    setPageActions('/watching', items)
  },
  { immediate: true, deep: true },
)
/** 当前选中信息同步到顶栏（用户要求从卡片内移走，省掉一整行） */
/**
 * 顶栏「当前选中 / 已选择 N 项」同步（含批量选中分支）。
 */
watch(
  [selected, batchMode, () => checkedIds.value.length],
  () => {
    if (batchMode.value) {
      const n = checkedIds.value.length
      setPageSelection(ROUTE_KEY, n > 0
        ? { name: tt('watching.selectedCount', { count: n }), dot: 'danger', items: [] }
        : null)
      return
    }
    const sel = selected.value
    if (!sel) {
      setPageSelection(ROUTE_KEY, null)
      return
    }
    setPageSelection(ROUTE_KEY, {
      name: tt('watching.currentSelected'),
      dot: 'primary',
      items: [
        { text: sel.name },
        { text: 'e' + (sel.current_episode || '0') },
        ...(sel.day_of_week ? [{ text: dayLabel(sel.day_of_week), tone: 'neutral' }] : []),
        ...(sel.time_slot ? [{ text: String(sel.time_slot), tone: 'neutral' }] : []),
      ],
    })
  },
  { immediate: true, deep: true },)

onUnmounted(() => {
  clearPageSelection(ROUTE_KEY)
  clearPageActions(ROUTE_KEY)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', onDocClick)
})

// ========== 工具栏离场元素「原地淡出」定位 ==========
// .sel-anim-leave-active 让离场元素脱离文档流（这是让 -move 归位动画能触发的前提），
// 但它随即会回落到工具栏的静态位置（最左侧），半透明地压住「添加番剧」。
// 这里在 before-leave 里把它钉在它自己的原始坐标上，于是视觉上是「原地淡出」，
// 而其余按钮由 transition-group 的 -move 类平滑滑到新位置。
//
// 因为「选中项专属操作」已收成单个包装元素，离场只有一次测量，
// 此时 before-leave 里量到的就是真实原位（不再需要提前快照）。

const toolbarRef = ref(null)

const pinLeavingGroup = (el) => {
  const wrap = toolbarRef.value?.$el
  if (!el || !wrap) return
  const rect = el.getBoundingClientRect()
  const box = wrap.getBoundingClientRect()
  el.style.position = 'absolute'
  el.style.left = `${rect.left - box.left - wrap.clientLeft}px`
  el.style.top = `${rect.top - box.top - wrap.clientTop}px`
  el.style.width = `${rect.width}px`
  // 清掉 leave-from/leave-to 覆盖的 max-height/margin/padding，免得被压扁
  el.style.maxHeight = 'none'
  el.style.margin = '0'
}

const unpinLeavingGroup = (el) => {
  if (!el) return
  el.style.position = ''
  el.style.left = ''
  el.style.top = ''
  el.style.width = ''
  el.style.maxHeight = ''
  el.style.margin = ''
}
</script>

<style scoped>
/* ── 工具栏归位动画（FLIP）为什么原来不播放 ─────────────────────────────
   Vue 的 <transition-group> 在 patch 后的 onUpdated 里做 FLIP：
     1. 记录每个「上次渲染过」的子元素的新位置；
     2. 用「旧位置 − 新位置」给它们写一段临时 translate；
     3. 加上 `sel-anim-move` 类，让 transform 过渡回 0（0.22s）。
   这就是其余按钮「平滑归位」的唯一来源。

   原来的 `.sel-anim-leave-active` 只过渡 opacity/transform/max-height/
   margin/padding，**离场按钮并没有退出布局**：6 个专属按钮在整个 0.22s
   离场期间仍各占 74~98px 宽的位置，于是「批量选择」等按钮的旧位置与新位置
   完全相同 → Vue 判定 dx = 0 → 不加 -move 类、也不写 translate →
   视觉上就是瞬间跳位。
   这正好解释了实测到的两个现象：过渡中 `getComputedStyle(btn).transform`
   始终是 `none`，且页面上完全找不到任何 `sel-anim-*` 类。

   修法两步：
   A. 离场元素立刻脱离文档流 → 后面的按钮才会真的产生位移；
   B. 给离场元素写 transition，让 Vue 走「过渡队列」判定它仍在离场中，
      而不是立刻从 DOM 移除（否则它连淡出都没有）。
   ─────────────────────────────────────────────────────────────────── */

/* A + B：只管工具栏的直接子元素（不能写成裸的 `.sel-anim-leave-active`，
   因为同一组件里「当前选中」信息行也用 `name="sel-anim"` 的 <transition>，
   被绝对定位会把它从文档流里拔出来、位置乱跳）。
   脱离文档流后，由 <transition-group :before-leave> 算好的原始坐标钉住自己。 */
.sel-anim-wrap > .sel-anim-leave-active {
  position: absolute;
  pointer-events: none;
  /* 必须显式写 transform 过渡：否则 Vue 只为「有过渡属性」的元素排队等过渡结束，
     没匹配到过渡会立刻把节点删掉 —— 那样连淡出都没有，-leave-to 也永远不生效。
     曲线/时长与 style.css 的 .sel-anim-leave-active 一致：离场走 iOS --ease-exit 0.22s。 */
  transition: opacity 0.22s var(--ease-exit, cubic-bezier(0.4, 0, 1, 1)),
    transform 0.22s var(--ease-exit, cubic-bezier(0.4, 0, 1, 1));
}

/* 定位参照：必须是参与布局的正常盒子。
   不能改成 display: contents —— 那样子元素不参与布局，
   Vue 的 -move 位移测量失去参照，归位动画同样不会播放。 */
.sel-anim-wrap {
  position: relative;
}

/* ── 周历列首帧占位（视觉审计 A-08）──────────────────────────────────
   数据未到时列内渲染静态细条，而不是「暂无」假空态。
   ⚠️ 本元素在 .glass（backdrop-filter）子树内，**禁止任何动画**：
   无限动画会让这块占屏 62% 的玻璃每帧重捕获背景并模糊（AGENTS.md 第 7 条）。
   所以这里只给静态底色，不做 pulse。 */
.day-col-skeleton {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  min-height: 0;
}
.day-col-skeleton-bar {
  display: block;
  height: 2.25rem;
  border-radius: 0.375rem;
  background: rgb(var(--c-primary) / 0.08);
}
.day-col-skeleton-bar.is-short {
  height: 1.5rem;
  width: 70%;
}
.dark .day-col-skeleton-bar {
  background: rgb(255 255 255 / 0.06);
}
</style>
