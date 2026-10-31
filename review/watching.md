# 正在追番 / 等待更新 页面审计

- 项目：`D:\Files\Projects\Project-Banager`
- 分支：`review/full-audit`
- 审计文件：`src/views/WatchingView.vue`、`src/components/WatchingCard.vue`、`src/views/RemainingView.vue`，并交叉核对 `src/db/api.js`、`src/db/index.js`、`src/composables/useEpisode.js`、`src/composables/useDatePicker.js`、`src/composables/useContextMenu.js`
- 约束：未修改 `src/` 下任何文件；仅新增 `tests/watching.test.js` 与本报告
- 结论：**18 个缺陷**（P0 0 / P1 4 / P2 10 / P3 4）
- 测试：`pnpm exec vitest run tests/watching.test.js` 通过。27 个用例中 **14 passed / 13 expected fail**。`it.fails` 是缺陷用例的“保留失败”标记：当前源码下它必须失败，修复后该用例会变红，提示移除标记或调整断言。

## P1

### [P1] 追番卡片中键点击无链接时调用未定义函数，快速打开失效

文件：`src/views/WatchingView.vue:723-729`（问题行 `726`）

**现象/证据**：
```js
const url = item.url ? buildItemUrl(item) : defaultBgmUrl(item)
```
`defaultBgmUrl` 在本文件、`useEpisode.js` 及任何导入中都没有定义。README 明确要求“无链接时自动搜索 bgm.tv”，但该分支实际会抛出 `ReferenceError: defaultBgmUrl is not defined`，`window.open` 不会执行。仅中键点击“有链接”的卡片能工作。

**最小复现**：
1. 添加一部 `url` 为空的追番。
2. 鼠标中键点击卡片（`mousedown` 且 `button===1`）。
3. 预期新标签页打开 `https://bgm.tv/subject_search/<encodeURIComponent(name)>`。
4. 实际控制台报 `defaultBgmUrl is not defined`，没有新标签页。

**期望 vs 实际**：无链接卡片应回退到 bgm.tv 搜索；实际整条中键打开逻辑抛异常。

**建议修复**：
```js
const defaultBgmUrl = (item) =>
  'https://bgm.tv/subject_search/' + encodeURIComponent(item.name || '')
```
并补充 `window.open(url, '_blank', 'noopener,noreferrer')`。可直接复用 `WatchedView.vue:563-565` 的实现。

### [P1] 等待更新表格中键点击调用未定义函数，所有行中键打开失效

文件：`src/views/RemainingView.vue:94`

**现象/证据**：
```html
@mousedown.middle.prevent="openItemLink(item)"
```
模板引用了 `openItemLink`，但 `<script setup>` 中没有该函数；本文件只定义了 `buildUrl` 和 `defaultBgmUrl`。任意表格行中键点击都会执行 `_ctx.openItemLink(item)`，运行时抛出 `openItemLink is not a function`。`WatchedView.vue:567-570` 有同类实现可参考。

**最小复现**：
1. 在等待更新列表放入任意一条记录（有无 `url` 均可）。
2. 鼠标中键点击该行。
3. 预期打开条目链接（无 `url` 时打开 bgm.tv 搜索）。
4. 实际无新标签页，控制台报 `openItemLink is not a function`。

**期望 vs 实际**：中键快速链接应可用；实际所有行均失效。

**建议修复**：
```js
const openItemLink = (item) => {
  window.open(
    item.url ? buildUrl(item) : defaultBgmUrl(item),
    '_blank',
    'noopener,noreferrer'
  )
}
```

### [P1] 等待更新批量选择跨页/跨筛选残留，`isAllChecked` 仅按长度判断，可能删除隐藏记录

文件：`src/views/RemainingView.vue:476`、`src/views/RemainingView.vue:495-503`、`src/views/RemainingView.vue:637`

