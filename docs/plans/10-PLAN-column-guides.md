# Plan: Column guides (a ruler)

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

There is no line at column 80 or 120 to keep lines short, and no ruler with column numbers. UltraEdit has a column
ruler and a column marker; Visual Studio has guidelines.

## 2. The solution, in brief

A setting "Column guides": one or more columns (80, 120, ...), drawn as thin vertical lines in the editor, per
language when the pack or the user says so. Optionally a ruler above the editor with the column numbers and the
cursor's column marked.

## 3. Details

- Drawn as a background layer (CSS on the code area), at the column times the character width; with the editor's
  font monospaced only (as virtual space).
- Per language: `guides: [100]` in a pack, a settings row per language overriding it.
- The colour: the theme's `border`, or a theme colour `guide`.
- With wrapping on: still drawn (the wrap point is the window's width).

### 3.1 Tests

In-app: a guide at 80 lands after 80 characters; two guides; per language; zoom keeps them at their column.

## 4. Open questions

1. The ruler above the editor too, or only the lines?
