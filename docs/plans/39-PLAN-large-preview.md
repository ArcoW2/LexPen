# Plan 39: the preview of a large code file blocks the app

## 1. The defect

The preview of a large code file (AlleStoredProcs.sql: 7,260,535 bytes) freezes LexPen for seconds: when the
preview is first shown, and again every time you switch to its tab. Nothing tells you what is going on, and the
editor cannot be used meanwhile, even when the preview is not what you came for. The stall log has it too
(11:59:12, a script ran 6360 ms; 11:59:21, 5385 ms; both AlleStoredProcs.sql).

## 2. The solution, in brief

The code preview is built as blocks of lines that the browser lays out only when they come into view
(`content-visibility: auto`), so showing it or switching back to it costs about the same for a large file as for a
small one. The build itself runs in slices between frames, with a "Rendering preview..." notice in the preview
until it is done; the editor and the rest of the app keep responding, and a newer render (an edit, another tab)
cancels an older one.

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
(3.4) are still worth having for files where building the HTML is slow (colouring is on below 2 MB:
[not yet measured] for a large coloured file).

### 3.3 Blocks of lines

- The code preview's `<pre class="mm-code">` holds blocks of N lines each, `<div class="mm-chunk">`, around the
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

### 3.4 Built in slices, with a notice

- `renderNow` for a code file builds and attaches the blocks a slice at a time (a few blocks per frame), checking
  `tab.renderId` between slices so an edit or another render stops the old one. Until the last slice: a notice at
  the top of the preview, "Rendering preview...".
- Only when the build takes long enough to be seen: below [not yet decided] ms in one go nothing changes for
  small files.
- The passes after a render (preview cursors, highlights, occurrences, the scroll bar) run once, after the last
  slice.

### 3.5 What to check (risks)

Off-screen blocks have an estimated height until first shown, and asking for a position inside one lays it out.
To check with the large file and a small one:

- Scroll sync between editor and preview, both ways; previewjump (cursor bar in the preview, jumping to a line).
- Find in the preview, highlights and occurrences in the preview, and the preview's overview ruler: anything that
  measures every mark's position may lay out every block again and bring the freeze back.
- The outline's jump to a line; bookmarks in the preview.
- Selecting and copying across blocks; Ctrl+A in the preview.
- Long lines (`mm-long-line`) and wrapping; printing / export if the preview is used for it.
- The scroll position kept per tab (`previewTop`) landing on the same spot after a switch.

### 3.6 Tests

- The CDP measurement of 3.1 repeated after the change: first show, switch away, switch back, scroll to the middle,
  with the numbers it gives.
- During a slow build: typing in the editor and switching tabs respond; the notice is shown and goes away.
- Every check of 3.5, by hand or over CDP.
- Unit tests (`dotnet test tests\LexPen.Tests`) unchanged.

### 3.7 Open questions

1. Where the notice goes: in the preview (the proposal), in the status bar, or both?
2. Large files: should the preview of a code file over some size not open by itself at all (only when asked
   for), as you said it is often not what you came for? If so: which size, and is it a setting?
3. Blocks for every code preview (simplest, one way of working), or only above a size?
