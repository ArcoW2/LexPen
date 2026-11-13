# The LexPen launch video: how it is made

The video (`../brag.mp4`) is the real LexPen, driven over the WebView2 debug port, captured frame by frame, and laid
out in a web page (`comp/index.html`) that is rendered to video. The storyboard is `../brag-plan.md`, the post text
`../share-copy.txt`. Everything the scripts below produce is in `../.gitignore`: the captures, the renders, the copy of
LexPen and its data folder.

## Needs

- Python with `pip install --user playwright imageio-ffmpeg numpy` (imageio-ffmpeg brings an ffmpeg).
- Google Chrome installed (Playwright uses it to render; Edge under a company policy may not start headless).
- A Release build of LexPen.

## Set up

1. Copy the build next to these scripts: `src/bin/Release/net10.0-windows/win-x64` to `work/app`. A copy has an exe
   path of its own, so it runs as an instance of its own, beside a LexPen you may have open.
2. `python make_pdf.py`: the demo PDF in `demo/`.
3. Put the macro in the data folder of that instance: `demo/in-list.lpm` to `data/macros/IN list.lpm`.
4. `pwsh launch.ps1`: LexPen with `LEXPEN_DATA=work\data` (no session or settings of yours) and the debug port 9333,
   on the demo folder and `release-notes.md`. Later starts: `pwsh launch2.ps1` (no files on the command line).
5. A start restores every window of the project: `pwsh wins.ps1 -KeepOne` closes all but one. At the end
   `pwsh wins.ps1 -All` closes them the normal way (not Stop-Process: then the next start restores them all again).

## Capture

Each script runs inside the LexPen window: `python cdp.py capA.py`. They build on each other (open files, settings,
the pane layout), so run them in this order. `lib.py` holds the viewport (1440 x 810, captured at 1.5x) and the mask
that shows the demo folder as `C:\Work\warehouse` and the data folder as `%LOCALAPPDATA%\LexPen`.

| Script | Scene | Note |
|---|---|---|
| `capA.py` | Hook: markdown typed, the page rendered | Turns the preview on |
| `capC.py` | Many cursors | |
| `capD.py`, `capD2.py` | Compare, a line copied across | |
| `capF.py`, `capG.py` | Completion (SQL), indentation (C#) | |
| `capH.py` | Column mode | |
| `capI.py` | Macro run from its tab | |
| `capJ.py` | PDF, then Hex | |
| `capK.py` | CSV: double click, edit | |
| `capL.py` | F12 to `Bin.cs` | `Bin.cs` must be saved; a `record Bin(...)` lists twice (as a type and as a method: F12 has no scope) |
| `capM.py` | The six themes | Sets Follow Windows off |
| `capN0.py`, `capN.py`, `capN2.py` to `capN5.py` | Settings: tabs, search, ruler | Then close the Settings window (`wins.ps1 -KeepOne`) |
| `capO1.py`, `capO.py` | Menu / ribbon, the macro dragged onto it | F1 docked: a drag between windows cannot be scripted |
| `capP.py` | Go to line | |
| `capQRS.py` | Move a block (`capR`) | Sets the indent size to 4 |
| `capQ2.py` | Next block, K&R braces | Alt+PgDn stops on Allman-style headers (a LexPen defect) |
| `capS2.py` | Reformat C# | |
| `capX.py` | Reformat SQL | |
| `capY.py` | Fenced code in markdown | |
| `capTU.py` | Occurrences, Find | |
| `capV.py` | Highlight with a note, two more notes | |
| `capW.py` | Print, notes in the margin | Picks Microsoft Print to PDF, not your printers |

## Render

1. `python audio.py`: `music.wav`, 120 BPM in A minor, every cue on the beat grid.
2. `python render.py full`: `video.mp4` from `comp/index.html` (`python render.py stills 12.5 30` for single frames).
3. `python deliver.py`: `../brag.jpg` (the poster) and `../brag.mp4`.

The timings in `comp/index.html` and `audio.py` grew scene by scene: the late scenes run on a shifted clock
(`late(t - 38)`) and the older cues through `L()` in `audio.py`. Adding a scene means shifting both.
