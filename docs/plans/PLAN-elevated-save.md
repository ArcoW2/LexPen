# Plan: Save where administrator rights are needed

Status: draft 2026-11-13, revised 2026-11-13; in progress (built on branch elevated-save; the elevated path not yet
tested by hand).

## 1. What this is about

Saving a file in a place that needs administrator rights (under `C:\Program Files`, `C:\Windows\System32\drivers\etc`,
a folder whose ACL denies the user) fails: `TextFile.WriteBytes` throws `UnauthorizedAccessException` on its temporary
file or on `File.Replace`, and the save is simply refused. The user has to save elsewhere, or restart LexPen as
administrator. Windows' own UAC prompt should let them grant the rights for that save.

A file with the read-only attribute fails the same way. LexPen already opens such a file read-only and keeps that:
the host's `read` reports the attribute, the page sets `doc.diskReadOnly`, every tab of it shows the lock ("Read-only
file on disk") and cannot edit. A save can still reach a read-only file in two ways:

- the user turned the tab's Read-only off on purpose (before this plan `setReadOnly` refused that for a file read-only
  on disk, with "is read-only on disk"; this plan lets it through, see 3.3);
- the file was made read-only after LexPen loaded it, while its tab was editable.

## 2. The solution, in brief

When a save is refused for lack of rights, LexPen asks "Save as administrator?". On Yes it starts a second LexPen
process elevated (`runas`: Windows shows its UAC prompt), with no window, which writes the bytes LexPen sends it the
same way a normal save does (temporary file, replace, `.bak` when backups are on). LexPen itself keeps running
unelevated; a cancelled UAC prompt is "not saved", as a cancelled Save as dialog.

A setting (Settings > Files, "Saving where administrator rights are needed") picks how long the elevation lasts:
- **Ask at every save** (the default): the elevated process ends right after its write. Only while LexPen closes does
  it stay, so every file in a protected folder saved by that close goes through one question and one UAC prompt.
- **Ask once, then stay elevated**: after the first Yes it stays; "Elevated" shows in the status bar of every window,
  and a click on it ends the elevation.
- **Never**: no question; such a save fails at once with "Access denied".

A read-only file still opens read-only, as before. Turning its tab's Read-only off is allowed. Saving it, whether so
unlocked or made read-only after loading, gets a clear warning that it is marked read-only; on "Save anyway" LexPen
clears the mark, saves, and marks the file read-only again. When the folder needs administrator rights as well, the
elevated process does all three.

## 3. Details

### 3.1 Where it applies

- Document saves through the host: `write` (`MainForm.WriteFile`, text), `hexWrite` (`HexWrite`, Hex), `writePdf`
  (a PDF with its highlights). All three go through `MainForm.SaveBytes`, so the read-only and elevated paths are one
  place; on the page all three go through `hostWrite` (`app.js`).
- Not: LexPen's own files in the data folder (always the user's), highlights or column definitions beside a file, and
  Replace in files: `searchreplace.js` keeps skipping a file it may not write (read-only, or a folder that needs
  administrator rights), listed as skipped with its reason. It sends `never`, so no question and no UAC prompt there,
  also while an elevated helper runs.

### 3.2 The flow

