# 已看历史 / 导入 Excel / 应用外壳 —— 前端审计报告

- 项目：`D:\Files\Projects\Project-Banager`（分支 `review/full-audit`，HEAD `0f55e61`）
- 审计范围：`src/views/WatchedView.vue`、`src/views/ImportView.vue`、`src/App.vue`、`src/components/ToastHost.vue`，以及它们与 `src/db/api.js`、`src/db/excelImporter.js`、`src/db/index.js`、`src/composables/useDatePicker.js` 的契约
- 方式：只读源码 + `@vue/test-utils` 组件级测试（mock 数据层，组件用真实实现）
- 测试：`tests/watched-import.test.js`，52 条用例（31 通过 / 21 条为缺陷复现的 `it.fails`），`pnpm exec vitest run tests/watched-import.test.js` 退出码 0
- 结论：**P0 × 1、P1 × 4、P2 × 11、P3 × 9**，共 25 项。其中 21 项有自动化用例锁定，4 项标注 `(待证实)`（依赖真实浏览器/真机量化）

> 说明：`it.fails` 用例断言的是「期望行为」，当前源码不满足，因此以「预期失败」形式保留；套件整体仍是绿色。对应缺陷修复后该用例会变成「意外通过」并报红，届时把 `it.fails` 改回 `it` 即为回归保护。

| 级别 | 数量 | 概述 |
| --- | --- | --- |
| P0 | 1 | 备份恢复零校验，且先 `close()` 再建库：坏文件让数据库实例失效，异库文件静默清空数据且无快照可回滚 |
| P1 | 4 | 年份范围分组不匹配区间内记录；批量勾选跨年/跨页残留；导入把任意首行单元格当成年份；大文件导入主线程 O(n²) |
| P2 | 11 | 导入无事务且全失败仍报成功、无追番表误报、年份改名/删除/新增后列表与下拉不同步、保存路径缺校验、日期精度丢失、排序键错乱、选中残留、恢复竞态、导入中途切路由 |
| P3 | 9 | 文件类型/大小校验、同文件无法重选、导出 revoke 时机、备份标签不刷新、Toast 无障碍与生命周期、表格/弹窗无障碍、Esc 行为、清空文案与默认年份、搜索词跨年 |

---

## 缺陷清单

### [P0] 备份恢复零校验：坏文件让数据库实例失效，合法异库文件直接覆盖 IndexedDB 且不可回滚

- **文件**：`src/App.vue:212-229`；`src/db/index.js:88-98`（`importDb`）、`src/db/index.js:134-207`（`initTables` 末尾 `this.save()`）
- **现象/证据**：
  - `onBackupFileChosen` 只取 `files[0]`，`confirmImportDb` 直接 `file.arrayBuffer()` → `db.importDb(new Uint8Array(buffer))`，全程没有 magic header（`SQLite format 3\0`）、表结构或记录数校验；`accept=".db,.sqlite,.bak"` 只是文件选择器提示（`src/App.vue:49`）。
  - `importDb` 的实现顺序是「先 `this.db.close()`，再 `new _SQL.Database(data)`」。若数据不是 SQLite，构造函数抛异常，`this.db` 仍指向**已关闭**的实例；`getDb()` 返回的是同一个单例，于是此后 `getAllWatching()` / `addWatched()` 全部抛 `database is closed`，整个应用假死到用户手动刷新为止。此时 `save()` 未执行，磁盘数据尚在，但界面已无法自愈。
  - 若文件是**合法但不含本应用表**的 SQLite（例如随手选中的 `cookies.sqlite`、其它工具导出的 `.db`），`new Database` 成功 → `initTables()` 建出空表 → `initTables` 末尾 `this.save()` 把这份空库写回 IndexedDB → `confirmImportDb` 再 `db.save()` → 900ms 后 `location.reload()` 固化。用户原有数据在 IndexedDB 中被覆盖，且恢复前没有导出快照，**不可回滚**。
  - 恢复失败分支也不重载、不重建实例，用户只能自己刷新。
- **最小复现**：
  1. 正常录入几条已看记录（确保 IndexedDB 有数据）。
  2. 用记事本存一个 `x.db`，内容写 `hello`，在侧边栏点「导入恢复」→ 选它 → 确认导入 → 观察到错误 Toast，然后点任意「删除/添加」，控制台抛 `database is closed`。
  3. 另存一个合法 SQLite（任意别的应用产生的 `.db`）再导入一次 → 提示「导入成功！页面即将刷新」→ 刷新后已看/追番/等番全部为空。
- **期望 vs 实际**：期望恢复前校验文件头与表结构、失败时保持旧库可用、恢复前自动导出一份当前库作为回滚点、成功后由应用内状态刷新而不是整页 reload；实际是零校验 + 先关后建 + 静默覆盖 + 无快照。
- **建议修复**：`confirmImportDb` 里先读前 16 字节比对 `SQLite format 3\u0000`，再用一个临时数据库实例 `new SQL.Database(bytes)` 校验 `watched/watching/remaining` 表是否存在，全部通过后再替换；`importDb` 改为「新实例建好再 swap」，`close()` 放到 swap 之后（失败时不碰旧实例）；替换前调用一次 `export()` 落一份 `pre-restore-<ts>.db` 或写入 IndexedDB 的 `bak` key；`db.save()` 改成 `await`（见 #15）。
- **用例**：`[缺陷#01] 恢复前应先导出一份当前库做快照`、`[缺陷#01] 非 SQLite 文件应在触库前被拒绝（magic header 校验）`

### [P1] 年份范围分组「2014~2017」只做等值匹配：区间内记录查不到，且同一记录会重复出现在「未分类」

