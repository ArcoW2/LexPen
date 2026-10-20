# Plan: tabs, side-by-side panes, single instance and multiple windows

Superseded in part by PLAN-window-sessions.md: every window keeps its session (projects), and all windows look the same.

Status: implemented on branch `feature/tabs-panes-windows`. See section 9 for what changed or was decided
during execution, and what could not be verified.

## 1. The enhancement

LexPen shows one document per window, and each start opens a new process. Wanted:

- Several files per window as tabs, and two panes side by side (vertical or horizontal) with an
  optional line-based synchronised scroll for comparing.
- A file passed on the command line goes to the running instance as a new tab. With Shift held it
  opens in a new window, and the existing windows are left alone.
- Unsaved new documents survive as drafts (UltraEdit-style "editX" files) and are restored at start.
- A bar at the bottom of the pane when the open file changed or was removed on disk.
- Folder tree: sort by name or modified time, and highlight files that changed while the window was
  inactive.

## 2. The solution, in brief

The page moves from "one document" to a model of documents, tabs and two panes. The tabs are
HTML inside the existing WebView2, with one CodeMirror per pane that swaps CodeMirror `Doc`s, and
a linked `Doc` for a second, read-only view of the same file. The host becomes one owner process
behind a named mutex and pipe. Later launches hand their arguments to it and exit, and it routes
files and folders to windows. It also owns the per-file watchers, drafts, the session file, the
combined close prompt and the cross-window operations (edit lock, tab moves, theme sync).

## 3. Decisions (from the chat)

| Topic | Decision |
|---|---|
| Tabs | HTML tabs in the WebView. Shortcuts: `Ctrl+W` close, `Ctrl+Tab` / `Ctrl+Shift+Tab` switch, middle-click close |
| Panes | 2 panes, each with its own tab strip. Vertical split by default, horizontal optional. Toggle by button and by right-click on the divider. The divider is draggable. Orientation and ratio are remembered |
| Mode | Read / Split / Edit per tab. With 2 panes in Split mode, 4 columns are allowed |
| Sync scroll | Preview to preview, editor to editor. Line based: the same source line number on both sides. Button between the panes plus `Ctrl+Shift+L`. Not remembered. No diff highlighting |
| Active pane | Only with 2 panes visible: 2px border, blue `#0969da` (light), yellow `#d29922` (dark) |
| Opening | Tree click: new tab, or activate the tab if the file is already open. Ctrl+click: other pane. Drag from the tree, or from Explorer, onto any pane. A folder dropped from Explorer opens in the sidebar |
| Links | Relative link: same tab, with back/forward. Ctrl+click: new tab |
| Same file twice | Allowed once per pane (Ctrl+click or drag). Only one copy is editable, first wins, across all windows. The other copy shows the live text read-only and becomes editable when the editable one closes |
| History | Back/forward per tab |
| Drafts | New, unsaved documents are stored in `%LOCALAPPDATA%\LexPen\Drafts\editN.md`, written 1 s after the last keystroke on a background thread. Restored at start into the primary window in Split mode, still marked new. Saving as a real file deletes the draft. Closing a draft tab asks "Discard draft?" and deletes it. Drafts from Shift windows also come back in the primary window |
| Close prompt | One combined prompt for dirty files. Drafts changed this session are listed in it too, with "Save as..." / "Keep as draft" / Cancel. Unchanged drafts get no prompt |
| Session | The primary window saves its tabs, panes, folder and bounds, and restores them at start. Shift windows are not persisted |
| Single instance | Mutex/pipe keyed on user + exe path (debug and published builds stay separate). No args: activate the most recently active window. File args: tabs in the most recently active window, which is restored and brought to front |
| Shift | Opens a new window with only the given files. If no instance runs, Shift is ignored (normal start with session restore). Shift without a file opens a new empty window |
| Primary window | The first window. Shift windows have a dimmed toolbar and Windows 11 caption/border colors, plus "[n]" in the title. When the primary closes, the most recently active window becomes primary and switches to the normal look |
| Windows | The first window opens at exactly the saved bounds and state. Other windows cascade from the active window. Theme changes apply live to all windows |
| Arguments (several) | Each folder opens a window, or activates the window that already has it. A file goes to the window of the deepest folder argument it lies under. Remaining files: all to one window (the running primary if there is one, otherwise a new primary that restores the session). With only folder args, the first folder window is primary |
| Tab moves | Right-click a tab: Move to other pane / Move to next window (cycles through the windows in opening order) / Open in new window. Dragging a tab out of the window opens it in a new Shift-style window. Text, dirty state, undo history and the draft identity move with it. Moving the last tab out closes a Shift window. The primary window stays, empty |
| Disk change | Clean file: silent reload (as now). Dirty file: blue bar "Changed on disk: Reload / Keep mine". Removed or renamed: red bar "Close / Keep" (Keep = save to the same path, or turn it into a draft). The file comes back: the bar turns blue, or goes away if the content is equal. Background tab: blue or red dot on the tab, and the bar shows on activation. Colors: light `#0969da`/`#cf222e`, dark `#1f6feb`/`#da3633`, white text |
| Tree sort | Dropdown Name / Modified plus a direction toggle, remembered globally. Folders first, sorted by the same key. Reordering while you work is accepted; scroll position and expanded folders stay |
| Tree highlight | New and changed files that change while the window is inactive: bold name plus a small accent stripe on the left, until opened. In memory per window, not kept across restarts. An open clean file that changed while inactive gets the blue tab dot until activated |
| Process model | One process for all windows |
| Cross-window drag | If the spike fails, the context menu is enough; drag-out still opens a new window |

