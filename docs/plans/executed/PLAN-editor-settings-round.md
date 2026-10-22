# Plan: Editor settings round: on/off hints, wrap per place, Home, Ctrl+Up/Down, invisible and unreadable characters, indent guide colours, action names

Status: executed 2026-10-22 (in-app tests t90 to t94; unit tests in TextFileTests and KeysFileTests). The number in the file name is the priority; rename to reorder.
Source: your edits to docs/settings-toggle-hints.md and your notes and answers of 2026-10-22.

## 1. What this is about

- The on/off settings have one hint, often with "Off: ..." squeezed in; docs/settings-toggle-hints.md now has an On
  and an Off text per setting, edited by you, to apply.
- Wrap long lines (Editor) also wraps code blocks in the preview (`body:not([data-nowrap]) .mm-preview pre`,
  app.css). You want it for the editor only, and the preview's code blocks a setting of their own.
- Home goes to the first non-blank character first (CodeMirror's `goLineStartSmart`); there is no setting for
  column 1.
- Ctrl+Up / Ctrl+Down do nothing (no binding). They should scroll the text a line.
- Characters you cannot see (control characters) show as nothing or CodeMirror's red dot. And a byte that cannot be
  read in the file's encoding is replaced on reading (a file with a byte order mark, UTF-16), so saving writes the
  replacement sign instead of the byte: a change nobody made and nothing shows.
- The indent guides are in the comment colour (or rainbow), the cursor's guide always in the find box's colour;
  neither has a colour you choose or an intensity, as the ruler's lines have.
- Action names do not say what they do (`ruler`, `wrap`), and a toggle with forced on / off variants is not grouped
  (`ruler`, `rulerOn`, `rulerOff`; `togglePreview` would sort under t).

## 2. The solution, in brief

The hints of docs/settings-toggle-hints.md go into the settings as written, an On and an Off text per on/off
setting. Wrap long lines becomes the editor's alone, and Preview gets its own setting for code blocks. Under Editor >
Cursor two new settings: Home to column 1, and whether the cursor moves along when Ctrl+Up / Ctrl+Down scroll the
text a line. A part "Invisible characters" in Editor view gets a setting that shows control characters and bytes
that could not be read as their code in inverted colours; such bytes are kept as they are, so saving writes them
back unchanged. The indent guides get a colour choice and an intensity, and the cursor's guide a colour and
intensity of its own. Actions get names grouped by what they act on, with the variant after a dot (`wrap.toggle`,
`wrap.on`, `ruler.show`, `tabBar.next`); the old names go, and your keys.json is renamed along.

## 3. Details

### 3.1 The on/off hints

- Each toggle row gets `hint` (on) and `hintOff` (off) from the file (the mechanism is built: commit 43ac196, shown
  per state and searched). Both texts for every row, also those once marked "(suggest one hint)".
- findShared: "Both panes share one find (Ctrl+F)" / "Each pane has its own find (Ctrl+F), with its own text and
  options".
- New rows from this plan get both texts too.
- The file stays as the record; later changes are made in actions.js (the file is not read at run time).

### 3.2 Wrap: per place

- `wrap` (Editor): the editor only. On: "Long lines wrap at the edge"; Off: "Long lines run on past the edge and
  scroll sideways". The action (View > Wrap) is the editor's.
- New `previewWrap` (Preview), default on: "Wrap long lines in code blocks". On: "Long lines in code blocks of the
  preview wrap at the edge"; Off: "Long lines in code blocks of the preview run on and scroll sideways". Lines over
  10000 characters keep wrapping whatever the setting (`LONG_LINE`, app.js; unwrapped, one such line makes the
  preview slow); the Off text says so.

### 3.3 Home

- `homeStop` (Editor > Cursor), default off, title "Home key goes to the first column".
  - On: "Home key sets the cursor at the first column".
  - Off: "Home key sets the cursor at the first non-whitespace character on the line" (a second Home goes to the
    first column, as now; the text says so).
- Shift+Home selects to the same place; column mode and virtual space (which handle Home themselves) follow it.

### 3.4 Ctrl+Up / Ctrl+Down

- Ctrl+Down scrolls the text one line: the view starts a line further down (as Down on the last visible line does).
  Ctrl+Up the other way. New default keys (free now).
- New setting (Editor > Cursor), default off, "Ctrl+Up / Ctrl+Down move the cursor along".
  - Off: the cursor stays on its line, also when that line leaves the view after several presses.
  - On: the cursor moves a line with the scroll, so it keeps its place on the screen.
  - Example: the view starts at line 100, the cursor on line 110. Ctrl+Down: the view starts at 101; on: the cursor
    on 111, off: still on 110.
- At the end of the text (nothing more to scroll; Ctrl+Up: at the start): the view stays. With the setting on the
  cursor still moves a line, so presses go on until it is on the last (first) line. When the view cannot scroll, a
  fat line at that edge of the editor (the bottom for Ctrl+Down, the top for Ctrl+Up) flashes three times, one
  second in all, in the theme's warning colour (`--warning`; a theme has one, from the markdown alerts, next to
  `--caution` for errors); no text. A press during a flash starts it again.
