# Plan: Macros: record, edit, debug and play

Status: draft 2026-10-21, reworked 2026-10-29 with your answers; not started. From the list "what UltraEdit or Visual
Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Repeating the same edits on many lines takes them by hand each time. UltraEdit records a macro (keys and commands),
plays it (also to the end of the file), saves macros by name and has a macro editor. LexPen has none of it. Beyond
replaying keys, a macro must be able to decide and loop (if, switch, goto, gosub), keep text and counters in
variables, know where the cursor is (the language there, the start or end of the file), and move between documents
and panes to collect text in one and put it in another.

## 2. The solution, in brief

A macro is a small script: one step per line, each step an action LexPen already has (every key and menu item is
an action) or a statement of the macro language (if / switch / goto / gosub, variables), or a procedure of your
own: procedures and functions with parameters and variables of their own (a function gives a value, used as a
variable; a procedure is used as an action), also shared between macros. Recording writes such a
script from what you do; the macro editor is a LexPen tab with the macro language's highlighting and outline. A
player runs a macro once, X times or to the end of the file, and can run it step by step with the variables in view.
After every step LexPen sets system variables (`$$found`, `$$error`, `$$bof`, `$$eof`, ...), so a macro can test what
happened instead of stopping. Macros are stored by name, listed in View > Macros with a Manage window, and a key can
be given to one. While recording, a Stop recording button shows in the menu bar. The macro editor helps write them:
lists to insert an action, a statement block or a variable, completion as you type, and a check that marks mistakes
(a missing endif, an end quote, an unknown system variable) while you type and before a macro runs.

## 3. Details

### 3.1 Recording

- Record (Ctrl+Shift+M proposed) / Stop. What is recorded: actions with their parameters (the keys system gives
  them), typed text (joined into one `type` step per run of typing), finds and replaces with their switches,
  document and pane switches.
- A mouse click that moves the cursor is recorded as an absolute `goto line, column`; when the click stays on the
  cursor's line, only `goto column` (so the macro still works when the lines above it change in length, not in
  number).
- While recording, the menu bar shows a clear Stop recording button right of Options (red dot and text), also
  reachable by the Record key.
- The result is the unnamed macro ("Last recording"), ready to play, save under a name or edit. Recording again
  replaces it, unless the recording was started as Append or Insert (3.8).

### 3.2 The macro language

A line-based script, a step per line; `#` starts a comment. This line language is the macro language; there is no
JavaScript (decided 2026-10-29): a JavaScript macro running in LexPen's page could ask the host to read, write or
delete any file without the macro's text showing it, and plain JavaScript does not keep a number's formatting
(`"012" + 2` is `"0122"`). The line language can only do what its statements say.

- Indentation: it does not change what a macro does, but the macro editor (the language pack) indents for you: the
  lines after a label (`:next`) are indented up to the next label, and the lines of a block `if` (one with nothing
  after its `then`) up to its `else`, `elseif` or `endif`; the same for `switch` / `case` up to `endswitch`.
- Text: between double quotes. A `"` inside is written `\"`, so the delimiter is delimited too: `\\` is one
  backslash. `\n` (a line break) and `\t` (a tab) as usual; any other `\x` is an error, so a mistake shows.
  `type "say \"hi\" \\ bye"` types `say "hi" \ bye`.
- Actions: any LexPen action by its name with its parameters, as in keys.json: `goLineEnd`, `upperCase`,
  `find "abc" case word regex`, `replace "a" "b" all`.
- Typing: `type "text"` types at the cursor (all cursors); `type $name` types a variable; `type` takes any
  expression (`type $a & ", " & $b`, `type padded($n, 4)`).
- Moving the cursor: `goto 120, 5` (line, column), `goto column 5`, and relative to the cursor `goto +3, 0`,
  `goto 0, -2`, `goto column +4` (a sign makes it relative); `goto start` and `goto end` (of the file),
  `goto column end` (of the line).
- Labels and jumps: `:label` on its own line; `goto :label`, `gosub :label`, `return`, `stop`. The colon tells a
  jump from a cursor move.
