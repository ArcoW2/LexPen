# Plan: settings window and a settings file

Status: executed on 2026-10-19 on the branch `editor-first`. Decisions of the run are in section 5.

## 1. What this is about

The settings are menu items (Options > Settings, with submenus), and some live in the View menu. There are
too many for menus, they have no room for an explanation, and more are coming (fonts, the large-file limit
for the preview, language packs). They are also kept in the page's storage, so they cannot be copied to
another PC or edited by hand.

## 2. The solution, in brief

Options > Settings opens a separate settings window: a search box on top and one long list with a header per
group (General, Editor, Preview, Files, Tabs, Find, App, Keys). Each row has the setting's name, a one-line
explanation and its control. Typing filters the list. A change works at once in every LexPen window; there is
no OK or Apply. The choices are kept in a JSON file per user, as keys.json: the defaults ship with LexPen,
the user's file holds only what differs, and it can be edited by hand or copied to another PC.

## 3. Details

### 3.1 Groups and settings (what exists today, plus what is planned)

| Group | Settings |
|---|---|
| General | Day / night; Open markdown in |
| Editor | Editor font; Editor font size; Editor line height; Line numbers, bookmarks, change, git and fold markers (the gutter columns); Formatting bar |
| Preview | Single line break starts a new line; Preview zoom; Large files without colour (when that plan is built) |
| Files | Keep a backup when saving |
| Find | One search for both panes |
| Tabs | Ctrl+Tab order; Tabs on several rows; Move pinned tabs to the main pane / primary window when closing (executed/PLAN-pinned-tabs.md) |
| App | App font; App font size |
| Keys | A line pointing to F1 and to the user's keys.json (opens it in a tab) |

Not in the window: layout state rather than choices (pane sizes, sidebar width, which side view is shown,
sort order of the folder pane, the search scope, window position). It stays where it is.

### 3.2 The window

- Its own Windows window (a WinForms form owned by the window it was opened from), with its own WebView2
  showing `settings.html`, which uses `app.css`, so theme and fonts match the main windows.
- One settings window for the whole app, also with several LexPen windows open; opening it again (from any
  window) brings it to the front.
- A change applies at once in every LexPen window, not only when the settings window closes: there is no OK
  or Apply, and you see the effect while you choose.
- Not modal: you can keep typing in the editor and see a change happen.
- The list: group headers, rows below them. Search filters rows on name and explanation; a group without a
  match disappears; Esc empties the search, a second Esc closes the window.
- Keys: Tab moves between controls, Up / Down between rows, Space toggles, Enter opens a choice.
- A row that differs from the default shows a mark and a reset button.
- Font rows use the font list of the Fonts plan (sample in the font itself, monospaced first for the editor).

### 3.3 The settings file and the data folder

Settings (your choices, worth copying to another PC) stay in `%LOCALAPPDATA%\LexPen`; state (what LexPen
remembers by itself) moves to a subfolder `State`:

