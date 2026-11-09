# Plan: The Folder pane's root history, and a head of drop-downs

Status: draft 2026-11-09; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

Showing a file in the Folder pane (the arrows button at the left of a tab bar, executed/PLAN-show-in-folder-pane.md)
opens that file's folder as the pane's root when the file lies outside the open one. The folder you were working in
is then gone, and getting back means finding it again (File > recent folders, or Open folder). The pane has no
history of its roots.

The pane's head line spends its room on the root folder's name, which the tree already shows in its row with the full
path under `..`. The sort, the filters and the sizes are buttons beside that name, and in a narrow pane they move into
one View menu (Filter, View, Order). View therefore holds things that are not view settings. A folder's size cannot be
shown at all.

## 2. The solution, in brief

The pane keeps a history of its roots per window: every root it showed, with its open folders, cursor and scroll, so
going back restores the tree as it was. The head line loses the folder's name and gets, from the left: a Sort
drop-down (its button shows the order and an up or down arrow for the direction), a Filter drop-down (Known files,
Hidden folders / files), a Recent button (an icon only) listing the root history, then View and Refresh. View holds
only what the rows show: the file size, and the folder size, which the host works out in the background and fills in
as it comes.

## 3. Details

### 3.1 The root history

- **What it holds**: each root the pane showed in this window, newest first, with its open folders, cursor row and
  scroll (as the session keeps them for the current root). One entry per folder: showing a folder again moves it to
  the top with its newest state.
- **Kept**: with the window's session (app.js saveSession), so it is there after a restart.
  [not yet checked: how long the list should be; see Open questions.]
- **Added to**: by every change of root: Open folder, a favourite or recent folder, `..` (Alt+Up), Show the file in
  the folder pane, a folder made the root from its right-click menu. The root left behind is stored with its state
  first, so going back to it restores it.
- **The Recent button**: an icon only (a clock), tooltip "Recent roots". A click shows a drop-down of the history:
  the folder's name with its path dimmed after it (as the ribbon's drop-down lists show a key), the current one
  checked; a click opens that root with its state. A folder that no longer exists is dimmed; choosing it removes it
  (as File > recent folders does).
- **Not the same as File > recent folders**: that list is shared by all windows and holds only paths; this one is
  the pane's own history, with the tree's state. See Open questions for whether it also shows the shared list.

### 3.2 The head line

From the left:

- **Sort**: a drop-down button showing the order (Modified, Name, Extension, Size) and an arrow up or down for the
  direction, so the current sort reads at a glance. Its list: the four orders (the current one checked), a divider,
  Up and Down (the current one checked). Choosing the current order again flips the direction (as a column header
  in Explorer).
- **Filter**: a drop-down button "Filter" with Known files and Hidden folders / files, each checked when on. The
  button is marked (as an on toggle, `mm-on`) while either is on, so a filtered tree is never mistaken for the whole
  folder.
- **Recent**: the icon button of 3.1.
- **View**: Size (each file's size after its name) and Folder size (3.3). Nothing else.
- **Refresh**: as now, at the right.

The folder's name leaves the head (the base row in the tree, its full path under `..`, stays: its right-click, the
favourite folders). The floating window's title stays "Folder: name". The head's narrow mode (fitHead, `mm-compact`,
the buttons moving into View) goes: the drop-downs are narrow enough to stay on one line. [not yet checked: the
narrowest dock width they must fit in.]

### 3.3 Folder size

- **Shown**: with View > Folder size on, each folder row shows its size after its name, as Size does for a file: the
  total of every file under it, in the same units (bytes, KB, MB, GB).
- **Worked out by the host in the background**: when a folder's row is shown (the root's children, and the children
  of each opened folder), the window asks for the sizes of those folders; the host adds them up on a background
  thread and sends each one as it is done (an event, as the folder compare's second pass does). A row shows "..."
  meanwhile. A new root or the setting switched off stops what is still running.
- **Kept for a while**: a size is kept until something changes under that folder (the folder watcher, syncWatch,
  clears it and the folders above it), so opening and closing folders does not add them up again.
- **What counts**: the same files the tree lists with the current filter (hidden ones only with Hidden on;
  `node_modules` always counted, as it is on disk). See Open questions.
- **Sort by size**: folders sort by their size too once it is known (folders stay first); until then by name.

### 3.4 Where

- folder.html / folder-pane.js: the head's buttons and drop-downs (paneMenu, as View now), the Recent list, the
  folder size in a folder row.
- app.js: the history (openFolder stores the root left behind and adds the new one), folderHead with the history,
  the session, the folder size requests and events, setting `treeFolderSize`.
- The host (C#): a folder size calculation (new, background, cancellable) with a unit test; the operation and its
  event in MainForm.
- docs/features.md: the Folder pane's description.

### 3.5 Alternatives

- **Back / Forward buttons** (as a browser) instead of a list: two more buttons in the head, and going back several
  roots takes several clicks; the list shows where each goes. A key for Back can still come (Open questions).
- **Show the file without changing the root** (a second tree, or the file shown under its own path inside the
  current tree): the tree would show folders outside its root; the history keeps one simple tree and makes the change
  cheap to undo.
- **Folder sizes worked out in the page** (asking the listing of every subfolder): far more messages and no way to
  stop it well; the host does it in one pass per folder.

### 3.6 Tests

- Unit (C#): the folder size of a test folder tree (files at several depths, hidden ones with and without Hidden),
  and a calculation stopped halfway gives no answer.
- In the test copy:
  - Open a folder, open some subfolders, scroll; Show the file in the folder pane for a file outside it. The Recent
    list then has both, and choosing the first restores its open folders, cursor and scroll.
  - A restart keeps the history.
  - A folder deleted on disk is dimmed in the list and removed when chosen.
  - The Sort button shows the order and the arrow; choosing the current order flips it; the tree follows.
  - The Filter button is marked while Known or Hidden is on.
  - View > Folder size: "..." then sizes; a file added under a folder changes its size; sorting by size orders the
    folders by size.
  - The head at the narrowest dock width, and floating.

## 4. Open questions

1. How many roots should the history keep? A suggestion: as many as the recent lists (15).
2. Should the Recent drop-down also list File's recent folders (shared by all windows) below the pane's own history,
   after a divider, or only the history?
3. Do you want a key for "back to the previous root" (for example Alt+Left in the Folder pane), or is the Recent list
   enough?
4. Folder size: count what the tree lists (the filter applies, so Known files changes the sizes) or always everything
   on disk under the folder? The plan assumes the tree's filter for Hidden only.
