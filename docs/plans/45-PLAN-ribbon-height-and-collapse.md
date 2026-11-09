# Plan: The ribbon's height, and collapsing it

Status: draft 2026-11-09; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

The ribbon has one height: three rows of 30 px (times the UI scale), whatever the window or the screen. On a small
screen it takes room from the document, and there is no quick way to put it away for a while and get it back: only
View > Ribbon (the setting commandBar), which removes it altogether.

## 2. The solution, in brief

The ribbon's bottom edge can be dragged: up makes it lower, the space between the rows and around the labels going
first and the text getting smaller after that; down makes it higher again, up to the height it has now. Dragged up
past its lowest height, or with a button at its bottom right, it collapses to its tab names only; dragging down from
the tab names (in their own row or in the top bar) or that button brings it back at the height it had. Ctrl+F1
collapses and shows it as well. Height and collapsed are kept per window, as commandBar is.

## 3. Details

### 3.1 The height

- **The grip**: the ribbon's bottom edge, a few pixels high, with the up-down resize cursor; dragging it changes the
  height live. A double click on it: back to the full height.
- **What gets lower, in order**: first the spacing (the padding of the buttons, the gap between icon and label, the
  line height of a large button's two label lines, the group name's padding), down to a minimum spacing; then the
  text (labels, group names) and the icons with it, down to a smallest size that still reads ([not yet checked]: to
  be found in the test copy, with light and dark themes and UI scale 100% and 150%).
- **How**: one number, the row height, as now (`--rb-row`); the spacing and the font size derive from it in CSS
  (`clamp()` / `calc()`), so every part follows the same value and nothing else has to know about it. The large
  button's icon (32 px) follows the height too; the small icon stays 16 px until the text shrinks.
- **The highest** is the present height (30 px rows): dragging down never makes the ribbon taller than now.
- **Kept** per window in the Layout settings (`ribbonRow`, beside `commandBar` and `ribbonTab`); a new window gets the
  last one used, as the other Layout settings.

### 3.2 Collapsing

- **Collapse**: a small button at the ribbon's bottom right (a chevron pointing up, the tooltip "Collapse the ribbon
  (Ctrl+F1)"), or dragging the grip up past the lowest height. Collapsed: only the tab names show, in their row
  (commandBar "both") or in the top bar (commandBar "ribbon"); the document gets the room.
- **Show again**: drag down from the tab names (a press on a tab name or the row, moved down a few pixels: the ribbon
  follows the pointer down and stays at the height it had), or the chevron (now pointing down) at the right end of
  the tab names, or Ctrl+F1. It comes back at the height it had before it collapsed.
- **A click on a tab name while collapsed**: open question 1.
- **Key tips while collapsed** (Alt with commandBar "ribbon"): the tab names get their tips as now; choosing a tab
  shows its buttons as a click on the tab name does (open question 1), so the keyboard still reaches every button.
- **Change mode** shows the ribbon (it cannot be changed while collapsed) and collapses it again when it ends, if it
  was.
- **Kept** per window in the Layout settings (`ribbonCollapsed`).

### 3.3 Actions

- `ribbon.collapse` (a toggle, checked when collapsed): Ctrl+F1 (free: no Ctrl+F1 in keys.json or in the page's own
  keys), View menu after Ribbon, F1.

### 3.4 Tests

- Jint or the test copy: the spacing and the font size for a row height (full, the spacing at its minimum, the
  smallest); the ribbon's height following a drag of the grip; a double click back to full.
- In the test copy: drag up past the lowest height collapses, the chevron and Ctrl+F1 collapse and show; a drag down
  from the tab names shows it at the old height, with commandBar "both" and "ribbon"; a click on a tab name while
  collapsed (as open question 1 is answered); key tips while collapsed; change mode while collapsed; a restart keeps
  the height and collapsed per window; screenshots at the full, a middle and the smallest height.

### 3.5 Alternatives

- **Fixed sizes** (large / compact / collapsed, a choice in Settings): simpler, but the drag asked for gives any
  height and is found where the ribbon is.
- **Scaling the whole ribbon** (CSS zoom): text and spacing shrink together; the spacing going first keeps the text
  readable longer.

## 4. Open questions

1. **A click on a tab name while collapsed**: show that tab's buttons over the document for a moment (as Office: they
  close again after a button is used, a click elsewhere or Esc; the document does not move), or show the ribbon
  again for good? Suggestion: over the document for a moment; a drag down, the chevron or Ctrl+F1 show it for good.
2. **Text before spacing?** The order asked: the spacing gets shorter first, the text smaller only after. Should the
  text shrink at all, or should the ribbon stop at the height where the spacing is at its minimum (the text always
  the size it has now)? Suggestion: the text shrinks too, but not below [not yet checked] (the smallest that reads).
