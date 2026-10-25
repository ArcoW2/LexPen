# Plan: settings layers: global, this window, theme set

Status: draft 2026-10-25, not started; questions open. From your agreement on the three layers: "Make a plan for
this split when it can be executed separately (before the other two)". It can: see 3.10 for the order with plans
32 and 33.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

What a LexPen window looks like is spread over places a user cannot see and that do not follow the project:

- settings.json, global: behaviour, but also what a window shows (`formatBar`, `ruler`, `lineNumbers`, `zoom`).
- The window's session in projects.json, per window: the folder, the tabs, each tab's mode, the hidden pane,
  scroll together.
- The page's localStorage, shared by every window (all windows use one WebView2 environment, so one
  localStorage): the sidebar on or off, Folder or Search in it, its width, the outline on or off and its width,
  the panes side by side or above each other, their sizes, the editor/preview share, the folder filter and sort.
  Whichever window wrote last decides what the next window opens with.

So the open panes are not per project, the view project of plan 33 cannot look different, and a user cannot
tell where a setting lives.

## 2. The solution, in brief

Every setting belongs to exactly one of three layers. Global: behaviour, in settings.json, as now. This window:
what is open and shown in a window, kept with its session in projects.json and so per project. Theme set (plan
32): colours and themes. The pane state now in localStorage, and the window-type settings now in settings.json,
move to the window layer; a new window copies the layout of the last window of its project, a new project starts
from the default layout. "Save as default" makes this window's layout the default in one step, "Reset to default"
goes back to it; with plan 32 the same step can make this window's theme set the default. The settings window
belongs to the window it was opened from, and every row carries a coloured line on its left that says which layer
it belongs to.

## 3. Details

### 3.1 The three layers

| Layer | What | Depends on | Kept in |
|---|---|---|---|
| Global | behaviour: find, files, cursor, tabs order, keys, fonts, ... | nothing | settings.json |
| This window | what is open and shown in the window | the window, so its project | the window's session, projects.json |
| Theme set | themes, colours, intensities | project, else desktop, else app (plan 32) | settings.json ("Default") / theme-sets.json |

- Mode (Day / night, Follow Windows) stays global: it picks the light or dark half of whatever theme applies.
- Until plan 32 is in, the theme set layer is simply global (settings.json); its rows are already marked as such
  (3.6), so plan 32 changes where they are stored, not what the user sees.
- The rule for a user: colours belong to the theme set, what is open belongs to the window, everything else is
  global.

### 3.2 What moves to "this window"

From localStorage (pane state, no settings row today):

- `sidebar` (on / off), `sideView` (Folder / Search), `sidebarWidth`.
- `outline` (on / off), `outlineWidth`.
- `orient` (panes side by side / above each other), `ratio` (the first pane's size), `editShare` (the editor /
  preview split).
- `searchScope`.
- `tree` (all files / markdown only), `sort`, `sortDesc`: the folder pane's filter and order (question 2).

From settings.json (settings rows today, toggled from the View menu):

- `formatBar`, `ruler`, `lineNumbers`, `zoom`.
- Borderline, proposed to stay global: `wrap`, `tabBar`, `lineNumberCount`, the gutter columns, the scroll bar
  marks, `previewWrap` (question 1).

Stays where it is:

- localStorage: `outlineFolded.<language>` (per language, not per window), `settingsTab` (the settings window's own
  tab).
- The session's present contents (folder, tabs, modes, hidden pane, scroll together): already per window.

The rule for a setting later added: is it about what this window shows, switched from the View menu, and would
you want it different in another project (the view project)? Then this window; else global.

### 3.3 Where it is kept

