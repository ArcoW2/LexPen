# Plan: file types: which extensions open in LexPen (Explorer's Open), as edit or view

Status: executed 2026-10-25 on the branch `plan34-file-types` (draft 2026-10-25, with your answers of that day).
Decisions of the run in section 4.

## 1. What this is about

Explorer opens a file with a double-click (its Open) in the app Windows has as the default for the file's extension.
LexPen only registers itself for `.md`, and only by hand (`register.ps1`). Every other extension a language pack knows
(`.sql`, `.cs`, `.json`, `.yaml`, ...) opens elsewhere, unless you set each one in Windows' Settings yourself. And a
double-click always edits: there is no way to have some file types open in the project for viewing.

## 2. The solution, in brief

A File types dialog in the settings window (Settings > App > Windows Explorer): a table of every extension the
language packs know, with a checkbox, its language, how it opens (Edit or View, Edit by default) and the app Windows
opens it with now; sortable by each column. Check all, Check none, Assign, Cancel. Assign registers LexPen for the
checked extensions, each as edit or view, and takes it off the unchecked ones it had; for the current user, no admin.
Where you chose another app for an extension before, Assign removes that stored choice so Windows falls back to
LexPen; what Windows still keeps elsewhere is named, and Windows' Default apps opens at LexPen's page for it.

## 3. Details

### 3.1 The dialog

