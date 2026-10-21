# Plan: Word completion

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

There is no completion: UltraEdit completes words from the file (Ctrl+Space) and keywords from the word file;
Visual Studio has IntelliSense.

## 2. The solution, in brief

Ctrl+Space shows a list of words that start with what is before the cursor: words of the open documents, the
language's keywords (the pack's word lists) and its snippets; Enter or Tab inserts. Optionally the list opens
while typing after a few letters (a setting, off).

## 3. Details

- CodeMirror's show-hint addon (to add to vendor/editor.js) with LexPen's own source of words.
- Words: from the document (and the other open ones), sorted by nearness to the cursor, then by count.
- Keywords: the pack's `words` lists; snippets: the pack's `insert` actions (with `$0`).
- Case: as typed for document words; as the language writes them for keywords (a pack with caseSensitive: false:
  as typed).
- No language server (that is plan 21).

### 3.1 Tests

In-app: Ctrl+Space lists words of the file and keywords; Enter inserts; a snippet with $0; while typing (setting).

## 4. Open questions

1. Open while typing: off by default?
