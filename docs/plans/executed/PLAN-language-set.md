# Plan: one place for language packs while developing; a full shipped set from the UltraEdit word files

## 1. The problem

Language packs live in three places, and during development it is unclear which one a running LexPen reads:

- `wwwroot\languages` in the project: the source. A debug run does not read it; it reads the copy in
  `bin\...\wwwroot\languages`, refreshed only by a build.
- `C:\Win32App\LexPen\wwwroot\languages`: the published copy, read by the installed LexPen.
- `%LOCALAPPDATA%\LexPen\languages`: your own packs, read by both, and winning over the shipped ones. AutoHotkey
  and Sybase ASA SQL sit there now, so they exist for you but not in the project.

And the shipped set is small: the languages you use in UltraEdit (AutoHotkey, Sybase ASA SQL, batch, Python, ...)
are not in it.

## 2. The solution, in brief

The debug build reads the shipped packs straight from the project's `wwwroot\languages` and watches it, so an edit
there applies at once in a running debug LexPen, without a build. The project gets the full set: every UltraEdit
word file you use becomes a shipped pack (AutoHotkey and Sybase ASA SQL move in from your own folder), so your own
folder is empty again and only for real overrides. The published copy stays what a publish puts there.

## 3. Details

### 3.1 Debug reads the project

- `AppHost.ShippedLanguagesDir`: in a debug build, the project's `wwwroot\languages` (found by walking up from
  the exe to the folder with `LexPen.csproj`); otherwise as now. Release builds are unchanged.
- The watcher that today watches only your folder also watches the shipped folder in debug, with the same
  reload and `languages` event.
- Your folder stays as it is: read by every build, winning over shipped packs.
- Same for themes (`wwwroot\themes`): the same three places, the same annoyance, the same rule. Existing theme
  files are not touched.

### 3.2 The full set, from the word files

Each pack is made the way AutoHotkey and Sybase ASA SQL were: the word lists generated from the `.uew` file (no
word typed by hand), each `/C` section its own token type with a look in `tokens`, comments, strings, folding and
extensions from the `/L` line, the outline from the function strings or tag groups. Both existing ones move from
your folder into `wwwroot\languages\ahk` and `wwwroot\languages\asa` (done ahead of this plan, at your request).
`.sql` is ASA's, with all the word file's extensions: there is no distinction between the two in your work.
The SQL pack keeps `.ddl .pks .pkb`.

Word files in `%APPDATA%\IDMComp\UltraEdit\wordfiles` (listing of the folder) and what becomes of them:

| Word file | Extensions there | Becomes |
|---|---|---|
| ahk | ahk | AutoHotkey (in the project) |
| Sybase_ASA_SQL | EVN SP SQL TR VW WS DO | Sybase ASA SQL (in the project), `.sql` included |
| batch | BAT CMD SYS | Batch (new) |
| c_cplusplus | C CPP CC CXX H HPP AWK | C / C++ (new) |
| css | CSS SCSS SASS LESS | CSS (new) |
| html | HTM HTML SHTML ... PHP ... | HTML (new) |
| java | JAV JAVA | Java (new) |
| perl | CGI PL PM PLX | Perl (new) |
| php | PHP3 PHP4 PHP5 | PHP (new) |
| python | PY PYW | Python (new) |
| ruby | RB RBW | Ruby (new) |
| shell | CSH KSH SH | Shell (new) |
| vbscript | VBS | VBScript (new) |
| visualbasic | BAS FRM CLS VB VBA CTL DSR | Visual Basic (new) |
| csharp, javascript, json, markdown, powershell, xml, yaml | | not converted: already shipped, with an editor mode of their own (a real parser) |
| KING_trace | LOG TXT | not converted: a log format of your own work |
| wf | UEW | not converted: UltraEdit's own word-file format |

Extension overlaps between word files (html lists PHP, php lists PHP3-5) are settled per pair in the packs and
listed in the execution table.

### 3.3 Tests

- Unit (`LanguagePacksTests`): every shipped pack loads without problems; no extension claimed by two shipped
  packs; the debug folder lookup finds the project folder.
- In-app: per new pack a sample file: its language, a word of each list with its token type, the outline (as
  t35 does for AutoHotkey and ASA). A pack edited in the project's folder applies at once in a debug run.

### 3.4 Docs

README (Language packs: the shipped list; where a debug build reads them), HANDOFF.

## 4. Open questions

None.

## 5. Resolved during execution

| Thing | Solution implemented |
|---|---|
| Word lists in the page came in alphabetical order, not the file's: a message to WebView2 arrives with its object keys sorted. The first list with a word should win (as in UltraEdit), so the order matters | The host sends the order along (`wordOrder`, LanguagePacks.cs); the page builds the lists in that order. Unit test on it. |
| A word ending in a sign (`</a>`, `abbr=`) never matched before a letter: every word had "no word character may follow" | That check only for words ending in a letter or digit; within a list the longest word first (`background-color` before `background`). |
| A word in a list and a "starts with" both matching (Ruby: `Array` in the class list, `A*` the constants) | The exact words are tried first, then the "starts with" ones. SQL, ASA and AutoHotkey unchanged (t30, t35). |
| Lists of signs only (operators, braces, separators) | Not coloured, as for AutoHotkey; signs inside a Tags list kept (PHP `<?` `?>`, VBScript `<%` `%>`). A word with `*` inside (`aria-*=`) is left out. |
| `.php`: the HTML word file has it, the PHP one has `.php3 .php4 .php5` | As the word files: `.php` opens as HTML. |
| Folding on `( )` (Batch), `do/done` (Shell), `If/End If` (VB) | The editor folds braces or by indent: Batch, Python, Ruby, VBScript and VB by indent; Shell by braces. |
| Comment markers valid in one column only, or not after some characters | Batch `::`: a rule for column 1. Perl `$#array`, shell `$#` `$?`: a rule before the comment. |
| Python strings | The word file names none (UltraEdit's default `"` and `'`); triple quotes added, over several lines. |
| `LanguageMarker` (shebang) | `firstLine` for Perl, PHP, Python, Ruby, Shell. |
| Tag groups inside a block (`/TGFindBStart`: parameters, variables) and multi-line patterns | Not in the outline (one line per entry); the others as patterns per line. |
| "Include the themes too" | Read as question 4.2: the debug rule for `wwwroot\themes`. The UltraEdit themes (`ACW`, `ACW_dark`, `My Theme`) are not converted. |
| Measured: the PHP pack's built-in function list from the word file is long | Colouring a 3000-line PHP file (runMode): 58 ms (t37). |
| Old in-app scripts that used `.sql` for the SQL pack (t28, t31) | They use `.ddl` (still SQL); `.sql` is ASA's. |
