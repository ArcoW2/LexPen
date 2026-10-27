# Plan: Compare with a git version

Status: draft 2026-10-22; done 2026-10-27, tried in the app. Split off from plan 06 (compare files and folders),
which it builds on.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

The gutter's git markers show which lines changed since the last commit, and a click shows the old text of one
change. There is no way to see the whole file next to its committed version, or next to the version of another
commit or branch.

## 2. The solution, in brief

A tab's right-click gets Compare with git: the last commit (HEAD), or a commit or branch picked from a list. The
committed version opens read-only in the other pane and the two are compared as plan 06 compares two files, with
the same bar, line strip, options and navigation. A folder is compared with its committed state the same way, in
the same plan: the folder pane shows which files changed, were added or deleted, as plan 06's folder compare does.

## 3. Details

- The committed text comes from the host, as the git markers' text does now (`gitHead`), widened to any commit or
  branch (`git show <rev>:<path>`).
- The picker: the file's own history (`git log` for the path: date, author, message), and the branches.
- The git side is read-only, named after its version ("report.sql @ HEAD", "@ a1b2c3d").
- Folders, built together with the files: a folder's right-click in the folder pane, Compare with git (HEAD, or a
  commit or branch from the list). The changed, added and deleted files come from git itself (`git diff --name-status
  <rev> -- <folder>`, plus the files git does not track yet), shown in the folder pane as plan 06's folder compare
  shows them (`~`, `>`, `<`), read-only. A double click on a file there opens its file compare against that version.
- Needs plan 06 built first.

### 3.1 Tests

In-app: compare with HEAD after an edit; with an older commit from the list; with another branch; a file not in
git (the item disabled). A folder against HEAD: a changed, an added, a deleted and an untracked file marked; a double
click opens the file compare; a folder not in git (the item disabled).

## 4. Answers (2026-10-27) and as built

- A right-click on a file (a tab, or the folder pane) offers Compare with Git when the file is changed: differs from
  the last commit on disk, or (a tab) has unsaved edits. It compares with HEAD. Compare with Git version... is there
  whenever the file is in git. Both are hidden, not disabled, outside git. The same two for a folder (changed:
  something in it differs or is new).
- The picker is a menu: HEAD, Branch (the local and remote branches), History of this file / folder (the last 50
  commits that changed it: id, date, message; the author on the right).
- A folder against git lists only what differs (git does not list the equal files): no Check all contents, no All /
  Differences only. A deleted file (<) opens as that version alone, read-only.
- Host: `GitShow`, `GitVersions`, `GitFolderDiff`, `GitState` in MainForm.cs; the parsing in GitCompare.cs (tests:
  GitCompareTests). Page: compare.js (a { git } side, the folder compare's git mode, the menus).
- A read-only side that is not a file (a git version, a saved text) is named as such in the title and the tab's
  tooltip; it said "draft, not saved as a file yet" before.
