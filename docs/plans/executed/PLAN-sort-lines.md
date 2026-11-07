# Plan: Sort lines, remove duplicates

Status: executed (2026-11-07); see 5. As built. The window became a panel (your request during the build).

History: draft 2026-10-21; worked out 2026-11-07 with your answers (4): ignore case by default, one window with all
options, Edit > Sort (not in Convert); a selection sorts only itself, a block only its own part; the sort columns
shown in the editor; a live preview; Apply sorts. A column file (CSV) sorts by its columns too. Several sort keys
(From / To), each its own direction and colour, dragged to reorder; sorts stored by name, on a tab of their own, and
used by name from a key or a macro. From the list "what UltraEdit or Visual Studio has and
LexPen does not".

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
The actions `edit.sort`, `edit.sortAsc` and `edit.sortDesc` sort at once, without the window, optionally by a stored
sort's name.

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

- Sort keys (your answer 2026-11-07): a list, each key a **From** column, a **To** column and its own A to Z or Z to
  A (your answer: each key its own direction). The
  key's text is the line from From up to and including To (counted as the ruler counts, tabs expanded); To empty: to
  the end of the line. The first key decides, each next one breaks the ties of the ones before it. "Add a key" adds a
  key after the last (its From one past the last key's To).
- A key row is deleted (your answer 2026-11-07) with the delete button (x) at the end of its row, or Delete on the
  row with the focus; the keys after it move up and take their new place's number and colour, the preview and the
  ruler follow. The last key left cannot be deleted (its button greyed out): a sort has at least one key.
- A key's To is never before its From (your answer 2026-11-07): a To before From is not accepted (the field says
  why); To equal to From is a key of one column. The From line is drawn at the left edge of column From, the To line
  at the right edge of column To, so the To line is always right of the From line.
- The keys' order is their order in the list, not their place in the line (your answer 2026-11-07): a key is dragged
  in the list to another place (also Alt+Up / Alt+Down on the key with the focus), and a key's columns are free: the
  second key may lie before the first in the line, or partly in it (overlapping columns are read for each key). The
  preview and the column lines follow at once; each key's number (1, 2, ...) shows in the ruler (3.3), so the order
  shows in the editor too.
- One key to start with: From 1, To empty (the whole line): the first column, the same every time, not the cursor's
  (your answer 2026-11-07).
- In a block (your answers 2026-11-07): the keys work within the block and count from its first column (From 1 is
  the block's first column), To empty means the block's right edge; any column of the block can be chosen, one past
  its right edge is not accepted (the field says why). So a sort fits any block, stored ones too (3.4).
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
- The window opens with the last sort used (a setting); the very first time with one key, From 1.

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
  orange, the find box), so they follow the theme in day and night. The colour says the order (your answer
  2026-11-07): the colours go by the key's place in the list, so a key dragged elsewhere takes the colour of its new
  place. More keys than colours: they start again from the first, the number tells them apart. The key with the
  focus has its lines at full strength, the others lighter.
- The key's number in the ruler (your answers 2026-11-07): each key's number (its row in the list) is written in the
  ruler as a small label with the key's colour as its background and a text colour that contrasts with it (white or
  black, whichever reads best on that colour in the current theme), hugging its lines: just right of the From line and just left of the To line, so the
  number sits inside the key's columns at both ends. A key of one or two columns, where the two would collide, shows
  the number once, between its lines. While the window is open the ruler is shown (View > Ruler off: shown for the
  window, hidden again when it closes). A key's To empty (to the line's end): only the From side's number.
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
  `sorts.json`); a name is unique, not case sensitive. Not per file: one stored sort serves any file it fits (for
  example always on the first column) (your answer 2026-11-07).
- The Stored sorts tab: a list of the names, each with a short line of what it does ("Text: 1-10 A to Z, 12- Z to A",
  "Columns: Name A to Z, Date Z to A"). **Select** (also Enter and a double click) brings it into the Sort tab and
  shows that tab; **Delete** asks first, then removes it. A By columns sort is greyed out for a file without a column
  definition.
- A By columns sort stores each key's column by its name from the header and by its number: on a file with that name
  the name decides, else the number; a key that fits no column of the file is shown as such and Apply waits until it
  is changed or removed.
- A text sort's columns count from the start of what is sorted (your answer 2026-11-07): the line's start, or in a
  block the block's first column. So a sort saved on a block fits another block; a key past a block's right edge is
  shown as such and Apply waits until it is changed or removed.

### 3.5 A column file (CSV)

A file with a column definition (docs/plans/executed/PLAN-csv-columns.md: the column view; csv.js) gets a choice at
the top of the Sort tab: **By columns** (the default for such a file) or **As text** (3.1 to 3.3 as for any file).

- By columns: a list of sort keys, each a column (by its name from the header, else its number) and ascending or
  descending; the first key decides, the next ones break ties. "Add a column" adds a key, each key row can be deleted as a text key's (3.2) and
  dragged to another place in the list (Alt+Up / Alt+Down too), as the text keys (your answer 2026-11-07: dragging
  in both lists is part of this plan). One key to start with: the first column, as for text (3.2).
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

