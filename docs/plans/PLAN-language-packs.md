# Plan: language packs (more file types, colouring and editor help per language)

Status: plan only, nothing built. Section 8 lists the questions to answer before building.

## 1. What this is about

LexPen is built around markdown. Other files are second class: JSON, YAML, PowerShell and C# get fixed
colouring (highlight.js in Read mode, a CodeMirror mode in Edit mode), everything else is plain text,
and the formatting bar is markdown only. Asked for:

- more file types to view and edit simply, e.g. JavaScript ("js1" taken as `.js`) and C#;
- colouring that is not hard-wired: a definition per type, with its colours and its specifics (SQL or
  C# need other things than Perl, PostScript or YAML);
- a way to choose the type of a file;
- the helper buttons at the top per type, icons included;
- preferably one folder per language with everything it needs: icons, macros, colouring, reserved
  words, opening / closing quotes, multi-line constructs, (auto)indent, and so on.

## 2. The solution, in brief

A language is a folder: `languages\<name>\` with a `language.json` (file extensions, comment and quote
characters, brackets, indent rules, colouring rules with reserved words, colours) and a `bar.json`
(the helper buttons: icon file, tooltip, shortcut, what it inserts), plus the icons. One colouring
definition drives both views: the editor highlights with it while typing, and Read mode renders the
same definition read-only, so the two never disagree. The language of a tab follows its extension and
can be changed from a selector in the top bar. Markdown becomes a pack too, keeping its own renderer
and table tools. Packs ship with LexPen; a user folder with the same layout adds or overrides languages.
Nothing of this loads when LexPen starts on a markdown file in Read mode.

## 3. What a pack contains

```
languages\
  csharp\
    language.json     name, extensions, comments, quotes, brackets, indent, colouring rules, colours
    bar.json          helper buttons for this language
    icons\*.svg       the button icons (single colour, follow the theme)
  sql\ ...
  _template\          documented starting point: copy, rename, edit
```

`language.json`, the parts:

| Part | Holds | Used for |
|---|---|---|
| `name`, `extensions`, `firstLine` | "C#", `[".cs", ".csx"]`, optional pattern for the first line (`#!/usr/bin/perl`) | choosing the language of a file |
| `comments` | line comment (`//`, `--`, `#`), block comment (`/* */`, `{ }` and `(* *)` for Pascal) | colouring, a "toggle comment" button |
| `quotes` | string delimiters, escape character, multi-line strings (C# `@"..."` and `"""..."""`, SQL `'...'` with `''`) | colouring, auto-close |
| `brackets` | pairs to match and auto-close | matching, auto-close |
| `indent` | unit (spaces / tab, size), what opens and closes a level (`{` `}`, `begin` `end`, YAML's `:`) | auto-indent on Enter, re-indent |
| `caseSensitive` | SQL and Pascal are not | keyword matching |
| `words` | named lists: keywords, types, built-ins, constants | colouring |
| `rules` | ordered patterns per state (start, in-block-comment, in-string, ...) giving a token type | colouring of everything the lists do not cover: numbers, attributes, preprocessor lines, here-strings |
| `colors` | per token type, light and dark: `keyword`, `string`, `comment`, `number`, `type`, `function`, `attribute`, `operator`, `meta`, ... | colouring. Optional: without it the app theme's colours apply, so packs look alike by default |

`bar.json`: a list of buttons and separators. Each button: `icon` (file in `icons\`), `title`,
optional `key` (shortcut), and one action:

| Action | Example |
|---|---|
| `wrap`: text before / after the selection, cursor between when empty | SQL `/* */`, PowerShell `$( )` |
| `linePrefix`: toggled on every selected line | comment lines with `//` or `--` |
| `insert`: a snippet with a cursor marker | C# `try { | } catch (Exception ex) { }`, SQL `SELECT | FROM  WHERE ` |
| `command`: a built-in command by name | `toggleComment`, `indent`, `outdent`, `format` (where a pack offers one), markdown's table commands |

The markdown pack's `bar.json` lists today's bar (bold, headings, lists, table, ...) with `wrap`,
`linePrefix` and `command`, so the bar code is the same for every language.

## 4. Choosing the language of a file

- By extension, then by `firstLine` for files without a known extension; else plain text.
- A selector in the top bar (only shown for the active tab, e.g. "C#"), listing all packs. Choosing one
  re-colours the tab and swaps the bar. The choice is kept per file in the session and in the recent
  lists' data, so the file opens with it next time.
- Drafts (new files) start as markdown, as now; the selector makes them anything else.

## 5. How it is built

- Colouring engine: CodeMirror 5's "simple mode" addon (modes defined by ordered regular-expression
  rules per state, which is what `rules` is) for the editor, and its "run mode" addon to render the
  same definition as coloured, read-only HTML for Read mode. Both are part of the CodeMirror 5 package
  already vendored (to confirm when vendoring: `node_modules` is not installed in this checkout).
  `language.json` is turned into a simple-mode definition in the page; `words` become generated rules.
- Where a hand-written CodeMirror mode is clearly better (markdown/gfm, YAML's indentation-based
  structure) a pack may name it (`"mode": "yaml"`) instead of giving `rules`; colours and the bar still
  come from the pack.
- highlight.js stays for fenced code blocks inside markdown. A fence whose language has a pack could
  use the pack instead (question Q5).
- Host: lists the packs (app folder `languages\`, then the user folder `%LOCALAPPDATA%\LexPen\languages\`,
  where a folder with the same name wins), reads them, and serves the icons. File dialogs get their
  type filters from the packs' extensions.
- Page: a pack is fetched the first time a file of that language is shown, not before. Starting on a
  markdown file in Read mode loads nothing new (checked as with the editor help).
- A pack with an error does not stop LexPen: that language falls back to plain text, a toast names the
  file and the problem.
- The colouring rules run in the page while typing, so very large files fall back to plain text above
  a size limit (the limit to be measured, not guessed).

## 6. Order of work

1. The pack format, the loader and the selector; plain text, markdown (as a pack, unchanged behaviour)
   and the four languages LexPen already colours (JSON, YAML, PowerShell, C#) as packs, so nothing is
   lost.
2. New languages, from your list (Q1).
3. `bar.json` for code files: comment toggle, indent / outdent and per-language snippets.
4. `_template` with a short README in the folder: how to make a pack, every key explained.

## 7. Tests

- Pack loading: app and user folder, override by name, a broken pack falls back with a message.
- Choosing: extension, first line, selector, the choice remembered after a restart.
- Colouring: per pack a sample file with every construct (keywords in both cases where not case
  sensitive, nested and multi-line comments, multi-line and escaped strings); the same tokens in Edit
  and Read mode.
- Editing: auto-indent, auto-close of quotes and brackets, comment toggle, snippets with the cursor
  marker, undo is one step.
- Bar: swaps with the language; icons in light and dark.
- Startup in Read mode on markdown: same files loaded as before; launch time measured before / after.
- Markdown unchanged: the editor-help checks (62 commands) still pass with markdown as a pack.

## 8. Questions before building

| # | Question | Proposal |
|---|---|---|
| Q1 | Which languages, beyond JSON, YAML, PowerShell and C#? Your work suggests Delphi / Pascal (`.pas`, `.dpr`, `.dfm`), SQL, XML (`.csproj`, `.config`, `.xml`), JavaScript / TypeScript; you also named Perl and PostScript | Delphi, SQL, XML, JavaScript first; the rest from the template when needed |
| Q2 | Pack file format: JSON is parsed natively; YAML is nicer to edit by hand but needs a parser added | JSON, comments allowed (`//`), so the files can explain themselves |
| Q3 | Colours per pack, or only token types with the app theme's colours? | Token types, with optional colours per pack (both light and dark) |
| Q4 | Where packs live: app folder only, or also a user folder that overrides? | Both: shipped packs in the app folder, your own / changed ones in the user folder, so an update does not overwrite them |
| Q5 | Fenced code blocks in markdown: keep highlight.js, or colour with the pack when there is one? | Keep highlight.js in this round; same look can come later |
| Q6 | Code files open in Edit mode now. Keep that, or Read first? | Keep Edit for code files; the selector and bar work in both |
| Q7 | Formatters (e.g. "format SQL", "format JSON") per pack | Not in this round; JSON pretty-print could be a built-in `command` |
| Q8 | "Macros": snippets as in section 3, or recorded key sequences? | Snippets (`insert` with a cursor marker); recorded macros are a separate feature |

## 9. Resolved issues during execution

| # | Issue | Resolution |
|---|---|---|
