# Plan: a src folder for everything LexPen is built from

Status: draft 2026-11-08; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

The project's top folder mixes what LexPen is built from (the C# files, LexPen.csproj, `web`, `defaults`, `img`,
`shell`, the vendor script and npm files) with what is not (`docs`, `tests`, README, LICENSE, HANDOFF). One build
input even lives in `docs`: `docs\examples\tab-colours.json` is embedded in the exe. And the build compiles every
`.cs` below it, so a C# example in `docs` broke publishing (now worked around: `docs` is left out of the build).

## 2. The solution, in brief

Everything LexPen is built from moves into a folder `src`: the C# files, LexPen.csproj with its Properties, `web`,
`defaults`, `img`, `shell`, `vendor.ps1`, `package.json` and its lock file, and `tab-colours.json` from `docs\examples`.
`docs` and `tests` stay at the top, beside `src`, with README, LICENSE, HANDOFF and the git files. The moves are made
with git so the history follows the files; then the few paths that point across folders are corrected.

## 3. Details

### 3.1 The folders after

```
LexPen\
  src\        LexPen.csproj, *.cs, Properties\, web\, defaults\, img\, shell\, vendor.ps1, package.json, package-lock.json,
              tab-colours.json
  tests\      LexPen.Tests\ (as now)
  docs\       plans, examples (the samples only), features.md, ...
  README.md, LICENSE, HANDOFF.md, demo.md, .gitignore, .gitattributes, .claude\
```

### 3.2 What changes with the move

- **LexPen.csproj**: its paths are relative to itself and move with it (`web\**`, `defaults\**`, `img\...`,
  `shell\build.cmd`); only `docs\examples\tab-colours.json` becomes `tab-colours.json`. The workaround that leaves
  `docs` out of the build is no longer needed (docs is no longer below the project) and goes.
- **tests\LexPen.Tests\LexPen.Tests.csproj**: its reference becomes `..\..\src\LexPen.csproj`.
- **Finding `defaults` in a debug build**: AppHost.FindProjectFolder walks up from `bin` to the folder that has it;
  with `bin` under `src` it finds `src\defaults`. [not yet checked in the test copy]
- **vendor.ps1** and **shell\build.cmd** use paths relative to themselves (`$PSScriptRoot`, `%~dp0`): unchanged.
  `node_modules` (not in git) is made again in `src` by `npm install` when a library is upgraded.
- **The publish profile** (`Properties\PublishProfiles`, not in git: yours) moves along with Properties; its target
  (`C:\Win32App\LexPen`) is absolute and stays right. Visual Studio opens `src\LexPen.csproj` from then on.
- **bin and obj** are made again under `src`; the old ones at the top can be deleted (.gitignore already ignores them
  anywhere).
- **docs\examples\README.md**: tab-colours.json is described where it is then (src) and that LexPen writes it to the
  data folder, as now.
- **Paths in the docs and in code comments** that name a file with its folder from the top (`web\app.js`, `defaults\`)
  stay right: they are relative to `src` then, which the docs say once (README). Plans in `docs\plans\executed` are a
  record and are not edited.
- **.claude** (the plans skill, settings): nothing in it names a source path [checked by a search; checked again
  after the move].

### 3.3 Tests

- Before and after: the build, the 394 unit tests, a Release publish (`LexPen.exe`, with `web\` and
  `tab-colours.json` inside it), the test copy started from `src\bin\Debug` (it finds `src\defaults`), the shell DLL
  built by the post-build step.
- `git log --follow` on a moved file still shows its history.

## 4. Open questions

1. A solution file (`LexPen.sln`) at the top, with both projects (LexPen and its tests), so Visual Studio opens the
   whole thing from the top folder? Without it you open `src\LexPen.csproj`, as you open LexPen.csproj now.
2. `demo.md` (a markdown demo at the top): to `docs\examples`, or does it stay at the top?
3. `tab-colours.json`: in `src` itself, or in `src\defaults` with the other files you may read and copy? In
   `defaults` it would also be copied next to the exe like the rest of that folder (LexPen reads it from the exe
   then instead of from inside it).
