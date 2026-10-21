# Plan: editor first

Status: executed on 2026-10-19 on the branch `editor-first` (not merged, not pushed). Decisions and problems
of the run are in section 5.

## 1. What this is about

LexPen started as a viewer that can also edit: markdown opens in Read mode, the editor is a secondary mode,
and the keyboard is laid out for formatting, not for moving around in text. This plan turns that around:
an editor first, for any text or source file, with the markdown preview as an option next to it. That
needs editor features LexPen lacks (bookmarks, an informative gutter, a multi-clipboard), a keyboard
layout with room for them, and a menu structure that shows where everything is.

## 2. The solution, in brief

Files open in the editor; the preview and the outline are switches next to it. The keyboard moves to
chords in the WordStar/Delphi tradition: Ctrl+H for headings, Ctrl+P for paragraph kinds (lists, quote,
code block), Ctrl+1..9 / Ctrl+K / Ctrl+Q for bookmarks. A menu bar (File, Edit, Format, View, Options) in
the toolbar row replaces the Open and More dropdowns. The gutter shows line numbers, bookmarks and change
markers (unsaved, and against git HEAD). Nine extra clipboards next to the Windows one: Ctrl+Shift+n
selects clipboard n, and Ctrl+C / Ctrl+X / Ctrl+V then work on it. Print is removed. Keys are not hard-coded: one global keys file maps every key to an
action name, and the language of the file decides what a language action does (markdown first, in the
pack structure of `PLAN-language-packs.md`).

## 3. Details

### 3.1 Repository

- Private GitHub repository `ArcoW2/LexPen`, MIT license, Visual Studio `.gitignore`. Commits use the
  GitHub noreply address only. Push only when asked.
- Work for this plan happens on the branch `editor-first`.
- Publish profiles (`*.pubxml`) are ignored by the `.gitignore` and stay local.
- Data folder `%LOCALAPPDATA%\LexPen`; `LEXPEN_DATA` points a test run elsewhere.

### 3.2 Editor first

- Markdown opens in the editor (`app.js`, `mode: mode ?? (doc.language ? 'edit' : 'preview')` becomes
  `'edit'` for all files).
- The Read / Split / Edit buttons become switches: Editor, Preview, Outline (also in the View menu, 3.8).
  Editor only is today's Edit mode, Preview only is Read, both is Split. At least one of Editor and Preview
  stays on: switching off the last one switches the other on.
- Ctrl+E shows / hides the Preview next to the Editor. With the Preview only, Ctrl+E brings the Editor back.
- A setting (Options > Settings): "Open markdown in: Editor / Editor and Preview / Preview", remembered.
  Default Editor.
- The rendered preview, outline and compare scroll stay as they are. Print / save as PDF is removed: the command, Ctrl+P and its help line.

### 3.3 Keyboard: chords

CodeMirror 5 supports multi-stroke keys (`CodeMirror.normalizeKeyMap`, `cm.state.keySeq` in the bundled
`editor.js`), so the chords live in the editor's `extraKeys`. While a chord is pending, the bottom bar (3.12) shows
the prefix (`Ctrl+H ...`); Esc cancels it. The table below is the default content of the keys file (3.9),
not code.

Unchanged keys are listed too, so the tables are the whole default keys file.

**Files**

| Keys | Action | Was |
|---|---|---|
| Ctrl+S / Ctrl+Shift+S | Save / save as | unchanged |
| -- | New file: no key of its own, File menu only | Ctrl+N |
| -- | Open file / open folder: no keys of their own, File menu only | Ctrl+O / Ctrl+Shift+O |
| -- | Print: removed (3.2) | Ctrl+P |

Menu letters (Alt+F, then N for New, and so on) are ordinary menu navigation (3.8), not keys: they are
not in these tables and not in `keys.json`.

**Tabs and documents**

| Keys | Action | Was |
|---|---|---|
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous document, in recently used order or in tab bar order (a setting) | Next / previous tab, tab bar order |
| Ctrl+W / Ctrl+F4 | Close tab | unchanged |
| Ctrl+Shift+T | Reopen the last closed tab | unchanged |
| Alt+Left / Alt+Right | Back / forward, like a browser, also in the editor | outside the editor only |

**View and menus**

| Keys | Action | Was |
|---|---|---|
| Ctrl+E | Show / hide the Preview (3.2) | Toggle Read / Split |
| Ctrl+Shift+H | Outline | unchanged |
| Ctrl+Shift+B | Sidebar: show / hide (View > Folders and View > Search show it on that view) | Ctrl+B |
| Ctrl+Shift+E | Go to the folder pane | unchanged |
| Ctrl+Shift+F | Search in files | unchanged |
| -- | Scroll both panes together: View menu only | Ctrl+Shift+L |
| -- | Day / night: View menu only | Ctrl+T |
| Ctrl+plus / Ctrl+minus | Zoom the preview | unchanged |
| F1 | Keyboard shortcuts | unchanged |
| Alt+F / E / R / V / O | Open the File / Edit / Format / View / Options menu (3.8) | -- |
| Up / Down / Left / Right, Enter, Esc | Inside an open menu: move, run, close (3.8) | -- |

