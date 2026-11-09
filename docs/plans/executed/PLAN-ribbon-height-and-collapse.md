# Plan: The ribbon's height, and showing it only when wanted

Status: draft 2026-11-09, revised 2026-11-09; executed (2026-11-09); see As built.

## 1. What this is about

The ribbon has one height: three rows of 30 px (times the UI scale), whatever the window or the screen. On a small
screen it takes room from the document, and there is no quick way to put it away and get it back when needed: only
View > Ribbon (the setting commandBar), which removes it altogether.

## 2. The solution, in brief

The ribbon's bottom edge (a grip under the group names) can be dragged: up makes it lower, the space between the
rows and around the labels going first and the text getting smaller after that, down to 3/4 of its size; down makes
it higher again. Its three rows go from 90 px (3 x 30, as now) down to 50 px. The ribbon is shown always, or only
when wanted (a setting, per window): then only its tab names stay, and a drag down from the tab names, a click on
one (that tab shown) or Alt (when the menus are not shown) slides the ribbon down over the document, which does not
move; it slides away again when an action is run, on Esc or a click elsewhere. A button at the ribbon's bottom
right, a drag of its edge up past the lowest height, and Ctrl+F1 switch between the two.

## 3. Details

### 3.1 The height

- **The grip**: a strip of a few pixels of its own under the group names, the ribbon's lowest part, with the up-down
  resize cursor; dragging it changes the height live. A double click on it: back to the full height. It lies under
  the group names, not over them, so the corner buttons (in the group names' row, at a group's left and right)
  keep their whole hitbox; the ribbon is that strip taller. The collapse button (3.2) sits at the ribbon's right
  end, after the last group, so it is never on a corner either.
- **What gets lower, in order**: first the spacing (the padding of the buttons, the gap between icon and label, the
  line height of a large button's two label lines, the group name's padding), down to a minimum spacing; then the
  text (labels, group names) and the icons with it, down to 3/4 of their size (the labels' 13 px to a little under
  10 px, times the UI scale). Lower than that does not go: at the lowest height (50 px) the text is at most that
  much smaller, and what still does not fit is cut off as a long label is now. That is the height asked for.
- **How**: one number, the row height, as now (`--rb-row`); the spacing and the font size derive from it in CSS
  (`clamp()` / `calc()`), so every part follows the same value and nothing else has to know about it. The large
  button's icon (32 px) follows the height too; the small icon stays 16 px until the text shrinks.
