# Plan: text conversions and formatters (tabs, case, pretty print JSON / XML)

Status: plan, 2026-10-20. Replaces the draft of 2026-10-19 (formatters, Q7 of executed/PLAN-language-packs.md).

## 1. What this is about

Text cannot be tidied in LexPen. Asked for:

- **Conversions**, in every language: tabs to spaces; the case of the selected text: upper, lower, smart
  capitalize (after `.` and `:`), snake_case, and the like. As actions (keys, F1) and on the bar above the editor.
- **Pretty print (reformat)** for JSON and XML: a minified response (one line of 241,477 characters was the
  example in the draft) indented and readable.
- Both on the selection when there is one, else on the whole file.
- **The Format menu** shows the markdown items always, whatever the language. Asked (2026-10-20): the Format menu
  holds what the bar holds, for the language you are in, plus the conversions (case and the like).

## 2. The solution, in brief

The conversions are actions of the plain text pack, so every language has them; the bar gets one "Convert" button
that opens a short menu with them (all bars: code and markdown). Pretty print is an action per language, `format`,
which JSON and XML have; the host does the work (the .NET JSON and XML readers), keeps every value exactly as
written, and changes nothing when the text does not parse. Every conversion and format is one undo step.

The Format menu is built when it opens, from the file's language bar: markdown's items in markdown, a pack's
`bar.yaml` items in code, then the conversions and Format. Comments stay at the top for every language. On a line
of another language its bar's items come in a submenu under that language's name (`JSON`).

## 3. Details

### 3.1 Conversions (every language)

Actions of the plain text pack, so a language inherits them (and can override one):

