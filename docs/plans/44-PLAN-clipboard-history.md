# Plan: Clipboard history

Status: draft 2026-11-08; not started. From plan 43 (exchange with the clipboard). The number in the file name is the
priority; rename to reorder.

## 1. What this is about

A text copied or cut is gone from the clipboard as soon as the next one is copied. LexPen's numbered clipboards keep
texts, but only those put there on purpose; what was on the clipboard a few copies ago cannot be had back.

## 2. The solution, in brief

LexPen keeps the last texts copied or cut, newest first, and offers them as a list to paste from (and, with plan 43,
to exchange with): in Paste's arrow on the ribbon, in the Edit menu and through a key. The numbered clipboards stay
as they are; the history is a list beside them.

## 3. Details

- **What goes in**: every text copied or cut in LexPen, to whichever clipboard; whether copies made in other
  programs count too: open question 1.
- **The list**: newest first, each entry its first line shortened (as the clipboards' previews in Paste's list),
  the whole text in its tooltip; a block (column) entry marked as one, and pasted as one. A text already in the
  list moves to the top instead of a second entry.
- **Where**: Paste's arrow on the ribbon (the history under the clipboards), Edit > Paste from history, the editor's
  right-click, the action `clipboard.history` for a key; with plan 43, Exchange's arrow as well.
- **Settings**: how many entries; kept after a restart or not: open question 2.
- **Clear**: Clear clipboard history in the list itself; one entry removed by its right-click.

### 3.1 Tests

- Unit (C#, if the host keeps the list): adding, moving a repeated text to the top, the limit, kept and read back.
- In the test copy: three copies and a cut appear newest first; pasting the third; a block entry pastes as a block;
  the limit; Clear; after a restart (open question 2).

## 4. Open questions

1. **Copies made in other programs**: also in the history (LexPen then watches the Windows clipboard while it
   runs), or only what is copied or cut in LexPen? Suggestion: also from other programs, text only.
2. **How many, and kept after a restart?** Suggestion: a setting for the number (default
   [not yet decided]), kept in the data folder after a restart, with a setting to keep it for the session only (a
   history can hold passwords copied from elsewhere).
3. **Passwords and secrets**: Windows marks some clipboard content as not to be kept in history (password managers
   do). Honour that mark? Suggestion: yes, such a copy never enters the history. [not yet checked: how LexPen would
   read that mark]
