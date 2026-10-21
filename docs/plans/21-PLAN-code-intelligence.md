# Plan: Code intelligence (go to definition, find references)

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Go to definition, find all references, rename a symbol, errors while typing: Visual Studio has them per language
(Roslyn for C#), VS Code through language servers. LexPen has the outline (definitions in the file) only.

## 2. The solution, in brief

Two levels. A simple one without a language server: "Go to definition" looks up the word at the cursor in the
outline entries of the open files and the folder (the packs' outline patterns already find procedures, functions,
classes), "Find references" is a whole-word search in files. A full one through the Language Server Protocol
(a server per language, run by the host) only if the simple one is not enough.

## 3. Details

- Simple: an index of outline entries per file of the folder (built in the background, refreshed on change); F12
  to the definition (a list when there are more), Shift+F12 references (search in files, whole word).
- SQL Anywhere: procedures and tables from `create procedure` / `create table` in the folder's files: the outline
  patterns of the asa pack already find them.
- Full: LSP client in the page (or host), servers per language installed by the user; large.

### 3.1 Tests

In-app: F12 on a procedure's name in a call opens the file at its create procedure; two candidates give a list;
Shift+F12 lists the calls.

## 4. Open questions

1. The simple level first (useful for ASA right away)?
