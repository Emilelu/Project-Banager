<template>
  <div ref="pageRootRef" class="space-y-5" @keydown="handleKeydown" tabindex="-1">
    <!-- 视觉审计 A-01：原「第一卡」（年份选择 + 搜索 + 标签筛选）已整卡迁入顶栏 ——
         三件控件经 pageControls 注册（见下方 watch），由 App.vue 顶栏渲染；
         selectedYear / searchQuery / tagFilter 的状态、按年 fetch 与年份增删改
         的弹窗逻辑仍在本 view。正文不再保留这张卡。 -->
    <!-- 「已选择 N 项」已移到顶栏（见 setPageSelection 的批量分支） -->

    <!-- 列表视图 -->
    <div class="tbl-scroll glass rounded-2xl shadow-lg border border-white/30 overflow-hidden">
      <!-- 需求 B：表格卡片**不再**自带「☰ 作品名称 / 共 N 条」标题行 ——
           下面的 <thead> 已经列出完整列名（#/作品名称/日期/链接/备注），
           再叠一个同名伪标题既重复又白占一行；「共 N 条」计数由 setPageStats
           写入顶栏（视觉审计 A-01 后第一卡整体迁入顶栏，页面内不再有标题卡）。 -->
      <table class="record-table">
        <colgroup>
        <col v-if="batchMode" class="col-check" />
        <col class="col-index" />
        <col class="col-name" />
        <col class="col-date" />
        <col class="col-url" />
        <col class="col-notes" />
        </colgroup>
        <thead>
          <tr class="text-sm font-bold border-b border-white/20">
            <th v-if="batchMode" class="text-center px-2 py-2.5 text-primary-dark font-bold cursor-pointer select-none" @click="toggleSelectAll">
              <!-- A-33：补半选态（同等番页）：部分勾选 = aria-checked="mixed" +
                   主题色底 + 白色短横线；全选才是对勾。 -->
              <div role="checkbox" tabindex="0"
                :aria-checked="isAllChecked ? 'true' : (isPartiallyChecked ? 'mixed' : 'false')"
                :aria-label="isPartiallyChecked ? tt('watching.selectAllMixed') : tt('watching.selectAll')"
                @keydown.enter.prevent="toggleSelectAll" @keydown.space.prevent="toggleSelectAll"
                class="w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-all mx-auto"
                :class="(isAllChecked || isPartiallyChecked) ? 'bg-primary border-primary' : 'border-gray-300 bg-white/80 hover:border-primary'">
                <svg v-if="isAllChecked" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                <span v-else-if="isPartiallyChecked" class="block w-2 h-[2px] rounded-full bg-white" aria-hidden="true"></span>
              </div>
            </th>
            <th class="text-center px-2 py-2.5 text-primary-dark font-bold whitespace-nowrap">#</th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold cursor-pointer select-none hover:bg-primary/5 transition"
              tabindex="0" role="button" :aria-sort="sortField==='name'?(sortOrder==='asc'?'ascending':'descending'):'none'"
              @click="toggleSort('name')" @keydown.enter.prevent="toggleSort('name')" @keydown.space.prevent="toggleSort('name')">
              <AppIcon scale="sm" name="sparkle" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('watched.colName') }} <AppIcon scale="xs" class="inline-block align-middle ml-0.5" v-if="sortField==='name'" :name="sortOrder==='asc'?'arrowUp':'arrowDown'" />
            </th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold cursor-pointer select-none hover:bg-primary/5 transition whitespace-nowrap"
              tabindex="0" role="button" :aria-sort="sortField==='watch_date'?(sortOrder==='asc'?'ascending':'descending'):'none'"
              @click="toggleSort('watch_date')" @keydown.enter.prevent="toggleSort('watch_date')" @keydown.space.prevent="toggleSort('watch_date')">
              <AppIcon scale="sm" name="calendar" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('watched.colDate') }} <AppIcon scale="xs" class="inline-block align-middle ml-0.5" v-if="sortField==='watch_date'" :name="sortOrder==='asc'?'arrowUp':'arrowDown'" />
            </th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold whitespace-nowrap"><AppIcon scale="sm" name="link" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('watched.colUrl') }}</th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold whitespace-nowrap"><AppIcon scale="sm" name="note" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('watched.colNotes') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!listLoaded" class="record-skeleton-row">
            <td :colspan="batchMode?6:5" class="py-6">
              <div class="record-skeleton" aria-hidden="true">
                <span class="record-skeleton-bar" v-for="n in 6" :key="n" :style="{ width: (88 - n * 8) + '%' }"></span>
              </div>
              <p class="sr-only">{{ tt('common.loading') }}</p>
            </td>
          </tr>
          <tr v-else-if="paginatedList.length===0">
            <td :colspan="batchMode?6:5" class="py-10">
              <!-- 空态三段式：图标 + 主文案（+ 副说明）。
                   副说明原为「支持单个年份(2025)或年份范围(2014~2017)」——那是**年份标签格式**的说明，
                   已挂到年份筛选触发器与「添加年份」弹窗的标签上；空态只保留主文案。 -->
              <div class="empty-state">
                <AppIcon scale="xl" name="emptyBox" class="empty-state-icon" />
                <!-- 视觉审计 A-18：selectedYear 为空串（无年份组）或 '__all__' 时不能把
                     空值/哨兵插进 emptyYear —— en 会渲染悬空介词句「No records for 」、
                     ja 缺主语、__all__ 直接透出哨兵。这两种情况改用不带 {year} 的
                     watched.emptyTitle（三语现成、此前未被本页使用）；只有真实年份才走 emptyYear。 -->
                <p class="empty-state-title">{{ searchQuery ? tt('watched.emptyNoMatch') : (selectedYear === '__unclassified__' ? tt('watched.emptyUnclassified') : (selectedYear && selectedYear !== '__all__' ? tt('watched.emptyYear', { year: selectedYear }) : tt('watched.emptyTitle'))) }}</p>
              </div>
            </td>
          </tr>
          <tr v-for="(item,idx) in paginatedList" :key="item.id"
            :data-row-id="item.id"
            tabindex="-1"
            class="cursor-pointer transition-all duration-200 border-b border-white/10 list-item group"
            :class="{
              'is-checked': batchMode && checkedIds.includes(item.id),
              'is-selected': !batchMode && selected?.id === item.id,
              'is-odd': idx % 2 === 0,
            }"
            @click="batchMode?toggleCheck(item.id):selectItem(item)"
            @dblclick="onRowDblclick($event)"
            @contextmenu.prevent="!batchMode && openContextMenu($event,item)"
            @mousedown.middle.prevent="openItemLink(item)">
            <td v-if="batchMode" class="text-center px-2 py-2.5" @click.stop="toggleCheck(item.id)" @dblclick.stop>
              <div role="checkbox" tabindex="0" :aria-checked="checkedIds.includes(item.id) ? 'true' : 'false'"
                :aria-label="tt('card.checkLabel', { name: item.name })"
                @keydown.enter.prevent="toggleCheck(item.id)" @keydown.space.prevent="toggleCheck(item.id)"
                class="w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-all mx-auto"
                :class="checkedIds.includes(item.id)?'bg-primary border-primary':'border-gray-300 bg-white/80 hover:border-primary'">
                <svg v-if="checkedIds.includes(item.id)" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
              </div>
            </td>
            <!-- 序号：点击即切换该行选中态（无需先点「批量选择」）。
                 用 idx+1 显示、item.id 记录 —— 序号随翻页/排序变化，id 不变。 -->
            <td class="text-center px-2 py-2.5 cursor-pointer select-none"
              @click.stop="toggleCheckFromIndex(item)" @dblclick.stop>
              <span class="text-xs font-mono tabular-nums transition-colors"
                :class="checkedIds.includes(item.id) ? 'text-primary font-bold' : 'text-gray-400 hover:text-primary cell-index-num'">{{ (currentPage - 1) * pageSize + idx + 1 }}</span>
            </td>
            <td class="px-3 py-2.5 editable-cell" v-bind="editCellProps(item, 'name')"
              @dblclick.stop="onFieldDblclick(item, 'name')"
              @keydown="onCellKeydown($event, item, 'name')">
              <input v-if="editing?.id===item.id&&editing?.field==='name'" v-model="editValue"
                :aria-label="tt('card.editWorkNameLabel', { name: item.name })"
                :aria-invalid="editInvalid ? 'true' : null"
                :class="{ 'is-invalid': editInvalid }"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full" autofocus />
              <!-- 作品名称 + 标签同排（标签在名称右侧）：
                   不新增 td（既有列索引的测试断言不受影响），也不另起一行
                   —— 否则带标签的行会比无标签的行高、整张表行高参差。
                   名称允许 ellipsis 收缩，标签按自身宽度靠右，整块不撑出 td。
                   标签 chip 不可点（编辑走弹窗），所以不进 Tab 序。
                   封面缩略图（24×32）放在名称**左侧**的同一行：放在 td 里做兄弟节点会独占一行
                   把名称顶到下一行（行高随有无封面跳变）。无封面时整块不渲染（不占位），
                   加载失败的行由 rowCoverFailed[id] 记住后不再渲染（不出现裂图）。 -->
              <div v-else class="name-with-tags">
                <!-- 封面缩略图：只有**真的有封面**时才渲染。
                     无封面时不留空槽位 —— 用户明确要求「没有封面的行，名称起始位置要和表头图标对齐」。
                     留空槽会把名称推后约 26px（缩略图 21px + gap 5px），反而更偏右。
                     悬浮时浮出放大预览（见 showCoverZoom）。 -->
                <img v-if="item.cover_url && !rowCoverFailed[item.id]" :src="item.cover_url"
                  class="cover-thumb cover-thumb--row" alt="" loading="lazy" decoding="async"
                  @error="markRowCoverFailed(item.id)"
                  @mouseenter="showCoverZoom($event, item.cover_url)"
                  @mouseleave="hideCoverZoom" />
                <!-- 视觉审计 A-16：浅色悬浮变色改由 style.css 的钳暗规则接管
                     （html:not(.dark) tr.group:hover .name-with-tags > .text-sm）。 -->
                <span class="text-sm font-semibold text-gray-800 transition-colors truncate">{{ item.name }}</span>
                <ItemTags v-if="item.tags" :tags="item.tags" :max="3" />
              </div>
            </td>
            <td class="px-3 py-2.5 editable-cell" v-bind="editCellProps(item, 'watch_date')"
              @dblclick.stop="onFieldDblclick(item, 'watch_date')"
              @keydown="onCellKeydown($event, item, 'watch_date')">
              <input v-if="editing?.id===item.id&&editing?.field==='watch_date'" v-model="editValue"
                :aria-label="tt('card.editDateLabel', { name: item.name })"
                :aria-invalid="editInvalid ? 'true' : null"
                :class="{ 'is-invalid': editInvalid }"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full"
                :placeholder="tt('moveWatched.datePlaceholder')" autofocus />
              <span v-else class="cell-date text-sm truncate block">{{ item.watch_date || '-' }}</span>
            </td>
            <td class="px-3 py-2.5 editable-cell" v-bind="editCellProps(item, 'url')"
              @dblclick.stop="onFieldDblclick(item, 'url')"
              @keydown="onCellKeydown($event, item, 'url')">
              <input v-if="editing?.id===item.id&&editing?.field==='url'" v-model="editValue"
                :aria-label="tt('card.editUrlLabel', { name: item.name })"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full"
                :placeholder="tt('record.urlPlaceholder')" autofocus />
              <a v-else :href="item.url ? buildUrl(item) : defaultBgmUrl(item)" target="_blank" rel="noopener"
                @click.stop @mousedown.middle.stop
                :aria-label="tt('card.openLinkLabel', { name: item.name })"
                class="cell-link text-xs text-primary hover:text-primary-dark truncate block">{{ item.url || 'bgm.tv' }}</a>
            </td>
            <td class="px-3 py-2.5 editable-cell" v-bind="editCellProps(item, 'notes')"
              @dblclick.stop="onFieldDblclick(item, 'notes')"
              @keydown="onCellKeydown($event, item, 'notes')">
              <input v-if="editing?.id===item.id&&editing?.field==='notes'" v-model="editValue"
                :aria-label="tt('card.editNotesLabel', { name: item.name })"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full" autofocus />
              <span v-else class="cell-notes text-sm truncate block">{{ item.notes || '-' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页（独立卡片：正文直接是翻页控件。
         需求 B：去掉「共 N 条」卡片标题行 —— 计数已上提到顶栏（pageStats），
         此处再写一遍即为同一页面内的第三次重复。 -->
    <div v-if="filteredList.length > 0" class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-2">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-2 text-sm text-gray-600">
          <div class="relative inline-block">
            <button @click="togglePageSizeMenu($event)"
              class="btn-base btn-sm btn-neutral page-size-trigger">
              <AppIcon scale="xs" name="listCheck" />{{ tt('remaining.perPage', { n: pageSize }) }}<AppIcon scale="xs" name="caretDown" />
            </button>
            <!-- 与等待更新页完全一致：同样宽度、同样 nowrap、同样向上展开的 pop 过渡 -->
            <transition name="pop">
              <!-- 必须 fixed + Teleport 到 body：本菜单原本挂在 .glass 卡片内用 absolute，
               而 .glass 带 backdrop-filter 会形成 backdrop root，
               菜单自身的 backdrop-filter 因此采不到页面背景 → 背景模糊形同虚设。
               语言菜单正是 fixed z-[110] 才正常。 -->
         <Teleport to="body">
         <div v-if="showPageSizeMenu" ref="pageSizeMenuEl" role="menu"
                class="page-size-menu app-menu-panel fixed z-[110]"
                :style="pageSizeMenuStyle">
                <button v-for="s in pageSizeOptions" :key="s" role="menuitem" @click="setPageSize(s)"
                  class="text-left px-4 py-2 text-sm hover:bg-primary/10 transition whitespace-nowrap" :class="pageSize===s?'text-primary font-bold':'text-gray-700'">{{ tt('remaining.perPage', { n: s }) }}</button>
                <div class="border-t border-gray-200/60 my-1"></div>
                <div class="px-3 py-2 flex items-center gap-2 whitespace-nowrap">
                  <input v-model="customPageSize" type="number" min="1" :placeholder="tt('common.custom')"
                    class="w-[4.5rem] shrink-0 px-2 py-1 border border-primary/20 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white" @keyup.enter="applyCustomPageSize" />
                  <!-- pager-confirm-btn：避免被 .app-menu-panel > div > button 的 width:100% 命中，
                       否则与固定宽输入框同排必然横向溢出面板（视觉审计 A-02，见 style.css 同名规则） -->
                  <button @click="applyCustomPageSize" class="btn-base btn-sm btn-neutral pager-confirm-btn shrink-0">{{ tt('common.confirm') }}</button>
                </div>
              </div>
         </Teleport>
            </transition>
          </div>
        </div>
        <!-- 分页按钮组：间距 8px（调参结果，原 gap-1 = 3.5px 偏挤）。
             用 gap-[8px] 而非 gap-2：本工程根字号 14px，gap-2 = 0.5rem = 7px，差 1px -->
        <div class="flex items-center gap-[8px]">
          <button :disabled="currentPage<=1" @click="currentPage--"
            class="btn-base btn-icon pager-btn" :class="currentPage<=1 ? 'btn-neutral' : 'btn-toned'"
            :aria-label="tt('watched.prevPage')" v-tip="tt('watched.prevPage')">
            <AppIcon scale="sm" name="caretLeft" /></button>
          <template v-for="p in displayPages" :key="p">
            <span v-if="p==='...'" class="px-2 text-xs text-gray-400 pager-ellipsis">...</span>
            <button v-else @click="currentPage=p"
          class="btn-base btn-icon pager-btn" :class="p===currentPage ? 'btn-primary font-bold' : 'btn-neutral'">{{ p }}</button>
          </template>
          <button :disabled="currentPage>=totalPages" @click="currentPage++"
            class="btn-base btn-icon pager-btn" :class="currentPage>=totalPages ? 'btn-neutral' : 'btn-toned'"
            :aria-label="tt('watched.nextPage')" v-tip="tt('watched.nextPage')">
            <AppIcon scale="sm" name="caretRight" /></button>
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
        <!-- A-34：role=menu + 打开聚焦首项 + ↑↓ 循环 + Esc 还焦，
             与顶栏「更多」菜单同一套标准（composables/useMenuKeyboard.js）。 -->
        <div ref="contextMenuRef" class="app-dialog app-menu-panel min-w-[10rem] context-menu"
          role="menu" :aria-label="tt('topbar.moreActions')" @keydown="onContextMenuKeydown">
          <button role="menuitem" @click="ctxEdit" class="text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2"><AppIcon scale="sm" name="edit" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('common.edit') }}</button>
          <!-- A-63：无链接时与追番页一致做成真禁用（:disabled + not-allowed） -->
          <button role="menuitem" @click="ctxOpenUrl" :disabled="!contextMenu.item?.url"
            class="text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            :class="{'opacity-40':!contextMenu.item?.url}"><AppIcon scale="sm" name="link" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('card.openLink') }}</button>
          <div class="border-t border-white/20 my-1"></div>
          <button role="menuitem" @click="ctxDelete" class="text-left px-4 py-2 text-sm hover:bg-danger/10 text-danger transition flex items-center gap-2"><AppIcon scale="sm" name="trash" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('common.delete') }}</button>
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
                <AppIcon scale="xl" class="text-danger" :name="confirmAction==='clear'?'sweep':confirmAction==='deleteYear'?'calendar':'trash'" />
              </div>
              <h3 id="watched-confirm-title" class="text-lg font-bold text-gray-800 mb-2">{{ confirmAction==='clear' ? tt('confirm.clearTitle') : confirmAction==='batchDelete' ? tt('confirm.batchDeleteTitleShort') : confirmAction==='deleteYear' ? tt('watched.deleteYear') : tt('confirm.deleteTitle') }}</h3>
              <p class="text-sm text-gray-500">
                <template v-if="confirmAction==='clear'">
                  <template v-if="clearScope==='year'">{{ tt('confirm.clearYearMessage', { year: yearDisplayName(selectedYear) }) }}</template>
                  <template v-else>{{ tt('confirm.clearAllMessage') }}</template>
                </template>
                <template v-else-if="confirmAction==='batchDelete'">{{ tt('confirm.batchDeleteMessageWatched', { count: confirmTarget }) }}</template>
                <template v-else-if="confirmAction==='deleteYear'">{{ tt('confirm.deleteYearMessage', { year: confirmTarget }) }}</template>
                <template v-else>{{ tt('confirm.deleteOneMessage', { name: confirmTarget }) }}</template>
              </p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button @click="showConfirmDialog=false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
              <button @click="confirmActionFn" class="btn-base btn-danger">{{ confirmAction==='clear' ? tt('confirm.confirmClear') : tt('confirm.confirmDelete') }}</button>
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
          <div class="relative glass rounded-2xl shadow-2xl w-[33rem] border border-white/40 pointer-events-auto app-dialog" ref="clearDialogRef" role="dialog" aria-modal="true" aria-labelledby="watched-clear-title">
            <!-- 正文与图二（批量删除确认）保持同一结构：只放图标 + 标题 + 说明，
                 动作按钮统一收进底部栏 —— 原来两个横向大长条按钮显得过重，
                 且与其它确认弹窗的按钮位置不一致。
                 大图标与同页删除确认弹窗同一写法（scale=xl + text-danger + flex 居中，
                 35px 实测）；图标用 sweep（扫帚）——与追番页/等番页的「清空」入口一致，
                 原先用 clear（垃圾桶形）与「删除」在视觉上难以区分（用户反馈过的点）。 -->
            <div class="px-6 py-5 text-center">
              <div class="mb-3 flex justify-center" aria-hidden="true">
                <AppIcon scale="xl" class="text-danger" name="sweep" />
              </div>
              <h3 id="watched-clear-title" class="text-lg font-bold text-gray-800 mb-2">{{ tt('clearScope.title') }}</h3>
              <p class="text-sm text-gray-500">{{ tt('clearScope.hint') }}</p>
            </div>
            <!-- 底部栏对齐同页删除确认弹窗的规范：flex 居中 + gap-3，按钮按语义取色 ——
                 主危险操作（清空所有）红底 btn-danger，次级操作（取消/清空当前年份）
                 中性描边 btn-neutral。按钮内文字永不折行（btn-base 的 white-space:nowrap），
                 容器 flex-wrap 兜底：日/英文案更长、一行放不下时整颗按钮换行居中，
                 而不是像旧 grid 等分那样把文字挤成两三行（修复前实测 en 文案折 3 行）。 -->
            <div class="clear-scope-actions px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button @click="showClearDialog=false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
              <button v-if="showClearYearButton" @click="doClearYear" class="btn-base btn-neutral">
                {{ tt('clearScope.clearYear', { year: yearDisplayName(selectedYear) }) }}
              </button>
              <button @click="doClearAll" class="btn-base btn-danger">
                {{ tt('clearScope.clearAll') }}
              </button>
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
                  <!-- 「支持的日期格式」这类用法说明改为标签气泡（虚线 + info 图标提示可悬浮），
                       输入框只留 placeholder 里的示例；校验错误与精度提示仍外显（见下）。 -->
                  <span class="inline-flex items-center gap-1 cursor-help"
                    v-tip="tt('record.dateFormatsHint')">{{ tt('moveWatched.date') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></span>
                  <button type="button" @click="dateManualInput=!dateManualInput" class="text-xs text-primary hover:text-primary-dark transition">{{ dateManualInput ? tt('record.useDatePicker') : tt('showDialog.manualInput') }}</button>
                </label>
                <input v-if="dateManualInput" v-model="form.watch_date" type="text" :placeholder="tt('moveWatched.datePlaceholder')"
                  :aria-label="tt('record.dateFormatsHint')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80"
                  :class="{'border-danger/50 ring-danger/20': formDateValidationError}" />
                <!-- 日期：自研面板（DatePicker）替代原生 input[type=date]。
                     原生控件只能表达完整日期，年 / 年月 / 年份范围精度会被迫切换手动输入；
                     新组件自带「精确到日 / 月 / 年」切换，粗精度值可在面板里原样保留与修改。
                     「手动输入」开关保留：它是文本 + validateDate 校验的第二条输入方式。 -->
                <DatePicker v-if="!dateManualInput" v-model="form.watch_date" :precision="formDatePrecision"
                  :placeholder="tt('moveWatched.datePlaceholder')"
                  :invalid="!!formDateValidationError" />
                <!-- 「精度降级」提示与校验错误都是**必须外显**的信息，保留原样。
                     只有「支持的日期格式」这串用法说明改为输入框气泡（见 aria-label）。 -->
                <p v-if="!dateManualInput && isCoarseDate(form.watch_date)" class="text-xs text-amber-600 mt-1">
                  {{ tt('record.coarseDateHint', { date: form.watch_date }) }}
                </p>
                <p v-if="formDateValidationError" class="text-xs text-danger mt-1">{{ formDateValidationError }}</p>
              </div>
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>{{ tt('moveWatched.time') }}</span>
                  <!-- 切换标签语义：必须显示「可切换到的另一个模式」（与日期切换同一规则）。
                       formShowTimePicker=false 时当前是时钟网格 → 标签显示「手动输入」；
                       =true 时当前是文本输入 → 标签显示「时钟选择」。
                       此前写反了（显示的是当前模式），用户点标签会得到与预期相反的控件。 -->
                  <button type="button" @click="formShowTimePicker=!formShowTimePicker" class="text-xs text-primary hover:text-primary-dark transition">{{ formShowTimePicker ? tt('showDialog.clockPicker') : tt('showDialog.manualInput') }}</button>
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
                  <button @click="formTime=''" class="btn-base btn-sm btn-neutral shrink-0">{{ tt('record.clearTime') }}</button>
                </div>
              </div>
              <div>
                <!-- 封面图 URL（用户早期要求的「番剧封面图，可参考 Bangumi 番组计划」）。
                     只做「粘贴直链 → 实时预览」，不在客户端调用 Bangumi API
                     （跨域 + 需要 UA + 限流，且本应用离线优先）。
                     预览 40×56（竖排海报 5:7）；URL 为空时整块不渲染。
                     加载失败换成占位图标（.is-failed 的虚线描边做弱提示），绝不出现浏览器裂图；
                     URL 一变就复位失败标记（见脚本里的 watch），改对链接即可恢复预览。 -->
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
                <input v-model="form.url" type="text" :placeholder="tt('record.urlPlaceholder')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
              <div v-if="form.url">
                <!-- 「等番没有集数，动态参数会原样拼到链接后面…」属控件用法说明 → 标签气泡 -->
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  <span class="inline-flex items-center gap-1 cursor-help"
                    v-tip="tt('showDialog.episodeTokenHint')">{{ tt('showDialog.urlParams') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></span>
                </label>
                <input v-model="form.url_params" type="text" :placeholder="tt('record.urlParamsPlaceholder')"
                  :aria-label="tt('showDialog.episodeTokenHint')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
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
              <button @click="showDialog=false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
              <button @click="saveForm" class="btn-base btn-primary disabled:opacity-40">{{ tt('common.save') }}</button>
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
              <!-- 「支持单个年份(2025)或年份范围(2014~2017)」原为标签下的灰字，改为标签气泡 -->
              <label class="block text-sm font-medium text-gray-700 mb-1">
                <span class="inline-flex items-center gap-1 cursor-help"
                  v-tip="tt('watched.yearLabelHint')">{{ tt('watched.yearLabel') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></span>
              </label>
              <input v-model="yearForm.year_label" type="text" :placeholder="tt('watched.yearLabelPlaceholder')"
                :aria-label="tt('watched.yearLabelHint')"
                class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showYearDialog=false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
              <button @click="saveYearForm" class="btn-base btn-primary">{{ tt('common.save') }}</button>
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
import { validateDate, extractYear, extractAllYears, compareDateKey, todayStr } from '../composables/useDatePicker'
import DatePicker from '../components/DatePicker.vue'
import { showToast } from '../composables/useToast'
import { setPageStats, setPageSelection, clearPageSelection, setPageActions, clearPageActions, setPageControls, clearPageControls } from '../composables/usePageStats'
import WatchedTopControls from './WatchedTopControls.vue'
import { openExternal } from '../composables/useEpisode'
import { placeContextMenu } from '../composables/useContextMenu'
import { focusFirstMenuItem, onMenuKeydown } from '../composables/useMenuKeyboard'
import { useDialogFocus } from '../composables/useDialogFocus'
import { useI18n } from '../composables/useI18n'
import { useErrorText } from '../composables/useErrorText'

const { tt } = useI18n()
const { errorText } = useErrorText()

const years = ref([])
const watchedList = ref([])
// 首帧数据是否已到：false 时渲染骨架行，避免把「加载中」误显示成「暂无已看记录」。
const listLoaded = ref(false)
const loadFailed = ref(false)
const selected = ref(null)
const selectedYear = ref('')

// ===== 年份选择 =====
// 视觉审计 A-01：年份下拉（触发钮 + Teleport 菜单）已迁入 WatchedTopControls
// （pageControls 顶栏渲染），本 view 只保留状态与数据逻辑。
// 菜单的开合/定位/外点与 Esc 关闭跟着 refs 走，所以也搬进了控件组件。

/**
 * 选择某年：切换后重新拉数据。
 * 注意：即使选的是当前已选中的年份也要重新拉——
 * 首次挂载时 selectedYear 可能已经是默认值但数据还没加载完，
 * 早退会让"再点一次当前年份"什么都不发生（测试里正是这个场景）。
 * 由 WatchedTopControls 的年份菜单项经 onPickYear 回调到这里。
 */
const pickYear = async (label) => {
  selectedYear.value = label
  await fetchData()
}

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

/** 「每页 N 条」菜单元素（Teleport 到 body，打开后用它实测宽高做精确定位） */
const pageSizeMenuEl = ref(null)
/**
 * 菜单 fixed 定位样式：默认向上展开（bottom 锚定，底边贴触发按钮上方）。
 * 视觉审计 A-02：打开时等菜单渲染出来用实测宽高重算 ——
 * 旧常量 MENU_W=200 比实测菜单宽（168/192）偏大，窄视口会把菜单往左多推；
 * 「上方放不下翻到下方」的翻转判断也必须用真实菜单高度，常量会随根字号/语言漂移。
 */
const pageSizeMenuStyle = ref({
  left: '0px',
  bottom: '0px',
  /*
   * 过渡方向变量（默认向上展开）：缩放原点在 bottom、起始位移向下（+6px）——
   * 视觉上就是「从下往上长出来」；翻到下方时改写为 top / -6px。
   */
  '--pop-origin-y': 'bottom',
  '--pop-from-y': '6px',
})

/**
 * 打开/关闭「每页 N 条」菜单。
 *
 * 菜单是 fixed 定位（为了脱离 .glass 的 backdrop root，让背景模糊生效），
 * 所以必须自己算坐标。默认向上展开（底边贴按钮上方 MARGIN 处）；
 * 上方放不下且下方放得下时翻到下方（兑现旧注释承诺、此前未实现的行为）；
 * 两头都放不下（视口矮于菜单+触发器）时按空间大的一侧放置并夹进视口，
 * 保证菜单顶边不越出视口（审计探针 h≤280 的越顶场景）。
 */
const togglePageSizeMenu = async (e) => {
  if (showPageSizeMenu.value) {
    showPageSizeMenu.value = false
    return
  }
  showPageSizeMenu.value = true
  const btn = e && e.currentTarget
  if (!btn) return
  const r = btn.getBoundingClientRect()
  const MARGIN = 8
  const vw = window.innerWidth
  const vh = window.innerHeight

  // 先按旧常量预算给一个初始位（菜单渲染前不空白），渲染后用实测尺寸校正
  let left = r.left
  if (left + 200 > vw - MARGIN) left = Math.max(MARGIN, vw - 200 - MARGIN)
  pageSizeMenuStyle.value = {
    minWidth: r.width + 'px', // 宽度贴内容且不小于触发器（右侧大留白，第二期用户反馈）
    left: left + 'px',
    bottom: (vh - r.top + MARGIN) + 'px',
    '--pop-origin-y': 'bottom',
    '--pop-from-y': '6px',
  }

  // 等菜单随 v-if 渲染出来（Teleport 到 body），再实测宽高精确定位
  await nextTick()
  const menu = pageSizeMenuEl.value
  if (!menu) return
  const mw = menu.offsetWidth
  const mh = menu.offsetHeight

  // 横向：左对齐触发按钮；右侧放不下就贴右边界（用实测宽，不再用偏大常量）
  if (left + mw > vw - MARGIN) left = Math.max(MARGIN, vw - mw - MARGIN)

  // 纵向：默认向上；上方放不下且下方放得下（或下方相对更宽裕）时翻到下方
  const spaceAbove = r.top - MARGIN
  const spaceBelow = vh - r.bottom - MARGIN
  if (spaceAbove >= mh) {
    // 上方放得下：维持向上展开（底边贴触发按钮上方 MARGIN 处）
    pageSizeMenuStyle.value = {
      left: left + 'px',
      bottom: (vh - r.top + MARGIN) + 'px',
      '--pop-origin-y': 'bottom',
      '--pop-from-y': '6px',
    }
  } else if (spaceBelow >= mh) {
    // 上方放不下、下方放得下：翻到下方展开（顶边贴触发按钮下方 MARGIN 处）
    pageSizeMenuStyle.value = {
      left: left + 'px',
      top: (r.bottom + MARGIN) + 'px',
      '--pop-origin-y': 'top',
      '--pop-from-y': '-6px',
    }
  } else if (spaceBelow > spaceAbove) {
    // 两头都放不下、下方相对更宽裕：向下并夹进视口底
    const top = Math.max(MARGIN, Math.min(r.bottom + MARGIN, vh - MARGIN - mh))
    pageSizeMenuStyle.value = {
      left: left + 'px',
      top: top + 'px',
      '--pop-origin-y': 'top',
      '--pop-from-y': '-6px',
    }
  } else {
    // 两头都放不下、上方相对更宽裕：向上但顶边夹进视口（改 top 锚定，靠近触发器且不越顶）
    const top = Math.max(MARGIN, r.top - MARGIN - mh)
    pageSizeMenuStyle.value = {
      left: left + 'px',
      top: top + 'px',
      '--pop-origin-y': 'bottom',
      '--pop-from-y': '6px',
    }
  }
}


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
/** A-33：部分勾选（非空但未全选）——表头勾选框显示半选态 */
const isPartiallyChecked = computed(() => !isAllChecked.value && checkedIds.value.length > 0 && paginatedList.value.some(item => checkedIds.value.includes(item.id)))

/**
 * 点击行首序号 → 切换该行选中态（首次点击顺带打开批量模式）。
 * 参数是整条 item 而非 idx：内部始终用 item.id，因为序号会随翻页/排序变化。
 */
const toggleCheckFromIndex = (item) => {
  if (!batchMode.value) batchMode.value = true
  toggleCheck(item.id)
}

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
    // 「每页 N 条」菜单：与等番页（RemainingView）同序次关闭，Esc 只关菜单不退批量模式
    if (showPageSizeMenu.value) { showPageSizeMenu.value = false; return }
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


/**
 * 反选：把当前页已选的取消、未选的选中。
 * 只作用于**当前页**（与 toggleSelectAll 一致），不跨页翻转 ——
 * 跨页翻转会让用户看不到哪些被选中，容易误删。
 */
const invertSelection = () => {
  const pageIds = paginatedList.value.map(i => i.id)
  const cur = new Set(checkedIds.value)
  for (const id of pageIds) {
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

const openClearDialog = () => {
  showClearDialog.value = true
}

/**
 * 年份哨兵 → 用户可读名称（视觉审计 A-17）。
 * selectedYear 还可能是内部哨兵 '__all__' / '__unclassified__' 或空串（无年份组），
 * 直接插值进 i18n 会把内部值透给用户（曾显示「清空当前年份 (__all__)」、
 * toast「__all__ 已清空」），所以任何要把 selectedYear 展示给用户的地方都必须
 * 先过这里映射成「全部年份 / 未分类」。
 */
const yearDisplayName = (label) => {
  if (!label || label === '__all__') return tt('watched.allYears')
  if (label === '__unclassified__') return tt('watched.unclassified')
  return label
}
/**
 * 「清空当前年份」按钮只在选中真实年份或未归类时出现（视觉审计 A-17）：
 * '__all__' 下 yearItems = 全部记录，该按钮实删所有年份的已看记录，
 * 文案却宣称只清当前年份 —— 语义误导且不可撤销。旁边本就有诚实的
 * 「清空所有」按钮，直接隐藏即可，不新增第四个按钮。
 * 空串（无任何年份组）时该按钮必然空操作、标签同样失真，一并隐藏。
 */
const showClearYearButton = computed(() =>
  !!selectedYear.value && selectedYear.value !== '__all__')

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
const form = ref({ name: '', cover_url:'', watch_date: todayStr(), url:'', url_params:'', notes:'', tags:'' })

// ========== 封面图 ==========
/**
 * 两个互不干扰的失败标记：
 *   · formCoverFailed —— 弹窗实时预览的当前 URL 加载失败（URL 一变就复位，见 watch）
 *   · rowCoverFailed  —— 表格各行的「哪一条封面 404 了」，按 id 记录：
 *     记在列表上而不是每行一个组件状态，只影响那一个 id，不误伤别的行。
 * 两者都只导致「不渲染 <img>」，因此永远不会出现浏览器的裂图图标。
 */
const formCoverFailed = ref(false)
const rowCoverFailed = ref({})
/** 去掉首尾空白后的封面地址：从聊天/网页复制时常带空格或换行，原样塞给 <img> 会 404 */
const trimmedCoverUrl = computed(() => String(form.value.cover_url ?? '').trim())
watch(trimmedCoverUrl, () => { formCoverFailed.value = false })
/** 记录某行的封面加载失败（只影响该 id，不误伤其它行） */
const markRowCoverFailed = (id) => { rowCoverFailed.value = { ...rowCoverFailed.value, [id]: true } }
/**
 * 清除某行的失败标记：保存成功后调用。
 * 否则用户把写错的链接改对、保存也成功，行上却仍挂着上一版 URL 的失败标记，
 * 封面再也不出现 —— 「改了没反应」比一开始就没封面更让人困惑。
 */
const clearRowCoverFailed = (id) => {
  if (!rowCoverFailed.value[id]) return
  const next = { ...rowCoverFailed.value }
  delete next[id]
  rowCoverFailed.value = next
}
/** 落库前统一去空白（与预览用的是同一个规则，保证「看到的」与「存下的」一致） */
const normalizeCoverUrl = (u) => String(u ?? '').trim()

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
const contextMenuRef = ref(null)
// A-34：Esc 关闭后把焦点还给触发行（行有 tabindex=-1，可编程聚焦）
let contextMenuTriggerEl = null
const restoreMenuFocus = (trigger) => nextTick(() => {
  trigger?.focus?.()
  if (!trigger || document.activeElement !== trigger) pageRootRef.value?.focus?.()
})
const onContextMenuKeydown = (event) => onMenuKeydown(
  event, closeContextMenu, () => restoreMenuFocus(contextMenuTriggerEl))
const openContextMenu = (e, item) => {
  selected.value = item
  contextMenuTriggerEl = e?.currentTarget?.closest?.('tr') || e?.target?.closest?.('tr') || null
  // 贴边/贴底时自动翻转，避免菜单被视口裁掉
  placeContextMenu(contextMenu, e, { item })
  // A-34：打开即聚焦第一项，键盘可直接 ↑↓ 选择
  nextTick(() => focusFirstMenuItem(contextMenuRef.value))
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
      else showToast(errorText(res.data, tt, 'toast.batchDeleteFailed'),'error')
    } catch { showToast(tt('toast.batchDeleteFailed'),'error') }
  } else if (confirmAction.value === 'clear') {
    try {
      if (clearScope.value === 'year') {
        // 清空当前年份
        const yearItems = watchedList.value.map(i => i.id)
        if (yearItems.length === 0) { showToast(tt('toast.noRecordThisYear'),'warning'); return }
        const res = await batchApi.batchDeleteWatched(yearItems)
        if (res.data.success) { showToast(tt('toast.yearCleared', { year: yearDisplayName(selectedYear.value) })); selected.value=null; batchMode.value=false; checkedIds.value=[]; await fetchData() }
        else showToast(errorText(res.data, tt, 'toast.clearFailed'),'error')
      } else {
        // 清空所有
        const res = await batchApi.clearWatched()
        if (res.data.success) {
          await batchApi.clearWatchedYears()
          showToast(tt('toast.allWatchedCleared')); selected.value=null; batchMode.value=false; checkedIds.value=[]; await fetchYears(); await fetchData()
        }
        else showToast(errorText(res.data, tt, 'toast.clearFailed'),'error')
      }
    } catch { showToast(tt('toast.clearFailed'),'error') }
  } else if (confirmAction.value === 'deleteYear') {
    const y = years.value.find(y => y.year_label === confirmTarget.value)
    if (!y) return
    try {
      const res = await watchedYearsApi.delete(y.id)
      if (res.data.success) { showToast(tt('toast.yearDeleted')); await fetchYears(); if (years.value.length > 0) { selectedYear.value = years.value[0].year_label } else { selectedYear.value = '' } await fetchData() }
      else showToast(errorText(res.data, tt, 'toast.delFailed'),'error')
    } catch { showToast(tt('toast.delFailed'),'error') }
  } else if (confirmAction.value === 'delete') {
    if (!selected.value) return
    try {
      const res = await watchedApi.delete(selected.value.id)
      if (res.data.success) { showToast(tt('toast.deleted')); selected.value=null; await fetchData() }
      else showToast(errorText(res.data, tt, 'toast.delFailed'),'error')
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
    listLoaded.value = true
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
  finally { listLoaded.value = true }
}

const selectItem = (item) => { selected.value = item }

// 年份 / 年月 / 年份范围精度的日期无法表示在 type="date" 里
const isCoarseDate = (value) => {
  const v = String(value || '').trim()
  if (!v) return false
  return !/^\d{4}\/\d{1,2}\/\d{1,2}/.test(v)
}

/**
 * 供 DatePicker 的默认精度：跟着当前值的实际精度走。
 * 这样编辑一条「2025/07」的旧记录时，面板打开就是「精确到月」——
 * 不选日就不会把粗精度值降级成具体日期（原生 type=date 时代只能靠切手动输入规避）。
 */
const formDatePrecision = computed(() => {
  const v = String(form.value.watch_date || '').trim()
  if (!v) return 'day'
  if (/^\d{4}$/.test(v) || /^\d{4}\s*~\s*\d{4}$/.test(v)) return 'year'
  if (/^\d{4}\/\d{1,2}$/.test(v)) return 'month'
  return 'day'
})

// 点击表格行和交互元素以外的区域时取消选中（document 级监听，覆盖页面留白）
const onDocClick = (e) => {
  // 「每页 N 条」菜单：点菜单外任意位置关闭（第二期审计 A-02 复核项）。
  // 与 RemainingView 的 onDocClick 同构。原先靠 .glass 卡内的 fixed 遮罩，
  // 被 backdrop-filter 包含块裁成分页卡大小（实测 1630×80），点表格等
  // 卡外区域关不掉；且本函数下方有 tbody tr 早退，分支必须放在最前。
  // 按钮自身由 togglePageSizeMenu 处理，closest 白名单豁免菜单/触发器内部点击。
  if (showPageSizeMenu.value && !e.target.closest('.page-size-menu, .page-size-trigger')) {
    showPageSizeMenu.value = false
  }
  if (editing.value && !e.target.closest('input, select, textarea')) {
    cancelEdit()
  }
  if (e.target.closest('tbody tr, button, input, select, textarea, a, .app-dialog, .context-menu, .selectable-text')) return
  selected.value = null
  // 点表格外的空白区域 → 清空批量勾选并退出批量模式（用户要求）
  if ((batchMode.value || checkedIds.value.length > 0)
      && !e.target.closest('table, .pager-btn, .page-size-trigger, .page-size-menu, .glass .toolbar-enter, .app-dialog, .context-menu, .sel-anim-wrap')) {
    checkedIds.value = []
    batchMode.value = false
  }
}

// ========== 内联编辑 ==========
// 视觉审计 A-64：校验失败（空名称/非法日期）时除 toast 外，给正在编辑的输入框
// 错误描边（.is-invalid，见 style.css）并置 aria-invalid；重新输入即解除。
const editInvalid = ref(false)
watch(editValue, () => { if (editInvalid.value) editInvalid.value = false })

const startEdit = (item, field) => {
  editing.value = { id: item.id, field }
  editValue.value = String(item[field] ?? '')
  editInvalid.value = false
}

/**
 * 需求 A：三张番单页统一的双击规则（已看历史页）。
 *
 *   1. 双击行内可编辑字段（作品名称 / 观看日期 / 链接 / 备注）→ 该字段行内编辑；
 *      空值字段同样进入（可直接填）。
 *   2. 双击行内空白（序号列之外的行 padding、行尾留白等）→ 打开完整编辑弹窗。
 *   3. 批量模式下双击一律无效。
 *
 * 序号列（#）只读，双击它属于「空白」语义 → 冒泡到 tr 打开弹窗。
 */
const onFieldDblclick = (item, field) => {
  if (batchMode.value) return
  startEdit(item, field)
}

const onRowDblclick = (e) => {
  if (batchMode.value) return
  if (e.target.closest('.editable-cell, button, input, select, textarea, a, [role="checkbox"]')) return
  const id = Number(e.currentTarget?.dataset?.rowId)
  const item = watchedList.value.find(r => r.id === id)
  if (!item) return
  selected.value = item
  openEditDialog()
}

/** 表格里可编辑单元格的键盘等价路径（选中该行后 Enter / Space 进入编辑） */
const editCellProps = (item, field) => {
  const isEditing = editing.value?.id === item.id && editing.value?.field === field
  if (batchMode.value || isEditing || selected.value?.id !== item.id) return {}
  return { role: 'button', tabindex: '0' }
}

const onCellKeydown = (e, item, field) => {
  if (e.target !== e.currentTarget) return
  if (!selected.value || selected.value.id !== item.id || batchMode.value) return
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  startEdit(item, field)
}

const cancelEdit = () => { editing.value = null; editInvalid.value = false }

const saveEdit = async () => {
  if (!editing.value) return
  const token = editing.value
  const { id, field } = token
  let val = editValue.value
  if (field === 'name') {
    val = val.trim()
    if (!val) { editInvalid.value = true; showToast(tt('toast.pleaseEnterWorkName'), 'warning'); return }
  }
  if (field === 'watch_date') {
    const validation = validateDate(val)
    if (!validation.valid) { editInvalid.value = true; showToast(validation.error, 'warning'); return }
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
    } else { showToast(errorText(res.data, tt, 'toast.updateFailed'),'error') }
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
      } else { showToast(errorText(res.data, tt, 'toast.addFailed'),'error') }
    } else {
      const res = await watchedYearsApi.update(editingYearId.value, yearForm.value)
      if (res.data.success) {
        showToast(tt('toast.yearUpdated'))
        showYearDialog.value = false
        await fetchYears()
        selectedYear.value = yearForm.value.year_label
        await fetchData()
      } else { showToast(errorText(res.data, tt, 'toast.updateFailed'),'error') }
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
    name:'', cover_url:'', watch_date: isRealYear(selectedYear.value) ? selectedYear.value : todayStr(),
    url:'', url_params:'', notes:'', tags:''
  }
  // 用户要求：已看页「添加记录」的**日期和时间都要默认填充**。
  // 日期已由上方 watch_date 填充；这里补时间 = 当前时刻（HH:mm）。
  // 注意：其余入口（等番的添加、追番的移至已看之外）一律不预填日期。
  {
    const d = new Date()
    formTime.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  formDateValidationError.value = ''
  formCoverFailed.value = false
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
  // 过去这里在「年 / 年月 / 年份范围」精度时自动切手动输入，因为原生 type="date"
  // 表达不了粗精度。DatePicker 支持精度切换，可以留在面板里编辑，不再强行切走；
  // 仅当值本身连 validateDate 都不认（脏数据）时才退回手动输入。
  dateManualInput.value = !!watchDate.trim() && !validateDate(watchDate.split(' ')[0]).valid
  const parts = watchDate.split(' ')
  const datePart = parts[0] || ''
  const timePart = parts.length > 1 ? parts.slice(1).join(' ') : ''
  form.value = {
    name: selected.value.name,
    // 编辑路径同样要回填 cover_url：漏掉它，保存时 update 的字段白名单里
    // 这个字段就永远不会被带上，用户改封面等于白改。
    cover_url: selected.value.cover_url || '',
    watch_date: datePart,
    url: selected.value.url || '',
    url_params: selected.value.url_params || '',
    notes: selected.value.notes || '',
    tags: selected.value.tags || ''
  }
  formCoverFailed.value = false
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
  // 封面地址去空白后再落库：从聊天/网页复制来的链接常带首尾空格或换行
  form.value.cover_url = normalizeCoverUrl(form.value.cover_url)
  try {
    if (dialogMode.value === 'add') {
      const res = await watchedApi.add(form.value)
      if (res.data.success) { showToast(tt('toast.historyAdded')); showDialog.value=false; await fetchYears(); await fetchData() }
      else showToast(errorText(res.data, tt, 'toast.addFailed'),'error')
    } else {
      const targetId = selected.value.id
      const res = await watchedApi.update(targetId, form.value)
      if (res.data.success) {
        // 清掉这一行的封面失败标记：用户改对了链接，重新渲染时要能重新尝试
        clearRowCoverFailed(targetId)
        showToast(tt('toast.historyUpdated')); showDialog.value=false; selected.value=null; await fetchYears(); await fetchData()
      }
      else showToast(errorText(res.data, tt, 'toast.updateFailed'),'error')
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


// 计数同步到顶栏（用户要求：本年/总计放到页面标题旁边，不占卡片内一行）
watch(
  [yearCount, totalCount],
  ([yc, tc]) => {
    setPageStats('/watched', [
      { text: tt('watched.thisYear', { count: yc }), tone: 'primary' },
      { text: tt('watched.total', { count: tc }), tone: 'neutral' },
    ])
  },
  { immediate: true },
)


/** 封面放大预览节点（单例，只在悬浮期间存在） */
let coverZoomEl = null

/**
 * 鼠标移入封面缩略图 → 在右侧浮出放大版。
 *
 * 为什么挂到 body：卡片的 .glass 带 backdrop-filter，会成为 position:fixed 的
 * 包含块，直接写在页面里会被按卡片坐标定位（项目已踩过这个坑）。
 */
function showCoverZoom(e, url) {
  if (!url) return
  hideCoverZoom()

  const el = document.createElement('div')
  el.className = 'cover-zoom'
  const img = document.createElement('img')
  img.src = url
  img.alt = ''
  img.decoding = 'async'
  el.appendChild(img)
  document.body.appendChild(el)
  coverZoomEl = el

  // 尺寸：160×224（5:7 海报比例）
  const W = 160
  const H = 224
  const GAP = 10
  const MARGIN = 8

  const r = e.currentTarget.getBoundingClientRect()
  let left = r.right + GAP
  // 右侧放不下 → 翻到左侧
  if (left + W > window.innerWidth - MARGIN) left = r.left - W - GAP
  if (left < MARGIN) left = MARGIN
  // 纵向以缩略图中心为基准，夹进视口
  let top = r.top + r.height / 2 - H / 2
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - H - MARGIN))

  el.style.left = left + 'px'
  el.style.top = top + 'px'
  el.style.opacity = '0'
  el.style.transform = 'scale(0.96)'
  requestAnimationFrame(() => {
    if (!coverZoomEl) return
    el.style.opacity = '1'
    el.style.transform = 'scale(1)'
  })
}

/** 鼠标移出 → 销毁预览 */
function hideCoverZoom() {
  if (!coverZoomEl) return
  coverZoomEl.remove()
  coverZoomEl = null
}

const ROUTE_KEY = '/watched'

/**
 * 顶栏内容控件（视觉审计 A-01：第一卡的年份选择 + 搜索 + 标签筛选迁入顶栏）。
 *
 * 与 pageActions 的 watch 同一模式：immediate 写入、依赖变化重写。
 * 控件组件（WatchedTopControls）只做渲染入口 + 年份菜单的纯 UI 机制；
 * selectedYear / searchQuery / tagFilter 的单一来源仍是本 view ——
 * props 带当前值，回调写回，等价于 v-model / 事件。
 * 组件不必在此 markRaw：setPageControls 写入点会统一 markRaw。
 */
watch(
  [searchQuery, tagFilter, selectedYear, () => sortedYears.value],
  () => {
    setPageControls(ROUTE_KEY, [
      {
        key: 'watched-controls',
        component: WatchedTopControls,
        props: {
          search: searchQuery.value,
          tagFilter: tagFilter.value,
          selectedYear: selectedYear.value,
          years: sortedYears.value,
          'onUpdate:search': (v) => { searchQuery.value = v },
          'onUpdate:tagFilter': (v) => { tagFilter.value = v },
          'onPickYear': (label) => pickYear(label),
          'onAddYear': () => openAddYearDialog(),
          'onEditYear': () => editYearLabel(),
          'onDeleteYear': () => openDeleteYearDialog(),
        },
      },
    ])
  },
  { immediate: true, deep: true },
)

/**
 * 顶栏操作按钮。
 *
 * 用户要求把工具栏按钮从页面内移到顶栏；年份 CRUD 已收进年份下拉菜单，
 * 所以这里只有「添加记录 / 清空列表 / 批量操作 / 选中项操作」。
 */
watch(
  [() => batchMode.value, () => checkedIds.value.length, () => isAllChecked.value, () => selected.value],
  () => {
    const items = [
      { key: 'add', icon: 'plus', label: tt('watched.addRecord'), onClick: openAddDialog },
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
    items.push({ key: 'clear', icon: 'sweep', label: tt('watched.clearList'), onClick: openClearDialog, danger: true })
    setPageActions('/watched', items)
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
        ...(sel.watch_date ? [{ text: String(sel.watch_date), tone: 'neutral' }] : []),
      ],
    })
  },
  { immediate: true, deep: true },)

onUnmounted(() => {
  clearPageSelection(ROUTE_KEY)
  clearPageActions(ROUTE_KEY)
  // 顶栏内容控件随页卸载清空，避免残留（App.vue 的 route watch 还有第二层兜底）
  clearPageControls(ROUTE_KEY)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', onDocClick)
})

// ========== 工具栏离场元素「原地淡出」定位（说明见 WatchingView.vue） ==========
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
/* 见 WatchingView.vue 的完整说明。
   两块规则必须成对：leave-active 脱离文档流（否则后面的按钮逐帧无位移、
   -move 不会触发），-wrap 提供定位参照（离场元素才钉得回原位）。
   只作用于工具栏直接子元素，「当前选中」信息行的 <transition name="sel-anim">
   不能被绝对定位。 */
.sel-anim-wrap > .sel-anim-leave-active {
  position: absolute;
  pointer-events: none;
  /* 离场曲线与 style.css 的 .sel-anim-leave-active 一致：iOS --ease-exit 0.22s */
  transition: opacity 0.22s var(--ease-exit, cubic-bezier(0.4, 0, 1, 1)),
    transform 0.22s var(--ease-exit, cubic-bezier(0.4, 0, 1, 1));
}

.sel-anim-wrap {
  position: relative;
}

/* 表格单元格文字色：浅色模式沿用原灰阶，深色模式必须显式提亮。
   原因：全局 `.dark .text-gray-600` 只到 #94a3b8（压深玻璃 4.25:1）、
   `.dark .text-gray-400` 只到 #7c8ba5（3.16~3.47:1），都不足 4.5:1。 */
.cell-date {
  color: #4b5563;
}

.cell-notes {
  color: #6b7280;
}

.dark .cell-date {
  color: #cbd5e1;
}

.dark .cell-notes {
  color: #a9b6cc;
}

/* 视觉审计 A-12：深色下序号列与分页省略号沿用全局 .dark .text-gray-400(#7c8ba5)
   在深色斑马行上只有 3.4~4.28:1（even 亮档最差）。仿 .cell-date/.cell-notes 的
   显式终值做法提亮到 #cbd5e1（与 .cell-date 深色终值同档；序号可点击，取比
   #a9b6cc 更亮的一档以扛壁纸透色的亮底轮次）；!important 压过全局
   `.dark .text-gray-400` 的 !important（此处特异性更高）。
   cell-index-num 只加在未勾选分支，勾选态仍走 text-primary。 */
.dark .cell-index-num {
  color: #cbd5e1 !important;
}

.dark .pager-ellipsis {
  color: #cbd5e1 !important;
}

/* 「作品名称 + 标签」同排：标签紧跟名称右边（不被推到列最右侧）。
   名称用 flex:0 1 auto + ellipsis：名称长时先截断名称，标签保持完整；
   标签用 flex:0 0 auto：自己不被压扁，放不下时靠容器的 overflow 裁掉。
   无标签时只剩名称，行高与其它行完全一致（标签绝不另起一行）。
   封面缩略图也在这条 flex 行里、位于名称最左（.cover-thumb--row，几何定义见 style.css）：
   它是 flex:0 0 auto 的固定块，因此绝不会被名称的省略号逻辑挤压变形。 */
.name-with-tags {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: nowrap;
  overflow: hidden;
  /* 表格列宽内容自适应（table-layout:auto）下，本块的固有宽度会成为名称列的
     min-content —— 长名称会把整张表撑到与最长名称等宽（768px 实测表宽 1173px、
     名称列不截断）。width:0 让固有贡献为 0，min-width:100% 保证实际渲染仍铺满
     单元格；名称列于是收缩为「剩余宽度」，长名称由内部 .truncate 省略号收尾。 */
  width: 0;
  min-width: 100%;
}
/* 行首元素（封面 / 占位槽）与表头图标对齐：由 style.css 里
   table td.editable-cell 的 padding-left 统一负责，此处不再单独补偿。 */

.name-with-tags > .text-sm {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-with-tags > .item-tags {
  flex: 0 0 auto;
}

/* 封面缩略图在行内的对齐：与文字基线居中对齐（table cell 默认 vertical-align: middle
   对 img 不生效，靠 flex 的 align-items:center 解决），并固定不被压缩。 */
.name-with-tags > .cover-thumb--row {
  flex: 0 0 auto;
  align-self: center;
}


/* 封面放大预览：挂到 body 的固定浮层，与侧栏气泡同一套动效语言 */
:global(.cover-zoom) {
  position: fixed;
  z-index: 140;
  width: 160px;
  height: 224px;
  border-radius: 0.625rem;
  overflow: hidden;
  pointer-events: none;
  background: rgb(255 255 255 / 0.9);
  border: 1px solid rgb(255 255 255 / 0.5);
  box-shadow: 0 16px 48px rgba(31, 38, 135, 0.28), 0 4px 12px rgba(0, 0, 0, 0.12);
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
:global(.cover-zoom img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
:global(.dark .cover-zoom) {
  background: rgb(26 20 48 / 0.9);
  border-color: rgb(255 255 255 / 0.14);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4);
}
</style>
