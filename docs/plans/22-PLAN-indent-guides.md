# Plan: Indent guides

Status: draft 2026-10-21, not started. Your request; your answers of 2026-10-21 are worked in. The number in the
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
- Which guide: the innermost one at the cursor's line, at the column one indent step left of that line's text
  (the level the line belongs to). On an empty line: the level it takes from its neighbours (3.1).
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
