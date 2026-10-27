# LexPen

Fast, intuitive and flexible text and code editor for Windows, with a built-in viewer.

LexPen is a small WinForms app that hosts a WebView2 control. The whole UI is a local web page
(`web`, built into the exe): CodeMirror 5 for editing, markdown-it for the preview. The native shell (`MainForm.cs`) handles
everything the page can't do itself: file and folder dialogs, reading and writing files, watching
for changes, git, the clipboard and window/theme settings. The page and the shell talk through JSON messages.

## Features

The short list, by group. Every feature in detail: [docs/features.md](docs/features.md).

### Editing

- **Editor and preview, side by side or either alone**; each language opens the way you set it.
- **Multiple cursors**: add them by Ctrl+Alt+click, or occurrence by occurrence of the find text (Ctrl+D, A).
- **Column mode** (Alt+C): select, type, paste and indent a rectangular block, also past line ends.
- **Cursor past the end of the line** (a setting): Up and Down keep the column, typing fills with spaces.
- **Word completion** (Ctrl+Space): keywords, the document's words and snippets.
- **Reformat** the selection or the file by each language's own rules; only whitespace changes.
- **Conversions**: UPPER, lower, smart capitals, snake_case, camelCase, tabs to spaces and more (Ctrl+Alt+C).
- **Indentation while typing**, and **tab stops** you set on the ruler.
- **Nine clipboards** next to the Windows one, shared by all windows and kept across restarts.
- **Character picker** (Ctrl+Alt+U): every character of the font, searchable by code, entity or name.
- **Paste or drop images**: the image is linked, or copied next to the document.

### Finding and moving around

- **Find, replace and search in files**, with a history of searches; matches marked in the editor and the preview.
- **Bookmarks** 1 to 9 and unnumbered ones, as in WordStar and Delphi.
- **Highlights with notes**, like a highlighter pen; they follow your edits and changes made outside LexPen.
- **Outline** of headings, procedures and classes, grouped per language, with a sneak preview on a long click.
- **Position back / forward** (Ctrl+Alt+- / Ctrl+Alt++, or the mouse buttons) through the places you jumped from.
- **Locate the cursor**: tap Ctrl alone.
- **Keyboard between panes and parts**: Ctrl+Tab to the next pane, Ctrl+Shift+Tab to the editor, preview or outline;
  Ctrl+PgDn / Ctrl+PgUp through the documents.

### How the text looks

- **Gutter**: line numbers, bookmarks, unsaved and git changes (click to see or revert), folding.
- **Ruler, column guides and helper lines**.
- **Indent guides**, one colour or a rainbow, the cursor's block in a colour of its own.
- **Invisible characters**: spaces, tabs, line ends, control characters and bytes the encoding cannot read.
- **Scroll bars with an overview** of find matches, changes and bookmarks, in the editor and the preview.
- **Fonts and zoom**: an editor font and an app font; the zoom is kept per screen.

### Preview

- **Rich markdown**: GitHub style plus footnotes, task lists, emoji, math (KaTeX) and diagrams (Mermaid).
- **Code files coloured** as in the editor.
- **Follows the editor**: the cursor's line is marked and kept at the editor's height.
- **Double-click a word** to go to it in the editor.

### Compare

- **Compare two files**: side by side, editable, the changed characters marked, copy across.
- **Compare two folders**: one tree of both, contents compared in the background.
- **Compare from Explorer**: Select left side, then Compare to; opens in a project for comparing of its own.

### Files and folders

- **Folder sidebar** with git status, sorted by name or date, all keyboard; **Known** shows only the file types LexPen knows.
- **Favourite files and folders**, recent files and folders.
- **Drafts** kept until saved, also across restarts; give one a name (`query.sql`) before saving it.
- **Changed on disk**: reloaded, or a bar asks when you have unsaved changes.
- **Encodings kept** (UTF-8, with or without BOM, UTF-16, ANSI), and a **backup on save**.
- **View and Edit in LexPen** from Explorer's right-click menu, and **file types** for a double-click.

### Tabs, panes, windows and projects