- **文件**：`src/views/WatchedView.vue:676-687`（未分类过滤）、`src/views/WatchedView.vue:689-694`（按年查询）；`src/db/index.js:458-468`（`getWatchedByYear` / `getWatchedCountByYear`）
- **现象/证据**：
  - `getWatchedByYear(year)` 的 SQL 是 `watch_date = ? OR watch_date LIKE ?`（`year + '/%'`）。当 `year = '2014~2017'` 时只能命中**字面量** `watch_date = '2014~2017'` 的记录（导入时列头就写这个字符串，所以纯导入的数据看起来是对的）。任何真实日期落在 2014–2017 的记录（手工新增时选 2016/03、从追番移入时填的日期、行内编辑改成 2015/07）都不会出现在该分组里。
  - 反过来，「未分类」用 `extractAllYears(item.watch_date)` 把范围展开成 `['2014'…'2017']`，再和 `new Set(years.map(y => y.year_label))` 比对——集合里是字面量 `'2014~2017'`，展开后的单年永远不在集合里，于是 `!some(...)` 恒为真：**范围分组的记录全部被判为「未分类」**。同一条记录既能从「2014~2017」看到，又能从「未分类」看到，两个分组的计数互相矛盾。
  - 受影响的连带项：`getWatchedCountByYear('2014~2017')` 只统计字面量记录，`本年: N部` 与列表行数在跨年场景下会对不上。
- **最小复现**：
  1. 「添加年份」建 `2014~2017`，在该年份下新增一条记录（默认日期会被预填为 `2014~2017`）。
  2. 双击日期单元格改成 `2016/03` 并回车。
  3. 切到「2014~2017」→ 列表为空；切到「未分类」→ 这条记录出现（它明明属于该范围）。
- **期望 vs 实际**：期望年份分组按「标签解析成区间集合」匹配记录，未分类 = 不属于任何分组的记录；实际是范围标签只做字符串等值，未分类把范围记录重复收编。
- **建议修复**：把年份标签统一解析成 `{start, end}` 区间（单个年份 start=end），`getWatchedByYear` 改为按 `watch_date` 取出年份后区间判断（或在 SQL 里对单年标签展开成 `IN (...)`）；「未分类」用同一套区间判定（`years.some(y => inRange(itemYear, y))`），并复用 `extractAllYears` 的展开结果而不是原始标签集合。
- **用例**：`[缺陷#02] 「2014~2017」分组应包含落在区间内的年份记录`、`[缺陷#02] 「未分类」不应重复收录已属于范围分组的记录`

### [P1] 批量勾选跨年、跨页残留：`isAllChecked` 用长度相等判断，会误报「已全选」并把不可见记录一起删掉

- **文件**：`src/views/WatchedView.vue:490-498`（状态与 `toggleBatchMode`）、`:509-517`（`toggleCheck` / `toggleSelectAll`）、`:519-524`（`batchDelete`）、`:606-613`（删除执行）
- **现象/证据**：
  - `isAllChecked = paginatedList.length > 0 && checkedIds.length === paginatedList.length`——只比较**数量**，不比较集合。第 1 页全选 20 条后翻到第 2 页（同样 20 条、一条未勾），`20 === 20` 成立，表头复选框显示「已勾」，按钮文案变成「取消全选」；此时点它会把 20 条全部取消，而不是全选本页。
  - `checkedIds` 在 `fetchData()`（切年份、搜索、刷新）之后从不清空：`toggleBatchMode` 只在进入/退出批量模式时清，`@change="fetchData"` 没有任何清理。切到另一年后底部仍显示「已选择 2 项」，点「批量删除 (2)」调用 `batchApi.batchDeleteWatched([旧年 id…])`，**删除的是当前页面上完全看不见的另一年的记录**。
  - 搜索框同理：先勾选、再输入搜索词把记录过滤掉，勾选数量仍在，批量删除会删掉被过滤掉的记录。
- **最小复现**：
  1. 某年放 40 条记录（每页 20）。
  2. 进入批量选择 → 全选第 1 页 → 点「下一页」→ 观察表头复选框为勾选态、按钮显示「取消全选」，而本页没有任何行被勾。
  3. 回到第 1 页勾 2 条 → 年份下拉切到另一年 → 底部仍显示「已选择 2 项」→ 点「批量删除 (2)」→ 上一年那 2 条被删。
- **期望 vs 实际**：期望 `isAllChecked` 用「本页 id 全部包含于 checkedIds」判断；期望切换年份/搜索条件变化时清空勾选或至少提示跨页选中数；实际是数量相等误判 + 选择集跨上下文泄漏。
- **建议修复**：`isAllChecked = paginatedList.every(i => checkedIds.includes(i.id)) && paginatedList.length > 0`；在 `fetchData`（或 `watch([selectedYear, searchQuery])`）里 `checkedIds.value = []`；批量删除确认框里回显「其中 N 条不在当前筛选结果中」。
- **用例**：`[缺陷#03] 跨页勾选后本页「全选」状态不应误判`、`[缺陷#03] 切换年份应清空批量勾选，避免删除其它年份的记录`

### [P1] 导入把首行任意单元格当成年份：数值序号列 / 标题行会造出「1」「我的已看清单」等假年份组和垃圾记录

- **文件**：`src/db/excelImporter.js:83-97`（`parseYear`）、`:286-301`（`headerRow = data[0]` + `colYearMap`）、`:305-311`（写 `watched_years`）、`:314-349`（逐列逐行写 `watched`）
- **现象/证据**：
  - `parseYear` 在找不到 4 位数字时**原样返回字符串**（`return str`），数字类型则直接 `String(rawYear)`。`importWatched` 又把 `data[0]` 的**每一个非空单元格**都当表头年份。
  - 因此任何「首行不是纯年份表头」的已看表都会污染数据：
    - `['序号','2025']` → `parseYear('序号') = '序号'`、`parseYear(2025) = '2025'`；随后第 2 行 `[1,'甲']` 把数字 1 当成番剧名写入 → `addWatched({name:'1', watch_date:'序号'})`。用例实测 `addWatched` 收到的 name 序列是 `['1','2','甲','乙']`，并建出 `year_label='1'` 的年份组。
    - 首行是标题 `['我的已看清单']` → 整表只有一列，年份标签变成 `'我的已看清单'`，真正的年份行 `['2025','2024']` 被当成数据，写入 `name:'2025'`。
  - 这两类垃圾记录会出现在「全部年份」和「未分类」里，且无法通过 UI 批量识别（年份组名就是错的）。