- Edit > Sort... (your answer: under Edit, not in Convert) opens the window; its action is `edit.sortWindow`, so it
  can be on a key and in F1.
- Sorting at once, without the window (your answer 2026-11-07), each with an optional name of a stored sort as its
  parameter (on a key in keys.json, in a macro):
  - `edit.sort` with a name: that stored sort as it is stored (each key its own direction). Without a name: the same
    as `edit.sortAsc` without one.
  - `edit.sortAsc` with a name: that stored sort's keys and options, but every key ascending, whatever the stored
    sort says. Without a name: one key, the whole line (a column file: its first column), the default options.
  - `edit.sortDesc`: as `edit.sortAsc`, every key descending.
- They sort what the window would (3.1): the selection widened to whole lines (a column file: records), a block's
  part, else the whole file; one undo step. A name that is not stored, or a By columns sort on a file without a
  column definition: a message (toast), nothing sorted.
- F1 lists the four actions; the three that sort run there without a name.

### 3.7 Tests

In-app, text: each option on a selection, on a block (only the block part moves, the rest of each line stays; short
rows) and on the whole file; natural sort; ignore case on and off, and off with B before b and b before B, each A to
Z and Z to A (Z to A turns it round); duplicates by the keys and by the whole line, with and without case and
whitespace; empty lines; the last line without a break; undo is one step; the preview follows each change and
matches what Apply does.

In-app, keys: one key From / To; To empty to the line's end; two and three keys (each next one breaks ties), each
its own direction; a key added; a key row deleted with its button and with Delete (the ones after it renumbered and
recoloured), the last key not deletable; a key dragged to another place in the list (and Alt+Up / Alt+Down), the
order following; a second key before the first in the line and one partly overlapping it, each read for itself; a To before its From not accepted, To equal to From a one-column key; the column lines at
each From and To, each key's in its own colour, the same colour in its row; each key's number in the ruler on its
colour with a readable text colour (day and night), right of the From line and left of the To line (once for a narrow key, From side only for To empty); the
ruler shown while the window is open with View > Ruler off, hidden again after; the focused key's at full strength; a key dragged takes the colour of its new place; more keys than colours;
the lines moving with the fields and gone after closing; in the column view the key columns' headers in their keys'
colours; in a block: the keys counted from the block's first column (From 1 there by default), another column of the
block chosen, one past its right edge not accepted.

In-app, actions: `edit.sort`, `edit.sortAsc` and `edit.sortDesc` without a name on lines, a block and a column file
(its first column); with a stored sort's name: `edit.sort` as stored (mixed directions), `edit.sortAsc` all
ascending and `edit.sortDesc` all descending; a name that is not stored and a By columns sort on a plain file give a
message and change nothing; each on a key in keys.json and in a macro; undo one step each.

