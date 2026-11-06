# Plan: Whose is a floating panel

Status: draft 2026-11-02, not started.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

A floating panel is either LexPen's (one for all windows: Characters, the Outline) or a window's (one per window:
Messages, Macros, Clipboards, ...). Nothing on screen tells which, and things go wrong:

- A panel of LexPen keeps the look (theme set, day / night) of a window that was just closed, while another LexPen
  window is still open. Seen with Characters.
- Only the Outline really follows the window worked in. Highlights and Characters follow it half (no skipping a
  window with its own, never handed on); Folder, Search, Bookmarks, Messages, Macros and Clipboards do not follow at
  all: each window has a floating one of its own, so two windows mean two of them on screen.
- The active clipboard is one for LexPen: every window's Clipboards panel reacts when a clipboard is chosen in any
  window. Each window should have its own active clipboard; the clipboards' contents stay shared.

## 2. The solution, in brief

Nearly every floating panel follows the focus, as the Outline does now: one for LexPen, serving the window worked in
last that does not have that panel docked of its own, owned by that window, in its look, and handed on when that
window closes. Only what is tied to a window stays the window's: Step by step and Settings always; Macros while a
macro runs or records in its window, and Search while a search runs there (held, and its bottom bar says so). Manage projects and Theme sets stay LexPen's without following anything. Every
floating panel gets a bottom bar that says whose it is now. The active clipboard becomes per window.

## 3. Details

### 3.0 What the code does now (AppHost.cs, read 2026-11-06)

Three kinds. What sets a panel apart is where its floating window is made and what it works on:

- **Follows the focus** (one for LexPen, works on the window worked in last):
  - Outline: a PaneForm, the only one of LexPen (`FloatingOutline`). It serves only a window that wants it
    (`outlineWanted`: the window's own outline not docked, its active editor pane without an outline of its own). On
    activation it is re-owned to that window (`ServeOutline` -> `SetOwner`), and on closing it moves on (`OutlineHeir`).
  - Highlights: a form of its own (`highlightsWindow`). It shows the active document of the window worked in last
    (`HighlightsShown`: `from == LastActive`), always: it does not ask whether that window has Highlights docked of
    its own. It is never re-owned: its owner stays the window it was opened from.
  - Characters: a form of its own (`charPicker`). It hears the cursor of every window (`CharPickerCursor`) and inserts
    in the window worked in last; also not gated, never re-owned.
- **LexPen's, fixed** (one for LexPen, works on nothing of a window): Manage projects, Theme sets. Forms of their
  own; when their owner closes they are handed to the next window (`ReleaseOwned`).
- **A window's** (one per window, works on its own window only): every other PaneForm (`PaneWindow(owner, id)`, the
  owner fixed: Folder, Search, Bookmarks, Messages, Macros, Clipboards, Step by step), and Settings
  (`settingsWindows[w]`).

All three LexPen forms get the look of the window worked in last (`SendToolLook`); a PaneForm has its owner's.

Following the focus means three things, and only the Outline does all three today: gated (serves only a window that
does not have that panel docked of its own), re-owned to the window it serves (so it stays above that window and
survives the window it was opened from), and handed on when that window closes. The owner of Highlights and
Characters is never passed on: `ReleaseOwned` covers only Manage projects and Theme sets, so (by WinForms' owned
forms, not tested) closing the window they were opened from closes them too.

### 3.1 The scope of each panel

| Panel | Scope | Why |
|---|---|---|
| Outline | follows the focus | As now (plan 24, 7.3). |
| Highlights | follows the focus | The highlights of the document worked in. |
| Characters | follows the focus | Inserts in the window worked in (plan 15). |
| Folder | follows the focus | The root of the window worked in. |
| Search | follows the focus, held while a search runs | The search and results of the window worked in; held by its window while a search runs there (3.2). |
| Bookmarks | follows the focus | The bookmarks of the window worked in. |
| Messages | follows the focus | The messages of the window worked in. |
| Clipboards | follows the focus | Shows and sets the active clipboard of the window worked in (3.4); the contents are shared. |
| Macros | follows the focus, held while a macro runs or records | Plays and records in the window worked in; held by its window while a macro runs or records there (3.2). |
| Step by step | window | The macro stepping in its window. |
| Settings | window | Its window's layer of settings. |
| Manage projects | LexPen, fixed | The projects are LexPen's. |
| Theme sets | LexPen, fixed | The sets are LexPen's. |

The table is the rule for a new panel too: it gets a scope when it is added. Docked, every panel is its window's
anyway.

### 3.2 Following the focus

- One floating window per panel for LexPen. A window's layout still says the panel floats (as the Outline's does
  now): such a window wants it; the floating window serves the window worked in last that wants it (not one that has
  the panel docked, nor, for the Outline, Highlights and Characters, one whose active editor pane has its own beside it).
- Activated, a window that wants the panel takes it: the panel is re-owned to it, shows that window's content (the
  window's page sends it, as for the Outline: `outlineServe` / `outlineRelease`), and takes its look.
- A window that does not want it (it has its own docked): the floating one stays with the window it served.
- The window it serves closes: on to the window used last of those that want it, at once (also its look), else it
  closes with it.
- Closed by hand: closed for every window (as the Outline: every window hears `paneClosed`).
- In the host: the Outline's mechanism made per panel (`outlineWanted`, `ServeOutline`, `OutlineHeir`,
  `FloatingOutline` keyed by the panel's id). Highlights and Characters, forms of their own, are re-owned the same
  way (`Owner = w`).
