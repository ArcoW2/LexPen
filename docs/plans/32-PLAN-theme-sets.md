# Plan: theme sets per project (a named combination of themes, colours and intensities)

Status: draft 2026-10-25, reworked 2026-10-25 on your decisions: the name; the set shown in the bottom bar; a
default set per virtual desktop and for the app, a project's own set always first; the look of settings.json is
the set "Default"; a change is stored at once in the set shown, no unsaved state; which set is used for what is
chosen in the Manage theme sets window, the quick select of the project's set kept in the
bars. Extended 2026-10-25: a settings window per main window (3.11, now in plan 31, which comes first); a
window moved to another desktop takes that desktop's default set unless its project
has its own (3.6). Not started; questions open.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

The look of LexPen is spread over many settings: the app, editor and preview themes per mode, the sneak
preview's theme, and the colours and intensities of highlights, guides and inline code. They are global: every
project looks the same. You want projects to look apart at a glance (a private project all reddish, a company
project all bluish), and to switch the whole look in one step.

## 2. The solution, in brief

A theme set is a named combination of those settings. Every window shows one: its project's own set, else the
default set of the virtual desktop it is on, else the app's default set. The look in settings.json is itself a
set, "Default", which cannot be renamed or deleted. The bottom bar and a bar at the bottom of the settings window
show the set in use and pick another for the project. A colour setting changed is stored at once in the set
shown, with a short message naming the set (and what else uses it) and an Undo; nothing is ever unsaved. The
Manage theme sets window makes, duplicates, renames and deletes sets, and chooses a set for this project, this
desktop or the app. Each main window gets a settings window of its own, so the settings of project B are never
shown in project A's.

## 3. Details

### 3.1 The name

Theme set (agreed). The bottom bar shows it as "Theme set: Company"; the window is Manage theme sets.

### 3.2 What a set holds

The settings that decide the look (names as in settings.json):

- Themes: `themeLight`, `themeDark`, `editorThemeLight`, `editorThemeDark`, `previewThemeLight`,
  `previewThemeDark`, `sneakTheme`.
- Colours and intensities: `highlightColour`, `highlightIntensity`, `previewHighlightColour`,
  `previewHighlightIntensity`, `inlineCodeIntensity`, `indentGuideColour`, `indentGuideIntensity`,
  `indentGuideCursorColour`, `indentGuideCursorIntensity`, `columnGuideColour`, `columnGuideIntensity`,
  `helperLineIntensity`, `tabStopIntensity`.
- Not in it: the mode (Day / night, Follow Windows: that is about the time of day, not the project), fonts and
  sizes (open question 1), everything that is not about colour.

The list is one array in one place (host side), so a later colour setting is added once.

### 3.3 The set "Default"

- The values of 3.2's names in settings.json (with the shipped defaults under them, as now) are the set
  "Default". Nothing moves: a settings.json of today is the Default set, and LexPen without any other set looks
  and behaves as today.
- It is listed first everywhere, and can be chosen and edited like any set; it cannot be renamed or deleted.
- A change to it goes to settings.json, as a change of a setting does today.

### 3.4 Where the other sets are kept

- `theme-sets.json` in the data folder (next to settings.json, yours to copy to another PC):
  `{ "app": "Default", "desktops": { "<desktop id>": "Company" }, "sets": [ { "name": "Company", "values": {
  "themeDark": "dark-ocean", ... } } ] }`. A set holds every one of 3.2's names (a snapshot made when it is
  created), so using it is complete.
