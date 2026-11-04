<template>
  <div ref="pageRootRef" class="space-y-5" tabindex="-1">
    <!-- 视觉审计 A-01：原「第一卡」（搜索框 + 标签筛选）已整卡迁入顶栏 ——
         搜索与 TagFilter 经 pageControls 注册（见下方 watch），由 App.vue 顶栏渲染；
         状态（searchQuery/tagFilter）与过滤逻辑仍在本 view。正文不再保留这张卡。 -->
    <!-- 「已选择 N 项」已移到顶栏（见 setPageSelection 的批量分支） -->

    <!-- 列表视图 -->
    <!-- 拖放监听挂在整个表格容器：tbody 底边恰好等于末行底边，表格下方无任何可放置区，
         只挂 tbody 会导致「拖到末行之下」永远无法命中。挂容器后含末行下方空白均可响应。 -->
    <div ref="tableWrapRef" class="tbl-scroll glass rounded-2xl shadow-lg border border-white/30 overflow-hidden"
      @dragover="onTableDragOver"
      @drop="onTableDrop"
      @dragleave="onTableDragLeave">
      <!-- 需求 B：表格卡片**不再**自带「☰ 番剧名称 / 共 N 条」标题行。
           下面紧跟着的 <thead> 已经是完整的列名（番剧名称/预计日期/链接/备注），
           再叠一个伪标题只是重复占一行高度；「共 N 条」计数由 setPageStats('/remaining', …)
           写入顶栏（视觉审计 A-01 后第一卡整体迁入顶栏，页面内不再有标题卡）。 -->
      <table class="record-table">
        <colgroup>
        <col v-if="batchMode" class="col-check" />
        <col class="col-index" />
        <col class="col-name" />
        <col class="col-date" />
        <col class="col-url" />
        <col class="col-notes" />
        <col class="col-tail" />
        </colgroup>
        <thead>
          <tr class="text-sm font-bold border-b border-white/20">
            <th v-if="batchMode" class="text-center px-2 py-2.5 text-primary-dark font-bold cursor-pointer select-none" @click="toggleSelectAll">
              <!-- A-33：补半选态。此前 aria-checked 只有 true/false 二值、视觉也只有
                   「全选对勾 / 空白」两种，勾 2/5 与 0 勾选长得一模一样，用户只能靠
                   顶栏「批量删除 (N)」推断。现在部分勾选 = aria-checked="mixed" +
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
            <!-- 序号列：当前页内的显示顺序（1 起）。点击它即可选中该行，
                 不需要先点「批量选择」。序号只是显示值，内部一律用 item.id 记录，
                 翻页 / 排序 / 搜索后不会错位。 -->
            <th class="text-center px-2 py-2.5 text-primary-dark font-bold whitespace-nowrap w-[4.5rem]">#</th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold cursor-pointer select-none hover:bg-primary/5 transition"
              tabindex="0" role="button" :aria-sort="sortField==='name'?(sortOrder==='asc'?'ascending':'descending'):'none'"
              @click="toggleSort('name')" @keydown.enter.prevent="toggleSort('name')" @keydown.space.prevent="toggleSort('name')">
              <AppIcon scale="sm" name="sparkle" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('remaining.colName') }} <AppIcon scale="xs" class="inline-block align-middle ml-0.5" v-if="sortField==='name'" :name="sortOrder==='asc'?'arrowUp':'arrowDown'" />
            </th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold cursor-pointer select-none hover:bg-primary/5 transition whitespace-nowrap"
              tabindex="0" role="button" :aria-sort="sortField==='expected_date'?(sortOrder==='asc'?'ascending':'descending'):'none'"
              :title="tt('remaining.colDate')"
              @click="toggleSort('expected_date')" @keydown.enter.prevent="toggleSort('expected_date')" @keydown.space.prevent="toggleSort('expected_date')">
              <!-- 日期列的格式说明（原空态副说明「支持: 年月(2025/07)、完整日期…」）
                   改为列头文字的悬浮气泡：说明归到它解释的那一列，空态只留主文案。
                   th 自身再补 title（视觉审计 A-37）：极端字号下万一截断仍有全称兜底；
                   en 文案已从「Expected Date」缩短为「Due Date」，配合 .col-date
                   8.5rem→9rem（style.css）三档视口实测均不再截断。 -->
              <AppIcon scale="sm" name="calendar" /> <span
                class="inline-flex items-center gap-1 cursor-help"
                v-tip="tt('remaining.dateFormatsHint')">{{ tt('remaining.colDate') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></span> <AppIcon scale="xs" class="inline-block align-middle ml-0.5" v-if="sortField==='expected_date'" :name="sortOrder==='asc'?'arrowUp':'arrowDown'" />
            </th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold whitespace-nowrap"><AppIcon scale="sm" name="link" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('remaining.colUrl') }}</th>
            <th class="text-left px-3 py-2.5 text-primary-dark font-bold whitespace-nowrap"><AppIcon scale="sm" name="note" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('remaining.colNotes') }}</th>
          </tr>
        </thead>
        <tbody ref="tbodyRef">
          <tr v-if="!listLoaded" class="record-skeleton-row">
            <td :colspan="batchMode ? 7 : 6" class="py-6">
              <div class="record-skeleton" aria-hidden="true">
                <span class="record-skeleton-bar" v-for="n in 6" :key="n" :style="{ width: (88 - n * 8) + '%' }"></span>
              </div>
              <p class="sr-only">{{ tt('common.loading') }}</p>
            </td>
          </tr>
          <tr v-else-if="paginatedList.length === 0">
            <td :colspan="batchMode ? 7 : 6" class="py-10">
              <!-- 空态三段式：图标 + 主文案 + 副说明。
                   副说明这里原本是「支持: 年月(2025/07)、完整日期…」——那是**表格日期列**的格式说明，
                   不是引导动作，已移到表头「预计日期」的悬浮气泡上；空态只留主文案。 -->
              <div class="empty-state">
                <AppIcon scale="xl" name="emptyBox" class="empty-state-icon" />
                <p class="empty-state-title">{{ searchQuery ? tt('watched.emptyNoMatch') : tt('remaining.emptyTitle') }}</p>
              </div>
            </td>
          </tr>
          <tr v-for="(item, idx) in paginatedList" :key="item.id"
            :data-row-index="absoluteIndexOf(item)"
            :data-row-id="item.id"
            tabindex="-1"
            class="transition-all duration-200 border-b border-white/10 list-item group"
            :class="[
              {
                'is-checked': batchMode && checkedIds.includes(item.id),
                'is-selected': !batchMode && selected?.id === item.id,
                'is-odd': idx % 2 === 0,
              },
              canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
              dragIndex >= 0 && absoluteIndexOf(item) === dragIndex ? 'opacity-40' : '',
              dragOverIndex >= 0 && absoluteIndexOf(item) === dragOverIndex && absoluteIndexOf(item) !== dragIndex
                ? 'ring-2 ring-primary/60 ring-inset' : ''
            ]"
            :draggable="canDrag"
            @dragstart="onDragStart($event, absoluteIndexOf(item))"
            @dragover="onDragOver($event, absoluteIndexOf(item))"
            @dragleave="onDragLeave(absoluteIndexOf(item))"
            @drop="onDrop($event, absoluteIndexOf(item))"
            @dragend="onDragEnd"
            @click="batchMode ? toggleCheck(item.id) : selectItem(item)"
            @dblclick="onRowDblclick($event, item)"
            @contextmenu.prevent="!batchMode && openContextMenu($event, item)"
            @mousedown.middle.prevent="openItemLink(item)">
            <td v-if="batchMode" class="text-center px-2 py-2.5" @click.stop="toggleCheck(item.id)" @dblclick.stop>
              <div role="checkbox" tabindex="0" :aria-checked="checkedIds.includes(item.id) ? 'true' : 'false'"
                :aria-label="tt('card.checkLabel', { name: item.name })"
                @keydown.enter.prevent="toggleCheck(item.id)" @keydown.space.prevent="toggleCheck(item.id)"
                class="w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-all mx-auto"
                :class="checkedIds.includes(item.id) ? 'bg-primary border-primary' : 'border-gray-300 bg-white/80 hover:border-primary'">
                <svg v-if="checkedIds.includes(item.id)" class="w-3 h-3 text-white" fill="none" stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </td>
            <!-- 序号：点击即切换该行的选中态（无需先点「批量选择」）。
               用 idx+1 显示，用 item.id 记录 —— 序号会随翻页/排序变化，id 不会。 -->
          <td class="text-center px-2 py-2.5 cursor-pointer select-none"
            @click.stop="toggleCheckFromIndex(item)"
            @dblclick.stop>
            <span class="text-xs font-mono tabular-nums transition-colors"
              :class="checkedIds.includes(item.id) ? 'text-primary font-bold' : 'text-gray-400 hover:text-primary cell-index-num'">{{ (currentPage - 1) * pageSize + idx + 1 }}</span>
          </td>
          <td class="px-3 py-2.5 editable-cell" v-bind="editCellProps(item, 'name')"
              @dblclick.stop="onFieldDblclick(item, 'name')"
              @keydown="onCellKeydown($event, item, 'name')">
              <input v-if="editing?.id===item.id&&editing?.field==='name'" v-model="editValue"
                :aria-label="tt('card.editNameLabel', { name: item.name })"
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
                     （html:not(.dark) tr.group:hover .name-with-tags > .text-sm），
                     原 group-hover:text-primary 在 auto 取色下对比仅 1.9~2.5:1。 -->
                <span class="text-sm font-semibold text-gray-800 transition-colors truncate">{{ item.name }}</span>
                <ItemTags v-if="item.tags" :tags="item.tags" :max="3" />
              </div>
            </td>
            <td class="px-3 py-2.5 editable-cell" v-bind="editCellProps(item, 'expected_date')"
              @dblclick.stop="onFieldDblclick(item, 'expected_date')"
              @keydown="onCellKeydown($event, item, 'expected_date')">
              <input v-if="editing?.id===item.id&&editing?.field==='expected_date'" v-model="editValue"
                :aria-label="tt('card.editDateLabelShort', { name: item.name })"
                :aria-invalid="editInvalid ? 'true' : null"
                :class="{ 'is-invalid': editInvalid }"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full"
                :placeholder="tt('remaining.datePlaceholder')" autofocus />
              <span v-else class="cell-date text-sm truncate block">{{ item.expected_date || '-' }}</span>
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
                class="text-xs text-primary hover:text-primary-dark truncate block">{{ item.url || 'bgm.tv' }}</a>
            </td>
            <td class="px-3 py-2.5 editable-cell" v-bind="editCellProps(item, 'notes')"
              @dblclick.stop="onFieldDblclick(item, 'notes')"
              @keydown="onCellKeydown($event, item, 'notes')">
              <input v-if="editing?.id===item.id&&editing?.field==='notes'" v-model="editValue"
                :aria-label="tt('card.editNotesLabel', { name: item.name })"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full" autofocus />
              <span v-else class="cell-notes text-sm truncate block">{{ item.notes || '-' }}</span>
            </td>
            <!-- 需求 A：行的「空白区域」。
                 本表四列全是可编辑字段（名称/日期/链接/备注），整行没有任何非字段空白，
                 用户「双击行空白处打开编辑弹窗」就无处可点。这里补一个占位格：
                 无内容、不可编辑、aria-hidden，只负责吃掉行尾留白并让 dblclick 冒泡到 tr。
                 加在末尾不影响既有列索引断言（测试取 td[0..3]）。 -->
            <!-- 占位格必须真正 0 宽：px-1 的左右内距会撑出 7px，把备注列挤窄、右侧露底 -->
              <td class="p-0 py-2.5 w-0" aria-hidden="true"></td>
          </tr>
        </tbody>
      </table>
      <!-- 末尾放置区：表格最后一行紧贴容器底边，指针一越过末行就离开容器、
           导致「拖到末尾」总是失败。拖动时在此处补一条可放置带，命中即移到末尾。 -->
      <div v-if="dragIndex >= 0" class="h-10 -mt-px" aria-hidden="true"
        :class="dragOverEnd ? 'bg-primary/15 ring-2 ring-primary/50 ring-inset' : ''"></div>
    </div>

    <!-- 分页（独立卡片：正文直接是翻页控件。
         需求 B：去掉「共 N 条」卡片标题行 —— 该计数已上提到顶栏（pageStats），
         这里再写一遍属于同一页面内第三次重复，且平白多占一整行高度。 -->
    <div v-if="sortedRemainingList.length > 0" class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-2">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-2 text-sm text-gray-600">
          <!-- 手动排序下提供恢复入口，与「每页条数」触发器同几何同配色 -->
          <button v-if="isManualOrder" @click="restoreFieldSort"
            class="btn-base btn-sm btn-neutral page-size-trigger">
            <AppIcon scale="xs" name="undo" />{{ tt('remaining.restoreDateSort') }}
          </button>
          <div class="relative inline-block">
            <button @click="togglePageSizeMenu($event)"
              :aria-expanded="showPageSizeMenu" aria-haspopup="menu"
              class="btn-base btn-sm btn-neutral page-size-trigger">
              <AppIcon scale="xs" name="listCheck" />{{ tt('remaining.perPage', { n: pageSize }) }}<AppIcon scale="xs" name="caretDown" />
            </button>
            <!-- 下拉菜单：必须显式给实底 + backdrop-filter，并提升到独立合成层。
                 仅靠 .glass 在液态玻璃下是 linear-gradient 背景，叠加在表格上会显得太透；
                 这里额外压一层不透明白底，保证菜单文字在任意壁纸/表格上都清晰。 -->
            <!-- 菜单带弹出/收起过渡：从按钮方向轻微上移 + 缩放淡入，
                 收起时反向淡出。用 pop 过渡类，避免硬切显得突兀。 -->
            <transition name="pop">
              <!-- 方向变量：本菜单向上展开（bottom-full），原点在底边、起始位移朝下，
                   因此动画是「从触发按钮那一侧向上长出来」。 -->
              <!-- 必须 fixed + Teleport 到 body：本菜单原本挂在 .glass 卡片内用 absolute，
               而 .glass 带 backdrop-filter 会形成 backdrop root，
               菜单自身的 backdrop-filter 因此采不到页面背景 → 背景模糊形同虚设。
               语言菜单正是 fixed z-[110] 才正常。 -->
         <Teleport to="body">
         <div v-if="showPageSizeMenu" ref="pageSizeMenuEl" role="menu"
                class="page-size-menu app-menu-panel fixed z-[110] min-w-[12rem]"
                :style="pageSizeMenuStyle">
                <!-- 宽度由 8rem 提到 12rem 并全程 nowrap：原宽度下「确定」会被挤成两行 -->
                <button v-for="s in pageSizeOptions" :key="s" role="menuitem" @click="setPageSize(s)"
                  class="text-left px-4 py-2 text-sm transition hover:bg-primary/10 whitespace-nowrap"
                  :class="pageSize===s?'text-primary font-bold':'text-gray-700'">{{ tt('remaining.perPage', { n: s }) }}</button>
                <div class="border-t border-gray-200/60 my-1"></div>
                <div class="px-3 py-2 flex items-center gap-2 whitespace-nowrap">
                  <input v-model="customPageSize" type="number" min="1" :placeholder="tt('common.custom')"
                    class="w-[4.5rem] shrink-0 px-2 py-1 border border-primary/20 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white" @keyup.enter="applyCustomPageSize" />
                  <!-- pager-confirm-btn：避免被 .app-menu-panel > div > button 的 width:100% 命中，
                       否则与固定宽输入框同排必然横向溢出面板（视觉审计 A-02，见 style.css 同名规则） -->
                  <button @click="applyCustomPageSize" class="btn-base btn-sm btn-link pager-confirm-btn shrink-0">{{ tt('common.confirm') }}</button>
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
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
        <!-- A-34：role=menu + 打开聚焦首项 + ↑↓ 循环 + Esc 还焦，
             与顶栏「更多」菜单同一套标准（composables/useMenuKeyboard.js）。 -->
        <div ref="contextMenuRef" class="app-dialog app-menu-panel min-w-[10rem] context-menu"
          role="menu" :aria-label="tt('topbar.moreActions')" @keydown="onContextMenuKeydown">
          <button role="menuitem" @click="ctxEdit"
            class="text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2"><AppIcon scale="sm" name="edit" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('common.edit') }}</button>
          <!-- A-63：无链接时与追番页一致做成真禁用（:disabled + not-allowed），
               不再「只是淡化、点了照旧生效为空动作」。 -->
          <button role="menuitem" @click="ctxOpenUrl" :disabled="!contextMenu.item?.url"
            class="text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            :class="{ 'opacity-40': !contextMenu.item?.url }"><AppIcon scale="sm" name="link" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('card.openLink') }}</button>
          <button role="menuitem" @click="ctxMoveToWatching"
            class="text-left px-4 py-2 text-sm hover:bg-primary/10 transition flex items-center gap-2"><AppIcon scale="sm" name="tv" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('remaining.moveToWatching') }}</button>
          <div class="border-t border-white/20 my-1"></div>
          <button role="menuitem" @click="ctxDelete"
            class="text-left px-4 py-2 text-sm hover:bg-danger/10 text-danger transition flex items-center gap-2"><AppIcon scale="sm" name="trash" /><span class="inline-block w-[0.21875rem] shrink-0" aria-hidden="true"></span>{{ tt('common.delete') }}</button>
        </div>
      </div>
      </transition>
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
          <div ref="confirmDialogRef" class="relative glass rounded-2xl shadow-2xl w-[23.75rem] border border-white/40 pointer-events-auto app-dialog" role="dialog" aria-modal="true" aria-labelledby="remaining-confirm-title" @keydown.ctrl.enter="confirmActionFn">
            <div class="px-6 py-5 text-center">
              <div class="mb-3 flex justify-center" aria-hidden="true">
                <AppIcon scale="xl" class="text-danger" :name="confirmAction === 'clear' ? 'clear' : 'trash'" />
              </div>
              <h3 id="remaining-confirm-title" class="text-lg font-bold text-gray-800 mb-2">{{
                confirmAction === 'clear' ? tt('confirm.clearTitle') : confirmAction === 'batchDelete' ? tt('confirm.batchDeleteTitleShort') : tt('confirm.deleteTitle') }}</h3>
              <p class="text-sm text-gray-500">
                <template v-if="confirmAction === 'clear'">{{ tt('confirm.clearRemainingMessage') }}</template>
                <template v-else-if="confirmAction === 'batchDelete'">{{ tt('confirm.batchDeleteMessageRemaining', { count: confirmTarget }) }}</template>
                <template v-else>{{ tt('confirm.deleteOneMessage', { name: confirmTarget }) }}</template>
              </p>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center gap-3">
              <button @click="showConfirmDialog = false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
              <button @click="confirmActionFn" class="btn-base btn-danger">{{
                confirmAction === 'clear' ? tt('confirm.confirmClear') : tt('confirm.confirmDelete') }}</button>
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
          <div ref="formDialogRef" class="relative glass rounded-2xl shadow-2xl w-[28.75rem] border border-white/40 pointer-events-auto app-dialog" role="dialog" aria-modal="true" aria-labelledby="remaining-form-title" @keydown.ctrl.enter="saveForm">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <AppIcon scale="lg" :name="dialogMode === 'add' ? 'sparkle' : 'edit'" />
              <h3 id="remaining-form-title" class="text-lg font-bold gradient-text">{{ dialogMode === 'add' ? tt('remaining.addDialogTitle') : tt('remaining.editDialogTitle') }}</h3>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('remaining.colName') }}</label>
                <input ref="dialogNameInput" v-model="form.name" type="text" :placeholder="tt('toast.pleaseEnterShowName')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
              <div>
                <label class="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                  <span class="inline-flex items-center gap-1 cursor-help"
                    v-tip="tt('remaining.dateFormatsHint')">{{ tt('remaining.colDate') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></span>
                  <button type="button" @click="dateManualInput = !dateManualInput"
                    class="text-xs text-primary hover:text-primary-dark transition">{{ dateManualInput ? tt('record.useDatePicker') : tt('showDialog.manualInput') }}</button>
                </label>
                <!-- 日期：自研面板（DatePicker）替代原生 input[type=date]。
                     原生弹的是浏览器白色日历，压在深色玻璃上非常割裂；且只能表达完整日期，
                     会把「2025」「2025/07」这类粗精度逼回手动输入。新组件自带精度切换，
                     因此这里不再需要「无法用 type=date 表示就切手动输入」的退化逻辑。
                     「手动输入」开关仍然保留：它是与面板并列的第二种输入方式（文本 + validateDate 校验）。 -->
                <DatePicker v-if="!dateManualInput" v-model="form.expected_date"
                  :placeholder="tt('remaining.datePlaceholderLong')" />
                <input v-if="dateManualInput" v-model="form.expected_date" type="text"
                  :placeholder="tt('remaining.datePlaceholderLong')"
                  :aria-label="tt('remaining.dateFormatsHint')"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
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
                <!-- 「等番没有集数，动态参数会原样拼到链接后面…」是控件用法说明 → 标签气泡 -->
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  <span class="inline-flex items-center gap-1 cursor-help"
                    v-tip="tt('showDialog.episodeTokenHint')">{{ tt('showDialog.urlParams') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></span>
                </label>
                <input v-model="form.url_params" type="text" :placeholder="tt('showDialog.urlParamsPlaceholder')"
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
              <button @click="showDialog = false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
              <button @click="saveForm" :disabled="saving"
                class="btn-base btn-primary disabled:opacity-40">{{ saving ? tt('common.saving') : tt('common.save') }}</button>
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
          <div ref="moveDialogRef" class="relative glass rounded-2xl shadow-2xl w-[25rem] border border-white/40 pointer-events-auto app-dialog" role="dialog" aria-modal="true" aria-labelledby="remaining-move-title">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <AppIcon scale="lg" name="tv" />
              <h3 id="remaining-move-title" class="text-lg font-bold gradient-text">{{ tt('remaining.moveDialogTitle') }}</h3>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('showDialog.day') }}</label>
                <AppSelect v-model="moveForm.day_of_week"
                  :options="weekDayOptions"
                  :placeholder="tt('showDialog.chooseDay')"
                  :aria-label="tt('showDialog.day')"
                  trigger-class="w-full" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ tt('showDialog.time') }}</label>
                <input v-model="moveForm.time_slot" type="text" placeholder="23:00"
                  class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80" />
              </div>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showMoveDialog = false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
              <button @click="moveToWatching" class="btn-base btn-toned">{{ tt('common.confirm') }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 季度新番下拉菜单 -->
    <Teleport to="body">
      <!-- 季节菜单在按钮下方展开：原点顶边、起始位移朝上，与全站 pop 动效一致 -->
      <transition name="pop">
      <div v-if="showSeasonMenu" class="fixed z-[200] season-menu"
        style="--pop-origin-y: top; --pop-from-y: -6px"
        :style="{left: seasonMenuPos.x + 'px', top: seasonMenuPos.y + 'px'}">
        <div class="app-dialog app-menu-panel min-w-[11.25rem] context-menu">
          <a v-for="s in seasonLinks" :key="s.label" :href="s.url" target="_blank" rel="noopener"
            class="block px-4 py-2 text-sm whitespace-nowrap hover:bg-primary/10 transition text-gray-700">{{ s.label }}</a>
        </div>
      </div>
      </transition>
      <div v-if="showSeasonMenu" class="fixed inset-0 z-[199]" @click="showSeasonMenu=false"></div>
    </Teleport>

    <!-- 批量添加对话框 -->
    <Teleport to="body">
      <transition name="modal-overlay">
        <div v-if="showBatchAddDialog" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[8px]" @click="showBatchAddDialog=false"></div>
      </transition>
      <transition name="modal">
        <div v-if="showBatchAddDialog" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div ref="batchDialogRef" class="relative glass rounded-2xl shadow-2xl w-[28.75rem] border border-white/40 pointer-events-auto app-dialog" role="dialog" aria-modal="true" aria-labelledby="remaining-batch-title" @keydown.ctrl.enter="saveBatchAdd">
            <div class="px-6 py-4 border-b border-white/20 flex items-center gap-2">
              <AppIcon scale="lg" name="note" />
              <h3 id="remaining-batch-title" class="text-lg font-bold gradient-text">{{ tt('remaining.batchAddTitle') }}</h3>
            </div>
            <div class="px-6 py-5">
              <!-- 原标签「番剧名称（一行一部）」把填写要求写在标签里：标签只留字段名，
                   「（一行一部）」等格式要求移入气泡；多行示例仍留在 placeholder。 -->
              <label class="block text-sm font-medium text-gray-700 mb-1">
                <span class="inline-flex items-center gap-1 cursor-help"
                  v-tip="tt('remaining.batchAddHint')">{{ tt('showDialog.name') }}<AppIcon scale="xs" name="info" class="text-gray-400" /></span>
              </label>
              <textarea v-model="batchAddText" rows="8" :placeholder="tt('remaining.batchAddPlaceholder')"
                :aria-label="tt('remaining.batchAddHint')"
                class="w-full px-4 py-2.5 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition resize-none bg-white/80"></textarea>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-end gap-3">
              <button @click="showBatchAddDialog=false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
              <button @click="saveBatchAdd" class="btn-base btn-primary">{{ tt('common.add') }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { remainingApi, batchApi } from '../db/api'
import { compareDateKey, todayStr, validateDate, normalizeDate } from '../composables/useDatePicker'
import DatePicker from '../components/DatePicker.vue'
import { showToast } from '../composables/useToast'
import { setPageStats, setPageSelection, clearPageSelection, setPageActions, clearPageActions, setPageControls, clearPageControls } from '../composables/usePageStats'
import RemainingTopControls from './RemainingTopControls.vue'
import { defaultBgmUrl, openExternal } from '../composables/useEpisode'
import { placeContextMenu } from '../composables/useContextMenu'
import { focusFirstMenuItem, onMenuKeydown } from '../composables/useMenuKeyboard'
import { useDialogFocus } from '../composables/useDialogFocus'
import { useI18n } from '../composables/useI18n'
import { useErrorText } from '../composables/useErrorText'

const { tt } = useI18n()
const { errorText } = useErrorText()

const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** AppSelect 用的星期选项（含空占位，与原 <select> 的 chooseDay 一致） */
const weekDayOptions = computed(() => [
  { value: '', label: tt('showDialog.chooseDay') },
  ...weekDays.map((d) => ({ value: d, label: dayLabel(d) })),
])

// 星期是数据层的中文标识，展示时按当前语言翻译
const dayLabel = (cn) => {
  const idx = weekDays.indexOf(cn)
  return idx < 0 ? cn : tt(`weekday.${idx + 1}`)
}

const remainingList = ref([])
// 首帧数据是否已到：false 时渲染骨架行，避免把「加载中」误显示成「暂无记录」。
const listLoaded = ref(false)
const selected = ref(null)

// 排序：偏好持久化到 localStorage；预计日期用数字位比较（兼容 2025/07、2025/07/15 混排）
// 默认按预计日期升序，让最近的等番排在最前。「等待更新」列表用户预期也是这样
const searchQuery = ref('')
// 标签筛选：逗号分隔的已选标签名，空串表示不筛选
const tagFilter = ref('')
const SORT_KEY_F = 'remaining_sort_field'
const SORT_KEY_O = 'remaining_sort_order'
const SORT_MIGRATED_KEY = 'remaining_sort_default_migrated'
// 旧版 sortField 默认 ''（无排序）导致列表按插入顺序展示，不符合「等待更新」的预期。
// 一次性迁移：未设过排序键的用户把默认值钉到 expected_date / asc。
// 设置过排序键的用户保留其偏好（说明曾经点击过表头，主动调整过）。
if (!localStorage.getItem(SORT_MIGRATED_KEY)) {
  if (localStorage.getItem(SORT_KEY_F) == null) {
    localStorage.setItem(SORT_KEY_F, 'expected_date')
    localStorage.setItem(SORT_KEY_O, 'asc')
  }
  localStorage.setItem(SORT_MIGRATED_KEY, '1')
}
const sortField = ref(localStorage.getItem(SORT_KEY_F) || 'expected_date')
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

// ========== 拖动排序 ==========
// 设计：拖动是「显式的手动排序」意图，但**切换时机在 drop 成功那一刻**而不是
// dragstart —— 视觉审计 A-62：原先抓起一行的一瞬间整表就按 sort_order 重排，
// 指针下的落点指示作用在重排后的另一行上，极易放错位置。现在拖拽期间锁定当前
// 排序视图（名称/日期序原样不动），drop 成功后整体按「用户看到的可视顺序」
// 写 sort_order 并切手动序。手动模式下按 sort_order 排。
// 落库：一次拖动只产生 N 个 sort_order 更新，用一次性顺序提交避免中间态闪烁。
const MANUAL = '__manual__'
const dragIndex = ref(-1)
const dragOverIndex = ref(-1)
const isManualOrder = computed(() => sortField.value === MANUAL || sortField.value === '')

const enterManualOrder = () => {
  if (sortField.value !== MANUAL) {
    sortField.value = MANUAL
    sortOrder.value = 'asc'
  }
}

// 手动模式下按 sort_order + id 排序（与数据层 getAllRemaining 的默认顺序一致）
const manualSort = (list) => [...list].sort((a, b) => {
  const sa = Number(a.sort_order) || 0
  const sb = Number(b.sort_order) || 0
  if (sa !== sb) return sa - sb
  return (a.id || 0) - (b.id || 0)
})

const sortedRemainingList = computed(() => {
  let list = remainingList.value
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
  if (isManualOrder.value) return manualSort(list)
  if (sortField.value) {
    list = [...list].sort((a, b) => {
      const cmp = sortField.value === 'expected_date'
        ? compareDateKey(a.expected_date, b.expected_date)
        : String(a[sortField.value] || '').localeCompare(String(b[sortField.value] || ''), 'zh-CN')
      return sortOrder.value === 'asc' ? cmp : -cmp
    })
  }
  return list
})

// HTML5 拖拽：只在「非批量模式、无搜索过滤」时允许拖动，
// 否则拖动的目标位置和过滤后的列表对不上，落库顺序会错乱。
const canDrag = computed(() =>
  !batchMode.value && !searchQuery.value.trim() && !tagFilter.value.trim() && sortedRemainingList.value.length > 1
)

const onDragStart = (e, index) => {
  if (!canDrag.value) { e.preventDefault(); return }
  // A-62：dragstart 不再切换排序（整表重排会让被拖行从指针下移走）；
  // 手动序延后到 doReorder（drop 成功）才进入。
  dragIndex.value = index
  dragOverIndex.value = index
  try {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(sortedRemainingList.value[index]?.id ?? ''))
  } catch { /* 老浏览器忽略 */ }
}

const onDragOver = (e, index) => {
  if (!canDrag.value || dragIndex.value < 0) return
  e.preventDefault()
  try { e.dataTransfer.dropEffect = 'move' } catch { /* ignore */ }
  if (dragOverIndex.value !== index) dragOverIndex.value = index
}

const onDragLeave = (index) => {
  if (dragOverIndex.value === index) dragOverIndex.value = -1
}

const onDragEnd = () => {
  dragIndex.value = -1
  dragOverIndex.value = -1
  dragOverEnd.value = false
}

// ===== 表格级拖放（解决「拖到末行之外拖不动」）=====
const tableWrapRef = ref(null)
const tbodyRef = ref(null)

// 指针落在哪一行：
//  - 在某个 tr 的上半/下半 → 取该行
//  - 在最后一行之下（表格余白） → 返回「末尾标记」，交由 doReorder 插到最后
const END = -2
// 指针是否停在「末尾放置区」（拖动时才出现的那条带）
const dragOverEnd = ref(false)

const rowIndexAtPointer = (clientY) => {
  const tbody = tbodyRef.value
  if (!tbody) return -1
  const trs = [...tbody.querySelectorAll('tr[data-row-index]')]
  if (!trs.length) return -1
  const last = trs[trs.length - 1].getBoundingClientRect()
  // 明确越过最后一行底边 → 移到末尾
  if (clientY > last.bottom) return END
  for (const tr of trs) {
    const r = tr.getBoundingClientRect()
    if (clientY < r.bottom) return Number(tr.dataset.rowIndex)
  }
  return END
}

const onTableDragOver = (e) => {
  if (!canDrag.value || dragIndex.value < 0) return
  e.preventDefault()
  try { e.dataTransfer.dropEffect = 'move' } catch { /* ignore */ }
  const idx = rowIndexAtPointer(e.clientY)
  if (idx >= 0 && dragOverIndex.value !== idx) dragOverIndex.value = idx
  // 末行之外：不高亮任何行，但允许放置，并高亮末尾放置带
  if (idx === END) {
    dragOverIndex.value = -1
    dragOverEnd.value = true
  } else {
    dragOverEnd.value = false
  }
}

const onTableDragLeave = (e) => {
  const wrap = tableWrapRef.value
  if (!wrap) return
  if (e.relatedTarget && wrap.contains(e.relatedTarget)) return
  dragOverIndex.value = -1
}

const onTableDrop = async (e) => {
  if (!canDrag.value || dragIndex.value < 0) return
  e.preventDefault()
  const target = rowIndexAtPointer(e.clientY)
  if (target === END) {
    // 移到末尾：追加语义，不是「占据末行位置」
    await doReorder(-1, true)
    return
  }
  await doReorder(target)
}

// 分页时页内下标 ≠ 全局下标；拖动必须用全局下标，否则跨页会错位
const absoluteIndexOf = (item) => sortedRemainingList.value.findIndex(r => r.id === item.id)

// 手动排序模式下提供「恢复按日期升序」入口
const restoreFieldSort = () => {
  sortField.value = 'expected_date'
  sortOrder.value = 'asc'
}

// 放下后重排并持久化：把被拖项插到目标位置，再整段写新的 sort_order
// 行级 drop（保留：单行内精确落点）；与 tbody 级共用同一套重排逻辑
const onDrop = async (e, targetIndex) => {
  if (!canDrag.value) return
  e.preventDefault()
  await doReorder(targetIndex)
}

// appendToEnd=true 表示「移到列表末尾」（拖到末尾放置带），
// 与「占据某行位置」是两种语义，必须区分：后者在 from<target 时要减 1，前者不减。
const doReorder = async (targetIndex, appendToEnd = false) => {
  if (!canDrag.value) return
  const from = dragIndex.value
  onDragEnd()
  if (from < 0 || (targetIndex < 0 && !appendToEnd)) return

  const list = [...sortedRemainingList.value]
  const [moved] = list.splice(from, 1)

  if (appendToEnd) {
    // 「移到末尾」：直接追加到最后
    list.push(moved)
  } else {
    if (from === targetIndex) return
    // 「占据某行位置」：移除源后，若目标在原位置之后，目标项已整体左移一位，
    // 因此插入索引要减 1 才能落在「目标项原本的位置」。
    // 例：A,B,C 把 A 拖到 C（target=2, from=0）→ [B,C] 插入 1 得 B,A,C。
    const insertAt = Math.min(targetIndex > from ? targetIndex - 1 : targetIndex, list.length)
    list.splice(insertAt, 0, moved)
  }

  // A-62：到这里 drop 已成功，才切换手动序 —— 上面的 list 正是拖拽期间用户看到的
  // 可视顺序（字段排序视图），逐位写 sort_order 后它恰好就是手动序。
  enterManualOrder()

  // 先记录「落库前」的原始 sort_order —— 若在乐观更新之后再比对，
  // 读到的是刚写入的新值，会被误判为「没变化」而整批跳过。
  const before = new Map(
    remainingList.value.map(r => [r.id, Number(r.sort_order) || 0])
  )

  // 乐观更新本地（避免等待网络往返）
  list.forEach((item, i) => { item.sort_order = i + 1 })
  remainingList.value = manualSort(remainingList.value)

  // 只写顺序真正变化的项
  try {
    await Promise.all(list.map((item, i) => {
      const next = i + 1
      const cur = before.get(item.id)
      return cur === next ? null : remainingApi.update(item.id, { sort_order: next })
    }).filter(Boolean))
    showToast(tt('toast.orderSaved'))
  } catch {
    // 失败就重新拉取，回到服务端真实顺序
    showToast(tt('toast.operationFailed'), 'error')
    await fetchData()
  }
}

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
const isAllChecked = computed(() => paginatedList.value.length > 0 && paginatedList.value.every(item => checkedIds.value.includes(item.id)))
/** A-33：部分勾选（非空但未全选）——表头勾选框显示半选态 */
const isPartiallyChecked = computed(() => !isAllChecked.value && checkedIds.value.length > 0 && paginatedList.value.some(item => checkedIds.value.includes(item.id)))

/**
 * 点击行首序号 → 切换该行选中态。
 *
 * 为什么单独写一个而不是直接 toggleCheck(item.id)：
 *   1) 首次点击要顺带把 batchMode 打开（否则批量工具栏不出现）
 *   2) 序号列不该清掉「当前选中项」之外的状态
 *
 * 注意：参数是整条 item（不是 idx）—— 内部始终用 item.id，
 * 因为序号 idx 会随翻页/排序/搜索变化，id 才是稳定标识。
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
    if (showMoveDialog.value) { showMoveDialog.value = false; return }
    if (showConfirmDialog.value) { showConfirmDialog.value = false; return }
    if (showBatchAddDialog.value) { showBatchAddDialog.value = false; return }
    if (showSeasonMenu.value) { showSeasonMenu.value = false; return }
    if (contextMenu.value.show) { contextMenu.value.show = false; return }
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
  confirmTarget.value = tt('remaining.allRemaining')
  confirmAction.value = 'clear'
  showConfirmDialog.value = true
}

const editing = ref(null)
const editValue = ref('')
const dateManualInput = ref(false)

// 本季新番链接（yuc.wiki，URL 格式为 /YYYYMM，季首月为 01/04/07/10）
const currentSeasonLink = computed(() => {
  const now = new Date()
  const month = now.getMonth() + 1
  const seasonMonth = month < 4 ? '01' : month < 7 ? '04' : month < 10 ? '07' : '10'
  const t = `${now.getFullYear()}${seasonMonth}`
  return { url: `https://yuc.wiki/${t}`, label: tt('remaining.thisSeasonLabel') }
})

// 季度新番链接（用户可选择查看本年 1/4/7/10 月的新番）
const showSeasonMenu = ref(false)
const seasonMenuBtn = ref(null)
const seasonMenuPos = ref({ x: 0, y: 0 })
const seasonLinks = computed(() => {
  const year = new Date().getFullYear()
  const link = (season, month, y = year) =>
    ({ label: tt('remaining.seasonLink', { year: y, season: tt(season), month }), url: `https://yuc.wiki/${y}${String(month).padStart(2, '0')}` })
  return [
    link('remaining.seasonWinter', 1),
    link('remaining.seasonSpring', 4),
    link('remaining.seasonSummer', 7),
    link('remaining.seasonAutumn', 10),
    link('remaining.seasonWinter', 1, year + 1),
    { label: tt('remaining.seasonUpcoming'), url: 'https://yuc.wiki/new' },
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

// 点击表格行和交互元素以外的区域时取消选中（document 级监听，覆盖页面留白）
const onDocClick = (e) => {
  // 「每页几条」下拉：点菜单外任意位置关闭（按钮自身由 toggle 处理，不算外部）
  if (showPageSizeMenu.value && !e.target.closest('.page-size-menu, .page-size-trigger')) {
    showPageSizeMenu.value = false
  }
  // 季节菜单同理
  if (showSeasonMenu.value && !e.target.closest('.season-menu, .season-trigger')) {
    showSeasonMenu.value = false
  }
  if (editing.value && !e.target.closest('input, select, textarea')) {
    saveEdit()
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

// 批量添加
const showBatchAddDialog = ref(false)
const batchAddText = ref('')

const openBatchAddDialog = () => {
  batchAddText.value = ''
  showBatchAddDialog.value = true
}

const saveBatchAdd = async () => {
  const names = batchAddText.value.split('\n').map(n => n.trim()).filter(n => n)
  if (names.length === 0) { showToast(tt('toast.pleaseEnterShowName'), 'warning'); return }
  let added = 0
  const failed = []
  for (const name of names) {
    try {
      const res = await remainingApi.add({ name, expected_date: '', url: '', url_params: '', notes: '' })
      if (res.data.success) added++
      else failed.push(tt('toast.batchAddItemFailed', { name, reason: errorText(res.data, tt, 'toast.failed') }))
    } catch (err) {
      failed.push(tt('toast.batchAddItemFailed', { name, reason: err.message || tt('toast.failed') }))
    }
  }
  showToast(failed.length
    ? tt('toast.batchAddedPartial', { added, failed: failed.length, list: failed.slice(0, 3).join(tt('common.listSep')) })
    : tt('toast.batchAdded', { count: added }), failed.length ? 'warning' : 'success')
  showBatchAddDialog.value = false
  await fetchData()
}

// 新增时的预计日期默认留空（产品要求：除「移至已看」外的日期框都不预填今天）
const form = ref({ name: '', cover_url: '', expected_date: '', url: '', url_params: '', notes: '', tags: '' })

// ========== 封面图 ==========
/**
 * 两个互不干扰的失败标记：
 *   · formCoverFailed —— 弹窗实时预览的当前 URL 加载失败（URL 一变就复位，见 watch）
 *   · rowCoverFailed  —— 表格各行的「哪一条封面 404 了」，按 id 记录：
 *     记在列表上而不是每行一个组件状态，行是按 id 复用的 v-for，
 *     这样刷新数据后同一个坏链接不会反复重试闪烁；只影响那一个 id，不误伤别的行。
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
  let url = String(item.url).replace(/[?&]+$/, '')
  if (item.url_params) {
    const params = String(item.url_params).replace(/^[?&]+/, '').replace(/[?&]+$/, '')
    if (params) url += (url.includes('?') ? '&' : '?') + params
  }
  return url
}

const moveForm = ref({ day_of_week: '', time_slot: '' })

const contextMenu = ref({ show: false, x: 0, y: 0, item: null })
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

const openItemLink = (item) => {
  openExternal(item.url ? buildUrl(item) : defaultBgmUrl(item))
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
      if (res.data.success) { showToast(tt('toast.batchDeleted', { count: checkedIds.value.length })); checkedIds.value = []; batchMode.value = false; await fetchData() }
      else showToast(errorText(res.data, tt, 'toast.batchDeleteFailed'), 'error')
    } catch { showToast(tt('toast.batchDeleteFailed'), 'error') }
  } else if (confirmAction.value === 'clear') {
    try {
      const res = await batchApi.clearRemaining()
      if (res.data.success) { showToast(tt('toast.remainingCleared')); selected.value = null; batchMode.value = false; checkedIds.value = []; await fetchData() }
      else showToast(errorText(res.data, tt, 'toast.clearFailed'), 'error')
    } catch { showToast(tt('toast.clearFailed'), 'error') }
  } else if (confirmAction.value === 'delete') {
    if (!selected.value) return
    try {
      const res = await remainingApi.delete(selected.value.id)
      if (res.data.success) { showToast(tt('toast.remainingDeleted')); selected.value = null; await fetchData() }
      else showToast(errorText(res.data, tt, 'toast.delFailed'), 'error')
    } catch { showToast(tt('toast.delFailed'), 'error') }
  }
}

const fetchData = async () => {
  try {
    const res = await remainingApi.getAll()
    if (res.data.success) {
      remainingList.value = res.data.data
      const visible = new Set(remainingList.value.map(item => item.id))
      checkedIds.value = checkedIds.value.filter(id => visible.has(id))
      selected.value = selected.value
        ? remainingList.value.find(item => item.id === selected.value.id) || null
        : null
    }
  } catch { showToast(tt('toast.fetchFailed'), 'error') }
  finally { listLoaded.value = true }
}

const selectItem = (item) => { selected.value = item }

// ========== 内联编辑 ==========
// 视觉审计 A-64：校验失败（空名称/非法日期）时除 toast 外，给正在编辑的输入框
// 错误描边（.is-invalid，见 style.css）并置 aria-invalid —— 错误源在单元格本地可见。
// 用户重新输入即解除（watch editValue），保存/取消时复位。
const editInvalid = ref(false)
watch(editValue, () => { if (editInvalid.value) editInvalid.value = false })

const startEdit = (item, field) => {
  editing.value = { id: item.id, field }
  editValue.value = String(item[field] ?? '')
  editInvalid.value = false
}

/**
 * 需求 A：三张番单页统一的双击规则。
 *
 *   1. 双击**行内可编辑字段**（名称 / 预计日期 / 链接 / 备注）→ 该字段行内编辑。
 *      鼠标路径由 <td> 自己的 @dblclick.stop → onFieldDblclick 处理，事件不冒泡到行。
 *      空值字段同样进入编辑（编辑值取空串，用户可直接填）。
 *   2. 双击**行的空白区域**（行首/行尾留白、批量勾选框之外的空白 td、行 padding）
 *      → 冒泡到 <tr> 的 onRowDblclick，打开完整编辑弹窗。
 *   3. **批量模式**下双击一律无效（勾选优先，与既有 batchMode 语义一致）。
 *
 * 为什么把判断放在 tr 上而不是给每个 td 都挂：表格里可编辑的列就是那 4 列，
 * 其余区域（行 padding、公式列、拖拽留白）都属于「空白」，由一个入口统一处理即可，
 * 也不会因为将来加列而漏掉。
 */
const onFieldDblclick = (item, field) => {
  if (batchMode.value) return
  startEdit(item, field)
}

const onRowDblclick = (e) => {
  if (batchMode.value) return
  // 点在可编辑单元格内（含其子节点）→ 已在 td 层 stop，这里再加一道保险
  if (e.target.closest('.editable-cell, button, input, select, textarea, a, [role="checkbox"]')) return
  const id = Number(e.currentTarget?.dataset?.rowId)
  const item = sortedRemainingList.value.find(r => r.id === id)
  if (!item) return
  selected.value = item
  openEditDialog()
}

/**
 * 表格里可编辑单元格的键盘等价路径（与 WatchingCard 的 .editable-cell 对齐）。
 *
 * 原来等番/已看表的行内编辑只有鼠标路径（双击），纯键盘用户无法改任何字段。
 * 这里补一条：单元格可聚焦（选中该行之后）→ Enter / Space 进入编辑。
 * 只在行已选中时进 Tab 序，避免一页 20 行 × 4 字段 = 80 个 Tab 位。
 */
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
    if (!val) { editInvalid.value = true; showToast(tt('toast.pleaseEnterShowName'), 'warning'); return }
  }
  if (field === 'expected_date' && val.trim()) {
    const validation = validateDate(val)
    if (!validation.valid) { editInvalid.value = true; showToast(validation.error, 'warning'); return }
    val = validation.normalized
  }
  const item = remainingList.value.find(i => i.id === id)
  const originalValue = String(item?.[field] ?? '')
  if (val === originalValue) { if (editing.value === token) editing.value = null; return }
  try {
    const res = await remainingApi.update(id, { [field]: val })
    if (res.data.success) {
      if (item) item[field] = val
    } else { showToast(errorText(res.data, tt, 'toast.updateFailed'), 'error') }
  } catch { showToast(tt('toast.updateFailed'), 'error') }
  if (editing.value === token) editing.value = null
}