- **Two panes**, side by side or above each other; the same file can be edited in both.
- **Pinned and read-only tabs**.
- **Scroll both panes together**, by source line.
- **One instance, more windows**; each window comes back on its own virtual desktop.
- **Projects**: every window keeps its folder, tabs, panes and place, saved continuously.
- **Window layout** per window, with Save as default and Reset to default.

### Languages and themes

- **Language packs** for markdown, C#, SQL, Pascal, PowerShell, JSON, YAML, XML, KQL and many more; add your own.
- **A language inside a language**: fences, embedded blocks, or lines you mark.
- **Themes**: light, dark, black and many tints; the app, editor and preview can each have their own.
- **Theme sets**: a project's whole look in one step, so projects look apart at a glance.
- **Follows Windows' light / dark mode**, with Day / night to switch by hand.

### Settings, keys and menus

- **Settings window** with search; a change applies at once in every window.
- **Every key can be changed**, chords included (`Ctrl+K, K`).
- **F1**: every action with its key, searchable; also a command palette.

See [demo.md](demo.md) for a document that exercises every supported element.

### Keys

F1 lists every key and action. The main ones of the default set:

| Keys | Action |
|---|---|
| Ctrl+S / Ctrl+Shift+S | Save / save as |
| Ctrl+W / Ctrl+F4, Ctrl+Shift+T | Close tab, reopen the last closed tab |
| Ctrl+PgDn / Ctrl+PgUp | Next / previous document |
| Ctrl+Tab / Ctrl+Shift+Tab | The keyboard to the next pane / the next part (editor, preview, outline) |
| Ctrl+Space | Word completion: keywords, the document's words, snippets |
| F7 / Shift+F7, Ctrl+F7 | Comparing: the next / previous difference; align the two cursor lines |
| Ctrl+Alt+- / Ctrl+Alt++ | Position back / forward in the document (also the mouse buttons; with Ctrl: through the tabs) |
| Alt+Left / Alt+Right | Previous / next tab, in the tab bar's order; the focus goes to its editor or preview, as the tab had it last |
| Alt+Up / Alt+Down | Previous / next section (paragraph, heading, procedure, ... per language; with Shift: select) |
| Mouse back / forward | Back / forward to the tab and file shown before, like a browser |
| Ctrl+Alt+V, E / P / O | View: the editor, the preview (on / off; one of them stays), the outline |
| Ctrl+Shift+B, Ctrl+Shift+E | Sidebar, folder pane |
| Ctrl+F, F3 / Shift+F3, Ctrl+R, Ctrl+Shift+F, Ctrl+Shift+R | Find, next / previous (past the last match: stop, go on from the top, or go on until where the search started; a setting), replace, search in files, replace in files (the selection, the file, the open files or the folder, with a preview window). With text selected in the editor, find and replace stay within it. The replace row: Replace all (Alt+A), Replace, Skip (F3), Previous (Shift+F3); `^p` / `^t` in the replacement (`
` / `	` with a regular expression); `?` lists the codes. Found text is marked with a background colour, a box around it, or both (Options > Settings, Find; in the editor and the preview); so are the line numbers of its lines (a setting). The last searches (with their switches) and replacements are kept for all windows and restarts: Up / Down in a find, replace or search field step through them, Alt+Down (or Down in an empty field) lists them, with Clear history; the find bar and the search in files share the searches (setting: how many, 20) |
| Ctrl+L, D / Ctrl+L, Up / Ctrl+L, Down | Duplicate the lines / move them up / down; moving starts move mode: Up / Down move on, Esc stops |
| Ctrl+G | Go to line: a line number, or line:column; +n or -n: that many lines down or up (also Edit > Go to line...) |
| Ctrl+Alt+U | The character picker (Edit > Insert character...) |
| Ctrl+Up / Ctrl+Down | Scroll the text a line; the cursor stays on its line, or moves along (a setting; then with Shift: select along) |
| Ctrl+[ / Ctrl+] | To the opener (before it) / closer (after it) of the pair or word set around the cursor; again: the pair around that one; with Shift: select. The pair is highlighted as you move and type: the innermost one holding the cursor, or the set of the word the cursor is on (`if` ... `else` ... `end if`), only in the language at the cursor, strings and comments left out (Options > Settings, Editor view: a background colour, an underline or off; closing brackets and quotes while typing: Editor). Edit > Select inside brackets: what lies between |
| Ctrl+> / Ctrl+< | Indent / outdent the lines (in keys.json: `Ctrl+Shift+.` and `Ctrl+Shift+Comma`) |
| Ctrl+Shift+1 .. 9, Ctrl+Shift+` , Ctrl+Shift+C | Select clipboard 1 to 9, the Windows clipboard, the list |
| Alt+C, Alt+Shift+arrows | Column mode on / off, select a block (also without column mode) |
| Ctrl+Alt+click / double-click, Ctrl+D, A / D / R / C, Ctrl+Alt+Right / Left | Multiple cursors: add or remove a cursor, select a find match or word; add / remove / clear occurrences, the next / previous occurrence |
| Tab / Shift+Tab (tab stops on the ruler) | To the next tab stop (spaces) / back to the one before; past them as always |
| Ctrl (a short tap), Ctrl, Ctrl | Locate the cursor (rings on every cursor, a marker for one out of view); the double tap scrolls to it (setting) |
| Ctrl+1, S / T / C, Ctrl+1, 1 | Bookmark 1: store, toggle, clear, go to (likewise 2 to 9) |
| Ctrl+K, K / N / P / L | Unnumbered bookmark, next, previous, list |
| Ctrl+/, Ctrl+Shift+/ | Toggle comment, toggle block comment |
| Ctrl+Alt+C | The Convert menu at the cursor (also in the Convert button's tooltip) |
| Ctrl+Shift+U / Ctrl+U | UPPER CASE / lower case |
| Tab / Shift+Tab | In the indentation (or on selected lines): indent / outdent; after text: to the next tab stop |
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

Arguments are files and folders to open, plus `-n` / `--new-window` for a new window (see [One instance, more windows](docs/features.md#tabs-panes-windows-and-projects)), or `-c` / `--compare` with two files or two folders to compare them in a new window.

```powershell
dotnet test tests\LexPen.Tests                # unit tests
```

`publish` holds exactly what is needed to run the app: `LexPen.exe` (one file: the app, its libraries and the
page), `WebView2Loader.dll` (native, next to it) and `defaults\` (the default keys and settings, the language
packs and themes: to read and copy, not to change). The whole folder can be zipped and handed out. Delete it
before publishing, because publish doesn't remove files left over from earlier runs; for the same reason, when
copying a new version over an older install, delete the older files first (`LexPen.dll`, `LexPen.deps.json`,
`LexPen.runtimeconfig.json`, `Microsoft.Web.WebView2.*.dll`, `YamlDotNet.dll`, `wwwroot\`). The other user needs the .NET 10 Desktop Runtime installed. The release build has the
WebView2 developer tools switched off; the debug build keeps them.

### Versioning

The version is `1.0.<commits>`, where the last number is the git commit count (`git rev-list --count HEAD`,
see the `GitVersion` target in `LexPen.csproj`), so each commit gets its own version. Without git, or before
the first commit, it is `1.0.0`. The version, short commit hash, build time, runtime and library versions
are shown under **Options > About LexPen**.

## Open files with LexPen (file types)

**Options > Settings > App > Windows Explorer > File types...** (also F1 > File types): every extension the language
packs know, with a checkbox, its language, how it opens (Edit, or View in the project for viewing) and the app
Windows opens it with now; sortable by each column, a filter on extension or language. Check all, Check none, All
edit and All view act on the rows shown; Assign on all of them, after a question. It registers the published LexPen
for the current user (no admin needed), and takes a choice you made for another app off those extensions. One Windows
keeps for another app (Windows protects a few) is named, and **Settings > Default apps** opens at LexPen to choose
it there. A debug build does not assign.

## Front-end libraries

The libraries in `web/vendor` are checked in, so a normal build needs no Node.js.
To upgrade them:

```powershell
npm.cmd install           # versions come from package.json
.\vendor.ps1              # rebuilds web\vendor from node_modules
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
| `AppHost.cs` | Owns the windows: routing launches, projects and sessions, edit locks, moving tabs, settings, clipboards, bookmarks |
| `ProjectStore.cs` | Projects and their windows (`projects.json`): sessions, places, desktops, the closing rules (unit tested) |
| `VirtualDesktop.cs` | Windows' virtual desktops (IVirtualDesktopManager): a window's desktop, moving it back |
| `Router.cs` | Which window gets which paths of a launch (pure, unit tested) |
| `DraftStore.cs` | Drafts (`Drafts\editN.md`), written in the background |
| `TextFile.cs` | Reading and writing files in their own encoding; the backup on save |
| `KeysFile.cs` | `keys.json`: the default set merged with the user's own |
| `ClipboardStore.cs` | Clipboards 1 to 9 (`clipboards.json`) |
| `BookmarkStore.cs` | Bookmarks of closed files (`bookmarks.json`), found again by their line text |
| `Fonts.cs` | The installed fonts for the font settings, monospaced or not |
| `SettingsFile.cs` | `settings.json`: the defaults merged with yours, problems, only differences written |
| `SettingsForm.cs` | The settings window (`web/settings.html`, `settings.js`) |
| `WebFiles.cs` | The page's files: served from the exe (a debug build: from the project's `web`) |
| `LanguagePacks.cs` | Language packs: shipped and yours, YAML read with YamlDotNet, given to the page as JSON |
| `ThemeFile.cs` | Themes: shipped and yours, checked, bases followed; colour names and fallbacks from app.css |
| `DataFolder.cs` | The data folder's layout (`State\`) and the one-time move of an older layout |
| `MainForm.cs` | One window: WebView2 host, message handling, file access, watchers, git, close prompt |
| `Formatters.cs` | The former pretty print of JSON and XML (unit tested); not used since Format is `web/reformat.js` |
| `tests/LexPen.Tests` | Unit tests |
| `web/` | The page (built into the exe as resources; a debug build serves this folder, so an edit applies on a reload) |
| `web/index.html` | The UI page and its Content Security Policy |
| `web/app.js` | Documents, tabs and panes, rendering, editor, sidebar, bottom bar |
| `web/keys.js` | Key presses and chords |
| `web/actions.js` | The actions; the language packs |
| `web/menus.js`, `palette.js` | The menu bar; F1 |
| `web/format.js`, `bookmarks.js`, `gutter.js`, `find.js` | Editor commands and the bars; bookmarks; the gutter; find in a pane |
| `web/tabs.js`, `convert.js`, `column.js` | Tab and indent stops; conversions, trim on save and Format (the parts per language); column mode |
| `web/reformat.js` | The formatter: one engine for every language, the parameters from the pack's `format:` (a port of `docs/plans/reformat-prototype`) |
| `web/app.css` | Styling; fallback theme colours |
| `web/vendor/` | Bundled third-party libraries (generated by `vendor.ps1`) |
| `defaults/` | Copied next to the exe: `keys.json` and `settings.json` (the defaults), `languages/` (the language packs), `themes/` |
| `img/icon/` | App icon: `lexpen.ico` (`lexpen.svg` is its source, `make-ico.ps1` rebuilds `lexpen.ico` and `lexpen.png`) |
| `demo.md` | Formatting showcase |
| `vendor.ps1` | Rebuilds `web/vendor` |

`%LOCALAPPDATA%\LexPen` holds what you choose: `settings.json` (only what differs from the defaults), `keys.json`,
`favourites.json`, `favourite-folders.json`, `tab-colours.json`, `themes\`, `languages\`. What LexPen remembers by itself is in its `State\` subfolder: `state.json`
(recent lists, the fallback window position), `projects.json` (every project and window: tabs and panes, the folder pane's open folders and scroll position, each
tab's cursor and scroll position, the window's place and desktop; an older `session.json` became project 1),
`Drafts\`, `clipboards.json`,
`bookmarks.json` and `EBWebView\` (the browser's own data). An older layout is moved over once at start
(DataFolder.cs). Set the environment variable `LEXPEN_DATA` to use another folder (for testing).