**Edit and find**

| Keys | Action | Was |
|---|---|---|
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / cut / paste, on the active clipboard (3.6) | Windows clipboard only |
| Ctrl+Shift+V | Paste an image file, asking how to link it | unchanged |
| Ctrl+F | Find | unchanged |
| F3 / Shift+F3, Ctrl+G / Shift+Ctrl+G | Next / previous match | unchanged |
| Shift+Ctrl+R | Find and replace | also Ctrl+H |
| Ctrl+PgDn / Ctrl+PgUp | Next / previous section (language action, 3.9): heading, paragraph, stored procedure, `begin` or `{` | -- |

**Clipboards (3.6)**

| Keys | Action | Was |
|---|---|---|
| Ctrl+Shift+1 .. Ctrl+Shift+9 | Select clipboard n | -- |
| Ctrl+Shift+` | Select clipboard 0, the Windows clipboard | Code block |
| Ctrl+Shift+C | Show the clipboards, to see and select one | -- |

**Bookmarks (3.4)**

| Keys | Action | Was |
|---|---|---|
| Ctrl+1, S .. Ctrl+9, S | Store bookmark n at the cursor (moves it when it is elsewhere) | -- |
| Ctrl+1, T .. Ctrl+9, T | Toggle bookmark n on the cursor line | -- |
| Ctrl+1, C .. Ctrl+9, C | Clear bookmark n | -- |
| Ctrl+1, 1 .. Ctrl+9, 9<br>Ctrl+1, Ctrl+1 .. Ctrl+9, Ctrl+9 | Go to bookmark n | -- |
| Ctrl+K, 1 .. Ctrl+K, 9 | Toggle bookmark n (WordStar/Delphi) | -- |
| Ctrl+Q, 1 .. Ctrl+Q, 9 | Go to bookmark n (WordStar/Delphi) | -- |
| Ctrl+K, K | Toggle an unnumbered bookmark | -- |
| Ctrl+K, N / Ctrl+K, P | Next / previous bookmark (any kind) | -- |
| Ctrl+K, L | List the bookmarks of the file (picker) | -- |

**Format (language actions, 3.9)**

| Keys | Action | Was |
|---|---|---|
| Ctrl+/ | Toggle line comment: comments the selected lines, or uncomments them when they are | -- |
| Ctrl+Shift+/ | Toggle block comment: wraps the selection in the language's block markers, or removes the block comment the cursor is in | -- |
| -- | Remove block comment: the block comment around the cursor (also Format menu and F1) | -- |
| Ctrl+B / Ctrl+I | Bold / italic (Ctrl+B is bold only now, everywhere) | unchanged |
| Ctrl+Shift+X | Strikethrough | unchanged |
| Ctrl+` | Inline code | unchanged |
| Ctrl+T, L | Insert a link (T for text; a URL on the clipboard becomes the target) | Ctrl+K |
| Ctrl+T, I | Insert an image from the clipboard | Ctrl+V with a picture |
| Ctrl+H, 1 .. Ctrl+H, 6 | Heading 1 to 6; the same level again gives plain text | Ctrl+1 .. Ctrl+6 |
| Ctrl+H, 0 | Plain text (remove heading) | -- |
| Ctrl+P, B | Bulleted list | Ctrl+Shift+8 |
| Ctrl+P, N | Numbered list | Ctrl+Shift+7 |
| Ctrl+P, T | Task list item | Ctrl+Shift+9 |
| Ctrl+P, Q | Quote | Ctrl+Shift+. |
| Ctrl+P, C | Code block | Ctrl+Shift+` |
| Ctrl+P, 0 / Ctrl+P, P | Plain paragraph (removes list, quote, task or heading) | -- |
| Shift+Enter | Line break as `<br>` | unchanged |
| Tab / Shift+Tab / Enter | In a table: next / previous cell, new row | unchanged |

Consequences:
- Ctrl+H no longer opens replace; Shift+Ctrl+R already does. The replace toggle tooltip in `find.js`, the
  help window (`app.js`, the shortcut list) and the format bar tooltips (`format.js`) change with it.
- Ctrl+K no longer inserts a link: that is Ctrl+T, L now. Ctrl+T is the "text" (insert) family: L link, I
  image from the clipboard; more inserts can join it later. Ctrl+T is free because Day / night has no key.
- Ctrl+L and Ctrl+Shift+L become free (compare scroll is View menu only).
- Ctrl+B is bold only. The sidebar moves to Ctrl+Shift+B, so it has a key inside the editor too.
- Alt+Left / Alt+Right are back / forward everywhere, the editor included. CodeMirror's own use of them
  (line start / end) is dropped: Home / End already do that (Home twice on an indented line: first the
  text, then the line start).
- Ctrl+V keeps pasting a picture as an image link as today; Ctrl+T, I does it on purpose, also when the
  Windows clipboard holds both text and a picture.
- Ctrl+P no longer prints. WebView2's own Ctrl+P print must stay suppressed (the page already takes the key).
- Ctrl+1 .. Ctrl+9 become chord prefixes: on its own, Ctrl+1 does nothing until the second key.
- Ctrl+Shift+7 / 8 / 9 / . / ` become free; Ctrl+Shift+1 .. Ctrl+Shift+9 select a clipboard (3.6).
- Ctrl+Shift+0 would be the natural key for the Windows clipboard, but it does not reach LexPen on this PC
  (3.7). Ctrl+Shift+` takes its place: the key before the 1. It is free once the code block moves to
  Ctrl+P, C. It arrives (3.7), but on US-International ` is a dead key: the page sees `key` "Dead", so
  this key is matched on the physical key (`code` "Backquote"), not on the character.
