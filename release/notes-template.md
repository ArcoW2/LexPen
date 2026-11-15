<!--
Release notes template. Copy to notes-<version>.md, fill in, paste into GitHub's
"Describe this release". Replace every {PLACEHOLDER}; drop sections that do not apply.
- {VERSION}  new version, for example 1.0.700 (1.0.<git commit count>, see the README's Versioning)
- {PREVIOUS} previous published version
- {SHA256}   from LexPen-{VERSION}-win-x64.zip.sha256
Describe only what changed since {PREVIOUS}; the full overview stays in the first release
and the README. Keep the fixed parts (overview link, install, unsigned note, verify, footer).
This comment is not shown by GitHub, but delete it anyway.
-->
{One-line summary, for example: Small update to {PREVIOUS}.}

For the full feature overview, see the [README](https://github.com/ArcoW2/LexPen#readme) and [docs/features.md](https://github.com/ArcoW2/LexPen/blob/main/docs/features.md).

## Changes

- {Change, user's point of view: what is new or fixed, where to find it.}

{Compatibility line, for example: No changes to settings; your settings from {PREVIOUS} work as-is.}

## Install / update

Download `LexPen-{VERSION}-win-x64.zip`. Close LexPen, delete the old files in its folder (not `%LOCALAPPDATA%\LexPen`: your settings stay there), and extract the zip into it, or into any folder you can write to.

Needs the [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/10.0) (x64) and the Microsoft Edge WebView2 Runtime (included with Windows 11).

**Unsigned:** Windows SmartScreen may show "Windows protected your PC" on first start. Click *More info* > *Run anyway*, or tick *Unblock* in the zip's Properties before extracting.

## Verify the download

SHA-256 of `LexPen-{VERSION}-win-x64.zip`:

```
{SHA256}
```

PowerShell: `Get-FileHash .\LexPen-{VERSION}-win-x64.zip -Algorithm SHA256`

---

Copyright (c) 2026 Arco Witter. Released under the [MIT License](https://github.com/ArcoW2/LexPen/blob/main/LICENSE).
Like LexPen? [Support me on Ko-fi](https://ko-fi.com/arcowitter).
