# 外观引擎 / 主题设置 / 构建配置 / 安全审计

分支：`review/full-audit`　审计范围：`src/composables/useAppearance.js`、`src/composables/colorMath.js`、`src/composables/useTheme.js`、`src/components/ThemeSettings.vue`、`src/style.css`、`tailwind.config.js`、`index.html`、`vite.config.js`、`vite-plugin-wasm-inline.js`、`.workbuddy/cors-worker.js`，以及构建产物 `dist/` 与 Excel 导入依赖。

约束遵守：未修改 `src/` 下任何文件、未改 `package.json`、未执行 `pnpm install`、未启动 dev server、未 `git commit`。新增文件仅为 `tests/appearance.test.js` 与本报告。

测试：`pnpm exec vitest run tests/appearance.test.js` → **23 passed (23)**，2.32s。

缺陷统计：**P0 × 0，P1 × 2，P2 × 12，P3 × 8，合计 22 项**。

---

## P1

### [P1] 主/副色渐变按钮上的白字对比度低至 1.30:1，随机配色或部分预设下文字几乎不可读

**文件**: `src/components/ThemeSettings.vue:46,103,175`；`src/composables/useAppearance.js:263-287`；`src/style.css:178-183`

**现象/证据**:

- 全仓有 15 处 `from-primary to-primary-light`、11 处 `from-secondary to-secondary-light` 渐变按钮，绝大多数同时带 `text-white`（如 `ThemeSettings.vue:46`「🎲 随机配色」、`:103`「🔄 换一张」、`:175`「完成」）。
- `applyPalette()` 把 `--c-primary-light` 当作「深色背景上的浅色文字」来推导：目标是对 `bgY=0.12` 达到 4.5:1（`useAppearance.js:263-268`），因此它会被推到接近白色（L≈88-89）。但同一个变量又被当作按钮渐变的**浅色端点背景**，白字压上去必然失败。
- 实测 `colorMath.contrast`：
  - 默认静态值 `--c-primary-light: #A78BFA` 对白字 **2.72:1**；`--c-secondary-light: #F472B6` **2.65:1**。
  - 选择「薄荷青」预设后 `--c-primary` 对白字 **2.54:1**、`--c-primary-light` **1.36:1**；「暖橙暮」为 2.78 / 1.33。
  - 随机配色扫描 360 个色相 × 随机 S/L 区间，白字对 `--c-primary` 最低 **1.35:1**、对 `--c-primary-light` 最低 **1.30:1**（黄绿色相最差）。
- WCAG 2.1 AA 普通文本要求 4.5:1，UI 组件/大文本最低 3:1；上述数值全部不达标，且按钮文字是 12-14px。

**最小复现**:

1. 打开「主题与背景」→ 配色 → 点「薄荷青」。
2. 观察「🎲 随机配色」「🔄 换一张」「完成」等渐变按钮右半部分的白色文字。
3. 或点「随机配色」多次，直到色相落在黄/青/绿区间（约 40°-200°）。

**期望 vs 实际**:

- 期望：按钮文字与**两个渐变端点**都达到至少 4.5:1（或根据端点亮度自动切换深/浅文字）。
- 实际：浅色端点 L 被推到 88+，白字对比度 1.3-2.7:1，视觉上接近「白底白字」。

**建议修复**:

- 拆分语义 token：`--c-primary-light` 只用于「深底上的文字」；按钮背景另设 `--c-primary-soft`，其亮度上限由「白字对比度 ≥ 4.5」反推（或按端点亮度计算 `--c-on-primary` 并切换 `text-white` / `text-gray-900`）。
- 更稳妥：用 `colorMath` 对渐变两端分别计算与候选文字色的对比度，选择达标的一侧；随机配色时把「白字可读」作为硬约束过滤色相/亮度，而不是只钳制 HSL 的 L。

---

### [P1] xlsx 0.18.5 受 CVE-2023-30533（原型污染）与 CVE-2024-22363（ReDoS）影响，且直接解析用户导入的文件

**文件**: `package.json:18`；`pnpm-lock.yaml:1280`；`src/db/excelImporter.js:370`；`src/views/ImportView.vue:122`

**现象/证据**:

- `package.json` 声明 `"xlsx": "^0.18.5"`，锁文件解析为 `xlsx@0.18.5`（`node_modules/xlsx/package.json` 亦为 0.18.5）。
- SheetJS CE 0.18.5 低于两个已知漏洞的修复版本：
  - **CVE-2023-30533**：原型污染，0.19.3 修复；
  - **CVE-2024-22363**：ReDoS，0.20.2 修复。
