# Plan 40: files that are not text

## 1. The problem

A PDF is LexPen's first file that is not text (plan 38), and others may follow (Word, Excel). How LexPen treats such a
file is decided by its extension alone, which goes wrong in several ways:

- A PDF with another extension (or none) is refused as "... is not a text file", although LexPen can show it.
- A file named `.pdf` that is text is handed to pdf.js, which shows an error instead of the text.
- Any other file that is not text gets "... is not a text file", which reads as a fault rather than "LexPen does not
  know this kind of file".
- The language of a PDF tab can be changed (the bottom bar, F1), although it stays a PDF: the change does nothing
  visible and is kept for the file.
- A text file's language can be set to PDF: its tab then shows only a preview that is not a PDF.

(Edit in LexPen on a PDF showed an empty editor: fixed apart from this plan, commit `3058cab`; it now opens as View in
LexPen does.)

## 2. The solution, in brief

A language pack for a kind of file that is not text says so, with the bytes such a file starts with (a PDF: `%PDF-`
within its first 1024 bytes). Opening a file looks at its first bytes, not only its name: a file with those bytes opens
as that kind, whatever its extension; a `.pdf` without them opens as text, with a message that it is not a PDF; a file
that is neither text nor a known kind gets "... is a file type LexPen does not know". Such a kind's language cannot be
changed (the bottom bar shows it dimmed), and in a text file's language list it is shown dimmed and cannot be chosen.

## 3. Details

### 3.1 The pack

- `language.yaml` gets `binary: true` and `starts: ["%PDF-"]` (with `within: 1024`; pdf.js itself accepts the header
  that far in). Only the PDF pack has them now; a Word pack later would say `PK` plus its own check, which is why the
  rule lives in the pack and not in code.
- The host reads the packs' signatures with the packs it already reads.

### 3.2 Opening

- The host's `read` looks at the first bytes before it decodes: a binary pack's signature matches -> it answers
  `{ kind: 'pdf' }` (no text), and the window opens the file as that kind (today's PDF path, chosen by the answer
  instead of `isPdfPath`). The Folder pane, a drop, File > Open, Explorer and the command line all go through it.
- No signature, but text (today's test: no zero byte in the first 8000 bytes, or UTF-16): opened as text, as now. When
  the extension is a binary pack's (`.pdf`): also a message, "x.pdf is not a PDF file; opened as text". Its language is
  the one found for its text (not PDF).
- Neither: "x is a file type LexPen does not know." (replaces "is not a text file").
- `isPdfPath` stays only where a file is not opened: the Folder pane's icon and type column, File types in Settings.

### 3.3 The language

- A tab of a binary kind: the bottom bar's language shows its name dimmed, not a button; F1's language list does not
  open for it (a short message: "A PDF is always shown as a PDF").
- A text tab: the language list shows the binary kinds dimmed, last, with the tooltip "Only for PDF files"; they cannot
  be chosen. A file that had PDF chosen before (kept by the host) is opened with its found language, and the kept
  choice is dropped.
- Edit in LexPen, and a file type set to "edit" in Settings, open a binary kind as View in LexPen does (done for PDF:
  `3058cab`, by extension; with this plan by the kind found).

### 3.4 Tests

- Host (xUnit): signature found at the start and within 1024 bytes; not beyond; a text `.pdf` read as text; a binary
  file without a signature refused with the new message.
- In a test copy: a copy of a PDF renamed `.bin` and without an extension opens as a PDF; a text file renamed `.pdf`
  opens as text with the message; the PDF tab's language is dimmed and does not change; PDF is dimmed in a text file's
  list.

## 4. Open questions

1. Choosing a kind by hand (a binary file without a known signature, "Open as PDF"): not planned. For a PDF the
   signature finds every file pdf.js can show, so the choice could only open files that then fail. Worth adding when a
   kind comes whose files cannot be told by their first bytes. Agree?
2. A file that is neither text nor known: only the message (as now), or a tab that says so (and offers to open it
   with Windows' program for it)? Recommended: the message only.