**现象/证据**：
```js
const isAllChecked = computed(() =>
  paginatedList.value.length > 0 &&
  checkedIds.value.length === paginatedList.value.length
)
```
该判断只比较“选中数量”和“当前页数量”，没有校验当前页每个 id 是否都在 `checkedIds` 中。`checkedIds` 在翻页、搜索、排序变化时都不会清理；`toggleSelectAll` 直接用当前页 id 覆盖整个集合。批量删除则把整个隐藏集合传给 API。

**最小复现 A（错误的“全选”状态）**：
1. 准备 25 条等番，每页设为 10 条。
2. 第 1 页点表头全选（选中 10 条）。
3. 点“下一页”，第 2 页实际 0 条被选中。
4. 预期顶部按钮显示“全选”、表头未勾选。
5. 实际因为 `10 === 10`，显示“取消全选”且表头呈勾选状态；点击它会清空第 1 页的 10 条选择。

**最小复现 B（删除隐藏项）**：
1. 批量模式下在第 1 页勾选 `Item 1`。
2. 搜索 `Item 25`，列表只剩 `Item 25`，此时勾选它。
3. 页面显示“已选择 2 项”，但只有 1 条可见。
4. 点“批量删除”并确认。
5. 预期只删除当前可见的 `Item 25`，或切换搜索时清空选择。
6. 实际调用 `batchDeleteRemaining([1, 25])`，隐藏的 `Item 1` 也被删除。

**期望 vs 实际**：全选状态必须针对当前页逐项判断；筛选变化后不应无提示保留隐藏选择。实际会误删不可见数据。

**建议修复**：
```js
const isAllChecked = computed(() =>
  paginatedList.value.length > 0 &&
  paginatedList.value.every(item => checkedIds.value.includes(item.id))
)
```
搜索/筛选变化时清空或裁剪 `checkedIds`；如确实需要跨页多选，应显示完整的已选清单，并让“全选”只对当前页做并集/差集，而不是覆盖全局集合。

### [P1] 等待更新动态链接中的 `{集数}` 永远被替换成 0

文件：`src/views/RemainingView.vue:593-601`；`src/db/index.js:152-162`；`src/db/index.js:393-397`

**现象/证据**：
```js
const params = item.url_params.replace(/\{集数\}/g, item.current_episode || 0)
```
但 `remaining` 表没有 `current_episode` 字段，`getAllRemaining()` 也没有查询该字段。因此等待更新页的每个条目 `item.current_episode` 恒为 `undefined`，所有 `{集数}` 都变成 `0`。页面提示却写着“如 `keyword={集数}` → `keyword=914`”（`RemainingView.vue:270-272`）。

**最小复现**：
1. 添加等番，URL 填 `https://search.example.com/`。
2. URL 动态参数填 `keyword={集数}`。
3. 点击链接。
4. 预期按页面提示替换为当前集数（例如 `914`）。
5. 实际 `href="https://search.example.com/?keyword=0"`。

**期望 vs 实际**：等待更新页的占位符应有真实数据来源，或不应提供该占位符；实际静默填 0，生成错误搜索链接。

**建议修复**：给 `remaining` 增加可编辑的集数字段并迁移/查询，或在等番阶段移除 `{集数}` 输入与提示；不要用不存在的 `current_episode` 兜底为 0。

## P2

### [P2] `fetchData` 替换列表后 `selected` 未重新绑定，选中摘要和编辑弹窗读到旧对象

文件：`src/views/WatchingView.vue:699-710`；`src/views/RemainingView.vue:657-662`

**现象/证据**：
```js
watchingList.value = res.data.data
if (selected.value) {
  const item = watchingList.value.find(i => i.id === selected.value.id)
  if (!item) selected.value = null
}
```
找到同 id 的新对象后只做了存在性判断，没有 `selected.value = item`。`remaining` 的 `fetchData` 则完全不处理 `selected`。由于 API 每次返回全新对象，`selected` 会继续指向旧数组里的对象。

**最小复现（追番）**：
1. 选中 `番剧A`（集数 1）。
2. 添加另一部番剧，保存成功触发 `fetchData`，列表对象被替换。
3. 双击 `番剧A` 的集数改为 5。
4. 预期顶部“当前选中”显示 `e5`，再次编辑回填 5。
5. 实际顶部仍显示 `e1`；再点“编辑”会用旧值覆盖刚改的 5。

