# Plan 41: LexPen's own question boxes

Status: draft 2026-11-06, not started.

## 1. The enhancement

Most questions LexPen asks come in a Windows box (MessageBox, TaskDialog): grey, in Windows' font, not in the
theme of the window that asks. A few are already LexPen's own, in the page (the highlights' confirm, Delete... in
the folder pane, a name). All questions should be LexPen's own. The file open and save dialogs stay Windows'.

## 2. The solution, in brief

One question box in the pages, `ask` (ask.js and its CSS, shared by every page that asks): a heading, a text,
optional boxes or choices, buttons (with a line under them, as Windows' command links), an optional "Show details",
a default button, Esc for Cancel. The page's own questions call it directly. A question the host asks (merge
projects, close projects, Save as default, ...) is posted to the page of the window it belongs to, which answers
it; the host waits for that answer without blocking. Only where there is no page to ask in does a Windows box stay.

## 3. Details

### 3.1 The questions now (found with grep: `Program.ShowTask`, `MessageBox.Show`)

| Where | What | Asked by |
|---|---|---|
| MainForm `confirm` | A yes / no question of the page (several callers in app.js) | page |
| MainForm `askSave` | Save before closing a document: Yes / No / Cancel | page |
| MainForm `askKeepComments` | JSON with comments: keep / remove / cancel | page |
| MainForm `AskBackups` | Delete the .bak files: here / with subfolders / cancel | page |
| MainForm `AskImageMode` | Images added: relative / absolute / copy here / copy to image folder | page |
| MainForm (Heading "Save before closing?") | The window's documents before it closes | host |
| AppHost Save as default | Layout and / or theme set as default (radio buttons) | host, main window |
| AppHost Merge projects | Merge into a project | host, Manage projects |
| AppHost Delete projects | Save documents / keep drafts / delete without saving (command links) | host, Manage projects |
| AppHost Close projects | With "Show details" | host, Manage projects |
| AppHost theme set delete | Delete the set, naming its users | host, Theme sets |
| AppHost ResetViewLayout | No project for viewing (message); give it the view layout (yes / no) | host, Settings |
| SettingsForm file types | Assign these file types (yes / no); what Windows kept (message) | host, Settings |
| MainForm "could not start its browser view" | No page | stays Windows |
| MainForm "The window does not respond" | The page does not answer | stays Windows |
| AppHost `--compare` wrong arguments | From the command line, possibly no window | stays Windows |

ReplacePreviewForm (the Search panel's Replace preview) is a form of its own, not a question: not in this plan.

### 3.2 The box

- In the page's theme (app colours, app font), modal over the page (`<dialog>`), as the name and confirm boxes now.
- Parts: heading, text (lines kept), a list of checkboxes or radio buttons (each with its value and default),
  buttons. A button may have a line under it (command link). An optional details text behind "Show details".
- Keys: Enter the default button, Esc Cancel (when there is one), Tab between the parts.
- Answer: the button's value, and the boxes' state when there are boxes.
- `confirmBox` (highlights.js) and the Delete... question (app.js) become calls of it.

### 3.3 The host asking a page

- `AskPage(form, question)`: posts `{ event: "ask", id, question }` to the page of that form (a main window, Settings,
  Manage projects, Theme sets); the page shows the box and answers with `host('answer', { id, answer })`. The host
  awaits a `Task` (no nested message loop); the callers become async.
- The window is brought to the front first; a question for a window that closes meanwhile answers Cancel.
- Manage projects, Theme sets and Settings get ask.js too (they are pages of their own).

### 3.4 Stays Windows

When there is no page to ask in: the browser view does not start, the page does not respond (the close question),
a command-line error before a window opens. Also the file open, save and folder dialogs.

### 3.5 Tests

- Unit: the question's JSON (heading, buttons, boxes) per caller where it is built in C#.
- In a test copy (CDP): each question shown in the page, answered by clicking, and the action done or not done;
  Esc cancels; a question for a window that closes answers Cancel.

## 4. Open questions

1. A question the host asks about several windows (Close projects): asked in the window last worked in?
2. Icons (warning, question): keep a small sign in the heading, or none?
