# 数据层审计报告（src/db + Excel 导入）

审计对象：`src/db/index.js`、`src/db/api.js`、`src/db/excelImporter.js`、`template.xlsx`、`README.md` 数据表结构。
基线：`review/full-audit` / `0f55e61`。

测试：`tests/db.test.js`，共 58 个用例，31 通过、27 失败。失败用例均带 `[缺陷 ...]` 前缀，断言的是修复后的期望行为，没有为了变绿而弱化断言；每个失败都能对应到下面的一条缺陷。通过用例覆盖了正常 CRUD、唯一约束、集数增减、日期归一化、年份标签、批量删除、clearAll、move*、IndexedDB 持久化、export/importDb，以及 `template.xlsx` 全量导入和多种构造工作簿。

结论：共记录 26 条缺陷：P0 2 条、P1 4 条、P2 12 条、P3 8 条。未发现可直接利用的 SQL 注入（所有用户值都走参数绑定）；`getWatchedByYear` 的 LIKE 通配符问题是语义问题，不是注入。

---

## P0

### [严重度 P0] 迁移重建 watching 表时漏掉 url_params，升级后读取和新增全部失败且参数永久丢失

- 文件：`src/db/index.js:209-238`（重建表 SQL 在 215-228，复制 SQL 在 229-233）
- 现象/证据：当旧库的 `watching.current_episode` 不是 `TEXT` 时，`_migrateWatchingEpisodeToText()` 会 `RENAME` 旧表并新建 `watching`；新表的字段列表没有 `url_params`，`INSERT ... SELECT` 也没有复制它。迁移结束后 `getAllWatching()` 的 SELECT 明确包含 `url_params`（`src/db/index.js:294-298`），会直接报 `no such column: url_params`；`addWatching()` 的 INSERT 也包含该列（`:279-284`），同样失败。下一次启动时 `_migrateAddColumn('watching','url_params')` 会补一个空列，参数值已经无法恢复。
- 最小复现：构造旧库 `watching(current_episode INTEGER, url_params TEXT, ...)`，插入 `url_params='p={集数}'`，`new BangumiDatabase(legacy)`；断言 `PRAGMA table_info(watching)` 含 `url_params`，以及 `getAllWatching()` 能返回该值。
- 期望 vs 实际：期望迁移保留 `url_params` 列和值；实际列不存在，读取抛 `no such column: url_params`，同一会话内 `addWatching` 返回 `{success:false,error:'table watching has no column named url_params'}`。测试：`旧版表迁移必须保留 url_params 列和值`、`旧版表迁移完成后同一会话内 addWatching 必须可用`。
- 建议修复：重建表 SQL 和 `INSERT ... SELECT` 都补上 `url_params`；把迁移包在 `BEGIN/COMMIT` 中，任何一步失败都回滚；增加“旧 INTEGER 库 → 新 TEXT 库”的回归测试，并给 `url_params` 增加列存在性断言。

### [严重度 P0] 迁移 INSERT 失败时 catch 直接 DROP watching_old，整张追番表数据丢失

- 文件：`src/db/index.js:229-237`
- 现象/证据：`INSERT INTO watching (...) SELECT ... FROM watching_old` 只要遇到旧表缺少任意一个被引用的列（例如 `notes`、`day_of_week`、`created_at`），就会抛错；`catch` 分支执行 `DROP TABLE IF EXISTS watching_old`，把唯一的数据副本删掉。外层 `_migrateAddColumn` 只补 `sort_order/url/url_params/watch_date`，不会补 `notes`、`day_of_week`、`created_at`、`updated_at`。
- 最小复现：旧库 `CREATE TABLE watching (id INTEGER PRIMARY KEY, name TEXT, current_episode INTEGER)`，插入一行；`new BangumiDatabase(legacy)` 后执行 `SELECT COUNT(*) FROM watching`。
- 期望 vs 实际：期望迁移失败时保留 `watching_old`（或回滚到旧表）并抛出可见错误；实际 `COUNT(*)` 为 0，原记录被 `DROP` 永久删除。测试：`迁移 INSERT 失败时不得把 watching_old 整表 DROP 掉`。
- 建议修复：迁移整体使用事务；`DROP watching_old` 只能在复制成功并校验行数后执行；失败时保留 `watching_old` 并抛出可诊断错误，启动流程不要把异常吞掉。对旧表缺失列先做兼容性检查/补齐，而不是假定列齐全。