**期望 vs 实际**：刷新后选中项应指向新列表中的同一记录；实际指向过期对象。

**建议修复**：
```js
if (selected.value) {
  selected.value = watchingList.value.find(i => i.id === selected.value.id) || null
}
```
`RemainingView.fetchData` 同样在赋值后按 id 重绑或被删除置空。

### [P2] 内联编辑的旧保存请求会关闭另一个刚开始编辑的字段（两页）

文件：`src/views/WatchingView.vue:739-761`；`src/views/RemainingView.vue:674-687`

**现象/证据**：
```js
const res = await watchingApi.update(id, { [field]: val })
...
editing.value = null
```
`saveEdit` 在 `await` 后无条件清空 `editing`，没有确认它是否仍指向发起请求时的 `{ id, field }`。同时 input 同时绑定 `@blur="saveEdit"` 和 `@keyup.enter="saveEdit"`，存在重复调用窗口。

**最小复现**：
1. 双击名称，改成 `番剧A改`，按 Enter 发起保存（让 API 延迟返回）。
2. 在请求未返回时，双击集数开始编辑。
3. 预期集数输入框保持打开。
4. 实际旧名称请求返回后执行 `editing.value = null`，集数输入框被关闭，已输入内容丢失。

**期望 vs 实际**：旧字段保存完成只能关闭它自己，不能关闭新编辑。

**建议修复**：保存开始时捕获 token：
```js
const token = editing.value
...
if (editing.value === token) editing.value = null
```
并在保存期间禁用其他编辑入口。测试中用延迟 Promise 复现。

### [P2] 添加/编辑弹窗保存按钮可重复提交（两页）

文件：`src/views/WatchingView.vue:808-825`；`src/views/RemainingView.vue:714-727`

**现象/证据**：`saveForm` 没有 `saving`/`submitting` 状态，保存按钮也没有 `:disabled`。点击后请求未返回前，弹窗仍保持打开，按钮仍可再次点击；`Ctrl+Enter` 同样可以重复触发。

**最小复现**：
1. 打开“添加番剧/添加等番”，填名称。
2. 快速双击“保存”（或按住 Ctrl 连按 Enter）。
3. 预期只发 1 次 `add`。
4. 实际发 2 次。追番表 `name UNIQUE` 时第二次返回“该番剧已存在”，用户先看到成功再看到失败；编辑/其他表则可能写入两次。

**期望 vs 实际**：一次表单提交只产生一次请求；实际重复提交。

**建议修复**：增加 `saving` ref，进入保存立即置 true，`finally` 恢复；按钮 `:disabled="saving"`，函数入口二次判断。

### [P2] “本月等番”横幅把所有历史月份和当前年份的纯年份记录都算入

文件：`src/views/WatchingView.vue:452-458`

**现象/证据**：
```js
return item.expected_date.startsWith(currentYM) ||
       item.expected_date <= currentYM
```
后半段是“小于等于当前年月”，因此 2025/12、2020/01、甚至 `2025` 这种纯年份都会计入；文案却是“本月有 N 部等番即将更新”。

**最小复现**：
1. 让 `remainingApi.getAll()` 返回：`2025/01` 一条、当前月一条、明年一条。
2. 预期横幅显示“本月有 1 部…”。
3. 实际显示“本月有 2 部…”。

**期望 vs 实际**：统计口径应与“本月”一致；历史/未来都不应计入。

**建议修复**：只保留 `startsWith(currentYM)`；如需提醒逾期，另起“已逾期/待确认”计数和文案，不要混入“本月”。

### [P2] 等待更新按预计日期升序时，空日期记录排在最前面

文件：`src/views/RemainingView.vue:412-424`；`src/composables/useDatePicker.js:126-131`

**现象/证据**：
```js
const da = String(a || '').replace(/\D/g, '')
```
空日期得到 `''`，在 `'' < '20261201'` 时返回 `-1`，所以默认升序把空日期排在最前。批量添加恰好把 `expected_date` 写成 `''`（`RemainingView.vue:582`），因此批量添加的条目会占据列表顶部，而不是排到后面。

