# 交付文档 · PBM (Project Bangumi Manager)

> 交接对象：接手的下一个 Agent / 维护者
> 交接日期：2026-11-02
> 仓库：`D:\Files\Projects\Project-Banager`（远端 `origin` = https://github.com/Emilelu/Project-Banager.git）
> 当前版本：**v1.19.0** · 分支 `main` · HEAD `0419c89`

---

## 0. 三十秒速览

| 项 | 值 |
|---|---|
| 是什么 | 一个纯浏览器运行、单 HTML 文件部署的番剧（追番）管理器 |
| 技术栈 | Vue 3 · Vite 6 · Tailwind 3 · vue-router 4 · sql.js(WASM) · SheetJS 0.20 |
| 数据 | SQLite（sql.js WASM）跑在浏览器里，持久化到 IndexedDB，无后端 |
| 产物 | `dist/index.html`，约 **1.6 MB**（gzip 约 **707 KB**），WASM 已内联 |
| 测试基线 | **14 文件 / 473 用例全部通过** |
| 构建 | `pnpm build` 成功，93 modules，约 5.3 s |
| 三语 | zh / en / ja，**589** 个 key 三语完全对齐 |

**接手第一件事**：跑一次 `pnpm install && pnpm test`，确认基线是 473 passed。数字变了就说明环境或依赖有问题，先解决再动代码。

---

## 1. 快速上手

```bash
pnpm install
pnpm dev        # 开发服务器，默认 http://localhost:5174（见 vite.config.js）
pnpm build      # 产出 dist/index.html（单文件）
pnpm test       # vitest run，473 用例
pnpm preview    # 预览构建产物
```

### ⚠️ Windows + PowerShell 5.1 的测试命令陷阱

`pnpm exec vitest run` 在 PowerShell 里**会因为 stderr 语义返回 exit code 1**，这不代表测试失败。

**判断标准**看这两行输出：
```
Test Files  14 passed (14)
     Tests  473 passed (473)
```
不要只看退出码，否则会误判为红灯。

### 目录导航

```
src/
├── App.vue                根组件：侧栏、顶栏、Toast、帮助弹窗（947 行，改动前先读完相关段）
├── main.js                启动编排：i18n → theme → mount → appearance（顺序有讲究，见文件注释）
├── router/index.js        7 条路由 + /import 重定向
├── components/            11 个 .vue 组件 + iconData.js（AppIcon / DatePicker / ColorPicker / ClockPicker / WatchingCard …）
├── composables/           16 个组合式模块（外观引擎、i18n、主题、气泡、焦点陷阱 …）
├── db/                    数据层：index.js（表结构+迁移，1264 行）、导入导出 4 个模块
├── locales/               三语语言包（各 618-621 行）+ index.js 注册表
├── views/                 7 个页面（追番/等番/已看/标签/主题/导入导出/旧导入）
└── style.css              全局样式与主题变量（3564 行，动画与主题规则集中在这里）
tests/                     14 个测试文件
scripts/                   工具脚本（text.js 体检、run.mjs 脚本执行器、构建分析）
docs/                      审计报告 + README 截图
review/                    历史 code review 报告（含 SYSTEM 说明）
```

### 最该先读的 4 个文件

1. **`AGENTS.md`** —— 本仓库的硬性约定，**编码与 PowerShell 两个坑都在这里**，不读会在第一天就踩雷。
2. **`README.md`** —— 用户视角的功能全景。
3. **`docs/visual-audit.md`** —— 最近一轮视觉审计的 27 项问题与修复记录（带实测数据）。
4. **`CHANGELOG.md`** —— 各版本改了什么。

---

## 2. 必须遵守的仓库约定（会导致真实事故）

### 2.1 编码：本机是 GBK 代码页，PowerShell 写文件会毁掉中文

**这不是理论风险，本项目已因此发生多次事故**：`src/db/index.js` 中文注释变乱码导致 14 个测试文件全部编译失败；`ColorPicker.vue` 注释吞掉一行关键代码导致取色器点击无反应。

**硬规则**：
- 改源码**只用编辑工具**（read/edit/write），不要用 PowerShell 的 `Set-Content` / `-replace` 写回。
- 必须用脚本时，读写都强制 UTF-8 无 BOM：`fs.writeFileSync(p, content, 'utf8')`。
- **改完必跑** `node scripts/text.js check`，要求输出 `乱码 0`、`BOM 0`。

### 2.2 PowerShell 会静默改写 `node -e` 的内容

