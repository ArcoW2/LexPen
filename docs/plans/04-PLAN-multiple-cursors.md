# Plan: Multiple cursors: Ctrl+Alt+click, Ctrl+Alt+double-click, Ctrl+D chords, Ctrl+Alt+arrows, past the line end

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

LexPen has blocks (column mode) but no free multiple cursors: Visual Studio's Ctrl+Alt+click (a cursor where you
click) and VS Code's Ctrl+D (add the next occurrence of the selection).

## 2. The solution, in brief

CodeMirror already keeps several selections; LexPen adds the ways to make them. With the mouse: Ctrl+Alt+click adds
a cursor at the click (on an existing cursor it removes that one, never the last), Ctrl+Alt+double-click on a find
match adds that match as a selection. With the keys: a search text (the find bar's, or the selection) and a current
occurrence that Ctrl+Alt+Right / Left move, and the Ctrl+D chords add (A), remove (D, R) or clear (C). Typing,
deleting, pasting, conversions and the line commands work on all cursors; Esc goes back to one. Virtual space works
per cursor: each cursor may stand past its line's end, and typing fills each line up to its own cursor's column.

## 3. Details

### 3.1 Making and removing cursors with the mouse

| Action | Mouse |
|---|---|
| A cursor at the click; on a cursor or inside a selection: remove it | Ctrl+Alt+click |
| Place the new cursor precisely | Ctrl+Alt+click and drag, release where wanted |
| Add a find match (or the word there) as a selection | Ctrl+Alt+double-click |

- Removing never removes the last cursor.
- Ctrl+Alt+click past a line's end: with virtual space on (monospaced font) the new cursor stands at the clicked
  column; with it off, at the line's end (when no cursor stands there yet).
- Ctrl+Alt+click and drag: the new cursor follows the mouse until the button is released (it does not select).
  Past line ends it follows the same rule as the click.
- Ctrl+Alt+double-click on a match of the find bar (Ctrl+F, its matches marked): the whole match becomes a
  selection, special characters included; elsewhere the word there (as a double-click selects one). The usual way:
  Ctrl+F for the text, then Ctrl+Alt+double-click the matches wanted.

### 3.2 The keys: Ctrl+D chords and Ctrl+Alt+Left / Right

| Key | What it does |
|---|---|
| Ctrl+D, A | Add: the current occurrence (the first time: the selection) joins the cursors; then the next occurrence becomes the current one |
| Ctrl+Alt+Right | Next: the current occurrence moves to the next one, without adding |
| Ctrl+Alt+Left | Previous: the current occurrence moves to the previous one, without adding |
| Ctrl+D, D or Ctrl+D, R | Remove: the current occurrence leaves the cursors; then the next one becomes the current one (none after it: the previous one) |
| Ctrl+D, C | Clear: all the added cursors go; the current occurrence stays as the one selection |

- The search text: the find bar's text with its switches (case, word, regex) when it has one, else the selection's
  text exactly. No word is picked by itself: a word could miss characters that are meant to change. Neither a find
  text nor a selection: the bottom bar says so.
- What you see while the chords are in use (each move scrolls the current occurrence into view):

  | What | How it looks |
  |---|---|
  | An added occurrence (a cursor with its selection) | the selection colour, its cursor blinking at its end |
  | The current occurrence, not added | find's current-match box |
  | The current occurrence, already added | the selection colour with find's current-match box around it |
  | The other occurrences of the search text | find's match marks (as with the find bar open) |

  The bottom bar shows the count and where you are, from the marks: "3 selected, at 4 of 9" (as find's
  "4 of 9"). Esc ends it with the cursors.
- So: select the text (or Ctrl+F it); Ctrl+D, A adds it and shows the next; Ctrl+D, A again adds that one;
  Ctrl+Alt+Right skips one; Ctrl+Alt+Left goes back; Ctrl+D, D drops one again; Ctrl+D, C starts over.
- Next and Previous are single keys because they are pressed most; Ctrl+Alt+Right / Left go on past the end of the
  file as find does (setting findWrap).
- Remove on an occurrence that is not added does the same as on an added one: on to the next (none after it: the
  previous).
- Clear leaves the current occurrence as the one selection, without other cursors.
- Ctrl+D and Ctrl+Alt+Left / Right are free in keys.json (CodeMirror's own Ctrl+D, delete line, is not used:
  LexPen's keys come first); the chords are entries as `"Ctrl+D, A"`, so they can be changed there. Some graphics
  drivers take Ctrl+Alt+arrows to turn the screen; the keys can then be changed in keys.json.
- Rename in a part of the file needs none of this: Replace in the selection. The find bar has no "in selection"
  switch yet; see the open question.

### 3.3 Finding your way with several cursors

Moving a cursor by key moves all of them (CodeMirror does that), so the keyboard cannot browse the file without
losing the set. The mouse can: the wheel and the scroll bar scroll without touching the cursors. Ctrl+Alt+Left /
Right move a current occurrence that is not a cursor, so they browse the matches without losing the set. The bottom
bar shows the number of cursors; Go to line and a click without Ctrl+Alt end the set (as now).

### 3.4 Virtual space with several cursors

Now virtual.js keeps one column past the end (cm.state.mmVirtual = { line, col }) and draws one cursor. With several
cursors it keeps a column per cursor (a list next to CodeMirror's selections, in the same order), and draws each one
past its line's end. Cases it must cover:

- Aligned typing: cursors on a few lines at the same column, some lines shorter than that column. Typing fills each
  short line with spaces (tabs with useTabs) up to the column, then all lines get the same text at that column.
- Cursors at different columns: each one fills its own line up to its own column.
- Up / Down with several cursors keep each cursor's column (also past the end), as one cursor does now.
- Each cursor moves as one cursor does now; the keys only do it for all of them. Left at the start of a line: with
  leftWraps off that cursor stays where it is while the others move left; with it on, it goes to the end of the
  line above. Right and Up / Down likewise per cursor.
- Cursors that end up on the same place (or overlapping selections) merge into one.
- Moving away adds nothing (as now).
- Column mode: a block is a set of cursors already; adding a cursor (mouse or Ctrl+D, A) ends the block (the block's
  lines become separate cursors at its head column, so typing continues in the same places).

### 3.5 What works on all cursors

Typing, Backspace / Delete, Enter, Tab, paste (one clipboard line per cursor when the counts match, else the whole
text at each), the case conversions, comment / uncomment, the line commands. Format, Reformat and Sort work on one
selection; with several they say so (as Format does now).

### 3.6 Tests

In-app: Ctrl+Alt+click adds, Ctrl+Alt+click on a cursor removes, the last one stays; Ctrl+Alt+double-click on a find
match with special characters; Ctrl+D, A three times from a selection; Ctrl+Alt+Right skips, Ctrl+Alt+Left goes
back; Ctrl+D, D and R remove and move on (the last one: to the previous); Ctrl+D, C clears; the marks (added,
current, current and added, the others) and the bottom bar's count; Ctrl+D with the find bar's text and its case
switch; Ctrl+D without find text or selection does nothing; typing on all; Esc back to one; aligned typing past the
end on lines of different length; cursors at different columns past the end; Up / Down keep the columns;
Ctrl+Alt+click past the end with virtual space on and off; Ctrl+Alt+drag places the cursor where released; Left at
the start with leftWraps off (that cursor stays, the others move, two that meet become one) and on (to the end of
the line above); a block turned into cursors; the wheel keeps the cursors.

## 4. Open questions

1. Replace in the selection: the find bar has no "in selection" switch now. Add it here (a switch next to case /
   word / regex, on by itself when the bar opens on a multi-line selection), or as a plan of its own?
