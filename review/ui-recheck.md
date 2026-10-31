# UI 复测（只读）

命令：`pnpm exec vitest run tests/watching.test.js tests/watched-import.test.js`
时间：2026-10-31
结果：2 files failed。`watching.test.js` 0 test（整文件编译失败）。`watched-import.test.js` 52 tests：15 failed / 24 passed / 13 expected fail（`it.fails` 仍按预期失败，未列入）。

只记仍然失败的用例。`it.fails` 的「Error: Expect test to fail」表示断言已通过、标记过期，**不是源码缺陷仍在**。

---

## 1. tests/watching.test.js — 整套件未执行

| 项 | 内容 |
|---|---|
| 文件 | `tests/watching.test.js`（失败点在 `src/views/RemainingView.vue`） |
| 测试名 | Failed Suite（0 test，WatchingView / RemainingView 用例全部未跑） |
| 期望 | SFC 能编译，套件内用例被执行 |
| 实际 | `SyntaxError: [vue/compiler-sfc] Identifier 'defaultBgmUrl' has already been declared. (246:6)`，插件 `vite:vue`，定位 `RemainingView.vue` script 内第二处声明 |
| 源码 | `src/views/RemainingView.vue:375` `import { defaultBgmUrl, openExternal } from '../composables/useEpisode'`，同文件 `:615` 又 `const defaultBgmUrl = (item) => 'https://bgm.tv/subject_search/' + ...`。模板 `:119` 与 `openItemLink`（`:635`）都引用该名 |
| 仍是源码缺陷 | **是**。重复绑定，文件无法被 Vue 编译，连带 WatchingView 用例也无法收集 |

---

## 2. tests/watched-import.test.js — 真实断言失败（4）

这 4 条是普通 `it`，断言本身没过。根因都在 `src/db/excelImporter.js`，不在 ImportView。

### 2.1 已看表：按列年份写入 watch_date，名称/备注拆分为两个字段

| 项 | 内容 |
|---|---|
| 文件 | `tests/watched-import.test.js:724` → `src/db/excelImporter.js:383` |
| 期望 | `result.success === true`；`addWatched` 收到 `{ name:'进击的巨人', watch_date:'2025', notes:'神作' }` 与 `{ name:'轻音少女', watch_date:'2014~2017', notes:'' }`；`addWatchedYear` 收到 `2025`、`2014~2017` |
| 实际 | `TypeError: db.getAllWatching is not a function or its return value is not iterable`（`importExcel` 第 383 行，读 workbook 之前） |
| 仍是源码缺陷 | **是（相对既有测试契约）**。`importExcel` 无条件展开 `db.getAllWatching/getAllRemaining/getAllWatched()` 求 `sort_order` 最大值。测试桩（`:713`）只提供 `add*`。真实 `src/db/index.js` 上这三个方法存在（`:361/:459/:521`），生产路径不会抛；但调用发生在 `XLSX.read` 的 try 之外，桩或残缺 db 会把整次导入变成未捕获异常，而不是 `{ success:false }` |

### 2.2 追番表：识别星期表头列、时间小数与「名称 集数」

| 项 | 内容 |
|---|---|
| 文件 | `tests/watched-import.test.js:748` → `src/db/excelImporter.js:383` |
| 期望 | `success === true`；`addWatching` 收到 `{ name:'番剧甲', current_episode:'3', day_of_week:'周一', time_slot:'12:00' }` 与 `{ name:'番剧乙', day_of_week:'周二' }` |
| 实际 | 同上，`getAllWatching` 不可迭代，未进入表头识别 |
| 仍是源码缺陷 | **是**，与 2.1 同一处 |

### 2.3 无法识别的文件返回 success:false 而不是抛异常

