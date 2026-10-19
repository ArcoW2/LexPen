# Plan: colours of fenced code blocks in markdown

Status: draft, 2026-10-19, not finished. Created as asked with PLAN-language-packs.md (its Q5): the language
packs plan keeps highlight.js for fenced code blocks, and is done only when this is resolved or planned here.

## 1. What this is about

A fenced code block in markdown (```` ```sql ````) is coloured by highlight.js in the preview and by
CodeMirror's markdown mode in the editor. Once language packs exist, a file of a language is coloured by its
pack, but the same code inside a markdown fence is still coloured by highlight.js: two colourings of one
language that can disagree, and a language with a pack but no highlight.js grammar (Delphi, TCC) gets no
colour in a fence at all.

## 2. The solution, in brief

[not yet decided] Proposal to work out: a fence whose language has a pack is coloured with that pack (in the
preview with CodeMirror's run mode, in the editor with the pack's mode as an inner mode of markdown); a fence
without a pack keeps highlight.js.

## 3. To work out

- Speed: run mode on many or long fences in the preview, compared with highlight.js (measure, do not guess).
- The editor: CodeMirror's markdown mode with inner modes per fence language (its `fencedCodeBlockHighlighting`
  uses modes by name; the packs' simple modes would need registering under their names and aliases).
- Fence names: the info string (` ```cs `, ` ```csharp `, ` ```c# `) mapped to a pack by its name, extensions
  and aliases (a new pack part `aliases`?).
- Colours: both paths take the theme's token colours, so a fence looks the same whichever path coloured it.
- Long lines: a fence line over 10,000 characters keeps the rules of executed/PLAN-long-lines.md.

## 4. Open questions

| # | Question | Proposal |
|---|---|---|
| Q1 | Start this right after the language packs, or later? | [not yet decided] |

## 5. Resolved issues during execution

| # | Issue | Decision |
|---|---|---|
