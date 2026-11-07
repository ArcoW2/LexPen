# Plan: Docking: tool panes that float or dock

Status: executed (2026-11-07): every stage built, no questions open; see 5. Resolved during execution.

History: draft 2026-10-22, extended 2026-10-25 (Folder and Search apart); brought in line with plan 33 2026-10-25 (no
view window of its own: viewing is a normal project, so all windows are the same kind); worked out 2026-10-29 with
your answers: every tool pane is the same kind (it floats as a window or docks in the main window); what a pane
serves (one document, a window, LexPen) decides where it docks (the table of 3.4a); a pane of one document serves its
editor pane, then its window, then floating, the nearest first; docking in the page (a docked pane is a frame, so
menus draw over it; native docking dropped 2026-10-29: the menus would be cut off at the panes); speed first; the
preview stays with its editor; built in three parts (first Folder, Search and the Outline as pages of their own, then
the docking, then the smaller panes).
From your answer on the character picker window (plan 15 follow-up): "docking should be a new
plan".

## 1. What this is about

LexPen's panes are fixed: the side pane (Folder and Search, two tabs) is always on the left; each editor pane has
an outline of its own at its right; Settings, the character picker, the highlights list and the Manage windows are
windows of their own (or, for Manage macros, a dialog in the page). You cannot put the folder pane on the right, the
search at the bottom, Settings or the characters next to the text, the folder in a window of its own on another
monitor, or an outline at the other side of its text, under it, or in a window of its own.

## 2. The solution, in brief

All tool panes are one kind: Folder, Search, Settings, Characters, Highlights, the Outline and the Manage windows
(projects, theme sets, macros). Each one floats as a window of its own, or docks in a LexPen window: at the left, the
right or the bottom, alone, as a tab beside others, or above, under or next to another pane, resized with splitters.
What a tool serves is its scope: one document (the Outline, Characters, Highlights), a window (Folder, Search,
Settings) or LexPen as a whole (projects, theme sets, macros); a table lists every tool with its scope and where it
can dock. A tool of one document can also dock at the left, right or bottom of an editor pane. A docked pane is a
frame in the window's page, so menus and dialogs draw over it, in a process of its own, so it does not slow the
typing; docking must not make LexPen slower.

The panes that work on the active document (Characters, Highlights, the Outline) serve the window they are docked
in; a floating one serves every window without a docked one of its own, takes the theme of the document it works on
and says which document that is. The active document keeps a dimmed frame and its cursor while such a pane has the
focus, so it stays clear where an insert or a paste goes.

A dock closes and opens with a button whose icon shows the direction; closed, only its header stays along the edge
(turned a quarter at the left and right), with a tab per docked pane. The toolbar's hamburger goes. A pane shown again
comes back as it was. View > Layout can take the layout of another window or project.

It is built in three parts. Part 1: Folder, Search and the Outline become pages of their own, shown where they are
now. Part 2: the docking, for every pane. Part 3: Bookmarks, Messages, Clipboards and Step by step become panes too.
The preview stays part of its editor pane.

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

### 3.2 Speed

Speed comes first: docking must not make LexPen start, open a window, switch a tab or type slower than now.

- Measured before part 1 and after each stage: the start until the first window shows its text, a new window, a
  tab switch, a keystroke in a large file, with the default layout and with several panes docked. Figures: per
  stage in 5 (the speed rows); a stage that makes one of them clearly slower is not merged until it is not.
- A pane's page is made only when the pane is first shown (not at the start for panes that are hidden or in a closed
  dock), and kept while its window is open, so showing it again is instant.
- All pages share one browser environment (as now), so a pane adds a page, not a browser. A docked pane is a frame
  from a site of its own (3.5), so it runs in a process of its own and its work does not hold up the window's page
  (typing, scrolling).
- What the window's page sends a pane (headings, the folder's marks, the active document) goes only when it changed
  and only to panes that are shown; a pane in a closed dock or hidden gets it when it is shown again.
- The prototype (stage 4) measures what a frame per pane costs in start time and memory, and that a busy pane does
  not slow the typing, before the docking is built on it.

### 3.3 Part 1: Folder, Search and the Outline as pages of their own

Each becomes a page of its own (folder.html, search.html, outline.html), shown in a frame of the window's page (3.5);
what it reads from the window now, it gets from the window's page by messages (floating: through the host). Part 2
docks these same pages.

- **Folder**: the window's folder and its files' marks (open, changed, a .bak, git, the red dot); a click opens a file
  in its window; rename, delete, new file, the Explorer entries and the context menu act as now; it follows the
  window's folder when that changes.
- **Search** (search and replace in files): searching the open documents uses their text as the window has it
  (unsaved changes too), sent by the window's page; a result clicked goes to the match in the window; replace in
  files changes the open documents in the window (one undo step each, as now) and the files on disk; the replace
  preview stays as it is.
- **Outline**: shows a document's headings (sent by the window's page, which works them out now) and the cursor's
  place; a click goes to the heading; folding, groups, bullets and marking the entry at the cursor as now.
- Their keys work in them as now (F1, the find keys in Search, ...); a key that acts on the editor goes to the
  window's editor.
- During part 1 they are shown where they are now: Folder and Search in the left side (their pages hosted there, the
  two tabs as now), each outline at the right of its editor pane; their menu also has Float, which shows the pane
  in a window of its own and back. So each stage of part 1 can be merged and used at once, and nothing changes in
  daily use.

### 3.4 One kind of tool pane (part 2)

- Every tool pane is a page of its own, the same page floating or docked, so it shows and does the same in both.
- Floating: a window of its own (as Settings now), movable, resizable, on any monitor, its place kept.
- Docked: shown in a LexPen window, in a dock area (3.6), or, for a pane that serves one document, at an editor pane
  (3.10).
- What a pane serves is a property of the pane, its **scope** (the table of 3.4a), and the scope decides where it
  can dock and what it works on there:
  - **One document**: it works on a single document. It docks at an editor pane (that pane's document), in a
    window's dock area (that window's active document), or floats (the active document of the windows without one);
    the nearest wins (3.9). Several can exist: one per editor pane, one per window, one floating.
  - **A window**: it works on one LexPen window as a whole (its folder, all its documents, its "this window"
    settings). One per window, docked in that window or floating for it; not at an editor pane.
  - **LexPen**: it works on nothing in particular (projects, theme sets, the macros, the clipboards). One for all of
    LexPen, docked in any one window or floating; not at an editor pane. Its place is kept once for LexPen.

### 3.4a The tool panes, their scope and where they dock

