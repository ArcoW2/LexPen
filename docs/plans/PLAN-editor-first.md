# Plan: editor first

Status: draft, not started.

## 1. What this is about

LexPen started as a viewer that can also edit: markdown opens in Read mode, the editor is a secondary mode,
and the keyboard is laid out for formatting, not for moving around in text. This plan turns that around:
an editor first, for any text or source file, with the markdown preview as an option next to it. That
needs editor features LexPen lacks (bookmarks, an informative gutter, a multi-clipboard) and a keyboard
layout with room for them.

## 2. The solution, in brief

Files open in the editor; Read and Split stay, one keystroke away. Heading levels move from Ctrl+1..6 to
the chord Ctrl+H, 1..6, which frees Ctrl+K as a chord prefix for bookmarks (Ctrl+K, 1 sets bookmark 1), in
the WordStar/Delphi tradition. The gutter shows line numbers, bookmarks and change markers (unsaved, and
against git HEAD). A clipboard ring keeps recent copies for a paste picker. Features an editor does not
need are stripped. New icon.

## 3. Details

### 3.1 Repository

- Private GitHub repository `ArcoW2/LexPen`, MIT license, Visual Studio `.gitignore`. Commits use the
  GitHub noreply address only. Push only when asked.
- Publish profiles (`*.pubxml`) are ignored by the `.gitignore` and stay local.
- Data folder `%LOCALAPPDATA%\LexPen`; `LEXPEN_DATA` points a test run elsewhere.
### 3.2 Editor first

- Markdown opens in Edit mode (`app.js`, `mode: mode ?? (doc.language ? 'edit' : 'preview')` becomes `'edit'`
  for all files). The mode buttons read Edit / Split / Read, editor first.
- Ctrl+E keeps toggling, now between Edit and Split.
- A setting in the More menu: "Open markdown in: Edit / Split / Read", remembered. Default Edit.
- The rendered preview, outline, compare scroll and print stay as they are.

### 3.3 Keyboard: chords

CodeMirror 5 supports multi-stroke keys (`CodeMirror.normalizeKeyMap`, `cm.state.keySeq` in the bundled
`editor.js`), so the chords live in the editor's `extraKeys`. While a chord is pending, the status area shows
the prefix (`Ctrl+H ...`); Esc cancels it.

| Keys | Action | Was |
|---|---|---|
| Ctrl+H, 1 .. Ctrl+H, 6 | Heading 1 to 6; the same level again gives plain text | Ctrl+1 .. Ctrl+6 |
| Ctrl+H, 0 | Plain text (remove heading) | -- |
| Ctrl+K, 1 .. Ctrl+K, 9 | Toggle numbered bookmark 1 to 9 on the cursor line | -- |
| Ctrl+Q, 1 .. Ctrl+Q, 9 | Go to bookmark 1 to 9 | -- |
| Ctrl+K, K | Toggle an unnumbered bookmark | -- |
| Ctrl+K, N / Ctrl+K, P | Next / previous bookmark (any kind) | -- |
| Ctrl+K, L | List the bookmarks of the file (picker) | -- |
| Ctrl+L | Link | Ctrl+K |
| Shift+Ctrl+R | Find and replace (unchanged) | also Ctrl+H |

Consequences:
- Ctrl+H no longer opens replace; Shift+Ctrl+R already does. The replace toggle tooltip in `find.js`, the
  help window (`app.js`, the shortcut list) and the format bar tooltips (`format.js`) change with it.
- Ctrl+K no longer inserts a link. Ctrl+L is free in the editor (Shift+Ctrl+L is compare scroll, which stays).
- Ctrl+1 .. Ctrl+6 become free. Option: Delphi also uses Ctrl+1..9 to go to a bookmark (and
  Ctrl+Shift+1..9 to set one). Open question whether to add those as shortcuts next to the chords.
- Chords only exist in the editor. In Read mode Ctrl+K / Ctrl+Q do nothing, unless bookmarks should also
  work there (see 3.4).

### 3.4 Bookmarks

