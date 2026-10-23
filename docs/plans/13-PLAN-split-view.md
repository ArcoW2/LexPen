# Plan: One file in two views (split), and the panes scrolled together keeping their distance

Status: draft 2026-10-21, extended 2026-10-23 (scrolling together), not started. From the list "what UltraEdit or
Visual Studio has and LexPen does not". The number in the file name is the priority; rename to reorder.

## 1. What this is about

Two things for the two panes:

- **Split.** Visual Studio's Window > Split shows one file twice, scrolled independently, edits shared; UltraEdit
  splits its window the same way. LexPen's split is the two panes: the same file in both, both writable.
- **Scrolling together.** The button between the panes (scroll together) puts the other pane on the same line
  number. For two different files, or two places in one file, that is rarely what you want: you lined them up by
  hand and want them to stay that way while scrolling.

## 2. The solution, in brief

Split opens the active file in the other pane, at the same place, with its own cursor and scroll position; edits
show in both. Scroll together keeps the distance the panes had when it was turned on: scrolling one pane by some lines
scrolls the other by the same lines. A second button between the panes, Level, puts the other pane on the same line
number. A setting chooses whether scroll together keeps the distance (default) or always uses the same line number,
as now.

## 3. Details

### 3.1 Split

- The document is shared (CodeMirror linked docs), cursor and scroll per tab: as now for a file in two panes.
- The command: View > Split, Ctrl+Alt+S proposed. It opens the active file in the other pane at the same place (its
  first line in view, the cursor); the other pane is shown when hidden. Already open there: that tab activated.
- One pane split in itself (above / below, VS's split bar) is not part of this: the other pane is the split.

### 3.2 Scroll together, keeping the distance

- Turned on: the distance is taken then, in lines: the other pane's top line minus this pane's top line (the line
  at the top of each view, `editorLine` / `previewLine` as they are now, fractions included).
- Scrolling a pane: the other goes to this pane's line plus the distance (minus, the other way round). Lines, not
  pixels: the two files may have other fonts, wrapping, or a preview.
- At an end: the other pane stops where it can (its first or last line); the distance is not changed by that, so
  scrolling back lines them up as they were.
- Changing the distance: turn scroll together off, scroll one pane, turn it on again; or Level (3.3).
- The distance belongs to the pair of tabs shown. Another tab activated in either pane: the distance is taken again
  from where the two views are at that moment.
- Kept with the on / off state in the window's session, so a restart lines them up as they were.
- A preview pane scrolls by source line, as now (`setPreviewLine`).
- While comparing: unchanged; the compare scrolls the panes itself and the button is hidden.

### 3.3 Level

- A small button next to scroll together (between the panes), shown only when the setting keeps the distance.
- Puts the other pane on the same top line as the active pane, and sets the distance to 0; scroll together turned
  on when it was off.
- An action as well (`levelPanes`, no key proposed), so it can get a key and a menu entry (View).

### 3.4 Setting

- `scrollTogether` in the View group: "Keep the distance" (default) / "Same line number".
- Hint (on): "Scroll together keeps the panes as far apart as they were when you turned it on; Level puts them on
  the same line." Hint (off, same line number): "Scroll together always puts the other pane on the same line
  number."
- Same line number: scroll together behaves as now, and Level is hidden.

### 3.5 Tests

In-app:

- Split: the file shows in the other pane at the same place; an edit shows in both; each scrolls on its own.
- Keep the distance: other pane 40 lines further, turn on, scroll this pane 10 lines: the other moves 10 and stays 40
  further; scroll the other: this one follows the other way.
- At an end: the other pane stops at its last line; back up: the distance is 40 again.
- Level: both on the same top line, distance 0, and scroll together on.
- Same line number: scroll together puts the other on the same line; Level hidden.
- Another tab in one pane: the distance taken again from the views as they are.
- Session: on, distance 40, restart: still on, still 40 apart.

## 4. Open questions

1. A way to change the distance without turning scroll together off and on, for instance scrolling one pane with
   Alt held moves only that pane? Not part of the plan unless you want it.
