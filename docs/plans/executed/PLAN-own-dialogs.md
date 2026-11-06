# Plan 41: LexPen's own question boxes

Status: executed (2026-11-06); see 5. As built.

## 1. The enhancement

Most questions LexPen asked came in a Windows box (MessageBox, TaskDialog): grey, in Windows' font, not in the
theme of the window that asks. A few were already LexPen's own, in the page (the highlights' confirm). All questions
should be LexPen's own. The file open and save dialogs stay Windows'.

## 2. The solution, in brief

One question window, AskForm: a native modal window in the app theme of the window that asks (its colours, the app
font, its caption), movable by its title bar. It has a sign (information, question, warning, error), a heading, a
text, optional checkboxes or choices, buttons or command links, and an optional "Show details". Every question the
host or a page asks goes through it. Only where there is no window to ask over does a Windows box stay.

## 3. Details

### 3.1 The questions (found with grep: `Program.ShowTask`, `MessageBox.Show`)

| Where | What | Asked over |
|---|---|---|
| MainForm `confirm` | A yes / no question of the page; with `ok`, OK / Cancel (confirmBox) | the window |
| MainForm `askSave` | Save before closing a document: Yes / No / Cancel | the window |
| MainForm `askKeepComments` | JSON with comments: keep / remove / cancel | the window |
| MainForm `AskBackups` | Delete the .bak files: here / with subfolders / cancel (command links) | the window |
| MainForm `AskImageMode` | Images added: relative / absolute / copy here / copy to image folder (command links) | the window |
| MainForm `ClosePrompt` | The window's documents before it closes | the window |
| MainForm `DeleteAsked` | Delete... in the folder pane, with the files beside it (checkboxes) | the window, near the row |
| AppHost Save as default | Layout and / or theme set as default (choices) | the window, or Settings |
| AppHost Merge projects | Merge into a project | Manage projects |
| AppHost Delete projects | Save documents / keep drafts / delete without saving, "Show details" | Manage projects |
| AppHost Close projects | Save / close without saving, "Show details" | Manage projects |
| AppHost theme set delete | Delete the set, naming its users | Theme sets, Settings or the window |
| AppHost ResetViewLayout | No project for viewing (message); give it the view layout (yes / no) | Settings |
| SettingsForm file types | Assign these file types (yes / no); what Windows kept (message) | Settings |
| highlights.js `confirmBox` | Remove highlights, rewrite a CSV, stop a macro: OK / Cancel | the window (via `confirm`) |
| MainForm "could not start its browser view" | No page | stays Windows |
| MainForm "The window does not respond" | The page does not answer | stays Windows |
| AppHost `--compare` wrong arguments | From the command line, possibly no window | stays Windows |

ReplacePreviewForm (the Search panel's Replace preview) is a form of its own, not a question: not in this plan.

### 3.2 The box

- Native (a WinForms Form), not a dialog in the page: modal over its window, movable, works over any of LexPen's
  windows (Settings, Manage projects, Theme sets are pages in forms of their own).
- Parts: a sign at the left, a heading (larger, in the accent), the text (lines kept), checkboxes (all checked) or
  choices (one checked), drawn as Settings' are; command links (a button with a note: the name in the accent, the
  note under it) one under the other; the other buttons in a row at the right; "Show details" at the left of that
  row, the details under it.
- Keys: Enter the default button (filled with the accent; a default command link is framed in it), Esc Cancel,
  Tab between the parts.
- Answer: the button's value (null: Cancel, Esc or closed), and the values of the checked boxes or the choice.
- Text is shown as it is: an `&` in a name is not a shortcut marker.

### 3.3 Which window it asks over

- Over the window the question comes from: the window whose page asks, or the window where the action was started
  (Close projects from Manage projects: over Manage projects).
- When that is unclear (no window given, or it is gone or hidden, e.g. at a Windows shutdown): over the window last
  worked in.
- Its look: that window's when it is a main window, else the window last worked in.

### 3.4 Stays Windows

When there is no page or window to ask over: the browser view does not start, the page does not respond (the close
question), a command-line error before a window opens. Also the file open, save and folder dialogs.

### 3.5 Tests

- Unit: the existing tests (no question window in them).
- In a test copy (CDP and UI Automation): each kind of question shown and answered by pressing its buttons; the
  answer as expected; a choice made; "Show details" opened; Cancel leaves everything as it was.

## 4. Answered questions

1. A question the host asks about several windows (Close projects): asked over the window where the action was
   started; when unclear (e.g. at a Windows shutdown), over the window last worked in.
2. Icons: kept, a sign for what the question is (information, question, warning, error).

## 5. As built

- `AskForm.Question` (heading, text, sign, boxes, choices, buttons with an optional note, default, details, near);
  `AskForm.Ask` / `Answer` / `Tell` (a message with OK). `Program.ShowTask` is gone.
- The page's own confirm dialog (index.html `.mm-confirm-dialog`) is gone: `confirmBox` asks the host (`confirm` with
  `ok`).
- Added signs where the Windows box had none: the .bak question and the image question (question).
- Checked in a test copy: the confirm box (OK), Save (No), the .bak command links (Delete with subfolders, Cancel),
  the JSON comments question (Yes), Save as default with a theme set (a choice, OK), Close projects from Manage
  projects with "Show details" (Cancel: the document stays unsaved).
