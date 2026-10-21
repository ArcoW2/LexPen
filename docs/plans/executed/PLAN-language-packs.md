# Plan: language packs (more file types, colouring and editor help per language)

Status: executed on 2026-10-19 on the branch `languages`. Decisions of the run are in section 9. The two
companion plans exist as drafts, as asked: `PLAN-fenced-code-colours.md` (Q5: fenced code in markdown keeps
highlight.js until that plan is done) and `PLAN-formatters.md` (Q7).
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
  where a folder with the same name wins; Q4), reads the YAML (YamlDotNet, NuGet, MIT licence; to list in THIRD-PARTY-NOTICES) and gives the page JSON, serves the
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
| - | None. | |

## 9. Resolved issues during execution

| # | Issue | Resolution |
|---|---|---|
| 1 | Colouring of the shipped languages: rules in the pack, or a built-in mode (5). | C#, JavaScript, JSON, YAML, PowerShell and XML name a built-in CodeMirror mode (their syntax needs more than patterns: nesting, here-strings, tags). SQL and Delphi / Pascal are coloured from the pack itself (word lists, quotes, comments, patterns), the wordfile style; the template (TCC / CMD) too. |
| 2 | The colouring engine: CodeMirror's simple mode and run mode were not in the bundle, and there is no Node.js here. | Both add-ons taken from the npm package of the same CodeMirror version (5.65.21) through the jsdelivr mirror, appended to editor.js; vendor.ps1 lists them for a later rebuild (as the comment and fold add-ons of the editor-first run). |
| 3 | The preview of a code file: highlight.js until now. | The editor's colouring (run mode), so the two never disagree, as one block per line with data-line: the outline and the scroll sync work as in markdown, and a long line wraps (executed/PLAN-long-lines.md). highlight.js stays for fenced code in markdown (PLAN-fenced-code-colours.md). |
| 4 | A size limit for colouring (5: measured, not guessed). | Measured on this PC with SQL, two runs: colouring the preview of 1 MB took 179 and 200 ms, of 4 MB 715 and 953 ms; opening in the editor 72 / 81 ms and 144 / 534 ms (the editor colours only what is on screen). Above 2 MB the preview of a code file is not coloured; the editor has no limit. |
| 5 | Markdown's bar from bar.yaml (3: "so the bar code is the same for every language"). | Markdown keeps its built-in formatting bar (heading menu, table grid, the state of bold / lists at the cursor: more than a list of buttons can say). Code languages get the bar of their bar.yaml; both switch off with View > Formatting bar. |
| 6 | Icons for the bars. | Shared ones in the plain text pack (comment, blockcomment, indent, outdent, snippet); a pack may have its own. The host sends them inline (SVG text); a button can have a short label after its icon ("select", "try"). |
| 7 | The language selector (4: "in the top bar"). | The language in the bottom bar is the selector (it already shows the language): a click lists the packs. Also View > Language... and F1. The choice for a file is kept by the host by path (State\file-languages.json); for a draft in the session. |
| 8 | .txt files. | Stay markdown, as before the packs (the markdown pack lists .txt). Your own pack or the selector can make them plain text. |
| 9 | The snippet's cursor marker (3: "|"). | $0, as in VS Code: | is common in code (C# ||, SQL concatenation). |
| 10 | Open in per language: a setting per pack, and packs can be added. | settings.json has a family default "openIn.*" ("": as the pack says); SettingsFile accepts openIn.<any language>. Your openMarkdownIn moves to openIn.markdown once (your settings.json is rewritten; the page's storage the same way). The settings window: General > Open in, a row per language. The F1 action "Open markdown in" is gone; View > Language... is new. |
| 11 | A pack's colours per theme (3, Q3). | CSS made from the pack for the app's theme (editor) and the preview's theme (preview): by theme name, then by base; colours checked as in themes, styles bold / italic / underline / strikethrough. |
| 12 | Things the packs needed beyond the plan's list. | fold (markdown, brace, indent, none) per pack; flags on a jump and on an outline pattern (i: any case); moreLines and moreBlocks for extra comment kinds (Pascal's (* *)); a quote's token (SQL's "identifiers" and [identifiers]). File dialogs take their filters from the packs. |
| 13 | Delphi form files (.dfm). | Not Pascal (object ... end blocks, binary or text): left to plain text. |
| 14 | Tests. | Unit tests: 118 pass (LanguagePacks: the shipped packs and the template load without problems, extensions, YAML kinds, your pack replacing one, a broken pack; SettingsFile: the openIn family and the move of openMarkdownIn). In-app scripts: t28-languages 24 checks (recognising, SQL and Pascal colouring in editor and preview, outlines, the bar, a snippet, a section jump, C# comment toggle, markdown unchanged, the selector kept after a restart, Open in), t29-userpacks 12 checks (the template as your TCC pack applied at once, its tokens, outline, linePrefix and wrap actions, its colours per base, a broken pack, the size limit). The earlier scripts pass (three expectations updated: C# now has an outline, the settings window has the Open in rows). |
| 15 | Asked after the run: more word types, as global variables (words starting with @@), local ones (@_) and other variables (@). | A word ending in * in a word list stands for every word starting with it ('@@*'); those are tried first, the longest first. A word list may have any name (a token type of your own); the new part `tokens` gives such a type a look: `like` a built-in type (its theme colour, so it follows every theme), with bold, italic, underline or strikethrough; `colors` can still set a colour per theme. SQL now has global (bold), local (italic) and variable. Checked in t28 (26 checks). |
| 16 | Asked after the run: numbers and strings per language (a string between ", where "" inside is not the end). | `numbers`: a pattern, a list of them (each may name its token) or false; without it the default (0x1F, 12, 1.5e3). Strings (`quotes`): `double: true` already made a doubled quote part of the string; the pattern now takes the longest match, so "say ""hi""" is one string (it stopped at the first " before: found by the new test). New: `multiline: true` for a string over several lines. In-app script t30: 7 checks, all pass. |
| 17 | Asked after the run: more than the theme's code colours, without a fixed palette ("red" is not the same on light and dark): a type like another, with more or less contrast. | `contrast` in `tokens`: lightness points further from the background (positive: stronger) or closer to it (negative: subtler), same hue and saturation (CSS relative colour in OKLCH; the direction comes from the base: darker on light, lighter on dark). So any number of types can follow every theme. SQL: global @@ contrast 20, variable @ as variable-2, local @_ contrast -20. On dark, 20 makes the colour nearly white (little colour is left at that lightness); the number can be tuned in the pack. In-app script t31: 3 checks (both directions, both bases), all pass; t28 checks the order of the three. |
| 18 | Asked after the run: one strict flow, no special cases (comments, strings and numbers had fixed types; unmatched text none; the built-in types' colours sat in app.css). | Text -> token type -> look. Every part names its type (word list name; the token of a rule, comments, quotes, numbers; the rest is text), and every type's look comes from tokens only: the plain text pack holds the looks of the usual types (also those of the built-in modes), a language adds or changes them per type (a change keeps the rest of the base look). A look: theme (a theme colour), like (another type), color, contrast, bold / italic / underline / strikethrough, byTheme (changes per theme or base; replaces the separate colors part). The code token rules left app.css; the colours stay the same (checked against the theme colours). In-app script t32: 12 checks, all pass; t28, t29, t31 pass. |
