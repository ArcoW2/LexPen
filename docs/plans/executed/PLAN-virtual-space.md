# Plan: cursor past the end of the line (virtual space)

Status: executed 2026-10-20 (branch `virtual-space`), with two additions asked for during execution (section 5).

## 1. What this is about

The cursor cannot go past the end of a line. Moving up or down onto a short line puts it at that line's end, and a
click past the end of a line does the same. For coding it helps when the cursor stays in its column: on a short or
empty line it stays where it is, and typing there fills the line with spaces up to the cursor first.

Asked for: an option, default off.

## 2. The solution, in brief

A setting "Cursor past the end of the line" (Options > Settings > Editor, default off). When on, LexPen keeps the
cursor's column itself where it lies past the line's end and draws the cursor there; arrows, a click and the
bottom bar use that column. Typing or pasting there first fills the line with spaces up to the cursor, as column
mode already does for a block; moving away adds nothing.

## 3. Details

### 3.1 Why it needs work of its own

CodeMirror 5 has no place past a line's end: a cursor is a position in the text, and the text ends there. It keeps
a goal column for up and down, but the cursor is drawn at the line's end and typing goes in there. Column mode
already counts columns past the end (`column.js`, a block in visual columns, short lines filled up on typing);
this plan uses the same counting for a single cursor.

### 3.2 The virtual column

- Kept per editor (`cm.state.mmVirtual = { line, col }`) only while the cursor sits past its line's end; the real
  cursor is then at the line's end. Any other cursor move, an edit elsewhere, a second cursor, a selection or a
  block clears it.
- Visual columns, as column mode: a tab counts to its stop (3.4 of executed/PLAN-formatters.md).
- Drawn as LexPen's own cursor element at the line's end plus the missing columns times the character width;
  CodeMirror's cursor is hidden meanwhile. It blinks like CodeMirror's and follows the OVR shape.
- The bottom bar shows the virtual column.

### 3.3 Moving

- **Up / Down, PgUp / PgDn**: the cursor keeps its column; on a shorter line it stays in that column past the end.
- **Right** at or past the line's end: one column further, on the same line (as Visual Studio with virtual space).
- **Left** past the end: one column back; at the line's end it moves into the text as now.
- **End**: the line's real end. **Home**: as now.
- **Click** past the end of a line: the cursor at the clicked column (column.js `mouseSpot` already finds it).
- Shift+arrows (a selection) start from the real line end; column mode's blocks are not changed by this setting.

### 3.4 Editing

- **Typing, paste** at a virtual column: first spaces from the line's end to the column, then the text, one undo
  step. With `useTabs` (executed/PLAN-formatters.md) the fill is tabs as far as the stops allow, then spaces.
- **Enter**: a new line as now, no spaces added to the line left behind.
- **Backspace** past the end: the cursor one column back, nothing deleted.
- **Delete** past the end: spaces from the line's end up to the cursor, then the next line joined on there; the
  cursor stays where it was. One undo step. (As Visual Studio.)
- Spaces that typing left and that are later emptied are trailing whitespace like any other (trim on save,
  executed/PLAN-formatters.md 3.1.2).

### 3.5 Limits

- Several cursors: only the single cursor goes past the end; with more cursors, as now.
- **Line wrapping on**: the setting works too; a short line occurs with wrapping as well (a long line 1, a line 2
  with only a fence, code on line 3: from halfway line 1, Down twice lands halfway line 3, past the end of line 2
  on the way). Past the end exists on a line's last row only (a row that wraps is full), up to the editor's right
  edge. Up and Down move by row as CodeMirror does and keep the horizontal position.
- **Only with a monospaced editor font**, as column mode (the same check); with another font the setting does
  nothing and Options says so. Columns past the end have no width of their own otherwise.

### 3.6 Tests

- In-app, setting on: Down from a long line onto a short and an empty line keeps the column (bottom bar, drawn
  cursor); typing there fills spaces and is one undo step; paste the same; Right past the end; Left back into
  the text; End; Backspace past the end deletes nothing; Enter adds no spaces; a click past the end; moving away
  without typing leaves the line unchanged; a tab before the cursor counts to its stop; Delete past the end fills,
  joins the next line and keeps the cursor, one undo step.
- In-app, wrapping on: a long wrapped line, a short line, a code line; Down from halfway the long line's last row
  keeps the position over the short line onto the code line; a wrapped row has no past-the-end.
- In-app, proportional font: the setting does nothing.
- Setting off: every one of these as now.
- Column mode and its test (t52) unchanged.

### 3.7 Docs

README (Editing, the setting), HANDOFF.

## 4. Open questions

None.

## 5. Resolved during execution