- Document order: Ctrl+Tab / Ctrl+Shift+Tab walk through the documents in the order the setting
  "Ctrl+Tab order" says (Options > Settings): recently used (default) or tab bar order. Ctrl+Alt+Tab is not
  used: Windows uses it for its own app switcher.
- Ctrl+N, Ctrl+O and Ctrl+Shift+O have no key any more: New, Open file and Open folder are reached through
  the File menu. The three keys become free.
- Ctrl+PgDn / Ctrl+PgUp move by section, and what a section is depends on the language (3.9).
- Shift selects: every key that moves the cursor inside a document also works with Shift, and then
  selects from where the cursor was, or extends the selection. CodeMirror does this already for its own
  moves (arrows, Home / End, PgUp / PgDn, Ctrl+arrows, Ctrl+Home / End). LexPen's own moves get the same:
  Ctrl+Shift+PgDn / PgUp (section), Ctrl+1, Shift+1 and Ctrl+Q, Shift+1 (to bookmark 1, and so on),
  Ctrl+K, Shift+N / Shift+P (next / previous bookmark), and Shift+click on an outline heading. With chords,
  Shift goes on the last key. None of these keys is taken by anything else in the tables above.
- Ctrl+` (inline code) and Ctrl+Shift+` (clipboard 0) stay the defaults although Ctrl+` does not reach
  LexPen on this PC (another application takes it, 3.7); a personal `keys.json` can move it.
- Ctrl+Shift+C is the clipboard list, never the DevTools element picker (which WebView2 puts on it while
  DevTools are enabled; `MainForm.cs` does not switch them off). The page takes the key first; when the
  key check shows WebView2 still opens DevTools, DevTools are switched off in the release build
  (`AreDevToolsEnabled`) and the debug build keeps them for testing. Decided while building, recorded in
  section 5.
- Ctrl+I stays italic. An "insert" prefix on Ctrl+I (Ctrl+I, L link; Ctrl+I, I image) was considered and
  dropped for that reason; the insert family is Ctrl+T.
- Bookmarks stay chords (Ctrl+1, 1 / Ctrl+1, Ctrl+1 to go, Ctrl+1, Shift+1 to select): the same pattern
  as multiple bookmarks in Visual Studio. Ctrl+Shift+1 stays the clipboard. Function keys are not used
  yet apart from F1 / F3; they are free for later.
- Ctrl+/ needs the CodeMirror comment addon (`addon/comment/comment.js`, added to `vendor.ps1`). The modes
  bring their markers: `//` for C#, `#` for PowerShell and YAML. Markdown has no line comment: the line is
  wrapped in `<!-- -->`. JSON has no comments: Ctrl+/ does nothing there.
- Keyboard layouts: CodeMirror matches `Ctrl-/` on the US slash key. On layouts where `/` is typed with
  Shift on another key (Dutch among them), Ctrl+/ may arrive as another key or not at all. On
  US-International it arrives (3.7); other layouts are not checked.
- Chords only exist in the editor. With the Preview only, the bookmark chords do nothing (bookmarks are an
  editor feature, 3.4).

### 3.4 Bookmarks

- Per file: numbered 1..9 and unnumbered. A bookmark is a position: line and column. Going to it puts the
  cursor back on that column, not at the line start.
- Store (Ctrl+n, S) puts bookmark n at the cursor: on another line it moves there, on the same line it takes
  the new column. Toggle (Ctrl+n, T, and Ctrl+K, n) looks at the line only: bookmark n on the cursor line
  is removed, wherever its column; otherwise it is stored at the cursor.
