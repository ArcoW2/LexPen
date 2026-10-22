# Plan: Character tools: code at the cursor, a character picker, insert by code

Status: executed 2026-10-22 (web/charpicker.js, CharInfo.cs; in-app test t97, 33 checks). From the list "what UltraEdit or Visual Studio has
and LexPen does not", and your wish for a picker like the Windows Character Map.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

The bottom bar does not show which character is at the cursor (its code), and a character cannot be inserted by
its code or picked from a table. UltraEdit shows the code (hex) and has a character map; Windows has Alt+code and
the Character Map (charmap), which shows every character of a font in a grid, with a free field to collect
characters and copy them.

## 2. The solution, in brief

The bottom bar shows the character at the cursor as `U+00E9` (its name in the tooltip). A click there, or Edit >
Insert character... or Ctrl+Alt+U, opens a character picker like the Windows Character Map: a grid of every character the
editor's font has, drawn in that font, grouped by Unicode block, with a search field (a code such as `e9` or
`U+1F600`, an entity such as `&eacute;`, the character itself, or a word of its name) and a free field below where
picked characters gather and can be edited. Insert puts the free field's text at the cursor (in a block: on each
line); a double click on a character inserts that one at once.

## 3. Details

### 3.1 The code at the cursor

- The bottom bar: the code point at the cursor as `U+00E9` (a surrogate pair as one character); the tooltip: its
  name (3.4), decimal and hex, and its UTF-8 bytes.
