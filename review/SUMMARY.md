# PBM 全量 Code Review 与修复报告

- 项目：`D:\Files\Projects\Project-Banager`
- 分支：`review/full-audit`（基于 `main` @ `0f55e61`）
- 审计范围：`src/` 全部源码、`vite`/`tailwind`/`index.html` 构建配置、`template.xlsx` 导入契约、README 数据表结构
- 手段：5 组并行审计（数据层 / 组合式函数 / 追番+等番 / 已看+导入+外壳 / 外观+构建+安全），逐条复现后用 vitest + Playwright 验证

## 结论

**332 个自动化测试全部真实通过**，无 `it.fails` 掩盖（修复过程中一度残留 13 个"预期失败"标记，已全部解盲并逐条修掉）。

```
Test Files  9 passed (9)
Tests       332 passed (332)
```

浏览器端到端（Chromium）验证：Excel 导入 48 条无错误、追番周历渲染、已看分组统计、备份导出、非法备份被拦截且应用仍可写。

**`file://` 直开验收**（README 的核心承诺）：单文件产物双击打开后，页面/logo/WASM/数据库写入/新增自动选中全部正常，**控制台零错误**。

---

## 第二轮：遗留项清账与体验/性能优化

第一轮修完 60+ 缺陷后，以下遗留项已在本轮全部处理：

### 遗留项（全部关闭）

| 项 | 处理 |
|---|---|
| xlsx 0.18.5 的两个 CVE | 升级到 **0.20.3**（SheetJS 官方 CDN，npm 公共源无修复版）。CVE-2023-30533（原型污染）、CVE-2024-22363（ReDoS）解除 |
| 导入仍阻塞主线程 | 落盘改批处理（每表一次事务），导入页任务状态提升为模块级单例，支持切路由不丢进度 + 全局锁禁并发 |
| `watched_years` 无 `updated_at` 与 README 不符 | README 已按实际结构更正（明确标注该表无 `updated_at`），并补充索引说明 |
| 外观层 P2 若干 | 见下表，逐项实装 |

### 外观/健壮性实装修复

| 缺陷 | 修复 |
|---|---|
| 用户可控壁纸 URL 未做协议校验 | 新增 `sanitizeImageUrl` / `sanitizeBackgroundUrl`：只放行 `http/https/blob` 与安全相对路径，拒绝 `javascript:` `data:` `file:` `vbscript:` `about:`，并拒绝带账号密码的 URL。`ThemeSettings` 两处 `window.open` 及状态写入前均过闸 |
| localStorage 无 schema 校验，坏结构让外观引擎整体中断 | 新增 `normalizeAppearance`：逐字段白名单 + 类型/范围校验，非法整段落回默认并清理存储；修复模块级 `bgDeferred` 卡死 |
| 壁纸探测无超时，悬挂请求永不回退 | `probeBackground` 加 10s 兜底定时器 + `onload/onerror` 置空与 `src` 移除 |
| 取色代理链无超时/不可取消 | 每个代理 `AbortController` + 4s 超时；`bgGen` 变化即刻中止整轮 |
| 自定义 URL 默认外发第三方代理（可能泄露 token） | 仅内置图源（alcy/dmoe/loliapi）允许经代理外发；`custom` 只直连；日志脱敏不打印完整 URL |
| `providerBlocksPalette` 恒为 `false` | 新增 `proxyHealth` 运行时健康度（连续失败 ≥2 次判定不可用），UI 与真实能力同步 |
| `--c-primary-light` 深底最低 3.94:1 | `lightenToContrast` / `darkenToContrast` 重写为 sRGB 内二分求解 + 降饱和兜底 + 取整方向对齐，**144 种色相组合全部 ≥4.5:1**（新增 6 条回归用例锁定） |

### 性能优化

