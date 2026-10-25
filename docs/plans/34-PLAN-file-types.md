# Plan: file types: which extensions open in LexPen (Explorer's Open)

Status: draft 2026-10-25, not started; questions open.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Explorer opens a file with a double-click (its Open) in the app Windows has as the default for the file's extension.
LexPen only registers itself for `.md`, and only by hand (`register.ps1`). Every other extension a language pack knows
(`.sql`, `.cs`, `.json`, `.yaml`, ...) opens elsewhere, unless you set each one in Windows' Settings yourself.

## 2. The solution, in brief

A File types window, from Settings > App > Windows Explorer: a table of every extension the language packs know, with
its language and a checkbox; sortable by extension or by language. Check all, Check none, Assign, Cancel. Assign
registers LexPen for the checked extensions (and takes it off the unchecked ones it had), for the current user, no
admin. Where Windows already has another app chosen for an extension, Windows does not let an app take that over:
LexPen then says which ones, and opens Windows' Default apps at LexPen's page to confirm them there.

## 3. Details

### 3.1 The window

- Opened from Settings > App > Windows Explorer: a row "File types" with a button "File types...", and from F1.
- A table, one row per extension the language packs give (`extensions:` in each pack's language.yaml, your own packs
  included); an extension two packs name: the one LexPen uses (as LanguagePacks does now).
- Columns: a checkbox, Extension (`.sql`), Language (Sybase ASA SQL); a click on a column header sorts by it (again:
  the other way). Proposal for a third column, Opens now with: the app Windows starts now (question 2).
- Checked at the start: the extensions LexPen is registered for now.
- Buttons: Check all, Check none (the rows shown), Assign, Cancel (closes, nothing changed).
- A filter field above the table (type `sq` or `sql`): the rows of an extension or language that contain it; Check all
  and Check none act on those.

### 3.2 What Assign writes (HKCU\Software\Classes, per user, no admin)

As `register.ps1` does for `.md` now, per checked extension:

- A file type per language: `LexPen.<language>` (`LexPen.sql`), its name (`Sybase ASA SQL file`), LexPen's icon, its
  command `"<exe>" "%1"` (the LexPen that assigns: the published one, not a debug build; question 5).
- `.<ext>\OpenWithProgids\LexPen.<language>`: LexPen offered under Open with.
- `.<ext>` (its default value) set to `LexPen.<language>` only when it is empty or LexPen's already: another app's
  value is not taken over.
- `Applications\LexPen.exe\SupportedTypes\.<ext>`, and LexPen's Capabilities\FileAssociations: LexPen listed under
  Settings > Apps > Default apps with every extension.
- Per unchecked extension that LexPen had: these entries removed; Windows falls back to what else is registered.
- Then SHChangeNotify, so Explorer sees it at once.

### 3.3 What Windows does not allow, and what LexPen does about it

Since Windows 8 the default app of an extension that you chose yourself (UserChoice) can only be changed by you, in
Windows: an app writing it is refused (the value is protected by a hash). So Assign can make LexPen the default only
for extensions without such a choice. After Assign, LexPen asks Windows per checked extension which app it would start
(AssocQueryString, as `register.ps1` does) and:

- All LexPen: says so.
- Some not: lists them ("Windows keeps another app for .json, .yaml: confirm LexPen for them in Default apps") and
  opens `ms-settings:defaultapps?registeredAppUser=LexPen`, LexPen's own page there, where each extension is one
  click.
- Not done: tools that write UserChoice by computing that hash themselves. They are not documented, break with
  Windows updates and are flagged by virus scanners.

### 3.4 Host changes

- FileTypes.cs: the list (extension, language, registered now, the app Windows starts now), Assign (write and remove as
  3.2), what Windows starts now per extension; under LEXPEN_REGISTRY_ROOT for the tests, as ExplorerMenu.
- AppHost / SettingsForm: ops `fileTypes` (the list) and `assignFileTypes` (the checked ones; the answer lists the
  extensions Windows keeps elsewhere); the Default apps page opened from there.
- The window: a dialog in the settings window (question 3), settings.js / settings.css.
- register.ps1: its `.md` part done by this from the app (question 6).

### 3.5 Tests

- The registry entries for a checked extension (file type, OpenWithProgids, the default value when empty, Capabilities,
  SupportedTypes), under a test key.
- Another app's default value for an extension is not overwritten; LexPen's own is.
- Unchecking removes LexPen's entries and nothing else.
- The list from the packs: an extension per row, its language; an extension two packs name once.
- By hand: Assign for a few extensions; a double-click in Explorer opens them in LexPen; one with a choice of your own
  (a .json you open with another app): named after Assign, Default apps opened at LexPen.

## 4. Open questions

1. Windows lets you, not LexPen, change a default you chose yourself (3.3): Assign does what Windows allows and opens
   Default apps for the rest. Is that acceptable? Proposal: yes; there is no supported way around it.
2. A third column, Opens now with (the app Windows starts now for the extension)? Proposal: yes; it shows at once
   which ones are LexPen's already and which ones Windows keeps for another app.
3. Where: a dialog inside the settings window (proposal: it belongs to Windows Explorer's settings there), or a window
   of its own as Manage projects?
4. Unchecking an extension LexPen had: remove LexPen's entries (proposal), or only stop being the default and stay
   under Open with?
5. Assign from a debug build would register the debug exe. Refuse there (proposal: a message, as it is meant for the
   published LexPen), or allow it?
6. register.ps1: keep it as it is, or take its `.md` part out (this window does it from the app)? Proposal: keep it for
   a first install from the command line, and say so in its comment.