- **The highest** is the present height (30 px rows, 90 px for the three): dragging down never makes the ribbon taller
  than now. **The lowest**: 50 px for the three rows (not counting the group names' row and the grip under it). At 50 px a row
  is a little under 17 px: a small button's 16 px icon and one line of label just fit with no spacing left, and a
  large button has a smaller icon and one line of label ([not yet checked] whether its two-line labels must become
  one line, and at which height).
- **The same height** when the ribbon slides over the document (3.2).
- **Kept** per window in the Layout settings (`ribbonRow`, beside `commandBar` and `ribbonTab`); a new window gets the
  last one used, as the other Layout settings.

### 3.2 Always, or only when wanted

- **The setting** `ribbonShow`, per window in the Layout settings beside commandBar, and in Settings (Editor view >
  Menu and ribbon, shown when commandBar is "ribbon" or "both"): "always" (as now) or "onDemand" (only when wanted).
- **Only when wanted**: the tab names stay where they are (their own row with commandBar "both", the top bar with
  "ribbon"); the buttons are hidden and the document has the room.
- **Showing it** (only when wanted): it slides down over the document from under the tab names, with a shadow at
  its lower edge; the document does not move. By:
  - **Alt**, only where the menus are not shown (commandBar "ribbon", with altOpens "tips"): the ribbon slides down
    with its key tips; a tip typed runs the button and the ribbon slides away again. With altOpens "menu", Alt opens
    the menus as now. With commandBar "both" (the menu bar there) Alt goes to the menus as now: the menu bar is the
    keyboard's way in; the ribbon shows by a drag down or a click on a tab name.
  - **A drag down** from the tab names (a press on a tab name or the row, moved down a few pixels): the ribbon
    follows the pointer down.
  - **A click on a tab name**: that tab's buttons slide down.
- **Hiding it again**: when an action is run from it (a button, a corner, an item of a split button's list), on Esc,
  a click outside it, or the keyboard going back to the document. Opening a split button's list, switching tabs in it
  and hovering do not hide it.
- **Switching** between always and only when wanted: the button at the ribbon's bottom right (a chevron pointing up:
  "Show the ribbon only when wanted (Ctrl+F1)"; on the slid-down ribbon a pin: "Always show the ribbon (Ctrl+F1)"),
  dragging the grip up past the lowest height (to only when wanted), Ctrl+F1, and the setting.
- **Change mode** shows the ribbon always while it lasts (it cannot be changed while it slides away) and goes back
  to only when wanted when it ends, if it was.
- **Customize** opens under the ribbon as now; with only when wanted the ribbon stays down while Customize is open.

### 3.3 Actions

- `ribbon.onDemand` (a toggle, checked when only when wanted): Ctrl+F1 (free: no Ctrl+F1 in keys.json or in the
  page's own keys), View menu after Ribbon, F1.

### 3.4 Tests

- Jint or the test copy: the spacing and the font size for a row height (full, the spacing at its minimum, the
  smallest: the text at 3/4 of its size, not less); the ribbon's height following a drag of the grip; a double click
  back to full.
- In the test copy, only when wanted: the document's top the same with the ribbon down and up; with commandBar
  "ribbon" Alt slides it down with key tips and a tip runs its button and hides it, with "both" Alt opens the menus
  (the ribbon stays up); a drag down from the tab names and a click on a tab name
  slide it down; a button run, Esc, a click in the document hide it; a split button's list and a tab switch do not;
  with commandBar "both" and "ribbon".
- In the test copy: the chevron, the pin, Ctrl+F1, the setting, and the grip dragged up past the lowest height switch
  between always and only when wanted; change mode and Customize while only when wanted; a restart keeps the height
  and the choice per window; screenshots at the full, a middle and the smallest height, and slid down over a
  document.

### 3.5 Alternatives

- **Fixed sizes** (large / compact / hidden, a choice in Settings): simpler, but the drag gives any height and is
  found where the ribbon is.
- **Scaling the whole ribbon** (CSS zoom): text and spacing shrink together; the spacing going first keeps the text
  readable longer.
- **Pushing the document down** when the ribbon shows only when wanted: the text jumps each time it shows and hides;
  sliding over it keeps the document still.

## 4. Open questions

None.

## 5. As built

Built on branch `ribbon-height-build` (2026-11-09): `ribbonSizes` in ribbonmodel.js (the sizes for a row height); in
ribbon.js the grip, `rbApplyHeight`, only when wanted (`rbOnDemand`, `rbApplyShow`, `rbSlide`, the drag down from the
tab names, the hiding), the button at the right end, the action `ribbon.onDemand`; the variables in app.css; the
Layout settings `ribbonShow` and `ribbonRow` (defaults/settings.json), the Settings row Show the ribbon, Ctrl+F1
(keys.json), View > Ribbon only when wanted.

Differs from the plan:

- **The sizes**: the spacing goes between 30 and 22 px rows, the text and the icons between 22 px and the lowest
  (50 / 3 px), down to 3/4. A large button's icon is what three rows leave after its two label lines, the arrow row
  (16 px at the full height, 6 at the lowest) and the button's border and gaps; one sharing its column with a small
  button gets what two rows leave; one without an arrow row has that room for its icon too (up to 32). At the full
  height everything is as before.
- **The setting is named "Show the ribbon"** (Always / Only when wanted), shown in Settings with commandBar "ribbon" or
  "both" (`showWhen` takes several values now).
- **Hiding**: also on a key typed in the document; Esc that closes a list from the ribbon closes only the list.
- **The ribbon's row height** is kept as `ribbonRow` (px at UI scale 1); dragging the grip past the lowest height by
  20 px switches to only when wanted and keeps the height it had.

Tested: unit (Jint, `RibbonTests`): the sizes at the full height, with the spacing at its minimum and at the lowest
(the text at 3/4, not less), out of range clamped; a large button's parts fit in three rows (two when sharing its
column) at several heights. All tests pass. In the test copy by script: the rows 90, 66 and 50 px with the labels at
13, 13 and 9.75 px; on every tab at five heights no part of a button outside it; the grip dragged with the real
mouse (lower, kept), its double click (full), dragged past the lowest (only when wanted, the height kept);
screenshots at the full, a middle and the lowest height, and slid down over a document. Only when wanted, with real
clicks and keys: the button at the right end, a click on a tab name (down, the document not moved), a split button's
list and Esc on it (the ribbon stays), another tab (stays), a button run (up), Esc, a click in the document, a drag
down from a tab name; with the menus shown Alt does not slide it, with the ribbon only Alt slides it down with its
tips and a tip typed runs the button and slides it up; Ctrl+F1 both ways, the pin; change mode and Customize show it
always while open; a restart keeps the height and the choice.
