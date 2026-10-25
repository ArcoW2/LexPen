# Plan: theme sets per project (a named combination of themes, colours and intensities)

Status: draft 2026-10-25, decisions 2026-10-25 (the name; the bottom bar; changes apply at once, a bar in the
settings window saves them to a set; Use as default writes the look to settings.json, which new projects get;
the bar in the settings window always there, in the warning colour while changes are unsaved);
not started; questions open.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

The look of LexPen is spread over many settings: the app, editor and preview themes per mode, the sneak
preview's theme, and the colours and intensities of highlights, guides and inline code. They are global: every
project looks the same. You want projects to look apart at a glance (a private project all reddish, a company
project all bluish), and to switch the whole look in one step.

## 2. The solution, in brief

A theme set is a named snapshot of those settings. A project can name a set; its windows then show that set, a
project without one uses the global settings as today. The bottom bar shows the set of the window's project; a
click on it picks another set or opens the Manage theme sets window, which saves, renames, duplicates and deletes
sets. The settings window has a theme set bar at its bottom, always: it shows the set in use (or none), picks
another, and saves the current look to the current set, to another existing set or to a new one (a name), also
when no set is in use. A colour setting changed while a set is in use applies at once but is not yet in the set;
the bar then turns the warning colour until the changes are saved or undone. "Use as default" writes the current
look to settings.json: the look of projects without a set, which is what a new project gets.

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

### 3.3 Where sets are kept

- `theme-sets.json` in the data folder (next to settings.json, yours to copy to another PC): `{ "sets": [ {
  "name": "Company", "values": { "themeDark": "dark-ocean", ... } } ] }`. Only the names of 3.2; a set holds
  every one of them (a snapshot), so applying it is complete.
