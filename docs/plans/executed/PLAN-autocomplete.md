# Plan: Word completion

Status: executed 2026-10-22 (web/complete.js, web/words.worker.js; in-app test t100). From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

There is no completion. UltraEdit completes words from the file (Ctrl+Space) and keywords from the word file;
Visual Studio has IntelliSense. LexPen's language packs already know their words (the `words` lists), including
words that stand for a family (`'@*'`: every word starting with `@`), but the editor offers none of them.

## 2. The solution, in brief

Ctrl+Space shows a list of what can complete the word before the cursor: the language's keywords, its snippets,
and the words of the document. A list entry ending in `*` (`'@*'`, `'@@*'`, `'$*'`) is not offered as such: it
brings in every word of the document that starts with it. Enter or Tab inserts. A setting can open the list by
itself after a pause in typing. The document's words are gathered in a background worker and kept up to date in
the background, so typing never waits for them.

## 3. Details

### 3.1 What is in the list

Sources, in this order of rank when they match equally well:

1. **Keywords**: the exact words of the language's `words` lists (all lists: keyword, builtin, type, ...). The
   list's name (its token type) is shown at the right of the entry, dimmed.
2. **Prefix words** (`'@*'`, `'@@*'`, `'@_*'`, Perl's `'$*'`, `'%*'`, `'@*'`): each stands for the words of the
   document that start with the prefix and then go on with word characters (`[\w$]*`, as the highlighter matches
   them). So in SQL, typing `@` and Ctrl+Space lists `@id`, `@count`, ... from the document; `@@` lists only the
   `@@...` ones. The entry shows the list name (`variable`, `global`) as a keyword does.
3. **Document words**: every other word of the document (`[\w$]+`, at least 3 characters long), the word under
   the cursor itself not counted.
4. **Snippets**: the language's `insert` actions (`snippetSelect`: "select"), the name from the title after
   "Snippet: ". Inserted with the cursor at `$0`, as the format bar does (`insertSnippet`, languages.js).

- The language is the one at the cursor (`lineLanguage`, format.js): in a markdown file inside a ```sql block, the
  SQL words.
- Matching: the entries that start with what is before the cursor (the word, with the language's leading signs
  such as `@` or `$` as part of it). Case: as the language says: `caseSensitive: false` matches in any case. Exact
  case matches come first.
- Order: by source as above, then document words by nearness to the cursor (the closest line first), then
  alphabetically. At most 200 entries are drawn; typing narrows the list.
- Case of what is inserted: a keyword in a language with `caseSensitive: false` follows the case of what is typed
  (`SEL` -> `SELECT`, `sel` -> `select`); a document word as it is in the document.
- A word typed once only (the one being typed) is not offered.

### 3.2 The list

- CodeMirror's show-hint addon (5.65.21, appended to `vendor/editor.js` / `editor.css` and listed in `vendor.ps1`, as
  the other addons), with LexPen's own source and
  the theme's colours.
- Up / Down choose, Enter or Tab inserts, Esc closes; typing goes on narrowing it; a character that is not a word
  character closes it. One entry left that is exactly what is typed: the list closes.
- With multiple cursors: the word is inserted at every cursor (each completing its own word start), as typing does.
- Read-only tabs: no list.

### 3.3 Opening by itself

- Setting `completeDelay` in Editor > Completion, a new sub-group (a range, 0 to 2000 ms, step 100; 0: only Ctrl+Space). Default 0.
  Title "Show completions after a pause in typing", hint: "After typing a word character and stopping this long,
  the list of completions opens by itself; 0: only with Ctrl+Space".
- It opens only after a word character was typed (not after a move, a delete or a paste), and only when there is
  at least one entry other than the word itself.

### 3.4 Not stalling the app

- The document's words come from a Web Worker (`web/words.worker.js`): it gets the text and the language's
  prefixes, and answers a word list with, per word, its count and the lines it is on. Its work never blocks typing
  or scrolling.
- Kept per document and refreshed in the background a short while after the last edit (500 ms), at most one
  run at a time; a run that is overtaken by a newer edit is dropped.
- Ctrl+Space never waits: it shows the list from the last word list plus the keywords and snippets at once. The
  words of the lines edited since the last run come from those lines directly (a small piece of text), so a word
  just typed elsewhere is in.
- The keyword lists are built once per language (sorted, with a lower-case copy for any-case languages).
- Matching and drawing on the main thread is a search in sorted lists (binary search for the prefix), so a large
  document or a long keyword list stays fast.

### 3.5 Keys and actions

| Action | Keys | Does |
|---|---|---|
| `complete` (new) | Ctrl+Space | The completion list for the word before the cursor |

- Ctrl+Space is free in keys.json. In the Edit menu as "Complete word".

### 3.6 Where it lives

- `web/complete.js` (loaded with the editor, after format.js): the sources, the list, the setting, the action.
- `web/words.worker.js`: the word gathering.
- No language server (that is plan 21).

### 3.7 Tests

In-app (a new test):

- SQL file: `SEL` + Ctrl+Space lists SELECT first; Enter inserts `SELECT` (any-case language: as typed in upper case).
- `@` + Ctrl+Space lists the `@...` words of the document (and `@@...` ones); `@@` only `@@...`; no `@*` entry.
- Perl: `$` lists the `$...` words.
- A document word: `cou` lists `counter` from further down; the closest one first.
- A snippet: "select" inserts with the cursor at `$0`.
- A ```sql block in markdown: the SQL words.
- Multiple cursors: the word at each.
- `completeDelay` 300: typing `sel` and waiting opens the list; moving the cursor does not.
- Not stalling: a document of 100000 lines; typing while the worker runs keeps each key's handling under a frame
  (measured in the test, the number printed); Ctrl+Space shows the list without waiting for the worker.
- A word typed elsewhere just before Ctrl+Space is in the list.
- Read-only tab: no list.

## 4. Open questions

None.

## 5. Resolved during execution

| Topic | As built |
|---|---|
| The addon | show-hint.js / .css 5.65.21 from the npm package through the jsdelivr mirror (no Node.js here), appended to `vendor/editor.js` / `editor.css`; `vendor.ps1` lists them. Its look in app.css: the theme's bar colour, border and selection, the editor's font, the list name dimmed at the right. |
| Several cursors | show-hint opens with one cursor only: the list opens on the main cursor and the others are put back right after; a pick completes the word at each empty cursor. A selection that is not empty: no list. A snippet goes to the main cursor only. |
| The word itself | An entry equal to what is typed is never listed (it completes nothing), so a fully typed word gives no list, and the pause opens none. A document word only at the cursor is not listed either. |
| Prefix words | The worker gathers the words of every pack's prefixes (`@`, `@@`, `@_`, `$`, `%`), so its list does not depend on the language at the cursor; the list takes those of the cursor's language and names them by its list (`variable`, `global`, `local`). |
| The worker | One worker for the window. A run reads the text with `getValue` on the page (measured below) and posts it; the lines edited from then on are read on the spot until the next run. A result that arrives after newer edits is still used (it is newer than the one before) and a new run follows. Without a worker (it cannot start): only the lines near the cursor and the edited ones. |
| Lines read on the spot | The 300 lines above and below the cursor and the lines edited since the last run (at most 5000). |
| Tests | t100 (in the app): 22 checks; passing on the last four runs in a row; one earlier run once missed the snippet in the list (not seen again, cause not found). Measured in t100 on a 100000-line document: the worker run's page part 3 to 6 ms, the slowest of 20 typed keys while the worker runs 11 to 14 ms (after a first key that draws the place; without that warm-up one run measured 249 ms, the drawing), making the list 1 ms. Its checks: SEL -> SELECT (case as typed, also lower), @ and @@ words with their lists, no @ entry, the closest document word first, the select snippet with the cursor at $0, two cursors, the pause setting (opens; a move does not; 0 does not), read-only, Perl $, a sql block in markdown, the worker's words of the whole document, a word typed 90000 lines away just before. |
