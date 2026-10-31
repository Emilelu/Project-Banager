<template>
  <div ref="pageRootRef" class="space-y-5" @keydown="handleKeydown" tabindex="-1">
    <!-- 顶部信息栏 + 操作面板合并 -->
    <div class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
      <!-- 需求 B：本页两个计数（本年 N 部 / 总计 N 部）就放在**顶部第一张卡片标题行的右侧**。
           表格卡片与分页卡片里那些重复的「共 N 条」标题行已全部删除。
           .topbar-stat 与 App.vue 顶栏徽章同一套样式（更紧凑），两处观感一致。 -->
      <div class="card-head mb-3 flex-wrap">
        <AppIcon scale="md" name="book" class="text-primary" />
        <h3 class="card-head-title gradient-text">{{ tt('nav.watched') }}</h3>
        <span class="topbar-stat">{{ tt('watched.thisYear', { count: yearCount }) }}</span>
        <span class="topbar-stat is-neutral">{{ tt('watched.total', { count: totalCount }) }}</span>
        <span class="topbar-stat is-neutral">{{ tt('watched.totalCount', { count: filteredList.length }) }}</span>
      </div>
      <div class="toolbar-enter toolbar-adaptive flex items-center justify-between gap-4 flex-nowrap">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <!-- 年份选择：改用与「标签筛选」完全一致的下拉样式
                 （原来是一个原生 <select>，与旁边的 TagFilter 观感割裂）。 -->
            <div class="relative inline-block">
              <button ref="yearTriggerRef" type="button" @click="toggleYearMenu"
                class="filter-trigger year-filter-trigger transition"
                :class="{ 'is-active': selectedYear !== '__all__' }"
                :aria-expanded="showYearMenu" aria-haspopup="menu"
                :aria-label="tt('watched.yearSelect')"
                v-tip="tt('watched.yearLabelHint')">
                <AppIcon scale="sm" name="book" />
                <span>{{ yearMenuLabel }}</span>
                <AppIcon scale="xs" :name="showYearMenu ? 'caretUp' : 'caretDown'" class="ml-0.5" />
              </button>

              <Teleport to="body">
                <div v-if="showYearMenu" class="fixed inset-0 z-[100]" @click="showYearMenu = false"></div>
                <transition name="pop">
                  <div v-if="showYearMenu" ref="yearMenuRef" role="menu"
                    class="fixed z-[110] app-menu-surface rounded-xl border border-white/40 py-1 min-w-[10rem] max-h-[60vh] overflow-y-auto"
                    style="--pop-origin-y: top; --pop-from-y: -6px"
                    :style="yearMenuStyle"
                    :aria-label="tt('watched.yearSelect')">
                    <!-- 全部年份 -->
                    <button type="button" role="menuitemradio"
                      :aria-checked="selectedYear === '__all__' ? 'true' : 'false'"
                      @click="pickYear('__all__')"
                      class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition hover:bg-primary/10 whitespace-nowrap"
                      :class="selectedYear === '__all__' ? 'font-semibold text-gray-800' : 'text-gray-600'">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-primary"></span>
                      <span class="flex-1">{{ tt('watched.allYears') }}</span>
                      <span :class="selectedYear === '__all__' ? 'text-primary' : 'text-gray-300'">
                        <AppIcon v-if="selectedYear === '__all__'" scale="xs" name="check" />
                      </span>
                    </button>

                    <!-- 各年份 -->
                    <button v-for="y in sortedYears" :key="y.year_label" type="button" role="menuitemradio"
                      :aria-checked="selectedYear === y.year_label ? 'true' : 'false'"
                      @click="pickYear(y.year_label)"
                      class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition hover:bg-primary/10 whitespace-nowrap"
                      :class="selectedYear === y.year_label ? 'font-semibold text-gray-800' : 'text-gray-600'">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-sakura"></span>
                      <span class="flex-1">{{ y.year_label }}</span>
                      <span :class="selectedYear === y.year_label ? 'text-primary' : 'text-gray-300'">
                        <AppIcon v-if="selectedYear === y.year_label" scale="xs" name="check" />
                      </span>
                    </button>

                    <!-- 未归类 -->
                    <div class="border-t border-gray-200/60 my-1"></div>
                    <button type="button" role="menuitemradio"
                      :aria-checked="selectedYear === '__unclassified__' ? 'true' : 'false'"
                      @click="pickYear('__unclassified__')"
                      class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition hover:bg-primary/10 whitespace-nowrap"
                      :class="selectedYear === '__unclassified__' ? 'font-semibold text-gray-800' : 'text-gray-600'">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-warning"></span>
                      <span class="flex-1">{{ tt('watched.unclassified') }}</span>
                      <span :class="selectedYear === '__unclassified__' ? 'text-primary' : 'text-gray-300'">
                        <AppIcon v-if="selectedYear === '__unclassified__'" scale="xs" name="check" />
                      </span>
                    </button>
                  </div>
                </transition>
              </Teleport>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <!-- 计数 chip：与卡片标题行的 .stat-chip 同一套（主色淡底 + 主色深字） -->
          </div>
          <div class="relative">
            <input v-model="searchQuery" type="text" :placeholder="tt('watched.searchPlaceholder')"
              class="pl-8 pr-8 py-2 border border-primary/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/80 w-48" />
            <AppIcon scale="sm" name="search" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <button v-if="searchQuery" @click="searchQuery=''" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition" :aria-label="tt('common.clear')">
              <AppIcon scale="xs" name="close" />
            </button>
          </div>
          <!-- 按标签筛选（多选 OR），与搜索框并列 -->
          <TagFilter v-model="tagFilter" />
        </div>
        <transition-group name="sel-anim" tag="div" ref="toolbarRef" class="sel-anim-wrap flex items-center gap-2 flex-wrap"
          @before-leave="pinLeavingGroup" @leave-cancelled="unpinLeavingGroup">
          <button key="add" @click="openAddDialog" class="btn-base btn-primary"><AppIcon scale="sm" name="sparkle" />{{ tt('watched.addRecord') }}</button>

          <!-- 选中项专属操作整体 = 一个 transition-group 子节点（见 WatchingView.vue 注释）：
               多个 button 各自作子节点时会逐个离场，第一个脱离文档流后后面的兄弟立刻
               左移，第二个量到的已是挤压后坐标，钉不回原位。 -->
          <div v-if="!!selected" key="sel-actions" class="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
            <button v-for="b in selectedActions" :key="b.key" @click="b.onClick"
              class="btn-base" :class="b.cls"><AppIcon scale="sm" :name="b.icon" />{{ b.label }}</button>
          </div>

          <div key="sep-1" class="toolbar-sep"></div>
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
          <button key="clear" @click="openClearDialog" class="btn-base btn-neutral"><AppIcon scale="sm" name="clear" />{{ tt('watching.clearList') }}</button>
          <div key="sep-2" class="toolbar-sep"></div>
          <button key="add-year" @click="openAddYearDialog" class="btn-base btn-toned"><AppIcon scale="sm" name="sparkle" />{{ tt('watched.addYear') }}</button>
          <button v-if="selectedYear && selectedYear !== '__unclassified__'" key="edit-year" @click="editYearLabel" class="btn-base btn-toned"><AppIcon scale="sm" name="edit" />{{ tt('watched.editYear') }}</button>
          <button v-if="selectedYear && selectedYear !== '__unclassified__'" key="del-year" @click="openDeleteYearDialog" class="btn-base btn-danger"><AppIcon scale="sm" name="trash" />{{ tt('watched.deleteYear') }}</button>
        </transition-group>
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
      <!-- 需求 B：表格卡片**不再**自带「☰ 作品名称 / 共 N 条」标题行 ——
           下面的 <thead> 已经列出完整列名（#/作品名称/日期/链接/备注），
           再叠一个同名伪标题既重复又白占一行；「共 N 条」计数已上提到本页
           顶部第一张卡片的标题行（.stat-chip）与顶栏（setPageStats）。 -->
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
            <td :colspan="batchMode?6:5" class="py-10">
              <!-- 空态三段式：图标 + 主文案（+ 副说明）。
                   副说明原为「支持单个年份(2025)或年份范围(2014~2017)」——那是**年份标签格式**的说明，
                   已挂到年份筛选触发器与「添加年份」弹窗的标签上；空态只保留主文案。 -->
              <div class="empty-state">
                <AppIcon scale="xl" name="emptyBox" class="empty-state-icon" />
                <p class="empty-state-title">{{ searchQuery ? tt('watched.emptyNoMatch') : (selectedYear === '__unclassified__' ? tt('watched.emptyUnclassified') : tt('watched.emptyYear', { year: selectedYear })) }}</p>
              </div>
            </td>
          </tr>
          <tr v-for="(item,idx) in paginatedList" :key="item.id"
            :data-row-id="item.id"
            class="cursor-pointer transition-all duration-200 border-b border-white/10 list-item group"
            :class="[batchMode && checkedIds.includes(item.id)?'bg-danger/10':selected?.id===item.id?'bg-primary/10':idx%2===0?'bg-white/20':'bg-white/40']"
            @click="batchMode?toggleCheck(item.id):selectItem(item)"
            @dblclick="onRowDblclick($event)"
            @contextmenu.prevent="!batchMode && openContextMenu($event,item)"
            @mousedown.middle.prevent="openItemLink(item)">
            <td v-if="batchMode" class="text-center px-2 py-2.5" @click.stop="toggleCheck(item.id)" @dblclick.stop>
              <div role="checkbox" tabindex="0" :aria-checked="checkedIds.includes(item.id) ? 'true' : 'false'"
                :aria-label="tt('card.checkLabel', { name: item.name })"
                @keydown.enter.prevent="toggleCheck(item.id)" @keydown.space.prevent="toggleCheck(item.id)"
                class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all mx-auto"
                :class="checkedIds.includes(item.id)?'bg-primary border-primary':'border-gray-300 bg-white/80 hover:border-primary'">
                <svg v-if="checkedIds.includes(item.id)" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
              </div>
            </td>
            <td class="text-center px-2 py-2.5 text-xs text-gray-400 font-mono">{{ idx+1 }}</td>
            <td class="px-3 py-2.5 editable-cell" v-bind="editCellProps(item, 'name')"
              @dblclick.stop="onFieldDblclick(item, 'name')"
              @keydown="onCellKeydown($event, item, 'name')">
              <input v-if="editing?.id===item.id&&editing?.field==='name'" v-model="editValue"
                :aria-label="tt('card.editWorkNameLabel', { name: item.name })"
                @blur="saveEdit" @keyup.enter="saveEdit" @keyup.escape="cancelEdit" class="inline-edit-input w-full" autofocus />
              <!-- 作品名称 + 标签同排（标签在名称右侧）：
                   不新增 td（既有列索引的测试断言不受影响），也不另起一行
                   —— 否则带标签的行会比无标签的行高、整张表行高参差。
                   名称允许 ellipsis 收缩，标签按自身宽度靠右，整块不撑出 td。
                   标签 chip 不可点（编辑走弹窗），所以不进 Tab 序。 -->
              <div v-else class="name-with-tags">
                <span class="text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors truncate">{{ item.name }}</span>
                <ItemTags v-if="item.tags" :tags="item.tags" :max="3" />
              </div>
            </td>
            <td class="px-3 py-2.5 editable-cell" v-bind="editCellProps(item, 'watch_date')"
              @dblclick.stop="onFieldDblclick(item, 'watch_date')"
              @keydown="onCellKeydown($event, item, 'watch_date')">
              <input v-if="editing?.id===item.id&&editing?.field==='watch_date'" v-model="editValue"
                :aria-label="tt('card.editDateLabel', { name: item.name })"
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
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页（独立卡片：正文直接是翻页控件。
         需求 B：去掉「共 N 条」卡片标题行 —— 计数已上提到本页顶部第一张卡片的
         标题行右侧，此处再写一遍即为同一页面内的第三次重复。 -->
    <div v-if="filteredList.length > 0" class="glass rounded-2xl shadow-lg border border-white/30 px-6 py-4">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-2 text-sm text-gray-600">
          <div class="relative inline-block">
            <button @click="showPageSizeMenu=!showPageSizeMenu"
              class="btn-base btn-sm btn-neutral page-size-trigger">
              <AppIcon scale="xs" name="listCheck" />{{ tt('remaining.perPage', { n: pageSize }) }}<AppIcon scale="xs" name="caretDown" />
            </button>
            <!-- 与等待更新页完全一致：同样宽度、同样 nowrap、同样向上展开的 pop 过渡 -->
            <transition name="pop">
              <div v-if="showPageSizeMenu" role="menu"
                class="page-size-menu app-menu-surface absolute left-0 bottom-full mb-1 z-50 rounded-xl shadow-2xl border border-white/40 py-1 min-w-[12rem] app-menu-surface"
                style="--pop-origin-y: bottom; --pop-from-y: 6px">
                <button v-for="s in pageSizeOptions" :key="s" role="menuitem" @click="setPageSize(s)"
                  class="w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition whitespace-nowrap" :class="pageSize===s?'text-primary font-bold':'text-gray-700'">{{ tt('remaining.perPage', { n: s }) }}</button>
                <div class="border-t border-gray-200/60 my-1"></div>
                <div class="px-3 py-2 flex items-center gap-2 whitespace-nowrap">
                  <input v-model="customPageSize" type="number" min="1" :placeholder="tt('common.custom')"
                    class="w-[4.5rem] shrink-0 px-2 py-1 border border-primary/20 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white" @keyup.enter="applyCustomPageSize" />
                  <button @click="applyCustomPageSize" class="btn-base btn-sm btn-link shrink-0">{{ tt('common.confirm') }}</button>
                </div>
              </div>
            </transition>
            <div v-if="showPageSizeMenu" class="fixed inset-0 z-40" @click="showPageSizeMenu=false"></div>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button :disabled="currentPage<=1" @click="currentPage--"
            class="btn-base btn-sm" :class="currentPage<=1 ? 'btn-neutral' : 'btn-toned'">{{ tt('watched.prevPage') }}</button>
          <template v-for="p in displayPages" :key="p">
            <span v-if="p==='...'" class="px-2 text-xs text-gray-400">...</span>
            <button v-else @click="currentPage=p"
              class="btn-base btn-sm" :class="p===currentPage ? 'btn-primary font-bold' : 'btn-neutral'">{{ p }}</button>
          </template>
          <button :disabled="currentPage>=totalPages" @click="currentPage++"
            class="btn-base btn-sm" :class="currentPage>=totalPages ? 'btn-neutral' : 'btn-toned'">{{ tt('watched.nextPage') }}</button>
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
        <div class="app-dialog app-menu-surface rounded-xl shadow-2xl border border-white/40 py-1 min-w-[10rem] context-menu">
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
          <div class="relative glass rounded-2xl shadow-2xl w-[26.25rem] border border-white/40 pointer-events-auto app-dialog" ref="clearDialogRef" role="dialog" aria-modal="true" aria-labelledby="watched-clear-title">
            <div class="px-6 py-5 text-center">
              <div class="text-4xl mb-3" aria-hidden="true"><AppIcon scale="sm" name="clear" /></div>
              <h3 id="watched-clear-title" class="text-lg font-bold text-gray-800 mb-2">{{ tt('clearScope.title') }}</h3>
              <p class="text-sm text-gray-500 mb-4">{{ tt('clearScope.hint') }}</p>
              <div class="flex flex-col gap-3">
                <button @click="doClearYear" class="btn-base btn-toned">
                  {{ tt('clearScope.clearYear', { year: selectedYear }) }}
                </button>
                <button @click="doClearAll" class="btn-base btn-danger">
                  {{ tt('clearScope.clearAll') }}
                </button>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-white/20 flex justify-center">
              <button @click="showClearDialog=false" class="btn-base btn-neutral">{{ tt('common.cancel') }}</button>
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
                  <span class="inline-flex items-center gap-1 border-b border-dashed border-gray-400/50 cursor-help"
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
                  <button @click="formTime=''" class="btn-base btn-sm btn-neutral shrink-0">{{ tt('record.clearTime') }}</button>
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
                  <span class="inline-flex items-center gap-1 border-b border-dashed border-gray-400/50 cursor-help"
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
                <span class="inline-flex items-center gap-1 border-b border-dashed border-gray-400/50 cursor-help"
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
import { setPageStats } from '../composables/usePageStats'
import { openExternal } from '../composables/useEpisode'
import { placeContextMenu } from '../composables/useContextMenu'
import { useDialogFocus } from '../composables/useDialogFocus'
import { useI18n } from '../composables/useI18n'
import { useErrorText } from '../composables/useErrorText'

