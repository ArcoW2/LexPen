# Plan: Hex view

Status: draft 2026-10-21, revised 2026-11-08 (five times); not started. From the list "what UltraEdit or Visual
Studio has and LexPen does not". The number in the file name is the priority; rename to reorder.

## 1. What this is about

The exact bytes of a file cannot be seen, let alone changed: of a text file its BOM, its line ends, a stray or
invisible character; of a binary file anything at all, as LexPen refuses one today ("a file type LexPen does not
know"). UltraEdit has a hex mode for any file, to view and edit.

## 2. The solution, in brief

A view "Hex" for any tab, a text file as much as a binary one: per line the offset, the bytes in hex, and after them
the same bytes as text, one character per byte (extended ASCII), where a byte that is no character shows as a small
centred dot. Both parts can be edited, always overwriting; whatever changes the file's length is an explicit choice:
inserting bytes, deleting a selection or filling it with 00, pasting in or over (Ctrl+V and Ctrl+X ask which).
Settings choose the number of bytes on a line and an extra space after every so many bytes. Text, Column and Hex
are three ways to work on a tab, one at a time: on the ribbon three radio buttons. A text file switched to
Hex shows its text as it would be saved, unsaved changes included, so Hex also checks how it will be written. A file
LexPen does not know (today refused) opens in Hex by default.

## 3. Details

### 3.1 The view

- **A line**: the offset (hex, as many digits as the file needs, at least 8), the bytes in hex (two digits each, a
  space between), and after them the text part: one cell per byte.
- **The text part**: one byte, one character: extended ASCII, as Windows-1252 (Windows' Western set). A byte that
  is a printable character there shows as that character; a control byte (00-1F, 7F) and the bytes 1252 leaves
  undefined (81, 8D, 8F, 90, 9D) show as a small centred dot (the middle dot, U+00B7, drawn in the dimmed text
  colour, so it cannot be mistaken for a real one). A character of more bytes (UTF-8 beyond ASCII) cannot be shown as
  one: its bytes show as what each is on its own.
- **Settings** (Settings, Editor view, a sub "Hex"):
  - `hexBytesPerLine`: the bytes on one line; default 16.
  - `hexGroup`: an extra space after every so many bytes, in the hex part and the text part alike; default 8; 0 for
    none.
  A change applies at once to every Hex view, as other settings do.
- **Opening it**: for any file, a tab's mode next to Editor and Preview (the top bar's buttons and View > Hex, with
  an action `hex.toggle` for a key, and on the ribbon: below); a text file switched to Hex and back is the same tab. A file LexPen does not know
  (a zero byte, today refused) opens in Hex by default; a binary kind LexPen does show (PDF) opens as now, with Hex
  one switch away.
- **A text file in Hex**: the bytes are the text as it would be saved now: its encoding, its line ends, its BOM, the
  unsaved changes included; nothing has to be saved first. So Hex also shows whether the text will be written as
  expected (a BOM or not, CR LF or LF, how a character is encoded). A change in Hex goes back into the editor's text
  (decoded with the file's encoding), as one undo step there. Bytes the encoding cannot read (E9 typed in a UTF-8
  file) are allowed: they become the stand-ins LexPen already uses for such bytes (TextFile.Decode: the editor shows
  one as 0xE9, and saving writes the byte back), so nothing is lost and they are easy to recognise.
- **No checks of a format**: Hex changes bytes, whatever they mean. A PDF (or any file of a known kind) changed in Hex
  can become invalid, as any file that merely looks like a PDF can be; LexPen does not check or warn.
- **Three ways to work on a tab, one at a time**: Text (as now), Column (column mode on) and Hex. One action
  `editMode.set` with the variants `text`, `column` and `hex` (as `tabBar.set`): each sets its mode and is checked
  while that mode is the one in use, so only one is ever checked. Hex is per tab; column mode stays what it is now (on
  or off for the window), so a text tab shows Column or Text by it, a tab in Hex shows Hex. `columnMode.toggle` and
  `hex.toggle` stay for their keys; `hex.toggle` switches between Hex and the mode the tab had before.
- **On the ribbon**: Arrange > Select, where the large Column mode button is now: three small buttons stacked, Text,
  Column and Hex (`editMode.set` with each variant), radio buttons by how the ribbon already shows a checked
  variant: the one in use lit, a click on another switches, a click on the lit one changes nothing. In
  `defaults/ribbon.json`; a ribbon.json of your own keeps its Column mode button until changed by Customize or change
  mode.
  - *The icons*, as the other ribbon icons (executed/PLAN-ribbon.md 3.4: the 16-unit grid in the text colour, small
    16 px with lines of 1.4 and large 32 px with lines of 1.0), added to `ribbonicons.js` and the icon sheet:
    Text: lines of text with the caret; Column: Column mode's drawing as it is; Hex: a page with two rows of two hex
    digits ("0F" over "A3") in strokes, at 16 px one row ("0F") if two do not read.
- **Large files**: the host reads the bytes in pieces, as the view scrolls, so the 10 MB limit of a text file does
  not apply to Hex. The upper limit for Hex: [not yet checked].

### 3.2 Editing

- **Two parts, one cursor**: the cursor is on one byte, shown in both parts. Tab moves between the parts; a click in
  either part puts the cursor there.
  - *Cursor in the hex part*: the byte's two digits are coloured (the selection colour), the caret stands before
    the digit being typed (a byte is two characters, so the caret stays visible inside the colour), and the byte's
    character in the text part is underlined.
  - *Cursor in the text part*: the caret is in the text, before the byte's character, and the byte in the hex part
    is underlined.
- **In the hex part**: a hex digit (0-9, a-f in either case) replaces the digit at the caret; after the low digit
  the caret goes on to the next byte's high digit.
  - Delete removes the one digit at the caret, Backspace the one before it: a byte loses a digit, never the byte
    itself. A byte with one digit left shows it where it stands: a digit at the right is the low half, one at the
    left the high half. Typing a digit fills the empty place.
  - When the cursor leaves such a byte, its empty half becomes 0 (a left "A" becomes A0, a right "7" becomes 07); a
    byte with both digits removed becomes 00.
- **In the text part**: a character typed writes its one byte (Windows-1252) at the cursor and moves on; a character
  that has no byte there (outside extended ASCII) is refused, with a message. Delete sets the byte at the cursor to
  00 and stays; Backspace moves one byte left and sets that byte to 00.
- **Always overwrite**: typing never makes the file longer or shorter, so every offset stays where it is (formats
  with fixed positions stay intact). Ins does not switch to inserting; Delete and Backspace work as above and never
  remove a byte.
- **A selection**: a range of bytes, made with Shift and the arrow keys or by dragging, in either part; shown in both
  (the selection colour). Copy (Ctrl+C) puts it on the clipboard: from the hex part as hex digits ("3F 00 A1"), from
  the text part as its text.
- **What changes the length is explicit**, a choice each time (and an action each, for a key):
  - *Insert bytes...* (right-click, `hex.insert`): asks how many and inserts that many zero bytes (00) at the
    cursor, the cursor on the first, to be typed over.
  - *On a selection* (right-click): *Fill with 00* (`hex.fill`): its bytes become 00, the length the same; *Delete
    bytes* (`hex.delete`): its bytes are removed and the bytes after it move up, the file shorter.
  - *Ctrl+X* opens a small menu at the cursor: *Cut and fill with 00* (copied, then filled; the length the same) or
    *Cut* (copied, then deleted; the file shorter). Esc: nothing.
  - *Ctrl+V* opens a small menu at the cursor: *Paste over* (`hex.pasteOver`: the clipboard's bytes overwrite the
    bytes from the cursor on, or from the selection's first byte; the length the same) or *Paste in* (`hex.pasteIn`:
    the bytes from the cursor on move along and the clipboard's bytes are placed at the cursor, the file longer by
    that many). The right-click has both as well. Esc: nothing.
  - Paste over stops at the end of the file: it never makes the file longer; the bytes left over are not pasted, and a
    message says how many.
  - The clipboard's bytes: in the hex part its text read as hex digits (spaces and line ends ignored; anything else
    and nothing is pasted, with a message); in the text part its characters as Windows-1252 bytes (a character
    without one: nothing is pasted, with a message).
