# Plan 40: Compare in Explorer by what is selected

## 1. The enhancement

LexPen's compare items in Explorer's right-click menu should depend on the selection, as Beyond Compare's do:

- **One file or folder**: "Select left side to compare", and once a left side is chosen "Compare to <its name>"
  (as now).
- **Two files, or two folders**: one item, **Compare**, which opens the Compare project with the two left and right.
  The one-item entries are not shown then.
- **A file and a folder**: Compare too: the file against the file of the same name in that folder; when the folder
  has no such file, a message says so and nothing opens.
- **More than two**: no compare items at all.

Today the registry entries show the same items whatever is selected, so two files take the two steps of the
one-item entries (docs/plans/executed/PLAN-explorer-compare.md).

## 2. The solution, in brief

An Explorer command handler: a small DLL that Explorer loads, registered for the current user, which sees the whole
selection and shows only the items that fit it. A choice runs LexPen as now: `--compare-left <path>` for the left
side, `--compare <left> <path>` for Compare to, and `--compare <first> <second>` for Compare (a file and a folder:
the folder's file of the same name in the folder's place, else a message). It replaces the
registry entries of the compare items; Edit, View and Delete .bak stay registry entries. The handler is written in
C++, so Explorer does not load a .NET runtime. A setting turns the handler on or off; off, the compare items are the
registry entries of today.

## 3. Details

### 3.1 Why registry entries cannot do it

An entry made of registry keys (what LexPen writes now) runs its command once per selected item, each with its own
`%1`, and cannot ask how many items are selected. It can be hidden when more than one is selected
(`MultiSelectModel` = `Single`), which covers the one-item entries, but nothing makes an entry show only for exactly
two. A handler (`IExplorerCommand`) gets the selection as a whole (`IShellItemArray`): its count, and whether each
item is a file or a folder. Its `GetState` hides an item that does not fit; its `Invoke` gets the paths in one call.

### 3.2 The handler

- Three commands, each a class of its own (Left, CompareTo, Compare; `ExplorerCommandHandler`), their classes under
  `HKCU\Software\Classes\CLSID`, the DLL next to LexPen.exe. Between two lines they are registered once under
  `AllFilesystemObjects\shell` (files and folders together, so a file with a folder selected gets them too); in a
  submenu, in LexPen's submenu of files and of folders (a file with a folder selected then has no LexPen submenu: open
  question 1). What they read: `HKCU\Software\Classes\LexPen.Shell` (Exe, LeftFile). Written by ExplorerMenu.Apply as
  the entries are now, removed by Remove.
- What it reads: LexPen's exe and the left side, from the same places the registry entries use now (the exe from a value
  ExplorerMenu writes with its registration, the left side from `compare-left.txt` in the state folder), each time the menu opens, so a left
  side selected a moment ago shows at once.
- The settings for the Explorer menu keep working: between two lines, or in a "LexPen" submenu (the handler's
  subcommands, `EnumSubCommands`).
- Left and right: the order Explorer gives the items (its selection order, not always the order they were clicked).
  The compare's Swap button puts them the other way round.
- A file and a folder: the handler shows Compare without looking in the folder (opening the menu stays quick);
  LexPen looks when it runs: `--compare <file> <folder>` compares the file with `<folder>\<file's name>` when that
  exists, the file keeping its side; otherwise it shows "<folder> has no <name>" and opens no compare. The same
  holds for `--compare` from the command line.

### 3.3 The setting

- Settings > App > Windows Explorer gets **Compare by selection (Explorer extension)**, under "Compare entries in
  Explorer's right-click menu" and only in use while that one is on.
- On: the handler is registered (ExplorerMenu.Apply) and the registry entries of the compare items are removed.
  Off: the handler's registration is removed, so Explorer no longer loads the DLL, and the registry entries of today
  are written again. Turning it off is also the way out when the handler misbehaves.
- Off by default: the handler is new, and today's entries keep working until it is turned on.
- Explorer reads its menu entries when a menu opens: a change shows on the next right-click, no restart. A DLL
  Explorer already loaded stays loaded (and locked) until Explorer restarts, but no longer shows anything.

### 3.4 Building it

- C++ needs Visual Studio's "Desktop development with C++" tools: added to Visual Studio 2026 on this PC (Visual
  Studio 2022 stays without them). The build checks for them (vswhere) and says so when they are missing.
- `shell\LexPenShell.cpp` (WRL, no ATL), built by `shell\build.cmd` with cl.exe to `LexPenShell.dll`, x64, next to the
  exe: LexPen.csproj runs it after each build (and copies the DLL into a publish). Without the C++ tools: a warning, no
  DLL, and the setting keeps today's entries.
- Explorer keeps a loaded handler DLL open: a new LexPen cannot overwrite it while Explorer runs. The publish writes
  the DLL under a versioned name and the registration points at it; an older one is removed when no longer loaded.

### 3.5 Alternatives not taken

- **A handler in C# (.NET COM hosting).** No C++ tools needed, but Explorer would load the .NET runtime into its own
  process, and one process can hold only one .NET runtime: another program's .NET handler of another version would
  then fail, or LexPen's would.
- **Registry entries plus collecting** (the first version of this plan): one LexPen start per selected item, the
  running LexPen collecting them. Compare would also show with one item, and with three or more, and two quick
  starts are not a reliable way to tell a selection of two from two separate clicks.
- **A "Send to" shortcut.** It gets all selected items on one command line, but lives under Send to, and cannot hide
  itself for one or three items.

### 3.6 Windows 11

Like the other LexPen items: under "Show more options" (or Shift+right-click). The compact menu takes only handlers of
an app with a package identity (a signed package, or a sparse package next to the exe); the handler here is the part
that would need, but packaging is not in this plan.

### 3.7 Tests

- Unit (C#): ExplorerMenu writes and removes the handler's registration below the test registry root
  (`LEXPEN_REGISTRY_ROOT`), next to the remaining registry entries; with the setting off, today's compare entries
  and no handler, with it on the handler and no compare entries.
- Unit (C++ or through a small test exe): the handler's choice per selection: one file, one folder, two files, two
  folders, a file and a folder, three files; with and without a left side.
- Unit (C#): `--compare <file> <folder>` and `--compare <folder> <file>`: the folder's file of that name, either
  order; no such file: the message, no compare.
- By hand in Explorer: each of these selections, the items shown, and what each runs.

## 4. Open questions

1. In a submenu, a file and a folder selected together get no LexPen submenu (it is one per kind). Is that acceptable,
   or should the submenu move to `AllFilesystemObjects` too (its other items, Edit and Delete .bak, then need a way to
   show only for files, or labels for both)?
