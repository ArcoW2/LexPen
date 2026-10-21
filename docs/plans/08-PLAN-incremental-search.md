# Plan: Incremental search

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Searching means opening the find bar. Visual Studio's Ctrl+I (and Emacs' isearch) searches as you type, without a
bar in the way: each letter moves to the next match, Enter or Esc ends it there.

## 2. The solution, in brief

An action "Incremental search" (Ctrl+Shift+I proposed): the bottom bar shows what is typed; every letter finds the
next match from the cursor; Ctrl+Shift+I again goes to the next match, with Shift backwards; Backspace takes a
letter back (and the cursor with it); Enter ends with the match selected, Esc returns to where it started.

## 3. Details

- Matching: as find without switches, case only when a capital is typed (smart case).
- Display: the matches marked as find marks them (the findMark setting), the current one as the current one.
- Ends on any other key or a click (the key then does what it does).
- The last text is kept for the next Ctrl+Shift+I.

### 3.1 Tests

In-app: typing finds and moves; again finds the next; Backspace goes back; Enter keeps, Esc returns; smart case.

## 4. Open questions

1. Worth it next to the find bar (which also finds as you type)? If not: drop this plan.
