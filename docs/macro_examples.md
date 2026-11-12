# Macro examples

Small macros to copy, run and change. Each one shows the text before and after. The language itself, every
statement and system variable, is in the reference: View > Macros, a macro's tab, `?` (or F1 on a word).

To try one: View > Macros > Manage > New, give it a name, paste the text over what is there, then Run (it works on
the document in the other pane).

## What a find leaves behind

A `find` that finds something **selects the match**, as the find bar does: the cursor is at its end, and the next
find starts from there. What the macro does next works on that selection:

- `$$selection` is the matched text, until the next step changes the selection; `copy $name` keeps it in a variable.
- `type` writes over it (the match is replaced, nothing else); `replace "a" "b"` replaces it when it fits.
- Only the part of a regex that is matched is selected. Lookbehind `(?<=...)` and lookahead `(?=...)` say what must be
  around the match without selecting it, so `(?<="userId":\s*")\d{8}(?=")` selects only the 8 digits.
- A find that finds nothing selects nothing and leaves the cursor where it was; `$$found` is false (with
  `notfound continue`; without it the macro ends there).

| Example | Shows |
|---|---|
| [Pick the values out of JSON](#pick-the-values-out-of-json) | a find that selects only a part, `copy`, `append` |
| [Numbered lines](#numbered-lines) | a label and `goto`, a counter that keeps its leading zero |
| [Number every TODO](#number-every-todo) | a find loop, `notfound continue`, typing over the match |
| [Collect the error lines](#collect-the-error-lines) | a procedure, a second document (`new`, `show`, `show recent`) |
| [Add up amounts](#add-up-amounts) | a regex find, `copy` into a typed number, Dutch notation |
| [An SQL IN list](#an-sql-in-list) | a function, built-in functions, `append`, a loop over the lines |
| [Comment out debug lines](#comment-out-debug-lines) | `gosub` and `return` |
| [A comment in any language](#a-comment-in-any-language) | `switch` on `$$language` |
| [Shared functions with use](#shared-functions-with-use) | `use`, a function with a loop, a `ref` parameter |
| [Open the file named on a line](#open-the-file-named-on-a-line) | `onerror continue`, `$$error`, `$$errorText` |

## Pick the values out of JSON

Every `"userId": "<8 digits>"`: the find selects only the digits (the lookbehind and lookahead are not selected),
`copy $id` keeps them, and from there `$id` is a value as any other. A `"` inside the text is `\"`, a regex
backslash is written twice.

```
# Every 8-digit userId collected; the list typed at the end of the document
moveto start
notfound continue
:next
  find "(?<=\"userId\":\\s*\")\\d{8}(?=\")" regex
  if not $$found then goto :done
  copy $id
  inc $count
  append $ids $id
  if $id starts "9" then append $test $id
  goto :next
:done
moveto end
type "\n" & $count & " userIds: " & $ids
type "\ntest users (9...): " & $test
```

Before:

```
{ "userId": "12345678" }
{ "userId": "123456789" }
{ "userId":"90000001", "name": "x" }
{ "userId": "23456789" }
```

Added at the end (the 9-digit one does not fit):

```
3 userIds: 12345678, 90000001, 23456789
test users (9...): 90000001
```

Right after the find the digits are still selected, so `type "00000000"` there would write over the number only.

## Numbered lines

Twelve lines at the cursor. `"00"` plus one is `01`: a number keeps the width it started with.

```
# Twelve lines at the cursor: Period 01 to Period 12
set $p = "00"
:next
  inc $p
  type "Period " & $p & "\n"
  if $p < 12 then goto :next
```

After:

```
Period 01
Period 02
...
Period 12
```

## Number every TODO

The find selects `TODO`, so `type` writes over just that word. `word` skips `TODOS`; `case` skips `todo`. Without
`notfound continue` the first find that finds nothing would end the macro; with it, `$$found` says so.

```
# Every TODO numbered: TODO-001, TODO-002, ...
set $n = "000"
moveto start
notfound continue
:next
  find "TODO" case word
  if not $$found then goto :done
  inc $n
  type "TODO-" & $n
  goto :next
:done
```

Before / after:

```
// TODO check the totals          // TODO-001 check the totals
int x = 1; // TODO rename         int x = 1; // TODO-002 rename
// TODOS stays as it is           // TODOS stays as it is
```

## Collect the error lines

Every line with `ERROR` goes to a document "Errors", with its line number. The procedure goes there, adds the
line, and comes back with `show recent`. A value made of more than one part is passed in `( )`.
`moveto column end` after a hit: a line with two `ERROR`s is collected once.

```
# Every line with ERROR copied to the document "Errors", with its line number
procedure collect($text)
  show "Errors"
  moveto end
  type $text & "\n"
  show recent
endprocedure

if not opened "Errors" then
  new "Errors"
  show recent
endif
moveto start
notfound continue
:next
  find "ERROR" case word
  if not $$found then goto :done
  collect ($$line & ": " & $$lineText)
  moveto column end
  goto :next
:done
show "Errors"
```

The log:

```
08:00 INFO start
08:01 ERROR no connection
08:02 WARN retry
08:03 ERROR timeout ERROR again
08:04 INFO done
```

"Errors":

```
2: 08:01 ERROR no connection
4: 08:03 ERROR timeout ERROR again
```

## Add up amounts

The amounts in Dutch notation (`.` between the thousands, `,` before the cents), added up. The type
`:float(".", ",")` reads them that way and writes the total the same way.

In a macro's text a backslash is written twice: the regex `\d` is `"\\d"`.

```
# The total of the amounts written as 1.234,56, typed at the end of the document
set $total:float(".", ",") = "0,00"
moveto start
notfound continue
:next
  find "\\d{1,3}(\\.\\d{3})*,\\d{2}" regex
  if not $$found then goto :done
  copy $amount:float(".", ",")
  set $total = $total + $amount
  goto :next
:done
moveto end
type "\nTotal: " & $total
```

Before / after:

```
Rent;1.250,00                     Rent;1.250,00
Power;87,45                       Power;87,45
Water;23,10                       Water;23,10
Car;12.400,99                     Car;12.400,99
                                  Total: 13.761,54
```

## An SQL IN list

A column of codes, pasted from a spreadsheet, as an `IN` list. The function `quoted` doubles a quote inside
(`O'Brien` becomes `'O''Brien'`); empty lines are skipped. The loop goes line by line until `$$line` is the last.

```
# The lines (one code each) as an SQL IN list at the end: IN ('A1', 'O''Brien', ...)
function quoted($s)
  return "'" & replace($s, "'", "''") & "'"
endfunction

moveto start
:next
  set $v = trim($$lineText)
  if $v <> "" then append $list quoted($v)
  if $$line < $$lines then
    moveto +1, 0
    goto :next
  endif
moveto end
type "\n\nIN (" & $list & ")"
```

Before / after:

```
A1                                A1
B22                               B22

O'Brien                           O'Brien
C3                                C3

                                  IN ('A1', 'B22', 'O''Brien', 'C3')
```

## Comment out debug lines

`gosub :comment` runs the lines from the label up to `return`, then goes on after the gosub. The `stop` before
the label keeps the macro from running into the subroutine at the end.

```
# Every line with Debug.Write commented out with //
moveto start
notfound continue
:next
  find "Debug.Write" case
  if not $$found then goto :done
  gosub :comment
  goto :next
:done
stop

:comment
  moveto column 1
  type "// "
  moveto column end
  return
```

Before / after:

```
x = 1;                            x = 1;
Debug.WriteLine(x);               // Debug.WriteLine(x);
y = 2;                            y = 2;
    Debug.Write("y");             //     Debug.Write("y");
```

## A comment in any language

The first `case` that fits runs; a case can list more than one value. A language not listed: `stop`.
Give it a key (the macro's window: Key...) and it is a "comment this line" for every language you use.

```
# A line comment at the start of the cursor's line, in the document's language
switch $$language
  case "sql"
    set $mark = "-- "
  case "csharp", "javascript", "pascal", "cpp", "java"
    set $mark = "// "
  case "python", "powershell", "shell", "yaml"
    set $mark = "# "
  case "vb", "vbscript"
    set $mark = "' "
  else
    stop
endswitch
moveto column 1
type $mark
```

`select * from orders` in an SQL file becomes `-- select * from orders`; `x := 1;` in a Pascal file becomes
`// x := 1;`.

## Shared functions with use

A macro named `common` holds what other macros share. A function loops with a label of its own (a jump stays
inside its function). A `ref` parameter is the caller's variable itself, so `countUp` changes it.

The macro `common`:

```
# Shared by other macros: use "common"
function padLeft($s, $width:int, $fill)
  :more
    if len($s) < $width then
      set $s = $fill & $s
      goto :more
    endif
  return $s
endfunction

procedure countUp(ref $n)
  inc $n
endprocedure
```

A macro that uses it:

```
# Line numbers before every line, right-aligned; the empty lines counted at the end
use "common"
set $empty = 0
moveto start
:next
  if trim($$lineText) = "" then countUp $empty
  moveto column 1
  type padLeft($$line, 4, " ") & "  "
  if $$line < $$lines then
    moveto +1, 0
    goto :next
  endif
moveto end
type "\n(" & $empty & " empty lines)"
```

Before / after:

```
one                                  1  one
                                     2
three                                3  three
                                     4
five                                 5  five
                                  (2 empty lines)
```

## Open the file named on a line

With `onerror continue` a step that fails does not end the macro: `$$error` is true and `$$errorText` says why.
Both are set again by the next step that works (a `moveto`, a `type`), so keep the reason in a variable first.

```
# Opens the file named on the cursor's line; when it cannot, says why after the name
onerror continue
open trim($$lineText)
if $$error then
  set $why = $$errorText
  moveto column end
  type "   <- " & $why
endif
```

A line `notes.txt` (next to the document) opens it; a line `missing.txt` becomes `missing.txt   <- ` and the
reason LexPen gives.
