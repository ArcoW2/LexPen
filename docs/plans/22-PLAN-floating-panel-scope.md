# Plan: Whose is a floating panel

Status: draft 2026-11-02, not started.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

A floating panel is either LexPen's (one for all windows: Characters, the Outline) or a window's (one per window:
Messages, Macros, Clipboards, ...). Nothing on screen tells which, and two things go wrong:

- A panel of LexPen keeps the look (theme set, day / night) of a window that was just closed, while another LexPen
  window is still open. Seen with Characters.
- The active clipboard is one for LexPen: every window's Clipboards panel reacts when a clipboard is chosen in any
  window. Each window should have its own active clipboard; the clipboards' contents stay shared.

## 2. The solution, in brief

Every panel has a fixed scope: LexPen's (at most one floating window, following the window worked in last, in that
window's look) or a window's (one floating window per LexPen window, in its own window's look). Every floating
panel gets a bottom bar that says whose it is: at the far left the project (its window's, or *All projects* for a
panel of LexPen), next to it the document it works on (or *All documents* when it does not work on one). A window
that closes passes LexPen's panels on to the next window, look included. The active clipboard becomes per window.

## 3. Details

### 3.1 The scope of each panel

| Panel | Scope | Why |
|---|---|---|
| Characters | LexPen | One picker; inserts in the window worked in last (plan 15). |
| Outline | LexPen | One floating outline serving the window worked in last (plan 24, 7.3). |
| Highlights | LexPen | One window for all files' highlights. |
| Manage projects | LexPen | The projects are LexPen's. |
| Theme sets | LexPen | The sets are LexPen's. |
| Folder | window | Its window's root. |
| Search | window | Its window's search and results. |
| Bookmarks | window | Its window's documents. |
| Step by step | window | The macro running in its window. |
| Messages | window | Its window's messages. |
| Macros | window | Plays and records in its window. |
| Clipboards | window | Shows and sets its window's active clipboard (3.4); the contents are shared. |
| Settings | window | Already one per window (its window's layer). |

The table is the rule for a new panel too: it gets a scope when it is added. Docked, every panel is its window's
anyway.

### 3.2 The look

- A window's panel has its window's look, always (as now).
- A panel of LexPen has the look of the window worked in last (as now), and the window it follows can change without
  a window being activated: when a window closes, LexPen's panels get the look of the next window (the one used last
  of those still open) at once. Today that waits until another LexPen window is activated, which does not happen
  when the focus goes to the floating panel itself or to another program. In the host: the closing window updates
  the tool windows' look (SendToolLook) once it is out of the list.
- The floating outline is moved on as now (OutlineHeir); its look follows the window it serves.

### 3.3 The bottom bar of a floating panel

- Every floating panel's window gets a thin bar at its bottom, in the panel's look, as the main window's bottom bar,
  with two parts:
  - At the far left, the project: a window's panel its window's project, without a number when the project has one
    window (`BankConnect`), with the window's number when it has more (`BankConnect [2]`). A panel of LexPen that
    serves the window worked in last (the Outline, Characters) says *All projects - current project* (in italics),
    then that window's project as a window's panel names it (`BankConnect`, `BankConnect [2]`): it says which project
    it serves now, and that it serves whichever window gets the focus next. The other panels of LexPen: *All
    projects* (in italics).
  - Next to it, the document: the one the panel works on now, or *All documents* (in italics) when it does not work
    on one document.

  | Panel | Project | Document |
  |---|---|---|
  | Outline (floating) | *All projects - current project* + the project of the window worked in last | the document it shows now: the active one of the window worked in last |
  | Characters | *All projects - current project* + the project, the same way | the document it inserts into now, the same way |
  | Highlights, Manage projects, Theme sets | *All projects* | *All documents* |
  | Folder, Search, Messages, Macros, Clipboards, Settings | its window's project | *All documents* |
  | Bookmarks (the window's), Step by step | its window's project | the document it works on |

- The Outline and Characters are the panels of LexPen that work on one document at a time: they follow the window
  worked in last, so their document part changes when another window (also of another project) is worked in.
- It follows a rename of the project, a window moved to another project, the [n] shifting, the active document, and
  (LexPen's) the window worked in last.
- A click on the bar brings the window it names to the front.
- The caption stays as it is (`Clipboards - LexPen`); the bar says whose.
- The windows of their own (Characters, Highlights, Manage projects, Theme sets, Settings) get the same bar as the
  pane windows (PaneForm), so all floating panels look alike.

### 3.4 The active clipboard per window

- Each window has its own active clipboard: choosing one (the menu, the bottom bar, the Clipboards panel, the keys)
  changes it for that window only. Copy, cut and paste in a window work on its active clipboard.
- The contents of clipboards 1 to 9 stay shared by all windows (one store, kept across restarts, as now): a copy to
  clipboard 3 in one window is there in clipboard 3 of every window, and every window's Clipboards panel shows the
  new text.
- A new window, and every window at start, begins with the Windows clipboard active (as LexPen does now).
- In the host: ClipboardStore keeps the texts; the active number moves to the window (its page's `clips.active`,
  told by the host per window). `clipSelect` changes only the asking window; a text set tells all windows (the
  previews), the active number only to its own.
- A macro that uses the clipboard uses its window's active one.

### 3.5 Tests

- In-app, two windows with different theme sets:
  - Characters floating, opened from window A, then B worked in, then B closed: Characters has A's look at once,
    without A being clicked.
  - Each floating panel's bottom bar: a window's panel names its project, without a number with one window of the
    project, with [n] with two; Characters and the Outline say *All projects - current project* and the project of
    the window worked in (with [n] the same way), changing with the window worked in, also to a window of another
    project.
  - Rename the project: the bar follows.
  - Clipboards: window A chooses clipboard 3, window B keeps the Windows clipboard; A's and B's Clipboards panels
    and bottom bars show each their own; a copy in A to 3 shows in B's panel as clipboard 3's text; paste in B
    pastes the Windows clipboard.
  - Messages and Macros floating in both windows: two windows, each in its window's look, each with its project in
    the bar.
- Unit: ClipboardStore without an active number (the texts only).

## 4. Open questions

None. Decided (2026-11-06): with one window of a project, only the project, no number; the Outline and Characters
say *All projects - current project* followed by the project they serve now (3.3).

## 5. As built

Not started.
