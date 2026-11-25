# Plan: JSON blocks: an outline of keys, and go to / select the object the cursor is in

Status: executed (2026-11-25); see As built.

## 1. What this is about

JSON has no outline: the Outline button and pane, Next / previous outline entry and a click to go somewhere work for
SQL, C#, Pascal and the others, not for JSON. And there is no way to reach the object the cursor is in: the bracket
actions (Go to opening / closing bracket, Select inside brackets) take the nearest pair around the cursor, which in
JSON is as often a string or an array as the object. A macro that works on "the keys of the current object" has to
guess the object from the indentation.

## 2. The solution, in brief

An outline for JSON defined in its language pack, as every other language's: `outline` patterns in
languages/json/language.yaml that find the keys whose value is an object or an array (the structure), nested by
their indentation (`indent: line`). No code: the pattern outline LexPen has already does it. And three actions for the `{ }` block the cursor is in, in every language whose
pack has `{ }` (in JSON: the object): go to its opening brace, go to its closing brace, select it with its braces;
pressed again they take the block around that one. Strings and other pairs are passed over. As every action, they can
be used in a macro, so a macro can select the current object and work inside it.

## 3. Details

### 3.1 The outline

- In languages/json/language.yaml, one outline group, Objects (README.md, Outline): the keys whose value is an object
  or an array. Keys of other values (text, numbers, true, false, null) are not entries: with them nearly every line
  would be one, and the outline would be the file again. Find finds a single key.

  ```yaml
  # ---------- Outline ----------
  # The structure: the keys whose value is an object or an array, nested as the file is indented (indent: line).
  # A key: a quoted name at the start of a line (after its indentation), then a colon.
  outline:
    - group: 'Objects'
      patterns:
        - { pattern: '^\s*"((?:[^"\\]|\\.)*)"\s*:\s*[\[{]', name: 1, case: true, indent: line }
  ```

- The entry is the key's name (capture 1), never its value. `indent: line`: an entry is as deep as its line is
  indented, in the document's indent steps, so the keys of a nested object sit under its key.
- The same key shows as often as it occurs: an array of objects with the same keys gives the same names one after
  the other. An object has no name of its own (only the key that holds it has one), so nothing can tell them apart;
  the line each entry goes to does.
- A key-like text inside a value (`"a": "b: c"`) is not at the start of a line, so it is not taken.
- What a pattern outline cannot do, and so this one does not:
  - Minified JSON (several keys on one line): one line gives at most one entry per pattern. The outline of a
    minified file is its first key or nothing. Format (Reformat JSON) first makes it readable, and then it has its
    outline.
  - Array elements as entries of their own (`[0]`, `[1]`): a line with only `{` has no name to show. The keys of the
    objects in an array sit under the array's key, one step deeper; two objects in a list are not apart in the
    outline.
  - A depth from the structure: the depth is the indentation. JSON as Format writes it (and as almost every tool
    writes it) indents by structure, so the two agree.
- Comments in jsonc files: a commented-out key at the start of a comment line (`// "old": 1`) does not start with a
  quote after the indentation, so it is not taken.
- The pack file's comments explain the patterns, as the other packs do. README.md (Outline) already has an example of
  `indent: line`; it needs no change.

### 3.2 The object (the `{ }` block) the cursor is in

- Three actions, in the Edit menu next to the bracket actions and for keys.json and macros:
  - Go to the opening brace: the cursor before the `{`. Again: the block around it.
  - Go to the closing brace: the cursor after the `}`. Again: the block around it.
  - Select the block: from its `{` to its `}`, the braces included (the object as a value, as a recording keeps
    it). Again: the block around it. The inside alone is what Select inside brackets already gives.
  With Shift the two Go to actions select to there, as the bracket actions do.
- In every language whose pack has `{ }` as a group (`format: groups`): JSON's objects, and the `{ }` blocks of C#,
  JavaScript, Java, CSS, ... The titles say "block"; in JSON that block is the object. A language without `{ }` in its
  groups: the actions do nothing (as the bracket actions with no pair).
- "The block" is the innermost `{ }` around the cursor. Strings, comments and other pairs in between are passed over:
  inside `"tags": ["a", "b"]` it is the object that holds `tags`, not the array.
- The pairs come from what the bracket highlight already reads (brackets.js bracketAnalysis: the formatter's
  groups from the language pack, strings and comments known), filtered to `{ }`. No second parser; which pairs a
  language has stays in its pack (`format: groups`).
- These actions work on minified JSON too: the bracket analysis reads signs, not lines.

### 3.3 Macros

- The actions run in a macro as any action does: Select the block, then `$$selection` is the current object's text,
  braces included [action names not yet chosen].
- The `jsonValue` macro function given in chat (indentation based) keeps working; it is not part of LexPen.

### 3.4 Tests

- The outline: LanguagePacksTests reads the packs' settings (outline groups included) but does not run the outline
  code (languages.js needs the page). A new test there runs the JSON pack's pattern through Jint, line by line with
  the flags outlineOf uses, on a small pretty-printed file: the keys of objects and arrays found (nested, in an array
  of objects), keys of other values not found, a key-like text inside a value and a commented-out key not found, the
  indentation of each. (The pattern was tried this way on 2026-11-25 against such a sample.)
- By hand in the app: the outline of a pretty-printed file, a click and Next / previous entry, the outline following
  the cursor; the three actions from inside a string, an array and a nested object,
  pressed repeatedly, with Shift, on minified JSON, and in a macro.

## 4. Open questions

None.

## 5. As built

- The outline: one group, Objects, in languages/json/language.yaml, the pattern as in 3.1. No code.
- The actions are `goToOpenBrace`, `goToCloseBrace` and `selectBraceBlock` (actions.js), on brackets.js
  `braceBlock`: the innermost pair of the bracket analysis whose opener is `{` and closer `}`. Go to: a pair that
  only touches the cursor (the cursor before its `{`, after its `}`) is not around it, so a press again goes to the
  block around it; with Shift the selection's start counts as well. Select: a selection that is exactly a block takes
  the one around it.
- A language whose pack has no format groups uses the bracket highlight's own pairs (`( ) [ ] { }`, strings and
  comments from the editor): `{ }` there as well. So "every language whose pack has `{ }`" is in practice every
  language with `{ }` in its text.
- The pairs are read in the bracket highlight's window (2000 lines above and below the cursor); a block larger than
  that is not found, as the bracket actions do not find it.
- Menus: Select > Select the block with its braces (`W`); Go > Opening brace of the block, Closing brace of the
  block, after the bracket items, without a letter (every letter of the Go menu's words was taken). No default keys.
- Tested: LanguagePacksTests.TheJsonOutlineHasTheKeysOfObjectsAndArrays runs the pack's pattern through Jint (keys of
  objects and arrays with their indentation, escaped quotes in a key; keys of values, a key-like text in a value and
  a commented-out key not taken); all tests pass. The actions are not yet tried by hand in the app (3.4).
