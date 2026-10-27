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
**Replace all**. The replace field reads the same `^` codes as the find field (`^p` a line break, `^t` a tab, `^^`
a caret); with a regular expression `\n` and `\t` instead, next to `$1`. Ctrl+R opens the bar with the replace row
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
- Several selections (multiple cursors, a column block): each of them.
- Only the find bar has this. The Search panel (Ctrl+Shift+F) searches the file, the open files or the folder; it has
  no selection scope (plan 05).

### 3.4 Codes in the replacement

- Without a regular expression: `^p` a line break, `^t` a tab, `^^` a caret, as the find field already reads them.
  The other find codes (`^?` `^#` `^$` `^w`) match a kind of text and mean nothing in a replacement; they stay as
  typed.
- With a regular expression: `\n` a line break, `\t` a tab, `$1`... the groups (as now), `$&` the whole match.
- A line break goes into the editor as a new line. The editor keeps no line end per line: the file has one line end
  (CRLF or LF, in the bottom bar), and every line gets it on save. So in a CRLF file `^p` is CRLF. See open
  question 1 for an LF file.
- The replace field's tooltip lists the codes, as the find field's does.
- Replace in the Search panel (plan 05) reads the same codes.

### 3.5 Tests

In the app: the Replace button opens and closes the row and shows pressed; the labels line up; the button disabled
in the preview. Replace, Skip and Previous through a file: replaced ones changed, skipped ones not, the count right.
Replace with no current match goes to the first and stops. `^p` and `^t` in the replacement, with and without a
regular expression (`\n`, `\t`, `$1`); a CRLF file saved with CRLF after `^p`. Replace all as one undo step;
three single replaces undone one by one. Ctrl+R opens the bar with the replace row; Tab from Find to Replace with and
Shift+Tab back. With a selection: find and Replace
all stay within it, F3 goes on within it, a new Ctrl+F without a selection takes the whole file; a one-word
selection is the scope too, and the find field keeps the last search.

## 4. Open questions

1. `^p` in an LF file: the file's line end (LF; recommended, the file stays consistent), or always CRLF (the file
   then has mixed line ends, which the editor does not keep)?
2. A key for Replace all, for working by keyboard only. For example Alt+A while the bar has the focus, shown
   underlined in the button text. Check first that it does not clash with the menu's Alt keys.
