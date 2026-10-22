# Plan: Back and forward through cursor positions

Status: plan 2026-10-22, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Back / Forward (the mouse buttons, the actions `back` / `forward`) go only through tabs and the links followed
inside a tab. After a jump inside a file (go to line, a find, a bookmark, the outline, Ctrl+Home, a section)
there is no way back to where the cursor was. Visual Studio's Navigate Backward / Forward and VS Code's Go Back do
that. Back and Forward also have no keys yet.

## 2. The solution, in brief

Every document gets its own history of cursor places. A place is recorded whenever the cursor makes a jump: it
lands more than a set number of lines away from where it was (a setting, 10 by default), without typing. That one rule
covers almost every jump source, so they need no hook of their own; a found item is the exception: it is always a
new place, however close. Ctrl+Alt+- / Ctrl+Alt++ and the mouse back / forward buttons go through the places of
the document in the active tab. With Ctrl held, the mouse buttons go around the app instead: the present history of
tabs and links. The places move with edits and go when their document closes.

## 3. Details

### 3.1 What counts as a jump

- The editor's cursor activity: the main cursor's new line is more than the setting `jumpLines` away from the
  line it was on, and the change did not come from typing, deleting, undo or redo. Then the place it left is
  recorded.
- That catches go to line, bookmarks, the outline's double click, Ctrl+Home / Ctrl+End,
  sections (Alt+Up / Down), brackets, a click or a drag far away, Page Up / Down held.
- Not: arrow keys and Page Up / Down within the limit, typing, a scroll without moving the cursor, a selection
  that grows (Shift held: the anchor stays, so the place is the anchor's).
- A found item is always a new place, also within `jumpLines`: find (F3, Shift+F3, the find bar, Find all's list)
  and a result of the search in files. find.js and the search in files tell places.js before they move the cursor;
  the place left is then recorded whatever the distance.
- Other jumps close together (a held Page Down) record one place: a place within `jumpLines` of the last one
  recorded replaces it instead of adding one. Found items are never merged that way.
- A switch to another tab records nothing in a document's history; it stays in the app history (3.4).

#### The setting

- `jumpLines` in the Editor tab (a range, 1 to 100, step 1, unit "lines", default 10): "A jump: a move of more than
  ... lines". Hint: "How far the cursor must move, without typing, for the place it left to be kept for Position
  back (Ctrl+Alt+-). A found item is always kept, however close."

### 3.2 A document's history

- Kept on the document (`doc.places`, with `doc.at`), so a file shown in both panes has one history; Back moves
  the cursor of the active pane.
- A place is a CodeMirror bookmark (`cmDoc.setBookmark`) at the cursor, so it stays on its text when lines are
  added or removed above it.
- A place whose text was deleted: its bookmark is gone (`find()` returns nothing); Back skips it.
- At most 100 places per document. Not kept after a restart. A document closed: its history goes, the bookmarks are
  cleared. A document moved to another window starts there with an empty history.
- A tab in preview mode has no cursor: Back and Forward do nothing there (a short hint "No positions in the
  preview").

### 3.3 Back and Forward in a document

- Back: where the cursor is now is stored for Forward, then the cursor goes to the place before, scrolled into view
  (centred, as go to line).
- A place equal to where the cursor is (the same line and column) is skipped, so one press always moves.
- Nothing further back (or forward): the cursor stays, the edge flashes as Ctrl+Up / Down does at the text's end
  (`flashEdge` in virtual.js).
- Going Back and then making a new jump drops the Forward places, as a browser does.
- The jump that Back or Forward itself makes is not recorded.

### 3.4 Around the app

- The present history of tabs and links (`navHistory`, `remember`, `go` in app.js) stays as it is: a switch to
  another tab and a link followed inside a tab are its steps, for the whole window.
- Ctrl + the mouse back / forward buttons go through it (until now the plain buttons did).

### 3.5 Keys and actions

Back / Forward around the app keep no keys of their own: they are actions, so a key can be given in keys.json, and
they are in the View menu.

| Action | Keys | Does |
|---|---|---|
| `positionBack` (new) | Ctrl+Alt+-, Ctrl+Alt+NumMinus, mouse back | The document's place before |
| `positionForward` (new) | Ctrl+Alt+= (the + key), Ctrl+Alt+Shift+=, Ctrl+Alt+NumPlus, mouse forward | The document's place after |
| `back` (as now) | Ctrl + mouse back | The tab or file shown before, in the window |
| `forward` (as now) | Ctrl + mouse forward | Again forward, in the window |

- keys.json writes the + key as `=` (as zoom in: `Ctrl+=`, `Ctrl+Shift+=`), so Ctrl+Alt++ is bound both ways.
- Ctrl+Alt is AltGr on some keyboards; `altGrText` lets the character through when AltGr gives one.
- The mouse buttons are not in keys.json (a mouse event, app.js), as now.
- The View menu gets Position back / Position forward with their keys, and Back / Forward ("in the window").

### 3.6 Where it lives

- A new `web/places.js` (loaded before app.js): the jump rule (a `cursorActivity` and `beforeSelectionChange`
  handler per editor, attached where the editors are made), the document history, `positionBack` /
  `positionForward`, and the clean-up when a document closes.
- app.js: the mouse handler chooses by Ctrl; the tab history stays there.

### 3.7 Tests

In-app (a new test):

- Go to line 200 from line 1; Ctrl+Alt+-: line 1; Ctrl+Alt+=: line 200.
- F3 several times in a row: a place for each found item, also when they lie within `jumpLines`.
- `jumpLines` set to 50: go to a line 30 further: no place; 60 further: a place.
- An arrow key down 3 lines: no place; Ctrl+End: a place.
- Two files: a jump in each; Back in one stays in that file; switching tabs adds no place.
- The mouse back button: the document's place; with Ctrl: the tab before.
- Lines added above a place: Back lands on the same text.
- The text of a place deleted: Back skips it.
- Nothing further back: the cursor stays.
- After Back, a new jump: Forward does nothing.
- One file in both panes: one history.
- A closed document: its history gone (reopened: empty).
- The present tests for back / forward through tabs and links, changed to Ctrl + the mouse buttons, still pass.

## 4. Open questions

None.