反引号、`$`、`"`、`&&`、`||`、`<`、`>`、`@`、`!` 都会被 PowerShell 先解析一遍。本会话曾因此反复失败十余次。

**根治方法**：代码写进 `tmp/*.mjs` 文件，再用 `node scripts/run.mjs tmp/x.mjs` 执行。命令行只传纯 ASCII 路径，PowerShell 无可破坏之物。

```bash
node scripts/run.mjs tmp/x.mjs          # 执行
node scripts/run.mjs --check <file>     # 只做语法检查
node scripts/run.mjs --clean tmp/x.mjs  # 执行后删除
```

`tmp/` 已在 `.gitignore` 里，一次性脚本不会污染仓库。

### 2.3 CSS 变量必须是「RGB 三元组 + 斜杠透明度」

主题色存的是通道值（`--c-primary: 124 58 237`）：

```css
rgb(var(--c-primary))              /* 正确 */
rgb(var(--c-primary) / 0.2)        /* 正确 */
rgba(var(--c-primary), 0.2)        /* ❌ 非法语法，整条声明被静默丢弃 */
```

但 `background-image` 的 gradient 里**不要**用斜杠 alpha，部分浏览器会整段失效、按钮背景消失。

### 2.4 深色模式写法特殊

用 `body.dark` / `html.dark` + `style.css` 里成组的 `.dark .xxx`，**没有**配置 Tailwind 的 `darkMode: 'class'`。

- scoped 样式里**不要**写 `:global(.dark) .foo` —— 本工程 Vue 版本会编译成空选择器，规则完全不生效。正确写法是直接写 `.dark .foo`。

### 2.5 弹窗/菜单/气泡必须 Teleport 到 body

祖先只要带 `backdrop-filter`（本站大量 `.glass` 卡片都有），就会成为 `position: fixed` 的**包含块**，导致 fixed 子元素按祖先盒子定位，**实测偏移可达 200px**。

所有弹窗、下拉菜单、气泡都必须 `Teleport to body` + `fixed` + `getBoundingClientRect()` 计算坐标。

### 2.6 transition-group 的两个坑

- `v-if` 与 `v-for` **不能写在同一个元素上**（Vue 3 里 `v-if` 优先级更高会跳过循环）。写成 `<template v-for><button v-if>`。
- 离场元素必须退出文档流（`position: absolute`），否则 leave 动画期间仍占宽，Vue 的 FLIP 会判定位移为 0，其余元素瞬跳。
- `-move` 类必须显式定义 `transition: transform`。

### 2.7 玻璃子树里不要放无限动画

`.glass` 带 backdrop-filter，子树里的无限动画会让那块玻璃**每帧重新捕获背景并模糊**，GPU 持续满载。代码里多处注释标记了这一点（如 `WatchingView` 周历列）。

### 2.8 i18n 纪律

- 三语 `src/locales/{zh,en,ja}.js` 的 **key 集合必须完全一致**，`{placeholder}` 也必须一致，由 `tests/i18n.test.js` 守着。
- 模板里所有用户可见文案走 `tt()`，**不允许硬编码中文**。
- 新增 key 必须三语同时加，否则测试红。

### 2.9 Commit 规范（feflow 风格，已被重写过一次）

```
<type>(<scope>): <subject>     ← 标题 ≤50 字符
<空行>
<body>                          ← 每行建议 ≤72 字符
```

- type 只允许：`feat` `fix` `docs` `style` `refactor` `perf` `test` `chore` `revert`
- 必须有 scope，subject 首字母小写、不以句号结尾、**不含非 ASCII 字符**
- 必须有 body，说明「为什么改 / 怎么解决 / 有无副作用」

详细规则与重写历史的可复现做法在 `AGENTS.md` 末尾。

---

## 3. 架构要点

### 3.1 数据层（`src/db/`）

**5 张表**（`src/db/index.js:264` 起）：

| 表 | 关键约束 |
|---|---|
| `watching` | `name` **UNIQUE** |
| `remaining` | `name` **UNIQUE** |
| `watched` | `name` 可重复（同名可多次看） |
| `watched_years` | `year_label` UNIQUE；**注意此表无 `updated_at`**（README 已标注） |
| `tags` | `name` UNIQUE；`is_builtin=1` 的内置标签**允许改名改色、不允许删除** |

每张业务表都有 `sort_order`（拖动排序）、`url` / `url_params` / `notes` / `cover_url`。

**落盘策略（性能关键）**：不能每次写都 `db.export()`（O(n²)）。现状是「写操作只标脏 → microtask 合并成一次 export + 一次事务」。

