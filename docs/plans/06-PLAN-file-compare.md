# Plan: Compare two files, or two folders

Status: plan 2026-10-22, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

LexPen scrolls two panes together (View > Scroll both panes together) and shows git changes in the gutter, but it
cannot compare two files: no highlighted differences, no next / previous difference, no way to start a compare from
the command line. It cannot compare two folders either. UltraEdit has UltraCompare, Visual Studio has Compare Files.

## 2. The solution, in brief

Two files are compared side by side in the two panes: differing lines tinted, the changed characters marked, filler
lines keeping both sides level, F7 / Shift+F7 through the differences. A compare bar above the panes has the
options at hand: ignore whitespace, ignore case, and Align, which ties the cursor line of the left file to the
cursor line of the right one so the lines are compared from there on. Two folders are compared in the folder pane:
one tree of both, each file marked as equal, different, or only on one side; first quickly by size and date, then
by contents in the background. A double click on a file there compares it. `LexPen.exe --compare A B` starts
either, for two files or two folders.

## 3. Details

### 3.1 Starting a compare

- Command line: `LexPen.exe --compare <A> <B>` (or `-c`): two files, or two folders. A running LexPen gets it
  through its pipe as now (the message gets a `compare` field) and opens the compare in a new window, so it does not
  mix with the tabs of a window in use. `--compare` with anything else than two existing files or two existing
  folders: a message saying what was expected.
- In the app:
  - A tab's right-click: Compare with... (a file picker), Compare with the tab in the other pane, Compare with the
    saved file (the tab has unsaved changes).
  - The folder pane: two files selected (Ctrl+click), right-click: Compare. A folder's right-click: Compare with
    folder... (a folder picker).
  - File > Compare files... and File > Compare folders... (two pickers each).
- Compare with a git version (the last commit, a branch) is not part of this plan: it is plan 26
  (`26-PLAN-git-compare.md`), built on this compare.

### 3.2 How a file compare looks

```
+-------------------------------------------------------------------------------------------+
| Compare  n of m   [<] [>]   [x] Ignore whitespace  [ ] Ignore case   [Align]  [Swap]  [x]  |
+---------------------------------------------+---------------------------------------------+
| A: C:\work\old\report.sql                   | B: C:\work\new\report.sql                   |
|  10  SELECT id, name                        |  10  SELECT id, name                        |
|  11  FROM customer                          |  11  FROM customer                          |
|  12 -WHERE active = 1          (removed)    |      . . . . . . . . . . . . (filler)       |
|  13 ~ORDER BY name             (changed)    |  12 ~ORDER BY name, id         (changed)    |
|      . . . . . . . . . . . . (filler)       |  13 +GROUP BY region           (added)      |
+---------------------------------------------+---------------------------------------------+
| A 13  ORDER BY name                                                                       |
| B 12  ORDER BY name, id                                                                   |
|                     ^^^^ (the characters that differ, marked)                             |
+-------------------------------------------------------------------------------------------+
```

- The two files take the two panes, side by side, each as a normal tab: editable, saved as usual. The tabs that
  were there stay behind them; leaving compare (the [x] on the bar, or closing either tab) puts the panes back as
  they were (orientation, which tab was active).
- Colours: the theme's git colours (gitAdded, gitDeleted, gitModified) as line backgrounds, tinted; inside a changed
  line the changed characters a stronger tint. A filler line (a CodeMirror line widget) where the other side has
  lines this side lacks, so lines that match stay level.
- The panes scroll together line for line (the matching lines side by side, the fillers counted).
- The line strip, at the bottom over the full width of both panes: the cursor line of the active pane and its
  matching line of the other pane, one above the other, A on top. Character under character in the editor's font,
  so a difference stands out by eye too; the differing characters marked as in the panes. A long line scrolls
  sideways in the strip, both rows together, kept with the cursor. A line with no match on the other side (added or
  removed): that row says "(none)". Both rows are read-only; a click on a row puts the cursor of that pane there.
  Whitespace shows as in the editor's special characters (a dot for a space, an arrow for a tab), so a difference in
  spaces or tabs is visible. View > Line strip turns it off and on (kept).
- The overview: a mark per difference in the strip next to each scroll bar, the overview ruler of plan 11 (built: a kind
  `overview.compare` next to the others); a click there goes to it.
- Navigation: F7 / Shift+F7 the next / previous difference, the count on the bar ("n of m"; "No differences" when
  equal, "Equal apart from whitespace" when the option hides them all).
- Copy across: in a difference, Alt+Right copies the left side's lines over the right side's, Alt+Left the other way
  (on the bar too, as arrows when the cursor is in a difference). Undo undoes it.
- Edits recompare a moment after typing stops (300 ms).
- Swap: left and right change places.

### 3.3 The options

- On the bar, so they are found at once, and kept (settings, as the find switches): Ignore whitespace (spaces and
  tabs: their amount inside a line and all of them at the start and end; an empty line against a missing one),
  Ignore case. Line endings (LF / CRLF) are never a difference; a bottom bar note says when they differ.
- An option changes the comparison at once; the lines keep their own text, only what counts as equal changes.

### 3.4 Align (recalibrate)

