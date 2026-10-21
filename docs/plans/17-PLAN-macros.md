# Plan: Macros: record and play keystrokes

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Repeating the same edits on many lines takes them by hand each time. UltraEdit records a macro (keys and commands)
and plays it, also to the end of the file, and saves macros by name.

## 2. The solution, in brief

Record (Ctrl+Shift+M proposed) stores what follows: typed text and the actions run (every key and menu item is an
action already); Stop; Play (Ctrl+M proposed) runs it again, Play n times / to the end of the file repeats. A
recorded macro can be saved by name, with a key, kept with the keys (macros.json).

## 3. Details

- What is recorded: actions with their parameters (the keys system gives them), text typed, cursor moves (as the
  actions they are). Mouse clicks are not recorded (UE neither).
- Play: one undo step for the whole play.
- To the end: repeats while the cursor moves forward and the file is not at its end (a guard against a loop).
- Saved macros: in F1 and the menu, and as an action for a key.

### 3.1 Tests

In-app: record typing and a move, play; play to the end of the file; one undo step; a saved macro with a key.

## 4. Open questions

1. Find inside a macro (find next as a step): include, so "find, change, repeat" works?
