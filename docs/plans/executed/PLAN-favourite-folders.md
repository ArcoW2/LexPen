# Plan: Favourite folders, the base folder as a row, managing favourites

Status: executed 2026-10-22 (web/favourites.js; in-app test t98, 28 checks).
The number in the file name is the priority; rename to reorder.

## 1. What this is about

- Favourites hold files only (File > Favourites, favourites.json). A folder you go to often cannot be kept.
- The folder pane has no row for its base folder (only `..` above its contents), so the base folder itself cannot
  be right-clicked; the right-click menu adds files only.
- A favourite can be added from the File menu only as "the current file", and the list cannot be put in order,
  changed or emptied other than one at a time by the right-click menu.

## 2. The solution, in brief

Next to the favourite files come favourite folders: opening one shows it in the folder pane (selected when it lies
inside the folder open there, else as the pane's base folder). The folder pane gets a row for its base folder, with
its full path, under `..`; a right-click on any folder row, that one included, adds it to (or removes it from) the
favourite folders. The File menu has two submenus, Favourite files and Favourite folders, each with Add current,
Add... (a file or folder picker), Manage... and the list. Manage opens a window with that list: put in order, add,
change (the picker at that path) and delete.

## 3. Details

### 3.1 Favourite folders

- Kept by the host as the files are: favourite-folders.json next to favourites.json (a list of paths, in your
  order), shared by all windows; whether each still exists is asked when the menu opens (a missing one is dimmed;
  a click takes it off the list, as with files).
- Opening one: when it lies inside the folder open in the folder pane, the pane expands to it and selects it;
  else it becomes the pane's base folder. The folder pane is shown.

### 3.2 The base folder row

- The folder pane's rows: `..` (up a folder, as now), then the base folder with its full path, then its contents
  (indented as now). The row is not a folder to open or close; a click on it does nothing, a double click neither.
- Right-click on it: Copy path, Copy relative path (empty: it is the base), Add to / Remove from favourite folders.

### 3.3 The right-click menu of the folder pane

- On a folder (any folder row, the base row included): "Add to favourite folders" / "Remove from favourite
  folders". On a file: "Add to favourite files" / "Remove from favourite files" (now "Add to favourites").
- The tab menu: "Add to favourite files" (the same wording).

### 3.4 The File menu

- File > Favourite files: Add current file (or Remove current file), Add... (the file picker, several files at
  once), Manage..., a line, the files.
- File > Favourite folders: Add current folder (the folder pane's base folder; or Remove), Add... (the folder
  picker), Manage..., a line, the folders.

### 3.5 Manage

- A window in the page (as Go to line), for one list: its title "Favourite files" or "Favourite folders".
- The list, one path per row (the name, the folder it is in dimmed; a missing one marked); a row is selected by a
  click or the arrow keys.
- Buttons: Up and Down (also Ctrl+Up / Ctrl+Down) move the selected one; Add... (the picker; added at the end, a
  path already in the list is not added twice); Change... (the picker, starting at that path; the chosen one takes
  its place); Delete (also the Del key). Close (Esc).
- Every change goes to the host at once (the whole list in its new order), so the File menu and the other windows
  follow.

### 3.6 Tests

- In the app: the base folder row with its full path, under `..`; right-click on it and on a sub folder: Add to
  favourite folders; the File menu's two submenus with their items; opening a favourite folder inside the open
  folder (selected) and outside it (the new base); a missing one; Manage: up, down, add (the picker answered by the
  test), change, delete, the order kept after a restart; the favourite files the same.
- Unit tests: the host's favourite folders list (add once, remove, set in order, kept).

## 4. Open questions

None.

## 5. Resolved during execution

| Topic | As built |
|---|---|
| The host | A second list, favourite-folders.json next to favourites.json; `favouriteAdd` / `favouriteRemove` take a kind (files, the default, or folders); `favouriteSet` stores a whole list in your order (Manage), a path that comes twice (any case) once (`RecentList.Unique`). `recent` answers both lists, each path with whether it still exists. The pickers take a starting place (`pickFile` at a file, one file; `pickFolder` at a folder), for Change. |
| The page | The favourites code left app.js for favourites.js (both kinds, the File menu's submenus, opening a favourite folder, Manage). |
| The base folder row | Under `..`: the full path, bold; a click and Enter do nothing (it is not a folder to open or close), it is not dragged. A long path is cut off at its start (the row is right-to-left, the path held left-to-right by a mark at each end), so the folder's own name stays in view; the tooltip has the whole path. |
| The menu labels | File > Fa&vourite files and Favo&urite folders; in each the favourites first (mostly one is chosen; your remark after the build), a line, then &Add current file / folder (or &Remove), Add a file / folder..., &Manage...; the right-click items say "favourite files" or "favourite folders". |
| Manage | A dialog in the page (as Go to line): the name and its folder per row, a missing one struck through; Up, Down (Ctrl+Up / Ctrl+Down), Add... (several files at once; at the end; one already in the list left out), Change... (also a double click or Enter; changed to one already in the list: the double goes), Delete (Del), Close (Esc). Every change is stored at once. |
| Tests | t98 (in the app): 28 checks pass: the rows of the folder pane; a click on the base row; the right-click item on the base row, a folder and a file; both lists; the File menu's submenus and their items; opening a favourite folder inside the open folder and outside it; a missing one dimmed and taken off; Manage: Ctrl+Down, Up, Del, Add, Change, a double avoided, Esc; adding several files; the order after a restart. The pickers are answered by the test (a Windows dialog cannot be driven). Unit tests: 210 pass (`RecentList.Unique`). Run again with the new rows: t95 6 (its list has the base row now), t60 22 (the setting Show backup files in the Files tab), t22 29, t3 35, t94 16, t66 13, t47 8. |
