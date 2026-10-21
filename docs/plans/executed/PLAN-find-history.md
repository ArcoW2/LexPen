# Plan: Find history

Status: executed 2026-10-21 (section 5). From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

The find bar and the search panel forget what was searched. UltraEdit and Visual Studio keep a list of earlier
searches (and replacements) to pick from.

## 2. The solution, in brief

The last searches and replacements are kept (shared by all windows, in the app's state), and the find and search
fields show them in a list: Down in an empty field or Alt+Down opens it, Up / Down in the field step through
them.

## 3. Details

- What is kept: the text with its switches (case, word, regex), newest first, no duplicates, a limit: setting
  `findHistory`, default 20 (your answer).
- Where: the host's state folder (as clipboards), so all windows and a restart share it.
- The find bar's and the search panel's fields share the list; the replace fields have their own.
- A private search is not a thing here; a "clear history" item in the list.

### 3.1 Tests

In-app: three searches, the list newest first; picking one sets its switches; a restart keeps it; another window
sees it; clear.

## 4. Open questions

None.

## 5. Resolved during execution

| Point | What was done |
|---|---|
| The find techniques | The find bar's find field (editor and preview, per pane or shared) and the search in files share one list of searches; the find bar's replace field has its own list. Go to line, the settings search and the command list (F1) are filters, not searches: no history. |
| When a search is kept | When it is done, not while typing: Enter, F3 / Shift+F3, the arrows of the find bar, Replace and All, and every run of the search in files (Enter, a switch or the scope changed). A replacement when Replace or All uses it. The same text again moves to the top with its latest switches. |
| Keys | Up: the next older entry in the field (with its switches), Down: the newer one, past the newest the text as typed. Alt+Down, or Down in an empty field: the list under the field (Up / Down, Enter, Esc, a click), ending with Clear history (clears that list: searches or replacements). Alt+Down in a find field no longer goes to the next tab. |
| Storage | The host's state (`AppState.FindHistory`, `ReplaceHistory`, next to the recent lists), saved at once; every window gets the lists by an event. The setting caps what is shown and what a new entry keeps; a smaller number does not delete the rest until the next search. |
| The setting | `findHistory`: None, 10, 20 (default), 50, 100 (Options > Settings, Find). None: nothing is kept. |
| Docs | README (the Ctrl+F row). |
| Tests | t82 (in the app): 16 checks pass: typing records nothing; find bar and search in files in one list, newest first, with switches; Up / Down with switches and back to the typed text; the list, picking, Alt+Down not taken as next tab; a replacement in its own list; the search field sees the shared list; the setting 2; a restart; Clear history (the event to the page). Unit tests: `FindHistory` (newest first, once, capped, latest switches, empty not kept, replacements). 190 pass. |