---

## P1

### [严重度 P1] getDb 并发首次初始化会创建两个独立数据库实例

- 文件：`src/db/index.js:52-73`、`:784-789`
- 现象/证据：`BangumiDatabase.create()` 只在一开始检查 `if (dbInstance) return dbInstance`，随后 `await loadWasmBinary()` / `await loadFromIndexedDB()` 期间会让出事件循环；两个并发的 `getDb()` 都会通过检查，各自创建一个 `BangumiDatabase` 并各自持有独立的 sql.js `Database`。后完成的赋值覆盖 `dbInstance`，先完成的实例仍被调用方持有，随后两个实例各自 `save()` 全库快照，IndexedDB 里最后一次写入会覆盖另一次。
- 最小复现：在所有 `getDb()` 调用之前执行 `const [a,b] = await Promise.all([getDb(), getDb()])`，断言 `a === b`。
- 期望 vs 实际：期望并发调用共享同一实例；实际 `a !== b`。测试：`getDb 并发首次调用应返回同一实例`。
- 建议修复：缓存“初始化 Promise”而不是只缓存结果，例如 `let dbPromise; function getDb(){ return dbPromise ||= BangumiDatabase.create() }`；`create()` 本身也改为幂等，所有初始化路径都 await 同一个 Promise。

### [严重度 P1] IndexedDB 写入失败被静默吞掉，CRUD 仍然返回 success

- 文件：`src/db/index.js:77-80`、`:272-275`、`:765-778`
- 现象/证据：`save()` 调用 `saveToIndexedDB(data)` 但不返回 Promise、不 await；`saveToIndexedDB` 的 `catch` 只 `console.warn`，没有重新抛出或返回失败。`_run()` 因此永远认为持久化成功。浏览器配额不足、隐私模式、IndexedDB 被禁用或事务失败时，内存里能看到数据，刷新后丢失，而 UI 收到的是 `{success:true}`。
- 最小复现：把 `globalThis.indexedDB.open` 替换为同步抛 `Error('quota exceeded')`，调用 `db.addWatching({name:'写不进'})`；控制台出现 `保存到 IndexedDB 失败: Error: quota exceeded`，但返回值仍是 `{success:true}`。
- 期望 vs 实际：期望写失败让 CRUD 返回 `{success:false}`（或让调用方 await 到 rejection）并提示用户；实际 `addWatching` 成功返回，数据只在内存中。测试：`IndexedDB 写入失败时 addWatching 不应静默返回成功`。
- 建议修复：把 `save()` 改为 async 并返回/抛出错误；`_run()` 在 DML 成功后 await `save()`；或实现串行写队列并把失败上报到 API 层。至少在 `saveToIndexedDB` 失败时把错误标记到实例状态，禁止 UI 继续显示“已保存”。

### [严重度 P1] move* 三个迁移方法忽略删除结果、无事务，删除失败仍返回 success 并留下两份记录

- 文件：`src/db/index.js:647-662`（`deleteWatching` 在 653）、`:664-683`（674）、`:706-730`（721）
- 现象/证据：三个方法都是“先 add 目标表，再 delete 源表”，但没有 `BEGIN/COMMIT`，且 `this.deleteWatching(...)` / `this.deleteRemaining(...)` 的返回值被直接丢弃，方法无条件 `return { success: true }`。删除失败（约束、触发器、数据库错误）时源记录仍在、目标记录已经插入，用户会看到同一部番同时出现在两个列表里。
- 最小复现：新建追番记录，创建 `BEFORE DELETE ON watching` 触发器 `RAISE(ABORT,'blocked')`，调用 `moveWatchingToRemaining(id)`。
- 期望 vs 实际：期望删除失败返回 `{success:false}` 并回滚已插入的目标记录；实际返回 `{success:true}`，`getAllWatching()` 和 `getAllRemaining()` 都是 1 条。测试：`moveWatchingToRemaining 删除失败时不得返回成功`、`moveRemainingToWatching 删除失败时不得返回成功`、`moveWatchingToWatched 删除失败时不得返回成功`。
- 建议修复：把“插入 + 删除”放进同一个 SQLite 事务；检查两个操作的 `getRowsModified()`，任一失败就 `ROLLBACK`；不要吞掉 `delete*` 的返回值。

