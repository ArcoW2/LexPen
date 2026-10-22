# Plan: Indent guides

Status: executed 2026-10-21 (section 5). Your request; your answers of 2026-10-21 are worked in. The number in the
file name is the priority; rename to reorder.

## 1. What this is about

Nothing shows which lines belong to the same indentation level. In a long procedure the eye has to follow the
whitespace down to find where a block ends. Visual Studio and UltraEdit draw a vertical line from where a block's
indentation starts to where it ends.

## 2. The solution, in brief

A thin vertical line at each indent step of a line's indentation, so the lines of one indented run form a line
from the indent down to the unindent. A setting picks its colour: the theme's comment colour, a rainbow (one
colour per level, a set for day and a set for night), or off. A second setting highlights the guide of the block
the cursor is in, thin, in the colour of the find box (and the bracket underline).

## 3. Details

### 3.1 Where the lines go

- Per line, a guide at every indent step left of its text: indentation 6 with indent size 2 gives guides at
  columns 0, 2 and 4. The indent size is the language's (the setting, or the pack's `indentSize`); a tab counts
  as the tab size.
- So a run of lines indented deeper than the line above it shows a line from its first line to its last; the
  line where the indentation goes back has no guide at that column.
- Empty lines (and lines of only whitespace) take the guides of the lines around them: the smaller of the levels
  above and below, so a blank line inside a block does not break its line.
- A line inside a string or comment over lines (its indentation is not structure): drawn as any other line.
- By indentation, not by the formatter's structure: it works for every language, also without `format:`
  parameters, and shows what the text looks like, not what Format would make of it. Guides by a
  language's structure (its `format:` frames, `begin` to `end`) may come later.
- A wrapped line: the guides run down its whole height.

### 3.2 Colour

- Setting `indentGuides`: `comment` (the default; the theme's `comment` colour, thin and soft: lower opacity),
  `rainbow`, `off`.
- Rainbow: level 1, 2, 3, ... each its own colour, repeating after the last. Theme colours `guide1` to `guide6`:
  in dark.json light, pastel colours (they show on a dark background), in light.json darker ones; the other
  themes take them from their base and may change them.
- The editor only; not the preview's code blocks.

### 3.2a The guide at the cursor

- Setting `indentGuideCursor` (on / off): the guide of the block the cursor is in drawn in the find box's colour
  (`--find-box`, as the bracket underline and the find outline), still thin. Independent of `indentGuides`: with
  the guides off, only this one line shows.
- Which guide: on a line that opens an indent (the next line with text is indented further, as after `begin`),
  the guide of that indent, from the next line down: the cursor on `begin` shows the line of its block together
  with the bracket highlight of `begin` (your remark). Else the innermost one at the cursor's line, at the column
  one indent step left of that line's text (the level the line belongs to). On an empty line: the level it takes
  from its neighbours (3.1).
- Its extent: up and down from the cursor's line while the lines (empty ones included) are indented at least that
  far: from the indent to the unindent.
- Updated on every cursor move and change, after a moment (as the bracket highlight); only the lines of that run
  are drawn again.

### 3.3 How it is drawn

- In CodeMirror's `renderLine` (where tabs are drawn already, tabs.js): the line element gets a background of
  thin stripes at the guide columns (a CSS gradient per guide, or absolutely placed spans), measured in character
  widths. Only lines on screen are drawn, so a long file costs nothing extra.
- A monospaced editor font is assumed for the columns (as virtual space and the column guides of plan 10); with a
  proportional font the guides go at the width of the indentation's spaces, which is still right because
  indentation is spaces or tabs only.
- An empty line's guides depend on its neighbours: drawn again when a line above or below changes level
  (CodeMirror redraws changed lines; the blank lines next to them are marked dirty too).

### 3.4 Tests

In-app: guides at the right columns for indent size 2 and 4 and for tabs; a blank line inside a block keeps the
line; the line where the indentation goes back has no guide there; the three settings; the rainbow cycles; the
cursor's guide (on its own and over the others, its extent, an empty line, following the cursor); day and night
colours; a wrapped line; a change in indentation updates the blank lines around it. Unit tests: the new theme
colour names.

## 4. Open questions

None.

## 5. Resolved during execution

| Point | What was done |
|---|---|
| How it is drawn | Not in `renderLine` (3.3): a line class per number of guides (`mm-g1` ... `mm-g40`, from `web/guides.js`) and CSS gradients in `app.css`, at the indent step in `ch` (`--mm-step` on the editor). A class change does not rebuild the line, so an empty line follows its neighbours after an edit without a redraw of the text, and a font size change needs nothing. Only the lines in view (and 20 around them) get their class, after scrolling, a change or a cursor move (40 ms later). |
| The cursor's guide | A line class `mm-guide-cur` on the lines of the run, its column in `--mm-gc`; drawn on top of the others. Kept per document (a tab switch). The run is looked for up to 20000 lines each way; an empty line at either end of the run is left out. |
| The cursor on an opening line | Your remark after the first build: the cursor on `begin` showed nothing (the guide of its indent starts on the next line). Now a line followed by a deeper one shows the guide of that indent (3.2a). |
| Empty lines | Look at most 200 lines up and down for a line with text; none found: level 0. |
| Settings | `indentGuides` (comment, rainbow, off; default comment), `indentGuideCursor` (default on: you asked for it as a setting, the default was not said). Options > Settings, Editor, Indent guides. |
| Colours | Comment: the theme's comment colour at 55 %. Rainbow: theme colours `guide1` to `guide6` in dark.json (light colours) and light.json (darker ones); the other themes take them from their base. |
| Docs | README (an Indent guides bullet; the theme colour names). |
| Tests | t81 (in the app): 14 checks pass: guides per line, empty lines from their neighbours, the cursor's guide on `begin` and on `if` (the indent they open), on a body line, on `end if` and on an empty line, an edit, rainbow (six layers and the cursor's), off, the cursor's guide off, tabs. Screenshots: comment and rainbow at night, comment by day. Unit tests: 186 pass (the theme colour name `guide6` added to an existing test). Also run: t79 (45), t70 (6). |

## 6. Changed after execution: guides at the enclosing lines' indents (2026-10-22)

A line indented several steps at once (line 1 at column 1, line 2 at column 10) showed a guide per step (five, the
last one the cursor's), where you wanted one: at column 1, the indent of the line it belongs to, in the cursor's
colour when the cursor is in that block. Now a line's guides are at the indents of its enclosing lines (the lines
above it with less indent), not at every indent step; with regular indentation (one step per level) nothing changes.

| Topic | As built |
|---|---|
| Where the lines go (replaces 3.1) | Per line, one guide at the indent of each enclosing line, read down from the nearest line above with no indent (at most 20000 lines up). An empty line: the guides left of the level it takes. A line that opens an indent: the cursor's guide at its own indent (not rounded up to a step). |
| How it is drawn (replaces the row in 5) | A line class per set of guide columns (`mm-gk-0-9`: guides at columns 0 and 9, in `ch`), its CSS rule made by `guides.js` on first use: one 1px gradient per guide. `--mm-step` is gone. |
| Rainbow | The colour by nesting depth (the first enclosing line `guide1`, the next `guide2`, ...), no longer by column. |
| Tests | t81: 17 checks pass, the 14 above (rainbow now counts a layer per guide plus the cursor's) and the jump from column 1 to 10: one guide, the cursor's, at column 0 (0-based); rainbow one layer. Screenshot t81-jump.png. |
