# Plan: Bookmarks in a PDF

Status: draft 2026-11-09, revised 2026-11-09; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

Bookmarks work in the editor and in the preview (executed/PLAN-preview-bookmarks.md), not in a PDF: the bookmark
actions need an editor or a preview, so their keys (Ctrl+K, 1; Ctrl+Q, 1; next / previous; Toggle bookmark) do
nothing in a PDF tab, and the ribbon's Bookmarks group and the Bookmarks pane show nothing for it. In a long PDF (a
reference of hundreds of pages) the places to come back to are exactly what is missing, and a PDF has no gutter to
show them in.

## 2. The solution, in brief

The bookmark actions work in a PDF at its place: where it was clicked last (the caret a click shows), else the top
of the page shown. A bookmark there is a page and a place in that page's text, numbered 1 to 9 or unnumbered as in a
text file, kept per file in the same store, so it is there again when the PDF is opened again. The PDF gets a narrow
gutter of its own at the left of its view (no line numbers), showing them at the height of their line, a numbered
one with its number; a click there toggles a bookmark as in the editor's gutter; the scroll strip marks them as it
does for a text file. Go to, next / previous, the list, the Bookmarks pane and the ribbon's drop-down list them with
their page and the start of their text.

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
  file. A PDF is read-only to LexPen, so its text does not move. A PDF changed on disk (another version of the same
  file): each bookmark looked up again by its text, on its page and the pages around it, as a text file's are by
  their line (BookmarkStore Resolve); not found, it stays at its page and offset.

### 3.2 Shown

- **A gutter in the PDF**: a narrow column of its own at the left of the PDF's view, beside its scroll area (the
  pages a little narrower for it), as the editor's bookmark column without the line numbers. It does not scroll
  sideways (zoomed in and scrolled to the right it stays at the left); up and down it follows the pages. Each
  bookmark an icon in it at the height of its line: the bookmark shape as in the editor's gutter, a numbered one with
  its number on it. Drawn by the frame (pdf-pane.js) from the list the window sends, as the highlights are.
- **The scroll strip** (previewoverview.js, pdfOverviewMarks): a mark per bookmark, in the bookmarks' lane, as for a
  text file.
- **A click in the gutter**: as in the editor's bookmark column (app.js gutterClick): on a bookmark it goes; beside one
  an unnumbered bookmark comes on the line at that height (the first text of that line on the page there; beside
  the text, the nearest line).

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
  (at the top of the view); the icons in the gutter at the right height, zoomed in and scrolled sideways still in
  view; a click in the gutter beside text (a bookmark there) and on an icon (gone); Go to bookmark 1 from far away;
  next / previous through them in order; Clear; the Bookmarks pane and the ribbon's drop-down list them with their
  page; a restart and the PDF opened again: the bookmarks back; the scroll strip's marks.
- Unit (C#): a PDF's bookmarks looked up by their text in another version of the file (moved a page down, found;
  their text gone, kept where they were).

### 3.5 Alternatives

- **The PDF's own bookmarks** (its outline, shown in the Outline pane): the author's chapters, not the reader's
  places, and writing into the PDF changes the file; LexPen keeps the reader's next to it, as for a text file.
- **Highlights as bookmarks** (they exist for PDFs already): a highlight marks text and has a note; a bookmark is a
  place to jump to with a key. Both stay.

## 4. Open questions

None.
