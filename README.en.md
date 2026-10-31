# PBM — Project Bangumi Manager

[中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

> An anime tracker that belongs only to you. Runs in the browser, ships as one file, keeps all data local.

## What it is

PBM manages the full lifecycle of your shows: **Waiting → Watching → Watched**. The project started in Feb 2020
as a single Excel sheet and has been refined against real usage for years. Today it is **one HTML file** —
download it, double-click it, done.

No server, no account, no network dependency. The database runs inside your browser (SQLite WASM + IndexedDB).

## Highlights

**Week view** — your shows laid out Monday through Sunday, so you see at a glance what's on today; cards show
progress inline (`e 3 / 12  25%`).

**Status flow** — move entries between Waiting, Watching and Watched with one click or a context menu.

**Symmetric import & export** — the sidebar has one "Import" and one "Export" dropdown: **whatever you can
export, you can import back**. Five formats shared by both directions: xlsx / csv / json / md / db. The xlsx
output follows `template.xlsx` week-layout strictly, so it round-trips without loss.

**Tags** — 12 built-in tags plus your own; tag selectors in every edit dialog and multi-select (OR) filtering
on the list pages.

**Zero-dependency runtime** — the build output is a single HTML file with the WASM inlined, so it also works
from `file://`.

## Features

| Page | Capabilities |
|---|---|
| Watching | Week grid, time sorting, episode ± (zero-padded and decimal), progress percentage, link templates, monthly reminders, batch selection |
| Waiting | Table + paging, date sorting, drag to reorder, batch add, seasonal anime shortcut, tag filtering |
| History | Year grouping, date sorting, custom year labels, this-year and total stats, tag filtering |
| Tags | 12 built-ins + custom ones; create, rename, recolor, delete; built-ins cannot be deleted, renames propagate to entries |
| Theme | 6 preset palettes, sample from wallpaper or randomize per refresh, frosted / liquid glass, mask & blur tuning |
| Import | Excel sheet detection, week-layout parsing, merged year cells, hyperlinks, append mode, import log |

**Global**

- Chinese / English / Japanese switching (483 strictly aligned keys), CJK font family selected per language
- Collapsible sidebar (15rem ↔ 4rem) grouped into lists / data / settings, icon-only with tooltips when collapsed
- One shared color picker used by both the tags page and the theme page
- Light / dark / follow-system, root font size scales with the viewport (large on high-DPI screens)
- One-click `.db` backup; a rollback snapshot is saved before any restore
- Structured imports report per-entry results, with expandable failure reasons
- Fully keyboard operable, focus trap, Esc to close
- Help dialog that collects shortcuts and tips in one place

## Quick start

```bash
pnpm install
pnpm dev      # dev server
pnpm build    # outputs dist/index.html (single file, ~1.9 MB)
pnpm test     # 438 tests / 13 files
```

Double-click `dist/index.html` to use it, or host it on any static server.

Data lives in your browser's IndexedDB; move it between devices with the sidebar "Export → Database backup
(.db)" and "Import".

## Tech stack

Vue 3 · Vite 6 · TailwindCSS 3 · vue-router 4 · SQLite (sql.js WASM) · SheetJS

## Project structure

```
src/
├── App.vue        root component (sidebar groups/collapse, import & export menus)
├── components/    UI components (AppIcon, WatchingCard, ColorPicker, TagSelector, TagFilter, HelpDialog)
├── composables/   shared logic (theme, appearance, i18n, dates, episodes, focus trap…)
├── db/            SQLite + IndexedDB and data access
│   ├── index.js              schema / migrations / tag and progress fields
│   ├── excelImporter.js      xlsx import
│   ├── excelExporter.js      xlsx / csv / json / md export
│   └── structuredImporter.js csv / json / md re-import
├── locales/       three language packs (zh / en / ja, 483 keys)
├── router/        routes (including /tags and /appearance)
├── views/         six pages (watching / waiting / history / import / tags / theme)
└── style.css      global styles and theme variables
```

## Documentation

- [Code audit and fix report](review/SUMMARY.md)
- [Changelog](CHANGELOG.md)

## License

MIT
