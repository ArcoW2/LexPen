**Macros grow up**: messages and questions, several editor keys in one step, the language by name, and the CSV column definition from a macro. Hence the new minor version, 1.2. Also: copy CSV cells as a Markdown table, a JSON outline, and the outline in the previewer.

For the full feature overview, see the [README](https://github.com/ArcoW2/LexPen#readme) and [docs/features.md](https://github.com/ArcoW2/LexPen/blob/main/docs/features.md).

## New in macros

- **Talk to the user**: `message` shows a short note and goes on, `messagebox` waits for OK, and `ask $var` shows the macro's own buttons and puts the one pressed into the variable.
- **Editor keys**: `editorKey` takes several keys in turn, and `"Right*3"` presses a key three times. Recording writes a run of editor keys as one such step.
- **Language by name**: `setLanguage "csv"` sets the active document's language by its name, id or alias, without the list.
- **CSV definition**: `csv.delimiter`, `csv.firstDataLine`, `csv.header`, `csv.quote`, `csv.escape`, `csv.column` and `csv.columnOrder` set up a CSV or other column file's view. Changes you make in the Columns window while recording are written as these steps.
- **Switching documents**: while a macro runs, `previousActive` and show recent pass the macros' own tabs, and come back to the document the macro started on.
- **Step by step**: Step, Step into and Continue start the macro again after it ended or was stopped (also F10 from the document).
- **Reference**: a Reference button in the macro bar, the Macros panel and Step by step; F1 in a macro's tab opens the reference.
- An action takes a negative number as its argument (`stepTab -1`).

## Other changes

- **CSV view**: Shift+arrow keys or Shift+click select a block of cells. Right-click > Copy as Markdown table copies it (or the whole table) as a lined-up pipe table. The Columns window says "First data line", counted from 1.
- **JSON outline**: the keys of objects and arrays. In any language, Go and Select can go to or select the `{ }` block around the cursor; again for the block around that.
- **Pascal outline**: by section (interface, implementation, ...), without the methods declared inside a class or record.
- **Previewer**: the outline docked at the right, open or closed kept per language. With the preview alone, the outline follows the preview's cursor, and a click on an entry places the cursor there. The focus goes to the preview once the file is shown.
- **Docking**: hold Shift while dragging a panel (its tab, or its floating window by the title bar) to let it float without docking anywhere.
- **Window title**: the active document's name, then the project: `readme.md in Work - LexPen`.
- **Fixed**: column mode paste with the cursor past the end of the line goes in at that column, not at the line's end; a previewer window closed while it starts no longer shows an error.

No changes to settings; your settings from 1.1.742 work as-is.

## Install / update

Download `LexPen-1.2.779-win-x64.zip`. Close LexPen, delete the old files in its folder (not `%LOCALAPPDATA%\LexPen`: your settings stay there), and extract the zip into it, or into any folder you can write to.

Needs the [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/10.0) (x64) and the Microsoft Edge WebView2 Runtime (included with Windows 11).

**Unsigned:** Windows SmartScreen may show "Windows protected your PC" on first start. Click *More info* > *Run anyway*, or tick *Unblock* in the zip's Properties before extracting.

## Verify the download

SHA-256 of `LexPen-1.2.779-win-x64.zip`:

```
5F4E3C7CFFAA7CE0C8BFA14D829BDE37952E1F0AE2FD98846D466C0A922AFB1D
```

PowerShell: `Get-FileHash .\LexPen-1.2.779-win-x64.zip -Algorithm SHA256`

---

Copyright (c) 2026 Arco Witter. Released under the [MIT License](https://github.com/ArcoW2/LexPen/blob/main/LICENSE).
Like LexPen? [Support me on Ko-fi](https://ko-fi.com/arcowitter).
