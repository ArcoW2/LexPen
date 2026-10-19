# LexPen

Fast, intuitive and flexible text and code editor for Windows, with a built-in viewer.

LexPen is a small WinForms app that hosts a WebView2 control. The whole UI is a local web page
(`wwwroot`): CodeMirror 5 for editing, markdown-it for the preview. The native shell (`MainForm.cs`) handles
everything the page can't do itself: file and folder dialogs, reading and writing files, watching
for changes, git, the clipboard and window/theme settings. The page and the shell talk through JSON messages.

## Features

- **Settings window** (Options > Settings): every setting in one searchable list with a header per group; a change
  applies at once in every LexPen window, Reset goes back to the default. Your `settings.json` in
  `%LOCALAPPDATA%\LexPen` holds only what you changed (the defaults with a comment each: `wwwroot\settings.json`);
  edit it by hand or copy it to another PC, a change in it applies at once. Problems in it show in the window.
- **Editor first**: files open in the editor. Markdown opens as the setting **Open markdown in** says
  (editor, editor and preview, or preview). **Editor** and **Preview** in the toolbar (and the View menu) are
  switches; one of them stays on. Ctrl+E shows or hides the preview next to the editor. The splitter between
  them sets their widths (double-click: half and half).
- **Pinned tabs** (right-click a tab > Pin tab): a pin before the name. Closing it alone asks first; Close other
  tabs, Close tabs to the right, Close all tabs (tab menu, the tab bar's own menu and File menu; one pane) and closing a pane leave it
  open. Closing the second pane or a secondary window moves pinned tabs to the main pane / primary window
  (a setting, on by default). Kept in the session.
- **Read-only tabs** (right-click a tab > Read-only): the tab cannot change the file; switching it off is
  refused while another tab or window edits the file. A file with the Windows read-only attribute opens
  read-only. The tooltip says why a tab is read-only.
- **Wrap long lines** (View menu, Alt+Z, on by default): in the editor and for code in the preview. A line of
  more than 10,000 characters always wraps in the preview: one such coloured line makes the browser freeze for
  seconds on every mouse move (see docs/plans/executed/PLAN-long-lines.md).
- **Menus**: File, Edit, Format, View and Options in the toolbar row. Every item shows its key; Alt+letter opens a
  menu, the arrow keys move, Enter runs, Esc closes one level, an underlined letter runs its item. The focus stays
  in the editor, so a menu item works on the cursor and the selection there.
- **Keys you can change**: every key runs an action, and every menu item is an action. `wwwroot\keys.json` is the
  default set; a `keys.json` in `%LOCALAPPDATA%\LexPen` overrides it key by key (`"Ctrl+T": null` takes a key
  away). Chords like `Ctrl+K, K`: the first key waits in the bottom bar for the second. A move (section,
  bookmark) selects when Shift is added to its key.
- **F1**: every action with its key, grouped and searchable (on key, title, hint or action name). Enter runs the
  selected one, so F1 is also a command palette and the way to actions without a key. Your own keys are marked;
  a default you replaced is shown struck through.
- **Language actions**: what Format does depends on the language of the file (`wwwroot\languages\<name>\language.json`).
  Markdown has the formatting; every language with comment markers has Toggle comment (Ctrl+/), Toggle block
  comment (Ctrl+Shift+/) and Remove block comment; Ctrl+PgDn / Ctrl+PgUp go to the next / previous section
  (a heading in markdown, a paragraph in plain text). Items a language does not have are greyed out.
- **Bookmarks**: 1 to 9 and unnumbered ones, at a line and column, kept per file. Ctrl+1, S stores bookmark 1,
  Ctrl+1, 1 (or Ctrl+1, Ctrl+1) goes there, Ctrl+1, T toggles, Ctrl+1, C clears; Ctrl+K, 1 and Ctrl+Q, 1 as in
  WordStar and Delphi; Ctrl+K, K / N / P / L for unnumbered ones, next, previous and the list. They follow
  inserted and removed lines, and are found again by their line text when the file changed outside LexPen.
- **Clipboards**: next to the Windows clipboard, LexPen has clipboards 1 to 9 (shared by all windows, kept across
  restarts). Ctrl+Shift+1 to 9 selects one, Ctrl+Shift+` the Windows clipboard; Ctrl+C, Ctrl+X and Ctrl+V then
  work on the active one. The bottom bar shows it (Clip: Win, Clip: 3); a click there or Ctrl+Shift+C lists them
  with the start of their text.
- **Gutter**: line numbers, bookmarks, change markers (not saved yet), git markers (changed since the last commit;
  a click shows the old text and can revert the block) and fold markers (heading sections and code blocks in
  markdown, braces or indentation in code). View > Gutter switches each column. Line numbers: none, every 10 (a
  dash at 5, a dot on the others) or every line; absolute or relative to the cursor line.
- **Bottom bar**: line and column (and the size of the selection), INS / OVR (Ins), encoding, line endings,
  language, the active clipboard and a pending chord. "Long line: colour stops at 10,000 characters" when a
  line is that long (the editor colours a line up to there). At the far right a heartbeat (- \ | /) turns
  while LexPen responds; when it stands still, LexPen is busy. The bottom bar can have a font and size of its own.
- **Encodings**: UTF-8, UTF-8 with BOM, UTF-16 and ANSI files are saved the way they were read. A file that is not
  valid UTF-8 and has no BOM is ANSI (the Windows code page); a character ANSI cannot hold is refused when saving,
  Save as under another name saves it as UTF-8.
- **Backup on save**: the old file becomes `name.ext.bak` (overwritten at the next save; a setting,
  on by default). Saving goes through a temporary file that replaces the old one in one step.
- **Tabs and two panes**: every file opens in a tab. Ctrl+click a file in the tree, drag a tab or file onto the
  other half of the window, or right-click a tab > **Move to other pane** to show two files next to each other.
  The divider can be dragged; **Side by side / Above each other** (or right-click the divider) switches the split.
  The active pane has a blue (day) or yellow (night) border. Clicking a file in the tree shows it in the current
  tab; Shift+click opens a new tab, Ctrl+click shows it in the other pane, Ctrl+Shift+click opens a new tab there.
  The same file can be open in both panes: the first copy edits, the other shows the text live, read-only. Drag a
  tab along the tab bar to reorder it. Right-click a tab for Close, Close other tabs, Close tabs to the right;
  View > **Tab bar**: one row that scrolls, one row with a menu for the tabs out of view, or several rows.
- **Ctrl+Tab**: through the documents in recently used order (hold Ctrl and press Tab again to go further back),
  or in tab bar order (the setting Ctrl+Tab order).
- **Outline**: Ctrl+Shift+H shows the headings of each pane's file at its right; click one to go there (preview
  and editor). The heading you are at is highlighted. Its width can be dragged.
- **Search** (Ctrl+Shift+F): in the current file, the open files (unsaved edits included) or the files in the
  folder (the open folder, otherwise the folder of the current file), with match case, whole word and regular
  expressions. Codes: `^p` line break (CR, LF or CRLF), `^t` tab, `^?` any character, `^#` digit, `^$` letter,
  `^w` spaces or tabs, `^^` the `^` itself. Click a result to go there.
- **Compare**: the button on the divider (View > Scroll both panes together) scrolls both panes together, by
  source line: preview with preview, editor with editor.
- **One instance, more windows**: opening a file while LexPen runs adds it as a tab to the most recently used window.
  Hold **Shift** while starting it, or pass `-n` (`--new-window`), to get a new window instead. Several paths at
  once: every folder gets a window, files go to the window of the folder they are in. A tab can move to another
  window (right-click a tab, or drag it out of the window). Windows other than the first one have a dimmed title
  bar and toolbar and a number in the title. A file open in two windows can only be edited in the first one.
- **File menu**: New file, Open file, Open folder, Favourites, the recently opened files and folders and the
  recently closed files (15 each, shared by all windows). An entry that no longer exists is dimmed; choosing it
  removes it.
- **Drafts**: a new file is kept as a draft (`%LOCALAPPDATA%\LexPen\State\Drafts\editN.md`) until saved, and comes back
  at the next start. The first window also restores its folder, tabs and panes.
- **Changed on disk**: an open file with unsaved changes that changes on disk gets a blue bar (Reload / Keep mine),
  a removed or renamed file a red one (Close / Save it again / Keep as draft). A file without unsaved changes
  is reloaded; when that happened out of sight, a blue banner says so until you click anywhere or press Esc.
  Files that changed while the window was not active are highlighted in the tree until opened.
- **Code files**: JSON, YAML, PowerShell and C# (`.json`, `.yaml`, `.yml`, `.ps1`, `.psm1`, `.psd1`, `.cs`) are
  shown and edited with syntax highlighting. Other text files open as plain text; binary files and files over
  10 MB are refused.
- **Folder sidebar** (Ctrl+Shift+B): browse all files in a folder, sorted by name or modified time. The `..` row
  (Alt+Up, Backspace) goes up a folder. Ctrl+Shift+E (or a click) gives it the keyboard: arrows, Home/End,
  PgUp/PgDn, Enter (Shift+Enter: new tab, Ctrl+Enter: other pane, Ctrl+Shift+Enter: new tab there), Esc back to
  the document (hidden files, dot folders and `node_modules` are skipped), with git status markers (modified,
  added, untracked, deleted, renamed, conflict) when the folder is in a repository. Files other than markdown are
  dimmed; the **M** button in the sidebar header hides everything except markdown files (folders stay).
  Right-click a file or folder to copy its absolute path, or its path relative to the open folder.
- **Rich rendering**: GitHub-style markdown plus footnotes, definition lists, task lists, emoji,
  ==highlight==, sub/superscript, heading anchors, YAML front matter, syntax highlighting (highlight.js),
  math (KaTeX) and diagrams (Mermaid). KaTeX and Mermaid load only when a document needs them.
- **Line breaks**: by default a single line break inside a paragraph renders as a space (CommonMark, as GitHub
  shows `.md` files). **Single line break starts a new line** (a setting) renders it as a line break.
- **Local images**: images referenced by relative path are served to the page from disk.
- **Paste or drop images**: Ctrl+V of a picture or an image file (with the Windows clipboard active), Format >
  Insert image from clipboard (Ctrl+T, I), or dropping an image file (also from the tree) on the editor, inserts
  an image link. An image in the document's folder or below it is linked where it is; one elsewhere, and a pasted
  picture, is copied to a folder named after the document (`readme.md.images`). With Shift held (or Ctrl+Shift+V,
  Edit > Paste image) LexPen asks: relative path, absolute path (`D:/x/y.png`), copy to the document's folder, or
  copy to its image folder.
- **Day / night theme** (View menu), remembered together with the window position.
- **Preview zoom**: Ctrl+= / Ctrl+- / Ctrl+mouse wheel over a preview. The level shows at the right of the top
  bar (click it for 100%) and is kept.
- **Fonts** (settings window, F1): the editor font and the app font, each with a size in points, and the
  editor's line height; every window follows a change. In the editor Ctrl+= / Ctrl+- / Ctrl+mouse wheel change
  the editor font size, Ctrl+0 sets it back to the default. The preview keeps its own look.
- **No printing**: there is no print command (also not in the right-click menu of the page).
- **Safe by default**: a Content Security Policy blocks scripts embedded in a document's raw HTML.

See [demo.md](demo.md) for a document that exercises every supported element.

### Keys

F1 lists every key and action. The main ones of the default set:

| Keys | Action |
|---|---|
| Ctrl+S / Ctrl+Shift+S | Save / save as |
| Ctrl+W / Ctrl+F4, Ctrl+Shift+T | Close tab, reopen the last closed tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous document |
| Alt+Left / Alt+Right, mouse back / forward | Back / forward to the tab and file shown before, like a browser |
| Ctrl+E | Show / hide the preview |
| Ctrl+Shift+H, Ctrl+Shift+B, Ctrl+Shift+E | Outline, sidebar, folder pane |
| Ctrl+F, F3 / Shift+F3, Ctrl+Shift+R, Ctrl+Shift+F | Find, next / previous, replace, search in files |
| Ctrl+PgDn / Ctrl+PgUp | Next / previous section (with Shift: select) |
| Ctrl+Shift+1 .. 9, Ctrl+Shift+` , Ctrl+Shift+C | Select clipboard 1 to 9, the Windows clipboard, the list |
| Ctrl+1, S / T / C, Ctrl+1, 1 | Bookmark 1: store, toggle, clear, go to (likewise 2 to 9) |
| Ctrl+K, K / N / P / L | Unnumbered bookmark, next, previous, list |
| Ctrl+/, Ctrl+Shift+/ | Toggle comment, toggle block comment |
| Ctrl+B, Ctrl+I, Ctrl+Shift+X, Ctrl+` | Bold, italic, strikethrough, inline code |
| Ctrl+T, L / Ctrl+T, I | Insert link / image from the clipboard |
| Ctrl+H, 1 .. 6 / Ctrl+H, 0 | Heading 1 to 6 / plain text |
| Ctrl+P, B / N / T / Q / C / P | Bulleted list, numbered list, task, quote, code block, plain paragraph |
| Alt+F / E / R / V / O | File / Edit / Format / View / Options menu |
| F1 | All keys and commands |

## Requirements

- Windows 10 or 11 (x64)
- [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download) (the app is framework-dependent)
- Microsoft Edge WebView2 Runtime (included with Windows 11)
- Optional: `git` on the `PATH` for status markers in the sidebar and git markers in the gutter

To build: the .NET 10 SDK. Node.js is only needed when upgrading the front-end libraries.

## Build and run

```powershell
dotnet build                                  # debug build
dotnet run -- path\to\file.md                 # run, optionally opening a file
dotnet publish -c Release -o publish          # release build into .\publish
```

Arguments are files and folders to open, plus `-n` / `--new-window` for a new window (see **One instance, more
windows** above).

```powershell
dotnet test tests\LexPen.Tests                # unit tests
```

`publish` holds exactly what is needed to run the app (no symbols or documentation files), so the whole
folder can be zipped and handed out. Delete it before publishing, because publish doesn't remove files left
over from earlier runs. The other user needs the .NET 10 Desktop Runtime installed. The release build has the
WebView2 developer tools switched off; the debug build keeps them.

### Versioning

The version is `1.0.<commits>`, where the last number is the git commit count (`git rev-list --count HEAD`,
see the `GitVersion` target in `LexPen.csproj`), so each commit gets its own version. Without git, or before
the first commit, it is `1.0.0`. The version, short commit hash, build time, runtime and library versions
are shown under **Options > About LexPen**.

## Open .md files with LexPen

`register.ps1` registers the published exe as a handler for `.md` files for the current user (no admin needed):

```powershell
.\register.ps1            # register .\publish\LexPen.exe
.\register.ps1 -Exe C:\Tools\LexPen\LexPen.exe
.\register.ps1 -Remove    # undo
```

Windows only lets the user choose the default app, so if another app already owns `.md` the script
opens **Settings > Default apps** where you pick LexPen.

## Front-end libraries

The libraries in `wwwroot/vendor` are checked in, so a normal build needs no Node.js.
To upgrade them:

```powershell
npm.cmd install           # versions come from package.json
.\vendor.ps1              # rebuilds wwwroot\vendor from node_modules
```

`vendor.ps1` bundles the files into a few loads: `core.js` (markdown-it, plugins, highlight.js with its common
languages plus PowerShell; always loaded), `editor.js`/`editor.css` (CodeMirror with markdown, JSON, YAML,
PowerShell and C# modes and the search, comment and fold add-ons; loaded when the editor is first shown), and
`katex/` and `mermaid.min.js` (loaded only when a document contains math or diagrams). It also writes
`versions.json` for the About window.

## Project layout

| Path | Contents |
|---|---|
| `Program.cs` | Entry point: single instance (mutex + named pipe), hands the arguments to the running instance |
| `AppHost.cs` | Owns the windows: routing launches, primary window, edit locks, moving tabs, settings, session, clipboards, bookmarks |
| `Router.cs` | Which window gets which paths of a launch (pure, unit tested) |
| `DraftStore.cs` | Drafts (`Drafts\editN.md`), written in the background |
| `TextFile.cs` | Reading and writing files in their own encoding; the backup on save |
| `KeysFile.cs` | `keys.json`: the default set merged with the user's own |
| `ClipboardStore.cs` | Clipboards 1 to 9 (`clipboards.json`) |
| `BookmarkStore.cs` | Bookmarks of closed files (`bookmarks.json`), found again by their line text |
| `Fonts.cs` | The installed fonts for the font settings, monospaced or not |
| `SettingsFile.cs` | `settings.json`: the defaults merged with yours, problems, only differences written |
| `SettingsForm.cs` | The settings window (`wwwroot/settings.html`, `settings.js`) |
| `DataFolder.cs` | The data folder's layout (`State\`) and the one-time move of an older layout |
| `MainForm.cs` | One window: WebView2 host, message handling, file access, watchers, git, close prompt |
| `tests/LexPen.Tests` | Unit tests |
| `wwwroot/index.html` | The UI page and its Content Security Policy |
| `wwwroot/app.js` | Documents, tabs and panes, rendering, editor, sidebar, bottom bar |
| `wwwroot/keys.js`, `keys.json` | Key presses, chords and the default keys |
| `wwwroot/actions.js` | The actions; the language packs |
| `wwwroot/menus.js`, `palette.js` | The menu bar; F1 |
| `wwwroot/format.js`, `bookmarks.js`, `gutter.js`, `find.js` | Editor commands and the formatting bar; bookmarks; the gutter; find in a pane |
| `wwwroot/languages/` | Language packs: markdown and plain text (the actions part) |
| `wwwroot/app.css`, `theme.js` | Styling and day/night theme |
| `wwwroot/vendor/` | Bundled third-party libraries (generated by `vendor.ps1`) |
| `img/icon/` | App icon: `lexpen.ico` (`lexpen.svg` is its source, `make-ico.ps1` rebuilds `lexpen.ico` and `lexpen.png`) |
| `demo.md` | Formatting showcase |
| `register.ps1` | `.md` file association |
| `vendor.ps1` | Rebuilds `wwwroot/vendor` |

`%LOCALAPPDATA%\LexPen` holds what you choose: `settings.json` (only what differs from the defaults), `keys.json`,
`favourites.json`, `tab-colours.json`. What LexPen remembers by itself is in its `State\` subfolder: `state.json`
(window position, recent lists), `session.json` (the first window's tabs and panes), `Drafts\`, `clipboards.json`,
`bookmarks.json` and `EBWebView\` (the browser's own data). An older layout is moved over once at start
(DataFolder.cs). Set the environment variable `LEXPEN_DATA` to use another folder (for testing).
