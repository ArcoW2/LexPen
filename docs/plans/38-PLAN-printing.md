# Plan: Printing, with a preview

Status: draft 2026-11-07; not started.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

LexPen cannot print. There is no print command, and the browser's own Print was removed from the right-click menus
on purpose (features.md: "No printing"). A document has to be opened elsewhere to get it on paper, and then its
highlights and their notes are lost. Wanted: print the document to a printer, with or without its highlights and
notes, with settings such as the margins, with a preview of the pages first; for every kind of document LexPen
shows, a PDF included.

## 2. The solution, in brief

File > Print... opens a Print window: at the left the pages as they will come out, at the right the options (printer,
paper, orientation, margins, what to print, highlights and notes, header and footer). The pages are an HTML page laid
out to the paper by the page itself, so the preview is the print. Print hands that page to WebView2's print with the
chosen printer and settings; Save as PDF writes the same pages to a file. A PDF document prints its own pages, with
its highlights drawn on them.

## 3. Details

### 3.1 What is printed, per kind of document

| Document | Printed as |
|---|---|
| Text and code | The text, in the editor's font, with the syntax colours (or black, 3.3); long lines wrapped, never cut |
| Markdown, HTML | Choice: the rendered preview, or the text as above |
| CSV | Choice: the column view as a table, or the text as above |
| PDF | Its own pages, at their own size, scaled to the paper |
| Image | The image, fitted to the page |

- The whole document, the selection, or a page range (from the preview's page numbers).
- The text is laid out from the document, not taken from the editor: CodeMirror only has the lines in view in the
  page, so the print page builds every line itself, with the same colouring as the editor (its mode run over the
  text).

### 3.2 Highlights and notes

- Off: no highlights, no notes.
- Highlights: the marked text in its highlight colour, no notes.
- Highlights and notes: the colour, plus a small number at the end of each highlight with a note; the notes are listed
  by that number (3.6, question 2).
- The same for a PDF: its highlights drawn on the page images where they sit on screen, the notes numbered.

### 3.3 The options

- **Printer**: the installed printers, the default first; the paper sizes and colour / black and white that printer
  has.
- **Orientation**: portrait, landscape.
- **Margins**: top, bottom, left, right in mm, one value for all four with a link to set them apart. This is the
  "border width" asked for (3.6, question 6).
- **Text size**: the font size on paper (the editor's zoom does not count).
- **Line numbers**: on or off (text and code).
- **Colours**: the syntax colours, or black text. Always on a white page, whatever the theme.
- **Header and footer**: the file name, the page number "x of y", the date; each on or off.
- **Copies**, and two-sided when the printer can.
- The options are kept as the last used ones (the settings file, a group Print), so the next print starts from them.

### 3.4 Preview

- Shows the real pages: paper size, margins, header and footer, the breaks where the printer will break.
- Updates as an option changes; the page count shown ("12 pages").
- Zoom (fit page, fit width) and scrolling through the pages; the page range can be picked from it.
- Large documents: the pages are laid out in parts, the ones in view first, so the window opens without waiting for
  the whole document; Print waits for all of them.

### 3.5 How

- The Print window is a WebView page of its own (as Settings and the other tool windows): the options, and the pages
  in an iframe holding the print page.
- The print page uses CSS for paper (`@page` size and margins, page breaks), so what the iframe shows is what prints.
- Print: WebView2 `PrintAsync` on that page, with `CoreWebView2PrintSettings` (printer name, copies, page ranges,
  orientation, margins, scale, duplex, colour mode, backgrounds on for the highlight colours, the browser's own header
  and footer off: LexPen draws its own).
- Save as PDF: `PrintToPdfAsync` with the same settings, to a file picked in a Save dialog.
- The installed printers and their papers: .NET `PrinterSettings` on the host side.
- A PDF document: pdf.js renders each page to an image at print resolution, the highlights drawn on it, one image
  per page.

### 3.6 Open questions

1. "Also for e.g. PDF": printing a PDF opened in LexPen (3.1), or saving any document as a PDF file (3.5), or both?
   The plan has both.
2. The notes: as numbered footnotes on the page where the highlight is, as a list at the end of the document, or in
   the margin beside the line?
3. The Print window: a window of its own (larger, the preview needs room), or a panel as the others?
4. Colours: as 3.3 (syntax colours or black, always on white), or also the theme as on screen (a dark page)?
5. The first build: all kinds of 3.1, or text and code, Markdown and PDF first, CSV and images later?
6. "Border width": the page margins (3.3), or a frame line drawn around the text?
7. A key: Ctrl+P is the usual one, but in keys.json it starts the paragraph chords (Ctrl+P, B bullet list; Ctrl+P, N
   numbered; ...). Ctrl+Shift+P is free: use that, or move the paragraph chords and take Ctrl+P?

### 3.7 What does not work, alternatives

- **The browser's print dialog** (WebView2 `ShowPrintUI`): it has a preview and the printer choice, for free. But it
  knows nothing of highlights, notes, line numbers or the syntax colours, it prints the screen's page (the editor
  shows only the lines in view), and it looks like Edge, not LexPen. Usable at most as a "More printer settings"
  button for options LexPen does not show.
- **Printing the editor as on screen**: CodeMirror has only the visible lines in the page, so a long document would
  print one screen.
- **The Windows print dialog** (.NET `PrintDocument`): a preview control and all printer settings, but every page
  drawn by hand in GDI: the syntax colours, Markdown rendering and wrapping all made again. The HTML page gets them
  from what LexPen already has.
- **A PDF sent to the printer unchanged**: fine without highlights, but the highlights and notes would be missing;
  rendering the pages keeps one way for all.

### 3.8 Tests

- Unit (C#): the print options kept and read back; the printer list read without failing when there is none.
- In the test copy by script: the page count changes with the margins and the text size; the highlights and the
  note numbers appear only with their option; Save as PDF writes a file with the preview's page count; a PDF document
  gives one page per page.
- By hand: a real printer (paper, duplex, colour) and the look of the preview.
