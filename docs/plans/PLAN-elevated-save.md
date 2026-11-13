# Plan: Save where administrator rights are needed

Status: draft 2026-11-13, revised 2026-11-13; not started.

## 1. What this is about

Saving a file in a place that needs administrator rights (under `C:\Program Files`, `C:\Windows\System32\drivers\etc`,
a folder whose ACL denies the user) fails: `TextFile.WriteBytes` throws `UnauthorizedAccessException` on its temporary
file or on `File.Replace`, and the save is simply refused. The user has to save elsewhere, or restart LexPen as
administrator. Windows' own UAC prompt should let them grant the rights for that save.

A file with the read-only attribute fails the same way. LexPen already opens such a file read-only and keeps that:
the host's `read` reports the attribute, the page sets `doc.diskReadOnly`, every tab of it shows the lock ("Read-only
file on disk") and cannot edit. A save can still reach a read-only file in two ways:

- the user turned the tab's Read-only off on purpose (today `setReadOnly` refuses that for a file read-only on disk,
  with "is read-only on disk"; this plan lets it through, see 3.3);
- the file was made read-only after LexPen loaded it, while its tab was editable.

## 2. The solution, in brief

When a save is refused for lack of rights, LexPen asks "Save as administrator?". On Yes it starts a second LexPen
process elevated (`runas`: Windows shows its UAC prompt), with no window, which writes the prepared bytes to the target
the same way a normal save does (temporary file, replace, `.bak` when backups are on). LexPen itself keeps running
unelevated; a cancelled UAC prompt is "not saved", as a cancelled Save as dialog.

An ordinary save ends the elevated process right after its write: the next one asks again. Only while LexPen closes
(windows closing with "Save") does it stay, so every file in a protected folder saved by that close goes through one
question and one UAC prompt; it ends when the close is done or cancelled.

A read-only file still opens read-only, as now. Turning its tab's Read-only off is allowed (today it is refused).
Saving it, whether so unlocked or made read-only after loading, gets a clear warning that it is marked read-only; on
"Save anyway" LexPen clears the mark, saves, and marks the file read-only again. When the folder needs administrator
rights as well, the elevated process does all three.

## 3. Details

### 3.1 Where it applies

- Document saves through the host: `write` (`MainForm.WriteFile`, text), `hexWrite` (`HexWrite`, Hex), `writePdf`
  (a PDF with its highlights). All three end in `TextFile.WriteBytes`, so the elevated path is one place.
- Not: LexPen's own files in the data folder (always the user's), highlights or column definitions beside a file, and
  Replace in files: `searchreplace.js` keeps skipping a file it may not write (read-only, or a folder that needs
  administrator rights), listed as skipped with its reason. No question, no UAC prompt there.

### 3.2 The flow

1. `WriteFile` / `HexWrite` / `writePdf` catch `UnauthorizedAccessException` from `TextFile.WriteBytes` and answer the
   page with a refusal that says so (not a thrown error), carrying nothing else.
2. The page (`saveDoc`, `hexSave`, `pdfSave`) asks in LexPen's own question window (AskForm): "<name> is in a folder
   that needs administrator rights. Save as administrator?" Yes / No. No: not saved, as today.
3. Yes: the host call `writeElevated` with the same arguments. The host encodes the text as a save does
   (`TextFile.Encode`, so an ANSI file that cannot hold a character still fails first, unelevated) and writes the bytes
   to a temporary file in the user's temp folder. With no elevated helper running, it starts
   `LexPen.exe --write-elevated <pipe> <pid>` with `UseShellExecute = true, Verb = "runas"` (the UAC prompt): `<pipe>` a
   fresh random pipe name, `<pid>` LexPen's own process id. It then sends the write over the pipe and waits for the
   answer off the UI thread.
