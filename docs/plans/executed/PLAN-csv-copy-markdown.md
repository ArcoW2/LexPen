# Plan: Copy a selection of the column view as a Markdown table

Status: executed (2026-11-26); see As built.

## 1. What this is about

The column view of a CSV (and of any document read as CSV) has a current cell but no selection, and nothing copies
its rows in another form. Putting part of a CSV into a Markdown document means copying the source lines and
rewriting them by hand into a pipe table.

## 2. The solution, in brief

A rectangle selection in the column view: Shift+click or Shift with the arrow keys (and PgUp / PgDn, Home / End)
extends from the current cell, the cells in it marked. A new action, Copy as Markdown table, puts the selection (no
selection: the whole table) on the clipboard as a pipe table: the shown columns in the view's order, their names as
the header, the values as the view shows them, padded so the table is lined up.

## 3. Details

### 3.1 The selection

- The current cell stays as it is (tab.csvCur). A second cell, the anchor (tab.csvAnchor), is set when the current
  cell is moved with Shift: the anchor is the cell it moved from, and stays while Shift is held. The selection is the
  rectangle between the anchor and the current cell: the rows between them, and the columns between them in the
  order shown (hidden columns are not in it).
- Shift+click on a cell: the same, from the current cell to the cell clicked. A click without Shift, a move without
  Shift, and the find bar going to a match clear the selection.
- Shift+Tab keeps its meaning (the previous cell); it clears the selection as any move without extending does.
- The cells in the selection are marked (a class, `mm-csv-sel`) where csvDraw draws them, so the marks follow the
  scroll of the view, which draws only the rows near the screen.
- The keys come through previewcursor.js to csvKey, which until now ignored Shift (except Tab); with Shift it now
  extends.

### 3.2 Copy as Markdown table

- Action `csv.copyMarkdown` (Copy as Markdown table), in the view's right-click menu (csvViewItems, so also in a
  column box's More...), for keys.json and macros. Enabled when the active document has a column view.
- What is copied: the selection, else every row and every shown column.
- The table:
  - Header: the column names as the view's header shows them.
  - Delimiter row: `-` the width of the column; a right-aligned column (align right) ends in `:`.
  - Rows: each value as the view shows it (csvShow: the column's type and format), in full (not cut to its first
    line); a line break in a value becomes a space, `|` becomes `\|`.
  - Every cell padded to its column's widest text (at least 3), right-aligned columns padded on the left.
- Onto the active clipboard (putOnClipboard), with a message saying how many rows were copied.
- The building of the table is a pure function in csv.js (`csvMarkdownTable(header, rows, right)`: strings in, the
  table out), so it is tested under Jint.

### 3.3 Not in this plan

- Ctrl+C in the view keeps doing what it does (the page's own copy of a text selection); copying the rectangle as
  tab-separated text, as a spreadsheet does, could be a later step.
- Selecting rows from the editor's selection (the view beside the editor): not now.

### 3.4 Tests

- CsvTests: csvMarkdownTable with padding, a right-aligned column, `|` and a line break in a value, an empty value,
  a short header (width 3 minimum).
- By hand in the app: Shift+arrows and Shift+click, the marks while scrolling, a click clearing, Copy as Markdown
  table with and without a selection, with a hidden and a moved column, pasted into a Markdown document.

## 4. Open questions

None.

## 5. As built

- As planned. The selection: csvview.js `csvSelection` / `csvMarkSelection`, the anchor in `csvSetCell(..., extend)`;
  csvKey extends with Shift on every key it moves with except Tab. Shift+click clears the page's text selection, so
  only the cells are selected.
- The table: csv.js `csvMarkdownTable`; the widths in a loop (no spread of every row's length, which a very long
  table would not survive). The values as csvShow gives them (the column's format), not cut to their first line.
- The action `csv.copyMarkdown` (group edit) is in the view's right-click menu, and allowed in the previewer (it only
  copies). The message counts the rows copied.
- Tested: CsvTests.AMarkdownTableIsLinedUpWithItsAlignmentAndEscapes; all tests pass. Not yet tried by hand in the
  app (3.4).
