# Plan: Order and groups in the Panels menu

Status: draft 2026-11-07, questions answered 2026-11-07; not started.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

The Panels menu (View > Panels now, Window > Panels after plan 25) lists every panel in one run, in the order they
were built: Folder, Search, Outline, Characters, Highlights, Bookmarks, Columns (CSV), Sort, Step by step, Messages,
Clipboards, Macros, Keyboard shortcuts and commands, Settings, Manage projects, Theme sets. It grows with each feature,
and a long list with no order has to be read from the top every time.

## 2. The solution, in brief

The same flat list, split into small groups by what the panel is about (plan 25's subjects), each group under a
dimmed heading and ordered by how often it is used; the dock areas and Reset docking stay last. A new panel joins the group of its
subject. No submenus: Panels is a submenu already, and plan 25 allows one level only.

## 3. Details

### 3.1 The groups

| Group | Panels, in this order |
|---|---|
| Files and finding | Folder, Search, Bookmarks |
| The document | Outline, Highlights, Columns (CSV) |
| Editing | Characters, Clipboards, Sort |
| Macros | Macros, Step by step |
| LexPen | Settings, Keyboard shortcuts and commands, Messages, Theme sets, Manage projects |
| (as now) | Dock area at the left / right / bottom |
| (as now) | Reset docking |

- The order inside a group is by use: the panel used most first, as plan 25 orders its menus. This is a judgement,
  not a measurement.
- The mnemonics stay as they are where they are still unique in the menu; only a clash is changed.
- Each group starts with a dimmed heading (its name from the table), not clickable and skipped by the arrow keys.
- Manage projects is in both places: in the LexPen group here, and in Window > Projects (plan 25).
- Sort is in Editing, as its menu item is under Edit.
- Messages stays with LexPen: it can report on anything, not only the document worked in.
- Toolbar and keys are not touched: only `PANELS` in docks.js (its order, plus the headings) changes.

### 3.2 What does not work, alternatives

- Alphabetical: easy to scan for a known name, but it puts unrelated panels side by side (Bookmarks, Characters,
  Clipboards) and moves when a panel is added.
- Submenus per group: one click more for every panel, and a second level below Panels.
- Shown panels first: the order then changes from one opening to the next; the check marks already show what is open.

### 3.3 Tests

- The menu shows the groups in this order, each under its dimmed heading; the arrow keys skip the headings; every item still shows / hides its panel and its check.
- No two items share a mnemonic (a test over `PANELS` and the dock items).

## 4. Decisions

1. A dimmed heading per group, not separators only.
2. Manage projects: both, in the LexPen group and in Window > Projects.
3. Messages: with LexPen; it can report on anything.
4. Sort: in Editing, next to its menu item under Edit.