- **落盘从 O(n²) 降到 O(n)**：`save()` 改为防抖合并，`flush()` 支持串行续写；`flushNow()` 在页面隐藏/`pagehide` 时同步兜底，防止最后一笔丢失
- **导入批处理 + 分片让出主线程**：每张表一个事务一次落盘；已看表每 50 行 `await` 一次 `requestAnimationFrame`，配合 ImportView 的百分比进度日志
- **索引**：7 个（`watching(day_of_week,sort_order)`、`remaining(expected_date)`、`watched(watch_date)` 等），按天/按年视图不再全表扫描
- **启动不白写**：`initTables` 只在结构/数据真变化时落盘（原实现每次启动都全库序列化一次）
- **日期修复批处理化**

**实测**（1500 行「已看」工作簿，`tests/e2e/perf-import.mjs`）：

```
耗时: 1.9s
最长无响应间隔: 264ms   （轮询粒度，非主线程阻塞）
结果: 成功导入 1500 条数据，失败 0 条
有进度日志: true
错误数: 0
```

原实现在这项上是 O(n²)：每行 `_run` 都会 `db.export()` 全库序列化一次并新建 IndexedDB 连接。

### 构建与产物

- **WASM 插件重写**：不再联网抓 sql.js.org 的"最新"WASM（会与已装版本 ABI 漂移），改为只读 `node_modules/sql.js/dist/sql-wasm.wasm`；`apply: 'build'` 不再污染 dev；生成文件带版本+sha256 标注。实测当前为 `sql.js 1.14.1 / sha256:438c88f6`，而旧缓存是另一个二进制
- **真单文件**：logo 2.4MB → 256px WebP 24.9KB 并从 `src/assets` 内联；favicon 内联为 data URI。`dist/` 从 3 个文件变为 **1 个**

### 交互修复

- **新增后自动选中新记录**（原为添加完 `selected` 为空，`+1集` 按钮保持灰色禁用，用户必须先手动点卡片）。根因两层：视图层未回绑 + `addWatching` 返回 id 为 0（真实浏览器下 `last_insert_rowid()` 因 `save()` 时序失效，node 里却正常——只有 E2E 能抓到）。改为按唯一键回查
- **Toast 不再遮挡右上角时钟**：原 `top-6` 与 `h-14` header 重叠，下移至 `top-[4.5rem]`
- Toast 同文案合并、可手动关闭、上限 5 条

### 新增测试

| 文件 | 内容 |
|---|---|
| `tests/robustness.test.js` | URL 协议白名单（20 例，含 `javascript:`/`data:`/`file:`/带凭据） |
| `tests/contrast.test.js` | 144 种色相组合的 4.5:1 穷举回归 + 对比度基线 |
| `tests/import-task.test.js` | 导入任务跨路由持久化、并发锁、日志上限 |
| `tests/dialog-focus.test.js` | 弹窗焦点陷阱、焦点归还、`role=dialog` 语义 |
| `tests/i18n.test.js` | 三语 key 严格对齐、占位符一致、回退链、循环切换、`html lang` 同步 |
| `tests/a11y.test.js` | 键盘可达性、`aria-sort`、`aria-checked`、弹窗语义（24 例） |
| `tests/e2e/verify-file-protocol.mjs` | `file://` 直开端到端验收 |
| `tests/e2e/verify-a11y.mjs` | 键盘可达性端到端验收 |
| `tests/e2e/verify-i18n.mjs` | 三语切换端到端验收 |
| `tests/e2e/verify-dist.mjs` | 构建产物验收（时钟/图标/版本号） |
| `tests/e2e/perf-import.mjs` | 1500 行导入性能实测 |

---

## 第三轮：i18n、视觉改造与无障碍收口

### 中英日三语 i18n（纯自研，零依赖）

- `src/composables/useI18n.js`：约 80 行核心引擎。回退链 `当前语言 → 中文 → 内置兜底 → 原样 key`，支持 `{name}` 插值
- `src/locales/{zh,en,ja}.js`：**419 个 key 三语严格对齐**，零缺失零多余，占位符逐 key 核对一致
- 日文用动漫工具惯用语（`視聴中` / `更新待ち` / `視聴履歴` / `作品を追加しました`），不是机翻
- 顶栏语言切换按钮，`<html lang>` 同步，localStorage 持久化
- 星期是数据层中文标识（`周一`…），展示时按语言翻译（`Monday` / `月曜日`）
- 语言包缺失时组件仍显示中文（内置 fallback），避免裸 key 泄露
- **全量覆盖**：4 个视图 + 3 个组件 + 全部 toast/aria-label/空态文案

