# Plan 39: the preview of a large code file blocks the app

## 1. The defect

The preview of a large code file (AlleStoredProcs.sql: 7,260,535 bytes) freezes LexPen for seconds, and two
things make it worse than a one-off wait:

- **It comes back on every tab switch.** Switching away and back costs the same seconds again, each time.
- **It cannot be stopped.** While it renders the app does not respond, so the preview cannot be switched off,
  even when it is not what you came for. Nothing tells you what is going on.

The stall log has it too (11:59:12, a script ran 6360 ms; 11:59:21, 5385 ms; both AlleStoredProcs.sql).

## 2. The solution, in brief

Switching back to a tab no longer redoes the preview's layout: the browser lays out only the lines in view
(blocks of lines with `content-visibility: auto`), and a tab's preview keeps its layout while another tab is
shown. A first render runs in slices between frames with a "Rendering preview..." notice in the preview, so the
app keeps responding: switching the preview off (or to another tab) during it stops the render. A code file over a
size you set does not open its preview by itself.

## 3. Details

### 3.1 Where the time goes (measured)

Measured in a debug-build test copy (port 9333, scratch data folder) over CDP, AlleStoredProcs.sql (7,121,780
characters as read; over `PREVIEW_COLOUR_LIMIT`, so plain text, no colouring), editor and preview side by side:

| Step | ms |
|---|---|
| `codeHtml` (the HTML text) | 62 |
| Parsing it into a template | 138 |
| Attaching it to the article | 96 |
| The browser's layout of it (first `scrollHeight` read) | 6438 |
| `renderNow` as a whole | 6612 |
| Switching to another tab | 142 |
| Switching back | 6529, and 7205 on a second run |

On switching back, the time is in `showActive` itself, at `web/app.js:1299` (`pane.previewEl.scrollTop =
tab.previewTop` right after the article is put back): setting the scroll position forces the layout of the whole
preview again. Not a re-render: the article is kept, but a detached article is laid out from scratch when it
comes back.

So the JavaScript is cheap; the cost is the layout of a block per line for the whole file, on the page's own thread.

### 3.2 Why "render in the background" alone does not help

Layout cannot run off the main thread (a worker has no DOM), and building the HTML in slices only spreads the
part that already takes a few hundred ms. The layout has to become small. The background slices and the notice
(3.6) are still worth having for files where building the HTML is slow (colouring is on below 2 MB:
[not yet measured] for a large coloured file).

### 3.3 Blocks of lines

- Every code preview (not only a large one: one way of working) has its `<pre class="mm-code">` hold blocks of N
  lines each, `<div class="mm-chunk">`, around the
  `<div data-line>` lines it has now. Every line keeps its own `data-line` div, so the outline, the scroll sync,
  previewjump and sourcemap (the users of `[data-line]`) find the same elements.
- CSS: `.mm-chunk { content-visibility: auto; contain-intrinsic-block-size: auto <N>lh; }`. Off-screen blocks are
  not laid out; once shown, a block remembers its real height (`auto`).
- Tried by hand in the test copy, N = 500, the same file (the only N tried):

| Step | Before | With blocks |
|---|---|---|
| Layout after attaching | 6438 | 26 |
| Building the block HTML (the test split the finished HTML; done in `codeHtml` it is less) | -- | 659 |
| Scrolling to the middle | -- | 50 |
| Switching to another tab | 142 | 118 |
| Switching back | 6529 / 7205 | 467 |

