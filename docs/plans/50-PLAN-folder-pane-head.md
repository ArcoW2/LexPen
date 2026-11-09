# Plan: The Folder pane's head of drop-downs, with its recent roots

Status: draft 2026-11-09, revised 2026-11-09; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

Showing a file in the Folder pane (the arrows button at the left of a tab bar, executed/PLAN-show-in-folder-pane.md)
opens that file's folder as the pane's root when the file lies outside the open one. Getting back to the folder you
were working in means going through File > Recent folders: the history of roots exists, but not where the change
happened.

The pane's head line spends its room on the root folder's name, which the tree already shows in its row with the full
path under `..`. The sort, the filters and the sizes are buttons beside that name, and in a narrow pane they move into
one View menu (Filter, View, Order), so View holds things that are not view settings.

## 2. The solution, in brief

The head line loses the folder's name and gets, from the left: a Sort drop-down (its button shows the order and an up
or down arrow for the direction), a Filter drop-down (Known files, Hidden folders / files), a Recent button (an icon
only) with the recent folders, then View and Refresh. The recent folders are the history of roots: every root change
already goes into that list, so a click there goes back. View holds only what the rows show: the file size.

## 3. Details

### 3.1 Recent: the recent folders

- **The list there is**: File > Recent folders (menus.js recentItems('folders'), the action recent.list folders),
  shared by all windows. Every change of root goes into it already (app.js openFolder, noteOpened): Open folder, a
  favourite or recent folder, `..` (Alt+Up), Show the file in the folder pane, a folder made the root from its
  right-click menu. It holds only the paths, which is all a root is; nothing new is kept.
- **The button**: an icon only (a clock), tooltip "Recent folders". A click shows the same list as File > Recent
  folders, as a drop-down under the button: a click opens that folder as the root; an entry that no longer exists is
  dimmed and removed when chosen, as in the File menu. The current root is checked.
- No key of its own: the button and the File menu are enough.

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
- **View**: Size (each file's size after its name). Nothing else for now; it is where other things the rows show
  will go.
- **Refresh**: as now, at the right.

The folder's name leaves the head (the base row in the tree, its full path under `..`, stays: its right-click, the
favourite folders). The floating window's title stays "Folder: name". The head's narrow mode (fitHead, `mm-compact`,
the buttons moving into View) goes: the drop-downs are narrow enough to stay on one line. [not yet checked: the
narrowest dock width they must fit in.]

### 3.3 Where

- folder.html / folder-pane.js: the head's buttons and drop-downs (paneMenu, as View now); the Recent list asked of
  the window, which has it, and a choice sent back.
- app.js: folderHead (no title needed in the head; the recent folders for the list, or a message to ask for them), the
  choice opening the folder as the File menu's does.
- docs/features.md: the Folder pane's description.

### 3.4 Alternatives

- **A history of the pane's own** (each root with its open folders, cursor and scroll, to restore the tree as it
  was): more to keep for little gain; the recent folders already hold every root.
- **Back / Forward buttons** (as a browser): two more buttons, and several clicks to go back several roots; the list
  shows where each goes.

### 3.5 Tests

- In the test copy:
  - Open a folder; Show the file in the folder pane for a file outside it; the Recent button's list has the first
    folder, and choosing it makes it the root again.
  - A folder deleted on disk is dimmed in the list and removed when chosen.
  - The Sort button shows the order and the arrow; choosing the current order flips it; Up / Down; the tree follows.
  - The Filter button is marked while Known or Hidden is on, and its items toggle them.
  - View > Size as before.
  - The head at the narrowest dock width, and floating.

## 4. Open questions

None.
