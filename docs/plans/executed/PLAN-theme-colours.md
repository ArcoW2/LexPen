# Plan: a window that shows every colour of a theme

Status: executed (2026-11-08); see As built.

## 1. What this is about

A theme is a list of colour names (`bg`, `fgDim`, `occurrenceBox`, `guide3`, ...) with values, most of them
inherited from a base theme. There is no way to see them: what a name is used for is only in the code, and how
a colour looks is only visible where LexPen happens to use it. Making or checking a theme means guessing.

## 2. The solution, in brief

A new window, Tools > Theme colours...: one row per colour name, with its name, what it is used for, where its
value comes from (the theme itself or which base), its value (hex, rgb, hsl) and three samples: the colour as text, as a line and as a block. A list at the top picks any
theme; it changes only the sample part of the rows, including its background, so a colour is always seen on the
background of its own theme. Under the list an example shows every colour of the chosen theme where LexPen uses it,
named: a small LexPen with its bars, tabs, gutter and editor text (`This is a highlight`, a selection, find hits,
brackets, indent guides, language colours, ...), a folder list with git colours and a preview with its alerts. The
window itself stays in LexPen's current theme. What each colour is for is written once, in the page, and tests check
that every colour name has it and appears in the example.

## 3. Details

### 3.1 The window

- Like the Highlights window (HighlightsForm): one for the whole app, not modal, movable and resizable, its place
  kept (AppState). A page of its own (`web\themecolours.html`, `themecolours.js`).
- Opened from Tools > Theme colours... (an action `themeColours`, no key; a key can be set in keys.json).
- At the top: the theme list (the shipped themes and your own, as in Settings > Colours), the current theme chosen
  when the window opens.

### 3.2 A row

| Name | What it is for | From | Value | Text | Line | Block |
|---|---|---|---|---|---|---|

- **Name**: the colour name as in the theme files (`occurrenceBox`).
- **What it is for**: a short line (`The box around the occurrences of the word at the cursor`).
- **From**: where the value comes from: `this theme` when the chosen theme sets it, else the name of the base in its
  chain that does (`Dark`), or `LexPen's default` when no theme in the chain sets it (the fallback from app.css).
  Rows the theme sets itself stand out (the others dimmed), so making a theme on a base shows at once what it changes.
- **Value**: hex (`#ffee02`; with an alpha `#ffc40066`), `rgb(255, 238, 2)` / `rgba(...)`, `hsl(...)`. The text
  can be selected and copied.
- **Text**: a few words written in the colour, on the chosen theme's `bg`.
- **Line**: a horizontal line in the colour, on that `bg`.
- **Block**: a block filled with the colour, the theme's `fg` text on it; a colour with an alpha is shown over that
  `bg`, as LexPen draws it.
- The three sample cells are one area with the chosen theme's `bg` behind them, so a dark theme's light text is
  readable in a light LexPen and the other way round.
- Rows in the order and groups of the theme files: the app (backgrounds, text, borders, ...), then code (keyword,
  string, ...), with the group as a header row.

### 3.3 The example

- Under the list, the two parted by a divider that can be dragged (its place kept with the window). It shows the
  chosen theme only: its own background, all its colours, nothing of LexPen's current theme.