- Several cursors or a block: all move the same way (on).

### 3.5 Invisible and unreadable characters

- A part "Invisible characters" in Editor view: Show spaces and tabs, Show line ends, and the new
  `showSpecialChars`, "Show characters that cannot be seen".
- On: each such character is drawn as its code in a box in inverted colours (the text colour as background), one
  character one box; the text itself is not changed. Off: as now.
- The box is one character for everything: the cursor steps over it with one Left / Right, a click anywhere on it
  is a click on that character (before or after it, by the nearer half), Delete and Backspace remove the whole
  character (the whole byte), a selection takes it whole. Column mode, the ruler and the column count treat it as
  one column. It is drawn as wide as its code (`0x1B` four characters, `U+200B` six), so it stands out; the rest
  of that line then sits further right on screen than its column says (a special case: mostly a file read in the
  wrong encoding, or a binary file), and a block in column mode over that line covers the box as one column.
- Typing such a character or byte is not possible now (later perhaps Insert > Byte).
- Which: the control characters (0x00 to 0x1F apart from tab and the line ends, 0x7F, 0x80 to 0x9F) as `0x1B`;
  invisible Unicode signs (zero width space and joiners, direction marks, a byte order mark inside the text, the
  soft hyphen) as `U+200B`; a byte that could not be read (below) as `0xAB`, in the caution colour so it stands out
  from a control character.
- Bytes that cannot be read (in TextFile.Decode): kept instead of replaced. Each such byte becomes a stand-in
  character that no valid text holds (a lone surrogate, U+DC80 plus the byte, as Python's "surrogateescape"), and
  saving in the file's encoding writes the byte back. So reading and saving an untouched file gives the same bytes,
  and the file is not changed. Where it happens: a UTF-8 file with a byte order mark, UTF-16, and bytes the ANSI code
  page has no character for (a file without a byte order mark that is not valid UTF-8 is still read as ANSI).
- The stand-in must survive the way from the host to the page and back (JSON both ways); a unit test reads, encodes
  and compares the bytes, and the in-app test saves an untouched file and compares. If a lone surrogate does not
  survive, a private-use character with a marker takes its place (decided while building, written in section 5).
- When a byte cannot be kept anyway (a file the host cannot read whole in its encoding): the tab is marked changed
  and a notice says why, so a save is never a silent change.
- Shown also with the setting off? No: off shows nothing new; the bytes are still kept.

### 3.6 Indent guide colours and intensity

- `indentGuides` (choice): The comment colour (now: comment), A colour per level (now: rainbow), One colour, Off.
- New `indentGuideColour`: the colour for One colour, picked as on the ruler (the theme colours, or any colour).
- New `indentGuideIntensity` (slider, 0 to 100 by 5), default 55: mixes whichever colour into the background (the
  comment colour looks as now; the rainbow gets fainter than now).
- The cursor's guide: new `indentGuideCursorColour` (default the find box's colour) and
  `indentGuideCursorIntensity` (default 100, the look now).
- Picking a colour in the settings window: a new row kind, a list of the theme colours plus "Other colour..." (the
  colour dialog); a theme colour follows the theme, a picked one stays as picked.

### 3.7 Action names

- A name is what it acts on, then a dot and what it does: `.toggle`, `.on` / `.off` (a state), `.show` / `.hide` (a
  thing on screen). Lists sorted by name (F1, keys.json) then keep them together.
- The old names go. Everything that names an action moves to the new name: the default keys.json, the menus, the
  bars, the hints that mention one, README, the tests. Your own keys.json: the host renames the old names in it
  once at start (only the names in the action places, the rest of the file as it is), so your keys keep working.
- The on/off actions now, and their new names:

