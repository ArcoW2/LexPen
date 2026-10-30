# Plan 38: viewing a PDF file

## 1. The enhancement

LexPen opens text files. A PDF file (a manual, a spec, an export next to the markdown it came from) cannot be
looked at in LexPen; it has to go to another program. The wish: open a PDF in a tab and read it there, next to the
documents being worked on. Whether this can be done well is to be found out first; this plan only sets out the
idea and what to check.

## 2. The solution, in brief

A PDF opens in a tab of its own that only shows it, read-only: the browser's own PDF viewer that WebView2 carries
(scroll, zoom, find, print), fed from the host's file site as images in the preview already are. No editor, no
preview of text, nothing saved. If the built-in viewer cannot be shown inside the page, a bundled PDF renderer
(pdf.js) in a pane page of its own is the fallback.

## 3. Details

### 3.1 What a PDF tab is

- A tab like any other: in either editor pane, in the tab strip, in the session, in Recent files, in the folder
  pane's marks (the active row).
- It shows the PDF only: no editor, no format bar, no ruler, no outline column (unless 3.4 gives it one). Editor
  and Preview switches do nothing for it.
- Read-only: LexPen never writes a PDF. Save, Revert and the edit actions are greyed out for it.
- It follows the file: changed on disk, it shows the new version (the watcher as for text files).
- Opened from the folder pane (click), File > Open, a drop on a pane, the command line, and Explorer's
  "Open with" (only when LexPen is chosen for .pdf: not registered by default).

### 3.2 How it is shown: to be checked first

1. **The built-in viewer.** WebView2 includes Chromium's PDF viewer. Check: does a PDF from
   `https://file.lexpen.example/...` show in a frame (or an `<embed>`) inside the window's page, with its own
   toolbar, find and zoom; does it work in the Release build (the request filter, as plan 24 stage 1 found for
   frames); does the page's CSP allow it; can its toolbar follow day / night (likely not).
2. **pdf.js** (Mozilla's renderer in JavaScript), bundled under `web/vendor/` as the other libraries are, in a page
   of its own (as the panes of plan 24, so a large PDF renders in a process of its own). More control (theme, find
   with LexPen's own find bar, the outline of 3.4), more to ship and keep up to date.

Pick 1 when it works inside the page; 2 only for what 1 cannot do.

### 3.3 Keys and menus

- Ctrl+F: the viewer's own find (1) or LexPen's find bar (2).
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

1. A PDF in the editor pane, or always in the preview side (as the preview of a markdown file)?
2. Should LexPen offer to be the program for .pdf in Settings > App > Windows Explorer, or never?
3. Is the built-in viewer's own (light) toolbar acceptable in a dark theme, or does that alone call for pdf.js?