- A stand-in for a byte that could not be read (plan 23, U+F780 plus the byte) shows as that byte (`0xAB`, "a byte
  the encoding could not read").
- A click on it opens the picker at that character.

### 3.2 The picker

- Opened by Edit > Insert character..., by Ctrl+Alt+U (a new default key; Ctrl+Shift+U is upper case), or by a
  click on the code in the bottom bar.
- A dialog in the page (as Go to line), not a window of its own: resizable, its size remembered (also after a
  restart), Esc closes it, the focus goes back to the editor.
- The grid: every character of the editor's font, drawn in that font and size (a zoom slider for a closer look),
  in code order, a header per Unicode block (Basic Latin, Latin-1 Supplement, Greek, Arrows, Box Drawing, ...); the
  blocks also as a list at the side to jump to. Control characters and unassigned codes are left out.
- Which characters the font has: the host asks Windows (GetFontUnicodeRanges for the editor font, MainForm), so the
  grid shows only those; a box for the rest would be noise. With "All characters" on, the grid shows every
  assigned character, the ones the font lacks drawn by the fallback font and marked.
- A character under the mouse or the keyboard (arrows, PgUp / PgDn, Home / End): large at the side, with its code,
  name and UTF-8 bytes.
- The search field: a code (`e9`, `0xe9`, `U+E9`, `233` as decimal with a `#`: `#233`), an HTML entity
  (`&eacute;`), the character itself, or words of its name (`arrow left`): the grid jumps to it, or with words
  shows only the matches.
- The free field ("characters to insert"): Enter or a click on a character adds it at the field's cursor; the field
  is ordinary text (type, delete, paste). Insert puts it at the editor's cursor and closes; Copy puts it on the
  clipboard. A double click on a character inserts that one at once.
- Recently used: the last characters picked, a row above the grid (kept for all windows and restarts, as the find
  history).

### 3.3 Insert by code without the picker

- In the search field, Enter on a code or entity inserts that character directly (the picker as a small "insert by
  code" box).
- In a block (column mode): the text goes in on each line, as typing does.

### 3.4 Names

- From Windows, as the Character Map gets them: `GetUName` in getuname.dll (System32), asked by the host. Nothing
  to ship, nothing to load at start; tried on this machine: an answer per character at once, in English ("Latin
  Small Letter E With Acute", "Rightwards Arrow", "Box Drawings Double Horizontal").
- It knows the characters up to U+FFFF only. CJK ideographs get one name for all ("CJK Ideograph"), private use
  "Private Use", a code without a character "Undefined" (left out of the grid).
- Characters above U+FFFF (emoji, historic scripts): no name, only the code; search by name does not find them.
  The editor fonts LexPen offers (monospaced) hardly have any; with All characters on they show without a name.
- For the search by name: the host makes the list of names for the grid's characters once, when the picker first
  opens (the font's characters only), and keeps it; the page searches that list. It must stay quick: measured when
  built, and if making the list is slow, it is made once in the background and kept in the State folder.

### 3.5 Tests

- In-app: the code shown in the bottom bar for ASCII, an accented letter, an emoji (a surrogate pair) and a
  stand-in byte; the picker: the grid in the editor's font has a character the font has and not one it lacks (and
  with All characters on, it has it, marked); search by hex, by `#` decimal, by entity, by name words; the free
  field gathers clicks and is editable; Insert at the cursor and in a block; a double click inserts at once;
  recently used kept after a restart.
- Unit test: the host's list of the font's characters for a known font (Consolas has U+00E9, not U+1F600).

## 4. Open questions

None.

## 5. Resolved during execution

| Topic | As built |
|---|---|
| The size (your remark at the start) | The dialog is resizable (CSS `resize: both`) and keeps its size: stored when it changes (`localStorage`, the same for every window, kept after a restart), so are the zoom and All characters. Found by the test: with the padding outside the size, the dialog grew by its padding at every opening; it measures with `box-sizing: border-box` now. |
| Which characters | The host: `GetFontUnicodeRanges` for the editor font (`CharInfo.FontChars`, kept per font); a font Windows does not have gives none (a note says so; All characters still works). Left out: control characters, surrogates, private use (the stand-ins of plan 23 live there), U+FFFE and U+FFFF. All characters: every code up to U+FFFF with a Windows name: 54357 here, made in 267 ms in a unit test run (machine-measured, once per run of LexPen). |
| Speed | The page never holds every name: a name is asked when shown (and kept), a search by name runs in the host over the list (`charSearch`). The grid makes only the rows in view (a few hundred cells), so the 54357 of All characters scroll as quick as a font's few thousand. |
| The blocks | From .NET's `System.Text.Unicode.UnicodeRanges` (every block up to U+FFFF), the names spaced (`GreekandCoptic` -> Greek and Coptic, `IpaExtensions` -> IPA Extensions). |
| Search | A code: `U+E9`, `0xe9`, `#233` (decimal), or hex with a digit in it (`e9`; a word such as `face` is a name); an entity, decoded by the browser; one character. Else words of the name, every word in it, any case. A code the grid does not have (another font, above U+FFFF): a note, and Enter inserts it all the same. |
| Click and double click | A click (or Enter) adds the character to the free field at its cursor; a double click inserts that one character at once and leaves the free field as it was before the two clicks. |
| Insert | `replaceSelection(text, 'end', '+input')`, so several cursors and a block in column mode get it on every line, as typing; past the end of a line (virtual space) the spaces first. A read-only tab: a notice. |
| Recently used | The last 32 characters inserted, in `localStorage` (shared by the windows, kept after a restart), not in a host file as the find history: the picker is the only one reading it. |
| The bottom bar | The code of the character after the cursor (none at a line end or with a selection); its name, decimal and UTF-8 bytes in the tooltip, asked when the mouse comes on it (not at every cursor move). |
| AltGr (found while building) | Windows sends AltGr as Ctrl+Alt, so AltGr+U ("u acute" on US-International) would have opened the picker instead of typing, as AltGr+C already ran Ctrl+Alt+C. keys.js now lets a key type when the browser reports AltGr and a letter or digit key gives another character than its own; plain Ctrl+Alt+U and a layout without AltGr text still get the shortcut. Tested with a stand-in event (the debugging port cannot hold AltGr). |
| Tests | t97 (in the app): 33 checks pass: the bottom bar for ASCII, e acute, an emoji (a surrogate pair), a line end and a byte that could not be read, the tooltip; Ctrl+Alt+U at the character after the cursor; the grid in the editor font (e acute, no CJK), the block headings and list, only the rows in view; the search by hex, U+, 0x, #decimal, entity and the character, by name words; clicks gather in the free field, Insert at the cursor, Enter on a code, a double click; several cursors in column mode; All characters with a CJK ideograph marked; the size and the recently used after a restart; AltGr text; the key. Unit tests: 209 pass (CharInfoTests: the font's characters, a font Windows lacks, names, the blocks and their names, the name search, all characters). Run again, passing: t94 16, t3 35, t10 11, t84 11, t91 18, t92 26, t89 14, t95 6, t85 46, t52 41. |
