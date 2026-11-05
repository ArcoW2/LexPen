# Plan 40: Compare two items selected in Explorer

## 1. The enhancement

With two files (or two folders) selected in Windows Explorer, the right-click menu should have **Compare**, which
opens the Compare project with the two items left and right. Today this takes two steps: "Select left side to
compare" on one, then "Compare to <name>" on the other (docs/plans/executed/PLAN-explorer-compare.md).

## 2. The solution, in brief

A new Explorer entry, Compare, on files and folders. Explorer starts LexPen once per selected item. Each start hands
its item to the running LexPen over the existing single-instance pipe, and LexPen collects the items that arrive
close together. Two items open a compare, as `--compare` does, in the Compare project. A single item becomes the left
side, as "Select left side to compare" does, so the next Compare on one item compares with it. More than two give a
message. The entry is one more choice in the Explorer menu settings, next to the existing ones.

## 3. Details

### 3.1 Why one start per item

An Explorer entry made of registry keys (the kind LexPen uses now) runs its command once for every selected item,
each with its own `%1`. Explorer has no way to hand both paths to one command line from such an entry, and no way to
show the entry only when exactly two items are selected. So LexPen sees the selection as separate starts, and the
entry also shows with one item selected (hence the single-item fallback in section 2).

### 3.2 Collecting the starts

- `LexPen.exe --compare-pick "%1"`: the process sends the path to the running instance through the pipe it already
  uses for opening files (Program.Send), then exits. With no LexPen running, the first one to start becomes the
  instance and collects the others.
- The instance waits a short time after the first item for more to arrive, then acts on what it has: two items ->
  compare, one -> left side, more -> "Select two files or two folders to compare." The wait is a setting in code,
  not a user setting; its value is [not yet measured]: it has to cover how fast Explorer starts the second process.
- A file and a folder together: the same message as for more than two.

### 3.3 Left and right

Explorer does not guarantee the order in which it starts the processes, so which item lands left is not certain.
The plan puts them in the order they arrive. See open question 1.

### 3.4 Alternatives not taken

- **A shell extension (IExplorerCommand, a COM handler).** It receives all selected items in one call and can show
  Compare only for exactly two. But it runs inside Explorer as a registered COM component; that is a native or
  packaged component of its own, a much larger project. It would also be the way into Windows 11's compact menu
  (PLAN-explorer-compare.md 3.4).
- **A "Send to" shortcut.** Send to passes all selected items on one command line, so no collecting is needed, but it
  lives under Send to, not as a menu item of its own.

### 3.5 Windows 11

Like the other LexPen entries: under "Show more options" (or Shift+right-click), not in the compact menu.

### 3.6 Tests

- Unit: the entry written and removed below the test registry root (`LEXPEN_REGISTRY_ROOT`), and its label.
- Unit: the collector: two paths -> compare, one -> left side, three -> message, a file with a folder -> message.
- In the app: two files and two folders selected in Explorer, Compare, the compare opens; one file, Compare, then
  Compare on another file.

## 4. Open questions

1. When the order of left and right comes out the other way round: is a swap in the compare (if it has none yet)
   enough, or should the order be fixed in another way (for example, the older file left)?
2. Should Compare replace "Select left side to compare" / "Compare to <name>" in the menu (its single-item fallback
   covers them), or sit next to them?
