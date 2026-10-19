# Plan: next features

Status: built on branch `feature/next-features` (not pushed), in this order: help window, paste image,
Open menu with recent lists, outline, search, zoom, tree keyboard navigation. Section 8 records what was
decided or found during the build. Line numbers in Read mode and spell check: not yet, as you decided.

## 1. What this is about

Features asked for after the tabs/panes/windows work, in your order of importance:

1. Paste an image into markdown, with a relative link (or a question when relative is not natural).
2. Recent files and folders.
3. Outline pane per pane, click to go to a heading.
4. Search in open files, the open folder, or the folder of the current file.
5. Preview zoom (in, out, with the mouse wheel too).

Smaller ones: a way up in the tree (the old `..`), line numbers in Read mode, spell check (question
first). Diff highlighting is dropped for now (section 5).

## 2. The solution, in brief

All seven are page features with small host additions. Paste image: the host saves the clipboard
picture (or takes a copied image file) and the page inserts a link relative to the document. Recent
lists live in the host's settings, shared by all windows. Outline, Read line numbers and zoom are pure
page work, built on the `data-line` source lines that compare scrolling already uses. Search runs in the
host over files and returns matches; the page lists them in the sidebar. The tree gets a `..` row that
re-roots it to the parent folder.

## 3. Per feature

### 3.1 Paste image (1)

- Ctrl+V in the editor with a picture on the clipboard: the host saves it as PNG next to the document
  (folder: question P2) and the page inserts `![name](relative/path.png)` at the cursor.
- Ctrl+V with an image **file** on the clipboard (copied in Explorer / xplorer2), or an image file dropped
  on the editor: no copy needed when it is in the document's folder or below it; the link is relative.
  Elsewhere: a question (P3).
- The link uses forward slashes and URL-encodes spaces, so it also works on GitHub and in other viewers.
- A draft has no folder yet: question P4.

### 3.2 Recent files and folders (2)

- Kept by the host in `settings.json`, shared by all windows, newest first.
- Shown in a "Recent" menu in the toolbar and on the welcome page (question R1).
- Opening a file or folder (any way: tree, dialog, command line, drop) puts it on top.

### 3.3 Outline pane (3)

- A strip at the right of each pane with the headings of its active tab, indented by level.
- Click: the preview (Read, Split) and the editor (Edit, Split) jump to that heading.
- The heading in view is highlighted while scrolling.
- Markdown only; for code files the strip is hidden.

### 3.4 Search (4)

- The sidebar gets two views: Folder (the tree) and Search.
- Scope: open files (including unsaved text) / open folder / folder of the current file, with subfolders.
- The host searches files on disk (skipping dot folders, `node_modules`, binaries and files over 10 MB, as
  the tree and reader already do); open files are searched in the page, so unsaved edits count.
- Results grouped per file with the line; click opens the file at that line and marks the match.

### 3.5 Preview zoom (5)

- Ctrl+plus / Ctrl+minus / Ctrl+0, and Ctrl+mouse wheel over a preview.
- WebView2's own page zoom is switched off (it would zoom the toolbar and tree too).
- Steps of 10 %, from 50 % to 300 %, remembered.

### 3.6 Smaller

- **Tree up (`..`)**: a `..` row at the top of the tree while the folder has a parent; click opens the
  parent folder as the tree's root. Also Alt+Up (question T1).
- **Line numbers in Read mode**: a gutter left of the rendered text with the source line where each block
  starts (from `data-line`), so they match the editor. Code files: every line. Toggle in the More menu,
  remembered.
- **Spell check**: see question S1 before deciding.

## 4. Decisions (your answers)

