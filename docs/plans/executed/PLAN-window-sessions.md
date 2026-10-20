# Plan: projects with their own windows and sessions, on their own virtual desktops

## 1. The problem

LexPen runs as one process with one or more windows. Only the primary window saves its session (folder, tabs,
panes, cursor) and its position; the other windows are not persisted (PLAN-tabs-panes-windows, "Session": "Shift
windows are not persisted"). Working with one virtual desktop per project, and a LexPen window on each, every
restart, log-off or crash loses all windows but one: their folders, open files, cursor positions and places.

## 2. The solution, in brief

Work is organised in projects. A project has a number, a name you can give it, and one or more windows; each window
keeps its own session (folder, tabs, panes, cursor, bounds, virtual desktop). Everything is saved continuously, so a
crash or a reboot loses at most the last second. At start LexPen reopens every window that was open, each at its
place and on its own desktop. A Projects menu lists every project with its windows: open one, start a new
project, rename this window's project, move this window to another project. A setting decides whether a new
window joins the project of the last window used on that desktop or starts a new project. A launch from Explorer goes to the LexPen window on the desktop you are on, or a
new one there. All windows look the same.

## 3. Details

### 3.1 Projects and their windows

- A project: a number (1, 2, 3, ..., never reused), a name, and its windows. A project without a name you gave is
  shown as "Project 3" (its number).
- A project's windows: the open ones, and those that were open when the project was last closed (so the project
  can be reopened as it was, 3.5).
- Kept in `State\projects.json`: every project, open or closed.
- The old `session.json` (one window) becomes project 1 at the first start after the update.
- The title bar shows the project: `LexPen - <name>`.

### 3.2 A new window: same project or a new one (a setting)

- A new window comes from a tab's "Open in new window", a tab dragged out, a Shift launch, or a launch on a desktop
  without a LexPen window (3.7).
- Setting `newWindowProject` (Options > Settings > General > Windows):
  - `same` (default): the new window joins the project of the last window used on this desktop; with no
    LexPen window on this desktop, a new project.
  - `new`: always a new project.

### 3.3 What a window keeps

- What the primary window saves today: folder, tabs, panes, orientation, ratio, cursor and scroll per tab, the
  hidden pane, pinned and read-only tabs, file languages.
- Its bounds, maximized state and virtual desktop id.
- Its drafts (new, unsaved documents): each draft knows its window and project and comes back there. Today all
  drafts come back in the primary window.
- Bounds in `State\state.json` stay only as the fallback for a window without its own.

### 3.4 Saving: continuously

- A change (tab opened, closed, moved, cursor, scroll, pane, bounds, desktop, a project renamed) saves a second
  later, as the primary's session does now; nothing waits for closing. A crash, a forced reboot or a killed
  process loses at most that last second.
- The host is the only writer of `projects.json` and writes it whole to a temporary file, then replaces the old one,
  so a crash during the write never leaves a broken file (the old one stays).
- A window moved to another virtual desktop by hand: noticed (when the window is activated, and on a timer while
  it is open) and saved.

### 3.5 Closing a window

- **Windows closing LexPen** (log-off, shutdown, Task Manager) or a crash: every window that was open comes back at
  the next start, in its project, on its own desktop. Closing the last window by hand is not this: it is a window
  closed by hand like any other (below), and its project comes back when LexPen starts on that desktop (3.7).
- **A window closed by hand while another window of the same project stays open:** the closed window is forgotten;
  its pinned tabs move into the remaining window of that project (the most recently active one), as you prefer.
  The setting "Move pinned tabs when closing a pane or window" (`movePinned`) keeps deciding whether they move at
  all.
- **A window closed by hand as the last open window of its project:** the project is closed. It does not come back
  at start, and keeps this window (tabs, pinned tabs, place) for when it is opened again (3.6). Pinned tabs do not
  move to a window of another project.