- 攻击面是真实的：`ImportView.vue:122` 把用户选择的 `.xlsx/.xls` 交给 `importApi.upload`，`api.js:189-192` 再调用 `importExcel(file)`，最终在 `excelImporter.js:370` 执行 `XLSX.read(arrayBuffer, { type: 'array' })`。文件内容完全由用户/第三方模板控制，且没有大小上限。
- 原型污染可污染页面内对象/组件状态，ReDoS 可让标签页长时间无响应；对一个「导入网上下载的追番表格」为核心用法的本地应用，属于现实攻击面。

**最小复现**:

1. 用公开的 SheetJS 0.18.5 PoC 工作簿（或构造带 `__proto__` 表头/超长匹配串的 xlsx）。
2. 「导入Excel」选择该文件 → 观察页面卡死或 `Object.prototype` 被写入属性。

**期望 vs 实际**:

- 期望：使用已修复版本（SheetJS ≥ 0.20.3，或改用 `exceljs`），并对导入文件做大小/类型/超时限制。
- 实际：0.18.5 直接解析不可信文件，两个 CVE 均未修复。

**建议修复**:

- npm 上的 `xlsx` 最新即 0.18.5，需从 SheetJS 官方 CDN 安装 ≥0.20.3 的 tarball，或替换为维护中的解析库；升级前在 `ImportView` 增加文件大小上限（如 10MB）与解析超时/Worker 隔离。
- 本次受约束未改依赖；此项需在依赖升级任务中处理。

---

## P2

### [P2] 「恢复默认」只切换模式，不恢复默认配色；取色失败时旧自定义色永久保留

**文件**: `src/components/ThemeSettings.vue:385-389`；`src/composables/useAppearance.js:829-838`

**现象/证据**: `onReset()` 只调用 `setPaletteMode('auto')`，没有 `setPalette(null)`。`state.palette` 仍是上一次随机/预设/自定义的色板。`setPaletteMode('auto')` 只有在 `state.bgUrl` 存在时才触发 `analyzeWallpaper()`；若当前图源是 alcy/dmoe 且代理不可用，取色静默失败，`state.palette` 永远不变。

**最小复现**: 选「暖橙暮」→ 点「↺ 恢复默认」→ 按钮高亮变为「跟随壁纸取色」，但页面仍是橙色；断网后刷新依旧橙色。

**期望 vs 实际**: 期望回到默认樱紫（`palette=null`，由 `:root` 默认值接管），并重新尝试取色；实际只改了模式，颜色不变。

**建议修复**: `onReset()` 中先 `setPalette(null)` 再 `setPaletteMode('auto')`；同时清理 `applyPalette._lastKey`（见 P3 缓存项）。

---

### [P2] 自定义取色被静默钳制成完全不同的颜色（选纯黑得到棕红）

**文件**: `src/components/ThemeSettings.vue:58-63,367-369`；`src/composables/useAppearance.js:219,239-240`

**现象/证据**: `applyCustom()` 把 `input[type=color]` 的十六进制值经 `hexToHsl` 后传给 `setPalette`；`applyPalette()` 无条件执行 `clamp(ps,45,85)` 与 `safeL(pl)=clamp(l,40,58)`，且不提示用户。实测 `setPalette({p:[0,0,0]})` 后 `--c-primary` 为 `148 56 56`（`hsl(0 45% 40%)` 的棕红），而不是 `#000000`；纯白同样被改成 `hsl(0 45% 58%)`。测试 `tests/appearance.test.js` 的「自定义纯黑会被静默改成中棕红」记录了这一行为。

**最小复现**: 主题设置 → 主色选 `#000000` → 点「应用自定义」→ 按钮/边框变成棕红，取色器仍显示黑色。

**期望 vs 实际**: 期望自定义颜色按用户选择生效（最多提示「为可读性已调整」）；实际静默替换为另一种颜色，用户无法得到黑色/白色/低饱和配色。

**建议修复**: 自定义路径与自动取色路径分离：自定义色只做合法性校验，保留原色；若担心白字可读性，单独计算 `--c-on-primary` 并在 UI 上提示调整原因。

---

### [P2] localStorage 配置没有 schema 校验：合法 JSON 的错误结构会让外观引擎整体中断，`bgDeferred` 卡死

**文件**: `src/composables/useAppearance.js:1194-1208`（`Object.assign(state, saved)`）、`:237-240`、`:269-287`；`src/components/ThemeSettings.vue:361-362`；`src/main.js:47-52`

**现象/证据**:

- `JSON.parse` 外有 try/catch，损坏 JSON 会走默认值（测试已覆盖）；但 `Object.assign(state, saved)` 对字段类型完全不校验。
- 若 `saved.palette` 是字符串：`applyPalette()` 的 `const [ph,ps,pl] = state.palette.p` 对 `undefined` 解构，抛 `TypeError`；`main.js` 只把 `initAppearance()` 包在 try/catch 里并打印「外观初始化失败」，`applyAll()` 在 `applyPalette` 处中断（`applyBackground` 未执行），`bgDeferred` 保持 `true`（`initAppearance` 在 `:1231` 设置后异常退出），之后 `applyBackground()` 永远判定 `active=false`，壁纸无法再显示。
- 打开设置面板时 `isActivePreset()` 访问 `state.palette.p[0]` / `state.palette.s[0]`，同样会抛错，弹窗渲染失败。
- 若 `palette` 是 `[1,2]` 这类短数组，则产生 `NaN` 并写入 `--c-primary: NaN NaN NaN`，CSS 变量失效但不报错。