**迁移**：`_migrateAddColumn()` 逐列加；`watching` 有过一次整表重建（`ALTER TABLE ... RENAME TO watching_old` → 建新表 → 回填 → 改名），改动 schema 时务必读那一段。

**读取失败时不建空库** —— 宁可停在错误上，也不要用空库覆盖用户数据。这是硬约束。

### 3.2 导入 / 导出（`src/db/`）

| 模块 | 职责 |
|---|---|
| `excelImporter.js` | xlsx 导入：分段识别、周历解析、合并单元格年份、超链接 |
| `excelExporter.js` | 四种导出构建：`buildExportWorkbook/Csv/Json/Markdown` |
| `structuredImporter.js` | csv / json / md 回灌（不覆盖库） |
| `api.js` | 浏览器端 API 门面，返回 `{ data: { success, data } }` 兼容旧 axios 形状 |

导出格式 5 种：xlsx / csv / json / md / db。`.db` 是整库备份，恢复前自动留回滚快照。

### 3.3 外观引擎（`src/composables/useAppearance.js`，1490 行）

本项目最复杂的模块。负责：
- 毛玻璃 / 液态玻璃两档材质
- 6 套预设配色 + 跟随壁纸取色 + 每次随机
- 壁纸源（5 个图源带降级）、自动换图/固定
- 自适应文字色（按卡片有效亮度推算，保证 ≥4.5:1）
- 安全闸：`sanitizeImageUrl` / `sanitizeBackgroundUrl` 只放行 `http/https/blob` 与安全相对路径，拒绝 `javascript:` `data:` `file:` `vbscript:` `about:`
- `normalizeAppearance()` 做 localStorage schema 校验，非法值落回默认

**改这个文件前先读它的注释**，里面记录了多个实测坑（壁纸层必须真实 DOM 元素以兼容 Dark Reader、底图层不淡出是为了避免启动空窗等）。

### 3.4 页面状态共享（`src/composables/usePageStats.js`）

顶栏的计数徽章与操作按钮由各 view 写入模块级 reactive store，App.vue 读取。为什么不用 provide/inject：App.vue 与 view 之间隔着 `router-view`，模块级单例更直接。

### 3.5 启动顺序（`src/main.js`，有讲究）

```
registerAllMessages() → initLocale() → initTheme() → createApp/mount → initAppearance() 异步
```
i18n 必须在挂载前就绪（首帧文案依赖它）；主题必须在挂载前应用（避免「突然变色」）；外观初始化**不 await**（壁纸网络请求不能阻塞首屏）。

---

## 4. 最近一轮改动（v1.19.0 未发布段）

### 4.1 视觉审计 27 项修复

完整记录见 **`docs/visual-audit.md`**（含每项实测数据）。归纳为 5 类：

**布局结构性**
- 表格改 `table-layout: fixed` + `<colgroup>` 定宽（序号 3.5rem / 日期 8.5rem / 链接 10.5rem / 备注 15rem，名称吃剩余）。宽屏下日期列不再从 51px 内容撑到 554px。
- ≤1024px 表格保持列宽、在卡片内横滚（`canScrollX: true`），不再把每列压到不可读。
- ≤1100px 页面操作收进「更多操作」菜单；≤900px 侧栏自动收起为图标模式。768px 下标题不再折两行、日期不再截断。

**渲染缺陷**
- 删除追番页因工具栏上移遗留的 30px 空玻璃卡片。
- 周五表头底色修复：`DAY_THEMES[4]` 原用 `bg-[#D97706]/18`，而 `/18` 不在 Tailwind 透明度刻度，class 被**静默丢弃**，改为 `/15`。
- 深色表头渐变改单一低透明底（消除色带断层）。

**信息密度**
- 卡片名称与标签拆行：徽章不再被压缩（原 8 个里 6 个被压成半个字），标签行走独立定高占位保证有/无标签的卡片等高。
- 集数行百分比紧跟读数，间距 59px → 7px。

**可读性/规格**
- 侧栏分区标题 9.625 → 11px；内置徽章 8.75 → 10.5px；Tooltip 10.5 → 11.5px；Help 键帽圆角 3.5 → 6px。
- 取色器色相条命中区 11 → 16px，预设色块 23×16 → ≥24×24。
- 主题页色圆对齐 34px 按钮高度；Transfer 页按钮统一 `.btn-base`。
- 表格选中/勾选态改语义类（`is-selected` / `is-checked`），主题色 22% + 3px 左轨。

