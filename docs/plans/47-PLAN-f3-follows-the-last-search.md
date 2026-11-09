# Plan: F3 follows the search used last (the find bar or the Search pane)

Status: draft 2026-11-09, revised 2026-11-09; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

F3 and Shift+F3 always step through the find bar's matches (`findNext`, `findPrevious`), also when the Search pane is
what the user works with: its results can only be gone through by clicking them one by one. Both are used together in
a real way: search the files, open one, find something else in it with the find bar, then go on with the next result
of the search. F3 has to go where the user is working, without asking.

## 2. The solution, in brief

The search used last holds F3: the find bar or the Search pane, whichever was used last (typed in, run, a match or
result chosen, F3 started from it). F3 and Shift+F3 then go to the next or previous match of that one: in the find bar
as now, in the Search pane the next or previous result, opened in its file and selected, the result marked in the list.
Both show a small "F3" tag: lit (as an active ribbon button) on the one that holds F3, dimmed on the other; a
click on a tag gives F3 to that one. When F3 or Shift+F3 goes to the other one than before, that one flashes once.

## 3. Details

### 3.1 Who holds F3

- **The find bar** takes it when it opens (Ctrl+F, Ctrl+R), when its field is typed in, and on Enter or a click on its
  arrows.
- **The Search pane** takes it when a search runs (Enter in its field, Search this file from the find bar's count, a
  switch changed), and when a result is clicked.
- **A click on its "F3" tag** (3.3) gives F3 to the find bar or the Search pane.
- Per window: each window has its own find bars and its own Search pane.
- Nothing else changes it: moving through the document, editing, other panes.
- The find bar closed: the Search pane holds F3 (if it has results); the Search pane's results cleared or its pane
  closed: the find bar does again.

### 3.2 F3 in the Search pane

- **The next result**: after the one chosen last (clicked or stepped to); none chosen yet: the first after the cursor
  in the active file if that file has results, else the first result. In another file: that file opened (its tab, else
  a new one), as a click on the result does (`goToSearchHit`).
- **Shift+F3**: the previous one.
- **The list**: the current result marked (as the active row of a list), scrolled into view in the pane.
- **At the end of the list**: as the find bar at the end of the file (setting findWrap): a message, or round to the
  first.
- **Results changed**: a match replaced (the replace row) is skipped; a new search starts again from the cursor.

### 3.3 The "F3" tag and the flash

- **The tag**: a small "F3" in the find bar, after its up and down arrows, and in the Search pane, after its status
  (the number of results; only while it has results). On the one holding F3 lit as an active ribbon button (the
  active background, the accent colour); on the other dimmed. Its tooltip: "F3 / Shift+F3: the next / previous match
  here (a click: F3 here)" or "... result here ...".
- **A click on the tag**: F3 to that one (lit), the other dimmed; nothing else happens (no step).
- **The flash**: only when F3 or Shift+F3 goes to the other one than the press before it (the holder changed since):
  that one, the find bar or the Search pane, flashes once (one blink of the flash of a pane shown by an action).
  Going on with F3 in the same one does not flash.

### 3.4 Tests

- In the test copy: find bar used, F3 goes to its next match; a search run in the Search pane, F3 goes to its next
  result in the next file (opened), Shift+F3 back, the list marking the result; the find bar used again (typing),
  F3 is the find bar's again; the end of the list with findWrap end and round; a replaced result skipped; the flash
  on the switch and not on the next press; the find bar closed with results, F3 the Search pane's; the tags lit and
  dimmed as F3 moves, a click on the dimmed one moving F3 there (no step).

### 3.5 Alternatives

- **Separate keys** (F3 for the find bar, F4 or Ctrl+F3 for the Search pane): no guessing, but one more key to know,
  and F4 is taken (the document active before).
- **F3 by the focus** (the Search pane's when it has the focus): the focus is in the document after a result is
  opened, so F3 would not reach the Search pane when it is wanted most.

## 4. Open questions

None.
