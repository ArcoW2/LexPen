# Plan: Spell check

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

There is no spell check, while LexPen is also a markdown editor. UltraEdit checks spelling as you type (in
comments and strings of code too).

## 2. The solution, in brief

Words outside code (markdown text; comments and strings in code, a setting) underlined when misspelled, with
suggestions on a right-click, "add to dictionary", and a language per file (English, Dutch, ...).

## 3. Details

- The checker: WebView2 has Chromium's spell checker for editable fields; CodeMirror 5's text is not a
  contenteditable, so it does not get it. A dictionary in the page (Hunspell in WebAssembly, a dictionary file per
  language) or Windows' own spell checking (ISpellChecker, through the host) are the two ways (4.1).
- Which text: markdown outside code spans and blocks; in code only comments and strings (token types).
- Your own words: a file (dictionary.txt) in the data folder.

### 3.1 Tests

In-app: a misspelled word underlined, a suggestion replaces it, added word not underlined; code not checked.

## 4. Open questions

1. Windows' spell checker (no files to ship, the languages Windows has) or Hunspell dictionaries in LexPen?
2. Which languages?
