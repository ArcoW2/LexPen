# LexPen

Fast, intuitive and flexible text and code editor for Windows, with a built-in viewer.

LexPen is a small WinForms app that hosts a WebView2 control. The whole UI is a local web page
(`wwwroot`) that renders markdown with markdown-it. The native shell (`MainForm.cs`) handles
everything the page can't do itself: file and folder dialogs, reading and writing files, watching
for changes, git status and window/theme settings. The page and the shell talk through JSON messages.

## Features

- **Tabs and two panes**: every file opens in a tab. Ctrl+click a file in the tree, drag a tab or file onto the
  other half of the window, or right-click a tab > **Move to other pane** to show two files next to each other.
  The divider can be dragged; **Side by side / Above each other** (or right-click the divider) switches the split.
  The active pane has a blue (day) or yellow (night) border. Clicking a file in the tree shows it in the current
  tab; Shift+click opens a new tab, Ctrl+click shows it in the other pane, Ctrl+Shift+click opens a new tab there. The same file can be open in both panes: the first
  copy edits, the other shows the text live, read-only. Drag a tab along the tab bar to reorder it.
  Right-click a tab for Close, Close other tabs, Close tabs to the right; More > **Tabs on several rows** wraps the
  tab bar instead of scrolling it.
- **Outline**: the Outline button (Ctrl+Shift+H) shows the headings of each pane's file at its right; click one to
  go there (preview and editor). The heading you are at is highlighted. Its width can be dragged.
- **Search** (Ctrl+Shift+F): in the current file, the open files (unsaved edits included) or the files in the
  folder (the open folder, otherwise the folder of the current file), with match case, whole word and regular
  expressions. Codes: `^p` line break (CR, LF or CRLF), `^t` tab, `^?` any character, `^#` digit, `^$` letter,
  `^w` spaces or tabs, `^^` the `^` itself. Click a result to go there.
- **Compare**: the button on the divider (Ctrl+Shift+L) scrolls both panes together, by source line: preview
  with preview, editor with editor.
- **One instance, more windows**: opening a file while LexPen runs adds it as a tab to the most recently used window.
  Hold **Shift** while starting it to get a new window instead. Several paths at once: every folder gets a window,
  files go to the window of the folder they are in. A tab can move to another window (right-click a tab, or drag
  it out of the window). Windows other than the first one have a dimmed title bar and toolbar and a number in
  the title. A file open in two windows can only be edited in the first one.
- **Open menu**: File..., Folder..., and flyouts with the recently opened files and folders and the recently
  closed files (15 each, shared by all windows). An entry that no longer exists is dimmed; clicking it removes it.
- **Drafts**: a new file is kept as a draft (`%LOCALAPPDATA%\LexPen\Drafts\editN.md`) until saved, and comes back
  at the next start. The first window also restores its folder, tabs and panes.
- **Changed on disk**: an open file with unsaved changes that changes on disk gets a blue bar (Reload / Keep mine),
  a removed or renamed file a red one (Close / Save it again / Keep as draft). A file without unsaved changes
  is reloaded; when that happened out of sight, a blue banner says so until you click anywhere or press Esc. Files that changed while the
  window was not active are highlighted in the tree until opened.
- **Read, Split and Edit modes**: rendered preview, source next to preview, or the editor alone
  (CodeMirror 5 with GFM highlighting, list continuation and search).
- **Code files**: JSON, YAML, PowerShell and C# (`.json`, `.yaml`, `.yml`, `.ps1`, `.psm1`, `.psd1`, `.cs`) are
  shown and edited with syntax highlighting. Other text files open as plain text; binary files and files over 10 MB are refused.
- **Folder sidebar**: browse all files in a folder, sorted by name or modified time. The `..` row (Alt+Up, Backspace)
  goes up a folder. Ctrl+Shift+E (or a click) gives it the keyboard: arrows, Home/End, PgUp/PgDn, Enter
  (Shift+Enter: new tab, Ctrl+Enter: other pane, Ctrl+Shift+Enter: new tab there), Esc back to the document (hidden files, dot folders and `node_modules` are skipped),
  with git status markers (modified, added, untracked, deleted, renamed, conflict) when the folder is in a repository.
  Files other than markdown are dimmed; the **M↓** button in the sidebar header hides
  everything except markdown files (folders stay). Right-click a file or folder to copy its absolute path,
  or its path relative to the open folder.
- **Live reload**: the open file and folder tree refresh when they change on disk.
- **Rich rendering**: GitHub-style markdown plus footnotes, definition lists, task lists, emoji,
  ==highlight==, sub/superscript, heading anchors, YAML front matter, syntax highlighting (highlight.js),
  math (KaTeX) and diagrams (Mermaid). KaTeX and Mermaid load only when a document needs them.
- **Line breaks**: by default a single line break inside a paragraph renders as a space (CommonMark, as GitHub
  shows `.md` files). **Single line break starts a new line** in the More menu renders it as a line break instead; remembered.
