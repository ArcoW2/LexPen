# Plan: Docking: tool panes that float or dock

Status: draft 2026-10-22, extended 2026-10-25 (Folder and Search apart); brought in line with plan 33
2026-10-25 (no view window of its own: viewing is a normal project, so all windows are the same kind); worked out
2026-10-29 with your answers: every tool pane is the same kind (it floats as a window or docks in the main window);
only an outline is different (it docks to its own document pane). Not started; questions open. From your answer on
the character picker window (plan 15 follow-up): "docking should be a new plan".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

LexPen's panes are fixed: the side pane (Folder and Search, two tabs) is always on the left; each editor pane has
an outline of its own at its right; Settings, the character picker, the highlights list and the Manage windows are
windows of their own (or, for Manage macros, a dialog in the page). You cannot put the folder pane on the right, the
search at the bottom, Settings next to the text, the folder in a window of its own on another monitor, or an outline
at the other side of its text or under it.

## 2. The solution, in brief

All tool panes are one kind: Folder, Search, Settings, Characters, Highlights and the Manage windows (projects, theme
sets, macros). Each one floats as a window of its own, or docks in a LexPen window: at the left, the right or the
bottom, alone, as a tab beside others, or above, under or next to another pane, resized with splitters; each dock
area folds away and back with a button whose icon shows the direction (the hamburger's job now). Folder and
Search become two panes, no longer two tabs of one side pane. A pane is moved by dragging its title (the places it
can go light up; dropped elsewhere, it floats) or from its menu, and keeps its place per window. An outline is the
one exception: it belongs to its editor pane and docks only at that pane's left, right or bottom, or floats; never
in the window's dock areas. To make every pane able to float and dock alike, each becomes a page of its own (as
Settings, Characters and Highlights are already), which is the main work of this plan for Folder, Search and Manage
macros.

## 3. Details

### 3.1 How the panes are built now

- **Pages of their own**, each a WinForms form with its own WebView2: Settings (`SettingsForm`, settings.html; one
  per LexPen window), Characters (`CharPickerForm`, charpicker.html; inserts into the window last worked in),
  Highlights (`HighlightsForm`, highlights.html; the highlights of the document last worked in), Manage projects
  (`ProjectsForm`, projects.html), Theme sets (`ThemeSetsForm`, themesets.html). They talk to the LexPen windows
  through the host only.
- **Parts of the main page**: Folder and Search (the side pane `.mm-sidebar`, two tabs), Manage macros (a dialog in
  the page, macros.js; modal now, plan 36 makes it not modal), and the outline of each editor pane (at its right).
  They read the window's state directly: the open documents and their unsaved text, the tree, the headings of the
  document shown.
- Not tool panes, and not part of this plan: the replace preview (modal, asks before a replace in files), the small
  questions (a name, a number, Yes / No), the menus, the find bar and the Occurrences bar (part of each editor pane).

### 3.2 One kind of tool pane

- Every tool pane is a page of its own, the same page floating or docked, so it shows and does the same in both.
- Floating: a window of its own (as Settings now), owned by its LexPen window, movable, resizable, on any monitor,
  its place kept.
- Docked: shown in its LexPen window, in a dock area (3.4).
- A pane belongs to one LexPen window and works on that window: its folder, its documents, its active document
  (question 3). Characters and Highlights, which now work on the window last worked in, then work on their own
  window.
- Folder, Search and Manage macros become pages of their own. What they read from the window now, they get through
  the host, as Highlights does:
  - Folder: the window's folder and its files' marks (open, changed, a .bak, git); a click opens a file in the
    window; rename, delete, new file and the context menu act there as now.
  - Search: searching the open documents uses their text as the window has it (unsaved changes too), sent by the
    window's page; a result clicked goes to the match in the window; replace in files changes the open documents in
    the window (one undo step each, as now) and the files on disk.
  - Manage macros: the list from the host (as now), Play and Step by step acting on the window's document.
  - Their keys work in them as now (F1, the find keys in Search, ...); a key that acts on the editor goes to the
    window's editor.
- The cost of a page per pane (a renderer per WebView2 page, its start time and memory) is measured with the
  prototype (3.11 stage 1): [not yet calculated].

### 3.3 How a page docks (question 1)

Two ways to show a pane's page inside a LexPen window:

- **Native docking (proposed).** The LexPen window (MainForm) holds the dock areas itself: WinForms panels with
  splitters around the main page, each docked pane's WebView2 control in one. The main page keeps only the menus,
  the tabs, the editor area and the bottom bar. Floating moves the same WebView2 control into a window of its own
  and back, so a pane keeps its state (scroll, selection, what is typed) when it moves. The drag (3.5) is done by the
  host: the pane's title tells the host a drag starts; the host shows the drop places over the window.
- **In the page.** The dock areas are in the main page, each docked pane an iframe with its page; floating shows the
  page in a window of its own instead. All docking is page code, but moving between docked and floating loads the
  page again (its state kept through the host), and each iframe's messages to the host need WebView2's frame
  messaging.

