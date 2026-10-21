# Plan: Column guides (a ruler)

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

There is no line at column 80 or 120 to keep lines short, and no ruler with column numbers. UltraEdit has a column
ruler and a column marker; Visual Studio has guidelines.

## 2. The solution, in brief

Column guides as thin vertical lines in the editor, from three settings: a first column, a step after it (a guide
every step columns from the first one; 0 for none), and one extra column on its own (as 80). Each is easy to set
or clear in the settings and from the editor's context menu; the same for every language. Optionally a ruler above
the editor with the column numbers and the cursor's column marked.

## 3. Details

- Drawn as a background layer (CSS on the code area), at the column times the character width; with the editor's
  font monospaced only (as virtual space).
- Settings: `columnGuideStart` (0: none), `columnGuideStep` (0: only the start), `columnGuideExtra` (0: none).
  Example: start 4, step 4 gives guides at 4, 8, 12, ...; extra 80 adds one at 80.
- Not per language: one set for all files.
- The context menu: "Column guide here" (sets the extra one at the cursor's column) and "Clear column guides".
- The colour: the theme's `border`, or a theme colour `guide`.
- With wrapping on: still drawn (the wrap point is the window's width).

### 3.1 Tests

In-app: a guide at 80 lands after 80 characters; start and step; the extra one; set and clear from the context menu; zoom keeps them at their column.

## 4. Open questions

1. The ruler above the editor too, or only the lines?
