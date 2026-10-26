# Plan: Replace in the search panel: the selection, this file, the open files

Status: draft 2026-10-21, reworked 2026-10-26 (scope: selection, current file, open files; no folder yet), not
started. From the list "what UltraEdit or Visual Studio has and LexPen does not". The number in the file name is the
priority; rename to reorder.

## 1. What this is about

The Search panel (Ctrl+Shift+F) finds in the current file, the open files or a folder, but cannot replace at all.
The find bar (Ctrl+Shift+R) replaces one match or all of them in the active editor only: not in a selection, not in
other files, and without a list of what it will change. UltraEdit and Visual Studio replace in the selection, the
file or several files, per match or all, with the matches listed first.

## 2. The solution, in brief

The Search panel gets a Replace field and a scope with three choices: Current selection (the default when text is
selected), Current file (the default otherwise) and All open files. Its results get a Replace button per match, per
file and for all. Every replacement happens in the file's editor: one undo step per file, the file left unsaved for
the user to save. Before Replace all, a count and a confirmation. Files in a folder are left out for now: the panel
does not show which folder that would be.

## 3. Details

### 3.1 The scope

- **Current selection**: the selected text of the active editor; with several selections or a column block, each of
  them. The default when the editor has a selection of more than a word when the panel opens (a selection within one
  line still fills the find field, as now). The selection is taken when the search runs and marked while the results
  show, so a click elsewhere does not change what is replaced.
- **Current file**: the active tab's document. The default without a selection.
- **All open files**: every document open in this window, unsaved edits included (they are searched as they are now).
- **Files in folder** stays a search scope, but with Replace shown it is not offered (or disabled with a hint) until
  the panel shows which folder it means (see 4).

### 3.2 Replacing

- The same matching as search: case, whole word, regular expressions with `$1` in the replacement, the `^p` codes.
- Through the editor, so undo works and the file stays unsaved (the user saves); a document open but not shown
  gets its editor document as when it is shown.
- Per match (the row's button), per file (the file head's button) and all (the panel's button, after a confirmation
  with the number of matches and files).
- Read-only (on disk, a read-only tab, edited in another window): skipped, and listed as skipped.
- A file changed since the search (typed in, or reloaded): searched again before replacing in it.
- After replacing, the results show what was replaced (crossed out, the new text); Ctrl+Z in a file undoes its step.
- The find bar's own Replace / All stay as they are (the active editor), sharing the replace history.

### 3.3 Tests

In the app: the default scope with and without a selection; replace in a selection only (text outside unchanged,
several selections and a block); in the current file; in all open files (one undo step each, files left unsaved);
per match, per file, all with the confirmation; a regex with `$1`; a read-only tab skipped; a file changed after the
search searched again.

## 4. Open questions

1. Files in folder: replace there later, once the panel shows the folder (its path above the results), writing the
   files not open directly (as UltraEdit) or opening each in a tab first?
2. A preview of all changes (as Visual Studio) before Replace all, or is the list with the count enough?
3. Current selection: also offered in the find bar (a switch "in selection"), or only in the Search panel?