- Shown in the gutter (number or ribbon), one mark per line whatever the column; click the bookmark gutter
  to toggle an unnumbered one.
- Kept as CodeMirror bookmarks (`cm.setBookmark(pos)`), which follow inserted and deleted text, columns
  included. A bookmark on line 100 moves to line 101 when a line is inserted above it (line 50), and to
  line 99 when a line above it is removed. Lines changed below it do not move it. When the bookmarked
  line itself is removed, the bookmark stays at the place of the removal.
- A reload from disk (the file changed outside LexPen) replaces the whole text, so the bookmarks cannot
  follow edit by edit; they are re-found by their line text, as for closed files (below).
- Kept in the session for open tabs, and per path for closed files (a small `bookmarks.json` next to
  `settings.json`: line, column and the line text, to re-find a line that moved outside the app). A column
  past the end of a changed line falls back to the line end.
- Moving a tab to another window takes its bookmarks along, like the undo history.
- Editor only: the Preview shows no bookmarks.

### 3.5 Gutter

Columns, left to right, each switchable in View > Gutter:
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

- Clipboards 0 to 9. Clipboard 0 is the Windows clipboard; 1 to 9 are LexPen's own.
- One clipboard is active. Ctrl+Shift+n selects clipboard n; Ctrl+C, Ctrl+X and Ctrl+V (and the menu's
  Cut / Copy / Paste) then work on the active one. With clipboard 3 active, Ctrl+C does not touch the
  Windows clipboard, and Ctrl+V pastes clipboard 3. No ring.
- Selecting the clipboard that is already active keeps it active; it does not switch back to the Windows
  clipboard. Only Ctrl+Shift+` (or choosing 0 in the list) does.
- The active clipboard is always shown in the bottom bar (3.12): "Clip: Win" for the Windows clipboard,
  "Clip: 1" .. "Clip: 9" for LexPen's own, marked (coloured) while it is not the Windows one. Its tooltip
  shows the start of its text.
- The clipboard list shows Win and 1 to 9 with the start of each one's text, the active one marked;
  choosing one makes it active. It opens from a click on "Clip: ..." in the bottom bar, from Ctrl+Shift+C
  and from Edit > Select clipboard.
- Text only. Pasting a picture or an image file (Ctrl+V, Ctrl+Shift+V) always uses the Windows clipboard.
- Ctrl+Shift+` selects clipboard 0 again (Ctrl+Shift+0 does not arrive, 3.7).
- The clipboards and the active number are kept in the host, so all windows share them.
- Clipboards 1 to 9 are kept across restarts (in the data folder). At every start clipboard 0, the Windows
  clipboard, is active.

### 3.7 Tests

- Unit tests (`tests/...`): the bookmark store (save, re-find a moved line, column past a shortened line),
  the clipboards (per number, shared by windows, clipboard 0 left alone while another is active), the keys
  file (user override per key, `//` comments, actions with parameters).
- In the app, through the WebView2 debugging port as in `HANDOFF.md`: chords (including a cancelled one),
  bookmarks surviving edits (a line inserted / removed above: +1 / -1; below: unchanged) and a restart and
  a reload from disk, gutter markers after edit / save / commit, copy and paste on
  clipboards 0 and n, the indicator, clipboard 0 active after a restart with 1 to 9 still filled, menus
  with Alt+letter and the arrow keys, Ctrl+Tab in recently used order, Ctrl+PgDn / PgUp by section in
  markdown and in plain text, the clipboard list from the indicator and from Ctrl+Shift+C, the F1 search and running an action from it (Enter, focus back on the editor)
  (on key, title, hint and action name; Esc twice), a `.bak` after saving an existing file (overwritten
  on the next save, none for a draft), every move
  with Shift (selects, extends, also backwards past the starting point), the bottom bar (line / column
  while typing, INS / OVR, encoding and line endings per file, Clip: Win / n, a pending chord), a UTF-16
  and a UTF-8-with-BOM file saved back unchanged in encoding, an ANSI file with accented characters
  opened, searched and saved without damage, comments in markdown and C# (line, block,
  removing a block), Go to bookmark showing place and text.
- Second run, 2026-10-19: Ctrl+PgUp / PgDn, Ctrl+Alt+PgUp / PgDn, Ctrl+Shift+` (as a dead key), Ctrl+Tab
  and Ctrl+Shift+Tab arrive. Do not arrive: Ctrl+Alt+Tab and Ctrl+Alt+Shift+Tab (Windows), and Ctrl+`
  without Shift (taken by another application on this PC). None of those is used.