**加载与无障碍**
- 首帧数据到达前渲染骨架行（`listLoaded` 门闩），不再先闪「暂无记录」。
- 全局 `prefers-reduced-motion` 兜底：原先只覆盖壁纸与导航（约 3%），现在弹窗/菜单/Toast/缩放全部降到 0.01ms。

### 4.2 README 与截图

- 7 张截图全部重拍（1600px），PNG → JPEG，体积 300-800KB → **51-107KB**。
- 三语 README 补充响应式/列宽/骨架屏/reduced-motion 说明。
- 校准过期数字：文案键 551 → **589**、产物 1.5MB → **1.6MB**、gzip 690 → **707KB**。

---

## 5. 接手后建议做什么

### 5.1 立即验证（10 分钟）

```bash
pnpm install
pnpm test                      # 期望 473 passed / 14 files
node scripts/text.js check     # 期望 乱码 0 / BOM 0
pnpm build                     # 期望 93 modules / ~5.3s
```
再起 `pnpm dev`，用 Chromium 打开 `/#/watching`、`/#/remaining`、`/#/watched`，确认三页无 console error。

### 5.2 已知遗留 / 待办

| 项 | 状态 |
|---|---|
| **V-18 星期配色** | **未改**。用户明确从修复清单中排除，星期表头仍是 7 种意象色（色相跨 258°、周六饱和度仅 5%）。若日后要统一，需重新决策。 |
| **V-25 侧栏底部 1px 偏差** | 未消除。根因是侧栏 210px 减内边距后为奇数像素，两列等分无法整除；flex 与 grid 两种方案都试过。**视觉不可感知**，判断可接受。 |
| **`review/SUMMARY.md` 已标注为历史快照** | 该文件记录 9 文件 / 332 用例与「299 passed」，都是**当时的事实**。已在文件头加警示说明「引用计数前以当下 `pnpm test` 为准」，当前实际基线是 **14 文件 / 473 用例**。原文保留不改动，以免篡改历史审计记录。 |
| **CHANGELOG 的 xlsx 缺口已标为已解决** | 原文那条「侧栏导入菜单选 .xlsx 会报不支持格式」针对的是**当时**的旧侧栏菜单。已用删除线保留原文，并补一条说明：入口迁到 `/transfer` 页后 `runImport()` 分派正确且有测试覆盖。 |
| **App.vue 死代码已清理** | 已删除约 470 行：整条导入/导出菜单链路、两个导入弹窗（确认框 + 结果面板）、备份气泡、未使用的辅助函数。`App.vue` 从 **1419 行降到 947 行**。删除后 `pnpm test` 473 全绿、`pnpm build` 成功、Chromium 六页零报错。 |
| `dist/index.html` 纳入了版本控制 | 每次改源码后需 `pnpm build` 并提交 dist，否则单文件下载用户拿不到修复。 |
| `backup-before-squash` 分支 | 本地保留的历史重写备份（204 提交），未推送。确认无用后可删。 |

### 5.3 改动时的检查清单

- [ ] 改源码只用编辑工具，没用 PowerShell 写文件
- [ ] `node scripts/text.js check` → 乱码 0 / BOM 0
- [ ] `pnpm test` → 473 passed（或按新增用例更新 README/CHANGELOG 中的数字）
- [ ] 新增 i18n key 三语齐全
- [ ] 新增全局组件/指令同时在 `src/main.js` 与 `tests/setup.js` 注册
- [ ] 改动了用户可见行为 → 更新 README（三语）+ CHANGELOG
- [ ] 改了界面 → 考虑重拍 `docs/screenshots/`（脚本可用 Playwright + sharp，见下方「验证手段」）
- [ ] `pnpm build` 成功并提交 `dist/index.html`
- [ ] commit message 符合 feflow 规范（≤50 字符标题 + 英文 + body）

---

## 6. 可用验证手段

### 6.1 单元测试

`vitest + jsdom + @vue/test-utils`，配置见 `vitest.config.js`。

测试文件分工（14 个）：

| 文件 | 覆盖 |
|---|---|
| `db.test.js` | 表结构、迁移、CRUD、落盘 |
| `logic.test.js` | 组合式函数纯逻辑（集数、日期、配色数学） |
| `watching.test.js` | 追番页 |
| `watched-import.test.js` | 已看页 + 导入 |
| `structured-import.test.js` | csv/json/md 回灌 |
| `remaining-sort.test.js` | 等番排序与拖动 |
| `a11y.test.js` | 键盘可达性、焦点陷阱、弹窗语义 |
| `appearance.test.js` | 外观引擎、配色、壁纸降级 |
| `contrast.test.js` | 对比度计算（≥4.5:1） |
| `edge-cases.test.js` / `robustness.test.js` | 边界与健壮性 |
| `i18n.test.js` | 三语 key/占位符一致性 |
| `dialog-focus.test.js` | 弹窗焦点 |
| `import-task.test.js` | 导入任务状态机 |

