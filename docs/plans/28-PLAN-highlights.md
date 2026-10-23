# Plan: Highlights

Status: draft 2026-10-23, not started.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

There is no way to mark parts of a document as important and find them again: bookmarks mark a line, find marks
what matches a search, and both are gone from view as soon as you move on. A highlighter pen for text is missing,
in the editor and in the preview, kept with the file, with a way to walk through the marked parts and to see them
all at once.

## 2. The solution, in brief

Select text in the editor or the preview and give the command Highlight: that text gets the highlight, in the
editor with the look of Editor view > Highlight, in the preview with a look of its own (Preview > Highlight), each a
background colour or underlined with its colour and intensity. A highlight belongs to
the source text, so it shows in the editor and in the preview alike, moves along with edits and is kept per file
until you remove it. A highlight can carry a note, shown when the mouse rests on it. Next / previous highlight goes
through them as find does. A highlights window, separate and not modal, lists them with their notes; a click on one
goes there and leaves the window open.

## 3. Details

### 3.1 What a highlight is

- A range in the document's source text: from (line, column) to (line, column), plus the highlighted text itself
  (to find it back, 3.6), and optionally a note (3.2a). Kept in the source, never in the rendered preview, so the editor and the preview show
  the same highlights and an edit in either keeps them right.
- One look for all highlights per place, each place its own settings, so the preview can be yellow while the
  editor underlines:
  - The editor: Editor view > Highlight (built with the compare's mirrored selection): `highlightStyle` (a
    background colour or underlined), `highlightColour` (default the theme's `highlight`, yellow),
    `highlightIntensity` (0-200%).
  - The preview: Preview > Highlight, the same three of its own: `previewHighlightStyle`,
    `previewHighlightColour`, `previewHighlightIntensity`, with the same defaults. Its colour comes from the
    preview's theme when the preview has a theme of its own (a light preview next to a dark editor), and the
    intensity is measured from the preview's background.
  - The text keeps its own colours in both.
- Highlights may not overlap: highlighting text that touches or overlaps a highlight merges them into one.
- In the editor a highlight is a CodeMirror mark (`markText`, class `mm-hl`): it moves with every edit by itself.
  Text typed inside a highlight is inside it; text typed at its edges is outside it. A highlight whose text is
  deleted entirely is gone.

### 3.2 Making and removing one

- Action Highlight (`highlight.toggle`): the selection gets a highlight; with the cursor in a highlight and nothing
  selected, that highlight is removed. In the editor and in the preview (3.4). With several cursors or a column
  block: one highlight per selection.
- Action Remove highlight (`highlight.remove`): the highlight at the cursor, or every highlight within the
  selection.
- Action Remove all highlights in this file (`highlight.clear`): asks first ("Remove the n highlights in
  report.md?", the count from the document itself).
- The editor's and the preview's right-click menus: Highlight / Remove highlight, as fits.
- Undo: making or removing a highlight is not a text change and is not in the undo history of the text. Ctrl+Z
  after removing a highlight does not bring it back; Remove all asks first for that reason.

### 3.2a Notes

- Action Highlight note (`highlight.note`), also in the right-click menus: on the highlight at the cursor (editor) or
  under the selection or the click (preview), a small box to write or change its note: plain text, more lines
  allowed, Enter for a new line, Ctrl+Enter or OK to keep it, Esc to leave it as it was. On a selection that is not
  highlighted yet, it highlights it first. An empty note removes the note, not the highlight.
- Shown:
  - The mouse resting on a highlight with a note (editor or preview): the note as a tooltip.
  - A highlight with a note gets a small note sign at its end, in the highlight's colour (the editor: a CodeMirror
    bookmark widget; the preview: a small element placed at the range's end, as the preview's find boxes are
    placed), so a note can be seen without hovering.
  - The highlights window shows the note under the highlight's text, and its filter looks in notes too.
- Removing a highlight with a note asks first ("Remove the highlight and its note?"); Remove all says how many
  have notes.
- Kept with the highlight (3.6): `note` in its entry.

### 3.3 Going through them

- Next highlight / Previous highlight (`highlight.next`, `highlight.prev`): from the cursor (editor) or from the
  top of what is visible (preview) to the next / previous highlight, selected, placed as a found place
  (Find > Jump to a found place, `revealFound`). Past the last one: as find does at the end of the file (the
  setting Search: at the end of the file, `findWrap`: stop with a message, or go on from the other end).
- A found place for position back / forward (places.js), as a find is.
- The scroll bar (overview ruler) gets a mark per highlight in the highlight colour, setting Scroll bars > marks
  `overview.highlights` (on by default).

### 3.4 In the preview

- Shown with the CSS Custom Highlight API (`CSS.highlights`, `::highlight(mm-hl)`), as the preview's find marks are
  now (find.js `previewRange`): no change to the rendered page. Its look is the Preview > Highlight settings (3.1).
  The background style is a `background-color`; the underline style is a `text-decoration` underline in the colour
  (the API allows no box-shadow), so it may break under descenders.
- Placing a source highlight in the preview: the preview's blocks carry their source line (`data-line`). Within the
  block that holds the highlight's start, the highlighted text is looked up in the block's rendered text, with the
  markdown markup (`* _ \` [ ] ( ) # >`, a link's address) left out of the comparison; the n-th occurrence in the
  source is the n-th in the block. A highlight over several blocks is placed per block.
- Making one from a selection in the preview: the other way round. The selected rendered text is looked up in the
  source lines of its block, markup skipped, the occurrence counted the same way. When it cannot be placed (text
  that markdown made up itself: a list number, a table border, a diagram), a message says so and nothing is
  highlighted.
- Code files in the preview (shown coloured, not rendered): their text is the source text, so placing is direct.
- Split view: a highlight made in either half shows in both.

### 3.5 The highlights window

- A window of its own, like the character picker (CharPickerForm): one for the whole app, not modal, owned by the
  window it was opened from, movable and resizable, its place and size kept. Action Highlights window
  (`highlight.list`); also from the View menu.
- It lists the highlights of the document last worked in (the active pane of the LexPen window last active), in
  text order: per highlight its line number, its text (one line, shortened with `...`) and its note if it has one. Above the list the
  file's name and the count. It follows: another document, a new or removed highlight, an edit, and the list
  changes with it.
- A choice at the top: This file / All files. All files lists every file with highlights (from the store, 3.6),
  grouped per file, the open ones first.
- A click on a highlight: the LexPen window comes to the front, the file opens there if it is not open (All files),
  and the cursor goes to the highlight as with Next highlight (selected, placed as a found place). The highlights
  window stays open and where it is. Up / Down and Enter in the list do the same from the keyboard.
- A filter box: only highlights whose text or note contains what is typed.
- Right-click on a highlight in the list: Edit note, Remove highlight.

### 3.6 Kept with the file

- The host keeps them per file in `highlights.json` in the state folder (a HighlightStore like BookmarkStore): per
  file path (a draft by its id) a list of { from: [line, ch], to: [line, ch], text, note }. Not limited to the last n
  files: highlights are your own work.
- Written a second after a change, and when the window closes (as bookmarks).
- Read when a document opens. When the file changed outside LexPen meanwhile, each highlight is placed back by its
  text, as bookmarks are (BookmarkStore.Resolve): at its place when the text there is still its text; else at the
  nearest occurrence of its text; else it is dropped, and a message names how many were dropped.
- A draft saved as a file: its highlights move to the file's path (as bookmarks do).
- A file renamed or moved inside LexPen (the folder pane): its highlights go along. Renamed outside LexPen: they stay
  under the old path; the All files list shows such a file as missing, with Remove to drop its highlights.
- Read-only files can be highlighted: a highlight does not change the file.

### 3.7 Keys (actions, can be changed in keys.json)

| Action | Key |
|---|---|
| Highlight (toggle) | Ctrl+F8 |
| Next / previous highlight | F8 / Shift+F8 |
| Highlights window | Ctrl+Shift+F8 |
| Remove highlight, Remove all highlights | no key; menus and the command palette |

F8 is next to F7 (next difference), which works the same way. None of these keys is in use now.

### 3.8 What stays as it is

- The compare's mirrored selection keeps its own mark (`mm-cmp-mirror`) with the same look; it is not a highlight
  and is not kept.
- Find's marks, bookmarks and the selection are drawn as now; a highlight lies under the selection and under find's
  current match.

### 3.9 Tests

- Unit: HighlightStore get / set / remove, Resolve (unchanged file; a line inserted above; the text moved; the text
  gone: dropped), a draft moved to a path.
- In-app (a test data folder, the debug build):
  - Highlight a selection in the editor: the mark, the look per setting (background, underline).
  - The preview's own look: a background in the preview while the editor underlines, and the other way round; the
    preview's colour from a preview theme of its own.
  - Toggle off at the cursor; Remove within a selection; Remove all asks, then none left.
  - Overlapping highlights merge.
  - Edits: typing inside and at the edges, deleting a highlighted text.
  - Next / previous: placement, the message at the end, places back / forward.
  - The preview: a highlight from the editor shows there (over bold text, a link, across two blocks); one made
    from a preview selection lands on the right source text; a list number cannot be highlighted (message).
  - Notes: write one (a highlight made first when needed), change it, empty it (the highlight stays); the tooltip
    and the note sign in the editor and the preview; removing a highlight with a note asks.
  - The window: lists the document's highlights with their notes, follows another document and an edit, the
    filter (text and notes), All files, a click goes there and the window stays open.
  - Restart: the highlights are back; the file changed outside meanwhile: placed by text, one dropped and named.

## 4. Open questions

1. One highlight colour, or several (for instance yellow, green, blue, red as with a set of highlighter pens), each
   highlight with its own? Several would add a colour choice to Highlight (a submenu, or a key per colour) and a
   column in the window. The plan above has one.
2. Is the All files part of the window wanted from the start, or only This file first?
