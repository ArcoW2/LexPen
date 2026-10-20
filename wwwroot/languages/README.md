# Language packs

A language pack tells LexPen everything about one language: which files are in it, how they open, how the text is
coloured, the outline, the actions and snippets, and the buttons above the editor. One folder per language:

```
languages\
  sql\
    language.yaml     the language (required)
    bar.yaml          the buttons above the editor (optional)
    icons\*.svg       icons of its own for those buttons (optional)
```

The folder name is the language's id (`sql`, `ahk`, `csharp`): lower case, letters, digits, `-` and `_`. A folder
starting with `_` is not loaded (`_template`).

## Where packs live

| Place | What | Changes apply |
|---|---|---|
| `wwwroot\languages` in the project | The shipped packs: the source, in git, distributed with LexPen | A debug build reads this folder itself: at once, in every window |
| `wwwroot\languages` next to `LexPen.exe` (the install folder; a publish copies the project's there) | The copy a release build reads | When LexPen starts |
| `%LOCALAPPDATA%\LexPen\languages` (or `languages` in `LEXPEN_DATA`) | Your own packs | At once, in every LexPen window |

- A pack of your own with the name of a shipped one replaces that one as a whole (not part by part).
- An extension claimed by two packs: yours win over shipped ones. Two shipped packs never share one (a unit test
  checks).
- A pack meant for everyone belongs in the project: work on it there with a debug build running. Your own folder
  is for what is only yours; a copy of a shipped pack there keeps winning over the shipped one, so delete it when
  done.
- Themes (`wwwroot\themes`) work the same way: a debug build reads and watches the project's folder.

## Making a pack

1. Copy `_template` to a new folder named after the language: in the project for a shipped pack, in your own
   folder for one of your own.
2. Edit `language.yaml`. Every part is explained in the comments of `_template\language.yaml`. In this order:
   - `name` (shown in the bottom bar and the language list) and `extensions` (`[.sql, .ddl]`).
   - `open`: `edit`, `split` or `preview`; `fold`: `brace`, `indent`, `markdown` or `none`.
   - The colouring (next section).
   - `outline`: patterns for the Outline button.
   - `actions`: snippets, wrap, line prefix, jumps.
3. Edit `bar.yaml` for the buttons (below).
4. Save. A mistake shows in the settings window (Options > Settings, at the top) with the file (and the line, for
   a YAML mistake); a pack that cannot be read falls back to plain text until it is fixed.

YAML in short: `name: value`; a list is `[a, b, c]` or one `- item` per line; text with a colon, comma or `#`
goes between quotes. `'...'` keeps backslashes as written (use it for patterns); in `"..."` `\n` is a new line
(use it for snippets). Words that YAML reads as something else need quotes: `'on'`, `'off'`, `'yes'`, `'no'`,
`'true'`, `'false'`, `'null'`, and any word starting with `#`, `@`, `*` or another sign.

## Colouring: text -> token type -> look

One flow, for every language:

1. **Text to token type.** Every piece of text gets a token type, a name such as `keyword`, `string`,
   `comment`, or one of your own (`global`, `label`). Either a built-in editor mode names the types
   (`mode: javascript`, `xml`, `yaml`, `powershell`, `text/x-csharp`, `markdown`; a real parser, better for
   nested languages), or the pack's own parts do, tried in this order:
   - `rules`: patterns, each with its token type.
   - `comments`: line and block comment markers (also used by Toggle comment).
   - `quotes`: strings; doubled quotes, an escape character, over several lines.
   - `words`: word lists; the list's name is the token type of its words. A word in more than one list gets
     the first list's type (the order in the file). A word ending in `*` is every word starting with it
     (`'@@*'`): tried after the exact words, the longest first. Within a list the longest word is tried
     first, so `background-color` wins over `background`. `caseSensitive: false` for any case.
   - `numbers`: a pattern (or a list, or `false`); by default `0x1F`, `12`, `1.5e3`.
   - Anything else is type `text`.
2. **Token type to look.** The pack's `tokens` give a type its look, on top of the base looks in
   `plaintext\language.yaml` (`keyword`, `string`, `comment`, `number`, `type`, `builtin`, `atom`, `def`,
   `variable-2`, `property`, `attribute`, `meta`, `text`, ...). A look, every part optional:
   - `theme: keyword`: a colour of the theme (`keyword`, `string`, `comment`, `number`, `title`, `attr`, or an
     app colour such as `fg`, `fgDim`, `accent`). It follows every theme and every light / dark mode.
   - `like: variable-2`: the look of another type.
   - `contrast: 10`: lightness points further from the background (stronger); `-10`: closer (subtler).
   - `bold`, `italic`, `underline`, `strikethrough`: `true` / `false`.
   - `color: '#c0c0ff'`: a fixed colour; better inside `byTheme`, one colour rarely suits light and dark.
   - `byTheme: { dark: {...}, light: {...}, bluish: {...} }`: changes for one theme (and the themes built on it)
     or for the mode.

   A type of your own without a look looks like text: give it one (`label: { like: def, bold: true }`).
   Prefer `theme` and `like` over fixed colours: the pack then fits every theme, also ones made later.

The theme files (`wwwroot\themes`) know nothing of languages: they only hold the colours (`keyword`, `string`,
...) that the looks point at.

## A language inside a language: embedded, aliases

A file can hold blocks of another language: JSON inside an SQL comment, code in a markdown fence, JavaScript in a
`<script>`. Every block is whole lines: from the line after the line with its start marker up to the line before
the line with its end marker; the two marker lines stay the outer language. Inside a block the inner language
colours (its own looks), Toggle comment and indent work as that language, a bar of that language lies over the
top text row (`JSON:`), and the gutter beside its lines is tinted (theme colour `gutterBgEmbedded`).

```yaml
embedded:
  - { open: '/*==[', close: ']==*/', language: json }          # text a line holds; the language fixed
  - { openRegex: '^\s*(`{3,}|~{3,})\s*([\w#+.-]+)', closeRegex: '^\s*(`{3,}|~{3,})\s*$', languageGroup: 2 }
  - { openRegex: '^\s*<script\b[^>]*>\s*$', closeRegex: '^\s*</script>', language: javascript, flags: i }
```

- `open` / `close`: text the line holds; `openRegex` / `closeRegex`: a pattern the line matches (`flags: i` for any
  case). `language`: the inner language by name; or `languageGroup`: the group of `openRegex` that holds the name.
- A name is found in one table for all packs: your own mapping first (Options > Settings > General > Languages,
  `languageNames`: `bash=tcc`), then a pack's id, its name, its `aliases`, its extensions (in that order of
  strength: `sql` is the SQL pack although `.sql` files open as ASA SQL). A name that finds nothing: the block stays
  the outer language (a markdown fence then gets highlight.js in the preview).
- `aliases: [c#, cs]`: other names a pack is known by. Two shipped packs never share one (a unit test checks).
- Shipped: ASA SQL's King API block (`/*==[` ... `]==*/`, JSON), markdown's fences, HTML's `<script>`, `<style>` and
  `<?php` ... `?>` blocks.

**Lines you give a language**: select lines, then the language in the bottom bar > For the selected lines. LexPen
remembers it per file (`State\file-ranges.json`); the range moves with your edits, Enter on its last line makes it
grow, Enter on the line after it does not, and pasted text takes the language of the line it lands on. After the
file changed elsewhere the range is found again by the text of its first and last line.

## The bar: bar.yaml

The buttons above the editor, left to right; `'-'` is a separator:

```yaml
- { action: toggleComment, icon: comment }
- '-'
- { action: snippetSelect, icon: snippet, label: select }
```

- `action`: an action of this pack, or of plain text: `toggleComment`, `blockComment`, `removeBlockComment`,
  `indent`, `outdent`, `section`.
- `icon`: an SVG in this pack's `icons` folder, or one of plain text's: `comment`, `blockcomment`, `indent`,
  `outdent`, `snippet`.
- `label`: optional short text after the icon.
- The tooltip is the action's `title` and its key. Without `bar.yaml` the language has no buttons.

## Actions and keys

An action in `actions` has a `title`, an optional `hint`, and one of:

- `command`: a built-in command (`toggleComment`, `blockComment`, `indent`, `outdent`, ...).
- `insert`: a snippet; `$0` is where the cursor goes.
- `wrap: [before, after]`: around the selection.
- `linePrefix`: in front of every selected line, or taken away when all have it.
- `jump: { line: pattern }`: to the next / previous matching line (with `variants` for the two directions).

A key for an action goes in your `keys.json` by the action's name: `"Ctrl+Alt+I": "snippetIff"`. The same key
can do something else in another language, through an action of the same name there. An action a language does
not have itself comes from plain text.

## Maintaining packs

- **Check a change.** Open a file of the language: the colours, Outline, the bar. Problems: the settings window.
  For a shipped pack: with a debug build running, a save in the project applies at once.
- **Tests.** `tests\LexPen.Tests\LanguagePacksTests.cs` loads every shipped pack and fails on any problem; it also
  lists the shipped ids and some extensions. A new shipped pack: add its id there.
- **Shipped list.** README.md (Languages) names the shipped languages; keep it in step.
- **Plain ASCII** in every pack file (patterns can use `\u00e4` for a letter outside it).

## From an UltraEdit word file (.uew)

AutoHotkey (`ahk`) and Sybase ASA SQL (`asa`) were made this way:

| In the word file | In the pack |
|---|---|
| `/L` line: `File Extensions = SQL SP` | `extensions: [.sql, .sp]` (no extension in two shipped packs: a unit test checks) |
| `Nocase` | `caseSensitive: false` |
| `Line Comment = //`, `Line Comment Alt = --`, `Block Comment On / Off` | `comments: { line, moreLines, block }` |
| `String Chars = '` | `quotes: [{ open: "'" }]` (plus `double: true` when a quote inside is doubled) |
| `Escape Char` | a `rules` entry for the escaped character, or `escape:` on the quote |
| `/C1"Name"` ... `/Cn` word lists | one `words` list each, named after a token type; words copied as they are, never retyped. Lists with only punctuation are left out. |
| `** @@` in a list (words starting with) | `'@@*'` |
| `/Function String` or `/TGBegin` tag groups with `/TGFindStr` | `outline` patterns (`%` is `^`, `[^t ]++` is `\s*`, `^(...^)` is the group) |
| `/Open Fold Strings = "{"` / `EnableCFByIndent` | `fold: brace` / `fold: indent` |
| `LanguageMarker = "python"` | `firstLine: '^#!.*\bpython'` (files without a known extension) |
| `/Indent Strings`, `/Delimiters`, `/Member String`, `/Variable String`, tag groups inside a block (`/TGFindBStart`) | not used |

Each `/C` list gets its own token type, with a look in `tokens` (`procedure: { like: builtin }`), so it can be
restyled on its own later; the lists keep the word file's order (the first list with a word wins, as in
UltraEdit). Lists of signs only (operators, braces) are left out. Note in the pack's header which word file it
came from. The shipped packs from word files (`ahk`, `asa`, `batch`, `cpp`, `css`, `html`, `java`, `perl`,
`php`, `python`, `ruby`, `shell`, `vb`, `vbscript`) were generated this way; to bring one up to date with a
changed word file, regenerate its word lists the same way and keep the rest of the pack.
