# Plan: A ribbon button or corner opens a list under it, or its window

Status: draft 2026-11-09; executed (2026-11-09); see As built.

## 1. What this is about

Some actions show a pane or a window: Manage clipboards..., Manage bookmarks..., Highlights window, Manage macros....
On the ribbon, often a group's corner, that is a lot for a quick choice: picking another clipboard or going to a
bookmark opens a whole pane. The Clipboard group's corner now opens a list of the clipboards under it instead, but
that is built in: the ribbon knows one action (Clipboards, `clipboardList`) that opens its list there
(`RB_LIST_ACTIONS` in ribbon.js), and the shipped corner was changed to that action. Nothing can be chosen per
button or corner, and Bookmarks or Highlights cannot do the same.

## 2. The solution, in brief

An action that shows a pane or window can also have a short form: a list of what it shows, to choose from. A ribbon
button or corner with such an action gets a choice, "Opens: Window or pane" or "Opens: Drop-down", kept in
ribbon.json; with Drop-down a click opens the list under it, ending with the action itself (Manage bookmarks...) to
get the full window. The choice is in the button's right-click and in Customize. The built-in Clipboards list goes;
the shipped Clipboard, Bookmarks and Highlights groups have their window in the left corner and its drop-down in the
right one.

## 3. Details

### 3.1 The short forms