| # | Decision |
|---|---|
| H | A help window under the More (...) menu listing all shortcuts |
| P1/P2 | An image file is only copied when it is not in the document's folder or below it. Copies (and pasted pictures, which have no file) go to a folder named after the document plus `.images`: `readme.md` -> `readme.md.images` |
| P3 | Dropped with Shift held: ask what to do: relative path, absolute path, copy to the document's folder, copy to the document's image folder |
| P4 | Absolute links as `D:/x/y.png` |
| P5 | Pasting into a draft: ask to save it as a file first |
| R1-R3 | An "Open" menu: File..., Folder..., Recently opened files >, Recently opened folders >, Recently closed files >. Each list has a submenu, at most 15 entries. An entry that no longer exists is dimmed; clicking it removes it |
| O1-O3 | Outline per pane on the right, one toggle for both, remembered, Ctrl+Shift+H; width draggable and remembered; all heading levels, indented |
| F1 | Search options: case sensitive, whole word, regular expression. `^p` matches a line break (CR, LF or CRLF), `^t` a tab, and so on |
| F2 | Scope: current file, open files, files in the folder |
| F3 | No replace |
| F4 | Ctrl+Shift+F (Ctrl+F stays the search inside the active pane) |
| Z1/Z2 | Zoom for the preview only, one level for all previews, remembered, shown at the right of the top bar |
| T1 | Keyboard navigation in the folder pane (Up/Down/Home/End/PgUp/PgDn), so the pane needs keyboard focus; the keys to go up a folder work there |
| L1, S1 | Not yet |

**S1, spell check in markdown.** The browser's spell checker can be switched on for the editor. It checks
all text it sees: it does not know markdown, so it also underlines words in code blocks, inline code, URLs
and link targets, front matter and HTML tags. Prose, headings, lists and tables are fine. The code parts
could be excluded by marking those editor tokens as not to be checked; that is extra work and not yet
tried. Which languages are used (Dutch, English) follows the WebView2/Windows language settings; whether
LexPen can choose them itself is not verified yet.

## 5. Dropped: diff highlighting

Your point is the core of it: a side-by-side diff only lines up when the shorter side gets blank filler
space where the other side has extra lines. In the editor that is doable (CodeMirror line widgets). In the
rendered preview it is not: one source line can become a table row, a list item or half a paragraph, so
there is no clean place to put the filler. Left out unless you want an editor-only version later.

## 6. Order of work

As your top 5, each committed and tested on its own: paste image, recent, outline, search, zoom. The
three small ones (tree up, Read line numbers, spell check if wanted) can go first, as a warm-up, if you
prefer quick wins.

## 7. Tests

- Unit tests (host): relative/absolute link building for pasted images (same folder, subfolder, other
  folder, other drive, spaces), recent list ordering and limits, search over a test folder (skips, size
  limit, options).
- In the app, through the debugging port as before: outline click and highlight, zoom keys and wheel,
  `..` row, Read line numbers, paste of a bitmap and of a file.

## 8. Resolved issues during execution