- `app`: the app's default set (3.5), "Default" when missing.
- A project names its set: `ProjectStore.Project.ThemeSet` (the set's name, or null for none), written as
  "themeSet".
- A set renamed: the projects, desktops and the app naming it follow. A set deleted: what named it falls back
  (a project to none, a desktop to none, the app to "Default").

### 3.5 Which set a window shows

1. Its project's own set, when it has one. A project's set always wins.
2. Else the default set of the virtual desktop the window is on (3.6), when that desktop has one.
3. Else the app's default set (`app`), which is "Default" unless you chose another.

- A new project has no set of its own: it shows the desktop's default, else the app's.
- The host builds the look (AppHost.Look) and the settings a page gets from settings.json with that set's values
  over them (for "Default": settings.json alone).
- Each main window shows its own set: two windows of two projects, or of two desktops, look different side by
  side. The settings window belongs to the main window it was opened from (3.11). The highlights window, the
  character picker and the projects window follow the window last worked in (AppHost.LastActive).

### 3.6 A default set per desktop

- Each Windows virtual desktop can name a default set, for the windows on it whose project has no set.
- A window moved to another desktop (Win+Tab, or Move to in the task view) follows 3.5 again on its new desktop:
  - Its project has a set of its own: nothing changes; the project's set always wins.
  - Else: it takes the new desktop's default set; the new desktop has none: the app's default set.
  - Moved back: the old desktop's default again. Nothing is stored for the move; the set is worked out from where
    the window is.
  - LexPen notices the move from its desktop timer (AppHost, already looking at the desktops of its windows now and
    then); the look follows then, not at the moment of the move.
  - Two windows of one project without a set of its own, on two desktops with different defaults, look
    different. That is intended: the desktop decides.
  - The window's settings window (3.11) shows the new set in its theme set bar; whether Windows moves an owned
    window along with its owner is to be checked by hand.
- The desktop id is the desktop's GUID, which LexPen already gets per window (VirtualDesktop.DesktopOf, the
  documented IVirtualDesktopManager) and keeps with each window's place.
- The desktops' names: the documented interface gives only the id of a window's desktop, not the list of desktops
  or their names. Windows keeps both in the registry (under
  HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops: the ids in order, and a name per
  desktop you renamed). That is not documented, so LexPen reads it only for showing names: when it fails, a
  desktop is named by its position ("Desktop 2") or, in the Manage list, shown only once a LexPen window has
  been on it (question 3).
- A desktop that is gone (removed, or another PC: the ids differ per PC): its entry stays, unused; the Manage
  window shows it as gone, with Remove.

### 3.7 A change is stored at once

- A change to one of 3.2's settings (in the settings window, or anywhere else that changes one) is stored at once in the set the window shows (3.5): in theme-sets.json, or in
  settings.json for "Default". It applies at once in every window showing that set.