- **A window with no files open when it closes:** not reopened at start, except when it is the only LexPen window
  of its desktop: each desktop that had a LexPen window gets one back.
- **A project you did not name**, when its last window closes:
  - none of its windows has files left: dropped;
  - files left: kept as "Project 3" (its number), unless the setting `keepUnnamedProjects` (Options > Settings >
    General > Windows, default on) is off: then dropped as well.
- **A named project** is never dropped by closing: it stays in the Projects menu, also without windows or files,
  until you delete it.

### 3.6 The Projects menu

A menu of its own in the menu bar, between View and Options, filled when it opens (as Recent files is). The bottom
bar shows the window's project at the left (its name or "Project 3"); a click there opens the same menu.

```
Projects
  v LexPen  (this window)          >    v Window 1: D:\prive\LexPen, 12 tabs  (this window)
  v KING API                       >      Window 2: D:\prive\LexPen\docs, 3 tabs
    Docs site                      >    ------------------------------------
    Project 7                      >    New window in this project
  -----------------------------         Open project                       (all its windows)
  New project...                        Delete project...                  (closed projects)
  -----------------------------
  Rename this project...
  Move this window to              >    KING API / Docs site / Project 7 / ---- / New project...
```

(`v`: the menu's check mark: an open project, an open window.)

- **The projects**: every known project, open ones checked, this window's project first and marked. Newest used
  first after that.
- **A project's submenu**: its windows, each with its folder and number of tabs, open ones checked:
  - an open window: brings it to the front (Windows switches to its desktop);
  - a closed window: opens it as it was (tabs, cursor, place);
  - **New window in this project**: an empty window in that project, on this desktop;
  - **Open project**: all its windows (the closed ones open, the open ones come to the front);
  - **Delete project...**: only for a project with no open window; asks first.
- **New project...**: asks a name (empty: "Project 8"), and opens a new empty window in that new project on this
  desktop. The current window stays as it is.
- **Rename this project...**: the name of this window's project (an unnamed one gets a name this way, which is how
  a project is "created" from the current window).
- **Move this window to**: another project, or New project... (asks a name). The window and its tabs now belong
  there. When it was the last window of its old project: a named project stays (without windows), an unnamed one
  is dropped.
- Every item is also an action (F1, keys): `projects` opens the menu at the bottom bar, `newProject`,
  `renameProject`, `moveWindowToProject`.

### 3.7 Virtual desktops and launches

- `IVirtualDesktopManager` (the documented Windows interface): `GetWindowDesktopId` to save a window's desktop,
  `MoveWindowToDesktop` to put it back at start, `IsWindowOnCurrentVirtualDesktop` for launches.
- A closed window or project opened from the Projects menu: on the desktop you are on (that is where you asked for
  it), at its size and place. At start, windows go back to their own desktops.
- A desktop that no longer exists (removed, or another PC): the window opens on the current desktop. Where the
  interface fails (an error, an older Windows): windows open on the current desktop, as now.
- A file launched without a folder argument: to the LexPen window on the current desktop (the most recently active
  one there); with none on this desktop, a new window on this desktop (its project per 3.2).
- A folder argument: the window that shows that folder, else a new one (as now). Shift: a new window (3.2).

### 3.8 Look

No primary window any more for the look: every window looks the same (no dimmed caption or toolbar). What stays
shared by all windows: the settings window, the numbered clipboards, bookmarks.

### 3.9 Tests

