# The macro language

A macro is a small script: one step per line. A step is a LexPen action (every key and menu item is one), or a
statement below. `#` starts a comment. A `\` at the end of a line (not in text or a comment) goes on on the next
line: one step over several lines. Macros are kept in `macros\` of the data folder, one `.lpm` file each
(View > Macros > Manage). In the macro editor the bar has Action..., Statement... and Variable... to insert one,
Check to list the mistakes, Run, Step and Reference (this page); Ctrl+Space completes, F1 shows this page (on a word: its entry).

## Text

Between double quotes. Inside: `\"` is a quote, `\\` a backslash, `\n` a line break, `\t` a tab; any other `\x` is a
mistake. `type "say \"hi\""` types `say "hi"`.

## Numbers

A text that is a number (an optional sign, digits, an optional `.` and digits) also calculates with `+ - * /`, and
the result keeps the formatting of the number it started from: `"012" + 2` is `014`, `"1.50" + 1` is `2.50`.
An empty text (a variable nothing gave a value yet) counts as 0. `&` always joins as text: `1 & 2` is `12`.
A text that is not a number in a calculation is an error.

## Types

A type after a variable, on its first `set` or `copy`, kept from then on:

- `$n:int` a whole number; `$n:int(".")` with `.` between the thousands (`1.234`).
- `$x:float` a number with decimals (`.`); `$x:float(",")` with `,` as the decimal separator;
  `$x:float(".", ",")` thousands then decimal separator (`1.234,50`). The result is written the same way.
- `$t:text` stays text: `+` on it is an error.

## Variables

`$name` is the macro's own; it reads as empty text until something gives it a value.

### set

`set $name = <value>`: `set $total = $a + $b`, `set $line = $text & " (" & $n & ")"`.

### inc

`inc $n` adds 1, `dec $n` takes 1 off (the formatting kept: `007` becomes `008`).

### dec

See inc.

### append

`append $list $item` adds an item to a list: `", "` between the items, none before the first.
`append $list $item "; "` with another separator.

### copy

`copy $name` puts the selection into a variable.

### paste

`paste $name` puts a variable at the cursor, as `type`.

## System variables

Prefixed with `$$`; a macro cannot set them, and they are set again after every step.

| Name | What |
|---|---|
| `$$found` | The last find or replace found something |
| `$$error` | The last step failed (with `onerror continue`) |
| `$$errorText` | Why it failed |
| `$$bof` / `$$eof` | The cursor is at the start / the end of the file |
| `$$line`, `$$column` | Where the cursor is (from 1) |
| `$$lineText`, `$$word`, `$$selection` | The cursor's line, the word there, the selection |
| `$$document`, `$$path` | The tab's name, its file |
| `$$lines` | The document's line count |
| `$$language`, `$$part` | The document's language, the language of the part the cursor is in (an embedded part) |
| `$$pane` | 1 or 2 |
| `$$clipboard` | The text on the active clipboard, as Paste would put it (a recorded find of pasted text uses it: `find $$clipboard`) |
| `$$wrap`, `$$outline`, ... | A switch: true when it is on (every switch with on / off actions) |

## Steps

### type

`type <value>` types at the cursor (every cursor): `type "-- "`, `type $a & ", " & $b`.

### moveto

`moveto 120, 5` (line, column), `moveto column 5`, relative with a sign: `moveto +3, 0`, `moveto 0, -2`,
`moveto column +4`; `moveto start`, `moveto end` (of the file), `moveto column end` (of the line).

### find

`find "text" case word regex back`: from the cursor (back: before it), the match selected; never round past the end.
With `notfound stop` (the default) a find that finds nothing ends the macro.

### replace

`replace "a" "b"`: the match selected (after a find), else the next one; `replace "a" "b" all`: every one in the
file. The same switches as find; `^p` and the other codes of the find bar work in both.

### new

`new "Collection"` opens a new document with that name; it fails when one of that name is open.

### show

`show "name"` goes to the open tab of that name (or path), in whichever pane; `show recent` back to the previous one.

### open

`open "path"` opens a file (a path relative to the document's folder).

### notfound

`notfound stop` (the default) or `notfound continue` (the macro goes on; `$$found` is false).

### onerror

`onerror stop` (the default: the error is shown with its line) or `onerror continue` (`$$error` true).

### screen

`screen on` (follows every step), `screen off` (only at the end: fast), `screen every 2` (every 2 seconds).

### stop

Ends the macro.

## Messages

### message

`message "Nothing found"` shows a text at the bottom of the window, as LexPen's own messages (also in the Messages
pane). The macro goes on at once.

### messagebox

`messagebox "Done: " & $n & " changes"` shows a text in a box with OK, on top of the window. The macro waits until it
is closed (OK, Enter or Esc).

### ask

`ask $answer "Replace all?" "Yes" "No" "Cancel"` shows a text in a box with these buttons, the first the default
(Enter). The name of the button used goes into `$answer`, as written; closed without a button: `""`. Each button has a
key: its first free letter, underlined. Without buttons, `ask` is a `messagebox` and `$answer` gets `"OK"`.

The text and each button are one value, or values joined with `&`; a longer expression goes between brackets.

```
ask $go "Replace " & $n & " times?" "Yes" "No"
if $go <> "Yes" then stop
```

## Conditions

### if

On one line: `if not $$found then goto :done`. As a block, nothing after `then`:

```
if $$language = "sql" then
  type "-- "
elseif $$language = "markdown" then
  type "- "
else
  stop
endif
```

Comparisons: `=`, `<>`, `<`, `>`, `<=`, `>=` (as numbers when both are), `contains`, `starts`, `ends`,
`matches "regex"`; with `and`, `or`, `not`, and `( )`. `opened "name"`: a document of that name is open.

### switch

```
switch $$language
  case "markdown", "plaintext"
    type "- "
  case > 10
    stop
  else
    type "-- "
endswitch
```

The first case that matches runs; no fall-through.

## Jumps

### goto

`:label` on a line of its own; `goto :label` jumps there. Without the colon it is a mistake: `moveto` moves the
cursor.

### gosub

`gosub :label` jumps there; `return` comes back after the gosub.

## Procedures and functions

### procedure

```
procedure addLine($text, $count:int)
  set $line = $text & " (" & $count & ")"
  show "Collection"
  moveto end
  type $line & "\n"
  show recent
endprocedure

addLine $$lineText 3
```

A procedure is used as an action: its arguments after its name, each a value, a variable or `( ... )`.

### function

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
```

A function gives a value with `return <value>` and is used where a variable can be.

### global

Inside a procedure or function its variables are its own. `global $list` uses the macro's `$list` instead;
a parameter `ref $list` is the caller's variable itself.

### use

`use "common"` makes the procedures and functions of the macro `common` available.

## Built-in functions

`len($s)`, `upper($s)`, `lower($s)`, `trim($s)`, `left($s, n)`, `right($s, n)`, `mid($s, from, n)`,
`pos($find, $s)`, `replace($s, $from, $to)`.

## Actions

Any LexPen action by its name with its values, as in keys.json: `bookmarkStore 3`, `selectLine`, `upperCase`.
A recorded move with Shift ends in `extend`. The editor's own keys are `editorKey "Down"`, `editorKey "Shift-End"`.
Several keys go in one line, in turn, and `*n` presses a key n times:
`editorKey "Ctrl-Right" "Right*3" "Shift-End" "Shift-Left*2"`. A key that is not one stops the line before any key
is pressed. A recording writes keys pressed one after the other in this way: one line until something else happens.
