# Plan: Recordings as numbered macros, and a window per macro

Status: draft 2026-10-29; not started, on hold: the macros get extensive validation first. Follows the macros
(docs/plans/executed/PLAN-macros.md).
The number in the file name is the priority; rename to reorder.

## 1. What this is about

A recording is kept as "Last recording", and the next recording replaces it. In View > Macros that name says
nothing about what the macro does, and a list with one "Last recording" in it reads as if the menu only works for one
macro. A click on a macro in the menu plays it at once; everything else (play X times, rename, a key, delete,
record more onto it) is in Manage..., where you first have to find the macro again.

## 2. The solution, in brief

Every recording becomes a macro of its own, named "Macro N" with the lowest free number; nothing replaces it, and it
stays until you delete it. A click on a macro in View > Macros opens a small window for that macro with what can be
done with it: play once, play X times, play to the end of the file, step by step, continue recording (record now,
added to its end), edit, give it a name, give it a key, delete. Manage... opens the same window with the list of
macros to choose one. Play (Ctrl+M) plays the macro played or recorded last, and the menu says which one.

## 3. Details

### 3.1 Recordings

- Stop recording saves the steps as a new macro "Macro N": N is the lowest number not used by a macro (Macro 1,
  Macro 2, ...; after deleting Macro 2, the next recording is Macro 2 again), as drafts are numbered (editN).
- "Macro 3" is a name like any other: Give name renames it, and a macro you name yourself "Macro 7" takes that
  number.
- Recordings are not cleaned up: they stay until deleted.
- The toast after a recording names it: "Recorded as Macro 3 (Ctrl+M plays it)".
- The last recording kept so far (`~last.lpm`) becomes "Macro N" once, at the first start with this version; the
  special name `~last` goes.
- Recording onto an existing macro (3.3, Continue recording) does not make a new one.

### 3.2 View > Macros

- The macros by name, each with its key when it has one. A click opens its window (3.3); it no longer plays at once.
  Its key still plays it, and F1 still lists "Play macro X" for each.
- Then: Record (Stop recording while it records), Play "Macro 3" (the macro played or recorded last; its name in the
  item, so it is clear which), Play X times, Play to the end of the file, Step by step, Manage...
- Without macros: "(no macros yet)" and Record.

### 3.3 The macro window

A small window, titled with the macro's name. Not modal (Manage is modal now, which it should not be): the editor
and the menus keep working while it is open, so you can switch documents, look at the macro's tab, and come back to
it. It stays until closed; a play from it runs on the document active at that moment.

- Play (once), Play X times... (asks the count), Play to the end of the file, Step by step (opens the macro in a tab
  beside the document and starts stepping).
- Continue recording: closes the window and starts recording at once; Stop recording adds the steps to the end of
  this macro.
- Edit: opens the macro in a tab (as Open in Manage now).
- Give name...: renames it (as Rename now, the same checks).
- Key...: a key for it in your keys.json (as now; a key in the file already is refused); the window shows its key
  when it has one.
- Delete: asks first, then deletes it (its key in keys.json stays and says "unknown macro" when used: shown as now
  when a macro is missing).
- A play runs on the document the window was opened from (the active one, or the other pane's when the active tab
  is the macro itself, as now).
- Esc or Close closes the window.

### 3.4 Manage...

- The same window with a list of the macros above the buttons; the buttons act on the one selected. New macro (an
  empty one in a tab) and New recording stay here.
- Insert with next recording (at the cursor in the macro's open tab) goes: Continue recording adds to the end; to
  put steps elsewhere, record onto it and move them in the editor. Append with next recording is Continue recording.

### 3.5 Tests

- Unit: the lowest free "Macro N" (none, a gap, a name of your own "Macro 7"); `~last.lpm` turned into a Macro N
  once.
- In-app: two recordings give Macro 1 and Macro 2, both in the menu; a click opens its window, not a play; each
  button (play, X times, to the end, step by step, continue recording adds to the end, edit, give name, key,
  delete); Play in the menu names the macro it plays; Manage shows the list and the same buttons; F1 and a key still
  play directly.

## 4. Open questions

None.