**最小复现**: DevTools 执行 `localStorage.setItem('banager_appearance', '{"palette":"x"}')` 后刷新；Console 出现 `[boot] 外观初始化失败`，页面无玻璃/配色，打开主题设置报渲染错误。

**期望 vs 实际**: 期望按字段白名单合并、类型/范围校验，非法字段丢弃并回退默认；实际整段初始化中断，且模块级 `bgDeferred` 被永久留在 `true`。

**建议修复**: 用显式的 `normalizeAppearance(raw)` 逐字段校验（对象/数组/数值范围/枚举），只接受已知 key；异常时 `localStorage.removeItem(STORAGE_KEY)` 并写回默认配置；`initAppearance` 内部用 try/finally 保证 `bgDeferred=false`。

---

### [P2] 壁纸探测没有超时：请求悬挂时永远不触发失败回退

**文件**: `src/composables/useAppearance.js:537-583`（`probeBackground` 无 timer）、`:1265-1275`（固定壁纸启动路径直接调用）

**现象/证据**: `probeUrl()`（`:586-609`）有 8s 超时，但 `probeBackground()` 只设置 `onload/onerror`，没有 `setTimeout`，也没有 `AbortController`。对于「TCP 已连接但永不响应」的图源（或被中间设备黑洞的连接），`onerror` 永远不会触发，`bgFailed` 保持 `false`、不弹 toast、不换图。

**最小复现**: 把自定义壁纸设为一个接受连接但不返回内容的地址（如本地 `nc -l` 或慢速代理），刷新后进入「固定当前壁纸」模式；背景区域一直空白/只有渐变，控制台只有 `probe start` 没有 `probe ok/error`。

**期望 vs 实际**: 期望超过 N 秒（与 `probeUrl` 一致的 8s）判定失败并走「关闭背景/自愈换图」；实际无限等待。

**建议修复**: 给 `probeBackground` 加与 `probeUrl` 相同的 8s 定时器和 `img.onload=img.onerror=null` 清理；启动路径统一走 `probeUrl()` 后再决定是否显示。

---

### [P2] 壁纸预览存在代际竞态：切到跨域图源时旧预览任务仍可落地，显示上一张图

**文件**: `src/components/ThemeSettings.vue:214-246,267-270,330-342`

**现象/证据**: `buildPreview()` 只在「有 blob 缓存」和「真正开始异步抓取」两个分支执行 `previewGen++`（`:224`、`:246`）；跨域无缓存分支（`:236-239`）和 `createImageBitmap` 不可用分支（`:242-245`）直接 `return`，**没有递增代际**。若上一张同源大图的 `fetch/createImageBitmap` 仍在途，它的 `gen` 仍等于当前 `previewGen`，会在 `:310-317` 把旧图写入 `previewSrc`，覆盖 `previewFailed=true` 的正确状态。

**最小复现**:

1. 自定义同源大图（如 `/slow.jpg`，DevTools 限速到 30s）作为壁纸，打开主题设置让预览开始生成。
2. 在生成完成前把图源切到 alcy（无缓存、跨域）并点「完成」。
3. 旧任务完成后，预览缩略图显示的是上一张 `/slow.jpg`，而当前背景已经是 alcy 的另一张图。

**期望 vs 实际**: 期望任何新 `buildPreview` 调用都作废所有在途任务；实际跨域分支不作废，旧结果覆盖新状态。

**建议修复**: 在 `buildPreview()` 函数入口统一 `const gen = ++previewGen`（所有 return 分支共享），或在每次 `url` 变化时先 `previewGen++` 再分派。

---

### [P2] 取色代理链最多串行 7 个请求，无超时/取消；换图后旧请求继续跑

**文件**: `src/composables/useAppearance.js:971-986`（7 个代理）、`:1029-1043`（串行 for 循环）、`:451-470`（缓存抓取）

**现象/证据**: `CORS_PROXIES` 包含自建 Worker + cors.lol + cors.eu.org + test.cors.workers.dev + cors.sh + allorigins + weserv；`analyzeWallpaper` 对每个代理 `await fetch(make(url))`，没有 `AbortController`/timeout。`gen` 只在整轮循环结束后检查（`:1046`），因此换图后旧请求不会被取消。默认图源 alcy 无 CORS，每次换图都会触发整条链；allorigins 等已知长期超时。网络差时用户会看到持续数分钟的请求与 CPU 占用，主题色不更新。