const { tt } = useI18n()
const { errorText } = useErrorText()

const years = ref([])
const watchedList = ref([])
const selected = ref(null)
const selectedYear = ref('')

// ===== 年份下拉菜单（与 TagFilter 同一套交互与样式）=====
const showYearMenu = ref(false)
const yearTriggerRef = ref(null)
const yearMenuRef = ref(null)
const yearMenuPos = ref({ left: 0, top: 0 })

const yearMenuStyle = computed(() => ({
  left: `${yearMenuPos.value.left}px`,
  top: `${yearMenuPos.value.top}px`,
}))

/** 触发按钮上的文案：当前年份 / 全部 / 未归类 */
const yearMenuLabel = computed(() => {
  if (selectedYear.value === '__all__') return tt('watched.allYears')
  if (selectedYear.value === '__unclassified__') return tt('watched.unclassified')
  return selectedYear.value || tt('watched.allYears')
})

const measureYearMenu = () => {
  const btn = yearTriggerRef.value
  const menu = yearMenuRef.value
  if (!btn) return
  const b = btn.getBoundingClientRect()
  const w = menu?.offsetWidth || 160
  const h = menu?.offsetHeight || 200
  const gap = 6
  const margin = 8
  const left = Math.min(Math.max(b.left, margin), Math.max(margin, window.innerWidth - w - margin))
  let top = b.bottom + gap
  if (top + h > window.innerHeight - margin) top = b.top - h - gap
  yearMenuPos.value = { left: Math.round(left), top: Math.round(Math.max(margin, top)) }
}

