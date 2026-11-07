# Examples of LexPen's settings files

Files you can edit to change how LexPen looks. They are not read from this folder: LexPen reads them from
its data folder, `%LOCALAPPDATA%\LexPen\` (for example `C:\Users\<you>\AppData\Local\LexPen\`), the same
folder that holds `settings.json` and `session.json`. Paste that path into the Explorer address bar, or
into LexPen's Open > File... dialog, to get there.

## tab-colours.json

Colours for the tabs, by file name or path: the first rule that fits a tab's file styles it, with a
style for the day theme and one for the night theme, and a style of its own while the tab is the active
one. The file explains its own format in the comments at the top.

- **Where it goes:** `%LOCALAPPDATA%\LexPen\tab-colours.json`.
- **How it gets there:** LexPen writes this exact file there the first time it starts without one. The
  program carries it inside (it is built in from this folder), so this example and what LexPen writes are
  always the same.
- **After that** the file in the data folder is yours: LexPen never changes it. To start again from the
  default, delete it (or copy this one over it) and restart LexPen.
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