**最小复现**: DevTools Network 设为 Offline 或对 `api.allorigins.win` 限速；切换壁纸；Network 面板可见多个 pending 请求，切换后仍不取消；`[appearance] wallpaper palette proxy failed` 持续输出。

**期望 vs 实际**: 期望每个代理 3-5s 超时、换图立即 abort 旧代际、并发探测或快速短路；实际串行无超时，最坏等待时间叠加。

**建议修复**: 每次 `analyzeWallpaper` 创建 `AbortController`，`bgGen` 变化时 abort；`fetch` 增加 `AbortSignal.timeout(4000)`；代理列表按可用性动态降级，全部失败后缓存负结果一段时间。

---

### [P2] 硬编码第三方 CORS Worker，用户自定义图片 URL（可能含 token）会被发送到作者服务器与多个公共代理

**文件**: `src/composables/useAppearance.js:969`（`CUSTOM_PROXY` 硬编码）、`:447-450`、`:1030-1039`；`src/components/ThemeSettings.vue:207-211`

**现象/证据**: `CUSTOM_PROXY = "https://pbm-proxy.realemilelu.workers.dev/?url="` 是写死的个人 Worker。`cacheWallpaperBlob()` 对任意跨域 URL 都先请求 `CUSTOM_PROXY + encodeURIComponent(url)`（`:447-450`），`analyzeWallpaper()` 还会依次把 URL 发给 cors.lol/allorigins/cors.sh/weserv 等公共代理。`cors-worker.js:50-52` 的域名白名单只能阻止 Worker **回源**，不能阻止前端把带查询参数/token 的完整 URL 发到 `workers.dev` 日志与这些第三方。

**最小复现**: 自定义壁纸填 `https://internal.example/secret.jpg?token=abc`；打开 DevTools Network，先出现的请求是 `https://pbm-proxy.realemilelu.workers.dev/?url=https%3A%2F%2Finternal.example%2Fsecret.jpg%3Ftoken%3Dabc`（即使随后返回 403），token 已离开本机。

**期望 vs 实际**: 期望只对已知图源使用内置代理；自定义 URL 默认直连，用户显式开启代理后才外发，并在 UI 说明。实际所有跨域自定义 URL 默认先经过作者 Worker 和公共代理。

**建议修复**: `cacheWallpaperBlob`/`analyzeWallpaper` 对 `provider === 'custom'` 只直连；代理地址改为用户可配置（默认空），`CUSTOM_PROXY` 不写死个人域名；对 URL 中的 query 做脱敏日志。

---

### [P2] `providerBlocksPalette()` 因硬编码代理恒为 `false`，「未配置代理」提示与自动降级永远不会出现

**文件**: `src/composables/useAppearance.js:408-414`；`src/components/ThemeSettings.vue:200,67-72,80,147`

**现象/证据**: `providerBlocksPalette()` 第一行就是 `if (CUSTOM_PROXY) return false`；而 `CUSTOM_PROXY` 是非空常量，所以对 alcy/dmoe 永远返回 `false`。`ThemeSettings.vue` 的 `noCorsSource` 因此恒为 `false`：`:80`、`:147` 的「未配置跨域代理…」警告永不显示，「跟随壁纸取色」按钮永不禁用；`useAppearance.js:1161-1171` 的 `watch(bgProvider)` 也永远不会把 auto 降级为 manual。

**最小复现**: 在 hosts/DevTools 中阻断 `pbm-proxy.realemilelu.workers.dev`，刷新后切到 alcy；设置面板仍显示「跟随壁纸取色」可用，没有任何警告，取色静默失败。

**期望 vs 实际**: 期望按代理**运行时可用性**判断（或至少把「配置了地址」与「代理可达」分开），失败时提示并降级；实际只检查常量字符串是否为空，UI 与真实能力脱节。

**建议修复**: 增加 `proxyHealthy` 运行时状态（最近一次请求成功/失败 + 时间），`providerBlocksPalette` 结合它判断；失败时显示可操作的诊断信息（Worker 地址、HTTP 状态、重试按钮）。

---

### [P2] 构建产物不是真正的单文件：`logo.png`（2.4MB）与 `favicon.png` 仍在 HTML 外部

**文件**: `src/App.vue:15`；`index.html:5`；`vite.config.js:7`；`README.md:11,114,119`

**现象/证据**:

- `App.vue:15` 使用 `<img src="/logo.png">`，Vite 构建后变成 `new URL("logo.png", import.meta.url).href`（在 `dist/index.html` 的内联脚本中可见），运行时要求同目录存在 `logo.png`。
- `index.html:5` 的 `<link rel="icon" href="./favicon.png">` 同样要求同目录 `favicon.png`。
- `dist/` 实际为：`index.html` 1,599,373 B + `logo.png` 2,490,795 B + `favicon.png` 2,926 B。README 第 11 行称「构建产物是一个 HTML 文件」、第 114 行称「单文件，约 1.5 MB，含内联的 WASM 与全部资源」。

