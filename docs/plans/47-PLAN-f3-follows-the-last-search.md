# Plan: F3 follows the search used last (the find bar or the Search pane)

Status: draft 2026-11-09; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

F3 and Shift+F3 always step through the find bar's matches (`findNext`, `findPrevious`), also when the Search pane is
what the user works with: its results can only be gone through by clicking them one by one. Both are used together in
a real way: search the files, open one, find something else in it with the find bar, then go on with the next result
of the search. F3 has to go where the user is working, without asking.

## 2. The solution, in brief

The search used last holds F3: the find bar or the Search pane, whichever was used last (typed in, run, a match or
result chosen, F3 started from it). F3 and Shift+F3 then go to the next or previous match of that one: in the find bar
as now, in the Search pane the next or previous result, opened in its file and selected, the result marked in the list.
The one that takes over F3 flashes once, so the user sees where F3 went.

## 3. Details

### 3.1 Who holds F3

- **The find bar** takes it when it opens (Ctrl+F, Ctrl+R), when its field is typed in, and on Enter or a click on its
  arrows.
- **The Search pane** takes it when a search runs (Enter in its field, Search this file from the find bar's count, a
  switch changed), and when a result is clicked.
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

### 3.3 The flash

- When F3 or Shift+F3 goes to the other one than the press before it: the find bar or the Search pane flashes once (the
  flash of a pane shown by an action, faster: one blink instead of three).
- Every press: open question 1.

### 3.4 Tests

- In the test copy: find bar used, F3 goes to its next match; a search run in the Search pane, F3 goes to its next
  result in the next file (opened), Shift+F3 back, the list marking the result; the find bar used again (typing),
  F3 is the find bar's again; the end of the list with findWrap end and round; a replaced result skipped; the flash
  on the switch and not on the next press; the find bar closed with results, F3 the Search pane's.

### 3.5 Alternatives

- **Separate keys** (F3 for the find bar, F4 or Ctrl+F3 for the Search pane): no guessing, but one more key to know,
  and F4 is taken (the document active before).
- **F3 by the focus** (the Search pane's when it has the focus): the focus is in the document after a result is
  opened, so F3 would not reach the Search pane when it is wanted most.

## 4. Open questions

1. **The flash**: only when F3 switches to the other one (suggestion), or on every F3 and Shift+F3? Every press flashes
   a lot when going through many results.
2. **A sign of who holds F3**, besides the flash: for example the find bar's count and the Search pane's status line in
   the accent colour while they hold it? Suggestion: yes, a quiet sign (the count or the status in the accent colour),
   so it can be seen before pressing F3.
