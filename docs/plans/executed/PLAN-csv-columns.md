# Plan: CSV as columns

Status: executed 2026-11-05 (see 5. As built).
The number in the file name is the priority; rename to reorder.

## 1. What this is about

A CSV file opens as plain text: the fields of a row run on after each other, so the columns do not line up and a
value is hard to find under its header. Quoted fields with delimiters or line breaks inside, rows of different
lengths and a few lines above the data make it worse. There is no way to see the file as the table it is, to tell
LexPen how the file is built (delimiter, quotes, header, number and date formats per column), or to size, hide or
reorder its columns.

## 2. The solution, in brief

The editor always shows the file as it is; nothing in it changes unless you ask. The preview of a CSV is the column
view: the rows laid out in aligned columns, each value shown in its column's format. How the file is read and shown
is set in a Columns pane: at the top the delimiter (chosen or typed, one or more characters), the quote and its
escape, the number of lines before the data and which of them holds the header; below it the columns found with
those settings, each with its type, quotes, decimal and thousands sign, format and alignment. Ticking several
columns sets a value for all of them at once; Apply redraws the preview. LexPen detects a first guess when the file
opens. The settings are a CSV on the Web (CSVW) metadata file, the W3C standard: LexPen reads one that is next to the
file, can save one there, and otherwise keeps the settings itself. On request the editor's text is rewritten in the
preview's column order, as one undo step.

## 3. Details

### 3.1 Reading the file

- A language pack `csv` for `.csv`, `.tsv`, `.tab`, `.psv`; any other file can be read as CSV with the action Read
  as CSV (`csv.toggle`).
