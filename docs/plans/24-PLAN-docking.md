# Plan: Docking: tool panes that float or dock

Status: draft 2026-10-22, extended 2026-10-25 (Folder and Search apart); brought in line with plan 33
2026-10-25 (no view window of its own: viewing is a normal project, so all windows are the same kind); worked out
2026-10-29 with your answers: every tool pane is the same kind (it floats as a window or docks in the main window);
only an outline is different (it docks to its own document pane); executed in two parts: first Folder, Search and
the Outline become windows of their own, then the docking. A closed dock leaves its header with a tab per pane.
Characters and Highlights work on the active document. Not started; questions open. From your answer on the
character picker window (plan 15 follow-up): "docking should be a new plan".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

LexPen's panes are fixed: the side pane (Folder and Search, two tabs) is always on the left; each editor pane has
an outline of its own at its right; Settings, the character picker, the highlights list and the Manage windows are
windows of their own (or, for Manage macros, a dialog in the page). You cannot put the folder pane on the right, the
search at the bottom, Settings or the characters next to the text, the folder in a window of its own on another
monitor, or an outline at the other side of its text or under it.

## 2. The solution, in brief

All tool panes are one kind: Folder, Search, Settings, Characters, Highlights and the Manage windows (projects, theme
sets, macros). Each one floats as a window of its own, or docks in a LexPen window: at the left, the right or the
bottom, alone, as a tab beside others, or above, under or next to another pane, resized with splitters. An outline is
the one exception: it belongs to its editor pane and docks only at that pane's left, right or bottom, or floats.

A dock closes and opens with a button whose icon shows the direction; closed, only its header stays, along the edge
(turned a quarter at the left and right), with a tab per docked pane: a click on a tab opens the dock with that pane.
The toolbar's hamburger goes. A pane shown again comes back as it was, also closed in its dock. Characters inserts into
the active document and Highlights lists the active document's highlights, wherever they are docked; the active
document keeps a dimmed frame while such a pane has the focus.

It is built in two parts. Part 1: Folder, Search and the Outline become pages of their own, windows like Settings
is now. Part 2: the docking, for every pane.

## 3. Details

### 3.1 How the panes are built now

- **Pages of their own**, each a WinForms form with its own WebView2: Settings (`SettingsForm`, settings.html; one
  per LexPen window), Characters (`CharPickerForm`, charpicker.html; inserts into the window last worked in),
  Highlights (`HighlightsForm`, highlights.html; the highlights of the document last worked in), Manage projects
  (`ProjectsForm`, projects.html), Theme sets (`ThemeSetsForm`, themesets.html). They talk to the LexPen windows
  through the host only.
- **Parts of the main page**: Folder and Search (the side pane `.mm-sidebar`, two tabs), Manage macros (the macro
  window, a dialog in the page, not modal since plan 36), and the outline of each editor pane (at its right). They
  read the window's state directly: the open documents and their unsaved text, the tree, the headings of the
  document shown.
- Not tool panes, and not part of this plan: the replace preview (modal, asks before a replace in files), the small
  questions (a name, a number, Yes / No), the menus, the find bar and the Occurrences bar (part of each editor pane).

### 3.2 Part 1: Folder, Search and the Outline as pages of their own

Each becomes a page of its own (folder.html, search.html, outline.html), in a window of its own as Settings is now;
what it reads from the window now, it gets through the host, as Highlights does. Part 2 docks these same pages.

- **Folder**: the window's folder and its files' marks (open, changed, a .bak, git, the red dot); a click opens a file
  in its window; rename, delete, new file, the Explorer entries and the context menu act as now; it follows the
  window's folder when that changes.
- **Search** (search and replace in files): searching the open documents uses their text as the window has it
  (unsaved changes too), sent by the window's page; a result clicked goes to the match in the window; replace in
  files changes the open documents in the window (one undo step each, as now) and the files on disk; the replace
  preview stays as it is.
- **Outline**: one per editor pane, showing that pane's document and following it when its tab changes; a click goes
  to the heading in the pane; folding, groups, bullets and marking the entry at the cursor as now. The page of the
  window sends the headings (it works them out now) and the cursor's place.
- Their keys work in them as now (F1, the find keys in Search, ...); a key that acts on the editor goes to the
  window's editor.