- What is left in "switching back" is [not yet measured] (the passes after it: preview cursors, highlights,
  occurrences, the preview's scroll bar).
- Markdown previews keep their layout; a large markdown file is not in this plan.

### 3.4 The tab switch: keep the layout

The repeated cost on a tab switch is not a rebuild (the article is kept, `tab.stale` stays false): the article is
taken out of the page when another tab is shown (`replaceChildren` at `web/app.js:1297`), and an article taken out
of the page loses its layout. Two ways, not exclusive:

- **Blocks (3.3).** The re-layout is then only the blocks in view: measured 467 ms instead of 6529 / 7205 ms.
- **Keep the article in the page.** Inactive tabs' articles stay in the preview element, hidden with
  `content-visibility: hidden` (which, unlike `display: none`, keeps the rendering state), and only the active one
  is shown. Switching back then needs no layout at all. [not yet measured]; to check: memory with many tabs open,
  and that find, the outline and the scroll bar only see the active article.

The proposal is both: blocks for the first show and for scrolling, the kept article for the switch.

Built: the blocks only. With them the switch back measured 148 ms (250 ms in a later run, with the passes after it),
so the kept article was not needed and not built.

### 3.4a Results (measured after the change, same file, same test copy)

| Step | Before | After |
|---|---|---|
| First show (notice, blocks attached in slices) | 6612 | 477 / 625 (two runs) |
| Switching back to the tab | 6529 / 7205 | 148 / 250 |
| Scrolling to the middle | -- | 28 |
| Showing all occurrences of a word (2084 in the file): longest stall | -- | 300 |
| Tab away and back with those occurrences shown: longest stall | -- | 589 (first try: 3943, see below) |
| The editor to line 100000 (the preview follows): longest stall | -- | 415 |

The preview's scroll bar placed its marks by measuring each one (up to 3000 ranges), which laid out the blocks of every
mark again: 3.9 s per tab switch with occurrences shown. A mark in a code preview now goes by its line number as a share
of the code's height (previewoverview.js); measured 6531 px off for one mark in 2,577,487 px of content (the blocks'
estimated heights), a pixel or so on the strip.

### 3.5 Stopping a render

- During a render the app responds (3.6), so the Editor / Preview switches and the tab strip work.
- Switching the preview off, switching tabs, or editing the text stops the render that is under way (`tab.renderId`
  is checked between slices). The part built so far is dropped; the tab is marked `stale`, so it renders again
  only when its preview is shown again.
- Today the slow part is one layout of the whole file that cannot be interrupted; with blocks there is no long
  step left to wait for.

### 3.6 Built in slices, with a notice

- `renderNow` for a code file builds and attaches the blocks a slice at a time (a few blocks per frame), checking
  `tab.renderId` between slices so an edit or another render stops the old one. Until the last slice: a notice at
  the top of the preview, "Rendering preview..." (in the preview only, not in the status bar).
- Only when the build takes long enough to be seen: below [not yet decided] ms in one go nothing changes for
  small files.
- The passes after a render (preview cursors, highlights, occurrences, the scroll bar) run once, after the last
  slice.

### 3.6a A large code file: the preview only when asked for

- A setting (Settings > Preview): a code file larger than it opens without its preview (editor only), whatever its
  language would open in; the Preview switch (or Side by side) shows it when wanted. Default 3 MB (colouring already
  stops above 2 MB, `PREVIEW_COLOUR_LIMIT`); 0: no limit.
- Only how such a file opens: a tab already showing its preview keeps it, and View in LexPen (the project for
  viewing) still shows the preview, as that is what it was asked for.

### 3.7 What to check (risks)

Off-screen blocks have an estimated height until first shown, and asking for a position inside one lays it out.
To check with the large file and a small one:

- Scroll sync between editor and preview, both ways; previewjump (cursor bar in the preview, jumping to a line).
- Find in the preview, highlights and occurrences in the preview, and the preview's overview ruler: anything that
  measures every mark's position may lay out every block again and bring the freeze back.
- The outline's jump to a line; bookmarks in the preview.
- Selecting and copying across blocks; Ctrl+A in the preview.
- Long lines (`mm-long-line`) and wrapping; printing / export if the preview is used for it.
- The scroll position kept per tab (`previewTop`) landing on the same spot after a switch.

### 3.8 Tests

- The CDP measurement of 3.1 repeated after the change: first show, switch away, switch back, scroll to the middle,
  with the numbers it gives.
- Switching away from the large file and back, several times: each switch back is as fast as the first one after
  the change, with the scroll position kept.
- During a slow build: typing in the editor and switching tabs respond; the notice is shown and goes away.
- Switching the preview off during a build: it stops at once, the editor stays; switching it on again renders anew.
- Every check of 3.7, by hand or over CDP.
- Unit tests (`dotnet test tests\LexPen.Tests`) unchanged.

### 3.9 Open questions

None: the notice in the preview (3.6), a size setting for opening without the preview (3.6a), blocks for every
code preview (3.3).