| 项 | 内容 |
|---|---|
| 文件 | `tests/watched-import.test.js:834` → `src/db/excelImporter.js:383` |
| 期望 | 损坏 xlsx（PK 头 8 字节）返回 `{ success:false, imported:0, message:'无法打开 Excel 文件' }`，不抛 |
| 实际 | 在 `file.arrayBuffer()` / `XLSX.read` 的 catch（`:394`）之前就抛 `TypeError`。该 catch 因此保护不到「打开失败」 |
| 仍是源码缺陷 | **是**。即使换成真实 db，只要 `getAll*` 抛错，损坏文件也会变成未捕获异常，与函数注释「返回 success:false」不符 |

### 2.4 重复导入同一文件是「追加」语义（无去重、无二次确认入口）

| 项 | 内容 |
|---|---|
| 文件 | `tests/watched-import.test.js:844` → `src/db/excelImporter.js:383` |
| 期望 | 同一文件导入两次：`addWatched` 调用 2 次，名称 `['甲','甲']` |
| 实际 | 第一次调用即在 `getAllWatching` 抛错，第二次未执行 |
| 仍是源码缺陷 | **是**，与 2.1 同一处。去重逻辑本身这次没有跑到，不能据此判断追加语义坏了 |

---

## 3. tests/watched-import.test.js — App 备份（3）

### 3.1 导出备份：生成 Blob、按时间戳命名并记录上次备份时间

| 项 | 内容 |
|---|---|
| 文件 | `tests/watched-import.test.js:917`；实现 `src/App.vue:167-184` |
| 期望 | `db.export` 被调用；`URL.createObjectURL` 1 次；`download` 匹配 `^bangumi_backup_\d{8}_\d{4}\.db$`；`URL.revokeObjectURL('blob:mock')` **在 click 处理函数返回前**被调用；`localStorage.banager_last_backup` 有值；文案含「今天」；Toast `备份已导出 💾` |
| 实际 | `AssertionError: expected "vi.fn()" to be called with arguments: [ 'blob:mock' ]`，`revokeObjectURL` 调用次数 **0**。前面的 `export` / `createObjectURL` / 文件名断言已通过（失败落在 `:925`） |
| 源码 | `App.vue:181` `setTimeout(() => URL.revokeObjectURL(url), 1500)`。测试没有推进假时钟，也没有再 `flushPromises` 之外等待 1.5s |
| 仍是源码缺陷 | **否（测试与实现时序不一致）**。Blob、时间戳文件名、`banager_last_backup`、Toast 都已按用例前半段成立。延迟 revoke 是为了等点击完成再释放 URL，不是功能回退。若要让该用例变绿，应改测试去推进 1500ms，或把 revoke 改回同步（会在部分浏览器里让下载拿到已释放的 blob URL） |

### 3.2 确认后把文件字节交给 importDb 并持久化

| 项 | 内容 |
|---|---|
| 文件 | `tests/watched-import.test.js:957`；实现 `src/App.vue:214-225` |
| 期望 | 文件内容 `Uint8Array [9,9,9]` 时 `importDb` 被调用 1 次，参数即该字节，随后 `save` |
| 实际 | `expected "vi.fn()" to be called 1 times, but got 0 times`（`dbMock.importDb`） |
| 源码 | `:223-224` 先解码前 16 字节，不等于 `'SQLite format 3\0'` 就 `throw new Error('不是有效的 SQLite 备份文件')`，**不会**调用 `importDb`。该用例的 `File` 只有 3 个字节 `09 09 09` |
| 仍是源码缺陷 | **否**。这是缺陷#01（magic header）修复后的预期拦截。用例仍按「任意字节都进 importDb」编写，与新校验冲突。同文件 `it.fails`「非 SQLite 文件应在触库前被拒绝」已因此变成意外通过（见第 4 节） |

### 3.3 损坏/非 SQLite 文件：错误提示，不落盘、不刷新页面

