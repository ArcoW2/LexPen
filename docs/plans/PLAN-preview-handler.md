# Plan: LexPen as a previewer (a Windows preview handler)

Status: draft 2026-11-20, revised 2026-11-21 (3.11 the Preview tab, the source, its height); in progress on the branch `preview-handler` (2026-11-21), see As
built. Asked for by Foldex's plan 33
(`foldex\docs\plans\33-PLAN-preview-plugins.md`, 3.3), which leaves the handler, its class and its registration to this plan.

## 1. What this is about

Explorer's preview pane, Foldex's preview and other programs that host Windows preview handlers cannot show a file
the way LexPen does: with its language packs, its markdown preview, its find, bookmarks and highlights. LexPen has
no preview handler. The nearest it has is View in LexPen (`--view`, the project for viewing), which opens a whole
LexPen window instead of showing the file inside the program you are in.

## 2. The solution, in brief

LexPen becomes a Windows preview handler, served by LexPen.exe itself. Its view is a single LexPen preview pane, read
only: no editor, no tabs, no side panes. Everything that works in a preview works there, with the same keys: find,
the preview's cursor, bookmarks, highlights, jumps by section, the language chosen, printing. Its commands are on
ribbon tabs of its own, preview tabs, the only ones it shows. A PDF shows in
LexPen's PDF viewer and a file that is not text in Hex, and the language list can show any file as any language
instead. What you mark is kept where LexPen
keeps it now (bookmarks in LexPen's store, highlights in the store or next to the file, as the setting says), so the
previewer and LexPen show the same marks. A language list in the preview's bar chooses the language for that file, and
LexPen remembers it. Day and night work as in LexPen: the previewer has a theme of its own for each, and follows
Windows, or is always day or always night, as its settings say; a Day / Night button in its bar switches. A host
that gives only the file's content and no path (Outlook's attachments) gets the same view, with nothing remembered.
Every preview runs in the one LexPen process. In the File types dialog you choose which extensions use LexPen as
Explorer's previewer. LexPen also lists every extension it can show, so a host that chooses its own previewers (Foldex
is one) can offer LexPen without LexPen taking any type from another program.

## 3. Details

### 3.1 The handler

- **A COM class of LexPen's**, `{5A311364-459D-4F66-8434-18A69C5691AC}` ("LexPen preview"). Foldex finds LexPen by this
  class (its plan 33, 3.3).
- **Served by LexPen.exe as a local server** (`LocalServer32`, `"<exe>" -Embedding`), not by a DLL in someone else's
  process. Windows starts LexPen when no LexPen runs; a running LexPen serves it itself (3.2).
- **The interfaces** a preview handler has:
  - `IPreviewHandler`: `SetWindow` (the host's window and the rectangle), `SetRect`, `DoPreview`, `Unload`,
    `SetFocus`, `QueryFocus`, `TranslateAccelerator`;
  - `IInitializeWithFile`: the file's path. The path is what makes the marks findable (3.6);
  - `IInitializeWithStream`: for hosts that give only the content (3.10). Which of the two each host uses:
    [not yet checked];
  - `IObjectWithSite`, `IOleWindow`: the host and its frame (keys LexPen does not use go back to the host through
    `IPreviewHandlerFrame.TranslateAccelerator`);
  - `IPreviewHandlerVisuals`: taken note of, not followed. The previewer has its own day and night themes (3.5).
- **In .NET**: the class is registered at run time with `CoRegisterClassObject` (a class factory,
  `REGCLS_MULTIPLEUSE`), its interfaces through COM source generation (`[GeneratedComInterface]`, `ComWrappers`).
  Whether a WinForms app on .NET 10 does this without a native shim: [not yet checked]. If not, the shim is
  LexPenShell.dll (C++, already built for the Explorer menu), which then forwards to LexPen.exe over its pipe.

### 3.2 One LexPen process

- **Every preview runs in the one LexPen process.** It shares the stores (bookmarks.json, highlights.json,
  file-languages.json) with the editor windows, so there are no two writers of one file, and a mark made in the
  previewer shows in LexPen at once and the other way round.
- **No LexPen running**: Windows starts `LexPen.exe -Embedding`. It starts without a window (no session restored, no
  project opened), serves the previews, and stays as a normal LexPen once you open a window. With no window and no
  preview left, it ends after a while: [not yet decided how long].
- **LexPen running**: it registered the class at its start, so Windows asks that process; no second LexPen.
- **The trade-off**: a LexPen that is busy (a long replace, a modal question) makes the previews wait, and a crash of
  LexPen takes the previews with it. A process of its own per host would avoid that, but with two writers per store
  and a WebView2 start per process. One process is the better of the two: the marks stay one set, and LexPen
  starts once.

### 3.3 The view

- **Its window**: on `SetWindow` LexPen makes a child window of the host's window (across the processes, as preview
  handlers in prevhost.exe do), with one WebView2 in it, sized on `SetRect`. Whether WebView2 accepts a parent in
  another process, or needs a window of LexPen's own in between: [not yet checked].