- **Undo / redo** (Ctrl+Z / Ctrl+Y) per change; a changed byte stands out (the changed colour) until saved.
- **Save** of a file opened in Hex writes the bytes exactly as they are: no encoding, no line ends, no BOM added or
  removed. A text file edited in Hex is saved as text, as always (3.1).
- **Find in Hex**: bytes (hex digits, spaces allowed) or text.

### 3.3 How

- The host: `hexRead` (a path, an offset, a length: the bytes) and `hexWrite` (the changes, written to the file as
  one save); the file's size and change time, so a change outside LexPen is seen as with text files; for a text
  tab, the text encoded as it would be saved (the same code as saving) and decoded back.
- The page: a view of its own (not CodeMirror), drawing only the lines in sight; the line layout (offset, groups, the
  characters and dots) and a byte's digit editing in a pure model file run by the tests under Jint, as
  ribbonmodel.js.

### 3.4 Tests

- Unit (C#): `hexRead` of a range, at the start, the end and past it; `hexWrite` changing bytes and leaving the rest
  exactly as it was; a text encoded for Hex equals the bytes a save writes (UTF-8 with and without BOM, UTF-16, ANSI;
  CR LF and LF), and decodes back to the same text.
- Unit (C#): the shipped ribbon.json has `editMode.set` text, column and hex stacked in Arrange > Select, and no
  `columnMode.toggle` there (RibbonTests).
- Unit (Jint): a byte's digits edited (one removed at the left or the right, the empty half filled with 0 on
  leaving, both removed giving 00, a-f in either case); a line's layout for several `hexBytesPerLine` and `hexGroup`
  values (16 / 8, 8 / 0, 32 / 4); the characters of 20-7E and A0-FF, of 80-9F where 1252 has one, and the dot for
  control and undefined bytes; the offset's width for a small and a large file.
- In the test copy:
  - opening: a small binary file opens in Hex; a text file with a BOM shows EF BB BF; scrolling a large file; the
    ribbon's Text, Column and Hex (Arrange): exactly one lit at any time; Hex lit on a tab in Hex and Text or Column
    on a text tab (by column mode); a click on another switches, on the lit one changes nothing; Column mode's key
    and the Hex key light the right one too; switching tabs between a Hex and a text tab moves the light; the three
    icons at both sizes in a light and a dark theme;
  - a text file with unsaved changes switched to Hex shows them (no save asked); CR LF and LF files show 0D 0A and
    0A; a byte changed in Hex shows in the editor, and one Ctrl+Z there takes it back; E9 typed in a UTF-8 file
    shows in the editor as 0xE9 and a save writes E9 (compared byte for byte);
  - typing: a hex digit changes the byte and the text part follows; a character typed in the text part changes the
    hex part; "e with acute" types E9; a character outside 1252 is refused; "a" and "A" type the same digit;
  - the marks: the byte coloured with the caret inside and its character underlined; in the text part the byte
    underlined;
  - Delete and Backspace: in the hex part Delete on the high digit of 3F leaves "F" at the right, and leaving the
    byte makes it 0F; Backspace after the low digit of 3F leaves "3" at the left, and leaving makes it 30; both
    digits removed and leaving makes 00; in the text part Delete sets the byte to 00 and the cursor stays, Backspace
    sets the byte before it to 00 and the cursor goes there; typing, Ins, Delete and Backspace never change the
    file's length;
  - the explicit ones: Insert bytes... with 4 makes it 4 bytes longer, zeros at the cursor; a selection of 3 bytes:
    Fill with 00 keeps the length, Delete bytes makes it 3 bytes shorter and the next bytes move up; Ctrl+X's menu,
    both choices, and Esc; with "3F 00 A1" on the clipboard, Ctrl+V's menu: Paste over changes 3 bytes and keeps the
    length, Paste in makes it 3 bytes longer with the old bytes after them, Esc changes nothing; Paste over 2 bytes
    before the end pastes 2 and says 1 was left over; text that is no hex pastes nothing in the hex part;
  - Copy from either part; undo; save, and the file's other bytes unchanged (compared byte for byte); the settings
    change the layout at once.

### 3.5 Alternatives

- **Read-only first, editing later**: less work, but the point is to change a stray byte; editing is in this plan.
- **A hex dump as text in the editor**: no new view, but editing the dump does not edit the file, and a large file
  does not fit.
- **The text part in the file's own encoding (UTF-8)**: a character of several bytes cannot have one cell per byte;
  one byte, one character keeps the two parts in step.
- **Hex of a text file shows the file on disk (save first)**: simpler, but it would not show what the next save will
  write, which is a reason to look.

## 4. Open questions

None.
