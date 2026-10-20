# Plan: column mode (block selection, typing, copy and paste)

## 1. The problem

LexPen has no column selection. CodeMirror's own Alt+drag rectangle does not work in LexPen (tried), there is no
keyboard way to make one, and copy and paste do not treat a block as a block:

- Copy joins the lines of the block into ordinary text; nothing marks it as a column.
- Pasting a block at a single cursor inserts it as lines below each other, starting at the cursor, instead of as
  a column at that position on the following lines.
- A numbered clipboard pastes the same text into every selection (`replaceSelection`), so a block copied into
  clipboard 2 never comes back as a block.

Asked for: a column mode as UltraEdit's, switched with Alt+C.

## 2. The solution, in brief

A column mode, switched on and off with Alt+C or Edit > Column mode, shown as `COL` in the bottom bar. While it is
on, a drag and Shift with the arrow keys select a block (a rectangle) instead of a stream of text; typing,
Backspace and Delete then work on every line of the block at once, the text lined up under each other, with
shorter lines filled up with spaces to the typing column, as UltraEdit does. Copy and cut in column mode put the
block on the clipboard with a "column" mark; paste in column mode always inserts as a column at the cursor (as
UltraEdit pastes), and a marked block does so outside column mode too. Alt+drag and Alt+Shift+arrows make a block
without the mode, as an extra. Windows clipboard and numbered clipboards alike.

## 3. Details

### 3.1 Column mode

- Edit > Column mode (checked while on), key Alt+C (free: no key and no menu title uses it); an action
  (`columnMode`) so F1 and `keys.json` have it.
- The bottom bar shows `COL` while it is on; a click there switches it off.
- Per window, for all its tabs; not kept after a restart (as UltraEdit, it is a working mode, not a setting).
- **Only with a monospaced editor font** (all characters equally wide), where a column is the same place on every
  line. With a proportional editor font (Options > Settings > Editor), Alt+C does not switch it on and says why;
  switching to a proportional font switches column mode off.
- Switching it off turns a block into one selection: its first line's part (nothing is lost, nothing typed).

### 3.2 Selecting in column mode