// ========== 对话框操作 ==========
const dialogNameInput = ref(null)
const focusNameInput = () => { nextTick(() => dialogNameInput.value?.focus()) }

const openAddDialog = () => {
  dialogMode.value = 'add'
  // 新增时预计日期留空（不预填今天），由用户自行选择
  form.value = {
    name: '', cover_url: '', expected_date: '', url: '', url_params: '', notes: '', tags: '' }
  formCoverFailed.value = false
  showDialog.value = true
  focusNameInput()
}

/**
 * 选中项专属操作按钮：集中定义，模板 v-for 渲染。
 * 颜色由 .btn-toned / .btn-neutral / .btn-danger 决定（全部跟随主题色），
 * 配合 transition-group 让整组出现/收起有统一动效。
 */
const selectedActions = computed(() => [
  { key: 'edit', icon: 'edit', label: tt('common.edit'), cls: 'btn-toned', onClick: () => openEditDialog() },
  { key: 'move', icon: 'tv', label: tt('remaining.moveToWatching'), cls: 'btn-toned', onClick: () => openMoveDialog() },
  { key: 'del', icon: 'trash', label: tt('common.delete'), cls: 'btn-danger', onClick: () => deleteItem() },
])

const openEditDialog = () => {
  if (!selected.value) return
  dialogMode.value = 'edit'
  form.value = {
    name: selected.value.name,
    // 编辑路径同样要回填 cover_url：漏掉它，保存时 update 的字段白名单里
    // 这个字段就永远不会被带上，用户改封面等于白改。
    cover_url: selected.value.cover_url || '',
    expected_date: selected.value.expected_date || '',
    url: selected.value.url || '',
    url_params: selected.value.url_params || '',
    notes: selected.value.notes || '',
    tags: selected.value.tags || ''
  }
  formCoverFailed.value = false
  showDialog.value = true
  focusNameInput()
}

