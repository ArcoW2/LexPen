# Plan: Sort lines, remove duplicates

Status: draft 2026-10-21; worked out 2026-11-07 with your answers (4): ignore case by default, one window with all
options, Edit > Sort (not in Convert); a selection sorts only itself, a block only its own part; the sort columns
shown in the editor; a live preview; Apply sorts. A column file (CSV) sorts by its columns too. Several sort keys
(From / To); sorts stored by name, on a tab of their own. Not started. From the list "what UltraEdit or Visual
Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Lines cannot be sorted. UltraEdit has a Sort dialog (ascending, descending, ignore case, numeric, by column,
remove duplicates) and "Delete duplicates"; Visual Studio sorts with an extension.

## 2. The solution, in brief

Edit > Sort... opens a sort window with all options at once: one or more sort keys (each a From and To column, A to
Z or Z to A), ignore case (on by default), numbers by value, remove duplicates, remove empty lines. It sorts the
selection only, else the whole file; a block (column mode) sorts only its own part of the lines, the rest of each
line stays. While the window is open the editor shows the keys' columns as vertical lines, and a field at the bottom
of the window shows live how the first lines would come out. Apply sorts, as one undo step.

A column file (CSV, read by its column definition) sorts either as text, as above, or by its columns: one or more
columns, each ascending or descending, compared by the column's type (a number by value, a date as a date); the
header stays on top and a record moves whole, also one with a line break in a quoted field.

A sort can be stored under a name: the window has a tab Sort (the sort at hand) and a tab Stored sorts (select one
into the Sort tab, or delete one); from the Sort tab a sort is applied, saved under its name or saved as a new one.

## 3. Details

### 3.1 What is sorted

- A selection: only the selected lines; a selection that starts or ends inside a line takes that line whole (a line
  is the unit). The lines outside it do not move.
- Opening the window, such a selection is widened to the whole lines in the editor itself (from the start of its
  first line to the end of its last), so you see exactly what will be sorted (your answer 2026-11-07). A selection
  that ends at the very start of a line does not take that line. Cancel leaves the widened selection as it is.
- A block (column mode): only the block's part of each line is sorted. The keys (3.2) are read from each row's block
  text, and the row's whole block text moves to its new row; the text left and right of the block stays where it is.
  A row shorter than the block's start gets spaces up to it when a piece lands there; a piece that ends at the line's
  end is not padded with trailing spaces.
- Nothing selected: the whole file.
- The last line without a line break keeps it so after sorting (no line break added or lost).
- One undo step; the selection afterwards covers the sorted text.

### 3.2 The sort keys and options

- Sort keys (your answer 2026-11-07): a list, each key a **From** column, a **To** column and A to Z or Z to A. The
  key's text is the line from From up to and including To (counted as the ruler counts, tabs expanded); To empty: to
  the end of the line. The first key decides, each next one breaks the ties of the ones before it. "Add a key" adds a
  key after the last (its From one past the last key's To); each key can be removed.
- The keys' order is their order in the list, not their place in the line (your answer 2026-11-07): a key is dragged
  in the list to another place (also Alt+Up / Alt+Down on the key with the focus), and a key's columns are free: the
  second key may lie before the first in the line, or partly in it (overlapping columns are read for each key). The
  preview and the column lines follow at once; each key's lines carry its number (1, 2, ...) so the order shows in
  the editor too.
- One key to start with: From 1, To empty (the whole line).
- In a block (your answer 2026-11-07): the keys work within the block. The first key's From starts at the block's
  first column, To empty means the block's right edge; any column of the block can be chosen, a column outside it is
  not accepted (the field says why).
- Order: by the user's language (`Intl.Collator`, so `a`, `B`, `c` sort as words, not by code).
- Ignore case: on by default (your answer); off, `B` and `b` are different, and a choice shows which comes first:
  **B before b** or **b before B** (your answer 2026-11-07). The choice is stated for A to Z and is marked so: Z to A
  turns the whole order round, so B before b gives b before B there. The choice's text says what the order becomes
  for the first key's direction (A to Z: "B b", Z to A: "b B"), and the preview shows it. `Intl.Collator` with
  `caseFirst: 'upper'` or `'lower'`; the letters still sort as words (`a`, `B`, `b`, `c`), case only decides between
  equal letters. One choice for all keys.
- Numbers by value ("natural" sort: `file2` before `file10`; a key that is a number sorts by its value).
- Remove duplicates: a line whose keys are all equal to an earlier line's (or, with "whole line", the whole line)
  goes; the first one stays, the rest of the order is kept; it follows Ignore case, and a switch "ignore leading and
  trailing whitespace".
- Remove empty lines (whitespace only counts as empty).
- The last sort used is the one the window opens with (a setting), except the keys' columns in a block, which start
  from the block.

### 3.3 The window

- In the window's page (as the column view's box, csvview.js), not a native window: the preview and the column lines
  are then drawn at once, without a round trip to the host, and the editor stays visible beside it. Not modal for the
  rest of the page's drawing, but the keys go to the window while it is open.