| Where | File | Holds |
|---|---|---|
| `LexPen\` | `settings.json` | Your settings: only what differs from the defaults (new, see below). Day / night moves here. |
| `LexPen\` | `keys.json` | Your keys (as today). |
| `LexPen\` | `favourites.json` | Your favourite files: a choice you make, so a setting (today in the state file). |
| `LexPen\` | `tab-colours.json` | Your tab colour rules (as today). |
| `LexPen\` | `themes\` | Your own themes (when the themes plan is built). |
| `LexPen\State\` | `state.json` | Window position and size; recently opened files and folders, recently closed files (today's `settings.json` without theme and favourites). |
| `LexPen\State\` | `session.json` | The primary window's folder, tabs and panes. |
| `LexPen\State\` | `clipboards.json`, `bookmarks.json` | Clipboards 1 to 9, bookmarks of closed files. |
| `LexPen\State\` | `Drafts\` | Unsaved new files. |
| `LexPen\State\` | `EBWebView\` | The browser's own data (WebView2): page storage and caches. |

- Defaults: `wwwroot\settings.json` (shipped, JSONC with a comment per setting, as keys.json).
- Your `settings.json` holds only what differs from the default. The settings window writes it; it can be
  edited by hand. The host reads both, merges them, and reports problems (unknown name, wrong value) in the
  window, as it does for keys.json.
- The host watches your file and sends the merged settings to every window on a change (from the settings
  window, another window or a hand edit).
- Moving over, once, at the first start with this version: today's `settings.json` is split into `State\state.json`,
  `favourites.json` and the theme in the new `settings.json`; `session.json`, `clipboards.json`,
  `bookmarks.json`, `Drafts\` and `EBWebView\` move into `State\`; the choices now kept in the page's storage
  are written to `settings.json`. Nobody loses a setting, a draft or a bookmark.
- `EBWebView\` is moved as a folder (same disk, so a rename), before the browser starts: its contents stay as
  they are, so nothing is rebuilt and LexPen does not start slower. Only the first LexPen process moves it
  (one instance per user, see Program.cs); when the move fails (a file in use), the old place is used and the
  move is tried again at the next start.
- `LEXPEN_DATA` (used by the tests) keeps working: the same layout under that folder.

### 3.4 Actions and menus

- Every setting is an action already (group `settings`, or `view` for the View toggles). An action gets a
  `setting` part: its name in the file, its group, its kind (toggle, choice with its options, font, size,
  number) and its default comes from the defaults file. The window is built from those; nothing is listed
  twice.
- Options menu: the Settings submenu is replaced by one item "Settings...". No default key; it is an action,
  so keys.json can give it one. The View menu keeps its toggles
  (formatting bar, gutter, tabs on several rows, day / night, zoom), which now read and write the same file.
- F1 keeps listing the setting actions, so a setting can still get a key.

### 3.5 Tests

- Unit tests: merging defaults and the user's file, problems reported, only differences written back, the
  move from the page's storage.
- In-app script: the window lists every action with a `setting` part; each row changes its setting in the
  main window and the menu check mark follows; search filters; reset brings the default back; a hand edit of
  the file reaches the open windows.

## 4. Open questions

None.

## 5. Resolved issues during execution

| # | Issue | Decision |
|---|---|---|
| 1 | Where the rows of the settings window come from: actions.js lives in the main window's page, which the settings window does not load. | The main window's page sends its rows to the host at start (`settingDefs`, built from `SETTING_ROWS` in actions.js, titles and hints from the actions); the settings window asks the host for them. One description per setting, in actions.js; the defaults in wwwroot\settings.json. |
| 2 | Values: the page's storage held "on" / "off" texts. | settings.json holds real values: true / false, numbers, texts. A font or size of "" / 0 means the default (Consolas 10.5 pt, Segoe UI 9.75 pt, line height 1.3). The host checks the kind against the default and reports a wrong one. |
| 3 | Which settings: the plan's list, and the View menu's toggles. | The rows: theme, open markdown in, editor font / size / line height, wrap, the five gutter columns, formatting bar, single line breaks, preview zoom, backup, Ctrl+Tab order, tabs on several rows, move pinned tabs, one search for both panes, app font / size, and a Keys row (F1 and your keys.json). Layout state (sidebar, outline, pane sizes, the editor / preview splitter, sort order, search scope, markdown-only filter) stays in the page's storage. |
| 4 | Two quick changes: the host's set after the first change arrived after the second and put the old value back for a moment (seen in the fonts test). | A value set in a window and not yet confirmed by the host wins over a set the host sends meanwhile (main windows and the settings window). |
| 5 | Moving the page's stored settings: the host cannot read the page's storage. | The page sends them once (`settingsImport`); the host writes the ones that differ from the default and leaves a mark (`State\page-settings-moved`), so it happens once. The page then removes them from its storage. Possible because the browser's data folder is moved as a whole, storage included. |
| 6 | The old settings.json is replaced by the new one with the same name. | A copy of the old file stays in `State\settings-before-move.json`. |
| 7 | Comments in your settings.json. | The settings window writes the file whole, as plain JSON: comments you typed in it do not survive a change made in the window. The shipped defaults file keeps its comments (it is never written). |
| 8 | Day / night: today a host setting with its own message (`state`). | Now the setting `theme`; the toolbar button and View > Day / night change it like any setting. The host gives every window (and the settings window) the matching title bar when it changes. |
| 9 | Up / Down in the settings window: a closed list (select) changes its value with them. | Up / Down always move between rows; a list opens with Enter (or Alt+Down, Space) and changes inside it. |
| 10 | Keys row: open F1 and your keys.json from the settings window. | Both go to the most recently active LexPen window (F1 opens there; keys.json opens in a tab, created with a short example comment when missing). The footer opens your settings.json the same way. |
| 11 | A setting value that is not in a row's list (typed by hand, for example zoom 1.25). | Shown as it is, as an extra entry in the list. |
| 12 | Tests. | Unit tests: 96 pass (SettingsFile and DataFolder new: merge, problems, only differences written, the move of an old layout, a file in use moved at the next start). In-app script t22-settings: 29 checks, all pass: the old layout moved (state, favourites, theme, clipboards, browser data), page storage moved once, the one settings window, a row per setting in the groups, a change and a reset reach the main window and the file, a size choice, search, a hand edit and a problem in the file, a View menu toggle writing the file, Esc twice, a second LexPen window following a change. The earlier scripts were changed from the page's storage to `setting()` / `setSetting()` and pass again. The test tool once lost a restarted page (port answered before the page); a second run passed. |
| 13 | Asked on 2026-10-19 after the run: line numbers as None / Every 10 / Every line, and absolute or relative to the cursor. | Settings `lineNumbers` (none, tens, all) and `lineNumberCount` (absolute, relative), View > Gutter > Line numbers. Every 10: the number on every tenth line, a dash at 5, a small dot on the others. Relative: the cursor line shows its own number, the others their distance, also in Every 10. The old toggle `gutter.lineNumbers` is gone ("off" in the page's storage becomes none). |
| 14 | Asked: the gutter as a part of Editor in the settings window. | Rows can belong to a part of a group (`sub`): Editor > Gutter, with its own header, indented rows; search finds it by "gutter". |
| 15 | Asked: the formatting bar is above the editor, not only the markdown editor. | Hint and comment say "above the editor". |
| 16 | Asked: Tabs on several rows as a choice of three. | Setting `tabBar`: scroll (one row that scrolls, as before), menu (one row without a scroll bar; a button at its end shows how many tabs are out of view and lists them; the active tab is kept in view), rows (several rows). View > Tab bar. The old toggle `tabRows` is gone ("on" in the page's storage becomes rows). |
| 17 | Asked: the bottom bar with a font and size of its own (14 pt while the app is 13). | Settings `statusFont` and `statusSize` (App group, also F1); default: the app font and the app's size for small texts. |
| 18 | Asked: Open markdown in as a setting per language. | Belongs with the language packs (they define the languages): written into PLAN-language-packs.md section 4 (`openIn.<language>`); built with that plan. |
| 19 | Tests of these changes. | In-app script t23 (25 checks, all pass): the line number modes and the relative count following the cursor, the bottom bar font, the tab bar menu and rows, the Gutter part in the settings window, the move of the old toggles. The settings and gutter scripts were updated for the renamed settings and pass; the test tool now retries a page that is still listed from before a restart. |
| 20 | Asked: with relative line numbers the cursor line's own number looks like the others (it is not a distance). | That number is in italics and fully visible (the others are dimmed); it follows the cursor and goes with absolute numbers. Checked in t23 (28 checks, all pass). |
