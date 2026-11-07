# Plan: The character picker as a window of its own, and the code at a line's end

Status: executed 2026-10-22 (CharPickerForm.cs, web/charpicker.html, charpage.js; in-app test t97, 43 checks). Follows plan 15 (docs/plans/executed/PLAN-character-tools.md).
The number in the file name is the priority; rename to reorder.

## 1. What this is about

- The picker is a modal dialog in the page: while it is open the document cannot be clicked, so inserting
  characters at one place, moving the cursor and going on picking means opening it again each time. Insert closes
  it.
- It can be resized but not moved.
- At the end of a line the bottom bar shows no code, so the picker cannot be opened from there with a click (only
  by Ctrl+Alt+U or the menu).

## 2. The solution, in brief

The picker becomes a window of its own, as Options > Settings: not modal, movable and resizable, its place and
size remembered, one for all LexPen windows. Insert puts the characters at the cursor (or cursors) of the
document you last worked in and leaves the picker open, so you can click in the document, move the cursor and go
on picking. At the end of a line the bottom bar shows the line end that follows (`LF`, `CRLF`, or `end` on the last
line), clickable as the code is. Docking (the picker, the side pane, Settings) is a plan of its own:
docs/plans/executed/PLAN-docking.md.

## 3. Details

### 3.1 The window

- A form of its own (as SettingsForm: its own page, charpicker.html, the same WebView2 environment), owned by the
  window it was opened from, so it stays above that window but never blocks it; not in the taskbar.
- Movable and resizable as any window; its place and size kept (State, as the main windows' places), also after a
  restart. Opened again: brought to the front, not a second one.
- Ctrl+Alt+U, Edit > Insert character... and a click on the code in the bottom bar open it (or bring it to the
  front) at the character after the cursor of the window it is opened from.
- Esc in the picker closes it; the window it belongs to stays as it was.

### 3.2 Inserting into the document

- Insert, a double click on a character and Enter on a code in the search go to the main window last worked in
  (as the settings window's "a window of LexPen to work in", AppHost.LastActive), its active editor: at every
  cursor there, on every line of a block, past a line's end with the spaces first (as now). The picker stays open.
- Insert puts the free field's text; the field keeps it (to insert the same again elsewhere), and a Clear button
  next to the field empties it.
- A double click on a character puts that one character straight at the cursor(s), not into the free field (the
  field stays as it was); the picker stays open. A single click (or Enter in the grid) adds the character to the
  free field, as now.
- The picker does not take the focus away for good: after Insert the focus goes back to the document, so typing
  goes on there; a click in the picker brings it back.
- A read-only tab or no editor shown: a notice in the picker, nothing inserted.
- Following the cursor: the picker shows the character after the cursor of that window as it moves (the
  information at the right), without moving the grid unless asked (a button "The character at the cursor").

### 3.3 The code at a line's end

- At the end of a line the bottom bar shows what follows: `LF` or `CRLF` (the document's line end), on the last
  line `end`; the tooltip says so ("the end of the line: LF, U+000A"). A click opens the picker as on a code.
- With a selection: as now, nothing.

### 3.4 Tests

- The window: opens from Ctrl+Alt+U, the menu and the bottom bar; a second open brings the same window to the
  front; moved and resized, the place and size are kept after closing and after a restart.
- Inserting: with the picker open, Insert at the cursor; the cursor moved in the document (by the test), Insert
  again: at the new place; the picker still open; several cursors and a block; a read-only tab.
- The bottom bar at a line's end: LF, CRLF, end; a click opens the picker.
- Regression: t97 (its in-page parts move to the window's page), t94, t3, t22.

## 4. Open questions

None.

## 5. Resolved during execution

| Topic | As built |
|---|---|
| The window | `CharPickerForm` (as `SettingsForm`): its own page, owned by the window it was opened from (so above it, never blocking it), not in the taskbar. Its place and size: `AppState.CharPicker` (state.json), kept when a move or resize ends and when it closes, used again when it is still on a screen. Opened again: the same window to the front, at the character given (`goTo`). Closed with the last LexPen window. |
| The requests | The character requests (`charList`, `charName`, `charSearch`) answered by one place, `CharInfo.Request`, for the picker and for the main windows (the bottom bar's names). |
| Inserting | The picker sends `insert`; the host passes it to `AppHost.LastActive` as the event `insertText` and brings that window to the front (the keyboard is back in the document). There at the cursor(s) of the active editor, as typing (several cursors, a block). A read-only tab or no editor: a notice in that LexPen window (not in the picker). |
| The character at the cursor | While the picker is open (the host tells the main windows, event `charPicker`), a main window sends the character after its cursor 150 ms after the bottom bar changes; the picker shows it at the right ("At the cursor: a U+0061") with Show, which moves the grid there. |
| The main page's part | `charpicker.js` keeps the bottom bar (`charAtCursor`, now also at a line's end), opening the window and `insertText`. Found by the test: it is loaded before app.js, which makes `events`, so its events are set at `DOMContentLoaded`. |
| Moved, sized | Tested through Windows itself (MoveWindow on the debug build's picker window, then the end of a move): the same place and size after Esc and opening again, and after a restart. |
| Keys | Alt+I Insert, Alt+L Clear, Alt+C Copy; Esc closes the window. |
| Tests | t97 (in the app, rewritten for the window): 43 checks pass: the bottom bar (a character, an emoji, LF, CRLF, end, a byte that could not be read, the tooltips); Ctrl+Alt+U opens the window at the character after the cursor; the grid, the blocks, the search; clicks into the field; Insert at the cursor with the picker staying open and the field kept; the cursor moved, Insert again there; the character at the cursor shown; a double click straight to the cursor, the field untouched; Enter on a code; Clear; several cursors; opened again: one window; All characters; moved and resized through Windows, kept after Esc and after a restart; the recently used; AltGr; the key. Unit tests: 209 pass. Also run, passing: t94 16, t3 35, t89 14, t90 6, t91 18, t92 26, t52 41, t85 46, t10 11, and after the Alt key swap t47 8, t66 13, t82 16. t22 failed 4 checks once (the settings window after a restart, timing) and passed 29 of 29 twice after. |