In-app, selection: one starting and ending inside lines is widened to the whole lines as the window opens (one ending
at a line's start does not take that line), and stays so after Cancel; a CSV selection widened to whole records.

In-app, a column file: one key ascending and descending; two keys (the second breaks ties); a key row deleted, the
last one not; integer, decimal (with a
decimal comma), date with its pattern, boolean and text columns; empty fields last both ways; a field that is not
its type; a quoted field with a line break moves with its record; the header and skipped lines stay on top; the
records' text unchanged; duplicates by the key columns and by the whole record; a selection of records; As text on
the same file sorts lines; undo is one step.

In-app, stored sorts: Save as a new name, then in another window (and after a restart) it is listed; Select brings
its keys and options into the Sort tab; changed and Save keeps the name; Save as an existing name asks first; Delete
asks, then it is gone; a By columns sort greyed out for a file without columns; one applied to a file whose header
has the names in another order sorts by the names; a text sort saved on one block applied to another block (counted
from that block's first column); a key that fits no column or lies past the block's right edge shown, Apply
waiting.

Unit: the key text of a line by From / To with tabs; the order of two keys with ties; `sorts.json` read and written
(a damaged file read as no stored sorts, not lost on the next save).

## 4. Open questions

None.

## 5. As built

- **A panel, not a window** (your request during the build, 2026-11-07): the Sort panel (`sort.html`,
  `sort-pane.js`; the window's side `sort.js`) docks in the window's dock areas (at the right the first time) or
  floats, as the other panels; View > Panels lists it (So&rt), and it follows the window worked in as the Columns
  panel does (AppHost FollowingPanes, OnADocument: its floating bar names the document). Edit > Sort... shows it,
  widens the selection and puts the focus on the first field. Because it stays open: what it sorts follows the
  editor (the selection, a block, another document) a moment after each change; Apply sorts and the panel stays; there
  is no Cancel (Esc goes back to the document, as in the other panels). The ruler shows the keys while the panel is
  shown (docked in front, or floating), also with View > Ruler off.
- **The last sort** is kept in `sorts.json` beside the stored sorts (`last`), not as a setting: a sort is a
  structure, not a value the settings window could show. It is the sort as it is now, kept a moment after each change
  (your answer after the build, 2026-11-07; first it was only kept by Apply), with the name of the stored sort it came
  from and whether it was changed since: LexPen opens with it, and Save stores it under that name again. It is not in
  the list; a stored sort is only written by Save or Save as.
- **The stored sort's name** is at the bottom, not in the tab (a narrow panel cuts it there): left of the buttons, or
  above them when both do not fit.
- **sorts.json** is at the top of the data folder (your own work, as favourites.json), by `SortStore`; a damaged file
  is kept beside it as `sorts.json.damaged` before the first save over it.
- **Delete on a key row** removes the key when the focus is on its grip, its direction or its x, not in its From / To
  field (there Delete edits the number).
- **The preview** sorts only the first lines of the target (records in a CSV), Settings > Editor > Sort
  (`sortPreviewLines`, 100 by default; your answer after the build, 2026-11-07: the whole target was slow on a large
  file), with a note when there are more; Apply sorts all of it. The setting also has All. A preview that takes
  2 seconds or longer (`sortPreviewWarn`, Settings > Editor > Sort; Never, 1 to 10 seconds) shows a line above it with
  the time it took and the setting; a click (or Enter) on it opens Settings at that setting (host `openSetting`, the
  settings page's `showSetting`: its tab, the row in view with the focus, flashing).
- **Highlights go along** (your report after the build, 2026-11-07: after a sort and its undo a note lost its place
  and its mark): the sort replaces its text in one go, which took the highlights' marks with it. Now each highlight in
  the sorted text moves to where its text went (a line, a CSV record, a block part). One that crosses the edge of what
  is sorted (the selected lines, a block's side) or spans parts that no longer follow each other is split (your
  answer, 2026-11-07): a highlight per part, each with its note, a line break at a part's end left out; parts that
  still follow each other stay one. Undo puts back exactly what was there before (the one highlight whole again),
  Redo the parts (an editor's beforeChange of origin undo / redo that is exactly a sort kept in the document,
  `sortMoves`, the last 20; a highlight removed meanwhile stays removed). One whose text was removed (a duplicate)
  goes as with any deleted text.
- **The preview**: a double-click on a line puts the cursor on that line in the editor, where its text is now (a
  block: the line its part comes from).
- **Revert** goes back to the stored sort it is, or to the template a new sort started from (Use as new; the bottom
  says "New from template" and its name); not an undo of Apply. Off for a sort from neither (New) and while
  unchanged.
- **Templates** (your answers after the build, 2026-11-07): a stored sort can be pinned as a template (`templates`
  in sorts.json, kept through Save, Rename and replacing under its name); the templates come first in the list, a
  divider, then the others, each part by name. Right-click a regular one: Select (also a double-click, Enter),
  Rename..., Pin as template; a template: Use as new (also a double-click, Enter: as New, with the template as its
  start; no name, so Save cannot change it), Rename..., Edit (works on the template, Save stores it there), Unpin as
  template. Also the menu key or Shift+F10 in the list. Rename to a name another stored sort has is refused (a
  change of case of its own name is fine). Save as over a regular one warns that it overwrites it; over a template it
  is refused (a template changes by its Edit only). Delete... stays a button (and the Delete key), not in the menu.
- **The buttons** (your answers after the build, 2026-11-07): Apply, Save, Save as..., Revert (back to the stored sort
  it came from), New (a sort from the start); when they do not fit the panel's width: Apply and Manage, a menu with
  Save, Save as..., Revert and New. Save and Revert only for a stored sort that was changed; its name then in
  italics.
- **A CSV selection** is widened in the editor; the column view does not mark the records.
- **Case order** (your answer after the build, 2026-11-07): with Ignore case off, four orders instead of B before b
  / b before B: **AaBbCc**, **aAbBcC** (paired per letter, the collator's `caseFirst`), **ABCabc**, **abcABC** (each
  case as a group: compared position by position, a capital against a small letter by its case alone). Stated for A
  to Z; Z to A turns it round. A stored sort with the old choice gets AaBbCc or aAbBcC.
- **Numbers by value** (your answer after the build, 2026-11-07) has a decimal sign (default `.`) and characters to
  ignore (default comma and space, so `1,234.5` and `12 000` are numbers); a point that is neither makes the key no
  number. It applies to a key that is a number as a whole; digits inside text still sort naturally.
- **Tests**: the store by unit tests (`SortStoreTests`); the sort itself (text, keys, case, numbers, duplicates, empty
  lines, blocks with short rows, CSV by type with empty and invalid fields, quoted line breaks, the header) and the
  panel (open on a partial selection, keys typed, moved, deleted, the ruler marks, the target following the editor,
  Apply and one undo, floating, hidden, a CSV By columns, stored sorts saved, listed, selected with the keys, the
  actions by name) in the test copy by script. There is no JavaScript unit test project, so the plan's unit tests of
  the key text and the order are among those scripted checks.
