# Plan: Docking: tool panes that float or dock

Status: draft 2026-10-22, extended 2026-10-25 (Folder and Search apart); brought in line with plan 33
2026-10-25 (no view window of its own: viewing is a normal project, so all windows are the same kind); worked out
2026-10-29 (how the panes are built now, the approaches, the details, stages); not started; questions open. From your
answer on the character picker window (plan 15 follow-up): "docking should be a new plan".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

LexPen's panes are fixed: the side pane (Folder and Search, two tabs) is always on the left; each editor pane has
an outline of its own at its right; Settings, the character picker and the highlights list are windows of their
own. You cannot put the folder pane on the right, the search at the bottom, Settings next to the text, or an
outline at the other side of its text.

## 2. The solution, in brief

The tool panes become dockable: each docks at the left, the right or the bottom of a LexPen window, alone or as a
tab beside others docked there, or stacked above them, resized against the editor area with a splitter. Folder and
Search become two panes, no longer two tabs of one side pane. A pane is moved by dragging its title (the places it
can go light up) or from its menu, and keeps its place per window. An outline stays with its own editor pane: docked
at the left or the right of that pane, or floating; never beside another document. Settings, Characters and
Highlights keep floating as windows of their own, and can also be docked into a LexPen window. Folder and Search dock
but do not float outside the window in this plan (section 3.2 says why); that can follow in a later plan.

## 3. Details

### 3.1 How the panes are built now

Two kinds, and the difference decides what docking can do:

- **In the main page**: Folder and Search (the side pane `.mm-sidebar`, two tabs), and the outline of each editor
  pane (at its right, shown with `outline.toggle`). They are parts of the window's one page: they read its state
  directly (the open documents, the tree, the headings of the document shown).
- **Windows of their own**, each a WinForms form with its own WebView2 and page: Settings (`SettingsForm`,
  settings.html; one per LexPen window), Characters (`CharPickerForm`, charpicker.html; inserts into the window last
  worked in), Highlights (`HighlightsForm`, highlights.html; the highlights of the document last worked in), Projects
  (`ProjectsForm`), Theme sets (`ThemeSetsForm`), and the replace preview (modal). They talk to the main windows
  through the host only.

A pane that floats outside the LexPen window needs a window of its own, so its own WebView2 and page. A pane docked
inside the window lives in the window's page (or in a second WebView2 the window hosts beside its page).

### 3.2 The approaches

- **A. Dock in the page (proposed).** Folder and Search dock at the edges of the page, tabbed or stacked, and an
  outline at either side of its editor pane; they stay page parts, so their code changes little: what moves is where
  they are drawn. Settings, Characters and
  Highlights float as now, and can also be docked: their page is shown inside the main page at the dock place
  (3.7). One way of docking for all panes, inside the window. What it does not give: Folder, Search or an outline in
  a window of their own on another monitor.
- **B. Everything floats and docks.** Every pane can also float as a window of its own. Folder, Search and Outline
  then must become pages of their own that get the window's state through the host (the tree, the search results,
  the headings of its pane's document, the clicks back), much as Highlights does now. That is a rewrite of the three
  of them and of how they talk to the window, on top of the docking itself.
- **C. A first, B later.** A now; Folder, Search and the outline in windows of their own as a plan of its own once
  the docking works and it is clear it is wanted.

The proposal is C: everything this plan was asked for (the folder at the right, the search at the bottom, Settings
next to the text, an outline at either side of its pane) comes with A. The outline's floating is the exception (3.6).

### 3.3 The panes