- **Its page**: LexPen's page in a role of its own, `previewer`: one pane, its tab bar hidden, the editor made only when you switch to the source (3.11),
  no sidebar, no outline, no menu bar, and of the ribbon only its Preview tab (3.11). The preview's bar stays: the language list (3.4), Find, Day / Night
  (3.5), Print (3.9), and "Edit..." (opens the file as Explorer's Open would: edit, or the project for viewing,
  as File types says; not for a stream, which has no file to open). The status bar stays too, as LexPen's bottom bar
  for a preview: the file's name, the preview cursor's place, find's count, and notices (3.10).
- **One WebView2 per host window, kept**: `DoPreview` for the next file reuses it (a new document in the same page),
  so a series of files does not start a WebView2 per file. `Unload` drops the document and lets go of the file; the
  window and its WebView2 go when the host releases the handler.
- **Read-only, and the file never held**: the file is read with sharing for read, write and delete, as LexPen reads
  any file, so Explorer can rename, move or delete it while it is shown. No edit lock is taken, nothing is written to
  the file. A change on disk shows at once (the file is watched as an open file is).
- **What works**, the preview's own features, with their keys and settings as in LexPen:
  - **Find**: the find bar (Ctrl+F, F3, Shift+F3), in the preview as now (docs/plans/executed/PLAN-pane-find.md);
    no Replace (Ctrl+H does nothing: read-only);
  - the **preview's cursor** and its movement keys (docs/plans/executed/PLAN-preview-bookmarks.md);
  - **bookmarks**: set, clear, jump (Ctrl+1..9 and the others), shown at the left of the text;
  - **highlights**: make, change, note, remove, step through;
  - **jumps**: by section and heading, links inside the document, position history (back / forward);
  - **zoom**, wrap of code (previewWrap), the large-file preview (docs/plans/executed/PLAN-large-preview.md);
  - **copy**; select all.
- **What does not**: editing in any form (typing, replace, format, macros, line commands), saving, other
  tabs, side panes, compare. Their keys do nothing in the previewer, or go back to the host (3.7).
- **Kinds LexPen shows without a language**, offered too:
  - a PDF in LexPen's PDF viewer (docs/plans/executed/PLAN-pdf-view.md), read-only as it is;
  - a file that is not text in Hex (docs/plans/executed/PLAN-hex-view.md), read-only: no byte can be changed.

  Either one can be shown as a language instead, from the language list (3.4): a file that is text after all, or
  that you want to see as text.

### 3.4 The language

- **The list in the preview's bar**: the language packs, as the editor's bottom bar offers them, and Hex. Choosing
  one shows the file in it at once: text as that language, any file as its bytes. A PDF has its viewer first in the
  list.
- **Kept per file**, where LexPen keeps a language you chose for a file now (State\file-languages.json,
  `AppHost.FileLanguage`): the next preview of that file, and LexPen's editor, use it.
- **Per extension**: the File types dialog's Language column is the language a file of that extension starts with,
  as now; the list above overrides it for one file.