## 4. Design

### 4.1 Process and windows (host)

- `Program.cs`: create a mutex `LexPen-<user SID>-<hash of exe path>`.
  - Owner: start the pipe server and run an `ApplicationContext` (new class `AppHost`) instead of
    `Application.Run(form)`.
  - Not owner: resolve the arguments against its own current directory, check Shift
    (`Control.ModifierKeys`), call `AllowSetForegroundWindow(ownerPid)`, send
    `{ args, shift }` over the pipe, exit.
- `AppHost` keeps the window list in opening order (for "next window"), the activation order
  (for the target of new files and for promotion), and the primary window. It applies the argument
  routing rules (section 3) in one pure function `Route(args, openWindows) -> plan`, which is
  unit-testable.
- All windows live in **one process** and share one `CoreWebView2Environment`. This makes the edit
  lock, tab moves, live text for read-only copies and theme sync in-process calls instead of IPC.
- Foreground: restore if minimized, then `Activate()` / `SetForegroundWindow`.

### 4.2 Host <-> page messages (additions)

| Op / event | Direction | Purpose |
|---|---|---|
| `open { paths, pane? }` | host -> page | Files routed to this window |
| `watchFiles { paths }` | page -> host | Replaces the single-file part of `watch`. The host keeps a reference-counted watcher per directory |
| `fileChanged { path, kind: changed/removed }` | host -> page | Drives the bar, tab dots and reload |
| `lock { path }` / `unlock` | page -> host | Edit lock across windows. The reply says whether this copy is editable |
| `docText { path, text }` | host -> page | Live text for a read-only copy in another window |
| `draftWrite { id, text }` / `draftDelete { id }` | page -> host | Async, off the UI thread |
| `closeQuery` | host -> page | Page returns its dirty files and changed drafts. The host shows the combined prompt |
| `moveTab { doc, target: next/new/window }` | page -> host | Serialized doc: text, eol, path/draft id, dirty, undo history (`cm.getHistory()`), mode, scroll |
| `detachTab { doc, screenX, screenY }` | page -> host | Tab dragged out of the window |
| `droppedFiles` | page -> host | `postMessageWithAdditionalObjects` with the `File` objects. The host reads `CoreWebView2File.Path` |
| `session` | page -> host | The primary window's layout, for `session.json` |
| `theme` | host -> all pages | Live theme sync |
| `role { primary, index }` | host -> page | Normal or dimmed look |

### 4.3 Page model (`app.js`)

- `Doc`: `{ id, path | draftId, cmDoc, eol, language, savedGeneration, dirty, editable, nav,
  previewTop, mode, diskState }`. Everything that is now in module globals (`state.file`, `cm`,
  `language`, `savedGeneration`, `stale`, `nav`) moves into this object.
- `Pane`: `{ tabs: [docId], active, cm, previewEl }`. One CodeMirror per pane, and `cm.swapDoc()`
  on tab switch. A second view of the same file uses `cmDoc.linkedDoc()` (live shared text) with
  `readOnly`.
- `Layout`: `{ orientation, ratio, panes: [p0, p1?], activePane, syncScroll }`.
- The welcome text shows when a pane has no tabs.

