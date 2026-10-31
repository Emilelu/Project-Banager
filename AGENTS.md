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
