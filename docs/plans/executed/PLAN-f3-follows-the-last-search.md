# Plan: F3 follows the search used last (the find bar or the Search pane)

Status: draft 2026-11-09, revised 2026-11-09; executed (2026-11-09); see As built.

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

## 5. As built

Built on branch `f3-follows-search` (2026-11-09): in app.js `f3`, `f3Target`, `f3Take`, `showF3`, `f3Step`, `searchStep`
and `searchAt` (next to the Search pane's results), `findNext` and `findPrevious` (actions.js) through `f3Step`; the
find bar's F3 tag and its hooks (find.js: opened to type, typed in, Enter, its arrows, the tag); the Search pane's tag
and the marked result (search.html, search-pane.js); one blink of a pane's flash (pane.js, app.css).

Differs from the plan:

- **The Search pane holds F3 only with results**: without them, or with the results all replaced, F3 is the find bar's
  whatever was used last; the Search pane's tag is hidden then.
- **The find bar's blink** is an accent edge around the bar (one 0.25 s blink); the Search pane's is its page's flash,
  once.
- **A result clicked** takes F3 and is where F3 goes on from; a new search starts from the cursor again.
- **The Search pane's bar** (asked after the build): Previous and Next before its F3 tag, as the find bar has them
  (they step through the results and take F3), the tag always shown; Known only with the scope Files in folder (it
  only filters a folder's files); the bar on two lines when the pane is narrow.

Tested in the test copy by script, with real F3 and Shift+F3 keys: the find bar's F3 on its matches; a search of the open
files, F3 from the cursor's result to the next ones, into the other file (opened), Shift+F3 back, the list marking the
result and its tag lit, the find bar's dimmed; typing in the find bar gives F3 back to it (its tag lit, the Search
pane's dimmed); a click on the Search pane's tag moves F3 there without a step; the flash once on each switch (the
Search pane's and the find bar's) and not on the next press; the end of the list with findWrap end (the message) and
around (round to the first); a replaced result passed; with the find bar closed and results there, F3 the Search
pane's. Screenshots of both tags. All unit tests pass.