### [严重度 P1] loadFromIndexedDB 读取失败被当成“没有数据”，新空库可能覆盖旧快照（待证实）

- 文件：`src/db/index.js:749-763`、`:63-68`、`:206`
- 现象/证据：`loadFromIndexedDB()` 的 `catch` 无论打开失败、`get` 请求失败还是反序列化失败，都 `return null`；`create()` 把 `null` 当成“首次使用”，创建空 `SQL.Database`；紧接着构造函数里的 `initTables()` 末尾 `this.save()` 又会把空库写回同一个 key。这样一次瞬时读取失败就可能把原有 IndexedDB 数据覆盖成空库。代码路径是确定的，但“读取失败而写入仍成功”的具体浏览器/配额场景需要用真实故障注入确认，故标 `(待证实)`。
- 最小复现：在 `loadFromIndexedDB` 的 `open` 或 `get` 抛错、但 `saveToIndexedDB` 可写的环境启动应用，检查 IndexedDB 中 `bangumi_db` 是否被空库替换。
- 期望 vs 实际：期望区分“无记录”和“读取失败”，读取失败时中止启动并提示，绝不写回空库；实际返回 `null` → 空库 → `initTables().save()` 覆盖。
- 建议修复：让 `loadFromIndexedDB` 在真实错误时抛出，只对“确实没有 key”返回 `null`；`create()` 捕获错误后展示恢复/重试入口；初始化阶段只在确认是新建数据库时保存空快照。

---

## P2

### [严重度 P2] clearAll 不是原子操作，中途失败会留下半清空状态

- 文件：`src/db/index.js:633-643`
- 现象/证据：四个 `DELETE` 分别调用 `_run`，每条都自动提交并触发一次全库保存；没有事务。第三条失败时前两条已经生效且已落盘，函数只返回 `success:false`，不会回滚。
- 最小复现：插入 watching/remaining/watched 各一条，创建 `BEFORE DELETE ON watched` 的 ABORT 触发器，调用 `clearAll()`。
- 期望 vs 实际：期望失败时四张表保持原样；实际 `watching=0`、`remaining=0`、`watched=1`（watched_years 未执行）。测试：`clearAll 中途失败时不应留下半清空状态`。
- 建议修复：`BEGIN; DELETE ...; DELETE ...; COMMIT;`，失败 `ROLLBACK`，事务提交后只 `save()` 一次。

### [严重度 P2] addWatched 先 INSERT 后建年份标签，标签失败时返回 false 但记录已插入

- 文件：`src/db/index.js:438-450`（`_ensureYearLabel` 在 445）
- 现象/证据：`INSERT` 已经通过 `_run` 提交并落盘，之后才调用 `_ensureYearLabel`；后者在 `watched_years` 缺失/写入异常时抛错，被外层 `catch` 捕获并返回 `{success:false}`，但 watched 行已存在。用户看到“添加失败”后重试会得到重复记录。
- 最小复现：`db.db.run('DROP TABLE watched_years')` 后调用 `db.addWatched({name:'半条', watch_date:'2025'})`。
- 期望 vs 实际：期望返回失败且 watched 表无记录；实际返回 `success:false`，但 `getAllWatched()` 已有 1 条。测试：`年份标签写入失败时 addWatched 不应留下半条记录`。
- 建议修复：把 INSERT 和年份标签写入放在同一事务；先建标签再插记录，或失败时回滚记录。

### [严重度 P2] updateWatched 修改观看日期后不补建年份标签，记录从年份视图消失