const saving = ref(false)
const saveForm = async () => {
  if (saving.value) return
  if (!form.value.name.trim()) { showToast(tt('toast.pleaseEnterShowName'), 'warning'); return }
  if (form.value.expected_date && String(form.value.expected_date).trim()) {
    const raw = normalizeDate(form.value.expected_date)
    const validation = validateDate(raw)
    if (!validation.valid) { showToast(validation.error, 'warning'); return }
    form.value.expected_date = validation.normalized
  }
  // 封面地址去空白后再落库：从聊天/网页复制来的链接常带首尾空格或换行
  form.value.cover_url = normalizeCoverUrl(form.value.cover_url)
  saving.value = true
  try {
    if (dialogMode.value === 'add') {
      const res = await remainingApi.add(form.value)
      if (res.data.success) {
        showToast(tt('toast.remainingAdded'))
        showDialog.value = false
        const newId = res.data.id
        await fetchData()
        if (newId != null) {
          const created = remainingList.value.find(i => i.id === newId)
          if (created) selected.value = created
        }
      }
      else showToast(errorText(res.data, tt, 'toast.addFailed'), 'error')
    } else {
      const targetId = selected.value.id
      const res = await remainingApi.update(targetId, form.value)
      if (res.data.success) {
        // 清掉这一行的封面失败标记：用户改对了链接，重新渲染时要能重新尝试
        clearRowCoverFailed(targetId)
        showToast(tt('toast.remainingUpdated')); showDialog.value = false; selected.value = null; await fetchData()
      }
      else showToast(errorText(res.data, tt, 'toast.updateFailed'), 'error')
    }
  } catch { showToast(tt('toast.operationFailed'), 'error') }
  finally { saving.value = false }
}

