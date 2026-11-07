# Plan: Printing and Save as PDF, with a preview

Status: draft 2026-11-07, questions answered 2026-11-07; not started.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

LexPen cannot print. There is no print command, and the browser's own Print was removed from the right-click menus
on purpose (features.md: "No printing"). A document has to be opened elsewhere to get it on paper or into a PDF, and
then its highlights and their notes are lost. Wanted: print any document LexPen shows (text, Markdown, HTML, CSV, a
PDF, its images), or save it as a PDF, with or without its highlights and notes, with a preview of the pages first,
and with the settings kept and reusable as the Sort's are.

## 2. The solution, in brief

File > Print... (Ctrl+Shift+P), and Print... on a file in the Folder pane, open a Print window: at the left the pages
as they will come out, at the right two tabs, Print (the options) and Stored settings (named sets of options, with
templates, as the Sort panel has). The pages are an HTML page laid out to the paper by the page itself, so the preview
is the print. Print hands that page to WebView2's print with the chosen printer; Save as PDF writes the same pages to
a file. A PDF document prints its own pages, with its highlights and notes drawn on.

## 3. Details

### 3.1 What is printed, per kind of document

| Document | Printed as |
|---|---|
| Text and code | The text, in a font and size of its own (3.3), with the colours of 3.4; long lines wrapped, never cut |
| Markdown, HTML | Choice: the rendered preview (its images included), or the text as above |
| CSV | Choice: the column view as a table, or the text as above |
| PDF | Its own pages, at the zoom of 3.3 |
| Image (in Markdown or HTML) | At the zoom of 3.3, not always the page's size |

