# LexPen brag plan

## Rubric

- **What:** a fast text and code editor for Windows with a built-in viewer (markdown, code, compare).
- **For:** developers and writers on Windows who flip between code, SQL, notes and docs all day.
- **Sets it apart:** editor and live preview side by side (Mermaid, KaTeX, task lists), many cursors and
  column mode, compare two files, themes per project; one small exe.
- **Best claim:** "Fast, intuitive and flexible" (README), backed by showing it, not by numbers.
- **Visual hook:** markdown typed on the left, a rendered page with a live Mermaid diagram growing on the right.
- **Real UI:** the actual LexPen build, driven over the WebView2 debug port with a throwaway data folder
  (LEXPEN_DATA) and fictional warehouse demo files. The personal folder path in the title bar is masked
  to `C:\Work\warehouse` in captures.
- **Tone:** polished, with clean snap (app-store pacing): the product is serious, the edit is brisk.
- **Caption:** "LexPen: type markdown, get the page. Many cursors, compare, themes. For Windows."

## Identity

- Colours from the icon (`src/img/icon/lexpen.svg`): sky `#82c0ff`, navy `#1f3a5f`, green `#2e8b47`,
  amber `#e0a82e`, coral `#ff8f87`. Background: near-black navy `#0e1726`.
- Type: Segoe UI (the app font on Windows), Cascadia Mono / Consolas for code.

## Music

120 BPM, 4/4, beat 0.5 s, bar 2 s, counted from frame 0. Key A minor. Soft synth pad, plucked
arpeggio, kick on beats, light hats; whoosh/tick effects in key on cuts. Every cut below is on a beat.

## Storyboard (101.0 s, 1920x1080, 30 fps)

No length cap: every extra feature gets its own scene. Earlier cuts: `brag-v1.mp4` (21 s), `brag-v2.mp4` (40 s), `brag-v3.mp4` (47.5 s), `brag-v4.mp4` (63 s), `brag-v5.mp4` (76.5 s), `brag-v6.mp4` (93 s).

| # | Time | Scene | On screen | Caption |
|---|---|---|---|---|
| 1 | 0.0-4.0 | Hook | Markdown typed line by line; preview renders heading, Mermaid, checklist, table, KaTeX. | "Type markdown." / "Get the page." |
| 2 | 4.0-8.0 | Reveal | Logo builds; wordmark. | "LexPen" / "A text and code editor for Windows, with a built-in viewer." |
| 3 | 8.0-12.0 | Languages | Every language pack in `src/defaults/languages` besides Markdown, Plain text, PDF and the template, as chips. | "Language packs built in. Add your own." |
| 4 | 12.0-16.0 | Typing | SQL: `SEL` + Ctrl+Space -> `SELECT`, `FR` -> `FROM`, indented on Enter. C#: a block typed, indentation and `}` placed by themselves. | "Typing that knows the language." |
| 5 | 16.0-19.5 | Go to definition | Cursor on `Bin` in `RouteBuilder.cs`, F12: `Bin.cs` opens in the other pane at `class Bin` (saved file). | "F12: the definition, even in another file." |
| 6 | 19.5-22.5 | Go to line | `PickService.cs`: Ctrl+G, "Go to line (1 to 45)", 31, Enter. | "Go to line. Ctrl+G." |
| 7 | 22.5-25.5 | Next block | Alt+PgDn: Start, Pick, Finish, Count. K&R braces for this scene: Alt+PgDn stops on Allman-style method headers (a LexPen defect, reported). | "Block to block. Alt+PgDn." |
| 8 | 25.5-29.5 | Move a block | The guard clause in `Start` selected, Ctrl+L, Down and Down in move mode until it sits inside `Pick`. | "Move a block into another one." |
| 9 | 29.5-33.0 | Reformat | The badly indented `Count` method selected, Reformat (indent size 4). | "Reformat the mess. Indents, breaks, aligns." |
| 10 | 33.0-37.0 | SQL reformat | `wave_pick.sql`: a SELECT with a join, a left join, where, group by, having and order by, its lines indented at random; Reformat: clauses at the left, the joins as columns, the conditions lined up. | "SQL too: clauses, joins, conditions lined up." |
| 11 | 37.0-41.0 | Fenced code | `runbook.md` with sql, csharp, json and powershell fences: each coloured as its own language in the editor (its gutter shaded) and the preview. | "Fenced code, coloured as its own language." |
| 12 | 41.0-44.5 | Occurrences | `route` selected, Show all occurrences: marked in the editor and the preview, "3 occurrences". | "Every occurrence, editor and preview." |
| 13 | 44.5-48.0 | Find | Ctrl+F, `pick` typed, F3 twice. | "Find. F3 for the next." |
| 14 | 48.0-52.5 | Highlight with a note | "Skip empty bins" selected, Highlight note, the note typed; then two more notes. Highlights and note signs in the editor and the preview. | "Highlight it. Add a note." |
| 15 | 52.5-57.5 | Print | The print window: Source Preview, colours Light, highlights shaded, notes in the right margin (printer: Microsoft Print to PDF). | "Print the preview." / "With the notes in the margin." |
| 16 | 57.5-61.0 | Cursors | Six cursors on `o`, typed over at once to `wo`. | "Every occurrence. One edit." |
| 17 | 61.0-64.0 | Column mode | Alt+C, a 5 x 0 block down an empty column, `WH1` typed in OVR. | "Column mode. Alt+C." |
| 18 | 64.0-68.0 | CSV | `stock.csv` split; double click on `Crate`, `Drum` typed, the table follows. | "CSV as columns." / "Edit the text. The table follows." |
| 19 | 68.0-72.0 | Macros | The SQL IN list macro in its tab, Run. | "Macros: record one, or write one." |
| 20 | 72.0-78.0 | Menu and ribbon | Menu only, menu and ribbon, ribbon only; change mode, `IN list` dragged from F1 onto the ribbon. | "Menus, a ribbon, or both." / "Your ribbon. Even your macros on it." |
| 21 | 78.0-81.5 | Compare | Two SQL files; one line copied across. | "Compare two files. Copy across." |
| 22 | 81.5-85.5 | PDF + hex | The pick-list PDF; `RouteBuilder.cs` in Hex. | "Read PDFs." / "Or every byte, in hex." |
| 23 | 85.5-91.5 | Settings | Tabs, "ruler" searched, the ruler and a guide at 40 on; the main window shows them at once. | "Every setting, searchable." / "A change applies at once." |
| 24 | 91.5-97.5 | Themes | Light parchment, Light blossom, Dark pistachio, Dark wine, Dark (neutral grey), Dark ink and aged paper. | "Themes, light to dark." |
| 25 | 97.5-101.0 | Outro | Logo, wordmark, tagline, repo URL. | `github.com/ArcoW2/LexPen` |

All demo content is fictional (`work/demo/`); paths of the throwaway data folder show as `%LOCALAPPDATA%\LexPen`; the PDF is generated from `work/picklist.html`, not taken from
`docs/examples/pdf`. Transitions dip through the background; every cut is on a beat.