- 文件：`src/db/index.js:475-501`
- 现象/证据：`addWatched` 会调用 `_ensureYearLabel`，但 `updateWatched` 只更新 `watch_date`，没有调用它。比如记录原本 `watch_date='2025'`，编辑为 `'2026/03'` 后，`watched_years` 仍只有 `2025`；`WatchedView` 的年份下拉没有 `2026`，该记录只能在“未分类”里看到。
- 最小复现：`db.addWatched({name:'作品', watch_date:'2025'})`；`db.updateWatched(1,{watch_date:'2026/03'})`；读取 `getAllWatchedYears()`。
- 期望 vs 实际：期望年份标签包含 `2026`；实际只有 `2025`。测试：`编辑已看日期到新年度时应补建年份标签`。
- 建议修复：`updateWatched` 在日期变化后调用 `_ensureYearLabel(newDate)`；同时考虑清理已无记录的旧年份标签。

### [严重度 P2] updateWatchedYear 只改年份标签，不迁移已看记录的 watch_date（待证实产品语义）

- 文件：`src/db/index.js:535-554`
- 现象/证据：`updateWatchedYear` 只更新 `watched_years.year_label`，`watched.watch_date` 仍保留旧标签/旧年份。用户在“已看年份”里把 `2025` 改名为 `2025年` 后，`getByYear('2025年')` 查不到任何记录，记录落入“未分类”。
- 最小复现：`db.addWatched({name:'作品', watch_date:'2025'})`；找到年份行，`db.updateWatchedYear(id,{year_label:'2025年'})`；`db.getWatchedByYear('2025年')`。
- 期望 vs 实际：期望重命名后原记录仍归属新标签；实际返回 `[]`。测试：`重命名年份标签后应仍能按新标签查到原记录`。如果产品定义“年份标签只是显示名、不迁移记录”，则属于预期行为，需要产品确认（待证实）。
- 建议修复：在同一事务中更新 `watched.watch_date`（精确值或 `旧标签/%` 前缀）到新标签；若不允许改名有记录的年份，UI 应禁用并提供说明。

### [严重度 P2] _ensureYearLabel 对 “2014~2017” 只取起始年，自动多建一个错误的年份标签

- 文件：`src/db/index.js:685-697`
- 现象/证据：`rangeMatch` 命中后只取 `rangeMatch[1]`（起始年）并 `_addYearIfNotExists('2014')`，而不是使用完整的 `2014~2017`。导入一个年份范围列时，`importWatched` 先创建 `2014~2017`，随后每条记录又通过 `addWatched` 创建 `2014`，年份列表出现两个标签。
- 最小复现：先 `addWatchedYear({year_label:'2014~2017'})`，再 `addWatched({name:'范围作品', watch_date:'2014~2017'})`；读取年份列表。
- 期望 vs 实际：期望只有 `2014~2017`；实际得到 `['2014','2014~2017']`。测试：`新增年份范围记录不应额外生成单一年份标签`。
- 建议修复：范围日期应使用去除空格后的完整 `2014~2017` 作为标签；`_ensureYearLabel` 与 `parseYear` 共用同一套规范化逻辑，避免两处规则不一致。

### [严重度 P2] 等番数值日期解析：数字年份被当成 Excel 序列号，且每月 1 号丢失日精度

- 文件：`src/db/excelImporter.js:235-247`（`date.d > 1` 在 240）
- 现象/证据：`typeof row[1] === 'number'` 时一律走 `XLSX.SSF.parse_date_code`，没有区分“用户输入的年份 2026”和“Excel 日期序列号”；数字 2026 被解析成 `1905/07/18`。另外 `if (date.d && date.d > 1)` 使 `d=1` 时只输出 `yyyy/mm`，`2026-07-01` 变成 `2026/07`。
- 最小复现：构造等番表 `['Name','Time'], ['年份番', 2026]` 导入；另构造 `['月初番', excelSerial(2026,7,1)]` 导入。
- 期望 vs 实际：期望分别得到 `2026` 与 `2026/07/01`；实际得到 `1905/07/18` 与 `2026/07`。测试：`等番日期单元格是数字年份 2026 时不应被当成 Excel 序列号`、`等番日期是当月 1 号时必须保留日精度`。
- 建议修复：先判断数值是否落在合理年份区间（1900~2100）并按年份处理；只有明显是 Excel 日期序列号（如 > 20000）才 `parse_date_code`；日期格式化改为 `date.d != null` 就补日，不要用 `>1`。