- The whole document, the selection, or a page range (from the preview's page numbers).
- The text is laid out from the document, not taken from the editor: CodeMirror only has the lines in view in the
  page, so the print page builds every line itself, with the same colouring as the editor (its mode run over the
  text).
- From the Folder pane: right-click a file > Print... opens the Print window on that file without opening it in a tab
  (a PDF, a text file, a Markdown file); its highlights are those stored for it.
- Opening an image file (JPG, PNG, ...) as a document is not possible yet; that is a plan of its own. Once it is, an
  image document prints as a PDF page does.

### 3.2 Highlights and notes

- **Highlights**: off, or on, marked as chosen: a shaded background (the highlight colour, lighter), an underline, a
  wavy underline, a box, or bold. Each highlight gets a marker in the text (a small number) so its note can be found.
- **Notes**: off, or placed:
  - in a margin beside the text, left or right, with a width of its own; each note at the height of its line;
  - at the bottom of the page where its highlight is, as footnotes;
  - at the end of the document, as a list.
- Notes are listed by their marker number; a highlight without a note gets no number (unless the marker setting says
  every highlight).
- The same for a PDF: its highlights drawn on the page images where they sit on screen, the notes placed as above
  (a margin beside a PDF page shrinks the page to make room).

### 3.3 The options (the Print tab)

- **Printer**: the installed printers, the default first; the paper sizes and colour / black and white that printer
  has. Copies; two-sided when the printer can.
- **Paper**: size, orientation (portrait, landscape).
- **Margins**: top, bottom, left, right in mm, one value for all four with a link to set them apart.
- **Frame**: off, or a line around the text area, with its width and intensity.
- **Text**: the font and size on paper (text and code; the editor's own font and zoom do not count), line numbers on
  or off.
- **Zoom** (PDF pages and images): Auto (the document's own size, shrunk only when it does not fit), Fit to width,
  Fit to height, Fit to page, or a percentage.
- **Colours**: as 3.4.
- **Highlights and notes**: as 3.2.
- **Header and footer**: the file name, the page number "x of y", the date; each on or off.

### 3.4 Colours

- Choice: the current theme, another theme (the list of themes), black and white, or greyscale.
- The current theme while it is a dark one: a warning line ("A dark theme prints a dark page: a lot of ink"), with
  the other choices one click away. The preview shows it as it would print.

### 3.5 Stored settings (the Stored settings tab)

As the Sort panel's stored sorts (docs/plans/executed/PLAN-sort-lines.md):

- The last used settings are kept by themselves (hidden, not in the list) and come back in the next Print window,
  with the name of the stored set they came from; nothing stored is ever overwritten by itself.
- Buttons: Print, Save as PDF..., Save, Save as..., Revert, New; the name of the set at the bottom, in italics when
  changed.
- Templates: pinned sets listed first, a divider, then the others. Right-click a set: Select (double-click), Rename...,
  Pin as template; a template: Use as new (double-click), Rename..., Edit, Unpin as template. A name already used
  cannot be given again; Save as... over a set warns, over a template refuses (use Edit).
- Printer and paper are part of a set. A set whose printer is not installed: the default printer, with a line saying
  so.
- Stored in `prints.json` in the data folder, the same form as `sorts.json`; SortStore's logic (list, templates,
  rename, the last one) is shared rather than copied.

### 3.6 The Print window and its preview

- A window of its own, always (no panel: nobody keeps it open). Closed by Print, Save as PDF, Cancel or Esc.
- The preview shows the real pages: paper size, margins, frame, header and footer, notes, the breaks where the
  printer will break. It updates as an option changes, with the page count shown.
- Zoom of the preview itself (fit page, fit width) and scrolling through the pages; the page range can be picked from
  it.
- Large documents: the pages are laid out in parts, the ones in view first, so the window opens without waiting for
  the whole document; Print waits for all of them.

### 3.7 How

- The Print window is a WebView page of its own (as Settings and the other tool windows): the two tabs, and the pages
  in an iframe holding the print page.
- The print page uses CSS for paper (`@page` size and margins, page breaks, the margin notes in a column beside the
  text), so what the iframe shows is what prints.
- Print: WebView2 `PrintAsync` on that page, with `CoreWebView2PrintSettings` (printer name, copies, page ranges,
  orientation, margins, scale, duplex, colour mode, backgrounds on for the highlight colours, the browser's own header
  and footer off: LexPen draws its own).
- Save as PDF: `PrintToPdfAsync` with the same settings, to a file picked in a Save dialog.
- The installed printers and their papers: .NET `PrinterSettings` on the host side.
- A PDF document: pdf.js renders each page to an image at print resolution, the highlights drawn on it, one image
  per page.
- Ctrl+Shift+P (free in keys.json) and File > Print...; the Folder pane's file menu gets Print....

### 3.8 What does not work, alternatives

- **The browser's print dialog** (WebView2 `ShowPrintUI`): it has a preview and the printer choice, for free. But it
  knows nothing of highlights, notes, line numbers or the colour choices, it prints the screen's page (the editor
  shows only the lines in view), and it looks like Edge, not LexPen. Usable at most as a "More printer settings"
  button for options LexPen does not show.
- **Printing the editor as on screen**: CodeMirror has only the visible lines in the page, so a long document would
  print one screen.
- **The Windows print dialog** (.NET `PrintDocument`): a preview control and all printer settings, but every page
  drawn by hand in GDI: the syntax colours, Markdown rendering and wrapping all made again. The HTML page gets them
  from what LexPen already has.
- **A PDF sent to the printer unchanged**: fine without highlights, but the highlights and notes would be missing;
  rendering the pages keeps one way for all.
- **Ctrl+P**: the usual key, but in keys.json it starts the paragraph chords (Ctrl+P, B bullet list; ...).

### 3.9 Tests

- Unit (C#): the stored print settings (save, list with templates first, rename refusing a taken name, the last one
  kept apart), shared with the Sort's store tests where the logic is shared; the printer list read without failing
  when there is none.
- In the test copy by script: the page count changes with the margins, the font size and the zoom; the highlight
  marks, markers and notes appear only with their option and in the chosen place; the dark-theme warning; Save as PDF
  writes a file with the preview's page count; a PDF document gives one page per page; a stored set comes back after
  a restart.
- By hand: a real printer (paper, duplex, colour) and the look of the preview.

## 4. Open questions

Answered 2026-11-07:

1. PDF: both. Save as PDF for any document, and an opened PDF can be printed; also Print... on a file in the Folder
   pane (3.1).
2. Notes: selectable, in a left or right margin with a width of its own, at the bottom of the page, or at the end; a
   marker in the text; the highlight marked as chosen (shaded, underline, wavy underline, ...) (3.2).
3. Always a window of its own (3.6).
4. Colours selectable: a theme, black and white, greyscale; a warning for a dark theme (3.4).
5. All kinds of 3.1 in the first build, images included, with a zoom (Auto, Fit to width / height / page) also for
   PDF. Opening image files as documents: a plan of its own.
6. A frame: optional, with its intensity (3.3).
7. Ctrl+Shift+P and File > Print...; the font and size for text; stored settings with templates as the Sort's, in a
   tab of their own (3.5).

Still open:

1. The marker in the text: a number for every highlight, or only for those with a note?
2. The shared store: one class for both `sorts.json` and `prints.json` (SortStore made general), acceptable as part
   of this plan?
