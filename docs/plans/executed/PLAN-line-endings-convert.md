# Plan: Convert line endings

Status: executed 2026-10-27 (branch `line-endings`, was plan 12). From the list "what UltraEdit or Visual Studio
has and LexPen does not". What was decided while building: section 4.

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

## 4. What was decided while building

- **Not an undo step.** The text does not change, so the editor has nothing to undo. Choosing the old line end again
  makes the file unchanged (no longer marked as changed). The action is `lineEnd.set` (crlf, lf, cr), in F1, the
  Convert menu (Line ends) and on a click on the bottom bar's CRLF / LF / CR.
- **CR files** were saved as LF before (only CRLF was recognised); now CR is read, shown and kept.
- **Mixed**: shown as "Mixed" until a kind is chosen; saved without a choice, the file gets the kind most of its lines
  have (as before, but now visible: the tooltip says which). Keeping mixed line ends on save is not possible: the
  editor holds lines, the line end is one per document.
- **A new file** (and a file without a line break) gets the setting `newFileEol`, CRLF by default; it was LF.
- **Drafts** are stored with their line ends, so a draft keeps its choice after a restart.
- **A tab shown only in the preview** (no editor document yet) is converted on save too.
- **Read-only**: a read-only tab, or a file edited in another window, refuses with a message.
- Other windows showing the file read-only are not told; they cannot save it.