| Action | Does |
|---|---|
| `tabsToSpaces` | Every tab to spaces, to the next tab stop (tab size 4, the editor's) |
| `trimTrailing` | Spaces and tabs at the end of the lines removed (3.1.2) |
| `upperCase` | UPPER CASE |
| `lowerCase` | lower case |
| `capitalize` | Smart capitalize: the first letter of a word after `.` or `:` upper, and of the first word when nothing comes before it or a `.` or `:` does; the rest unchanged (3.1.1) |
| `snakeCase` | snake_case: words split at spaces, `-`, `_` and lower-to-upper (`fileName` -> `file_name`) |
| more | per question 4.2: camelCase, PascalCase, kebab-case, CONSTANT_CASE |

- With a selection: the selected text (several selections: each). Without one: tabs to spaces does the whole
  file; the case actions do the word at the cursor (question 4.3).
- The selection stays on the converted text.
- A read-only tab: nothing changes, the usual message.
- A new action kind in the packs, `convert: upper` (and so on), so a pack can put them on its bar or give them a
  key like the other kinds (README in languages\).

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
  selection stay on the same text. In the Convert menu (3.2), F1 and with a key.
- **On save** (setting `trimOnSave`, Options > Settings > Editor, default on): the same for the whole file just
  before it is written, as part of the save (one undo step of its own, so Ctrl+Z after a save gives the spaces back
  without undoing anything else). Drafts and Save as too.
- Line ends (CRLF / LF) and a missing or present line break at the end of the file stay as they are; only the
  spaces and tabs before them go.
- A read-only tab is never changed; a file that only differs by trailing whitespace is still saved (its timestamp
  changes, as with any save).
- Markdown, where two spaces at a line's end are a hard line break: question 4.9. Lines you did not touch:
  question 4.10.

### 3.2 The bar

- One button, "Convert" (an `Aa` icon), opens a menu with the conversions and their keys, as the formatting bar's
  heading and list buttons do now. It goes on every bar: the code bar of every pack (from plain text, so the
  packs' `bar.yaml` files do not each need it) and the markdown formatting bar.
- A pack with `format` gets a "Format" button next to it (JSON, XML).
- `bar.yaml` gets a way to place them: `- { action: convert, icon: case }` for the menu; without it they go at the
  end of the bar (question 4.4).

### 3.3 Pretty print (JSON, XML)

- An action `format` in the json and xml packs (kind `format: json` / `format: xml`), on their bar, in F1, and a
  key (proposal Ctrl+Alt+F; question 4.5).
- The page sends the text (selection or whole file) to the host; the host returns the formatted text or an error.
  Off the page, so a large file does not hold up the window.
- **JSON**: `System.Text.Json` (`JsonDocument`, written back indented by `Utf8JsonWriter`). Numbers and strings
  are written as they were: `1.0` stays `1.0`, a long number keeps its digits, `\u00e9` and `"` stay as written
  (the relaxed encoder, checked by tests). Key order kept. Comments: question 4.6.
- **XML**: `XDocument` (or a fragment for a selection), written back by `XmlWriter` with indenting. Comments,
  processing instructions and CDATA kept; the declaration kept when there was one. Text inside an element with
  mixed content (text and elements) is not re-indented, so text does not change.
- **Indent**: 2 spaces, or a tab when the file is indented with tabs (question 4.7).
- **Selection**: formatted when it is a whole JSON value / whole XML elements on its own; the lines keep the
  indentation the selection started at. A selection that does not parse on its own: nothing changes, message.
- **Errors**: the text is not changed; the message says where it failed (line and column of the selection or
  file), and the cursor goes there.
- Line ends: the file's own (CRLF or LF).

### 3.6 The Format menu

- Filled when it opens (as Projects is): the file's language gives the items; the language of the cursor's line
  (`lineLanguage`) adds a submenu when it is another one.
- **Order**: Toggle comment, Toggle block comment, Remove block comment (every language, as now; they already act
  in the cursor line's language); a line; the file's language bar items; a line; Convert (a submenu with the
  conversions of 3.1); Format (3.3) when the language has it.
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
- **Code**: each `bar.yaml` item as a menu item with the action's title and key; `'-'` becomes a line. Items
  that are already in the comment group are left out (most bars start with Toggle comment). A language without
  `bar.yaml`: the comment group and Convert only.
- **Preview**: the menu as for the file's language; the items are dimmed (the editor is not active), as now.
- Letters (`&`): fixed ones for the comment group, Convert and Format; the bar items get the first free letter
  of their title (question 4.12).

### 3.4 Tests

- Unit (host): JSON with long numbers, `1.0`, escapes, unicode, nested empty arrays and objects, comments (per
  4.6); invalid JSON gives line and column. XML with comments, CDATA, mixed content, a declaration; a fragment.
- In-app (trailing whitespace): the action on a selection and on the whole file; save with `trimOnSave` on and off;
  Ctrl+Z after the save gives the spaces back; CRLF and LF kept; markdown per 4.9.
- In-app (Format menu): markdown shows its items; a .sql file shows the asa bar items and no markdown items; the
  cursor in the JSON block of a .sql file adds a submenu `JSON` with the json bar items, which act as JSON, and
  outside the block that submenu is gone; Convert opens its submenu; an item runs its action.
- In-app: each conversion on a selection, on several selections and without one; one undo restores; read-only
  tab untouched; the Convert menu on a code bar and the markdown bar; Format on a minified JSON file and on a
  selection inside it; the error message and cursor on broken JSON.

### 3.5 Docs

README (Editing), languages\README.md (the `convert` and `format` kinds, the Convert button), HANDOFF.

## 4. Open questions

4.2 **Which case styles.** Upper, lower, smart capitalize, snake_case asked. Add camelCase, PascalCase, kebab-case and
CONSTANT_CASE (all common in code)? Recommendation: yes.

4.3 **A case action without a selection.** The word at the cursor, or nothing? Recommendation: the word at the
cursor (as most editors do). Tabs to spaces without a selection: the whole file, as asked.

4.4 **Placing the buttons.** The Convert button (and Format) on every bar at a fixed place (the end), or placed by
each pack's `bar.yaml`? Recommendation: at the end by default; a pack may place them itself.

4.5 **Keys.** Proposal: Format Ctrl+Alt+F; Upper Ctrl+Shift+U, lower Ctrl+U (as Visual Studio); the others no key
(F1 and the menu). Any keys you already use for these in UltraEdit?

4.6 **JSON with comments** (`.jsonc`, LexPen's own `keys.json`, `settings.json`). Refuse to format (comments
would be lost), or keep the comments (needs a formatter of our own instead of `JsonDocument`)? Recommendation:
refuse with a message for now; a comment-keeping formatter later if needed.

4.7 **Indent.** 2 spaces fixed, the file's own (tabs when it uses tabs, else the most common step), or a setting
per language? Recommendation: the file's own, 2 spaces for a file with no indentation (minified).

4.8 **Also spaces to tabs** (the reverse of tabs to spaces, at the start of lines)? Not asked; recommendation: not
now.

4.9 **Markdown hard line breaks.** In markdown, two (or more) spaces at the end of a line make a line break inside a
paragraph (GitHub, and LexPen's preview with "line breaks" off). Removing them changes the text's look. Options:
leave exactly two spaces alone on a line followed by more paragraph text, in markdown only; or no trim on save in
markdown at all; or trim everything (your choice per file then: the `\` at the end of a line is the other way to
write a hard break). Recommendation: in markdown, leave a run of two or more spaces alone when the next line goes
on with the paragraph; remove all other trailing whitespace.

4.10 **The whole file, or only the lines you changed.** Trim on save over the whole file also changes lines you did
not touch, which shows up in git as changes you did not make (in a file of someone else's, or an old one). Only
the changed lines (the gutter's change markers know them) avoids that. Recommendation: only the changed lines on
save; the action itself (3.1.2) does what you select, or the whole file.

4.11 **Build the Format menu now or with the conversions.** The menu change (3.6) does not need the conversions:
it can go in first with the comment group and the bar items, and Convert joins when 3.1 is built.
Recommendation: first, on its own.

4.12 **Letters for bar items.** The first free letter of the title (automatic, may differ per language), or a
`key letter` in `bar.yaml` (`letter: s`)? Recommendation: automatic; `letter:` only if one turns out awkward.

4.13 **Items of the bar that are not on the bar.** Some actions of a pack have a key but no bar button (snippets,
say). Only the bar's items in the menu, or every action of the pack? Recommendation: only the bar's items; F1
lists every action.
