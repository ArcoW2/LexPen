# Plan: a language inside a language (embedded blocks, markdown fences)

Replaces the draft PLAN-fenced-code-colours.md (2026-10-19), which only covered markdown's fenced code: that is
one case of a wider need.

## 1. The problem

A file can hold blocks of another language, and LexPen colours the whole file as one language:

- **Embedded blocks**: in `suppliers_DELETE.sql` (King ERP public API) the API definition is JSON inside an SQL
  block comment, on the lines between `/*==[` and `]==*/`. LexPen colours it as one SQL comment: grey, no structure. It is JSON
  with `//` comments and trailing commas.
- **Markdown fences** (```` ```sql ````): coloured by highlight.js in the preview and by CodeMirror's markdown mode
  in the editor, not by the language packs. Two colourings of one language that can disagree, and a language with
  a pack but no highlight.js grammar (Delphi, AutoHotkey, ASA SQL) gets no colour in a fence at all.

Two things are needed: recognising where an inner language starts and ends, and colouring several languages in
one document, each with its own looks.

## 2. The solution, in brief

A language pack can say which blocks in it are another language: a start and an end marker and the inner language
(`embedded:` in `language.yaml`), the language either fixed or found in the start marker itself (a markdown fence's
name); a found name is matched to a language in one table built from all packs' names and aliases, with your own
mapping on top (`bash` as TCC). You can also give a range of lines a language yourself: LexPen remembers it per
file, and the range moves and grows with your edits. The editor colours the outer
text with the outer language and every block, always whole lines, with its inner language, and the
preview does the same through the same mode. Each inner token keeps its own language's look, so JSON in SQL looks
as JSON does in a `.json` file. The ASA SQL pack gets the King API block (the lines between `/*==[` and `]==*/`, JSON) as the first
use; markdown fences use the packs where one exists, highlight.js for the rest.

## 3. Details

### 3.1 In the pack: `embedded`

A list of block rules. A rule has a start and an end, and the inner language either written in the rule or taken
from the start itself:

```yaml
embedded:
  # The King API block: the lines between the line with /*==[ and the line with ]==*/; the language is fixed.
  - { open: '/*==[', close: ']==*/', language: json }
  # Markdown fences: the language is the name after the fence: the pattern's group 2 (group 1 is the fence).
  - { openRegex: '^\s*(`{3,}|~{3,})\s*([\w#+.-]+)', closeRegex: '^\s*(`{3,}|~{3,})\s*$', languageGroup: 2 }
```

- `open` / `close`: text a line holds (anywhere in it); `openRegex` / `closeRegex`: a pattern a line matches.
- **A block is whole lines**: it starts on the line after the open line and stops on the line before the close
  line. The open and close lines themselves are the outer language's (a comment for the King block, the fence for
  markdown), also what else is on them (the King block's `[` and `]`).
- The outer language goes on after the block where it left off before it: the SQL comment that the `/*==[` line
  opened ends on the `]==*/` line, as if the block's lines were not there.
- `language`: the inner language, by name (3.1.1). Or `languageGroup`: the group of `openRegex` that holds the name.
- Several rules per pack; the first that matches at a place wins. Blocks do not nest (a marker inside a block is the
  inner language's text).
- A block whose name finds no language (or a broken pack) stays as the outer text; markdown's preview then uses
  highlight.js for it, as now.
- No special case for markdown: its fences are one such rule in `markdown\language.yaml`.

### 3.1.1 From a name to a language: one table for all

The outer pack only finds the name (`bash`, `cs`, `sql`); which language that is, is decided in one place for
every pack, so no pack has to list the others:

1. **Your own mapping first**: a setting `languageNames` (Options > Settings > Languages), name to language:
   `{ "bash": "tcc", "cmd": "batch" }`. For a name that means another language to you than to most people.
2. **A pack's own names**: its id (`csharp`), its `name` (`C#`), its extensions without the dot (`cs`, `csx`), and a
   new part `aliases` for the other names it is known by (`aliases: [c#, cs, csharp]`; Shell: `[bash, sh, zsh,
   ksh]`; Batch: `[bat, cmd, dos]`; ...). Case does not matter.
3. Not found: no inner language (above).

- Two shipped packs never answer to the same name (a unit test checks, as for extensions). A pack of your own wins
  over a shipped one with the same name, as with extensions.
- The same table also helps elsewhere later (choosing a language by typing its name in the language list).
- The settings window shows the mapping as a list (name, language), editable there, as Open in per language is.

### 3.1.2 Lines you give a language

Next to blocks found by their markers (3.1): a range of lines you give a language yourself, without any marker
in the text.

- **Choosing**: select some lines (the selection's lines count whole), then the language list (the language in the
  bottom bar, View > Language...) offers "For the selected lines" with every language, and "The file's language
  again" for lines inside such a range. Without a selection the list works on the file, as now.
- **Remembered** by LexPen, per file, in `State\file-languages.json` next to the file's own chosen language (the
  file itself is not changed): the range's first and last line, its language, and the text of its first and last
  line.