| Now | New |
|---|---|
| `wrap` | `wrap.toggle` (new: `wrap.on`, `wrap.off`) |
| `ruler`, `rulerOn`, `rulerOff` | `ruler.toggle`, `ruler.show`, `ruler.hide` |
| `outline` | `outline.toggle` (new: `outline.show`, `outline.hide`) |
| `sidebar` | `sidebar.toggle` (new: `sidebar.show`, `sidebar.hide`) |
| `formatBar` | `formatBar.toggle` (new: `formatBar.show`, `formatBar.hide`) |
| `editorSwitch` | `editor.toggle` (new: `editor.show`, `editor.hide`) |
| `previewSwitch` | `preview.toggle` (new: `preview.show`, `preview.hide`) |
| `togglePreview` (the editor alone or the editor with the preview next to it: `split` / `edit`, app.js) | `split.toggle` (new: `split.on`, `split.off`) |
| `pinTab` | `pin.toggle` (new: `pin.on`, `pin.off`) |
| `readOnly` | `readOnly.toggle` (new: `readOnly.on`, `readOnly.off`) |
| `columnMode` | `columnMode.toggle` (new: `columnMode.on`, `columnMode.off`) |
| `overwrite` | `overwrite.toggle` (new: `overwrite.on`, `overwrite.off`) |
| `compareScroll` | `compareScroll.toggle` (new: `.on`, `.off`) |
| `theme` | `theme.toggle` (new: `theme.day`, `theme.night`) |
| `backup`, `findShared`, `lineBreaks`, `movePinned` | `backup.toggle`, `findShared.toggle`, `lineBreaks.toggle`, `movePinned.toggle` (new: `.on`, `.off`) |
| `gutterColumn bookmarks` (a column as parameter) | `gutterColumn.toggle bookmarks` (new: `.show`, `.hide`) |

- Actions that step through more than two choices: `.next`, the same way:

| Now | New |
|---|---|
| `tabBar` | `tabBar.next` |
| `tabOrder` | `tabOrder.next` |
| `findWrap` | `findWrap.next` |
| `lineNumbers` | `lineNumbers.next` |
| `lineNumberCount` | `lineNumberCount.next` |
| `paneOrientation` | `paneOrientation.next` |

### 3.8 Tests

- The settings window: every toggle row shows its On text when on and its Off text when off (t90 extended to all).
- Wrap: the editor with wrap off does not wrap; the preview's code blocks follow previewWrap; a line over 10000
  characters wraps in the preview anyway.
- Home with homeStop on and off, a second Home, Shift+Home, in column mode.
- Ctrl+Up / Down with the setting off and on, as in the example of 3.4 (view start and cursor line); at the end of
  the text (the cursor goes on to the last line with the setting on; the flashing line at the bottom, gone after a
  second), at the start (the line at the top); with several cursors.
- Invisible characters: a file with 0x01, 0x1B, 0x7F, U+200B and an unreadable byte: boxes with their codes, the
  text unchanged; off: none. A box is one character: Right steps over it once, a click on its middle, Backspace
  and Delete remove it whole; column mode over a line with one keeps its columns. Unit tests: decode and encode give the same bytes for UTF-8 with a byte order mark,
  UTF-16 and ANSI with unreadable bytes. In the app: open, save untouched, the bytes on disk unchanged.
- Indent guides: each colour choice at two intensities, a picked colour, the cursor's guide colour and intensity.
- Action names: the new names run; no old name is left in the defaults, the menus or the bars (a check over the
  list of actions); a keys.json with old names is renamed at start and its keys work; F1 shows the new ones.
- Regression: the settings window tests (t22, t23, t60, t89, t90), t81 (indent guides), t87, t88 (ruler), t10 and
  t84 (keys), the unit tests.

## 4. Open questions

None.

## 5. Resolved during execution

