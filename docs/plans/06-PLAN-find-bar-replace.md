# Plan: The find bar's replace, designed for replacing

Status: draft 2026-10-26, answers 2026-10-27 (Ctrl+R; a selection is always the scope, no setting; F3 keeps the
last choice), not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

The find bar (Ctrl+F, Ctrl+Shift+R) can replace, but it is built for finding with replace added on:

- The replace row opens with a small chevron at the left of the find field. Nobody reads it as "Replace".
- The fields have no labels, only placeholders that disappear once you type.
- Skipping a match means using the find row's Previous / Next arrows; the replace row has only Replace and All.
  Going through a file match by match, replace this one, skip that one, means moving between the two rows.
- The replacement is taken literally. `^p` (a line break) and `^t` (a tab) work in the find field but not in the
  replace field, so you cannot replace something with a line break. With a regular expression `\n` does not work
  either: only `$1` and the like are read.

## 2. The solution, in brief

A text button **Replace** on the find row opens and closes the replace row. Both rows get a label in front of their
field: **Find** and **Replace with**, the same width so the fields line up. The replace row gets its own way through
the file: **Replace** (this match, then the next), **Skip** (the next, this one unchanged), **Previous**, and
**Replace all**. The replace field reads `^` codes as the find field does: `^p` the file's line end, `^l` LF, `^c`
CRLF, `^t` a tab, `^^` a caret; with a regular expression `\n` and `\t` instead, next to `$1`. A help window (a `?`
button on the bar) lists every code of both fields. Ctrl+R opens the bar with the replace row
(Ctrl+Shift+R becomes the Search panel's replace, plan 05). With a selection, the bar always finds and replaces only
within it, else in the whole file; F3 keeps that choice until the next Ctrl+F or Ctrl+R.

## 3. Details

### 3.1 The layout

```
[Find        ] [______________________] 3 of 12  Aa  W  .*  ^  v  [Replace]  x
[Replace with] [______________________]  [Replace] [Skip] [Previous] [Replace all]
```

- **Find** label: always shown, also with the replace row closed.
- **Replace** button on the find row: toggles the replace row; shown pressed while the row is open. It replaces the
  chevron. Its tooltip names the key (Ctrl+R; now Ctrl+Shift+R, which goes to the Search panel, plan 05).
- **Replace with** label and field: only with the row open.
- The labels are one column of the same width, so both fields start at the same place.
- In the preview the replace row cannot work (it is the editor's text that changes): the Replace button is disabled
  with the tooltip "Replace works in the editor", as the row is now hidden there.
- A narrow pane: the labels keep their width and the fields shrink, as the field does now.

### 3.2 Going through the matches

The replace row is enough on its own; the find row's arrows are not needed while replacing.

- **Replace**: replaces the current match (the one marked as current) and goes to the next. With no current match
  yet (the bar just opened, or the cursor moved away), it first goes to the next match and stops there, so you see
  what you replace before you replace it. That is what it does now, but it is not visible; it gets a tooltip.
- **Skip** (F3): goes to the next match and leaves the current one as it is; the same as Find next.
- **Previous** (Shift+F3): goes back one match, to replace one you skipped; the same as Find previous.
- Each Replace is its own undo step: replacing several one by one, Ctrl+Z undoes them one by one, the last first.
  (Typing close together is merged into one step by the editor; a replace is closed off as a step of its own.)
- **Replace all**: all matches in the scope (3.3), one undo step, then a message with the number replaced (as now).
- The count shows where you are ("3 of 12"); after a replace it counts what is left.
- The end of the file: as the setting "At the end of the file" decides for finding (stop, go on from the top, or stop
  where the search started).
- Keys in the replace field: Enter = Replace, Shift+Enter = Previous (as now Enter replaces and Shift+Enter goes
  back). F3 and Shift+F3 are Skip and Previous wherever the focus is (the bar or the editor), as they are Find next
  and Find previous; the buttons' tooltips name them. Replace all gets a key too, see open question 2.
- Tab in the Find field: with the replace row open, to the Replace with field; with it closed, on to the bar's
  buttons, as now. Shift+Tab in the Replace with field: back to the Find field.

### 3.3 The scope: the selection or the file

- Always, no setting: when the bar opens (Ctrl+F, Ctrl+R) with text selected, it finds and replaces only within that
  selection, a selection within one line (a word) included; without a selection, in the whole file.
- So the selection no longer fills the find field (now Ctrl+F on a selected word finds that word): the field keeps
  the last search, and the history (Up / Down, Alt+Down) has the earlier ones.
- The selection is taken when the bar opens and marked (a background over that part) while the bar is open, so
  moving the cursor or selecting a match does not change it. The count says so: "3 of 12 in the selection".
- F3 / Shift+F3 use the last choice: after a find in a selection they go on in that part, until the next Ctrl+F or
  Ctrl+R takes the scope anew. Closing the bar ends it too.
- A selection made while the bar is open does not change the scope; Ctrl+F (or Ctrl+R) again takes it.
- Several selections (multiple cursors): each of them.
- A column block (column mode, Alt+drag): on each of its lines, the part between its left and right column. A match
  must lie within one line's part (a match across lines, `^p`, never does). Past a line's end the block has no text,
  so a short line's part is shorter or empty. Each line's part is marked as its own piece of the scope, so it moves
  with the text when a replacement makes a line longer or shorter, and F3 and Replace all keep to those pieces.
- Only the find bar takes the selection by itself. The Search panel (Ctrl+Shift+F) has In selection as one of its
  scopes, chosen there (plan 05).

### 3.4 Codes in the replacement

- In the find field, as now: `^p` finds any line break (LF, CRLF or CR).
- In the replacement, without a regular expression:
  - `^p`: a line break with the file's line end (CRLF or LF, as the bottom bar shows).
  - `^l`: LF.
  - `^c`: CRLF.
  - `^t` a tab, `^^` a caret.
  - The find codes that match a kind of text (`^?` `^#` `^$` `^w`) mean nothing in a replacement; they stay as typed.
- With a regular expression: `\n` a line break (the file's line end), `\t` a tab, `$1`... the groups (as now), `$&`
  the whole match.
- `^l` and `^c` in an open file: the editor keeps one line end for the whole file, and every line gets it on save
  (`diskText`, `getValue(doc.eol)`). So `^l` in a CRLF file is saved as CRLF, the same as `^p`. See open question 1.
  In a file in the folder that is not open (plan 05, written on disk directly) they are written as given.
- The replace field's tooltip names the codes in short and points to the help window (3.5).
- Replace in the Search panel (plan 05) reads the same codes.

### 3.5 The help window

- A `?` button at the end of the find row (and on the Search panel, plan 05) opens a small window listing every code:
  for the find field (`^p` `^t` `^?` `^#` `^$` `^w` `^^`), for the replacement (`^p` `^l` `^c` `^t` `^^`), and with a
  regular expression (`\n` `\t` `$1` `$&`), each with one line of what it does and an example.
- One list for the find bar, the Search panel and the F1 list: F1 now has a short "Search codes" part
  (`web/palette.js`); it becomes the same list, so the three never differ.
- Esc or a click outside closes it; the focus goes back to the field it came from.

### 3.6 Tests

In the app: the Replace button opens and closes the row and shows pressed; the labels line up; the button disabled
in the preview. Replace, Skip and Previous through a file: replaced ones changed, skipped ones not, the count right.
Replace with no current match goes to the first and stops. `^p` and `^t` in the replacement, with and without a
regular expression (`\n`, `\t`, `$1`); a CRLF file saved with CRLF after `^p`, an LF file with LF; `^l` and `^c` as
open question 1 decides; the `?` window lists the codes, the same as F1. Replace all as one undo step;
three single replaces undone one by one. Ctrl+R opens the bar with the replace row; Tab from Find to Replace with and
Shift+Tab back. With a selection: find and Replace
all stay within it, F3 goes on within it, a new Ctrl+F without a selection takes the whole file; a one-word
selection is the scope too, and the find field keeps the last search; a column block: matches only within its
columns on each line, Replace all there only.

## 4. Open questions

1. `^l` and `^c` in an open file cannot stay as given: the editor saves every line with the file's one line end.
   Either they act as `^p` there (with a message saying so, the file's line end is changed with the bottom bar's
   CRLF / LF), or the editor learns to keep a line end per line, a larger change (the editor, save, the bottom bar,
   plan 12 on converting line ends). Which one?
2. A key for Replace all, for working by keyboard only. For example Alt+A while the bar has the focus, shown
   underlined in the button text. Check first that it does not clash with the menu's Alt keys.