- **It moves with your edits**: the range's first and last line are held by markers in the editor, so they move
  when lines are added or removed above or inside. Deleting all its lines removes the range.
- **New lines**: a line made by Enter on a line of the range belongs to the range, also Enter on its last line
  (the range grows at its end). Enter on the line after the range does not: that new line is the outer language.
  A line added above the range's first line does not belong to it.
- **Pasting**: pasted text takes the language of the line it is pasted into; pasted lines inside the range belong
  to it, pasted below its last line do not. So to paste at the end of a range: Enter on its last line, then paste
  on that new line. A column paste (PLAN-column-selection.md) changes no line's language.
- **When the file changed outside LexPen**: the range is found again by the text of its first and last line (as
  bookmarks are, BookmarkStore.cs); not found: the range is dropped, without a message.
- **Looks and actions**: as for a marker block (3.2): its own language's colours, Toggle comment and indent of
  that language, folds as a whole.
- **Together with marker blocks**: a range you set wins over a marker block on the same lines.
- **Colouring by line**: CodeMirror's colouring does not know line numbers; a thin outer mode counts the lines and
  asks the ranges which language a line is in, then hands it to that language's mode. A range added, removed or
  moved by an edit colours again from its first line on.

### 3.2 The editor

- **One mode for a file with blocks**: it counts the lines and hands each line either to the outer language or to
  the language of the block it is in, marker blocks (3.1) and lines you set (3.1.2) alike. The outer language's
  state is kept aside during a block and taken up again after it. Since blocks are whole lines, CodeMirror's
  multiplex add-on (which switches languages inside a line) is not needed.
- **Looks**: every inner token also gets the class of its language (`cm-in-json`), so the looks generated per
  language (`updatePackColours`) also exist as `.cm-in-json.cm-string`, ... from the inner pack's `tokens`. A token
  type that both languages have (string, number) looks as the inner language says.
- **Toggle comment, indent** inside a block use the inner language (its comment markers: `//` in JSON), through
  the mode's inner-mode lookup (CodeMirror asks a mode which language a place is in).
- **The bar**: the outer language's bar stays. While the cursor is in a block, a second bar comes just below it:
  the inner language's bar, starting with its name and a colon (`JSON:`), on a slightly other background (the
  theme colour `bgBarDim`, unused since the windows all look the same). Its buttons act on the block (the inner
  language's snippets, comment, ...). Out of the block, it goes.
- **No jumping**: the inner bar is laid over the top row of the text, so the editor never shifts when it comes or
  goes (a shifting editor is very annoying while scrolling). When the cursor is on the first visible line while the
  bar is there, the text scrolls one line, so the cursor's line is the second row, just under the bar: as if the
  second row were the top row. Not on the document's first line (nothing to scroll; only possible with lines you
  set, since a marker block always has its open line above it): there the bar covers that line.
- **The gutter**: every line in another language than the file's has a slightly other gutter background (a theme
  colour `gutterBgEmbedded`, one for all inner languages; Light and Dark set it, other themes inherit it), so a
  block's extent is visible at a glance, also for lines you set (3.1.2).
- **Folding**: a block folds as a whole (from its open line), as well as by the inner language's own folding.
- **Long lines** (executed/PLAN-long-lines.md): unchanged; the colour limit counts per line, also inside a block.

### 3.3 The preview

- Code files: `codeHtml` already colours with the editor's mode through run mode, so blocks come out coloured the
  same way, with no work of their own.
