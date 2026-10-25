# Plan: a theme for the editor of its own, and a reworked set of themes

Status: executed 2026-10-25 on the branch `plan30-themes` (draft 2026-10-25). Decisions of the run in section 4.

## 1. What this is about

From using Dark yellowish for the editor and Dark bluish for the preview:

- The app and the editor share one theme. Today there are two places: the app (bars, folder pane, outline, tabs
  AND the editor) and the preview. You want three: app, editor, preview.
- The yellowish themes are really parchment (old paper). A browner one (sand) is missing, and so are two quiet
  ones to put between the warm and the cool themes: Moonlight (dark, grey-blue) and Lichen (light, grey with a
  hint of blue and yellow). And a yellow-green pair: Pistachio, dark and light.
- The colour-named themes (bluish, greenish, reddish) deserve nicer names.
- The settings window is too narrow, and its lists cut their text off.
- The settings list says what a theme is built on ("Dark bluish (on Dark)"), not what it looks like.
- The file names are uneven (`bluish.json` is dark, `yellowish.json` is light).

## 2. The solution, in brief

Add a theme setting for the editor in light mode and one for dark mode, "Same as the app" by default, in the
Editor group. The editor pane gets that theme's colours the way the preview pane already does. A theme file
gets a `description`, its character, and the settings show "Dark sand: browner than parchment" instead of
"(on Dark)". Rename the themes to the names below, every tinted file to `dark-*` / `light-*`, and add Dark
sand, Light sand, Dark moonlight, Light lichen, Dark pistachio and Light pistachio, each built on Dark or Light with a full set of its own
colours. An old theme id in settings.json, in a theme's base or in a language pack's `byTheme` still finds
the new one. The settings window opens wider and its lists may grow wider.

## 3. Details

### 3.1 The set of themes after this plan

What the settings list shows is "Name: description". The list keeps its order: Light and Dark first, then by
name, so the Dark and Light ones stay together.

| Current name | Current file | New name | New file | Description (the character) |
|---|---|---|---|---|
| Light | `light` | Light | `light` | neutral white |
| Dark | `dark` | Dark | `dark` | neutral grey |
| Black (OLED) | `black` | Black (OLED) | `black` | pure black, brighter text |
| Dark bluish | `bluish` | Dark ocean | `dark-ocean` | blue tint |
| Dark greenish | `greenish` | Dark forest | `dark-forest` | green tint |
| Dark reddish | `reddish` | Dark wine | `dark-wine` | red tint |
| Dark yellowish | `dark-yellowish` | Dark parchment | `dark-parchment` | warm yellow, old paper at night |
| -- | -- | Dark sand | `dark-sand` | browner than parchment |
| -- | -- | Dark moonlight | `dark-moonlight` | grey-blue, quieter than ocean |
| -- | -- | Dark pistachio | `dark-pistachio` | yellow-green |
| Light bluish | `light-bluish` | Light sky | `light-sky` | cool blue |
| Light greenish | `light-greenish` | Light seafoam | `light-seafoam` | pale cool green |
| Light reddish | `light-reddish` | Light blossom | `light-blossom` | soft rose |
| Light yellowish | `yellowish` | Light parchment | `light-parchment` | warm, like old paper |
| -- | -- | Light sand | `light-sand` | browner than parchment |
| -- | -- | Light lichen | `light-lichen` | grey with a hint of blue and yellow |
| -- | -- | Light pistachio | `light-pistachio` | pale yellow-green |

Every shipped theme builds on Dark or Light (Black on Dark). `black` keeps its file name: it is not a tint,
and `dark-black` reads badly.

### 3.2 The description, and the settings list

- A theme file gets `"description": "browner than parchment"`, next to `"name"`. It replaces the character
  in the header comment of each shipped file (the comment keeps the line about bases).
- ThemeFile: `Parse` reads it (a string, optional; not a string is reported and skipped); the `Theme` record
  gets `Description`. `Look` sends it in the list of themes.
- `themeOptions` (web/actions.js): `Name: description`, or the name alone without one. "(yours)" stays for
  your own themes; the base ("on Dark") goes.
- README, Themes: the field described.

### 3.3 Renaming: old ids keep working

The ids in use: settings.json (`themeLight`, `themeDark`, `previewThemeLight/Dark`, `sneakTheme`), a user
theme's `"base"`, a language pack's `byTheme` keys, and a user theme file with a shipped name (which
replaces that one).

- ThemeFile gets one map of old id -> new id: `bluish -> dark-ocean`, `greenish -> dark-forest`,
  `reddish -> dark-wine`, `dark-yellowish -> dark-parchment`, `light-bluish -> light-sky`,
  `light-greenish -> light-seafoam`, `light-reddish -> light-blossom`, `yellowish -> light-parchment`.
