# Plan: Column guides, a ruler and manual tabs

Status: executed 2026-10-22 (web/ruler.js; in-app test t87, 37 checks). From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

There is no line at column 80 or 120 to keep lines short, and no ruler with column numbers. UltraEdit has a column
ruler and a column marker; Visual Studio has guidelines. Nor can you set a tab stop of your own at a column, as on
a typewriter or in a word processor, to line text up at chosen places.

## 2. The solution, in brief

Column guides as thin vertical lines in the editor, from three settings: a first column, a step after it, and one
extra column on its own (as 80); the same for every language, easy to set or clear. Above the editor a horizontal
ruler with the column numbers and the cursor's column marked. On that ruler you set manual tabs: a click sets one
(a vertical line through the text, its handle on the ruler), a click on it removes it, its handle drags it, the
right-click menu gives it a colour or clears them all, and a button at the left of the ruler clears them too. Tab
goes to the next manual tab where there is one; elsewhere the normal tab and indent settings stay. Actions tabAdd,
tabRemove and tabClear do the same from a key or a macro.

## 3. Details

### 3.1 Column guides

- Drawn as a background layer (CSS on the code area), at the column times the character width; with the editor's
  font monospaced only (as virtual space).
- Settings: `columnGuideStart` (0: none), `columnGuideStep` (0: only the start), `columnGuideExtra` (0: none).
  Example: start 4, step 4 gives guides at 4, 8, 12, ...; extra 80 adds one at 80.
- Not per language: one set for all files.
- The context menu: "Column guide here" (sets the extra one at the cursor's column) and "Clear column guides".
- The look: faint, a 1 px line in the theme's `border` colour (or a theme colour `guide`), so they stay in the
  background; the manual tabs (3.3) stand out more.
- With wrapping on: still drawn (the wrap point is the window's width).
- Guides only show; they do nothing to the cursor or to Tab (that is what the manual tabs are for).

### 3.2 The ruler

- A horizontal bar above the editor's text (below the format bar), scrolling sideways with the text. The column
  numbers every 10, a tick every 5 and every column; the cursor's column marked (every cursor's with multiple
  cursors); the guides of 3.1 shown as ticks.
- Above the gutter, at the ruler's far left: three buttons. "Clear tabs" (shown when there are manual tabs), "Copy
  tabs from..." and "Copy tabs to..." (each a list of the other open documents; "to" replaces the tabs there).
- Shown or hidden: View > Ruler; actions `ruler`, `rulerOn`, `rulerOff` (on / off actions, as every toggle,
  plan 17); a setting `ruler` for the start value.
- Monospaced fonts only, as the guides (with another font the ruler is hidden and says why in its tooltip).

### 3.3 Manual tabs

- Click on the ruler at a column without a tab: a tab there, drawn as a vertical line through the text and a handle
  on the ruler (a small square at its top corner). Click on a tab's handle: the tab removed.
- Drag a handle: the tab moves along, column by column, until you let go (a drag that starts on the handle is not a
  click: it does not remove it).
- Right-click on the ruler: a menu with colours (a few theme colours and "Other..." for a colour picker) and
  "Clear all tabs". Choosing a colour adds a tab at the right-clicked column in that colour, or recolours the tab
  that is there.
- The look: a tab line is clearly more visible than a column guide: wider (2 px) and in a strong colour. A plain
  click uses the last colour chosen; before any choice the background of the current find match (orange,
  `--find-current`; not the box drawn around it). A coloured tab keeps that width.
- Per document: each document has its own set, gone when it closes; the set can be copied to or from another open
  document (the buttons of 3.2).
- What a tab does: Tab before a manual tab goes to the next manual tab on the right; past the last manual tab, Tab
  works as always (the tab and indent settings). Shift+Tab goes back to the previous manual tab on the left; with
  none to the left, Shift+Tab works as always. So the settings are overruled only up to the manual tabs. With a
  selection over lines, Tab and Shift+Tab indent and unindent as always.
- The fill up to a manual tab is always spaces, also with useTabs (a manual tab need not sit on a multiple of the
  tab width).
- Columns are the visual columns the bottom bar shows (counting from 1), as column mode and virtual space count;
  with virtual space Tab can go past the line's end to a tab.
- With multiple cursors: each cursor goes to its own next manual tab.

### 3.4 Actions

- `tabAdd` with a column (`tabAdd 10`): a tab at column 10; without one: at the cursor's column.
- `tabRemove` with a column (`tabRemove 10`): the tab at column 10 removed, if there is one; without one: the tab at
  the cursor's column.
- `tabClear`: all manual tabs removed (the ruler's button and the right-click item run it).
- Normal actions: in F1, on a key in keys.json, and in macros (plan 17).

### 3.5 Tests

In-app:
- guides: a guide at 80 lands after 80 characters; start and step; the extra one; set and clear from the context
  menu; zoom keeps them at their column;
- the ruler: the numbers line up with the columns, scrolls along sideways, the cursor's column marked;
- tabs: a click adds (wider and stronger than a guide), a click on the handle removes, a drag moves; right-click with a colour adds one in that colour;
  Clear all tabs and the left button clear them; a plain click takes the last colour chosen; copy tabs from and to
  another document; the tabs are per document;
- Tab before a manual tab goes there (spaces, also with useTabs), past the last one the normal tab width; Shift+Tab
  to the previous one, before the first the normal unindent; a selection over lines indents as always; with
  multiple cursors; with virtual space past the line's end;
- tabAdd 10 / tabRemove 10 / tabClear, and without a column at the cursor.

## 4. Open questions

None.

## 5. Resolved during execution

- Columns: a manual tab is at the column a cursor stands in (the bottom bar's Col, from 1), so `tabAdd 10` puts the
  cursor at Col 10. A guide is after so many characters (80: between the 80th and the 81st). On the ruler the numbers
  stand over their columns; a click sets the tab at the column edge nearest to it.
- The editor has no right-click menu of its own (the WebView's is shown), so "Column guide here" and "Clear column
  guides" are in the ruler's right-click menu, with the colours and Clear all tabs.
- The ruler is off by default (setting `ruler`); View > Ruler, actions `ruler`, `rulerOn`, `rulerOff`.
- The tabs are kept in memory per document: gone when it closes and after a restart.
- The colours: orange (a found text, the default), the find box, blue (the cursor), green, purple, red, brown, and
  Other colour... (the colour picker). The handle is a small square at the top right of the line.
- A tab dragged onto another one: the dragged one stays, the other goes.
- Guides use the theme's `border` colour; no theme colour `guide` of its own.
- Shift+Tab to a manual tab only moves the cursor (nothing is removed). In a markdown table Tab still goes to the next
  cell first.
- Found on the way: the locate-the-cursor markers (plan 02) had broken arrow characters in app.css; now plain `^`,
  `v`, `<`, `>`.
- Regression: the column-mode test (t52) fails three clipboard checks ("Requested Clipboard operation did not
  succeed"), the same on main without this change.