- Unit: `projects.json` read and written (projects open and closed, several windows each); the old
  `session.json` read as project 1; an interrupted write keeps the old file; launch routing to the window on the
  current desktop or a new one (Router, with each window's desktop passed in); the new-window project per setting.
- In-app:
  - two projects with their own folders and tabs, LexPen killed: both back, each with tabs, cursor, bounds;
  - two windows of one project, one closed: its pinned tabs in the other;
  - the last window of a project closed: not back at start; reopened from the list as it was;
  - an empty window closed: not back unless it was the only one; an empty project deleted;
  - unnamed projects with `keepUnnamedProjects` off and on;
  - a draft back in its own window;
  - renaming a project: title and bottom bar follow;
  - the Projects menu: projects and windows with their checks; a closed window opened from it; New window in
    this project; New project; Move this window to (the old project removed when it was its last window).
- Desktops: checked by hand (a test cannot create virtual desktops reliably).

### 3.10 Docs

README (Windows, Projects, Session), HANDOFF; PLAN-tabs-panes-windows's "Shift windows are not persisted" and the
primary window's look superseded.

## 4. Open questions

None.

## 5. Resolved during execution

| Thing | Solution implemented |
|---|---|
| A call from the page with an argument `id` (the project) lost it: the page's call to the host uses `id` for its own number | The argument is `project`. |
| When a session reaches the host | Written at once (the page already waits a second after a change); a window's move, size or desktop is written 0.4 s after the last change. A test that kills LexPen right after a session found the 0.4 s too late. |
| A moved virtual desktop | Looked at when a window is activated and every 5 seconds. |
| The primary window | Kept inside the host only for what was single before: the target "primary" of a moved tab, and the window place in `state.json` as the fallback for a window without its own. A window whose last tab is moved out still closes itself, as before. |
| Deleting a project | Its unsaved new documents (drafts) stay on disk; at the next start they come back in the first window, so nothing unsaved is lost. |
| The windows of a project in the menu | Numbered within the project (Window 1, 2, ...), with folder and number of tabs. |
| The title | `<the page's title> - <project>`. |
| Move this window to (an action) | Opens that part of the Projects menu at the bottom bar. |
| The dimmed look of secondary windows | Gone; its CSS rule removed. The theme colour `bgBarDim` (only used by it) is still in the themes, unused. |
| Tests | Unit: `ProjectStoreTests` (10), `RouterTests` rewritten for desktops; 138 passed. In-app: t43 (19 checks: rename, new project, crash and restore with draft, pinned tab to the other window, a closed project opened again, an unnamed empty project dropped, the menu, move this window), t44 (4 checks: a second launch, `-n`); the regression scripts t1 to t42 pass (t4 now expects the Projects menu). Virtual desktops: not testable by a script; to check by hand. |
| The test harness | A test copy of LexPen sometimes never opens its debugging port (measured starts 2.2 to 2.6 s; one hung until stopped); the scripts are tried once more then. Not a LexPen start problem. |
| Asked after execution: a launch on a desktop whose last LexPen window was closed opened a new project | It opens the project whose window was closed last on that desktop (all its closed windows; the reused one at its place). Not for Shift / `-n` or a folder argument. Windows has no call for "the desktop shown now", so the new window's own desktop decides, before its page asks what to open. Tests: `ProjectStoreTests` (LastClosedOn, Forget), t45 (5 checks; the second desktop simulated in projects.json). |
| Reported: close on desktop 2, then on desktop 1, start on desktop 2: desktop 1's project showed on desktop 2 | Windows only moves (and tells the desktop of) a window it knows, which is not yet so right after it is created: the move at start and the "which desktop" of a new window were done too early. Both now happen once the window is shown, tried for up to about 3 seconds; the page loads after that, and the first launch is routed only when the restored windows are on their desktops. `Launch` stays synchronous: an async method puts back the synchronization context it started with (before the first window: not WinForms' own), after which every await left the UI thread (found by the tests, never committed). Not testable without a second desktop: to check by hand. |
| Asked after execution: after closing the windows on every desktop by hand, LexPen started on a desktop with the project closed last on any desktop (the last window closed by hand counted as "LexPen closing" and stayed open) | Closing the last window by hand closes its project like any other window; a start on a desktop opens the project closed last on that desktop. Only Windows closing LexPen (log-off, shutdown, Task Manager) or a crash keeps the windows open for the next start. Test: t46 (4 checks: the last window closed by hand, started again: its project back, no new one). |