### [严重度 P2] 追番表解析边界：跳过非字符串单元格，并把非星期列内容当成番剧导入

- 文件：`src/db/excelImporter.js:163-206`（类型检查在 165，`colDayMap` 使用在 182）
- 现象/证据：`if (!cellValue || typeof cellValue !== 'string') continue` 会丢掉纯数字标题（如作品名 `86`）。同时数据循环遍历 `rowData` 的所有列，只有 `colDayMap[col]` 命中时才赋星期；没有命中时仍以 `day_of_week=''` 调用 `addWatching`，所以“Notes/备注”列会被当成一部未排期番剧导入。
- 最小复现：表头 `['时间','Monday','Notes']`，数据 `[0.5,'作品A e1','备注不是番剧']`，导入后统计追番数量；另一个工作簿把 `作品A` 换成数字 `86`。
- 期望 vs 实际：备注列用例期望 1 条，实际 2 条；数字标题用例期望 1 条，实际 0 条。测试：`追番表非星期列（备注列）不应被当成番剧导入`、`追番单元格是纯数字标题时不应被丢弃`。
- 建议修复：数据列只遍历 `Object.keys(colDayMap)`；单元格值接受 `string | number`，统一 `String(v).trim()`（排除布尔/错误对象）；表头只允许包含星期关键词的列参与导入。

### [严重度 P2] 已看表头解析：任意非空文字都会被当作年份，横向合并的年份只导入第一列

- 文件：`src/db/excelImporter.js:83-97`（`parseYear` 末尾 `return str`）、`:282-301`（只读 `headerRow[col]`）
- 现象/证据：`parseYear('Name')` 会返回 `'Name'`，于是 `importWatched` 把 Name 列当作年份列，把该列每条记录写成 `watch_date='Name'`；构造工作簿 `[['Name',2025],['作品X','作品Y']]` 实际导入 2 条（其中一条日期为 `Name`），期望只导入 2025 列的 1 条。横向合并 `A1:B1='2014~2017'` 时，`sheet_to_json` 只在 A1 拿到值，B 列没有年份映射，B 列数据全部丢失（测试实际导入 1 条，期望 2 条）。
- 最小复现：分别构造上述“Name + 2025”工作簿和 `A1:B1` 合并年份工作簿，导入后读取 `getAllWatched()`。
- 期望 vs 实际：期望 Name 列被忽略、合并范围内两列都导入；实际 Name 列被当作年份、合并列只导入首列。测试：`已看表第一列不是年份时不应把表头文字当成年份导入`、`已看表横向合并的年份表头应导入合并范围内的所有列`。
- 建议修复：`parseYear` 无 4 位年份/范围时返回 `null`，并校验 1900~2100；读取 `sheet['!merges']`，把合并单元格的表头值展开到整个 `s.c..e.c` 范围，或显式填充 `colYearMap`。

### [严重度 P2] 等番工作表名不识别“等待”，与导入说明不一致

- 文件：`src/db/excelImporter.js:218-220`
- 现象/证据：只查找名称包含 `'等番'` 或 `'Remaining'` 的工作表；`ImportView.vue:29` 写的是“包含 '等待' 或 '等番' 的工作表”。名为“等待更新”的表会被完全跳过，导入结果 0 条。
- 最小复现：工作簿只有 `等待更新` 工作表，内容 `Name/Time` + 一行数据，调用 `importExcel`。
- 期望 vs 实际：期望导入 1 条等番；实际 `imported=0`，`getAllRemaining()` 为空。测试：`工作表名包含“等待”时应按导入说明识别为等番表`。
- 建议修复：`find` 条件补上 `name.includes('等待')`（必要时加 `Waiting`）；把表名识别规则集中成一个常量，和 ImportView 文案共用。

### [严重度 P2] 第二次 Excel 导入的 sort_order 从 1 重新开始，追加数据排到旧数据前面

