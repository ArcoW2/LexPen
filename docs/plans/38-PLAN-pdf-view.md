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
background; a page that suits the mode stays as it is. A bar above the PDF, as other files have, switches between
following the theme and the original, sets the threshold, and holds the zoom and the page; the right-click menu has
the same. No editor, nothing saved. LexPen can be made the program for .pdf in Settings >
App > Windows Explorer.

## 3. Details

### 3.1 What a PDF tab is

- A tab like any other: in either editor pane, in the tab strip, in the session, in Recent files, in the folder
  pane's marks (the active row).
- It shows the PDF only, always on the preview side: no editor, no ruler, no outline column (unless 3.4 gives it
  one); above it its own bar (3.2). Editor and Preview switches do nothing for it.
- Read-only: LexPen does not change a PDF's content; it writes only highlight annotations into it, when its
  highlights are kept there, with Save (3.2b). Revert and the edit actions are greyed out for it.
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
- The bar above the PDF (as the bar above the editor of other files: icon buttons, LexPen's look): Follow the theme /
  Original (one toggle button, pressed while following the theme), Threshold (a stepper: - 50 % +, in steps of 5),
  then fit width, fit page, zoom out, zoom in, and the page (its number of the total, previous / next). The right-click
  menu on the PDF has the same: Follow the theme / Original, Threshold (a list of steps, the current one ticked). The mode is kept per file, as a file's language is; the threshold is a setting (Preview > PDF), the same for
  every PDF; both are also in the settings window.
- Per page, not per picture inside a page: pdf.js draws a page as one canvas; a picture on a light page is inverted
  with the page.

The check (done 2026-11-05, pdf.js 6.4.299, a test copy, the PDFs in `docs/examples`): every one opened, its first
page drawn in 64 to 502 ms (the 2003 pages of `hpmor.pdf` and the 18.6 MB comic included). pdf.js's own page colours
(the first idea) were tried and dropped: they turn every page into the theme's two colours, pictures included (a
colour chart all grey, a comic washed out).

### 3.2a The outline: the PDF's bookmarks

- The Outline pane (the editor pane's own, or the window's) shows a PDF's bookmarks (its outline: chapters and their
  parts) with their levels; the current one follows the page shown; a click goes to the bookmark's own place on its
  page. A PDF without bookmarks: "No bookmarks". (Asked for while building; it was under later.)

### 3.2b Highlights, with notes

LexPen's highlights (docs/plans/executed/PLAN-highlights.md) on a PDF's text: select text in the PDF, Highlight it
(Ctrl+F8, Edit > Highlights, the PDF's right-click: Highlight, Highlight with a note), with an optional note. Kept in
one of three places, chosen per PDF, as a CSV's column settings are (plan 29).

- Selecting: the text pdf.js lays over each page (its text layer); a highlight is a part of one page's text.
- Where it is: its page, its place in that page's text (the characters from / to), the text itself and a few
  characters before and after, so it is found again when the PDF changes (as a highlight in a text file is).
- Shown: the highlight colour over the text on the page (Preview > Highlight: its colour, intensity, background or
  underline), the note sign at its end, the note on the mouse; also on a turned-round page.
- The Highlights pane lists them as for other files, with the page in place of the line; a click goes there; the
  note is edited in the same note window.
- Where they are kept, per PDF ("Highlights kept:" in the PDF bar's menu, and in the Highlights pane):
  - in LexPen: its store, as other files' highlights;
  - next to the file: `name.pdf.lph`, as other files' highlights can be (the setting highlightsStore "beside");
  - inside the PDF: standard PDF highlight annotations, the note as their text, so other PDF readers (Acrobat,
    Edge, ...) show them too. This is the one way LexPen writes a PDF: only its annotations, by pdf.js (it saves the
    document with them). A PDF that cannot be changed (signed, protected, read-only) offers only the other two.
    A change marks the tab as changed (as an edited text file); Save (Ctrl+S) writes the PDF, a .bak first when
    backups are on (as for a text file); closing it, or LexPen, with changes not saved asks first, as for a text file.
  - Moving them from one place to another takes them all along (as Settings kept for a CSV); from the PDF they are
    read back from its highlight annotations. Moving them into the PDF, or out of it, asks first: the PDF will be
    changed, its highlights added to the file (into it) or removed from it (out of it); Go ahead or Cancel. Go ahead
    marks the tab as changed; the file changes with Save (as any change of its highlights).
- A new PDF's place: as the setting highlightsStore says (in LexPen, or next to the file).
- Highlight annotations a PDF already has (made in another reader) are always shown, and listed in the Highlights
  pane with LexPen's:
  - its highlights kept inside the PDF: they are the same thing; listed, and their notes changed and removed as any;
  - kept in LexPen or next to the file: listed too, marked as the PDF's own (a sign and "in the PDF" in the list and on
    the mouse), and not changed: no new note, no removal (they belong to the file; to change them, keep the PDF's
    highlights inside it).

### 3.3 Keys and menus

- Ctrl+F: LexPen's find bar, on the PDF's text (pdf.js gives the text of each page).
- Zoom: Ctrl+wheel and the zoom of the status bar, as the preview's.
- The tab menu: Copy full name, Show in folder pane, Open in the default program (Windows' PDF reader).

### 3.4 Later, not in the first step

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
