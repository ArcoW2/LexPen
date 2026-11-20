# Plan: Compare in Hex

Status: draft 2026-11-20; not started.

## 1. What this is about

Compare works on text only. Two files LexPen does not know (Word files from Explorer's Compare to) open in Hex, and
Hex has no editor, so the compare could not run: it stopped halfway, showed the two Hex views side by side without
any difference marked, and closing LexPen then failed ("cannot read properties of null (reading 'getCursor')",
compare.js compareSession). For now a compare with a side in Hex stops at once with a message (compare.js
startCompare). This plan replaces that message with a real compare of bytes.

## 2. The solution, in brief

A compare where a side is shown in Hex shows both sides in Hex, scrolling together, offset against offset. The bytes
that differ are tinted, the bytes past the end of the shorter file are marked as only in the other, and the compare
bar works as for text: the count of differences, next and previous difference, the overview strip. A difference is a
run of differing bytes. Editing stays possible; the compare follows each change.

## 3. Details

### 3.1 What is compared

- Byte at offset n against byte at offset n. No alignment of inserted or deleted bytes (see Open questions 1).
- A difference: a run of offsets where the bytes differ; runs closer than one line (hexBytesPerLine) apart count as
  one, so a scattered change is not a hundred differences.
- The longer file's tail: one difference, "only on the left / right".
- Both sides use their own hexLoad (hexview.js): a binary file its bytes from the host, a text tab its bytes as they
  would be saved. A compare of a binary file with a text file is then a compare of bytes too.

### 3.2 Where it plugs in

- compare.js now assumes CodeMirror on both sides (runCompare, watchSide, applyCompare, compareGo, drawStrip,
  compareSession, the scroll following). A compare gets a kind, `text` or `hex`, set in startCompare from the sides;
  each of those functions branches on it, or the hex kind gets its own small set beside them. Which of the two reads
  better is decided while building, by how much is shared.
- The difference runs are worked out in the page (a Uint8Array compare is cheap); a very large file in a worker as
  the line compare is (diff.worker.js), if measured to need it: [not yet measured].
- hexDraw (hexview.js) gets the runs of its tab to tint; the tint colours are the compare's own (the theme's
  compare colours), not new ones.
- Scrolling together: line n on the left with line n on the right (same offsets per line on both sides: the same
  hexBytesPerLine setting).
- The session keeps a hex compare as it keeps a text one (the two sides, the offset of the cursor, the top line);
  restoreCompare puts it back.

### 3.3 A text tab shown in Hex

A text tab switched to Hex by the user (hexChosen) on one side and a text tab in the editor on the other: compare as
text, the Hex side switched back to the editor for the compare (as the compare already sets the mode to edit). Only a
side that can only be Hex (doc.binary) makes it a hex compare.

### 3.4 Not in this plan

- PDF sides (doc.pdf): a PDF is only its preview, so the same null editor may hit a compare of two PDFs:
  [not yet checked]. If it does, the same "text only" message as Hex has now.
- A compare of what is inside an Office file (see Open questions 2).

### 3.5 Tests

- Unit (tests/, if the run builder moves to a module the tests can reach; else in-app): equal files, no
  differences; one byte changed; a run; two runs closer than a line merged; one file longer.
- In-app: two .docx from Explorer's Compare to; two copies of a binary file with one byte patched; next / previous
  difference; scrolling one side scrolls the other; editing a byte updates the marks; close and reopen LexPen with
  the compare open; a text tab in Hex against a text file compares as text.

## 4. Open questions

1. Offset against offset only, or also align inserted and deleted bytes (a byte diff, as the line compare aligns
   lines)? Offset-only is simple and right for patched binaries; after an insertion everything behind it shows as
   different.
2. Word files (.docx, .xlsx) are zip archives: one changed word changes compressed bytes from there on, so a byte
   compare of two Word files shows mostly "different" and says little. Should LexPen, for Office files, compare their
   text instead (the document's words, taken from the archive by the host), and keep the byte compare for other
   binaries?
