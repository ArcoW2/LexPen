# Plan: A startup document on LexPen's first start

Status: draft 2026-11-21, revised 2026-11-21; not started.

## 1. What this is about

Someone who starts LexPen for the first time (after installing or unzipping it) gets an empty window and nothing that
says what LexPen does or how to set it up. Several things only happen when you go looking for them: opening file types
with LexPen, showing them in Explorer's preview pane (File types, the Preview column; LexPen as a previewer, 3.8 of
PLAN-preview-handler.md), the View in LexPen entry in Explorer's menu, keys, the ribbon. A new user does not know they
exist.

## 2. The solution, in brief

LexPen ships `startup.md`, a markdown file about LexPen itself, and on its very first start makes a project
"Startup" and shows the file there, in the preview. It is written for someone who never saw LexPen: what it is, the
first things to set up, and where to find the rest. Each setting it mentions is one click away: a link of the form
`lexpen:<action>` opens that setting or dialog (LexPen as a previewer, File types). It can be opened again from
Options > Startup. English now; other languages later, each its own file, linked from the others
(PLAN-app-languages.md).

## 3. Details

### 3.1 The document

- **Shipped** next to the exe, `defaults\startup.md` (as keys.json and ribbon.json are), not in the data folder: a new
  version brings a new text. Opened read-only, in the preview.
- **Written for a first-time user**, short sections, each with what it is and a link to the setting or command:
  - What LexPen is: an editor and viewer for text, code and markdown, with a preview next to the text.
  - First steps:
    - open a file or a folder (Open file..., Open folder...);
    - let Windows open file types with LexPen: File types (a link to it);
    - LexPen as a previewer: it is registered for the current user from the start; the setting LexPen as a previewer
      (a link to that row) changes it, to Not registered or to For everyone on this computer (as Outlook needs);
      which file types Explorer previews in LexPen is the Preview column of File types (a link to it);
    - Explorer's right-click menu (View in LexPen, Edit in LexPen, Compare; a link to those settings);
    - day and night, the theme (a link to the settings, Theme colours...).
  - Finding your way: F1 (every command and its key), the menus or the ribbon (and how to switch), Settings and its
    search.
  - A few things worth knowing on day one: the editor and the preview side by side (the Editor and Preview switches),
    find (Ctrl+F), bookmarks, highlights, projects and sessions (LexPen opens where you left off).
  - Where to read more: docs/features.md (every feature), the README.
- **Readable anywhere**: the links work in LexPen; read elsewhere the document still reads as a guide (each link also
  names the menu path, "Options > Settings > General > Previewer").
- **Registering at the start stays as it is**: LexPen registers itself as a previewer for the current user (unless
  Not registered was chosen); the document says so and links to the setting to change it.

### 3.2 When and where it opens

- **The first start**: LexPen's data folder has no state yet (no `State\state.json`): the first time this user starts
  any LexPen on this computer. An update (a new LexPen unzipped over the old one, the data folder kept) is not a first
  start.
- **In a project of its own, "Startup"**: made on that first start, with startup.md as its one tab, in the preview.
  Your own files go into the projects you open or make; the Startup project can be closed or removed as any other.
- **Again**: Options > Startup, next to About LexPen (the action `startup`, so F1 and a key find it): the Startup
  project's window, the project made again when it was removed. LexPen has no Help menu.

### 3.3 Links that open a setting or run an action

- **`lexpen:<action>`**, with parameters as in keys.json after a `?`: `lexpen:settings?previewer` opens Settings at that
  row (as Settings already can, `showSetting`), `lexpen:fileTypes` the File types dialog. A click in a preview runs it
  as from a menu (runAction, `from: 'menu'`).
- **Only from a document LexPen trusts**: the shipped startup files and files in LexPen's own folders. A `lexpen:` link
  in any other markdown does nothing (its tooltip shows the action's name): a document from elsewhere should not run
  commands with one click.
- Now a `lexpen:` link counts as a web address (`isUrl`) and goes to the browser, which knows no such scheme; that is
  what changes.

### 3.4 Other languages

English now. The files per app language (English, Nederlands, Deutsch: LexPen's own texts, not the document
languages), their links to each other and the app language named in them (with its setting) are part of
PLAN-app-languages.md (3.7 there).

### 3.5 Tests

- First start with an empty data folder (LEXPEN_DATA): a project Startup with startup.md in the preview; the second
  start: not.
- Options > Startup opens it again (the project made again when removed); it is read-only.
- Each `lexpen:` link in startup.md does what it says (Settings at the previewer row, File types, Open file...).
- A `lexpen:` link in another markdown file does nothing but its tooltip.
- The text: plain ASCII; a unit test reads startup.md and checks each `lexpen:` name against the actions, and each
  settings row it names against the settings.

## 4. Open questions

None.
