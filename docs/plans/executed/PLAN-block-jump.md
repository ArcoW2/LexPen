# Plan: Next and previous block (Alt+PgDn, Alt+PgUp)

Status: executed 2026-10-28 (web/blocks.js; in-app test t32).
The number in the file name is the priority; rename to reorder.

## 1. What this is about

There is no key to move through a file by its structure. Ctrl+Up / Ctrl+Down and PgUp / PgDn move by lines or by
the view, not by the blocks the text is made of: the next object in a JSON list, the next function in a Python file,
the next section of a markdown document. The indent guides show those blocks (the cursor's guide is highlighted), but
going to the end of one means scrolling and looking.

## 2. The solution, in brief

Alt+PgDn goes to the start of the next block at the cursor's level; Alt+PgUp to the start of the previous one. When
there is none at that level, the move goes out a level and on from there. A block is what the file's language pack
folds (its `fold`: braces, indentation, markdown's headings); a language without folding uses the indentation as the
editor shows it. With Shift the move selects. It works in the editor, and in the preview on the preview's cursor of
plan 31.

## 3. Details

### 3.1 What a block is

- The ranges the language pack's `fold` gives (`foldFinder`, gutter.js): `brace` (JSON, C#, JavaScript, ...: from
  the line with the opening bracket to the line with its closing one), `indent` (Python, YAML: a line and the lines
  indented further below it), `markdown` (a heading and its section, a fence).
- `none`, or plain text: the indentation as the editor shows it (tabs at the file's tab size), as `indent` does.
- Markdown: headings give the levels; inside a section, list items and indented lines are blocks by their
  indentation (the `indent` ranges inside the section). See open question 1.
- The cursor's block: the innermost block that holds the cursor line, its first line and its closing line included.
  So in `docs/examples/json-records.json` line 6 (`},`) belongs to the block 3-6, and line 7 (`{`) to the block 7-14.
- Empty lines are never a target.

### 3.2 Alt+PgDn

- The target: the first line with text after the cursor's block, when it is still inside the block around it (the
  parent) and is not the parent's closing line. Else the same from the parent, and so on out.
- The cursor's block is the whole file (no smaller block holds the cursor line, as line 2 of the example): the next
  block start below the cursor.
- Nothing further: the cursor stays, a toast "No next block." (as find at the end).
- The example file, cursor on: 4, 5, 6 -> 7; 7, 8, 9 -> 15; 10, 11, 12, 13 -> 15 (no further block in 7-14, so the
  move goes out to 7-14's next one); 15 -> 27.
- Python:
  ```
  def a():
      body
  def b():
  ```
  From line 1 or 2 -> line 3, the line before the next indent (its header).
- The cursor goes to the start of the target line's text (after its indentation).

### 3.3 Alt+PgUp

- The start of the prior section: the first line of the block before the cursor's block in the same parent; none
  there: the same from the parent, and so on out.
- The example file: 15 -> 7; 7, 8, 9 -> 3; 11 -> 3 (no block before 10-13 in 7-14, so out to 7-14's prior one).
- See open question 2 for the cursor inside a block, not on its first line.

### 3.4 Keys and actions

- One action `block.next` with variants 1 (next) and -1 (previous), as `bookmarkNext`; `move: true`, so Shift
  selects from the cursor to the target (Shift+Alt+PgDn, Shift+Alt+PgUp), without an entry of its own in keys.json.
- keys.json: `"Alt+PgDn": ["block.next", 1]`, `"Alt+PgUp": ["block.next", -1]`. Both are free now.
- Edit menu: Next block, Previous block, near Next bookmark.
- The target is placed in view as a place jumped to (`revealFound`, "where a jump lands"), and is a place for
  position back / forward (`asFound`).
- Column mode and several cursors: the main cursor moves; the others are dropped, as other jumps do.

### 3.5 In the preview

- Needs plan 31 (the preview's cursor). The preview's cursor's source line is the starting line; the target is found
  in the source as in the editor; the preview's cursor goes to the start of the target line as the preview shows it,
  and the view follows.
- Shift is ignored there (plan 31: no key selection in the preview yet).
- The same source line can be inside a block the preview draws as one piece (a table, a picture): the cursor goes to
  the start of that piece.

### 3.6 Not in this plan

- Blocks of another language inside a file (a fence in markdown, lines you gave a language): they count as one block
  of the outer file, not by their own language's structure.
- Moving the block itself (as move mode does with lines).

### 3.7 Tests

- Unit tests are for the host's C#; this is web code, so in-app tests (a test data folder, the debug build, over
  the debugging port):
  - `docs/examples/json-records.json`: every line of 3.2 and 3.3 to its target, both directions.
  - Python: the example of 3.2; a nested function; the last function (no next block: the toast).
  - Markdown: from a paragraph under `## A` to `## B`; from the last `###` under `## A` out to `## B`; a list item to
    the next item at its level.
  - Plain text with indentation: as `indent`.
  - Shift: the selection from the cursor to the target, in both directions.
  - Back (Ctrl+Alt+-) returns to where the cursor was.
  - The preview (after plan 31): the same file targets as in the editor, the view following.

## 4. Open questions

None open. Taken as the plan proposed, when it was started without an answer (change them if you want otherwise):

1. Markdown lists and indents inside a section: the plan uses the indentation there. Should a list item's own
   paragraphs (indented under it) count, or only the list items?
2. Alt+PgUp with the cursor inside a block, not on its first line (cursor on line 9, block 7-14): the plan goes to the
   prior block (3). The editor's habit for such keys (Ctrl+Up to the paragraph) is the start of the current block
   first (7), then the prior one. Which?

## 5. Resolved during execution

| Topic | As built |
|---|---|
| Where the blocks come from | From the text, not from CodeMirror's fold ranges: those need an editor (its tokens), and the preview of a file has none. A pack with `fold: markdown` (markdown, and plain text, which uses that pack): headings as levels, the text under a heading one deeper, a fence's lines deeper than the fence and its end line closing it. Every other language: the indentation with the language's tab stops, and closing lines. Code that is not indented (minified JSON) has no blocks. |
| Closing lines | Only closing brackets (with `;` `,` after them), a line starting with `end`, `fi`, `done`, `esac`, or a closing tag. `} else {` is not one: it is the next block's line. |
| The cursor's block | The block a line opens, the block a closing line closes, else the block around the line. A block that is the whole file (JSON's outer braces, a markdown file under one `#` heading) counts as none: Alt+PgDn goes to the next block below, Alt+PgUp to the one above. |
| Markdown list items | Open question 1 as proposed: by indentation. An item is a block only when lines are indented under it; from a plain item Alt+PgDn goes out to the next section (the plan's test "a list item to the next item" holds for items with nested lines only). |
| Alt+PgUp inside a block | Open question 2 as proposed: the prior block (from line 9 of the example: line 3), not the start of the current one first. |
| No block before | Alt+PgUp from the first block under a parent that is the whole file stays, with a toast (from `## Second` under the only `#` heading: no move to it). |
| Keys and menu | `Alt+PgDn` / `Alt+PgUp` in keys.json; Edit > Next block, Previous block after the section entries. The action takes the preview (`preview: true`, plan 31): with the focus there it moves the preview's cursor, past markdown's marks on the target line (a heading's `## `), Shift ignored. |
| Tests | t32 in the debug build over the debugging port: every line of 3.2 and 3.3 of the example file both ways, the whole-file case, the cursor at the text start, Shift, position back, Python (nested methods, out of a class, the last function staying), indented plain text, markdown (a paragraph, a list item, a fence, a heading up), the preview (to a heading past its marks, in view, back up, Shift ignored). All pass; plan 31's t31 passes again with it. |