- A small LexPen drawn by the page itself (HTML and LexPen's own CSS classes where they fit; not a real editor), in
  which every colour is used where LexPen uses it and says its name:
  - **The window**: the menu bar and status bar (`bgBar`), a side panel (`bgSide`) with a folder list: files in the git
    colours (`gitModified`, `gitAdded`, `gitUntracked`, `gitDeleted`), a row under the mouse (`hover`) and the active
    one (`active`); tabs with the active one (`accent`) and the active pane's mark (`paneActive`); the formatting bar
    (`bgBarDim`, `barChanged`, `barRemoved`); the settings layer marks (`layerGlobal`, `layerWindow`, `layerSet`,
    `layerScreen`).
  - **The editor**: a gutter with line numbers (`fgDim`), a bookmark (`bookmarkFg`) and change markers; lines such as
    `This is a highlight` (`highlight`), `This is selected text` (`select`), `the word at the cursor, and the word
    again` (`occurrenceHit`, `occurrenceBox`), `a find hit and the current one` (`findHit`, `findCurrent`,
    `findCurrentFg`, `findBox`), matching and unmatched brackets (`bracketMatch`, `bracketNoMatch`), indent guides
    (`guide1` to `guide6`), visible whitespace (`whitespace`), an embedded block's gutter (`gutterBgEmbedded`), and a
    few lines of code in the language colours, each naming its own (`keyword`, `string`, `comment`, `number`,
    `title`, `attr`).
  - **The preview**: headings and text (`fg`, `border`), inline code (`inlineCode`, `inlineCodeFg`), a code block
    (`bgCode`) and the five alerts (`note`, `tip`, `important`, `warning`, `caution`).
- Every coloured part carries its colour name (`data-colour`), shown as a tooltip as well; the text of a part says
  the name where it reads naturally (`This is a highlight (highlight)`).

### 3.4 Where the colours come from

- The host already resolves each theme through its bases (ThemeFile.Load, Resolve) and completes it with the
  fallbacks from app.css (Complete). A host op returns that list: per theme its id, name and every colour name with
  its value and the id of the theme in the chain that set it (none: the fallback). Resolve already walks the chain
  nearest first, so it notes the setter where it takes a value. The page converts the values (hex, rgb, rgba, named) to the three notations.
- A change to a theme file (yours or shipped, in a debug build) refreshes the window, as the themes already do for
  the other windows.

### 3.5 What each colour is for

- Written in `themecolours.js`, one line per name, in the groups of 3.2. Only there; the README's list of names
  keeps pointing to the themes.
- A unit test: every colour name in light.json and dark.json has a line there, and there is no line for a name
  that is not a colour.

### 3.6 Tests

- The unit test of 3.5, and one that every colour name in light.json and dark.json is used in the example (its
  `data-colour` names).
- In the test copy: the window opens from Tools; picking Dark in a Light LexPen shows the samples on Dark's
  background and leaves the rest of the window light; a translucent colour (`hover`, `findHit`) shows its rgba and
  its hex with alpha; your own theme with a base shows the base's colours it does not set, From naming the base
  for those and `this theme` for its own; a theme two bases deep names the right one per colour; the example follows
  the theme list and stays in the chosen theme's colours only.
- A unit test of the host op: a theme on a base on a root gives each colour's setter.

## 4. Open questions

None.

## 5. As built

- **The window** (ThemeColoursForm, web\themecolours.html, .css, .js): one for the app, its place kept
  (AppState.ThemeColoursWindow), in the look of the window last worked in (as Manage theme sets); not dockable. Esc
  closes it. Tools > Theme colours... (action `themeColours`, no key).
- **Groups**: not the two of the theme files but finer ones, easier to read: backgrounds, text and lines; marks in
  the text; gutter, panes and bars; the preview; files in the Folder pane (git); the settings window; code.
- **The descriptions and the example** are in `web\themecolourlist.js`, a file without a page, so the tests load
  it under Jint (ThemeColoursTests). The example is drawn with classes of its own (`tx-...`, themecolours.css) on
  the chosen theme's variables, not with LexPen's own classes: those need the real layout around them.
- **Where a colour comes from**: ThemeFile.Theme has `From` (colour -> the id of the theme in the chain that set
  it), filled by Parse and Resolve; AppHost.ThemeColours sends every theme complete with its mode's fallback and
  its `From` (a colour not in it: LexPen's default). A value `var(--bg)` (the dark fallback of `bookmarkFg`) is shown
  as the colour it points to.
- **The divider**'s place is kept in the window's browser storage.
- Tested: the unit tests (every colour name described once, every one used in the example, the setter per colour
  two bases deep; 397 passed); in the test copy: a theme of mine on Dark ocean shows `bg` from this theme, `accent`
  from Dark ocean, `keyword` from Dark; `findHit` as `#ffc40066`, `rgba(255, 196, 0, 0.4)`, `hsla(...)`; Light
  parchment chosen in a dark LexPen: the samples and the example on its light background, the window dark.