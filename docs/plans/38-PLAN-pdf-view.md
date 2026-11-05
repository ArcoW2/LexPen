# Plan 38: viewing a PDF file

## 1. The enhancement

LexPen opens text files. A PDF file (a manual, a spec, an export next to the markdown it came from) cannot be
looked at in LexPen; it has to go to another program. The wish: open a PDF in a tab and read it there, next to the
documents being worked on. Whether this can be done well is to be found out first; this plan only sets out the
idea and what to check.

## 2. The solution, in brief

A PDF opens in a tab of its own, always on the preview side, read-only: drawn by a bundled PDF renderer (pdf.js) in a
page of its own. It follows LexPen's mode: each page, once drawn, is measured, and a page that does not suit the mode
(a light page in dark mode, a dark page in light mode) is inverted with its hues kept, its paper becoming the preview's
background; a page that suits the mode stays as it is. The right-click menu switches between following the theme and
the original, and sets the threshold. No editor, nothing saved. LexPen can be made the program for .pdf in Settings >
App > Windows Explorer.

## 3. Details

### 3.1 What a PDF tab is

- A tab like any other: in either editor pane, in the tab strip, in the session, in Recent files, in the folder
  pane's marks (the active row).
- It shows the PDF only, always on the preview side: no editor, no format bar, no ruler, no outline column
  (unless 3.4 gives it one). Editor and Preview switches do nothing for it.
- Read-only: LexPen never writes a PDF. Save, Revert and the edit actions are greyed out for it.
- It follows the file: changed on disk, it shows the new version (the watcher as for text files).
- Opened from the folder pane (click), File > Open, a drop on a pane, the command line, and Explorer's
  "Open with" when LexPen is chosen for .pdf: Settings > App > Windows Explorer offers it, off by default.

### 3.2 How it is shown: pdf.js, each page inverted when it does not suit the mode

A PDF has to follow the theme, dark mode included, in its preview pane too. Of the two ways that were open:

1. **The built-in viewer** (Chromium's, in WebView2) has no dark mode for the pages, and is not under LexPen's
   control page by page. Not used.
2. **pdf.js** (Mozilla's renderer in JavaScript), bundled under `web/vendor/pdfjs` as the other libraries are (also
   in `vendor.ps1`), in a page of its own on the panes' site (a process of its own, as the panes of plan 24). It draws
   each page itself, so LexPen decides how each page looks; also LexPen's own find bar and the outline of 3.4.

The look:

- Follow the theme (the default): each page, once drawn, is measured: its overall brightness (the average luminance
  of the drawn page). In dark mode a page brighter than the threshold is inverted; in light mode a page darker than
  the threshold is. A page that already suits the mode stays as it is: a dark page is never lightened in dark mode
  (a comic's dark cover keeps its colours), a light one never darkened in light mode.
- Inverted means its lightness turned round and its hues kept (a red stays red), scaled so its paper becomes the
  preview's background: white paper turns the dark theme's background in dark mode, black paper the light theme's in
  light mode.
- Original: every page as it is.
- The threshold: 0 to 100 % brightness, 50 % by default.
- The right-click menu on the PDF: Follow the theme / Original, and Threshold (a list of steps, the current one
  ticked). The mode is kept per file, as a file's language is; the threshold is a setting (Preview > PDF), the same for
  every PDF; both are also in the settings window.
- Per page, not per picture inside a page: pdf.js draws a page as one canvas; a picture on a light page is inverted
  with the page.

The check (done 2026-11-05, pdf.js 6.4.299, a test copy, the PDFs in `docs/examples`): every one opened, its first
page drawn in 64 to 502 ms (the 2003 pages of `hpmor.pdf` and the 18.6 MB comic included). pdf.js's own page colours
(the first idea) were tried and dropped: they turn every page into the theme's two colours, pictures included (a
colour chart all grey, a comic washed out).

### 3.3 Keys and menus

- Ctrl+F: LexPen's find bar, on the PDF's text (pdf.js gives the text of each page).
- Zoom: Ctrl+wheel and the zoom of the status bar, as the preview's.
- The tab menu: Copy full name, Show in folder pane, Open in the default program (Windows' PDF reader).

### 3.4 Later, not in the first step

- The PDF's own outline (bookmarks) in the Outline pane.
- Text selection and copy into a document.
- A link in a markdown file to a PDF (`[spec](spec.pdf#page=4)`) opening it in a tab at that page.

### 3.5 Tests

- Open a PDF from the folder pane, File > Open and a drop: a PDF tab, read-only; Save greyed out.
- The PDF changed on disk: shown again.
- In the session: closed and opened again, the tab is back.
- The Release build: the PDF shows (the request filter).
- A large PDF: typing in another tab stays as fast (measured as plan 24 3.2).

## 4. Open questions

None.
