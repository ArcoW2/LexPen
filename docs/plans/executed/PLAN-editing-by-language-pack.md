# Plan: Editing keys driven by the language pack, not by "is it markdown"

Status: executed (2026-11-08); see As built.

## 1. What this is about

Some editing keys behave per language, but the code decided that by asking "is this markdown" instead of reading the
language pack. Enter continued a list (`- `, `1. `, `> `, a task) and moved between table cells, Tab indented a list
item from anywhere in its line and moved between table cells, Shift+Tab the other way, Shift+Enter typed `<br>`: all
only for markdown (format.js, tabs.js). Other languages with the same structures got none of it: YAML has `- ` lists
and is all indentation, a line after `key:` (YAML) or `if x:` (Python) should be indented a step. Each new case added
another markdown check in the code.

## 2. The solution, in brief

The language pack declares its editing behaviour in a section `editing` (a line that opens a block, lists and their
markers, Tab in a list item, tables, Shift+Enter's text, keeping the indentation), and the keys read it for the
language at the cursor (an embedded block's own language inside a fence). Markdown's pack gets what it had; YAML and
Python get what fits them. The code keeps only generic behaviour, the same for every language, and no "is it
markdown" test for editing keys. Plain text gets nothing of its own: it opens as markdown, and its structure is not
known.

## 3. Details

### 3.1 The pack section

```yaml
editing:
  indentAfter: ':\s*(#.*)?$'     # Enter after a line opening a block: the new line a step in
  lists:                         # Enter after an item starts the next one; Enter on an empty item ends the list
    markers: ['[-*+] ', '\d+[.)] ']   # patterns after the indentation; a number counts on, [x] starts empty
  tabInListItem: indent          # Tab / Shift+Tab anywhere in a list item: the item in / out
  tables: pipe                   # Tab, Shift+Tab, Enter move between cells of a | table
  lineBreak: '<br>'              # Shift+Enter types this (none: Shift+Enter is Enter)
  keepIndent: true               # Enter: the new line as indented as the one before (when the formatter has no rule)
```

- Markdown: lists (bullets, tasks, numbers, quotes), Tab in an item, tables, `<br>`, keeping the indent: as before.
- YAML: `indentAfter` for `key:`, `- ` lists, Tab in an item, keeping the indent.
- Python: `indentAfter` for a line ending in `:`, keeping the indent.
- A pack without the section: the generic behaviour only (3.2). The template pack and the languages README explain
  it.

### 3.2 Generic, for every language

- **Enter in a line's indentation** (the cursor before the first non-blank): the line moves down as it is, the cursor
  still before its text.
- **Tab in the indentation or with a selection**: indent (tabs.js), Indent / Outdent (Ctrl+> / Ctrl+<): as before.

### 3.3 What changes in the code

- format.js: Enter, Tab, Shift+Tab and Shift+Enter ask the pack of the language at the cursor's line (`editingAt`:
  `lineLanguage`, else the file's) instead of `markdownOnly` / `isMarkdown`; list continuation is LexPen's own (from
  the markers), not CodeMirror's markdown-only `newlineAndIndentContinueMarkdownList`, so it works in any mode.
- tabs.js: "a list item" from the pack's markers.
- The table moves (moveCell, enterInTable) for a pack with `tables: pipe`.

### 3.4 Tests

- In the test copy, by real key presses: markdown as before; YAML and Python as in 3.1; SQL no list behaviour; a
  YAML block inside markdown gets YAML's indent after `key:`.

## 4. Open questions

None.

## 5. As built

- **Enter, in order**: a table row (`tables: pipe`); the cursor in the indentation (every language); a line opening a
  block (`indentAfter`); a list (`lists`); the formatter's indentation (`format`, as before); `keepIndent`; else
  CodeMirror's own. `indentAfter` goes before the list: in YAML `- name:` then Enter indents instead of starting an item.
- **Lists**: markers are patterns (not literal texts with "1 = a number"), so markdown's bullets, tasks, numbers and
  nested quotes (`(?:> ?)+`) need no special case. Numbered items after the new one count on while they would repeat a
  number (as CodeMirror's did). An empty item ends the list as before: the marker goes, an empty line follows. With
  several cursors the list continues for each when all are in an item after the marker; an empty item with several
  cursors, or a selection, gives the ordinary Enter.
- **Removed**: `markdownOnly` (app.js), `isMarkdown` and `mdKey` (format.js), no longer used.
- **A pack of your own** that copies a shipped one keeps these keys only with its `editing` section (README says so).
- **No unit test** of the markers: the keys live in format.js, which needs CodeMirror; they are covered by the test
  copy only.
- Tested in the test copy (real keys): markdown: a list continues, an empty item ends it, `1.` counts on and the
  next `2.` becomes `3.`, `- [x]` gives `- [ ]`, `> ` continues, Enter in the indentation, a paragraph keeps its
  indent, Tab and Shift+Tab in an item, Tab in a table cell, Shift+Enter `<br>`; YAML: `root:` then Enter indents, `- a`
  continues, the indent is kept, Tab in an item; Python: `if x:` indents a step (LexPen's indent step, 2 by default);
  SQL: `- a` then Enter is a plain new line; a YAML fence in markdown: `root:` then Enter indents. 397 unit tests
  passed.
