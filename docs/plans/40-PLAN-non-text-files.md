# Plan 40: files that are not text

Status: built on branch plan-40 (see 5. As built).

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
- The Folder pane, its file types and File types in Settings go by the packs' extensions, as for any language.
- A kind is not chosen by hand ("Open as PDF"): the first bytes find every file pdf.js can show, so a choice could only
  open files that then fail. Worth adding when a kind comes whose files cannot be told by their first bytes.
- A file that is neither text nor a known kind gets the message only (no tab).

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

None.

## 5. As built

Built on branch `plan-40` (2026-11-06).

- `LanguagePacks.cs`: a pack's `binary`, `starts` and `within` checked (a wrong one reported and left out);
  `KindOf` (the kind from a file's first bytes, else a binary pack without `starts` by its extension), `IsBinary`,
  `BinaryOfExtension`. The PDF pack: `binary: true`, `starts: ['%PDF-']`, `within: 1024`; the template explains them.
- `MainForm.cs`: `read` answers `{ kind }` for such a file (only its first bytes read, so a PDF over the text size
  limit opens too), else the text with `notKind` when its extension is a binary kind's; a kept choice of such a
  kind's language for a text file is dropped. A file neither text nor known: "x is a file type LexPen does not know."
  The file site serves a PDF by its first bytes too (pdf.js fetches it), not by its extension.
- `app.js`: `loadDoc` opens by the host's answer (`loadKindDoc`: the PDF path, its language set to the kind); a text
  file named as a kind: "x.pdf is not a PDF file; opened as text." Edit in LexPen on a kind: as View in LexPen. The
  bottom bar's language of a kind is dimmed; a click says it stays. `languages.js`: `languageFor` never gives a binary
  kind for text; the language list shows the kinds last, dimmed, "PDF files only"; `setLanguage` refuses them.
- Tests: `LanguagePacksTests` (the PDF found at the start and within 1024 bytes, not beyond, whatever its name; a text
  `.pdf`; a wrong binary pack reported; one without `starts` by its extension). In a test copy: a PDF named `.bin` and
  one without an extension open as PDF (also by Edit in LexPen); a text `fake.pdf` opens as text with the message, its
  kept PDF choice dropped; a random binary file gets the new message; the PDF tab's language is dimmed and the list
  does not open; PDF is dimmed and last in a text file's list and cannot be set.

Differs from the plan:

- A pack may also say `binary: true` without `starts`: it then goes by the extension (for a kind whose files cannot be
  told by their first bytes).
- `within` may be up to 4096; the host reads that many bytes plus a little to find a kind.
- A binary pack of yours that LexPen has no view for: its files are refused with "LexPen cannot show <name> files."