const toggleYearMenu = async () => {
  showYearMenu.value = !showYearMenu.value
  if (showYearMenu.value) {
    await nextTick()
    measureYearMenu()
  }
}

/**
 * 选择某年：切换后重新拉数据。
 * 注意：即使选的是当前已选中的年份也要重新拉——
 * 首次挂载时 selectedYear 可能已经是默认值但数据还没加载完，
 * 早退会让"再点一次当前年份"什么都不发生（测试里正是这个场景）。
 */
const pickYear = async (label) => {
  showYearMenu.value = false
  selectedYear.value = label
  await fetchData()
}

// 点击外部 / Esc / 滚动时关闭
const onYearDocClick = (e) => {
  if (!showYearMenu.value) return
  if (yearTriggerRef.value?.contains(e.target)) return
  if (yearMenuRef.value?.contains(e.target)) return
  if (e.target.closest?.('[role="menu"]')) return
  showYearMenu.value = false
}
const onYearKeydown = (e) => {
  if (e.key === 'Escape' && showYearMenu.value) showYearMenu.value = false
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
      else showToast(errorText(res.data, tt, 'toast.batchDeleteFailed'),'error')
    } catch { showToast(tt('toast.batchDeleteFailed'),'error') }
  } else if (confirmAction.value === 'clear') {
    try {
      if (clearScope.value === 'year') {
        // 清空当前年份
        const yearItems = watchedList.value.map(i => i.id)
        if (yearItems.length === 0) { showToast(tt('toast.noRecordThisYear'),'warning'); return }
        const res = await batchApi.batchDeleteWatched(yearItems)
        if (res.data.success) { showToast(tt('toast.yearCleared', { year: selectedYear.value })); selected.value=null; batchMode.value=false; checkedIds.value=[]; await fetchData() }
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
    name:'',
    watch_date: isRealYear(selectedYear.value) ? selectedYear.value : todayStr(),
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
      else showToast(errorText(res.data, tt, 'toast.addFailed'),'error')
    } else {
      const res = await watchedApi.update(selected.value.id, form.value)
      if (res.data.success) { showToast(tt('toast.historyUpdated')); showDialog.value=false; selected.value=null; await fetchYears(); await fetchData() }
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
  // 年份下拉的关闭监听（点击外部 / Esc）
  document.addEventListener('click', onYearDocClick)
  document.addEventListener('keydown', onYearKeydown)
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

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('click', onYearDocClick)
  document.removeEventListener('keydown', onYearKeydown)
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

/* 「作品名称 + 标签」同排：标签紧跟名称右边（不被推到列最右侧）。
   名称用 flex:0 1 auto + ellipsis：名称长时先截断名称，标签保持完整；
   标签用 flex:0 0 auto：自己不被压扁，放不下时靠容器的 overflow 裁掉。
   无标签时只剩名称，行高与其它行完全一致（标签绝不另起一行）。 */
.name-with-tags {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}
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
</style>
