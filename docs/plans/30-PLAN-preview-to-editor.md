# Plan: From the preview to the editor (double click)

Status: draft 2026-10-23, not started.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

The preview is for reading, the editor for changing. When you read something in the preview that needs a change,
you have to find the same place in the editor yourself: scroll, search the words, put the cursor there. The preview
gives no way to go from what you see to where it is in the text, for any kind of document.

## 2. The solution, in brief

A double click in the preview puts the editor's cursor on the same place in the source text, the word double-clicked
selected, and gives the editor the focus. It works for every document the preview shows: markdown, code shown
coloured, a CSV's column view (plan 29) and whatever later previews there are. In a tab shown as preview only, the
tab switches to split view first, so the editor is there to take the cursor.

## 3. Details

### 3.1 Finding the place

- Markdown: the preview's blocks carry their source line (`data-line`, as the two panes' scrolling uses now). The
  double-clicked word is looked up in the source lines of its block, with markdown's markup (`* _ \` [ ] ( ) # >`, a
  link's address) left out of the comparison; the n-th occurrence of that word in the block's rendered text is the
  n-th in its source. The same placing as plan 28 (highlights) needs from the preview to the source: built once,
  used by both.
- Code shown coloured (`pre.mm-code`): the rendered text is the source text; the place is the offset of the click in
  it, so line and column are exact.
- A CSV's column view (plan 29): the cell knows its row and field; the place is the field's start plus the offset in
  the value.
- Something markdown made up itself (a list number, a table border, a footnote number) or a picture or a diagram: the
  cursor goes to the start of its block's first source line, and nothing is selected.
- A block of another language inside markdown (a fence coloured by its pack, lines you gave a language): as code,
  relative to the block's first line.

### 3.2 What happens

- The editor's cursor is placed there, the word selected (as the double click selected it in the preview), placed in
  view as a found place (Find > Jump to a found place, `revealFound`), and the editor gets the focus.
- A found place for position back / forward (places.js), so Ctrl+Alt+- goes back to where the cursor was.
- Split view: the editor half shows it; the preview stays where it is.
- Preview only (the tab's mode `preview`): the tab switches to split view, then the cursor goes there. Switching back
  to preview only is the usual Editor / Preview buttons.
- The other pane showing the same document in the editor (two panes, one preview, one editor): that pane's editor
  takes the cursor and the focus, the tab's own mode stays.
- A single click in the preview stays as it is (links followed, text selected for copying).
- The preview's own double click selection of a word stays visible until the focus has moved.

### 3.3 Tests

- In-app (a test data folder, the debug build):
  - Markdown: a double click on a word in a paragraph, in bold text, in a link's text, in a list item, in a table cell,
    in a heading: the editor's cursor on that word in the source, selected, the editor focused.
  - The same word twice in a block: the second one double-clicked lands on the second one in the source.
  - A list number and a picture: the start of the block's line.
  - A code file shown coloured: exact line and column.
  - A fence in markdown: the right line inside the fence.
  - Preview only: the tab switches to split view and the cursor is placed.
  - Two panes, the document in the editor in the other pane: that pane takes the cursor.
  - Back (Ctrl+Alt+-) returns to where the cursor was before.

## 4. Open questions

None.