### 4.4 Line-based sync scroll

- Preview: a markdown-it core rule writes `data-line` (from `token.map`) onto block elements. Code
  files get `data-line` per line in the highlighted `<pre>`.
- Source pane -> line: the topmost visible element with `data-line`, plus the fraction to the next
  one. Target pane: scroll to the element with the nearest line, interpolated the same way.
- Editor: `lineAtHeight` / `heightAtLine`.
- A guard flag stops the two panes from echoing each other.

### 4.5 Disk changes and tree

- Per-file events replace the single `fileWatcher`. The existing 300 ms batching stays.
- Tree highlight: while the window is inactive (`Deactivate` .. `Activated`), the host collects
  created and changed paths from the tree watcher (dot folders and `node_modules` excluded, as
  now). It leaves out the window's own saves, and files that are open in a tab. The page marks
  them until opened. A folder holding highlighted files shows a marker, like the git dot.
- `list` also returns `modified`. The sort mode lives in the tree header and is remembered.

### 4.6 Close and session

- `OnFormClosing`: `closeQuery` -> custom WinForms dialog listing dirty files and changed drafts.
- The primary window writes `session.json` (tabs, panes, folder, orientation, ratio, bounds,
  maximized). This replaces `localStorage.file/root` and the window part of `settings.json`.

## 5. Order of work

Each step ends in a working app that can be committed.

1. Per-document refactor, and tabs in a single pane. No behavior change otherwise.
2. Second pane, orientation, divider, active-pane border, line-based sync scroll.
3. Drafts, combined close prompt, session restore.
4. Per-file watchers, disk-change bar, tab dots, tree sort, inactive-change highlight.
5. Single instance: mutex, pipe, `AppHost`, Shift, argument routing, primary/secondary look,
   promotion, theme sync, edit lock across windows.
6. Tab context menu moves, drag between panes, drag from Explorer, drag out of the window.
   Starts with the spike from V9.

## 6. Tests

- There is no test project yet. Proposal: add one for the host's pure logic: `Route()` (all
  argument cases in section 3), the git status parser, and draft id allocation.
- Manual checklist per step, covering: a dirty tab plus a draft at close, the same file in two
  panes and in two windows (lock handover), a disk change on a clean / dirty / background tab,
  delete + recreate (git checkout), Shift with and without a running instance, mixed folder/file
  arguments, moving a dirty tab and then undoing in the target window.

## 7. Risks

- Dragging a tab onto **another** window: HTML drag data between two WebView2 controls is
  unverified. Spike first; the fallback is the context menu.
- Explorer usually starts one process per selected file, so the grouping rule (folders + files)
  only applies to a single command line. Separate launches each go to the primary window.
- Windows 11-only caption/border colors. On Windows 10 only the toolbar is dimmed.
- One process for all windows: a crash takes every window down. Drafts limit the loss.

## 8. Open questions

None. V1-V9 were answered with the proposed answers and are folded into section 3.

## 9. Resolved issues during execution

Decisions taken without asking (as instructed), problems found while testing, and how each was resolved.
Testing ran the debug build against a scratch data folder, driven through the WebView2 debugging port.