| 项 | 内容 |
|---|---|
| 文件 | `tests/watched-import.test.js:972`；实现 `src/App.vue:223-241` |
| 期望 | Toast 为 `type==='error'` 且消息匹配 `/file is not a database/`；`save` 未被调用；`setTimeout` 延迟列表不含 `900` |
| 实际 | `expected false to be true`（`:984`）。`importDb` 的 mock 会抛 `file is not a database`，但执行流在 `importDb` 之前就被 header 校验截住 |
| 源码 | 文件内容是字符串 `'not a db'`，header 不是 `SQLite format 3\0`，抛出的是 `'不是有效的 SQLite 备份文件'`，经 `:241` 变成 Toast `导入失败: 不是有效的 SQLite 备份文件`。`save` 未调用、900ms reload 未注册这两点源码满足，失败只在错误文案 |
| 仍是源码缺陷 | **否**。拒绝非 SQLite、不落盘、不刷新已经发生；用例写死了 sql.js 内部错误串，没有覆盖前置校验的文案 |

---

## 4. it.fails 意外通过（8）— 不是仍存在的源码缺陷

这些用例的断言已经满足，vitest 因 `it.fails` 报 `Error: Expect test to fail`。按测试文件头注释，应把标记改回 `it`。**源码侧对应缺陷已不在。**

| 测试名 | 断言（现已成立） | 对应源码 |
|---|---|---|
| [缺陷#03] 跨页勾选后本页「全选」状态不应误判 | 第 2 页按钮文案是「全选」 | `WatchedView.vue:493` `isAllChecked` 改为 `paginatedList.every(...)` |
| [缺陷#03] 切换年份应清空批量勾选 | 切到 2024 后文本不含「已选择」 | `fetchData` `:708-709` 用当前列表过滤 `checkedIds` |
| [缺陷#14] 切换年份应清空「当前选中」 | 切到空的 2024 后不含「当前选中」 | `fetchData` `:710` 选中项不在新列表则置 `null` |
| [缺陷#11] 行内编辑非法日期时不应写库 | `watchedApi.update` 未被调用 | `saveEdit` `:742-745` 对 `watch_date` 走 `validateDate`，非法直接 return |
| [缺陷#13] compareDateKey 范围日期与未补零月份 | `compareDateKey('2014~2017','2017/01/01')===-1` 且 `compareDateKey('2025/7','2025/12/31')===-1` | `useDatePicker.js:129-151` `dateParts` 按年/月/日拆数值，不再拼接数字串 |
| [缺陷#09] 删除最后一个年份后列表应清空 | 数据行长度 0 | `fetchData` `:673-678`：`selectedYear` 为空时 `watchedList=[]` |
| [缺陷#10] 新增记录后年份下拉应刷新 | 保存后 `watchedYearsApi.getAll` 调用次数增加 | 添加成功路径会 `fetchYears()`（`WatchedView.vue` 保存成功分支） |
| [缺陷#01] 非 SQLite 文件应在触库前被拒绝 | `importDb` 未被调用 | `App.vue:223-224` magic header |

仍按预期失败、**没有**列入上表的 `it.fails`：缺陷#02（两条）、#12、#08、#04（两条）、#07、#06、#01 快照、#20、#21（三条）。共 13 条，与本次 `13 expected fail` 一致。

---

## 结论

仍需改源码的失败：

1. `RemainingView.vue` 的 `defaultBgmUrl` 重复声明（import 与本地 const 二留一）。不改则 `watching.test.js` 整文件跑不起来。
2. `excelImporter.js` `importExcel` 在打开工作簿之前无条件调用 `getAllWatching/getAllRemaining/getAllWatched`。测试桩没有这三个方法；真实库有。若保留 sort 续号，应对缺失方法做空数组兜底，或把这段移入读取成功之后，避免盖掉「无法打开 Excel」的返回值。

不必当源码缺陷修的失败：

- App 导出：`revokeObjectURL` 改为 1500ms 后执行，用例在同步阶段断言。
- App 恢复两条：magic header 已生效，用例仍喂非 SQLite 字节并期待旧错误串 / 旧的「直接 importDb」。
