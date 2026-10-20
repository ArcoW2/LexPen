# Plan: text conversions and formatters (case, tabs, trailing whitespace, pretty print, the Format menu)

Status: plan, 2026-10-20; answers of 2026-10-20 worked in (4.2 to 4.13). Replaces the draft of 2026-10-19
(formatters, Q7 of executed/PLAN-language-packs.md).

## 1. What this is about

Text cannot be tidied in LexPen, and the Format menu does not fit the language you are in. Asked for:

- **Conversions**, in every language: the case of the text (upper, lower, smart capitalize after `.` and `:`,
  snake_case, camelCase, PascalCase, kebab-case, CONSTANT_CASE), tabs to spaces and spaces to tabs, trailing
  whitespace removed (also on save). As actions (keys, F1), on the bar above the editor and in the Format menu.
- **Pretty print (reformat)** for JSON and XML: a minified response (one line of 241,477 characters was the
  example in the draft) indented and readable; JSON comments kept when you want them.
- **The Format menu** shows the markdown items always, whatever the language. It should hold what the bar holds,
  for the language you are in (with the icons), plus the conversions; an embedded language's items in a submenu.
- **Tab**: always shifts the whole line (a tab cannot be put halfway a line), and always as spaces, while some
  languages need a real tab. The tab size should be a setting.

## 2. The solution, in brief

The conversions are actions of the plain text pack, so every language has them; every bar gets a "Convert" button
with a short menu of them, at the end unless the pack places it. Pretty print is an action per language, `format`,
which JSON and XML have; the host does the work, keeps every value exactly as written, asks whether to keep JSON
comments, and changes nothing when the text does not parse. Every conversion and format is one undo step.

The Format menu is built when it opens from the same list as the bar, icons included: the comment group, the
file's language bar items, Convert and Format; on a line of another language its items follow in a submenu under
that language's name. Ctrl+Alt+F opens the same menu at the cursor. Tab size and indent size become two settings,
a language can ask for real tabs; Tab in a line's indentation goes to the next indent stop, Tab after text to the
next tab stop.

## 3. Details

### 3.1 Conversions (every language)

Actions of the plain text pack, so a language inherits them (and can override one):

| Action | Does |
|---|---|
| `upperCase` | UPPER CASE (key Ctrl+Shift+U) |
| `lowerCase` | lower case (key Ctrl+U) |
| `capitalize` | Smart capitalize (3.1.1) |
| `snakeCase` | snake_case: words split at spaces, `-`, `_` and lower-to-upper (`fileName` -> `file_name`) |
| `camelCase` | camelCase (`file name` -> `fileName`) |
| `pascalCase` | PascalCase (`file name` -> `FileName`) |
| `kebabCase` | kebab-case (`fileName` -> `file-name`) |
| `constantCase` | CONSTANT_CASE (`fileName` -> `FILE_NAME`) |
| `tabsToSpaces` | Every tab to spaces, as wide as it is shown (3.4: in the indentation to the next indent stop, after text to the next tab stop) |
| `spacesToTabs` | The indentation at the start of each line to tabs, one tab per whole indent step (3.4); the rest stays spaces. Spaces inside a line are left alone (they line things up, a tab would not) |
| `trimTrailing` | Spaces and tabs at the end of the lines removed (3.1.2) |

- With a selection: the selected text (several selections, or a block of column mode: each). Without one: the
  case actions do the word at the cursor; tabs to spaces, spaces to tabs and trim do the whole file.
- The selection stays on the converted text.
- A read-only tab: nothing changes, the usual message.
- Keys: Ctrl+Shift+U and Ctrl+U; the others have no key (the Convert menu, the Format menu, Ctrl+Alt+F, F1).
- A new action kind in the packs, `convert: upper` (and so on), so a pack can put one on its bar on its own or
  give it a key like the other kinds (README in languages\).

### 3.1.1 Smart capitalize

- Every word after a `.` or `:` gets a capital first letter: `done. next: item` -> `done. Next: Item`. Spaces and line
  breaks between the sign and the word do not matter.
- The first word gets one too when nothing comes before it, or a `.` or `:` does. "Before it" is the text before
  the word on its line and above it, also outside the selection: a selection that starts mid-sentence (after a
  comma, say) keeps its first word as it is. At the start of the file, or after an empty line: capital.
- Only the first letter changes; the rest of each word stays as it is (`iPhone` after a `.` becomes `IPhone`:
  accepted, it follows the rule).
- A `.` inside a number or a name (`1.5`, `file.txt`) is followed by no space and so starts no new word: a word
  counts as "after a `.`" only with at least one space or line break between them. An abbreviation with a space
  after it (`e.g. this`) does count: `e.g. This`.

### 3.1.2 Trailing whitespace

- **The action** `trimTrailing` ("Remove whitespace at line ends"): spaces and tabs at the end of every line of the
  selection (the lines it touches, whole), or of the whole file without one. One undo step; the cursor and the
  selection stay on the same text. In the Convert menu, the Format menu, F1, and with a key of your own.
