# Plan: Docking: tool panes that float or dock

Status: draft 2026-10-22, extended 2026-10-25 (Folder and Search apart); brought in line with plan 33
2026-10-25 (no view window of its own: viewing is a normal project, so all windows are the same kind); worked out
2026-10-29 with your answers: every tool pane is the same kind (it floats as a window or docks in the main window);
what a pane serves (one document, a window, LexPen) decides where it docks (the table of 3.4a); a pane of one
document serves its editor pane, then its window, then floating, the nearest first; native docking; speed first;
the preview stays with its editor; built in three parts (first Folder, Search and the Outline as pages of their
own, then the docking, then the smaller panes). Not started; no questions open. From your answer on the character
picker window (plan 15 follow-up): "docking should be a new plan".
The number in the file name is the priority; rename to reorder.

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
can dock. A tool of one document can also dock at the left, right or bottom of an editor pane. The docking is
native (the panes' browser views placed by the LexPen window itself), and it must not make LexPen slower.

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
  tab switch, a keystroke in a large file, with the default layout and with several panes docked. Figures:
  [not yet calculated]; a stage that makes one of them clearly slower is not merged until it is not.
- A pane's page is made only when the pane is first shown (not at the start for panes that are hidden or in a closed
  dock), and kept while its window is open, so showing it again is instant.
- All pages share one browser environment (as now), so a pane adds a page, not a browser.
- What the window's page sends a pane (headings, the folder's marks, the active document) goes only when it changed
  and only to panes that are shown; a pane in a closed dock or hidden gets it when it is shown again.
- The prototype (stage 4) measures what a page per pane costs in start time and memory before the docking is built
  on it.

### 3.3 Part 1: Folder, Search and the Outline as pages of their own

Each becomes a page of its own (folder.html, search.html, outline.html); what it reads from the window now, it gets
through the host, as Highlights does. Part 2 docks these same pages.

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
- Each editor pane has its own place for its preview, kept in the window's layout with the pane's outline side
  (3.13), so two panes can differ (for example the left pane's preview at its left, the right pane's at its right).
- Chosen in View > Preview at the right / at the left / above / below (actions `preview.right`, `preview.left`,
  `preview.top`, `preview.bottom`, in F1 and keys.json), and by a right-click on the splitter between text and
  preview.
- Scrolling level, the bar beside the cursor's block, the double click to the source and the preview's cursor work
  the same in each place (above and below: the preview's top follows the text's top, as the sides do now).
- With tool panes docked at the same side of the editor pane (3.10), the preview stays next to the text and the
  tool panes sit beyond it, at the pane's edge.
- Editor only and Preview only are as now; the place applies when both show.

### 3.5 How a page docks: native

The LexPen window (MainForm) holds the dock areas itself: WinForms panels with splitters around the main page, each
docked pane's WebView2 control in one. The main page keeps only the menus, the tabs, the editor area and the bottom
bar. Floating moves the same WebView2 control into a window of its own and back, so a pane keeps its state (scroll,
selection, what is typed) and is not loaded again when it moves. The drag (3.8) is done by the host: the pane's title
tells the host a drag starts; the host shows the drop places over the window.

- A pane docked at an editor pane sits inside the editor area: its WebView2 control is placed over the room its
  editor pane keeps free for it, and follows that room when the panes are resized or split.
- First a prototype (stage 4): one pane's WebView2 control in a panel of the LexPen window, moved to a window of its
  own and back; focus, keys, DPI, a window moved to another monitor; its cost (3.2).
- The alternative, iframes in the main page, is not taken: moving a pane between docked and floating would load its
  page again, and every docked pane would add to the main page's work.

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
- Minimum sizes so the editor area never vanishes: [not yet calculated]: the figures with the prototype.
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

### 3.7a Hiding a pane, and showing it again

- A pane is hidden with its Close (its menu, its close button) or its own toggle (`outline.toggle`, `viewFolder`,
  ...); it then has no tab either, and its dock area takes no room when it was the only one there.
- Shown again, it comes back exactly as it was: in its place in its group; and when its dock area was closed, the
  area stays closed and only its tab comes back in the strip. Example: the outline closed to its strip, then hidden
  with `outline.toggle`: `outline.toggle` again shows only its strip, not the open outline.
- A click on its tab (or the dock's open button) opens it.

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
- `outline.toggle` hides and shows the window's outlines (at its editor panes and its Outline pane), each as it was.

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
  areas are closed and the bottom area's width; each editor pane's outline side, size and state. A window opens as
  it was left; a new window takes the layout of the last window of its project (the last window used when the project
  has none).
- The floating ones of the panes that work on the active document (one each for LexPen): their place and whether
  shown, kept once for LexPen, as the windows' places are now (AppState).
- View > Layout > Save as default (plan 31) includes the docking, so new projects start with it.
- The default (nothing saved yet): as now: Folder and Search tabbed at the left, the outline at the right of each
  editor pane, the other panes floating. Nothing moves until you move it.
- The old layout values (`sidebar` shown, its width, `outline`) are read into the new layout once, and the floating
  windows' kept places (AppState) become their floating places.

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

- View > Panes: each pane with a check (shown), the dock areas with a check (open or closed, 3.7), and Reset
  docking (the default of 3.13 for this window).
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

4. Prototype: one pane's WebView2 control in a panel of the LexPen window, moved to a window of its own and back;
   focus, keys, DPI, monitors; its cost measured.
5. The dock areas: groups, tabs, stacking, splitters, sizes, the bottom area's two widths; closing to the header
   strip with its tabs (3.7); hiding and showing a pane as it was (3.7a); kept in the layout. Every pane docks and
   floats. The side pane and the hamburger go.
6. Moving: the pane menus, the drag with the drop places, Esc; the actions.
7. The panes that work on a document (3.9, 3.10): at an editor pane, docked per window, the floating one for the
   others, the order between them, its title and theme; several at one side of an editor pane.
7a. The preview's place in its editor pane (3.4c): right, left, above, below; the menu and the splitter's right-click.
8. The active document's dimmed frame and its cursor shown while a pane has the focus (3.11).
9. View > Panes, Reset docking, Save as default, the view project's reset; the docs (features.md).

Part 3, the panes that are lists or panels now (each on its own, after part 2):

10. Bookmarks as a pane (one document): the bookmarks of the document it serves, with their lines; a click goes
    there; the popup list (`bookmarkList`) stays as a quick way.
11. Messages as a pane (a window): View > Messages' list, kept up to date while shown.
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
  cursor in each place; kept after a restart; with the Outline docked at the same side, the preview next to the text.
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