- Two tabs: **Sort** (the sort at hand: its keys and options, the preview, the buttons) and **Stored sorts** (3.4).
- The column lines: while the window is open, a vertical line in the editor at each key's From and To, as the
  ruler's helper lines are drawn (ruler.js); they move as the fields change and go when the window closes.
- Each key its own colour (your answer 2026-11-07): its two lines are drawn in it, and its row in the window shows it
  (a mark in that colour before the key's number), so a line and its key are matched at a glance. The colours are
  the theme's named ones the ruler's tab stops offer (ruler.js TAB_COLOURS: the accent, green, purple, red, brown,
  orange, the find box), so they follow the theme in day and night; in that order by the key's place in the list, so
  a key dragged elsewhere takes the colour of its new place (the colour says the order). More keys than colours:
  they start again from the first, the number tells them apart. The key with the focus has its lines at full
  strength, the others lighter.
- The preview: a read-only field at the bottom of the Sort tab, in the editor's font, with the first lines of the
  result (as many as fit), the keys' parts marked; it follows every change at once. A large file: the preview sorts
  only what it needs to know the first lines (the sort itself runs on Apply).
- The Sort tab's buttons: **Apply** (sorts and closes; Enter), **Save** (under the name it was selected as; only when
  it came from Stored sorts and is changed), **Save as...** (asks a name; a name that exists asks whether to replace
  it), **Cancel** (Esc: closes without a change). The tab's head shows the stored sort's name when it came from one,
  "(changed)" after a change.

### 3.4 Stored sorts

- A sort stored under a name holds what the Sort tab holds: As text or By columns, the keys, the options; not what
  is sorted (the selection, the file).
- Kept for all of LexPen (every window and project), in the data folder as the other lists are (a file of its own,
  `sorts.json`); a name is unique, not case sensitive.
- The Stored sorts tab: a list of the names, each with a short line of what it does ("Text: 1-10 A to Z, 12- Z to A",
  "Columns: Name A to Z, Date Z to A"). **Select** (also Enter and a double click) brings it into the Sort tab and
  shows that tab; **Delete** asks first, then removes it. A By columns sort is greyed out for a file without a column
  definition.
- A By columns sort stores each key's column by its name from the header and by its number: on a file with that name
  the name decides, else the number; a key that fits no column of the file is shown as such and Apply waits until it
  is changed or removed.
- A text sort's columns are stored as they are; in a block, a stored key outside the block is shown as such and Apply
  waits until it is changed or removed (see question 7).

### 3.5 A column file (CSV)

A file with a column definition (docs/plans/executed/PLAN-csv-columns.md: the column view; csv.js) gets a choice at
the top of the Sort tab: **By columns** (the default for such a file) or **As text** (3.1 to 3.3 as for any file).

- By columns: a list of sort keys, each a column (by its name from the header, else its number) and ascending or
  descending; the first key decides, the next ones break ties. "Add a column" adds a key, each key can be removed and
  dragged to another place in the list (Alt+Up / Alt+Down too), as the text keys. One key to start with: the column of the cursor (the column view: its current cell's column).
- Compared by the column's type from the definition: integer and decimal by value (`csvNumber`, with the column's
  decimal sign and grouping), date / time as a date (`csvDate`, with its pattern), boolean false before true, text
  and auto as text with the options of 3.2 (ignore case, numbers by value). An empty field sorts last in either
  direction; a field that does not read as its type sorts after the ones that do, as text among themselves.
- What moves: records (`csvRead` rows), not lines: a quoted field with a line break keeps its record together. The
  lines before the data (`pre`: skipped lines, the header) stay on top. The text of each record is kept exactly as it
  is (its quotes, its spacing); only the order changes.