- Markdown fences: a fence whose language has a pack is coloured by that pack (run mode with that pack's mode);
  other fences keep highlight.js. Measured before switching over (run mode against highlight.js on long and many
  fences); not switched where it is clearly slower.
- Lines you set (3.1.2) are coloured as their language in the preview too, so editor and preview never disagree.

### 3.4 The ASA SQL pack

- `embedded: [{ open: '/*==[', close: ']==*/', language: json }]`.
- The JSON pack has to read JSON with comments and trailing commas without errors: it does today (CodeMirror's
  json mode, checked when built); if not, a `jsonc` variant.
- The outline's API definition entry (`"StoredProcName"`) keeps working (it reads lines, not colours).

### 3.5 Later, through this

- The formatter plan's Format (pretty print) can work on the embedded block at the cursor: JSON inside the SQL file
  formatted as JSON (PLAN-formatters.md).
- More blocks in other packs follow the same way when needed.

### 3.4.1 More blocks now

- HTML: the lines between a `<script ...>` line and a `</script>` line as JavaScript, between `<style ...>` and
  `</style>` as CSS.
- PHP: the lines between a `<?php` line and a `?>` line as PHP, in the HTML pack (which has `.php`).
- Only blocks whose markers stand on lines of their own: a `<script>` with code on the same line, or an inline
  `<?php echo $x ?>`, stays the outer language (blocks are whole lines).

### 3.6 Tests

- Unit: the ranges in `file-languages.json` read and written; a range found again by its line texts after lines
  were added above it, and dropped when they are gone.
- Unit: `LanguagePacks` reads and checks `embedded` and `aliases` (an unknown language: a problem line, the block
  stays outer text); the name table: id, name, extensions, aliases, your mapping first; no name in two shipped
  packs.
- In-app:
  - `suppliers_DELETE.sql` (a copy): the JSON keys, strings and numbers have the JSON looks, the SQL after it the
    SQL looks; the markers stay comment;
  - Toggle comment inside the block writes `//`, outside `//` of SQL; a block folds;
  - the preview of the file: the same colours;
  - the inner bar: comes over the top text row in a block (`JSON:`), goes outside it; the editor does not shift;
    with the cursor on the first visible line it scrolls one line; its buttons act in the block;
  - the gutter background differs on the block's lines;
  - HTML with a `<script>` and a `<style>` block, PHP between `<?php` and `?>`;
  - lines given a language: coloured as it; a line inserted inside the range and Enter at its end belong to it, a
    line above it does not; Enter on the line after it gives a line of the outer language; pasted text takes the
    language of its line; after a restart still there; after an edit outside LexPen found again by its lines;
  - markdown: a ```` ```pascal ```` fence (a pack, no highlight.js grammar) coloured, a ```` ```rust ```` fence (no pack)
    still by highlight.js; ```` ```cs ```` found by alias; ```` ```bash ```` as TCC with your mapping;
  - measured: run mode against highlight.js on a markdown file with many long fences.

### 3.7 Docs

`languages\README.md` (the `embedded` and `aliases` parts), `_template\language.yaml`, README (Languages), HANDOFF.

## 4. Open questions

None.

## 5. Resolved during execution

| Thing | Solution implemented |
|---|---|
| Where lines you set are kept | `State\file-ranges.json` (path -> ranges), not in `file-languages.json`: that file is a plain path -> language map, and a second file keeps reading it simple. |
| The order of names in the table | An id wins over a name, a name over an alias, an alias over an extension; within each, your packs over shipped ones. So `sql` (a fence ```` ```sql ````) is the SQL pack, though `.sql` files open as ASA SQL; `languageNames: { "sql": "asa" }` changes that. |
| The gutter tint | CodeMirror forces the gutter's own background off (`!important`): the tint is a layer behind the gutter of the line, as wide as the gutter (measured after every editor update). With every gutter column off there is no gutter, and no tint. |
| Toggle comment at the start of a block line commented as the outer language | The comment markers come from the language of the cursor's line (`commentMarkers`), not from the file's; indent looks ahead to the language of the line being indented. |
| The inner bar's look | Background `bgBarDim` (unused before), a thin line and shadow under it; it hides with the formatting bar (View > Formatting bar). |
| Measured: fences by pack against highlight.js | 200 SQL fences of 50 lines: pack 180 ms, highlight.js 113 ms (t48). Slower, but under 1 ms per fence: switched, as asked. |
| Lines you set in a markdown file, in the preview | The text is rendered in parts: each range as a code block of its language, the rest as markdown, with their source lines kept (scrolling together works). A link reference defined in one part is not found from another part. |
| `languageNames` in the settings window | One text field with pairs, `bash=tcc, cmd=batch` (kept as a mapping in settings.json); a change colours the open files again. |
| The colouring engine for markdown | Loaded for a markdown file only when it has fenced code or lines you set; other markdown files open as before. |
| Tests | Unit: `LanguagePacksTests` (embedded and aliases checked, no alias in two shipped packs); 142 passed. In-app: t48 (25 checks: the King block, gutter tint, inner bar and its scrolling, the preview, HTML's script with Toggle comment, fences by pack / highlight.js / alias / your mapping, lines you set with Enter and the preview, after a restart and an edit elsewhere); the language, theme and key scripts pass (t25 once more: its settings window wait). |