| Thing | Solution implemented |
|---|---|
| Column mode (asked for during execution) | Column mode has the cursor past the end whatever the setting: it is the only way to start or end a block there. Shift+arrows from a cursor past the end start the block at that column; a plain arrow on a block ends it at its head (past the end when the head is) and moves on from there; a click in column mode puts the cursor at the clicked column. Column mode off with the setting off: the cursor goes back into the text. |
| The head of a selection (asked for during execution) | CodeMirror draws no cursor at the head of a selection; LexPen draws one there, for every selection (with or without the setting or column mode), and at a block's head, also past a line's end. So Shift+arrows show where they are. |
| How it is drawn | One element in the editor's line layer (`.mm-vcursor`), placed from the line's end plus the missing columns; CodeMirror's cursor is hidden only while the cursor is past the end. It blinks as CodeMirror's and starts its blink again on a move. LexPen's theme has no separate OVR cursor shape, so there is none to follow. |
| Up and Down | By pixels, as CodeMirror does: the cursor's horizontal place is the goal, kept over several moves; the line or row under it decides. So the same code serves wrapping on and off. PgUp / PgDn: CodeMirror's page move, then the goal on the row it lands on. |
| How far past the end (changed after your review) | Without wrapping: as far as you like; the editor scrolls sideways along with the cursor (a spacer right of the cursor gives it the width, also past the longest line and past CodeMirror's hidden scroll margin). With wrapping the editor does not scroll sideways: up to its visible right edge. The first version stopped at the scroller's width, which reaches past the visible edge, so the last columns were out of sight. |
| The block head past every line's end (your review) | Moving it further did not change CodeMirror's selections, so nothing redrew the cursor: it stayed at the longest line's end. Every block change now draws it, and the bottom bar shows the block head's line and column. |
| A block is a rectangle (your review) | On screen: past a shorter line's end its part is drawn as selected too (the lines on screen). Copy and cut: each line's part filled up with spaces to the block's width, so the clipboard holds a rectangle (also clipboards 1 to 9); a column paste of it puts the spaces in. |
| Shift+End in column mode (your review) | The end of the head's line; pressed again there: the end of the longest line of the block (Shift+End twice selects up to the longest line); again: back to the head line's end. |
| CodeMirror's cursors on a block | Hidden while a block has width: on lines past their end CodeMirror would draw one at each line's end, next to the head's. A block of width 0 (after Backspace / Delete, a cursor per line) keeps them: that is where typing goes. |
| Ctrl+Shift+arrows in column mode (your review) | A word step on the head's line only: the head goes to the next word end (or back to a word start) there, and the block stays a rectangle; with the head past the line's end, Ctrl+Shift+Left goes back to the end, Ctrl+Shift+Right stays. Ctrl+arrows on a block: the block ends at its head and the word step goes from there (CodeMirror moved every line's cursor). |
| Alt+C with a selection (your review) | The selection changes with the mode: on, a selection becomes the block from its anchor to its head; off, a block becomes the selection from its anchor to its head (a column past a line's end: that line's end). Before, off kept only the block's first line part. |
| Undo after typing on a block (your review) | Undo and redo give back CodeMirror's selections (one per line), not LexPen's block, so a key then moved every line's cursor. The blocks are remembered by their selections (the last 200), and a selection that undo or redo gives back gets its block again: a key then moves from the block's head, one cursor. |
| Text and gutter jumping when going left (your review) | Two scrolls on every move: CodeMirror scrolled sideways to its own cursor (at the line's end, far left), then LexPen to the drawn cursor; the gutter followed both. CodeMirror now only scrolls up and down for these moves (`lineIntoView`); sideways is LexPen's alone. The spacer that gives the editor its width never gets narrower than what is in view, so the browser never pulls the scroll back either. Tested by recording every scroll event while going left 200 columns: the view only moves left, the gutter stays put. |
| Also asked during this review | A setting `leftWraps` (Editor, on): Left at the first column goes to the line above, off: it stays. The settings window got a tab per group, Files before Editor, "Remove whitespace at line ends on save" under Files, the language rows (Names of languages, Open in per language) in a Languages tab made only when opened. F1 shows its column names on top. Tested by t60 (17 checks) and t22. |
| Scrolling sideways earlier (your review) | A setting `scrollMargin` (Editor, 8 columns): the editor scrolls when the cursor, CodeMirror's or the drawn one, comes that close to the left or right edge (at most a third of the view); on keys, not on a click. Two things stood in the way at the end of the longest line, found by logging every scroll: CodeMirror applies its own minimal scroll after LexPen's (LexPen's now runs just after it), and its scroll bar, sized for the narrower editor, pulled the view back (it measures again when the spacer grows; the spacer only grows while the view is scrolled). Tested by t61 (8 checks). |
| The folder tree on a restart (asked during this review) | The window's session keeps the tree's open folders and scroll position; a restart opens the same folders and scrolls as it was (when it is the same folder). Tested by t62 (4 checks: open, scrolled, a closed folder stays closed). |
| A line right of the gutter (your review) | The gutter has a 1px line at its right in the theme's border colour, so the start of the text shows, also when scrolled sideways. |
| Which edits fill | A change at the cursor's place while it is past the end: typing, CodeMirror's paste, LexPen's paste, a drop, IME input. The fill goes into the same change (one undo step). Any other change, or another move, ends the column past the end. Tab first fills, then does what Tab does there (so on an empty line: indents from that column). Delete on the last line: nothing (no line to join). |
| Monospaced check | Measured once per font (as column mode does), again after a font change. |
| Tests | t59 (58 checks; the review's fixes included): Down / Up over short and empty lines with the goal kept, the bottom bar, the drawn cursor and CodeMirror's hidden, typing and paste with one undo, Right / Left / End / Backspace / Enter, Delete joining with one undo, a leading tab, useTabs, a click, Shift+arrow, wrapping (the long line, the fence line, the code line at the same place; a wrapped row has no past-the-end), the drawn head of a selection, column mode with the setting off (Down, Right, a block from past the end, its drawn head, a plain arrow from the block's head, a click, off again), a proportional font. Regressions: t52 (column mode, 35), t53, t54, t56, t3, t4, t48, t8, t19, t22, t12, t7: no failures. |