- **最小复现**：
  1. 新建 xlsx，工作表命名「已看」，A1=`序号`、B1=`2025`；A2=1、B2=`甲`；A3=2、B3=`乙`。
  2. 导入页选择该文件 → 开始导入。
  3. `成功导入 4 条`，已看历史里多出「1」「2」两条记录，年份下拉多出「序号」和「1」。
- **期望 vs 实际**：期望只有「能解析出 1900–2100 年份或年份区间」的表头列才建组，解析失败应记 warning 并跳过该列；期望首行是标题时能向下探测真正的年份表头行；实际是无条件建组 + 任意单元格原样当标签。
- **建议修复**：`parseYear` 失败返回 `null` 而不是原字符串；`importWatched` 只接受 `null` 之外的合法年份（正则 `^\d{4}$` 或 `^\d{4}~\d{4}$`），并对表头行做「至少 1 个合法年份列」的前置校验，不满足则向下找最多 5 行；数字单元格若不是 4 位年份一律视为无效列。
- **用例**：`[缺陷#04] 数值序号列不应被当成「年份」导入`、`[缺陷#04] 标题行不应导致整表年份错位`

### [P1] 大文件导入在主线程逐行「全库导出 + 写 IndexedDB」，复杂度 O(n²)，无 Worker、无进度 (待证实)

- **文件**：`src/db/excelImporter.js:314-349`（逐行 `db.addWatched`）、`:380-387`（三个 sheet 串行同步处理）；`src/db/index.js:272-275`（`_run` 每次 `save()`）、`:77-80`（`save()` → `db.export()`）、`:765-778`（`saveToIndexedDB` 每次一个 readwrite 事务且不 await）
- **现象/证据**：
  - `XLSX.read` 与整个导入循环没有任何 `await`/分片/`requestIdleCallback`，全部在 UI 线程同步执行。
  - 每写一行都经过 `addWatched → _run → this.db.run() + this.save()`，而 `save()` = `this.db.export()`（把**整库**序列化一遍）+ `saveToIndexedDB()`（一次独立事务）。N 行即 N 次全库序列化，累计拷贝量 O(N²)，同时向 IndexedDB 排队 N 个 readwrite 事务。
  - 导入页只有「正在导入数据...」一行日志，没有行级进度、没有取消入口，也没有大小上限（见 #17）。文件一大，页面从点击到完成全程无响应，用户会以为卡死并强制刷新——刷新可能打断尚未完成的 IndexedDB 写入。
- **最小复现**：构造一个「已看」表 3000 行的 xlsx（每行一个名称 + 年份列），导入并观察 DevTools Performance：主线程长任务持续到结束、`db.export` 调用次数等于行数；期间点击任意按钮无响应。
- **期望 vs 实际**：期望批量写库（一次事务、一次落盘）、解析放 Web Worker、有进度与取消；实际逐行落盘、全同步、零进度。
- **建议修复**：给 `db/index.js` 增加 `beginBatch()/commitBatch()`（`_run` 在批处理中跳过 `save()`，结束时统一 `save()` 一次）；`importExcel` 每 200 行 `await new Promise(r => setTimeout(r))` 让出主线程并通过回调上报进度；`XLSX.read` 与解析放进 Worker（或至少用 `FileReader` + 分片），ImportView 增加进度条与「取消」。
- **用例**：无自动化用例（需要真实浏览器量化）；调用链与 O(n²) 结构已由源码确认。

### [P2] 导入没有事务：失败行不回滚，全部失败仍返回 `success: true`，UI 弹绿色成功提示

- **文件**：`src/db/excelImporter.js:358-395`（尤其 `:389-394`）、`:328-347`（逐行 try/catch，失败仅 `errors.push`）；`src/views/ImportView.vue:125-141`（`result.success` 分支 + 绿色 Toast）
- **现象/证据**：
  - 每行独立 `addWatched` 并立即 `_run → save()`，中途任何异常都不会撤销已写入的行；用户看到「成功导入 N 条，失败 M 条」时，库里已经是**部分数据**。
  - `importExcel` 的返回值恒为 `{ success: true, ... }`（只要没在读文件阶段抛错），甚至 `imported === 0 && errorCount > 0` 也是成功。ImportView 因此走 `showToast(result.message)`（默认 `success` 绿色）并打印 `✓ ...`。
  - 已看表没有 UNIQUE 约束，失败后重试会与已写入的部分重复；追番/等番有 UNIQUE，重试则全部报「已存在」。
- **最小复现**：导入一个所有行都会失败的文件（例如目标库里同名的追番已存在，或把 `addWatched` 打桩成返回失败）→ 日志显示 `✓ 导入完成！成功导入 0 条数据，失败 3 条`，右上角绿色成功 Toast。
- **期望 vs 实际**：期望 `imported === 0 && errors.length > 0` 时返回 `success: false` 并用 error 样式展示，整批导入放进一个事务；实际是「零成功也算成功」+ 无回滚。
- **建议修复**：`success: importedCount > 0 || errorCount === 0`；`message` 按结果分级；`importExcel` 外层包 `BEGIN/COMMIT/ROLLBACK`（sql.js 支持），或复用 #05 的批量接口；对「已看」表按 `(name, watch_date)` 做存在性检查再插入。
- **用例**：`[缺陷#06] 全部行失败时不应返回 success:true`

### [P2] 找不到「追番」工作表时回落 `SheetNames[0]`：纯已看工作簿必然被误报「未找到星期表头」，也可能误导入

- **文件**：`src/db/excelImporter.js:104-113`
- **现象/证据**：`importWatching` 找不到名字含「追番/Watching」的表时不清空返回，而是 `sheetName = workbook.SheetNames[0]`，把第一个 sheet 当周历解析。只含「已看」表的文件必然命中 `headerRow === -1`，于是 `errors.push('未找到追番表的星期表头行')`——一次完全正常的导入会显示「⚠️ 警告/错误」块。若首个 sheet 恰好含「周一」「Tuesday」等字样（例如备注里写了「每周一更新」），还会把该 sheet 的文本当成番剧名写进 `watching`。
- **最小复现**：做一个只有「已看」工作表的 xlsx，导入后日志出现 `⚠️ 警告/错误: • 未找到追番表的星期表头行`，而数据其实全部导入成功。
- **期望 vs 实际**：期望没有对应 sheet 就静默跳过（与 `importRemaining` 的 `if (!sheetName) return` 一致）；实际回落到首个 sheet 并产生噪声/误导入。
- **建议修复**：删掉回落逻辑，`if (!sheetName) return`；若确实要兼容「单表即追番」的老模板，则要求表内存在 ≥2 个星期关键词才认领，否则跳过且不报错。
- **用例**：`[缺陷#07] 没有「追番」工作表时不应报「未找到星期表头」`