- The reader takes a column definition (3.4) and the text, and gives rows of fields; it runs in a worker (as the
  compare's diff does), so a large file does not stall the window.
- When the file has no definition yet, LexPen detects one from the first lines: the delimiter that splits them into
  the same number of fields most often (comma, semicolon, tab, pipe), the quote (`"` or `'`), a header when the
  first row looks like names (no numbers, all different), and per column the type that fits all its values.
- Quotes: `"` by default, `'` to choose, or any other character or string; the start and end quote may differ.
  Inside quotes the delimiter and line breaks are text. An end quote inside the text is escaped by doubling it
  (`""`, the default, as RFC 4180 has it), by an escape character before it (`\"`, the character settable), or not
  at all.
- Rows with fewer fields get empty cells; with more, the extra fields get columns of their own ("Column 8", ...). A
  field whose end quote never comes marks its row as a problem in the preview, and reading picks up at the next line
  that starts a row cleanly.

### 3.2 The Columns pane

A tool pane like the others of plan 24 (docked or floating, in View > Panels), following the active document. Also
opened from the preview's right-click: Columns... When the active document is not read as CSV it says so and offers
Read as CSV.

Top part, the file:

- Delimiter: a list (comma, semicolon, tab, pipe, space) that can also be typed in; more than one character is
  allowed (`||`, `; `). `\t` types a tab.
- Lines before the data: how many lines come before the first data row, the header line included. One header line
  and nothing above it: 1. A title, a blank line and the header: 3. 0 when the data starts at the first line.
- Header line: none, or which of those lines holds the column names (1 in the first example, 3 in the second). The
  other lines before the data are shown folded above the columns.
- Quote: start and end (`"` and `"` by default; `'`, any other character or string, or none), and the escape:
  doubled (default), an escape character (`\` by default), or none.
- Detect: forgets the settings and guesses them again from the text.

Bottom part, the columns found with the settings above (the list changes as they change, from the first rows):

- One row per column: a tick box, the number, the name (from the header line, editable to override), a sample
  value, and its settings:
  - Type: text, integer, decimal, date/time, boolean, auto.
  - Start and end quote: by default the file's; may differ per column.
  - Read as (how the value is written in the file): for numbers the decimal sign and the thousands sign (`.` `,`
    `'` space or none), for dates a pattern like `dd-MM-yyyy HH:mm`.
  - Format (how the preview shows it): every column has one; its default comes from the type: a number as read, a
    decimal with a set number of digits as `#,##0.00`, a date as `yyyy-MM-dd`, text as it is. The signs of Read as
    apply unless the format names others.
  - Alignment: left or right; right for numbers and dates, left for text by default.
  - Trim spaces: on or off.
  - Shown, width, order: the same as on the ruler (3.5), here as values.
- A column whose values do not all fit its type or Read as shows a warning sign with the count and the first bad
  row.
- Ticking columns: set a value in one ticked row and it is set in every ticked row (type, quotes, decimal sign,
  thousands sign, format, alignment, ...). A tick box in the list's header ticks all; a right-click on a column
  offers Tick all of this type.
- Buttons: Apply (the preview redraws with the settings, and they are kept, 3.4), Revert (back to the kept
  settings), Detect. Apply is also Ctrl+Enter in the pane. Until Apply the preview shows the kept settings.
- A Definition tab shows the definition as text (the CSVW JSON, coloured), editable; Apply reads it back. That makes
  the settings copyable between files and reviewable as text.

### 3.3 The preview: the column view

- The preview of a CSV shows its rows as columns, in the editor's font, read-only, drawn per screen so 100,000 rows
  do not stall it.
- Each value is shown in its column's format and alignment. The mouse resting on a cell shows the original text as
  it is in the file. A value that does not fit the column's type or Read as is shown as it is in the file, marked.
- Each column is as wide as its longest shown value, up to a maximum (setting, 40 characters by default); a longer
  value is cut with a `...` sign (the hover shows it whole).
- The header stays at the top while scrolling, in bold. Quotes are not shown; a field with a line break shows its
  first line and `...`.
- The bottom bar names the row and column under the mouse: `Row 12, Col 3 (Name)`, and the same for the editor's
  cursor (only the bar; the editor's keys do not change).

### 3.4 The column definition: CSVW

- The definition is CSV on the Web (CSVW) metadata, a W3C Recommendation in JSON made for this. Its dialect has the
  delimiter, the quote, the escape (doubled or not), the rows to skip, the header row count and trimming; per column
  a name, a datatype and a format (a number pattern with its decimal and group character, a date pattern). LexPen
  reads and writes it.
- Lines before the data map onto its skip rows and header row count. What CSVW has no place for (a start quote that
  differs from the end quote, a quote of more than one character, quotes per column, lines between the header and
  the data, the shown format when it differs from the file's, alignment, widths, hidden, order) goes in prefixed
  extension properties of LexPen's own; another CSVW reader skips them.
- Where the definition comes from when the file opens, the first that exists:
  1. Next to the file: `name.csv-metadata.json` (the CSVW name for one file), else `csv-metadata.json` in the folder
     when it describes this file (the CSVW name for a folder). Written by Save definition next to the file (pane
     and the preview's right-click); then Apply writes there too. Shared with the file, e.g. in source control.
  2. LexPen's own store: ColumnStore, `file-columns.json`, the last 100 files with a definition, a draft by its id;
     written a second after Apply, as the RulerStore does.
  3. None: detected.
- When the file's columns changed outside LexPen, the kept settings apply to the columns that are still there by
  their name (else by position); new columns are detected and added at the end.
- The Folder pane marks a file that has a definition next to it, as it marks one with a backup (plan 33): a mark
  before its name, a tooltip "has a CSV definition (name.csv-metadata.json)". The metadata file itself stays listed.

### 3.5 The ruler, hiding and moving

- The column view has the ruler above it (setting ruler on): each column's edge as a handle, its name above it,
  shortened to fit; the tooltip gives the name, type and longest length.
- Dragging an edge sizes the column, the next ones move along; a double click sizes to the longest value.
- Right-click on a column: Hide column, Show all columns, Size to longest value, Move left, Move right, Column
  settings... (opens the Columns pane on that column), Column info.
- A hidden column leaves a thin mark at its place; a click on it shows it again. Moving a column (drag its name, or
  Move left / right) changes the view only. These land in the definition as the pane's Shown, width and order.

### 3.6 Writing the order to the editor

- Action Write the columns in this order (`csv.writeOrder`), in the preview's right-click and the pane: rewrites
  every row of the editor's text in the shown order (and without the hidden columns, when you say so), keeping each
  field's text and quotes as they are, as one undo step. Asks first. The file is changed only when saved.
- The lines before the data stay as they are, except the header line, which is reordered with the rows.

### 3.7 From the view to the editor

- A double click on a cell puts the editor's cursor on that field, at the character double-clicked, and the editor
  gets the focus (split view: the editor scrolls there). Part of the general double click from a preview to the
  editor (plan 30).
- Split view: both scroll together by row.

### 3.8 Column info

- Per column: name, type, longest and shortest value, how many are empty, how many do not fit. All columns in one
  table, computed by the worker; from the ruler's right-click and the pane.

### 3.9 Settings

- Preview > Columns (CSV): the maximum column width (40 characters), header kept at the top (on), detect a
  definition for a file without one (on).
- A CSV opens in split view by default (the pack's `open: split`); the setting Open in per language changes it.

### 3.10 Not in this plan

- CSV embedded in another document (e.g. a fenced block in markdown) shown as columns in that document's preview.
  Later, on this reader and definition.
- Tab in the editor going from field to field: dropped; the editor stays as it is.

### 3.11 Tests

- Unit (the reader and the definition, in a shared file run under the test runner): detection (comma, semicolon,
  tab, pipe; `"` and `'`), a delimiter of more than one character, doubled quotes, an escape character, no escape,
  delimiters and line breaks inside quotes, start and end quotes that differ and of more than one character, rows
  short and long, an unclosed quote, lines before the data with the header on the first and on a later line,
  decimal and thousands signs, date patterns, formats (`#,##0.00`, a date), the CSVW definition written and read
  back (round trip), a CSVW file from elsewhere read (folder `csv-metadata.json` too), the extension properties
  ignored by a plain CSVW read.
- In-app (a test data folder, the debug build):
  - A CSV opens in split view: the editor holds the raw text unchanged (saved byte for byte), the preview the
    columns; Tab in the editor is still Tab.
  - The pane: delimiter typed (one and more characters), quote and escape, lines before the data and header line:
    the column list follows; Apply redraws the preview; Revert; Detect.
  - Ticked columns: a type, a decimal sign, a format, an alignment set once lands in every ticked column.
  - Format and alignment: a decimal column shown with two digits, right aligned; the hover shows the original text.
  - A value that does not fit: shown as in the file, marked; the warning in the pane.
  - The Definition tab: edit the JSON, Apply, the preview follows; a broken JSON is refused with the line.
  - The ruler: widths, hide, show, move; the order in the definition.
  - Write the columns in this order: the editor's text reordered in one undo step, the lines before the data
    untouched except the header.
  - Save definition next to the file: `name.csv-metadata.json` written; the Folder pane marks the CSV; reopened,
    the definition is used.
  - A large file (100,000 rows) scrolls without a stall.
  - A double click on a cell: the editor's cursor on that character.
  - Restart: the definition is back from the store.

## 4. Open questions

None.

## 5. As built

Built on branch `plan-29` in three parts: the reader and the column view; the definition (ColumnStore, next to the
file) and the Columns pane; sizing, hiding and moving, Column info, Write the columns in this order and the Folder
pane mark.

- `web/csv.js`: the reader (fields with their place in the text, quotes per column, the three escapes, lines before
  the data), detection, `csvFit` (a kept definition onto columns changed outside LexPen), value formats, CSVW read and
  write. Unit tests under Jint (`tests/LexPen.Tests/CsvTests.cs`; Jint is a package of the test project only).
- `web/csvview.js`: the column view. `web/columnspane.js`, `web/columns.html`, `web/columns-pane.js`: the Columns
  pane. `ColumnStore.cs`: `file-columns.json`, and finding / writing the CSVW file next to the CSV (tests:
  `ColumnStoreTests.cs`).
- Measured in a test copy, 100,000 rows of 6 columns (5.4 MB): reading and drawing the view 343 ms (part 1), 435 ms
  after the longest value per column was added (part 3); twenty scroll steps of 300 px 335 ms in all.

Differs from the plan:

- No worker (3.1, 3.8): the reader runs on the page. At the size measured above it takes under half a second; a
  worker would have to send every row back to the page (that cost not measured). To do when a larger file stalls.
- The ruler (3.5) is the column view's header, always there, not the editor's ruler setting: the names are above the
  columns already, and their edges are the handles.
- The Definition tab (3.2) is a plain text field, not coloured.
- Write the columns in this order (3.6) is two items: in this order, and the shown columns only (the hidden left
  out), in place of a question.
- A hidden column's mark is a thin bar in the header and in every row; a click on either shows it.
- The Folder pane marks a CSV with its own `name.csv-metadata.json` next to it; one described only by the folder's
  `csv-metadata.json` is read, but not marked (that would mean reading that file for every listing).
- Split view scrolls by row through the preview's line map (one entry per row's first line), as other previews do.

