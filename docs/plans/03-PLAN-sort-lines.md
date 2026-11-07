# Plan: Sort lines, remove duplicates

Status: draft 2026-10-21; worked out 2026-11-07 with your answers (4): ignore case by default, one window with all
options, Edit > Sort (not in Convert); a selection sorts only itself, a block only its own part; the sort column
shown in the editor; a live preview; Apply sorts. A column file (CSV) sorts by its columns too (2026-11-07). Not
started. From the list "what UltraEdit or Visual Studio has and
LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Lines cannot be sorted. UltraEdit has a Sort dialog (ascending, descending, ignore case, numeric, by column,
remove duplicates) and "Delete duplicates"; Visual Studio sorts with an extension.

## 2. The solution, in brief

Edit > Sort... opens a sort window with all options at once: A to Z or Z to A, ignore case (on by default), numbers
by value, from which column, remove duplicates, remove empty lines. It sorts the selection only, else the whole file;
a block (column mode) sorts only its own part of the lines, the rest of each line stays. While the window is open the
editor shows the sort column as a vertical line, and a field at the bottom of the window shows live how the first
lines would come out. Apply sorts, as one undo step.

A column file (CSV, read by its column definition) sorts either as text, as above, or by its columns: one or more
columns, each ascending or descending, compared by the column's type (a number by value, a date as a date); the
header stays on top and a record moves whole, also one with a line break in a quoted field.

## 3. Details

### 3.1 What is sorted

- A selection: only the selected lines; a selection that starts or ends inside a line takes that line whole (a line
  is the unit). The lines outside it do not move.
- A block (column mode): only the block's part of each line is sorted; each row's block text is a key and moves to
  its new row, the text left and right of the block stays where it is. A row shorter than the block's start gets
  spaces up to it when a piece lands there; a piece that ends at the line's end is not padded with trailing spaces.
- Nothing selected: the whole file.
- The last line without a line break keeps it so after sorting (no line break added or lost).
- One undo step; the selection afterwards covers the sorted text.

### 3.2 The options

- Order: A to Z or Z to A, by the user's language (`Intl.Collator`, so `a`, `B`, `c` sort as words, not by code).
- Ignore case: on by default (your answer); off, `B` and `b` are different keys (upper case first, as the collator
  orders them).
- Numbers by value ("natural" sort: `file2` before `file10`; a line that is a number sorts by its value).
- From column: the key is the line from that column on (counted as the ruler counts, tabs expanded); 1 is the whole
  line. With a block the column is the block's left edge and the field shows it, not editable.
- Remove duplicates: the first one stays, the rest of the order is kept; it follows Ignore case, and a switch
  "ignore leading and trailing whitespace".
- Remove empty lines (whitespace only counts as empty).
- The options are kept for the next time (a setting each), except the column.

### 3.3 The window

- In the window's page (as the column view's box, csvview.js), not a native window: the preview and the column line
  are then drawn at once, without a round trip to the host, and the editor stays visible beside it. Not modal for the
  rest of the page's drawing, but the keys go to the window while it is open.
- The column line: while the window is open, a vertical line in the editor at the sort column, as the ruler's helper
  lines are drawn (ruler.js); it moves as the column field changes and goes when the window closes.
- The preview: a read-only field at the bottom, in the editor's font, with the first lines of the result (as many as
  fit), the key part marked; it follows every change of an option at once. A large file: the preview sorts only what
  it needs to know the first lines (the sort itself runs on Apply).
- Apply sorts and closes; Cancel and Esc close without a change. Enter is Apply.

### 3.4 A column file (CSV)

A file with a column definition (docs/plans/executed/PLAN-csv-columns.md: the column view; csv.js) gets a choice at the top of the window: **By
columns** (the default for such a file) or **As text** (3.1 to 3.3 as for any file).

- By columns: a list of sort keys, each a column (by its name from the header, else its number) and ascending or
  descending; the first key decides, the next ones break ties. "Add a column" adds a key, each key can be removed and
  moved up or down. One key to start with: the column of the cursor (the column view: its current cell's column).
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
  nothing selected: all records.
- The column line of 3.3 is not drawn (the keys are columns, not a position); in the column view the key columns'
  headers are marked instead while the window is open.
- The preview shows the first records of the result as the file has them (the text), the header line above them.
- Apply: one undo step on the text; the column view, when shown, follows as for any change of the text.

### 3.5 Menu and actions

- Edit > Sort... (your answer: under Edit, not in Convert); the action `edit.sort` opens the window, so it can be on a
  key and in F1.

### 3.6 Tests

In-app, a column file: one key ascending and descending; two keys (the second breaks ties); integer, decimal (with a
decimal comma), date with its pattern, boolean and text columns; empty fields last both ways; a field that is not
its type; a quoted field with a line break moves with its record; the header and skipped lines stay on top; the
records' text unchanged; duplicates by the key columns and by the whole record; a selection of records; As text on
the same file sorts lines; undo is one step.

In-app: each option on a selection, on a block (only the block part moves, the rest of each line stays; short rows),
and on the whole file; natural sort; ignore case on and off; duplicates with and without case and whitespace; empty
lines; from a column; the last line without a break; undo is one step; the column line shown, moving with the field
and gone after closing; the preview follows each option and matches what Apply does.

## 4. Questions

Answered 2026-11-07:

1. Default case: ignore case.
2. A window with all options at once: yes.
3. The menu: Edit > Sort, not in Convert.

Open:

4. Quick actions besides the window: also `edit.sortAsc`, `edit.sortDesc`, `edit.removeDuplicates` that sort at
   once with the window's last options (for a key or a macro, no window)? Or only the window?
5. From column without a block: start at 1 (the whole line), or at the cursor's column when the window opens?
6. A column file: should the sort keys be kept per file (with its column definition, so the next Sort... of that file
   starts with them), or start each time from the cursor's column?
