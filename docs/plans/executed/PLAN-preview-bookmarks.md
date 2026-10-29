# Plan: Bookmarks in the preview

Status: executed 2026-10-28 (web/previewcursor.js; in-app tests t31, t31b).
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Bookmarks are editor only (`web/bookmarks.js`: "Editor only"). Every bookmark action is an `editor: true` action, so
`editorPane()` returns nothing when the focus is in a preview or the active tab is preview only, and the keys
(Ctrl+1, S; Ctrl+K, 1; Ctrl+Q, 1; next / previous; Ctrl+K, L) do nothing there. The preview does not show where the
bookmarks are either: only its scroll bar strip marks them, and only once an editor has loaded them (`doc.marks`).
The preview has no cursor to place a bookmark at: its keys only scroll. Reading a file in the preview, you cannot
mark a place to come back to, nor jump to one you marked earlier.

## 2. The solution, in brief

Every preview gets a cursor of its own, separate from the editor's. A single click places it, the movement keys move
it (arrows, PgUp / PgDn, Home / End, Ctrl+Home / Ctrl+End), and the view follows it when it goes out of sight, as
the editor's does. With the focus in the preview, the bookmark actions work at the preview's cursor, also when the
editor is shown next to it. The preview shows the bookmarks at the far left of its text, with their numbers. The
bookmarks stay one set per document, so a bookmark made in the preview is the same one the editor shows, and the
reverse.

## 3. Details

### 3.1 The preview's cursor

- One per tab, beside the editor's cursor; the two are independent. A tab is a pair of editor and preview, each
  with its own cursor; two panes are two such pairs, as now. What another pane shows does not change this
  preview's cursor.
- A place in the source text (line, column). While the document has its main Doc (an editor has shown it), a
  CodeMirror bookmark on it, so edits in an editor carry the cursor along; else a line and column kept on the tab.
- Where it starts: when the preview opens (a tab opened or restored in preview, a tab switched to a mode with the
  preview), the cursor is placed on the first character at the top of the view. While the preview stays open it
  keeps its cursor (a tab switch away and back included). Not kept in the session: the preview's scroll position
  is, and the cursor is placed from it.
- Drawn as a thin caret at its character (`previewRangesOf` for one character). Where markdown made up the text (a
  list number, a picture, a diagram): at the start of its block. Shown while the preview has the focus, as the
  editor's caret; dimmed otherwise. Redrawn after a render and a resize.
- The editor's cursor bar in the preview (`markPreviewCursor`) stays as it is: it shows where the editor's cursor
  is, the caret shows the preview's.
- Mouse:
  - A single click on text places the preview's cursor only. On a link: the link is followed, the cursor placed.
    A drag: a text selection, as now (for copy and highlights), the cursor at its end.
  - A double click: the editor's cursor, as now (plan 30); the preview's cursor is placed by its first click.
  - The wheel and the scroll bar scroll without moving the cursor, as in the editor.

### 3.2 Moving the preview's cursor

The keys are the editor's (CodeMirror's defaults, not keys.json), handled on the preview while it has the focus;
they no longer scroll it directly.

- Left / Right: a character in the rendered text; Ctrl+Left / Ctrl+Right: a word.
- Up / Down: a rendered line, keeping the column the cursor started at (as the editor keeps its goal column): the
  point a line height above or below, found with `caretPositionFromPoint`.
- PgUp / PgDn: the view's height less one line, the view scrolled by as much.
- Home / End: the start / end of the rendered line; Ctrl+Home / Ctrl+End: the document's start / end.
- After a move the view follows when the cursor is out of sight (`revealFoundInPreview` rules as for a jump).
- While moving, the cursor keeps its place in the rendered text, so a step over text markdown made up (a list
  number) does not get stuck on its block's start; its source place is taken from there after each move
  (`sourceOffsetAt`). After a render the place comes from the source again.
- With Shift: ignored for now; Shift+Down moves as Down. No text selection by keys in the preview.

### 3.3 The actions in the preview

- The bookmark actions find their pane and cursor:
  - From a key: the editor that has the focus (as now), else the preview that has the focus, with its cursor.
  - From a menu or F1: the active pane, at the cursor of the part (editor or preview) that had the focus last;
    a preview only tab: the preview's.
  A new flag on the action (beside `editor: true`) says it accepts a preview; only the bookmark actions get it.
- `cursorOf(pane)` becomes that cursor.
- Store, toggle, clear, toggle unnumbered: at the preview's cursor, as in the editor.
- Go to bookmark, next / previous: the preview's cursor goes there and the view follows. The editor's cursor stays
  where it is. With Shift: ignored, a plain move.
- Edit > Go to bookmark, Store bookmark, and the list (Ctrl+K, L): filled from the same cursor; the list opens at
  the preview's caret.
- Read-only tabs: bookmarks allowed, as in the editor now (a bookmark does not change the file).

### 3.4 Showing the bookmarks in the preview

- The preview has no gutter. A mark at the far left of the text pane, beside the line of each bookmark
  (`previewSpotOf`, as the cursor bar), with its number, the unnumbered one without; several on one line drawn
  together, as the gutter does. Drawn in a layer after the content, so it scrolls along. Next to the editor's
  cursor bar, not over it.
