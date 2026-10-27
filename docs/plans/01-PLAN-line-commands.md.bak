# Plan: Line commands: duplicate, move, delete, join

Status: draft 2026-10-21, not started; your answers of 2026-10-21 worked in (actions without keys; Join keeps one space). From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

There is no command for the everyday line edits: duplicate a line, move it up or down, delete it, join lines.
UltraEdit and Visual Studio have them all with a key; in LexPen they take a select, cut and paste.

## 2. The solution, in brief

Four actions on the lines the cursors or selections touch (a block of column mode: its lines): Duplicate, Move up,
Move down, Delete, and Join. Each is one undo step, keeps the selection on the moved or copied text, and is an
action (F1, the Edit menu's submenu "Lines", usable by macros later) without a key of its own: you give it one in
your keys.json if you want.

## 3. Details

| Action | Does | UE / VS key (for reference; LexPen assigns none) |
|---|---|---|
| `duplicateLines` | The lines again, below; the cursor on the copy | UE Ctrl+D, VS Ctrl+D |
| `moveLinesUp` / `moveLinesDown` | The lines past the line above / below | VS Alt+Up / Down (LexPen's tab keys) |
| `deleteLines` | The lines removed, the cursor on the next | VS Ctrl+Shift+L, UE Ctrl+E |
| `joinLines` | The next line onto this one, its indentation becoming one space (always one, also before a `)` or `}`) | UE, VS Code |

No default keys (your answer): the actions are in F1 and the Edit menu, and a key is one line in your keys.json
(`"Ctrl+Shift+D": "duplicateLines"`). As actions, a macro (plan 17) can run them later.

- On a selection: every line it touches (a selection ending at a line's start does not take that line).
- Several cursors: each line once; a block of column mode: its lines.
- Read-only tabs: nothing happens (as every edit).
- Folded lines (a fold in the editor) move as a whole.
- CodeMirror has swapLineUp / swapLineDown / deleteLine / duplicateLine (in its sublime keymap addon); using them
  or writing four small functions (convert.js style, one undo step): to decide when building.
- Check first: CodeMirror's own default keys under LexPen's (its pcDefault map has Ctrl+D = delete line): which
  still work unasked, and whether that should stay.

### 3.1 Tests

In-app: each action on one line, on a selection over lines, on a selection ending at a line start, with two
cursors, on a block; undo is one step; the first and the last line (nothing to move past); read-only.

## 4. Open questions

None.
