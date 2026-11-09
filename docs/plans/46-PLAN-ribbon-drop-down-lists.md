# Plan: A ribbon button or corner opens a list under it, or its window

Status: draft 2026-11-09; not started. The number in the file name is the priority; rename to reorder.

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
the shipped Clipboard corner is Manage clipboards... with Drop-down.

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
  pressed again while it shows, it only closes (as the arrows, `rbOpener`). A large or small button with Drop-down
  shows the arrow of a split button? Open question 1.
- **The right-click** on a button or corner in change mode (and Customize's buttons for the line chosen): "Opens:
  Window or pane / Drop-down", shown only for an action with a short form.
- **Key tips**: a tip on a Drop-down button or corner opens its list, its items with their own letters (as menus).
- **Tooltip**: "Manage bookmarks... (drop-down)" or similar, so the button says what it does.

### 3.3 What goes

- `RB_LIST_ACTIONS` and the special case of Clipboards (`clipboardList`) on the ribbon; the action `clipboardList`
  itself stays (the bottom bar's list, Ctrl+Shift+C).
- The shipped ribbon: Home > Clipboard's corner Manage clipboards... with Drop-down; Home > Bookmarks' corner Manage
  bookmarks... with Drop-down; Review > Highlights' corner Highlights window with Drop-down; Tools > Macros' corner
  Manage macros... as it is (open question 2).
- A ribbon.json of your own with `clipboardList` as a corner keeps working (the action runs: its list at the bottom
  bar); change it to Manage clipboards... with Drop-down by the right-click.

### 3.4 Tests

- Unit (C#, `RibbonTests`): `open` read and written back for an item and for a corner in its object form; a corner as
  a plain action or [action, params] still read; the shipped Clipboard, Bookmarks and Highlights corners have
  Drop-down.
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

1. **The look of a Drop-down button**: a button (not a corner) with Drop-down: show the arrow of a split button (one
   part, the whole button opening the list, as Line numbers does now: a button that is only a list), or no arrow?
   Suggestion: the arrow, as other buttons that only open a list, so it is seen before the click. Corners have no
   room for one and stay as they are.
2. **Manage macros... as a drop-down by default** on the shipped Tools > Macros corner, or the window as now?
   Suggestion: the window as now; its list is Tools > Macros already, and the corner is where the full window is
   wanted.
3. **The bottom bar's clipboard indicator** (Clip: Win) opens a list of the clipboards now: the same items as the
   short form of Manage clipboards... (with Manage clipboards... at its end), so both lists are one? Suggestion: yes.