- Folder and Search (docked in the window's areas, 3.4), the outline of each editor pane (its own places, 3.6), and
  Settings, Characters, Highlights (3.7). Projects and Theme sets stay windows only (question 4). Later panes (a
  bookmark list, the clipboards, ...) as Folder and Search.
- Each pane has a title bar with its name, a menu button (Dock left, Dock right, Dock bottom, Float (the windows
  only), Close) and a close button. Tabbed panes show their names as tabs instead; the active tab's menu acts on
  that pane.
- A pane is opened by its action, as now: Folder (`viewFolder`), Search (`viewSearch`), Settings, ...;
  opened again where it was last, or in its default place (3.9). Closing a pane hides it; its place is kept.

### 3.4 Where a pane can be

- The dock areas: left, right, bottom (question 5: also the top?). Left and right run from under the tab rows to
  above the bottom bar; bottom runs under the editor area, between the left and right areas. (Alternative: bottom
  across the whole width; question 6.)
- An area holds one or more groups; a group shows its panes as tabs (one shown at a time) or a pane alone. Several
  groups in one area are stacked (left and right: above each other; bottom: beside each other), with a splitter
  between them.
- Each area has a splitter against the editor area; its size is kept. An area with no visible pane takes no room.
- Minimum sizes so the editor area never vanishes: a pane not narrower than about a column of text, the editor area
  not smaller than about a third of the window ([not yet calculated]: the exact figures with a prototype).
- The editor panes (the split into two panes, side by side or above each other) stay in the editor area as now;
  docking does not change them. The find bar and the Occurrences bar stay part of each editor pane.

### 3.5 Moving a pane

- Drag its title bar (or its tab): while dragging, each place it can go lights up: an edge of the window (a new
  group there), a group (as a tab in it), or the top or bottom half of a group (stacked above or below it). Dropped
  anywhere else: back where it was (with A, Folder and Search do not float); a window pane (Settings, ...)
  dropped outside the window floats.
- The pane's menu does the same without the mouse, and F1 lists the actions: `dock.left`, `dock.right`,
  `dock.bottom`, `dock.float`, with the pane as their value, so a key can be given (keys.json, as any action).
- Esc while dragging: the drag ends, nothing moves.

### 3.6 The outline

An outline belongs to its editor pane and shows that pane's document; it is never docked beside another document.

- Docked: at the right of its editor pane (as now, the default) or at its left, with a splitter against the text.
  Each editor pane chooses for itself: with two panes side by side you can, for example, put the left pane's outline
  at its left and the right pane's at its right, so the two texts sit next to each other.
- Floating (question 2): its pane's outline in a panel or window of its own, still showing that pane's document and
  following it when its tab changes; closing it docks nothing, it is hidden (`outline.toggle` shows it again where
  it was).
- Not in the window's dock areas (3.4) and not tabbed with Folder or Search.
- Moving: its title's menu (Left of the text, Right of the text, Float, Close) and dragging its title to the other
  side of its own pane (only those two places light up) or away from it (floats).
- The outline's column in the gutter (gutter.js) stays as it is.
- `outline.toggle` shows and hides the outline of every editor pane, each where it was.

### 3.7 The windows docked: Settings, Characters, Highlights

- Floating: as now (a window of its own, owned by its LexPen window; moved, sized, its place kept).
- Docked: the same page (settings.html, charpicker.html, highlights.html) shown at the dock place inside the main
  page, so what it shows and does is the same. Two ways to build it, to be decided by a prototype (question 7):
  - an iframe in the main page, its messages to the host going through the frame (WebView2's frame messaging;
    the host then answers it as it answers the window's page now);
  - or the form's WebView2 control moved into the LexPen window (WinForms), placed over the dock place the page
    keeps free; the page tells the host where that place is when it moves or resizes.
  The first keeps all docking in the page (one drag system); the second keeps the page code untouched but has to
  keep a native control exactly over a part of the page (scrolling, zoom, DPI, a window moved between monitors).
  Proposal: the iframe, if the prototype shows the frame messaging works for all of them.
- Characters and Highlights work on the window last worked in; docked, on the window they are docked in.
- Settings docked in one window is that window's Settings (it has "this window" rows already).
- Dragging a docked window pane out of the window makes it float again.

### 3.8 All windows are equal

The answer to "are all windows equal?": yes. Plan 33 (`executed/PLAN-view-window.md`) has no view window of its own:
viewing uses a normal project, "View" by default, whose windows can dock every pane like any other.

- The view project keeps its layout as any project does (3.9): what you dock there stays there for the next view.
- Plan 33's "Reset to view layout" includes the docking: no panes docked or floating for that project's window,
  so only the editor pane in Preview is left.

### 3.9 Kept

- The places, sizes, groups, tabs and which pane is shown: per window, in the window's layout of plan 31
  (`executed/PLAN-settings-layers.md`: the session's `layout`), so a window opens as it was left; a new window takes
  the layout of the last window of its project (the last window used when the project has none), so the view project
  does not take a full layout from elsewhere (question 3).
- View > Layout > Save as default (plan 31) includes the docking, so new projects start with it.
- The default (nothing saved yet, question 8): as now: Folder and Search tabbed at the left, the outline per editor
  pane, Settings, Characters and Highlights floating. Nothing moves until you move it.
- The old layout values (`sidebar` shown, its width, `outline`) are read into the new layout once; the old names
  stay readable for a window that has no docking layout yet.

### 3.10 Menus and keys

- View > Panes: each pane with a check (shown), and Reset docking (the default of 3.9 for this window).
- The pane menus and the drag (3.5); the actions in F1 (3.5).
- The side pane's existing keys and actions (`sidebar.toggle`, `viewFolder`, `viewSearch`) keep working:
  `sidebar.toggle` shows or hides the left area.

### 3.11 Stages

1. The layout engine in the page: the dock areas, groups, tabs, stacking, splitters, sizes, kept in the layout;
   Folder and Search as two panes in it, placed as now. Nothing visible changes yet (the tests of what exists pass).
2. Moving: the pane menus, the drag with the drop places, Esc; the actions.
3. The outline at either side of its own pane (menu and drag), and floating (as question 2 decides).
4. A prototype of 3.7 for Settings (iframe and frame messaging, or the moved control); the choice made.
5. Settings, Characters, Highlights docked and floated, dragged out and back.
6. View > Panes, Reset docking, Save as default, the view project's reset; the docs (features.md).

### 3.12 Tests

- In-app: each pane docked left, right and bottom (menu and drag); two panes as tabs, two stacked; a splitter
  dragged and the size kept; the editor area never below its minimum, also in a small window; Esc during a drag; a
  window closed and opened again as it was; a new window of the project with the same docking; Save as default and a
  new project with it; Reset docking; the view project's reset.
- In-app: an outline at the left and at the right of its pane (menu and drag), each editor pane its own choice;
  only its own pane's two sides light up while dragging; floating, it follows its pane's tab changes; closed and
  shown again where it was.
- In-app: Settings, Characters, Highlights docked (they work there: a setting changed, a character inserted in this
  window, a highlight list of this window's document), floated again by dragging out, docked again.
- In-app: the existing side pane tests (folder tree, search, replace in files) pass with the panes docked
  elsewhere.
- Unit: the layout's old values read into the docking layout.

## 4. Open questions

1. The approach (3.2): A (dock in the page; Settings, Characters, Highlights float or dock), B (everything floats and
   docks; Folder, Search and the outline rewritten as pages of their own), or C (A now, Folder, Search and the
   outline in windows of their own later)? Proposal: C.
2. A floating outline (3.6): a panel floating over the window (it stays inside the window; no rewrite of the
   outline), or a window of its own (on another monitor too; the outline then becomes a page of its own that gets its
   pane's headings through the host, as approach B for the outline alone)? Proposal: the panel inside the window
   now, its own window with the later plan for floating (3.2 C).
3. Several LexPen windows: each window its own docking (a new window copying the last one of its project), or one
   docking for all windows? Proposal: each window its own.
4. Which windows dock (3.7): Settings, Characters, Highlights; also Projects and Theme sets? Proposal: Settings,
   Characters, Highlights; Projects and Theme sets stay windows.
5. The edges: left, right and bottom, or also the top? Proposal: left, right, bottom.
6. The bottom area: between the left and right areas (under the editor area only), or across the whole width?
   Proposal: under the editor area only, so the left and right areas keep their full height.
7. Docking a window's page (3.7): the iframe or the moved WebView2 control? Proposal: decided by the prototype of
   stage 4, the iframe preferred.
8. The default layout (3.9): as now (Folder and Search tabbed at the left, the outline per editor pane, the windows
   floating)? Proposal: as now.