- The session gets a `layout` object: `{ "sidebar": true, "sideView": "folder", "sidebarWidth": ..., "outline":
  false, "formatBar": true, ... }`. It is written with the session, as now (the page's `session` request).
- The page reads a layout name from its own layout; a name missing there from `defaultLayout` (3.5).
- `setting(name)` in the page keeps working for the moved settings: for a layout name it answers from the window's
  layout. `setSetting(name)` for a layout name changes the window's layout and saves the session; it does not go
  to settings.json. So the menus, the actions and the keys stay as they are.
- The list of layout names is one array in one place (page side, next to the setting definitions), so a later one
  is added once.

### 3.4 A new window, a new project, and the first start after this change

- A new window of a project takes the layout of the last window used of that project. So a view project keeps its
  own layout; the reset of plan 33 gives it its view layout once.
- A new project (and so its first window) takes the default layout (3.5), not the layout of whatever window was
  used last.
- The first start after this change: `defaultLayout` (3.5) is made from the values of today, from localStorage and
  settings.json. Every saved session without a `layout` takes it. So nothing changes on screen the first time.
- settings.json: the moved names are no longer written; their values went into `defaultLayout`. They are left in
  the file, unread after that first start (question 3).
- localStorage: the moved keys are read once for `defaultLayout`, then no longer written. Removing them is a later
  clean-up, not part of this plan.

### 3.5 The default layout

There is no project "Default" to edit (the "Default" of plan 32 is a theme set, not a project). The default is a
layout of its own, kept global:

- `defaultLayout` in settings.json: the same object as a session's `layout` (3.3). It is the global layer's copy
  of the window layer: the layout a new project starts with.
- Save as default: this window's layout becomes `defaultLayout`. One step, from the window you have just set up;
  no switching to another project and back.
- Reset to default: this window's layout becomes `defaultLayout` again. Its tabs and folder are not touched.
- Where: View > Layout > Save as default / Reset to default; and in the settings window, a bar at the bottom for
  the window it belongs to: "This window's layout: Save as default, Reset to default" (the "this window" colour
  of 3.7 on its left).
- Save as default replaces the default without a question, with a short message in the bar and Undo (the old
  default kept with the message), as plan 32's changes to a set.
- With plan 32: Save as default asks what to save, in one small dialog with two checkboxes, both on:
  - "The layout of this window" (this plan).
  - "The theme set "Company" for new projects" (plan 32): only when the window shows a set.
  Reset to default the same: the layout, and the project's own set removed (so it shows the desktop's or the
  app's default).
- Not part of this plan: more named layouts (a "View" layout, a "Review" layout) to choose from, as theme sets.
  Plan 33's view layout is a fixed one; named layouts can come later if one default is not enough (question 7).

### 3.6 A settings window per main window

Moved here from plan 32 (its 3.11), because a "this window" setting needs to know which window. Plan 32 then
only adds the theme set to it.

- Each main window has at most one settings window of its own, owned by it (`Show(owner)`): it stays on that
  window's desktop, minimises with it and closes with it.
- Options > Settings in a window that already has one brings that one to the front; in a window without one, opens
  a new one. Two windows can each have a settings window open at the same time.
- The caption names the window: "Settings - LexPen - <project name> [n]", as the main window's caption.
- A "this window" row shows the owner's value; a change goes to the owner window, which applies it and saves its
  session. When the owner changes it itself (the View menu, a key), its settings window follows.
- A global row: a change goes to settings.json and shows at once in every main window and every open settings
  window, as now.
- Requests from the page that act on "the" main window (showCommands, the keys file) go to the owner, not to
  AppHost.LastActive.
- The last main window closing closes every settings window, as now.

The defect this also fixes: Settings asked for in project B on another virtual desktop brings up the one settings
window opened from project A.

### 3.7 Each row shows its layer

- Every row in the settings window has a coloured line on its left, one colour per layer: global, this window,
  theme set. The colours are theme tokens (`--layer-global`, `--layer-window`, `--layer-set`), set by each theme
  as its other colours, so they read in light and dark.
- Colour is not the only sign: the line's tooltip names the layer ("This window: Company [2]", "Theme set:
  Default", "Global: every window"), and a legend at the top of the settings window shows the three colours with
  their names. The legend's items filter the rows to one layer (a click; again for all).
- A group whose rows all belong to one layer: the line runs along the whole group.
- The View menu items for "this window" settings: no mark (the menu is the window's anyway); question 4.

### 3.8 Host changes

- AppHost: settings windows per owner (in place of the one `settingsWindow`); OpenSettings brings the owner's to
  the front or makes one; the posts that go to `settingsWindow` now (settings, look, defs, languages, theme) go to
  each open one. The layout of a new window (3.4) from ProjectStore, of a new project from `defaultLayout`. A
  window's layout change passed to its settings window, and a settings window's layout change to its owner. Save
  as default and Reset to default (3.5), with the message and Undo.
- SettingsForm: keeps its owner; ToWindow to the owner.
- ProjectStore: nothing new to store (the layout is inside the session); a helper for "the layout of the last window
  used of this project, else of any project", pure, so it can be tested.
- SettingsFile: the moved names no longer written; `defaultLayout` read and written; made once from the old values
  (3.4).
- Page (app.js, actions.js): the layout names, `setting` / `setSetting` for them, the layout in `sessionData` and
  `restore`, the fallback from localStorage and settings.
- Settings page (settings.js, settings.html): the layer per row from the definitions (a `layer` on each, default
  global), the line, the tooltip, the legend and its filter; a layout row's value from and to the owner; the
  layout bar (3.5).

### 3.9 Tests

- ProjectStore: a session's `layout` round trip; the layout of a new window from the last window of the project;
  a new project from `defaultLayout`.
- SettingsFile: `defaultLayout` made once from the moved names (and the localStorage values passed in), then the
  moved names not written; `defaultLayout` round trip; every other setting written as before.
- Save as default / Reset to default: the window's layout to and from `defaultLayout`, tabs and folder untouched;
  Undo puts back the old default.
- The settings windows: asked twice from one window gives one; from two windows gives two; closing a main window
  closes its settings window.
- By hand: two projects, the outline on in one and off in the other, both kept after a restart; the format bar off
  in one window only; a new window of a project opening with that project's layout; the first start after the
  change looks as before; a layout row changed in the settings window and from the View menu, each following the
  other; the coloured lines, tooltips and legend filter in light and dark; Settings opened in two projects on two
  desktops, each its own; a window set up and saved as default, then a new project opening so; Reset to default
  in another project.

### 3.10 Order with plans 32 and 33

- This plan first; it needs neither of the others.
- Plan 33 (view project) needs this plan: "Reset to view layout" writes the window's layout, which only exists
  per window after this. Its look per project needs plan 32, but works without it (the global colours).
- Plan 32 (theme sets) needs this plan's settings window per main window (3.6), adds the theme set layer to the
  row marks (3.7) and the theme set to Save as default (3.5); otherwise it is independent of plan 33.
- So: 31, then 32 and 33 in either order. Doing 31 and 32 at once gains nothing: they touch the settings window
  in different places, and 31 alone is already useful (panes per project).

## 4. Open questions

1. The borderline settings (`wrap`, `tabBar`, `lineNumberCount`, the gutter columns, the scroll bar marks,
   `previewWrap`): global (proposal), or this window? Each one you want different in the view project belongs to
   this window.
2. The folder pane's filter and sort (`tree`, `sort`, `sortDesc`): this window (proposal: a docs project shows
   markdown only, another all files), or global as a preference?
3. settings.json: leave the moved names in the file, unread after the first start (proposal), or remove them then?
4. The View menu: mark the items that belong to this window, or not (proposal: not; the settings window says it)?
5. The layer colours: one fixed set for every theme, or per theme (proposal: per theme, with defaults in the base
   theme, so every theme has them without a change)?
6. A settings window per main window (3.6), or one per project (shared by that project's windows)? Proposal: per
   main window; it is owned by that window, so it stays on its desktop, and two windows of one project show the
   same layout and set only when they are alike anyway.
7. One default layout (this plan), or named layouts to choose from as with theme sets (a "View", a "Review")?
   Proposal: one default now; plan 33's view layout fixed; named layouts only when one default proves too few.
8. Save as default: replace at once with Undo (proposal, as plan 32's set changes), or ask first?
