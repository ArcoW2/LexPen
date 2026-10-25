# LexPen

Fast, intuitive and flexible text and code editor for Windows, with a built-in viewer.

LexPen is a small WinForms app that hosts a WebView2 control. The whole UI is a local web page
(`web`, built into the exe): CodeMirror 5 for editing, markdown-it for the preview. The native shell (`MainForm.cs`) handles
everything the page can't do itself: file and folder dialogs, reading and writing files, watching
for changes, git, the clipboard and window/theme settings. The page and the shell talk through JSON messages.

## Features

- **Languages**: a language pack per language (`defaults\languages\<name>\language.yaml`, `bar.yaml`, icons):
  markdown, plain text, C#, JSON, YAML, PowerShell, XML, JavaScript, SQL, Delphi / Pascal, KQL (Azure's Kusto
  queries: `.kql`, `.csl`, a ```` ```kql ```` or ```` ```kusto ```` fence in markdown), and from the UltraEdit
  word files AutoHotkey, Sybase ASA SQL, Batch, C / C++, CSS, HTML, Java, Perl, PHP, Python, Ruby, Shell,
  VBScript and Visual Basic ship. A language inside a language: blocks of whole lines between marker lines (ASA's
  JSON API block, markdown fences coloured by their pack, HTML's script / style / php), and lines you give a
  language yourself (select them, then the language in the bottom bar); inside, the inner language's colours,
  comments, indent and bar (over the top row), and a tinted gutter. A debug build reads them (and the themes) from the project's `defaults` and
  picks up a change at once. A pack gives the extensions, how the file opens, the colouring (a built-in mode, or word lists and patterns as SQL and
  Pascal), comments, the outline (procedures, classes, ...), actions and snippets and the buttons above the
  editor. The preview of a code file is coloured as the editor (not above 2 MB). The language in the bottom bar
  is a selector (also View > Language...); the choice is kept per file. Your own packs go in
  `%LOCALAPPDATA%\LexPen\languages\` (start from `defaults\languages\_template`; the guide: `defaults\languages\README.md`; a
  folder with a shipped name replaces it) and apply at once; mistakes show in the settings window. How a file
  opens: per language, the pack's choice unless you set it (settings window, General > Open in).
- **Themes**: Light, Dark, Black (OLED); Dark ocean, forest, wine, parchment, sand, moonlight and pistachio; Light
  sky, seafoam, blossom, parchment, sand, lichen and pistachio ship in `defaults\themes`; your own
  go in `%LOCALAPPDATA%\LexPen\themes\` (a file with the same name replaces a shipped one) and apply at once.
  LexPen follows Windows' light / dark mode (a setting, on), with a theme chosen for each mode; Day / night
  switches until Windows changes mode. The app, the editor and the preview each have a theme per mode: the
  editor's and the preview's are the app's unless you choose one (Settings > Editor view, Preview), say a parchment
  editor between sand bars and an ocean preview. Light and Dark (`light.json`, `dark.json`) set every colour; any other theme names any theme as
  its base and lists only what differs: `{ "name": "Lighter ocean", "description": "a softer blue", "base": "dark-ocean", "colors": { "bg": "#1d2533" } }`
  (its own colours, then Dark ocean's, then Dark's). The description is the theme's character: the settings show
  "Lighter ocean: a softer blue". Renamed shipped themes (bluish, greenish, reddish, yellowish and their light and
  dark ones) are still found by their old file name in settings.json, as a base and in a language's `byTheme`;
  a file of yours with an old name no longer replaces a shipped theme, it is a theme of its own. A theme is not light or dark itself: the mode it is chosen for is
  (title bar, scrollbars, diagrams, a language's `byTheme: { dark }`). A colour nothing in the chain sets comes
  from the fallbacks in app.css. Colour names: `bg`, `bgSide`, `bgBar`, `bgBarDim`, `bgCode`, `fg`, `fgDim`, `border`, `accent`,
  `hover`, `active`, `select`, `inlineCode` (the box behind code within a line of text), `inlineCodeFg` (its text), `highlight` (a highlighted part of the text: a dark yellow on light, on dark a yellow as
  bright as the text's contrast allows, a bright yellow on a medium background or where the selection is yellowish), `paneActive`; code: `keyword`, `string`, `comment`, `number`, `title`, `attr`;
  alerts: `note`, `tip`, `important`, `warning`, `caution`; markers: `gitModified`, `gitAdded`, `gitUntracked`,
  `gitDeleted`, `barChanged`, `barRemoved`; find: `findHit`, `findCurrent`, `findCurrentFg`, `findBox`; the pair at the cursor: `bracketMatch`, `bracketNoMatch`; indent guides (rainbow, per level): `guide1` to `guide6`; shown spaces, tabs and line ends: `whitespace`; the gutter beside lines of another language: `gutterBgEmbedded`; the settings window's line per row, by what a setting belongs to: `layerGlobal`, `layerWindow`, `layerSet`, `layerScreen`. Values:
  `#rrggbb`, `#rgb` or `rgba(r, g, b, a)`. Mistakes show in the settings window.
- **Settings window** (Options > Settings): a tab per group (General, Files, Editor, Preview, Tabs, Find, App, Keys,
  Languages; Ctrl+Tab / Ctrl+PgDn between them; a tab's rows are made when it is first shown); a search shows the
  matches of the tab shown; the tabs with a match stand out (while typing, a tab without one moves to the first
  tab with one); a change
  applies at once in every LexPen window, Reset goes back to the default. Your `settings.json` in
  `%LOCALAPPDATA%\LexPen` holds only what you changed (the defaults with a comment each: `defaults\settings.json`);
  edit it by hand or copy it to another PC, a change in it applies at once. Problems in it show in the window.
- **Editor first**: files open in the editor. Markdown opens as the setting **Open markdown in** says
  (editor, editor and preview, or preview). **Editor** and **Preview** in the toolbar (and the View menu) are
  switches; one of them stays on (keys Ctrl+Alt+V, E and Ctrl+Alt+V, P). The splitter between
  them sets their widths (double-click: half and half).
- **Inline code**: code within a line of text (in markdown the text between backticks) in a rounded box in the
  editor, in the theme colour `inlineCode` (in the shipped themes 14% of the text colour in the background; its
  text `inlineCodeFg`, the theme's accent half and half with the text colour), at
  Editor view > Inline code > Inline code: intensity (100% the colour; 0% no box; up to 200% further from the
  background). The preview shows it the same way, in its code font. Code blocks stay as they are.
- **Pinned tabs** (right-click a tab > Pin tab): a pin before the name. Closing it alone asks first; Close other
  tabs, Close tabs to the right, Close all tabs (tab menu, the tab bar's own menu and File menu; one pane) and closing a pane leave it
  open. Closing the second pane, or a window while another window of its project stays open, moves pinned tabs to
  the main pane / that window (a setting, on by default). Kept in the session.
- **Read-only tabs** (right-click a tab > Read-only): the tab cannot change the file; switching it off is
  refused while another tab or window edits the file. A file with the Windows read-only attribute opens
  read-only. A padlock before the name shows it (underlined: set by you); the tooltip says why.
- **Wrap long lines** (View menu, Alt+Z, on by default): in the editor. The code blocks of the preview have a
  setting of their own (Options > Settings > Preview, on by default). A line of more than 10,000 characters always
  wraps in the preview: one such coloured line makes the browser freeze for seconds on every mouse move (see
  docs/plans/executed/PLAN-long-lines.md).
- **Invisible characters** (Options > Settings > Editor view > Invisible characters): spaces and tabs, and line
  ends (each off by default, apart): in the editor a space shows as a small dot and a tab as an arrow; line ends as
  a pilcrow (CRLF) or the LF sign, the last line none, in the theme's `whitespace` colour. Characters that cannot be
  seen (on by default): a control character as `0x1B`, an invisible sign as `U+200B`, in a box in inverted
  colours, still one character (one step of the cursor, removed whole). A byte the encoding of the file cannot
  read (a file with a byte order mark, UTF-16) is kept as it is and shown as `0xAB` in red; saving writes it back,
  so a file is never changed by opening and saving it.
- **Indent guides** (Options > Settings > Editor view): a thin line at the indent of every enclosing line, from
  the indent to the unindent; an empty line takes the level of the lines around it. In the comment colour (the
  default), a colour per level (rainbow: theme colours `guide1` to `guide6`, lighter at night), one colour you
  choose, or off; an intensity slider fades them into the background. The guide of the block the cursor is in (on
  a line such as `begin`: the block it opens) shows in a colour and intensity of its own (default the find box's
  colour). A colour is one of the theme (it follows the theme) or one you pick. The editor only.
- **Menus**: File, Edit, Format, View and Options in the toolbar row. Every item shows its key; Alt+letter opens a
  menu, the arrow keys move, Enter runs, Esc closes one level, an underlined letter runs its item. The focus stays
  in the editor, so a menu item works on the cursor and the selection there.
- **Keys you can change**: every key runs an action, and every menu item is an action. `defaults\keys.json` is the
  default set; a `keys.json` in `%LOCALAPPDATA%\LexPen` overrides it key by key (`"Ctrl+T": null` takes a key
  away). Chords like `Ctrl+K, K`: the first key waits in the bottom bar for the second. A move (section,
  bookmark) selects when Shift is added to its key. An action is named for what it acts on, then a dot and what it
  does: `wrap.toggle` switches, `wrap.on` / `wrap.off` (or `ruler.show` / `ruler.hide`) set, and an action with
  choices sets the one given (`tabBar.set rows`). Old names in your keys.json (`wrap`, `rulerOn`, `tabBar`, ...) are
  renamed in it at start.
- **F1**: every action with its key (columns Keys, Command, Action, their names on top while the list scrolls),
  grouped and searchable (on key, title, hint or action name). Enter runs the
  selected one, so F1 is also a command palette and the way to actions without a key. Your own keys are marked;
  a default you replaced is shown struck through.
- **Language actions**: what Format does depends on the language of the file (`defaults\languages\<name>\language.yaml`).
  Markdown has the formatting; every language with comment markers has Toggle comment (Ctrl+/), Toggle block
  comment (Ctrl+Shift+/) and Remove block comment; Ctrl+PgDn / Ctrl+PgUp (or Alt+Down / Alt+Up) go to the next / previous section
  (a heading in markdown, a paragraph in plain text).
- **The Format menu** holds what the bar above the editor holds, for the language you are in: the comment items,
  then the bar's items in the bar's order with their icons (Format among them; Alt+R opens it). The **Convert
  menu** next to it holds the conversions (Alt+N). On a line of another language (a block, a fence, lines you
  set) each menu gets a submenu named after that language with its items, acting in that language; a language
  without items there (no bar) gets none.
- **Conversions** (every language; the Convert button `Aa` at the end of every bar, the Convert menu, F1): UPPER
  CASE (Ctrl+Shift+U), lower case (Ctrl+U), all of them in a menu at the cursor with Ctrl+Alt+C, smart capitalize (a capital after `.` and `:` with a space after them,
  after an empty line and at the start of the file), snake_case, camelCase, PascalCase, kebab-case, CONSTANT_CASE,
  tabs to spaces, spaces to tabs (the indentation, a tab per indent step) and remove whitespace at line ends. The
  case ones work on the selection (several, or a block: each) or the word at the cursor; the others on the lines
  of the selection or the whole file. One undo step each.
- **Reformat** (the Reformat button at the end of the bar, the Format menu; every language with format parameters):
  the selected lines, else the whole file; from another language's bar or submenu, its part. One formatter for
  every language (ASA, SQL, C#, Java, JavaScript, C++, PHP, Perl, PowerShell, AutoHotkey, Pascal, VB, VBScript,
  Ruby, shell, batch, JSON, XML, HTML, CSS, Python, markdown): indentation, line breaks and alignment by the rules
  each language names under `format:` in its `language.yaml`. Only whitespace and line breaks change, never a token
  (JSON keeps `1.0`, long numbers, escapes; comments stay). A part of another language (a JSON block, a fence) is
  formatted by its own rules and moves with the line above it. A mistake in the structure in the lines to format
  (an opener without its closer, a closer without one) leaves everything as it was; the message gives the line,
  the cursor goes there. The indent step is the indent size (the setting, or the language's `indentSize`), tabs
  where the language uses them. How it lays out, per language: Options > Settings, Languages, "Format: ..." (where
  the content after a `(` goes, the indentation from the block word or from its line, alignment, `and` / `or` at a
  line start, ...). Python keeps its indentation (only lines inside brackets are lined up), markdown its text (its
  tables are lined up); YAML is not formatted.
- **Indentation while typing**: in those languages Enter gives the new line the indentation Format would give it,
  and typing a closing word or sign at the start of a line (`end if`, `else`, `}`, `</name>`) moves that line to
  its column.
- **Whitespace at line ends**: saving removes the spaces and tabs at the line ends of the whole file (Options >
  Settings > Files, on; Ctrl+Z after the save gives them back). A language can keep some: markdown keeps up to two
  (a line break there); `trimTrailing` in its `language.yaml`.
- **Scroll sideways before the edge** (Options > Settings > Editor, 8 columns): without wrapping, the editor scrolls
  left or right when the cursor (or a block's head) comes that close to the edge, also past the longest line; on
  keys, not on a click.
- **Left at the start of a line** (Options > Settings > Editor, on by default): Left (and Shift+Left) at the first
  column goes on to the end of the line above; off, the cursor stays there.
- **Character picker** (Edit > Insert character..., Ctrl+Alt+U, or a click on the code in the bottom bar): a window
  of its own like the Windows Character Map, not in the way of the document: every character of the editor font in
  a grid, drawn in that font, a heading per Unicode block and the blocks at the side; All characters shows every
  assigned one (those the font lacks marked). Search by code (`e9`, `U+E9`, `#233`), entity (`&eacute;`), the
  character, or words of its name (Windows' names, as in the Character Map). A click or Enter adds a character to
  the field below; Insert puts the field at the cursor(s) of the LexPen window you worked in last, which comes to the
  front, and the picker stays open with the field kept (Clear empties it), so you can move the cursor and go on. A
  double click puts one character there at once, as does Enter on a code in the search. It shows the character at
  your cursor, recently used ones on top, and keeps its place and size. The bottom bar shows the code of the
  character after the cursor (`U+00E9`; a byte the encoding could not read as `0xFF`; at a line's end `LF` or
  `CRLF`, at the end of the text `end`), with its name in the tooltip.
- **Home** (Options > Settings > Editor): the first non-blank character first, again: column 1 (the default); or
  column 1 at once. Shift+Home selects; in column mode a block goes the same way.
- **Ctrl+Up / Ctrl+Down**: the text scrolls a line, the cursor staying on its line; with a setting (Editor >
  Cursor) the cursor moves along, keeping its place on the screen, and at the end still goes on to the last line.
  Where nothing can scroll, a line at that edge flashes in the theme's warning colour.
- **Cursor past the end of the line** (Options > Settings > Editor, off by default; always in column mode; a
  monospaced editor font only): Up, Down, PgUp / PgDn and a click keep the cursor in its column on a shorter or
  empty line (with wrapping on: its place on the row), Right goes on past the end, End goes to the real end.
  Typing or pasting there first fills the line with spaces (tabs with `useTabs`) up to the cursor; moving away adds
  nothing. Backspace there moves back, Delete fills and joins the next line on. The bottom bar shows the column.
- **The head of a selection** (and of a block, also past a line's end) shows a cursor, so Shift+arrows show where
  they are. Without wrapping the cursor can go as far right as you like; the editor scrolls along.
- **Tab and indent**: two settings (Options > Settings > Editor > Tabs): the tab size (4) and the indent size (2);
  a language can set its own, and ask for real tabs (`useTabs`). Tab in a line's indentation (or with lines
  selected) indents to the next indent stop, Shift+Tab back; Tab after text goes to the next tab stop (spaces, or
  a tab). A tab is shown the same way: in the indentation as wide as an indent step, after text up to the next
  tab stop; the column in the bottom bar and column mode count it so.
- **Highlights**: select text in the editor or the preview and Highlight it (Ctrl+F8, Edit > Highlights, or the
  right-click), as with a highlighter pen; any kind of file. A highlight belongs to the document: every editor and
  preview of it shows it, and it moves with your edits. Ctrl+F8 on a highlight with nothing selected removes it;
  Selection to highlight only adds; overlapping ones merge. A highlight can carry a note (Highlight note...): a
  tooltip and a small sign at its end. A note on text not highlighted yet (the selection, or else the word at the
  cursor or right-click) highlights it once the note is written; cancelled, nothing is highlighted. F8 / Shift+F8 go to the next / previous one. The highlights window
  (Ctrl+Shift+F8) lists them with their notes, for this file or all files, with a search (notes and text, as you
  type); a click or Enter goes there and the window stays open. Kept per file in LexPen's store, or with Files >
  Highlights next to the file as `name.ext.lph` (it then travels with the file; not listed in the folder pane, the
  file gets a mark). A file changed outside LexPen: they are placed again in the background (never holding up
  opening it), moved with their text, `adjusted` when their text changed a little (dotted until Keep), `detached`
  when it is gone (kept in the window, Attach to selection puts it back). Look: Editor view > Highlight and
  Preview > Highlight; marks on the scroll bar.
- **Bookmarks**: 1 to 9 and unnumbered ones, at a line and column, kept per file. Ctrl+1, S stores bookmark 1,
  Ctrl+1, 1 (or Ctrl+1, Ctrl+1) goes there, Ctrl+1, T toggles, Ctrl+1, C clears; Ctrl+K, 1 and Ctrl+Q, 1 as in
  WordStar and Delphi; Ctrl+K, K / N / P / L for unnumbered ones, next, previous and the list. They follow
  inserted and removed lines, and are found again by their line text when the file changed outside LexPen.
- **Clipboards**: next to the Windows clipboard, LexPen has clipboards 1 to 9 (shared by all windows, kept across
  restarts). Ctrl+Shift+1 to 9 selects one, Ctrl+Shift+` the Windows clipboard; Ctrl+C, Ctrl+X and Ctrl+V then
  work on the active one. The bottom bar shows it (Clip: Win, Clip: 3); a click there or Ctrl+Shift+C lists them
  with the start of their text.
- **Column mode** (Alt+C or Edit > Column mode; `COL` in the bottom bar, a click there ends it; the cursor goes
  past line ends in it, as with the setting above, so a block can start and end there; a block is always a
  rectangle, drawn past shorter lines' ends and copied with spaces filling them; Shift+End goes to the end of the
  head's line, pressed again to the end of the block's longest line; Ctrl+Shift+arrows step by word on the head's line; Alt+C with a selection turns it into a block, and a block back into a selection, from its anchor to its head): a drag and
  Shift+arrows (also Home / End / PgUp / PgDn) select a block, a rectangle that goes on past the end of short
  lines; tabs count to their tab stop. Without the mode Alt+drag and Alt+Shift+arrows make one. A key typed on a
  block replaces it on every line; Backspace / Delete remove its part and leave a cursor on every line, where
  typing then goes on (overwriting in OVR mode); a shorter line is first filled up with spaces, so the text lines
  up. Tab / Shift+Tab indent the block's lines. Copy and cut mark a block on the clipboard (`MSDEVColumnSelect`,
  as Visual Studio and Notepad++; `[block]` in the clipboard list); paste puts a marked text in as a column at the
  cursor, and in column mode any text. A text of as many lines as there are cursors gives each cursor its line.
  Only with a monospaced editor font. The bottom bar shows the block's size: `Block 5 x 12` (lines x columns).
- **Multiple cursors**: Ctrl+Alt+click adds a cursor (held and dragged, it follows the mouse until you let go); on a
  cursor or inside a selection it removes that one, never the last. Ctrl+Alt+double-click selects the find match
  there (find bar open), else the word: Ctrl+F the text, then Ctrl+Alt+double-click the matches you want. With the
  keys, on the find bar's text (with its switches) or else exactly the selected text: Ctrl+Alt+Right / Left move a
  current occurrence (boxed), Ctrl+D, A adds it to the cursors and goes to the next, Ctrl+D, D (or R) removes it,
  Ctrl+D, C keeps only the current one selected (also Edit > Multiple cursors; past the end as find, the setting
  "At the end of the file"). Typing, Backspace / Delete, paste and Tab work on every cursor; each cursor moves as one
  cursor does (Left at a line's start stays there with leftWraps off; meeting cursors become one); with virtual space
  each one can stand past its line's end (one per line) and typing fills each line up to its own column. Esc: back
  to the first cursor. The bottom bar shows `3 cursors`, or `3 selected, at 4 of 9` with the occurrences.
- **Locate the cursor**: a short tap on Ctrl alone shows rings, in the find box's colour, shrinking onto every cursor,
  in both panes when two show (side by side, a compare); a cursor out of view gets a marker at that edge (top: higher, bottom: lower) with its line number, several in one
  direction one marker with the count. A double tap scrolls to the cursor first (setting, off by default). Also View >
  Locate the cursor; settings in Editor view > Locate the cursor (on / off, the longest tap).
- **Ruler, column guides, tab stops and helper lines**: View > Ruler shows the columns above the editor (the
  cursor's column marked). Column guides are faint lines after so many characters: a first one, then one every step,
  and one more (as 80), in the settings (Editor view > Ruler and column guides). The guides have a colour of their own (a theme
  colour, default the border colour); three intensity sliders there, for the column guides, the helper lines and the
  tab stops, mix each line's theme colour into the background, so they are lighter by day and darker at night (a
  colour from Other colour... is drawn as picked). A click on the ruler sets
  a tab stop or a helper line for this document; click its handle to remove it, drag it to move it. Right-click
  opens a panel: on top the actions (Add a tab stop / Add a helper line at that column, a plain click then adds that
  kind; on a line Tab stop / Helper line, checked by what it is, and Remove this line; clearing; Cancel), below them
  Settings: the colour of the line to add or of that line, where a click only moves the check and the panel stays
  open until an action. A tab stop is a line through the text: Tab before one goes there with spaces, Shift+Tab back
  to the one before; past them Tab and Shift+Tab work as always. A helper line only shows (on the ruler only its
  line, no handle). The buttons above the line numbers: Clear, "Use rulers from:" and "Copy these rulers to:" another open
  document (both kinds; the list says which way).
  Kept per file for the last 100 files with lines, and for drafts. Actions tabAdd / tabRemove / helperAdd / helperRemove (with
  a column, or at the cursor), tabClear and helperClear. A monospaced editor font only.
- **Gutter**: line numbers, bookmarks, change markers (not saved yet), git markers (changed since the last commit;
  a click shows the old text and can revert the block) and fold markers (heading sections and code blocks in
  markdown, braces or indentation in code). View > Gutter switches each column. Line numbers: none, every 10 (a
  dash at 5, a dot on the others) or every line; absolute or relative to the cursor line. The cursor's line is marked in the
  gutter, in the colour the ruler shows its column in (setting Show cursor location in the gutter).
- **Bottom bar**: at the left both panes, each a page with an arrow to where it is (left / right, or up / down
  when above each other) and an eye: struck through while the pane is hidden, grey while it has no documents. A
  click on the eye shows or hides the pane; hiding one while the other is hidden shows the other (never both
  hidden). Then line and column (and the size of the selection or block), COL (column mode), INS / OVR (Ins), encoding, line endings,
  language, the active clipboard and a pending chord. "Long line: colour stops at 10,000 characters" when a
  line is that long (the editor colours a line up to there). At the far right a heartbeat (- \ | /) turns
  while LexPen responds; when it stands still, LexPen is busy. The bottom bar can have a font and size of its own.
- **Encodings**: UTF-8, UTF-8 with BOM, UTF-16 and ANSI files are saved the way they were read. A file that is not
  valid UTF-8 and has no BOM is ANSI (the Windows code page); a character ANSI cannot hold is refused when saving,
  Save as under another name saves it as UTF-8.
- **Backup on save**: the old file becomes `name.ext.bak` (overwritten at the next save; a setting,
  on by default). Saving goes through a temporary file that replaces the old one in one step.
- **Tabs and two panes**: every file opens in a tab. Ctrl+click a file in the tree, drag a tab or file onto the
  other half of the window, or right-click a tab > **Move to other pane** to show two files next to each other.
  The divider can be dragged; **Side by side / Above each other** (or right-click the divider) switches the split.
  The active pane has a blue (day) or yellow (night) border. Clicking a file in the tree shows it in the current
  tab (in a new tab when the current one is changed or a draft); Shift+click opens a new tab, Ctrl+click shows it
  in the other pane, Ctrl+Shift+click opens a new tab there.
  The same file can be open in both panes, both editing it (a split): View > **Split into the other pane**
  (Ctrl+Alt+S) opens it there at the same place, with its own cursor and scroll position. Drag a
  tab along the tab bar to reorder it. Right-click a tab for Close, Close other tabs, Close tabs to the right;
  View > **Tab bar**: one row that scrolls, one row with a menu for the tabs out of view, or several rows.
  The arrows button at the left of each tab bar shows the pane's file in the folder pane (opening its folder
  when it lies outside the open one), as Visual Studio's Sync with active document.
- **Compare two files**: File > Compare files..., a tab's right-click (Compare with..., with the tab in the other
  pane, with the saved file), the folder pane's right-click on a file (with the file in the editor, with...), or
  `LexPen.exe --compare old.sql new.sql`. The two files side by side in the two panes, editable as usual: lines that
  differ tinted (removed, added, changed; lines are paired by how much they look alike), the changed characters
  marked, filler lines keeping both sides level, the panes scrolling together, the differences on the scroll bars.
  F7 / Shift+F7, or the arrows on the divider between the panes: the next / previous difference (a block of changed
  lines at once, or with the setting line by line). A selection on one side shows on the other over the matching lines, as a highlight
  (Editor view > Highlight: a background colour or underlined, its colour, an intensity of 0 to 200%). The bar above the panes: the count, Ignore whitespace, Ignore
  case, Align (Ctrl+F7: the two cursor lines are each other's match and the comparing goes on from there; again on
  the pair: untied), copy across (`<<` / `>>`, or Alt+Left / Alt+Right): the selected lines and the
  lines they match on the other side, with or without differences in them, or else the difference at the cursor,
  Swap, leave (the panes as before). The line strip below: the cursor line and its match one above the other, character under character, in the language's colours, spaces and tabs visible; an arrow in its gutter
  points to the pane each line is from. A window that closes while comparing (files or folders) compares again when its
  project opens, the cursors where they were; leaving the compare then gives the window as it was before it. View > Compare has it all too.
- **Compare two folders**: File > Compare folders..., a folder's right-click (Compare with folder...), or
  `LexPen.exe --compare old new`. The folder pane shows one tree of both: = equal, ~ different, ? not checked yet,
  < only on the left, > only on the right; a folder by what is inside. First by size and date, then the contents
  of the files that need it in the background (Stop ends it; a file with the same contents and another date is
  equal); with Ignore whitespace or case on, files are also compared as text. Show all or the differences only.
  A double click (or Enter) on a file compares it; on a file of one side opens it. Read-only: nothing on disk changes.
- **Compare from Explorer**: Settings > App > Windows Explorer adds "Select left side to compare" to Explorer's
  right-click menu for files and folders (for you only, no administrator needed; on Windows 11 under Show more
  options or Shift+right-click). After that, another file or folder has "Compare to <name>", which opens the compare
  in a new window. The left side stays until you select another ("Select as new left side to compare"). The folder
  pane's and a tab's right-click have the same two items, with the same left side. The entries run the LexPen that
  turned the setting on; turning it off removes them.
- **Scroll bars with an overview**: the editor's vertical scroll bar is a strip that marks where in the file the
  find matches (while the find bar is open, every one of them), the unsaved changes, the git changes and the bookmarks
  are, with a block for the part in view. Drag the block to scroll (it holds on a mark it comes near); a click on a mark
  puts the cursor on its line (the block lands on the mark), a click elsewhere scrolls there and the drag goes on from
  there; the wheel over it scrolls; the tooltip says what a mark is. The horizontal scroll bar has the same look.
  Settings, Editor view > Scroll bars: their width (10 to 40 px) and which marks show (also View > Scroll bar marks).
  The preview has the same strip in place of its scroll bar: the highlights, the find matches, the bookmarks, the
  unsaved and git changes at the height their text is shown at, and the editor's cursor line; a click on a mark brings
  it to the middle of the view.
- **Word completion**: Ctrl+Space (Edit > Complete word) lists what completes the word before the cursor: the
  keywords of the language at the cursor (a sql block in markdown: SQL's), then the words of the document that a
  "starts with" entry of the language stands for (`'@*'` in SQL: every `@word` of the document, `@@` only the `@@`
  ones; Perl's `$`), then the other words of the document (the closest first), then the language's snippets. Enter
  or Tab inserts (at every cursor), Esc closes. In a language of any case a keyword follows the case typed (`SEL` ->
  `SELECT`). The setting Show completions after a pause in typing (Editor > Completion, 0: off) opens the list by
  itself. The document's words are gathered in the background, so typing never waits.
- **Position back / forward**: every document keeps the places its cursor jumped from: a move of more lines than
  the setting A jump (Editor, 10 by default) without typing (go to line, a bookmark, the outline, Ctrl+Home, a click
  far away), and always a found item (find, the search in files), however close. Ctrl+Alt+- goes back, Ctrl+Alt++
  forward again; also the mouse back / forward buttons. A place moves with the edits; one whose line was deleted is
  skipped. Ctrl + the mouse buttons go through the tabs and files of the window instead (View > Back / Forward in
  the window), like a browser.
- **From the preview to the editor**: a double click on a word in the preview puts the editor's cursor on that word
  in the source text, selected, and the editor gets the focus: markdown (bold, links, lists, tables, fences),
  code shown coloured, front matter. On something markdown made up (a list number, a picture): the start of its
  line. A tab shown as preview only becomes split view; with the document in the editor in the other pane, that pane
  takes it. Back (Ctrl+Alt+-) returns to where the cursor was.
  The other way: a bar at the preview's left edge beside the block that holds the editor's cursor line, in the
  cursor's colour (as on the ruler and in the gutter), and over it in the accent the rendered lines of the cursor line
  itself (a line of code: that line); a preview with a theme of its own uses its own colours. After a cursor move,
  with the cursor in the editor's view, the preview scrolls as far as needed to show it.
- **Where a line jumped to lands**: a find, a search result, the next compare difference, a bookmark, a highlight,
  Go to line and a click in the outline bring the line into view the same way (Editor > Jump to a line), in the
  editor and in the preview. Out of view: 5 lines from the edge it comes
  in at (the bottom going down, the top going up), or centred. Already in view: the view stays unless the place is
  within those lines of an edge, or centred. The number of lines is a setting (0 to 20).
- **Ctrl+Tab**: through the documents in recently used order (hold Ctrl and press Tab again to go further back),
  or in tab bar order (the setting Ctrl+Tab order).
- **Outline**: Ctrl+Alt+V, O shows the headings of each pane's file at its right; click one to go there (preview
  and editor). The entry above the cursor is highlighted (in the preview: the one at the top). Its width can be dragged.
  Languages from an UltraEdit word file show their tag groups as UltraEdit's function list does: a header per
  group (TODO, Procs/Funcs/triggers, Regions, Tables for ASA; Functions, Classes, ...), its entries in line order;
  a click on a header folds it (kept per language), and a folded group opens when its entry is the one you are at.
  Right-click the outline (or Options > Settings, Outline): all groups together in line order, and a bullet in the
  group's colour in front of each entry. While the outline is open the same bullets stand in the gutter, on the
  lines of the entries. A click on an entry shows it (the cursor stays where it is), a double-click puts the cursor
  on its text, a long click is a sneak preview: the entry is shown while the button is held (moving along the
  outline shows the entry under the pointer), and on release the pane is back where it was. It stands out (a frame,
  a badge, a tint), or has a theme of its own: Options > Settings, Outline, Theme of the sneak preview (a light one
  next to a dark editor).
- **Search** (Ctrl+Shift+F): in the current file, the open files (unsaved edits included) or the files in the
  folder (the open folder, otherwise the folder of the current file), with match case, whole word and regular
  expressions. Codes: `^p` line break (CR, LF or CRLF), `^t` tab, `^?` any character, `^#` digit, `^$` letter,
  `^w` spaces or tabs, `^^` the `^` itself. Click a result to go there.
- **Scroll together**: the button on the divider (View > Scroll both panes together) scrolls both panes together, by
  source line: preview with preview, editor with editor. As they are aligned when you turn it on: scrolling one
  pane some lines scrolls the other the same lines; a pane at its end stops there. Alt + mouse wheel scrolls one pane
  alone (the new distance is kept); the Level button under it (View > Level the panes) puts the other pane on the
  same line number. Options > Settings, Tabs, **Align scrolling by**: keeping the line distance, or the same line
  number (always; no Level button). Kept in the window's session. Not while comparing two files: the compare keeps
  the panes level itself, and the arrows to the differences take the buttons' place.
- **Stalls**: every LexPen window shares one process, and its window thread: a long job of one window makes the
  others wait too. Reading and writing files, git, large answers and the folder watchers' events (a build or a sync
  can raise thousands) run beside that thread. When it is still late
  by more than half a second, `stalls.log` in the data folder's `State` says when, how long and what it was doing (a
  script of a page that ran long is noted there too); it is open only for the moment a line is written, and can be
  read meanwhile. The turning sign at the right of the bottom bar stands still
  only while the page itself is stuck.
- **One instance, more windows**: opening a file while LexPen runs adds it as a tab to the most recently used
  window on the virtual desktop you are on; with no LexPen window there, a window opens there with the project
  whose window was closed last on that desktop (or a new project). Hold **Shift**
  while starting it, or pass `-n` (`--new-window`), to get a new window instead. Several paths at once: every
  folder gets a window, files go to the window of the folder they are in. A tab can move to another window
  (right-click a tab, or drag it out of the window). All windows look the same. A file open in two windows can
  only be edited in the first one.
- **Projects** (the Projects menu, or the project's name at the left of the bottom bar): every window belongs to a
  project, with a number and a name you can give it; a project can have several windows. Every window keeps its
  folder, tabs, panes, cursor, place and virtual desktop, saved continuously (a crash or reboot loses at most the
  last second). Starting LexPen on a desktop opens the project closed last on that desktop; after a log-off,
  shutdown or crash every window that was open comes back, on its own desktop. The menu lists
  every project (checked: open) with its windows: open a project (all its windows) or one window, a new window in
  a project, a new project (a new empty window), rename this project, move this window to another or a new
  project. A window closed by hand while another window of its project stays open is forgotten; the last window of
  a project closes the project (it stays in the menu, to open again). A project you did not name is dropped when
  none of its windows has files left (or always, with Keep unnamed projects off); a named one stays until you
  delete it. A new window joins the project of the last window used on its desktop, or starts a new one
  (Options > Settings > General > Windows).
- **File menu**: New file, Open file, Open folder, Favourite files, Favourite folders, the recently opened files
  and folders and the recently closed files (15 each, shared by all windows). An entry that no longer exists is
  dimmed; choosing it removes it.
- **Favourite files and folders**: each list in your order, shared by all windows. File > Favourite files / folders:
  the list, then Add current (the tab's file; the folder pane's base folder), Add a file / folder... (a picker) and
  Manage... (a window to put them in order, Up / Down or Ctrl+Up / Ctrl+Down, add, change by the picker, delete).
  A right-click in the folder pane adds or removes the file or folder under the mouse, the base folder included (the
  row with its full path under `..`); on a tab, its file. A favourite folder opens in the folder pane: selected when
  it is inside the folder open there, else as the pane's base folder.
  **Revert to saved** (File menu, and a tab's right-click menu, shown only when the text differs from the file on
  disk): the file as it is on disk; Ctrl+Z gives your changes back.
- **Drafts**: a new file is kept as a draft (`%LOCALAPPDATA%\LexPen\State\Drafts\editN.md`) until saved, and comes back
  at the next start, in its own window. Closing a changed draft's tab asks "Save draft editN?" (Yes: Save As, No: the
  draft is deleted, Cancel). Closing LexPen asks for the changed files and drafts in one question (Yes, No (keep
  drafts): the drafts stay, Cancel); with Ask to save changed drafts (settings, Files) off, drafts are not asked
  about and stay drafts.
- **Changed on disk**: an open file with unsaved changes that changes on disk gets a blue bar (Reload / Keep mine),
  a removed or renamed file a red one (Close / Save it again / Keep as draft). A file without unsaved changes
  is reloaded; when that happened out of sight, a blue banner says so until you click anywhere or press Esc.
  Files that changed while the window was not active are highlighted in the tree until opened.
- **Code files**: JSON, YAML, PowerShell and C# (`.json`, `.yaml`, `.yml`, `.ps1`, `.psm1`, `.psd1`, `.cs`) are
  shown and edited with syntax highlighting. Other text files open as plain text; binary files and files over
  10 MB are refused.
- **Folder sidebar** (Ctrl+Shift+B): browse all files in a folder, sorted by name or modified time. The `..` row
  (Alt+Up, Backspace) goes up a folder. Ctrl+Shift+E (or a click) gives it the keyboard: arrows, Home/End,
  PgUp/PgDn, Enter (Shift+Enter: new tab, Ctrl+Enter: other pane, Ctrl+Shift+Enter: new tab there), Esc back to
  the document (hidden files, dot folders and `node_modules` are skipped), with git status markers (modified,
  added, untracked, deleted, renamed, conflict) when the folder is in a repository. Files other than markdown are
  dimmed; the **M** button in the sidebar header hides everything except markdown files (folders stay).
  Right-click a file or folder to copy its absolute path, or its path relative to the open folder.
- **Rich rendering**: GitHub-style markdown plus footnotes, definition lists, task lists, emoji,
  ==highlight==, sub/superscript, heading anchors, YAML front matter, syntax highlighting (highlight.js),
  math (KaTeX) and diagrams (Mermaid). KaTeX and Mermaid load only when a document needs them.
- **Line breaks**: by default a single line break inside a paragraph renders as a space (CommonMark, as GitHub
  shows `.md` files). **Single line break starts a new line** (a setting) renders it as a line break.
- **Local images**: images referenced by relative path are served to the page from disk.
- **Paste or drop images**: Ctrl+V of a picture or an image file (with the Windows clipboard active), Format >
  Insert image from clipboard (Ctrl+T, I), or dropping an image file (also from the tree) on the editor, inserts
  an image link. An image in the document's folder or below it is linked where it is; one elsewhere, and a pasted
  picture, is copied to a folder named after the document (`readme.md.images`). With Shift held (or Ctrl+Shift+V,
  Edit > Paste image) LexPen asks: relative path, absolute path (`D:/x/y.png`), copy to the document's folder, or
  copy to its image folder.
- **Day / night theme** (View menu), remembered together with the window position.
- **Preview zoom**: Ctrl+= / Ctrl+- / Ctrl+mouse wheel over a preview. The level shows at the right of the top
  bar (click it for 100%) and is kept.
- **Fonts** (settings window, F1): the editor font and the app font, each with a size in points, and the
  editor's line height; every window follows a change. In the editor Ctrl+= / Ctrl+- / Ctrl+mouse wheel change
  the editor font size, Ctrl+0 sets it back to the default. The preview keeps its own look.
- **No printing**: there is no print command (also not in the right-click menu of the page).
- **Safe by default**: a Content Security Policy blocks scripts embedded in a document's raw HTML.

See [demo.md](demo.md) for a document that exercises every supported element.

### Keys

F1 lists every key and action. The main ones of the default set:

| Keys | Action |
|---|---|
| Ctrl+S / Ctrl+Shift+S | Save / save as |
| Ctrl+W / Ctrl+F4, Ctrl+Shift+T | Close tab, reopen the last closed tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous document |
| Ctrl+Space | Word completion: keywords, the document's words, snippets |
| F7 / Shift+F7, Ctrl+F7 | Comparing: the next / previous difference; align the two cursor lines |
| Ctrl+Alt+- / Ctrl+Alt++ | Position back / forward in the document (also the mouse buttons; with Ctrl: through the tabs) |
| Alt+Left / Alt+Right | Previous / next tab, in the tab bar's order; the focus goes to its editor or preview, as the tab had it last |
| Alt+Up / Alt+Down, Ctrl+PgUp / Ctrl+PgDn | Previous / next section (paragraph, heading, procedure, ... per language) |
| Mouse back / forward | Back / forward to the tab and file shown before, like a browser |
| Ctrl+Alt+V, E / P / O | View: the editor, the preview (on / off; one of them stays), the outline |
| Ctrl+Shift+B, Ctrl+Shift+E | Sidebar, folder pane |
| Ctrl+F, F3 / Shift+F3, Ctrl+Shift+R, Ctrl+Shift+F | Find, next / previous (past the last match: stop, go on from the top, or go on until where the search started; a setting), replace, search in files. Found text is marked with a background colour, a box around it, or both (Options > Settings, Find; in the editor and the preview); so are the line numbers of its lines (a setting). The last searches (with their switches) and replacements are kept for all windows and restarts: Up / Down in a find, replace or search field step through them, Alt+Down (or Down in an empty field) lists them, with Clear history; the find bar and the search in files share the searches (setting: how many, 20) |
| Ctrl+G | Go to line: a line number, or line:column (also Edit > Go to line...) |
| Ctrl+Alt+U | The character picker (Edit > Insert character...) |
| Ctrl+Up / Ctrl+Down | Scroll the text a line; the cursor stays on its line, or moves along (a setting; then with Shift: select along) |
| Ctrl+[ / Ctrl+] | To the opener (before it) / closer (after it) of the pair or word set around the cursor; again: the pair around that one; with Shift: select. The pair is highlighted as you move and type: the innermost one holding the cursor, or the set of the word the cursor is on (`if` ... `else` ... `end if`), only in the language at the cursor, strings and comments left out (Options > Settings, Editor view: a background colour, an underline or off; closing brackets and quotes while typing: Editor). Edit > Select inside brackets: what lies between |
| Ctrl+> / Ctrl+< | Indent / outdent the lines (in keys.json: `Ctrl+Shift+.` and `Ctrl+Shift+Comma`) |
| Ctrl+PgDn / Ctrl+PgUp | Next / previous section (with Shift: select) |
| Ctrl+Shift+1 .. 9, Ctrl+Shift+` , Ctrl+Shift+C | Select clipboard 1 to 9, the Windows clipboard, the list |
| Alt+C, Alt+Shift+arrows | Column mode on / off, select a block (also without column mode) |
| Ctrl+Alt+click / double-click, Ctrl+D, A / D / R / C, Ctrl+Alt+Right / Left | Multiple cursors: add or remove a cursor, select a find match or word; add / remove / clear occurrences, the next / previous occurrence |
| Tab / Shift+Tab (tab stops on the ruler) | To the next tab stop (spaces) / back to the one before; past them as always |
| Ctrl (a short tap), Ctrl, Ctrl | Locate the cursor (rings on every cursor, a marker for one out of view); the double tap scrolls to it (setting) |
| Ctrl+1, S / T / C, Ctrl+1, 1 | Bookmark 1: store, toggle, clear, go to (likewise 2 to 9) |
| Ctrl+K, K / N / P / L | Unnumbered bookmark, next, previous, list |
| Ctrl+/, Ctrl+Shift+/ | Toggle comment, toggle block comment |
| Ctrl+Alt+C | The Convert menu at the cursor (also in the Convert button's tooltip) |
| Ctrl+Shift+U / Ctrl+U | UPPER CASE / lower case |
| Tab / Shift+Tab | In the indentation (or on selected lines): indent / outdent; after text: to the next tab stop |
| Ctrl+B, Ctrl+I, Ctrl+Shift+X, Ctrl+` | Bold, italic, strikethrough, inline code |
| Ctrl+T, L / Ctrl+T, I | Insert link / image from the clipboard |
| Ctrl+H, 1 .. 6 / Ctrl+H, 0 | Heading 1 to 6 / plain text |
| Ctrl+P, B / N / T / Q / C / P | Bulleted list, numbered list, task, quote, code block, plain paragraph |
| Alt+F / E / R / V / O | File / Edit / Format / View / Options menu |
| F1 | All keys and commands |

## Requirements

- Windows 10 or 11 (x64)
- [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download) (the app is framework-dependent)
- Microsoft Edge WebView2 Runtime (included with Windows 11)
- Optional: `git` on the `PATH` for status markers in the sidebar and git markers in the gutter

To build: the .NET 10 SDK. Node.js is only needed when upgrading the front-end libraries.

## Build and run

```powershell
dotnet build                                  # debug build
dotnet run -- path\to\file.md                 # run, optionally opening a file
dotnet publish -c Release -o publish          # release build into .\publish
```

Arguments are files and folders to open, plus `-n` / `--new-window` for a new window (see **One instance, more
windows** above), or `-c` / `--compare` with two files or two folders to compare them in a new window.

```powershell
dotnet test tests\LexPen.Tests                # unit tests
```

`publish` holds exactly what is needed to run the app: `LexPen.exe` (one file: the app, its libraries and the
page), `WebView2Loader.dll` (native, next to it) and `defaults\` (the default keys and settings, the language
packs and themes: to read and copy, not to change). The whole folder can be zipped and handed out. Delete it
before publishing, because publish doesn't remove files left over from earlier runs; for the same reason, when
copying a new version over an older install, delete the older files first (`LexPen.dll`, `LexPen.deps.json`,
`LexPen.runtimeconfig.json`, `Microsoft.Web.WebView2.*.dll`, `YamlDotNet.dll`, `wwwroot\`). The other user needs the .NET 10 Desktop Runtime installed. The release build has the
WebView2 developer tools switched off; the debug build keeps them.

### Versioning

The version is `1.0.<commits>`, where the last number is the git commit count (`git rev-list --count HEAD`,
see the `GitVersion` target in `LexPen.csproj`), so each commit gets its own version. Without git, or before
the first commit, it is `1.0.0`. The version, short commit hash, build time, runtime and library versions
are shown under **Options > About LexPen**.

## Open .md files with LexPen

`register.ps1` registers the published exe as a handler for `.md` files for the current user (no admin needed):

```powershell
.\register.ps1            # register .\publish\LexPen.exe
.\register.ps1 -Exe C:\Tools\LexPen\LexPen.exe
.\register.ps1 -Remove    # undo
```

Windows only lets the user choose the default app, so if another app already owns `.md` the script
opens **Settings > Default apps** where you pick LexPen.

## Front-end libraries

The libraries in `web/vendor` are checked in, so a normal build needs no Node.js.
To upgrade them:

```powershell
npm.cmd install           # versions come from package.json
.\vendor.ps1              # rebuilds web\vendor from node_modules
```

`vendor.ps1` bundles the files into a few loads: `core.js` (markdown-it, plugins, highlight.js with its common
languages plus PowerShell; always loaded), `editor.js`/`editor.css` (CodeMirror with markdown, JSON, YAML,
PowerShell and C# modes and the search, comment and fold add-ons; loaded when the editor is first shown), and
`katex/` and `mermaid.min.js` (loaded only when a document contains math or diagrams). It also writes
`versions.json` for the About window.

## Project layout

| Path | Contents |
|---|---|
| `Program.cs` | Entry point: single instance (mutex + named pipe), hands the arguments to the running instance |
| `AppHost.cs` | Owns the windows: routing launches, projects and sessions, edit locks, moving tabs, settings, clipboards, bookmarks |
| `ProjectStore.cs` | Projects and their windows (`projects.json`): sessions, places, desktops, the closing rules (unit tested) |
| `VirtualDesktop.cs` | Windows' virtual desktops (IVirtualDesktopManager): a window's desktop, moving it back |
| `Router.cs` | Which window gets which paths of a launch (pure, unit tested) |
| `DraftStore.cs` | Drafts (`Drafts\editN.md`), written in the background |
| `TextFile.cs` | Reading and writing files in their own encoding; the backup on save |
| `KeysFile.cs` | `keys.json`: the default set merged with the user's own |
| `ClipboardStore.cs` | Clipboards 1 to 9 (`clipboards.json`) |
| `BookmarkStore.cs` | Bookmarks of closed files (`bookmarks.json`), found again by their line text |
| `Fonts.cs` | The installed fonts for the font settings, monospaced or not |
| `SettingsFile.cs` | `settings.json`: the defaults merged with yours, problems, only differences written |
| `SettingsForm.cs` | The settings window (`web/settings.html`, `settings.js`) |
| `WebFiles.cs` | The page's files: served from the exe (a debug build: from the project's `web`) |
| `LanguagePacks.cs` | Language packs: shipped and yours, YAML read with YamlDotNet, given to the page as JSON |
| `ThemeFile.cs` | Themes: shipped and yours, checked, bases followed; colour names and fallbacks from app.css |
| `DataFolder.cs` | The data folder's layout (`State\`) and the one-time move of an older layout |
| `MainForm.cs` | One window: WebView2 host, message handling, file access, watchers, git, close prompt |
| `Formatters.cs` | The former pretty print of JSON and XML (unit tested); not used since Format is `web/reformat.js` |
| `tests/LexPen.Tests` | Unit tests |
| `web/` | The page (built into the exe as resources; a debug build serves this folder, so an edit applies on a reload) |
| `web/index.html` | The UI page and its Content Security Policy |
| `web/app.js` | Documents, tabs and panes, rendering, editor, sidebar, bottom bar |
| `web/keys.js` | Key presses and chords |
| `web/actions.js` | The actions; the language packs |
| `web/menus.js`, `palette.js` | The menu bar; F1 |
| `web/format.js`, `bookmarks.js`, `gutter.js`, `find.js` | Editor commands and the bars; bookmarks; the gutter; find in a pane |
| `web/tabs.js`, `convert.js`, `column.js` | Tab and indent stops; conversions, trim on save and Format (the parts per language); column mode |
| `web/reformat.js` | The formatter: one engine for every language, the parameters from the pack's `format:` (a port of `docs/plans/reformat-prototype`) |
| `web/app.css` | Styling; fallback theme colours |
| `web/vendor/` | Bundled third-party libraries (generated by `vendor.ps1`) |
| `defaults/` | Copied next to the exe: `keys.json` and `settings.json` (the defaults), `languages/` (the language packs), `themes/` |
| `img/icon/` | App icon: `lexpen.ico` (`lexpen.svg` is its source, `make-ico.ps1` rebuilds `lexpen.ico` and `lexpen.png`) |
| `demo.md` | Formatting showcase |
| `register.ps1` | `.md` file association |
| `vendor.ps1` | Rebuilds `web/vendor` |

`%LOCALAPPDATA%\LexPen` holds what you choose: `settings.json` (only what differs from the defaults), `keys.json`,
`favourites.json`, `favourite-folders.json`, `tab-colours.json`, `themes\`, `languages\`. What LexPen remembers by itself is in its `State\` subfolder: `state.json`
(recent lists, the fallback window position), `projects.json` (every project and window: tabs and panes, the folder pane's open folders and scroll position, each
tab's cursor and scroll position, the window's place and desktop; an older `session.json` became project 1),
`Drafts\`, `clipboards.json`,
`bookmarks.json` and `EBWebView\` (the browser's own data). An older layout is moved over once at start
(DataFolder.cs). Set the environment variable `LEXPEN_DATA` to use another folder (for testing).