### [P2] 年份改名只改标签、不迁移记录：整组记录会从分组视图里消失

- **文件**：`src/views/WatchedView.vue:749-772`（`saveYearForm` 的 update 分支）
- **现象/证据**：`watchedYearsApi.update(id, { year_label })` 只更新 `watched_years` 表，`watched.watch_date` 里仍是旧值；随后 `fetchYears()` + `selectedYear = 新标签` + `fetchData()`，而 `getWatchedByYear('2025~2026')` 只匹配 `= '2025~2026'` 或 `LIKE '2025~2026/%'`，旧记录一条都匹配不上 → 列表瞬间清空。记录要等到「全部年份」或「未分类」才能再看到（且未分类还会因 #02 逻辑把它们算进来）。
- **最小复现**：某年「2025」下有 3 条记录 → 「编辑年份」改成 `2025~2026` → 保存 → 列表变空，`总计` 仍显示 3。
- **期望 vs 实际**：期望改名时同步把该组记录的 `watch_date` 迁到新标签（或至少弹二次确认说明「记录不会自动迁移」）；实际是静默脱钩。
- **建议修复**：`updateWatchedYear` 时按旧标签批量 `UPDATE watched SET watch_date = ? WHERE watch_date = ? OR watch_date LIKE ?`；或在 UI 层先 `batchApi` 迁移再改标签，失败则回滚标签。
- **用例**：`[缺陷#08] 年份改名后原有记录不应掉出分组`

### [P2] 删除最后一个年份后列表残留旧数据（`selectedYear` 被清空，`fetchData` 直接 return）

- **文件**：`src/views/WatchedView.vue:633-640`（`deleteYear` 分支）、`:666-667`（`fetchData` 首行 `if (!selectedYear.value) return`）
- **现象/证据**：删除年份成功后若 `years.length === 0`，`selectedYear.value = ''`，紧接着 `await fetchData()` 在第一行就返回，`watchedList` 保持删除前的数组 —— 表格继续显示已删年份的记录，「本年/总计」也还是旧数字，用户会以为删除失败；再点「删除」还会去删这些“幽灵”记录。
- **最小复现**：只保留一个年份（组内有 2 条记录）→ 删除该年份 → 表格仍显示那 2 条。
- **期望 vs 实际**：期望年份删光后列表清空、显示空态；实际是上一份 `watchedList` 原样留在页面上。
- **建议修复**：`deleteYear` 在 `selectedYear` 置空时显式 `watchedList.value = []; yearCount.value = 0`；或让 `fetchData` 在无选中时也清空列表而不是 return。
- **用例**：`[缺陷#09] 删除最后一个年份后列表应清空`

### [P2] 新增/编辑记录后不刷新「年份」下拉：新日期带来的年份组要等重进页面才出现

- **文件**：`src/views/WatchedView.vue:840-849`（`saveForm` 只调 `fetchData`）、`:651-664`（`fetchYears` 只在 mounted / 年份增删时调用）；写入侧 `src/db/index.js:438-450`（`addWatched` → `_ensureYearLabel` 会自动建年份）
- **现象/证据**：`db.addWatched` 会用 `_ensureYearLabel(watch_date)` 自动往 `watched_years` 插一条新年份，但视图中 `years` 只在 `fetchYears()` 时更新，新增/编辑成功路径只 `await fetchData()`。于是「2019」这个年份已经在库里，下拉里却看不到，当前列表也仍停在旧年份；用户只能靠「全部年份」或刷新页面确认。
- **最小复现**：在「2025」年份视图下点「添加记录」，名称随便填、日期选 `2019-04-01`、保存 → 年份下拉里没有 2019；F5 刷新后才出现。
- **期望 vs 实际**：期望保存成功后 `await fetchYears()`（并按新记录年份切换选中）；实际只刷新记录列表。
- **建议修复**：`saveForm` 成功分支加 `await fetchYears()`；或让 `fetchData` 每次先 `fetchYears()`（注意避免 `selectedYear` 被默认值覆盖）。
- **用例**：`[缺陷#10] 新增记录后年份下拉应刷新（新日期带来的新年份）`

### [P2] 保存路径缺校验：行内编辑可写入任意字符串日期，弹窗里手填的时间也不校验

- **文件**：`src/views/WatchedView.vue:718-731`（`saveEdit`）、`:822-839`（`saveForm`，尤其 `:833-839` 的时间拼接）
- **现象/证据**：
  - `saveEdit` 只比较 `editValue !== originalValue` 就直接 `watchedApi.update(id, { [field]: editValue })`，从不调用 `validateDate`。双击日期单元格输入「不是日期」→ 直接落库；该记录随后 `extractYear` 为 `null`，从所有年份分组里消失（只能去「未分类」找）。
  - `saveForm` 的校验顺序是「先 `validateDate(watch_date)`，再把 `formTime` 直接拼上」。时间输入框是自由文本（`:299-300`），`25:99`、`abc` 都能拼成 `2025/07/15 25:99` 落库，因为拼完没有再校验一次。
  - 失败分支（`res.data.success === false`）只弹一条 Toast 就 `editing.value = null`，用户刚输入的内容被丢弃，无法重试。
