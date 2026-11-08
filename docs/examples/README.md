# Examples

Files to try LexPen with; none of them is part of the program.

## tab-colours.json (in src\defaults\user)

Not here any more: `src\defaults\user\tab-colours.json`, with the other files LexPen writes into its data folder
(`%LOCALAPPDATA%\LexPen\`, for example `C:\Users\<you>\AppData\Local\LexPen\`, the folder that holds `settings.json`
and `session.json`). Colours for the tabs, by file name or path: the first rule that fits a tab's file styles it, with
a style for the day theme and one for the night theme, and a style of its own while the tab is the active one. The
file explains its own format in the comments at the top.

- **Where it goes:** `%LOCALAPPDATA%\LexPen\tab-colours.json`.
- **How it gets there:** LexPen writes this exact file there the first time it starts without one. The program
  carries it inside (built in from `src\defaults\user`), so that file and what LexPen writes are always the same.
- **After that** the file in the data folder is yours: LexPen never changes it. To start again from the default,
  delete it (or copy the one next to LexPen.exe, in `defaults\user`, over it) and restart LexPen.
- **Changes** apply as soon as the file is saved, in every LexPen window. A file with a mistake keeps the
  last rules that worked, and LexPen shows what is wrong.

## print-tables.md

A markdown file to try the Print window with (File > Print..., As: Rendered): a table too wide for a page
(printed smaller; the columns that still do not fit are left out, and a line says how many) and a table too
long for a page (its header row repeated on every page it goes on to). It is not a settings file: open it
from here.

## embedded-languages.md

A markdown file with code blocks in other languages (C#, Delphi, SQL, JavaScript, Python, PowerShell, shell,
batch, JSON, XML, YAML, CSS, HTML with a script and a style inside, plain text): each block coloured as its own
language in the editor, the preview and the Print window. It is not a settings file: open it from here.

## definitions-sql and definitions-languages

Folders to try Go to definition with (F12: in the other pane; Alt+F12: in this tab; Ctrl+F12: in a new tab;
Shift+F12: Find references). Open the folder in the Folder pane, open the file at the top and press F12 on a name.

- **definitions-sql**: `main.sql` calls procedures defined two folders down. `call proc_name` finds two definitions
  (`create procedure proc_name` and `create or replace procedure dba.proc_name`): a list, the one without an owner
  first; with the cursor on `dba` of `dba.proc_name` the `dba.` one comes first. `"dba"."other_proc"` (quoted) and the
  table `orders` are found too; `missing_one` is not (a message says so); the region `//--- proc_name` in procs.sql is
  no definition.
- **definitions-languages**: a definition in `lib` and its use one folder up, for C# (`Picker`, `p.Pick`,
  `Orders.Picker.Pick`), JavaScript (a function, an arrow function, a class), Python (a method, a function), Pascal
  (`TInvoice.Total`: its declaration and its implementation, names without regard to case) and PowerShell
  (`Get-OrderLines`, with its dash, any case).

## demo.md

A markdown file that shows what the preview renders: headings, lists, tables, code, formulas, diagrams and more.
