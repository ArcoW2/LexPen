# Plan: The CSV definition set from a macro, and recorded

Status: executed (2026-11-26); see As built.

## 1. What this is about

How a CSV is read (delimiter, first data line, header line, quotes, escape, and per column its name, type, format,
...) can only be set in the Columns... window or by dragging in the column view. A macro cannot set any of it, and a
recording leaves it out. A macro that writes a CSV (for example a list of connections with a header line) gets the
definition LexPen guesses; the guess takes no header when no column holds numbers, so the header line is shown as
data and the macro cannot correct it.

## 2. The solution, in brief

Actions that set the active document's CSV definition: one per attribute of the file (`csv.delimiter`,
`csv.firstDataLine`, `csv.header`, `csv.quote`, `csv.escape`), one for a column's attributes (`csv.column 1 "name"
"Id" "type" "text"`, the column by its place or its name) and one for the order of the columns in the view
(`csv.columnOrder`). Each works as Apply in Columns... does: the view redraws and the definition is kept for the file
or draft. While a macro is recorded, every change of the definition (Columns... Apply, and the column view's move,
size, hide and show) is written into the macro as these actions, only what changed.

## 3. Details

### 3.1 The file's attributes

One action per attribute, so a recording reads as a list of what was set.

| Action and values | What |
|---|---|
| `csv.delimiter ";"` | The delimiter: `,` `;` `\|` or `"\t"`. A second value `"trim"`: spaces around values are dropped (the definition's `trim`); `"notrim"`: kept |
| `csv.firstDataLine 2` | The line the data starts on, 1-based: the lines above it (the header line among them) are not data |
| `csv.header 1` | The line with the column names, 1-based; `0`: no header |
| `csv.quote "\""` | The quote; one value: the same at both ends; two values: start and end (`csv.quote "[" "]"`); `""`: no quotes |
| `csv.escape "double"` | A quote inside quotes: `"double"` (written twice), `"char"` with its character (`csv.escape "char" "\\"`), `"none"` |

- The header line lies above the data. `csv.header n` on or below the first data line moves the data to the line
  after the header: `csv.header 1` alone means names on line 1, data from line 2. `csv.firstDataLine` on or above the
  header line is a mistake: "the data cannot start on line 1: the header is on line 2".
- The definition keeps what it has now (csv.js `skip`: the number of lines before the data); `csv.firstDataLine n` is
  `skip` n - 1, and recording writes `skip` + 1.
- The Columns... window says it the same way: its field "Lines before the data" (columns.html `cp-skip`, a count, 0
  for none) becomes "First data line" (1-based, at least 1): it shows `skip` + 1 and Apply keeps the value - 1
  (columns-pane.js). Its hint: the lines above it (the header line among them) are not data. docs/features.md says
  "first data line" where it says "lines before the data" for this field.
- After a change of the delimiter, quote, escape, first data line or header, the columns are fitted to the file
  again (csvFit): a column keeps its settings when its name (or place) is still there; a new column is detected.

### 3.2 A column's attributes

`csv.column <column> <attribute> <value> <attribute> <value> ...`: the given attributes of one column set, the
others kept.

- The column: a number is its place in the file (1-based, the order of the text in the editor, not as shown after a
  reorder); a text is its name (the header's name, or the name set for it). A column named "1" is reached by its
  place. A name no column has, or a place past the last column: a mistake.
- Every attribute name and value is a macro value, between quotes as every value is:
  `csv.column 1 "name" "Connection" "type" "text" "quote" "'"`, `csv.column "UserId" "hidden" "true"`. (Bare words
  as values would change the language for every action: a forgotten quote or a misspelled variable would no longer
  be a mistake.)

| Attribute | Values |
|---|---|
| `name` | The column's name (shown in the header of the view) |
| `type` | `text`, `integer`, `decimal`, `date`, `boolean`, `auto` |
| `quote` | The column's own quote, both ends; `quoteStart` and `quoteEnd` set one end each |
| `decimal`, `group` | The decimal and thousands separators of a number |
| `pattern` | A date as written in the file (`yyyy-MM-dd`) |
| `format` | How a value is shown |
| `align` | `left`, `right` |
| `trim` | `true`, `false` |
| `hidden` | `true`, `false` |
| `width` | Its width in the view, a number |

- The attribute names are the definition's own (csv.js), with `quoteStart` added for the start quote (the
  definition calls it `quote`); `quote` in a step sets both ends. A column's place in the view is not one of them:
  that is `csv.columnOrder` (3.3).
- An attribute that is not one, or a value that does not fit (a type that is not one, a width that is no number): a
  mistake at that line, nothing set (`onerror continue` goes on, `$$error` true).

### 3.3 The order of the columns

`csv.columnOrder <column> <column> ...`: the columns as the view shows them, left to right, every column once, each
by its place in the file or by its name (mixed is allowed): `csv.columnOrder 3 1 2`,
`csv.columnOrder "UserName" "UserId" "state" "connectionId"`.

- A column missing, one named twice, or one that is not there: a mistake, the order unchanged.
- It sets the definition's `order` of every column; it does not change the text (that is Write the columns in this
  order, `csv.writeOrder`).
- Recording writes the order by name when every column has a distinct name, else by place, so the step reads as the
  view looks.

### 3.4 For all of them

- They work on the active document when it is read as CSV (the CSV language, or Read as CSV for another one).
  Otherwise: a mistake, "the document is not read as CSV" (`setLanguage "csv"` or `csv.toggle` first).
- Each applies at once, as Apply does (csvApply: the view redraws, the definition is kept next to the file or in
  LexPen's store, the Columns window follows). Several steps in a row redraw several times; with `screen off` that
  is not seen [cost not yet measured].
- From keys.json they work too; outside a macro a mistake is a message.
- The reading of the values and the change of a definition are pure functions in csv.js (an action and its values
  applied to a definition, or the mistake; the steps for two definitions), so the macro, the keys, the recording and
  the tests use the same code.

### 3.5 Recording

- Every change of the definition passes through csvApply (Columns... Apply, Save definition next to the file, the
  column view's move, size, hide and show). While a macro is recorded, csvApply compares the definition before with
  the one after and records steps for what differs, in this order:
  1. The file's attributes that changed, each its own step (`csv.delimiter`, `csv.firstDataLine`, `csv.header`,
     `csv.quote`, `csv.escape`).
  2. Per column that changed, one `csv.column` step with only its changed attributes; the column by its name when it
     has one no other column has, else by its place.
  3. When the order in the view changed: one `csv.columnOrder` step with every column.
- Columns that changed only because the file's attributes did (fitted again, detected) are not recorded: the replay
  fits them the same way. The comparison is with the definition before, with the new file attributes, fitted to the
  text (csvFit), so only what was set by hand remains.
- An action that changes the definition itself and is recorded as itself (`csv.writeOrder`, which also rewrites the
  text; `csv.toggle`) records no csv steps besides: csvApply records only when it is not called from inside a
  recorded action.
- Running a `csv.*` action from a key or the menu while recording records that action as any action is recorded
  (recordAction); csvApply then records nothing more for it.

### 3.6 The reference

- defaults/macros/reference.md: a section CSV with the file's actions, `csv.column` and its attributes,
  `csv.columnOrder`, and an example (a macro that writes a CSV with a header line and sets `csv.header 1`).

### 3.7 Tests

- CsvTests (Jint, csv.js): every action applied to a definition; the mistakes (an attribute that is not one, a value
  that does not fit, a column by a place past the last or a name no column has, the data on or above the header, an
  order with a column missing or twice); `csv.header` moving the first data line down; `quote` with one and two
  values, `quoteStart` / `quoteEnd` on a column; a column by name and by place; `csv.columnOrder` by place, by name
  and mixed. The steps from two definitions: only what changed, in order; columns fitted again not recorded; a
  column with several changes in one step; by name, and by place when names repeat; the order as one step.
- By hand in the app: the Columns... window's First data line (shows 1 for a file without lines before the data,
  2 below a header line; Apply keeps it); a macro that writes a CSV and sets its header; recording while changing things in Columns...
  and in the column view (move, size, hide, show), then playing the recording on another file; the actions from a
  key; a document not read as CSV.

## 4. Open questions

None.

## 5. As built

- csv.js: `csvStep(def, action, values, text)` (one step: `{ def }` or `{ error }`), `csvSteps(before, after, text)`
  (the steps between two definitions), `csvColumnNames`, `csvColumnRef`, `csvSlots`. The columns' number and names
  come from the first part of the text, as csvFit reads it.
- csvview.js: the actions `csv.delimiter`, `csv.firstDataLine`, `csv.header`, `csv.quote`, `csv.escape`,
  `csv.column`, `csv.columnOrder` (group view), through `csvDefinitionStep`: the active document, loaded first when
  it has no definition yet; a mistake is a MacroError in a macro, else a message. They apply with csvApply and
  `record: false` (recorded as themselves by recordAction).
- Recording: `csvApply(doc, def, { record })` calls `csvRecord`, which writes the csvSteps of the change. Not recorded
  besides: the csv actions themselves and Write the columns in this order. A column's box records once when it
  closes (Close, Enter, a click outside, another box), what changed since it opened; Esc records nothing.
- Different from 3.1 - 3.5:
  - `csv.delimiter` takes any text (the Columns window allows a delimiter of more than one character), not only the
    four signs.
  - A recording writes `csv.header` before `csv.firstDataLine`: the header step can move the data down itself, and
    `csv.firstDataLine` is checked against the header as it is by then.
  - A cleared format or pattern is recorded as `""`; a column's own quote set back to the file's (unset) is not
    recorded (no step can say "unset").
  - A column whose name is a number is recorded by its place (a number in a macro is a place).
  - Numbers in steps (places, line numbers, a width) are written without quotes.
- The Columns window: the field is "First data line" (shows `skip` + 1, at least 1).
- Reference: defaults/macros/reference.md, section CSV, with an example. docs/features.md: CSV definition from a
  macro; the Columns pane's first data line.
- Tested: CsvTests (the header moving the data, the first data line against the header, delimiter / quote / escape,
  a column by place and name with several attributes and the mistakes, the order by place, name and mixed with a
  column missing or twice, the steps between two definitions and played back, a repeated name by place); all tests
  pass. Not yet tried by hand in the app (3.7).
