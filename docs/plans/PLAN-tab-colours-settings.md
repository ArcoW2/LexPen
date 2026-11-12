# Plan: Tab colours as a tab of the settings window

Status: draft 2026-11-11, revised 2026-11-12; not started.

## 1. What this is about

Tab colours (rules that colour a tab by its file's name or path) exist only as `tab-colours.json` in the data folder.
Nothing in the settings window or the menus leads to it: you have to know the file exists, find the data folder, and
write the rules by hand in JSON. Tools > Theme colours shows the rules but cannot change them.

## 2. The solution, in brief

The settings window gets a tab "Tab colours": the rules as a list in their order (the first that fits wins), each
with its name, its patterns, and its day and night style, normal and active, picked with the same colour controls the
other settings use and shown as a sample tab. Rules can be added, removed, duplicated and moved. A test field says
which rule a file name or path gets. Every change is saved to `tab-colours.json` at once, so every window follows as
it does today when the file is saved.

## 3. Details

### 3.1 Where it lives

- A new group "Tab colours" in the settings window, after "Tabs" (settings.js builds a tab per group of
  `settings.defs`, actions.js). One def of a new kind `tabColours` that fills the whole group: a list, not one row
  per setting.
- It is not a setting of a layer (global, this window, theme set): the legend's layer marker for it says
  "tab-colours.json, every window". The settings search finds it by "tab colour", "colour", "match", "pattern".
- A link at its top: "open tab-colours.json" (the `openFile` case in SettingsForm.cs, extended with
  `file: 'tabColours'`; a missing file is written with the default rules, as TabColourFile.Read does).

### 3.2 A rule's row

- **Name**: a label for the rule ("Markdown", "C#"). Today the default file names its rules only in comments; the
  name becomes a field of the rule (`"name"`), ignored by the matching. A rule without one shows its patterns.
- **Match**: the wildcard patterns, `;` between them, as now (wildcardTest in app.js). **Regex**: optional, as now.
  A pattern that does not compile is marked on the field, with the message; the rule is not saved until it does.
- **Style**: two columns, Day and Night, each with Normal and Active. Per part: background, text colour, bold,
  italic, underline, size (-3 to +3), and for Active the line on top. Every field can be left empty ("as the rule
  below / LexPen's default"), as the file allows today. The colour fields are the existing `colour` control: a
  picked `#rrggbb`, or a colour of the app theme (`theme:accent`, the format of PLAN-macro-names-and-tabs.md 3.4),
  chosen from a list of the theme's colour names, the sample in the current theme's colour beside each.
- **Sample**: per column a tab drawn with that style, normal and active, on that mode's tab bar background (the
  drawing of themecolours.js tabHtml, reused).
- Row buttons: up, down, duplicate, remove. Under the list: Add rule (added above the last rule when that one is the
  catch-all `*`, so it still fits first).
- Off: a rule can be switched off (`"off": true`) without removing it. This replaces the commented-out examples of
  the default file.

### 3.3 Test field

- A field above the list: a file name or full path. The rule that fits is marked in the list and its sample shown
  beside the field. Empty field: nothing marked.
- It uses the same matching as the tabs (applyTabStyle / wildcardTest), moved where both the main page and the
  settings page can load it, so the test cannot drift from what the tabs do.

### 3.4 Saving

- A change is saved at once, as the other settings are (no Save button). Typing in a pattern field is saved when the
  field rests or loses the focus.
- The settings page sends the whole list to the host (`tabColoursSet`); the host writes `tab-colours.json`
  (TabColourFile gets a Write). The watcher in AppHost already sends the new text to every main window and to the
  Theme colours panel, so nothing new is needed there. The settings page also listens to that event, so a hand edit
  of the file while the window is open shows up.
- The file is written as JSON with the format description as the header comment (the one at the top of the default
  file), one rule per line group, the way the default file is laid out.
- A file that cannot be read (bad JSON written by hand): the tab shows the message and the "open tab-colours.json"
  link, no list, so nothing overwrites the user's file.

### 3.5 What does not work, and why

- **Keeping the user's comments**: the file is rewritten from the list, so comments typed into it by hand are lost
  the first time the tab changes it. The rule name and the off switch carry what the comments in the default file
  carry. See open question 1.
- **Rules as settings.json entries**: the settings layers (global, window, theme set) do not fit an ordered list of
  rules, and the file and its watcher already serve every window. Kept as its own file.

### 3.6 Tests

- TabColourFileTests.cs: Write then Read gives the same rules; the header comment is there; a rule's name and off
  survive; an unreadable file is not overwritten.
- The matching moved (3.3): the existing tab colouring unchanged on the default rules (a `.md`, a `.cs`, a draft
  `edit1`, a path rule); an `"off"` rule is skipped.
- By hand: change a colour in the tab, every open window's tabs follow; move a rule above another, the tab that fits
  both changes; the test field marks the rule a tab shows; edit the file by hand while the tab is open, the tab
  follows.

## 4. Open questions

1. Comments typed by hand into `tab-colours.json` are lost once the settings tab writes it. Acceptable (the name and
   off fields replace them), or should the tab only write when the file has no comments of the user's, and otherwise
   ask first?
2. A tab's right-click menu: add "Tab colour..." that opens this settings tab with the rule that fits that tab
   marked (or a new rule for its file type when only the catch-all fits)? Not part of the request; it is the shortest
   way from a tab to its colour.
