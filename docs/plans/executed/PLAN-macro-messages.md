# Plan: Messages and questions in a macro

Status: executed (2026-11-25); see As built.

## 1. What this is about

A macro cannot tell the user anything or ask anything. The only text a macro produces is LexPen's own toast at the
end of a run ("ran", "stopped at line ..."). A macro that searches and finds nothing, or that is about to change a
lot, has no way to say so, and no way to let the user choose how it goes on.

## 2. The solution, in brief

Three statements. `message` shows a text as a regular message at the bottom of the window (the toast, also in the
Messages pane); the macro does not wait. `messagebox` shows the text in a modal box with OK, on top, as a Windows
message box but in LexPen's own theme (the existing question window, AskForm); the macro waits for it. `ask` is a
messagebox with buttons of the macro's own: the name of the button used goes into a variable. Without buttons, `ask`
is a messagebox.

## 3. Details

### 3.1 The statements

- `message <text>`: the toast (as LexPen's own informational messages, so it is kept in the Messages pane). No wait.
- `messagebox <text>`: the box with one OK button; Enter and Esc both close it. The macro goes on after it.
- `ask $name <text> <button> <button> ...`: the box with these buttons, the first one the default (Enter). The
  button's name goes into `$name`, as written in the macro. Closed without a button (the window's X): `""`. Each
  button gets a key as in the other boxes (its first free letter, underlined). Without buttons: one OK button, as
  `messagebox`; `$name` then gets `"OK"`.

The text and every button are a term, or terms joined with `&`, as `find` takes its text: `ask $go "Replace " & $n &
" times?" "Yes" "No"`. A longer expression goes between brackets.

`$name` may have a type (`$n:int`), as with `copy`; a typed variable checks the answer as `set` does.

### 3.2 The box

The host's question window (AskForm.cs): modal, on top of the window, in the window's app theme, moved by its title
bar, the information sign. A new host call `macroAsk` (MainForm.cs) takes the text and the button names and returns
the name of the button used, or "" when it was closed.

### 3.3 The run

- Before the box: the editors' pending operations end (macroEndOperations), so the document on screen is the one the
  question is about, as the runaway guard does before its own box.
- After the box: the runaway guard starts its time again (macroPlay.guardSince), so the time the box was open does
  not count as the macro running without changing anything. Step by step does the same after a pause.
- In step by step the box shows as in a normal run; the step it is in ends when it is closed.
- Esc while the box is open closes the box (messagebox), not the macro: the box is modal and has the keys.

### 3.4 Where the words go

- The language (macrolang.js): the statement words, reading the lines, the checker (`ask` writes its variable, as
  `copy`: no "never set" warning when it is read later), the run.
- The editor for macros: the words highlighted (languages/macro/language.yaml), their hints, the Statement... snippets,
  F1 on the word (macros.js).
- The reference (defaults/macros/reference.md): a section Messages with the three.

### 3.5 What is not done

- No input box (a text typed by the user into a variable). It fits the same pattern later (`input $name <text>`).
- No choice of sign (warning, error) and no heading in the box. Not asked for; the text is the whole message.
- A procedure or function named `message`, `messagebox` or `ask` is no longer possible: those are now words of the
  language (the checker says so, as for the other statements).

### 3.6 Tests

- MacroLangTests (Jint): `message`, `messagebox` and `ask` read and run against a stub environment: the text and the
  buttons as given, the answer in the variable, `""` when closed, OK without buttons; `ask` without a variable is a
  mistake at its line; a variable set by `ask` and read later gives no warning.
- By hand in the app: the toast shows and the macro goes on; the box is themed, modal and on top; Enter, Esc and
  the button keys; the answer in step by step's variables; a box open for longer than the runaway guard's time does
  not trigger the guard afterwards.

## 4. Open questions

None.

## 5. As built

- As planned. The statements are in web/macrolang.js (the words, reading, the checker, the run); the environment
  (toast, box, guard time) in web/macros.js (macroEnv.message, macroEnv.ask); the host call `macroAsk` in
  MainForm.cs on AskForm; the words in languages/macro/language.yaml, the hints and snippets in macros.js, the
  reference in defaults/macros/reference.md (section Messages; F1 on the words finds it, as the other statements).
- The "term or terms joined with &" reading that `find` and `replace` had inline is now one helper in
  macroStatement, used by them and by the new statements.
- The messagebox has the information sign, ask the question sign.
- `ask` without a Cancel button: Esc does nothing (as a Windows box without Cancel); the window's X closes it and the
  answer is `""`.
- Tested: MacroLangTests (Jint), new tests for message, messagebox, ask (answer, closed, no buttons), the checker
  (no warning for a variable set by ask) and the mistakes; all macro language tests pass. Not yet tried by hand in
  the app (3.6, by hand).
