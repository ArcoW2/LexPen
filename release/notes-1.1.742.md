**LexPen as a previewer**: Explorer's preview pane, Outlook's attachments and file managers such as Foldex and Xplorer2 can now show your files in LexPen. Hence the new minor version, 1.1.

For the full feature overview, see the [README](https://github.com/ArcoW2/LexPen#readme) and [docs/features.md](https://github.com/ArcoW2/LexPen/blob/main/docs/features.md) (new section: [LexPen as a previewer](https://github.com/ArcoW2/LexPen/blob/main/docs/features.md#lexpen-as-a-previewer)).

## New: LexPen as a previewer

- **Shows files inside other programs**: Explorer's preview pane, Outlook's attachments, Foldex, Xplorer2 and other programs that show previews. Markdown rendered, code in its language's colours, read-only.
- **Find, bookmarks, highlights and notes** work there, and are kept with the file as in LexPen (not for an Outlook attachment, which has no file: the status bar says so). The next preview of a file opens where you were.
- **Its own ribbon tabs** (Preview; View and file), its own day / night and themes, the source next to the preview (read-only), Hex, Print, and **Edit...**, which opens the file in LexPen.
- **Keys**: a key the previewer does not use goes to the program it is in; Esc closes the preview in Foldex and Xplorer2.
- **Set it up** in Settings > General > Previewer > LexPen as a previewer: Not registered, For the current user only (the default), or For everyone on this computer (Outlook needs this; Windows asks for administrator rights). Which file types Explorer previews in LexPen: Settings > App > Windows Explorer > File types..., the Preview column.

## Other changes

- **File types**: a Preview column, and a line below the table to change several selected rows at once (press Change on a setting, then Apply to selected). The dialog grows with the Settings window.
- **Fonts**: a font setting's "..." opens a window with every font drawn in itself, a filter, Monospaced only, and a preview with your own text.
- **Changed drafts on close**: a setting to ask, keep them as drafts, or delete them (Settings > Files).
- **Macros**: a line ending in `\` goes on on the next line; an error keeps its line; Esc also stops a macro that redraws the screen only every N steps.
- **Menus**: a menu a button opened closes with a second click on that button.
- **Ribbon**: a button whose list has nothing possible is greyed out; a button without a label shows its name in the ">>" list.
- **Fixed**: comparing two Word files (shown as Hex) now stops at once with a message, instead of failing on close; Remove highlight from the preview's right-click menu now removes the highlight there; Tab goes through a question's buttons in order.

Your settings from 1.0.693 work as-is: Ask to save changed drafts becomes the new choice (on: ask, off: keep). A ribbon.json of your own gets the new preview tabs added. LexPen registers itself as a previewer for the current user at its first start; to stop that, choose Not registered.

## Install / update

Download `LexPen-1.1.742-win-x64.zip`. Close LexPen, delete the old files in its folder (not `%LOCALAPPDATA%\LexPen`: your settings stay there), and extract the zip into it, or into any folder you can write to.

Needs the [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/10.0) (x64) and the Microsoft Edge WebView2 Runtime (included with Windows 11).

**Unsigned:** Windows SmartScreen may show "Windows protected your PC" on first start. Click *More info* > *Run anyway*, or tick *Unblock* in the zip's Properties before extracting.

## Verify the download

SHA-256 of `LexPen-1.1.742-win-x64.zip`:

```
35D47D402F6CA6E277E491D92E4A1E36868AFD6F26FC615B7FF904623A8A2E86
```

PowerShell: `Get-FileHash .\LexPen-1.1.742-win-x64.zip -Algorithm SHA256`

---

Copyright (c) 2026 Arco Witter. Released under the [MIT License](https://github.com/ArcoW2/LexPen/blob/main/LICENSE).
Like LexPen? [Support me on Ko-fi](https://ko-fi.com/arcowitter).