- **最小复现**：双击任意记录的日期 → 输入 `abc` → 回车 → 无任何报错，单元格显示 `abc`，该记录从年份分组消失；或打开「添加记录」→ 切「手动输入」时间 → 填 `99:99` → 保存 → 详情里是 `2025/xx/xx 99:99`。
- **期望 vs 实际**：期望与弹窗一致地走 `validateDate`（行内编辑失败时保留输入框并提示）；期望时间拼接后再整体校验一次；实际是全部直接落库。
- **建议修复**：`saveEdit` 对 `field === 'watch_date'` 先 `validateDate` 并用 `normalized` 值提交，失败则 `showToast(validation.error,'error')` 且保持编辑态；`saveForm` 在拼完时间后统一 `validateDate` 一次（时间单独用 `^([01]\d|2[0-3]):[0-5]\d$` 校验）。
- **用例**：`[缺陷#11] 行内编辑非法日期时不应写库`

### [P2] 日期选择器丢精度：年 / 年月精度的记录打开编辑弹窗时日期框是空白

- **文件**：`src/views/WatchedView.vue:264-265`（`<input type="date" :value="formatToDateInput(form.watch_date)">`）、`:800-820`（`openEditDialog`）；`src/composables/useDatePicker.js:118-122`（`formatToDateInput`）
- **现象/证据**：`formatToDateInput` 只做「取空格前 + `/`→`-`」。对 `watch_date = '2025'` 得到 `2025`、对 `'2025/07'` 得到 `2025-07`，都不是 `type="date"` 的合法值（必须 `YYYY-MM-DD`），浏览器把它渲染成空输入框。用户打开编辑弹窗看到日期为空，会误以为记录没有日期；一旦点开选择器选一天，原来的「2025 全年 / 2025 年 7 月」精度就被覆盖成具体某天。
- **最小复现**：导入一条年份列记录（`watch_date='2025'`，或手工把日期改成 `2025/07`）→ 选中 → 「编辑」→ 观看日期输入框为空；直接保存不会丢值（`v-model` 未被触发），但任何一次选择都会把精度降级。
- **期望 vs 实际**：期望日期控件能表达「仅年 / 仅年月」的精度（例如上方提供「精度」下拉，或空值时回显原文），至少不应显示空白；实际是空白 + 静默降级风险。
- **建议修复**：`formatToDateInput` 返回 `''` 时在输入框旁回显 `form.watch_date` 原文并提示「当前为年/年月精度」；或改用「年 + 月 + 日」三段可选控件；保存时若用户未修改日期，保留原精度字符串。
- **用例**：`[缺陷#12] 编辑弹窗对「年月」精度记录应显示对应日期`

### [P2] `compareDateKey` 用「去掉所有非数字后比较字符串」：范围日期与非补零月份会排错位置

- **文件**：`src/composables/useDatePicker.js:126-131`；调用方 `src/views/WatchedView.vue:426-431`（默认排序字段就是 `watch_date`）
- **现象/证据**：
  - `'2014~2017'` → `'20142017'`，与 `'2017/01/01'` → `'20170101'` 比较得 `1`，范围记录被排到 2017 年之后；与 `'2014/05'` → `'201405'` 比较则排在 2014 年 5 月之后、2016 年之前——一个跨 4 年的记录被塞进某个中间位置。
  - `'2025/7'`（Excel 里以文本形式写的月份，导入后 `_normalizeDate` 只把 `-` 换成 `/`，不补零）→ `'20257'`，与 `'2025/12/31'` → `'20251231'` 比较得 `1`：7 月被排到 12 月之后。
  - 同样问题出现在 `2025-7`（导入时若为文本，`-`→`/` 后仍是 `2025/7`）。
- **最小复现**：`compareDateKey('2025/7','2025/12/31') === 1`；列表里把日期排序设为「日期 ↑」，7 月的记录排在 12 月之后。
- **期望 vs 实际**：期望比较前先规范化（补零到 `YYYY/MM/DD[ HH:mm]`），范围日期按起始年份排序且不参与同日比较；实际是按数字串字典序。
- **建议修复**：解析成 `[startYear, startMonth=0, startDay=0, startMinute=0]` 元组逐项比较（范围取 start）；或在 `validateDate`/导入时统一补零，禁止非零填充格式入库。
- **用例**：`[缺陷#13] compareDateKey：范围日期与非零填充月份不应打乱时序`

### [P2] 切换年份后 `selected` 残留：编辑/删除按钮仍指向上一年的记录

- **文件**：`src/views/WatchedView.vue:666-697`（`fetchData` 不重置 `selected`）、`:699-708`（`selectItem` / `onDocClick`）、`:35-36`（编辑/删除按钮只看 `selected`）
- **现象/证据**：`fetchData` 换了 `watchedList` 但 `selected` 仍指向旧数组里的对象；顶部「当前选中: xxx」继续显示，`openEditDialog` 用这个旧对象填表，`deleteItem` 用它的 `id` 删除。用户切到「2024」后点删除，删掉的是 2025 的那条。
- **最小复现**：在 2025 选中一条 → 年份切到 2024（列表为空）→ 顶部仍显示「当前选中: 去年的番」→ 点「删除」→ 确认 → 2025 的记录被删。
- **期望 vs 实际**：期望切换年份/重新拉取数据后清空选中；实际是选中态跨数据集存活。
- **建议修复**：`fetchData` 开始时 `selected.value = null`（或在 `watch(selectedYear)` 里清）；更彻底的做法是只保存 `selectedId`，渲染时按 id 从当前列表查找。
- **用例**：`[缺陷#14] 切换年份应清空「当前选中」，否则编辑/删除指向上一年的记录`

### [P2] 恢复成功后不等落盘就 `reload()`：`db.save()` 是「发出去就不管」的异步写入 (待证实)

