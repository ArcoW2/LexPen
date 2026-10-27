# Plan: Rename a file or folder, the open tabs following

Status: draft 2026-10-27, not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

LexPen cannot rename a file or a folder. Renaming one in Explorer while it is open makes LexPen mark it as removed
on disk, and the tab keeps the old name; its bookmarks, highlights and ruler lines stay with
the old path. Only a draft can be named (Rename draft...).

## 2. The solution, in brief

A **Rename...** item in the tab menu (a file) and in the folder pane's right-click menu (a file or a folder) asks for
the new name and renames on disk. Every tab of that file, or of any file in that folder, in every window, then
points to the new path: the same document, so unsaved edits, undo history, cursor and scroll stay as they are. What
LexPen keeps by path (bookmarks, highlights, ruler lines, recent and favourite lists, the folder pane, the session)
moves along, as Save as already does for one file.

## 3. Details

### 3.1 Where

- **Tab menu**: Rename... for a file (a draft keeps Rename draft...). Hidden for a tab in a compare's saved text.
- **Folder pane**: Rename... on a file or a folder row; F2 on the selected row, as in Explorer.
- An action (`file.rename`, the active tab's file) in F1 and keys.json; no default key outside the folder pane.

### 3.2 The name box

- The box Rename draft uses, with the current name filled in and the part before the extension selected (as
  Explorer), so typing replaces the name and keeps the extension.
- Refused, with a message, before anything changes: an empty name, a character Windows does not allow (`\ / : * ?
  " < > |`), a name already used in that folder (another file or folder; a change of case only is allowed), a
  name with a folder in it (moving is not renaming).
- Renamed by the host (`File.Move` / `Directory.Move` in the same folder). It can fail: the file is in use by
  another program, read-only folder, no rights. Then a message with the reason, and nothing changes in LexPen.

### 3.3 The tabs follow

- The document keeps its object: only its path changes. Unsaved edits stay unsaved (the file on disk is renamed as
  saved; the edits are saved to the new name), the undo history, cursor, scroll, folds and marks stay.
- A file open in several tabs (both panes, split): one document, so every tab follows at once.
- **Other windows**: the host tells every window "renamed from, to"; a window with that file (or a file in that
  folder) open moves its document to the new path. The lock (which window may edit) moves with it.
- **A folder**: every open document whose path is in that folder (at any depth) gets the new path, the rest of its
  path kept.
- The tab's name, the window title, the bottom bar and the outline follow.
- **The language**: a new extension gives the language of that extension, as Save as does, unless the language was
  chosen by hand for this file.
- The file watcher: the rename is LexPen's own, so the file is not marked as removed; watching moves to the new path.

### 3.4 What moves along

As Save as to another name does now (`saveDoc`), but without writing the text:
- bookmarks (`bookmarksSet`), highlights (`HighlightStore.Move`, which exists and moves the `.lph` beside the file
  too), ruler lines (`moveRulerLines`);
- the recent files and folders, and favourites: the entry renamed in place, not a new one;
- the session (`state.json`): the tabs are saved with their new paths at the next session write;
- the folder pane: the row renamed in place and kept selected; a renamed folder that is the folder pane's root, or
  above it, gives the root its new path;
- projects with a renamed folder as root: the root follows;
- a `.bak` beside the file stays as it is (it is the old file's backup, under the old name).

### 3.5 Tests

In the app, on copies in a scratch folder: rename a file open in one tab, in two tabs (both panes), with unsaved
edits (still unsaved, saved to the new name, undo still works), with bookmarks and highlights (they follow, also
after a restart), to another extension (the language follows); rename a folder with open files at two depths;
the same file open in a second window (it follows); refused names (empty, a bad character, an existing name, only
the case changed is allowed); a file locked by another program (a message, nothing changed); not marked as removed.
Unit tests (host): the rename itself and its refusals; the stores moving their entries.

## 4. Open questions

1. F2 in the folder pane only, or also F2 in the editor for the active tab's file (F2 is free in LexPen now)?
2. A file of the folder pane that is not open: renamed on disk only (nothing else to follow), agreed?