- Where they are shown during part 1, before the docking exists: question 6.
- The cost of a page per pane (a renderer per WebView2 page, its start time and memory) is measured during part 1:
  [not yet calculated].

### 3.3 One kind of tool pane (part 2)

- Every tool pane is a page of its own, the same page floating or docked, so it shows and does the same in both.
- Floating: a window of its own (as Settings now), movable, resizable, on any monitor, its place kept.
- Docked: shown in a LexPen window, in a dock area (3.5).
- Which window or document a pane works on:
  - Folder, Search and Settings: their LexPen window (its folder, its documents, its "this window" settings); one
    of each per window (question 2).
  - An outline: its editor pane.
  - Characters and Highlights: the active document (the one last worked in, in whatever LexPen window), docked or
    floating; they can be docked in any LexPen window (question 2).
  - Manage projects, Theme sets, Manage macros: as now.

### 3.4 How a page docks (question 1)

Two ways to show a pane's page inside a LexPen window:

- **Native docking (proposed).** The LexPen window (MainForm) holds the dock areas itself: WinForms panels with
  splitters around the main page, each docked pane's WebView2 control in one. The main page keeps only the menus,
  the tabs, the editor area and the bottom bar. Floating moves the same WebView2 control into a window of its own
  and back, so a pane keeps its state (scroll, selection, what is typed) when it moves. The drag (3.7) is done by the
  host: the pane's title tells the host a drag starts; the host shows the drop places over the window.
- **In the page.** The dock areas are in the main page, each docked pane an iframe with its page; floating shows the
  page in a window of its own instead. All docking is page code, but moving between docked and floating loads the
  page again (its state kept through the host), and each iframe's messages to the host need WebView2's frame
  messaging.

Proposal: native docking, after a prototype at the start of part 2 shows that a WebView2 control moves between a
panel and a window without trouble (focus, keys, DPI, a window moved to another monitor). An outline docks at its
editor pane, inside the editor area: with native docking its WebView2 control sits over the place its editor pane
keeps free for it.

### 3.5 Where a pane can be (the dock areas)

- Left, right and bottom of the LexPen window (question 3: also the top?). Left and right run from under the
  toolbar to above the bottom bar; bottom runs under the editor area, between the left and right areas (question 4:
  or across the whole width).
- An area holds groups; a group shows one pane, or several as tabs (one shown at a time). Groups in one area sit
  above, under or next to each other, with a splitter between them.
- Each area has a splitter against the editor area; its size is kept.
- Minimum sizes so the editor area never vanishes: [not yet calculated]: the figures with the prototype.
- The editor panes (the split into two panes) stay in the editor area as now; docking does not change them.

### 3.6 Closing and opening a dock

- Each dock area has a button in its header, at the side that faces the editor; its icon says which way the area
  goes: toward the window's edge to close it (left area: pointing left; right area: pointing right; bottom area:
  pointing down), the other way to open it. Not a hamburger.
- Closed, only the area's header stays, along its edge: at the left and right edges a narrow upright strip with its
  text turned a quarter (read from bottom to top at the left, from top to bottom at the right), at the bottom a
  horizontal strip. With one pane docked there it shows that pane's name; with more, a tab per pane. A click on a
  tab opens the area with that pane in front; the open button opens it as it was.
- With several groups in one area, the strip shows the tabs of all of them; the button closes and opens the whole
  area.
- The editor area takes the room of a closed area, less its strip.
- The same for an outline at its editor pane's side: its button closes it to a strip along that side of its pane
  (turned at the left and right, horizontal at the bottom), with the outline's name.
- The toolbar's hamburger goes; the left area's button does what it did. `sidebar.toggle` closes and opens the left
  area (existing keys keep working); new actions `dock.toggleLeft`, `dock.toggleRight`, `dock.toggleBottom` (F1,
  keys.json).
- Closed or open is kept per area in the window's layout (3.11).

### 3.6a Hiding a pane, and showing it again

- A pane is hidden with its Close (its menu, its close button) or its own toggle (`outline.toggle`, `viewFolder`,
  ...); it then has no tab either, and its dock area takes no room when it was the only one there.
- Shown again, it comes back exactly as it was: in its place in its group; and when its dock area was closed, the
  area stays closed and only its tab comes back in the strip. Example: the outline closed to its strip, then hidden
  with `outline.toggle`: `outline.toggle` again shows only its strip, not the open outline.
