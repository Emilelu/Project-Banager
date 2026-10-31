# PBM — Project Bangumi Manager

[中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

> 一个只属于你自己的追番管理器。纯浏览器运行、单文件部署、数据 100% 本地。

## 这是什么

PBM 管理 **等番 → 追番 → 已看** 的完整生命周期。项目始于 2020 年 2 月的一张 Excel 表，
现在是**一个 HTML 文件**——下载、双击、就能用。没有服务端、账号与网络依赖，
数据库跑在浏览器里（SQLite WASM + IndexedDB）。

## 核心特性

**周历视图** — 追番按周一至周日排开，今天该看什么一眼看到；卡片显示进度 `e 3 / 12 25%`。

**状态流转** — 等番、追番、已看三态互转，右键或工具栏一键移动。

**导入导出各一个菜单** — 侧栏「导入」「导出」两个下拉菜单，两边都列 5 种格式
xlsx / csv / json / md / db；xlsx 严格对齐 `template.xlsx` 的周历布局。

**标签系统** — 12 个内置标签加自建；编辑弹窗用选择器打标，列表页按标签筛选（多选 OR）。

**零依赖运行** — 产物是单个 HTML，WASM 已内联，支持 `file://` 直接打开。

## 功能一览

| 页面 | 能力 |
|---|---|
| 追番 | 周历布局、时间排序、集数 ±（补零/小数）、进度百分比、链接模板、本月等番提醒 |
| 等番 | 表格 + 分页、日期排序、拖动排序、批量添加、季度新番直达、标签筛选 |
| 已看 | 年份分组、日期排序、年份标签自定义、本年与累计统计、标签筛选 |
| 标签 | 内置 12 个 + 自建；新建/改名/改色/删除，内置不可删，改名同步到条目 |
| 主题 | 6 套预设配色、跟随壁纸取色或每次随机、毛玻璃/液态玻璃、遮罩与模糊微调 |
| 导入 | Excel 导入页 `#/import`：工作表识别、周历解析、合并单元格年份、超链接、导入日志 |

**全局**

- 中英日三语（523 key 对齐），中日字体按语言走各自家族；日间/暗黑/跟随系统
- 侧栏可折叠（15rem ↔ 4rem）、分「番单 / 数据 / 设置」区，收起只留图标与气泡
- 统一取色组件；根字号随视口缩放，高分屏整体放大
- `.db` 整库备份与恢复前回滚快照；结构化导入汇总成功/失败数
- 全键盘可操作、焦点陷阱、Esc 关闭；帮助弹窗收纳快捷键

## 快速开始

```bash
pnpm install
pnpm dev      # 开发服务器
pnpm build    # 产物 dist/index.html（单个 HTML，WASM 已内联）
pnpm test     # 470 用例 / 14 文件
```

双击 `dist/index.html` 即可使用，或放到任意静态服务器。
数据存在 IndexedDB；换设备时用侧栏「导出 → 数据库备份 (.db)」与「导入」迁移。

## 技术栈

Vue 3 · Vite 6 · TailwindCSS 3 · vue-router 4 · SQLite (sql.js WASM) · SheetJS

## 项目结构

```
src/
├── App.vue        根组件（侧栏分区/折叠、导入与导出菜单）
├── components/    AppIcon · WatchingCard · ColorPicker · TagSelector · TagFilter · HelpDialog
├── composables/   主题、外观、i18n、日期、集数、焦点陷阱…
├── db/            index.js（表结构/迁移）、excelImporter、excelExporter、structuredImporter
├── locales/       三语语言包 zh / en / ja（523 key）
├── router/        路由（含 /tags、/appearance）
├── views/         追番 · 等番 · 已看 · 导入 · 标签 · 主题
└── style.css      全局样式与主题变量
```

## 文档

- [代码审计与修复报告](review/SUMMARY.md)
- [版本变更记录](CHANGELOG.md)

## License

MIT