- In the settings window: Settings > App > Windows Explorer gets a row "File types" with a button "File types...",
  which opens the dialog over the settings (as the settings window's own dialogs). Also from F1.
- One row per extension the language packs give (`extensions:` in each pack's language.yaml, your own packs
  included); an extension two packs name: the one LexPen uses (as LanguagePacks does now).
- Columns:
  - a checkbox: LexPen opens it;
  - Extension (`.sql`);
  - Language (Sybase ASA SQL);
  - Opens as: Edit or View, a list per row; Edit when not chosen before. Edit: as opening a file is now (never in the
    project for viewing). View: in the project for viewing, in the preview, read-only as its setting says
    (`--view`, docs/plans/executed/PLAN-view-window.md). Choosing one checks the row as well: one click less;
  - Opens now with: the app Windows starts now for it (its name; "LexPen" in the accent colour; "-" for none).
- A click on a column header sorts by it; again: the other way.
- A filter field above the table (type `sq` or `sql`): the rows whose extension or language contains it.
- Checked at the start: the extensions LexPen is registered for now, each with how it opens now.
- Buttons: Check all, Check none, All edit, All view, Assign, Cancel (closes, nothing changed).
  - Check all, Check none, All edit and All view act only on the rows the filter shows; a row the filter hides keeps
    its checkbox and its way of opening. Their tooltips say so ("the rows shown"). All edit and All view check the
    rows as well, as choosing in a row does.
  - Assign acts on every row: it first clears the filter (every row shown), then asks whether to assign the settings
    as they are now ("Open .sql, .md, ... in LexPen (... as view), take LexPen off .ini?"); No changes nothing.

### 3.2 What Assign writes (HKCU\Software\Classes, per user, no admin)

Per checked extension:

- A file type per language and way of opening: `LexPen.<language>.edit` and `LexPen.<language>.view`
  (`LexPen.sql.view`), its name (`Sybase ASA SQL file`), LexPen's icon, its command: `"<exe>" "%1"` for edit,
  `"<exe>" --view "%1"` for view.
- `.<ext>` (its default value) set to that file type, and `.<ext>\OpenWithProgids\<it>`: LexPen offered under Open
  with as well.
- `Applications\LexPen.exe\SupportedTypes\.<ext>`, and LexPen's Capabilities\FileAssociations: LexPen listed under
  Settings > Apps > Default apps with every extension.
- Your own earlier choice for the extension (3.3) removed, so Windows starts LexPen.

Per unchecked extension that LexPen had: these entries removed (your answer): its default value only when it is
LexPen's, Open with, SupportedTypes, Capabilities. Windows falls back to what else is registered.

Then SHChangeNotify, so Explorer sees it at once.

The exe is the LexPen that assigns. A debug build refuses, with a message (your answer): it would register the debug
exe.

The old file type of register.ps1 (`LexPen.Document` for `.md`) goes on the first Assign; register.ps1 itself goes
(your answer: not needed for `.md` alone).

### 3.3 Taking over a default you chose for another app

When you once chose an app for an extension (Open with > Always, or Settings > Default apps), Windows keeps that choice
apart, per user: HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.<ext>\UserChoice, with a hash that
only Windows can write. An app writing it is refused. What other programs do, and what this plan does:

- Remove that UserChoice key (and UserChoiceLatest, its newer form on recent Windows 11, when it is there). Removing
  is allowed where writing is not. Windows then has no choice of yours and starts the default of
  HKCU\Software\Classes\.<ext>: LexPen.
- Not done: writing a UserChoice with a hash computed by LexPen (the tools that do are not documented, break with
  Windows updates and are flagged by virus scanners).
- Windows 11 protects some associations against this (a driver, UCPD: the browsers' http and https, `.pdf`); which
  ones, and whether more follow, is not documented. So after Assign LexPen asks Windows per checked extension which
  app it would start (AssocQueryString) and:
  - all LexPen: says so;
  - some not: names them ("Windows keeps another app for .pdf: confirm LexPen for it in Default apps") and opens
    `ms-settings:defaultapps?registeredAppUser=LexPen`, LexPen's own page there.
- To be tried by hand first, on this PC: removing UserChoice for an extension chosen for another app, and what Windows
  shows after (it may show "an app default was reset" or ask which app on the next double-click).

### 3.4 Host changes

- FileTypes.cs: the list (extension, language, registered now and how, the app Windows starts now); Assign (write and
  remove as 3.2, the UserChoice of 3.3); the app Windows starts per extension; under LEXPEN_REGISTRY_ROOT for the
  tests (as ExplorerMenu), the UserChoice part under a test key as well.
- SettingsForm: ops `fileTypes` (the list) and `assignFileTypes` (the checked ones with their way of opening; the answer
  names the extensions Windows keeps for another app); the Default apps page opened from there.
- The dialog: settings.html / settings.js / settings.css; the row in actions.js (App > Windows Explorer).
- register.ps1 removed; README's install text says Settings > App > Windows Explorer > File types instead.

### 3.5 Tests

- The registry entries for a checked extension, edit and view (file type and its command, default value, Open with,
  Capabilities, SupportedTypes), under a test key.
- Unchecking removes LexPen's entries and nothing else; another app's default value of an extension LexPen did not have
  stays.
- A UserChoice under the test key is removed for a checked extension, kept for an unchecked one.
- The list from the packs: an extension per row with its language; an extension two packs name once; how it opens now
  read back (edit or view).
- The old LexPen.Document entries gone after Assign.
- By hand: Assign for a few extensions, some as View; a double-click in Explorer opens them in LexPen, as edit or in the
  project for viewing; an extension you had chosen another app for: LexPen after Assign (or named, with Default apps);
  Opens now with following.

## 4. Decisions of the run

- Removing a choice of yours (3.3), checked on this PC without changing anything: the UserChoice key of an
  extension denies you only setting a value, and gives you full control otherwise, so removing it is allowed. The
  protection driver (UCPD) runs here: what it keeps for another app is named after Assign, with Default apps.
- Not tried for real: Assign on your associations. A debug build refuses it (your answer), and the tests write below a
  test key; the first Assign is yours, from the published LexPen.
- The file types are per language and way of opening (`LexPen.asa.edit`, `LexPen.markdown.view`); one no extension
  uses any more goes. register.ps1's `LexPen.Document` goes on the first Assign; register.ps1 is removed and the
  README's install section points to File types.
- Nothing checked: LexPen also leaves Default apps (its Capabilities and RegisteredApplications go).
- Opens now with: "-" when Windows has nothing (its own "Pick an application"); "Runs itself" for a file that runs
  itself (.cmd); LexPen in the accent colour.
- The question of Assign names the extensions per way of opening and the ones taken off (the first ones, then "and n
  more"); after Assign the dialog stays open with the list read again, and a line says what was done.
- Also from F1: File types... opens this window's settings with the dialog.
- The registry tests (ExplorerMenu's and these) run one after the other: both set LEXPEN_REGISTRY_ROOT.
- Tested by hand in the debug build: the dialog's list (with what Windows opens each with now), the filter, sorting,
  Check all / none and All edit / view on the rows shown only, choosing View checking its row, Assign clearing the
  filter and being refused in a debug build.