### 3.5 Day and night

- **Settings**, in Settings > General > Viewing, a sub-group "Previewer" (the Viewing settings are about the project
  for viewing now; the previewer is the other way to view):
  - `previewerMode`, "Day / night of the previewer": `windows` (as Windows is, Settings > Personalization > Colors;
    the default), `light` (always day) or `dark` (always night);
  - `previewerThemeLight`, "Theme of the previewer in day mode", and `previewerThemeDark`, "... in night mode": a
    theme from LexPen's themes (the shipped ones and yours in `themes\`), for the whole previewer: its bar and its
    preview. Empty: as LexPen's own windows show that mode (`themeLight` / `themeDark` with `previewThemeLight` /
    `previewThemeDark`); empty is the default, so the previewer looks like LexPen until you choose.
- **Apart from LexPen's windows**: these settings, not `followWindows` / `theme` or a project's theme set, decide the
  previewer's look. LexPen can be at night with its previews in day, or the other way round.
- **The Day / Night button** in the previewer's bar switches every open preview to the other mode, as LexPen's own
  button does: with `windows`, until Windows changes its mode; with `light` or `dark`, until LexPen ends. The next
  start is the setting again.
- **At once**: a change of the settings, or of Windows' mode under `windows`, shows in every open preview without
  loading the file again (the page's theme changed in place, as in LexPen's windows now).

### 3.6 What is remembered, and where

All of it by the file's path (`BookmarkStore.Key`), so LexPen and the previewer share it:

- **Bookmarks**: LexPen's store (bookmarks.json), as now.
- **Highlights**: as the setting `highlightsStore` says: LexPen's store (highlights.json), or `name.ext.lph` next to
  the file ("beside"). The previewer writes a `.lph` next to the file only with that setting, and only when you make a
  highlight: showing a file never writes beside it.
- **The language** (3.4).
- **The place in the file**: the preview's scroll position and cursor per file, so the next preview of it opens where
  you were. LexPen keeps these for open tabs only (the session); for the previewer a small store of its own in the
  state folder, the most recent files only: [not yet decided how many].
- **Find**: the find history, shared with LexPen's (docs/plans/executed/PLAN-find-history.md).

### 3.7 Keys and focus

- **The keys the preview uses** are LexPen's, from keys.json, as in a LexPen window, with the editor's left out.
- **Every other key** goes to the host: the page passes it to LexPen's host side, which calls
  `IPreviewHandlerFrame.TranslateAccelerator`, so Explorer's and Foldex's own keys keep working with the focus in the
  preview. This is the standard way for a preview handler; the frame comes from the host's site (`SetSite`). A host
  that gives no frame gets no keys; nothing is made for one host in particular. Which keys the host takes is the
  host's to say (`TranslateAccelerator` answers S_OK when it took one).
- `SetFocus` puts the focus in the preview; `QueryFocus` says where it is.

### 3.8 Registration (for the current user, no admin)

- **Always, once LexPen is installed** (at its start, as the Explorer menu entries are written now):
  - `Software\Classes\CLSID\{5A311364-...}`: its name, `LocalServer32` with LexPen's exe;
  - `Software\Microsoft\Windows\CurrentVersion\PreviewHandlers`: the class listed as a preview handler;
  - under the class, the extensions LexPen shows: every language pack's (markdown included) and `.pdf`. This list
    binds nothing and is the same for every host that reads it; a host that offers several previewers (Foldex, its
    plan 33, 3.3) makes its own choice per type. Nothing in LexPen is set for one host in particular.
  - When LexPen moves (another folder, a new version published elsewhere), its start writes the exe path again, as
    `RefreshExplorerMenu` does for the Explorer entries.
