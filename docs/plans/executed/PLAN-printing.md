# Plan: Printing and Save as PDF, with a preview

Status: executed (2026-11-07); see 5. As built.
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
is the print. Save as PDF writes those pages to a file; Print sends the same pages to the printer with the printer's
own settings, which the printer's own dialog (Printer settings...) can change and which stay in step with LexPen's
options. A PDF document prints its own pages, with its highlights and notes drawn on.

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
  wavy underline, a box, or bold. A highlight with a note gets a marker in the text (a small number) so its note can be found; one without a note gets none.
- **Notes**: off, or placed:
  - in a margin beside the text, left or right, with a width of its own; each note at the height of its line;
  - at the bottom of the page where its highlight is, as footnotes;
  - at the end of the document, as a list.
- Notes are listed by their marker number.
- The same for a PDF: its highlights drawn on the page images where they sit on screen, the notes placed as above
  (a margin beside a PDF page shrinks the page to make room).

### 3.3 The options (the Print tab)

- **Printer**: the installed printers, the default first; the paper sizes and colour / black and white that printer
  has. Copies; two-sided when the printer can.
- **Printer settings...**: the printer's own dialog (its driver's: paper bin, intensity, quality, stapling, ...).
  Both ways in step: it opens with LexPen's options already in it (paper, orientation, copies, two-sided, colour),
  and what is chosen there comes back into LexPen's options (two-sided set there shows as two-sided here). The
  driver's own choices that LexPen has no option for are kept with the settings (3.5) and used for every print with
  them.
- **Paper**: size, orientation (portrait, landscape).
- **Margins**: top, bottom, left, right in mm, one value for all four with a link to set them apart.
- **Frame**: off, or a line around the text area, with its width and intensity.
- **Text**: the font and size on paper (text and code; the editor's own font and zoom do not count), line numbers on
  or off.
- **Rendered Markdown and HTML**: a font and size of their own for the body text, and a font and size for code. The
  text flows to the paper's width and on to the next page; headings, lists and footnotes follow the body size (they
  are set relative to it), code blocks follow the code size (the preview's fixed size for code is made relative on
  the print page). No zoom: a zoom would scale the height as well and leave the width unused. The images in it keep
  their own zoom (below).
- **Zoom** (PDF pages, and images on their own or in Markdown / HTML): Auto (the document's own size, shrunk only when it does not fit), Fit to width, Fit to height, Fit to page, or a percentage.
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
- Stored in `prints.json` in the data folder by a store of its own (PrintStore), in the same form as `sorts.json`
  and working as SortStore does (list, templates, rename, the last one); SortStore stays as it is.

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
- The printer's settings are a Windows `DEVMODE`: the driver's dialog is opened with `DocumentProperties` on it,
  filled from LexPen's options first; afterwards its common fields (paper, orientation, copies, duplex, colour) are
  read back into the options. The whole `DEVMODE` is stored with the settings set (base64), so the driver's private
  choices (bin, intensity) survive; it belongs to its printer and is dropped when the set's printer changes.
- Save as PDF: WebView2 `PrintToPdfAsync` on that page (paper size, orientation, margins, backgrounds on for the
  highlight colours, the browser's own header and footer off: LexPen draws its own), to a file picked in a Save
  dialog.
- Print: WebView2's own `PrintAsync` takes only its own settings (printer name, copies, duplex, colour, ...), not a
  `DEVMODE`, so the driver's private choices would be lost. Print therefore goes through the PDF: the pages are
  written to a temporary PDF as for Save as PDF, rendered page by page at the printer's resolution (Windows'
  `Windows.Data.Pdf`), and printed with .NET's `PrintDocument` using the stored `DEVMODE`. Whether `PrintAsync`
  does honour a printer's current defaults well enough to skip this is [not yet checked]; checked first in the
  build, the simpler path wins if it keeps the driver's choices.
- The installed printers and their papers: .NET `PrinterSettings` on the host side.
- A PDF document: pdf.js renders each page to an image at print resolution, the highlights drawn on it, one image
  per page.
- Ctrl+Shift+P (free in keys.json) and File > Print...; the Folder pane's file menu gets Print....

### 3.8 What does not work, alternatives

- **The browser's print dialog** (WebView2 `ShowPrintUI`): it has a preview and the printer choice, for free. But it
  knows nothing of highlights, notes, line numbers or the colour choices, it prints the screen's page (the editor
  shows only the lines in view), and it looks like Edge, not LexPen. Its System variant opens the Windows dialog,
  with the driver's Preferences, but what is chosen there does not come back into LexPen's options or the stored
  settings: Printer settings... (3.3) does that.
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
  kept apart), as SortStore's tests do for the sorts; the printer list read without failing
  when there is none.