| Tool | Now | Scope | At an editor pane | In a dock area | Floating | Notes |
|---|---|---|---|---|---|---|
| Outline | in the page, at the right of each editor pane | one document | yes (default: right) | yes | yes | part 1: a page of its own |
| Characters | a window of its own (CharPickerForm) | one document | yes | yes | yes (default) | inserts at the served document's cursor |
| Highlights | a window of its own (HighlightsForm) | one document | yes | yes | yes (default) | the served document's highlights |
| Bookmarks | a popup list (`bookmarkList`) | one document | yes | yes | yes | a pane of its own in stage 10 |
| Preview | part of the editor pane (Preview, Side by side) | one document | yes, in the page: right (default), left, above, below (3.4c) | no | no | stays part of its editor pane (3.4b) |
| Step by step (macros) | a panel under the macro's tab | one document (the macro) | yes (default: bottom) | yes | yes | its variables and buttons; a pane of its own in stage 13 |
| Folder | in the page, the side pane | a window (its folder) | no | yes (default: left) | yes | part 1: a page of its own |
| Search, replace in files | in the page, the side pane | a window (its folder, its open documents) | no | yes (default: left, a tab beside Folder) | yes | part 1: a page of its own |
| Messages | a dialog (View > Messages) | a window (its messages) | no | yes | yes (default) | a pane of its own in stage 11 |
| Settings | a window of its own (SettingsForm), one per window | a window (its "this window" rows, and the global ones) | no | yes | yes (default) | |
| Manage projects | a window of its own (ProjectsForm) | LexPen | no | yes | yes (default) | |
| Theme sets | a window of its own (ThemeSetsForm) | LexPen | no | yes | yes (default) | |
| Macros (Manage, a macro's window) | a dialog in the page, not modal | LexPen | no | yes | yes (default) | a play runs on the active document, as a menu item does |
| Clipboards | a popup list (`clipboardList`) | LexPen | no | yes | yes | a pane of its own in stage 12 |

Not tool panes (they stay as they are): the find bar and the Occurrences bar (part of each editor pane), the F1 list
(a modal list to choose from), the replace preview (modal, before a replace in files), the small questions (a name,
a note, Yes / No, About), the menus, and the macro reference (a document in a tab).
### 3.4b The preview stays with its editor pane

The preview serves one document, but it stays part of its editor pane (Editor, Preview, Side by side), not a tool
pane: LexPen is an editor, the editing comes first, and a preview of its own would be fragile, slower and unclear to
use, for these reasons:

- It is tied to its editor in many ways that now work inside one page: the scroll kept level both ways, the bar at
  the preview's edge beside the cursor's block, a double click going to the source word, the preview's cursor and
  bookmarks, find and the Occurrences in the preview, the compare. Some of these would be cheap as a page of its
  own: a double click works out the source place in the preview (from its source map) and sends one message, and
  the editor pane it serves goes there, as a preview tab does now for the editor in the other pane. The costly ones
  are the continuous ones: keeping the scroll level is a message per scroll step each way, and every change sends
  the text again to be rendered; that is where it would feel slower and break first.
- One preview for two editors is ambiguous: when it follows the active editor it jumps at every click in the other
  pane, and its scroll cannot be level with two texts at once.
- Two previews of one editor: which one a double click or the preview's cursor answers to, and which one scrolls
  level, has no clear answer.

What is possible already, and stays: the same document open twice, in either editor pane, each in Editor, Preview
or Side by side; both in the editor too, one of them read-only, unless they are a split (View > Split into the
other pane), where both edit. So one text can be edited with its preview beside it and a second preview of it in
the other pane. A preview on another monitor (a pane of its own, floating) is not part of
this plan; its place within its own editor pane can be chosen (3.4c).

### 3.4c The preview's place in its editor pane

Within its own editor pane the preview can be placed where you like, as the panes that serve one document can: it
stays part of the page (3.4b), so this is only where it is drawn and costs no speed.

- Side by side shows the preview at the right of the text (as now, the default), at its left, above it or below it
  (above and below: the full width of the pane), with the splitter between them as now; above and below, the
  splitter sets its height.
- The place belongs to the editor pane (the first and the second pane of the window), not to the document or the
  tab: every document shown side by side in that pane gets it. So the two panes can differ: for example the first
  pane's preview above its text and the second pane's at its left.
- Kept in the window's layout with the pane's other places (3.13), also while the pane is closed: the second pane,
  closed and opened again, has its preview where it was before; one never opened yet has the default (at the
  right). The same holds for the tool panes docked at an editor pane (3.10): the second pane gets them back as they
  were when it opens again.
- Chosen in View > Preview at the right / at the left / above / below (actions `preview.right`, `preview.left`,
  `preview.top`, `preview.bottom`, in F1 and keys.json), and by a right-click on the splitter between text and
  preview.
- Scrolling level, the bar beside the cursor's block, the double click to the source and the preview's cursor work
  the same in each place (above and below: the preview's top follows the text's top, as the sides do now).
- With tool panes docked at the same side of the editor pane (3.10), the preview stays next to the text and the
  tool panes sit beyond it, at the pane's edge.
- Editor only and Preview only are as now; the place applies when both show.

### 3.5 How a page docks: in the page

A docked pane is a frame (an iframe) in the window's page, at its place in a dock area or at an editor pane; the
dock areas, groups, tabs and splitters are the page's own layout. Everything stays in one page, so the window's
menus, the F1 list, the messages, the dialogs and the completion lists draw over every docked pane, as now.

- Native docking (each pane's browser view placed by the LexPen window beside or over its page) is not taken: a
  page can never draw over another browser view, so the File menu would be cut off by a Folder pane docked at the
  left, the F1 list by any pane, a completion list by an outline beside the text.
- A pane's frame comes from a site of its own (pane.lexpen-panes.example, served by the host as the page is now),
  not the page's site, so the browser runs it in a process of its own: a busy pane (a search through a large folder)
  does not hold up typing in the window. Whether WebView2 does split it so is checked first (stage 4).
- The pane and its window's page talk by messages between the frame and the page (`postMessage`), with no host in
  between: the outline gets its headings from the page directly, a click goes back the same way. What needs the host
  (files, the folder, settings) goes through the window's page as now.
- Floating: the same page in a window of its own (a form with its own WebView2, as Settings now); there its messages
  go through the host to the window it serves. The pane's code does not see the difference: one small part of it
  (the channel) sends to the frame's parent or to the host.
- Moving a pane between docked and floating loads its page again in the new place; what it shows (its scroll, the
  open folders of the tree, the search and its results, what is typed in a field) is kept by the pane and handed
  over, so it comes back as it was.
- The frames are made when a pane is first shown and kept while its window is open (3.2).
### 3.6 Where a pane can be (the dock areas)

- Left, right and bottom of the LexPen window; not the top (the toolbar, the tabs and the bars stay there). Left
  and right run from under the toolbar to above the bottom bar.
- The bottom area has two widths, chosen by where a pane is dropped (3.8): dropped on the bottom bar's edge, the
  bottom area runs the full width of the window (under the left and right areas); dropped just above that, between
  the left and right areas (under the editor area only). The width is the area's, kept in the layout, and changes
  when a pane is dropped at the other place.
- An area holds groups; a group shows one pane, or several as tabs (one shown at a time). Groups in one area sit
  above, under or next to each other, with a splitter between them.
- Each area has a splitter against the editor area; its size is kept.
- Minimum sizes so the editor area never vanishes: the editor area keeps 300 px, an editor pane's text 200 px beside
  its own areas (docks.js: EDITOR_MIN, TEXT_MIN).
- The editor panes (the split into two panes) stay in the editor area as now; docking does not change them.

### 3.7 Closing and opening a dock

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
- The same for the panes at an editor pane's side: the button closes them to a strip along that side of the pane
  (turned at the left and right, horizontal at the bottom), with their names as tabs.
- The toolbar's hamburger goes; the left area's button does what it did. `sidebar.toggle` closes and opens the left
  area (existing keys keep working); new actions `dock.toggleLeft`, `dock.toggleRight`, `dock.toggleBottom` (F1,
  keys.json).
- Closed or open is kept per area in the window's layout (3.13).
- A group in a stack (two or more groups above each other at a side: the window's left or right, or beside an editor
  pane's text) has a roll-up button in its head: rolled up it is as high as its tabs and the other groups there get
  its room; a pane of it shown again (its tab, its menu item or key, a drop) rolls it down and shows that tab. Kept
  in the layout. (Your request, 2026-10-30.)

### 3.7a Hiding a pane, and showing it again

- A pane is hidden with its Close (its menu, its close button) or its own toggle (`outline.toggle`, `viewFolder`,
  ...); it then has no tab either, and its dock area takes no room when it was the only one there.
- Shown again, it comes back exactly as it was: in its place in its group; and when its dock area was closed, the
  area stays closed and only its tab comes back in the strip. Example: the outline closed to its strip, then hidden
  with `outline.toggle`: `outline.toggle` again shows only its strip, not the open outline.
- A click on its tab (or the dock's open button) opens it.
- A pane opened from its menu item (View > Characters, Highlights, Messages, Options > Settings, Manage projects,
  Theme sets, View > Macros) comes back in the last state it had: docked where it was (a tab beside the panes docked
  there already) or floating, at its place. For example Characters kept docked at the left or the bottom opens
  there every time. Its first time: as now (floating, 3.4a).

### 3.8 Moving a pane

- Drag its title bar (or its tab): while dragging, each place it can go lights up: an edge of a LexPen window (a new
  group there; at the bottom, the two widths of 3.6 as two places), a group (as a tab in it), a side of a group
  (above, under, or next to it), and for a pane of one document the left, right and bottom of each editor pane.
  Dropped anywhere else: it floats there. A floating pane dragged over a LexPen window shows that window's places.
- What can go where follows the scope (3.4): a pane of a window docks only in its own window; a pane of one document
  or of LexPen in any window; only a pane of one document at an editor pane.
- The pane's menu (Dock left, Dock right, Dock bottom, Dock at the editor pane (a pane of one document), Float,
  Close) does the same without the mouse, and F1 lists the actions: `dock.left`, `dock.right`, `dock.bottom`,
  `dock.float`, `dock.close`, with the pane as their value, so a key can be given (keys.json, as any action).
- Esc while dragging: the drag ends, nothing moves.

### 3.9 The panes that serve one document

The panes with the scope one document (3.4a: the Outline, Characters, Highlights, Step by step, later Bookmarks) can
dock at an editor pane as well as in a window's dock areas or float (3.10). Where such a pane is docked decides what
it serves, and the nearest one wins: one docked at an editor pane, then one docked in the window's dock areas, then
the floating one. Each serves only what no nearer one of the same kind serves; the kinds are apart (an outline at an
editor pane does not keep Characters from serving that document).

1. **Docked at an editor pane** (3.10): it serves that editor pane's document, and only that one, also when another
   editor pane has the focus.
2. **Docked in a LexPen window's dock area**: it serves the documents of that window whose editor pane has no pane of
   the same kind docked at it: of those, the active one (the one with the focus, or the one that had it last). With
   the focus on a document that has its own, the window's pane keeps showing the last document it served.
3. **Floating**: it serves the LexPen windows that have no pane of the same kind in their dock areas, and of those
   the documents whose editor pane has none of its own: of those, the document worked in last. A window with, for
   example, its Outline pane in a dock area is not served by the floating outline. One floating one of each kind.

- With the focus on a document that a pane does not serve (it has a nearer one), the pane keeps showing what it
  showed last; with nothing to serve at all, it says so and waits.
- Moving a pane changes what it serves at once (dropped at an editor pane, it takes that pane's document; dropped
  in a dock area, its window's; floated, the windows without one).
- A floating one shows the document it works on: its title says the document's name ("Outline: plan24.md",
  "Characters: notes.md"), and it takes the theme of that document's window (its theme set and day / night), so it
  looks as the document does; both change when another document becomes active.
- Characters inserts into the document it serves; the focus goes back to that document after an insert, as now.
- Highlights lists the highlights of the document it serves, and follows when that changes.

### 3.10 Panes at an editor pane

- Every pane that works on a document can dock at an editor pane: at its right, its left, or its bottom (under the
  text, the full width of the pane), with a splitter against the text. Each editor pane chooses for itself: with two
  panes side by side you can, for example, put the left pane's outline at its left and the right pane's at its right;
  with two panes above each other, each outline at its pane's bottom.
- Each side of an editor pane is a small dock area of its own: several panes there are tabs, or above, under or next
  to each other, as in the window's dock areas (3.6); for example the Outline and Characters as two tabs at the
  right of the text.
- The default (as now): an outline at the right of each editor pane; nothing else docked there.
- The outline at the bottom: its entries run in columns (as many as fit the width); the splitter sets its height.
- Moving such a pane away from its editor pane (a dock area, or floating) makes it the window's pane of that kind,
  or the floating one (3.9); dropped back at an editor pane, it is that pane's again.
- Closing to a strip (3.7), hiding and showing again (3.7a) as every pane; the strip runs along that side of its
  editor pane.
- The outline's column in the gutter (gutter.js) stays as it is.
- At the left and right of the text an area's head is as high as the bars above the text (the format bar, the
  ruler, the code bar), so a pane there starts at the height of the text; the outline's first entry is at the height
  of the text's first line. (Your request, 2026-10-30.)
- Each editor pane's outline is on or off for that pane alone: its button in the pane's tab strip (at its right end), or
  `outline.toggle` on the active pane; kept per editor pane in the window's layout (`outline` for the first, `outline2`
  for the second). The top bar's Outline button is gone. (Changed 2026-10-30 at your try of stage 1: the button showed
  and hid both panes' outlines at once.)

### 3.11 The active document while a pane has the focus

- The editor pane with the active document has its frame, as now.
- When a tool pane gets the focus (Characters, Highlights, Search, ...), it gets the active frame; the active
  document's frame stays, dimmed, so it stays visible which document Characters inserts into and whose highlights
  Highlights lists.
- The active document keeps showing its cursor (all of its cursors, with several) while a tool pane has the focus,
  docked or floating: steady, not blinking, so it is clear that the focus is elsewhere but also exactly where an
  inserted character or a paste goes. Its selection stays visible too, in the colour of a selection without the
  focus. (Now the editor hides its cursor as soon as it loses the focus.)
- In the preview the place stays marked the same way (the preview's cursor, executed/PLAN-preview-bookmarks.md,
  when it is shown).
- A floating pane's window shows the same active frame when it has the focus.

### 3.12 All windows are equal

The answer to "are all windows equal?": yes. Plan 33 (`executed/PLAN-view-window.md`) has no view window of its own:
viewing uses a normal project, "View" by default, whose windows dock every pane like any other.

- The view project keeps its layout as any project does (3.13): what you dock there stays there for the next view.
- Plan 33's "Reset to view layout" includes the docking: no panes docked or floating for that project's window,
  so only the editor pane in Preview is left.

### 3.13 Kept

- Per window, in the window's layout of plan 31 (`executed/PLAN-settings-layers.md`: the session's `layout`): every
  pane's place (docked: area, group, tab order, size; floating: its window's place and size), which are shown, which
  areas are closed and the bottom area's width; each editor pane's preview place and its docked panes (also for a
  closed second pane, so it opens again as it was). A window opens as it was left; a new window takes the layout of
  the last window of its project (the last window used when the project has none).
