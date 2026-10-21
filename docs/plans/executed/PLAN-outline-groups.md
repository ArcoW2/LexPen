# Plan: outline in named groups, as UltraEdit's function list

Status: executed 2026-10-21 (branch `outline-groups`); answers of 2026-10-21 worked in (section 4); what was decided
while building: section 5.

## 1. What this is about

The outline (Ctrl+Shift+H) already finds its entries with regular expressions from the language pack, and the ASA
pack's patterns were taken from `Sybase_ASA_SQL.uew`. But it is one flat list in line order: the word file's tag
groups (`/TGBegin "TODO"` ... `/TGEnd`, `"Procs/Funcs/triggers"`, `"Regions"`, `"Tables"`) are lost, so TODOs,
regions and procedures run through each other. Asked for: the outline as UltraEdit shows it, the entries under
their group's name.

## 2. The solution, in brief

A pack's outline can be split into named groups, each with its own patterns, as the word file's tag groups. The
outline then shows a header per group with its entries under it, in line order; a header folds open and closed,
kept per language, and a group without entries is left out. A setting (also in the outline's right-click menu)
merges the groups into one list in line order; a coloured bullet in front of an entry tells its group (another
setting). An entry's text joins what its pattern captured, and a pattern can take the entry's indentation from the
line. Every pack whose UltraEdit word file has tag groups gets them; markdown's headings and packs without groups
stay as they are.

## 3. Details

### 3.1 What UltraEdit does, and what LexPen has

| UltraEdit (`.uew`) | LexPen |
|---|---|
| `/TGBegin "Name"` ... `/TGEnd`: a named group | `outline:` a list of groups (`group`, `patterns`) |
| `/TGFindStr = "regex"`, several per group | `patterns` of the group, each its own regex |
| The function list: a tree, a node per group | a header per group; or all groups together in line order (a setting) |
| `/TGFindBStart` / `/TGFindBEnd`: entries inside a block (parameters, variables) | left out (3.5) |
| The shown text: the captured parts of the match, joined | `name`: a capture, a list of them, or (default) all of them joined |

A pattern is matched against the whole text (`^` and `$` at line starts and ends), as UltraEdit does, so a
pattern over more than one line (a C function's `{` on the next line) works; the entry belongs to the line where
the match starts. UltraEdit's patterns ignore case unless they start with `(?-i)`.

### 3.2 The pack

```yaml
outline:
  - group: TODO
    patterns:
      - { pattern: '//.*\s*(TODO|ACW|!@#):*\s+([^0-9].+)$' }
  - group: Procs/Funcs/triggers
    patterns:
      - { pattern: '^\s*create\s+(?:or\s+replace\s+)?(procedure|function|view|event|domain)\s+([\w".]+)' }
      - { pattern: '^\s*create\s+or\s+replace\s+trigger\s+([\w".]+)' }
```

- `name`: a capture number or a list of them, joined with a space; without it, every capture that matched,
  joined (UltraEdit's way: `TODO fix this`, `procedure sp_x`).
- `case: true`: the pattern minds case (UltraEdit's `(?-i)`); else it does not.
- `indent`: the entry's indentation in the outline: `line` (the line's own indentation, in
  indent steps) or a capture number (the width of that capture). `level` (a fixed depth) stays as it is.
- `colour` of a group: the colour of its bullet (a theme colour name or `#rrggbb`); without it, the group's place
  picks one of a few distinct colours.
- A line can be in more than one group; within a group, the first matching pattern of a line wins.
- The old flat list (`outline:` with patterns, no groups) stays valid.

### 3.3 The outline

- A header per group (its name, the number of entries), the entries under it in line order. A group without
  entries is left out.
- A click on a header folds it; folded groups are kept per language.
- **Together, by line** (setting `outlineMerged`, also in the outline's right-click menu): one list of all groups'
  entries in line order, no headers.
- **Group bullets** (setting `outlineBullets`, also in the right-click menu): a bullet in front of every entry in
  its group's colour.
- The highlighted entry: the last entry above the cursor, of all groups; when its group is folded, the group opens.
- Resizing, the click to go to the line, the preview: unchanged.

### 3.4 Packs

Every pack whose word file has tag groups: `asa` (Sybase_ASA_SQL), `batch`, `cpp`
(c_cplusplus), `csharp`, `css`, `html`, `java`, `javascript`, `perl`, `php`, `powershell`, `python`, `ruby`,
`vbscript`, `vb` (visualbasic): their groups with their names and order, the patterns converted to JavaScript's
regular expressions (`\<` -> `\b`, `\x{007f}` -> `\u007f`, `(?s:...)` -> `[\s\S]`, `(?-i)` -> `case: true`,
`[ ^t]` -> `[ \t]`). `ahk` and `sql` (no tag groups) and `pascal` (no word file) keep their lists. README of the
packs: the groups, and the row "From an UltraEdit word file".

### 3.5 Not in this plan

- `/TGFindBStart` / `/TGFindBEnd` (sub-groups searched only inside a block: Parameters, Variables).
- Sorting by name (the groups are in line order; together they are in line order too).
- Reading `.uew` files directly. The pack stays the one source; a word file is converted once.

### 3.6 Tests

- Unit (`LanguagePacksTests`): every shipped pack still loads, the grouped form included.
- In-app (new t72): an ASA file with a TODO, a region, a procedure and a table shows their headers with their
  entries, joined texts; an empty group left out; folding a header, kept after a restart; the highlight follows the
  cursor across groups and opens a folded group; together by line (setting and right-click menu); bullets in the
  group colours; `indent: line`; a C function over two lines found; the flat list (pascal) and markdown unchanged.

## 4. Open questions

None.

## 5. Resolved during execution

| Point | What was done |
|---|---|
| Line by line, or the whole text | Matching the whole text made `\s` run into the next line: ASA's `begin\s*(?:--|//)` caught the `// TODO` below a `begin` (UltraEdit has the same rule, its patterns use `[ 	]`; ours use `\s`). So patterns match per line, and one that must span lines says so: `span: true` (C's struct typedef and its function with `{` on the next line). |
| The packs' patterns | The packs' own patterns (converted from these word files earlier, tested by t37) arranged into the word files' groups, names and order, not UltraEdit's raw patterns again (some, as C's function pattern without an anchor, backtrack badly on a large file). Groups a word file lacks but the pack had stay, at the end: C# Classes, JavaScript Classes, HTML Images, Scripts, Stylesheets. ASA's TODO captures the tag again (`TODO fix this`). |
| Indentation | `indent: line` for Python's classes and functions and Ruby's functions (a method under its class). The level is the line's indentation in indent steps plus one. |
| Folding | Kept per language in the window's browser storage (`outlineFolded.<language>`), so also after a restart. |
| The highlight | As before it follows the top line in view (not the cursor); the entry found is the last at or above it of all groups, and its group opens when folded. |
| Settings | `outlineMerged` and `outlineBullets` (Options > Settings, Editor, Outline; also the outline's right-click menu). Bullets also on the group headers. |
| Tests | t72 (13 checks: groups, joined texts, an empty group left out, folding and after a restart, the highlight opening a group, together by line from the right-click menu, bullets, indent: line, a C function over two lines, the flat Pascal list, every pack's patterns compile). Updated: t28 (C# groups; the SQL bar has Reformat), t35 (ASA's joined text), t37 (C and HTML in group order), t29 (the template's folder is `defaults`, since the app-files change). Unit tests: 181 pass. |
