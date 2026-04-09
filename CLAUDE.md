# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DataLens Calculator** is a Chrome Extension (Manifest V3) that lets users extract numbers from webpages via click/drag selection modes and perform calculations with history tracking. No build system, no npm dependencies — pure vanilla JavaScript.

## Development Setup

Load as an unpacked Chrome extension:
1. Go to `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked" → select this directory

After editing any file, click the reload button on `chrome://extensions/` (or press R on the extension card). There are no build steps, compilation, or tests.

## Architecture

Three independent processes communicate via `chrome.runtime.sendMessage`:

```
background.js (service worker)
  ↕ messages
content.js (injected into every webpage)
  ↕ messages (routed through background)
panel/panel.js (side panel UI)
```

**background.js** — Message router + storage layer. Owns all `chrome.storage.local` operations (selections: 200 max, calculations: 500 max, snapshots: 100 max, all FIFO). Handles keyboard command activation (`Alt+Shift+D`, `Alt+Shift+C`).

**content.js + content.css** — DOM interaction layer. Implements two extraction modes:
- *Click mode*: hover highlight → single-click extracts numbers from element
- *Drag mode*: full-page overlay → rubber-band selection rectangle → auto-expand to column/class group

Number extraction uses regex with smart thousand/decimal separator detection (handles `1,234.56`, `1.234,56`, currency symbols, percentages, negatives). Three extraction types: `number` (smart parse), `text` (literal), `regex` (custom pattern).

Auto-expand selection tries two strategies in order: (1) same table column expansion, (2) shared CSS class + vertical alignment match.

**panel/panel.js + panel.html + panel.css** — Side panel UI with four tabs: Selections, Calculator, History, Paste. Letter labels [A], [B], [C]... are assigned to selection groups. Calculator supports 8 quick operations (sum, average, min, max, product, subtract, count, median) plus a custom formula field.

Custom formula parser (`evaluateMath` in panel.js) is a recursive descent parser — **not** `eval` or `Function` constructor, due to CSP constraints introduced in recent refactor. References selections by letter: `[A] + [B] * 0.9`.

## Key Message Types

- `SET_MODE` → content.js activates/deactivates click or drag mode
- `SELECTION_DATA` → content.js → background → forwarded to panel as `SELECTION_DATA_FORWARDED`
- `SAVE_CALCULATION` → panel → background persists to storage
- `GET_HISTORY`, `GET_SNAPSHOTS`, `TOGGLE_PIN`, `DELETE_HISTORY_ITEM`, `DELETE_SNAPSHOT`, `CLEAR_HISTORY`
- `CLEAR_SELECTIONS`, `GET_SELECTIONS`, `DELETE_SELECTION`

## UI Conventions

- Dark theme: near-black `#0d0d0e`, violet accent `#7c6ce7`
- Fonts: DM Sans (UI), JetBrains Mono (values/code)
- Animation durations: `.11s` fast, `.18s` mid, `.24s` spring
- Content script overlays use `z-index: 2147483646` (near max) to appear above page content

## CSP Constraint

The extension runs under a strict Content Security Policy. **Never use `eval`, `new Function()`, or dynamic `import()`** in any extension file. Formula evaluation must go through the existing `evaluateMath()` recursive descent parser in panel.js.
