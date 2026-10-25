# Plan: View in LexPen: a project for viewing, and Explorer items

Status: executed 2026-10-25 on the branch `plan33-view-project`, after plan 31 (draft and rework 2026-10-25: no
separate kind of window; viewing uses a normal project, "View" by default). The open questions were not answered
before the run: their proposals were taken, see section 4, with the decisions of the run. Split off from the docking
plan (24): "The explorer-items belong in a separate plan, including the fixed view project".

## 1. What this is about

To only read a file (from Explorer, say) LexPen opens it in whatever project you last worked in, with that
project's side panes, split and tabs, and in the editor. And Explorer has no LexPen items on a file's or folder's
right-click menu for opening it, only the compare items.

## 2. The solution, in brief

One project is the view project: "View" by default, a setting chooses another. "View in LexPen" in Explorer always
opens the file in that project (a folder: in its Folder pane). It is a normal project: whatever you change there
(its theme set, a Folder pane opened, a split) is kept for the next view. A settings button resets it to the view
layout: one window, a single pane, no side panes, Preview only. "Edit in LexPen" opens a file as opening one does
now. Settings choose which LexPen items Explorer shows (Compare, View, Edit) and whether they stand together
between two lines or in a "LexPen" submenu.

## 3. Details

### 3.1 The view project

- A setting `viewProject`: the id of the project used for viewing (the id, not the name: names can be empty and
  can change). Missing, or naming a project that is gone: the project named "View"; when there is none, LexPen
  makes it, with the view layout (3.2), on the first view.
- A normal project in every other way: it can be renamed, its windows keep their session (tabs, panes, place,
  desktop) as any project's do, and with plan 32 it can have a theme set of its own (a different colour for
  viewing).
- Settings, in a group "Viewing":
  - "Project for viewing": a list of the projects, "View" first. Choosing one only names it; its layout is not
    touched.
  - "Reset to view layout": the view layout (3.2) applied to the chosen project, after a question that names it.
- Manage projects marks the view project ("(for viewing)" after its name). Deleting it is allowed; the setting
  then falls back as above (question 4).

### 3.2 The view layout

What "Reset to view layout" sets, and what a new "View" project starts with:

The window's layout of plan 31 (`executed/PLAN-settings-layers.md`, 3.2), set to:

- One window: the project's other windows are closed (their sessions dropped).
- A single editor pane: no split, no compare.
- No side panes: the sidebar (Folder, Search) and the Outline off.
- No format bar, no ruler.
- Every tab in Preview mode; the editor not shown.
- The tabs themselves are kept (question 2).
- Its theme set (plan 32) is not touched: that is colour, not layout. Global settings are not touched either.
- The rest of plan 31's layout (wrap, tab bar, line numbers, gutter columns, scroll bar marks, the folder
  filter and sort) is taken from the default layout (plan 31, 3.5): the view layout is the default with the
  values above over it.

The layout is only a starting point: open the Folder pane or split the window afterwards and that is what the next
view gets. Nothing is locked.

### 3.3 Viewing a file or a folder

- A file: a window of the view project on this desktop (open, not minimised) gets it as a tab, in Preview, and
  comes to the front; a file already a tab there: that tab comes to the front. No such window: the view project is
  opened (as opening a project from Manage projects does now) and the file added to it as a tab.
