# PBM — Project Bangumi Manager

[中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

> An anime tracker that belongs only to you. Runs in the browser, ships as one file, keeps all data local.

## What it is

PBM manages the full lifecycle of your shows: **Waiting → Watching → Watched**. The project started in Feb 2020
as a single Excel sheet and has been refined against real usage for years. Today it is **one HTML file** —
download it, double-click it, done.

No server, no account, no network dependency. The database runs inside your browser (SQLite WASM + IndexedDB).

## Highlights

**Week view** — your shows laid out Monday through Sunday, so you see at a glance what's on today.

**Status flow** — move entries between Waiting, Watching and Watched with one click or a context menu.

**Excel migration** — import your historical spreadsheet in one go; week layouts, hyperlinks and merged year
cells are all recognized.

**Zero-dependency runtime** — the build output is a single HTML file with the WASM inlined, so it also works
from `file://`.

## Features

| Page | Capabilities |
|---|---|
| Watching | Week grid, time sorting, episode ± (zero-padded and decimal), link templates, monthly reminders |
| Waiting | Table + paging, date sorting, drag to reorder, seasonal anime shortcut |
| Watched | Year grouping, date sorting, statistics, custom year labels |
| Import | Sheet type detection, week-layout parsing, append mode, import log |

**Global**

- Chinese / English / Japanese switching, unified CJK font family
- Theme & background: frosted / liquid glass, 6 palettes plus wallpaper sampling, random wallpaper, adjustable mask & blur
- Light / dark / follow-system, high-DPI scaling
- One-click `.db` backup and restore (with a rollback point)
- Fully keyboard operable, focus trap, Esc to close
- Help dialog that collects shortcuts and tips in one place

## Quick start

```bash
pnpm install
pnpm dev      # dev server
pnpm build    # outputs dist/index.html (single file, ~1.8 MB)
pnpm test     # 403 tests / 12 files
```

Double-click `dist/index.html` to use it, or host it on any static server.

Data lives in your browser's IndexedDB; move it between devices with the sidebar "Export / Restore" buttons.

## Tech stack

Vue 3 · Vite 6 · TailwindCSS 3 · vue-router 4 · SQLite (sql.js WASM) · SheetJS

## Project structure

```
src/
├── components/    UI components (cards, icons, dialogs, toasts)
├── composables/   shared logic (theme, appearance, i18n, dates, episodes…)
├── db/            SQLite + IndexedDB + Excel parsing
├── locales/       three language packs (415 strictly aligned keys)
├── views/         the four pages
├── App.vue        root component
└── style.css      global styles and theme variables
```

## Documentation

- [Code audit and fix report](review/SUMMARY.md)
- [Changelog](CHANGELOG.md)

## License

MIT