1. `SaveBytes` encodes first (`TextFile.Encode`, so an ANSI file that cannot hold a character still fails first,
   unelevated). A read-only target without `keepReadOnly`: refused with `{ refused: "readOnly" }` (3.3). Then it writes
   as before; `UnauthorizedAccessException` answers `{ refused: "rights", closing }` (`closing`: a close is going on,
   3.4), not a thrown error. While an elevated helper runs (a close's, or kept, 3.5) the refused file goes to it
   unasked, unless the request says `never`.
2. `hostWrite` (the page) asks in LexPen's own question window (AskForm, op `askSaveRefused`, kind "rights"): "<name> is
   in a folder that needs administrator rights. Save it as administrator? Windows asks for the rights." Buttons "Save as
   administrator" / Cancel. Cancel: not saved, as before. Setting at "never": no question; the save throws "Access
   denied: <name> is in a folder that needs administrator rights, and LexPen is set never to ask for them (Settings >
   Files)", shown as any failed save is.
3. Yes: the same op again with `elevated: true` (and `keep` when the setting is "keep"). The host
   (`ElevatedWriter.Write`) creates a named pipe with a fresh random name that only this user and administrators may
   open, and starts `LexPen.exe --write-elevated <pipe> <pid>` with `UseShellExecute = true, Verb = "runas"` (the UAC
   prompt, owned by the window), `<pid>` LexPen's own process id. It accepts the connection only from the process it
   started (`GetNamedPipeClientProcessId`), then sends the write over the pipe and waits for the answer off the UI
   thread.
4. The helper (`ElevatedWriter.Serve`, from `Program.Main` before the single-instance mutex, as `--delete-backups` and
   `--compare-left`): connects to the pipe, checks that its server is `<pid>` (`GetNamedPipeServerProcessId`), and
   serves requests one at a time: target, backup yes / no, keep read-only yes / no, the bytes. Each:
   `ElevatedWriter.Write` (the same write as an unelevated save), answer "" or the exception's message. It ends when the
   pipe closes, which LexPen's exit or crash does too, so nothing is left elevated. No window, no WebView2, no data
   folder touched.
5. LexPen notes the target in `ownWrites` just before the write (not news for the Folder pane), and the save completes
   as any other (saved generation, title, drafts). Unless a close goes on or the helper is kept, it then closes the
   pipe: the helper ends.
6. UAC cancelled: `Process.Start` throws `Win32Exception` with `NativeErrorCode` 1223; that is `{ refused: "cancelled" }`,
   "not saved", no message. The elevated write failing (disk full, file locked): its message, as a normal save failure
   shows one. The helper gone mid-write: "The administrator's process for saving ended before the file was written."

### 3.3 A read-only file

What stays: a file read-only on disk opens read-only (`doc.diskReadOnly`, the lock on its tabs, "Read-only file on
disk" in the tab's tip), and the setting "Viewed documents read-only" works as before.

What changes on opening: `setReadOnly(tab, false)`, from the Read-only toggle (tab menu, action), no longer stops at
`doc.diskReadOnly`. It makes the tab editable and says so in a toast: "<name> is read-only on disk. You can edit it;
saving asks first." `doc.diskReadOnly` stays true (it describes the file); the user's choice is `doc.diskReadOnlyOff`,
which `editable()` reads. Turning Read-only on again clears it, and a file opened again starts without it. The toggle's
check (`readOnlyShown`) follows the same. The tab keeps a mark of its own while overridden, an open padlock (the tip:
"Read-only file on disk, editing allowed by you: saving asks first"), so it never looks like an ordinary file. The
"Viewed documents read-only" setting does not override the file's mark (only the toggle does). A PDF is not affected:
LexPen sets `diskReadOnly` on every PDF (`app.js`, its text is never edited); its Read-only stays refused, and only the
save-time check of the real attribute applies to its highlights save.

A file made read-only after loading: its tab stays editable. LexPen does not watch the attribute while a file is open
(no `FileSystemWatcher` in `src` has `NotifyFilters.Attributes`; a re-read sets `doc.diskReadOnly` again), and that
stays so: the warning at the save is the place it shows.

At the save:

1. Before the write, the host checks the target's attribute. Read-only (and an existing file): the write is not tried;
   the page gets `{ refused: "readOnly" }`.
2. The page warns, in AskForm (op `askSaveRefused`, kind "readOnly"), plainly enough that nobody saves over it by
   habit: heading "<name> is marked read-only", then "Someone or some program set this mark, usually so that the file is
   not changed. Save anyway? LexPen removes the read-only mark, saves, and marks the file read-only again." Buttons
   "Save anyway" / Cancel, Cancel the default (`AskForm.Question.CancelDefault`: Enter does not overwrite). Cancel: not
   saved.
3. "Save anyway": the save again with `keepReadOnly`: `ElevatedWriter.Write` clears `FileAttributes.ReadOnly`, writes
   (`TextFile.WriteBytes`), and sets the attribute again in a `finally`, so a failed write still leaves the file
   read-only as it was. The `.bak` (backups on) is the old file after its mark was cleared, so it is not read-only.
4. Clearing the attribute itself refused (the folder or the file's ACL): the elevated path of 3.2, the request's
   "keep read-only" set so the helper does the same clear-write-set. The user then sees the read-only warning first and
   the rights question after it: two questions, each about a different thing.
5. Save as onto a read-only file: Windows' Save dialog already asks to replace it; the read-only warning still comes,
   since replacing and overriding the mark are different things.
6. The warning comes at every save of an overridden file, not only the first: the mark goes back on after each save,
   so each save overrides it again.

### 3.4 Closing: one elevation for all

A window closes through `events.closeRequest` (`app.js`): its unsaved documents saved one by one with `saveDoc`, after
the close question or with `answer` "save" when Manage projects closes the project.

- The host (`ElevatedWriter.SetClosing`) keeps the closes in progress: a window's starts when it posts its close
  request and ends at `closeCancel` or when it closes; Manage projects' Close and Delete, which close windows one after
  another, count as one close around all of them.
- The first file refused for rights during a close gets the question, worded for the close: "<name> is in a folder that
  needs administrator rights. Save it, and any other such file while LexPen closes, as administrator? Windows asks for
  the rights once." Yes starts the helper (one UAC prompt); later refused files in that close, in this window or
  another, go to the same helper without a question.
- Cancel on that question: that file is not saved, and the close stops as it does when a save fails (`closeCancel`).
- When no close is left (every close done or cancelled), the host closes the pipe: the helper ends, unless kept (3.5).
- The read-only warning (3.3) still comes per file: overriding a file's mark is a choice about that file, not about
  rights.

### 3.5 The setting

`elevation` (Settings > Files, "Saving where administrator rights are needed"; found by searching elevated, permission,
rights, access, denied, save and the like), in `settings.json` with its default:

- `short` (default): as 3.2 and 3.4.
- `keep`: the first Yes keeps the helper (`ElevatedWriter.Kept`) after its write; later refused saves go to it unasked.
  While it runs, every window's status bar shows "Elevated" (`.mm-st-elev`, set by the host's `elevated` event and by
  `init` for a window opened later). A click on it (`elevationStop`) ends the helper; the next refused save asks again.
- `never`: `hostWrite` sends `never` and throws "Access denied: ..." on a refusal for rights; no question, no helper.
  The read-only warning still comes (it is not about rights).

### 3.6 Why a helper process, not LexPen elevated

- A process cannot raise its own rights; only a new process can be started elevated.
- Restarting all of LexPen elevated (what Notepad++ asks) loses nothing on disk but runs the whole editor, its WebView2
  and every macro as administrator from then on, and drag and drop from an unelevated Explorer stops working (UIPI).
- The helper runs only the write.

### 3.7 Points to watch

- The helper skips everything `Main` does after the argument check: the mutex (it would find the running instance and
  hand it the arguments), `DataFolder.Migrate`, `AppHost`.
- The bytes go over the pipe, not through a temporary file, so nothing of the user's text waits on disk for the helper.
- The pipe: LexPen is its server and accepts only the process it started; the helper accepts only a server that is
  LexPen's process. The helper writes only what a request names.
- `File.Replace` keeps the old file's ACL and owner; a new file gets the folder's inherited ACL. Nothing to set.
- The helper's arguments are a pipe name and a number: no quoting needed (`ProcessStartInfo.Arguments`).
- The UAC prompt is owned by the window (`ErrorDialogParentHandle`, which ShellExecuteEx only receives with
  `ErrorDialog`), so it comes to the front instead of blinking in the taskbar.
- The read-only check comes before the rights check: a read-only file in a protected folder is first a read-only
  question, so the UAC prompt never comes for a file the user would not have overwritten.
- `askSave` was taken (save before closing); the new op is `askSaveRefused`.

### 3.8 Tests

- Unit (`ElevatedWriterTests`): the helper run in-process unelevated over a real pipe: writes, keeps a read-only file's
  mark, answers a failure with its message, serves several requests, ends when the pipe closes; a server of another
  process id is refused. The keep-read-only write: saved, read-only afterwards, `.bak` made; a write that fails (target
  locked) leaves the file unchanged and still read-only; without keep a read-only file is refused.
- By hand, read-only (done on a test instance, Debug build, 2026-11-13): the file opens read-only with the closed
  padlock; Read-only off: the toast, the open padlock and its tip; Save: the warning, Enter cancels (file and mark
  unchanged, tab still unsaved); "Save anyway": written, read-only again, `.bak` made.
- By hand, still to do: save a text file, a Hex tab and a PDF with highlights under `C:\Program Files\LexPenTest`:
  question, UAC prompt, saved, no "changed outside" notice. UAC cancelled: tab still unsaved, no message. Cancel: tab
  still unsaved. A new file (Save as) into that folder. A file in a folder the user can write: no question.
- By hand, still to do: a read-only file in `C:\Program Files\LexPenTest`: the warning, then the question and the UAC
  prompt, then saved and read-only again.
- By hand, still to do, closing: unsaved files in that folder in two windows of a project, the project closed with
  Save in Manage projects: one question, one UAC prompt, all saved, no elevated LexPen left in Task Manager. Cancel on
  the question: the close stops, the files still unsaved. Two ordinary saves outside a close: two prompts.
- By hand, still to do, the setting: "keep": one prompt, "Elevated" in every window's status bar, later saves unasked,
  a click on Elevated ends it (the helper gone in Task Manager), the next save asks again. "never": the Access denied
  message, no question. Settings search finds the row by elevated, permission, denied, save.
- By hand, still to do: made read-only after loading: open an ordinary file, edit, set its attribute in Explorer, save:
  the warning.

## 4. Open questions

None.