**最小复现**：
1. 添加一条预计日期为 `2026/12/01` 的等番。
2. 批量添加一条（预计日期为空）。
3. 默认按预计日期升序。
4. 预期有日期的记录在前，空日期在最后。
5. 实际空日期记录排第一。

**期望 vs 实际**：空值应视为“未知”，两种排序方向都应排在最后；实际升序时置顶。

**建议修复**：排序函数显式处理空值：两个都空返回 0，单边空返回 1（无论 asc/desc）。

### [P2] 等待更新预计日期手动输入无校验/不补零，导致非法值和错误排序

文件：`src/views/RemainingView.vue:255-260`、`src/views/RemainingView.vue:714-726`；`src/db/index.js:127-130`；`src/composables/useDatePicker.js:126-131`

**现象/证据**：手动输入直接 `v-model="form.expected_date"`，`saveForm` 不调用 `validateDate`；DB 的 `_normalizeDate` 只把 `-` 换成 `/`，不补零。`compareDateKey` 直接去掉非数字后按字符串比较。

**最小复现**：
1. 添加两条等番，预计日期分别为 `2025/7` 和 `2025/10`。
2. 默认升序。
3. 预期 7 月在 10 月前。
4. 实际 `20257` 与 `202510` 比较，10 月排在前面。
5. 另外输入 `2025/13/99` 也会被接受并入库。

**期望 vs 实际**：日期应校验并归一化为补零格式（`2025/07`）后再排序；实际非法值可入库且排序错误。

**建议修复**：保存前统一 `validateDate` + `normalized`；inline/批量添加路径也走同一归一化；`compareDateKey` 改为解析年/月/日后数值比较。

### [P2] 等待更新批量添加静默忽略失败，异常时中断且无提示

文件：`src/views/RemainingView.vue:577-588`

**现象/证据**：
```js
for (const name of names) {
  const res = await remainingApi.add({...})
  if (res.data.success) added++
}
showToast(`已批量添加 ${added} 部等番 ✨`)
```
失败分支没有记录、没有提示；`remainingApi.add` 抛异常时整个函数中断，前面已成功写入的记录保留，弹窗不关闭，且没有错误 Toast。

**最小复现**：
1. 批量添加输入两行同名 `番剧A`。
2. 预期提示“1 成功、1 失败（重名）”。
3. 实际只显示“已批量添加 1 部等番 ✨”，失败条目无任何说明。
4. 若第二条请求 reject，则弹窗停留、前一条已入库，无失败 Toast（静态审计确认）。

**期望 vs 实际**：批量操作应返回逐条结果并提示失败；实际静默丢数据/中断。

**建议修复**：`try/catch` 包住每条，收集 `{ name, error }`，结束后展示成功数与失败清单；失败时不要谎报全部成功。

### [P2] “移至已看”的手动时间没有校验，可提交 `25:99`

文件：`src/views/WatchingView.vue:324-325`、`src/views/WatchingView.vue:856-879`

**现象/证据**：手动时间输入直接 `v-model="moveTime"`；`moveToWatched` 只调用 `validateDate(moveDate)`，随后把 `moveTime` 原样拼到日期后：
```js
finalDate += ' ' + moveTime.value
```
没有校验 `HH:mm` 范围或格式。

**最小复现**：
1. 选中一条追番，打开“移至已看”。
2. 时间切到“手动输入”，填 `25:99`。
3. 点“确定”。
4. 预期显示时间格式错误并阻止提交。
5. 实际调用 `moveToWatched(id, "YYYY/MM/DD 25:99")`，写入非法观看时间。

**期望 vs 实际**：非法时间不应进入数据库；实际直接提交。

**建议修复**：复用时间正则/`validateDate` 的 time 分支，或统一用 `validateDate(date + ' ' + time)` 校验；新增/编辑弹窗的手动 `formTime` 也走同一校验。

### [P2] `normalizeEpisodeInput` 接受负数和 `Infinity`