- A project names its set: `ProjectStore.Project.ThemeSet` (the set's name, or null), written as "themeSet".
- A set renamed: the projects naming it follow. A set deleted: its projects fall back to the global settings.

### 3.4 How a set applies

- The global settings stay what they are (settings.json). A set is a layer on top, per window: the host
  builds the look (AppHost.Look) and the settings a page gets from the global values with the set's values
  over them, and the unsaved changes (3.5) over those.
- Each main window shows the set of its own project: two windows of two projects look different side by
  side. The settings window, the highlights window, the character picker and the projects window follow the
  window last worked in (AppHost.LastActive).

### 3.5 The theme set bar in the settings window

Always at the bottom of the settings window, above its footer line (`.st-foot`), for the project of the window
last worked in (the one the settings window follows).

- Shows "Theme set: Company", or "Theme set: none (the default)" when the project has no set.
- Choose another: a list of "None (the default)" and every set; picking one sets it for the project at once.
- Save to 'Company': the current set (only when a set is in use).
- Save to another set: a list of the other sets; the project then uses that set.
- Save as new set: a name field (OK when the name is not taken); the project then uses the new set. With no set
  in use this is how the current settings become a set.
- Use as default (3.6), and Undo (the unsaved changes dropped, back to the set; question 3).

Its colour:

- Normally the standard bar colour (`--bg-bar`, as the settings window's top bar and footer).
- The warning colour while the project has unsaved changes, with the text "Changes not saved to theme set
  'Company'": a background mixed from the theme's `--warning` (now a text colour) and `--bg-bar`, so it works in
  every theme. Saved or undone: back to the standard colour.

What a change does:

- No set in use: the change goes to settings.json, as today; there is nothing unsaved, the bar stays in its
  standard colour (Save as new set still makes a set of it).
- A set in use: the change applies at once, in every window of that project, but it is not written to the set
  or to settings.json. It is kept as an unsaved change of the project (3.4's top layer), and the bar turns the
  warning colour.
- The changed settings are marked in the settings window (as a setting differing from its default is now), so
  you see what the bar is about.
- Saving to a set: every project using that set sees it at once.

### 3.6 Use as default

- Writes 3.2's settings, as the window last worked in shows them (its set and unsaved changes included), to
  settings.json: the global settings, the default look.
- Shown by every project without a set, and so by every new project (a new project starts without a set). This
  is how another set becomes the default for new projects: apply it, Use as default.
- The project itself keeps its set (and its unsaved changes are dropped: they are in settings.json now, and in
  no set).
- Only 3.2's names are written; the other settings in settings.json stay as they are. Asks first: "Use the look
  of 'Company' as the default? Projects without a theme set change with it."

### 3.7 The bottom bar

- A field "Theme set: Company" (or "Theme set: none") in the bottom bar, with a mark when the project has unsaved
  changes (3.5).
- A click opens a menu: "None (the settings)", then every set, a check at the one of this window's project;
  picking one sets it for this window's project (and so for every window of it) at once. Below a line: "Save
  current look as a set..." (asks a name), "Use as default" (3.6) and "Manage theme sets...".
- Switching sets with unsaved changes (here or on the theme set bar): asks first (save to the current set, drop
  them, Cancel) (question 3).
- The same menu as Options > Theme set > (question 4).

### 3.8 The Manage theme sets window

Built as the projects window (one for the app, its place kept). A list of the sets, each with its name, a few
swatches (the app, editor and preview backgrounds of the current mode) and the projects that use it. Actions:

- Save current look as... (a name; the values of the window last worked in, set and unsaved changes included).
- Use as default: the selected set's values to settings.json (3.6).
- Apply to this project (the window last worked in), and Apply to projects... (checkboxes, or from the
  Manage projects window: a column "Theme set" and Project > Theme set >).
- Rename (F2), Delete (asks; names the projects that use it), Duplicate.
- Edit a set: apply it to this project and open the settings window; its theme set bar (3.5) saves the
  changes.

### 3.9 Host changes

- ThemeSetFile.cs: load / save theme-sets.json, the list of 3.2's names, apply (values over settings).
- AppHost: `SettingsFor(MainForm)` and `Look(MainForm?)` with the window's project's set and unsaved changes;
  every place that sends settings or the look to a window uses them. A project's set or its changes changed:
  that project's windows get settings and look again.
- Use as default: 3.2's values written to settings.json, the other settings untouched.
- The settings window: a change to one of 3.2's names, with a set in use, goes to the project's unsaved changes
  instead of settings.json; the theme set bar of 3.5, always shown, its colour following the unsaved changes, and its ops (choose, save
  to set, save as new, save to other, use as default, undo).
- ProjectStore: `ThemeSet` per project, read and written; the unsaved changes per project (question 2).
- MainForm: ops `themeSets` (the menu), `themeSet` (choose for this project), `saveThemeSet`; the bottom bar
  field.

### 3.10 Tests

- ThemeSetFile: round trip; only 3.2's names kept; unknown theme ids reported as with settings.
- The settings a window gets: global values, the set on top, the unsaved changes on top of that; a project
  without a set gets the global ones; a deleted set falls back.
- A change with a set in use leaves settings.json and the set as they were; saving it writes the set only.
- Save as new set: a taken name refused; the project uses the new set afterwards.
- Use as default: settings.json gets 3.2's values of the set (and changes), keeps every other setting; a
  project without a set shows them; a new project has no set.
- ProjectStore: `themeSet` round trip; renaming a set renames it in the projects.
- By hand: two windows of two projects with different sets side by side; the bottom bar menu; the theme set bar in
  the settings window with each of its choices, with and without a set in use, its colour before and after a
  change; Day / night with a set; the highlights window following the window
  last worked in.

### 3.11 Open questions

1. Fonts and sizes in a set too, or colours and themes only (this plan)?
2. Unsaved changes when LexPen closes: kept with the project (they are there again next time, the bar too), or
   dropped (the set as saved)? Proposal: kept with the project.
3. Undo on the bar, and the question when switching sets with unsaved changes: wanted, or is saving the only
   way out (switching drops them unasked)? Proposal: both, as written in 3.5 and 3.7.
4. Options > Theme set > as well as the bottom bar, or only the bottom bar? Proposal: both, the same menu.
5. Use as default drops the project's unsaved changes after writing them to settings.json (the project still
   shows its set as saved). Or should the changes stay, unsaved, on the project? Proposal: dropped.