- Key check on a real keyboard, before building the chords: the debug build with an on-screen key log
  (injected through the debugging port, nothing in the repository); every planned key is pressed by hand
  and the log shows which ones reach the page. Keys that Windows or WebView2 take first never show up.
  Synthetic keys (CDP, SendKeys) cannot show this.
- Result of 2026-10-19 (US-International layout): every planned key arrives: Ctrl+H, K, Q, P, L, J, I,
  Ctrl+Shift+P, Ctrl+Alt+V, Ctrl+0 .. Ctrl+9, Ctrl+Shift+1 .. Ctrl+Shift+9, Ctrl+/ (also with Shift, Alt
  and both; seen in the log) and Ctrl+Alt+Shift+1 .. 9 (reported, the log was closed by then). The one key that did
  not arrive is Ctrl+Shift+0: Windows has an input language hotkey on it (`HKCU\Control Panel\Input
  Method\Hot Keys\00000104`, Ctrl+Shift with key 0x30). The plan does not use it; other machines may have
  the same hotkey, so Ctrl+Shift+0 stays unused.

### 3.8 Menus

A menu bar in the existing toolbar row (no extra row) replaces the Open dropdown and the More ("...")
menu. Alt+letter opens a menu (File F, Edit E, Format R, View V, Options O), and every item shows its key,
chords included ("Bulleted list Ctrl+P, B"), so the menus double as the key reference. Every item is an
action (3.9): the key shown is whatever the keys file binds to it, default or your own.

- Keyboard: in an open menu Up / Down move through the items, Right opens a submenu or goes to the next
  menu, Left closes a submenu or goes to the previous menu, Enter runs the item, Esc closes one level.
- Every item has an underlined letter; pressing it runs the item. File: New file N, Open file F, Open folder O,
  Save S, Save as A. The other letters are chosen while building (unique per menu) and listed in
  section 5.

| Menu | Contents |
|---|---|
| File | New file, Open file, Open folder, Favourites >, Recent files >, Recent folders >, Recently closed >, Save, Save as..., Close tab, Close window |
| Edit | Undo, Redo, Cut, Copy, Paste, Paste image (asks), Select clipboard > (Win, 1 to 9, the active one marked; 3.6), Find, Replace, Search in files, Go to bookmark > (1 to 9), Store bookmark > (1 to 9), Next bookmark, Previous bookmark |
| Format | Toggle comment, Toggle block comment, Remove block comment, Bold, Italic, Strikethrough, Inline code, Insert link, Insert image from clipboard, Headings >, Bulleted / numbered / task list, Quote, Code block, Plain paragraph |
| View | Editor, Preview, Outline (switches, 3.2), Sidebar, Folders, Search (the sidebar on that view), Panes > (side by side / above each other, hide, close), Scroll both panes together, Tabs on several rows, Formatting bar, Gutter > (3.5), Day / night, Zoom > (in, out, 100%) |
| Options | Settings, Keyboard shortcuts (F1), About. Later: Macros, Templates, Language |

- Edit holds what works on any file; Format holds the language actions (comments, markup): an item the
  language of the active file does not have greys out, so in C# only the comments are active.