Proposal: native docking, after a prototype (stage 1) shows that a WebView2 control moves between a panel and a
window without trouble (focus, keys, DPI, a window moved to another monitor).

### 3.4 Where a pane can be (the dock areas)

- Left, right and bottom of the LexPen window (question 4: also the top?). Left and right run from under the
  toolbar to above the bottom bar; bottom runs under the editor area, between the left and right areas (question 5:
  or across the whole width).
- An area holds groups; a group shows one pane, or several as tabs (one shown at a time). Groups in one area sit
  above, under or next to each other, with a splitter between them.
- Each area has a splitter against the editor area; its size is kept. An area without a visible pane takes no room.
- Minimum sizes so the editor area never vanishes: [not yet calculated]: the figures with the prototype.
- The editor panes (the split into two panes) stay in the editor area as now; docking does not change them.

### 3.4a Hiding a dock area

Each dock area can be hidden and shown again with one click, as the hamburger now does for the side pane (Folder and
Search); the panes in it stay docked there, only the area folds away and the editor area takes the room.

- The button sits in the area's header (its tab row, or the title of its pane when it holds one pane), at the side
  that faces the editor. Its icon says which way the area goes: an arrow or chevron toward the window's edge to hide
  it (left area: pointing left; right area: pointing right; bottom area: pointing down), the other way to show it.
  Not a hamburger: the icon shows the direction.
- Hidden, the area leaves a narrow strip at its edge with the same button (pointing inward) and, per docked pane, its
  name or icon (question 7); a click on the button shows the whole area again, a click on a pane's name shows the
  area with that pane in front.
- With several groups in one area, the button hides the whole area, not one group.
- The same for an outline at its pane's side: a button in its header folds it to its pane's edge; the strip there
  brings it back. `outline.toggle` still shows and hides every editor pane's outline.
- The hamburger in the toolbar goes: the left area's own button does what it did. `sidebar.toggle` becomes the
  left area's hide / show; new actions `dock.toggleLeft`, `dock.toggleRight`, `dock.toggleBottom` (F1, keys.json),
  and `sidebar.toggle` stays as the name of the left one so existing keys keep working.
- Opening a pane that is docked in a hidden area (its action, View > Panes) shows the area.
- Hidden or shown is kept per area in the window's layout (3.9).

### 3.5 Moving a pane

- Drag its title bar (or its tab): while dragging, each place it can go lights up: an edge of the window (a new
  group there), a group (as a tab in it), or a side of a group (above, under, or next to it). Dropped anywhere else:
  it floats there. A floating pane dragged over a LexPen window shows that window's places.
- A pane docks in its own LexPen window only (question 3); dragged over another LexPen window, it shows no places.
- The pane's menu (Dock left, Dock right, Dock bottom, Float, Close) does the same without the mouse, and F1 lists
  the actions: `dock.left`, `dock.right`, `dock.bottom`, `dock.float`, `dock.close`, with the pane as their value, so
  a key can be given (keys.json, as any action).
- Esc while dragging: the drag ends, nothing moves.

### 3.6 The outline

An outline belongs to its editor pane and shows that pane's document; it is never docked beside another document and
never in the window's dock areas (3.4).

- Docked: at the right of its editor pane (as now, the default), at its left, or at its bottom (under the text, the
  full width of the pane), with a splitter against the text. Each editor pane chooses for itself: with two panes side
  by side you can, for example, put the left pane's outline at its left and the right pane's at its right; with two
  panes above each other, each outline at its pane's bottom.
- At the bottom, the entries run in columns (as many as fit the width); the splitter sets its height.
- Floating (question 2): its pane's outline in a window of its own, still showing that pane's document and following
  it when its tab changes.
- Moving: its title's menu (Left of the text, Right of the text, Below the text, Float, Close) and dragging its title:
  only its own pane's left, right and bottom light up; dropped elsewhere it floats.
- Docked, it stays part of the main page (it is drawn with its editor pane); only floating needs a page of its own.
- The outline's column in the gutter (gutter.js) stays as it is.
- `outline.toggle` shows and hides the outline of every editor pane, each where it was.

### 3.7 The panes one by one

- Folder, Search: two panes; docked together they can be tabs, as now.
- Settings: one per LexPen window, as now (its "this window" rows are that window's).
- Characters: inserts into its window's active document.
- Highlights: the highlights of its window's active document.
- Manage projects, Theme sets: as now, as panes.
- Manage macros, and the macro window of plan 36 when that is built: as panes, not modal.
- Later panes (a bookmark list, the clipboards, ...): the same way.

### 3.8 All windows are equal

The answer to "are all windows equal?": yes. Plan 33 (`executed/PLAN-view-window.md`) has no view window of its own:
viewing uses a normal project, "View" by default, whose windows dock every pane like any other.

- The view project keeps its layout as any project does (3.9): what you dock there stays there for the next view.
- Plan 33's "Reset to view layout" includes the docking: no panes docked or floating for that project's window,
  so only the editor pane in Preview is left.

### 3.9 Kept

- Per window, in the window's layout of plan 31 (`executed/PLAN-settings-layers.md`: the session's `layout`): every
  pane's place (docked: area, group, tab order, size; floating: its window's place and size), and which are shown;
  the outline's side and size per editor pane. A window opens as it was left; a new window takes the layout of the
  last window of its project (the last window used when the project has none).
