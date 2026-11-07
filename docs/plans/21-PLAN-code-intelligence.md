# Plan: Code intelligence (go to definition, find references)

Status: draft 2026-10-21, revised 2026-11-08; not started. From the list "what UltraEdit or Visual Studio has and
LexPen does not". The number in the file name is the priority; rename to reorder.

## 1. What this is about

Go to definition, find all references, rename a symbol, errors while typing: Visual Studio has them per language
(Roslyn for C#), VS Code through language servers. LexPen has the outline (definitions in the file) only.

## 2. The solution, in brief

The simple level, without a language server: "Go to definition" looks up the name at the cursor, without its owner
(schema), in the definitions of the open files and of the folder in the Folder pane, its subfolders included; an
owner only orders the list of what is found. A definition is an outline entry of
a group the language pack marks as one (procedures, functions, classes; not regions or TODOs). "Find references" is
a whole-word search in those files. A line `call
proc_name` thus finds `create or replace procedure proc_name` wherever it is in the folder. A full level through the
Language Server Protocol is not part of this plan.

## 3. Details

- **Which outline lines are definitions**: an outline group in a language pack gets a mark, `definition: true` (in a
  pack whose outline has no groups, the pattern itself); its entries are definitions, the entries of other groups
  (regions, TODOs, ...) are not. No separate list of definition patterns: the pattern that finds a procedure for the
  outline is the one that marks it. Shipped packs: the asa pack's "Procs/Funcs/triggers" group, the sql pack's create
  pattern, and the class, function and method patterns of the other packs; defaults\languages\README.md describes the
  mark. Should a definition ever be needed that the outline must not
  show, a group could get a `hidden` mark as well; only when that need comes up, not in this plan.
- **Index**: the definitions of every file of the folder whose language marks any, built in the background when the
  folder is shown and refreshed when a file changes (the folder watcher). The open files count as they are in the
  editor, saved or not.
- **Go to definition** (F12): the name at the cursor against the names in the index. One match opens the file at
  its line; more give a list (file, line, the definition's line) to pick from.
- **The name at the cursor**: the word at the cursor, extended over the separator and quotes the pack names (SQL:
  `.`, `"` and `[ ]`), so the cursor anywhere in `"dba"."proc_name"` or `dba.proc_name` reads the whole qualified
  name. Only F12 reads it so: the editor's words (double-click, Ctrl+Left / Right, whole-word search) stay as they are,
  the dot a separator. Quotes off, split at the separator: the last part is the name, what is before it the owner
  (schema, namespace). A definition in the index is split the same way.
- **Names and owners**: names are compared without the owner, as the language compares them (SQL without regard to
  case; C#, JavaScript as written). An owner never leaves a definition out: a `create procedure` without one is in the
  owner of the connection that runs it, so `proc_name` at the cursor finds both `create procedure proc_name` and
  `create procedure dba.proc_name`, and `dba.proc_name` at the cursor finds them both too. The owner only orders the
  list: the same owner as at the cursor first, then those without one, then other owners.
- **Per language**: the pack says how its names are written: the separator, the quote characters, whether case
  counts (a setting next to its outline; defaults\languages\README.md describes it). A pack without it: plain words,
  compared as written.
- **Find references** (Shift+F12): Find in files for the word, whole word, in the same files; the results in the
  Find results panel as any search in files.
- **SQL Anywhere**: the asa pack's outline already finds `create [or replace] procedure | function | view | event |
  domain` and `create or replace trigger`; the sql pack's also `table` and `package`. A definition the patterns do not
  match is not found until the pattern is extended. A region named `proc_name` is not a definition (its group has no
  mark), nor is an `alter procedure` (used for other things than the definition, as to encrypt it; the patterns do not
  match it).
- **Large folders**: the index is built file by file, in the background; F12 before it is done looks in what is
  indexed so far and says so. [not yet measured: how long a large folder takes]
- **Later, not in this plan**: a full level through the Language Server Protocol (a server per language, installed
  by the user, run by the host): rename a symbol, errors while typing. A plan of its own if the simple level is not
  enough.

### 3.1 Tests

- Unit: the name read at the cursor (on the owner, on the name, in quotes); name comparison (case, owner, quotes per
  language); a definition without an owner and one with an owner both found, in the list's order; the index of a folder with nested subfolders; only
  entries of a marked group are definitions (a region of the same name is not found); a pack without marks gives none.
- In-app: F12 on `proc_name` in `call proc_name` opens the file in a subfolder at its `create or replace procedure`;
  two candidates give a list; F12 on `dba.proc_name` (the cursor on `dba` or on `proc_name`) finds the same, and a
  `create procedure dba.proc_name` is found from a plain `call proc_name`; an unsaved new definition in an open file is
  found; Shift+F12 lists the calls.

## 4. Open questions

None.