| # | Issue | Resolution |
|---|---|---|
| 2 | P3 "Let us move": move the image file, or move on? | Taken as "move on". Files are never moved: an image is linked where it is, or copied. Moving your files away is not reversible from LexPen |
| 3 | A pasted picture has no file, so "only copy when outside the folder" does not apply | Saved in the image folder as `image-<yyyyMMdd-HHmmss>.png` (a later one with the same second gets `-2`) |
| 4 | Shift for paste | Ctrl+Shift+V asks the same question as dropping with Shift. A pasted picture is not asked about (it is always saved in the image folder) |
| 5 | Dropping a non-image file on the editor pasted that file's text into the document (CodeMirror's own drop) | Such drops now open the file in the pane, as anywhere else in it. Dragging selected text inside the editor still moves it |
| 6 | WebView2 refuses to hand over a pasted picture as a file ("not a file on the disk") | Files are passed one at a time; a refused one is read as a picture and sent as PNG data |
| 7 | Copied image files with the same name | Never overwritten: `pic.png`, `pic-2.png`, ... |
| 8 | Verified in the app (real clipboard, saved and restored): paste of an image file from outside (copied to `alpha.md.images`), paste of a picture, dropping an image from the tree (linked in place), all three shown in the preview, including a name with a space. Not verified: the Shift question and "save the draft first" (native dialogs; they would wait on your screen) | - |
| 9 | "Recently closed ..." | Files only (a folder is not closed, another one is opened). Opening a file again takes it off "recently closed". Files and folders restored from the session do not count as opened |
| 10 | "Open file" and "Open folder" buttons | Replaced by the Open menu (File..., Folder..., three recent lists as flyouts). Ctrl+O and Ctrl+Shift+O unchanged. Verified: the lists, a removed file dimmed and taken off the list on click |
| 11 | Outline in Edit mode, where there is no rendered preview | Headings come from the markdown source (markdown-it parse) with their source lines, so the outline works in all three modes and is not affected by zoom or images. Verified: 201 headings in the test file, click goes to the heading in Read (preview) and Edit (editor line 198 for "Heading 50"), the current heading is highlighted |
| 12 | Outline toggle | A toolbar button "Outline" plus Ctrl+Shift+H; one setting for both panes |
| 13 | "Files in folder" | The open folder; without one, the folder of the current file. Subfolders included; what the tree skips is skipped. With the tree's markdown-only filter on, only markdown files are searched |
| 14 | "^p, ^t, and so on" | Codes: `^p` line break (CR, LF or CRLF), `^t` tab, `^?` any character, `^#` digit, `^$` letter, `^w` spaces or tabs, `^^` the `^` itself. Not in regular expression mode (then regular expression syntax applies). Listed in the help window and the search box tooltip |
| 15 | Unsaved edits | Open files are searched in the page on their current text; on disk only the files that are not open. A search stops at 2000 matches and says so |
| 16 | Verified: Ctrl+Shift+F opens and focuses the search; folder search; `line one.^p^p## Heading 2` over a CRLF file (12 matches, lines right); an unsaved word found in "Open files"; a click selects the match in Edit mode and scrolls to it in Read mode. Unit tests: skips, case, markdown filter, CRLF lines/columns, line break pattern, limit | - |
| 17 | Zoom | WebView2 page zoom switched off (it scaled the whole window); the previews use CSS zoom, 50-300% in steps of 10%, and keep the line they show. Ctrl+= and Ctrl+plus (also numpad), Ctrl+minus, Ctrl+0, Ctrl+wheel over a preview. Verified: keys and wheel, position kept at line 400, toolbar unchanged |
| 18 | Focus for the folder pane | The tree takes the keyboard focus (Ctrl+Shift+E, or a click on a row) with a cursor row: Up/Down, Home/End, PgUp/PgDn, Right (open a folder / first entry), Left (close / to the folder it is in), Enter (open; Ctrl+Enter: other pane), Alt+Up or Backspace (up a folder), Esc (back to the document). The `..` row goes up too; the folder you came from is opened and selected. Verified with real key events |
| 19 | Esc from the tree did nothing when the document was in Read mode | The preview can now take the focus (so the arrow keys scroll it) |
| 20 | Bug, reported by you: Alt+Left/Right and the mouse back/forward buttons did nothing | Back/forward went through the history of the current tab, which only filled when a link was followed inside it; files opened from the tree get their own tab, so it stayed empty. Now one history per window, like a browser: every switch to another tab and every link followed is a step; tabs closed since are skipped. Verified with real key and mouse events, across tabs and panes. In the editor Alt+Left/Right still move the cursor (CodeMirror), as before |
| 21 | You asked: a click in the tree opens in the current tab instead of a new one | Click: the current tab shows the file (a file already open in that pane: that tab; a draft is never replaced). Shift+click: a new tab. Ctrl+click: the other pane, in its current tab. Ctrl+Shift+click: a new tab in the other pane (your "ctrl-shift-tab" taken as Ctrl+Shift+click; Ctrl+Shift+Tab stays "previous tab"). Enter in the tree with the same modifiers. Verified |
| 22 | You asked: more tab menu items and tabs on several rows | Right-click a tab: Close other tabs, Close tabs to the right (each tab still asks about unsaved changes or a draft). More > Tabs on several rows (remembered) wraps the tab bar; dragging a tab between tabs then takes the row into account. Verified: two rows with six tabs, a drag from the first row to the second, both close commands |