- No unsaved state, no question, nothing to lose.
- The theme set bar (3.8) shows for a few moments: 'Theme set changes are stored to set "Company"'. When the set
  is used by more than the window's project, it says so, from the projects and desktops at that moment: 'Stored
  to set "Company" (also used by 2 other projects and this desktop's default)'. Then the bar shows the set again.
- With the message: Undo, which puts back the value the setting had before this change, in the same set. A
  following change gets its own message and Undo (question 4).
- To try something without changing a shared set: Manage theme sets > Duplicate, use the copy for this project,
  then change it.

### 3.8 The theme set bar in the settings window

Always at the bottom of the settings window, above its footer line (`.st-foot`), in the standard bar colour
(`--bg-bar`, as the settings window's top bar and footer), for the main window that settings window belongs to
(3.11).

- Shows the set in use and where it comes from: "Theme set: Company (this project's)", "Theme set: Company (this
  desktop's default)" or "Theme set: Default (the app's default)".
- A quick select of the project's set: "None (the desktop's or the app's default)", "Default", then every set.
  Picking one sets it for the project (and so every window of it) at once.
- "Manage theme sets..." opens the window of 3.10.
- For a few moments after a change: the message and Undo of 3.7, in place of the above.

### 3.9 The bottom bar

- A field "Theme set: Company" in the main window's bottom bar; its tooltip says where it comes from (as 3.8).
- A click opens a menu: the same choice of the project's set as 3.8 (a check at the one in use), a line,
  "Manage theme sets...".
- The same menu as Options > Theme set > (question 2).

### 3.10 The Manage theme sets window

Built as the projects window (one for the app, its place kept). A list of the sets, "Default" first, each with
its name, a few swatches (the app, editor and preview backgrounds of the current mode) and what uses it: the
projects, the desktops, the app.

- New: a set from the look shown now (the window last worked in); asks a name, not one that is taken.
- Duplicate, Rename (F2; not "Default"), Delete (asks, naming what uses it and what that falls back to; not
  "Default").
- Use the selected set for:
  - This project (the window last worked in), or other projects (checkboxes, or from the Manage projects
    window: a column "Theme set" and Project > Theme set >). Also "None" for a project: back to the defaults.
  - This desktop (the one the window last worked in is on). Also "No default for this desktop".
  - The app: the default for desktops without one, and so for new desktops.
- Desktops: a list of the desktops, each with its name and its default set (or none); gone ones with Remove.
- Edit a set: use it for this project and open the settings window; changes are stored in it (3.7).

### 3.11 A settings window per main window

Moved to plan 31 (`31-PLAN-settings-layers.md`, 3.6), which is done first: each main window has a settings window
of its own. This plan adds to it:

- The theme set bar (3.8) and where a change to one of 3.2's settings goes (3.7): the set of the owner window. Its
  look is the owner's set, not the last active window's.
- The row marks of plan 31 (3.7): 3.2's settings are the theme set layer; the tooltip names the set ("Theme set:
  Company (this project's)").
- Save as default (plan 31, 3.5) saves only the layout, at once. This plan turns it into a small dialog with two
  checkboxes, both on: "The layout of this window" (plan 31, as before) and "The theme set "Company" for new
  projects" (only when the window shows a set). The second, on, makes
  that set the app's default (`app`, 3.5), so a new project without a set of its own shows it. When the desktop
  of the window has a default set of its own, that one still wins for new projects there; the dialog then says
  so and offers "this desktop's default" instead. Nothing is copied: the set itself becomes the default.
- Reset to default (plan 31, 3.5): the project's own set is removed as well, so the window shows the desktop's or
  the app's default again.

### 3.12 Host changes

- ThemeSetFile.cs: load / save theme-sets.json (`app`, `desktops`, `sets`), the list of 3.2's names, the
  "Default" set read from and written to settings.json, apply (a set's values over settings).
- AppHost: `SetOf(MainForm)` (3.5), `SettingsFor(MainForm)` and `Look(MainForm?)` with it; every place that sends
  settings or the look to a window uses them. A set changed, or what a project, a desktop or the app uses: the
  windows showing it get settings and look again. A window's desktop changing (the desktop timer): the same,
  when its set differs.
- The settings window: a change to one of 3.2's names goes to the set shown (3.7), with the message, the "also
  used by" from the projects and desktops, and Undo (the old value kept with the message); the theme set bar
  (3.8) and its ops (choose the project's set, manage).
- The settings windows per main window come from plan 31; the settings and look each gets are its owner's set.
- ProjectStore: `ThemeSet` per project, read and written.
- MainForm: ops `themeSets` (the menu), `themeSet` (choose for this project); the bottom bar field.
- The Manage theme sets window: a form and page as ProjectsForm / projects.html.

### 3.13 Tests

- ThemeSetFile: round trip; only 3.2's names kept; unknown theme ids reported as with settings; "Default" reads
  and writes settings.json and keeps every other setting there; "Default" cannot be renamed or deleted.
- The set of a window: the project's over the desktop's over the app's; a new project has none; a desktop without
  a default falls to the app's; `app` missing is "Default".
- A window moved to another desktop: without a project set it takes the new desktop's default (or the app's when
  that desktop has none); with a project set it keeps the project's; moved back, the old desktop's default.
- A change stored in the set shown, and only there (settings.json untouched for another set; theme-sets.json
  untouched for "Default"); Undo puts back the old value.
- "Also used by": counted from the projects and desktops naming the set, the window's own project left out.
- Rename and delete: projects, desktops and `app` follow or fall back.
- ProjectStore: `themeSet` round trip.
- Two settings windows (plan 31) of two projects with different sets: each shows and stores its owner's set.
- By hand: two windows of two projects with different sets side by side; a window moved to a desktop with a
  default; the bottom bar menu; the theme set bar with its message and Undo; the Manage window's Use for this
  project / this desktop / the app; Day / night with a set; the highlights window following the window last
  worked in; project A on desktop 1 and project B on desktop 2, Settings opened in both: each shows its own set,
  a colour change in B's lands in B's set, a non-colour setting changed in one shows in the other.

### 3.14 Open questions

1. Fonts and sizes in a set too, or colours and themes only (this plan)?
2. Options > Theme set > as well as the bottom bar, or only the bottom bar? Proposal: both, the same menu.
3. The desktop names come from an undocumented registry key. Fine to read it for names (falling back to
   "Desktop n"), or only list desktops by number and the LexPen windows on them? Proposal: read it, with the
   fallback.
4. Undo: only the last change, while its message shows (as written), or a list of the recent changes per set to
   undo one by one (also after the message is gone)? Proposal: the last change, while its message shows; the
   settings window's reset per setting (to the shipped default) stays as it is.
5. Save as default for the look (3.11): make this window's set the app's default (proposal: nothing is copied, and
   the set stays one set), or copy its values into the set "Default" (settings.json), as the earlier "Use as
   default" did?