- **Per extension, only when you choose it**: the File types dialog
  (docs/plans/executed/PLAN-file-types.md) gets a column "Preview": checked, Explorer previews that extension in
  LexPen (`.<ext>\shellex\{8895b1c6-b41f-4c1c-a562-0d564250836f}` = LexPen's class). The handler that was there
  before is kept under LexPen's key and put back when you uncheck it, so taking the preview back gives the old
  previewer, not none. "Opens now with" gets a sibling column "Previews now with".
- **Unregistering**: a settings button "Remove LexPen's previewer" takes off the class, the list and every binding
  (the old handlers put back).
- Whether Explorer accepts a per-user, local-server preview handler without more keys (an AppID, a low-IL setting as
  in-process handlers in prevhost.exe need): [not yet checked].

### 3.9 Printing

- **Print** in the bar, and LexPen's print key (Ctrl+P), open LexPen's Print window for what the preview shows: the
  same window, options and print sets as in LexPen (docs/plans/executed/PLAN-printing.md).
- **No print mode needed**: the Print window gets what it prints from the asking page (its `source`: the text,
  coloured, the rendered view, the highlights and notes), not from the file. The previewer's page is a LexPen page
  with all of that in it, so a stream prints as a file does.
- **Its owner**: the Print window takes a LexPen window as its owner now (`PrintForm(app, owner, source)`, a
  MainForm); it gets the previewer's window instead, and sits over the host's window. Whether a window of LexPen's
  can be modal to a window of another process, or is only kept in front of it: [not yet checked].
- **A PDF and Hex**: printed as LexPen prints them now; whether the Print window takes a PDF or the bytes of Hex as a
  source: [not yet checked].

### 3.10 A stream, without a path

- **Offered as well**: a host that gives only the content (`IInitializeWithStream`: Outlook's attachments, mail
  programs) gets the same previewer. Showing the file right beats leaving it to a previewer that fails on it.
- **Its name**, when the stream gives one (`IStream.Stat`, `STATSTG.pwcsName`), chooses the language by its
  extension as for a file; with none, LexPen's guess from the content as for a new document, and the language list
  to change it. Which hosts give a name: [not yet checked].
- **Nothing remembered**: no path to key the marks by. Find, the cursor, bookmarks, highlights and notes work while
  it is shown, and are gone with it. Nothing is written to any store or next to any file; the language you choose
  holds for this preview only.
- **Highlights and notes still count**: they show, and they print (3.9), for as long as the preview is open.
- **Said when used**: the first highlight or note made in a stream's preview puts a notice in the previewer's status
  bar, "Highlights and notes cannot be stored for this file (no path)". It stays while the stream is shown and there are highlights or notes; it is not shown before you make one.
- **Read once**: the content is read whole from the stream when it comes (a stream may not be read twice); there is
  no file to watch for changes.

### 3.11 The previewer's commands: preview tabs on the ribbon

- **The problem**: the previewer hides the menu bar, but not the ribbon. With the ribbon on (commandBar "ribbon" or
  "both") it shows every tab, and most of their buttons do nothing in a read-only preview without tabs, project or
  editor. With the menus only, the previewer has no commands at all except keys and the preview's bar.
- **What a previewer can do**: the actions that work in a preview, without an editor, a project, tabs or docks. The
  page itself says an action can run (`actionAvailable`) for most actions, because it only rules out the editor's;
  this list is the ones that do something useful in a previewer:

  | Group | Actions |
  |---|---|
  | Find | Find, Find next / previous (`find`, `findNext`, `findPrevious`); the Occurrences bar and its field (`occurrences.bar`, `occurrences.field`, `occurrences.show`, `occurrences.clear`) |
  | Go to | Back / forward (`positionBack`, `positionForward`), next / previous block (`block.next`) and outline entry (`outline.next`) |
  | Bookmarks | Store, toggle, clear, go to (1-9), free bookmark (`bookmarkToggleFree`), next / previous (`bookmarkNext`), the list of this file's bookmarks (`bookmarkList`) |
  | Highlights | Highlight, selection to highlight, note, remove, remove all in this file, keep the adjusted one, next / previous, the list of this file's highlights (`highlight.list`: a drop-down on the ribbon, its window on a click) |
  | View | The source or the preview: Source, Preview (both on: split), Hex (`editor.toggle`, `preview.toggle`, `hex.toggle`); day / night (`theme.toggle`, `theme.day`, `theme.night`), zoom in / out / reset, the language (`chooseLanguage`) |
  | File | Print, Edit... (`previewer.open`: the file in LexPen), copy the selection (`copy`), copy the file's name or path (`file.copy`; not for a stream) |

  Not in it: saving, files, projects, tabs, docks and panels, compare, macros, replace, sort, the settings, the
  editor's view settings (wrap, gutter, line numbers: as LexPen's settings say), the ribbon's own change and customize.
