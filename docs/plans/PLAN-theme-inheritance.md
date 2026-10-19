# Plan: themes define their colours; any theme can be a base

## 1. The problem

The real colours of Light and Dark live in two CSS blocks in `wwwroot/app.css`, while `light.json` and
`dark.json` are empty shells. A theme file can only build on "light" or "dark" (those CSS blocks), never on another
theme. So:

- To see or change what a theme looks like, you read an obscure CSS file, not the theme.
- Bluish shows no code colours because they are not in its file and not in Dark's file either: they are in app.css.
- A "lighter bluish" must copy all of Bluish's colours instead of saying "Bluish, with these few changed".

## 2. The solution, in brief

`light.json` and `dark.json` hold every colour and are the real roots. Every other theme names any theme as its
`base` and lists only what it changes; the host follows the chain (lighter_bluish -> bluish -> dark) and gives
each window the complete set before it draws anything. app.css keeps its two blocks as they are, but only as
fallbacks for a colour nothing in the chain sets. A theme is not light or dark; the mode is. What needs light or
dark (title bar, scrollbars, diagrams) follows the mode that chose the theme.

## 3. Details

### 3.1 Theme files

```json
// dark.json: a root, complete (today's values from app.css)
{ "name": "Dark", "colors": { "bg": "#1e1f22", ..., "keyword": "#ff7b72", ... } }

// bluish.json: unchanged, except it now really inherits from dark.json
{ "name": "Bluish", "base": "dark", "colors": { "bg": "#161c27", ... } }

// lighter_bluish.json (yours)
{ "name": "Lighter bluish", "base": "bluish", "colors": { "bg": "#1d2533" } }
```

- `base`: the id (file name) of any theme, shipped or yours. Optional; without it the theme builds on the
  app.css fallback only.
- Colours: own value, else the base's (recursively), else the app.css fallback.
- No restrictions on the chain: a light theme built on a dark one is allowed (odd, but nothing breaks).
- Existing files with `"base": "dark"` or `"base": "light"` keep working: they now name the Dark / Light theme.
- Your file with the same name as a shipped one still replaces it, and so becomes the base of every theme that
  names it: your own `dark.json` re-colours Black, Bluish, Greenish and Reddish too. Intended.

### 3.2 Theme colours and language colours: the split

A theme has a fixed set of roles, and every theme has all of them (through the chain): the app roles (`bg`,
`fg`, `accent`, ...) and six code roles (`keyword`, `string`, `comment`, `number`, `title`, `attr`). The code
roles are a palette for code, nothing more; the theme knows nothing of languages or token types.

A language pack's token types are open-ended (`global`, `label`, anything) and its `tokens` map each type onto a
theme role (`theme: keyword`), another type (`like:`), a contrast step, a style. That mapping is the only link.
This plan does not change it; it only makes the role values visible in the theme files.

### 3.3 Light or dark: the mode, not the theme

A theme has no light or dark property. The settings already make the split: a theme for light mode and one for
dark mode. The theme in use was chosen by the current mode, so the mode is the answer wherever one is needed:

- the window title bar (dark caption or not);
- `color-scheme` (the browser's own scrollbars and form controls) and `--contrast-dir` (which way a pack's
  `contrast` goes);
- mermaid's theme, the tab colour rules (`tab-colours.json` has a light and a dark colour per rule);
- a pack's `byTheme: { light: ..., dark: ... }`;
- which app.css fallback block applies.

These are all things outside the theme's colours that have exactly two variants, so they need to be told one of
the two. Today they read the theme's base; after this plan they read the mode (`look.mode`, already sent).

For the preview with a theme of its own (`previewThemeLight` / `previewThemeDark`): the same rule, the slot
decides. The preview theme for light mode (say Yellowish next to a Light editor) is light; the one for dark mode
(say Bluish next to Black) is dark. Whatever you pick for a slot is used as that mode.

`byTheme` lookup becomes: the theme's own id, then each base id up the chain, then the mode. So
`byTheme: { bluish: ... }` also applies to Lighter bluish.

### 3.4 Resolving (host, `ThemeFile.cs`)

- Load all files as today, then resolve each chain into one full variable set. The fallback block used is the
  mode's, so the host resolves per mode (in practice: the theme in use, for the current mode).
- Problems reported, the theme still used where possible:
  - base not found: problem line, the theme builds on the fallback only.
  - a loop (a -> b -> a): problem line naming the loop, the themes in it build on the fallback only.
- The colour names: still the keys of the first app.css block (the light fallback).
- `Theme` record: `Base` becomes `BaseId`; `Vars` is the resolved, complete set. `AppHost.Base` goes; its
  users (title bar, first paint) use `Mode`.
- `Look()` sends the complete set, so a preview with its own theme (`.mm-themed`) gets it inline too.

### 3.5 No flash: colours before the first paint

- The host has the resolved theme before it navigates. It registers a script with
  `AddScriptToExecuteOnDocumentCreatedAsync` that sets the variables and `data-theme` on `<html>`; that runs
  before any page script or paint. `theme.js` and the `?theme=` URL parameter go.
- On a theme change the registered script is replaced (remove + add), so a reload also starts right; the running
  page follows through the `look` event as today.
- The window background and `DefaultBackgroundColor` (shown before WebView2 draws) become the theme's `bg`
  instead of the fixed `#1e1f22` / white.
- Same for the settings window.

### 3.6 app.css

Keeps both colour blocks with today's values, `color-scheme` and `--contrast-dir`. The header comment changes:
these are fallbacks; the themes are in `wwwroot\themes`.

### 3.7 Settings window

The theme lists show the base: `Lighter bluish (on Bluish, yours)`. Order: Light and Dark first, then by name.

### 3.8 Tests

- Unit (`ThemeFileTests`):
  - chain: own value wins, then base, then base's base, then fallback.
  - missing base and loop: the problem text, and the theme still loads.
  - a theme without a base, missing names: the fallback of the mode it is resolved for.
  - `light.json` and `dark.json` set every name, so a shipped theme never shows a fallback value.
  - the contrast test runs on the resolved sets: every shipped theme, through its chain.
- In-app (CDP):
  - a user theme on Bluish: its own colour, Bluish's and Dark's code colour on screen.
  - editing Bluish's file changes the child at once.
  - no flash: the first `look` event finds `--bg` already set on `<html>`.
  - t32-tokens still passes (code colours equal the variables).

### 3.9 Docs

README Themes section and the header comment of every theme file ("only what differs from its base; the base
may be any theme").

## 4. Open questions

None.