// 「移至追番」记住上次选择的星期和时间，作为下次默认值
const MOVE_KEY = 'banager_move_to_watching'

const openMoveDialog = () => {
  if (!selected.value) return
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(MOVE_KEY)) || {} } catch { saved = {} }
  moveForm.value = { day_of_week: saved.day_of_week || '', time_slot: saved.time_slot || '' }
  showMoveDialog.value = true
}

const moveToWatching = async () => {
  if (!selected.value) return
  try {
    const res = await remainingApi.moveToWatching(selected.value.id, moveForm.value)
    if (res.data.success) {
      localStorage.setItem(MOVE_KEY, JSON.stringify({ day_of_week: moveForm.value.day_of_week, time_slot: moveForm.value.time_slot }))
      showToast(tt('toast.movedToWatching')); showMoveDialog.value = false; selected.value = null; await fetchData()
    }
    else showToast(errorText(res.data, tt, 'toast.operationFailed'), 'error')
  } catch { showToast(tt('toast.operationFailed'), 'error') }
}

const deleteItem = () => { openConfirmDialog() }

// 弹窗焦点管理：打开聚焦首个输入、Tab 在弹窗内循环、关闭后焦点归还
const formDialogRef = ref(null)
const moveDialogRef = ref(null)
const confirmDialogRef = ref(null)
const batchDialogRef = ref(null)
const pageRootRef = ref(null)