- **The source**: the previewer offers the text the preview is made from, as LexPen's switches do: Editor, Preview,
  Split, and Hex (which also gives 3.4 its Hex). The switches show in the preview's bar and on the Preview tab. The
  editor is made the first time you switch to it, read-only as the whole previewer is: no typing, no replace, no
  format; what reads works there too (find, the cursor, bookmarks, highlights, copy, folding). A previewer starts in
  the preview; what you switch to holds for the next files in that host's window, until you switch back.
- **Preview tabs**: a tab of the ribbon is an editor tab (LexPen's windows) or a preview tab (the previewer); New...
  in change mode asks which. LexPen ships two preview tabs, the actions above split over them so each fits:
  - **Preview**: Find (Find with Occurrences under it; Previous above Next), Go to (back, forward, block, section;
    icons only), Bookmarks (previous and next first, icons only; Toggle; the list from the group's bottom-right
    corner), Highlights (previous and next first, icons only; Highlight, Note, Remove, Remove all; the list from the
    corner). Selection to highlight and Keep the adjusted highlight are left off (Highlight does the first and more;
    the second is rare in a previewer); both can be added.
  - **View and file**: View (Language over Zoom 100%, Zoom in over Zoom out; Source, Preview, Hex and Day / Night
    are in the top bar) and File (Print, Edit..., Copy, Copy name).
  - **The top bar**, one line: the preview tabs' names at the left (only with two or more), then at the right the
    switches (the editor's called Source here), Edit... (the file in LexPen), Day / Night and the zoom. No file name (the host shows
    it) and no Print button (it is on View and file). In a narrow preview pane it wraps to a second line.
  - A button without a label (its label only spaces and line breaks) is named by its action's title wherever it shows
    as text: the list of groups that do not fit (">>"), Customize.
  - The lists are drop-downs (highlights: as now; bookmarks: `bookmarkList` gets the same drop-down form as
    `highlight.list`). A button without a label has the label "
" (its icon only; its tooltip names it).
  - **Its height is its own**: one, two or three rows of buttons per preview tab, chosen in the ribbon's change mode
    and kept with the tab in ribbon.json. One or two rows take small buttons only; three rows, as every other tab,
    also large ones. LexPen ships them with two rows. The setting for the ribbon's height (ribbonRow, the grip)
    scales their rows as it does the others'.
  - **In the previewer**: only the preview tabs, whatever commandBar says; their names in the top bar when there are
    two or more, none with one. The tab it shows is its own (not the tab LexPen's windows remember).
  - **In LexPen's windows**: the preview tabs are not shown, except in the ribbon's change mode, so they can be
    changed as any other tab; they are kept in ribbon.json with the others. Changed there, the previewer shows them as
    changed. The last preview tab cannot be removed.
  - The menu bar stays hidden in the previewer.
- **Tests**: the tab shown alone in the previewer with the ribbon and with the menus as commandBar; not shown in a
  LexPen window, shown in change mode; each button in a previewer of a file and of a stream (the actions for a path
  disabled for a stream); the bookmarks drop-down listing the file's bookmarks and going to one; its height changed
  in change mode to one, two and three rows, kept in ribbon.json, and the previewer following; the switches: the
  editor made on the first switch, read-only (typing does nothing), a bookmark and a highlight made in the editor
  showing in the preview, the switch kept for the next file.

### 3.12 Not in this plan

- Thumbnails (`IThumbnailProvider`).
- Editing in the previewer; "Edit..." is the way to edit.

### 3.13 Tests

- **Unit**:
  - the registration keys written and removed (below LEXPEN_REGISTRY_ROOT, as FileTypes' tests do): the class, the
    list of extensions, a binding with the old handler kept and put back;
  - the place store (3.6): kept per file, the oldest dropped;
  - the previewer's mode from `previewerMode` and Windows' mode, and its theme per mode (empty: LexPen's);
  - the previewer role's page settings (no editor, which actions it takes: the read-only set) where Jint can reach
    them.
- **In-app**:
  - Explorer's preview pane on a `.md` and a `.cs` file bound to LexPen; Foldex's preview with LexPen chosen;
  - find, a bookmark and a highlight made in the previewer, then the same file opened in LexPen: the same marks; and
    the other way round;
  - `highlightsStore` "beside": the `.lph` written next to the file only when a highlight is made;
  - the language changed in the bar, kept for the next preview and in LexPen;
  - day / night: each `previewerMode`, Windows' mode changed while a preview shows, the Day / Night button, a theme
    chosen per mode and the empty default (as LexPen); LexPen's own windows in the other mode than the previewer;
  - the file renamed and deleted in Explorer while shown; changed on disk while shown;
  - no LexPen running (started by Windows, ends after the last preview), and LexPen running (no second process);
  - stepping through many files fast: one WebView2, no file left open;
  - keys: Ctrl+F in the preview, Explorer's keys with the focus in the preview;
  - a PDF and a binary file; each switched to a language and back;
  - Print from the bar and with Ctrl+P, of a file and of a stream (an attachment in Outlook);
  - an attachment in Outlook: shown, its language from its name, marks made and gone when it closes, nothing
    written; no notice until the first highlight, then the notice in the status bar; a highlight with a note
    printed.

## 4. Open questions

None.

## 5. As built

In progress on the branch `preview-handler`; not merged. Not yet tried in Explorer itself (see Not yet built).

### Built

- **The handler** (`src/PreviewHandler.cs`): the class `{5A311364-459D-4F66-8434-18A69C5691AC}` served by LexPen.exe
  as a local server, with COM source generation (`[GeneratedComInterface]`, `StrategyBasedComWrappers`): no native
  shim was needed. `IInitializeWithFile`, `IInitializeWithStream`, `IPreviewHandler`, `IObjectWithSite`,
  `IOleWindow`. Every first LexPen registers the class object at its start; `-Embedding` starts LexPen without a
  window.
- **The previewer** is a MainForm in a mode of its own (`Start.Previewer`, `IsPreviewer`), not one of the app's
  windows: no project, session, drafts, recent files or edit lock; it closes without asking. Its page has the role
  `previewer` (CSS hides the menus, tabs, docks, the editor switches, Replace and the status bar parts about
  editing). The file is opened in the preview, read-only. WebView2 took a parent window in another process as is.
- **Lifetime**: LexPen stays while a preview is open; with no window and no preview it ends after 120 seconds
  (`PreviewIdleMs`, decided during the build).
- **Find** (Ctrl+F, F3), bookmarks, highlights and notes, jumps: the page's own, unchanged; find checked in the test
  host ("1 of 8").
- **Day and night** (3.5): `previewerMode`, `previewerThemeLight`, `previewerThemeDark`, the Day / Night button; the
  mode is per window now (`AppHost.ModeOf`).
- **Print** and **Edit...** (first called Open in LexPen) in the previewer's bar (Print later moved to the View and file tab); the Print window is placed over the preview on the screen.
- **Streams** (3.10): read whole on Initialize, the language by the name's extension, else the first line; highlights
  and notes kept while shown; the status bar notice "Highlights and notes cannot be stored for this file (no path)"
  from the first one.
- **Registration** (3.8): the class, `PreviewHandlers`, and the extensions as a multi-string value `Extensions` under
  the class. Written at start when none is registered, when it names this exe, or one that is gone; a debug build
  never registers where none is (it would take the previews from the LexPen in use). The File types dialog's Preview
  and Previews now with columns; binding keeps the handler before it (`Previous` under the class) and puts it back;
  Settings > General > Previewer: Remove LexPen's previewer.
- **The preview tabs** (3.11): shipped in ribbon.json as tabs with `"previewer": true` and `"rows": 2` (Preview, View
  and file); a ribbon.json of your own without any gets the shipped ones at its end when read (`RibbonFile.Load`), so
  a ribbon changed before they existed still gives the previewer its commands. One of your own with a preview tab
  gets none added: a ribbon.json changed while there was one Preview tab keeps that one (Reset, or New... > Preview
  tab and the buttons moved, gives the two). The previewer shows them whatever commandBar says, their names only with
  two or more, without grip or "only when wanted", and no ribbon right-click menu (the ribbon is changed in LexPen).
  LexPen's windows show them only in change mode (their names in italics), where a right-click while one is shown has
  Height of the preview tab: 1, 2 or 3 rows; under three rows large buttons are drawn small. New... asks Editor tab
  or Preview tab. The last preview tab cannot be removed (a toast says why). `bookmarkList` got a drop-down as `highlight.list` has. Icons were drawn for
  the actions on it that had none (back, forward, block, section, the bookmarks list, the Occurrences bar, language,
  Edit..., copy name, highlight from selection / keep / remove all / previous / next).
- **The source** (3.11): the switches show in the previewer; the source is read-only (typing changes nothing) and the
  format bar stays hidden; Source, Preview or both carry over to the next file (Hex does not: it depends on the file).
- **Keys to the host** (3.7): `SetSite` takes the host's `IPreviewHandlerFrame` when its site has one; a key the page
  does not use goes to it as a WM_KEYDOWN (with Alt: WM_SYSKEYDOWN) of the previewer's window. In the previewer only
  the keys of what it can do are LexPen's (`previewerAction`: a fixed set, everything on the preview tabs, the
  cursor's moves); the rest goes to the host: F5 (a macro's key in LexPen), Ctrl+S, Alt+P, Esc with nothing to close,
  F-keys. In a text field only F-keys and Alt+key go; the editing keys (Ctrl+A, C, V, X, Y, Z, Insert) never; a key
  that comes while a menu or dialog is open stays. Alt+letter no longer opens the hidden menus in a previewer. Tried
  on the page with real key presses (each key above, Ctrl+F, F3, F8, Ctrl+C, the find box's keys); the call to the
  frame itself needs a host that gives one (Explorer): not yet tried. Foldex's host gives no site, so it gets no keys
  until it does (its side, the same standard).
- **Right-click on a highlight in a preview**: Remove highlight and Highlight act where the right-click was; they used
  the preview's cursor, which a right-click does not move, so they removed nothing.
- **Tests**: `PreviewerTests` (registration, binding with the handler before kept and put back, removal);
  `RibbonTests` for the Preview tab (shipped, added to your ribbon.json, rows, the columns in one and two rows). The
  rest was tried with a test host (a small exe that creates the handler as Explorer does and captures its window),
  through WebView2's debugging port. The Preview tab, the source and the highlight right-click were tried in a test
  LexPen window acting as a previewer (`previewer` set, the file given as the handler gives it): with a LexPen
  registered as the handler running, Windows hands the test host's preview to that LexPen, not to the test one.

### Not yet built

- **Hex in the language list** (3.4): Hex is in the switches and on the Preview tab now (3.11); the status bar's
  language list still has no Hex entry.
- **The place in the file** (3.6): the previewer does not keep the scroll position and cursor per file.
- **Explorer itself**: Alt+P and F5 with the focus in the preview (3.7) among the first things to try. It needs a published (release) LexPen, which registers the class at its start, and an extension
  checked under Preview in the File types dialog. Whether Explorer takes a per-user local-server handler without more
  keys is still [not yet checked].
- **The Print window as a modal of the host**: placed over it, not tried with a printer from a host.
