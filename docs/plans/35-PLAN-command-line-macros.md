# Plan: Macros from the command line, a new project, and exit from a macro

Status: draft 2026-10-29; not started.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

A macro can only be started by hand, inside LexPen. To use LexPen in a script or a batch file (open some files, do
the same edits on them, close), three things are missing:

- a command line option that first opens the given documents and then runs a named macro on them;
- a command line option that always opens a new project, instead of adding the files to a window that is already
  open (or to the project closed last on this desktop);
- a macro statement that closes LexPen without any question: either saving the changed documents or discarding
  their changes, and in both cases keeping the drafts as drafts.

The command line options must be in the documentation (README and docs/features.md), all of them, not only the new
ones.

## 2. The solution, in brief

`--macro <name>` (short `-m`) runs the stored macro of that name once the files of the same command line are open,
in the window that got them, on its active document; when LexPen already runs, the running instance does it.
`--new-project` (short `-p`) opens the files in a new window of a new, unnamed project, whatever is open already.
A new statement `exit save` / `exit discard` closes LexPen as the close question's Yes or No would, without asking:
changed files saved or their changes dropped, drafts kept; with `window` added it closes only the macro's own
window. What it closes comes back at the next start, as after a shutdown. The README gets a complete list of the command line
options, and docs/features.md points to it.

## 3. Details

### 3.1 --macro

- `LexPen.exe a.sql b.sql --macro tidy`: the files open as they do now (the same routing, `-n`, `--new-project`),
  then the macro `tidy` (from `macros\` in the data folder) plays once, with the default options of a play (not
  found: stop; errors: stop; screen on).
- It runs in the window the files went to, on that window's active document after the files are open: the last
  file of the command line. A macro reaches the others with `show "b.sql"`.
- "Once the files are open" means each file's text is loaded and its tab shown, not only its tab made.
- LexPen already running: the new process hands the paths and the macro name to it (as it does with the paths now),
  and the running instance runs the macro.
- Only the name of a stored macro, not a file path (a macro elsewhere would have to be copied into `macros\`).
- A macro that does not exist, or has an error: said in the window (as Play says it now) and nothing runs; the files
  stay open.
- Without files: the macro runs in the window LexPen opens (or activates) anyway, on its active document.
- Only one `--macro` per command line.

### 3.2 --new-project

- `LexPen.exe --new-project a.sql`: a new, unnamed project with one new window, the files in it (folders as the
  window's folder, as now). Same as Projects > New project, then opening the files there.
- Also when LexPen already runs, and also when another window has these files open (a file open in two windows can
  only be edited in the first one, as now).
- Combined with `--macro`: the macro runs in that new window.
- LexPen not running yet: only the new project opens; the projects of the last session are not restored this time
  (handy for a batch run). They are not lost: they come back at the next start without `--new-project`, so this
  start must not overwrite what the last session left to restore.
- An unnamed project is dropped later when none of its windows has files left (as now).

### 3.3 exit from a macro

- `exit save`: every changed document with a file is saved; drafts stay drafts (changed or not); then LexPen
  closes: every window of every project, also windows that were open before the macro started.
- `exit discard`: the changes of documents with a file are dropped; drafts stay drafts; then LexPen closes.
- `exit save window` / `exit discard window`: the same for the macro's own window only (the window of the document
  it works on); LexPen itself ends only when that was its last window.
- What it closes comes back at the next start, as after a shutdown or log-off: the windows and their projects are
  not closed for good (unlike closing a project's last window by hand). With `window`, also when other windows of
  its project stay open.
- No question, also not "Save draft editN?" and not the question about a file that changed on disk. A file that
  cannot be saved (read-only, gone, no access) stops the exit: the macro ends with that error, LexPen stays open.
- `exit` without a word is an error when the macro is read (as `notfound` without one): the choice is always
  written.
- The check knows `exit`; the reference, Statement... and the hints list it. Recording never writes it.
- Lines after `exit` never run (the check's warning, as after `stop`).

### 3.4 Documentation

- README: the section on starting LexPen gets the full list: files and folders, `-n` / `--new-window`, `-c` /
  `--compare`, `--view`, `--edit`, `--new-project`, `--macro`, and the ones Explorer's menu uses
  (`--delete-backups`, `--compare-left`), each with one line and an example for the new ones (a batch file that
  opens files, runs a macro ending in `exit save`).
- docs/features.md: under Macros and under One instance, more windows, a line each, pointing to the README list.
- The macro reference (defaults/macros/reference.md): `exit`, and running a macro from the command line.

### 3.5 Tests

- Unit: `ParseArgs` with `--macro name`, `-m name`, `--new-project`, `-p`, a missing name after `--macro`, the
  switches mixed with paths.
- Unit: the language: `exit save`, `exit discard`, `exit` alone an error, lines after it warned.
- In-app: start with two files and `--macro`: the macro ran on the last one; with LexPen already running: ran in
  that instance; a missing macro said, the files open; `--new-project` while a window is open: a new project with
  the files; `exit save` / `exit discard` with a changed file and a changed draft: the file saved / unchanged on
  disk, the draft kept, LexPen gone; an unsavable file: LexPen stays, the error shown.

## 4. Open questions

None.
