# Plan: A ribbon with the actions each user wants at hand

Status: draft 2026-11-07, revised 2026-11-08; not started. From plan 25 (executed/PLAN-menu-structure.md 3.7), where
it was proposed. The number in the file name is the priority; rename to reorder.

## 1. What this is about

Everything LexPen does is in the menus and F1, and the actions used most have keys. But a key has to be known and a
menu item has to be found: there is no row of buttons for the actions a user reaches for all the time (save, undo,
find, the panels, record a macro). Every user has other favourites, so a fixed toolbar would suit nobody: the user
must be able to choose what is on it.

## 2. The solution, in brief

An optional ribbon under the menu bar, with tabs (Home, Edit, View, Tools); each tab holds named groups of buttons,
each button running an action as its menu item does, its tooltip showing the title and the key. A button is large
(icon above its label, the ribbon's full height) or small (icon with its label beside it, half the height), and two
small buttons stack in the height of one large one. LexPen ships a first set; the user adds, removes and orders
tabs, groups, buttons and dividers through Customize, kept in a `ribbon.json` in the data folder as `keys.json` is.
A setting chooses what the window shows: the menu bar, the ribbon, or both; another whether group names are shown.

## 3. Details

### 3.1 The shipped content

Per tab its groups, left to right; per group its columns, left to right. A column is one large button, two small
buttons stacked (the first on top), one small button alone, or a divider. Between groups there is always a divider.

**Home**

| Group | Columns |
|---|---|
| File | Save (large) / New file + Open file... (small, stacked) / Print... + Close tab (small, stacked) |
| History | Undo + Redo (small, stacked) |
| Clipboard | Paste (large) / Cut + Copy (small, stacked) / Clipboards (small; a number badge: the active clipboard) |
| Find | Find (large) / Replace + Find next (small, stacked) / Search in files + Replace in files (small, stacked) |
| Go | Back in the window + Forward in the window (small, stacked) / Go to line + Go to definition (small, stacked) |

**Edit**

| Group | Columns |
|---|---|
| Lines | Duplicate lines + Delete lines (small, stacked) / Join lines (small) / divider / Indent + Outdent (small, stacked) |
| Select | Select all + Select line (small, stacked) / Select a block + Select inside brackets (small, stacked) / divider / Column mode (large, a toggle) |
| Sort | Sort... (large) / Sort ascending + Sort descending (small, stacked) |
| Insert | Insert character (large) / Complete word + Paste image (small, stacked) |
| Highlights | Highlight (large, a toggle) / Highlight note + Remove highlight (small, stacked) / Highlights window (small) |

**View**

| Group | Columns |
|---|---|
| Document | Editor and preview (large) / Editor + Preview (small, stacked) |
| Text | Wrap long lines + Line numbers (small, stacked; Line numbers opens its choices) / Ruler + Formatting bar (small, stacked) / divider / Show all occurrences + Occurrences bar (small, stacked) |
| Panels | Folders + Search (small, stacked) / Outline + Manage bookmarks... (small, stacked) / Manage clipboards... (small) |
| Window | Zoom in + Zoom out (small, stacked) / Zoom 100% (small) / divider / Day / night (large) |

**Tools**

| Group | Columns |
|---|---|
| Macros | Record / stop recording (large) / Play + Play X times... (small, stacked) / Manage macros... (small) |
| Compare | Compare files... (large) / Compare folders... + Leave the compare (small, stacked) / Next difference + Previous difference (small, stacked) |
| Bookmarks | Toggle bookmark (large) / Bookmark (next) + Bookmarks of this file (small, stacked) |
| Settings | Settings... (large) / Theme colours... + Keyboard shortcuts and commands (small, stacked) |

All of these are actions that exist now (actions.js); the panels are their show / hide toggles.

### 3.2 Behaviour

- **A button is an action**: it runs the action (actions.js) with its value, like a menu item; its tooltip is the
  action's title and key. A toggle shows pressed when on (Wrap, Column mode, the panels); a button whose action is
  not available now is greyed out (the action's `enabled`). An action with choices (Line numbers) opens them as a
  small menu.
- **Tabs**: a row of tab names on top; a click shows that tab's groups. The tab last shown is kept per window. The
  ribbon's height is the same on every tab: two small rows, or one large button.
- **Sizes**: large: the icon above the label, the full height. Small: the icon with its label beside it, half the
  height. A small button marked "stacked" goes under the small button before it in the same column; at most two per
  column. A small button not stacked starts a new column (alone when the next one is not stacked under it).
- **Dividers**: a divider can stand between columns in a group; between groups always.
- **Group names** (setting ribbonGroupNames, on by default): on, the name under each group (the ribbon a line
  taller); off, one compact block: dividers only, the group's name as the tooltip of its divider.
- **Overflow**: columns that do not fit go into a ">>" menu at the right end, in their order; a group that does not
  fit at all goes there as a submenu.
- **Menu, ribbon or both** (setting commandBar: `menu`, `ribbon` or `both`; `menu` by default): with `ribbon`, the
  menus stay reachable from a menu button at the ribbon's left end (all menus in one) and with Alt, which shows the
  menu bar until the menu closes, so nothing becomes unreachable. View > Ribbon switches between `menu` and `both`;
  the ribbon's own right-click has Customize..., Reset and the three choices.
- **The top bar stays** (Editor / Preview, Day / night, the zoom) and the format bar stays as the document's own bar
  above the text: the ribbon is the window's.

### 3.3 Customize

- A window (as F1): at the left all actions with a search, grouped as the menus; at the right the ribbon: its tabs,
  each with its groups and their columns. Add, remove, move up / down (and drag); new tab, new group, rename;
  per button large or small and stacked or not; a divider.
- An action with values (Preview place, a bookmark number) is added with its value, as keys.json writes
  `["preview.left"]`.
- Reset: back to the shipped content.
- `ribbon.json` in the data folder: `{ "tabs": [ { "name": "Home", "groups": [ { "name": "File", "items": [ { "action":
  "save", "size": "large" }, { "action": "newFile", "size": "small" }, { "action": "openFile", "size": "small",
  "stack": true }, "divider", ... ] } ] } ] }`. An action that no longer exists is skipped, not an error; a "stack"
  without a small button before it starts a column of its own.

### 3.4 Icons

- One set, drawn as inline SVG in the app's own style (stroke icons, `currentColor`, so every theme colours them),
  as the format bar's icons are; a large button shows the same icon larger.
- An action without an icon shows its short title as text.
- Which actions get an icon in the first build: those of 3.1; the others show text until they get one.

### 3.5 How

- A bar element under the menu bar in index.html, built from `ribbon.json` (read through the host, as keys.json):
  the tab row, and per tab its groups as a CSS grid of columns, each two rows high.
- The state (pressed, greyed out, the clipboard badge) is refreshed where the menus refresh theirs: on the focus
  moving, a tab changing, a setting changing.
- Customize: a WebView page of its own (as F1's commands page), talking to the window as the other tool pages do.
- The host: read and write `ribbon.json`, a default copy shipped in `defaults/`.
- The settings commandBar and ribbonGroupNames in Settings, with the other settings of the window's bars.

### 3.6 Alternatives

- **One row of grouped buttons without tabs**: compact, but room for only a few groups; with tabs every group fits
  and a tab is one click.
- **A fixed toolbar**: simpler, but every user wants other buttons; the menus and keys already serve the fixed set.
- **Buttons in the top bar**: it has no room, and it holds the window's state (mode, theme, zoom), not actions.

### 3.7 Tests

- Unit (C#): `ribbon.json` read and written, a missing file giving the shipped one, an unknown action skipped, a
  "stack" without a small button before it.
- Unit (Jint): the columns of a group from its items (large, small, stacked, dividers).
- In the test copy by script: each shipped button runs its action; toggles show their state; a button greyed out
  where its action is not available; the tabs switch and keep their choice; two stacked small buttons as high as a
  large one; group names on and off; overflow into ">>" at a narrow window; commandBar `menu`, `ribbon` (the menu
  button and Alt reach every menu) and `both`; Customize adds, moves, resizes, stacks and removes a button, adds a
  tab and a divider, and the ribbon follows; Reset.

## 4. Open questions

None.
