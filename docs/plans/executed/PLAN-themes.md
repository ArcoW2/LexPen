# Plan: themes (more than day and night, colours you can change)

Status: executed on 2026-10-19 on the branch `themes`. Decisions of the run are in section 5.

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
| 1 | How a theme reaches the page: the colours were two fixed blocks in app.css chosen by data-theme. | The blocks stay as the bases (light, dark); a theme sets only its own colours as inline CSS variables on the page (AppHost.Look decides which theme, the page applies it). A preview with a theme of its own gets the class mm-themed with the block of its base and its own variables; the blocks in app.css also apply to that class. |
| 2 | Where the colour names come from. | From the first block after the Themes header in app.css (the light base): its CSS variables without the dashes, the code colours without hl- (--bg-side is bgSide, --hl-keyword is keyword). One list, no copy in C#; a unit test checks the names it finds. The list is in the README. |
| 3 | Who decides light or dark, and the active theme. | The host (AppHost.Mode and Look): Follow Windows reads AppsUseLightTheme in the registry and listens to Windows' colour changes (SystemEvents.UserPreferenceChanged); a Day / night switch while following is kept in the host for all windows until Windows changes mode. The title bars follow the base of the active theme, so a light-based theme chosen for dark mode gets a light title bar. |
| 4 | The setting "theme" (Day / night) already existed. | It stays: the mode when not following Windows. New: followWindows (on), themeLight (light), themeDark (dark), previewTheme ("": the app's). An existing "theme": "dark" keeps working once Follow Windows is switched off. |
| 5 | Contrast of the shipped themes. | Checked by a unit test with the WCAG contrast ratio: text 7:1 on the background and the side panel, dim text and code colours 4.5:1 on the background and code blocks, comments, the accent and the find box 3:1. Comments get 3:1 because today's Light (GitHub's colours) has them at 4.13:1 on code blocks, dimmed on purpose; Light stays unchanged as the plan says. Yellowish needed darker keyword, title and comment colours to pass. |
| 6 | The colours of the tinted themes (3.2: chosen while building). | Black: background #000000, text #e8e8ea. Greenish: #15201a / #d6e8d9, accent #5fd38d. Bluish: #161c27 / #d8e0ee, accent #6aa8ff. Reddish: #241618 / #eedadb, accent #ff7b86. Yellowish (light): #fbf6e6 / #2b2618, accent #8a5c00. Each also sets its side panel, bars, code background, border, selection and active pane line; code colours come from the base (Yellowish: three darker ones). The files are in wwwroot\themes. |
| 7 | A theme setting naming a theme that does not exist (a file removed or renamed). | The default theme of that mode is used and the settings window says so. |
| 8 | Your themes folder. | %LOCALAPPDATA%\LexPen\themes\ is created at start and watched: a theme edited, added or removed applies at once in every window and in the settings window's lists. |
| 9 | The settings window: where the theme rows go. | General > Theme (Follow Windows, Theme for light mode, Theme for dark mode, Day / night when not following Windows), Preview > Theme for the preview. Theme lists show light themes first, yours marked. |
| 10 | Tests. | Unit tests: 109 pass (ThemeFile: names, a theme, problems, yours replacing a shipped one, the shipped themes loading, their contrast). In-app script t25-themes: 21 checks, all pass: follow Windows by default (its mode read from the registry), each mode with a chosen theme, Day / night, a light preview next to a Black editor, your theme and a problem arriving at once, an edit of your theme, the settings window in your theme with its lists, Day / night while following. Not tested: Windows actually switching mode (that would switch the whole PC). The earlier scripts pass again (two expectations updated for the new rows). |
| 11 | Asked during the run: the preview needs a light and a dark variant too, as the app. | Settings `previewThemeLight` and `previewThemeDark` (both "": same as the app) replace the single preview theme; the one for the current mode applies. Checked in t25 (23 checks, all pass). |
| 12 | Asked during the run: what F3 does past the last match, and a message when nothing (more) is found. | Setting `findWrap` (Find group, also F1): "end" (default: stop, "No more matches below." / "above"), "around" (go on from the other end, "Went on from the top."), "origin" (go on, and stop when back at the first match of this search: "No more matches: back where the search started."; the next F3 starts a new round). F3 / Enter with no match at all: "Not found: text"; while typing only the bar says it. The editor and the preview share one function (pickMatch in find.js). In-app script t26: 13 checks, all pass. |
