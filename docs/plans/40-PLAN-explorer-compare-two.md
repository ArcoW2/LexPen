# Plan 40: Compare in Explorer by what is selected

## 1. The enhancement

LexPen's compare items in Explorer's right-click menu should depend on the selection, as Beyond Compare's do:

- **One file or folder**: "Select left side to compare", and once a left side is chosen "Compare to <its name>"
  (as now).
- **Two files, or two folders**: one item, **Compare**, which opens the Compare project with the two left and right.
  The one-item entries are not shown then.
- **More than two, or a file with a folder**: no compare items at all.

Today the registry entries show the same items whatever is selected, so two files take the two steps of the
one-item entries (docs/plans/executed/PLAN-explorer-compare.md).

## 2. The solution, in brief

An Explorer command handler: a small DLL that Explorer loads, registered for the current user, which sees the whole
selection and shows only the items that fit it. A choice runs LexPen as now: `--compare-left <path>` for the left
side, `--compare <left> <path>` for Compare to, and `--compare <first> <second>` for Compare. It replaces the
registry entries of the compare items; Edit, View and Delete .bak stay registry entries. The handler is written in
C++, so Explorer does not load a .NET runtime.

## 3. Details

### 3.1 Why registry entries cannot do it

An entry made of registry keys (what LexPen writes now) runs its command once per selected item, each with its own
`%1`, and cannot ask how many items are selected. It can be hidden when more than one is selected
(`MultiSelectModel` = `Single`), which covers the one-item entries, but nothing makes an entry show only for exactly
two. A handler (`IExplorerCommand`) gets the selection as a whole (`IShellItemArray`): its count, and whether each
item is a file or a folder. Its `GetState` hides an item that does not fit; its `Invoke` gets the paths in one call.

### 3.2 The handler

- One handler for files and folders (registered under `*\shell` and `Directory\shell`, `ExplorerCommandHandler`), its
  class under `HKCU\Software\Classes\CLSID`, with the DLL next to LexPen.exe. Written by ExplorerMenu.Apply as the
  entries are now, removed by Remove.
- What it reads: LexPen's exe and the left side, from the same places the registry entries use now (the exe from a value
  ExplorerMenu writes with its registration, the left side from `compare-left.txt` in the state folder), each time the menu opens, so a left
  side selected a moment ago shows at once.
- The settings for the Explorer menu keep working: between two lines, or in a "LexPen" submenu (the handler's
  subcommands, `EnumSubCommands`).
- Left and right: the order Explorer gives the items (its selection order, not always the order they were clicked).
  The compare's Swap button puts them the other way round.

### 3.3 Building it

- C++ needs Visual Studio's "Desktop development with C++" tools; on this PC Visual Studio 2022 and 2026 are installed
  without them (vswhere, `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`: not found). They are to be added first.
- A project of its own in the solution (`LexPen.Shell`), built to `LexPenShell.dll`, x64, published next to the exe.
- Explorer keeps a loaded handler DLL open: a new LexPen cannot overwrite it while Explorer runs. The publish writes
  the DLL under a versioned name and the registration points at it; an older one is removed when no longer loaded.

### 3.4 Alternatives not taken

- **A handler in C# (.NET COM hosting).** No C++ tools needed, but Explorer would load the .NET runtime into its own
  process, and one process can hold only one .NET runtime: another program's .NET handler of another version would
  then fail, or LexPen's would.
- **Registry entries plus collecting** (the first version of this plan): one LexPen start per selected item, the
  running LexPen collecting them. Compare would also show with one item, and with three or more, and two quick
  starts are not a reliable way to tell a selection of two from two separate clicks.
- **A "Send to" shortcut.** It gets all selected items on one command line, but lives under Send to, and cannot hide
  itself for one or three items.

### 3.5 Windows 11

Like the other LexPen items: under "Show more options" (or Shift+right-click). The compact menu takes only handlers of
an app with a package identity (a signed package, or a sparse package next to the exe); the handler here is the part
that would need, but packaging is not in this plan.

### 3.6 Tests

- Unit (C#): ExplorerMenu writes and removes the handler's registration below the test registry root
  (`LEXPEN_REGISTRY_ROOT`), next to the remaining registry entries.
- Unit (C++ or through a small test exe): the handler's choice per selection: one file, one folder, two files, two
  folders, a file and a folder, three files; with and without a left side.
- By hand in Explorer: each of these selections, the items shown, and what each runs.

## 4. Open questions

1. Is adding the C++ tools to Visual Studio acceptable, or should the C# handler (3.4) be weighed again despite the
   runtime conflict?
2. A file and a folder selected together: no items (as above), or Compare, which then fails with a message?
