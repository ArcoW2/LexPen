# Plan: language packs (more file types, colouring and editor help per language)

Status: Q1-Q8 answered on 2026-10-19 and worked in; section 8 has one new question. Two companion plans
exist as drafts, as asked: `PLAN-fenced-code-colours.md` (Q5) and `PLAN-formatters.md` (Q7); this plan is
approved only with both present, and is done only when the fenced code colours are resolved or planned there.
Runs after `executed/PLAN-editor-first.md` (keys file, the markdown pack's `actions` part) and
`executed/PLAN-themes.md` (colours from the theme).

## 1. What this is about

LexPen is built around markdown. Other files are second class: JSON, YAML, PowerShell and C# get fixed
colouring (highlight.js in the preview, a CodeMirror mode in the editor), everything else is plain text,
and the formatting bar is markdown only. Asked for:

- more file types to view and edit simply, e.g. JavaScript and C#;
- colouring that is not hard-wired: a definition per type, with its specifics (SQL or C# need other things
  than Perl, PostScript or YAML);
- a way to choose the type of a file;
- the helper buttons at the top per type, icons included;
- one folder per language with everything it needs: icons, snippets, colouring, reserved words, opening /
  closing quotes, multi-line constructs, (auto)indent, and so on, in a file that is pleasant to edit by
  hand, as UltraEdit's wordfiles.

## 2. The solution, in brief

A language is a folder: `languages\<name>\` with a `language.yaml` (file extensions, how the file opens,
comment and quote characters, brackets, indent rules, colouring rules with reserved words, the outline,
the named actions and snippets of the language) and a `bar.yaml` (the helper buttons: icon file, tooltip,
which action), plus the icons. Keys are not in a pack: the global `keys.json` maps keys to action names, so
a key means the same in every language and the pack only decides what the action does. One colouring
definition drives both views: the editor highlights with it while typing, and the preview renders the same
definition, so the two never disagree. Colours come from the theme; a pack may override them per theme. The
language of a tab follows its extension and can be changed from a selector in the top bar. Markdown becomes
a pack too, keeping its own renderer and table tools. Packs ship with LexPen; your own folder with the same
layout adds or overrides languages.

## 3. What a pack contains

```
languages\
  csharp\
    language.yaml     name, extensions, open, comments, quotes, brackets, indent, colouring, outline, actions
    bar.yaml          helper buttons for this language
    icons\*.svg       the button icons (single colour, follow the theme)
  sql\ ...
  _template\          documented starting point: copy, rename, edit
```

YAML (Q2): it reads like UltraEdit's wordfiles: word lists as plain lists, patterns without JSON's escaping
of every backslash, comments with `#`. keys.json, settings.json and the themes stay JSON.

`language.yaml`, the parts:

| Part | Holds | Used for |
|---|---|---|
| `name`, `extensions`, `firstLine` | "C#", `[.cs, .csx]`, optional pattern for the first line (`#!/usr/bin/perl`) | choosing the language of a file |
| `open` | `edit`, `split` (editor and preview) or `preview` (Q6) | how a file of this language opens, unless your setting says otherwise (section 4) |
| `comments` | line comment (`//`, `--`, `#`, `REM` and `::`), block comment (`/* */`, `{ }` and `(* *)` for Pascal) | colouring, toggle comment |
| `quotes` | string delimiters, escape character, multi-line strings (C# `@"..."` and `"""..."""`, SQL `'...'` with `''`) | colouring, auto-close |
| `brackets` | pairs to match and auto-close | matching, auto-close |
| `indent` | unit (spaces / tab, size), what opens and closes a level (`{` `}`, `begin` `end`, YAML's `:`) | auto-indent on Enter, re-indent |
| `caseSensitive` | SQL and Pascal are not | keyword matching |
| `words` | named lists: keywords, types, built-ins, constants | colouring |
| `rules` | ordered patterns per state (start, in-block-comment, in-string, ...) giving a token type | colouring of everything the lists do not cover: numbers, attributes, preprocessor lines, here-strings |
| `actions` | named actions of this language (`heading1`, `toggleComment`, `codeBlock`, ...), each one of the kinds below, with a `title` (menu text) and a `hint` (one line, for tooltips and F1) | what a key (`keys.json`) or a bar button does in this language; an action a language lacks greys out |
| `outline` | one or more patterns (regular expressions) that find the entries of the outline, each with a level and the group that holds the name: markdown `^(#{1,6})\s+(.*)` (level from the number of `#`), SQL `^\s*create\s+(or\s+replace\s+)?(procedure|function|view|trigger)\s+([\w.\[\]"]+)`, Pascal `^\s*(procedure|function|constructor|destructor)\s+([\w.]+)`, C# classes and methods | the outline at the right of a pane (today: markdown headings only; a language without `outline` has its Outline button greyed out) |
| `colors` | per token type: `keyword`, `string`, `comment`, `number`, `type`, `function`, `attribute`, `operator`, `meta`, ... | optional (Q3): without it the theme's colours apply, so packs look alike by default. With it: keyed by theme name, then by base (`light` / `dark`), see executed/PLAN-themes.md 3.4. Each entry may also set `bold`, `italic`, `underline`, `strikethrough` (styles of the editor font, see executed/PLAN-fonts.md) |

`bar.yaml`: a list of buttons and separators. Each button: `icon` (file in `icons\`), `title` and the
name of an action from `actions`. No key: the tooltip shows the key that `keys.json` gives that action.

The action kinds, for the entries in `actions`:

| Action | Example |
|---|---|
| `wrap`: text before / after the selection, cursor between when empty | SQL `/* */`, PowerShell `$( )` |
| `linePrefix`: toggled on every selected line | comment lines with `//` or `--` |
| `insert`: a snippet with a cursor marker (Q8: snippets, not recorded macros) | C# `try { | } catch (Exception ex) { }`, SQL `SELECT | FROM  WHERE ` |
| `jump`: go to the next / previous line matching a pattern (the key gives the direction) | section moves on Ctrl+PgDn / Ctrl+PgUp: markdown headings, SQL `CREATE PROCEDURE`, Pascal `procedure` / `begin`, C# `{` |
| `command`: a built-in command by name | `toggleComment`, `indent`, `outdent`, markdown's table commands; `format` comes with PLAN-formatters.md |

The markdown pack's `actions` hold today's format commands (bold, headings, lists, table, ...) with
`wrap`, `linePrefix` and `command`, and its `bar.yaml` lists them, so the bar code is the same for every
language. Today's `wwwroot\languages\<name>\language.json` (markdown, plain text) becomes `language.yaml`.

## 4. Choosing the language of a file, and how it opens

- By extension, then by `firstLine` for files without a known extension; else plain text.
- A selector in the top bar (only shown for the active tab, e.g. "C#"), listing all packs. Choosing one
  re-colours the tab and swaps the bar. The choice is kept per file in the session and in the recent
  lists' data, so the file opens with it next time.
- Drafts (new files) start as markdown, as now; the selector makes them anything else.
- How a file opens (Q6): the language decides (`open` in its pack: markdown `edit`, code files `edit`, ...).
  Your setting per language overrides it: `openIn.<language>` in settings.json (`openIn.markdown`,
  `openIn.json`, ...), "" meaning "as the language says". The settings window shows one row per language under
  General > Open in; a pack added later gets its row from its name. Today's `openMarkdownIn` becomes
  `openIn.markdown` (moved over once).

## 5. How it is built

- Colouring engine: CodeMirror 5's "simple mode" addon (modes defined by ordered regular-expression
  rules per state, which is what `rules` is) for the editor, and its "run mode" addon to render the
  same definition as coloured HTML for the preview. Both are part of the CodeMirror 5 package
  (vendored without Node.js, as the comment and fold add-ons were).
  `language.yaml` is turned into a simple-mode definition in the page; `words` become generated rules.
- Where a hand-written CodeMirror mode is clearly better (markdown/gfm, YAML's indentation-based
  structure) a pack may name it (`mode: yaml`) instead of giving `rules`; colours and the bar still
  come from the pack.
- highlight.js stays for fenced code blocks inside markdown (Q5); see PLAN-fenced-code-colours.md.
- Host: lists the packs (app folder `languages\`, then your folder `%LOCALAPPDATA%\LexPen\languages\`,
  where a folder with the same name wins; Q4), reads the YAML (see Q9) and gives the page JSON, serves the
  icons, watches your folder (a changed pack applies at once, as themes do). File dialogs get their type
  filters from the packs' extensions.
- Page: a pack is fetched the first time a file of that language is shown, not before.
- A pack with an error does not stop LexPen: that language falls back to plain text, the settings window and
  a message name the file and the problem.
- The colouring rules run in the page while typing, so very large files fall back to plain text above
  a size limit (the limit to be measured, not guessed). The 10,000-character colouring limit per line and the
  long-line wrapping (executed/PLAN-long-lines.md) stay.

## 6. Order of work

1. The pack format (YAML), the loader and the selector; plain text, markdown (as a pack, unchanged
   behaviour) and the languages LexPen already colours (JSON, YAML, PowerShell, C#) as packs, so nothing is
   lost. These are the main ones: markdown, C#, JSON and YAML, then PowerShell.
2. New languages (Q1): Delphi / Pascal, SQL, XML, JavaScript. CMD / TCC (`.bat`, `.cmd`, `.btm`; comments
   `REM` and `::`) later, from the template.
3. `bar.yaml` for code files: comment toggle, indent / outdent and per-language snippets.
4. Open in per language (section 4).
5. `_template` with a short README in the folder: how to make a pack, every key explained.

## 7. Tests

- Pack loading: app and user folder, override by name, a broken pack falls back with a message, a changed
  pack applies at once.
- Choosing: extension, first line, selector, the choice remembered after a restart; how it opens: the pack's
  `open`, overridden by your setting.
- Colouring: per pack a sample file with every construct (keywords in both cases where not case
  sensitive, nested and multi-line comments, multi-line and escaped strings); the same tokens in the editor
  and the preview; colours from the theme, and a pack's own colours by theme name, then base.
- Editing: auto-indent, auto-close of quotes and brackets, comment toggle, snippets with the cursor
  marker, undo is one step.
- Bar: swaps with the language; icons in light and dark.
- Startup on a markdown file: same files loaded as before; launch time measured before / after.
- Markdown unchanged: the earlier in-app scripts still pass with markdown as a pack.

## 8. Open questions

| # | Question | Proposal |
|---|---|---|
| Q9 | Reading YAML: the host with YamlDotNet (a NuGet package, MIT licence, in THIRD-PARTY-NOTICES), or the page with js-yaml (vendored)? | The host with YamlDotNet: the host already lists and checks the packs, so problems are reported in one place, and the page keeps getting JSON. |

## 9. Resolved issues during execution

| # | Issue | Resolution |
|---|---|---|
