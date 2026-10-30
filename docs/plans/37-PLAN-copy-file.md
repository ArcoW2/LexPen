# Plan 37: Copy file, one submenu

## 1. The enhancement

The folder pane's right-click menu has three loose items: Copy file name, Copy path, Copy relative path. They
are to make way for one item, **Copy file**, with a submenu of six ways to copy a file's name. The same submenu
also goes on the File menu, where it acts on the active document.

## 2. The solution, in brief

One action, `file.copy`, takes the part to copy and an optional path; without a path it takes the active
document. The File menu gets a Copy file submenu of six items on that action, built by the menu bar's
own submenu support. In the folder pane's menu the three items become one Copy file item that opens the same six
items as a submenu next to it, for the row's path. The existing relativePath and copyText do the work.

## 3. Details

### 3.1 The six items

| Item | Copies | Example (root `D:\Work`, file `D:\Work\docs\a.md`) |
|---|---|---|
| Filename | the name without its extension | `a` |
| Filename.ext | the name with its extension | `a.md` |
| Path | the folder, without the file | `D:\Work\docs` |
| Path and filename.ext | the full name | `D:\Work\docs\a.md` |
| Relative path | the folder, relative to the folder pane's root | `docs` |
| Relative path and filename.ext | the full name, relative to the root | `docs\a.md` |

- A name with more than one dot (`a.test.md`): Filename drops only the last extension (`a.test`). A name
  without an extension (`Makefile`): Filename and Filename.ext copy the same text.
- Relative to the root, as relativePath does now. A file outside the root: the relative items copy the full
  path, as Copy relative path does now.
- The toast says what was copied, as now ("Copied D:\Work\docs\a.md").

### 3.2 The action

- `file.copy` in actions.js, with parameter `part`: `name`, `nameExt`, `dir`, `full`, `relDir`, `relFull`.
- The parameters are what the menus pass. A key in keys.json can be put on each part, and a macro records them like
  any other action.
- No path given: the active document's path. A draft that has never been saved has no path: the File menu's
  items are greyed out, and a key does nothing.

### 3.3 The File menu

- After Save as... / Revert to saved, a Copy file submenu (`{ label: 'Cop&y file', sub: [...] }` in menus.js
  MENUS) with the six items of 3.1 on `file.copy`.

### 3.4 The folder pane's menu

- index.html `.mm-tree-menu`: treeCopyName, copyPath and copyRelativePath make way for one item, Copy file.
- The tree menu is plain HTML, not a menus.js menu. Its Copy file item opens the six items with menus.js
  openPopupMenu next to the item (hover or click, Right from the keyboard), each running `file.copy` with the row's
  path (contextPath).
- The commands treeCopyName, copyPath and copyRelativePath, and the text change at app.js
  (`'Copy file name' : 'Copy folder name'`), go.

### 3.5 Tests

- A unit-level check in the page (an in-app script) of the six parts for: a file in a subfolder of the root, a
  file directly in the root, a file outside the root, a name with two dots, a name without an extension, a drive
  root as the folder pane's root (`D:\`).
- In-app: the File menu's submenu on the active document, and its items greyed out on a draft. The folder pane's
  Copy file submenu opens beside the item and copies the row's path.
- features.md: the entry on the folder pane's menu, and the File menu's new submenu.

## 4. Open questions

1. A folder row in the folder pane: it has the same menu, and now shows Copy folder name / Copy path / Copy
   relative path. Keep those three as they are for a folder, or a Copy folder submenu (Name, Path, Relative path)?
2. Path for a file directly in a drive root (`D:\a.md`): `D:\` (with its backslash) or `D:`?
3. Relative path for a file directly in the root is empty. Copy an empty text, `.`, or `.\`?
4. The tab's right-click menu has Copy full name / Copy file name to clipboard. Replace those with the same Copy
   file submenu too?
