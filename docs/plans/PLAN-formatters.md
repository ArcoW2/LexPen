# Plan: formatters per language (format a document or a selection)

Status: draft, 2026-10-19, not finished. Created as asked with executed/PLAN-language-packs.md (its Q7): formatters
are not part of the language packs plan, and this plan has to exist before that one is approved.

## 1. What this is about

A file such as a minified JSON response (one line of 241,477 characters) or an untidy SQL script cannot be
tidied in LexPen. Asked for: "format SQL", "format JSON" and the like, per language.

## 2. The solution, in brief

[not yet decided] Proposal to work out: a `format` action per language pack (the `command` kind), Format
document / Format selection in the Format menu and F1. JSON first, built in (parse and write back indented,
keeping the file's indent unit from the pack); other languages by a formatter the pack names.

## 3. To work out

- Which formatters: built in (JSON, XML: the .NET libraries can parse and indent them), or outside programs
  named by the pack (for example `dotnet format`, a SQL formatter), run by the host with the text on standard
  input and the result on standard output.
- Settings per language: indent unit and size from the pack's `indent`, line width, keyword case for SQL.
- Undo: a format is one undo step; the cursor stays on the same text where possible.
- Errors: a text that does not parse (invalid JSON) is not changed; the message says where it failed.
- Large files: formatting runs in the host, off the page, so the window keeps responding.
- Comments in JSON (as in keys.json): kept or refused? A JSON formatter that drops comments must not touch
  such a file.

## 4. Open questions

| # | Question | Proposal |
|---|---|---|
| Q1 | Which languages get a formatter in the first round? | [not yet decided] JSON, then XML |
| Q2 | Outside formatter programs: allowed (they run code on your PC), and from which packs? | [not yet decided] |

## 5. Resolved issues during execution

| # | Issue | Decision |
|---|---|---|