| # | Issue | Resolution |
|---|---|---|
| 1 | Plan step order (1-6, each its own commit) | Host and page share one message protocol, so the steps were built together and committed as one change, plus the unit tests. Every step was still tested on its own (see the rest of this table) |
| 2 | Section 4.6 put window bounds in `session.json` | Bounds stay in `settings.json` next to the theme, as before. `session.json` holds folder, tabs and panes only |
| 3 | Testing would overwrite the real session and drafts in `%LOCALAPPDATA%\LexPen` | Added the environment variable `LEXPEN_DATA` to point the app at another data folder |
| 4 | "Exit" in the menu now closes only one window | Renamed to "Close window" |
| 5 | One close prompt for files (Save all / Discard) and drafts (Save as / Keep as draft) | One TaskDialog listing both. Buttons: "Save" ("Save..." with drafts), "Don't save" ("Don't save (keep drafts)"), Cancel. Save saves the files, then asks Save as for each changed draft; cancelling that keeps the draft |
| 6 | "Keep" on a removed file meant "save as draft or same file" | Red bar has three buttons: Close / Save it again / Keep as draft |
| 7 | Moving a tab whose file is also in the other pane | Only a view moves: the other window gets a read-only copy, the file stays editable here. A draft always moves as a whole (both views) |
| 8 | Undo history moves with a tab, the "saved" point does not | A moved file with unsaved changes stays marked unsaved even when undone back to the saved text. Saving clears it |
| 9 | Closing the last tab of a Shift window by hand | The window stays open (empty). Only moving the last tab out closes it, as decided |
| 10 | Turning compare scroll on or off had no feedback besides the button color | Short blue toast: "The two panes scroll together." / "...on their own." |
| 11 | Bug, reported by you: .NET exception "string cannot be converted to Int32" | Draft writes sent `{ id: 'edit1' }`, which overwrote the message id. Argument renamed to `draft`; the bridge now puts `id` and `op` after the arguments so no argument can replace them |
| 12 | Bug: a launch that hands its files to the running instance crashed after delivering (.NET error dialog, about 3 s, exit code 0xE0434352) | The pipe writer was disposed after the reader had closed the pipe. Now writes the bytes directly. Measured afterwards: the hand-off launch exits after 123 ms with code 0 |
| 13 | Editor compare scroll landed one line off on far lines | CodeMirror estimates heights of lines it has not drawn. A second correction pass after the scroll; measured line 500 <-> 500 |
| 14 | Tree highlight was missing on rows of a folder expanded later | Marks are applied after a folder is expanded too |
| 15 | Compare scroll between two different files | As decided: the same source line number on both sides. Verified: line 198 <-> 198 (which shows Heading 50 left, Heading 41 right in the test files) |
| 16 | Not verified: dragging a tab onto another window, dragging a tab out of the window, dropping files from Explorer | Implemented, but these need a real mouse drag across windows or from Explorer; synthetic events cannot do that. The context-menu moves (other pane, next window, new window) and in-window drops (tree -> pane, tab -> other pane, far half opens the second pane) were verified |
| 17 | Not verified: the close prompt dialog itself | The flow was tested with the prompt answered by a stub (no dialog on screen). The TaskDialog has not been looked at |
| 18 | Not verified: Windows 10 title bar | Tested on Windows 11 only: the Shift window gets the dimmed caption and "[2]". On Windows 10 only the toolbar dims |
| 19 | Not verified with the physical keyboard: Ctrl+Tab, Ctrl+W | Verified through the browser's input pipeline (CDP key events), which is the path WebView2 uses after the OS |
| 20 | A page reload would leave the host's edit locks of that window in place | Not reachable: F5 and Ctrl+R are blocked, as before |
| 21 | Follow-up: tabs could not be reordered, and a closed tab could not be brought back | Drag a tab along the tab bar (a marker shows where it lands). Ctrl+Shift+T, or right-click an empty spot of the tab bar, reopens the last closed file tab in this window (drafts are deleted when closed, so they are not in that list) |
| 23 | Follow-up: a clean file reloaded while the window was in the background only got a blue tab dot, and switching to the window cleared it, so it was easy to miss | A blue banner without buttons, "<file> changed on disk and has been reloaded", on the pane that shows it (for a background tab: once that tab is opened). The banner and the dot stay until a click anywhere in the window or Esc; switching to the window alone no longer clears them |
| 24 | Bug, reported by you: a tab moved to the other pane became read-only | When a tab leaves a pane, the edit right goes to another tab of the same file; with none left it was cleared and never given back. The moved tab now keeps it. Verified: a single tab stays editable after a move; with the file in both panes, the second copy is read-only, becomes editable when the first closes, and stays so after a move |
| 22 | During testing of 21 the primary test window closed once without a visible cause | Not reproduced in a replay of the same steps. Possibly closed by hand (test windows appear on the desktop). Watch for it |

Verified in the running app: tabs; two panes; orientation; active pane border; same file in both panes (live
text, read-only copy, dirty marker); line-based compare scroll for previews and editors; disk change bar (blue)
and silent reload of clean files with tab dots; drafts written after 1 s, kept on close, restored at start in
Split mode; session restore; hand-off of a file to the running instance; Shift window; edit lock and live text
across windows; theme across windows; moving a dirty tab with its undo history to the next window; "Open in
new window"; an emptied Shift window closing itself; the primary role moving on when the primary closes; tree
sort by modified time; tree highlight while the window is inactive. Unit tests: `dotnet test tests\LexPen.Tests`.
