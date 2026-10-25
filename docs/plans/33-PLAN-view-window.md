# Plan: View in LexPen: a project for viewing, and Explorer items

Status: draft 2026-10-25, reworked 2026-10-25 on your direction: no separate kind of window; viewing uses a normal
project, "View" by default, that you change as you like and can choose and reset in the settings. Not started;
questions open. Needs plan 31 (settings layers: the layout per window) first. Split off from the docking plan (24): "The explorer-items belong in a separate plan, including the
fixed view project".
The number in the file name is the priority; rename to reorder.

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

The window's layout of plan 31 (`31-PLAN-settings-layers.md`, 3.2), set to:

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

## 4. Open questions

1. A file without a preview (code, plain text): the editor read-only, or the editor as normal (editable)?
   Proposal: read-only, as it is viewing; Edit in LexPen to change it.
2. Reset to view layout: keep the project's tabs, or close them too? Proposal: keep them; closing tabs is one
   step anyway.
3. Edit in LexPen when the window last used is the view project's: skip it for the project before (as 3.4), or
   just use it (it is a normal project after all)? Proposal: skip it.
4. Deleting the view project: allowed (the setting falls back to "View", made anew on the next view), or refused
   while it is the one chosen? Proposal: allowed.
5. A view project window on another virtual desktop only: open one more window of it on this desktop, or bring
   that one over? Proposal: this desktop only, as `newWindowProject` uses "this desktop"; none here opens the
   project here.
6. Windows 11's short right-click menu: is "Show more options" good enough (as for the compare items now), or do
   you want the items in the short menu? That needs a signed package and a shell extension: a plan of its own.
   Proposal: Show more options for now.
7. The default for `explorerItems`: Compare only (as now, so nothing changes until you choose), placed as a group?
   Proposal: yes.
