# Plan 38: viewing a PDF file

## 1. The enhancement

LexPen opens text files. A PDF file (a manual, a spec, an export next to the markdown it came from) cannot be
looked at in LexPen; it has to go to another program. The wish: open a PDF in a tab and read it there, next to the
documents being worked on. Whether this can be done well is to be found out first; this plan only sets out the
idea and what to check.

## 2. The solution, in brief

A PDF opens in a tab of its own, always on the preview side, read-only: drawn by a bundled PDF renderer (pdf.js) in a
page of its own, in the theme's colours in dark mode too (its text and lines in the theme's foreground on its
background, pictures as they are). No editor, nothing saved. LexPen can be made the program for .pdf in Settings >
App > Windows Explorer.

## 3. Details

### 3.1 What a PDF tab is

- A tab like any other: in either editor pane, in the tab strip, in the session, in Recent files, in the folder
  pane's marks (the active row).
- It shows the PDF only, always on the preview side (answer 1): no editor, no format bar, no ruler, no outline column
  (unless 3.4 gives it one). Editor and Preview switches do nothing for it.
- Read-only: LexPen never writes a PDF. Save, Revert and the edit actions are greyed out for it.
- It follows the file: changed on disk, it shows the new version (the watcher as for text files).
- Opened from the folder pane (click), File > Open, a drop on a pane, the command line, and Explorer's
  "Open with" when LexPen is chosen for .pdf: Settings > App > Windows Explorer offers it (answer 2), off by default.

### 3.2 How it is shown: pdf.js, for the dark mode

A PDF has to follow the theme, dark mode included, in its preview pane too (answer 3). That decides between the two
ways that were open:

1. **The built-in viewer** (Chromium's, in WebView2) has no dark mode for the pages: they stay white. The only way
   is a colour inversion of the whole viewer (a CSS filter on its frame), which inverts the pictures and its own
   toolbar too. Not good enough; not used.
2. **pdf.js** (Mozilla's renderer in JavaScript), bundled under `web/vendor/` as the other libraries are, in a page of
   its own (as the panes of plan 24, so a large PDF renders in a process of its own). It draws each page itself, so
   the colours are LexPen's: its viewer has page colours (a background and a foreground that replace the text and
   line colours; pictures keep theirs), as Firefox uses for its high contrast mode. More to ship and keep up to
   date; in return the theme, LexPen's own find bar and the outline of 3.4.

The look:

- Light themes: the PDF as it is (white pages).
- Dark themes: the pages in the theme's background, text and lines in its foreground, pictures as they are. A switch
  in the PDF tab's bar (and a setting, Preview > PDF in dark mode: theme colours / as it is) for a PDF that reads
  better unchanged (a form, a drawing whose colours carry meaning).
- To check first, before the rest is built: that the page colours of the pdf.js version bundled do this on the PDFs
  in `docs/examples` and a scanned one (a page that is one picture stays as it is: that is expected), and how fast a
  large PDF draws with them.

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

Answered (2026-11-05):

1. Where it shows: always on the preview side.
2. LexPen offers to be the program for .pdf in Settings > App > Windows Explorer: yes.
3. The built-in viewer's light look in a dark theme: not acceptable; a PDF follows dark mode, in its preview pane too.
   Feasible with pdf.js (3.2), which is therefore the way, not the fallback.

Still open:

4. Dark mode by default for every PDF in a dark theme (with the switch to show one as it is), or as it is by default
   (with the switch to darken it)?