- **On save** (setting `trimTrailing`, Options > Settings > Editor, default on): on, the same for the **whole
  file** just before it is written, as part of the save (one undo step of its own, so Ctrl+Z after a save gives the
  spaces back without undoing anything else); drafts and Save as too. Off: every space is kept.
- **Per language** (`language.yaml`, `trimTrailing`):
  - `mode`: `setting` (the default: on save as the setting says), `true` (always trimmed on save, whatever the
    setting), `false` (never trimmed, not on save and not by the action, which says so).
  - `keep: N`: at most N spaces or tabs are left at a line's end, as they were written (more become N; fewer stay).
    Without it all go.
  - Short forms: `trimTrailing: false` / `trimTrailing: true` set the mode only; `trimTrailing: { keep: 2 }` keeps
    the mode `setting`.
  - Markdown ships with `trimTrailing: { keep: 2 }`: two spaces at a line's end are a hard line break there
    (CommonMark, GitHub), so someone else's file keeps its line breaks. Your own pack can set `keep` off.
- Line ends (CRLF / LF) and a missing or present line break at the end of the file stay as they are; only the
  spaces and tabs before them go.
- A read-only tab is never changed; a file that only differs by trailing whitespace is still saved (its timestamp
  changes, as with any save).

### 3.2 The bar

- One button, "Convert" (an `Aa` icon), opens a menu with the conversions of 3.1 and their keys, as the
  formatting bar's heading and list buttons do now. It goes on every bar: the code bar of every pack and the
  markdown bar.
- A pack with `format` gets a "Format" button next to it (JSON, XML).
- **Place**: at the end of the bar by default. A pack's `bar.yaml` places them itself by naming them:
  `- { action: convert, icon: case }`, `- { action: format, icon: format }`; then they are not added at the end.
- The Format menu (3.6) follows the bar's order, so a pack that moves Convert moves it in the menu too.

### 3.3 Pretty print (JSON, XML)

- An action `format` in the json and xml packs (kind `format: json` / `format: xml`): on their bar, in the Format
  menu, in F1. No key of its own: Ctrl+Alt+F opens the menu with every formatting option (3.6).
- The page sends the text (selection or whole file) to the host; the host returns the formatted text or an error.
  Off the page, so a large file does not hold up the window.
- **JSON**: a formatter of LexPen's own (C#): it reads the text as tokens (strings, numbers, `true` / `false` /
  `null`, brackets, commas, colons, `//` and `/* */` comments) and writes them back indented. Every token is
  copied as written: `1.0` stays `1.0`, a long number keeps its digits, the escape `\u00e9` and `"` stay as written, key
  order is kept. It checks the structure as it goes (brackets, commas, colons), so a mistake gives its line and
  column.
- **JSON comments**: when the text has comments, LexPen asks first: "Keep the comments?" Yes keeps them (each on
  its own line at the indentation of what follows, or after the value on the same line when it was there), No
  removes them, Cancel changes nothing. Without comments: no question.
- **XML**: `XDocument` (or a fragment for a selection), written back by `XmlWriter` with indenting. Comments,
  processing instructions and CDATA kept; the declaration kept when there was one. Text inside an element with
  mixed content (text and elements) is not re-indented, so text does not change.
- **Indent**: one indent step of the language (3.4): a tab where the language uses tabs, else the indent size in
  spaces.
- **Selection**: formatted when it is a whole JSON value / whole XML elements on its own; the lines keep the
  indentation the selection started at. A selection that does not parse on its own: nothing changes, message.
- **Errors**: the text is not changed; the message says where it failed (line and column of the selection or
  file), and the cursor goes there.
- Line ends: the file's own (CRLF or LF).

### 3.4 Tab and indent

- **Two settings** (Options > Settings > Editor): `tabSize`, where the tab stops are, and `indentSize`, where the
  indent stops are (defaults 4 and 2, as today). A pack can set its own (`tabSize: 8`, `indentSize: 2` in
  `language.yaml`), which wins for that language.
- **Indent stops in the indentation, tab stops after text.** In a line's indentation (only spaces and tabs before
  it) the stops are indent stops; after the first other character they are tab stops. This holds for the Tab key
  and for showing a tab: a tab in the indentation is shown up to the next indent stop, a tab after text up to the
  next tab stop.
- **Tabs or spaces**: a pack says `useTabs: true` for a language that needs real tabs (Makefile, Go, tab-separated
  files); then Tab, indent and pretty print write a tab. Without it: spaces, as now, as many as reach the stop
  (indentation of 2 with indent size 4: Tab adds 2).
- **The Tab key**:
  - Cursor in the indentation (or at the start of the line): the line is indented to the next indent stop; Shift+Tab
    outdents it to the one before.
  - Cursor after text: a tab, or spaces to the next tab stop, at the cursor, also halfway a line.
  - Lines selected: Tab / Shift+Tab indent / outdent them one indent step (as now).
  - Markdown keeps Tab in a table moving to the next cell, and in a list item indenting the item.
