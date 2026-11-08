# Examples

Files to try LexPen with, in a folder per type (markdown, csv, sql, json, pdf, text); none of them is part of the
program.

## markdown\print-tables.md

A markdown file to try the Print window with (File > Print..., Source: Rendered): a table too wide for a page
(printed smaller; the columns that still do not fit are left out, and a line says how many) and a table too
long for a page (its header row repeated on every page it goes on to). It is not a settings file: open it
from here.

## markdown\embedded-languages.md

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

## markdown\demo.md

A markdown file that shows what the preview renders: headings, lists, tables, code, formulas, diagrams and more.

## csv

CSV files to try the columns view with (and the Print window):

- **regular.csv**: a small order list with the common column types (integer, text, date, decimal, true/false).
- **long.csv**: stock movements, a very long file (200000 rows).
- **wide.csv**: a column per week of two years plus totals, too wide for a window or a page.
- **line-breaks.csv**: quoted fields with line breaks inside: LF, CRLF, a lone CR, several in one field, an empty
  line, a break at the end of a field, and quotes and commas inside too. The rows themselves end with CRLF.