- Conditions, two forms:
  - On one line, one step after the `then`, no end: `if not $$found then goto :done`.
  - A block: nothing after the `then`; the steps on the lines below, up to `endif`, with `else` and `elseif` in
    between:
    ```
    if $$language = "sql" then
      type "-- "
    elseif $$language = "markdown" then
      type "- "
    else
      stop
    endif
    ```
  - Comparisons: `=`, `<>`, `<`, `>`, `<=`, `>=`, `contains`, `starts`, `ends`, `matches "regex"`; combined with
    `and`, `or`, `not`, and grouped with `(` and `)` for nested checks: `if ($$found and not $$eof) or ($line = "") then`.
- Switch: one value against several, ended by `endswitch`:
  ```
  switch $$language
    case "markdown", "plaintext"
      type "- "
    case "sql"
      type "-- "
    else
      stop
  endswitch
  ```
  The first case that matches runs; no fall-through. A case may hold a comparison (`case > 10`).
- Variables (`$name`): text, unless given a type (below). A text that is a number (an optional sign, digits, an
  optional decimal point `.` and digits) also counts as a number; a decimal comma does not (`1,50` stays text, as
  `,` separates `append` items and `case` values):
  - `+ - * /` calculate and keep the formatting of the number they started from: `$n` is `012`,
    `set $n = $n + 2` gives `014`; `0099` + 2 gives `0101`; `1.50` + 1 gives `2.50` (as many decimals as the
    operand with most). A result too wide for the zeros grows (`99` + 2 is `101`).
  - A text that is not a number in a calculation is an error: `$n` is `2d4`, `set $n = $n + 2` fails (3.5).
  - `&` always joins as text: `set $list = $list & ", " & $name`. So `+` never joins and `&` never adds.
  - `copy $name` puts the selection into a variable (text copied from the editor may be a number);
    `paste $name` puts it at the cursor (as `type`).
  - Counters: `inc $n`, `dec $n` (as `+ 1` / `- 1`, formatting kept).
  - Lists: `append $list $name` adds an item to a list: `", "` between the items, none before the first (an empty
    list just becomes `$name`). It is what `set $list = $list & ", " & $name` does, minus the leading comma, and
    says that `$list` is a list. Another separator: `append $list $name "; "`.
- Typed variables: a type after the name, on the variable's first `set` (or `copy`), kept from then on:
  - `$count:int`: a whole number. `$amount:float`: a number with decimals, `.` as the decimal point.
  - With their own separators, in the order they stand in a number: one is the decimal separator,
    `$amount:float(",")` reads `1,50`; two are the thousands and then the decimal separator,
    `$amount:float(".", ",")` reads `1.234,50`, and writes the result the same way (`1.234,50` + 1 is `1.235,50`).
    A whole number has no decimals, so its one is the thousands: `$count:int(".")` reads `1.234` as a thousand two
    hundred thirty-four.
  - After its first use the variable is written without the type (`set $amount = $amount * 2`); giving it
    another type later is an error.
  - A value that does not fit the type (`copy $count:int` on `12a`) is an error (3.5). Calculations keep the
    formatting as for untyped numbers (leading zeros, the decimals).
  - `$name:text` makes a number-like text stay text: `+` on it is an error, as on any text.

### 3.2a Switches: on and off, not only toggle

A toggle action (wrap, the outline, the preview, column mode, read-only, ...) gives a different result depending on
the state it starts from, so a macro cannot rely on it. Every toggle action gets two more: one that turns it on and
one that turns it off (`wrapOn` / `wrapOff`, `outlineOn` / `outlineOff`, ...), doing nothing when it already is. Its
state is readable too (`$$wrap`, `$$outline`, ...), so an `if` can test it. They are normal actions, so a key can
also be given to them.

### 3.2b Procedures and functions

