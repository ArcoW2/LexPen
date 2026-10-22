# Plan: Overview ruler (marks along the scrollbar)

Status: executed 2026-10-22 (web/overview.js; in-app test t101). From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Where in the file the find matches, the changes, the bookmarks and the problems are, is visible only where they
are shown. Visual Studio's scroll bar shows marks for all of them (and a minimap if wanted).

## 2. The solution, in brief

A thin strip next to the scrollbar with a mark per find match, unsaved change, git change and bookmark, at its
place in the file; a click goes there. A setting shows or hides the strip, and one per kind which marks appear in
it; all on by default. Plan 06 (compare) adds its differences as one more kind.

## 3. Details

- Drawn as a canvas over the scrollbar's height, recomputed when its sources change (debounced).
- Colours: the gutter's (git), the find colours, the bookmark colour.
- A minimap (a small picture of the text) is left out: more work, less use.
- Settings (Editor view > Overview ruler, and View > Overview ruler): `overview` shows or hides the strip;
  `overview.find`, `overview.changes`, `overview.git`, `overview.bookmarks` each kind. All on by default (the strip
  is empty when there is nothing to mark). (As built the strip became the scroll bar and `overview` went; see 5.)
- The marks come from where they are made, not from the gutter: a kind can be in the strip while its gutter column
  is off.
- Problems (an opener without its closer, 3.7e of the reformat plan) are not a kind yet: the check reports them but
  does not give their lines to the editor. A kind of their own once it does.

### 3.1 Tests

In-app: find marks appear at their height; a click goes there; changes and bookmarks; the setting off.

## 4. Open questions

None.

## 5. Resolved during execution

| Topic | As built |
|---|---|
| Place | First a canvas inside the editor, left of its scroll bar, the text kept clear by padding; without wrapping the end of a long line still ran under it (reported twice; measured 10 px under it). Then, on your suggestion, the strip took the vertical scroll bar's place: the bar hidden, the editor 14 px narrower and the strip in that room, outside the text, so no text can reach it (measured: the text ends 3 px before it, scrolled fully right). The horizontal scroll bar stays. With the setting off the scroll bar is back. |
| The block | A block over the strip for the part of the text in view, as a scroll bar's thumb: as high as the view is of the whole text, at least 24 px, from the top of the strip (the text at its start) to the bottom (at its end). It moves on every scroll; the marks are not drawn again for that. |
| Where a mark lies | Where the block's middle is when the mark's line is in the middle of the view: a click on a mark centres its line and the block lands on the mark (reported: with the scroll bar the thumb ended above the mark, as the bar's track and the strip did not match; measured now: within 2 px). |
| Mouse | On the block: a drag, the text following the mouse one to one (also when the mouse leaves the strip). A mark within 3 px of the block's middle holds the drag on its line, in the middle of the view as a click on the mark puts it (reported: dragging onto a mark stopped some 80 lines before it, as a pixel of the strip is 231 lines of the 140175-line file, measured; several marks within a pixel: the first in the text). The line is centred by its exact height, not the strip's sampled ones (those put it 15 lines off). On a mark: the cursor to its line; on a mark under the block too when the mouse does not move. Elsewhere: the block's middle there, and the drag goes on from there. The wheel over the strip scrolls the text. |
| Lanes | Left to right in the 16 px strip, after a light line: unsaved changes (3 px), git changes (3 px), then a bookmark from there to the right edge (9 px) with a find match over its right part (5 px). First a bookmark went across the whole width and covered a find match, then it was a lane of 3 px, too small (both reported). A mark at least 4 px high, a change over several lines as high as those lines. |
| Colours | As the gutter and the find: unsaved changes the warning colour, git added / changed / deleted the git colours, find the current-match colour, bookmarks the accent. |
| Height | A line's place by its height in the text, so wrapped and folded lines count as they are shown; the heights sampled about twice per pixel of the strip and filled in between (asking for each of thousands of marks took 69 ms of a drawing, now 13 ms, measured on a 140175-line file). |
| Find | The lines of the matches in the editor while the find bar is open, worked out after the keystroke (find.js); closing the bar takes them away. Lines in a row are one mark. Matches in the preview have no lines and are not drawn. The find bar stopped at 5000 matches, so the marks stopped there too (reported: a file of 7782 `declare`, the marks ending at line 94230); it now finds up to a million. Typing in the find bar on a large file stalled with the gutter's line numbers or this strip on (reported); see the find bar's changes: the gutter marks only the lines in view, both are made after the keystroke, and from 5000 lines the search waits for a pause of 150 ms in typing. |
| Hunks | gutter.js makes the change and git hunks when the gutter column or the strip wants them, so a kind shows in the strip with its gutter column off. |
| Preview | A tab in preview mode has no strip. |
| The scroll bar | On your suggestion the strip is the editor's vertical scroll bar, always there: the setting `overview` and its action and menu item are gone (an `overview` left in a settings.json does nothing). The horizontal scroll bar has the same look (as high as the strip is wide, a light line along its top, a rounded thumb, no arrow buttons) and runs up to the strip. Settings, Editor view > Scroll bars: `overviewWidth` (10 to 40 px, default 20; the lanes take their share: at 16 px 3, 3, 9 and 5 px) and the kinds of marks. View > Scroll bar marks. The preview keeps its own scroll bar. |
| Scrolling sideways | With the vertical bar hidden by style only, CodeMirror still kept its width in reserve: with Scroll sideways before the edge at 1, the editor scrolled when 2.96 columns were left on the right (reported as 3; measured). The editor now uses a scroll bar model of its own (`mmHorizontal`, overview.js): CodeMirror's scroll bars without the vertical one, so no width is kept for it; measured now: 0.96 columns (t109). |
| Tests | t106 (in the app, on a 140175-line file): 11 checks pass on two runs: the scroll bar hidden, the block; a click on a mark and the block on it; dragging the block 120 px; a click elsewhere; the wheel; the text clear of the strip with and without wrapping; the setting off. t104 / t105: the find bar on that file (every match counted, the keys timed). t101 (in the app): 19 checks pass on four runs in a row: the strip there; git, find, unsaved changes and bookmark marks on their lines; the find marks gone when the bar closes; a click on a mark and its tooltip; a gutter column off with its kind still in the strip; a kind off; the strip off and on; the View menu, the settings rows, the action; a preview tab. |
