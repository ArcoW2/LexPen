# Plan: editor help (formatting bar and editing commands)

Status: being built on branch `feature/next-features`. Section 6 holds your answers; section 8 records what was decided or found during the build.

## 1. What this is about

Writing markdown in Edit and Split mode is all typing. Ctrl+B and Ctrl+I exist (they wrap the
selection in `**` / `*`), Enter continues a list, and that is it. Asked for:

- more editor help: shortcuts for the common markdown constructs, help with tables;
- a bar with icons for lists, tables, headings, bold, italic, code, and the like.

## 2. The solution, in brief

One set of formatting commands in the page, working on the CodeMirror selection, each reachable from a
keyboard shortcut and from a formatting bar. The bar sits at the top of each pane's editor, is on by
default, appears when the editor does (Edit or Split) for markdown documents, and can be switched off in
the More menu. Commands toggle: applied twice, they undo themselves. Tables get Tab / Shift+Tab between
cells, Shift+Enter for a `<br>` inside a cell, and a "format table" command that lines up the columns.

Constraint (your main importance): the app must still start quickly in Read mode. All of this loads
together with the editor, which is already loaded only when Edit or Split is first used; Read mode
loads and runs nothing new.

## 3. The commands

Inline. With a selection: the selected text gets the marks (or loses them when it already has them).
Without a selection: the marks are inserted with the cursor between them, ready to type:

| Command | Markdown | Shortcut |
|---|---|---|
| Bold | `**text**` | Ctrl+B (exists; becomes a toggle) |
| Italic | `*text*` | Ctrl+I (exists; becomes a toggle) |
| Strikethrough | `~~text~~` | Ctrl+Shift+X |
| Inline code | `` `text` `` | Ctrl+` |
| Link | `[text](url)`, cursor in the url; a URL on the clipboard is filled in when the page can read it without a prompt | Ctrl+K |
| Image | `![text](path)`, via a file picker, through the existing image code (copy or link as decided in P1-P3) | - (bar only) |

Line commands (act on every line the selection touches; toggle off when all lines already have it):

| Command | Markdown | Shortcut |
|---|---|---|
| Heading 1-6 | `# ` ... `###### `; replaces another level, the same level removes it | Ctrl+1 ... Ctrl+6 |
| Plain text | removes heading / list / quote prefix | - |
| Bulleted list | `- ` | Ctrl+Shift+8 |
| Numbered list | `1. `, `2. `, ... | Ctrl+Shift+7 |
| Task list | `- [ ] ` | Ctrl+Shift+9 |
| Quote | `> ` | Ctrl+Shift+. |

Block commands:

