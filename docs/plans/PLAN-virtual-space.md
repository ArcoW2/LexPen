# Plan: cursor past the end of the line (virtual space)

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
- Visual columns, as column mode: a tab counts to its stop (3.4 of PLAN-formatters.md once that is built).
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
  step. With `useTabs` (PLAN-formatters.md) the fill is tabs as far as the stops allow, then spaces.
- **Enter**: a new line as now, no spaces added to the line left behind.
- **Backspace** past the end: the cursor one column back, nothing deleted.
- **Delete** past the end: spaces from the line's end up to the cursor, then the next line joined on there; the
  cursor stays where it was. One undo step. (As Visual Studio.)
- Spaces that typing left and that are later emptied are trailing whitespace like any other (trim on save,
  PLAN-formatters.md 3.1.2).

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