- A file that has no preview (code, plain text): shown in the editor, read-only (question 1).
- A folder: as a file, but instead of a tab the Folder pane opens on that folder as its root (as "Set as root of
  the folder pane"), with its first level open. The Folder pane stays open afterwards, as any change does (3.2).
- The command line: `--view <path>` (a file or a folder). The Explorer item calls it; the single-instance pipe
  passes it to the running LexPen, as the other switches.

### 3.4 Edit in LexPen

As opening a file is now (a double-click on a registered `.md`, Open with): a full window of the project of the
last window used. One change: when that last window is the view project's, the project before it is used, so
"Edit" never lands in the viewing project (question 3). The command line: `--edit <file>`.

### 3.5 Explorer

- "View in LexPen" on a file's and a folder's right-click menu; "Edit in LexPen" on a file's. Beside the compare
  items of `ExplorerMenu.cs` (Select left side to compare, Compare to <name>), with LexPen's icon.
- Settings choose which are there and where:
  - `explorerItems`: any of Compare, View, Edit (Compare is the two compare items together). It takes over
    `explorerCompare`: a settings file with that on reads as Compare.
  - `explorerPlace`: "group" (the items next to each other, a line above and below) or "submenu" (one item
    "LexPen" that opens a submenu with them).
- How, still per user in HKCU\Software\Classes, no admin:
  - Files under `*\shell`, folders under `Directory\shell`.
  - Group: each item a verb as now; the first gets the registry value `SeparatorBefore`, the last
    `SeparatorAfter`. Explorer orders the verbs itself, so whether nothing else lands between them is to be tried.
  - Submenu: one verb "LexPen" with `ExtendedSubCommandsKey`, pointing to a key of LexPen's own whose `shell`
    holds the items. Compare to <name> is rewritten there when the left side changes, as now.
  - Both are classic menu entries. On Windows 11 these show under "Show more options" (Shift+F10 or Shift+right
    click), as the compare items do now. In the new short menu only an app with a package identity (a signed
    MSIX or sparse package with an IExplorerCommand handler) can appear; that is not part of this plan
    (question 6).

### 3.6 Host changes

- SettingsFile / actions.js: `viewProject`, `explorerItems`, `explorerPlace`; the "Viewing" group with the project
  list and the reset button (an op, as the settings window's other buttons).
- ProjectStore: find the view project (by id, else by the name "View"), make it; apply the view layout to a
  project's window session (the `layout` of plan 31 and the tab modes; pure, so it can be tested).
- AppHost: View (a file or a folder) and Edit as in 3.3 and 3.4; the view project's name and the reset for the
  settings window and Manage projects.
- Program: `--view`, `--edit` parsed and passed over the pipe.
- ExplorerMenu: the items and places of 3.5, written and removed as the settings change.
- The page (app.js): a session with every tab in Preview opens so; a folder to show as root of the Folder pane.

### 3.7 Tests

- The view project: by id; the id gone falls back to "View"; none named "View": made, with the view layout.
- The view layout applied: one window, single pane, no side panes, every tab Preview, the tabs kept, the theme set
  untouched.
- Edit with the view project as last used: the project before it.
- The command-line switches parsed.
- The registry entries for each choice of `explorerItems` and `explorerPlace` (under LEXPEN_REGISTRY_ROOT, as the
  compare tests), files and folders, and switching from one to the other leaves no entries of the first behind.
- By hand: View in LexPen twice (the second joins the first window as a tab); a folder (Folder pane at that root);
  change the view project (open Folder, another colour), close, view again (kept); Reset to view layout; choose
  another project for viewing; Edit in LexPen while the view window was the last used.

## 4. Decisions of the run

The open questions, with the proposal taken (yours to overrule):

1. A file without a preview: every language pack has a preview (code shows highlighted), so every viewed file opens
   in the preview. Read-only or not is a setting, as you asked during the run: `viewReadOnly` (General > Viewing,
   on by default): a tab View in LexPen opens is read-only, the tab menu's Read-only takes that off; off, it can be
   edited at once. A tab already open stays as it is.
2. Reset to view layout keeps the tabs (and the folder).
3. Opening a file never lands in the project for viewing: Edit in LexPen, and opening without a switch as well (a
   double-click, Open with), skip its windows; `--edit` is the same as no switch.
4. Deleting the project for viewing is allowed: the setting then falls back to the project named "View", made
   anew on the next view.
5. A window of the project for viewing on this desktop, shown (not minimised), gets the file; else its last closed
   window opens here with it; else a new window of the project.
6. Show more options on Windows 11, as for the compare items.
7. `explorerItems` became three settings next to the old one: `explorerCompare` (as it was), `explorerView` and
   `explorerEdit` (both off), and `explorerPlace` ("group"); settings.json holds no lists. Nothing changes until
   you choose.

Further decisions:

- The view layout is the default layout (shipped, with yours over it) with the sidebar, the outline, the format bar
  and the ruler off. A window of the project for viewing without a layout of its own (the first one, or after its
  windows were all dropped) gets it; after that it keeps its own as any project.
- Reset to view layout (General > Viewing, after a question naming the project): an open window of it gets the
  layout at once, one pane (the second pane's tabs into the first), every tab in the preview, no compare; its other
  open windows close and its closed ones are dropped. Not open: its last window's session is changed so (ViewProject
  .ToViewLayout).
- Explorer, next to each other: a line before the first item and after the last of each kind (the registry values
  SeparatorBefore and SeparatorAfter; Explorer orders the items by their key names: compare, edit, view). In a
  submenu: one item LexPen per kind, its items in HKCU\Software\Classes\LexPen.Menu.Files and LexPen.Menu.Folders
  (ExtendedSubCommandsKey). View and Edit carry LexPen's own icon. Every setting change rewrites the entries whole,
  so switching leaves nothing of the other place behind.
- A viewed file replaces the document shown, as a click in the folder pane does (your request after the run),
  also when the window of the project for viewing first has to open: unless that document is a draft, has changes or
  is pinned (then a tab of its own); a file already open there brings its tab to the front.
- Manage projects shows "(for viewing)" after the name of the project for viewing.
- Tested by hand on a scratch data folder through the running debug build and its pipe (`--view`, `--edit`): a view
  making the project "View" in the view layout, a second file joining that window, a folder in its Folder pane, Edit
  going to the other project, a change kept after closing and viewing again, Reset to view layout, another project
  chosen for viewing, the mark in Manage projects, viewing read-only and not. Not tested by hand: the entries in your
  real Explorer menu (the tests write them below a test key), and whether Explorer puts nothing between the grouped
  items.