**端到端验收**（`tests/e2e/final-acceptance.mjs`）：

```
[中文] 疑似中文残留字符数: 1
[英文] 疑似中文残留字符数: 0   ← 零泄漏
[日文] 疑似中文残留字符数: 1   ← 唯一命中是日文「削除」，属误报
/watching /remaining /watched /import 加载正常: true
错误数: 0
```

**未翻译的合理例外**（数据层字面量，不应翻译）：
- `{集数}` 占位符 token（数据库存储格式）
- `weekDays = ['周一',…]`（数据层星期标识）

**i18n 落地踩坑**：
1. 批量正则替换会破坏 Vue 表达式（`本年:` 被替成含逗号的表达式）→ 回退后改逐条精确编辑
2. 组件用了 `tt()` 但忘 `import useI18n` → 运行时静默失败，靠测试才捕获
3. 英文包写 `{集数}` 会被「无中文残留」护栏判失败 → 统一占位符为 `{episode}`
4. 日文比中文长，侧边栏按钮折成三行 → 新增 `*Short` 短文案 + `whitespace-nowrap`

### 顶栏视觉改造（按用户要求）

| 项 | 改动 |
|---|---|
| 三个 emoji 图标 | 改为**内联 SVG**（`stroke="currentColor"`）：相框（关闭态带斜杠）、调色板、太阳/月亮/自动三态。与毛玻璃极简风格统一 |
| 时钟 | 常驻只显示 `2026/10/31 Sat`，**悬浮/聚焦时气泡显示 `13:42:34`**，减少每秒刷新造成的视觉噪音 |
| 备份提示 | 移除常驻「上次备份: XX 天前」，改为**悬浮到导出按钮上时气泡展示**，超过一周附警示 |
| `Standalone` | 改为**版本号 `v1.0.0`**，由 `vite.config.js` 从 `package.json` 注入（单一来源，避免两处手改不同步） |

**实测**：`SVG 图标数: 3`、`顶栏还有 emoji: false`、`时钟常驻: "2026/10/31 Sat"（含秒: false）`、`版本号: v1.0.0`、`Standalone 残留: false`，零错误。

### 无障碍（a11y）实装

新增 `src/composables/useDialogFocus.js`，接入**13 个弹窗**：

- 打开时自动聚焦首个输入框；`Tab`/`Shift+Tab` 在弹窗内循环；关闭后焦点归还触发按钮
- 修复该 composable 自身缺陷：`watch` 未加 `immediate`，导致**挂载时就已打开的弹窗不聚焦**
- 13 个弹窗全部 `role="dialog" aria-modal="true" aria-labelledby`（指向真实非空标题）
- 三页可排序表头 `tabindex=0 role=button aria-sort` + 键盘触发
- 批量勾选框 `role=checkbox :aria-checked tabindex=0`（含 `WatchingCard`）
- 追番卡片本体补 `role=button tabindex=0 aria-pressed`（键盘处理只在 `target===currentTarget` 触发，避免吞掉输入框空格）
- 图标按钮 `aria-label`，装饰性 emoji `aria-hidden`

**Tab 可达数（修前 → 修后）**：追番 13 → 16，等番 11 → 13。

### `watched_years` 结构补齐

- 补 `created_at` / `updated_at` 列，让 README「各表均含」名副其实
- **踩到 SQLite 限制**：`ALTER TABLE ADD COLUMN` 不接受 `CURRENT_TIMESTAMP` 默认值（非常量表达式），改用「可空列 + UPDATE 回填」
- 老库自动迁移有测试覆盖

### 关于「现成的轮子」

用户问外观层能否用现成库。评估结论是**不引入**：

