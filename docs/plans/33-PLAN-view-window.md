# Plan: View with LexPen: a view window and the project "View"

Status: draft 2026-10-25, not started; questions open. Split off from the docking plan (24) on your request: "The
explorer-items belong in a separate plan, including the fixed view project".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Every LexPen window is the same full editor. To only read a file (from Explorer, say) you get the side pane, the
format bar, two panes and the project's tabs, where one read-only page would do. And Explorer has no LexPen items
on a file's right-click menu for opening it, only the compare items.

## 2. The solution, in brief

Next to the full window comes a view window: one pane, read-only, no Folder or Search, only the Outline if you
want it, a choice kept for all view windows. Explorer gets "View with LexPen", which opens a file in a view window,
and "Edit with LexPen", which opens it in a full window. View windows belong to a fixed project "View": a file
viewed while a view window is visible is added there as a tab, otherwise it opens alone in a new view window; the
last document shown is kept.

## 3. Details (a first outline; to be worked out once the questions are answered)

### 3.1 Two kinds of window

| | Full window | View window |
|---|---|---|
| Editor panes | one or two, split, compare | one |
| Editing | yes | no: read-only, no format bar, no edit commands in the menus |
| Folder, Search | yes | no |
| Outline | yes | yes, on or off; the choice is kept for all view windows |
| Settings, Characters | yes | Settings only (question 4) |
| Project | any | the fixed project "View" |
| Opened by | as now, "Edit with LexPen" | "View with LexPen" |

- The view window shows the file in the mode its language opens in (preview for markdown, the editor read-only
  for code), and can switch between the preview and the read-only editor (question 3).
- One command takes the file from a view window to a full window to edit it: "Edit in LexPen".
- With docking (plan 24), the view window docks only the Outline, with a layout of its own.

### 3.2 The project "View"

- A fixed project, always there, not deleted, renamed or merged (Manage projects shows it, greyed out for those).
- Its windows' tabs are the documents viewed; Ctrl+Tab and the tab bar switch between them. The last document
  shown is kept, so a view window opened from the project comes back on it.
- Viewing a file (View with LexPen, or the command line): a view window visible on this desktop (not minimised)
  gets it as a tab and comes to the front; none visible: a new view window with only that document.
- A file already a tab in that view window: that tab comes to the front, no second copy.

### 3.3 Explorer

- "View with LexPen" and "Edit with LexPen" on a file's right-click menu, beside the compare items of
  `ExplorerMenu.cs`, with LexPen's icon; a setting turns them on or off, as `explorerCompare` does for those.
- View: as 3.2. Edit: as opening a file now (a double-click on a registered `.md`): a full window of the project
  of the last window used.
- A command-line switch for each (`/view <file>`, `/edit <file>`), which the menu items call; the single-instance
  pipe passes it to the running LexPen.

### 3.4 Kept

- View windows: the outline on or off, the window's size and place, the documents and the last one shown.

### 3.5 Tests

- The project "View" cannot be deleted, renamed or merged (ProjectStore).
- The command-line switches parsed.
- A viewed file joins a visible view window, or opens a new one when none is visible.

## 4. Open questions

1. You wrote that both "View with LexPen" and "Edit with LexPen" open the single-pane, view-only window. I took
   it that only View does, and Edit opens a full window to edit in. Is that right, or should Edit open a single
   pane too, but editable (a third kind: a quick edit window)?
2. "Overview is selectable and is remembered": I read Overview as the outline pane. Or do you mean the overview
   ruler (the scroll bar with the marks)?
3. The view window: only the preview, or the preview and the read-only editor to switch between (a file without a
   preview, as code, shows the editor read-only anyway)? Proposal: both, the language's open mode first.
4. Which other commands does a view window keep: find in the file (yes, I assume), print, copy, bookmarks,
   highlights and notes (these write to the store, not to the file), Settings? Proposal: find, copy, print,
   Settings; no bookmarks, highlights or notes.
5. A visible view window gets the next viewed file as a tab. Visible on this desktop only, or on any virtual
   desktop? Proposal: this desktop, as `newWindowProject` uses "this desktop".
6. The tabs of the project "View": kept without limit, or only the last so many (closed ones dropped)? Proposal:
   as a normal project, you close what you no longer want.