- The cursor on a line in the left file, the cursor on a line in the right file, then Align (on the bar, or
  Ctrl+F7): those two lines are tied. From the tie on the comparison starts again with those two lines as each
  other's match; what lies before is compared on its own. So a block moved or rewritten does not drag the rest out
  of step.
- Several ties are possible; each shows as a link mark in both gutters. A right-click on one: Remove this tie;
  the bar's Align menu: Remove all ties.
- A click on a line, then a click on a line in the other pane, is all it takes: each pane keeps its own cursor, so
  there is no special mode. The bar's Align button is enabled when both panes have a cursor.
- Ties move with edits (marks on the lines), and are kept as long as the compare is open.

### 3.5 How a folder compare looks

```
+--------------------------------------------------+
| Compare  C:\work\old  <->  C:\work\new       [x] |
| Show: (o) All  ( ) Differences only              |
| Checking contents... n of m        [Stop]      |
+--------------------------------------------------+
|  v src                                     ~     |
|      a.cs                                  =     |
|      b.cs                                  ~     |
|      c.cs                                  <     |
|      d.cs                                  >     |
|      e.cs                                  ?     |
|  > docs                                    =     |
+--------------------------------------------------+
   =  equal          ~  different          ?  not checked yet (same size, other date)
   <  only in A      >  only in B
```

- The folder pane switches to compare mode: one tree with the files and folders of both, the base row showing
  both paths. The [x] goes back to the folder pane as it was.
- A folder's mark sums up what is inside it: equal when all is equal, else different.
- First pass, by attributes, fast: the host lists both trees (names, sizes, dates). A file in one only: `<` or `>`.
  Other size: different at once (the contents cannot be equal). Same size and same date (within 2 seconds, as
  FAT keeps time): equal for now. Same size, other date: `?`, the contents decide.
- Second pass, by contents, in the background: the host compares the `?` files byte by byte (streamed, a file at a
  time, the progress on the pane, Stop ends it). A file found equal by contents is shown as equal; its row says
  "same contents, other date" in the tooltip. With Ignore whitespace or Ignore case on, a text file that differs in
  bytes is compared again as text with those options.
- The pane's own right-click in compare mode: Check contents of all (also the files that look equal by attributes),
  Compare (the file pair, as a double click), Refresh.
- Read-only for now: the folder compare changes nothing on disk (no copying, deleting or renaming files). Within a
  file compare the files are edited and saved as usual.
- The tree's rows are as in the folder pane (expand, keys); Enter or a double click on a file pair opens the file
  compare (3.2); on a file in one side only it opens that file.
- Show: Differences only hides the equal rows (a folder stays when something inside differs).

### 3.6 Keys and actions

| Action | Keys | Does |
|---|---|---|
| `compareNext` / `comparePrevious` | F7 / Shift+F7 | The next / previous difference |
| `compareAlign` | Ctrl+F7 | Tie the two cursor lines (3.4) |
| `compareCopyRight` / `compareCopyLeft` | Alt+Right / Alt+Left while comparing | The difference at the cursor to the other side |
| `compareWith` | | Compare with... (tab) |
| `compareFiles` / `compareFolders` | | File menu |
| `compareClose` | | Leave compare |
| `compareIgnoreWhitespace.toggle`, `compareIgnoreCase.toggle` | | The options |

- F7, Shift+F7 and Ctrl+F7 are free in keys.json. Alt+Left / Alt+Right are the tab keys outside a compare; inside
  one, with the cursor in a difference, they copy across (the bar shows it).

### 3.7 Where it lives

- `web/compare.js`: the compare bar, the line strip, the marks and fillers, scrolling together, navigation, ties, the folder pane's
  compare mode.
- `web/diff.worker.js`: the line diff (Myers, as git; `diffLines` of gutter.js, which the change and git markers use,
  moved where both can use it) per stretch between ties, with a character diff inside
  changed line pairs; the options applied as a key per line (the line with its whitespace squeezed, lower case), so
  the text itself is untouched. Large files never block typing.
- The host (`FolderCompare.cs`): both trees listed, the content check streamed in the background with events to the
  page (`compareRow`, `compareProgress`), cancellable. `Program.ParseArgs` reads `--compare`.

### 3.8 Tests

Unit (the host): `ParseArgs` with `--compare` (two files, two folders, wrong counts); the folder listing and the
first pass (only in A / B, other size, same size and date, same size other date); the content pass (equal bytes with
another date, different bytes, Stop).

In-app:

- The line strip: the cursor line and its match one above the other, the differing characters marked; a removed
  line shows "(none)"; a long line scrolls both rows together; a click on a row moves that pane's cursor.
- Two files with added, removed and changed lines: the tints, the fillers, the lines level, the changed characters.
- F7 through all differences and back with Shift+F7; the count.
- Ignore whitespace: a line with other indentation counts as equal; Ignore case likewise.
- Align: a moved block with ties: the lines after the tie match.
- Copy across, and Undo.
- An edit recompares.
- Compare with the saved file; with the other pane's tab.
- Leaving compare: the panes as before.
- Folder compare: both passes, the marks, Differences only, a double click opening the file compare, Stop.
- `--compare` with two files and with two folders, also to a running LexPen (a new window).

## 4. Open questions

None.