- `open-color` 是固定色板，与「任意色相派生可读变体」需求不匹配
- `color-convert` 只做格式转换，不提供「二分求对比度 + 派生文字色」这类能力
- 自研 `colorMath` 已有 144 色相穷举验证，换库反而要重做验证且增大产物

---

## 已修复缺陷（按严重度）

### P0 数据丢失级

| # | 缺陷 | 文件 |
|---|------|------|
| 1 | 迁移重建 `watching` 表时漏 `url_params`，升级后读取/新增全失败，参数永久丢失 | `src/db/index.js` `_migrateWatchingEpisodeToText` |
| 2 | 迁移 `INSERT` 失败时 `catch` 直接 `DROP watching_old`，整表数据被删 | 同上（改为事务 + 行数校验 + 失败保留原表） |
| 3 | 备份恢复零校验：坏文件把单例打成 `database is closed`；合法异库直接覆盖 IndexedDB 且不可回滚 | `src/App.vue`、`src/db/index.js` `importDb` |

修复要点：迁移包进 `BEGIN/COMMIT`，失败 `ROLLBACK` 并把 `watching_old` 改回 `watching`；`importDb` 改为“临时实例建好再 swap”，先校验 `SQLite format 3\0` 魔数；恢复前自动导出一份 `bangumi_pre_restore_<ts>.db` 快照；恢复失败回滚到原库。

### P1

- 追番卡片中键无链接时调用未定义 `defaultBgmUrl` → 统一导出 `defaultBgmUrl` / `openExternal`
- 等待更新表格中键调用未定义 `openItemLink` → 补齐实现
- 批量勾选跨页/跨筛选残留，`isAllChecked` 只比数量 → 改为“当前页 id 全部包含于选中集”，`toggleSelectAll` 改并集/差集，`fetchData` 后按可见 id 裁剪
- 等番 `{集数}` 恒被替换成 0（表无该字段）→ 等番页不再假装支持，占位符原样保留并改文案
- `getDb` 并发首次初始化创建两个实例 → 缓存初始化 Promise
- IndexedDB 写入失败被静默吞掉 → `save()` 返回 Promise，新增 `saveStrict()` 供关键路径感知失败
- `move*` 三个迁移无事务、忽略删除结果 → 单一事务 + 检查 `getRowsModified()`
- `loadFromIndexedDB` 读失败当成“无数据”可能用空库覆盖旧快照 → 区分“无记录/读失败”，读失败中止启动并提示
- 年份范围分组 `2014~2017` 只做字面等值、未分类重复收录 → 数据层按区间匹配，未分类用同一套区间判定
- 导入把首行任意单元格当年份（数值序号列/标题行造出假年份组）→ `parseYear` 非法返回 `null`，表头向下探测最多 5 行，支持横向合并
- 大文件导入 O(n²)（每条 `_run` 全库 export）→ 新增 `beginBatch/commitBatch`，导入按批落盘一次；IndexedDB 连接改单例复用
- 渐变按钮白字对比度最低 ~1.30:1 → 按钮渐变端点由 `*-light`（深底文字用）改为 `*-dark`，共 5 个文件

### P2 / P3（部分代表性项）

