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