**最小复现**: `pnpm build` 后只把 `dist/index.html` 复制到空目录，双击打开（`file://`）：页面主体可用，但左上角 Logo 显示破图（alt），favicon 404。若连 `logo.png` 一起复制则正常。

**期望 vs 实际**: 期望 README 承诺的单文件自包含；实际是 3 个文件，且最大的 logo 比 HTML 本身还大。

**建议修复**: 把 logo 移入 `src/assets` 并通过 `import` 引用（`assetsInlineLimit` 会内联），但先把 2.4MB 压缩为 <100KB 的 WebP/SVG；favicon 改为 data URI 或同样内联。若不想增大 HTML，则应修正 README 明确「HTML + 两个资源文件」。

---

### [P2] WASM 内联插件在 dev/build 两态都会联网下载未固定版本的 WASM、改写受版本控制的 `src/db/wasmInline.js`，且缓存永不失效

**文件**: `vite-plugin-wasm-inline.js:9,17-45`；`vite.config.js:7`；`src/db/index.js:22`

**现象/证据**:

- 插件 `buildStart()` 无条件执行：`existsSync(CACHE_FILE)` 不存在时 `fetch('https://sql.js.org/dist/sql-wasm.wasm')`，然后把 base64 写入 `src/db/wasmInline.js`（该文件已被 git 跟踪）。Vite 的 dev server 初始化同样会调用 `pluginContainer.buildStart()`（`node_modules/vite/dist/node/chunks/dep-Dq2t6Dq0.js:38762`），所以 `pnpm dev` 也会触发下载/写源文件。
- 缓存路径 `node_modules/.wasm-cache/sql-wasm.wasm` 只按「文件是否存在」判断，不校验 sql.js 版本/哈希。本次实测缓存 SHA-256 为 `38C14F6E…`、大小 658,410 B，而安装的 `sql.js@1.14.1` 自带 `node_modules/sql.js/dist/sql-wasm.wasm` 为 `438C88F6…`、659,730 B —— **两者不是同一个二进制**。本次用 1.14.1 的 JS glue 加载缓存 WASM 仍能执行简单 SQL（ABI 暂时兼容），但升级 sql.js 后缓存不会重建，存在静默 ABI 不匹配风险。
- 离线/新克隆且无缓存时，`fetch` 失败会让 `buildStart` reject，dev server 直接起不来；构建也无法在无网环境复现。

**最小复现**:

1. 删除 `node_modules/.wasm-cache/`，断网执行 `pnpm dev` → 启动阶段报「下载 WASM 失败」。
2. 或升级 `sql.js` 后不删缓存直接构建 → 嵌入的仍是旧 WASM。

**期望 vs 实际**: 期望从 `node_modules/sql.js/dist/sql-wasm.wasm` 读取与依赖同版本的二进制、只在 build 阶段生成、缓存按版本/哈希命名；实际从公网取「最新」WASM、dev 也执行、缓存永久有效。

**建议修复**: 插件改为 `apply: 'build'`，用 `createRequire` 定位 `sql.js/dist/sql-wasm.wasm`；缓存 key 加入 `sql.js` 版本与文件哈希；生成文件放到 `node_modules/.cache` 或 `.gitignore` 的构建目录，不写 `src/`。

---

### [P2] `--c-primary-light` 在深色玻璃上最低只有 3.94:1，与注释宣称的 4.5:1 不符

**文件**: `src/composables/useAppearance.js:185-192,263-268`；`src/style.css:175-183`

**现象/证据**: `lightenToContrast()` 的 `maxL=88`，且循环在 `out[2] < maxL` 时先判断再 `+2`，可能返回 89/90（越界一步）。对高饱和蓝色（如 `h=240,s=77,l=46`）推导出的 `--c-primary-light` 为 `rgb(240 69 88)`（L=88），对建模背景 `bgY=0.12` 的对比度实测 **3.94:1**，低于函数默认 target 4.5。`style.css:177` 注释写「JS 侧已保证 light 变体在深底上达到 4.5:1」，与实测不符；暗色模式 `.dark .text-primary-dark` 正是用这个变量做文字色。

**最小复现**: 主题设置 → 随机配色直到出现蓝色系（或直接 `setPalette({p:[240,77,46],s:[300,60,50]})`）→ 切暗色 → 观察 `text-primary-dark` 的选中态/表头文字。

**期望 vs 实际**: 期望所有派生 light 变体在 0.12 背景上 ≥4.5:1；实际最低 3.94:1（且 `maxL` 可能被越过）。

**建议修复**: 去掉固定 `maxL=88` 上限，改为「在 sRGB 可达范围内二分找满足对比度的最大 L」；若物理上达不到（如极高饱和蓝），降低饱和度或改用 `deriveTextScale` 的选向逻辑；修正循环边界，避免超过 `maxL`。