useDialogFocus({
  isOpen: () => showDialog.value,
  getDialog: () => formDialogRef.value,
  root: () => pageRootRef.value,
  initialFocus: () => dialogNameInput.value,
})
useDialogFocus({
  isOpen: () => showMoveDialog.value,
  getDialog: () => moveDialogRef.value,
  root: () => pageRootRef.value,
})
useDialogFocus({
  isOpen: () => showConfirmDialog.value,
  getDialog: () => confirmDialogRef.value,
  root: () => pageRootRef.value,
})
useDialogFocus({
  isOpen: () => showBatchAddDialog.value,
  getDialog: () => batchDialogRef.value,
  root: () => pageRootRef.value,
})

onMounted(() => {
  fetchData()
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', onDocClick)
})


// 计数同步到顶栏（等番总数）
watch(
  () => remainingList.value.length,
  (n) => {
    setPageStats('/remaining', [
      { text: tt('watched.totalCount', { count: n }), tone: 'neutral' },
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

const ROUTE_KEY = '/remaining'

/**
 * 顶栏内容控件（视觉审计 A-01：第一卡的搜索 + 标签筛选迁入顶栏）。
 *
 * 与上面 pageActions 的 watch 同一模式：immediate 写入、数据变化重写。
 * 控件组件只做渲染入口（App.vue 顶栏用 <component :is> 渲染），
 * searchQuery / tagFilter 的单一来源仍是本 view —— props 带当前值，
 * onUpdate 回调写回，等价于 v-model。组件不必在此 markRaw：
 * setPageControls 写入点会统一 markRaw（防 reactive 代理组件实例）。
 */
watch(
  [searchQuery, tagFilter],
  () => {
    setPageControls(ROUTE_KEY, [
      {
        key: 'remaining-controls',
        component: RemainingTopControls,
        props: {
          search: searchQuery.value,
          tagFilter: tagFilter.value,
          'onUpdate:search': (v) => { searchQuery.value = v },
          'onUpdate:tagFilter': (v) => { tagFilter.value = v },
        },
      },
    ])
  },
  { immediate: true },
)

/** 本季新番：外链，新标签打开 */
const openSeasonLink = () => {
  if (typeof window !== 'undefined' && currentSeasonLink.value?.url) {
    window.open(currentSeasonLink.value.url, '_blank', 'noopener')
  }
}

/**
 * 顶栏操作按钮。
 *
 * 用户要求把工具栏按钮从页面内移到顶栏（A-01 后搜索与筛选也一并迁入）。
 * 顶栏空间有限，所以全部以**图标**形态渲染，文案由 App.vue 用 v-tip 显示。
 *
 * 批量相关按钮只在 batchMode 或有勾选时出现 —— 否则顶栏常驻 8 个图标太拥挤。
 */
watch(
  [() => currentSeasonLink.value, () => batchMode.value, () => checkedIds.value.length, () => isAllChecked.value, () => selected.value],
  () => {
    const items = [
      { key: 'season-link', icon: 'tv', label: currentSeasonLink.value.label, onClick: openSeasonLink },
      { key: 'season-menu', icon: 'calendar', label: tt('remaining.viewSeasons'), onClick: toggleSeasonMenu },
      { key: 'add', icon: 'plus', label: tt('remaining.add'), onClick: openAddDialog },
      { key: 'batch-add', icon: 'upload', label: tt('remaining.batchAdd'), onClick: openBatchAddDialog },
    ]
    // 选中某一项时，展示编辑 / 移至追番 / 删除（原来在工具栏的 sel-actions 区）
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
    items.push({ key: 'clear', icon: 'clear', label: tt('remaining.clearList'), onClick: openClearDialog, danger: true })
    setPageActions('/remaining', items)
  },
  { immediate: true, deep: true },
)

/** 当前选中信息同步到顶栏（用户要求从卡片内移走，省掉一整行） */
/**
 * 顶栏「当前选中 / 已选择 N 项」同步。
 *
 * 优先级：
 *   批量模式 + 有勾选  → 「已选择 N 项」（danger）
 *   批量模式 + 无勾选  → 不显示
 *   非批量 + 有选中项  → 「当前选中: XXX」
 *
 * 为什么 batches 也要进这个 watch：勾选数量变化必须立刻反映到顶栏，
 * 所以 watch 源从「selected」扩成「selected + batchMode + checkedIds.length」。
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
        ...(sel.expected_date ? [{ text: String(sel.expected_date), tone: 'neutral' }] : []),
      ],
    })
  },
  { immediate: true, deep: true },)

onUnmounted(() => {
  clearPageSelection(ROUTE_KEY)
  // 补齐既有隐患：等番页此前漏清 pageActions（已看页 1580 行有清），跨页会残留旧按钮
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

/* 表格单元格文字色：浅色模式沿用原来的灰阶观感，深色模式必须显式提亮。
   原因：全局 `.dark .text-gray-600` 只到 #94a3b8（压深玻璃 4.25:1）、
   `.dark .text-gray-400` 只到 #7c8ba5（3.16~3.47:1），都不到 4.5:1 ——
   表格里的日期与备注在深色下实测就是读不清。这里按 4.5:1 直接给终值。 */
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
   显式终值做法提亮到 #cbd5e1（与 .cell-date 深色终值同档）。序号是可点击控件，
   取比 .cell-notes(#a9b6cc) 更亮的一档：壁纸透色把深色玻璃底提亮的轮次
   （实测底 rgb(89,75,80)）#a9b6cc 只有 4.02:1，#cbd5e1 仍 ≥5:1。
   !important 用于压过全局 `.dark .text-gray-400` 的 !important（此处特异性更高）。
   cell-index-num 只加在 :class 的未勾选分支，勾选态仍走 text-primary。 */
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
   flex:0 0 auto 的固定块，不会被名称的省略号逻辑挤压变形。 */
.name-with-tags {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
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
