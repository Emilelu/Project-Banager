# PBM — Project Bangumi Manager

[中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

> 一个只属于你自己的追番管理器。纯浏览器运行、单文件部署、数据 100% 本地。

## 这是什么

PBM 帮你管理 **等番 → 追番 → 已看** 的完整生命周期。项目始于 2020 年 2 月的一张 Excel 表，
多年来按实际使用习惯打磨，现在是**一个 HTML 文件**——下载、双击、就能用。

没有服务端，没有账号，没有网络依赖。数据库跑在浏览器里（SQLite WASM + IndexedDB）。

## 核心特性

**周历视图** — 追番按周一至周日排开，今天该看什么一眼看到；卡片直接显示进度（`e 3 / 12 25%`）。

**状态流转** — 等番、追番、已看三种状态互转，右键或工具栏一键移动。

**导入导出对等** — 侧边栏「导入」「导出」各一个下拉菜单，**能导出什么就能导入什么**：
xlsx / csv / json / md / db 五种格式；xlsx 严格对齐 `template.xlsx` 的周历布局，导出后可直接回灌。

**标签系统** — 12 个内置标签加自建标签；编辑弹窗用选择器打标，列表页按标签筛选（多选 OR）。

**零依赖运行** — 构建产物是单个 HTML，WASM 已内联，支持 `file://` 直接打开。

## 功能一览

| 页面 | 能力 |
|---|---|
| 追番 | 周历布局、时间排序、集数 ±（补零/小数）、进度百分比、链接模板快速填充、本月等番提醒、批量勾选 |
| 等番 | 表格 + 分页、日期排序、拖动自定义顺序、批量添加、季度新番直达、按标签筛选 |
| 已看 | 年份分组、日期排序、年份标签自定义、本年与累计统计、按标签筛选 |
| 标签 | 内置 12 个 + 自建，新建/改名/改色/删除；内置不可删，改名同步更新条目 |
| 主题 | 6 套预设配色、跟随壁纸取色或每次随机、毛玻璃/液态玻璃、遮罩与模糊微调 |
| 导入 | Excel 智能识别工作表、周历解析、合并单元格年份、超链接、追加模式、导入日志 |

**全局**

- 中英日三语切换（483 key 三语严格对齐），中日字体按语言走各自家族
- 侧边栏可折叠（15rem ↔ 4rem）、按「番单 / 数据 / 设置」分区，收起态只留图标与气泡提示
- 统一取色组件，标签页与主题页共用同一套取色交互
- 日间/暗黑/跟随系统，根字号随视口缩放（高分屏整体放大）
- 一键导出 `.db` 整库备份；导入前自动落一份回滚快照
- 结构化导入逐条汇总结果，失败原因可展开
- 全键盘可操作、焦点陷阱、Esc 关闭
- 帮助弹窗集中收纳快捷键与操作提示

## 快速开始

```bash
pnpm install
pnpm dev      # 开发服务器
pnpm build    # 产物 dist/index.html（单文件约 1.9 MB）
pnpm test     # 438 用例 / 13 文件
```

双击 `dist/index.html` 即可使用，或放到任意静态服务器。

数据存在浏览器 IndexedDB 中；换设备时用侧边栏「导出 → 数据库备份 (.db)」与「导入」迁移。

## 技术栈

Vue 3 · Vite 6 · TailwindCSS 3 · vue-router 4 · SQLite (sql.js WASM) · SheetJS

## 项目结构

```
src/
├── App.vue        根组件（侧边栏分区/折叠、导入导出菜单）
├── components/    UI 组件（AppIcon、WatchingCard、ColorPicker、TagSelector、TagFilter、HelpDialog）
├── composables/   组合式逻辑（主题、外观、i18n、日期、集数、焦点陷阱…）
├── db/            SQLite + IndexedDB 与数据存取
│   ├── index.js              表结构/迁移/标签与进度字段
│   ├── excelImporter.js      xlsx 导入
│   ├── excelExporter.js      xlsx / csv / json / md 导出
│   └── structuredImporter.js csv / json / md 回灌
├── locales/       三语语言包（zh / en / ja，483 key）
├── router/        路由（含 /tags、/appearance）
├── views/         六个页面（追番/等番/已看/导入/标签/主题）
└── style.css      全局样式与主题变量
```

## 文档

- [代码审计与修复报告](review/SUMMARY.md)
- [版本变更记录](CHANGELOG.md)

## License

MIT