- Always shown; no setting of their own, and the gutter's Bookmarks switch does not apply.
- A click on a mark: nothing. The preview's scroll bar strip goes to a bookmark already.
- The scroll bar strip (previewoverview.js) marks them also before an editor has loaded them.

### 3.5 Where the bookmarks live

- Unchanged: CodeMirror bookmarks on the document's main Doc, shared by its tabs, saved through `bookmarksSet`
  (BookmarkStore.cs is not touched).
- Shown in the preview without CodeMirror: from the stored list placed in the text (`bookmarksResolve`), kept as
  `doc.bmList`, so opening a file in the preview does not load the editor library.
- The first bookmark change in the preview loads the editor library (not an editor) and makes the main Doc
  (`materialize`), so the bookmark follows later edits from any editor. Loading it costs once per window
  ([not yet measured]; the start-up measurements are in `docs/plans/executed/PLAN-app-files.md`).

### 3.6 Not in this plan

- Position back / forward (places.js) for jumps made in the preview: it works on an editor's Doc; a jump of the
  preview's cursor does not add a place.
- Other editor actions at the preview's cursor (find from the cursor, go to line, highlights at the cursor): only
  the bookmarks use it for now.

### 3.7 Tests

- In-app (a test data folder, the debug build, over the debugging port):
  - Preview only: a click places the caret on that character; a click on a link follows it; a drag selection stays
    a selection.
  - Split view: a single click in the preview moves the preview's caret, not the editor's cursor; a double click
    moves the editor's cursor.
  - The movement keys move the caret; Down past the view's bottom and PgDn scroll the view along; Ctrl+End at the
    end; Up / Down keep the column; a step over a list number goes on.
  - The wheel scrolls without moving the caret.
  - Focus in the preview, the editor shown beside it with its cursor elsewhere: Ctrl+1, S stores bookmark 1 at the
    preview's caret; the mark "1" at the far left beside its line; the editor's gutter shows it on that line.
  - Ctrl+1, T on that line removes it, on another line stores it there; Ctrl+1, C clears it; the unnumbered toggle
    adds and removes one.
  - Go to bookmark and next / previous move the caret and scroll; around at the end; the editor's cursor stays.
  - Ctrl+K, L lists them; choosing one goes there.
  - Edit in the editor above the preview's caret: the caret stays on its text.
  - Opening a file in the preview, scrolled down by the session: the caret on the first character at the top of
    the view; Down moves from there, the view does not jump.
  - Shift with a movement key or go to bookmark: a plain move, no selection.
  - Close and reopen the file: the bookmarks shown in the preview without the editor library loaded.
  - A code file shown coloured: exact line and column. A fence in markdown: the right line.
- Unit tests: unchanged (`BookmarkStoreTests`); BookmarkStore is not changed.

## 4. Open questions

None.

## 5. Resolved during execution

| Topic | As built |
|---|---|
| Where the code is | `web/previewcursor.js`, loaded last: the cursor (`tab.pc`, `tab.pcMark`, `tab.pcDom`, `tab.pcGoal`), its keys, its click, the caret and the bookmark marks in one layer after the article (`drawPreviewCaret`, called from `markPreviewCursors`). |
| The actions | A flag `preview: true` (actions.js) with `previewOrEditor(ctx)`: from a key the focused editor, else the focused preview; from a menu or F1 the part of the active tab that had the focus last (`tab.focusPart`, which app.js already kept). Each bookmark action loads the editor library first (`withBookmarks`), as bookmarks.js comes with it. |
| Moving | Left / Right / Home / End by the browser's own caret movement (`Selection.modify`), the selection taken off again so highlights.js does not read it as the preview's cursor. Up / Down: a line by the same, then the goal x by `caretPositionFromPoint`. PgUp / PgDn: the view scrolled a page less a line, the caret at the goal x a page on; past the end: Ctrl+End. |
| The keys | A capture listener on the window, before keys.js on the document. Ctrl+Up / Ctrl+Down and Ctrl+PgUp / Ctrl+PgDn are left alone (scroll, next document). |
| The bookmarks without CodeMirror | The stored list placed in the text (`bookmarksResolve`) as `doc.bmList` (`previewBookmarkList`); loadBookmarks takes that list over later. The preview's scroll bar strip uses the same list. |
| Following edits | The cursor is a (not shared) bookmark on the main Doc once there is one, made on the first draw after the Doc exists. |
| The marks' tooltip | The layer takes no pointer events (as the cursor bar's), so a mark shows no tooltip. |
| Tests | Every check of t31 and t31b passes in the debug build over the debugging port: start at the top of the view, Down / Right / End / Home / Ctrl+End / Ctrl+Home / PgDn / PgUp, the goal column, a fence, a click, the wheel, Ctrl+1, S / 1 / T / C, next / previous, split view (a single click and bookmarks at the preview's cursor, the editor's cursor untouched; focus in the editor: the editor's cursor), an edit above carrying the cursor, Ctrl+K, L, Edit > Go to bookmark, a restart in the preview (no editor library, the stored bookmark shown, Ctrl+2, 2 going there), a code file (exact column). Unit tests: 310 pass. |
