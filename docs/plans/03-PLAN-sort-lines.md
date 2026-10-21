# Plan: Sort lines, remove duplicates

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Lines cannot be sorted. UltraEdit has a Sort dialog (ascending, descending, ignore case, numeric, by column,
remove duplicates) and "Delete duplicates"; Visual Studio sorts with an extension.

## 2. The solution, in brief

Conversions in the Convert menu, as the case ones: Sort lines (A to Z, Z to A), Sort numerically, Reverse lines,
Remove duplicate lines, Remove empty lines. On the selected lines, else the whole file; one undo step. Options for
case and for a column of a block come from where they are asked: case as a separate item, a column by sorting a
block in column mode (its text decides the order of the whole lines).

## 3. Details

- Order: by the user's language (`Intl.Collator`, so `a`, `B`, `c` sort as words, not by code), numbers inside
  a line by value with "natural" sort (`file2` before `file10`) as an item of its own.
- Case: "ignore case" as default; an item "Sort lines (case sensitive)".
- Duplicates: the first one stays, the order of the rest is kept; "ignore case" and "ignore leading/trailing
  whitespace" as variants.
- Column mode: a block selected; the lines sort by the block's text in each line (UE's sort by column), the whole
  lines move.
- The last line without a line break: keeps it so after sorting (no line break added or lost).
- They are pack actions of plain text (`convert: sortAsc` ...), so every language has them and a pack can put one
  on its bar.

### 3.1 Tests

In-app: each kind on a selection and on the whole file; natural sort; duplicates with case; a block as the key;
the last line without a break; undo is one step.

## 4. Open questions

1. Default case: ignore case (as UE's default) or case sensitive?
2. A dialog with all options at once (as UE), or the menu items only?