- **Showing a tab two ways**: CodeMirror 5 draws every tab with one width (its `tabSize`). A tab in the
  indentation drawn to the indent stop needs LexPen's own drawing of those tabs, and everything that counts columns
  (the column in the bottom bar, column mode, tabs to spaces) has to count with the same rule. Where indent size
  and tab size are equal nothing changes. This is the part of the plan with the most risk; it is built and tested
  first.

### 3.6 The Format menu

- Filled when it opens (as Projects is): the file's language gives the items; the language of the cursor's line
  (`lineLanguage`) adds a submenu when it is another one.
- **Order**: Toggle comment, Toggle block comment, Remove block comment (every language, as now; they already act
  in the cursor line's language); a line; the file's language bar items, in the bar's order, Convert and Format
  among them where the bar has them (3.2: at the end unless the pack placed them). Convert is a submenu with the
  conversions of 3.1.
- **Icons**: each item shows its bar icon in front of the title (the same SVG as the button), so you recognise it
  from the bar. Items without an icon (a label only) show none.
- **On a line of another language** (a block, a fence, lines you set): after the file's items a submenu named
  after the inner language (`JSON`, `SQL`), the same name as the inner bar shows. It holds that language's bar
  items, built the same way, and they act in that language (`runAction` with `ctx.language`, as the inner bar's
  buttons do). Its Format (3.3) formats the block. Outside such a line: no submenu.
- **One list for bar and menu.** Today a menu item and a bar button run the same action (`runAction`), but the
  lists are separate and hard coded: the Format menu in `menus.js` (MENUS), the markdown bar in `format.js`
  (barHtml); only the code bars come from data (`bar.yaml`). Markdown's bar becomes a data list too (its items,
  the Heading and Table submenus, separators), and both the bar and the menu are built from it; MENUS loses its
  fixed Format list. A change to a bar then shows in the menu by itself.
- **Markdown**: the same items as now (bold ... table), in the bar's order; Heading and Table as submenus (the
  table grid stays bar-only; the menu keeps Insert table 3 x 2 as now).
- **Code**: each `bar.yaml` item as a menu item with the action's title, icon and key; `'-'` becomes a line.
  Items that are already in the comment group are left out (most bars start with Toggle comment). A language
  without `bar.yaml`: the comment group and Convert only.
- **Only the bar's items**: an action of a pack with a key but no bar button (a snippet, say) is not in the
  menu; F1 lists every action.
- **Preview**: the menu as for the file's language; the items are dimmed (the editor is not active), as now.
- **Letters** (`&`): fixed ones for the comment group, Convert and Format; a bar item gets the first free letter
  of its title, or the one `bar.yaml` gives it (`letter: s`), which wins.
- **Ctrl+Alt+F**: the same menu as a popup at the cursor (every formatting option for where you are, the inner
  language's submenu included).

### 3.7 Tests

- Unit (host): JSON with long numbers, `1.0`, escapes, unicode, nested empty arrays and objects; comments kept
  (line and block, before and after a value) and removed; invalid JSON gives line and column. XML with comments,
  CDATA, mixed content, a declaration; a fragment.
- In-app (trailing whitespace): the action on a selection and on the whole file; save with the `trimTrailing` setting on and off;
  Ctrl+Z after the save gives the spaces back; CRLF and LF kept; the setting off keeps all; the language modes
  `setting`, `true`, `false`; `{ keep: 2 }` with spaces and with tabs.
- In-app (Format menu): markdown shows its items with icons; a .sql file shows the asa bar items and no markdown
  items; the cursor in the JSON block of a .sql file adds a submenu `JSON` with the json bar items, which act as
  JSON, and outside the block that submenu is gone; Convert opens its submenu; an item runs its action; a pack
  that places Convert gets it there in bar and menu; `letter:`; Ctrl+Alt+F opens the menu at the cursor.
- In-app (conversions): each on a selection, on several selections, on a block and without one; one undo restores;
  read-only tab untouched; tabs to spaces and spaces to tabs with tab size 4 and 2.
- In-app (pretty print): a minified JSON file, a selection inside it, JSON with comments (the question, both
  answers), the error message and cursor on broken JSON; XML.
- In-app (Tab): Tab in the indentation goes to the next indent stop, after text to the next tab stop, with spaces
  and with `useTabs: true`; Shift+Tab in the indentation; lines selected; a tab in the indentation and one after
  text shown at their widths with indent size 2 and tab size 4; the bottom bar column and column mode count the
  same; the pack's own sizes win over the settings.

### 3.8 Docs

- README (Editing: conversions, pretty print, trailing whitespace, Tab), HANDOFF.
- languages\README.md: the `convert` and `format` kinds; `trimTrailing` (mode, keep), `tabSize`, `indentSize`,
  `useTabs`; and a full
  reference of `bar.yaml` (every key: `action`, `icon`, `label`, `letter`, the separator, placing `convert` and
  `format`, what goes into the Format menu and in which order), with an example per key. The pack files grow;
  each option is explained where it is used, in the template too (`_template`).

## 4. Open questions

None.
