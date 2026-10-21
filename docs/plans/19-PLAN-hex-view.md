# Plan: Hex view

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

A binary file, or the exact bytes of a text file (its BOM, a stray character), cannot be seen. UltraEdit has a hex
mode (view and edit).

## 2. The solution, in brief

A view "Hex" for a tab: offset, bytes in hex, and the characters, read-only first; binary files that are opened
show it instead of garbage.

## 3. Details

- The host reads the bytes (a large file in pieces, as the view scrolls).
- Read-only in this plan; editing bytes (overwrite only) as a second step.
- Find in hex: bytes or text.

### 3.1 Tests

In-app: a small binary file in hex; a text file with a BOM shows EF BB BF; scrolling a large file.

## 4. Open questions

1. Editing bytes: needed, or view only?