- 文件：`src/db/excelImporter.js:13-17`、`:362`、`:194/253/335`
- 现象/证据：`sortCounter` 在每次 `importExcel` 开始时重置为 0，`nextSortOrder()` 从 1 开始；但 `getAll*` 都按 `sort_order, id` 排序。已有记录 `sort_order=100` 时，第二次导入的新记录 `sort_order=1`，会排在旧记录前面，破坏“追加到末尾”的语义。
- 最小复现：先 `db.addWatching({name:'已有番', sort_order:100})`，再导入只有一个追番的工作簿，读取新记录的 `sort_order`。
- 期望 vs 实际：期望新记录 `sort_order > 100`；实际为 `1`。测试：`第二次导入的 sort_order 应追加在已有记录之后`。
- 建议修复：导入前查询各表 `MAX(sort_order)`（或全局最大值）初始化计数器；更稳妥的是每条记录使用 `MAX(sort_order)+1`，并放在同一事务里。

### [严重度 P2] importDb 对非法文件先关闭旧库，失败后当前会话数据库不可用

- 文件：`src/db/index.js:88-98`
- 现象/证据：`importDb(data)` 第一件事是 `this.db.close()`，之后才 `new _SQL.Database(data)` 和 `initTables()`；如果文件不是合法 SQLite，构造或建表会抛错，旧库已关闭、`this.db` 变成无效/半初始化对象。App.vue 只在成功时 reload，失败时用户留在页面上，后续所有读写都会报 `file is not a database`。
- 最小复现：`db.addWatching({name:'原数据'})`；`db.importDb(new Uint8Array([1,2,3,4]))`；捕获异常后调用 `db.getAllWatching()`。
- 期望 vs 实际：期望导入失败时旧库仍然可用；实际 `getAllWatching()` 抛 `file is not a database`。测试：`importDb 收到非法文件时应保持原数据库可用`。
- 建议修复：先在临时 `SQL.Database` 上完成构造、`PRAGMA integrity_check`/表结构校验和迁移，全部成功后再关闭旧库并替换 `this.db`；失败时保持旧库并返回清晰错误。

### [严重度 P2] 每条 _run 都 export 全库并新建 IndexedDB 连接，导入呈 O(n²) 且有连接泄漏

- 文件：`src/db/index.js:77-80`、`:272-275`、`:735-747`、`:765-778`
- 现象/证据：`_run()` 每执行一条语句就调用 `save()`，`save()` 执行 `this.db.export()`（整库序列化）；`saveToIndexedDB()` 每次 `openIDB()` 新建连接且从不 `close()`。`importExcel` 对每条记录调用 `addWatching/addRemaining/addWatched`，模板 48 条就会产生至少 48 次全库导出和 48 个 IndexedDB 连接；数据量上千行时是 O(n²) 的序列化开销，连接也会持续累积。
- 最小复现：对 `template.xlsx` 导入前包裹 `db.db.export` 计数，导入 48 条后观察调用次数；或导入 1000 行构造数据观察耗时/连接数。
- 期望 vs 实际：期望批量导入只导出一次、复用单个 IndexedDB 连接；实际每条记录一次全库 export，每次 save 新建连接且不关闭。
- 建议修复：把 `_run` 拆成 `_runNoSave` 与批量事务入口；导入用 `BEGIN/COMMIT` 后统一 `save()` 一次；`openIDB` 缓存单例连接并在页面卸载时关闭；`save` 做 debounce/合并或增量落盘。

---

## P3

### [严重度 P3] batchDelete*/delete* 的 deleted 数量和成功状态不反映实际受影响行数

- 文件：`src/db/index.js:567-595`、`:336-343`、`:427-434`、`:503-510`、`:556-563`
- 现象/证据：`batchDeleteWatching([1,999])` 实际只删掉 id=1，但返回 `{success:true,deleted:2}`（直接 `ids.length`）；`deleteWatching(999)`、`deleteRemaining(999)`、`deleteWatched(999)`、`deleteWatchedYear(999)` 也返回 `{success:true}`。UI 会显示“已删除 N 项”，与实际不符。
- 最小复现：插入一条记录，`db.batchDeleteWatching([1,999])`。
- 期望 vs 实际：期望 `deleted:1`；实际 `{success:true,deleted:2}`。测试：`批量删除返回值应反映实际删除的行数`。
- 建议修复：`_run` 返回 `this.db.getRowsModified()`；批量删除返回实际变化行数；单条删除/更新在 0 行时返回 `{success:false,error:'未找到记录'}`。