- A click on its tab (or the dock's open button) opens it.

### 3.7 Moving a pane

- Drag its title bar (or its tab): while dragging, each place it can go lights up: an edge of a LexPen window (a new
  group there), a group (as a tab in it), or a side of a group (above, under, or next to it). Dropped anywhere else:
  it floats there. A floating pane dragged over a LexPen window shows that window's places.
- Folder, Search and Settings dock only in their own window (question 2); Characters and Highlights in any.
- The pane's menu (Dock left, Dock right, Dock bottom, Float, Close) does the same without the mouse, and F1 lists
  the actions: `dock.left`, `dock.right`, `dock.bottom`, `dock.float`, `dock.close`, with the pane as their value, so
  a key can be given (keys.json, as any action).
- Esc while dragging: the drag ends, nothing moves.

### 3.8 The outline

An outline belongs to its editor pane and shows that pane's document; it is never docked beside another document and
never in the window's dock areas (3.5).

- Docked: at the right of its editor pane (as now, the default), at its left, or at its bottom (under the text, the
  full width of the pane), with a splitter against the text. Each editor pane chooses for itself: with two panes side
  by side you can, for example, put the left pane's outline at its left and the right pane's at its right; with two
  panes above each other, each outline at its pane's bottom.
- At the bottom, the entries run in columns (as many as fit the width); the splitter sets its height.
- Floating: its pane's outline in a window of its own, still showing that pane's document and following it when its
  tab changes.
- Moving: its title's menu (Left of the text, Right of the text, Below the text, Float, Close) and dragging its title:
  only its own pane's left, right and bottom light up; dropped elsewhere it floats.
- Closing to a strip (3.6), hiding and showing again (3.6a) as every pane.
- The outline's column in the gutter (gutter.js) stays as it is.
- `outline.toggle` hides and shows the outline of every editor pane, each as it was.

### 3.9 The active document and the active pane

- The editor pane with the active document has its frame, as now.
- When a tool pane gets the focus (Characters, Highlights, Search, ...), it gets the active frame; the active
  document's frame stays, dimmed, so it stays visible which document Characters inserts into and whose highlights
  Highlights lists.
- Characters inserts into the active document, docked or floating, in whatever LexPen window; the focus goes back to
  that document after an insert as now.
- Highlights lists the active document's highlights, and follows when another document becomes active.
- A floating pane's window shows the same active frame when it has the focus.

### 3.10 All windows are equal

The answer to "are all windows equal?": yes. Plan 33 (`executed/PLAN-view-window.md`) has no view window of its own:
viewing uses a normal project, "View" by default, whose windows dock every pane like any other.

- The view project keeps its layout as any project does (3.11): what you dock there stays there for the next view.
- Plan 33's "Reset to view layout" includes the docking: no panes docked or floating for that project's window,
  so only the editor pane in Preview is left.

### 3.11 Kept

- Per window, in the window's layout of plan 31 (`executed/PLAN-settings-layers.md`: the session's `layout`): every
  pane's place (docked: area, group, tab order, size; floating: its window's place and size), which are shown, which
  areas are closed; the outline's side, size and state per editor pane. A window opens as it was left; a new window
  takes the layout of the last window of its project (the last window used when the project has none).
- Characters and Highlights, which serve every window: their place (the window they are docked in, or floating) is
  kept once for LexPen, as their window places are now (AppState).
- View > Layout > Save as default (plan 31) includes the docking, so new projects start with it.
- The default (nothing saved yet, question 5): as now: Folder and Search tabbed at the left, the outline at the
  right of each editor pane, the other panes floating. Nothing moves until you move it.
- The old layout values (`sidebar` shown, its width, `outline`) are read into the new layout once, and the floating
  windows' kept places (AppState) become their floating places.

### 3.12 Menus and keys

- View > Panes: each pane with a check (shown), the dock areas with a check (open or closed, 3.6), and Reset
  docking (the default of 3.11 for this window).
- The pane menus and the drag (3.7); the actions in F1 (3.7).
- The existing actions keep working: `viewFolder`, `viewSearch`, Settings, Characters, Highlights, Manage projects,
  `macro.manage` show their pane as it was (3.6a); `sidebar.toggle` closes and opens the left area (3.6);
  `outline.toggle` as in 3.8.