- **文件**：`src/App.vue:219-224`；`src/db/index.js:77-80`、`:765-778`
- **现象/证据**：`db.save()` 内部调用 `saveToIndexedDB(data)` 但没有 `return`/`await`，`confirmImportDb` 里 `db.save()` 之后立刻 `setTimeout(reload, 900)`。大库（几十 MB）时 IndexedDB 事务可能超过 900ms；`location.reload()` 会中断未完成的事务，导致「提示导入成功但刷新后仍是旧数据」。
- **最小复现**：导入一个 30MB+ 的备份文件，观察 Application → IndexedDB 的写入耗时；或在 DevTools 里把 IndexedDB 事务节流，900ms 内刷新。
- **期望 vs 实际**：期望 `await db.save()` 完成（或等待 `tx.oncomplete`）后再重载/刷新视图；实际是固定 900ms 的乐观等待。
- **建议修复**：`save()` 返回 `saveToIndexedDB` 的 Promise，`confirmImportDb` 里 `await db.save()` 再 `location.reload()`；更优的是不整页刷新，改用 `provide/inject` 一个 `dbVersion` 自增，各视图 `watch` 后重新拉数据。
- **用例**：无（时序依赖真实 IndexedDB 性能）；源码路径确定。

### [P2] 导入过程中切走路由：日志与状态随组件销毁，回来还能再点一次导入

- **文件**：`src/views/ImportView.vue:86-98`（`logs`/`importing` 都是组件局部 ref）、`:108-154`（`startImport`）
- **现象/证据**：`logs`、`importing`、`selectedFile` 都是 `<script setup>` 内的组件状态，路由切走即销毁（`App.vue:94-98` 的 `router-view` 没有 `keep-alive`）。导入是异步的，切走后 Promise 继续执行、`addLog` 往已卸载实例的 ref 里 push（不报错但永远看不到），`importing` 也随实例消失。回到导入页是一个全新实例：日志空了、按钮可再点，同一文件可以再导入一遍（已看表无 UNIQUE，直接产生重复数据）。
- **最小复现**：选一个较大的 xlsx → 开始导入 → 立刻点侧边栏「已看历史」→ 再点回「导入Excel」→ 日志为空、按钮可点 → 再点一次开始导入 → 数据重复。
- **期望 vs 实际**：期望导入任务与路由解耦（放到 store/composable，或禁用离开），至少禁止并发导入；实际是随组件生灭。
- **建议修复**：把 `importing`/`logs` 提到模块级（`useImportJob` composable）并在 `onUnmounted` 里保留进度；用全局锁 `if (importing) return` 防重入；导入前提示「离开页面不会中断导入」。
- **用例**：无（行为由代码结构直接决定）。

### [P3] 导入页不校验文件类型与大小

- **文件**：`src/views/ImportView.vue:8`（`accept=".xlsx,.xls"` 只是选择器过滤）、`:100-106`（`onFileChange` 不看扩展名/MIME/size）
- **现象/证据**：拖入/选择任意文件（把 `.txt` 改名成 `.xlsx`、几十 MB 的 csv）都会进入 `startImport`；`XLSX.read` 对纯文本会当 CSV 解析成功，于是「导入完成！成功导入 0 条」；对超大文件则直接冻结主线程（#05）。没有任何 `file.size` 上限。
- **最小复现**：把任意 `.txt` 改名为 `a.xlsx` 导入 → 走到解析流程而不是被拒绝；选一个 100MB 文件 → 页面长时间无响应。
- **期望 vs 实际**：期望 `onFileChange` 校验扩展名 + `size < 20MB` 并给出明确提示；实际是不设防。
- **建议修复**：`if (!/\.(xlsx|xls)$/i.test(file.name)) return showToast(...,'error')`；`if (file.size > MAX) return showToast('文件过大（>20MB），请拆分后导入','error')`。
- **用例**：无（`accept` 在 jsdom 中不生效，需真实浏览器验证）。

### [P3] 同一个文件无法再次选择（文件输入框的 value 未重置）

- **文件**：`src/views/ImportView.vue:100-106`（`onFileChange` 里没有 `event.target.value = ''`）
- **现象/证据**：原生 `<input type="file">` 在选中同一路径的文件时不会触发 `change`（value 未变化）。用户导完一个文件、想「再导一次」或「改完 Excel 再导」时，重新选择同一个文件没有任何反应，日志停在原地。
- **最小复现**：选 `a.xlsx` 导入 → 修改 Excel 内容 → 再次点「浏览文件」选同一个 `a.xlsx` → 无任何日志变化。
- **期望 vs 实际**：期望每次选择都触发（处理完 `event.target.value = ''`）；实际是第二次静默失败。
- **建议修复**：`onFileChange` 末尾 `event.target.value = ''`（先保存 `file` 引用），或点击 label 前显式清空。
- **用例**：无（jsdom 无法复现原生行为）。

### [P3] 导出后立即 `revokeObjectURL`，且 `<a>` 未挂到 DOM (待证实)

- **文件**：`src/App.vue:171-180`
- **现象/证据**：`URL.createObjectURL(blob)` 之后 `a.click()` 紧接着 `URL.revokeObjectURL(url)`，中间没有等待；`a` 也从未 `document.body.appendChild(a)`。Chrome 多数情况下能兜住，但 Safari/Firefox 对「未插入文档的 `<a download>`」和「立即 revoke」有已知的下载中断行为；一旦中断，用户会得到 0 字节文件却看到「备份已导出」的绿色提示。
- **最小复现**：Safari 中导出一次，检查下载文件大小是否为 0。
- **期望 vs 实际**：期望 `appendChild` → `click()` → `remove()`，并在 `setTimeout(..., 1000)` 后再 revoke；实际是同步 revoke。
- **建议修复**：按上述顺序改写，并用 `try/finally` 保证 revoke。
- **用例**：无（需真实浏览器）。

### [P3] 「上次备份」标签不会随时间推移刷新

- **文件**：`src/App.vue:158-164`
- **现象/证据**：`backupLabel` 是 `computed`，只依赖 `lastBackupTs`；`Date.now()` 不是响应式依赖，页面开着不动时「今天」永远不会变成「1 天前」，`backupWarning`（>7 天）也不会自动亮起。
- **最小复现**：导出备份后把系统时间往后调 8 天，页面不刷新 → 仍显示「今天」且无高亮。
- **期望 vs 实际**：期望随 `currentTime` 的每秒 tick 重算，或至少每小时重算一次；实际是只在挂载/导出时计算。
- **建议修复**：`backupLabel` 里读取 `currentTime.value`（已有 1s 定时器）作为依赖，或改用 `ref` + 定时更新。
- **用例**：无。

