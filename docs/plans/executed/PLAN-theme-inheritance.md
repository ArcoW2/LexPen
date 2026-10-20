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

## 5. Resolved during execution

| Thing | Solution implemented |
|---|---|
| 3.4 says `Vars` is the complete set, but the fallback depends on the mode, which is not known when the files load | `Vars` holds the colours through the chain (own, base, base's base); `ThemeFile.Complete(theme, fallback)` adds the mode's fallback. `Look()` and the first-paint script send that complete set. |
| `"base"` that is not text (a number, an object) | Reported ("must be the name of a theme file"); the theme loads without a base. |
| A theme whose base is part of a loop (c -> a, with a -> b -> a) | The loop members keep their own colours (3.4); c builds on what a has, so c = a's own colours + c's own. The loop is reported once. |
| 3.5: a script registered with `AddScriptToExecuteOnDocumentCreatedAsync` runs before `<html>` exists (found by t34: no colours after a reload) | The script sets the colours at once when `<html>` is there, else a MutationObserver sets them as `<html>` appears: a microtask, so still before the parser runs a page script and before any paint. Verified by t34 (DOMContentLoaded after a reload, no look event yet: mode and theme `bg` already set). |
| First paint also needs the Day / night label (it reads `data-mode`) | The first-paint script sets `data-theme` and `data-mode` (both the mode) besides the colours. |
| The window background when the theme's `bg` is not a plain colour | `bg` as `#rgb`, `#rrggbb`, `#rrggbbaa` or `rgb(a)()` is used (alpha left out); anything else keeps the old fixed colour of the mode. |
| `init` sent `theme = app.Base` (not read by the page) | Sends the mode now; `AppHost.Base` is gone. |
| The settings list label for Light and Dark (no base, shipped) | Just the name: `Light`. With a base: `Name (on Base)`, plus `yours` when yours. |
| Tests: the in-app checks could not run at first: Windows refused the clipboard to every process (OpenClipboard error 5, access denied; nothing held it), and LexPen reads the clipboard at start | Unit tests ran (125 passed). Once the clipboard was available again: t34 (16 checks) passed after the first-paint fix below; the in-app scripts t1 to t36 passed, without the t15 timing scripts (t28 and t31 moved from `.sql` to `.ddl`, which stayed SQL). |
