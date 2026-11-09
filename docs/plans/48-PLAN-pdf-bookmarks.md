# Plan: Bookmarks in a PDF

Status: draft 2026-11-09; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

Bookmarks work in the editor and in the preview (executed/PLAN-preview-bookmarks.md), not in a PDF: the bookmark
actions need an editor or a preview, so their keys (Ctrl+K, 1; Ctrl+Q, 1; next / previous; Toggle bookmark) do
nothing in a PDF tab, and the ribbon's Bookmarks group and the Bookmarks pane show nothing for it. In a long PDF (a
reference of hundreds of pages) the places to come back to are exactly what is missing, and a PDF has no gutter to
show them in.

## 2. The solution, in brief

The bookmark actions work in a PDF at its place: where it was clicked last (the caret a click shows), else the top
of the page shown. A bookmark there is a page and a place in that page's text, numbered 1 to 9 or unnumbered as in a
text file, kept per file in the same store, so it is there again when the PDF is opened again. The PDF shows them as
small icons at the far left of its view (it has no gutter), at the height of their line, a numbered one with its
number; the scroll strip marks them as it does for a text file. Go to, next / previous, the list, the Bookmarks pane
and the ribbon's drop-down list them with their page and the start of their text.

## 3. Details

### 3.1 A bookmark in a PDF

- **Its place**: { page, offset } in that page's text as the find bar and the highlights read it (pdffind.js,
  pdf-pane.js), plus the start of the text there (as a text file's bookmark keeps its line's text), for the lists.
- **Where an action puts it**: where the PDF was clicked last (`pressedAt`, the caret; plan of the click caret in
  pdf-pane.js), else the first text at the top of the view (its page and offset there).
- **Numbered and unnumbered**: as in a text file: Store / Toggle bookmark n (1 to 9) and Toggle bookmark (unnumbered);
  storing n again moves it; Clear bookmark n, Clear all.
- **Kept**: in bookmarks.json (BookmarkStore.cs), under the PDF's path, the list items { n, page, offset, text }
  beside a text file's { n, line, ch, text }; loaded when the PDF opens, written when one changes, renamed with the
  file. A PDF is read-only to LexPen, so its text does not move; a PDF changed on disk keeps them where they were
  (open question 2).

### 3.2 Shown

- **In the PDF**: a strip at the far left of the PDF's view (over the PDF's background, not over its page), fixed
  sideways (zoomed in and scrolled to the right it stays at the left edge of the view), going along up and down with
  the pages. Each bookmark an icon in it at the height of its line: the bookmark shape as in the editor's gutter, a
  numbered one with its number on it. Drawn by the frame (pdf-pane.js) from the list the window sends, as the
  highlights are.
- **The scroll strip** (previewoverview.js, pdfOverviewMarks): a mark per bookmark, in the bookmarks' lane, as for a
  text file.
- **A click on an icon**: open question 1.

### 3.3 The actions in a PDF

- Every bookmark action gets a PDF path beside its editor and preview ones (bookmarks.js: `preview` says which now):
  Store / Toggle / Clear bookmark n, Toggle bookmark, Go to bookmark n, Next / Previous bookmark (in page and offset
  order, from the PDF's place), Clear all, the list (Ctrl+K, L) at the PDF's place.
- **Going to one**: the PDF scrolls so its line is in view, as a found match is shown (pdf-pane.js findShow), and the
  click caret is put there (F3 and the next bookmark action go on from it).
- **The Bookmarks pane** (bookmarkspane.js) and the ribbon's Manage bookmarks drop-down: a PDF's bookmarks with
  "p. 12" and the start of their text; a click goes there.

### 3.4 Tests

- Unit (C#, BookmarkStore): a PDF's list { n, page, offset, text } written, read back and renamed with the file.
- In the test copy, with a long PDF: a click and Ctrl+K, 1 (bookmark 1 at the caret); Toggle bookmark with no click
  (at the top of the view); the icons at the left edge at the right height, zoomed in and scrolled sideways still at
  the left edge; Go to bookmark 1 from far away; next / previous through them in order; Clear; the Bookmarks pane and
  the ribbon's drop-down list them with their page; a restart and the PDF opened again: the bookmarks back; the scroll
  strip's marks.

### 3.5 Alternatives

- **The PDF's own bookmarks** (its outline, shown in the Outline pane): the author's chapters, not the reader's
  places, and writing into the PDF changes the file; LexPen keeps the reader's next to it, as for a text file.
- **Highlights as bookmarks** (they exist for PDFs already): a highlight marks text and has a note; a bookmark is a
  place to jump to with a key. Both stay.

## 4. Open questions

1. **A click in the strip at the far left**: in the editor a click in the bookmark column toggles an unnumbered
   bookmark on that line (app.js gutterClick: on a bookmark it goes, elsewhere one comes). The same in the PDF
   (on an icon: removed; beside one: an unnumbered bookmark on the line at that height), or only show the icons?
   Suggestion: the same as the editor, so the strip works as the gutter does.
2. **A PDF changed on disk** (another version of the same file): its bookmarks stay at their page and offset (they
   may then point at other text), or are they looked up again by their text, as a text file's are (BookmarkStore
   Resolve)? Suggestion: looked up by their text on the same page and the pages around it; not found: kept where they
   were.
