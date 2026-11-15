First public release of **LexPen**: a fast, intuitive and flexible text and code editor for Windows 10/11 (x64), with a built-in viewer.

For the full feature overview, see the [README](https://github.com/ArcoW2/LexPen#readme) and [docs/features.md](https://github.com/ArcoW2/LexPen/blob/main/docs/features.md).

## Highlights

- **Editor and preview**, side by side or either alone: rich markdown (footnotes, task lists, math, Mermaid diagrams) and code coloured as in the editor.
- **Editing**: multiple cursors, column mode, word completion, reformat, conversions, macros, nine clipboards next to the Windows one.
- **Finding**: find, replace and search in files; bookmarks; highlights with notes; an outline of headings, procedures and classes.
- **Compare** two files or two folders, also from Explorer's right-click menu.
- **Files and folders**: a folder sidebar with git status, favourites, drafts kept across restarts, encodings kept, a backup on save, a hex view.
- **Tabs, panes, windows and projects**: two panes, more windows, each project keeps its folder, tabs and place.
- **Language packs and themes**: many languages and themes, your own added; follows Windows' light / dark mode.
- **Every key can be changed**; F1 lists every action with its key.

## Install

1. Download `LexPen-1.0.693-win-x64.zip` and extract it to any folder you can write to (for example `C:\Apps\LexPen`).
2. Run `LexPen.exe`. Settings are kept in `%LOCALAPPDATA%\LexPen`, not next to the exe.

Needs the [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/10.0) (x64) and the Microsoft Edge WebView2 Runtime (included with Windows 11). No installer.

**Unsigned:** Windows SmartScreen may show "Windows protected your PC" on first start. Click *More info* > *Run anyway*, or tick *Unblock* in the zip's Properties before extracting.

## Verify the download

SHA-256 of `LexPen-1.0.693-win-x64.zip`:

```
298BA587D3A584B7CE420A9A5B124E1657EC5917C2278EEE9AEBBB9783AA6218
```

PowerShell: `Get-FileHash .\LexPen-1.0.693-win-x64.zip -Algorithm SHA256`

---

Copyright (c) 2026 Arco Witter. Released under the [MIT License](https://github.com/ArcoW2/LexPen/blob/main/LICENSE).
Like LexPen? [Support me on Ko-fi](https://ko-fi.com/arcowitter).
