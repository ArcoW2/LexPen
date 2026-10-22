# Settings: hints for on and off

The on/off settings (kind `toggle` in `SETTING_ROWS`, web/actions.js) with their current hint and a suggested hint
for each state. The settings window shows the On text while the box is checked and the Off text while it is not
(row fields `hint` and `hintOff`; a search finds both). Rows without an Off text keep one hint for both states.

How to use this file: change the On and Off lines as you see fit. Write `Off: -` where one hint is enough (the off
state is simply "not shown"). Then ask for the settings to be updated from this file.

Rules for the texts: each one stands alone (it is read alone after a search); it says what happens in that state;
it names another setting only for a dependency ("when ... is on"). Plain ASCII.

The list: the 26 rows of `settingDefs()` with kind toggle, from the debug build on 2026-10-22. Marked `(suggest one
hint)`: an Off text adds little there; the Off line is still filled in, to choose.

## General

### keepUnnamedProjects (General > Windows): Keep unnamed projects

Already split today (commit 43ac196), with your texts.

- Before: A project you did not name, with files, when its last window closes: kept as "Project n", or dropped. Without files it is always dropped
- On: Windows with files but with an unnamed project ("Project n") are kept for reopening
- Off: Windows with files for unnamed projects ("Project n") are not remembered for reopening
- Note: the old hint also said that a project without files is always dropped; it could go after either text.

### followWindows (General > Theme): Follow Windows

- Current: Light or dark as Windows is (Settings > Personalization > Colors), at once; Day / night switches until Windows changes
- On: Light or dark follows Windows (Settings > Personalization > Colors); the Day / Night button switches until Windows changes
- Off: A change in Windows' light or dark mode does not switch LexPen mode 

## Files

### backup: Keep a backup when saving

- Current: The old file becomes name.bak (overwritten at the next save)
- On: When saving, the old file becomes name.ext.bak (overwritten at the next save)
- Off: Saving overwrites the file; no backup is made

### trimTrailing: Remove whitespace at line ends on save

- Current: The whole file, just before it is written (Ctrl+Z after the save gives the spaces back). Off: every space is kept. A language can keep some (markdown: 2) or never trim (trimTrailing)
- On: On save, spaces and tabs at line ends are removed from the whole file, just before it is written (Ctrl+Z after the save gives them back). A language can keep some (markdown: 2) or never trim (trimTrailing)
- Off: On save, spaces and tabs at line ends are kept

### askSaveDrafts: Ask to save changed drafts when closing LexPen

- Current: Off: changed drafts stay drafts without a question (closing a draft tab always asks)
- On: Closing LexPen with changed drafts asks whether to save them (closing a draft tab always asks)
- Off: Closing LexPen keeps changed drafts as drafts without a question (closing a draft tab always asks)

## Editor

### wrap: Wrap long lines
(Change of behaviour: NOT in the preview!)
- Current: In the editor and in code in the preview
- On: Long lines wrap at the edge
- Off: Long lines run on past the edge and scroll sideways

### closeBrackets (Editor > Brackets): Close brackets and quotes while typing

- Current: An opening sign adds its closer; typing the closer before one steps over it; Backspace removes an empty pair. Signs only, never words
- On: An opening sign adds its closer; typing the closer before one steps over it; Backspace removes an empty pair. Signs only, never words
- Off: Brackets and quotes are typed as they are: nothing is added

### leftWraps (Editor > Cursor): Left at the start of a line goes to the line above

- Current: At the first column, Left (and Shift+Left) goes on to the end of the line above. Off: the cursor stays at the start
- On: At the first column, Left (and Shift+Left) goes on to the end of the line above
- Off: At the first column, Left (and Shift+Left) stays at the start of the line

### homeStop (Editor > Cursor): Home key goes to the first column
default: off
- On: Home key sets the cursor at the first column
- Off: Home key sets the cursor at the first non-whitespace character on the line

### virtualSpace (Editor > Cursor): Cursor past the end of the line

- Current: Up, Down and a click keep the cursor in its column on a shorter line; typing there fills the line with spaces first. Only with a monospaced editor font (with another font this does nothing)
- On: Up, Down and a click keep the cursor in its column even after the end of a line; typing there fills the line with spaces first. Only with a monospaced editor font
- Off: On a shorter line the cursor stops at its end (Up and Down return to the column on a longer line). Column mode still goes past the end

## Editor view

### formatBar: Formatting bar

- Current: The bar with bold, headings, lists, tables, ... above the editor
- On: The bar with bold, headings, lists, tables, ... is shown above the editor (also View > Formatting bar)
- Off: No formatting bar above the editor; its commands stay in the menus and on their keys (View > Formatting bar shows it)

### showWhitespace: Show spaces and tabs (suggest one hint)

