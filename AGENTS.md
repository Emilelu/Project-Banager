# 本仓库约定（给 AI 与人类维护者）

## ⚠️ 编码：唯一致命坑，务必遵守

本机是 **Windows + PowerShell 5.1**，系统 ANSI 代码页 **936（GBK）**。
PowerShell 5.1 的很多文件操作走 ACP，会**把 UTF-8 源码里的中文写成 GBK/乱码**，
更糟的是乱码会吞掉引号与换行，把代码变成语法错误。

本项目已因此发生过多次事故：
- `src/db/index.js` 中文注释乱码 → 14 个测试文件全部编译失败
- `src/components/ColorPicker.vue` 注释吞掉 `const el = inputRef.value` → **取色器点击无反应**
- `src/composables/useHoverTip.js` 注释里的反引号未闭合 → 全站测试报错
- 多个 Vue 文件一度出现 `Invalid end tag` / `Missing semicolon`

### 硬性规则
1. **禁止**用 PowerShell 做任何含非 ASCII 字符的文本操作。具体包括：
   `Set-Content`、`Add-Content`、`Out-File`、`Get-Content | Set-Content`、`-replace` 写回文件、
   `[System.IO.File]::WriteAllText` 时不指定 UTF8Encoding。
2. **改文件一律用编辑工具**（编辑器 write/edit 类操作），或用 Node 脚本：
   ```bash
   node scripts/text.js replace <file> '"'"'<from>'"'"' '"'"'<to>'"'"''   # 字面量替换，全程 UTF-8
   node scripts/text.js set-line <file> <lineNo> <content>        # 按行号替换（乱码文件的最后手段）
   ```
3. 必须用脚本时，读写都强制 UTF-8 **无 BOM**：
   ```js
   fs.writeFileSync(p, content, 'utf8')                       // 正确
   [System.IO.File]::WriteAllText(p, s, New-Object System.Text.UTF8Encoding($false))  // PS 里的正确写法
   ```
4. **改完必须体检**：
   ```bash
   node scripts/text.js check        # 乱码 / BOM / CRLF 一次看清
   ```
   要求：`乱码 0`、`BOM 0`。

### 已做的防护
- `.gitattributes`：`* text=auto eol=lf`，源码统一 UTF-8 + LF；二进制文件（xlsx/db/wasm/png）声明为 binary。

---

## ⚠️ PowerShell 转义：第二个致命坑（已根治）

### 症状

`node -e "..."` 写短脚本时，只要内容含下列任一字符就会**静默被 PowerShell 改写**：

| 字符 | PowerShell 的处理 | 结果 |
|---|---|---|
| `` ` `` 反引号 | 当作转义符 | `` `hello` `` → `\hello\` |
| `$` | 当变量展开 | `${name}` → 空 |
| `"` | 当字符串边界 | 引号提前闭合 |
| `&&` `\|\|` | 当语句分隔符 | `a && b` → `a`，后面报错 |
| `<` `>` | 当重定向 | 内容被写进文件 |
| `@` `!` | 当数组/否定符 | 语法错 |

**这不是 Node 的问题**，是 PowerShell 在传给 node **之前**就解析了一遍。
无论怎么加引号转义，只要内容带元字符或非 ASCII，总有场景会挂 ——
本会话曾因此反复失败十余次（`node -e` 里写模板串、正则、`||` 表达式全部报
`Expected ',', got '<eof>'` / `Missing closing ')'`）。

### 根治方法：内容只走文件，不走命令行

新增 **`scripts/run.mjs`**：命令行只接受一个**纯 ASCII 文件路径**（不含任何元字符），
JS 代码本身从文件读取 → PowerShell 无内容可破坏。

```bash
# 推荐：用 write 工具把代码写到 tmp/x.mjs，然后
node scripts/run.mjs tmp/x.mjs              # 执行
node scripts/run.mjs --clean tmp/x.mjs      # 执行后自动删除
node scripts/run.mjs --check src/db/index.js  # 只做语法检查
node scripts/run.mjs --stdin                # 从 stdin 读代码执行
node scripts/run.mjs --safe "console.log(1)"  # 内联执行（严格校验，含元字符直接拒绝）
```

**铁律**：需要写带反引号 / 中文 / 正则 / `$` / `&&` / `||` 的脚本时，
**永远用 `write` 工具写到 `tmp/` 下的 `.mjs` 文件**，再用 `scripts/run.mjs` 执行。
不要写 `node -e "..."`，不要用 PowerShell 的 here-string。

`--safe` 模式会主动检测元字符与非法定字符并**拒绝执行**（而不是让你以为跑通了、
实际是改过的代码在跑），避免静默错误。

- `scripts/text.js`：安全文本工具 + 体检器，写回前会拒绝含 U+FFFD 的内容。
- PowerShell profile 已配置默认 UTF-8（`Read-Utf8` / `Write-Utf8` 辅助函数）。

---

## 其他关键约定（踩过的坑）

### CSS 变量
- 主题色是 **RGB 三元组**（`--c-primary: 124 58 237`），用法必须是：
  - `rgb(var(--c-primary))`
  - `rgb(var(--c-primary) / 0.2)` ← 透明度用斜杠
  - **禁止** `rgba(var(--c-primary), 0.2)`（非法语法，整条声明会被浏览器丢弃，界面会静默失效）
