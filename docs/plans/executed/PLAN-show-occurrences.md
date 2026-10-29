# Plan: Show all occurrences of the selection

Status: executed 2026-10-29 (web/occurrences.js; in-app test t34).
The number in the file name is the priority; rename to reorder.

## 1. What this is about

To see where else a word or a piece of text is used, the only way now is Find: it moves the cursor to the first
match, and its highlighting is the same one a real search uses, so looking and searching cannot be done at once.
Selecting text, or double-clicking a word, shows nothing about the other places it occurs, as other editors do.

## 2. The solution, in brief

An Occurrences bar in the pane, laid out like the find bar but without a current match and without moving the
cursor: whatever is in its field is marked everywhere in the document, in the editor and in the preview, in a colour
of its own, and on the scroll bar strip. The field is filled by "Show all occurrences of this selection" in the
right-click menu, and, when switched on in the settings, by a double click on a word in the editor or by any selection of a minimum
length; each time the new text replaces the old. Find keeps working at the same time, with its own colours. Three
settings: double click shows occurrences (off), a selection shows occurrences with a minimum length (off), the bar
itself (on).

## 3. Details

### 3.1 The bar

- Its own row in the pane, below the find bar when both are open: the label Occurrences, the field, the count
  ("<n> occurrences"), Aa (match case), W (whole word), .* (regular expression), First, Clear (added 2026-10-29:
  the field emptied and nothing marked, the bar stays; as View > Occurrences > Clear occurrences), and an X that
  closes the bar.
- First: the cursor to the first occurrence in the document (most times the declaration, or the parameter of a
  procedure), the occurrence selected and placed in view as a found place (`revealFound`), and a place for position
  back / forward (`asFound`), so Ctrl+Alt+- returns to where the cursor was. In the preview (the focus there, or a
  preview only tab): the preview's own cursor there (`previewCursorTo`, web/previewcursor.js), in view. The only
  thing in the bar that moves a cursor.
- One bar for the tab, for its editor and its preview alike (in split view both halves are marked from the same
  field); per pane, as Find (and shared with the other pane when "One search for both panes" is on).
- No Previous / Next and no current occurrence: an occurrence is only marked text. The scroll bar strip shows where
  they are; a click there scrolls to it, as for any mark.
- Typing in the field, or changing a switch, marks again, as Find does while typing (the same delay on long files,
  the same limit). It never moves the cursor (only First does) and takes the focus only when you click in it.
- The field keeps its last texts (as the find history), Up / Down in the field; the `^p`, `^t` codes of the find
  field work in it too.
- The bar is not needed for the occurrences to work: closing it leaves them marked; they are cleared only by View >
  Occurrences > Clear occurrences (Esc in the editor does not clear them: it has other work there).
- Showing and closing, by the setting Show the Occurrences bar (on by default):
  - On: the bar shows in every pane with a document, from the start (changed 2026-10-29: first it only opened with
    occurrences), and opens again for every new one, also after it was closed.
    Esc in its field does not close it (the focus goes back to the editor or the preview).
  - Off: showing occurrences does not open the bar. It can be opened by hand (View > Occurrences > Show bar);
    then Esc in its field closes it.
  - The X, and View > Occurrences > Close bar, close the bar for now; neither changes the setting.

### 3.2 Filling the field

Each of these puts its text in the field, replacing what was there, and marks it:

- The right-click menu with a selection, in the editor and in the preview: "Show all occurrences of this selection":
  the selected text as it is (Whole word off, Match case on). A selection over several lines: as several lines (the
  field shows `^p` for the line breaks). Several selections (multiple cursors) or a block (column mode): only the
  first goes into the field, the first selection or the block's first line; this holds for every way of filling it
  below as well.
- A double click on a word, with the setting Double click shows all occurrences (off by default): the word, Whole
  word on and Match case on. In the editor only: a double click in the preview keeps doing what it does now, the
  editor with that word selected (`previewToEditor`, web/previewjump.js), and does not fill the field. In the
  preview the field is filled only from a selection (the right-click item, or the selection setting below).