| Topic | As built |
|---|---|
| Unreadable bytes: the stand-in | A private-use character, U+F780 plus the byte (TextFile.StandIn), not a lone surrogate: the JSON between host and page cannot carry a lone surrogate either way (tried: System.Text.Json writes it as U+FFFD and refuses to read it), and a .NET decoder fallback may not produce one either (tried: an ArgumentException). A real character of U+F780 to U+F87F in a file is kept as the stand-ins of its own bytes, so a stand-in is never taken for one; the two are told apart by reading the bytes twice with two stand-in ranges (where they differ, a byte could not be read). |
| Unreadable bytes: where | A UTF-8 file with a byte order mark, UTF-16 (a lone surrogate's two bytes, an odd last byte), an ANSI code page with gaps. Windows-1252 has none: its five unassigned bytes are read as the control characters U+0081 and so on, so they show as `0x81` boxes and are saved back as they were. A file without a byte order mark that is not valid UTF-8 is still read as ANSI. |
| A byte that cannot be kept | Not built: with the stand-ins every byte is kept, so there is no case left to mark a tab changed for. |
| showSpecialChars | Default on (the plan gave no default). Off: as before, CodeMirror's red dot. The boxes: CodeMirror's `specialChars` and `specialCharPlaceholder`; a box is as wide as its code, one character for the cursor, a click, Delete and Backspace; the tab is not one (CodeMirror draws it first). Unreadable bytes in the caution colour (red), the rest inverted (text colour as background). |
| Ctrl+Up / Ctrl+Down | Actions `scrollLine.down` / `scrollLine.up` (virtual.js `scrollLine`), setting `scrollMovesCursor`. Found while testing: after Shift+Home, Ctrl+Down selected a line: CodeMirror remembers Shift from the last key it saw, and LexPen takes Ctrl+Down before CodeMirror sees it; the move now ignores that Shift. The flash: a 4px line, three flashes in one second (a CSS animation), the theme's `--warning`. |
| Home | A Home binding in the editor (format.js, a motion, so Shift+Home selects); column mode's Shift+Home on a block goes the same way (column.js). Virtual space passes Home on as before. |
| Wrap | `wrap` sets the editor only; `previewWrap` (Preview) sets `data-preview-nowrap` on the body, which the preview's `pre` rule reads. |
| Indent guides | Choices comment, rainbow, colour (new), off; `indentGuideColour` (default the accent colour), `indentGuideIntensity` 55, `indentGuideCursorColour` (find box), `indentGuideCursorIntensity` 100. The guides are mixed with transparent, not with the background as the ruler's lines: a line can have a background of its own (the active line, a selection). The rainbow at 55 is fainter than before, as agreed. |
| The colour row | A new settings row kind `colour`: the theme colours (the ruler's list plus the comment colour), "A colour you picked (#rrggbb)" when one is, and "Other colour..." which opens the colour dialog; a swatch shows the colour. Also for the column guides' colour (a theme colour or one you pick now). |
| The hints | From docs/settings-toggle-hints.md for all 26 toggles (both texts everywhere), plus the new rows. Changed on purpose: Follow Windows Off ("A change between light and dark in Windows does not switch the mode of LexPen": the strings have no apostrophes), Home Off (a second Home goes to column 1, your answer), the cursor guide On (its own colour now), One find for both panes (Ctrl+F, agreed), "Besides" with a capital. The Wrap and Backup action hints (F1, menus) were wrong and are corrected (Wrap: the editor; backup: name.ext.bak). |
| Action names | A helper `toggleAction(name, def, get, flip, words)` makes `name.toggle` (with the check mark) and `name.on` / `name.off` (or `.show` / `.hide`; `theme.night` / `theme.day`), which do nothing when it already is so. A settings row takes its title from `name.toggle` when there is no action of its own name. Your keys.json: `KeysFile.RenameActions` renames the old names where they are an action (a key's value, or the first item of its list), keys and comments as they are, and writes the file only when something changed. The executed plans keep the names of their time. |
| Actions with choices | 3.7 said `tabBar` and the others step through their choices; they do not (my mistake): each sets the choice given as its parameter (`tabBar rows`; the menus have an item per choice). You chose no `.next`: they are `.set` with the choice (`paneOrientation.set`, `tabBar.set`, `tabOrder.set`, `findWrap.set`, `lineNumbers.set`, `lineNumberCount.set`), renamed in your keys.json as the others. |
| Ctrl+Shift+Up / Down (your remark during the build) | With "move the cursor along" on, Ctrl+Shift+Down scrolls the text and the selection grows with the cursor a line down; off, the cursor stays and so does the selection. The actions are a move (`move: true`), so Shift added to their key selects, as with the bookmark and bracket jumps. |
| Ctrl+Shift+Up / Down in column mode (your remark after the build) | It made an ordinary selection over the lines, which became a block only at the next Shift+arrow. Now in column mode it grows the block as Shift+Down does (column.js `extendBlock`); a plain Ctrl+Up / Down with a block lets the block go first, as Down does. t92 now 26 checks. |
| Tests that could not fail | The "no problems shown" check in t87, t88 and t91 looked for `.mm-toast.mm-error`, a class the notices do not have, so it always passed; now `.mm-toast:not(.mm-info)`. |
| Tests | New in-app tests, all passing: t91 (invisible and unreadable characters) 18, t92 (wrap, Home, Ctrl+Up / Down, with Shift, in column mode) 26, t93 (guide colours, the colour row) 16, t94 (action names, your keys.json renamed) 16; t90 (every toggle's two hints) 6. Unit tests: 203 pass (new: bytes kept for UTF-8 with a byte order mark and UTF-16 both ways, a real character of the stand-ins' range, plain text without stand-ins, the keys.json rename). Run again, passing after their expectations followed the new texts and names: t3 34 + 1 (its two Ctrl+E steps were failing before plan 23: Ctrl+E is free since 792d874; now split.toggle), t19 20, t22 29, t23 28, t60 22, t84 11, t87 40, t88 63, t89 14, t9 21. Passing as they were: t10 11, t21 7, t26 13, t52 41, t61 8, t70 6, t71 6, t79 45, t81 17, t85 46, t86 21. t82 (find history after a restart) failed 2 checks once and passed 16 of 16 twice after; nothing of it was touched. |