### [严重度 P3] getWatchingByDay 不返回 url / url_params，按天查询的卡片拿不到链接

- 文件：`src/db/index.js:300-305`、`src/db/api.js:16-19`
- 现象/证据：`getWatchingByDay` 的 SELECT 只有 `id,name,day_of_week,time_slot,current_episode,notes,sort_order`，而 `getAllWatching` 返回 `url,url_params`。`watchingApi.getByDay` 直接暴露这个结果；任何用该接口渲染卡片的调用方都无法生成 `buildItemUrl` 的链接。
- 最小复现：`db.addWatching({name:'API番',day_of_week:'周三',url:'https://e/z',url_params:'p={集数}'})`；调用 `watchingApi.getByDay('周三')`。
- 期望 vs 实际：期望 `res.data.data[0].url === 'https://e/z'`；实际 `url` 为 `undefined`。测试：`watchingApi.getByDay 返回卡片渲染所需的链接字段`。
- 建议修复：SELECT 补上 `url,url_params`，最好复用 `getAllWatching` 的字段列表，避免两处漂移。

### [严重度 P3] updateWatching 对 current_episode 的归一化不完整，1e3 等伪数字会原样入库

- 文件：`src/db/index.js:307-334`（313-314）
- 现象/证据：`parseFloat(fields[key])` 只用于判断是否 NaN，真正写入的是 `String(fields[key])`。因此 `'1e3'`（parseFloat 合法）会原样存成 `1e3`，`'  5 '` 会带空格入库；之后 `smartIncrement` 用 `parseInt` 处理会得到非预期结果。`useEpisode.js` 已有 `normalizeEpisodeInput`，但这里没有使用。
- 最小复现：`db.addWatching({name:'番'})`；`db.updateWatching(1,{current_episode:'1e3'})`；读取记录。
- 期望 vs 实际：期望 `current_episode === '1000'`（或拒绝非法输入）；实际为 `'1e3'`。测试：`updateWatching 应把 1e3 这类伪数字归一化为 1000`。
- 建议修复：`addWatching`/`updateWatching` 统一调用 `normalizeEpisodeInput`，只接受 `/^\d+(\.\d+)?$/` 或明确的补零格式；非法输入返回错误而不是近似解析。

### [严重度 P3] 没有追番工作表时 importWatching 回退到第一张表并制造假错误，空工作簿还返回 success

- 文件：`src/db/excelImporter.js:104-110`、`:130-133`、`:358-394`
- 现象/证据：找不到“追番/Watching”表时，`importWatching` 无条件使用 `workbook.SheetNames[0]`；如果第一张是等番/已看表（没有星期表头），会向 `errors` 推入“未找到追番表的星期表头行”。另外 `errorCount` 在 130-132 的结构性错误分支没有递增，最终 message 仍是“失败 0 条”。只有空 Sheet1 的工作簿会返回 `{success:true,imported:0,errors:['未找到追番表的星期表头行']}`。
- 最小复现：只包含 `Remaining | 等番` 工作簿导入；或只包含空 `Sheet1` 的工作簿导入。
- 期望 vs 实际：期望没有追番表时静默跳过（不产生错误）；空工作簿应明确失败或至少不产生“成功 0 条 + 错误 1 条”的矛盾结果。实际分别产生假错误、返回 success。测试：`没有追番工作表的文件不应报...`、`未提供任何工作表的文件应返回失败而不是...`。
- 建议修复：先按表名识别；只有表名匹配但没有表头时才报结构错误；不要用第一张表兜底，除非表头确实包含星期列；结构性错误计入 `errorCount`，没有任何可识别表时返回 `success:false`。

### [严重度 P3] README 的数据表结构说明与 watched_years 实际结构不一致

- 文件：`README.md:173-180`、`src/db/index.js:179-186`
- 现象/证据：README 写“各表均含 sort_order、created_at、updated_at”，但 `watched_years` 只有 `id, year_label, sort_order, created_at`，没有 `updated_at`；README 的字段表也只列了 `id, year_label`，漏掉 `sort_order/created_at`。按 README 写迁移/备份校验会误判。
- 最小复现：`PRAGMA table_info(watched_years)`。
- 期望 vs 实际：期望文档与实际表结构一致；实际缺少 `updated_at` 且字段列表不完整。
- 建议修复：要么给 `watched_years` 补 `updated_at` 并在 `updateWatchedYear` 更新它，要么修正 README 的“各表均含”表述和字段列表。

