# Plan: Replace in the search panel: the selection, the current file, the open files, the folder

Status: draft 2026-10-21, reworked 2026-10-26, answers 2026-10-27 (keys, undo per replacement, a preview, files in
the folder written without opening them; In selection as a scope; no copy before writing a file in the folder; the
preview a window of its own), not started. From the list "what UltraEdit or Visual Studio has and LexPen
does not". The number in the file name is the priority; rename to reorder.

## 1. What this is about

The Search panel (Ctrl+Shift+F) finds in the current file, the open files or a folder, but cannot replace at all.
The find bar replaces one match or all of them in the active editor only, and without a list of what it will change.
UltraEdit and Visual Studio replace in the file or several files, per match or all, with the matches listed first.

## 2. The solution, in brief

Ctrl+Shift+R opens the Search panel with a Replace field; Ctrl+R becomes the find bar's replace (plan 06). The panel
searches and replaces in the selection, the current file, the open files or the files in the folder. Its results get a Replace button per match,
per file and for all. The preview of every change is a window of its own: shown before Replace all and per file when
the setting for its scope says so, and from a Preview button in the panel at any time. Each replacement is its own undo step in its
file. Files in the folder that are not open are changed on disk directly, without opening them and without a copy.

## 3. Details

### 3.1 The keys

- **Ctrl+Shift+R**: the Search panel (left) with its Replace field shown and focused when the find field is filled,
  else the find field. Now the find bar's replace.
- **Ctrl+R**: the find bar with its replace row (plan 06). Ctrl+R is also the browser's reload; bound in LexPen, the
  page's key handler takes it first and stops the browser's (as it does for Ctrl+F). Tested once built.
- Both in `defaults/keys.json`, so they can be changed as any key.

### 3.2 The scope

- **In selection**: the selection of the active editor when the search runs: one selection, several (multiple
  cursors), or a column block (on each line the part between its columns, as in plan 06, 3.3). A choice in the scope
  list, never taken by itself: the find bar is the one that follows the selection on its own. Not offered (or
  disabled with a hint) when the active editor has nothing selected. The selection is taken when the search runs and
  marked while the results show, so a click elsewhere does not change what is replaced; each part moves with the
  text as replacements change its length.
- **Current file**: the active tab's document.
- **All open files**: every document open in this window, unsaved edits included (they are searched as they are now).
- **Files in folder**: as the search, the panel showing which folder that is (its path above the results; now it
  does not, which is why this comes last).

### 3.3 Replacing

- The same matching as search: case, whole word, regular expressions with `$1`, the `^` codes in the replacement as
  in plan 06 (`^p` a line break, `^t` a tab).
- **Per match** (the row's button): that match, one undo step. Replacing several one by one, Ctrl+Z in the file undoes
  them one by one, the last first.
- **Per file** (the file head's button) and **all** (the panel's button): first the preview (3.4) when the setting
  says so, else at once; applied, one undo step per file.
- **An open file**: through its editor, so undo works and the file stays unsaved (the user saves); a document open
  but not shown gets its editor document as when it is shown.
- **A file in the folder that is not open**: read, replaced and written on disk directly, with its encoding and line
  ends kept. It is not opened, so there is no undo for it, and no copy is kept: the preview is the check before.
- Read-only (on disk, a read-only tab, edited in another window): skipped, and listed as skipped.
- A file changed since the search (typed in, reloaded, changed on disk): searched again before replacing in it.
- After replacing, the results show what was replaced (crossed out, the new text).
- The find bar's Replace / All stay the find bar's (plan 06), sharing the replace history.

### 3.4 The preview

A window of its own (as the character picker and the highlights window are), not the panel's result list: every match
as it will change, the line with the old text crossed out and the new text marked, grouped per file, with the number
of matches and files. Per match a check box, all checked; unchecked ones are left as they are. Apply or Cancel. A file
not open says so ("changed on disk, no undo").

- **When it shows**: two on/off settings (General > Search, both on by default), by scope. **Preview Replace all**:
  Replace all and Replace per file in the selection, the current file or the open files (undo exists) show it first.
  **Preview Replace in files**: the same buttons in the scope Files in folder (written to disk, no undo) show it
  first. Off: they replace at once. Per match never shows it.
- **The Preview button** in the Search panel, beside Replace all: the window with what Replace all would do, at any
  time, whatever the setting. Apply there is Replace all.

### 3.5 Tests

In the app: Ctrl+Shift+R opens the panel with Replace, Ctrl+R the find bar's replace; In selection (one selection,
several, a column block: matches and replacements only within them, text outside unchanged); replace per match, three in a
row, then Ctrl+Z three times undoes them one by one; per file and all through the preview window, an unchecked
match left alone; the setting off: Replace all at once, no window; the Preview button with the setting off: the window; all open files (one undo step each, files left unsaved); files in a folder not open, changed on disk with
encoding and line ends kept, not opened; a regex with `$1`; `^p` in the replacement; a read-only tab skipped; a file
changed after the search searched again.

## 4. Answers

1. No undo for files in the folder that are not open, and no copy kept: the preview is the check.
2. The preview is a separate window. Two on/off settings show it at once on Replace all: one for the scopes with
   undo (selection, current file, open files), one for Files in folder. Off, the Preview button in the panel still
   shows it (3.4).
3. Plan 06 (the find bar's replace, Ctrl+R, `^p` / `^t` in the replacement) is done first; this plan builds on it.