### 6.2 浏览器实测（Playwright 已装）

`playwright` 与 `sharp` 都在 devDependencies 里，**只装了 Chromium**（Firefox/WebKit 未安装，需要时 `pnpm exec playwright install firefox`）。

典型用法：`tmp/` 下写脚本 → `node scripts/run.mjs tmp/x.mjs`：

```js
import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await (await browser.newContext({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2
})).newPage()
await page.goto('http://127.0.0.1:5360/#/watching')
// 灌数据（注意：dev server 下可直接 import 源码模块）
await page.evaluate(async () => {
  const m = await import('/src/db/index.js')
  const db = await m.getDb()
  db.addWatching({ name: '测试番', day_of_week: '周一', current_episode: '1' })
})
await page.reload()      // 灌完必须 reload，否则页面不重新取数
await page.screenshot({ path: 'tmp/x.png' })
```

**踩过的坑**：灌数据后不 `reload` 会读到旧数据；深色模式 localStorage key 是 **`bangumi-theme`**（不是 `banager_theme`）；locale key 是 **`banager_locale`**。

测量手段（本轮审计用的）：
- 对比度 → WCAG 公式逐元素算比值
- 溢出 → `scrollWidth vs clientWidth`
- 尺寸 → `getBoundingClientRect` 批量比对
- 色相 → RGB 转 HSL 算跨度

### 6.3 其他工具

| 脚本 | 用途 |
|---|---|
| `scripts/text.js check` | 乱码/BOM/CRLF 体检（改完必跑） |
| `scripts/run.mjs` | 执行 tmp 脚本，绕过 PowerShell 转义 |
| `scripts/analyze-dist.mjs` / `analyze-bundle.mjs` | 产物与依赖体积分析 |
| `scripts/verify-build.mjs` | 构建产物校验 |
| `scripts/test-wasm-inline.mjs` | WASM 内联校验 |
| `scripts/pager-tuner.js` | 分页栏实时调参（F12 页面内粘即用） |

---

## 7. 关键不变量（破坏会直接伤用户）

1. **`file://` 双击可用** —— 这是产品核心承诺。WASM 必须内联（否则 `file://` 下 fetch WASM 被 CORS 拦），解压结果强制校验「长度 + WASM 魔数」。
2. **数据只在本地** —— 没有服务端、没有埋点、没有登录。任何改动不得引入外部数据上报。
3. **读取失败不建空库** —— 宁可报错，不可用空库覆盖用户数据。
4. **`.db` 恢复前必须留回滚快照**。
5. **导入的 `.db` 先在临时实例校验**，成功才替换，坏文件不得把当前会话打成 `database is closed`。
6. **三语 key 集合与占位符一致**（测试守着）。
7. **对比度 ≥4.5:1**（`contrast.test.js` 守着）。
8. **键盘可达 + 焦点陷阱 + Esc 关闭**（`a11y.test.js` 守着）。

---

## 8. 相关文档索引

| 文档 | 内容 |
|---|---|
| `AGENTS.md` | **仓库硬性约定**（编码/PowerShell/CSS 变量/深色模式/commit 规范） |
| `README.md` / `.en` / `.ja` | 用户视角功能与使用说明（三语） |
| `CHANGELOG.md` | 版本变更记录与「为什么改」 |
| `docs/visual-audit.md` | 最近一轮 27 项视觉问题 + 实测修复记录 |
| `docs/visual-audit.html` | 同上，可交互版本（严重度筛选 + 勾选生成回复） |
| `review/SUMMARY.md` | 历史 code review 汇总（**注意其测试计数已过期**） |
| `review/*.md` | 5 个维度的详细审计报告（数据层/逻辑/UI/缺陷复核等） |

---

## 9. 交接状态确认

| 项 | 状态 |
|---|---|
| 工作区 | **干净**（`git status` 无输出） |
| 本地 = 远端 | **是** |
| 测试 | **473 passed / 14 files** |
| 构建 | **成功**，93 modules |
| 编码体检 | **乱码 0 / BOM 0** |
| 产物 | `dist/index.html` 已构建并提交，约 1.6 MB |
| 未解决项 | V-18（用户明确排除）、V-25（1px，不可感知） |

**本文件之外没有未记录的工作。** 若发现本文档与代码不符，以代码和测试为准，并顺手更正本文档。
