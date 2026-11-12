# Plan: Macro names as typed, and a macro's tab as LexPen's own

Status: draft 2026-11-12; not started.

## 1. What this is about

- A macro's name cannot hold `\ / : * ? " < > |`, start with `.` or `~`, or end with `.`: it is the file name
  (`macros\<name>.lpm` in the data folder). The New and Give name dialogs close before the name is checked, so a
  refused name is typed again from nothing; Give name does not even put the focus in the field.
- A macro's tab shows the file name (`Report.lpm`), as any file's tab. It is LexPen's own file, edited only as a
  macro and renamed only from the Macros window, yet nothing on the tab says so, and the tab menu offers Rename.
- Tab colours (`tab-colours.json`) take only fixed colours, so no rule can follow the app theme.

## 2. The solution, in brief

A macro's name is stored in its file name with the characters a file name cannot hold written as `%` and their hex
code, so every name but an empty one is allowed; the dialogs check the name while they are open and put the focus in
the field. A macro's tab shows `LexPen: <name>` (the name decoded), and its tab menu has no Rename. A tab colour
value can be a colour of the app theme (`theme:accent`), and the default tab colours get a first rule for tabs
named `LexPen:*` in the theme's own colours.

## 3. Details

### 3.1 The name in the file name

- MacroStore gets one pair: `FileName(name)` and `NameOf(fileName)`. PathOf and List use them; nothing else turns a
  name into a file name.
- Written as `%XX` (two hex digits, upper case): `\ / : * ? " < > |`, the control characters, and `%` itself
  (`%25`). Also, so that no name is refused for where a character stands: a leading `.`, `~` or space, a trailing `.`
  or space, and the first letter of a Windows device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`,
  `LPT1`-`LPT9`, alone or before a dot: `CON` is `%43ON`).
- Read back: every `%XX` is one character; a `%` not followed by two hex digits stays as it is, so a file copied in
  by hand lists under its own name.
- Refusal is left with: an empty name. Two names that differ only in case are one macro, as today.
- The macros folder holds no file with `%` in its name today (looked at 2026-11-11), so nothing is migrated.
- keys.json names a macro by its name, not its file: unchanged.

### 3.2 The dialogs

- `askName` (app.js) gets an optional check: called on OK with the text; a reason keeps the dialog open with the
  reason under the field and the text as typed. New and Give name pass `macroNameRefusal` and the "exists already"
  test; every other caller is unchanged.
- `askName` focuses its field itself (today it only sets the selection). A dialog asked for from a floating pane
  (Macros, Give name...) first brings its window to the front, as the Commands pane does (`host('activate')`,
  palette.js `toDocument`), so the keyboard is in the field.
- Give name renames through the host with the encoded file name (a new `macroRename` host case doing what
  `rename` does, so a tab showing the macro follows), instead of building `to + '.lpm'` in macros.js.

### 3.3 The tab

- A file is a macro when it is `<data folder>\macros\*.lpm` (the folder from the host at start; MacroStore.Dir).
  Its doc gets `label = 'LexPen: ' + <name decoded>`; `docName` already prefers `label` (compare.js uses it the same
  way), so the tab, the tab lists, the window title and the hidden-tabs menu all follow. Set when the doc is made
  and again after a rename.
- Where macros.js takes the macro's name from the tab (`docName(...).replace(/\.lpm$/i, '')`, in Run and Step) it
  asks for the macro's name from the path instead (the same decoding).
- The tab menu hides Rename for a macro's tab (as it hides it for a draft). The Folder pane's Rename is left as is:
  a rename there is a file rename, and the macro takes the decoded new name.
- `show "name"` in a macro matches a tab by its name or path: a macro's tab is found as `LexPen: Report` or by its
  path, no longer as `Report.lpm`.

### 3.4 Theme colours in tab colours

- A colour value in a rule (`background`, `color`, `line`) may be `theme:<name>`, `<name>` a colour of the app theme
  as the theme files name it (`accent`, `bg`, `bgBar`, `fg`, `fgDim`, `border`, `select`, ...). applyTabStyle sets
  it as `var(--<name in kebab case>)`, so the tab follows a theme change without the rules being read again.
- An unknown name: the rule's problem is shown as other problems are (setTabColours' toast), and that value is left
  out.
- The tab's name for matching: a pattern without `\` fits the file name (as now) or the tab's label when it has one
  (`LexPen: Report`, a compare's `a.md @ HEAD`). So `LexPen:*` fits a macro's tab, and `*.md` still fits a compare
  tab of a Markdown file through its file name.
- The default `tab-colours.json` gets as its first rule: match `LexPen:*`, both day and night in theme colours (for
  instance background `theme:bgBar`, text `theme:accent`, active line `theme:accent`; the exact choice tried on the
  shipped themes during the build).
- The file is the user's once written (TabColourFile): an existing file does not get the rule by itself. See open
  question 2.
- PLAN-tab-colours-settings.md (the settings tab for these rules) offers a theme colour next to a picked colour in
  its colour fields; that plan is revised to say so.

### 3.5 Tests

- MacroStoreTests.cs: FileName / NameOf round trip for `Copy: a/b`, `50%`, `.hidden`, `name.`, ` padded `, `CON`,
  `con.txt`, `~x`; a plain name is unchanged; a lone `%` in a file name reads as itself; List shows decoded names;
  Refusal only for empty or white space.
- Tab colours: `theme:accent` gives `var(--accent)`, `theme:bgBar` gives `var(--bg-bar)`; an unknown name is a
  problem and the value is left out; `LexPen:*` fits a labelled tab; `*.md` still fits a file named `a.md` whose tab
  is labelled.
- By hand: New with `Totals: 2026/Q1`, the macro is listed and played by that name, its tab reads
  `LexPen: Totals: 2026/Q1` in the theme's colours, switching the theme recolours it; a refused name (empty) keeps
  the dialog open with the reason; Give name from the floating Macros pane, typing goes into the field at once; the
  tab menu of a macro has no Rename; Run and Step from a macro's tab still work.

## 4. Open questions

1. Only macros, or every file of LexPen's own as `LexPen:` (in the data folder: settings.json, keys.json,
   tab-colours.json, themes, language packs; and the shipped macro reference)? Those keep their file names today
   and can be renamed from the tab.
2. An existing `tab-colours.json` does not get the `LexPen:*` rule. Add it once at the first start after this change
   (in front of the user's rules, its comment saying where it came from), or leave it to the user (the default
   file and the settings tab show it)?