### [P3] Toast 生命周期与无障碍：无 `aria-live`、无手动关闭、无数量上限、容器 `pointer-events-none`

- **文件**：`src/components/ToastHost.vue:2-9`；`src/composables/useToast.js:8`、`:13-20`
- **现象/证据**：容器只有 `class="fixed top-6 right-6 z-[100] ... pointer-events-none"`，没有 `role="status"` / `aria-live="polite"`，读屏软件不会播报；`pointer-events-none` 且没有关闭按钮，用户无法提前关掉挡在右上角的消息；`showToast` 不去重也不限量，循环失败（例如批量删除对每条都失败）会堆满屏幕；每个 Toast 各起一个 `setTimeout`，组件卸载时也不清理（模块级数组，影响可控但会持续增长 `seq`）。
- **最小复现**：连续触发 10 次失败操作 → 右上角叠 10 条、每条 4.5s 后才消失，且无法点击关闭；用读屏软件（NVDA）操作时不会朗读任何提示。
- **期望 vs 实际**：期望 `role="status" aria-live="polite"`、单条可关闭、同一 `message+type` 在 2s 内合并、最多显示 3–5 条；实际是纯视觉提示。
- **建议修复**：容器加 `role="status" aria-live="polite" aria-atomic="false"`；单条加关闭按钮并恢复 `pointer-events-auto`；`showToast` 内按 `message` 去重（存在则重置计时）；超过 5 条时丢弃最旧的。
- **用例**：`[缺陷#20] Toast 区域应可被读屏软件播报（aria-live）`

### [P3] 表格与弹窗的无障碍/键盘可达性缺失

- **文件**：`src/views/WatchedView.vue:64-79`（可排序 `<th @click>`、批量表头）、`:94-99`（行内勾选框是 `<div>`）、`:185-204`（自定义弹窗）
- **现象/证据**：
  - 两个排序表头只有 `@click`，没有 `tabindex`、`role="button"`、`aria-sort`，键盘用户无法排序，读屏也不知道当前排序列与方向。
  - 批量勾选框是纯 `<div class="w-4 h-4 rounded border-2 ...">`，没有 `role="checkbox"` / `aria-checked` / `tabindex`，读屏完全不可见。
  - 所有自定义弹窗（`.app-dialog`）没有 `role="dialog"` / `aria-modal="true"` / `aria-labelledby`，也没有焦点陷阱与打开时的初始焦点（只有 `autofocus` 属性，Safari 对动态插入元素不生效），关闭后焦点不归还触发按钮。
- **最小复现**：只用键盘 Tab 遍历已看页：焦点跳不到「作品名称/日期」表头，也跳不到批量勾选框；NVDA 读不出「已选 2 项」。
- **期望 vs 实际**：期望符合 WAI-ARIA Authoring Practices 的表格排序与对话框模式；实际是纯鼠标交互。
- **建议修复**：`<th tabindex="0" role="button" :aria-sort="...">` + `@keydown.enter/space`；勾选框改 `<input type="checkbox">` 或补 `role/aria-checked/tabindex` + 键盘处理；弹窗补 `role="dialog" aria-modal="true"`、`aria-labelledby`，`watch(showDialog)` 里保存并恢复 `document.activeElement`，并加简单的焦点循环。
- **用例**：`[缺陷#21] 可排序表头应可键盘触发`、`[缺陷#21] 批量勾选框应暴露 role=checkbox / aria-checked`、`[缺陷#21] 自定义弹窗应声明 role=dialog / aria-modal`

### [P3] `Esc` 漏掉「添加/编辑年份」弹窗

- **文件**：`src/views/WatchedView.vue:500-507`（`handleKeydown` 只处理 `showDialog` / `showConfirmDialog` / `showClearDialog` / `batchMode`）
- **现象/证据**：`showYearDialog` 未被判断。按 Esc 时年份弹窗不关闭；若此时还处于批量模式，Esc 会先退出批量模式并清空勾选（弹窗仍开着），表现为「按 Esc 弹窗不动，底下的选择却被清了」。
- **最小复现**：批量模式下勾 2 条 → 点「添加年份」→ 按 Esc → 弹窗仍在，「已选择 2 项」消失。
- **期望 vs 实际**：期望 Esc 优先关闭最上层弹窗且不产生副作用；实际是漏判 + 顺带清空批量状态。
- **建议修复**：`handleKeydown` 顶部按「年份弹窗 → 记录弹窗 → 确认框 → 清空框 → 批量模式」顺序逐层 `return`，补上 `showYearDialog`。
- **用例**：无（可加，当前仅验证了记录弹窗的 Esc）。

### [P3] 清空范围的文案与默认年份选择顺序

- **文件**：`src/views/WatchedView.vue:616-622`（`clear` 分支）、`:651-661`（`fetchYears` 默认选中）
- **现象/证据**：
  - 当 `selectedYear === '__all__'`（全部年份）时点「清空列表」，弹窗第一项写的是「清空当前年份 (__all__)」，实际执行 `batchDeleteWatched(全部 id)` 会删掉**所有**记录但保留年份组；文案与行为不一致，用户以为只清一年。
  - 当 `selectedYear === '__unclassified__'` 时该按钮变成「清空当前年份 (__unclassified__)」，删除的是所有未分类记录，同样不像「年份」。
  - `fetchYears` 的默认选中用 `years.value[0]`（`getAllWatchedYears` 的 `sort_order, id` 顺序），而下拉展示的是 `sortedYears`（按标签降序）。当 `sort_order` 与标签顺序不一致时，默认打开的是「最旧」的组而不是最新年份。
- **最小复现**：把年份下拉切到「全部年份」→「清空列表」→ 第一项文案为「清空当前年份 (__all__)」；或导入一个 sort_order 递增但标签乱序的库，刷新后默认停在最老的年份。
- **期望 vs 实际**：期望虚拟分组下按钮文案为「清空全部年份的记录」并禁用「清空当前年份」，默认选中用 `sortedYears[0]`；实际是文案误导 + 默认项取自未排序数组。
- **建议修复**：`doClearYear` 前判断哨兵值，`__all__`/`__unclassified__` 时改文案或直接隐藏该按钮；`fetchYears` 里用 `sortedYears.value[0]?.year_label` 作为兜底。
- **用例**：无。

