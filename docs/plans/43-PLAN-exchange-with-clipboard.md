# Plan: Exchange the selection with the clipboard

Status: draft 2026-11-08, revised 2026-11-09; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

Replacing a selection with what is on the clipboard while keeping the selection takes three steps and a spare
clipboard: copy the selection to another clipboard, paste over it, and remember where the old text went. Swapping
two pieces of text (two arguments, two names) is a common edit that LexPen has no single command for.

## 2. The solution, in brief

A command Exchange with clipboard: the clipboard's text takes the selection's place, and the selection goes onto
the clipboard, in one step and one undo. It works on the active clipboard, as Paste and Cut do, or on a numbered one;
the pasted text stays selected, so the same command again puts everything back. It is on the ribbon (Home >
Clipboard, stacked under Copy) with an icon of its own, beside the menus and a key.

## 3. Details

### 3.1 What it does

- **The order**: the clipboard's text is read first, then the selection is put on the clipboard (as Cut does), then
  the text read is pasted in its place (as Paste does). Doing it the other way round would paste the selection back.
- **Which clipboard**: the active one, as Paste and Cut; with a number, that clipboard (the variants Exchange with
  Windows clipboard, Exchange with clipboard 1 to 9, as Paste from and Cut to). The active clipboard stays the
  active one.
- **After it**: the pasted text is selected, so a second Exchange swaps back, and the swap of two places is:
  select the first, Copy; select the second, Exchange; select the first again, Paste.
- **One undo step** takes the whole exchange back in the document. The clipboard is not undone (as with Cut).
- **Blocks and several cursors**: as Cut and Paste each do now. A block selection goes onto the clipboard as a block
  (the column mark); a block on the clipboard pastes as a block. Several selections: Cut's joined text onto the
  clipboard, and the clipboard's text pasted as Paste does with several cursors.
- **Not possible**: open question 2 (nothing selected, an empty clipboard, a read-only document).

### 3.2 Where

- The action `clipboard.exchange` (with its variants), in F1 under Edit.
- Edit menu: Exchange with clipboard, after Paste; the editor's right-click: the same, when there is a selection.
- **On the shipped ribbon**: Home > Clipboard is Paste large with Paste image ("Image") small under it, then Cut and
  Copy stacked; Exchange goes stacked under Copy, so that column is Cut, Copy, Exchange. Exchange's label "Exchange";
  a split button as Paste: the button exchanges with the active
  clipboard, its arrow lists the clipboards to exchange with (Windows clipboard, 1 to 9). In `defaults/ribbon.json`;
  a ribbon.json of your own gets it by Customize or change mode (it is not changed for you).
- **Its icon**: Paste's clipboard with two curved arrows round it, one going in and one coming out (the exchange),
  drawn as the other ribbon icons (executed/PLAN-ribbon.md 3.4): on the 16-unit grid in the text colour, small
  16 px with lines of 1.4 and large 32 px with lines of 1.0, a drawing of its own at 16 px if the arrows do not read
  at that size; added to `ribbonicons.js` (and the icon sheet in the ribbon plan's images) under
  `clipboard.exchange`. F1 and the menus show no icons, so it is the ribbon's only.
- Key: open question 1.

- **The clipboard history** is a plan of its own (44-PLAN-clipboard-history.md); once built, Exchange's arrow lists
  its texts too, as Paste's does.

### 3.3 Tests

- Jint or the test copy: a selection and a clipboard text exchange; the pasted text selected; Exchange again
  restores both the document and the clipboard; one Ctrl+Z restores the document.
- In the test copy: with the Windows clipboard and with clipboard 3 (the active one staying); a block selection with
  a normal clipboard text and the other way round; two selections; a read-only document; nothing selected and an
  empty clipboard (open question 2); the ribbon's Exchange button (the active clipboard) and its arrow's list
  (clipboard 3); its icon at both sizes in a light and a dark theme.
- Unit (C#): the shipped ribbon.json has `clipboard.exchange` in Home > Clipboard (RibbonTests); Jint: that group's
  columns are Paste with Paste image in one column, then Cut, Copy and Exchange stacked.
- In the test copy: the Clipboard group no wider than before (Exchange fills the third row of the Cut and Copy
  column).

### 3.4 Alternatives

- **Swap two selections directly** (select both, swap): needs two selections that do not overlap and is an edit of
  its own; exchange with the clipboard covers it in three steps and also works across files.

## 4. Open questions

1. **Key**: Ctrl+Z cannot be used: it is Undo (the editor's own keys, as Ctrl+Shift+Z and Ctrl+Y are Redo);
   Ctrl+Shift+X is Strikethrough (it would have to move, and Ctrl+Shift+X for strikethrough is common elsewhere). Free
   in LexPen's default keys (checked in keys.json and the editor's keymap): Ctrl+Shift+V (elsewhere often paste as
   plain text), Ctrl+Alt+V, Ctrl+Alt+X, Ctrl+Alt+Z. Suggestion: Ctrl+Shift+V.
2. **When it cannot exchange**: nothing selected (paste only, or nothing), an empty clipboard (cut only, or
   nothing)? Suggestion: nothing in either case, with a message ("Select text to exchange with the clipboard." /
   "The clipboard is empty."), so the command never does half of its work. A read-only document: nothing, as Cut.
