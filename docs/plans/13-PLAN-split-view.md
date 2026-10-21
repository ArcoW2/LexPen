# Plan: One file in two views (split)

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

The two panes show two tabs. Visual Studio's Window > Split shows one file twice, one above the other, scrolled
independently, edits shared; UltraEdit splits its window the same way.

## 2. The solution, in brief

A file can be open in both panes at once (it already can: a document in two tabs shares its text) with its own
place in each; the command "Split" opens the active file in the other pane (or the same pane above / below, 4.1).

## 3. Details

- The document is shared (CodeMirror linked docs), cursor and scroll per tab: as now for a file in two panes.
- The command: View > Split, Ctrl+Alt+S proposed; the other pane opens when hidden.
- Within one pane (VS's split bar): two editors over one tab: more work; 4.1.

### 3.1 Tests

In-app: split shows the file in the other pane at the same place; an edit shows in both; each scrolls on its own.

## 4. Open questions

1. Is the other pane enough, or should one pane split itself (above / below)?
