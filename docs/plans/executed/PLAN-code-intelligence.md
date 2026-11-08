# Plan: Code intelligence (go to definition, find references)

Status: executed (2026-11-08); see 5. As built. From the list "what UltraEdit or Visual Studio has and
LexPen does not". The number in the file name is the priority; rename to reorder.

## 1. What this is about

Go to definition, find all references, rename a symbol, errors while typing: Visual Studio has them per language
(Roslyn for C#), VS Code through language servers. LexPen has the outline (definitions in the file) only.

## 2. The solution, in brief

The simple level, without a language server: "Go to definition" looks up the name at the cursor, without what
qualifies it (an SQL owner or schema, a C# namespace or class, a JavaScript object), in the definitions of the open
files and of the folder in the Folder pane, its subfolders included; a qualifier only orders the list of what is
found. A definition is an outline entry of a group the language pack marks as one (procedures, functions, classes;
not regions or TODOs). "Find references" is a whole-word search in those files. A full level through the Language
Server Protocol is not part of this plan.

## 3. Details

- **Which outline lines are definitions**: an outline group in a language pack gets a mark, `definition: true` (in a
  pack whose outline has no groups, the pattern itself); its entries are definitions, the entries of other groups
  (regions, TODOs, ...) are not. No separate list of definition patterns: the pattern that finds a procedure for the
  outline is the one that marks it. Shipped packs: the asa pack's "Procs/Funcs/triggers" group, the sql pack's create
  pattern, and the class, function and method patterns of the other packs; defaults\languages\README.md describes the
  mark. Should a definition ever be needed that the outline must not show, a group could get a `hidden` mark as
  well; only when that need comes up, not in this plan.
- **Index**: the definitions of every file of the folder whose language marks any, built in the background when the
  folder is shown and refreshed when a file changes (the folder watcher). The open files count as they are in the
  editor, saved or not.
- **Go to definition** (F12): the name at the cursor against the names in the index. One match opens the file at
  its line; more give a list (file, line, the definition's line) to pick from.
- **The name at the cursor**: the word at the cursor, extended over the separator and quotes the pack names (SQL:
  `.`, `"` and `[ ]`), so the cursor anywhere in `"dba"."proc_name"` or `dba.proc_name` reads the whole qualified
  name. Only F12 reads it so: the editor's words (double-click, Ctrl+Left / Right, whole-word search) stay as they are,
  the dot a separator. Quotes off, split at the separator: the last part is the name, what is before it the
  qualifier. A definition in the index is split the same way, its qualifier as written in its line.
- **Qualifiers**: the generic word for what is written before a name, whatever the language calls it: an SQL owner
  or schema (`dba.proc_name`), a C# namespace or class (`Orders.Picker.Pick`), a JavaScript object or module
  (`orders.total`), a Delphi unit or class (`TInvoice.Total`). The program does not need to know which it is.
- **Names and qualifiers**: names are compared without the qualifier, as the language compares them (SQL without
  regard to case; C#, JavaScript as written). A qualifier never leaves a definition out, since a definition need not
  write one (a `create procedure` without an owner is in the owner of the connection that runs it): `proc_name` at the
  cursor finds both `create procedure proc_name` and `create procedure dba.proc_name`, and `dba.proc_name` at the
  cursor finds them both too. The qualifier only orders the list: the same qualifier as at the cursor first, then
  those without one, then those with another. Where the qualifier is a variable (`picker.Pick` in C#) it matches no
  definition's and the list is every `Pick`; where it is the class (`Picker.Pick`), that class's comes first. The
  class a C# method is in (its outline parent) as its qualifier would order such lists better: later, not in this
  plan.
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

- Unit: the name read at the cursor (on the qualifier, on the name, in quotes); name comparison (case, qualifier,
  quotes per language); a definition without a qualifier and one with a qualifier both found, in the list's order; the
  index of a folder with nested subfolders; only entries of a marked group are definitions (a region of the same name
  is not found); a pack without marks gives none.
- In-app: F12 on `proc_name` in `call proc_name` opens the file in a subfolder at its `create or replace procedure`;
  two candidates give a list; F12 on `dba.proc_name` (the cursor on `dba` or on `proc_name`) finds the same, and a
  `create procedure dba.proc_name` is found from a plain `call proc_name`; an unsaved new definition in an open file is
  found; Shift+F12 lists the calls.

## 4. Open questions

None.

## 5. As built

- **Keys** (asked for during the build): F12 shows the definition in the other pane, this document staying as it is;
  Alt+F12 in this tab, as a link does (a new tab beside it when this document has unsaved changes; a tab of the pane
  that has the file already is the one shown); Ctrl+F12 in a new tab beside this one. Three actions (goToDefinition,
  goToDefinitionHere, goToDefinitionNewTab), so each can have its own key. Back (Position back, the mouse back button) returns to the line F12 was pressed on: the step from this tab
  is kept as a link with its cursor (app.js go() puts the cursor back); in the same document the jump is a place
  (places.js). Shift+F12: Find references. All in the Go menu, with Find references.
- **The marks**: `definition: true` on the groups (a plain list's patterns) of procedures, functions, classes,
  tables, labels in the shipped packs: asa, sql, csharp, javascript, pascal, python, java, cpp, php, vb, vbscript,
  powershell, shell, perl, ruby, ahk (its functions), batch, kusto, macro. Not marked: regions, TODOs, imports,
  C prototypes, the HTML / CSS / YAML outlines. A definition's name: the last capture that matched, its last word.
- **`names`** per pack: `separator`, `quotes` (one character or an opening and closing pair), `chars` (more
  characters a name may hold: `-` for PowerShell and shell), `case: false`; the README's Outline section describes
  them and the marks.
- **The index** (definitions.js): the host lists the folder's files of the marked languages with their times
  (FolderSearch.List, op listFiles: what the search in files would look in); the page reads each and takes its
  outline; on a change of the folder (the watcher) it lists again and reads only what changed. The first F12 waits
  for the whole folder; later ones look in what is there after a moment. While it reads, the bottom bar says
  "Reading definitions: n of m files" (asked for during the build), hidden when done. It starts a moment after the
  window opens.
- **Tests**: unit (FolderSearchTests: the listing with times; LanguagePacksTests: the shipped marks and names). In
  the test copy, a folder with the calls at the top and the definitions two folders down: `call proc_name` lists
  `proc_name` (no qualifier) first, then `dba.proc_name`; with the cursor on `dba` of `dba.proc_name` the order turns;
  `"dba"."other_proc"` opens older.sql at it; a table name finds its `create table`; a region named `proc_name` is
  no definition; an unknown name says so; Back returns to the line; with unsaved changes a new tab and the old one
  kept; F12 in the other pane, Alt+F12 in this tab, Ctrl+F12 in a new tab (the old one kept). Not tested: the keys pressed themselves in the debug build (its
  DevTools take F12; the release build has them off), a large folder's time [not yet measured].