### [严重度 P3] 重复导入的“追加、不覆盖”承诺与 UNIQUE 冲突行为不一致

- 文件：`src/db/excelImporter.js:196-205`、`:253-259`、`:330-342`、`README.md:76`、`src/views/ImportView.vue:54`
- 现象/证据：追番/等番对 `name` 有 UNIQUE 约束，重复导入时 `addWatching/addRemaining` 返回“已存在”，导入日志记为错误，数据不会追加；已看表没有 UNIQUE，重复导入会直接追加。模板重复导入实测：`errors.length=5`（3 条追番 + 2 条等番），watching/remaining 仍各 3/2，watched 从 43 变 86。
- 最小复现：同一 `template.xlsx` 连续导入两次，比较三张表行数和 `errors`。
- 期望 vs 实际：期望重复导入要么全部跳过并提示“跳过 N 条”，要么按文档追加；实际一半报错、一半追加，语义不统一。测试：`template.xlsx 重复导入时追番/等番因 UNIQUE 报错、已看重复追加（记录当前语义）`。
- 建议修复：明确导入策略：重复项 `INSERT OR IGNORE` 并计入 `skipped`，或提供“覆盖/跳过/追加”选项；不要让 UNIQUE 错误混在“失败”计数里，文档同步修改。

### [严重度 P3] importWatched 按列优先导入，与“导入顺序与 Excel 排列一致”不符

- 文件：`src/db/excelImporter.js:314-349`、`src/views/ImportView.vue:52`
- 现象/证据：外层循环是 `for (col)`、内层是 `for (row)`，所以会先把 2025 整列按行导入，再导入 2026 整列；`sort_order` 因此按“年份列”分组，而不是按 Excel 的视觉行顺序。多列年份并排时，第 2 行 2026 的记录会排在第 39 行 2025 的记录之后。文档却承诺“导入顺序与 Excel 中的排列完全一致”。
- 最小复现：两列年份 2025/2026，各两行；导入后比较 `sort_order` 顺序与表格行顺序。
- 期望 vs 实际：期望按行优先；实际按列优先。
- 建议修复：改为外层行、内层列（只遍历有年份映射的列）；或者修正文档并明确“按年份列分组”。

### [严重度 P3] getWatchedByYear 把 year 直接拼进 LIKE 模式，% 和 _ 未转义

- 文件：`src/db/index.js:458-463`、`:465-468`
- 现象/证据：查询条件是 `watch_date = ? OR watch_date LIKE ?`，参数为 `[year, year + '/%']`；年份标签允许用户自定义（`watchedYearsApi.add` 只要求非空），如果标签含 `%` 或 `_`，LIKE 会把它当通配符。例如标签 `2025%` 会匹配所有 `2025/...`，标签 `20_5` 会匹配 `20X5`。不是 SQL 注入（仍是绑定参数），但语义错误。
- 最小复现：`db.addWatched({name:'a',watch_date:'2025/07'})`；`db.getWatchedByYear('2025%')` 返回该记录。
- 期望 vs 实际：期望按字面年份标签匹配；实际被当作通配符。
- 建议修复：对 `%`、`_`、`\` 做 `ESCAPE` 转义，或改用 `substr(watch_date,1,length(?)) = ?` / 范围查询；同时对年份标签做格式校验。

---

## 附：测试与复现说明

- 运行命令：`pnpm exec vitest run tests/db.test.js`（vitest 5 / jsdom / fake-indexeddb，sql.js WASM 使用 `src/db/wasmInline.js` 内联数据）。
- 失败用例均带 `[缺陷 ...]`，用于锁定上述行为；修复对应源码后应转绿。
- `template.xlsx` 实测可完整导入 48 条（3 追番 + 2 等番 + 43 已看），字段、星期、时间、集数、超链接均正确；主要问题集中在旧库迁移、持久化失败路径、move/clear 事务性以及 Excel 边界格式。