- Go to bookmark lists 1 to 9, each with its place and the text from its column on ("12:5  procedure
  TForm1.Save"); bookmarks that are not set are greyed. Store bookmark lists 1 to 9 the same way, so
  you see what you overwrite. Toggle, clear, the unnumbered bookmarks and the bookmark list are not in
  the menu: they have their keys (3.3) and are in F1 (3.10).
- View holds what changes the screen; Options > Settings holds what changes behaviour (shared find, single
  line break, open markdown in, Ctrl+Tab order, keep a backup when saving).
- Words: "pane" stays the left / right area with its own tabs. Inside a pane: Editor, Preview, Outline.
- The toolbar keeps its quick buttons (Save, Editor / Preview / Outline, Day / night, zoom).

### 3.9 Keys file and actions

Keys and what they do are separated, so both can change without code:

- **Keys file** `keys.json`: maps every key (chords included) to an action. JSON with `//` comments, so
  the file can explain itself. Global: a key means the same in every file. Shipped in the app folder; a
  `keys.json` in `%LOCALAPPDATA%\LexPen\` overrides it per key, so an update does not overwrite your own
  keys. The F1 help and the menus (3.8) read their key texts from it.
- **Every menu item is an action.** The menus are built from actions; nothing in a menu is reachable
  only by clicking. So any menu item can get a key, or another key, in the keys file, and the menu then
  shows that key. The keys in 3.3 are only the default set: a menu item without a default key (New,
  Open file, Day / night, ...) is one line in your own `keys.json` away from having one.
- **All actions are listed**: Options > Keyboard shortcuts (F1) lists every action, with its key or
  without one, so you can see what can be bound and under which name (3.10).
- **Every action has a title and a hint**: the title is the menu text ("Insert link"), the hint one line
  that says what it does ("A URL on the clipboard becomes the target"). App actions carry them in code;
  language actions in the pack's `actions` part (`title`, `hint`). The menus, their tooltips and F1 use
  the same texts, so they never disagree.
- **Actions with parameters**: an action is its name, or its name plus parameters as a list:
  `"Ctrl+1, S": ["bookmarkStore", 1]`, `"Ctrl+Shift+3": ["clipboardSelect", 3]`. One action per number
  is not needed. The same form is the start of macros later: a macro is a list of such actions.
- **App actions**: work the same in every language and are code: bookmarks, find, clipboards,
  navigation, tabs, view switches, save. Their names are fixed (`bookmarkStore`, `find`, `nextDocument`).
- **Language actions**: named per language pack (`heading1`, `bulletList`, `codeBlock`, `toggleComment`,
  `bold`, ...). What one does is defined in the pack's `language.json`, `actions` part, with the action
  kinds of `PLAN-language-packs.md` section 3: `linePrefix` (toggled), `wrap`, `insert` (snippet with a
  cursor marker), `command` (a built-in by name, for what a template cannot do: list renumbering, table
  cells, a link from a clipboard URL).
- A key runs its action as follows: an app action runs; otherwise the active file's language action runs;
  a language without that action does nothing, and its menu item greys out (SQL without a code block).
- Section moves (Ctrl+PgDn / Ctrl+PgUp) are a language action of the kind `jump`: go to the next / previous
  line that matches the language's pattern. Markdown: a heading. Plain text: the first line of a
  paragraph (after an empty line). Later packs: SQL `CREATE PROCEDURE` / `FUNCTION`, Pascal `procedure` /
  `function` / `begin`, C# a line with `{`. The keys pass the direction: `["section", 1]`,
  `["section", -1]`.
- Moves need no extra entries for Shift: an action that moves the cursor (`jump`, bookmark go to / next /
  previous) is marked as a move, and the same key with Shift added extends the selection. When that
  Shift key is bound to something else in `keys.json`, the binding wins and the keys file loader says so.
- Example: `"Ctrl+H, 1": "heading1"` in `keys.json`; in `languages\markdown\language.json`:
  `"heading1": { "linePrefix": "# " }`. In `languages\sql\language.json`: `"toggleComment":
  { "linePrefix": "-- " }`, and no `heading1`.

What this plan builds of it, in the structure of the language packs plan so that plan continues from it:
- `keys.json` with the keys of 3.3, and its user override.
- `languages\markdown\language.json` with only the `actions` part, holding today's format commands (the
  bar and the Ctrl+H / Ctrl+P families). `format.js` runs them instead of its fixed `FORMAT_KEYS`.
- Plain text as the default: only the section move (paragraphs). Plain text is the base pack for now: a
  language without its own `section` action moves by paragraph. The language packs plan may revisit
  this.
- Ctrl+/ in the code files LexPen already colours (JSON, YAML, PowerShell, C#) uses the comment markers
  of their CodeMirror modes until their packs exist (language packs plan, order of work step 1).
- The pack loader, the language selector, colouring from packs and the user packs folder stay in the
  language packs plan.

### 3.10 Keyboard shortcuts window (F1), also the command palette

With every action listed (3.9) the window grows too long to read top to bottom, so it is ordered and
searchable, and it runs what it lists, like the command palette of VS Code:

- Grouped by the categories of 3.3 (Files, Tabs and documents, View and menus, Edit and find, Clipboards,
  Bookmarks, Format). Within a group the order of the tables in 3.3; actions without a key at the end of
  their group, marked "no key".
- Each row: key (or chord), title, hint, and the action name with its parameters in small print
  (`["bookmarkStore", 1]`), the name to use in your own `keys.json`.
- A search box at the top, focused when the window opens: typing filters as you go, on the key text
  ("Ctrl+T" finds the whole insert family), the title, the hint and the action name. Matches are marked;
  groups without a match are hidden; Esc clears the search, a second Esc closes the window.
- Language actions show what they do in the language of the active file; actions that language does not
  have are greyed, with the hint "not in <language>".
- Keys from your own `keys.json` are marked as yours, next to the default they replace.
- Numbered families are folded into one row ("Ctrl+1, 1 .. Ctrl+9, 9 | Go to bookmark n") instead of nine.
- Command palette: Up / Down move a selection through the rows that are shown, Enter (or a double-click)
  runs the selected action. The window closes first, the focus goes back to where it was, and the action
  runs there, so an editor action works on the cursor and the selection as with its key.
- While a search is typed, folded families show unfolded ("Go to bookmark 3" is its own row), so each one
  can be run. Greyed actions (not in this language) cannot be selected.
- Running from the palette needs no key: it is also the way to reach actions that have none.

### 3.11 Backup on save

- A setting (Options > Settings): "Keep a backup when saving", on by default. When it is on, saving a file that already
  exists on disk keeps the previous version next to it, under the full name plus `.bak`:
  `notes.md` -> `notes.md.bak`. An existing `.bak` is
  overwritten: one backup per file, the version before the last save. When it is off, saving writes the
  file as today (still through `File.Replace`, without a backup file).
- Later, not in this plan: a second choice for the setting, keeping the old versions in another folder
  instead of next to the file.
- Also for Save as onto an existing file: that file's old content becomes its `.bak`. Saving a draft or
  saving as a new file makes no backup (there is no old version).
- How (host, `write` in `MainForm.cs`): the new text goes to a temporary file in the same folder, then
  `File.Replace(temp, path, backup)` swaps it in and moves the old file to the backup in one step. Today
  `write` overwrites the file in place (`File.WriteAllText`); with `File.Replace` a crash or full disk
  half-way leaves the old file intact. `File.Replace` keeps the file's attributes and security settings.
- Side effects: `.bak` files show in the folder tree (hidden with "markdown files only") and as untracked
  files in git repositories, unless a repository's `.gitignore` lists `*.bak`.

### 3.12 Bottom bar

A status bar along the bottom of the window, showing the active pane's file:

- Line and column of the cursor ("Ln 12, Col 5"); with a selection also its size (characters, lines).
- Insert / Overwrite: Ins toggles it (CodeMirror's `toggleOverwrite`); the bar shows "INS" or "OVR", and a
  click toggles it too.
- Encoding: what the file was read as: UTF-8, UTF-8 with BOM, UTF-16 LE / BE, or ANSI.
- Line endings: CRLF or LF (the page keeps them per file already, `doc.eol`).
- Language of the file (Markdown, C#, Plain text, ...); the language packs plan turns it into its
  selector.
- Clipboard: "Clip: Win" or "Clip: 1" .. "Clip: 9", marked while it is not Win; a click opens the clipboard
  list (3.6).
- A pending chord: "Ctrl+H ..." until the second key or Esc (3.3).
- What a click on an item does is an action, like everything else (3.9).

Encoding has to be right before it is shown: today the host reads a byte order mark (UTF-8 with BOM,
UTF-16) but always writes UTF-8 without one (`File.WriteAllText` in `MainForm.cs`), so saving silently
converts such files. With this plan the host returns the encoding with the text, and saving writes the
file back in the encoding it was read in, BOM included.

ANSI: a file without a byte order mark that is not valid UTF-8 (older ANSI files, e.g. older Delphi
sources) is read as ANSI, the Windows code page (Windows-1252 here), shown as "ANSI", and saved as ANSI.
Today such a file is read as UTF-8, which damages every character outside ASCII, and saving writes the
damage. In .NET the code page needs `Encoding.RegisterProvider(CodePagesEncodingProvider.Instance)` once
at startup. Search in files (`FolderSearch.cs`) reads files the same way, so it finds accented text in
ANSI files too. New files and drafts are UTF-8 without BOM, as today.

## 4. Open questions

None.

## 5. Resolved issues during execution

| # | Issue | Decision |
|---|---|---|
| 1 | After saving with the toolbar Save button, the file could not be edited from the keyboard, with no read-only mark. The button hides itself once the file is clean, which left the focus on the page body. | Save and Save as hand the focus back to the active pane (`refocus()` in `app.js`). Fixed on `editor-first` in `911666b`; Ctrl+S was never affected. |
| 2 | No Node.js on this machine, so `vendor.ps1` could not rebuild `wwwroot/vendor` from npm. | The CodeMirror 5.65.21 add-ons (comment, foldcode, foldgutter, brace / indent / markdown fold) were taken from the npm package through the jsdelivr mirror and appended to `editor.js` / `editor.css`; `vendor.ps1` lists them, so a later rebuild includes them (`a6f3a2d`). |
| 3 | Line diff for the change and git markers: a library (3.5) needs npm. | An own Myers diff in `gutter.js` (`diffLines`); texts that need more than 2000 edits count as one change. |
| 4 | Where the language packs live while there is no pack loader in the host. | `wwwroot\languages\<name>\language.json`, read by the page (CSP `connect-src 'self'` added). The language packs plan moves the loading to the host when it adds the user packs folder. |
| 5 | Action kinds: the plan names command, jump, linePrefix, wrap, insert. | Only command and jump are built: the shipped packs use no other. linePrefix, wrap and insert come with the language packs plan, which is the first to need them. |
| 6 | The comment actions need the language's comment markers, which are not in the `actions` part. | The markdown pack has a `comments` part too (as the language packs plan defines it); code files without a pack use the markers of their CodeMirror mode. The comment actions live in the plain text pack, the base, and are greyed out where there are no markers. |
| 7 | Tab, Shift+Tab, Enter and Shift+Enter in keys.json (they were in the Format table of 3.3). | They stay fixed editor keys: they type, and in a markdown table they move between cells. F1 lists them under fixed keys, with the folder pane and menu keys. |
| 8 | Key names: by character or by physical key? | By physical key (`KeyboardEvent.code`), so Ctrl+Shift+` works although ` is a dead key on US-International. On another layout a key name means the key at that place on a US keyboard (as CodeMirror already did). |
| 9 | The host's message to the page sorts the keys of an object, so the order of keys.json was lost (the first key of an action is the one menus and tooltips show). | The host sends the order as a list next to the keys. |
| 10 | `find.js` had a global function `go`, which replaced back / forward (`go` in `app.js`) after the first find: Alt+Left did a find step instead. | Renamed to `findGo`. An existing bug, found while moving the keys (`00d964a`). |
| 11 | `actions.js` referred to `bothShown` from `app.js` while loading, which stopped it half-way: all actions after it were missing. | Wrapped in functions; the tests check that every key in keys.json has an action. |
| 12 | Key check 3 (2026-10-19): Ctrl+Shift+B, Ctrl+T, Ctrl+Shift+PgUp / PgDn, Ctrl+Shift+/, Alt+Left / Right, Alt+F / E / R / V / O and Ins arrive. Ctrl+Shift+C and Ctrl+` do not: PowerToys takes them on this PC. | Defaults kept; your own keys.json can move them. |
| 13 | Ctrl+Shift+C and the WebView2 DevTools element picker: not checkable here (PowerToys has the key). | DevTools are switched off in the release build (`AreDevToolsEnabled`); the debug build keeps them for the tests. |
| 14 | Bookmarks: in the session for open tabs and in bookmarks.json for closed files (3.4). | One store for both: bookmarks.json per path (drafts by id), written on every bookmark change, on save, on close and when a window closes. Re-finding by line text (`BookmarkStore.Resolve`) is in the host, so it is unit tested. |
| 15 | Enter at the start of a bookmarked line left the bookmark on the new empty line. | Bookmarks are made with `insertLeft`, so they move along with their text. |
| 16 | Ctrl+/ in code put `//` at column 0. | At the line's indentation, as VS Code does. |
| 17 | Git markers did not follow a commit when only a file is open (no folder, so no watcher on `.git`). | HEAD is asked again on git changes in the open folder and whenever the window gets the focus back. |
| 18 | Copy and cut with nothing selected, with a numbered clipboard active. | They take the cursor's line, as the editor does with the Windows clipboard. |
| 19 | Clipboards and inputs: Ctrl+C / Ctrl+V in the find box or the search with clipboard 3 active. | Inputs always use the Windows clipboard. Pictures too: Ctrl+V of a picture only with the Windows clipboard active; Ctrl+T, I and Edit > Paste image always take the Windows clipboard. |
| 20 | The recent lists and favourites in the File menu are entries (files), not actions. | They cannot get a key; New file, Open file and Open folder can. |
| 21 | Ctrl+Tab in recently used order from F1 or a menu (no Ctrl to let go of). | One step back, which then counts as the most recent. |
| 22 | Menu letters (3.8: chosen while building). | File: New file N, Open file F, Open folder O, Favourites V, Recent files R, Recent folders E, Recently closed C, Save S, Save as A, Close tab T, Reopen closed tab B, Close window W. Edit: Undo U, Redo R, Cut T, Copy C, Paste P, Paste image I, Select clipboard L, Find F, Replace E, Search in files S, Next section O, Previous section V, Go to bookmark G, Store bookmark B, Next bookmark N, Previous bookmark K. Format: Toggle comment C, Toggle block comment E, Remove block comment M, Bold B, Italic I, Strikethrough S, Inline code D, Insert link L, Insert image from clipboard G, Insert image from file F, Heading H, Plain paragraph P, Bulleted list U, Numbered list N, Task list item T, Quote Q, Code block K, Horizontal rule R, Table A. View: Editor E, Preview P, Outline O, Sidebar I, Folders F, Search S, Panes A, Scroll both panes together T, Tabs on several rows R, Formatting bar M, Gutter G, Day / night D, Zoom Z. Options: Settings S, Keyboard shortcuts and commands K, About A. Checked by a script: no letter twice on one level. |
| 23 | Tests (3.7): the in-app tests drive the debug build through the debugging port. | Scripts in the session scratchpad (not in the repository), one per step: encoding and backup, keys and actions, menus, clipboards, bookmarks, gutter, your own keys.json. All pass at the end of the run; unit tests: 82. |