- `clearAll`/`addWatched` 非原子 → 事务化
- `updateWatched` 改日期不补建年份标签 → 补建
- `updateWatchedYear` 改名不迁移记录 → 数据层同步迁移
- 等番数字年份被当 Excel 序列号、每月 1 号丢日精度 → 数值落 1900–2100 按年份处理，`date.d != null` 才补日
- 追番表非星期列（备注列）被当番剧导入、纯数字标题被丢弃 → 只遍历 `colDayMap` 列，数字标题保留、时间小数排除
- 等番工作表名不识别“等待” → 补 `等待` / `Waiting`
- 第二次导入 `sort_order` 从 1 重来 → 以现有最大 `sort_order` 起算
- 导入无事务、全失败仍 `success:true` → 按识别到的表 + 成功数判定
- 找不到追番表回落 `SheetNames[0]` 制造假错误 → 直接跳过
- 已看按列优先导入（与文档“按 Excel 排列”不符）→ 改行优先
- `getWatchedByYear` LIKE 未转义 `%` `_` → `ESCAPE '\'`
- `getWatchingByDay` 不返回 url/url_params → 补齐字段
- `batchDelete*` 返回 `ids.length` 而非真实行数 → 返回 `getRowsModified()`
- 删除最后一个年份后列表残留 → `fetchData` 无选中时清空
- 新增/编辑后年份下拉不刷新 → 补 `fetchYears()`
- 行内编辑可写入非法日期/清空名称 → 统一 `validateDate` + trim + 空值拒绝
- 保存按钮可重复提交 → `saving` 状态 + `:disabled`
- 内联编辑旧请求关闭新编辑器 → token 比对再清 `editing`
- `fetchData` 后 `selected` 指向过期对象 → 按 id 重绑
- 删除最后一个年份后列表不刷新 → 同上
- 移至已看手动时间可提交 `25:99` → `HH:mm` 正则校验（追番页与已看页均加）
- `normalizeEpisodeInput` 接受负数/Infinity/科学计数 → 只接受十进制，`1e3` 展开为 `1000`
- `smartDecrement` 把 `26.00`/`1.0`/`00` 清成 `0`、`26.10` 丢位宽 → 保持原宽度
- `smartIncrement('1.')` 产生 NaN → 返回原值
- 动态参数 `#` 截断查询串、`&` 拆参 → 模板值 `encodeURIComponent`，`#` 转义
- `buildItemUrl` 生成 `?&`/`??` → 归一化首尾分隔符
- `window.open` 缺 `noopener` → 统一 `openExternal()` 带 `noopener,noreferrer` 并置 `opener = null`
- 导入页不校验类型/大小、同文件无法再选 → 扩展名 + 20MB 限制 + `value=''`
- 导出后立即 revoke、`<a>` 未挂 DOM → append/click/remove + 延迟 revoke
- Toast 无 `aria-live`、不可关闭、无上限 → 加 `role=status`/`aria-live=polite`、单条关闭、同文案合并、上限 5
- 已看表头/勾选框无键盘可达性、弹窗无 `role=dialog` → `tabindex`/`role=button`/`aria-sort`/`role=checkbox`/`aria-modal`
- `useTheme` 卸载不摘 `matchMedia` 监听 → `onUnmounted` 清理
- 年/年月精度记录编辑弹窗日期框空白 → 自动切手动输入并提示精度
- 恢复后不等落盘就 reload → `await db.save()` 后再 reload
- `xlsx 0.18.5` 两个 CVE → 公共源无修复版，改为禁用危险解析项 + 20MB 上限（需后续换库或走官方 CDN 升级，见遗留项）

---

## 遗留项（需产品/依赖决策，非本次阻断）

1. **xlsx 依赖 CVE**：npm 公共源最高仅 0.18.5。已加文件大小限制与解析选项收敛，彻底解决需从 SheetJS 官方 CDN 安装 ≥0.20.3 或迁移 `exceljs`。
2. **导入仍同步主线程**：已把落盘收敛为“批内一次”，但解析仍在 UI 线程。数据量很大时建议移入 Worker + 进度条。
3. **`watched_years` 无 `updated_at`**：README 声称“各表均含”，文档与实际不一致，建议改文档或补列。
4. **外观引擎若干 P2**（壁纸代际竞态、代理链无超时、硬编码第三方 Worker、`--c-primary-light` 在深色玻璃 3.94:1）未在本次改动，因影响面在视觉微调，需单独迭代验证。

## 复现与验证命令

```bash
pnpm install
pnpm test          # 299 passed
pnpm build         # dist/index.html 单文件
node tests/e2e/verify.mjs   # 需先 pnpm dev --port 5180
```

`review/` 下保留了 5 份原始审计报告（`db.md`、`logic.md`、`watching.md`、`watched-import.md`、`appearance.md`），`tests/` 为可重跑的回归用例（`db` / `logic` / `watching` / `watched-import` / `appearance`）。