- Per file: numbered 1..9 (one line each; setting a number on another line moves it) and unnumbered.
- Shown in the gutter (number or ribbon); click the bookmark gutter to toggle an unnumbered one.
- Stored with CodeMirror line handles, so they follow inserted and deleted lines.
- Kept in the session for open tabs, and per path for closed files (a small `bookmarks.json` next to
  `settings.json`, lines stored as numbers plus the line text to re-find a line that moved outside the app).
- Moving a tab to another window takes its bookmarks along, like the undo history.
- Open: also show bookmarks in Read mode (as a marker next to the rendered block, via `data-line`)?

### 3.5 Gutter

Columns, left to right, each switchable in the More menu:
- Line numbers (exists).
- Bookmarks (3.4).
- Change markers: lines changed since the last save (from a line diff against the saved text).
- Git markers: added / changed / removed against HEAD. The host supplies `git show HEAD:<path>` once per
  open and after each save or git change it already watches for; the page diffs per line. Click a marker
  to see the old text, with "revert this block".
- Fold markers: fold a heading section or a fenced code block (CodeMirror `foldgutter` addon, added to
  `vendor.ps1`).
- Open: a line diff library (e.g. `diff` or `diff-match-patch` via npm) versus a small own diff. Proposal:
  a library, bundled into `editor.js` by `vendor.ps1`.

### 3.6 Multi-clipboard

- A ring of recent copies and cuts from the editor, shared by all windows (kept in the host). Duplicates
  move to the top. Size: a setting, default to be decided.
- Paste picker: a key opens a list of the ring (first line of each entry, plus its size); arrows / digits
  pick, Enter pastes, Esc cancels. Ctrl+Shift+V is taken (image paste with a question), so the key is
  still open; proposal Ctrl+Alt+V. Caution: on keyboards with AltGr, Ctrl+Alt is AltGr and can collide.
- Open: also record copies made in other applications (needs a clipboard listener in the host,
  `AddClipboardFormatListener`), and keep the ring across restarts or not (privacy: passwords copied
  elsewhere would end up on disk).

### 3.7 Features to strip

Cherry-picking from history is dropped as a feature; the new app is built by copying everything and
stripping what is not needed. Candidates to strip, still to be confirmed:
- compare scroll between panes
- the read-only live copy of a file open in both panes
- print / save as PDF
- the 'reloaded out of sight' banner
- Mermaid / KaTeX rendering (cost nothing until a document uses them)

### 3.8 Name and icon

- Name: LexPen. One web search per name: no product found with that exact name; the nearest is Lex (an AI
  word processor). Rejected on the way: LexEdit (Brazilian legislative drafting system, Italian 1990
  prototype), Lexed (PyPI editor), Lexory, Lexemo, Lexora (all in use), Lexwerk (close to Lexwork and
  Lexware), Lexit (sounds like exit). Not yet checked: GitHub, winget, trademark registers.
- Icon: the hash is not required. Directions to sketch: a pen nib (fits the name), a text cursor (I-beam) on a page, a
  page with a bookmark ribbon (ties in with 3.4). Made as SVG first, then converted to a multi-size
  `.ico`; the conversion tool is still to be found (ImageMagick or a small .NET step, not checked).

### 3.9 Tests

- Unit tests (`tests/...`): the bookmark store (save, re-find a moved line), the clipboard ring (order,
  duplicates, size).
- In the app, through the WebView2 debugging port as in `HANDOFF.md`: chords (including a cancelled one),
  bookmarks surviving edits and a restart, gutter markers after edit / save / commit, paste picker.

## 4. Open questions

1. Which features to strip (3.7)?
2. Delphi-style Ctrl+1..9 / Ctrl+Shift+1..9 for bookmarks next to the chords?
3. Bookmarks in Read mode too?
4. Paste picker key: Ctrl+Alt+V or something else?
5. Clipboard ring: editor copies only, or also copies from other applications? Kept across restarts?
6. Icon direction.

## 5. Resolved issues during execution

| # | Issue | Decision |
|---|---|---|
| -- | -- | -- |
