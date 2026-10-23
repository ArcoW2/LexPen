# Plan: Highlights

Status: executed 2026-10-24 (web/highlights.js, sourcemap.js, highlights.worker.js, highlightsview.js; HighlightStore.cs,
HighlightsForm.cs; unit tests HighlightStoreTests; in-app tests t133, t134, t135).
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
- Bound to the document, not to an editor or a preview: a document has one set of highlights and notes, and every
  view of it shows that set: its editor and its preview, both panes when it is in both, a second tab of it. Made,
  changed or removed in any of them, it changes in all at once. Another LexPen window showing the same file gets the
  change too (the host tells it, as it does for a file saved elsewhere). Only the look is per place (3.1, the
  editor's and the preview's settings), never the highlights themselves.
- Every kind of file: a highlight is made and shown the same way whatever the language (markdown, SQL, C#, plain
  text, ...), in the editor and in the preview (a code file's preview shows its text as it is, 3.4).
- One highlight colour, the one there is (the theme colour `highlight` and the settings below); no set of colours.
  Later a highlight might get a colour of its own that overrules the default: not in this plan.
- One look for all highlights per place, each place its own settings, so the preview can be yellow while the
  editor underlines:
  - The editor: Editor view > Highlight (built with the compare's mirrored selection): `highlightStyle` (a
    background colour or underlined), `highlightColour` (default the theme's `highlight`, yellow),
    `highlightIntensity` (0-200%, default 100%: the colour itself).
  - The preview: Preview > Highlight, the same three of its own: `previewHighlightStyle`,
    `previewHighlightColour`, `previewHighlightIntensity`, with the same defaults (background,
    the theme's highlight, 100%). Its colour comes from the
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
- Action Selection to highlight (`highlight.fromSelection`): the selection becomes a highlight, and only that: it
  never removes one (Highlight toggles). Nothing selected: nothing happens. In the editor and in the preview; several
  cursors or a column block: one per selection; touching or overlapping a highlight: merged with it.
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
- Search: a box at the top of the window (Ctrl+F in the window puts the focus there) to find a highlight by its note
  or its text quickly:
  - As you type, the list keeps only the highlights whose note or text contains it (any case; more words: all of
    them, in any order), the matching parts marked in the list; the count shows how many.
  - In This file or in All files, as the choice at the top says; a search with no match in this file offers, in one
    click, to search all files.
  - Enter (or a double click) goes to the first match, Up / Down and Enter to another one, as a click does: the
    window stays open, the search stays, so the next match is one key away.
  - Going there means where the document is shown: the editor (the highlight selected, placed as a found place), and
    a preview of it scrolls to it as well (its cursor bar beside it); a document shown as preview only: the preview
    scrolls to it and the highlight blinks once.
  - Esc empties the search; Esc again returns the focus to the LexPen window.
- Right-click on a highlight in the list: Edit note, Remove highlight.

### 3.6 Kept with the file

- The host keeps them per file in `highlights.json` in the state folder (a HighlightStore like BookmarkStore): per
  file path (a draft by its id) the file's size and change time as last seen, and a list of highlights, each
  { from: [line, ch], to: [line, ch], text, before, after, note, state }: `text` the highlighted text, `before` and
  `after` a short piece of the text around it (to find it back), `state` empty, `adjusted` or `detached` (below).
  Not limited to the last n files: highlights are your own work, and they take little room.
- Written a second after a change, and when the window closes (as bookmarks).
- Read when a document opens, and again when a file changed outside LexPen is reloaded. Placing them:
  1. The file is as last seen (the same size and change time): the stored places are used as they are.
  2. Changed, the highlighted text still there: exactly once, there; more than once, where the text around it
     (`before`, `after`) matches best, then the nearest to the old place. This covers lines added or removed above.
  3. The highlighted text itself changed a little (a word edited): the most similar text near the old place, the text
     around it as a guide, when it is clearly the same passage. The highlight goes there and is marked `adjusted`: a
     small sign at it, and in the window "the text was: ..."; it stays marked until you confirm it (the highlight's
     right-click: Keep) or change it.
  4. The text is gone (deleted, or changed beyond recognition): the highlight is kept, `detached`, with its text and
     note. The window shows it greyed in a group "No longer in the file", with Remove and Attach to selection (select
     the right text: the highlight and its note go there). Nothing is dropped without you.
  After opening or reloading, a message says what happened when anything did ("2 highlights adjusted, 1 detached").
- Placing never holds up starting LexPen or opening a file: the file opens and can be read and edited at once, and
  its highlights appear when they are placed. Case 1 (the file unchanged) is only reading the stored places and
  costs nothing worth noting; cases 2 to 4 (looking the text up) run in the background with low priority: in a
  worker (as the compare's diff and word completion do), the host's store read off the UI thread (as file reading
  is), and the lookup started only once the window is idle (`requestIdleCallback`), the document in view first,
  other open documents after it. An edit made meanwhile is taken into account: the lookup works on the text as it
  is when it runs, and a highlight is placed by its found text, not by a position that has moved since.
- Every highlight placed (1 to 3) is written back as it is now in the file: its range, its text and the text around
  it, and the file's size and change time. The next lookup starts from the file as it is, not from an older state it
  would drift further from; an `adjusted` highlight keeps its mark (and the text it was) until confirmed.
- Where they are kept, setting `highlightsStore` (Files > Highlights): `store`, LexPen's own store as above (the
  default), or `beside`, a file next to the highlighted one: its whole name plus `.lph` (LexPen highlights), so
  `report.md` has `report.md.lph` and `report.sql` its own. That file holds the same as the store holds for one file
  (size and change time, the highlights) as JSON, so it travels with the file (a copy, git, a sync) and another
  LexPen finds it.
  - Reading: a `.lph` next to the file wins, whatever the setting (it came with the file); else the store.
  - Writing: where the setting says. Switching it moves a file's highlights the next time they are written (and
    removes them from the other place); a button beside the setting moves them all now.
  - A `.lph` with no highlights left is removed. A folder that cannot be written to (read-only, no rights): the store,
    and a message says so once.
  - Drafts stay in the store (they have no place on disk yet); saved as a file, they follow the setting.
  - A file renamed, moved or deleted inside LexPen: its `.lph` goes along (or is deleted with it).
  - The folder pane does not list `.lph` files (they belong to their file); the file's own row gets a small mark when
    it has highlights next to it.
- A draft saved as a file: its highlights move to the file's path (as bookmarks do).
- A file renamed or moved inside LexPen (the folder pane): its highlights go along. Renamed outside LexPen: they stay
  under the old path; the All files list shows such a file as missing, with Remove to drop its highlights.
- Read-only files can be highlighted: a highlight does not change the file.

### 3.7 Keys (actions, can be changed in keys.json)

| Action | Key |
|---|---|
| Highlight (toggle) | Ctrl+F8 |
| Selection to highlight | no key; menus (Edit, the editor's and the preview's right-click) and the command palette |
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
  - One set per document: a highlight made in the preview shows in the editor and the other way round, in both panes
    and in a second tab of the document; a note written in one is there in the others; another window showing the
    file gets it.
  - Toggle off at the cursor; Remove within a selection; Remove all asks, then none left.
  - Selection to highlight: a selection becomes one; on a highlighted selection it stays (no toggle); nothing
    selected: nothing; from a selection in the preview.
  - Overlapping highlights merge.
  - Edits: typing inside and at the edges, deleting a highlighted text.
  - Next / previous: placement, the message at the end, places back / forward.
  - The preview: a highlight from the editor shows there (over bold text, a link, across two blocks); one made
    from a preview selection lands on the right source text; a list number cannot be highlighted (message).
  - Notes: write one (a highlight made first when needed), change it, empty it (the highlight stays); the tooltip
    and the note sign in the editor and the preview; removing a highlight with a note asks.
  - The window: lists the document's highlights with their notes, follows another document and an edit, All
    files, a click goes there and the window stays open.
  - Search in the window: by a word of a note and of a text, two words in another order, the matching parts marked,
    the count; no match here: the offer to search all files; Enter to the first match in the editor (and its preview),
    Down and Enter to the next one, the window and the search staying; a document in preview only (scrolled there,
    the blink); Esc twice.
  - Restart: the highlights are back as they were (the file unchanged: the stored places).
  - Kept next to the file: `report.md.lph` written, read back after a restart, a `.lph` found next to a file wins
    over the store, the setting switched (moved on the next write, and by the button), a read-only folder (the
    store and the message), not listed in the folder pane.
  - A large file (140,000 lines) with many highlights, changed outside: the file is shown and typing works before the
    highlights are placed (the host keeps answering, measured as the stall tests do); they appear afterwards.
  - The file changed outside meanwhile: lines added above (moved), the same text twice (the one whose surroundings
    match), a word changed inside a highlight (adjusted, the old text shown, Keep confirms it), a highlighted passage
    deleted (detached, in "No longer in the file"; Attach to selection puts it back with its note); the message
    names the counts; the store holds the new places, text and surroundings afterwards.

## 4. Open questions

None.

## 5. Resolved during execution

| Topic | As built |
|---|---|
| Right-click menus | The editor and the preview have no menu of their own: they show the browser's. The highlight items (Highlight, Selection to highlight, Highlight note..., Remove highlight) are added to that menu by the host (ContextMenuRequested), so Cut / Copy / Paste and spelling stay; a chosen item comes to the page as the event contextAction. |
| Rename / move / delete in LexPen | LexPen has no rename, move or delete of files (the folder pane has none). HighlightStore has Move and Delete (unit tested) for when it gets them; a Save as takes the highlights along. |
| The preview's characters | sourcemap.js: per block its own text lined up with its source lines, markdown's marks skipped (also used to place a selection made in the preview); code exact per line, a fence by its lines. |
| Marks on the document | A shared mark on the main Doc. CodeMirror keeps a shared mark's place in a tab's linked Doc; releasing that tab (releaseTabDoc: closing it, moving it) took the place along, and the highlight seemed gone in the other tabs. Each highlight keeps the main Doc's own part (rootMark), and a tab released makes the marks again. A reload from disk or Revert to saved replaces the whole text (the marks with it): kept just before and placed again in the background. |
| Marks made again | Only when a highlight's look changes (its note, adjusted or not), at the place the old mark has then; no longer all of them on every change. |
| Placing a changed file | The worker weighs every candidate (between the old surroundings, right after the text before, right before the text after) and takes the most alike; case and runs of spaces do not count ("alpha" written "ALPHA" is adjusted, not detached). |
| The move-all button | The settings window has no buttons: the action Move all highlights to where the setting says (Edit > Highlights, the command palette) does it. |
| Confirm | The page's own OK / Cancel box (the viewer shows no confirm()). |
| Large files | Places to offsets and back through the text's line starts, made once per text (binary search), not by walking the text per highlight: t135 (AlleStoredProcs.sql, 140,000 lines, 234 highlights, a line added outside LexPen) placed them all 327 ms after the file showed, the host answering within 44 ms meanwhile; before this, 3.5 to 5 s with the page busy. |
| Tests | Unit: HighlightStoreTests (7). In-app t133 (24 checks): highlight in the editor (bold text, a link's text), merge, a fence, toggle off, store and restart, the document in two tabs one closed, a note (tooltip, signs), next / previous, from a preview selection, remove with a note asks, changed outside (moved, adjusted with the old text, Keep), next to the file (.lph, not in the folder pane, the file marked). t134 (11): the window's list, name and count, search (a note, two words in any order), Enter there with the window open, the offer to search all files, another file opened at its highlight, Esc. t135 (3): a large file changed outside: typing works at once, the host answers within 250 ms, all its highlights placed afterwards. Not tested in the app: the browser menu's items (a native menu), the preview-only blink. |