- In the test copy by script: the page count changes with the margins, the font size and the zoom; the highlight
  marks, markers and notes appear only with their option and in the chosen place; the dark-theme warning; Save as PDF
  writes a file with the preview's page count; a PDF document gives one page per page; a stored set comes back after
  a restart.
- By hand: a real printer (paper, duplex, colour, a bin or intensity set in Printer settings...), two-sided set in
  the printer's dialog showing in LexPen's options and the other way round, and the look of the preview.

## 4. Open questions

None.

## 5. As built

- **Pages**: paged.js 0.4.3 (vendored, MIT) lays the document's view out in pages in the Print window, from a
  stylesheet made from the options (@page size and margins, margin boxes for the header and footer, `float:
  footnote` for notes at the bottom of the page). A PDF is laid out without it, a sheet per page: it is pages
  already, and paged.js took minutes for a long one. Its pages are drawn when they come in view (150 dpi), and at
  300 dpi before printing; the page size is read from the first page and corrected per page as it is drawn. A text
  in lines (the Text view) is laid out without it too, a sheet at a time (layoutText): paged.js reads the whole
  document before its first page, seconds for a large file and again on every change.
- **Large documents (3.6)**: the first page shows at once and the others follow; the count line says which page is
  being laid out. A change of an option ends a running layout at its next page (paged.js's own stop() only pauses)
  and starts again from page 1. A text of 140,174 lines (7 MB): page 1 about 5.4 s after Print..., the window open
  after 3.3 s (measured in the test copy); a PDF of 2,003 pages opened in 4 seconds. Rendering a code file as
  markdown is made after the window opened, so it does not hold up the text.
- **What it prints (3.1)**: the main window makes it (printsource.js): the text in lines with the editor's colouring
  (runMode), markdown rendered as the preview renders it (renderNow's image, alert, formula and diagram steps are
  now shared helpers in app.js: fixPreviewContent, renderMathAndDiagrams), a CSV as a table from its definition; a
  highlight in rendered text or a table is found again by marks of Unicode's private area put into the text before
  rendering. HTML files have no rendered view in LexPen's preview, so they print as text.
- **Colours (3.4)**: every theme's colours for the languages used are sent along; another theme's own colours come
  from the host (AppHost.ThemeVars). A page is dark when its background's luminance is below 0.35.
- **Print (3.7)**: a set without printer settings of its own prints by WebView2's PrintAsync (printer, copies,
  two-sided, colour); a set with them (Printer settings... was used) prints as page images at 300 dpi through .NET's
  PrintDocument with the stored DEVMODE. Whether PrintAsync keeps a driver's own choices was not checked, so the
  image path stays for those sets.
- **Stored settings (3.5)**: also Delete in the right-click menu (not in the plan; without it a set could not be
  removed).
- **Tests**: PrintStoreTests (as SortStoreTests), PrintingTests (the printer list and a printer's papers read without
  failing). In the test copy by script: markdown, text, a code file with a selection, a CSV, a slide PDF and a PDF
  of 2,003 pages; highlights in every look, notes in every place (their numbers, the margin notes at their line's
  height); black and white, another theme, the dark warning; the frame, the date; every page within its area; the
  pages printed to a PDF (the same call as Save as PDF) with the preview's page count and size, and a page range;
  the stored settings (save, change, revert, templates, rename, new); Print... from the Folder pane without a tab;
  Esc; a running layout stopped by a change.
- **Added after the first build (asked for while trying it)**: the fonts as lists with a sample; the view to print
  (As) for every text, the default where Print... was chosen (editor: text, preview: rendered), a code file's
  rendering as markdown made after the window opened; Text colour (language colouring or mono); line numbers every
  line, every 10 lines or off; the highlights' colour, intensity and a dotted underline; the notes' size; the header
  and footer as three texts each (left, middle, right) with codes ($F $A $P $T $D $M $$), **bold** and *italic*, a
  date format of their own and a distance from the edge; a page range printed without waiting for the rest unless
  $T is used; Monochrome shown in greys; the stored settings' list and buttons as the Sort's.
- **Not tested**: printing on a real printer, either path, and the printer's own dialog (Printer settings...): both
  need a person at the printer (3.9, by hand).
