# Plan: CSV as columns

Status: draft 2026-10-23, not started.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

A CSV file opens as plain text: the fields of a row run on after each other, so the columns do not line up and a
value is hard to find under its header. Quoted fields with delimiters or line breaks inside, rows of different
lengths and a few lines of settings above the data make it worse. There is no way to see the file as the table it
is, to size, hide or reorder its columns, or to know how long the values in a column get.

## 2. The solution, in brief

LexPen reads the file's structure (delimiter, quotes, header lines, lines to skip at the top). The editor keeps the
raw text, with help to move through it: Tab goes to the next field, the bottom bar names row and column. The preview
of a CSV is the column view: the same data laid out in aligned columns, in the editor's font, with the columns on
its ruler. There a column is sized by dragging its edge, hidden, or moved; that is a view, the file stays as it is,
until you choose to write it in the shown order. The column view is not for editing: a double click puts the
editor's cursor on that field. The settings are kept per file.

## 3. Details

### 3.1 Reading the structure

- A language pack `csv` for `.csv`, `.tsv`, `.tab`, `.psv`; any other file can be read as CSV with the action Read
  as CSV (`csv.toggle`), for a text file that is a CSV under another name.
- Detected when the file opens, from its first lines (after the skipped ones), and shown in a small bar above the
  editor (as the format bar is), where each can be changed:
  - Delimiter: comma, semicolon, tab, pipe, or another character typed in. Detection: the character that splits the
    first lines into the same number of fields most often.
  - Quote: `"` (default), `'`, or none. Inside quotes a doubled quote is one quote (`""`), the delimiter and line
    breaks are text.
  - Header lines: 0, 1 (default when the first row looks like names: no numbers, all different) or more.
  - Lines to skip at the top: 0 by default; for a CSV that starts with a few lines of settings or a title. Skipped
    lines are not counted as rows.
- Rows with fewer fields than the others get empty cells; with more, the extra fields get columns of their own
  (named "Column 8", ...). A row whose quote never closes is marked in the editor's gutter as a problem, and the rows
  after it are read as text until the next line that starts a row cleanly.
- The reading runs in a worker (as the compare's diff does), so a large file does not stall the window.

### 3.2 The editor: the raw text, with help

- The text as it is, coloured by the `csv` pack (the delimiters dimmed, quoted fields as strings, the header lines in
  bold, the skipped lines as comments).
- Tab moves the cursor to the start of the next field, Shift+Tab to the previous one; at the last field of a row Tab
  goes to the first field of the next row. A real tab (a new field in a tab-separated file) is typed with the action
  Insert tab (`csv.insertTab`, no key by default; Ctrl+Tab already goes through the documents).
- The bottom bar shows where the cursor is: row (data rows, from 1, headers and skipped lines not counted), column
  number and its header name, e.g. `Row 12, Col 3 (Name)`.
- Editing works as usual; the column view follows (a wider value widens its column, up to the maximum).

### 3.3 The preview: the column view

- The preview of a CSV shows its rows as columns, in the editor's font (monospaced; with another font the view says
  so), read-only: a view built from the data, drawn per screen so 100,000 rows do not stall it.
- Each column is as wide as its longest value, up to a maximum (setting, 40 characters by default). A longer value is
  cut at the column's edge with a `...` sign; the mouse resting on it shows the whole value.
- The header lines stay at the top while scrolling, in bold. The skipped lines are shown above the columns as plain
  text (folded to one line `n lines skipped`, a click unfolds them).
- Quoted fields are shown without their quotes, a doubled quote as one; a field with a line break shows its first
  line and a `...` sign.
- Numbers are right aligned in their column.
- The bottom bar names the row and column under the mouse, as in the editor.

### 3.4 Its ruler

- The column view has the ruler above it (with the setting ruler on): each column's edge as a handle, and its header
  name (or its number) in the space above it, shortened to fit; the tooltip gives the name and the longest length.
- Dragging an edge sizes that column, and the columns after it move along with it. A double click on an edge sizes
  the column to its longest value (up to the maximum).
- Right-click on a column on the ruler: Hide column, Show all columns, Size to longest value, Move left, Move right,
  Column info.

### 3.5 Hiding and moving columns

- A hidden column is left out of the view; a thin mark at its place shows a column is hidden there, and a click on it
  shows it again.
- Moving a column (drag its header on the ruler, or Move left / Move right) changes the order in the view only.
- Action Write the columns in this order (`csv.writeOrder`): rewrites every row of the file in the shown order (and
  without the hidden columns, when you say so), as one undo step in the editor. Asks first.

### 3.6 Column info and lengths

- Column info (from the ruler's or the bar's menu): per column its name, the longest value's length, the shortest,
  how many are empty, and whether all values are numbers, dates or text. Shown in a small table, all columns at once,
  computed by the worker.

### 3.7 From the view to the editor

- A double click on a cell puts the editor's cursor on that field, at the character double-clicked, and the editor
  gets the focus (split view: the editor scrolls there). Part of the general double click from any preview to the
  editor (plan 30).
- Split view: both scroll together by row.

### 3.8 Kept per file

- Per file: delimiter, quote, header lines, lines to skip, and per column its width, hidden or not, and the order.
  Kept by the host as the ruler's lines are (RulerStore pattern: a ColumnStore, `file-columns.json`, the last 100
  files with columns, a draft by its id). Read when the file opens; written a second after a change.
- When the file's columns changed outside LexPen, the kept widths and order apply to the columns that are still there
  by their header name (else by position), and new columns get their default width at the end.

### 3.9 Settings

- Preview > Columns (CSV): the maximum column width (40 characters), header lines kept at the top (on), numbers right
  aligned (on).
- A CSV opens in split view by default (the pack's `open: split`); the setting Open in per language changes it.

### 3.10 Tests

- Unit (the reader, also run under the test runner if moved to a shared file): delimiter detection (comma, semicolon,
  tab, pipe), quotes with doubled quotes, delimiters and line breaks inside quotes, rows short and long, an unclosed
  quote, skipped lines, header detection.
- In-app (a test data folder, the debug build):
  - A CSV opens in split view: the editor holds the raw text unchanged (saved byte for byte), the view the columns.
  - The bar: changing delimiter, quote, header lines, skipped lines redraws the view.
  - The editor: Tab and Shift+Tab from field to field and to the next row; Insert tab; the bottom bar's row and
    column.
  - The view: widths, a long value cut with `...` and its tooltip, numbers right aligned, header lines at the top
    while scrolling, skipped lines folded.
  - The ruler: the column edges and names; dragging an edge sizes the column and the next ones move; a double click
    sizes to the longest value.
  - Hide a column and show it again; move a column: the view in the new order, the file unchanged; Write the
    columns in this order rewrites it in one undo step.
  - Column info: the lengths and kinds of a known file.
  - A large file (100,000 rows) scrolls in the view without a stall.
  - A double click on a cell: the editor's cursor on that character.
  - Restart: the widths, hidden columns and order are back.

## 4. Open questions

None.