An action gets an optional `dropDown()` (actions.js and the files of the actions), giving the items of its list (as a
menu's items: label, key text at the right, the action and parameters to run). The list as opened ends with a
divider and the action itself, so the window or pane is one click away. The first ones:

- **Manage clipboards...** (`clipboards.pane`): the Windows clipboard and clipboards 1 to 9 with the start of their
  text, the active one checked; a click makes one active (as the bottom bar's list, `clipboardItems`).
- **Manage bookmarks...** (`bookmarks.pane`): the document's bookmarks with their number and line and the start of the
  line; a click goes there (as Toggle bookmark's list "Go to bookmark", `bookmarkItems('go')`). None: a dimmed
  "(no bookmarks)".
- **Highlights window** (`highlight.list`): the document's highlights with their line and the start of their note or
  text; a click goes there ([not yet checked]: whether a list of them exists to reuse, as the Highlights window has
  one). None: "(no highlights)".
- **Manage macros...** (`macro.manage`): the stored macros; a click plays one (as Tools > Macros' list,
  `macroMenuItems`).

Others can follow by giving their action a `dropDown()`; the ribbon needs no change for them.

### 3.2 On the ribbon

- **The choice**: an item or a corner holds `"open": "dropDown"` in ribbon.json; without it the action runs as now
  (its window or pane). A corner, now an action or [action, params], may also be `{ "action": ..., "params": ...,
  "open": "dropDown" }`. Read and written by RibbonFile.cs as the other item fields; an `open` on an action without a
  short form is ignored (the action runs).
- **A click** with Drop-down: its list opens under the button or corner, as a split button's arrow opens its list;
  pressed again while it shows, it only closes (as the arrows, `rbOpener`). A button with Drop-down shows the arrow
  of a button that only opens a list (one part: the whole button opens it), so it is seen before the click. A corner
  with Drop-down shows a small arrow down instead of the launcher mark.
- **The right-click** on a button or corner in change mode (and Customize's buttons for the line chosen): "Opens:
  Window or pane / Drop-down", shown only for an action with a short form.
- **Key tips**: a tip on a Drop-down button or corner opens its list, its items with their own letters (as menus).
- **Tooltip**: "Manage bookmarks... (drop-down)" or similar, so the button says what it does.

### 3.3 What goes

- `RB_LIST_ACTIONS` and the special case of Clipboards (`clipboardList`) on the ribbon; the action `clipboardList`
  itself stays (the bottom bar's list, Ctrl+Shift+C).
- The shipped ribbon: Home > Clipboard, Home > Bookmarks and Review > Highlights each have their action in both
  corners: the left one its window (Manage clipboards..., Manage bookmarks..., Highlights window), the right one the
  same action with Drop-down. Tools > Macros' corner stays Manage macros... as its window: its list is Tools > Macros
  already, and the corner is where the full window is wanted.
- **The bottom bar's clipboard indicator** (Clip: Win) opens the same list as Manage clipboards... as a drop-down,
  with Manage clipboards... at its end.
- A ribbon.json of your own with `clipboardList` as a corner keeps working (the action runs: its list at the bottom
  bar); change it to Manage clipboards... with Drop-down by the right-click.

### 3.4 Tests

- Unit (C#, `RibbonTests`): `open` read and written back for an item and for a corner in its object form; a corner as
  a plain action or [action, params] still read; the shipped Clipboard, Bookmarks and Highlights groups have
  the window in the left corner and the drop-down in the right one.
- Unit (Jint, if the menu items are built in a model function): the list ends with a divider and the action.
- In the test copy: each short form opened from its corner (its items, a click doing its thing: a clipboard active,
  a bookmark gone to, a highlight gone to, a macro played); the last item opening the window or pane (it flashes);
  a second click on the corner closing the list; the right-click's Opens choice switching a button and a corner both
  ways and kept after a restart; the choice not offered for an action without a short form; a key tip opening the
  list.

### 3.5 Alternatives

- **A list per action, always** (as the built-in Clipboards now): no choice; some want the window from the ribbon.
- **Separate list actions** (Clipboards, Bookmarks list, Highlights list as actions of their own): F1 and the keys
  get more actions for the same thing, and every ribbon place has to know which to pick; one action with two ways
  to open keeps F1 as it is.

## 4. Open questions

None.

## 5. As built

Built on branch `ribbon-drop-down` (2026-11-09): `dropDown()` on `clipboards.pane` (actions.js), `bookmarks.pane`
(bookmarkspane.js, with `bookmarkGoItems` in bookmarks.js), `highlight.list` (actions.js, with `highlightItems` in
highlights.js) and `macro.manage` (macros.js); the corner forms in ribbonmodel.js (`ribbonCorner`, `ribbonCornerOf`,
`ribbonItemOf`); in ribbon.js the drop-down for buttons and corners, the right-click's Opens, Customize's Drop-down
button and its "(drop-down)" in the list; `RB_LIST_ACTIONS` removed; the shipped corners. RibbonFile.cs needed no
change: it keeps an item's fields and a group's corners as they are.

Differs from the plan:

- **Both corners**: the shipped Clipboard, Bookmarks and Highlights groups have the window in the left corner and the
  drop-down in the right one (asked during the build), not only the drop-down.
- **A drop-down corner** shows a small arrow down instead of the launcher mark, so the two corners of a group tell
  apart.
- **The open questions** were taken as suggested: the arrow on a Drop-down button, Manage macros... as its window on
  the shipped Macros corner, one list for the bottom bar's indicator and the drop-down. The active clipboard is
  checked in that list (and in Edit > Clipboards).
- **A highlight in the list**: its line and the start of its text, the start of its note at the right; a PDF's
  highlights are not listed (its Highlights window has them).
- **An empty list**: a dimmed "(no bookmarks)", "(no highlights)" or "(no macros yet)" above the action.

Tested: unit (C#, `RibbonTests`): `open` written and read back on a button and on a corner in its object form, the
plain corner forms still read; the shipped Clipboard, Bookmarks and Highlights corners (window left, drop-down right),
Macros as before. Unit (Jint): a corner in each form, a button into a corner and back. All tests pass. In the test
copy by script: the Clipboard corner's list under it (a clipboard chosen: active), the Bookmarks corner with none and
with two (one chosen: the cursor there), the Highlights corner with none and with one (chosen: selected); the list's
last item opening the window (it flashes); a second click closing the list (also with real mouse clicks); the
right-click's Opens on a corner and on a button both ways, not offered on the Occurrences corner; a Drop-down button
with its arrow and its list; a key tip opening a corner's list; the choices kept in ribbon.json and after a restart;
the two corners' marks in a screenshot.
