# Plan: Back and forward through cursor positions

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Back / forward (mouse buttons) goes through tabs and files. Visual Studio's Navigate Backward / Forward (Ctrl+- /
Ctrl+Shift+-) also goes back to where the cursor was in the same file after a jump (go to line, a search result,
the outline, a bookmark, a long scroll).

## 2. The solution, in brief

A jump records where the cursor was; Back / Forward (the mouse buttons and Ctrl+Alt+Left / Right, since Ctrl+- is
zoom out) go through those places, across files and tabs, as the browser does.

## 3. Details

- What is a jump: go to line, the outline's double-click, a search result, a bookmark, Ctrl+Home / End, a find,
  a click more than a screen away, switching tabs. Typing and arrow keys are not.
- Places move with edits (CodeMirror bookmarks), and are dropped when their file closes.
- The present back / forward through tabs becomes part of this list.

### 3.1 Tests

In-app: go to line, back returns, forward again; across two files; an edit above a place keeps it on its text.

## 4. Open questions

1. Keys: Ctrl+Alt+Left / Right, or free Ctrl+- for this and move zoom out elsewhere?
