# Plan: Compare from the Explorer menu (select left side, compare to)

Status: plan 2026-10-22, not started. Asked for after the compare (executed/PLAN-file-compare.md), as Beyond
Compare does it. The number in the file name is the priority; rename to reorder.

## 1. What this is about

A compare can be started from LexPen (File > Compare files, a tab's or the folder pane's right-click) or the command
line (`--compare A B`), but not from Windows Explorer. Beyond Compare adds two entries to Explorer's right-click
menu: "Select left side to compare" on one file, and then on another file "Compare to <the first file's name>".

## 2. The solution, in brief

A setting in LexPen adds "Select left side to compare" to Explorer's right-click menu for files and folders. Choosing
it remembers that file or folder as the left side and adds a second entry, "Compare to <its name>", which opens the
compare of the two in a new LexPen window. The left side stays until another one is selected, so it can be compared
with several files in turn. LexPen's own folder pane and tabs get the same two entries, sharing the same left side.

## 3. Details

### 3.1 The setting

- `explorerCompare` in Settings > App, a new group "Windows Explorer" (a toggle, off by default): "Compare entries
  in Explorer's right-click menu". Hint: "Explorer's right-click menu gets Select left side to compare, and then
  Compare to <name>; on Windows 11 under Show more options (or Shift+right-click)".
- On: LexPen writes the entries (3.2); off: it removes them, the left side too. Only for the current user
  (`HKCU\Software\Classes`), no administrator needed.
- The entries name the exe that turned the setting on. LexPen started from another place (a debug build, a copy)
  does not change them; the setting's hint says which exe they point at, and turning the setting off and on in
  another exe moves them there.
- `register.ps1 -Remove` removes them as well.

### 3.2 The entries

| Where (`HKCU\Software\Classes\...`) | Label | Runs |
|---|---|---|
| `*\shell\LexPen.CompareLeft`, `Directory\shell\LexPen.CompareLeft` | Select left side to compare | `LexPen.exe --compare-left "%1"` |
| `*\shell\LexPen.CompareTo` (left side a file) or `Directory\shell\LexPen.CompareTo` (a folder) | Compare to old.sql | `LexPen.exe --compare "<left>" "%1"` |

- Both with LexPen's icon, next to each other in the menu.
- With a left side selected, the first entry says "Select as new left side to compare", so another one can be chosen
  at any time; the second entry is then rewritten for the new one.
- A file left side gives Compare to on files only, a folder on folders only (a file against a folder is no compare).
- Compare to on the left side itself: a message "That is the left side itself" instead of an empty compare.
- A left side that no longer exists: Compare to says so and the entry goes.

### 3.3 Selecting the left side

- `--compare-left <path>` is handled by the LexPen process that gets it: it stores the path (as the setting's state,
  `compareLeft` in the data folder's state, shared with a running LexPen) and rewrites the entries, then exits
  without opening a window, whether or not LexPen is running. A running LexPen hears of it (it watches its state)
  and its own menus follow.
- In LexPen: the folder pane's right-click on a file or folder, and a tab's right-click, get "Select as left side to
  compare" and, with a left side, "Compare to <name>" (the left side on the left). Same left side as Explorer's.
- The left side stays until another is selected, the setting is turned off, or it no longer exists.

### 3.4 Windows 11

The compact right-click menu of Windows 11 only takes entries from packaged apps (a signed app package with a shell
extension, IExplorerCommand). Registry entries as these show under "Show more options" (or Shift+right-click), as
for most tools. Getting them into the compact menu is a project of its own (packaging and signing LexPen) and not part
of this plan.

### 3.5 Tests

The registry is never touched by a test: the entries are written below a root that a test sets
(`LEXPEN_REGISTRY_ROOT`, for example `HKCU\Software\LexPenTest\Classes`), removed afterwards.

- Unit: the entries written and removed below a test root; the labels (a file, a folder, a new left side); the exe
  path kept when another exe starts.
- In-app: the setting on writes the entries, off removes them and the left side; `--compare-left` stores the left
  side, rewrites Compare to with its name and opens no window; selecting another left side replaces it;
  `--compare` from the entry opens the compare; the folder pane's and a tab's entries share the left side; the left
  side itself and a vanished one give their messages.

## 4. Open questions

None.