### [P3] 搜索词跨年保留，切年后出现「空列表」的错觉

- **文件**：`src/views/WatchedView.vue:433-447`（`filteredList` 依赖 `searchQuery`）、`:9`（年份切换只调 `fetchData`）
- **现象/证据**：切换年份不会清空搜索词。在 2025 搜「进击」后切到 2024，列表仍是「进击」的过滤结果；若 2024 没有匹配项，用户看到「没有找到匹配的记录」，很容易误判该年没有数据（实际有）。搜索框是页面上最不显眼的控件之一。
- **最小复现**：2025 输入「作品01」→ 切到 2024（有 3 条不含该词的记录）→ 显示空态。
- **期望 vs 实际**：期望切年时清空搜索（或至少在空态里提示「当前搜索词：xxx，共 N 条被过滤」）；实际是静默沿用。
- **建议修复**：`@change="onYearChange"` → `searchQuery.value = ''; currentPage.value = 1; fetchData()`；空态文案附带当前搜索词与「清除搜索」按钮。
- **用例**：`切换年份时搜索词被保留（当前实现），会继续过滤新一年的列表`（普通 `it`，锁定现状；修复后需同步更新）。

---

## 测试说明

**文件**：`tests/watched-import.test.js`（52 条）

| 分组 | 覆盖点 |
| --- | --- |
| 年份分组 | 默认选中今年、本年/总计计数、`extractAllYears` 区间展开、范围分组匹配、未分类重复归属 |
| 搜索与分页 | 每页 20、总条数、翻页序号连续、搜索回到第 1 页、空态、跨年搜索词 |
| 批量选择与删除 | 进入批量清空、勾选计数、确认后调用 `batchApi` 并刷新、取消不调用、全选仅本页、跨页误判、跨年残留 |
| 日期与行内编辑 | 双击进入编辑、回车保存、失败回滚、非法日期、日期选择器精度、`compareDateKey` 混合精度 |
| 年份维护 | 删除最后一个年份、新增后下拉刷新、年份改名 |
| 导入 Excel | `ImportView`：FormData 传参、成功/失败/异常日志、导入中禁用；`excelImporter`：已看表解析、追番表解析、数值序号列、标题行、缺失追番表、全失败返回、损坏文件、重复导入 |
| App 备份 | 导出 Blob + 文件名 + 备份时间、导出失败、确认框拦截、字节传递、坏文件错误分支、恢复前快照、magic header |
| Toast | 堆叠渲染与按类型时长消失、重复内容不去重、aria-live |
| 无障碍 | Esc 关闭弹窗、排序表头、勾选框、对话框 role |

运行：

```bash
pnpm exec vitest run tests/watched-import.test.js
```

结果（本次审计）：

```
✓ tests/watched-import.test.js (52 tests) 963ms
Test Files  1 passed (1)
     Tests  31 passed | 21 expected fail (52)
```

> 测试环境的两个坑（已在文件内处理，供后续维护参考）：
> 1. `App.vue` 的 `<img src="/logo.png">` 会被 `@vitejs/plugin-vue` 改写成 `import _imports_0 from "/logo.png?import"`，Windows 下该公共资源 id 会被解析成无盘符的 `file:///logo.png`，导致套件在收集阶段就 `ERR_INVALID_ARG_VALUE`。文件顶部用 `vi.mock('/logo.png?import', () => ({ default: '/logo.png' }))` 桩掉。
> 2. `useAppearance` / `useTheme` 在测试里被替换成轻量桩，避免引入壁纸取色与网络逻辑；`getDb` 整体替换为可控对象，因此 App 的恢复流程可以直接断言 `importDb/save/export` 的调用序列。

## 抽样验证、未发现问题的检查点

- 空库导出：`db.export()` 对已建表的空库返回合法 SQLite 字节，Blob/文件名/`localStorage` 标记均正常（用例覆盖）。
- 导出失败：`db.export()` 抛错时不会写 `banager_last_backup`，不会误报成功。
- 恢复确认：选择文件后先弹确认框，取消不会触库（用例覆盖）。
- 批量删除取消：不会调用 `batchApi`。
- 行内编辑保存失败：单元格回滚为旧值、输入框关闭、错误 Toast 正确（用例覆盖）。
- 非法/损坏 Excel：`XLSX.read` 抛错被捕获，返回 `success:false` + 「无法打开 Excel 文件」。
- `ImportView` 导入中按钮禁用且不会重复触发（单实例内）。
- `onMounted/onUnmounted` 成对注册/移除 `keydown`、`click` 文档监听，路由切换不泄漏（`WatchedView.vue:860-870`）。
- `ToastHost` 用 `transition-group` + 唯一 id，消失动画与列表更新正常。
- `placeContextMenu` 的贴边翻转逻辑与 `getBoundingClientRect` 无关，尺寸测量选择正确（`useContextMenu.js:14-39`）。

## 附：缺陷复现用例索引（`it.fails`）

| 用例 | 对应缺陷 |
| --- | --- |
| `[缺陷#01]` ×2 | P0 备份恢复零校验 |
| `[缺陷#02]` ×2 | P1 年份范围分组 |
| `[缺陷#03]` ×2 | P1 批量选择残留 |
| `[缺陷#04]` ×2 | P1 导入年份表头污染 |
| `[缺陷#06]` | P2 全失败报成功 |
| `[缺陷#07]` | P2 无追番表误报 |
| `[缺陷#08]` | P2 年份改名 |
| `[缺陷#09]` | P2 删除最后一个年份 |
| `[缺陷#10]` | P2 年份下拉不刷新 |
| `[缺陷#11]` | P2 保存路径无校验 |
| `[缺陷#12]` | P2 日期精度丢失 |
| `[缺陷#13]` | P2 排序键错乱 |
| `[缺陷#14]` | P2 选中残留 |
| `[缺陷#20]` | P3 Toast 无障碍 |
| `[缺陷#21]` ×3 | P3 表格/弹窗无障碍 |