文件：`src/composables/useEpisode.js:44-51`

**现象/证据**：
```js
if (/^\d+(\.\d+)?$/.test(s)) return s
const n = parseFloat(s)
return isNaN(n) ? '0' : String(n)
```
正则只接受非负数字，但失败后回退到 `parseFloat`：`-2` 变成 `-2`，`Infinity` 变成 `Infinity`，`1e3` 变成 `1000`。这些值会经 `saveForm`/内联编辑写入 `current_episode`。

**最小复现**：
1. 双击集数，输入 `-2`，回车。
2. 预期规范化为 `0`（或提示非法）。
3. 实际保存 `-2`，卡片显示 `e-2`，后续 `smartIncrement` 得到 `-1`。

**期望 vs 实际**：集数只能是非负十进制；实际负数/无穷值可入库。

**建议修复**：只接受 `/^\d+(\.\d+)?$/`，否则返回 `'0'` 或抛校验错误；不要用 `parseFloat` 兜底接受任意数字串。

### [P2] 动态参数值未编码，`#` 会截断查询串、`&` 会拆出额外参数

文件：`src/composables/useEpisode.js:54-56`；`src/views/WatchingView.vue:601`、`src/views/WatchingView.vue:606`

**现象/证据**：
```js
const params = item.url_params.replace(/\{集数\}/g, item.current_episode || 0)
url += (url.includes('?') ? '&' : '?') + params
```
`url_params` 整串原样拼接，模板还把用户输入的番剧名/关键词直接塞进查询串：
```js
form.value.url_params = `keyword=${kw}`
```
未对参数值做 `encodeURIComponent`。

**最小复现**：
1. 全站搜索关键词填 `C#`，应用模板。
2. 点击生成的链接。
3. 预期搜索 `C#`（`C%23`）。
4. 实际 URL 变成 `...?keyword=C#`，`#` 后内容成为 fragment，搜索词只剩 `C`；若关键词含 `&` 则会拆成额外参数。

**期望 vs 实际**：用户输入应作为单个查询值编码；实际可改变 URL 结构。

**建议修复**：模板用 `URLSearchParams` 构造查询（自动编码值）；通用 `buildItemUrl` 明确约定 `url_params` 是“已编码的原始查询串”，或改成接收键值对数组。

## P3

### [P3] `buildItemUrl` 对已带 `?` 的 URL / 带前导分隔符的参数生成 `?&`、`??`

文件：`src/composables/useEpisode.js:54-56`

**现象/证据**：
```js
url += (url.includes('?') ? '&' : '?') + params
```
只判断是否包含 `?`，没有处理 `url` 以 `?` 结尾、`url_params` 以 `?`/`&` 开头的情况。

**最小复现**：
- `buildItemUrl({ url: 'https://a.test/path?', url_params: 'p=1' })` → `https://a.test/path?&p=1`
- `buildItemUrl({ url: 'https://a.test/path', url_params: '?p=1' })` → `https://a.test/path??p=1`
- `buildItemUrl({ url: 'https://a.test/path', url_params: '&p=1' })` → `https://a.test/path?&p=1`

**期望 vs 实际**：应归一化为一个 `?` 和一个参数分隔符；实际产生重复/空分隔符。

**建议修复**：先 `url.replace(/\?$/, '')`，`params.replace(/^[?&]+/, '')`，再按 `url.includes('?')` 拼接；空参数直接返回原 URL。

### [P3] 内联编辑允许把番剧名称清空

文件：`src/views/WatchingView.vue:739-755`；`src/views/RemainingView.vue:674-686`

**现象/证据**：`saveEdit` 对 `name` 字段没有 `trim()`/空值检查，直接 `watchingApi.update(id, { name: '' })`；数据库 `name TEXT NOT NULL` 只阻止 `NULL`，不阻止空字符串。添加表单有校验（`saveForm` 中的 `if (!form.value.name.trim())`），内联编辑绕过。

**最小复现**：
1. 双击卡片/表格行名称，全选删除，按 Enter。
2. 预期提示“请输入番剧名称”并保留编辑框。
3. 实际更新成功，卡片/表格出现空白名称。

