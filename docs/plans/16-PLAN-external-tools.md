# Plan: External tools

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

A command cannot be run on the file from LexPen (a compiler, a linter, a script) with its output shown. UltraEdit
has Tool configuration (a command line with %f for the file, output to a window); Visual Studio has External
Tools.

## 2. The solution, in brief

Tools defined in a file of their own (as keys.json): a name, a command line with placeholders (the file, its
folder, the selection, the line), where the output goes (a panel, a new tab, replacing the selection), and a key.
They show in a Tools menu and in F1; a running tool can be stopped.

## 3. Details

- Placeholders: `{file}`, `{dir}`, `{name}`, `{line}`, `{col}`, `{selection}`, `{project}`.
- Save first: per tool (yes by default).
- Output: a panel under the editor (as the search panel), with lines like `file(12,5): error ...` clickable to go
  there (UE does that).
- Runs in the host (a process, its output streamed), never in the page; a timeout and a Stop.
- Per language: a tool can be for some languages only.

### 3.1 Tests

Unit (host): placeholders, the output read, a timeout. In-app: a tool on the file, its output in the panel, a
clickable error line, replace selection with output.

## 4. Open questions

1. A file of tools (as keys.json) with a settings tab, or tools in the language packs (actions of a new kind)?