- Remove duplicates: a record whose key columns are equal to an earlier one's (or, with "whole record", all its
  fields) goes; the first one stays.
- A selection: only the records it touches are sorted among themselves (a record is the unit, as a line is in 3.1);
  opening the window widens the selection to those whole records, as 3.1 does to lines (in the column view: the rows
  marked). Nothing selected: all records.
- The column lines of 3.3 are not drawn (the keys are columns, not positions); in the column view the key columns'
  headers are marked instead while the window is open, each in its key's colour (3.3), with the key's number.
- The preview shows the first records of the result as the file has them (the text), the header line above them.
- Apply: one undo step on the text; the column view, when shown, follows as for any change of the text.

### 3.6 Menu and actions

- Edit > Sort... (your answer: under Edit, not in Convert); the action `edit.sort` opens the window, so it can be on a
  key and in F1.

### 3.7 Tests

In-app, text: each option on a selection, on a block (only the block part moves, the rest of each line stays; short
rows) and on the whole file; natural sort; ignore case on and off, and off with B before b and b before B, each A to
Z and Z to A (Z to A turns it round); duplicates by the keys and by the whole line, with and without case and
whitespace; empty lines; the last line without a break; undo is one step; the preview follows each change and
matches what Apply does.

In-app, keys: one key From / To; To empty to the line's end; two and three keys (each next one breaks ties), each
its own direction; a key added and removed; a key dragged to another place in the list (and Alt+Up / Alt+Down), the
order following; a second key before the first in the line and one partly overlapping it, each read for itself; the column lines at each From and To, each key's in its own colour, the same colour in its
row, the focused key's at full strength; a key dragged takes the colour of its new place; more keys than colours;
the lines moving with the fields and gone after closing; in the column view the key columns' headers in their keys'
colours; in a block: the first key at the block's first column by
default, another column of the block chosen, a column outside the block not accepted.

In-app, selection: one starting and ending inside lines is widened to the whole lines as the window opens (one ending
at a line's start does not take that line), and stays so after Cancel; a CSV selection widened to whole records.

In-app, a column file: one key ascending and descending; two keys (the second breaks ties); integer, decimal (with a
decimal comma), date with its pattern, boolean and text columns; empty fields last both ways; a field that is not
its type; a quoted field with a line break moves with its record; the header and skipped lines stay on top; the
records' text unchanged; duplicates by the key columns and by the whole record; a selection of records; As text on
the same file sorts lines; undo is one step.

In-app, stored sorts: Save as a new name, then in another window (and after a restart) it is listed; Select brings
its keys and options into the Sort tab; changed and Save keeps the name; Save as an existing name asks first; Delete
asks, then it is gone; a By columns sort greyed out for a file without columns; one applied to a file whose header
has the names in another order sorts by the names; a key that fits no column or lies outside the block shown, Apply
waiting.

Unit: the key text of a line by From / To with tabs; the order of two keys with ties; `sorts.json` read and written
(a damaged file read as no stored sorts, not lost on the next save).

## 4. Questions

Answered 2026-11-07:

1. Default case: ignore case.
2. A window with all options at once: yes.
3. The menu: Edit > Sort, not in Convert.

Open:

4. Quick actions besides the window: also `edit.sortAsc`, `edit.sortDesc`, `edit.removeDuplicates` that sort at
   once with the window's last options (for a key or a macro, no window)? Or only the window? (With stored sorts an
   alternative: an action that applies a stored sort by its name, for a key or a macro.)
5. The first key without a block: From 1 (the whole line), or the cursor's column when the window opens?
6. A column file: should the sort keys be kept per file (with its column definition)? Stored sorts now cover
   repeating a sort; proposal: not per file, the window opens with the last sort used.
7. A stored text sort used on a block: its columns as stored (counted from the line's start, so a key outside the
   block has to be changed), or counted from the block's first column (so a stored sort fits any block)? Proposal:
   from the block's first column when it was saved on a block, else from the line's start; stored with it.
8. Each text key its own direction (as the columns' keys, proposed above), or one direction for the whole sort?
9. Dragging the keys: in the window's list (as above). Also the column lines in the editor, to set a key's From and
   To with the mouse? Proposal: not in this plan (the fields and the list first).
