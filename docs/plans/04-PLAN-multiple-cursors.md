# Plan: Multiple cursors: add the next occurrence, Ctrl+Alt+click

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

LexPen has blocks (column mode) but no free multiple cursors: Visual Studio's Alt+Shift+. / Ctrl+D (add the next
occurrence of the selection), Ctrl+Alt+click (a cursor where you click), "select all occurrences".

## 2. The solution, in brief

CodeMirror already keeps several selections; LexPen adds the actions to make them: Add next occurrence, Skip this
one, Select all occurrences, and Ctrl+Alt+click for a cursor at the click. Typing, deleting, conversions and the
line commands work on all of them; Esc goes back to one cursor.

## 3. Details

| Action | Key (proposal) | VS |
|---|---|---|
| Add the next occurrence | Ctrl+Shift+. | Alt+Shift+. (Ctrl+D in VS Code) |
| Skip it (move the last one to the next) | Ctrl+Shift+, | Ctrl+K, Ctrl+D (VS Code) |
| All occurrences | Ctrl+Shift+L | Alt+Shift+; |
| A cursor at the click | Ctrl+Alt+click | Ctrl+Alt+click |

- Without a selection, the first press selects the word at the cursor (VS Code's behaviour).
- Matching: as find (case, whole word from the find bar's switches when it is open, else exact case).
- With column mode: a block is a set of cursors already; adding occurrences ends the block.
- The bottom bar shows the number of cursors.
- Virtual space (cursor past the line end): several cursors there are not supported now; to check.

### 3.1 Tests

In-app: add next three times, skip, all; typing on all; Esc back to one; Ctrl+Alt+click; with find's case switch.

## 4. Open questions

1. The keys: as proposed, or VS Code's Ctrl+D (Ctrl+D is free in keys.json; CodeMirror's default maps it to
   delete line)?
