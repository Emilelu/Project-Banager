# 📺 PBM - Project Bangumi Manager (Standalone)

> 「PBM, started from 2020.2.」

---

## 📖 项目简介

**PBM（Project Bangumi Manager）** 是一款个人追番管理工具，帮助动漫爱好者高效管理自己的追番、等番和已看历史。项目起源于 2020 年 2 月，最初以 Excel 表格的形式存在，经过多年实际使用中的不断打磨与功能迭代，现已成为**纯浏览器端单文件应用**。

> 🗒️ 早期的 client/server 分离架构已废除：对这种规模的工具来说没有必要。现在整个项目就是一个 Vue 3 单页应用，数据库运行在浏览器里（sql.js WASM + IndexedDB），构建产物是**一个 HTML 文件**，双击即可使用。

### ✨ 设计理念

- **周历视图**：追番以周为单位排列，一目了然今天该追什么
- **状态流转**：等番 → 追番 → 已看，番剧生命周期全覆盖
- **Excel 兼容**：支持从历史 Excel 数据一键导入，无缝迁移
- **零部署**：数据 100% 本地存储，无服务端、无网络依赖（WASM 已内联，支持 `file://` 直接打开）

### 🛠 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端框架** | Vue 3 | Composition API + Vue Router 4 |
| **样式** | TailwindCSS 3 | 实用优先的 CSS 框架，自定义主题色 |
| **构建** | Vite 6 | vite-plugin-singlefile 打包为单个 HTML |
| **数据库** | SQLite (sql.js) | 纯 WASM 实现，浏览器内运行，IndexedDB 持久化 |
| **Excel 解析** | xlsx (SheetJS) | 支持 .xlsx / .xls 文件解析与导入 |

---

## 🎯 功能简介

### 📺 正在追番

- **周历视图**：7 列布局，按周一至周日排列，自动撑满页面高度
- **时间排序**：每日列内按更新时间自动排序，默认**从早到晚**，一键切换为晚→早（偏好记忆）
- **本月等番提醒**：自动检测等番中本月即将更新的番剧，顶部横幅提醒
- **集数管理**：一键 +1 / -1 集，双击直接编辑；支持 `01`、`02` 补零格式（增减自动保持位数：`09→10`、`01→00`），小数集数（`26.19`）依旧不进位
- **链接快速填充**：编辑弹窗内置 B 站模板——
  - **▶ B站视频**：填入 BV 号（或直接粘贴视频链接），自动生成 `p={集数}` 分P直达链接
  - **🏠 空间搜索**：填入 UP 主 UID（自动记忆）、番剧名、季数，生成 `keyword=名称 | N季 | 第{集数}集` 的空间内搜索链接
  - **🔍 全站搜索**：填入关键词模板（可含 `{集数}`），生成全站搜索链接
  - 自定义方式始终保留；粘贴含 `?` 的完整链接时，查询参数会**自动分离**到「URL 动态参数」
- **`{集数}` 插入按钮**：动态参数框一键插入占位符，无需复制粘贴
- **选中状态持久化**：当前选中的番剧在页面重开后依然保留
- **快速链接**：鼠标中键点击卡片，新标签页打开番剧链接；无链接时自动搜索 bgm.tv
- **右键菜单 / 批量操作 / 行内编辑 / 状态迁移 / 清空列表**

### ⏳ 等待更新

