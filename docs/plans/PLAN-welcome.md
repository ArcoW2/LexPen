# Plan: A welcome document on LexPen's first start

Status: draft 2026-11-21; not started.

## 1. What this is about

Someone who starts LexPen for the first time (after installing or unzipping it) gets an empty window and nothing that
says what LexPen does or how to set it up. Several things only happen when you go looking for them: opening file types
with LexPen, showing them in Explorer's preview pane (File types, the Preview column; LexPen as a previewer, 3.8 of
PLAN-preview-handler.md), the View in LexPen entry in Explorer's menu, keys, the ribbon. A new user does not know they
exist.

## 2. The solution, in brief

LexPen ships a welcome document, a markdown file about LexPen itself, and opens it in the preview on its very first
start. It is written for someone who never saw LexPen: what it is, the first things to set up (each with a link that
does it or opens the right setting), and where to find the rest. It can be opened again from Options > Welcome, next to About (and F1).
Links in it of the form `lexpen:<action>` run that LexPen action, so "Make LexPen the previewer for markdown" is one
click from the text.

## 3. Details

### 3.1 The document

- **Shipped** next to the exe, `defaults\welcome.md` (as keys.json and ribbon.json are), not in the data folder: a new
  version brings a new text. Opened read-only, in the preview.
- **Written for a first-time user**, short sections, each with what it is and one link to do it:
  - What LexPen is: an editor and viewer for text, code and markdown, with a preview next to the text.
  - First steps:
    - open a file or a folder (the links: Open file..., Open folder...);
    - let Windows open file types with LexPen (File types...);
    - show files in Explorer's preview pane (LexPen as a previewer; File types, the Preview column);
    - Explorer's right-click menu (View in LexPen, Edit in LexPen, Compare; the settings for them);
    - day and night, the theme (the settings, Theme colours...).
  - Finding your way: F1 (every command and its key), the menus or the ribbon (and how to switch), Settings, the
    search in Settings.
  - A few things worth knowing on day one: the editor and the preview side by side (the Editor and Preview switches), find (Ctrl+F),
    bookmarks, highlights, projects and sessions (LexPen opens where you left off).
  - Where to read more: docs/features.md (every feature), the README.
- **Plain text it stays**: the links work in LexPen; read anywhere else the document still reads as a guide (each link
  also names the menu path, "Options > Settings > General > Previewer").

### 3.2 When it opens

- **The first start**: LexPen's data folder has no state yet (no `State\state.json`): the first time this user starts
  any LexPen on this computer. It opens in the window's first pane, in the preview, after the window shows. An update
  (a new LexPen unzipped over the old one, the data folder kept) is not a first start.
- **Again**: Options > Welcome, next to About LexPen (the action `welcome`, so F1 and a key find it). LexPen has no
  Help menu.

### 3.3 Links that run an action

- **`lexpen:<action>`**, with parameters as in keys.json after a `?` (`lexpen:settings?previewer` opens Settings at that
  row; `lexpen:fileTypes`). A click in any preview runs it as from a menu (runAction, `from: 'menu'`).
- **Only from a preview of a document LexPen trusts**: the shipped welcome.md and files in LexPen's own folders. A
  `lexpen:` link in any other markdown does nothing (it shows the action's name as a tooltip): a document from
  elsewhere should not run commands with one click.
- Now a `lexpen:` link is a URL (`isUrl`) and goes to the browser, which knows no such scheme; that is what changes.

### 3.4 Tests

- First start with an empty data folder (LEXPEN_DATA): the welcome opens in the preview; the second start: not.
- Options > Welcome opens it again; it is read-only.
- Each `lexpen:` link in the welcome runs its action (Settings at the previewer row, File types, Open file...).
- A `lexpen:` link in another markdown file does nothing but its tooltip.
- The text: plain ASCII, every link's action exists (a unit test reads welcome.md and checks each `lexpen:` name
  against the actions).

## 4. Open questions

1. **Registering the previewer at the start**: LexPen now registers itself as a previewer for the current user at
   every start (unless Not registered was chosen), binding no file type; Explorer only uses it for the file types
   checked under Preview in File types. Should the first start leave it Not registered instead, so the user chooses
   it from the welcome (LexPen as a previewer)?
2. **Where the welcome opens**: in the preview of a normal window (it then becomes a tab of the first project), or in
   the project for viewing (View in LexPen's own project, apart from your files)?
3. **Language**: English only, as the rest of LexPen?
