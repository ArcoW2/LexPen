# Plan: text conversions and formatters (tabs, case, pretty print JSON / XML)

Status: plan, 2026-10-20. Replaces the draft of 2026-10-19 (formatters, Q7 of executed/PLAN-language-packs.md).

## 1. What this is about

Text cannot be tidied in LexPen. Asked for:

- **Conversions**, in every language: tabs to spaces; the case of the selected text: upper, lower, first letter
  upper, snake_case, and the like. As actions (keys, F1) and on the bar above the editor.
- **Pretty print (reformat)** for JSON and XML: a minified response (one line of 241,477 characters was the
  example in the draft) indented and readable.
- Both on the selection when there is one, else on the whole file.

## 2. The solution, in brief

The conversions are actions of the plain text pack, so every language has them; the bar gets one "Convert" button
that opens a short menu with them (all bars: code and markdown). Pretty print is an action per language, `format`,
which JSON and XML have; the host does the work (the .NET JSON and XML readers), keeps every value exactly as
written, and changes nothing when the text does not parse. Every conversion and format is one undo step.

## 3. Details

### 3.1 Conversions (every language)

Actions of the plain text pack, so a language inherits them (and can override one):

| Action | Does |
|---|---|
| `tabsToSpaces` | Every tab to spaces, to the next tab stop (tab size 4, the editor's) |
| `upperCase` | UPPER CASE |
| `lowerCase` | lower case |
| `capitalize` | First letter of each word upper, the rest unchanged (question 4.1) |
| `snakeCase` | snake_case: words split at spaces, `-`, `_` and lower-to-upper (`fileName` -> `file_name`) |
| more | per question 4.2: camelCase, PascalCase, kebab-case, CONSTANT_CASE |

- With a selection: the selected text (several selections: each). Without one: tabs to spaces does the whole
  file; the case actions do the word at the cursor (question 4.3).
- The selection stays on the converted text.
- A read-only tab: nothing changes, the usual message.
- A new action kind in the packs, `convert: upper` (and so on), so a pack can put them on its bar or give them a
  key like the other kinds (README in languages\).

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

### 3.4 Tests

- Unit (host): JSON with long numbers, `1.0`, escapes, unicode, nested empty arrays and objects, comments (per
  4.6); invalid JSON gives line and column. XML with comments, CDATA, mixed content, a declaration; a fragment.
- In-app: each conversion on a selection, on several selections and without one; one undo restores; read-only
  tab untouched; the Convert menu on a code bar and the markdown bar; Format on a minified JSON file and on a
  selection inside it; the error message and cursor on broken JSON.

### 3.5 Docs

README (Editing), languages\README.md (the `convert` and `format` kinds, the Convert button), HANDOFF.

## 4. Open questions

4.1 **"First upper".** Each word starts with a capital (`the quick fox` -> `The Quick Fox`), or only the first
letter of the selection (`The quick fox`)? Recommendation: both, as "Capitalize Each Word" and "Sentence case".

4.2 **Which case styles.** Upper, lower, first upper, snake_case asked. Add camelCase, PascalCase, kebab-case and
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
