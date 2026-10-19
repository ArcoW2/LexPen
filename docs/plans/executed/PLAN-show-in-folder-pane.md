# Plan: show a tab's file in the folder pane

Status: built on branch `feature/next-features`.

## 1. What this is about

From a tab, find its file in the folder pane: open the pane when it is closed, open the folders down to
the file when it lies inside the open folder, and open the file's own folder when it lies elsewhere.

## 2. The solution, in brief

Right-click a tab > "Show in folder pane". The folder pane opens on its Folder tab; for a file inside the
open folder each folder on the way is opened, for a file elsewhere its folder becomes the tree. The
file's row is selected, scrolled into view, gets the keyboard focus (so the arrow keys go on from there)
and lights up for a moment.

## 3. Resolved issues during execution

| # | Issue | Resolution |
|---|---|---|
| 1 | The name | "Show in folder pane", as the pane is called elsewhere (Ctrl+Shift+E: "Go to the folder pane") |
| 2 | The "markdown only" filter hides the file | The filter is switched off, with a short message saying so; otherwise the command could not show what was asked for |
| 3 | Drafts | Have no file: the item is not in their tab menu |
| 4 | A file the tree does not list (skipped folders) | A message: "<name> is not listed in the folder pane" |
| 5 | Verified in the running app | Through the tab's right-click menu: folder pane closed and on the Search tab -> opened on Folder; a file two folders deep inside the open folder: both folders opened, row selected, in view, tree focused, lights up; a file elsewhere: its folder becomes the tree; markdown-only filter with a `.pas` file: switched off, message, row visible; a draft tab: no item. Screenshot |
