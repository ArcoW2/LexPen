# Plan: One file in two views (split), and the panes scrolled together keeping their distance

Status: executed 2026-10-23 (draft 2026-10-21, extended 2026-10-23: scrolling together). From the list "what UltraEdit or
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
- Changing the distance: Alt + mouse wheel over a pane scrolls only that pane; the distance becomes what the two
  views are apart afterwards. Only the mouse wheel: Alt with the keys, the scroll bar or a drag scrolls together as
  usual. Also: turn scroll together off, scroll one pane, turn it on again; or Level (3.3).
- Aligned by the same line number (3.4): Alt + mouse wheel scrolls both, as the wheel does (the distance stays 0).
- The distance belongs to the pair of tabs shown. Another tab activated in either pane: the distance is taken again
  from where the two views are at that moment.
- Kept with the on / off state in the window's session, so a restart lines them up as they were.
- A preview pane scrolls by source line, as now (`setPreviewLine`).
- While comparing: unchanged; the compare scrolls the panes itself and the button is hidden.

### 3.3 Level

- A small button next to scroll together (between the panes), shown only when the setting keeps the distance; with
  Align scrolling by the same line number it is not there at all.
- Its look: the same round button as scroll together (24 px, the accent blue when on). Inside, an SVG: on the left
  a piece of text as a few short lines, on the right another few lines set lower (offset), and under both a
  horizontal arrow pointing left and right. With the panes above each other (orientation h) it is not turned:
  the arrow stands on the right, pointing up and down, and the two offset pieces of text are next to it, on its
  left.
- Its hint: "Level the two panes so they start scrolling from the same line number".
- Puts the other pane on the same top line as the active pane, and sets the distance to 0; scroll together turned
  on when it was off.
- An action as well (`levelPanes`, no key proposed), so it can get a key and a menu entry (View).

### 3.4 Setting

- `scrollTogether` in the View group, labelled "Align scrolling by", with the options "keeping the line distance"
  (default) and "the same line number" ("by" moved into the label, so the options stay short).
- Hint (keeping the line distance): "Scroll together scrolls the documents as they are aligned now, without putting them on
  the same line number first." Hint (the same line number): "Scroll together always puts the other pane on the same line
  number."
- The same line number: scroll together behaves as now, and Level is hidden.

### 3.5 Tests

In-app:

- Split: the file shows in the other pane at the same place; an edit shows in both; each scrolls on its own.
- Keeping the line distance: other pane 40 lines further, turn on, scroll this pane 10 lines: the other moves 10 and stays 40
  further; scroll the other: this one follows the other way.
- At an end: the other pane stops at its last line; back up: the distance is 40 again.
- Level: both on the same top line, distance 0, and scroll together on.
- Alt + mouse wheel over one pane: only that pane moves; then the wheel without Alt: both move, at the new distance.
  Alt + Page Down: both move, the distance unchanged.
- Panes above each other: the Level icon with the arrow up-down on the right, the text pieces on its left.
- The same line number: scroll together puts the other on the same line; no Level button.
- Another tab in one pane: the distance taken again from the views as they are.
- Session: on, distance 40, restart: still on, still 40 apart.

## 4. Open questions

None.

## 5. Resolved during execution

- **Both copies edit.** The tabs plan (PLAN-tabs-panes-windows.md) made only the first copy of a file editable, the
  other read-only. Now every tab of a file in a window edits it, unless set read-only; across windows the edit lock
  decides, as before. Read-only off no longer asks to set the other pane read-only first. Test t20-locked changed
  to match.
- **Where the setting is.** Settings has no View group: Align scrolling by is under Tabs, section Two panes. Values
  `distance` (default) and `line`. A choice row has one hint, so both options are explained in it.
- **Menu letters.** View > Le&vel the panes and Split i&nto the other pane: L (Language) and P (Preview) were taken.
- **Key.** Ctrl+Alt+S for Split, as proposed; it was free.
- **A pane at its end.** Putting a pane on a line past its end left a flag waiting for a scroll that never came, so
  the next scroll of that pane was not passed on. The place is now kept within what the pane can scroll.
- **The Level icon** showed both drawings side by side at first (a CSS rule outranked the one hiding the other);
  fixed, and tested in both orientations.
- **Alt + Page Down** is not a scroll key in the editor, so the test checks that a scroll other than Alt + mouse
  wheel (a scroll by code) keeps the distance. Alt + mouse wheel is tested with a synthetic wheel event with Alt
  held; what Windows does with the Alt key released after it (no menu bar of its own) was not tested.
- **Tests.** t140 (split, the distance, an end, Alt + wheel, Level, both icons, another tab, the same line number,
  the session) passes. t131, t14e and t54 fail the same way without this change; not part of this plan.
