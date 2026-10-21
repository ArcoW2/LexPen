# Plan: Matching brackets: highlight, go to, select, close

Status: executed 2026-10-21 (section 5). From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder. Moved before sort lines (your remark: brackets
matter more). Your answers of 2026-10-21 are worked in.

## 1. What this is about

The pair of brackets around the cursor is not shown, there is no way to select what is between them, and typing
`(` does not add its `)`. Visual Studio and UltraEdit do these.

## 2. The solution, in brief

One matcher on the pairs the formatter already knows per language (signs such as `( )`, and word sets such as
`begin` / `end`, `if` / `else` / `end if`), skipping strings, comments and embedded parts of another language
(inside a part: that language's pairs, up to the part's ends). The innermost pair or set that holds the cursor
(the cursor after its opener and before its closer; a pair that only touches the cursor does not count) is
highlighted while typing, all its words (opener, every middle, closer); with the cursor on a word of a set
(`begin`, `end`), that set, in a style you pick (a setting: the bracket-match colour, an underline in the
selection-outline colour, or none). Inside a string or a block comment, its start and end are the pair. An action
without a key selects everything between the pair. Closing brackets and quotes while typing is a second setting;
words are never added.

## 3. Details

### 3.1 The pairs

- From the pack's `format:` parameters (reformat.js, `rfConfig(lang)`): the `groups` (`( )`, `[ ]`, `{ }`, a
  pack's own) and the `blocks` (open / middle / close words: `begin` ... `end`, `if` ... `elseif` ... `else` ...
  `end if`, `case` ... `when` ... `end case`). The same reading the formatter does, so `end if` is one close,
  `exception` counts only where a statement starts, and an opener needs its closer as Format sees it.
- A block is a set: its opener, all its middle words (as many as it has: every `when` of a `case`), its closer.
- A pack without `format:` parameters: `( )`, `[ ]`, `{ }` only.
- Only the language that holds the cursor:
  - In the outer text: an embedded part in between is skipped as a whole, as a block comment is; its brackets
    and words never pair with the outer text's.
  - Inside an embedded part: that language's pairs only, and the scan stops at the part's start and end (its
    markers). A bracket of the part without its match inside the part is unmatched, never paired with the outer
    text.
  - A part inside a part: the same rule, one level at a time.
