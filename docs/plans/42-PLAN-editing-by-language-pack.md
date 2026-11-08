# Plan: Editing keys driven by the language pack, not by "is it markdown"

Status: draft 2026-11-08; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

Some editing keys behave per language, but the code decides that by asking "is this markdown" instead of reading the
language pack. Enter continues a list (`- `, `1. `, `> `, a task) and moves between table cells, Tab indents a list
item from anywhere in its line and moves between table cells, Shift+Tab the other way, Shift+Enter types `<br>`:
all only for markdown (format.js, tabs.js). Other languages with the same structures get none of it: YAML has `- `
lists and is all indentation, a Python or YAML line typed after an indented one should keep that indent, and a
plain-text note can have bullets too. Each new case adds another markdown check in the code.

## 2. The solution, in brief

The language pack declares its editing behaviour in a section `editing` (lists and their markers, what Tab does in a
list item, tables, what Enter keeps), and the keys read it for the language at the cursor (an embedded block's own
language inside a fence). Markdown's pack gets what it has now; YAML, plain text and Python get what fits them. The
code keeps only generic behaviour, the same for every language, and no "is it markdown" test for editing keys.

## 3. Details

### 3.1 The pack section

```yaml
editing:
  lists:                         # Enter after an item starts the next one; Enter on an empty item ends the list
    markers: ['- ', '* ', '+ ', '- [ ] ', '- [x] ', '1. ', '1) ', '> ']   # 1 = any number, counted on
  tabInListItem: indent          # Tab / Shift+Tab anywhere in a list item: the item in / out (else: a tab at the cursor)
  tables: pipe                   # Tab, Shift+Tab, Enter move between cells of a | table
  lineBreak: '<br>'              # Shift+Enter types this (none: Shift+Enter is Enter)
  keepIndent: true               # Enter: the new line as indented as the one before (when the formatter has no rule)
```

- Markdown: all of the above, as it works now.
- YAML: `lists: { markers: ['- '] }`, `tabInListItem: indent`, `keepIndent: true`.
- Plain text: `lists: { markers: ['- ', '* ', '1. '] }`, `keepIndent: true`.
- Python and other indent languages: `keepIndent: true` where their formatter does not already indent.
- A pack without the section: the generic behaviour only (3.2). The template pack and README explain it.

### 3.2 Generic, for every language

- **Enter in a line's indentation** (the cursor before the first non-blank): the line moves down as it is, the cursor
  still before its text. Today only markdown has this (format.js `enterInIndent`, just added); it becomes the rule.
- **Tab in the indentation or with a selection**: indent (as now, tabs.js), for every language.
- Indent / Outdent (Ctrl+> / Ctrl+<): as now.

### 3.3 What changes in the code

- format.js: the Enter, Tab, Shift+Tab, Shift+Enter keys ask the pack of the language at the cursor (`lineLanguage`)
  for `editing` instead of `markdownOnly` / `isMarkdown`; list continuation is LexPen's own (from the markers), not
  CodeMirror's markdown-only `newlineAndIndentContinueMarkdownList`, so it works in any mode.
- tabs.js: "a list item" from the pack's markers instead of markdown's `parseLine`.
- The table moves (moveCell, enterInTable) work for a pack with `tables: pipe`.
- Stays markdown's own, not editing keys: the preview rendering, the outline from headings, the formatting bar's
  commands (already per pack: `actions`), folding (already per pack: `fold`).

### 3.4 Tests

- Unit (Jint or C#): a pack's `editing` read; the list markers matched (numbers counted on, tasks, quotes).
- In the test copy: in markdown everything as now (Enter continues and ends lists, renumbers, tables, Tab in an
  item, Shift+Enter); in YAML Enter after `- a` gives `- `, Tab in the item indents it, a new line keeps the indent;
  in SQL no list behaviour; Enter in the indentation pushes the line down unchanged in every language.

## 4. Open questions

1. Which languages get which parts in the first build: markdown, YAML and plain text as in 3.1, or more (Python's
   `keepIndent`, reStructuredText, AsciiDoc)?
2. YAML: should Enter after `key:` indent the next line one step (a new mapping), or is that the formatter's job?
3. Plain text (.txt opens as markdown now, see the markdown pack's extensions): does plain text need its own list
   behaviour at all, or is markdown's enough there?