- Used where an id is looked up: `AppHost.ThemeFor` / `Look` (settings), `ThemeFile.Resolve` (a base),
  the `byTheme` lookup in languages.js (the map goes to the page with the look).
- settings.json itself is not rewritten; the settings window writes the new id when you pick again.
- A user theme file with an old shipped name (say `yellowish.json`), meant to replace the shipped one, no
  longer does: it becomes a theme of its own. Not mapped: rare, and it still shows in the list. Mention in
  the README.
- The bin folders keep the old shipped files after a build (a copy does not delete). The release build should
  start from a clean `defaults\themes`; check the csproj copy step.

### 3.4 The new themes

Each lists every colour that differs from Dark / Light, including code colours where the tinted code
background needs a darker or lighter one (contrast 4.5:1, as the light themes note). Start values below,
chosen by hand, to be tuned on screen and checked for contrast.

Dark sand: browner and less yellow than Dark parchment.
`bg #221d18`, `bgSide #29231d`, `bgBar #2f2822`, `bgCode #2b251f`, `bgBarDim #1c1814`, `fg #eae0d4`,
`fgDim #a69888`, `border #463b31`, `accent #d09a5c`, `active rgba(208, 154, 92, .18)`, `select #5a4430`,
`highlight #8d8300`, `inlineCode #3d362f`, `inlineCodeFg #e3c39c`, `paneActive #d09a5c`.

Light sand: as Light parchment, browner.
`bg #f8f1e7`, `bgSide #f0e7da`, `bgBar #e9dece`, `bgCode #eee5d8`, `bgBarDim #e0d3c0`, `fg #2b2219`,
`fgDim #6c5d4c`, `border #d9c9b2`, `accent #8a5a2b`, `hover rgba(0, 0, 0, .06)`,
`active rgba(138, 90, 43, .13)`, `select #ead2b0`, `highlight #f2cf3a`, `inlineCode #ddd5ca`,
`inlineCodeFg #5c3c1c`, `paneActive #8a5a2b`; code `keyword #a8151f`, `title #6a36b8`.

Dark moonlight: grey-blue, quieter than Dark ocean.
`bg #1c1f24`, `bgSide #22262c`, `bgBar #282c33`, `bgCode #252930`, `bgBarDim #181b1f`, `fg #d9dee6`,
`fgDim #929aa6`, `border #363c46`, `accent #8fb0d8`, `active rgba(143, 176, 216, .18)`, `select #33465e`,
`highlight #686100`, `inlineCode #363a41`, `inlineCodeFg #b0c6e2`, `paneActive #8fb0d8`.

Light lichen: grey with a hint of blue and yellow (grey-green).
`bg #f3f4ee`, `bgSide #eaece4`, `bgBar #e1e4da`, `bgCode #e8eae2`, `bgBarDim #d6d9cd`, `fg #20231e`,
`fgDim #5d6359`, `border #cfd3c6`, `accent #4d6b5e`, `hover rgba(0, 0, 0, .06)`,
`active rgba(77, 107, 94, .13)`, `select #cfdccb`, `highlight #f2cf3a`, `inlineCode #d9dbd3`,
`inlineCodeFg #2f4a3f`, `paneActive #4d6b5e`; code `title #6a36b8`.

Dark pistachio: yellow-green, warmer than Dark forest.
`bg #1d2116`, `bgSide #23281b`, `bgBar #292f20`, `bgCode #262b1d`, `bgBarDim #181b12`, `fg #e2e8d2`,
`fgDim #9ea58c`, `border #3c4430`, `accent #b5cf6b`, `active rgba(181, 207, 107, .18)`, `select #4a5a2a`,
`highlight #6f6700`, `inlineCode #373c2f`, `inlineCodeFg #cfe09a`, `paneActive #b5cf6b`.

Light pistachio: pale yellow-green, warmer than Light seafoam.
`bg #f5f8ea`, `bgSide #ecf1dc`, `bgBar #e3ead0`, `bgCode #eaf0dd`, `bgBarDim #d8e0c2`, `fg #222817`,
`fgDim #5e6650`, `border #d2dbb9`, `accent #5b7a1e`, `hover rgba(0, 0, 0, .06)`,
`active rgba(91, 122, 30, .13)`, `select #dbe8b4`, `highlight #f2cf3a`, `inlineCode #dbdecf`,
`inlineCodeFg #3c5214`, `paneActive #5b7a1e`; code `title #6a36b8`.

The renamed themes keep their colours.

### 3.5 The editor theme: what exists

- `AppHost.Look` sends the app theme, the preview theme (or null) and the sneak theme (or null).
- `applyLook` (web/app.js) sets the app's vars on `:root` and the preview's on each `pane.previewEl`, with
  the class `mm-themed` and `data-theme` so the app.css fallback block of the mode applies inside it.