- **Mouse**: a drag draws a rectangle from where it started to where the mouse is, in visual columns (a tab counts
  to its tab stop, so the block lines up with what you see). Past the end of a short line the rectangle goes on
  (the block's width is the mouse's column, not the line's length).
- **Keyboard**: Shift+Up / Down / Left / Right, Shift+Home / End, Shift+PgUp / PgDn grow or shrink the block from
  where it started (its anchor), in every direction: down and to the right, but also up and to the left of the
  anchor. Going back past the anchor shrinks the block and then grows it on the other side.
- **Plain arrows, a plain click, Esc**: back to one cursor (column mode stays on).
- The bottom bar shows the size while a block is selected: `Block 5 x 12` (lines x columns), next to Ln / Col.

### 3.3 Typing and editing in a block

- **A block with width (columns selected), a key typed**: the block is replaced by that key, on every line; the
  cursors then stand after it on every line, and typing goes on there.
- **Backspace or Delete on a block with width**: the block's part is removed from every line. The lines stay active:
  a cursor on each of them, at the block's left column, with no column selected (a block of width 0).
- **A block of width 0** (after that, or from Shift+Up / Down without Left / Right): typing goes in on every line at
  that column, inserting, or overwriting the next character when the editor is in OVR mode (Ins), as with one
  cursor. Backspace and Delete remove the character before / after the cursor on every line.
- So to type over a block: select it, Backspace or Delete, then type.
- **Short lines**: a line shorter than the typing column is first filled up with spaces to it, so the text is under
  each other, as in UltraEdit. On a line too short for Backspace / Delete nothing changes.
- Tab / Shift+Tab indent / outdent the block's lines, as with a normal selection over several lines.
- One undo undoes such an edit on all lines at once.

### 3.4 Copy and cut

- The block's lines, each its part of the block, joined with the file's line ending (CRLF or LF). A line shorter
  than the block gives its part as it is (no spaces added), so trailing spaces are not invented.
- **Windows clipboard**: the text plus the clipboard format `MSDEVColumnSelect` (an empty marker: Visual Studio and
  Notepad++ write and read it for a block). The host sets both (`clipboardSetText` with a `column` flag).
- **Numbered clipboards**: the text plus `column: true` in `clipboards.json`; the clipboard list shows `[block]`.
- Cut removes the block's part from every line (the lines stay).
- Copy without a block keeps copying as now (the selection, or the cursor's line).

### 3.5 Paste

1. **In column mode, or the text is a marked block**: as a column. The text's first line goes in at the cursor
   (or the block's top left, after its part is removed), every next line at the same visual column on the line
   below. A line shorter than that column is filled up with spaces first; past the end of the file new lines are
   added. One undo step. This is how UltraEdit pasted the text copied from LexPen (tried).
2. **Otherwise, as many selections as the text has lines**: every selection gets its own line, in order (as
   CodeMirror already does for the Windows clipboard; the numbered clipboards do the same now).
3. **Otherwise**: as now.

A block copied in UltraEdit is plain text on the clipboard: its lines, filled up with spaces to the block's width,
and no column marker (checked: the formats are only UnicodeText, Text, OEMText and Locale). UltraEdit itself pastes
any text as a column when its column mode is on; LexPen does the same (rule 1), so an UltraEdit block goes in as a
column with column mode on, and as plain lines without it. The marker LexPen writes is for LexPen itself (a block
pasted as a column also outside column mode) and for Visual Studio and Notepad++; UltraEdit ignores it, which does
no harm.

### 3.6 Without column mode (extras)

- **Alt+drag**: a block, as in column mode. It does not work now (tried); found and made to work if the cause is
  small (likely the Alt key being taken by the menu bar), else left out.
- **Alt+Shift+Up / Down / Left / Right**: a block from the cursor, which is its anchor, in every direction: up and
  to the left as well as down and to the right; back past the anchor shrinks it and then grows it the other way
  (free in `keys.json`; UltraEdit does not use them). Alt+Up / Down are the previous / next tab and Alt+Left / Right
  the previous / next section (built already, your answer); with Shift a section move would select up to the
  section, but these explicit block keys win over that.
- A block made this way behaves as in 3.3 to 3.5 for as long as it is selected.

### 3.7 Where it is built

- A new `wwwroot/column.js`: the mode, the block (kept as one selection per line in CodeMirror, plus the block's
  columns, since CodeMirror cannot select past a line's end), the mouse and keys, typing with filling up, the
  bottom bar.
- `wwwroot/actions.js`: the actions (`columnMode`, the Alt+Shift+arrow ones); copy / cut / paste pass the column
  flag along; the numbered-clipboard paste follows 3.5. `wwwroot/menus.js`: Edit > Column mode. `wwwroot/keys.json`:
  Alt+C and Alt+Shift+arrows.
- `MainForm.cs`: `clipboardSetText` with `column`; `clipboardText` returns `{ text, column }`
  (`Clipboard.GetDataObject().GetDataPresent("MSDEVColumnSelect")`).
- `ClipboardStore.cs`: the `column` flag per clipboard.

### 3.8 Tests

- Unit: `ClipboardStore` keeps the flag; the column paste and the filling up as pure functions (short lines, tabs,
  past the end of the file).
- In-app:
  - Alt+C and the menu switch the mode, `COL` follows;
  - Shift+arrows and a drag make the expected block, also over short lines and tabs;
  - blocks from the anchor in all four directions, also back past it;
  - a key on a block replaces it on every line; Backspace / Delete leave a cursor per line (width 0), then typing
    inserts on every line, and overwrites in OVR mode; spaces filled in on short lines;
  - copy sets the marker (read back through the host);
  - paste in column mode and of a marked block at one cursor; 3 lines into 3 selections; the same with clipboard 2;
  - undo in one step; the bottom bar;
  - Alt+Shift+arrows.

### 3.9 Docs

README (Editing: column mode), the keys list (F1), HANDOFF.

Later, in plans of their own: column insert / fill, numbering a column, sorting by a column.

## 4. Open questions

None.
