# Plan: Compare two files

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

LexPen scrolls two panes together (View > Scroll both panes together) and shows git changes in the gutter, but it
cannot compare two files: no highlighted differences, no next / previous difference. UltraEdit has UltraCompare,
Visual Studio has Compare Files.

## 2. The solution, in brief

A command "Compare with..." on a tab (and on two selected files in the folder pane) puts the two files side by side
in the two panes: lines that differ tinted (added, removed, changed, with the changed characters marked), the
panes scroll together by matching lines, F7 / Shift+F7 go to the next / previous difference, and a difference can
be copied to the other side. Edits recompare.

## 3. Details

- The difference: a line diff (Myers, as git) with a character diff inside changed lines; computed in the page
  (a small library or our own), on large files in a worker.
- Display: line backgrounds (the theme's gitAdded / gitDeleted / gitModified, tinted), empty filler lines where one
  side has none, so both sides stay level.
- Navigation: F7 / Shift+F7 (as UE), the count "3 of 12" in the bottom bar.
- Copy across: an arrow in the gutter between (or an action) copies the difference to the other side.
- Compare with: another open tab, a file (dialog), the saved file (unsaved changes), the last git version.
- Leaving compare: the panes as before.

### 3.1 Tests

In-app: two files with added, removed and changed lines; filler lines; F7 through all; copy one across; an edit
recompares; compare with the saved file.

## 4. Open questions

1. Ignore whitespace / case as options (UE has them)?
2. Compare folders too (UE), or files only?