- `startSneak` already themes `pane.editorEl` on its own; `endSneak` clears it (= back to the app's). That
  path shows the CSS side works for the editor element.

### 3.6 The editor theme: changes

Host (AppHost.cs):
- `Look` adds `["editor"]`, from `editorThemeLight` / `editorThemeDark`; null when empty or unknown.
- The check for unknown theme ids in settings.json gets the two new names.

Settings, one place per part:
- General > Theme: `themeLight`, `themeDark` as now, titles become "Theme of the app in light / dark mode".
- Editor: `editorThemeLight`, `editorThemeDark`, kind choice, `[['', 'Same as the app'], ...themeOptions()]`.
- Preview: `previewThemeLight`, `previewThemeDark` as now.
- defaults\settings.json: both new ones empty, with a comment as the preview's.

Page (web/app.js):
- `applyLook`: per pane, the same as for the preview, on `pane.editorEl` with `look.editor`.
- `endSneak`: restore `look.editor` on the editor instead of clearing it.
- One helper `themePane(el, theme)` for preview, editor and the sneak restore, instead of a third copy of
  the same lines.
- The format bar and code bar sit inside `editorEl` and take the editor's theme.

### 3.7 Colour readers that look at the wrong element

Anything that reads a colour from `:root` / `body` but draws inside the editor shows the app's colour:

- `web/overview.js:60` reads `getComputedStyle(document.body)`: the editor's overview ruler. Must read the
  editor element.
- `web/ruler.js:269` reads `pane.rulerEl`: fine if the ruler sits inside `.mm-editor-pane`; check.
- `web/app.js:2911` (the probe of applyHighlight / applyInlineCode): check which element the probe sits in,
  and whether the editor needs its own result as the preview has.
- Language pack colours (`updatePackColours`): must resolve per element; check. `--contrast-dir` is covered
  by `.mm-themed[data-theme=...]`.

### 3.8 The settings window: wider, and wider lists

The theme lists ("Dark moonlight: grey-blue, quieter than ocean") and many other lists already do not fit.

- SettingsForm.cs:33: the default size is `Math.Min(780, owner.Width)` wide. Raise the 780; the owner's width
  stays the cap. Proposed 920, to judge on screen.
- web/settings.css:39: `.st-control select` is `min-width: 180px; max-width: 280px` and sizes to its longest
  option inside that range, whatever the window's width. Make it grow with the window instead: a width that
  is a share of the window, kept between a minimum and a maximum, e.g. `width: clamp(180px, 45vw, 640px)`.
  Narrow window: 180px as now; wide window: room for "Dark moonlight: grey-blue, quieter than ocean" and the
  long choices elsewhere. The share and the maximum are proposals, to judge on screen. The minimum and the
  maximum go times `--ui-scale` (decided: a larger app font needs wider lists).
- The text column (`.st-text`, flex 1, min-width 0) gives way first, so a wide list does not push the reset
  button out. Below the minimum the window's own minimum size (480) holds.
- A list wider than its box still shows its full text in the opened list; the closed box cuts it off. Add a
  `title` with the chosen option's text on the select, so a cut-off one can still be read on hover.

### 3.9 Also to update

- README, Themes: the list of names, the `description` field, the example (`"base": "bluish"` ->
  `"dark-ocean"`), the renaming note.
- defaults\languages\README.md: the `byTheme` example (`bluish`).
- The header comments of dark.json and light.json (they name the themes built on them).
- tests\LexPen.Tests\ThemeFileTests.cs: the chain test uses `bluish`.

### 3.10 Tests

- A theme's `description` is read; not a string is reported.
- Look carries `editor`: null when empty, null plus a settings problem when the id is unknown.
- An old id finds the new theme: in a setting, as a base, in `byTheme`.
- Every shipped theme file loads without problems.
- By hand: the settings list reads "Name: description"; app Dark moonlight, editor Dark parchment, preview
  Dark ocean; sneak preview in and out returns to the editor theme; Day / night switch; overview and column
  ruler colours inside the editor; the same in light with Light lichen / Light parchment / Light sky; the settings window opens wide enough for the theme lists.

## 4. Decisions of the run

- The list keeps sizing to its longest text (a short list stays small); only its maximum grows with the window:
  `max-width: clamp(180px, 45vw, 640px)`, each px times `--ui-scale`. The default window width is 920.
- Light lichen got the darker keyword red of the other tinted light themes: the contrast test measured the
  Light keyword on its code background below 4.5:1.
- The settings window shows a stored old id as the theme it is now (an extra entry with the new name); picking
  writes the new id.
- The editor gets the class `mm-themed` like the preview, so the fallback block and `--contrast-dir` of the mode
  apply inside it. The editor highlight colour (`--highlight-mark`) and the inline code box are measured from the
  editor's own background when it has a theme of its own; the overview ruler reads its colours from the editor.
- The compare's line strip (below the panes) stays in the app's theme.
- The old shipped files were removed from the bin folders by hand (a build copy does not delete); the csproj
  copy step is unchanged.