- View > Layout > Save as default (plan 31) includes the docking, so new projects start with it.
- The default (nothing saved yet, question 6): as now: Folder and Search tabbed at the left, the outline at the
  right of each editor pane, the other panes floating. Nothing moves until you move it.
- The old layout values (`sidebar` shown, its width, `outline`) are read into the new layout once, and the floating
  windows' kept places (AppState) become their floating places.

### 3.10 Menus and keys

- View > Panes: each pane with a check (shown), the dock areas with a check (shown or hidden, 3.4a), and Reset
  docking (the default of 3.9 for this window).
- The pane menus and the drag (3.5); the actions in F1 (3.5).
- The existing actions keep working: `viewFolder`, `viewSearch`, Settings, Characters, Highlights, Manage projects,
  `macro.manage` open their pane where it was (showing its area when hidden); `sidebar.toggle` hides or shows the
  left area (3.4a); `outline.toggle` as in 3.6.

### 3.11 Stages

1. Prototype: Settings as a native docked pane (its WebView2 control in a panel of the LexPen window, moved to a
   window of its own and back); focus, keys, DPI, monitors; the cost of a page per pane measured. The choice of
   question 1 made.
2. The dock areas: groups, tabs, stacking, splitters, sizes, hiding an area with its button and strip (3.4a), kept
   in the layout; Settings, Characters, Highlights, Manage projects and Theme sets dock and float. Folder and Search
   still in the page as now.
3. Moving: the pane menus, the drag with the drop places, Esc; the actions.
4. Folder and Search as pages of their own (3.2), two panes; the side pane goes; their tests pass as before.
5. Manage macros as a pane (with plan 36 when that is done).
6. The outline at the left, right or bottom of its pane; floating (question 2).
7. View > Panes, Reset docking, Save as default, the view project's reset; the docs (features.md).

### 3.12 Tests

- In-app: each pane docked left, right and bottom (menu and drag), floated by dropping it outside, docked again;
  two panes as tabs, above and under each other, next to each other; a splitter dragged and the size kept; the editor
  area never below its minimum, also in a small window; Esc during a drag; a pane keeps its state (scroll, what is
  typed) when it moves; each area hidden and shown with its button (the icon pointing the right way each time), from
  its strip, by its action and by opening a pane in it; an outline folded and back; a window closed and opened again
  as it was (areas hidden as they were); a new window of the project with the same
  docking; Save as default and a new project with it; Reset docking; the view project's reset.
- In-app: Folder and Search as panes: the existing tests of the folder tree, search and replace in files pass,
  docked and floating; a search of the open files finds unsaved text; a result clicked goes to the match in its
  window.
- In-app: Characters inserts into its own window; Highlights lists its window's document; Settings' "this window"
  rows change that window; Manage macros plays on its window's document.
- In-app: an outline at the left, the right and the bottom of its pane, each editor pane its own choice; at the
  bottom its entries in columns; dragging it lights up only its own pane's sides; floating, it follows its pane's
  tab changes.
- Unit: the old layout values and the floating windows' places read into the docking layout.

## 4. Open questions

1. How a page docks (3.3): native docking (the panes' WebView2 controls in panels of the LexPen window), or in the
   page (iframes)? Proposal: native, after the prototype of stage 1.
2. A floating outline (3.6): a window of its own, like every other pane (the outline then also becomes a page of its
   own when it floats, getting its pane's headings through the host), or a panel floating inside the window?
   Proposal: a window of its own, so all floating panes are alike.
3. A pane belongs to one LexPen window (each window its own Folder, Search, Characters, ...; a pane docks only in its
   own window), or a floating pane can serve every window and dock in any (as Characters and Highlights now work on
   the window last worked in)? Proposal: one window each.
4. The edges: left, right and bottom, or also the top? Proposal: left, right, bottom.
5. The bottom area: between the left and right areas (under the editor area only), or across the whole width?
   Proposal: under the editor area only, so the left and right areas keep their full height.
6. The default layout (3.9): as now (Folder and Search tabbed at the left, the outline at the right of each editor
   pane, the other panes floating)? Proposal: as now.
7. A hidden dock area (3.4a): does it leave a narrow strip at its edge (the show button and its panes' names, so it
   stays visible that something is docked there and one click brings a pane back), or does it vanish fully, the show
   button then elsewhere (the tab row, as the hamburger now sits in the toolbar)? Proposal: the strip.