**期望 vs 实际**：名称不能为空；实际可清空。

**建议修复**：`saveEdit` 对 `field === 'name'` 执行 `val.trim()` 并拒绝空值；与 `saveForm` 共用校验函数。

### [P3] `window.open` 未传 `noopener`，新页面可访问 `window.opener`

文件：`src/views/WatchingView.vue:619-623`、`src/views/WatchingView.vue:723-729`；`src/views/RemainingView.vue:616-620`

**现象/证据**：
```js
window.open(buildItemUrl(item), '_blank')
```
没有第三个参数；`target="_blank"` 的模板链接已有 `rel="noopener"`，但脚本打开的外链没有同等保护。外部页面可通过 `window.opener` 操作原页面。

**最小复现**：右键菜单“打开链接”/中键打开，检查新页面 `window.opener`；在未启用浏览器默认隔离的环境中非空。`(静态审计，jsdom 无法可靠验证浏览器 opener 行为)`

**期望 vs 实际**：外链应隔离 opener；实际没有显式隔离。

**建议修复**：统一 `window.open(url, '_blank', 'noopener,noreferrer')`，或 `const w = window.open(...); if (w) w.opener = null`。

### [P3] 等待更新页 Escape 不关闭右键菜单/每页条数菜单

文件：`src/views/RemainingView.vue:484-492`；菜单定义见 `src/views/RemainingView.vue:133-153`、`src/views/RemainingView.vue:608-613`

**现象/证据**：`handleKeydown` 只处理 `showDialog`、`showMoveDialog`、`showConfirmDialog`、`showBatchAddDialog`、`showSeasonMenu` 和批量模式，没有处理 `contextMenu.show` 与 `showPageSizeMenu`。追番页的 `handleKeydown` 会关闭 `contextMenu`（`WatchingView.vue:494-501`），两页行为不一致。

**最小复现**：
1. 等待更新页右键任意行打开菜单。
2. 按 Escape。
3. 预期菜单关闭。
4. 实际菜单保留；每页条数下拉菜单同样不受 Escape 影响。

**期望 vs 实际**：Escape 应关闭当前浮层；实际只关闭部分浮层。

**建议修复**：在 `handleKeydown` 中按层级加入 `if (contextMenu.value.show) { contextMenu.value.show = false; return }` 和 `if (showPageSizeMenu.value) { showPageSizeMenu.value = false; return }`。

## 测试与未覆盖说明

### 测试结果

```text
pnpm exec vitest run tests/watching.test.js

Test Files  1 passed (1)
Tests       14 passed | 13 expected fail (27)
```

测试覆盖：

- `WatchingView`：周历/未排期渲染、`+1/-1`、集数内联编辑、添加与 URL 查询参数分离、移至已看默认今天、批量选择删除。
- `RemainingView`：搜索、空状态、分页、删除最后一页唯一记录、移至追番、新增默认预计日期、批量删除、排序、内联编辑并发、`{集数}` 链接。
- 纯函数：`buildItemUrl` 常规拼接、`normalizeEpisodeInput`。
- 13 个 `it.fails` 分别覆盖：追番中键默认链接、本月横幅、选中对象刷新、内联保存并发（两页）、重复提交、非法手动时间、跨页全选、空日期排序、非补零日期排序、等待更新中键、负数集数、URL `#` 编码。

### 未覆盖原因

- “批量添加失败分支”：Vue 模板事件处理器不返回 Promise，注入 rejection 会产生测试进程级 unhandled rejection；该分支由静态审计确认（`RemainingView.vue:577-588`），未作为组件用例。
- `window.open` 的 `noopener`：jsdom 不实现真实 opener 生命周期，只能静态审计。
- `buildItemUrl` 分隔符和“清空名称”：均为直接可判定的字符串/API 调用问题，未额外增加用例；建议修复后补上。
- 浏览器原生中键对 `<a target="_blank">` 的默认行为（是否与组件 `window.open` 重复开标签）未在本环境证实，未列入缺陷。