- The floating ones of the panes that work on the active document (one each for LexPen): their place and whether
  shown, kept once for LexPen, as the windows' places are now (AppState).
- View > Layout > Save as default (plan 31) includes the docking, so new projects start with it.
- The default (nothing saved yet): as now: Folder and Search tabbed at the left, the outline at the right of each
  editor pane, the other panes floating. Nothing moves until you move it.
- The old layout values (`sidebar` shown, its width, `outline`) are read into the new layout once, and the floating
  windows' kept places (AppState) become their floating places.
- A floating pane comes back floating. Until then (part 1) it does not: a window closed with its outline floating
  opens with no outline at all, as floating it took the editor pane's own outline off (found when you tried stage 1).
  With this section the floating outline opens again, and so serves its document again.

### 3.13a Using another window's layout

View > Layout gets a third item beside Save as default and Reset to default: **Use layout of...**, which gives this
window the layout of another window or project.

- It lists the other open LexPen windows (by their project's name and the window's title) and the projects with no
  window open (their last window's layout, as a new window of that project would get it). The choice is a submenu
  when the list is short, else the list with a search, as F1 (`layoutUseFrom`, in F1 too).
- What it takes: the whole window layout of plan 31 (the outline, the panes and their sizes, the ruler, the bars,
  ...) and, once the docking exists, every pane's place, size and tab order, which dock areas are closed, the bottom
  area's width, and each editor pane's outline side and state. Floating panes of the window go to the same places
  on the screen; a place off every screen (another monitor setup, a screen gone) is moved onto the nearest screen,
  wholly visible.
- What it does not take: this window's folder, tabs, documents and cursors; the window's own place and size on the
  screen; the floating panes of LexPen as a whole (3.13).
- Applied at once, as Reset to default is; the message offers Undo (the layout as it was), as Save as default does.
- Kept as this window's own layout from then on; the other window keeps its own (no link between them).
- It works on today's layout already, so it can be built before the docking (stage 0) and grows with it.

### 3.14 Menus and keys

- View > Panels: every panel (tool pane) there is, with a check when it is shown: Folder, Search, Outline,
  Characters, Highlights, Bookmarks, Messages, Settings, Manage projects, Theme sets, Macros, Clipboards, Step by
  step. Choosing one shows it in the last state it had (3.7a: docked where it was, a tab beside what is there, or
  floating), or hides it when it is shown. Below them the dock areas with a check (open or closed, 3.7), and Reset
  docking (the default of 3.13 for this window).
- View > Document panels: the parts that only exist inside a document's pane, with a check when shown: Editor and
  Preview (as the Editor and Preview switches now). The panels of View > Panels are not in it, also those that work
  on a document (Outline, Characters, Highlights), as they can be docked outside a document's pane or float.
- Edit > Insert character goes: Characters is in View > Panels (its action and key stay).
- View > Layout: Save as default, Reset to default (plan 31), Use layout of... (3.13a).
- The pane menus and the drag (3.8); the actions in F1 (3.8).
- The existing actions keep working: `viewFolder`, `viewSearch`, Settings, Characters, Highlights, Manage projects,
  `macro.manage` show their pane as it was (3.7a); `sidebar.toggle` closes and opens the left area (3.7);
  `outline.toggle` as in 3.10.

### 3.15 Stages

Before the parts, on its own:

0. View > Layout > Use layout of... (3.13a) on today's window layout; it takes the docking layout too once part 2
   has it. The speed measurements of 3.2 taken once, as the baseline.

Part 1, the pages (each shown where it is now, with Float; each merged on its own):

1. The Outline as a page of its own per editor pane (outline.html): the headings and the cursor's place from the
   window's page, a click going back; the outline tests pass as before; speed measured.
2. Folder as a page of its own (folder.html); the folder tests pass as before; speed measured.
3. Search as a page of its own (search.html), the open documents' text from the window, replace in files through
   the window; the search and replace tests pass as before; speed measured.

Part 2, the docking:

4. Prototype: a pane's frame from its own site in the window's page: it runs in a process of its own (a busy pane
   does not slow typing, measured as 3.2), the menus and the F1 list draw over it, focus and keys; moved to a window
   of its own and back with its state handed over; its cost measured.
5. The dock areas: groups, tabs, stacking, splitters, sizes, the bottom area's two widths; closing to the header
   strip with its tabs (3.7); hiding and showing a pane as it was (3.7a); kept in the layout. Every pane docks and
   floats. The side pane and the hamburger go.
6. Moving: the pane menus, the drag with the drop places, Esc; the actions.
7. The panes that work on a document (3.9, 3.10): at an editor pane, docked per window, the floating one for the
   others, the order between them, its title and theme; several at one side of an editor pane.
7a. The preview's place in its editor pane (3.4c): right, left, above, below; the menu and the splitter's right-click.
7b. The windows of their own as pages of their own, so they dock too: Characters and Highlights (with stage 7, as
    panes of one document), Settings, Manage projects, Theme sets and the Macros window (Manage, a macro's window).
    Each docks and floats as the other panes; opened from its menu item it comes back in its last state (3.7a). The
    Macros window (Manage and a macro's window) is a normal pane then, not modal: the window behind it works on.
8. The active document's dimmed frame and its cursor shown while a pane has the focus (3.11).
9. View > Panes, Reset docking, Save as default, the view project's reset; the docs (features.md).

Part 3, the panes that are lists or panels now (each on its own, after part 2):

10. Bookmarks as a pane (one document): the bookmarks of the document it serves (the active one, your answer of
    2026-10-30), each with its line number and the
    start of the text on that line; a click goes there; it docks and floats as every pane; the popup list
    (`bookmarkList`) stays as a quick way.
11. Messages as a pane (a window): View > Messages' list, kept up to date while shown; a normal pane that docks and
    floats, not a modal dialog.
12. Clipboards as a pane (LexPen): the clipboards with the start of their text, the active one marked; a click makes
    one active; the popup list (`clipboardList`) stays.
13. Step by step as a pane (one document, the macro): its buttons and variables; by default at the bottom of the
    macro's editor pane, as now.
### 3.16 Tests

- Speed: the measurements of 3.2 after each stage against the baseline of stage 0.
- Part 1, in-app: the existing tests of the outline (entries, a click, folding, groups, marking the entry at the
  cursor, two panes), of the folder tree (open, rename, delete, marks, the red dot) and of search and replace in
  files pass with the panes as pages of their own; a search of the open files finds unsaved text; a result clicked
  goes to the match in its window; Float and back.
- Part 2, in-app: each pane docked left, right and bottom (menu and drag), the bottom area full width and between
  the left and right areas by where it is dropped; floated by dropping it outside, docked again; two panes as tabs,
  above and under each other, next to each other; a splitter dragged and the size kept; the editor area never below
  its minimum, also in a small window; Esc during a drag; a pane keeps its state (scroll, what is typed) when it
  moves; a window closed and opened again as it was; a new window of the project with the same docking; Save as
  default and a new project with it; Reset docking; the view project's reset.
- Part 2, in-app: each area closed and opened with its button (the icon pointing the right way each time); closed,
  its strip upright with turned text at the left and right, horizontal at the bottom, one tab per pane; a click on a
  tab opens the area with that pane; a pane hidden while its area was closed comes back as a tab only; the outline's
  strip at each of its three sides.
- Part 2, in-app: Characters, Highlights and the Outline docked in window A serve A's active document; the floating
  ones serve window B (no docked one) and not A; the floating one's title names the document and its theme follows
  the document's window (two windows with different theme sets); an outline at an editor pane follows only that
  pane.
- Part 2, in-app, the order of 3.9: window A with two editor panes, pane 1 with its own outline, pane 2 without, and
  an Outline pane in A's dock area: the focus on pane 1 leaves the Outline pane at pane 2's document; the focus on
  pane 2 shows it there; a floating outline never shows a document of A; its own outline taken away from pane 1,
  the Outline pane serves pane 1 too; A's Outline pane floated, the floating one serves A.
- Part 2, in-app: Characters docked at editor pane 1 inserts into pane 1's document also with the focus in pane 2;
  Characters in A's dock area then serves pane 2 only; the Outline and Characters as two tabs at the right of one
  editor pane; pane 1's own outline does not keep A's Characters from serving pane 1 (the kinds apart); Highlights
  at an editor pane lists that pane's document only.
- Part 2, in-app: with the focus in a pane the document's frame is dimmed, the pane's active; the document's cursor
  (and several cursors) stays shown, steady, its selection in the colour without focus; an insert from Characters
  lands exactly there; docked and floating.
- In-app: the preview at the right, the left, above and below its text (menu and the splitter's right-click), each
  editor pane its own place; scrolling level, the cursor's bar, the double click to the source and the preview's
  cursor in each place; kept after a restart; with the Outline docked at the same side, the preview next to the text;
  the second pane closed and opened again: its preview where it was (never opened before: at the right), the first
  pane's unchanged.
- Part 3, in-app: Bookmarks lists the served document's bookmarks and follows them (added, moved with the text,
  removed), a click goes there; Messages shows a new message while shown; Clipboards shows each clipboard's text,
  a click makes one active (copy and paste then use it); Step by step works docked at the macro's pane, in a dock
  area and floating, its variables updated per step; each one docked, floated and closed to its strip.
- In-app: Use layout of... from another open window and from a project with no window open: this window then shows
  that layout (with part 2 the docking too), its folder, tabs and own place unchanged; floating panes at the same
  places, one from a screen that is gone moved onto a screen; Undo puts it back; the other window unchanged; kept
  after a restart.
- Unit: the old layout values and the floating windows' places read into the docking layout; a place off every
  screen moved onto the nearest one.

## 4. Open questions

None.

## 5. Resolved during execution

| Topic | As built |
|---|---|
| Stage 0: Use layout of... | View > Layout > Use layout of (a submenu filled when it opens) lists the other open windows by their title, then the projects with no window open that have a closed window with a layout ("Name  (no window open)"). From F1 (`layoutUseFrom` without values) the same list opens as a popup menu, without a search (the submenu is short in practice). Host: `AppHost.LayoutSources`, `LayoutFrom` (an open window's layout as it shows it, `PageLayout`; a window that reported none yet: the default layout). Each window reports its layout once at its start, so another window can take it before anything changed. A project whose last window was closed by hand has no window left, so it is not listed (a new window of it would get the default layout). |
| The speed baseline (3.2) | Measured with the scratchpad script `speed.ps1`: the Release build (the page served from the exe, as published), a data folder of its own made empty for each run, a markdown file of 20,000 lines. Five runs, medians: start until the first window shows the file's text 3334 ms (the first run, a cold start, 5803 ms); a new window until its page has started 1542 ms; a tab switch between two such files to the next painted frame 79 ms; a keystroke in such a file to the second painted frame 33 ms (two frames at 60 Hz: bounded by the screen, not by the work). Each later stage is measured the same way against these. |
| Panes in frames: the process | Checked before stage 1 (the stage 4 check, moved forward, as part 1 now shows the panes in frames): a frame from the panes' own site (`lexpen-panes.example`, served by the host as the page is) runs in a process of its own; the browser lists it as a target of its own. Kept busy for 1.5 s, the window's page went on painting (its longest gap between frames 67 ms); a frame from the page's own site stopped the page for the whole 1.5 s. Messages between them: a round trip of a few milliseconds. The debug build maps the panes' site to the project's folder with `DenyCors` (with `Deny` a frame of it did not load). |
| Stage 1: the Outline as a page | `outline.html` with `outline-pane.js`, and `pane.js` for every pane page (messages to its window, the window's theme and fonts, the keys it does not use passed to the window, a press making its window's pane the active one). The window's page keeps the work: the entries as rows (`showOutline`), the folded groups, the entry at the cursor (`markOutline`), the sneak preview, the right-click menu (drawn in the window, over everything), the gutter's outline column, the resize edge. The frame is made the first time an outline shows; until it is ready the last message of each kind waits. The window's keys (F1, Ctrl+Shift+Tab, ...) work from inside the outline. |
| Stage 1: speed | `speed.ps1`, five runs, medians: default layout start 3351 ms, new window 1565 ms, tab switch 83 ms, keystroke 33 ms; with the outline on: 3326, 1559, 83, 33 ms. Against the baseline (3334, 1542, 79, 33 ms) the tab switch is a few milliseconds up, within the spread of the baseline's own runs (70 to 83 ms); nothing clearly slower. |
| Stage 1: Float | Right-click the outline > Float in a window of its own: `PaneForm` (any pane page in a window of its own, owned by its LexPen window, its place kept per kind in `AppState.PaneWindows`) shows the same page; its messages go through the host to its window's page (`paneFloat`, `paneSend`, `paneDock`; the events `fromPane`, `paneClosed`). One floating outline per window: the pane it floated from loses its own column, and the floating one serves the active document when that pane has no outline of its own, else it keeps the last one (3.9; the dock areas come in part 2). Titled "Outline: name"; its menu is drawn by the pane itself (the window's page cannot draw there), with Back in the window (it closes, and the pane it served gets its own outline again). Closing its window only closes it: nothing comes back at an editor pane. Its floating state is not kept over a restart yet: that comes with the layout of part 2 (3.13). |
| Stage 1: per pane | The outline on or off per editor pane (3.10): a button in each pane's tab strip, `outline.toggle` on the active pane, the layout values `outline` and `outline2`; the top bar's button is gone. A document in a language without an outline (JSON, for example) hides that pane's column and greys out its button and `outline.toggle`; the pane keeps its on / off for the next document with one. The floating outline stays open for such a document and shows nothing (it may serve another document next). The gutter's outline column shows in the panes an outline serves (its own, or the floating one). |
| Stage 1: the Release build | A Release build serves the page from the exe through `WebResourceRequested`; the filter for the panes' site needs all request source kinds (`CoreWebView2WebResourceRequestSourceKinds.All`), else it only sees the main page's requests: the frame's document loaded but its scripts did not, and the outline was empty. The debug build (a folder mapping) did not show it, so each stage is now also checked in a Release build. |
| Pane pages: ready | A pane page says it is ready only once all its scripts have run (DOMContentLoaded), and it gets everything it shows every time it says so: a message that came before its own script had run found no handler, and the outline stayed empty (now and then, by timing). |
| Stage 2: the Folder pane as a page | `folder.html` with `folder-pane.js` (its head: the folder's name, the sort, Known, Refresh; and the tree) in a frame in the sidebar's Folder view. The page builds the rows and keeps the open folders, the cursor row and the scroll (it reports the open folders and the scroll for the session); it asks the window to list a folder (`listItems`: the host's listing with the marks: git, a backup next to it, highlights, a file type no pack knows, a file gone) and sends what is done: open (a click, Enter with the focus staying in the tree), up a folder, F2, Esc, the sort, the head's buttons, a drag's path. The window keeps the folder (`state.root`), the marks of the active document and the changed files, Show in folder pane (`reveal`), a rename (`renamed`: the open folders and the cursor follow), and the right-click menu (drawn in the window, over everything, at the place in the frame). Compare folders still takes the Folder view with its own list in the window's page, the frame hidden meanwhile. |
| Stage 2: Float | Right-click > Float the folder pane in a window of its own: the same page in `PaneForm` (pane `folder`), titled "Folder: name". While it floats it is not in the sidebar: the sidebar closes when it showed the Folder view (and opens on it again when the pane comes back), the Folder tab is hidden, and what opens a folder or shows a file in the folder pane leaves the sidebar closed (the floating window shows it); Compare folders still uses the sidebar's Folder view for its list. Its right-click menu is drawn by its page, with the items the window's menu has for that row (Back in the window among them); a choice runs the window's item. Closing its window puts it back in the sidebar (unlike the outline: the Folder pane serves its window only, so there is nothing else for it to show). Not kept over a restart yet (part 2, 3.13). An item that opens a further menu (Compare with Git version...) opens it in the LexPen window. |
| Stage 2: speed | `speed.ps1`, five runs each, the stage 1 build (a worktree of its commit) and the stage 2 build measured one after the other: start 2383 / 2382 ms, new window 528 / 482 ms, tab switch 84 / 83 ms, keystroke 33 / 33 ms. Equal. Both are below the baseline of stage 0 (3334, 1542, 79, 33 ms), measured days before under another load of the machine: a comparison is only fair between builds measured at the same time, so from now on each stage is measured against the build before it, at the same time. |
| Menus closed by a press in a pane | The window's menus (the right-click menus of the tree, the tabs, the panes; the menu bar's; the popup menus) close on a press anywhere outside them; a press inside a pane's page (a frame, or a floating window) reaches the window as that page's `activate`, which now closes them too (before, a right-click menu of the window stayed open after a click in the Outline or the Folder pane). |
| The click back from a floating pane | The window ignores the click that brings it back from another program (setting ignoreActivationClick). Going to one of its own floating pane windows and clicking back on it is not that: `PaneForm` tells the window's page when it gets the focus or loses it, and to which window (`WM_ACTIVATE`, the event `paneWindowFocus`); losing it to another program counts as away again. Tested in the page (its blur, the host's messages, its focus, then a click; a control run without the messages swallows the click); the real switch of the Windows focus is to try by hand (a script cannot take the foreground). |
| The browser's right-click menu | Its Highlight items and Show all occurrences belong to a document's editor and preview: the host asks the page where the right-click was (`contextInDocument`, with a deferral of the menu) and adds them only there; no longer in the Search pane's fields, the find bar, the status bar. |
| Stage 3: the Search pane as a page | `search.html` with `search-pane.js` in a frame in the sidebar's Search view: the find field, the switches, the scope, the replace row, the status and the results are there; the window's page searches (the open documents' text as it has it, unsaved edits too; the files in the folder through the host), replaces (an open file one undo step, one not open written to disk), keeps the history and sends the results as rows (its own HTML, the texts escaped). `searchUi` and `replaceUi` stand for the page's fields in the window's page, so the search and replace code (`runSearch`, searchreplace.js) stayed as it was. The find history (history.js) runs in the page too, on its two fields, with the window's lists (sent when they change); Clear history goes to the window. The ? window, a match clicked, Esc (an open find bar closes first) and Alt+A as before. |
| One channel for the pane pages | `panechannel.js`: a pane's page in a frame of a view or floating, the waiting messages until it is ready (a message with a `key` waits under that key: the Search pane's two fields), what it shows when it says it is ready, a press closing the window's menus, its keys, a menu it draws floating. The Folder and Search panes use it; the Outline keeps its own (it is per editor pane, and the floating one serves the active document). |
| Text fields in a pane | pane.js passes the keys a pane does not use to the window; in a text field (the Search pane's) the editing keys stay there: typing, the arrows, Ctrl+A / C / V / X / Z / Y, Ctrl+arrows, Ctrl+Backspace / Delete. |
| A sidebar pane floating | Folder or Search floating is not in the sidebar: its tab is hidden, the sidebar shows the other pane (it closes when it showed the floating one, and opens on it again when that comes back). Before, the floating Folder pane left the sidebar on its view with a note that it was in a window of its own (found when you tried stage 2). |
| Stage 3: speed | `speed.ps1`, five runs each, the stage 2 build and the stage 3 build one after the other: start 2634 / 2521 ms, new window 591 / 539 ms, tab switch 85 / 83 ms, keystroke 33 / 33 ms. Equal. |
| Stage 4: the prototype | Done by part 1: the frames from the panes' site run in a process of their own (checked before stage 1), the menus and the F1 list draw over them, focus and keys work in and out of them, a pane floats and comes back with its state handed over (Outline, Folder, Search), and the cost was measured per stage. |
| Stage 5: the dock areas | `docks.js`: left, right and bottom areas around the editor area (a grid: the bottom area the full width or between the sides, `data-dock-bottom-width`). An area holds groups, a group its panes as tabs; the first group's head has the area's button at the side toward the editor (an arrow toward the window's edge closes it). Closed, the area is a strip along its edge with a tab per pane (turned at the sides); a tab there opens the area with that pane in front. Splitters against the editor area (its width or height, kept) and between groups (their shares, kept). A pane is shown, hidden (Close in its tab's menu: no tab, its group gone when it was the only one; shown again in its place, and in a closed area only its tab comes back) or floating (its group without it; it floats again after a restart, 3.13). Kept in the layout value `docks`, with `sidebar` and `sidebarWidth` as the left area's open state and width as before, so the view project, `sidebar.toggle` and its key work as they did. The hamburger is gone; `dock.toggleLeft`, `dock.toggleRight`, `dock.toggleBottom` are new. A tab's right-click menu: Float, Dock left, Dock right, Dock at the bottom (the full width, or between the sides), Close; the drag comes in stage 6. In this stage the Folder and Search panes dock (by default tabbed at the left, as before); the Outline joins the areas in stage 7. Minimum sizes, chosen (not measured): an area at least 120 px, the editor area keeps at least 300 px. |
| Stage 5: frames stay put | Moving a frame in the page loads its page again, so the groups' elements stay and a pane's view moves only when the pane changes group: a tab switch moves nothing (tested: a mark set in the Search pane's page is still there after switching tabs). |
| Stage 5: a drag over a frame | A splitter's drag over a pane's frame (its own process) lost the moves: a cover over the page lies there during the drag (`dockDrag`). The right area's splitter reached over the editor's overview strip at the editor area's right edge; it now reaches into its own area. |
| Stage 5: speed | Measured with the stage 3 build at the same time (`speed.ps1`, five runs each). First the start was slower: 2592 / 2471 ms, then in the other order 2782 / 2514 ms: every layout change measured the editors again, and the dock areas were laid out several times at the start. Now only a change of the areas' shape or size does (`renderDocks`). After that: stage 5 2779 ms, stage 3 2771 ms, stage 5 again 2907 ms (the machine's load moved during these runs: the new window and tab switch figures of the same builds moved too); new window 675 / 739 / 677 ms, tab switch 121 / 117 / 117 ms, keystroke 33 ms in all. |
| View > Panels, Document panels | Your request (2026-10-30): one View item Panels with every panel and a check when it is shown; one View item Document panels with what can only be shown inside a document's pane (Editor, Preview); Edit > Insert character removed. In 3.14; built with stage 9 (View > Panes there becomes these two). |
| The order after 7.2 | Your answer (2026-10-30): 7b first (every window of its own a normal pane), then the rest of what docks; 7.3 (the one floating outline for all of LexPen) after that. The Bookmarks pane serves the active document. |
| Modal windows, the Bookmarks pane | Your report (2026-10-30): Manage macros and Messages are still modal; they become normal panes that dock and float (7b, 11). The Bookmarks pane shows each bookmark's line and the start of its line's text (stage 10). |
| The other windows | Settings, Manage projects, Theme sets, the Macros window, Characters and Highlights dock too (your answer 2026-10-30: "it's really handy to keep the Characters docked at the left, bottom"): stage 7b makes them pages of their own; opened from their menu item they come back in their last state, docked or floating (3.7a). |
| Stage 6: moving a pane | A tab dragged (past a few pixels; a press and release without a drag is the tab's click): the place under the pointer lights up (`showDropPlace`); let go there, the pane goes there (`dockMove`); let go anywhere else, inside the window or outside it, it floats there (its window opens at the cursor: `paneFloat` with `atCursor`). The places (`dockDropAt`): a group's head (a tab in it); its body by the third (a group of its own above or under it at the sides, left or right of it at the bottom; else a tab in it); a closed area's strip (a tab in it, the area opens); the window's left and right edge (a group of its own there); the bottom bar's edge (the bottom area the full width) and just above it (between the sides). Esc while dragging: nothing moves. A floating window moved by its title bar over its LexPen window: `PaneForm` reports the cursor while it moves and where it is let go (`paneMoving`, `paneMoved`, in the page's coordinates: `MainForm.PagePoint`); the place lights up and the pane docks there, its window closing. The pane's menu is its tab's right-click menu (stage 5); the actions `dock.left`, `dock.right`, `dock.bottom`, `dock.float`, `dock.close` take the pane as their value (one F1 entry per pane, keys.json). At an editor pane (a pane of one document) comes with stage 7. |
| Stage 6: a drag over a frame | A drag that starts on a tab right above a pane's frame lost every move to that frame (its own process), the tab's pointer capture notwithstanding: the cover over the page now lies there from the press on, not from the first move. Tested: a tab dragged from right above the other pane's frame. |
| Stage 6: tested by hand only | The real move of a floating window over its LexPen window (a window move by Windows itself, which the test scripts cannot drive; the page's side is tested with the host's messages), and a release outside the window with the real mouse. |
| Stage 6: speed | `speed.ps1` against the stage 5 build, measured at the same time: medians start 2557 / 2464 ms, then in the other order 2446 / 2320 ms; new window, tab switch and keystroke equal. The single starts of both builds, two more rounds interleaved: stage 5 2319, 2344, 2182, 2303, 2251, 2373, 2219 ms (and a first, cold start of 3667 ms), stage 6 2378, 2318, 2330, 2295, 2329, 2373, 2479, 2738 ms: they overlap. Stage 6 adds nothing that runs at the start (five actions registered; the drag runs on a press), so no cause in the code was found; the next stage's measurement shows whether the gap stays. |
| Stage 7 in steps | 7.1 an editor pane's own dock areas with its outline in them; 7.2 the Outline in the window's dock areas with the order of 3.9 (the nearest serves); 7.3 the one floating outline for all of LexPen, serving across windows (the host passes its messages between windows); 7b Characters and Highlights as pages (then Settings, Manage projects, Theme sets, the Macros window). An editor pane's outline (`outline:0`, `outline:1`) lives only at its own editor pane; the window's (`outline:w`, 7.2) in the window's areas or floating; moved from one to the other it becomes the other (3.10: "makes it the window's pane of that kind"), which keeps one per editor pane and one per window. |
| Stage 7.1: an editor pane's own areas | `docks.js` with area keys: `left`, `right`, `bottom` (the window's) and `0.left` ... `1.bottom` (an editor pane's, kept under `editor` in `docks`). The editor pane's body is a grid: its text (`.mm-content`: editor, splitter, preview) with an area at the left and right and one under it the full width of the pane, each with its splitter, groups, tabs, strip, as the window's. A pane's scope: a window pane (Folder, Search) only in the window's areas, an editor pane's outline only at its own editor pane (other places do not light up for it; let go elsewhere it floats as before: the floating outline). The outline keeps its on / off per editor pane (`outline`, `outline2`, its button) and no tab and no room for a language without an outline; a hidden or unavailable pane's view stays in its group (the group hidden), so its page is not loaded again (tested: off and on, json and back). Its menu: At the left of the text, At the right of the text, Under the text, Float, Close. Under the text its entries run in columns (outline.html, by its frame's shape). Its width: the area's splitter (the old `outlineWidth` stays the sides' default); its old resize edge is gone. |
| Stage 7.1: speed | `speed.ps1` against the stage 6 build, at the same time: start 2420 / 2335 ms, with the outline on 2349 / 2279 ms; new window, tab switch, keystroke equal. The start's medians were higher in stages 6 and 7.1 than in the stage before them each time (by 70 to 126 ms). Checked here: not the re-measuring of the editors (`relayout`, about 27 ms each with a large file): all its calls at the start come before the file is in the editor (counted: six, in the first 270 ms). The cause is not found yet; the single runs of stage 6 against stage 5 overlapped. To measure again against the build of stage 4 (part 1's end) after stage 7. |
| Stage 7.2: the window's outline | `outline:w`: in one of the window's dock areas (its own frame in its view, made the first time it docks) or floating (PaneForm, as before); hidden at first (its place: the right area). It serves the active document when that document's editor pane has no outline of its own, else it keeps the last one it served (3.9, within its window). Where it is comes from the docks' state (`syncWinOutline` after each change). Moving between the kinds (`kind: 'outline'`, `dockInstance`): an editor pane's outline dropped in a window area becomes the window's outline there (that pane's own goes off, the window's serves its document); the window's outline dropped at an editor pane (a drag, its floating window let go there, its menu's At the left / right / Under the text) becomes that pane's own (the window's is hidden, its floating window closes). Its tab's menu lists both: at the active editor pane's text, and the window's areas. The one floating outline for all of LexPen (3.9's third rule, across windows) is 7.3. |
| A group's roll-up; heads at the text's height | Your requests (2026-10-30), in 3.7 and 3.10: a roll-up per group in a stack (none for a single group: nothing would get its room; none at the bottom: its groups sit side by side); the side areas of an editor pane have heads as high as the bars above its text (`alignPaneDocks`, measured from the editor's top, followed by a ResizeObserver on the editor: a bar that wraps changes the editor's height), the outline's list starts 12 px down as the editor's text. Tested: the head ends where the text begins, the first entry at the first line's height. |
| Stage 7b: a window's page docked | A tool's own page (charpicker.html, ...) docks unchanged in a frame named `tool:kind` from the panes' site: WebView2 gives a frame its own `chrome.webview`, so the page asks the host itself as in its own window; the host answers it through the frame (`CoreWebView2Frame`, MainForm `FrameCreated`, `ToolFrame.cs`), with the same requests as its own window (moved into AppHost: `CharPickerRequest`), for the window it is docked in. The app's events for that tool (settings, look, the cursor's character) reach the docked ones too, each with its own window's values. Its window of its own stays as the floating one (CharPickerForm), and reports its moves as PaneForm does (`DockMoves.cs`), so moved over its LexPen window it docks there. A request's Esc in a docked page: the keys back to the document. Checked first with a prototype: a frame's message reached the host and its answer the frame. |
| Stage 7b: Characters | A pane (`chars`), floating the first time (3.4a: CharPickerForm, one for LexPen, inserting into the window last worked in); docked (its tab's menu, a drag, its window moved over the window), its page in a frame inserting into its own window, following that window's cursor, settings and look. Insert character (its menu item, its key) opens it in its last state (3.7a): its window, or shown docked where it was (its area opened) at the cursor's character. Narrow (docked at a side) the page puts the grid first; docked, the list of blocks is hidden at first and shown and hidden with the button at its top (your request, 2026-10-30; kept). Kept over a restart. |
| Stage 7b: a tool per editor pane | Characters and Highlights are panes of a kind, as the outline: the window's (`chars`, `hls`) and one beside each editor pane's text (`chars:0`, `hls:1`, ...), each in a frame named `tool:<id>`; the host reads the pane from the name (ToolFrame `Pane`) and works on that pane: Characters inserts into its document and hears its cursor, Highlights lists its document (each editor pane's list is told, with which pane is active: `highlightsShown`) and goes to a highlight there. Moved to an editor pane the window's becomes that pane's own, moved to the other editor pane's edge that pane's, moved to the window's areas the window's again; floated, the one floating window. Opened from its menu item: the active pane's own when it has one (not closed), else the window's as it was last (openToolPane). A new window does not open the floating one of its own accord (`floatsOnCall`). |
| Stage 7b: Characters docked, small | Your request (2026-10-30): docked it is a small picker: the top line the blocks' button, All chars and the size (no search), the grid, under it the character in two lines that do not wrap (it, its code and number, UTF-8 dimmed; its name); no recent ones, no field, no buttons; a click selects, a double click or Enter inserts at once. The blocks are a menu over the grid from the button (at most down to the pane's bottom). The grid's scroll bar has a thin line where each block starts (the name as the tip, a click: that block at the top). In its own window as before, the fields labelled Search and To insert. |
| Scroll bars | Your request (2026-10-30): every scroll bar (lists, panes, the character grid) in the look of the editor's and the preview's: their width (overviewWidth), the theme's colours, a rounded thumb. |
| Stage 7b: Settings | A pane of the window (not at an editor pane): its page (settings.html) docked in a frame `tool:settings` asks the host itself (SettingsForm.Request, shared with its window of its own: the page, the owner of its questions, its main window); every message for a window's settings page goes to its window and its docked one (SettingsPages), and one meant for it while it is being opened (F1 > File types) waits until its page starts. F1 > File types and Manage theme sets' Edit open it as it was last (the window's page decides: the action settings). Narrow: a row's control under its text. Floating the first time; a new window does not open it of its own accord. |
| Stage 7b: Manage projects, Theme sets | LexPen's panes, docked in a window's dock areas (each window can have them; they show the same, LexPen's) or floating in their windows as before (one for LexPen). Their lists follow every change (also the docked ones). Their questions (close, delete, merge) belong to the LexPen window they are docked in. Manage projects' own `close` is of projects, so a docked one's Esc is `back` / `close-window`. The Settings page's Manage theme sets opens it as it was last. |
| Stage 7b: the Macros window | A page of its own (macros.html, macros-pane.js) through the panes' channel, as Folder and Search: its window's page keeps the macros and does what its buttons ask; Manage (the list) and a macro's window are the same pane. Floating the first time; not modal; its window closed by hand keeps it floating (so it opens floating again); moved onto the window it docks. |
| Stage 10: Bookmarks | A page of its own (bookmarks.html) through the channel: the window's (`bm`: the active document, docked or floating) and one beside each editor pane's text (`bm:0`, `bm:1`: that pane's document), as the outline; it follows the bookmarks (set, moved with the text, removed; a refresh at most every 200 ms) and the document shown; a click goes to the bookmark in the editor pane it serves. Hidden at first; Edit > Bookmarks > Manage bookmarks... (its action) shows it docked at the right. |
| Stage 11: Messages | A page of its own (messages.html) through the channel, the window's: kept up to date while shown; a click on a message's document goes there; Clear. Floating the first time; not modal; its window closed by hand keeps it floating. |
| Stage 12: Clipboards | A page of its own (clipboards.html) through the channel, LexPen's: the Windows clipboard and 1 to 9 with the start of their text, the active one marked; a click makes one active. The host's change of the clipboards now carries the Windows clipboard's text too. Hidden at first; Edit > Manage clipboards... (its action) shows it docked at the right. |
| Stage 13: Step by step | A page of its own (step.html) through the channel: at the bottom of the macro's editor pane by default (`step:0`, `step:1`), or the window's (`step`) in its dock areas or floating. A step by step shows the one in use (the macro pane's own when not closed, else the window's, else another editor pane's). When the macro ends the pane stays, with its last variables and the buttons off (it was removed before). |
| Stage 7.3: one floating outline for LexPen | The floating outline is one window for all of LexPen (AppHost: `FloatingOutline`), owned by the window it serves. Each window's page tells the host whether it may serve it now (`outlineWanted`: its own window outline not docked, its active editor pane without an outline of its own); a window activated that it may serve takes it (`outlineServe`: the page sends what it shows; the window before hears `outlineRelease` and stops sending); its title names the document, its caption takes that window's look. A window that docks its own while served: it moves on to the window worked in last that it may serve, else it closes; a window closing while served: the same. Closed by hand: every window hears it (theirs hidden). A new window of the project takes the layout, so with the floating outline it takes it until another window is worked in. Tested with two windows brought to the front in turn (t24s73). |
| Stage 7a: the preview's place | Per editor pane, a value of the window's layout (`previewPlace`, `previewPlace2`: right, the default; left; top: above; bottom: below), kept also while the second pane is closed. The text and the preview in their editor pane's content box in that order (CSS flex direction); above and below the splitter lies across and its drag sets the heights (the same editor share as the widths, one per window). Chosen in View > Preview place (the actions `preview.right`, `preview.left`, `preview.top`, `preview.bottom` on the active pane, in F1 and keys.json) and by the right-click on the splitter (its own pane's). Tool panes docked at that editor pane sit outside its content box, so the preview stays next to the text. Scrolling level works by source line as before (tested below the text). |
| Stage 8: the active document while a pane has the focus | A tool pane with the focus (docked in the window's dock areas or at an editor pane: `partAt` takes every dock group) has the active frame (the focus ring); the active document keeps a frame of its own, dimmed (`.mm-doc-ring`, around its editor or preview as last used), and its cursors shown, steady (`data-keep-cursor`: CodeMirror's cursors visible without the focus, no blink; the cursor past a line's end too); its selection keeps the colour without the focus, as before. The same while a floating pane's window has the focus (`paneWindowFocus`). A floating pane's own window draws the active frame while it has the focus (pane.js). The preview's cursor already stays shown. Not for the windows of their own that are not panes' windows (Characters' and Highlights' floating windows): their pages are their own. |
| Stage 9: View > Panels, Document panels, Reset docking | View > Panels lists every panel (Folder, Search, Outline, Characters, Highlights, Bookmarks, Step by step, Messages, Clipboards, Macros, Settings, Manage projects, Theme sets) with a check when it is shown: docked in front in an open area (the window's or an editor pane's own), or its window of its own open (asked from the host: `toolWindowsOpen`). Choosing one hides it when shown (docked: hidden; floating: its window closed as by hand, `closeToolWindow`; it stays floating) or shows it through its own action, as it was last. Below them the window's three dock areas (open or closed) and Reset docking (`dock.reset`: your Save as default's docking, else the shipped one; the window's windows of their own closed). View > Document panels: Editor and Preview; Sidebar, Folders, Search and Outline left View's first level (they are in Panels; their actions stay); Edit > Insert character is gone (Characters in Panels; its action and key stay). Save as default includes the docking (it is a layout value); Reset to view layout gives the shipped docking (`ViewProject.Layout`) and closes that window's windows of their own. |
| A dock area's tab bar | Your report (2026-10-31): tabs that do not fit were cut off, and a dragged tab always went last. Now: the setting dockTabBar, "rows" (several rows, all tabs visible; the default) or "scroll" (one row, the mouse wheel scrolls it); a tab dropped on a head goes between the tabs where it is let go (a line lights up there; on its own tab it stays). The setting dockTabIntensity (25 to 200%, 100 the theme's own): above 100 the text further from its background and the backgrounds and lines further from the text (a dark theme: the text brighter, the rest darker); below 100 the text fades towards its background. |
| Macros and Messages docked at a restart | Your report (2026-10-31): the docked Macros pane was empty after a restart. Both had no page made when shown from the start; now as the other panes. The Macros pane at the start is Manage with the list. |
| Edit menu | Edit > Manage clipboards..., and Edit > Bookmarks (Go to, Store, Next, Previous, Manage bookmarks...). |
| The formatting bar over the right area | Your request (2026-10-31): the formatting bar and a code language's bar run the whole width of the document panel over the text and the editor pane's right dock area, not over its left one (`.mm-bars` in the editor pane's grid); the right area starts under the bar, the left area runs up beside it. The heads of the side areas end where the text begins (the left: under the bar and the ruler, the right: under the ruler); the ruler stays over the editor's text only. This replaces the alignment of 3.10 for the right area (its head now under the bar, so the outline's first entry no longer at the first line's height). |
| Dock tabs | Your request (2026-10-31): a group's head is a band in the theme's accent, tinted, with an accent line above it as the divider; the tabs bold, the one in front on the panes' own background with a thick accent line on top (checked in Dark forest with Characters and Highlights under the Folder pane). |
| Stage 2: dragging from the tree | Found by you: a file dragged from the docked Folder pane did not open (the browser lets no drag from a frame of another site drop in the page around it). The drag is now done with the pointer: it starts in the Folder pane's page, the moves over its frame come from it, those over the rest of the window the window sees; the pane under it lights up (its far half: the second pane), let go there the file opens there; Esc ends it. Tested by script with the pointer (test events; a real mouse to try by hand). Floating, the browser's own drag between windows as before. |
| Floating windows over the window | Found by you: a floating tool's window let go at the document's right edge did not dock when the window fills the screen (Windows snapped it, its size changed). A move by its title bar counts now, not the size at the end (DockMoves.cs). Not tested by script (a real drag). |
