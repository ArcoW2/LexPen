# Plan: A ribbon with the actions each user wants at hand

Status: draft 2026-11-07; not started. From plan 25 (executed/PLAN-menu-structure.md 3.7), where it was proposed.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Everything LexPen does is in the menus and F1, and the actions used most have keys. But a key has to be known and a
menu item has to be found: there is no row of buttons for the actions a user reaches for all the time (save, undo,
find, the panels, record a macro). Every user has other favourites, so a fixed toolbar would suit nobody: the user
must be able to choose what is on it.

## 2. The solution, in brief

An optional ribbon under the menu bar: buttons with icons, in named groups, each button running an action as its
menu item does, its tooltip showing the title and the key. LexPen ships a first set; the user adds, removes and
reorders buttons and groups through Customize (a list of all actions with a search, as F1), and it is kept in a
`ribbon.json` in the data folder as `keys.json` is. It can be shown or hidden, and for a user who wants that it can
replace the menu bar.

## 3. Details

### 3.1 The shipped content

Left to right, in groups:

| Group | Buttons |
|---|---|
| File | New, Open, Save |
| History | Undo, Redo |
| Clipboard | Cut, Copy, Paste, the active clipboard (a number badge; a click opens Clipboards) |
| Find | Find, Replace, Search in files |
| Go | Back, Forward (position), Go to line, Toggle bookmark, Next bookmark |
| Document | Editor / Editor and preview / Preview (one three-way button), Wrap |
| Panels | Folder, Search, Outline, Characters, Highlights, Bookmarks (each a toggle with its check state) |
| Tools | Record macro, Play macro, Compare, Sort |
| Right end | Day / night, Zoom, Settings |

### 3.2 Behaviour

- **A button is an action**: it runs the action (actions.js) with its value, like a menu item; its tooltip is the
  action's title and key. A toggle shows pressed when on (Wrap, Column mode, the panels); a button whose action is
  not available now is greyed out (the action's `enabled`).
- **Groups**: a name under or above each group (3.5 question 1), a divider between groups.
- **Overflow**: buttons that do not fit go into a ">>" menu at the right end, in their order; a group that does not
  fit at all goes there as a submenu.
- **Shown or hidden**: View > Ribbon, and its own right-click (Customize..., Reset, Hide). Off by default.
- **Instead of the menu bar**: a setting; the menus then stay reachable with Alt and from a menu button at the
  ribbon's left end, so nothing becomes unreachable.
- **The top bar stays** (Editor / Preview, Day / night, the zoom) and the format bar stays as the document's own bar
  above the text: the ribbon is the window's.

### 3.3 Customize

- A window (as F1): at the left all actions with a search, grouped as the menus; at the right the ribbon's groups
  and buttons. Add, remove, move up / down (and drag), new group, rename group, a divider.
- An action with values (Preview place, a bookmark number) is added with its value, as keys.json writes
  `["preview.left"]`.
- Reset: back to the shipped content.
- `ribbon.json` in the data folder: the groups, each with its name and its buttons by action name (and value). An
  action that no longer exists is skipped, not an error.

### 3.4 Icons

- One set, drawn as inline SVG in the app's own style (stroke icons, `currentColor`, so every theme colours them),
  as the format bar's icons are.
- An action without an icon shows its short title as text.
- Which actions get an icon in the first build: those of 3.1; the others show text until they get one.

### 3.5 How

- A bar element under the menu bar in index.html, built from `ribbon.json` (read through the host, as keys.json).
- The state (pressed, greyed out) is refreshed where the menus refresh theirs: on the focus moving, a tab changing,
  a setting changing.
- Customize: a WebView page of its own (as F1's commands page), talking to the window as the other tool pages do.
- The host: read and write `ribbon.json`, a default copy shipped in `defaults/`.

### 3.6 Alternatives

- **A fixed toolbar**: simpler, but every user wants other buttons; the menus and keys already serve the fixed
  set.
- **An Office ribbon with tabs** (Home, Insert, View, ...): more room, but a second menu structure beside the menus
  of plan 25, and a click more for every button on another tab. See question 2.
- **Buttons in the top bar**: it has no room, and it holds the window's state (mode, theme, zoom), not actions.

### 3.7 Tests

- Unit (C#): `ribbon.json` read and written, a missing file giving the shipped one, an unknown action skipped.
- In the test copy by script: each shipped button runs its action; toggles show their state; a button greyed out
  where its action is not available; overflow into ">>" at a narrow window; Customize adds, moves and removes a
  button and the ribbon follows; Reset.

## 4. Open questions

1. Group names: shown on the ribbon (under each group, as Office does: clearer, a line taller), or only as tooltips
   and dividers (one compact row)?
2. "A ribbon": one row of grouped buttons as above, or an Office-style ribbon with tabs, each tab a set of groups?
3. Button size: small icons only (one compact row), large icons with a label under them, or a choice per button as
   in Office?
4. Replacing the menu bar: wanted in the first build, or later?
