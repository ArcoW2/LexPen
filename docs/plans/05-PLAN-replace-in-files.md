# Plan: Replace in files

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Search (Ctrl+Shift+F) finds in the open files or in a folder, but replacing works only in the open file. UltraEdit
and Visual Studio replace in files: all, or per file, or per match, with a preview.

## 2. The solution, in brief

A Replace field in the Search panel. Its results get a Replace button per match, per file and for all; a
replacement in a file that is open happens in its editor (one undo step per file, not saved), in a file that is
not open it is written by the host (with a backup when the setting says so). Before "Replace all" a count and a
confirmation.

## 3. Details

- The same matching as search (case, whole word, regular expressions with `$1` in the replacement, the `^p` codes).
- Open files: through their editor, so undo works and the file stays unsaved (the user saves); not open: the host
  reads, replaces and writes (encoding and line ends as read, TextFile), backup as on save.
- Read-only files (on disk or a read-only tab): skipped, listed.
- A file that changed on disk since the search: searched again first.
- After replacing, the results show what was replaced (crossed out, the new text), and Ctrl+Z on an open file undoes.

### 3.1 Tests

In-app and unit (host): replace in an open file (undo), a closed file (written, backup, encoding kept), all with
the confirmation, per match, a regex with `$1`, a read-only file skipped.

## 4. Open questions

1. Files not open: write them directly (as UE), or open each in a tab first so it can be checked and saved?
2. A preview of all changes (as VS) before Replace all?
