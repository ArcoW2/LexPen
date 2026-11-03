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
| `defaults\languages` in the project | The shipped packs: the source, in git, distributed with LexPen | A debug build reads this folder itself: at once, in every window |
| `defaults\languages` next to `LexPen.exe` (the install folder; a publish copies the project's there) | The copy a release build reads | When LexPen starts |
| `%LOCALAPPDATA%\LexPen\languages` (or `languages` in `LEXPEN_DATA`) | Your own packs | At once, in every LexPen window |

- A pack of your own with the name of a shipped one replaces that one as a whole (not part by part).
- An extension claimed by two packs: yours win over shipped ones. Two shipped packs never share one (a unit test
  checks).
- A pack meant for everyone belongs in the project: work on it there with a debug build running. Your own folder
  is for what is only yours; a copy of a shipped pack there keeps winning over the shipped one, so delete it when
  done.
- Themes (`defaults\themes`) work the same way: a debug build reads and watches the project's folder.

## Making a pack

1. Copy `_template` to a new folder named after the language: in the project for a shipped pack, in your own
   folder for one of your own.
2. Edit `language.yaml`. Every part is explained in the comments of `_template\language.yaml`. In this order:
   - `name` (shown in the bottom bar and the language list) and `extensions` (`[.sql, .ddl]`).
   - `open`: `edit`, `split` or `preview`; `fold`: `brace`, `indent`, `markdown` or `none`.
   - The colouring (next section).
   - `outline`: patterns for the Outline button, in one list or in named groups (Outline, below).
   - `actions`: snippets, wrap, line prefix, jumps, conversions.
   - `format`: the parameters of the formatter (Format, Enter; below).
   - Optional: `tabSize`, `indentSize`, `useTabs`, `trimTrailing` (Tabs and whitespace, below).
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
   - `byTheme: { dark: {...}, light: {...}, dark-ocean: {...} }`: changes for one theme (and the themes built on it)
     or for the mode.

   A type of your own without a look looks like text: give it one (`label: { like: def, bold: true }`).
   Prefer `theme` and `like` over fixed colours: the pack then fits every theme, also ones made later.

The theme files (`defaults\themes`) know nothing of languages: they only hold the colours (`keyword`, `string`,
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

The buttons above the editor, left to right. The same list is the Format menu, so a change to the bar shows there
too. A file without `bar.yaml` gives the language no bar (its Format menu has the comment items only).

```yaml
- { action: toggleComment, icon: comment }
- '-'
- { action: snippetSelect, icon: snippet, label: select, letter: s }
- { action: convert, icon: case }
```

Every key of an item:

| Key | What | Example |
|---|---|---|
| `action` | An action of this pack, or of plain text: `toggleComment`, `blockComment`, `removeBlockComment`, `indent`, `outdent`, `section`, the conversions (`upperCase`, ...). Two names are special: `convert` and `format` (below) | `{ action: indent, icon: indent }` |
| `icon` | An SVG in this pack's `icons` folder, or one of plain text's: `comment`, `blockcomment`, `indent`, `outdent`, `snippet`, `case`, `format`. Shown on the button and in front of the item in the Format menu | `icon: snippet` |
| `label` | Optional short text after the icon (the bar only; the menu shows the action's title) | `label: select` |
| `letter` | Optional: the underlined letter of the item in the Format menu. Without it the menu takes the first letter of the title that no other item has | `letter: s` |
| `'-'` | A separator on the bar, a line in the Format menu | `- '-'` |

- **Convert** (`action: convert`): a button with the conversions as its menu (case, tabs and spaces, whitespace at
  line ends). Every bar gets it at its end, unless the bar names it itself: then it is where you put it, in the
  bar and in the menu.
- **Reformat** (`action: format`): the formatter (Format, below). A pack with `format:` parameters gets the button at
  the end of its bar, after Convert, unless the bar names it; an action `format` of its own gives it another title
  or hint (JSON: Reformat JSON).
- **The Format menu**, in this order: Toggle comment, Toggle block comment, Remove block comment (every language);
  a line; the bar's items in the bar's order (the comment items it has are not repeated, nor Convert: that is the
  Convert menu). **The Convert menu**: the conversions, then the pack's own conversion actions. On a line of another
  language (a block, a fence, lines you set) each menu gets a submenu named after that language with its items,
  which act in that language; left out when that language has none (no bar: no Format submenu). Ctrl+Alt+C opens
  the conversions at the cursor; the Convert button's tooltip shows that key.
- The tooltip of a button is the action's `title` and its key.

## Actions and keys

An action in `actions` has a `title`, an optional `hint`, and one of:

- `command`: a built-in command (`toggleComment`, `blockComment`, `indent`, `outdent`, ...).
- `insert`: a snippet; `$0` is where the cursor goes.
- `wrap: [before, after]`: around the selection.
- `linePrefix`: in front of every selected line, or taken away when all have it.
- `jump: { line: pattern }`: to the next / previous matching line (with `variants` for the two directions).
- `convert`: a conversion: `upper`, `lower`, `capitalize`, `snake`, `camel`, `pascal`, `kebab`, `constant`,
  `tabsToSpaces`, `spacesToTabs`, `trimTrailing`. Plain text has them all (`upperCase`, `lowerCase`, `capitalize`,
  `snakeCase`, `camelCase`, `pascalCase`, `kebabCase`, `constantCase`, `tabsToSpaces`, `spacesToTabs`,
  `trimTrailing`), so every language does; a pack names one to put it on its bar or give it a key of its own.
- `format: rules`: the formatter with the pack's `format:` parameters (Format, below). Every pack with parameters
  has it as its action `format`; JSON and XML name it to give it their own title.

## Outline

`outline:` is one list of patterns (shown in line order), or a list of named groups, as UltraEdit's tag groups:

```yaml
outline:
  - group: 'TODO'
    colour: accent                     # optional: the bullet's colour (#rrggbb or a theme colour)
    indent: auto                       # optional: the entries' depth, a number (1 when left out) or auto
    parent: false                      # optional: never the parent of an auto entry after it
    patterns:
      - { pattern: '//.*\s*(TODO|ACW):*\s+(.+)$' }
  - group: 'Functions'
    patterns:
      - { pattern: '^\s*def\s+(\w+)', case: true, indent: line }
      - { pattern: '^(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*\{', span: true }
```

| Key of a pattern | What |
|---|---|
| `pattern` | A JavaScript regular expression, matched per line (`^` / `$` at the line's start and end) |
| `name` | A capture number, or a list of them, joined with a space. In groups without it: every capture that matched, joined (`TODO fix this`); in a plain list: capture 1 |
| `case` | `true`: minds case. Patterns in groups ignore case otherwise (as UltraEdit's); a plain list's patterns use `flags` (`i`) |
| `indent` | In groups: `line` (the entry indented as its line is, in indent steps: methods under their class) or a capture number (its width), counted from the group's own `indent` |
| `level` | A fixed depth (1 to 6); in a plain list also a capture whose length is the depth |
| `span` | `true`: the pattern is matched against the whole text, so it may run over lines (a C function's `{` on the next line); the entry is the line the match starts on. Else `\s` would run into the next line |

A group's `indent` is the depth of its entries: a number (1 when left out; `indent: 2` shows them one step in), or
`auto`: in the merged outline (all groups in line order), one deeper than the nearest entry above it from another
group, so regions sit under the procedure they are in. A group with `parent: false` is never that entry above: a TODO
(`indent: auto`, `parent: false`) sits under the procedure or region it is in, and the regions after it stay under the
procedure. With the groups shown apart there is no line order across groups: an `auto` entry is at depth 1 there. An
entry's text loses the dashes and equals signs around it (`// ------ Tables ------` shows `Tables`), and a line of
nothing else (`// ----------`) is no entry: dashes are no way to indent, the group's `indent` is.

A group without entries is not shown. Within a group a line counts once (its first matching pattern); a line can be in
more than one group.

## Format: the formatter's parameters

One formatter for every language (`web/reformat.js`). It knows roles, not words: groups, blocks, conditions,
statements and their clauses, list items, elements, tables. The pack's `format:` says which of its words and signs
play which role, and which style it uses. It changes only whitespace and line breaks outside strings and comments.
The shipped packs are the examples (each has a full set at its end); `docs/plans/executed/PLAN-reformat.md` (appendix) has
them with notes, and `docs/plans/reformat-prototype` is the reference that tried each on a sample.

| Key | What |
|---|---|
| `case`, `word` | Words in any case (`false`) or exact; what a word is (a pattern) |
| `comments`, `strings` | As for the colouring; a line comment starting with a space (`' ;'`) only counts after a space, one ending with a space (`'rem '`) only as a word |
| `keep` | Regions kept exactly as written: heredocs, regex literals (`after`: only after one of these signs) |
| `groups` | Pairs (`pair: ['(', ')']`) with their own `open`, `close`, `base`, `openAt` (where a `{` goes: `same`, `next`, `keep`, or `{default, next: pattern of the head}`), `afterClose`, `oneLine`, `list` (a line per item when split), `block` (statements inside: braces), `tight` (no space inside) |
| `blocks.open` | Block words (`w`): `until` (what ends its condition: `then`, `do`), `before` / `when` (patterns for the text before / after the word), `inside` / `notInside`, `kind: single` (one statement: C's `if (...)`), `afterGroup`, `body: single`, `endsBefore` / `endsAfter` (sections and branches that end without a word of their own), `breakAfter`, `closes: false`, `line` (a whole-line pattern) |
| `blocks.middle` | `else`, `elseif`, `except`, `private:` ...: `of` (which blocks), `until`, `breakAfter`, `lineStart` |
| `blocks.close` | Closer -> the blocks it closes (`end if: if`; `end: [begin, case]`); `{of, strict}`: only the innermost |
| `singleBody` | What takes the place of a one-statement body on the next line: `{` (C), `begin` (Pascal) |
| `ends` | What ends a statement: `;`, and `"\n"` where a line does (VB, shell, JavaScript) |
| `continue`, `continueAfter` | A line starting with these (`.`, `|`) continues the one above, one step in; so does a line after one matching the pattern (VB's ` _`) |
| `statements`, `items` | Statements with their clause words (SQL: `update: [set, from, where]`); list items with their start words and clause (joins and `on`) |
| `alignAfter` | Clause words whose next lines line up under the code after the word, when the word has code after it (SQL, ASA: `[set]`); other clauses: one step in |
| `operators`, `compare`, `align` | `and` / `or` ...; comparisons; other texts lines are lined up on (`=`, `default`, `:=`) |
| `separators`, `space`, `trail`, `joinAfterClose` | List separators; one space after / before a sign; what may follow a `)` on its line; words joined after a `}` (`} else {`) |
| `keepLines`, `labels`, `keepIndent` | Lines at column 0 (`#if`, batch labels); lines at the column of their braces (C++ `public:`); keep the indentation as written (Python, markdown) |
| `freeClosers` | Closers that need no opener (Pascal's final `end.`, a shell pattern's `)`) |
| `markup`, `void`, `verbatimElements`, `autoClose`, `optionalEnd` | XML / HTML: tags; elements without content; elements kept as written; implied end tags; end tags that may be left out |
| `tables` | Markdown: rows around a delimiter row (`sep`, `delimiter`, `fill`) |
| `longLimit`, `clauseGap` | A join's `on` is long with more comparisons than this; the spaces before a short `on` |
| `style` | The style attributes below, the pack's defaults |

The style attributes (each also a setting per language: Options > Settings, Languages, "Format: ..."):

| Attribute | Values |
|---|---|
| `open` | `same` / `next`: after `(`, `[`, `{` and a block word, the content on the same line or the next |
| `close` | `same` / `own`: the `)` of a group over lines at the end of its last line or on a line of its own |
| `base` | `word` / `line`: the next line right of the `(` or block word, or a step right of the line it is on |
| `align` | `on` / `off`: anchors, lists as columns, joins in columns |
| `oneLine` | `keep` / `split`: a group written on one line stays, or goes over lines (JSON, XML, CSS) |
| `operator` | `start` / `end`: `and` / `or` at a line start in one column with the operands after them, or as typed |
| `afterClose` | `same` / `next`: what follows a `)` of a group over lines (a join's `on`) |
| `alignClause` | `first` / `off`: the first comparison of each join's `on` in one column |
| `longClause` | `next` / `column`: a long `on` on the next line, or in its column |
| `parenSpace` | `off` / `on`: no space or one space inside `( )` |

The indent step is the language's indent size (below), never a `format` key. A change to the parameters of a
shipped pack: run `docs/plans/reformat-prototype` (`t_asa.py`, `t_lang.py`) with the same change, and the in-app
test that compares LexPen's output with it.

## Tabs and whitespace

In `language.yaml`, all optional:

| Key | What | Example |
|---|---|---|
| `tabSize` | Where the tab stops are: Tab after text goes to the next one, and a tab after text is shown up to it. Else the setting (4) | `tabSize: 8` |
| `indentSize` | Where the indent stops are: Tab in a line's indentation, Indent / Outdent, Format's indent step, and a tab in the indentation is shown that wide. Else the setting (2) | `indentSize: 4` |
| `useTabs` | `true`: Tab, indent and Format write a tab (Makefile, Go, tab-separated files). Else spaces | `useTabs: true` |
| `trimTrailing` | The whitespace at line ends. `mode`: `setting` (default: on save as the setting says), `true` (always trimmed on save), `false` (never, not even by Remove whitespace at line ends). `keep: N`: at most N spaces or tabs stay, as written. `trimTrailing: false` / `true` set the mode only | `trimTrailing: { keep: 2 }` |

Markdown ships with `trimTrailing: { keep: 2 }`: two spaces at a line's end are a line break there.

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
| `/Function String` | `outline` patterns (`%` is `^`, `[^t ]++` is `\s*`, `^(...^)` is the group) |
| `/TGBegin "Name"` ... `/TGEnd` tag groups with `/TGFindStr` | `outline` groups: `- group: 'Name'` with `patterns`, in the word file's order; groups searched only inside a block (`/TGFindBStart`, Parameters) are left out |
| `/Open Fold Strings = "{"` / `EnableCFByIndent` | `fold: brace` / `fold: indent` |
| `LanguageMarker = "python"` | `firstLine: '^#!.*\bpython'` (files without a known extension) |
| `/Indent Strings`, `/Delimiters`, `/Member String`, `/Variable String`, tag groups inside a block (`/TGFindBStart`) | not used |

Each `/C` list gets its own token type, with a look in `tokens` (`procedure: { like: builtin }`), so it can be
restyled on its own later; the lists keep the word file's order (the first list with a word wins, as in
UltraEdit). Lists of signs only (operators, braces) are left out. Note in the pack's header which word file it
came from. The shipped packs from word files (`ahk`, `asa`, `batch`, `cpp`, `css`, `html`, `java`, `perl`,
`php`, `python`, `ruby`, `shell`, `vb`, `vbscript`) were generated this way; to bring one up to date with a
changed word file, regenerate its word lists the same way and keep the rest of the pack.