---

### [P2] 用户可控壁纸 URL 未做协议校验，`window.open` 可打开 `javascript:`/`data:` 等危险 scheme，且直接拼进 CSS `url()`

**文件**: `src/components/ThemeSettings.vue:446-450,487-490`；`src/composables/useAppearance.js:841-846,493`

**现象/证据**:

- `state.bgCustomUrl` 来自普通文本输入（`:107`），`applyCustomBackground()` 只 `trim()` 后交给 `_applyNewBg()`，`resolveStableUrl('custom')` 原样返回（`useAppearance.js:65`），最终写入 `state.bgUrl`。
- `openOriginal()` 直接 `window.open(url, '_blank', 'noopener')`；`downloadOriginal()` 取不到字节时也 `window.open(fallback, ...)`。没有 `http/https/blob` 白名单。`javascript:` 在部分浏览器/打开方式下会在新窗口执行脚本（`noopener` 下影响有限，但仍应阻断）；`data:text/html,...` 同样可被顶层打开。（`javascript:` 能否实际执行取决于浏览器对 `window.open` 的策略，标 **(待证实)**；「未做协议白名单」本身已由代码确认。）
- `applyBackground()` 用 ``root.setProperty("--bg-image", `url("${src}")`)`` 直接拼接，URL 内含 `"`/`)` 时可破坏 `url()` 值（CSS 注入/背景静默失效）。

**最小复现**: 自定义图片地址填 `javascript:document.title='pwned'` → 点「完成」→ 点「🔗 原链接预览」；或填 `https://x/a".jpg`，背景不显示而预览探测可能正常。

**期望 vs 实际**: 期望只接受 `http:`/`https:`/同源相对路径（预览额外允许 `blob:`），非法协议立即 toast 拒绝；实际任意 scheme 进入 `bgUrl` 并被 `window.open`/CSS 使用。

**建议修复**: 增加 `sanitizeImageUrl()`：`new URL(url, location.href)` + protocol 白名单 + 禁止 `username/password`；对 CSS 使用 `CSS.escape` 或 `URL` 规范化后再拼接；`window.open` 前再次校验并加 `noreferrer`。

---

## P3

### [P3] `text-accent-dark` 在 Tailwind 配置中不存在，选中「跟随壁纸取色」时文字颜色丢失

**文件**: `tailwind.config.js:23-24`；`src/components/ThemeSettings.vue:70`

**现象/证据**: 配置只定义了 `accent` 与 `accent-light`，没有 `accent-dark`。用 Tailwind CLI 对当前配置编译（输出到临时目录）后，`.text-accent-dark` 出现次数为 **0**；`bg-accent/10`、`border-accent/50` 均正常生成。因此 `:class` 分支里的 `text-accent-dark` 被浏览器忽略，选中态按钮文字退回继承色。

**最小复现**: 打开主题设置 → 点「🎨 跟随壁纸取色」→ 按钮边框/背景变成青色系，但文字不是预期的深青色。

**期望 vs 实际**: 期望选中态文字使用 accent 深色；实际类名不存在，无样式。

**建议修复**: 在 `tailwind.config.js` 增加 `'accent-dark': 'rgb(var(--c-accent-dark) / <alpha-value>)'` 并在 `:root` 定义变量，或直接改用已存在的 `text-accent`。

---

### [P3] 暗色灰阶反相、浅色玻璃上的 gray-400 对比度不足

**文件**: `src/style.css:228-230`；`src/components/ThemeSettings.vue:30,37,79,109,167,170`

**现象/证据**:

- `.dark .text-gray-300 { color: #64748b }`（`:228-230`）比 `.dark .text-gray-400 { #7c8ba5 }` 更暗：在 `#140f28` 暗色玻璃上实测 **3.91:1**，而 gray-400 是 **5.40:1**，灰阶顺序被写反。`text-gray-300` 用于空列表提示（`WatchingView.vue:77`）和禁用分页，空状态文字不满足 4.5:1。
- 浅色模式下 `ThemeSettings.vue` 多处 `text-xs text-gray-400`（`:30,37,79,109,167,170`）是 `#9ca3af`，压在 70% 白玻璃/浅色渐变上约 **2.54:1**，12px 辅助说明难以阅读。

**最小复现**: 切暗色模式查看空列表提示；浅色模式查看主题设置中各段说明文字。

**期望 vs 实际**: 期望普通文本 ≥4.5:1 且灰阶 300 应比 400 更亮；实际 300 比 400 暗且仅 3.91:1，gray-400 说明文字 2.54:1。

**建议修复**: 把 `.dark .text-gray-300` 改为 `#94a3b8` 或更高；浅色辅助文字统一用 `text-gray-500/600` 或 `--txt-card-500`，避免 gray-400 直接压在浅玻璃上。

---

### [P3] `applyPalette` 结果缓存不清空：`palette=null` 后再设同一色板不会重新写入变量（待证实）