- A selection, with the setting A selection shows all occurrences (off by default) and its minimum length (in
  characters, 3 by default): every selection of at least that length, made by mouse or keys, in the editor or the
  preview, once the selection stops changing (as the find field waits for a pause in typing); a shorter selection
  leaves the field as it is. A selection LexPen makes itself (a find, a jump, the word selected by a double click
  in the preview) does not count: only one you make.
- Actions `occurrences.show` (the selection, else the word at the cursor), `occurrences.clear` and
  `occurrences.bar` (show / close the bar for now), so keys can be given; Edit menu: Show all occurrences.
- View > Occurrences: Clear occurrences, and Show bar / Close bar (one item, by whether the bar is open: for now,
  the setting stays as it is). The setting itself is in Options > Settings.

### 3.3 Marking

- A colour of its own in every theme: a new colour field `occurrenceHit`, the background of each occurrence,
  written into each shipped theme file (Light, Dark, Black and every other one), so each theme shows and sets it
  like its other colours. Its value per theme: that theme's highlight background (`highlight`) a little stronger:
  brighter on a dark theme, darker on a light one. A theme of your own without the field takes its base theme's, as for any colour. Also `occurrenceBox`, the
  outline drawn around the occurrences when they are few (as `findBox`), in every theme the same way. Find's
  `findHit` / `findCurrent` stay as they are; where an occurrence and a find match fall on the same text, the find
  match is drawn over it.
- The list of colour names (docs/features.md, Themes) gets the two new names.
- The editor: the same machinery as Find (an overlay for long files, marks when there are few), as a second
  instance with its own class names, so neither clears the other.
- The preview: the occurrences of the field in the rendered text, as Find searches a preview, drawn with the CSS
  Custom Highlight API under a name of their own (`mm-occ-<pane>`), so Find's and the pen highlights stay apart.
- The scroll bar strip (overview.js, previewoverview.js) gets a lane `occurrences`, with its own setting
  (View > Scroll bar marks > Occurrences), as find matches have.
- Edits: the marks follow the text (marked again after a change, as Find does), in the editor and after the preview
  is drawn again.

### 3.4 Settings

| Setting | Default | What |
|---|---|---|
| Show the Occurrences bar | on | On: the bar opens with every new occurrence, Esc keeps it. Off: marking only; the bar by hand (View > Occurrences > Show bar), Esc closes it |
| Double click shows all occurrences | off | A double-clicked word fills the field |
| A selection shows all occurrences | off | Every selection of the minimum length fills the field |
| Minimum length for a selection | 3 | Characters a selection needs before it is shown |

The colours come from the theme (3.3), not from a setting.

### 3.5 Not in this plan

- Selecting all occurrences as cursors (the multiple-cursor plan has Add occurrence already).
- A current occurrence, or going from one to the next (Find does that).

### 3.6 Tests

