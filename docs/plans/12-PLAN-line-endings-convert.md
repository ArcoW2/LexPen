# Plan: Convert line endings

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

A file keeps the line endings it was read with (CRLF, LF, CR), shown in the bottom bar, but they cannot be changed.
UltraEdit converts (DOS / Unix / Mac) from its File menu; Visual Studio from Advanced Save Options.

## 2. The solution, in brief

A click on the line endings in the bottom bar (and the Convert menu) offers CRLF, LF and CR; the choice converts
the document and is written at the next save. A setting gives the line ending of a new file.

## 3. Details

- The document is LF inside (CodeMirror); the file's line ending is a property of the document used on save
  (diskText). The conversion changes that property and marks the document changed (one undo step).
- Mixed line endings in a file: shown as "Mixed"; converting makes them one kind.
- New files: the setting (CRLF on Windows by default).

### 3.1 Tests

In-app and unit (host): LF to CRLF written on save; mixed shown and converted; undo; a new file's default.

## 4. Open questions

1. Is "Mixed" detected now (to check in TextFile)?