### 3.13 Stages

Part 1, the pages:

1. The Outline as a page of its own per editor pane (outline.html): the headings and the cursor's place from the
   window's page, a click going back; shown as question 6 decides; the outline tests pass as before. Its cost
   measured (one page per editor pane).
2. Folder as a page of its own (folder.html), as above; the folder tests pass as before.
3. Search as a page of its own (search.html), the open documents' text from the window, replace in files through
   the window; the search and replace tests pass as before. The side pane and the hamburger go once both are out.

Part 2, the docking:

4. Prototype: one pane's WebView2 control in a panel of the LexPen window, moved to a window of its own and back;
   focus, keys, DPI, monitors. The choice of question 1 made.
5. The dock areas: groups, tabs, stacking, splitters, sizes; closing to the header strip with its tabs (3.6);
   hiding and showing a pane as it was (3.6a); kept in the layout. Every pane docks and floats.
6. Moving: the pane menus, the drag with the drop places, Esc; the actions.
7. The outline at the left, right or bottom of its pane; floating; its strip.
8. Characters and Highlights on the active document, docked in any window; the dimmed frame (3.9).
9. View > Panes, Reset docking, Save as default, the view project's reset; the docs (features.md).

### 3.14 Tests

- Part 1, in-app: the existing tests of the outline (entries, a click, folding, groups, marking the entry at the
  cursor, two panes), of the folder tree (open, rename, delete, marks, the red dot) and of search and replace in
  files pass with the panes as pages of their own; a search of the open files finds unsaved text; a result clicked
  goes to the match in its window; the outline follows its pane's tab changes.
- Part 2, in-app: each pane docked left, right and bottom (menu and drag), floated by dropping it outside, docked
  again; two panes as tabs, above and under each other, next to each other; a splitter dragged and the size kept;
  the editor area never below its minimum, also in a small window; Esc during a drag; a pane keeps its state
  (scroll, what is typed) when it moves; a window closed and opened again as it was; a new window of the project
  with the same docking; Save as default and a new project with it; Reset docking; the view project's reset.
- Part 2, in-app: each area closed and opened with its button (the icon pointing the right way each time); closed,
  its strip upright with turned text at the left and right, horizontal at the bottom, one tab per pane; a click on a
  tab opens the area with that pane; a pane hidden while its area was closed comes back as a tab only; the outline's
  strip at each of its three sides.
- Part 2, in-app: Characters docked in a window inserts into the active document, also one in another window;
  Highlights lists the active document and follows; with the focus in such a pane the document's frame is dimmed,
  the pane's active.
- Part 2, in-app: an outline at the left, the right and the bottom of its pane, each editor pane its own choice; at
  the bottom its entries in columns; dragging it lights up only its own pane's sides; floating, it follows its
  pane's tab changes.
- Unit: the old layout values and the floating windows' places read into the docking layout.

## 4. Open questions

1. How a page docks (3.4): native docking (the panes' WebView2 controls in panels of the LexPen window), or in the
   page (iframes)? Proposal: native, after the prototype of stage 4.
2. One of a pane per window, or one for all of LexPen? Proposal: Folder, Search and Settings one per LexPen window
   (they work on that window), docked only in it; an outline one per editor pane; Characters and Highlights one each
   for all of LexPen (they work on the active document), docked in any window or floating.
3. The edges: left, right and bottom, or also the top? Proposal: left, right, bottom.
4. The bottom area: between the left and right areas (under the editor area only), or across the whole width?
   Proposal: under the editor area only, so the left and right areas keep their full height.
5. The default layout (3.11): as now (Folder and Search tabbed at the left, the outline at the right of each editor
   pane, the other panes floating)? Proposal: as now.
6. Part 1 before part 2 exists: where are Folder, Search and the Outline shown? (a) In their own windows only,
   floating, until part 2 docks them: the side pane and the outline beside the text are gone meanwhile, so part 1 is
   merged into main only together with part 2; or (b) their pages shown at their old places (Folder and Search at
   the left, the outline at the right of its pane: the pages hosted there, fixed), plus Float in their menu, so each
   part can be merged and used at once and nothing changes in daily use. Proposal: (b).