4. The elevated helper (`AppHost.ElevatedWriter` on LexPen's side, a handler in `Program.Main` on its own): before the
   single-instance mutex (as `--delete-backups` and `--compare-left`) it creates the named pipe, accepts only a client
   whose process id is `<pid>` (`GetNamedPipeClientProcessId`), and serves requests one at a time: temp file, target,
   backup yes / no, keep read-only yes / no (3.3). Each: read the temp file, `TextFile.WriteBytes`, answer "ok" or the
   exception's message. It ends when the pipe closes or `<pid>` exits, so a crashed LexPen leaves nothing elevated. No
   window, no WebView2, no data folder touched.
5. The parent deletes the temp file, notes the target in `ownWrites` (the watcher must not report our own write as a
   change from outside), and the save completes as any other (saved generation, title, drafts). Outside a close (3.4)
   it then closes the pipe: the helper ends.
6. UAC cancelled: `Process.Start` throws `Win32Exception` with `NativeErrorCode` 1223; that is "not saved", no message.
   The elevated write failing (disk full, file locked): its message, as a normal save failure shows one.

### 3.3 A read-only file

What stays: a file read-only on disk opens read-only (`doc.diskReadOnly`, the lock on its tabs, "Read-only file on
disk" in the tab's tip), and the setting "Viewed documents read-only" works as before.

What changes on opening: `setReadOnly(tab, false)` no longer stops at `doc.diskReadOnly`. It makes the tab editable and
says so in a toast: "<name> is read-only on disk. You can edit it; saving asks first." `doc.diskReadOnly` stays true
(it describes the file), so `editable()` needs the user's choice as well: a doc flag `diskReadOnlyOverridden`, set
here, cleared when the file is read again. The tab keeps a lock mark of its own while overridden (the tip: "Read-only
file on disk, editing allowed by you"), so it never looks like an ordinary file. A PDF is not affected: LexPen sets
`diskReadOnly` on every PDF (`app.js`, its text is never edited) and writes one only for its highlights (`pdfSave`); the
override does not apply there, only the save-time check of the real attribute does.

A file made read-only after loading: its tab stays editable. LexPen does not watch the attribute while a file is open
(no `FileSystemWatcher` in `src` has `NotifyFilters.Attributes`; a re-read sets `doc.diskReadOnly` again), and that
stays so: the warning at the save is the place it shows.

At the save:

1. Before the write, the host checks the target's attribute. Read-only (and an existing file): the write is not tried;
   the page gets a refusal that says "read-only".
2. The page warns, in AskForm, plainly enough that nobody saves over it by habit: "<name> is marked read-only. Someone
   or some program set this, usually so the file is not changed. Save anyway? LexPen removes the read-only mark, saves,
   and marks the file read-only again." Buttons: "Save anyway" / Cancel, Cancel the default (Enter does not
   overwrite). Cancel: not saved.
3. "Save anyway": the host saves with a `keepReadOnly` flag: it clears `FileAttributes.ReadOnly`, writes
   (`TextFile.WriteBytes`), and sets the attribute again in a `finally`, so a failed write still leaves the file
   read-only as it was. The `.bak` (backups on) is a copy of the old file and keeps the mark; that is fine.
4. Clearing the attribute itself refused (the folder or the file's ACL): the elevated path of 3.2, the request's
   "keep read-only" set so the helper does the same clear-write-set. The user then sees the read-only
   warning first and the UAC prompt after it: two questions, each about a different thing.
5. Save as onto a read-only file: Windows' Save dialog already asks to replace it; the read-only warning still comes,
   since replacing and overriding the mark are different things.
6. The warning comes at every save of an overridden file, not only the first: the mark goes back on after each save,
   so each save overrides it again.

### 3.4 Closing: one elevation for all

A window closes through `events.closeRequest` (`app.js`): its unsaved documents saved one by one with `saveDoc`, after
the close question or with `answer` "save" when Manage projects closes the project. When LexPen closes, several windows
do this in turn.

- The host counts the closes in progress: one starts when a window gets its close request, ends at `closeNow` or
  `closeCancel`.
- The first file refused for rights during a close gets the question, worded for the close: "<name> is in a folder that
  needs administrator rights. Save it, and any other such file while LexPen closes, as administrator?" Yes starts the
  helper (one UAC prompt); later refused files in that close, in this window or another, go to the same helper without
  a question.
- No to that question: that file is not saved, and the close stops as it does today when a save fails (`closeCancel`).
  The other windows' closes are not affected by it beyond that.
- When the count drops to none (every close done or cancelled), the host closes the pipe: the helper ends. LexPen
  exiting ends it as well (the helper watches `<pid>`).
- The read-only warning (3.3) still comes per file: overriding a file's mark is a choice about that file, not about
  rights.

### 3.5 Why a helper process, not LexPen elevated

- A process cannot raise its own rights; only a new process can be started elevated.
- Restarting all of LexPen elevated (what Notepad++ asks) loses nothing on disk but runs the whole editor, its WebView2
  and every macro as administrator from then on, and drag and drop from an unelevated Explorer stops working (UIPI).
- The helper runs only the write, for the moment of the write.

### 3.6 Points to watch

- The helper must skip everything `Main` does after the argument check: the mutex (it would find the running instance
  and hand it the arguments), `DataFolder.Migrate`, `AppHost`.
- The temp file is written by the user and read by the elevated process. Only the same user can change it between the
  two, and that user is the one granting the rights, so that is no escalation; the helper still writes only the target
  named on its command line.
- `File.Replace` keeps the old file's ACL and owner; a new file gets the folder's inherited ACL. Nothing to set.
- Paths with spaces: arguments quoted via `ProcessStartInfo.ArgumentList`.
- Outside a close, every save that needs the rights asks again and shows its own UAC prompt: the helper ends after its
  write, so nothing runs elevated between saves.
- The pipe: only LexPen's own process may connect (the client's process id checked), and the helper writes only what a
  request names, so no other program can use the elevated process while it waits during a close.
- The read-only check comes before the rights check: a read-only file in a protected folder is first a read-only
  question, so the UAC prompt never comes for a file the user would not have overwritten.

### 3.7 Tests

- Unit: the `--write-elevated` handler, run in-process unelevated on a temp folder over a real pipe: writes bytes,
  keeps a `.bak` when asked, answers a failure with its message, serves several requests, ends when the pipe closes,
  refuses a client with another process id.
- Unit: the keep-read-only write on a temp file: saved, read-only afterwards; a write that fails (target locked) leaves
  the file unchanged and still read-only.
- By hand: save a text file, a Hex tab and a PDF with highlights under `C:\Program Files\LexPenTest`: question, UAC
  prompt, saved, no "changed outside" notice. UAC cancelled: tab still dirty, no message. No: tab still dirty. A new
  file (Save as) into that folder. A file in a folder the user can write: no question (unchanged path).
- By hand, read-only: a read-only file opens read-only, as before. Read-only off on its tab: the toast, the tab
  editable with its own lock mark. Save: the warning, Enter cancels, "Save anyway" saves and the file is read-only
  again (Explorer's Properties); the next save warns again. The same file in `C:\Program Files\LexPenTest`: the
  warning, then the UAC prompt, then saved and read-only again.
- By hand, closing: unsaved files in `C:\Program Files\LexPenTest` in two windows, LexPen closed with Save: one
  question, one UAC prompt, all saved, no LexPen process left in Task Manager afterwards. No to the question: the close
  stops, the files still unsaved. Two ordinary saves to that folder outside a close: two prompts.
- By hand, made read-only after loading: open an ordinary file, edit, set its attribute in Explorer, save: the warning.

## 4. Open questions

None.