**文件**: `src/composables/useAppearance.js:226-245`

**现象/证据**: `palette=null` 分支移除 6 个 CSS 变量后直接 `return`，没有重置 `applyPalette._lastKey`。之后 `setPalette()` 传入与上次相同的色板时，`key === applyPalette._lastKey` 命中缓存直接返回，变量保持被删除状态。

**最小复现**: 在控制台/测试中依次调用 `setPalette(A)` → `setPalette(null)` → `setPalette(A)`，第三次调用后 `--c-primary` 仍为空。当前 UI 没有直接传 `null` 的入口（「恢复默认」也未调用），故标 `(待证实)`；一旦按 P2 修复 `onReset` 就会触发。

**期望 vs 实际**: 期望清空后重新应用同一色板能恢复变量；实际缓存命中，样式丢失。

**建议修复**: `palette=null` 分支执行 `applyPalette._lastKey = null`；或把 key 计算放到 null 判断之前并纳入 `null` 状态。

---

### [P3] `clearWallpaperBlob` 固定 3s 后 revoke 旧 blob，慢网换图时背景会先消失

**文件**: `src/composables/useAppearance.js:423-437,1103-1132,492`

**现象/证据**: `_applyNewBg()` 一开始就 `clearWallpaperBlob()`（`:1107`），把 `bgBlobUrl` 置空并安排 3s 后 `URL.revokeObjectURL(prev)`；但此时 `state.bgUrl` 仍是旧值，CSS `--bg-image` 仍引用旧 blob，且 `clearWallpaperBlob` 没有调用 `applyBackground()`。如果解析稳定地址 + 抓取新 blob 超过 3s（代理慢、图大），旧 blob 被 revoke，背景立即变空，直到新图写入才恢复。

**最小复现**: 已有带 CORS 的壁纸 → DevTools 限速 1Mbps/高延迟 → 点「换一张」→ 3 秒后背景闪空/只剩渐变，数秒后才出现新图。

**期望 vs 实际**: 期望旧图保持到新图就绪后再替换；实际固定 3s 回收，慢网下出现空窗。

**建议修复**: revoke 时机改为「新 blob 已赋值且 `applyBackground()` 完成后」（在 `_applyNewBg` 成功分支里回收 prev），或至少把 `clearWallpaperBlob` 的延迟与 `state.bgUrl` 更新绑定，不要用固定 3s。

---

### [P3] `toggleBackground` 未 await `shuffleBackground`，成功提示早于实际结果且可能产生 unhandled rejection

**文件**: `src/composables/useAppearance.js:1135-1155`

**现象/证据**: `:1142` 在 try 块里调用 `shuffleBackground()` 但没有 `await`，同步异常/异步 rejection 都不会被 catch；`:1143` 立即 `showToast('壁纸背景已开启 🖼️')`。`:1148-1149` 在 `probeBackground()` 刚发起（异步）时读取 `state.bgFailed`，必然还是 `false`，所以「已开启」总是先弹出，失败 toast 随后才来。自定义图源地址为空时 `shuffleBackground` 抛 `请先填写图片地址`，这里会变成 unhandled rejection。

**最小复现**: 关闭壁纸 → 断网 → 点顶部 🖼️ 开启；先看到「已开启」，随后「背景图加载失败」；Console 可能出现 unhandledrejection。

**期望 vs 实际**: 期望等待取图/探测结果后只提示一次准确状态；实际提示时序错误、异常未捕获。

**建议修复**: `await shuffleBackground()` 并 `try/catch`；`probeBackground` 改为返回 Promise，或把 toast 放到 `probeBackground` 的 `onload/onerror` 回调里统一处理。

---

### [P3] `?nobg` 逃生开关会把 `bgEnabled=false` 持久化，之后正常打开也永久关闭壁纸

**文件**: `src/composables/useAppearance.js:1173-1183,1217-1224`

**现象/证据**: `initAppearance()` 在 `nobg` 分支执行 `state.bgEnabled = false`（`:1219`）；模块级 `watch(state, ..., { deep: true })` 会把这次变更写入 localStorage。下次不带 `?nobg` 打开时读到 `bgEnabled=false`，壁纸仍关闭。逃生通道本应是「本次会话跳过背景系统」。

**最小复现**: 打开 `index.html?nobg` → 关闭页面 → 正常打开 `index.html`（无参数）→ 壁纸仍关闭，顶部按钮为关闭态。

**期望 vs 实际**: 期望 `?nobg` 只影响当前加载；实际永久改写用户配置。

**建议修复**: 在 `nobg` 分支设置一个 `suppressPersist` 标志（watch 内跳过写入），或保存原值并在退出时恢复；更简单：不要修改 `state.bgEnabled`，只在 `applyBackground` 的 `active` 判断中加 `!nobg`。

---

