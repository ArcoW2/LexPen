# Plan: outline in named groups, as UltraEdit's function list

Status: draft 2026-10-21, not started. Questions: section 4.

## 1. What this is about

The outline (Ctrl+Shift+H) already finds its entries with regular expressions from the language pack, and the ASA
pack's patterns were taken from `Sybase_ASA_SQL.uew`. But it is one flat list in line order: the word file's tag
groups (`/TGBegin "TODO"` ... `/TGEnd`, `"Procs/Funcs/triggers"`, `"Regions"`, `"Tables"`) are lost, so TODOs,
regions and procedures run through each other. Asked for: the outline as UltraEdit shows it, the entries under
their group's name.

## 2. The solution, in brief

A pack's outline can be split into named groups, each with its own patterns, as the word file's tag groups. The
outline then shows a header per group with its entries under it, in line order within the group; a header folds
open and closed, and that is kept per language. A pack without groups keeps today's flat list, and markdown's
headings stay as they are. The ASA pack gets the groups of its word file; the other packs from word files follow
where their word file has tag groups.

## 3. Details

### 3.1 What UltraEdit does, and what LexPen has

| UltraEdit (`.uew`) | LexPen today |
|---|---|
| `/TGBegin "Name"` ... `/TGEnd`: a named group | none: all patterns in one list |
| `/TGFindStr = "regex"`, several per group | `outline:` patterns, each with `name` (the capture) and `level` (1 or 2) |
| The function list: a tree, a node per group | one flat list, in line order, indented by level |
| `/TGFindBStart` / `/TGFindBEnd`: entries inside a block (methods in a class) | not used (README, "From an UltraEdit word file") |
| The shown text: the captured parts of the match | one capture (`name: 1`) |

The patterns themselves already work line by line as UltraEdit's; nothing changes in how a line is matched.

### 3.2 The pack

`outline` takes either today's list or groups:

```yaml
outline:
  - group: TODO
    patterns:
      - { pattern: '//.*\s*(TODO|ACW|!@#):*\s+([^0-9].+)$', name: [1, 2] }
  - group: Procs/Funcs/triggers
    patterns:
      - { pattern: '^\s*create\s+(?:or\s+replace\s+)?(procedure|function|view|event|domain)\s+([\w".]+)', name: [1, 2], flags: i }
      - { pattern: '^\s*create\s+or\s+replace\s+trigger\s+([\w".]+)', name: 1, flags: i }
```

- `name` may be a list of captures, joined with a space (the word file's TODO pattern captures the tag and the
  text; see 4.2).
- A line can be in more than one group (a `// TODO` on a `create procedure` line shows under both). Today the
  first matching pattern wins; within one group that stays so.
- `level` stays for the flat list; inside a group it may indent an entry further.
- The settings window reports a group without a name or patterns as a pack mistake, as it does for a bad
  pattern now.

### 3.3 The outline

- A header per group (its name, the number of entries), the entries under it in line order. A group without
  entries is left out (see 4.3).
- A click on a header folds it; folded groups are kept per language (in the window's session), so a .sql file
  opens with TODO folded when you folded it last time.
- The highlighted entry: the last entry above the cursor, of all groups (today it is the last one in the list,
  which is the same thing only while the list is in line order). Its group opens when it is folded? See 4.4.
- Resizing, the click to go to the line, the preview: unchanged.

### 3.4 Packs

- `asa`: its patterns go into the word file's five groups, with its names and order.
- The other packs made from word files: grouped where their word file has `/TGBegin` groups; packs whose word
  file has only `/Function String` keep the flat list. Which ones have groups: to be read from the word files
  when this is built (see 4.1).
- README of the packs: the groups, and the row "From an UltraEdit word file" updated (`/TGBegin` -> `group`).

### 3.5 Not in this plan

- `/TGFindBStart` / `/TGFindBEnd` (entries only inside a block). Possible later as a group's `inside:` pattern.
- Sorting a group by name (UltraEdit can); see 4.5.
- Reading `.uew` files directly. The pack stays the one source; a word file is converted once, as now.

### 3.6 Tests

- Unit (`LanguagePacksTests`): every shipped pack still loads; the grouped form is read; a group without patterns
  is reported.
- In-app (new t63): an ASA file with a TODO, a region, a procedure and a table shows four headers with their
  entries; a TODO on a procedure line under both; folding a header and a restart keeps it folded; the highlight
  follows the cursor across groups; a pack with the flat list (C#) and markdown unchanged.

## 4. Open questions

1. **Which packs.** Only ASA now (the example), or every pack from a word file that has tag groups? Recommended:
   ASA now, the others when their word file has groups (they are in `%APPDATA%\IDMComp\UltraEdit\wordfiles`).
2. **The shown text.** When a pattern captures more than one part (the TODO tag and its text, `procedure` and
   the name), show them joined (`TODO fix this`, `procedure sp_x`), or only the last one? I assumed UltraEdit
   joins them; please confirm what you see there.
3. **Empty groups.** Leave a group without entries out, or show its header anyway?
4. **Highlight in a folded group.** Open the group, or highlight its header only?
5. **Sorting.** Line order within a group, or an option to sort by name?
