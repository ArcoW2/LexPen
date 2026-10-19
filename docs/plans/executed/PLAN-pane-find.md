# Plan: find in the pane (Ctrl+F, F3)

Status: built on branch `feature/next-features` (a defect fix; this file records what was decided).

## 1. What this is about

Search inside a document was wrong. In the editor, Ctrl+F opened CodeMirror's search box, but F3 is not
CodeMirror's "find next" (that is Ctrl+G), so F3 went to WebView2's own find, which searches the whole
window and jumped to the preview. In Read mode Ctrl+F was that same window-wide find. F3 also toggled
between the search box and a real search. Wanted: the search stays in the pane (and the part of it) the
user works in; F3 finds the next match when there is a search, and shows and focuses the search box when
it is empty or not visible. The file search (Ctrl+Shift+F) is separate and stays.

## 2. The solution, in brief

A find bar per pane, between its tabs and its content, for the editor and the preview alike. Ctrl+F,
Ctrl+H, F3 and Shift+F3 are LexPen's own keys now, in the editor and outside it, so neither CodeMirror's
box nor WebView2's find appears. The code (`find.js`) loads on first use. A More menu setting chooses
between a search per pane and one search for both panes.

## 3. Behaviour

| Key | What it does |
|---|---|
| Ctrl+F | Shows the bar of the pane with the focus, filled with a one-line selection, and focuses it |
| F3 / Shift+F3 (also Enter / Shift+Enter in the box, Ctrl+G / Ctrl+Shift+G in the editor) | Next / previous match from the cursor, wrapping around. Empty search, or (per pane) a hidden bar: show and focus the bar instead |
| Ctrl+H | The bar with the replace row (editor) |
| Esc in the box | Closes the bar, removes the marks, focus back to the editor or preview |

- Which part is searched: Edit mode the editor, Read mode the preview; Split mode the part that had the
  focus last.
- Options: match case, whole word, regular expression; the file search's `^p`, `^t`, ... codes apply
  when not in regular expression mode.
- All matches are marked; the count shows "n of total". Editor: the match is selected, the focus stays
  in the editor when F3 is pressed there. Preview: the current match has a stronger mark and is
  scrolled into view.
- Replace (editor only): Replace (this one, then the next), All (one undo step). With a regular
  expression, `$1` etc. insert the groups.
- One search for both panes (More menu): one search text and options; F3 in the other pane goes on with
  it from the cursor there, showing the bar without taking the focus.
- Ctrl+Shift+F in the editor now opens the file search (CodeMirror's default opened its replace box).

## 4. Resolved issues during execution

| # | Issue | Resolution |
|---|---|---|
| 1 | Matches in the preview that run over formatting (`**quick** brown`) | The preview's text is searched as one string; a line break is put between blocks (paragraphs, list items, cells), so a match does not run from one paragraph into the next |
| 2 | Marking matches in the preview without changing the page | CSS Custom Highlights (no extra elements in the document); in the editor a CodeMirror overlay. A match over a line break is selected but not marked in the editor (an overlay works per line) |
| 3 | Large files | Counting and marking stop at 5000 matches; the count then shows "5000+" |
| 4 | Verified in the running app, with key events through the debugging port | find.js not loaded at start; Read: Ctrl+F, typing, F3 / Shift+F3 counts, match case, Esc; Edit: our bar (no CodeMirror box), F3 from the editor keeps the focus there, Ctrl+G; empty search and hidden bar open the box; replace one / all / one undo step / regex groups; `^p`; Split mode follows the focus; per pane vs one search; Ctrl+Shift+F in the editor. A real F3 sent to the window (not through the debugging port) opened LexPen's bar and no WebView2 find |
| 5 | CodeMirror's search addon (`dialog.js`, `search.js`) is still in `vendor/editor.js` | Unused now; left in place, can go at the next vendor rebuild |