- **列表视图**：表格展示所有等番，支持分页与自定义每页条数
- **查看新番**：数据源迁移至 [yuc.wiki（長門番堂）](https://yuc.wiki/)——
  - 顶部常驻「📺 本季新番」直达链接（自动计算当前季度，如 `https://yuc.wiki/202607`）
  - 「📅 查看新番」下拉菜单：本年四季新番 + [新番卫星观测站](https://yuc.wiki/new)（未开播作品），**按钮全年常显**
- **批量添加**：一次性输入多个番剧名称批量添加
- **快速链接 / 右键菜单 / 批量操作 / 行内编辑 / 移至追番 / 清空列表**

### 📚 已看历史

- **年份分组**：按年份分类浏览，支持自定义年份标签（如 "2014~2017"）
- **默认排序**：按观看日期**从早到晚**排列（不同精度的日期如 `2025`、`2025/07`、`2025/07/15 14:30` 混排也能正确排序），表头可切换
- **搜索功能**：实时搜索作品名称
- **统计信息**：显示本年观看数和总计观看数
- **年份管理 / 快速链接 / 批量操作 / 行内编辑 / 分页浏览 / 清空列表**

### 📥 导入 Excel

- **智能识别**：自动识别工作表类型（追番/等番/已看）
- **周历解析**：追番表支持 Excel 周历布局，自动识别星期列和更新时间
- **超链接导入**：自动提取单元格超链接；日期支持年份、年月、完整日期、年份范围
- **导入日志 / 追加模式**：导入数据追加到现有记录，不覆盖

### 🎨 全局特性

- **高分屏适配**：界面随屏幕尺寸合理缩放（根字号 `clamp(14px, 0.8333vw, 28px)`），4K 屏下文字、按钮、弹窗整体放大，不再眯眼看小字
- **主题切换**：日间 / 暗黑 / 跟随系统
- **实时时钟 / 页面动画 / 毛玻璃效果**
- **数据备份**：侧边栏一键导出 `.db` 备份文件、从备份恢复

---

## 🚀 使用方法

### 开发

```bash
# 前置要求：Node.js >= 18，pnpm（推荐）或 npm
pnpm install
pnpm dev        # 开发服务器 http://localhost:5174
```

### 构建与使用

```bash
pnpm build      # 产物：dist/index.html（单文件，约 1.5 MB，含内联的 WASM 与全部资源）
```

构建出的 `dist/index.html` 可以：

- 直接双击用浏览器打开（`file://` 协议可用，WASM 已内联）
- 放到任意静态服务器 / 网盘 / U 盘随身携带

数据保存在浏览器的 IndexedDB 中，换浏览器或换电脑时用侧边栏的「导出备份 / 导入恢复」迁移。

---

## 📁 项目结构

```
project-banager/
├── index.html                      # HTML 入口
├── package.json
├── vite.config.js                  # Vite 配置（singlefile + wasm 内联）
├── vite-plugin-wasm-inline.js      # 自定义 WASM 内联插件
├── tailwind.config.js
├── postcss.config.js
├── template.xlsx                   # Excel 导入格式样例
├── dist/                           # 构建产物（单文件 index.html）
├── public/
│   ├── favicon.png
│   └── logo.png
└── src/
    ├── main.js                     # 应用入口
    ├── App.vue                     # 根组件（侧边栏 + 路由）
    ├── style.css                   # 全局样式、暗色模式、响应式缩放
    ├── composables/
    │   ├── useTheme.js             # 主题切换
    │   └── useDatePicker.js        # 日期解析 / 校验工具
    ├── db/
    │   ├── index.js                # sql.js 数据库 + IndexedDB 持久化
    │   ├── api.js                  # 数据访问层（原 server API 的浏览器版）
    │   ├── excelImporter.js        # Excel 导入解析
    │   └── wasmInline.js           # 构建时生成的 WASM base64
    ├── router/
    │   └── index.js                # 路由配置
    └── views/
        ├── WatchingView.vue        # 正在追番
        ├── RemainingView.vue       # 等待更新
        ├── WatchedView.vue         # 已看历史
        └── ImportView.vue          # 导入 Excel
```

---

## 🗄️ 数据表结构

数据全部存于浏览器 IndexedDB 内的 SQLite 数据库（`BangumiManagerDB`），各表均含 `sort_order`、`created_at`、`updated_at`：

| 表 | 字段 |
|------|------|
| **watching**（追番） | id, name, day_of_week, time_slot, current_episode, url, url_params, notes |
| **remaining**（等番） | id, name, expected_date, url, url_params, notes |
| **watched**（已看） | id, name, watch_date, url, url_params, notes |
| **watched_years**（已看年份） | id, year_label |

`url` + `url_params` 组合生成动态链接：`url` 为基础地址，`url_params` 中的 `{集数}` 在打开链接时替换为当前集数（如 `keyword={集数}` → `keyword=914`）。

---

## 🚧 TODO

- [ ] 数据导出为 Excel / JSON
- [ ] 番剧封面图支持
- [ ] 追番进度百分比显示
- [ ] PWA 支持（离线访问、桌面安装）
- [ ] 拖拽排序
- [ ] 评分系统 / 标签分类

---

## 📄 License

MIT License

---

> 💝 PBM - 从 Excel 到浏览器单文件，追番管理从未如此优雅。