- Strings and comments: their brackets and words are not matched against code (the formatter's tokens already
  know them). With the cursor inside a string or a block comment, its start and end (`'` ... `'`, `/*` ... `*/`,
  a here-doc's markers) are the pair.
- A line comment (`--`, `//`): nothing to match, no highlight.

### 3.2 Highlight

- Which pair: the innermost pair or set that holds the cursor, wherever the cursor is inside it (not only next to
  a bracket). Holds means: the cursor is after the end of the opener and before the start of the closer. A pair
  that starts after the cursor or ended before it does not count, also when it touches the cursor.
- The cursor on a word of a set (opener, middle or closer, its edges included) takes that set, before any pair
  around it: one clicks on the word to see its match. Words only: a sign that touches the cursor does not count
  (`|(test)`).
- Examples, with `|` as the cursor:
  - `((|(test)))`: the second `(` and its `)`; the third pair starts after the cursor.
  - `|(test)`: nothing; the cursor is before the pair, not in it.
  - `(test)|`: nothing; it is after it.
  - `(|test)` and `(test|)`: that `(` and `)`.
  - `begin | end`: `begin` and `end`.
  - `beg|in ... end`, `begin ... e|nd`: `begin` and `end`; the cursor is on a word of the set.
  - `|begin ... end` and `begin| ... end`: the same; the edges of a word count as on it (a click on its first or
    last letter can put the cursor there).
  - `if a then x end i|f`: `if` and `end if`; a closer of more words is one word, the space in it included.
  - `if a then x el|se y end if`: `if`, `else` and `end if`; a middle word is inside its set.
  - `'ab|c'`: the two quotes.
- A set: all its words highlighted (`if`, each `elseif`, `else`, `end if`).
- Setting `bracketHighlight`: `colour` (the theme's `bracketMatch` as background, the default), `underline` (an
  underline in the selection-outline colour, as the find mark's outline, `--find-box`), `off`.
- No match (an opener without its closer, or the other way round): the theme's `bracketNoMatch`, in the same
  style. The same check as Format's `reformatProblems`, so the two agree.
- Updated on every cursor move and while typing (after the change, as the outline's highlight is). The scan reads
  at most a fixed number of lines above and below the cursor, as Enter does (2000 lines above); beyond that, no
  highlight rather than a wrong one.
- Theme colours `bracketMatch` and `bracketNoMatch` added to every theme (dark and light values), as the find
  colours are.

### 3.3 Go to and select between the pair

- Ctrl+[ and Ctrl+] (actions `goToOpenBracket`, `goToCloseBracket`): to the opener (the cursor before it) or the
  closer (after it) of the pair the highlight shows. The cursor is then outside that pair, so the next press goes
  on to the pair around it. With Shift: select to there. An unmatched one: nowhere to go.
- Indent and outdent move from Ctrl+] / Ctrl+[ to Ctrl+> / Ctrl+< (actions `indentMore`, `indentLess`; in keys.json
  `Ctrl+Shift+.` and `Ctrl+Shift+Comma`, the physical keys of a US keyboard; `Comma` is a new key name, since a
  comma alone separates the keys of a chord).
- Action `selectInsideBrackets` ("Select inside brackets"), in the Edit menu, no key. As an action it can be given
  a key in keys.json and used by macros later.
- Selects everything between the opener and the closer of the pair the highlight shows, the brackets or words
  themselves not included. For a set: from after the opener to before the closer (middles included).
- Inside a string or block comment: its content.
- No pair around the cursor: nothing happens.

### 3.4 Close while typing

- Setting `closeBrackets`: `off` (the default) / `on`.
- On: typing an opener sign adds its closer after the cursor; typing that closer right before an added one steps
  over it; Backspace right after the opener removes an empty pair. Quotes the same, not inside a string or
  comment, and not after a letter (`don't`).
- Signs only, never words: the `end` is often already there or comes much later, and a word such as `if` has no
  clear place for its `then`.
- CodeMirror's closebrackets addon (part of its distribution, to add to vendor/editor.js) with the pairs of 3.1,
  per language.

### 3.5 Tests

In-app: the innermost pair highlighted with the cursor inside it (signs and word sets, middles included); the
examples of 3.2 (a pair that only touches the cursor not highlighted, a word of a set with the cursor on it or at
its edge highlighted); all three styles; an unmatched one in `bracketNoMatch`; inside a string and a block comment
their start and end; a line comment not highlighted; a bracket in a string not matched; the highlight follows
typing; select inside brackets (signs, a set, a string, no pair); close while typing on and off, step over,
Backspace; an embedded JSON block uses JSON's pairs and stops at its markers, and the outer text's pair across it
skips its brackets; Ctrl+[ / Ctrl+] (and with Shift); Ctrl+> / Ctrl+< indent and outdent. Unit tests: the new settings and theme colours load.

## 4. Open questions

None.

## 5. Resolved during execution

| Point | What was done |
|---|---|
| The matcher | `web/brackets.js`, loaded with the editor. It reads the formatter's tokens and frames (reformat.js); the formatter's walk now also keeps where a closing phrase and each middle phrase end (`end if` is two tokens). A pack whose `format:` has no groups or blocks (markdown: only its tables), or a markup pack (HTML, XML), uses ( ) [ ] { } by the editor's own string and comment tokens; there a string's quotes are a pair when the string is on one line. |
| HTML / XML tags | Not matched (a start tag with its end tag was not in the plan); their ( ) [ ] { } are. |
| The window | 2000 lines each way (as Enter). An opener whose closer may lie below the window, or a closer whose opener may lie above it, is not shown as unmatched. Inside a part of another language the scan is the part's lines; a part inside a part ends the outer part's scan (a line has one language). |
| Speed | The analysis is kept per document until the text changes; a cursor move only looks up. The highlight follows 60 ms after the last move or change. Not measured on a large file. |
| Unmatched | Shown when the cursor touches it (a sign) or is on it (a word): an opener without its closer never holds the cursor, so otherwise it would never show. |
| Close while typing | Own code instead of CodeMirror's closebrackets addon (the vendor folder is rebuilt from node_modules, which is not installed). Not inside a string or comment for signs too, not only quotes (a `(` typed in a comment gets no `)`). Pairs: the pack's single-sign groups and quotes, else ( ) [ ] { } " '. A selection is not wrapped. One cursor only. |
| Keys | Your remark: Ctrl+[ / Ctrl+] go to the opener / closer; indent moved to Ctrl+> / Ctrl+< (3.3). |
| Settings | `bracketHighlight` (colour, underline, off) and `closeBrackets` (off), Options > Settings, Editor, Brackets. Theme colours `bracketMatch`, `bracketNoMatch` in dark.json and light.json; the other themes take them from their base. |
| Docs | README (keys table, theme colour names), keys.json header (`Comma`). |
| Tests | t79 (in the app): 45 checks pass: the 3.2 examples, word sets with middles and edges, strings, a line comment, unmatched, the JSON part (its own pairs, its scan stopping at its ends, skipped from the SQL), the three styles, following typing, select inside, a pack without pairs, close while typing, Ctrl+[ / Ctrl+] with Shift, Ctrl+> / Ctrl+<. Also run: t64 (31), t67 (11), t78. Unit tests: 186 pass (new: key name `Comma`, the two theme colour names). |
