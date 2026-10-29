# Plan: Delete the .bak files LexPen made

Status: executed 2026-10-29 (Backups.cs, web/app.js; unit tests BackupsTests, ExplorerMenuTests; in-app test t33).
The number in the file name is the priority; rename to reorder.

## 1. What this is about

With the setting Backup on save, every save turns the previous version into `name.ext.bak` next to the file
(`TextFile.Write`). They pile up in the project folders (`README.md.bak`, `docs/plans/*.md.bak` in this repository),
show up in `git status`, and LexPen has no way to clean them up: the folder pane even hides them (unless Show backup
files is on), so they are easy to forget. Removing them means Explorer or a shell.

## 2. The solution, in brief

The folder pane's right-click menu gets two items. On a folder: `"Delete *.bak files`, which deletes the backups in
that folder and its subfolders after one question naming how many there are. On a file that has a backup next to it: "Delete
name.ext.bak", which deletes that one. The files go to the Recycle Bin, so a mistake can be undone there. The items
only show when there is something to delete. In the folder pane, a file with a backup next to it gets a small dot
beore its name, as a file with highlights does, in the error colour. The dot has the hint 'A backup file exists next to this file'.

## 3. Details

### 3.1 Which files

- A backup is `name.ext.bak` with `name.ext` next to it: what LexPen makes. A `.bak` without its original beside it
  is left alone (it may be another program's). See open question 2.
- Folder: the backups in that folder itself; see open question 1 for its subfolders.
- File: `<its path>.bak`.

### 3.2 The menu

- Folder (also the pane's root row): "Delete *.bak files" after Rename..., shown when the folder has backups.
  Asking the host when the menu opens (a directory listing of `*.bak`, the folder only); not shown for the `..` row
  or a folder that is gone.
- File: "Delete README.md.bak" (the backup's own name), shown when `README.md.bak` exists.
- A `.bak` row itself (with Show backup files on): no item of its own; its original's menu has it.

### 3.3 The mark in the folder pane

- A file whose `name.ext.bak` is in the same folder: a dot after its name, the size and shape of the highlights dot
  (`.mm-has-highlights`, app.css), in the error colour (`--caution`, the colour the message log gives errors), so the
  two tell apart by colour. Both: the highlights dot first, then the backup dot.
- Tooltip: the row's title gets "Has a backup next to it (name.ext.bak)", as the highlights line.
- Found from the folder's listing the pane already reads (`fillDir`, as `.lph` is): no extra host call. Shown whether
  Show backup files is on or off.
- It goes when the backup is deleted (the pane refreshes, 3.4) and comes when a save makes one (the folder watcher
  refreshes the pane, as for any new file).
- The highlights dot is the name's `::after`; the backup dot is a small element of its own after the name, so both fit.

### 3.4 What happens

- Folder: a question first: "Delete the .bak files in docs\plans ()and all subfolders)?" ( from the
  listing just made), Delete here / Delete with subfolders / cancel. A file's backup: no question (one file, in the Recycle Bin).
- The host deletes them to the Recycle Bin (`Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile` with
  `RecycleOption.SendToRecycleBin`, no dialogs of its own).
- A file that cannot be deleted (locked, read-only, gone meanwhile): the others still go; a toast names what was left.
- After: a toast ".bak files deleted (Recycle Bin).", the folder pane refreshed when it shows backups.
- A `.bak` open in a tab: it gets the red bar of a file removed on disk, as when Explorer deletes it.
- A `.bak` without its original beside it is left alone.

### 3.5 Tests

- Unit tests (C#, the host part): the backups of a folder (with and without their original, a `.BAK` in capitals,
  a subfolder's left alone), one file's backup, a locked file reported and the others deleted. The Recycle Bin call
  itself behind a small seam, so the tests delete for real in a temp folder.
- In-app (debug build, test data folder): the items shown only when there are backups, the file item's name, the
  question and its count, the folder pane refreshed; the dot on a file with a backup (in `--caution`), not on one
  without, both dots on a file with highlights and a backup, the dot gone after deleting the backup, the dot after a
  save with Backup on save.

## 4. Windows explorer
- The Windows Explorer (the LexPen entries there, as View / Edit in LexPen) gains a 'Delete all .bak files' for folders and 'Delete .bak file' for a file that has a .bak file next to it.
  No question asked, the file(s) are moved to the recycle bin, just like the actions within LexPen.

## 5. Open questions
None.

## 6. Resolved during execution

| Topic | As built |
|---|---|
| Your answers | Taken from sections 2, 3.4 and 4 as you wrote them; the older lines in 3.1 and 3.2 (open questions, "the folder only") are superseded by them. |
| The folder item | Shown when the folder or a folder below it has a backup (`hasBackups`, which stops at the first one found); the question is a task dialog: Delete here, Delete with subfolders, Cancel. No count in it: the scan for the count would run before every question. |
| The dot | A span before the name (`.mm-backup-dot`, `--caution`), its own hint "A backup file exists next to this file"; the row's tooltip stays. Not on a row of a deleted file. |
| Deleting | `SHFileOperation` with undo (the Recycle Bin), no confirmation, no error dialog, per file, so a locked one is reported and the others go. Hidden and system folders (`.git`) are not searched. |
| Explorer | A setting `explorerBackups` (Options > Settings, Windows Explorer). The entries are fixed registry entries: "Delete .bak file" shows on every file and does nothing on one without a backup (Explorer cannot ask whether a file has one); "Delete all .bak files" includes the subfolders ("all"). `--delete-backups <path>` runs without a window. |
| Copy file name | The folder pane's menu: Copy file name, on a folder Copy folder name; a drive as it is. |
| Tests | Unit: BackupsTests (with and without the original, `.BAK`, subfolders, a file's own, a locked file, one gone), ExplorerMenuTests (the entries, in a submenu, removed); 317 pass. In-app t33, every check passes: the dots (before the name, the colour, the hint, both dots, none for an orphan), the menu items and their names, Copy file name, a file's backup, a folder here / with subfolders / Cancel (the question stubbed: a task dialog is native), `--delete-backups` on a file, a folder and a file without one, the dot after a save with Backup on save. Not tested in the app: the task dialog itself, the real Explorer menu. The test's own backups went to the Recycle Bin. |
