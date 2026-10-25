# Plan: Manage projects (a window for all projects at once)

Status: executed 2026-10-25 on the branch `plan31-manage-projects` (draft 2026-10-25). Decisions of the run in section 4.

## 1. What this is about

The Projects menu handles one project at a time, through a submenu per project. Cleaning up (deleting old
"Project n" ones), opening several or merging projects that belong together takes a trip through the menu for
each, or is not possible at all. There is no overview of what a project holds, or when it was made or last
used.

## 2. The solution, in brief

Projects > Manage projects... opens a window of its own, like the highlights window: a menu bar, a search box
and one list of every project with a checkbox, its name, open or closed, folders, tabs, a sign for drafts,
when it was created and last used. A row unfolds to show its windows and their files. The list sorts by name,
created or last used; Shift+click checks or unchecks a range. The menus act on the checked projects: open,
close, merge, rename, delete, new, and several ways to select. Close and delete first ask what to do with
unsaved documents and drafts. The list follows changes made elsewhere while it is open.

## 3. Details

### 3.1 What exists

- `ProjectStore` (Id, Name, Used, Windows; `Delete` refuses a project with open windows; `MoveWindow`;
  `DraftsOf` per window). `Display` gives "Project n" for an unnamed one.
- `AppHost.ProjectList` (the menu's data: per project its windows, open, folder, tab count) and
  `AppHost.ProjectCommand` (open, window, newWindow, new, rename, move, delete); `ProjectsChanged()` after
  every command.
- The highlights window (HighlightsForm.cs, web\highlights.html, highlightsview.js): the pattern to copy. One
  for the app, not modal, owned by the window it was opened from, its place kept in AppState.
- The main window's menu bar (web\menus.js) runs actions of the main page; it is not a separate component.

Words used: a **document** is a file with a name; a **draft** is a new document never saved as a file
(Drafts\editN.md).

### 3.2 The window

- Opened by Projects > Manage projects..., at the top of the Projects menu. One for the app: a second time it
  comes to the front.
- ProjectsForm.cs + web\projects.html + projectsview.js, built as the highlights window; its place is kept
  (AppState.ProjectsWindow). Follows the app's theme and Day / night as the other windows.
- From top to bottom: the menu bar (3.3), a search box, the list, the buttons (3.4).

### 3.2.1 The list

- A row per project. Columns: checkbox, name ("Project n" dimmed when unnamed), open / closed, its windows'
  folders, tabs, drafts (a sign with the count when the project holds drafts), created, last used.
- Last used: `Used`, as today: set when a window of the project opens and each time one is activated
  (AppHost: `projects.Touch`). Shown as date and time.
- Created: a new `Created` in ProjectStore (set by `NewProject`). Projects made before this have none: they
  show "--".
- A header checkbox: all / none of the rows shown.
- **Details**: a row unfolds (a triangle before the name, or Right / Left) to show its windows, each with its
  folder and the names of its tabs' files (a draft by its first line). A click on a window line opens just that
  window (ProjectCommand "window"). Many at once: View > Unfold all / Unfold selected / Fold all / Fold
  selected (3.3). Which rows are unfolded stays while the window is open (also when the list refreshes); it
  opens folded.
- Double-click a row: open that project. Space toggles the checkbox, Enter opens the checked ones (or the row
  with the focus when none is checked), F2 renames, Del deletes.

### 3.2.2 Sort

- By name, by created, by last used: from the View menu or a click on the column header; a second click on the
  same header reverses. Default: last used, newest first. The choice is kept (setting `projectsSort`, as
  "used-desc").
- Name: the named projects alphabetically (case ignored), then the unnamed ones by their number: Project 2
  before Project 10, not as text. Reversed: the whole order turned round.
- Created: projects without a date sort by their id (ids only grow, so the id order is the creation order),
  before the dated ones.

### 3.2.3 Select

- **Range with Shift**: a click on a checkbox remembers it as the anchor. Shift+click on another checkbox sets
  every row from the anchor to that one, both included, to the new state of the clicked one: it was unchecked
  and becomes checked -> all checked; it was checked and becomes unchecked -> all unchecked. The range is in the
  order shown (after sorting and the search filter); the clicked row becomes the next anchor. Shift+Space does
  the same from the anchor to the row with the focus.
- The Select menu (3.3) adds: all, none, invert, empty projects, not used since a date.

### 3.2.4 Search

- A box above the list: filters the rows on name and folder (and, with details unfolded, file names), case
  ignored. The checkboxes of rows filtered out keep their state but the actions work only on the checked rows
  that are shown, so nothing hidden is deleted by surprise.

### 3.2.5 Rename

- F2, Project > Rename, or a click on the name of the row with the focus: the name becomes an edit field. Enter
  keeps it, Esc cancels; empty makes it "Project n" again. Works for every project, not only the one of the
  window it was opened from (today's limit).

### 3.2.6 Merge

- Project > Merge to 'LexPen': the menu item names the target, the first project checked in clicking order.
  Needs two or more checked.
- The page keeps the order in which rows were checked. A Shift range adds its rows in the order shown, after
  the rows already checked; Select > All / Empty projects / Not used since add theirs the same way. When the
  target is unchecked, the next one in that order becomes the target (the menu item follows).
- The windows of the other checked projects move into the target (`MoveWindow`, open and closed windows
  alike, drafts with their window); the projects left empty go. The target keeps its name.
- Asks first: "Merge 4 projects into 'LexPen'? Their windows move to 'LexPen'; Project 4, Project 5 and
  Docs are removed." [Merge] [Cancel].
- A different target: uncheck and check again the ones before it; no choice dialog.

### 3.2.7 Close and delete: what is unsaved

Two kinds of unsaved work, counted per checked project and in total, documents first:

- **Unsaved documents**: changed and not saved. Only in open windows: closing a window already asks
  Save / No / Cancel, so a closed window holds none. The page of each open window of the project lists them
  (as `closeRequest` collects `dirty` today).
- **Drafts**: in open and in closed windows (`ProjectStore.DraftsOf`, from each window's session; an open
  window's page knows the current ones). Today a deleted project's drafts stay on disk and come back in
  whichever window starts first next time (AppHost.StartOf: drafts no window names), in a random project.

The delete question (a TaskDialog, as ClosePrompt):

```
Delete 3 projects?
  Rapport Q3 (open): 3 unsaved documents, 1 draft
  Project 4: 2 drafts
  Project 7: nothing unsaved
Total: 3 unsaved documents, 3 drafts.
Saved files are not touched: only the projects (their windows and tabs) are deleted.
[Save documents, keep drafts, then delete]  [Save documents only, then delete]  [Delete without saving]  [Cancel]
```

The buttons say "project" or "projects" by the count. What they do:

- **Save documents, keep drafts, then delete**: saves the unsaved documents; the drafts move, still drafts,
  into the LexPen window the projects window was last used for (AppHost.LastActive), as tabs, and belong to
  that window's project from then on. You save, keep or close each one when it suits you; no Save as dialogs
  in the middle of the delete. When that window is itself in a deleted project: the most recently used open
  window of a project that stays; none left: a new window in a new project.
- **Save documents only, then delete**: saves the unsaved documents; the drafts are deleted from disk.
- **Delete without saving**: the changes to the documents are thrown away and the drafts are deleted from
  disk. The way to drop a project with its scratch work in one go.
- **Cancel**: nothing happens.
- The buttons follow what is unsaved:
  - Only drafts: "The project will be deleted, drafts can be kept in the current window." (plural: "The
    projects will be deleted, ...") with [Keep drafts, then delete project] [Delete drafts and project]
    [Cancel]. Keep drafts: as "Save documents, keep drafts" above.
  - Only unsaved documents: [Save documents only, then delete] [Delete without saving] [Cancel].
  - Nothing unsaved: [Delete] [Cancel].
- The names (document paths, a draft's first line) are under the TaskDialog's "Show details" expander, so
  the counts stay readable with many.
- An unsaved document open in a window of another project too (a shared lock): saved or discarded once; the
  other window keeps the document (it is closed only in the deleted project's windows).
- A project with open windows is closed as part of the delete.

**Close selected projects** closes their open windows; the windows stay in the project, as closing by hand
does. Only unsaved documents are asked about (drafts stay with their window, nothing is lost):

```
Close 2 projects?
  Rapport Q3: 3 unsaved documents
  Docs: nothing unsaved
[Save documents, then close]  [Close without saving]  [Cancel]
```

- **Close without saving**: the changes are thrown away; the drafts stay with their window and come back when
  the project is opened again. (To drop drafts too: Delete.)
- Nothing unsaved: closes without asking.

### 3.3 The menu bar

The window's own menu bar, with the look of the main window's (the same CSS); a small one in
projectsview.js, since menus.js runs main-window actions. Alt+letter, arrows, Enter and Esc as in the main
window. Items that need checked projects are greyed out without them.

- **Project**: New project... / Open (Enter) / Close... / Merge to 'LexPen'... / Rename (F2) / - /
  Delete... (Del)
- **Select**: All (Ctrl+A) / None / Invert / - / Empty projects / Not used since >
  - Empty projects: projects whose windows have no tabs at all (no documents, no drafts). Adds to the
    current selection.
  - Not used since: a submenu, A week / A month / Three months / Half a year / A year; checks the projects
    last used before then. Adds to the current selection. (A date dialog later, if the fixed choices fall
    short.)
- **View**: Sort by name / created / last used (a check at the current one), Reverse order / - /
  Unfold all / Unfold selected / Fold all / Fold selected
  - All: every row shown (after the search filter). Selected: the checked rows shown; greyed out without.
  - Keys: Ctrl+Right unfolds the checked rows (all rows when none is checked), Ctrl+Left folds them, as
    Right / Left do for the row with the focus.

New project... asks a name, as the Projects menu does, and opens its window.

### 3.4 The buttons

Below the list, for the two actions used most: **Open selected** and **Close selected**. Delete, New, Merge
and Rename are in the Project menu only, to keep the buttons few (and Delete away from Open).

Open selected: every checked project opens (ProjectCommand "open"), the last one comes to the front.

### 3.5 Host changes

- `ProjectStore.Project` gets `Created` (DateTime?, null for projects from before); `NewProject` sets it,
  Load / Save read and write "created".
- `ProjectList` adds `used`, `created` (ISO date, or null), `drafts` (count) and per window the names of its
  tabs (for the details) per project.
- `ProjectCommand`:
  - `rename` with `project` (falls back to the caller's project as now).
  - `merge` with `project` (the target) and `from` (the others): MoveWindow for each of their windows, then
    the emptied projects go (`Delete` with nothing open, or a `Merge` in the store that does both).
  - `close` and `delete` take a list of projects and the answer of the question.
- The question: the host asks each open window of the checked projects for its unsaved work (a new page event
  `unsavedList` -> `{ dirty: [paths], drafts: [ids] }`, the same lists `closeRequest` makes), adds the drafts
  of closed windows (`DraftsOf`), and shows the TaskDialog (delete) or the shorter one (close).
- Closing those windows with the answer already given: `closeRequest` gets it and skips its own prompt:
  `"keep" | "documents" | "none"`. "keep" flushes the window's drafts to disk (as now) and closes their tabs;
  "documents" and "none" (on a delete) delete them (DraftStore delete) instead of flushing them. On a close the
  drafts are always flushed and stay with the window.
- The drafts of closed windows (no page to ask), on a delete: with "documents" or "none" the host deletes them
  from Drafts\.
- "keep": once the windows are closed and the projects deleted, the host sends the target window a new event
  `adoptDrafts` with the drafts ({ id, text }, from DraftStore.LoadAll); its page opens each as a draft tab, as
  `restore` does for a session's drafts. Its next session save names them, so they belong to its project.
- `ProjectsChanged` also tells the projects window, so the list follows.

### 3.6 Tests

- ProjectStoreTests: `Created` set by NewProject, written and read back, a file without it loads with null;
  merge: windows moved (open and closed), drafts with them, the emptied projects gone, the target's name kept;
  delete of several; the unsaved counts per project from closed windows' sessions; delete with "documents" /
  "none" removes the drafts, "keep" hands them to the target window (and the right target when the active
  window is itself deleted); close keeps the windows and their drafts.
- The sort by name (named alphabetically, then Project 2 before Project 10) and the range select: in
  projectsview.js, by hand unless a page test harness exists.
- By hand: open the window from two LexPen windows (one window, it comes to the front); every menu item with
  none, one and several checked; Shift+click down and up, checking and unchecking, after a sort and with a
  search filter; rename by F2 and by click, empty name; merge open and closed projects; close and delete with
  each button, with unsaved documents and drafts in open and closed windows; the list follows a project made in
  another window; Day / night and theme follow.

### 3.7 Decided along the way

- Open selected opens every checked project.
- Merge target: the first project checked in clicking order.
- Not used since: a submenu with fixed choices.
- Delete with only drafts still asks, to keep the drafts or not (3.2.7).
- Close selected with only drafts closes without asking: the drafts stay with their windows in the project.

## 4. Decisions of the run

- Close or delete that would close every open window: a new empty window in a new project opens first, so
  LexPen stays open and kept drafts have a place to go (AppHost.KeepOneWindow).
- A window that does not answer about its unsaved work within a few seconds: its project is left alone and the
  question says so.
- Empty drafts (no text) are not counted; they go with a deleted project.
- Windows closed by Close or Delete keep their place in the project also while others of it are still open
  (ProjectStore.CloseWithProject); closing by hand keeps its rule (the window is forgotten when another of its
  project stays open).
- Merge asks in a TaskDialog; ProjectStore.Merge moves the windows and removes the emptied projects.
- Rename by a click on the name of the row with the focus starts after a short wait, so a double click opens
  instead.
- Not used since counts a project that was never used as not used.
- The list reloads a moment after each save of the projects (a window opened, closed, a session saved).
- Open and Close work on the checked projects shown, or on the row with the focus when none is checked.
- Host to page questions: AppHost.Ask / Answer (page op "answer"), first used for "unsavedList".
