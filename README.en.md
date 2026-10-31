# PBM — Project Bangumi Manager

[中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

> An anime tracker that belongs only to you. Runs in the browser, ships as one file, keeps all data local.

## What it is

PBM manages the full lifecycle of your shows: **Waiting → Watching → Watched**. The project started in Feb 2020
as a single Excel sheet and is now **one HTML file** — download it, double-click it, done. No server, no account,
no network dependency; the database runs inside your browser (SQLite WASM + IndexedDB).

## Highlights

**Week view** — your shows laid out Monday through Sunday, so you see at a glance what's on today; each card
shows progress inline, `e 3 / 12  25%`.

**Status flow** — move entries between Waiting, Watching and Watched with one click or a context menu.

**One Import menu, one Export menu** — two sidebar dropdowns, both listing 5 formats:
xlsx / csv / json / md / db. The xlsx output follows the `template.xlsx` week layout strictly.

**Tags** — 12 built-in tags plus your own; tag selectors in every edit dialog and multi-select (OR) filtering
on the list pages.

**Zero-dependency runtime** — the build output is a single HTML file with the WASM inlined, so it also works
from `file://`.

## Features

| Page | Capabilities |
|---|---|
| Watching | Week grid, time sorting, episode ± (zero-padded and decimal), progress percentage, link templates, monthly reminders |
| Waiting | Table + paging, date sorting, drag to reorder, batch add, seasonal anime shortcut, tag filtering |
| History | Year grouping, date sorting, custom year labels, this-year and total stats, tag filtering |
| Tags | 12 built-ins + custom; create, rename, recolor, delete; built-ins cannot be deleted, renames propagate |
| Theme | 6 preset palettes, sample from wallpaper or randomize per refresh, frosted / liquid glass, mask & blur tuning |
| Import | Excel import page `#/import`: sheet detection, week-layout parsing, merged year cells, hyperlinks, import log |

**Global**

- Chinese / English / Japanese (523 aligned keys), CJK font family per language; light / dark / follow-system
- Collapsible sidebar (15rem ↔ 4rem) grouped into lists / data / settings, icons with tooltips when collapsed
- One shared color picker; root font size scales with the viewport for high-DPI screens
- `.db` backup with a rollback snapshot before a restore; structured imports report success/failure counts
- Fully keyboard operable, focus trap, Esc to close; help dialog collects shortcuts in one place

## Quick start

```bash
pnpm install
pnpm dev      # dev server
pnpm build    # outputs dist/index.html (one HTML file, WASM inlined)
pnpm test     # 470 tests / 14 files
```

Double-click `dist/index.html` to use it, or host it on any static server.
Data lives in IndexedDB; move it between devices with the sidebar "Export → Database backup (.db)" and "Import".

## Tech stack

Vue 3 · Vite 6 · TailwindCSS 3 · vue-router 4 · SQLite (sql.js WASM) · SheetJS

## Project structure

```
src/
├── App.vue        root component (sidebar groups/collapse, import & export menus)
├── components/    AppIcon · WatchingCard · ColorPicker · TagSelector · TagFilter · HelpDialog
├── composables/   theme, appearance, i18n, dates, episodes, focus trap…
├── db/            index.js (schema/migrations), excelImporter, excelExporter, structuredImporter
├── locales/       three language packs, zh / en / ja (523 keys)
├── router/        routes (including /tags and /appearance)
├── views/         Watching · Waiting · History · Import · Tags · Theme
└── style.css      global styles and theme variables
```

## Documentation

- [Code audit and fix report](review/SUMMARY.md)
- [Changelog](CHANGELOG.md)

## License

MIT