- **Held by a window.** While a macro runs in a window (once, X times, step by step) or is recorded there, the
  floating Macros panel stays with that window; while a search runs in a window (Search: in its files, in a folder),
  the floating Search panel does. Another window activated does not take it. When the macro or recording ends, or
  the search is done or stopped, it goes to the window worked in last that wants it. The window's page tells the
  host when it holds and releases it. Held, its bottom bar says so at once (3.4), and again when it is let go.
- At start: windows whose layouts each have the same panel floating get one floating window, serving the active
  window; its place is the one kept for that panel (`SavePaneWindow`, as now by its kind).

### 3.3 The look

- A window's panel has its window's look, always (as now).
- A panel that follows the focus has the look of the window it serves, and changes at once when it moves on (also
  when a window closes and the focus goes to the floating panel itself or to another program).
- Manage projects and Theme sets: the look of the window worked in last, and of the next window at once when that
  one closes. In the host: the closing window updates the tool windows' look (SendToolLook) once it is out of the
  list.

### 3.4 The bottom bar of a floating panel

- Every floating panel's window gets a thin bar at its bottom, in the panel's look, as the main window's bottom bar,
  with two parts:
  - At the far left, the project. A window's panel: its window's project, without a number when the project has one
    window (`BankConnect`), with the window's number when it has more (`BankConnect [2]`). A panel that follows the
    focus: *All projects - current project* (in italics), then the project of the window it serves, named the same
    way (`BankConnect`, `BankConnect [2]`): which project it serves now, and that it serves whichever window gets the
    focus next. Held (Macros, Search): *Held - playing*, *Held - recording* or *Held - searching* (in italics),
    then its window's project named the same way: that it stays with this window, and why, until that is done.
    Manage projects and Theme sets: *All projects* (in italics).
  - Next to it, the document: the one the panel works on now, or *All documents* (in italics) when it does not work
    on one document.

  | Panel | Project | Document |
  |---|---|---|
  | Outline, Highlights, Characters | *All projects - current project* + the project served | the document it shows, or inserts into, now |
  | Bookmarks | *All projects - current project* + the project served | the document it works on |
  | Folder, Search, Messages, Clipboards, Macros | *All projects - current project* + the project served | *All documents* |
  | Macros, Search, held | *Held - playing / recording / searching* + its window's project | *All documents* |
  | Step by step | its window's project | the document it works on |
  | Settings | its window's project | *All documents* |
  | Manage projects, Theme sets | *All projects* | *All documents* |

- It follows a rename of the project, a window moved to another project, the [n] shifting, the active document, and
  the window it serves.
- A click on the bar brings the window it names to the front.
- The caption stays as it is (`Clipboards - LexPen`); the bar says whose.
- The windows of their own (Characters, Highlights, Manage projects, Theme sets, Settings) get the same bar as the
  pane windows (PaneForm), so all floating panels look alike.

### 3.5 The active clipboard per window

- Each window has its own active clipboard: choosing one (the menu, the bottom bar, the Clipboards panel, the keys)
  changes it for that window only. Copy, cut and paste in a window work on its active clipboard.
- The floating Clipboards panel shows and sets the active clipboard of the window it serves.
- The contents of clipboards 1 to 9 stay shared by all windows (one store, kept across restarts, as now): a copy to
  clipboard 3 in one window is there in clipboard 3 of every window.
- A new window, and every window at start, begins with the Windows clipboard active (as LexPen does now).
- In the host: ClipboardStore keeps the texts; the active number moves to the window (its page's `clips.active`,
  told by the host per window). `clipSelect` changes only the asking window; a text set tells all windows (the
  previews), the active number only to its own.
- A macro that uses the clipboard uses its window's active one.

### 3.6 Tests

- In-app, two windows A and B with different theme sets and projects:
  - Each panel that follows the focus, floating, opened from A; B worked in (the panel not docked in B): it shows
    B's content, stays above B, has B's look, its bar names B's project; A worked in: back to A.
  - The same with the panel docked in B: the floating one stays on A.
  - A closed while the floating one serves it: it stays open, on B, in B's look at once, without B being clicked.
  - Folder: B's root shows; Search: B's results, and a search started in the floating panel searches B's root.
  - Clipboards: A chooses clipboard 3, B keeps the Windows clipboard; the floating panel shows 3 on A and the Windows
    clipboard on B; a copy in A to 3 shows as clipboard 3's text on B; paste in B pastes the Windows clipboard.
  - Macros: a macro played X times in A, B activated: the panel stays on A, its bar *Held - playing* and A's
    project; the macro done: the bar back to *All projects - current project*, and B activated: it goes to B. The
    same stepping, and recording (*Held - recording*).
  - Search: a folder search running in A, B activated: the panel stays on A, its bar *Held - searching* and A's
    project; the search done (or stopped): the bar changes at once, and it follows the focus again.
  - Step by step and Settings floating in both windows: two of each, each in its window's look and project.
  - The bar: one window of a project: no number; two: [n]; rename the project: the bar follows.
  - Both windows' layouts with Folder floating, restart: one floating Folder, serving the active window.
- Unit: ClipboardStore without an active number (the texts only).

## 4. Open questions

None.

## 5. As built

Not started.