- In-app (debug build, test data folder): the right-click item with a selection inside a line and over two lines, in
  the editor and in the preview; the field replaced by each new one; typing in the field marks again; the switches;
  the cursor never moves, except by First (to the first occurrence, selected, in view; back with Ctrl+Alt+-; in
  the preview the preview's cursor); Find opened on another word: both marked, each in its own colour, the find
  match on top;
  the scroll bar lane; split view: editor and preview marked from one field; a double click in the preview: the editor, the word
  selected there, the field unchanged (also with both settings on); the double click setting off (nothing)
  and on (the word, whole word); the selection setting off (nothing), on with a selection shorter and longer than
  the minimum, by mouse and by Shift+arrows; several cursors and a block (column mode): only the first selection, the block's
  first line, in the field; the bar setting on: Esc in the field keeps the bar, the X closes it
  (the setting unchanged, the marks stay), a new occurrence opens it again; the bar setting off: marked without the
  bar, Show bar opens it, Esc in its field closes it; Close bar as the X; Clear occurrences clears the marks, Esc
  in the editor does not; the colour: every shipped theme has `occurrenceHit` and `occurrenceBox` (the shipped
  themes test), a little stronger than its `highlight` (brighter on dark, darker on light), and the editor and the
  preview use it; a theme of your own
  without them takes its base's; a long file (the overlay).

## 4. Open questions

None. Decided 2026-10-29: the name Occurrences; no Previous / Next, no current occurrence (only First, to the first one); a new selection replaces
the field when a setting (or the menu item) says it shows occurrences; the editor and the preview both, one bar.

## 5. Resolved during execution

| Topic | As built |
|---|---|
| Where the code is | `web/occurrences.js` (loaded at start: its triggers must always listen); the matching and the preview's text come from find.js, loaded the first time occurrences are marked. The bar is a second `.mm-find` row in the pane (`.mm-occ`), so it looks as the find bar. |
| The first one | Added on your message during the work, then made a choice (2026-10-29): `occurrences.first` Found first occurrence: underline (the default), same (as the others), background (the colours of Find's current match, `--find-current` / `--find-current-fg`), outline (a box in `--find-box`), both. In the editor a mark, in the preview a highlight of its own (underline, background) and a drawn box. |
| The colours | `occurrenceHit` and `occurrenceBox` written into every shipped theme file. First the hit was the `highlight` made stronger (brighter on dark, darker on light); that made the text on it vague, so (2026-10-29) the hit is the theme's `highlight` mixed 35% toward its background `bg`. The box: the `highlight` 30 points of HSL lightness stronger. Also in app.css's light and dark blocks, where the theme colour names come from. |
| Boxes | Built first on Find's setting; then (2026-10-29) a setting of its own, `occurrences.mark` Found occurrence: marked with (background, outline, both), in the editor (marks) and the preview (a drawn layer `.mm-occ-boxes`, as Find's boxes). Outline only: no background. |
| Over several lines | An overlay cannot mark across lines: such occurrences get a mark each (up to 3000). |
| The editor's lines | Marked again 250 ms after an edit and on another document; the preview after it is drawn again; the scroll bars from the occurrences' lines (editor) and ranges (preview). |
| A double click | Taken from CodeMirror's second press (mousedown, detail 2), not the browser's dblclick: that one does not come when the line is drawn anew between the two clicks, as when the first click puts the cursor on a keyword pair (begin, end, if) that brackets.js marks. Found in use (2026-10-29): the double click on those words only worked sometimes. |
| A selection over occurrences | The selection stays visible: while occurrences are marked, each selection gets a mark `mm-occ-sel` and the occurrence background goes there (CodeMirror's styleSelectedText would do it, but its add-on is not in the editor bundle). The preview's own selection is drawn over the highlights already. |
| A selection you made | LexPen's own selections are told apart by `asFound` (a find, a jump, the word a preview double click selects); the editor needs the focus. In the preview the native word selection of a double click does not count either. |
| The history | The find bar's searches (Up / Down in the field); an occurrence is added to it with Enter in the field, not on every selection. |
| Find in a preview | Fixed on the way: Find's preview text left out the layers drawn over the content (plan 31's bookmark numbers, the cursor bar, find's boxes), so a search for a digit no longer matched a bookmark's number. Not tested separately. |
| Tests | t34 in the debug build, every check passes: the right-click action (one line, two lines with ^p, several cursors: the first), the cursor staying, the editor and the preview marked (the count from the file), the scroll bar lane, the colour, typing, whole word, Find at the same time (both marked, Find on top), First in the editor (and back) and in the preview, Esc / X / a new one with the bar setting on, the bar setting off (no bar, Show bar, Esc closes), Clear, the double click setting off and on, a selection by keys shorter and longer than the minimum, a find's selection not counting, a preview double click (the editor's word, the field unchanged), the first one underlined. Unit: the colour names and every shipped theme having both (318 pass). t31 and t32 pass again. Not tested: a column block (the code takes its first line), a theme of your own without the fields (the base's, as any colour). |
