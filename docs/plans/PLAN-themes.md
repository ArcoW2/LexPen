# Plan: themes (more than day and night, colours you can change)

Status: fully defined on 2026-10-19, not started; section 4 has nothing open.

## 1. What this is about

LexPen has two fixed colour schemes, day and night. You want more to choose from (light, dark, black / OLED,
greenish, yellowish, ...) and the colours changeable, also small ones such as the box around the current
find match (bright red on light, bright yellow on dark by default).

## 2. The solution, in brief

A theme is a small JSON file: a name, a base (light or dark) and colours. Only what differs from its base
is listed, as in keys.json. LexPen ships Light, Dark, Black, Greenish, Bluish, Reddish and Yellowish; your own
themes (or changed copies of the shipped ones) go in `%LOCALAPPDATA%\LexPen\themes\`. The settings window
picks the theme for Windows' light mode and the one for its dark mode, and LexPen follows Windows (on by
default). Code colours come from the theme too, so a language pack needs no colours of its own. The preview
follows the same theme, or a theme of its own (for example a light preview next to a dark editor).

## 3. Details

### 3.1 A theme file

```jsonc
// themes\greenish.json
{
  "name": "Greenish",
  "base": "dark",            // light or dark: the starting colours, and what the rest of Windows sees
  "colors": {
    "bg": "#16231b", "fg": "#d6e8d9", "accent": "#5fd38d",
    "keyword": "#9be7b4", "string": "#e6d48a",
    "findBox": "#ffff00"
  }
}
```

- The colour names are today's theme colours (the CSS variables in app.css) without the dashes:
  backgrounds (`bg`, `bgSide`, `bgBar`, `bgCode`), text (`fg`, `fgDim`), `border`, `accent`, `hover`,
  `active`, `select`; code (`keyword`, `string`, `comment`, `number`, `title`, `attr`); the markdown alerts
  (`note`, `tip`, `important`, `warning`, `caution`); git and disk markers; find (`findHit`, `findCurrent`,
  `findCurrentFg`, `findBox`); the active pane line.
- A theme lists only what differs from its base. An unknown name or a value that is not a colour is reported
  (as the keys file does) and skipped; the rest of the theme still applies.
- `base` decides everything that only knows two flavours: the window title bar, diagrams (mermaid), math
  (KaTeX), the browser's own scrollbars and form controls.

### 3.2 Shipped themes

| Theme | Base | |
|---|---|---|
| Light | light | Today's day colours, unchanged; the default for Windows' light mode. |
| Dark | dark | Today's night colours, unchanged; the default for Windows' dark mode. |
| Black (OLED) | dark | Pure black backgrounds, slightly brighter text. |
| Greenish, Bluish, Reddish | dark | Dark backgrounds tinted green, blue or red, with matching accents. Also examples to copy from. |
| Yellowish | light | A warm, paper-like light theme. |

- The exact colours of the tinted themes are chosen while building, checked for readable contrast (text on
  background, code colours, the find box), and listed in section 5.
- Shipped themes are read-only in the app folder; a file with the same name in your themes folder replaces
  it, so you can change Dark without losing it at the next update.

### 3.3 Choosing

- Settings window, group General: "Theme for light mode" (default Light), "Theme for dark mode" (default
  Dark) and "Follow Windows" (on by default): LexPen switches with the Windows light / dark setting (Settings >
  Personalization > Colors), at once, also while running.
- With Follow Windows off, the toolbar's Day / night and View > Day / night switch between the two chosen
  themes, as today. LexPen does not look at the Windows mode at all: at start it uses the theme that was set
  last.
- With Follow Windows on, a change of the Windows mode switches LexPen at once, while it runs; no restart. The
  Day / night button still works: it switches to the other theme until Windows changes mode the next time,
  and then LexPen follows Windows again. Follow Windows stays on; at start LexPen takes the Windows mode (a manual switch is not kept across a restart).
- A theme file changed on disk (or a new one) applies at once, in every window, as keys.json does.
- Colours are changed by editing the theme file; colour pickers in the settings window can come later,
  writing the same file.

### 3.4 Editor, preview, code colours and language packs

- The preview uses a theme as well: its text, background, code blocks, tables and alerts take the theme's
  colours. Settings window, group Preview: "Theme for the preview": "Same as the app" (default: editor and
  preview look alike, and follow Windows together) or one fixed theme (for example Light next to a dark
  editor). Diagrams and math in the preview follow the base of the preview's theme.

- Token types (keyword, string, comment, number, ...) take their colour from the theme. A language pack gives
  no colours by default, so every language follows the theme.
- A pack may still give colours (PLAN-language-packs.md, the `colors` part), keyed by theme name, then by
  base: for the active theme the pack's entry with its name is used, else the entry for its base (`light` /
  `dark`), else the theme's own colour. Never "the first entry": light colours on a black theme would be
  unreadable.

### 3.5 Tests

- Unit tests: reading and merging a theme with its base, problems reported, a theme in the user folder
  replacing a shipped one.
- In-app script: each shipped theme applies its colours (find box among them), Day / night switches between
  the chosen two, a changed theme file applies at once, a dark-based theme gets the dark title bar and
  diagrams.

## 4. Open questions

None.

## 5. Resolved issues during execution

| # | Issue | Decision |
|---|---|---|
