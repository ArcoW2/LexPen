# Plan: a src folder for everything LexPen is built from

Status: executed (2026-11-08); see As built.

## 1. What this is about

The project's top folder mixes what LexPen is built from (the C# files, LexPen.csproj, `web`, `defaults`, `img`,
`shell`, the vendor script and npm files) with what is not (`docs`, `tests`, README, LICENSE, HANDOFF). One build
input even lives in `docs`: `docs\examples\tab-colours.json` is embedded in the exe. And the build compiles every
`.cs` below it, so a C# example in `docs` broke publishing (now worked around: `docs` is left out of the build).

## 2. The solution, in brief

Everything LexPen is built from moves into a folder `src`: the C# files, LexPen.csproj with its Properties, `web`,
`defaults`, `img`, `shell`, `vendor.ps1`, `package.json` and its lock file. `tab-colours.json` leaves
`docs\examples` for `src\defaults\user`: the defaults LexPen writes into your data folder. `tests` (not
published) and `docs` stay at the top, beside `src`, with a solution file for both projects, README, LICENSE, HANDOFF
and the git files; demo.md goes to `docs\examples`. The moves are made with git so the history follows the files;
then the few paths that point across folders are corrected.

## 3. Details

### 3.1 The folders after

```
LexPen\
  src\        LexPen.csproj, *.cs, Properties\, web\, defaults\ (defaults\user\tab-colours.json among them),
              img\, shell\, vendor.ps1, package.json, package-lock.json
  tests\      LexPen.Tests\ (as now)
  docs\       plans, examples (the samples only, demo.md among them), features.md, ...
  LexPen.sln  both projects (src\LexPen.csproj, tests\LexPen.Tests\LexPen.Tests.csproj)
  README.md, LICENSE, HANDOFF.md, .gitignore, .gitattributes, .claude\
```

### 3.2 What changes with the move

- **LexPen.csproj**: its paths are relative to itself and move with it (`web\**`, `defaults\**`, `img\...`,
  `shell\build.cmd`); only `docs\examples\tab-colours.json` becomes `defaults\user\tab-colours.json`. The
  workaround that leaves `docs` out of the build is no longer needed (docs is no longer below the project) and goes.
- **tests\LexPen.Tests\LexPen.Tests.csproj**: its reference becomes `..\..\src\LexPen.csproj`. The tests stay
  out of `src`: they are not published.
- **LexPen.sln** (new, at the top): both projects, so Visual Studio opens the whole of it from the top folder
  (`dotnet sln add`); `dotnet build` and `dotnet test` at the top build and test both.
- **defaults\user**: the files LexPen writes into your data folder (`%LOCALAPPDATA%\LexPen`) when it finds none
  there; after that the copy there is yours and LexPen never changes it. Now only `tab-colours.json` (TabColourFile:
  written the first time it is read). They are embedded in the exe, so LexPen has them wherever it is installed, and
  copied next to it with the rest of `defaults`, to read. TabColourFile's comment names the new place.
- **What is embedded in the exe** (LexPen.csproj, EmbeddedResource): `web\**` (the pages), the icon (`img\icon`,
  as app.ico) and `defaults\user\tab-colours.json` (written to the data folder the first time LexPen starts without
  one). `defaults`
  is not embedded: it is copied next to the exe.
- **Finding `defaults` in a debug build**: AppHost.FindProjectFolder walks up from `bin` to the folder that has it;
  with `bin` under `src` it finds `src\defaults`.
- **vendor.ps1** and **shell\build.cmd** use paths relative to themselves (`$PSScriptRoot`, `%~dp0`): unchanged.
  `node_modules` (not in git) is made again in `src` by `npm install` when a library is upgraded.
- **The publish profile** (`Properties\PublishProfiles`, not in git: yours) moves along with Properties; its target
  (`C:\Win32App\LexPen`) is absolute and stays right.
- **bin and obj** are made again under `src`; the old ones at the top can be deleted (.gitignore already ignores them
  anywhere).
- **docs\examples\README.md**: its tab-colours.json section points to `src\defaults\user\tab-colours.json` and
  says, as now, that LexPen writes it to the data folder; demo.md gets a line there.
- **Visual Studio** opens `LexPen.sln` (or `src\LexPen.csproj`) from then on.
- **Paths in the docs and in code comments** that name a file with its folder from the top (`web\app.js`, `defaults\`)
  stay right: they are relative to `src` then, which the docs say once (README). Plans in `docs\plans\executed` are a
  record and are not edited.
- **.claude** (the plans skill, settings): nothing in it names a source path [checked by a search, before and after the move].

### 3.3 Tests

- Before and after: the build, the 394 unit tests, a Release publish (`LexPen.exe`, with `web\` and
  `tab-colours.json` inside it), the test copy started from `src\bin\Debug` (it finds `src\defaults`), the shell DLL
  built by the post-build step.
- `git log --follow` on a moved file still shows its history.

## 4. Open questions

None.

## 5. As built

- As planned, with one change in the code: **AppHost.FindProjectFolder** also stops at a folder with
  `src\LexPen.csproj` (and returns the folder in `src`). The tests run from `tests\LexPen.Tests\bin`, beside `src`,
  and walking up from there found no LexPen.csproj any more, so the tests that read `web` files failed. The app
  itself (bin under `src`) still finds `src` first.
- `web` could only be moved after a background test of mine had been stopped: it held a handle in `web`.
- HANDOFF.md: the test command, `src\web` and `src\vendor.ps1`.
- Tested: `dotnet build` at the top (both projects), `dotnet test` (394 passed), a Release publish (LexPen.exe,
  LexPenShell.dll, WebView2Loader.dll, defaults; the assembly's resources hold `tab-colours.json`, `app.ico` and
  `web\...`), the test copy from `src\bin\Debug` on an empty data folder (the page starts, it writes
  `tab-colours.json` equal to `src\defaults\user\tab-colours.json`), and `git log --follow` on a moved file.
- The old `bin` and `obj` at the top are left; they can be deleted.