### [P3] localStorage 配额/写入失败被完全吞掉，用户主题设置静默丢失

**文件**: `src/composables/useAppearance.js:1173-1183`；`src/composables/useTheme.js:47-51`

**现象/证据**: 两处 `localStorage.setItem` 都在空 `catch {}` 中；配额满、隐私模式、存储被禁用时没有任何提示。外观的 deep watch 每次状态变化都写一次，配额失败后用户继续调遮罩/模糊/配色，刷新全部回退，且无从得知。

**最小复现**: DevTools 执行 `Storage.prototype.setItem = () => { throw new DOMException('quota','QuotaExceededError') }` → 修改主题 → 刷新（或观察无任何提示）。

**期望 vs 实际**: 期望捕获后 toast「设置未能保存（存储空间不足）」并降级为内存态；实际静默丢弃。

**建议修复**: 写入失败时 `showToast` 一次（去重/节流），并提供「导出外观配置」或清理入口；`useTheme` 同样处理。

---

### [P3] 无 CSP；单文件产物依赖内联 1.6MB 脚本与内联样式，任何常规 CSP 都会直接打断启动

**文件**: `index.html:1-16`；`dist/index.html`（内联 `<script type="module" crossorigin>`）

**现象/证据**: `index.html` 没有 `<meta http-equiv="Content-Security-Policy">`；`vite-plugin-singlefile` 把全部 JS 内联为一个 `<script type="module">`，Vue 的 `:style` 绑定又需要 `style-src 'unsafe-inline'`。若部署方加 `script-src 'self'`，页面白屏；若加 `connect-src` 白名单，壁纸代理全部失败。代码中没有 `v-html`/`innerHTML`/`document.write`，XSS 注入面本身很小。

**最小复现**: 在 `index.html` 临时加入 `<meta http-equiv="Content-Security-Policy" content="default-src 'self'">` → 打开页面 → 控制台报 inline script 被拒，`#app` 为空。

**期望 vs 实际**: 期望有与单文件架构匹配的 CSP（至少 `script-src 'unsafe-inline'`/hash、`img-src https: data: blob:`、`connect-src` 代理白名单），或说明离线文件不设 CSP 的风险；实际完全无策略。

**建议修复**: 在 `index.html` 加 meta CSP，明确列出壁纸/代理所需的 `img-src` 与 `connect-src`；若担心 `unsafe-inline`，改为外置 JS 构建（放弃单文件）或构建时注入脚本 hash。

---

## 已核查、未发现问题的项

- **XSS sink**：全仓未发现 `v-html`、`innerHTML`、`outerHTML`、`insertAdjacentHTML`、`document.write`；用户文本均走 Vue 插值。唯一用户 URL 直接打开的风险见 P2「URL 协议校验」。
- **Tailwind 动态类名**：未发现 `bg-${...}`/`text-${...}` 这类运行时拼接；`left-[1.375rem]`、`bg-danger/15` 等均能被 Tailwind CLI 正确生成。唯一缺失 token 是 `text-accent-dark`（P3）。
- **CSS 变量未定义**：对 `useAppearance.js`、`ThemeSettings.vue`、`style.css` 做 `var(--*)` 与定义交叉检查，未发现未定义变量；`:root` 中 6 个主题色、`--txt-*`、`--bg-*` 均存在。
- **`file://` 下的 WASM**：`src/db/index.js` 动态导入内联 base64，构建产物中没有 `import(`、`new Worker`，WASM 不依赖网络；单文件的外部资源问题见 P2。
- **localStorage JSON 解析崩溃**：非法 JSON 已被 try/catch 兜住（测试覆盖）；问题在于「合法 JSON、错误结构」未校验（P2）。
- **配色钳制基本功能**：`setPalette` 对 S/L 的钳制、`palette=null` 的变量清理、随机配色的色相距离/范围均有测试覆盖并通过。

---

## 测试文件说明

`tests/appearance.test.js`（23 个用例，全部通过）：

- `colorMath`：WCAG 黑白 21:1、HSL↔RGB 往返、clamp、6 档背景亮度下自适应文字 ≥4.5:1、色阶三元组合法性。
- `useAppearance` 配色：S/L 越界钳制、纯黑/纯白自定义被钳制（记录当前行为）、`palette=null` 清理变量、随机配色范围与色相距离、120 组随机配色的 `--c-primary-dark` 对浅色卡片 ≥4.5:1。
- 状态机：`setPaletteMode('manual'/'random'/'auto')`、`setGlass` DOM 状态。
- 壁纸：`bgFailed` 时回退渐变、恢复后重建 `with-bg`、`Image` 加载失败时 `bgFailed` 置位并摘层、`isCrossOrigin` 判定。
- 持久化：损坏 JSON 恢复默认、合法配置恢复且 `bgBlobUrl/bgFailed/bgLoading` 不落盘、`setItem` 抛配额异常不影响内存状态。