- **Local images**: images referenced by relative path are served to the page from disk.
- **Paste or drop images**: Ctrl+V of a picture or an image file, or dropping an image file (also from the tree)
  on the editor, inserts an image link. An image in the document's folder or below it is linked where it is;
  one elsewhere, and a pasted picture, is copied to a folder named after the document (`readme.md.images`).
  With Shift held (or Ctrl+Shift+V) LexPen asks: relative path, absolute path (`D:/x/y.png`), copy to the
  document's folder, or copy to its image folder.
- **Day / night theme**, remembered together with the window position.
- **Preview zoom**: Ctrl+plus / Ctrl+minus / Ctrl+mouse wheel over a preview, Ctrl+0 back to 100%. The level shows at
  the right of the top bar (click it for 100%) and is kept; the editor keeps its size.
- **Print / save as PDF**.
- **Safe by default**: a Content Security Policy blocks scripts embedded in a document's raw HTML.

See [demo.md](demo.md) for a document that exercises every supported element.

### Keyboard shortcuts

| Keys | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>O</kbd> | Open file |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> | Open folder |
| <kbd>Ctrl</kbd>+<kbd>N</kbd> | New file (a draft until saved) |
| <kbd>Ctrl</kbd>+<kbd>W</kbd> | Close tab (also middle-click) |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> | Reopen the last closed tab (also right-click an empty spot of the tab bar) |
| <kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd> | Next / previous tab |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | Scroll both panes together |
| <kbd>Ctrl</kbd>+click in the tree | Open in the other pane |
| <kbd>Ctrl</kbd>+<kbd>E</kbd> | Toggle read / split view |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> save as) |
| <kbd>Ctrl</kbd>+<kbd>B</kbd> | Toggle sidebar (bold while typing in the editor) |
| <kbd>Ctrl</kbd>+<kbd>T</kbd> | Day / night theme |
| <kbd>Ctrl</kbd>+<kbd>F</kbd> | Find |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | Print / save as PDF |
| <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd>, mouse back / forward | Back / forward to the tab and file shown before, like a browser (the scroll position is restored) |

## Requirements

- Windows 10 or 11 (x64)
- [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download) (the app is framework-dependent)
- Microsoft Edge WebView2 Runtime (included with Windows 11)
- Optional: `git` on the `PATH` for status markers in the sidebar

To build: the .NET 10 SDK. Node.js is only needed when upgrading the front-end libraries.

## Build and run

```powershell
dotnet build                                  # debug build
dotnet run -- path\to\file.md                 # run, optionally opening a file
dotnet publish -c Release -o publish          # release build into .\publish
```

Arguments are files and folders to open (see **One instance, more windows** above).

```powershell
dotnet test tests\LexPen.Tests                    # unit tests: argument routing, drafts
```

`publish` holds exactly what is needed to run the app (no symbols or documentation files), so the whole
folder can be zipped and handed out. Delete it before publishing, because publish doesn't remove files left
over from earlier runs. The other user needs the .NET 10 Desktop Runtime installed.

### Versioning

The version is `1.0.<commits>`, where the last number is the git commit count (`git rev-list --count HEAD`,
see the `GitVersion` target in `LexPen.csproj`), so each commit gets its own version. Without git, or before
the first commit, it is `1.0.0`. The version, short commit hash, build time, runtime and library versions
are shown under **⋯ > About LexPen**.

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
languages plus PowerShell — always loaded), `editor.js`/`editor.css` (CodeMirror with markdown, JSON, YAML, PowerShell
and C# modes — loaded when the editor is first shown), and `katex/` and `mermaid.min.js`
(loaded only when a document contains math or diagrams). It also writes `versions.json` for the About window.

## Project layout

| Path | Contents |
|---|---|
| `Program.cs` | Entry point: single instance (mutex + named pipe), hands the arguments to the running instance |
| `AppHost.cs` | Owns the windows: routing launches, primary window, edit locks, moving tabs, settings and session |
| `Router.cs` | Which window gets which paths of a launch (pure, unit tested) |
| `DraftStore.cs` | Drafts (`Drafts\editN.md`), written in the background |
| `MainForm.cs` | One window: WebView2 host, message handling, file access, watchers, git status, close prompt |
| `tests/LexPen.Tests` | Unit tests |
| `wwwroot/index.html` | The UI page and its Content Security Policy |
| `wwwroot/app.js` | Documents, tabs and panes, rendering, editor, sidebar, modes and shortcuts |
| `wwwroot/app.css`, `theme.js` | Styling and day/night theme |
| `wwwroot/vendor/` | Bundled third-party libraries (generated by `vendor.ps1`) |
| `img/icon/` | Icon candidates; `2-hash-dark.ico` is the app icon |
| `demo.md` | Formatting showcase |
| `register.ps1` | `.md` file association |
| `vendor.ps1` | Rebuilds `wwwroot/vendor` |

Settings (theme, window position) are stored in `%LOCALAPPDATA%\LexPen\settings.json`, the first window's tabs and
panes in `session.json`, drafts in `Drafts\`. Set the environment variable `LEXPEN_DATA` to use another folder
(for testing).