| Command | What it does | Shortcut |
|---|---|---|
| Code block | Wraps the lines in a fence; empty: a fence with the cursor after the opening backticks, to type the language | Ctrl+Shift+` |
| Table | Inserts a table; size from a small grid picker on the bar (as in Word), default 3 x 2 | - (bar only) |
| Horizontal rule | `---` on its own line, with blank lines around it | - |

Table editing (only when the cursor is in a table row):

| Key / command | What it does |
|---|---|
| Tab / Shift+Tab | Next / previous cell, selecting its text. Tab in the last cell adds a row |
| Enter at the end of a row | New row below |
| Shift+Enter | Inserts `<br>`: a line break inside the cell (a real line break would end the table). Does the same outside tables |
| Format table (bar only) | Pads the cells so the `|` line up; keeps the alignment colons in the separator row |
| Add / remove row and column | Through the bar's table menu |

Outside a table Tab and Shift+Tab keep indenting, as now.

## 4. The formatting bar

- One bar per pane, above the editor, inside the editor pane. In Split mode it spans the editor half only.
- On by default. Appears when the editor appears (Edit or Split). Hidden in Read mode, for code files (json, yaml, ...) and when switched off (More > Formatting bar,
  remembered, like "Tabs on several rows").
- Groups, left to right: B I S code | H (menu H1-H6, plain text) | bullets, numbers, tasks, quote |
  link, image, table (grid picker plus a menu with format / rows / columns), code block, rule.
- Icons: inline SVG in the page (no icon font, no extra vendor files; the CSP allows it). Each button
  has a tooltip with its name and shortcut. Buttons show as active when the cursor sits in bold text,
  a heading, a list, and so on (from the CodeMirror tokens at the cursor).
- A click must not take the focus from the editor, so the commands act on the selection the user sees.
- The help window (F1) gets a "Formatting" section with all shortcuts.

## 5. How it is built

- Startup: the commands, the table code and the bar (markup and SVG icons) live in a new
  `wwwroot/format.js`, loaded by `loadEditor()` next to `vendor/editor.js`. `app.js` only keeps the
  hook that calls it, and `index.html` gets no bar markup; the bar is built when a pane's editor is
  first created (`ensureEditor`). Starting in Read mode therefore parses no new code and builds no new
  DOM. The bar's CSS rules go in `app.css` (a few selectors; no effect until the bar exists).
- Each command works on every
  selection range (CodeMirror multi-cursor) and is one undo step (`editor.operation`).
- Keys go in the editor's `extraKeys` through `markdownOnly`, so in code files the keys stay as they
  are now. The window shortcuts (`shortcuts` map) are only reached when the editor does not use the key.
- "Is this text already bold?" is decided on the characters around the selection, not on tokens, so it
  also works directly after typing. Bold vs italic: `***x***` and `*x*` inside `**...**` need care;
  covered by tests.
- Table detection: the cursor line starts with `|` (after spaces), or is part of a block whose second
  line is a separator row. Column widths for "format table" count characters; wide characters (CJK,
  emoji) will be off by their extra width. Accepted, mentioned in the tooltip only if it bothers.
- Image button: opens the host's file dialog and goes through `insertImages`, so the copy / link rules
  and the Shift question are the same as for paste and drop.
- No host (C#) changes, except possibly the file dialog filter for images.
- Ctrl+0: removed from the `shortcuts` map, the zoom button tooltip and the help window.

## 6. Decisions (your answers)

| # | Question | Decision |
|---|---|---|
| Q1 | Bar visible by default? | Yes; it appears with the editor (Edit or Split). Switchable in the More menu |
| Q2 | Ctrl+1 ... Ctrl+6 for headings | Yes. Ctrl+0 (zoom 100%) is not needed: the shortcut is removed; a click on the zoom level in the top bar still resets it. Ctrl+0 is left unassigned |
| Q3 | A shortcut for "format table"? | Proposal accepted: bar only |
| Q4 | Ctrl+K for a link, with the URL from the clipboard | Yes, as proposed: Ctrl+K; the clipboard URL is filled in if the read works without a prompt, else the url stays empty |
| Q5 | Ctrl+Shift+7/8/9 for lists | Proposal accepted: yes |
| Q6 | Numbered list: renumber following items | Proposal accepted: not in this round |
| Q7 | Bar in Read mode? | No |
| - | Shift+Enter | Inserts `<br>` everywhere in markdown (needed inside table cells, allowed elsewhere) |
| - | Ctrl+B / Ctrl+I / etc. | With a selection: change the selected text. Without one: insert the marks, cursor between them (no "word at the cursor") |

## 7. Tests

- The text transforms (toggle bold, headings, lists, table format, cell navigation) are pure functions
  on lines and selections. Driven in the running app through the debugging port (as in `HANDOFF.md`
  section 6): set a text and selection, run the command, compare the text and selection.
  Cases: empty selection, word at cursor, multi-line, multi-cursor, already formatted (toggle off),
  nested bold/italic, headings changing level, mixed list and plain lines, a table with alignment
  colons, a table with escaped `\|`, undo restores in one step.
- Bar: hidden in Read mode and for code files, the More menu toggle remembered, active state follows
  the cursor, a click keeps the editor focus and selection. Screenshots light and dark.
- Code files: Ctrl+B still toggles the sidebar, Tab still indents.
- Startup in Read mode: through the debugging port, check that `format.js` and `editor.js` are not
  loaded and no bar exists after starting on a markdown file. Time from launch to first render
  measured before and after the change (same file, same machine), to show it did not move.

## 8. Resolved issues during execution

| # | Issue | Resolution |
|---|---|---|
| 1 | "Word at the cursor" in section 3 | Dropped, as you decided: without a selection the marks go in at the cursor. Pressed again on the empty pair (`**|**`): the pair goes |
| 2 | Selection over several lines with bold / italic / ... | Each line gets its own marks (a mark cannot span lines); spaces at the ends of the selection stay outside (`** x **` is not bold). The selection keeps covering the text, the marks are outside it, so pressing again removes them |
| 3 | Bold and italic on the same text | Decided on the run of `*`: italic is a run of 1 or 3, bold 2 or 3. Ctrl+I on `**x**` gives `***x***`; Ctrl+B on `***x***` gives `*x*` |
| 4 | Ctrl+K details | A selected URL becomes the target (`[](url)`, cursor in the text). A URL on the clipboard (http, https, mailto, www.) is the target; without one the cursor lands in `()` |
| 5 | Clipboard read for Ctrl+K | Done by the host (`clipboardText`, WinForms `Clipboard.GetText`), as the page's own read may ask for permission. Could not be verified here: the test sandbox blocks all clipboard access (also from PowerShell: access denied). The link command is tested with the read stubbed; when the read fails the link is inserted without a URL |
| 6 | Shift+Enter outside markdown | Code files keep the old behaviour; all format keys pass through there (Ctrl+B still toggles the sidebar, verified with a JSON file) |
| 7 | Table detection | A block of lines with pipes whose second line is a separator row. Lines with a pipe in the paragraph right above the header are not part of the table. Pipes escaped with `\` or inside backticks do not split cells |
| 8 | Add / delete row or column | Done on the parsed table, so the table is also formatted (columns lined up) by these commands. Deleting the header row or the last column is refused with a message |
| 9 | Enter on an empty last row | The row is removed and the table ends there (as in GitHub's editor) |
| 10 | Image button | Opens the host's file dialog (images filter) and goes through `insertImages`: same copy / link rules as paste and drop. The dialog itself was not exercised (native dialog) |
| 11 | Heading button | Shows the level the cursor line has (H1-H6), opens a menu with the six levels and Plain text |
| 12 | Startup in Read mode | Measured with the debug builds of the previous commit and this change, 5 launches each, fresh data folder, launch until the page reports started: same range (warm runs 678-783 ms after vs 756-798 ms before; one run of the old build timed out). Both load only theme.js, app.css, core.js, app.js in Read mode; editor.js and format.js come with the first Edit / Split |
| 13 | Verified | 62 command checks in the running app (inline, headings, lists, quote, code block, rule, table insert / navigation / format / add / delete, undo is one step, read-only does nothing, help lists the keys). All shortcuts with real key events, including Ctrl+Shift+7/8/9/., Ctrl+`, Shift+Enter, Tab in a table. Bar hidden in Read mode and for code files, shown in Edit and Split, the More menu switch remembered, active state for bold / list / table. Screenshots light and dark with both menus. Unit tests pass |
