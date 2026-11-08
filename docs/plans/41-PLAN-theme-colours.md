# Plan: a window that shows every colour of a theme

Status: draft 2026-11-08, revised 2026-11-08; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

A theme is a list of colour names (`bg`, `fgDim`, `occurrenceBox`, `guide3`, ...) with values, most of them
inherited from a base theme. There is no way to see them: what a name is used for is only in the code, and how
a colour looks is only visible where LexPen happens to use it. Making or checking a theme means guessing.

## 2. The solution, in brief

A new window, Tools > Theme colours...: one row per colour name, with its name, what it is used for, where its
value comes from (the theme itself or which base), its value (hex, rgb, hsl) and three samples: the colour as text, as a line and as a block. A list at the top picks any
theme; it changes only the sample part of the rows, including its background, so a colour is always seen on the
background of its own theme. The window itself stays in LexPen's current theme. What each colour is for is written
once, in the page, and a test checks that every colour name has it.

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

### 3.3 Where the colours come from

- The host already resolves each theme through its bases (ThemeFile.Load, Resolve) and completes it with the
  fallbacks from app.css (Complete). A host op returns that list: per theme its id, name and every colour name with
  its value and the id of the theme in the chain that set it (none: the fallback). Resolve already walks the chain
  nearest first, so it notes the setter where it takes a value. The page converts the values (hex, rgb, rgba, named) to the three notations.
- A change to a theme file (yours or shipped, in a debug build) refreshes the window, as the themes already do for
  the other windows.

### 3.4 What each colour is for

- Written in `themecolours.js`, one line per name, in the groups of 3.2. Only there; the README's list of names
  keeps pointing to the themes.
- A unit test: every colour name in light.json and dark.json has a line there, and there is no line for a name
  that is not a colour.

### 3.5 Tests

- The unit test of 3.4.
- In the test copy: the window opens from Tools; picking Dark in a Light LexPen shows the samples on Dark's
  background and leaves the rest of the window light; a translucent colour (`hover`, `findHit`) shows its rgba and
  its hex with alpha; your own theme with a base shows the base's colours it does not set, From naming the base
  for those and `this theme` for its own; a theme two bases deep names the right one per colour.
- A unit test of the host op: a theme on a base on a root gives each colour's setter.

## 4. Open questions

None.