- 但 `background-image` 的 gradient 里**不要**用斜杠 alpha，部分浏览器支持不稳，会导致按钮背景整个消失。

### 深色模式
- 用 `body.dark` / `html.dark` + `style.css` 里成组的 `.dark .xxx` 规则，**没有配置 Tailwind `darkMode: 'class'`**。
- scoped 样式里**不要写** `:global(.dark) .foo` —— 本工程的 Vue 版本会把它编译成空选择器，规则完全不生效。
  正确写法：直接写 `.dark .foo`。
- `style.css` 的 `.dark` 区段只覆盖了 `bg-white/20`、`/30`、`/40`，用到 `/50`、`/70`、`/80` 时要自己补反转规则。

### 弹窗 / 气泡 / 菜单定位
- 祖先元素只要带 `backdrop-filter`（项目大量 `.glass` 卡片都有），就会成为 `position: fixed` 的**包含块**，
  导致 `fixed` 子元素按祖先盒子定位，实测偏移可达 200px。
- 因此所有弹窗、气泡、下拉菜单都必须 **Teleport 到 body**，再用 `fixed` + `getBoundingClientRect()` 计算坐标。

### transition-group
- `v-if` 与 `v-for` **不能写在同一个元素上**（Vue 3 中 `v-if` 优先级更高，会跳过整个循环），
  transition-group 便无法配对进出场。写法：`<template v-for><button v-if>...`。
- 离场元素必须**退出文档流**（`position: absolute`），否则它在 leave 动画期间仍占宽，
  Vue 的 FLIP 会判定位移为 0 → 完全不写 `translate`、不加 `-move` 类 → 其余元素瞬间跳位。
- `-move` 类必须显式定义 `transition: transform`，否则归位是瞬跳。

### 测试
- 基线要求：`pnpm exec vitest run` 全部通过（当前 470+ 用例 / 14 文件）。
- PowerShell 里该命令会因 stderr 语义返回 exit 1，**不代表测试失败**；判断要看 `Tests N passed`。
- 新增全局组件或指令时，**必须同时在 `src/main.js` 与 `tests/setup.js` 注册**，
  否则测试里会报 `Failed to resolve component/directive`。

### i18n
- 自建 i18n，三语 `src/locales/{zh,en,ja}.js` 的 **key 集合必须完全一致**，占位符 `{name}` 也必须一致
  （`tests/i18n.test.js` 会校验）。
- 模板里的所有用户可见文案都必须走 `tt()`，不允许硬编码中文！

---

## ⚠️ Commit 规范：必须遵守（已重写历史）

参考 <https://github.com/feflow/git-commit-style-guide>。仓库历史已在 2026-11-02
从 204 个提交压缩为 **28 个阶段性提交**，全部按此规范重写并 force push。

### 格式

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
```

### 硬性规则

1. **标题 ≤50 字符**（含 `type(scope): ` 前缀）。这是最容易违反的一条。
2. **type 只能是 9 种之一**：`feat` `fix` `docs` `style` `refactor` `perf` `test` `chore` `revert`
3. **必须有 scope**，用功能域命名：`app` `ux` `theme` `wallpaper` `appearance` `palette`
   `glass` `navigation` `i18n` `ui` `tags` `transfer` `cover` `stats` `db` `table` `tooling`
   `interaction` `menu` `time` `topbar` `watching`
4. **subject 首字母小写，不以句号结尾，不含非 ASCII 字符**
5. **必须有 body**，空行分隔。body 说明：
   - 为什么这个变更是必须的（修什么 bug / 补什么能力）
   - 怎么解决的（关键机制或决策）
   - 有无副作用或风险
6. body 每行建议 ≤72 字符。

### 反面例子（历史遗留，已修正）

```
fix(ui): 分页按钮补齐 pager-btn 类（36→40px 高）、每页触发器同步 40px，三按钮同高同圆角
```

问题：中文、超长、把多个不相关改动塞进一条。
正确写法应拆成独立提交，英文标题，细节进 body。

### 阶段划分原则

按**功能阶段**合并，不按提交日期机械切分。同一阶段的
`chore(vX.Y.Z): 版本升级` 与 `docs(memory): ...` 应并入该阶段，不要单独保留。

### 重写历史的可复现做法

用 `git commit-tree` 而非 `rebase -i`（后者依赖交互式编辑器，自动化环境不可靠）：

```bash
# 1. 备份
git branch backup-before-squash HEAD

# 2. 取每个阶段最后一个提交的 tree，串联成新链
git rev-parse <stage-end-hash>^{tree}
GIT_AUTHOR_DATE=<date> GIT_COMMITTER_DATE=<date> \
  git commit-tree <tree> -p <parent> -m "<message>"

# 3. 动 main 之前必须验证代码树未变
git rev-parse <new-head>^{tree}   # 应与 backup-before-squash^{tree} 完全相同

# 4. 更新并推送
git reset --hard <new-head>
git push --force-with-lease origin main
```

**注意**：`^{tree}` 里的 `^` 会被 PowerShell 5.1 吃掉 → 用 `execFileSync`
逐参数传给 git，不要拼字符串命令。
