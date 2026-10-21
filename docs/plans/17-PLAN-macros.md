# Plan: Macros: record, edit, debug and play

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Repeating the same edits on many lines takes them by hand each time. UltraEdit records a macro (keys and commands),
plays it (also to the end of the file), saves macros by name and has a macro editor. LexPen has none of it. Beyond
replaying keys, a macro must be able to decide and loop (if, goto, gosub), keep text and counters in variables,
know the language at the cursor, and move between documents to collect text in one and put it in another.

## 2. The solution, in brief

A macro is a small script: one step per line, each step an action LexPen already has (every key and menu item is
an action) or a statement of the macro language (if / then / else, goto and labels, gosub / return, variables).
Recording writes such a script from what you do; the macro editor is a LexPen tab with the macro language's
highlighting and outline, so recorded macros can be changed and new ones written. A player runs a macro once, X
times or to the end of the file, stops when a find finds nothing, and can run step by step with the variables in
view. Macros are stored by name (one file each), and a key can be given to one.

## 3. Details

### 3.1 Recording

- Record (Ctrl+Shift+M proposed) / Stop. What is recorded: actions with their parameters (the keys system gives
  them), typed text (joined into one `type` step per run of typing), finds and replaces with their switches.
  Mouse clicks are not recorded (UE neither); a click that moved the cursor ends the recording with a notice.
- The result opens as an unsaved macro ("Macro 1"), ready to play, save or edit.

### 3.2 The macro language

A line-based script, a step per line; `#` starts a comment. Proposed shape (the names are a proposal):

- Actions: any LexPen action by its name with its parameters, as in keys.json: `goLineEnd`, `upperCase`,
  `find "abc" case word regex`, `replace "a" "b" all`.
- Text: `type "text"` types at the cursor (all cursors); `type $name` types a variable.
- Labels and jumps: `:label`, `goto label`, `gosub label`, `return`, `stop`.
- Conditions: `if <condition> then ... else ... end`, conditions comparing variables and text: `=`, `<>`, `<`, `>`,
  `contains`, `starts`, `ends`, `matches "regex"`, combined with `and`, `or`, `not`.
- Variables (`$name`): text or a number.
  - `copy $name` puts the selection into a variable; `paste $name` puts a variable at the cursor (as `type`).
  - `set $name = <expression>`: text, numbers, `+ - * /`, concatenation with `&`, `$a & ", " & $b`.
  - Counters: `inc $n`, `dec $n`, `set $n = 0`.
  - Appending: `append $list $name` (concatenate onto a variable, e.g. collecting lines).
- The result of the last step: `$found` (the last find found something), `$ok` (the last action worked).

### 3.2a Switches: on and off, not only toggle

A toggle action (wrap, the outline, the preview, column mode, read-only, ...) gives a different result depending on
the state it starts from, so a macro cannot rely on it. Every toggle action gets two more: one that turns it on and
one that turns it off (`wrapOn` / `wrapOff`, `outlineOn` / `outlineOff`, ...), doing nothing when it already is. Its
state is readable too (`$wrap`, `$outline`, ...), so an `if` can test it. They are normal actions, so a key can
also be given to them.

### 3.3 What a macro knows (read-only variables)

- `$language`: the language of the document; `$part`: the language of the part the cursor is in (an embedded
  part, as the formatter and the brackets see it, `lineLanguage`).
- `$document` (the tab's name), `$path`, `$line`, `$column`, `$selection`, `$lineText`, `$word` (at the cursor),
  `$lines` (the document's line count), `$atEnd` (the cursor at the end of the file).

### 3.4 Switching documents

- `document "name"` makes the open tab with that name (or path) the current one; `open "path"` opens a file;
  `new` opens a new tab. The steps after it work on that document.
- So a macro can collect in X and put in Y: find in X, `copy $t`, `append $all $t`, ..., `document "Y"`,
  `paste $all`.
- When the named document is not open, the macro stops with a message.

### 3.5 Playing

- Play (Ctrl+M proposed): once. Play X times: asks the count. Play to the end of the file: repeats while the cursor
  moves forward and the file is not at its end (a guard against a loop).
- A find that finds nothing stops the macro (also a repeat), unless the macro checks it: a `find` followed by an
  `if not $found` goes on.
- A guard: a macro that runs a long time without the cursor or the text changing asks to stop.
- One undo step per document for the whole play.
- Screen updates: a macro can run without updating the screen, so it goes fast. The option per play (and as a
  statement in the macro, `screen off` / `screen on` / `screen every 2`) has three values: update on every step
  (as now, the default), only when the macro stops, or once every X seconds (the macro's progress stays visible).
  Without updates the editor's work is done once at the end (CodeMirror's operation around the run, the outline,
  brackets and guides after it); the bottom bar shows that the macro runs, and Esc stops it.
- Step by step always updates the screen (each step must be visible).

### 3.6 Step by step (the debugger)

- Run step by step from the editor: the current line marked in the macro's tab, Step (F10 in the macro tab),
  Step into (a gosub), Continue, Stop; a breakpoint by a click in the gutter.
- A panel shows the variables (the macro's and the read-only ones) with their values, updated per step.
- The document the macro works on stays visible next to it (the macro in one pane, the document in another).

### 3.7 Stored macros and keys

- One file per macro in the data folder (`macros\<name>.lpm`), so the editor is the normal editor and the files can
  be copied.
- A key for a macro: in keys.json as an action with the name, `"Ctrl+Alt+1": ["macroRun", "tidy"]`; the macro's
  context menu (in F1 and the Macros menu) can set it.
- Saved macros appear in F1 and the Macros menu.
- The macro language is a language pack of its own (highlighting, outline of the labels, brackets for if..end).

### 3.8 Tests

Unit: every toggle action has its on and off action and a readable state (a check over the action list).
Unit: the parser (each statement, errors with their line); expressions and conditions; the runner on a fake host
(goto, gosub / return, a loop with a counter, stop on a failed find).
In-app: record typing and a move, play; play X times; to the end of the file; a failed find stops; one undo step;
copy / paste a variable; collect from document X into Y; `$part` inside an embedded part; step by step with the
variables panel; a saved macro with a key; screen off (the text is right at the end, nothing drawn in between) and
once every X seconds; Esc stops a macro without screen updates.

## 4. Open questions

1. The syntax: the line-based shape above, or Pascal-like (`begin` / `end`, `:=`), or JavaScript (the page runs
   JavaScript already, so a macro could be a script with a LexPen API; more power, less safe and less simple)?
2. The file extension and folder: `macros\<name>.lpm` as above?
3. Recording mouse clicks that move the cursor: end the recording (as above), or record them as a "go to line,
   column" step?