Besides `gosub` (a jump back and forth within the macro's own variables), a macro can define procedures and
functions: named, with parameters, and with variables of their own.

- A procedure is used as an action: a step of its own, its arguments after its name as an action's are.
  ```
  procedure addLine($text, $count:int)
    set $line = $text & " (" & $count & ")"      # $line exists only in here
    show "Collection"
    goto end
    type $line & "\n"
    show recent
  endprocedure

  addLine $$lineText 3                           # used as an action
  ```
- A function returns a value with `return <expression>`, so it is used where a variable can be: in a `set`, a
  condition, an argument, a `type`.
  ```
  function padded($n:int, $width:int)
    set $s = $n & ""
    :more
      if len($s) < $width then
        set $s = "0" & $s
        goto :more
      endif
    return $s
  endfunction

  type padded($$line, 4)
  if padded($i, 3) = "007" then stop
  ```
- Scope: the parameters and every variable set inside a procedure or function are its own, and gone when it
  returns; a variable of the same name outside is not touched. Inside, the macro's own variables are not seen,
  except those it names with `global $list` (then it reads and changes that one). The system variables (`$$`) are
  seen everywhere.
- Parameters are passed by value; `ref $list` passes the caller's variable itself, so the procedure can change it
  (`procedure collect(ref $list, $item)` ... `append $list $item`). A parameter may have a type (`$n:int`, 3.2).
- `return` ends a procedure; in a function it must give a value. Labels inside one are its own: a `goto` cannot
  jump into or out of a procedure or function.
- Where they are defined does not matter (the top or the bottom of the macro): a run passes over a definition;
  it runs only when called. A definition inside another is not allowed. They may call each other and themselves,
  up to a depth (1000 calls) that stops a runaway recursion with an error.
- A name of a procedure or function is not the name of an action or a statement.
- Shared between macros: `use "common"` makes the procedures and functions of the macro `common` (its file in
  `macros\`) available, so a set of helpers is written once.
- A few functions come with the language, as a function of your own is used: `len($s)`, `upper($s)`,
  `lower($s)`, `trim($s)`, `left($s, n)`, `right($s, n)`, `mid($s, from, n)`, `pos($find, $s)`,
  `replace($s, $from, $to)`.
- Step by step (3.6): Step into goes into a call, Step over runs it whole; the variables panel shows the current
  call's own variables, the globals apart.

### 3.3 System variables (read-only, `$$`)

Prefixed with `$$`, so a macro's own variable can never change one, and `$$lines` (system) does not look like
`$list` (yours). Set again after every step.

- What the last step did: `$$found` (the last find found something), `$$error` (the last step failed; true or
  false after every step), `$$errorText` (why).
- Where the cursor is: `$$bof` (at the start of the file), `$$eof` (at the end), `$$line`, `$$column`,
  `$$lineText`, `$$word` (at the cursor), `$$selection`.
- The document: `$$document` (the tab's name), `$$path`, `$$lines` (its line count), `$$language`, `$$part` (the
  language of the part the cursor is in, an embedded part, as the formatter and the brackets see it,
  `lineLanguage`), `$$pane` (1 or 2).
- The switches of 3.2a: `$$wrap`, `$$outline`, ...
- `set $$x = ...` is an error when the macro is read (not when it runs).

### 3.4 Documents and panes

- `new "Collection"` opens a new document with that name; when a document with that name is already open, it fails
  (`$$error`, or a stop, 3.5). So `new` also tells whether a document is open; `if opened "Collection"` asks it
  without opening one.
- `show "name"` makes the open tab with that name (or path) the current one, in whichever pane it is: a document
  switch is also a pane switch when the document is in the other pane. `show recent` goes back to the previous
  document (as Ctrl+Tab does, across the panes). Both work: `show "Collection"` to go to that one by name, `show
  recent` to go back and forth between two. `open "path"` opens a file. The steps after it work on that document.
- A new action `selectLine` selects the cursor line's text, without its line break, so what it copies is the line
  alone. That is why the example types a line break after each paste. (`set $t = $$lineText` gives the same text
  without selecting.)
- So a macro can collect from one document into another, in one pane or across the two:
  ```
  new "Collection"
  show recent
  :next
    find "TODO"
    if not $$found then goto :done
    selectLine
    copy $t
    show "Collection"
    goto end
    paste $t
    type "\n"                  # each line on a line of its own
    show recent                # back, the find goes on from where it was
    goto :next
  :done
  ```
- In a macro a find does not go round past the end of the file (as Find > At the end: stop), so a loop like this
  ends; `$$eof` is true when the cursor is at the end.

### 3.5 Playing, not found, and errors

- Play (Ctrl+M proposed): once. Play X times: asks the count. Play to the end of the file: repeats while the cursor
  moves forward and the file is not at its end (a guard against a loop).
- Not found: an option per play, and a statement in the macro (`notfound stop` / `notfound continue`). Stop (the
  default): a find that finds nothing ends the macro (also a repeat). Continue: the macro goes on, `$$found` false.
- Errors: the same, `onerror stop` / `onerror continue`. Stop (the default): the macro ends and the error is shown,
  with the macro's line and why (`line 12: "2d4" is not a number`). Continue: the step does nothing, `$$error`
  true and `$$errorText` set, the macro goes on (and can test it). After every step `$$error` is set again.
- An error in the macro itself (a missing `endif` or `endswitch`, an unknown action, `set $$line`) is found when
  it is read, before anything runs.
- A guard: a macro that runs a long time without the cursor or the text changing asks to stop.
- One undo step per document for the whole play.
- Screen updates: a macro can run without updating the screen, so it goes fast. The option per play (and as a
  statement in the macro, `screen off` / `screen on` / `screen every 2`) has three values: update on every step
  (the default), only when the macro stops, or once every X seconds (the macro's progress stays visible). Without
  updates the editor's work is done once at the end (CodeMirror's operation around the run, the outline, brackets
  and guides after it); the bottom bar shows that the macro runs, and Esc stops it.
- Step by step always updates the screen (each step must be visible).

### 3.6 Step by step (the debugger)

- Run step by step from the editor: the current line marked in the macro's tab, Step (F10 in the macro tab),
  Step into (a gosub), Continue, Stop; a breakpoint by a click in the gutter.
- A panel shows the variables (the macro's, and the `$$` ones apart) with their values, updated per step.
- The document the macro works on stays visible next to it (the macro in one pane, the document in another).

### 3.7 Stored macros and keys

- One file per macro in the data folder (`macros\<name>.lpm`), so the editor is the normal editor and the files can
  be copied. The unnamed macro (Last recording) is kept there too until it is replaced.
- A key for a macro: in keys.json as an action with the name, `"Ctrl+Alt+1": ["macroRun", "tidy"]`; Manage (3.8)
  can set it.
- Saved macros appear in F1 and in View > Macros.
- The macro language is a language pack of its own (highlighting, outline of the labels, brackets for
  `if` .. `endif`, `switch` .. `endswitch`; it indents after a label and a block `if`, 3.2).

### 3.8 The Macros menu and Manage

- View > Macros, a submenu: the named macros (a click plays one), Last recording (when there is one), then Record
  (Stop recording while it records), Play, Play X times, Play to the end of the file, Step by step, and Manage...
  The same items in F1, each with its key.
- Manage... (a window with the list of macros): Open (in the macro editor, to change it), Rename, Delete, Key...,
  New macro (an empty one in the editor), New recording, and Append with next recording / Insert with next
  recording: the next recording is added to the end of the chosen macro, or at the cursor in its open editor,
  instead of becoming Last recording.

### 3.9 Help in the macro editor

A macro is written in a LexPen tab (3.7), so the help is where you type:

- The macro bar above the editor (as the format bar of a language): Action..., Statement..., Variable..., Check,
  Run, Step, and ? (the language reference).
- Action...: a list of every LexPen action (as F1 shows them: title, hint, key), searchable; choosing one inserts
  its name at the cursor with its parameters as placeholders (`find "text" case word regex`, the options listed in
  the hint). The same for a toggle's on / off variants (3.2a).
- Statement...: a list of the statements (also `procedure .. endprocedure`, `function .. return .. endfunction`,
  `use`), each inserted as a whole block with the cursor at its first gap:
  `if .. then .. endif`, `if .. then .. else .. endif`, `if .. then .. elseif .. then .. else .. endif`,
  `switch .. case .. else .. endswitch`, a label with `goto :label`, `gosub :label` with its `:label .. return`, a
  loop with a counter (`set $i = 0`, `:loop`, `inc $i`, `if $i < 10 then goto :loop`), a find loop that stops when
  nothing is found (the example of 3.4), `new` / `show` / `show recent`, `notfound` / `onerror` / `screen`.
- Variable...: the system variables (`$$found`, `$$eof`, ... with what each holds, 3.3) and the macro's own
  variables (the ones it sets), inserted at the cursor.
- As you type: completion of action names, statements, `$$` variables, the macro's own variables and labels
  (after `goto :` and `gosub :`), as Complete word does in other files.
- The mouse on an action, a statement or a `$$` variable: its hint as a tooltip. F1 with the cursor on one: its
  entry in the language reference.
- The language reference (?): one page with every statement, the text rules (`\"`, `\\`), the number and type
  rules (3.2), the system variables and an example per statement; opened as a preview tab, so it can stay beside
  the macro.

### 3.10 Validation

A macro is checked while it is written (after a pause in typing, as the outline is) and always before it runs; a
macro with an error does not run.

- Shown in the editor: the wrong part underlined (red for an error, the warning colour for a warning), its line
  number marked in the gutter, the message as a tooltip; Check (the macro bar) lists them all, a click goes to one.
- Errors:
  - Blocks: an `if` without its `endif`, an `endif`, `else` or `elseif` without its `if`, a `switch` without its
    `endswitch`, a `case` outside a `switch`; reported at the line that opened the block (`line 12: this if has no
    endif`).
  - Text: a missing end quote, an unknown escape (`\x`).
  - Brackets in a condition that do not pair.
  - An unknown action, a wrong number or kind of its parameters.
  - An unknown system variable (`$$foudn`), a `set` of a system variable.
  - A `goto` or `gosub` to a label that does not exist; a label defined twice.
  - A type that does not exist (`$n:number`), separators that are not one character, the same character as
    thousands and decimal separator (`:float(",", ",")`), a second type for a variable.
  - `show` / `new` / `open` without a name.
  - Procedures and functions: a `procedure` without `endprocedure`, a `function` without `endfunction`, one defined
    inside another, two of one name, a name that is an action or a statement; a call to one that does not exist,
    with too few or too many arguments, an argument for a `ref` parameter that is not a variable; a function used as
    a step or a procedure used as a value; `return` with a value in a procedure, without one in a function; a
    `goto` into or out of one; a `use` of a macro that does not exist.
- Warnings (the macro still runs):
  - A variable read before any `set` or `copy` gives it a value.
  - A label nothing jumps to.
  - A `return` that no `gosub` can reach.
  - Lines after a `stop` or a `goto` that nothing jumps to (they never run).
  - A function with a way to its end that does not pass a `return`.
  - A procedure or function nothing calls.
  - A variable inside a procedure with the name of a macro variable it did not declare `global` (likely meant
    the outer one).

### 3.11 Tests

Unit: every toggle action has its on and off action and a readable state (a check over the action list).
Unit: the parser (each statement, text with `\"` and `\\`, an unknown `\x`, grouping with brackets, switch, errors
with their line, `set $$x` refused); expressions (`012` + 2 = `014`, `0099` + 2, `1.50` + 1, `99` + 2, `2d4` + 2
an error, `&` joining numbers as text, `append` with and without a first item and with another separator; typed
variables: `:int`, `:int(".")` reading `1.234`, `:float`, `:float(",")` reading `1,50`, `:float(".", ",")`
reading and writing `1.234,50`, `:text`, a value that does not fit, a second type refused); `if` on one line and as a block with `elseif` / `else` / `endif`, `switch` .. `endswitch`,
a missing `endif` reported with its line;
conditions; the runner on a fake host (goto and gosub / return, switch, a loop with a counter, notfound stop and
continue, onerror stop and continue, `$$error` set again after each step).
Unit: procedures and functions: a call with arguments, a function's value in a `set`, a condition and an argument;
the scope (a local not seen outside, an outer variable of the same name untouched, `global`, `ref`), recursion and its
depth limit, `use` of another macro, the built-in functions.
Unit: validation: each error and warning of 3.10 with its line and message; a macro with an error refused, one
with only warnings run.
In-app: the macro bar's Action..., Statement... (each block inserted, the cursor at its first gap) and Variable...;
completion of actions, `$$` variables and labels; an error underlined and in the gutter while typing, Check listing
it, a click going to it; Run refused with an error; View > Macros with its items.
In-app: record typing, a move and a click (absolute, on the same line only the column), play; play X times; to the
end of the file; a failed find stops, or goes on with `$$found`; one undo step; copy / paste a variable; `new` on a
name already open fails; the collect example of 3.4 in one pane and across two (`show "Collection"` and `show recent`, each line on a line of its own); `$$bof` / `$$eof`; `$$part` inside
an embedded part; step by step with the variables panel; a saved macro with a key; View > Macros and Manage (open,
rename, delete, append and insert with the next recording); the Stop recording button; screen off and once every X
seconds; Esc stops a macro without screen updates.

## 4. Open questions

None.

## 5. Resolved during execution

None yet.