- Current: In the editor: a space as a small dot, a tab as an arrow (theme colour: whitespace)
- On: In the editor: a space as a small dot, a tab as an arrow (theme colour: whitespace)
- Off: Spaces and tabs are not marked in the editor

### showLineEnds: Show line ends (suggest one hint)

- Current (as in the source): In the editor: \u00B6 at the end of a line for CRLF, \u240A for LF (theme colour: whitespace)
- On: unchanged
- Off: Line ends are not marked in the editor

### indentGuideCursor (Editor view > Indent guides): The guide of the block at the cursor highlighted

- Current: Thin, in the colour of the find box; also with the guides off
- On: The guide of the block the cursor is in is drawn in the colour of the find box, also when the indent guides are off
- Off: The guide of the block the cursor is in looks like the other guides (with the indent guides off: none)

### locateCursor (Editor view > Locate the cursor): A short tap on Ctrl shows where the cursor is

- Current: Rings shrink onto every cursor, in the colour of the find box; a cursor out of view gets a marker at that edge with its line number (also View > Locate the cursor)
- On: A short tap on Ctrl: rings shrink onto every cursor, in the colour of the find box; a cursor out of view gets a marker at that edge with its line number (also View > Locate the cursor)
- Off: A tap on Ctrl does nothing; View > Locate the cursor still shows where the cursor is

### locateCursorJump (Editor view > Locate the cursor): A double tap on Ctrl scrolls to the cursor

- Current: Two taps on Ctrl: the editor scrolls to the cursor (with several: the main one), then shows where it is
- On: When a short tap on Ctrl shows the cursor: two quick taps scroll the editor to the cursor (with several: the main one), then show where it is
- Off: When a short tap on Ctrl shows the cursor: two quick taps show it as one tap does; the editor does not scroll

### ruler (Editor view > Ruler and column guides): The ruler above the editor

- Current: The columns, the column of the cursor and the guides; a click sets a tab stop (Tab goes there) or a helper line (only shows), right-click to choose which and a colour. Kept per file. Only with a monospaced editor font
- On: The ruler above the editor shows the columns, the column of the cursor and the guides; a click sets a tab stop (Tab goes there) or a helper line (only shows), right-click for the panel. Kept per file. Only with a monospaced editor font
- Off: No ruler (View > Ruler shows it); the tab stops and helper lines of a file still show in the text, and Tab still stops at the tab stops

### gutter.bookmarks (Editor view > Gutter): Bookmarks (suggest one hint)

- Current: Bookmarks 1 to 9 and unnumbered ones
- On: The gutter shows bookmarks 1 to 9 and unnumbered ones
- Off: No bookmark column in the gutter; bookmarks are kept and their keys still work

### gutter.changes (Editor view > Gutter): Change markers (suggest one hint)

- Current: Lines changed since the last save
- On: The gutter marks the lines changed since the last save
- Off: No change markers in the gutter

### gutter.git (Editor view > Gutter): Git markers (suggest one hint)

- Current: Lines changed since the last commit (click: the old text)
- On: The gutter marks the lines changed since the last commit (a click shows the old text)
- Off: No git markers in the gutter

### gutter.folds (Editor view > Gutter): Fold markers (suggest one hint)

- Current: Fold headings, code blocks and braces
- On: The gutter has a marker to fold headings, code blocks and braces
- Off: No fold markers in the gutter

## Preview

### lineBreaks: Single line break starts a new line

- Current: Off: a single line break joins the lines, as in GitHub files
- On: In the preview, a single line break starts a new line
- Off: In the preview, a single line break joins the lines, as in GitHub files (an empty line starts a new paragraph)

## Outline

### outlineMerged: Outline: groups together, by line

- Current: Off: a header per group (its entries in line order); also in the right-click menu of the outline
- On: The outline lists all entries in line order, the groups mixed
- Off: The outline has a header per group, its entries in line order

### outlineBullets: Outline: a bullet in the colour of the group

- Current: In front of every entry of a language with groups; also in the right-click menu of the outline
- On: Show a bullet in the colour of its group in front of every entry of a language with groups
- Off: No bullets in front of the entries

## Tabs

### movePinned: Move pinned tabs when closing a pane or window

- Current: To the main pane / another open window of the same project; off, they keep the pane open or close with the window
- On: Closing a pane moves its pinned tabs to the main pane; closing a window moves them to another open window of the same project
- Off: Pinned tabs keep their pane open, and close with their window

## Find

### findShared: One search for both panes

- Current: Off: each pane has its own find
- On: Both panes share one search
- Off: Each pane has its own search, with its own text and options

### findGutter: Mark the line numbers of lines with found text

- Current: As the found text is marked; the line with the current match as the current match
- On: besides the found text, the line numbers of lines with found text are marked too
- Off: The line numbers are not marked; only the found text is
