# Plan: Where a compare from Explorer opens: the project for viewing, or a project for comparing

Status: draft 2026-10-27, not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

Explorer's Compare and Compare to (and `LexPen.exe --compare a b`) open a new window in whatever project the setting
"A new window" gives, in practice the last project used. A compare is a short look at two files or folders, not work
in that project: it adds a window and tabs to a project that has nothing to do with them. View in LexPen solved the
same for viewing with the project for viewing (`ViewProject.cs`).

This plan is about the compare started from outside a window (Explorer, the command line). Compare from inside a
window (the tab menu, the folder pane, File > Compare) stays in that window, as now.

## 2. The solution, in brief

A setting "A compare from Explorer opens in" with three choices: the project for viewing, a project for comparing,
or a new window as now. The project for comparing works as the project for viewing does: made as "Compare" on first
use (or chosen in the settings), its window on this desktop reused when one is shown, else its last closed window,
else a new one; normal opening never lands in it, and its windows are not restored at start.

## 3. Details

### 3.1 The setting

- Options > Settings > General > Windows (beside "A new window"); "Project for comparing" in General > Viewing,
  beside "Project for viewing". **A compare from Explorer opens in**: "The project for viewing", "The project for comparing" (the default), "A
  new window (as the setting A new window)".
- **Project for comparing**: as "Project for viewing", a choice of project (kind `project`); none chosen: the project
  named "Compare", made on first use. A `CompareProject` next to `ViewProject` (find by id, else by name), pure and
  testable as that one is.

### 3.2 Which window

As View in LexPen does (`AppHost.View`), for the project chosen by the setting:
1. Its window on this desktop that is shown (not minimized): the compare starts there, and the window comes to the
   front.
2. Else its last closed window: opened again (its layout and tabs as left), the compare in it.
3. Else a new window of that project.

A compare already running in the reused window ends first, as starting another compare from the tab menu does now;
the files of the old compare stay open as tabs. A folder compare replaces a folder compare the same way.

### 3.3 The project for comparing, as the project for viewing

- Opening a file normally (Explorer's open, a drop on the taskbar icon, Edit in LexPen) never lands in it, as for
  the project for viewing (`Route` leaves the project for viewing out now; it leaves this one out too).
- Its windows are not restored at start (`StartWindows` skips it, as it skips the project for viewing).
- Its layout to start with: the default layout, two panes side by side (a compare needs both); no reset command
  unless asked for.
- Everything else as a normal project: its tabs and layout are kept, it can be renamed, a window can be moved to
  another project.

### 3.4 Tests

Unit (host): `CompareProject.Find` by id and by name; the setting's three choices picking the project. In the app,
with Explorer's Compare (or `--compare`): the first compare makes "Compare" and a window of it; a second compare
reuses that window (the first compare's tabs stay); minimized or on another desktop: its last closed window or a new
one; with "The project for viewing": in the view window; with "A new window": as now; a normal file open from
Explorer does not land in the compare project; a restart does not reopen its window.

## 4. Open questions

1. "Compare from the editor" in your message: Explorer's Compare / Compare to is what I took it to be. Is there
   another compare that opens a window (and so a project) that should follow this setting too?
2. The default: the project for comparing (recommended: compares stay out of both work and viewing), or the project
   for viewing?
