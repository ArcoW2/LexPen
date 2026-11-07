# Plan: Voice typing that starts listening at once

Status: draft 2026-11-07; not started.
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Voice typing is only reachable through the right-click menu (More tools > Voice typing, with the setting
`voiceTyping` on; plan 25 3.5). It opens Windows' own voice typing panel, the one Win+H opens, which then says
"click the microphone button to start voice typing": one more click before you can speak. There is no LexPen command
for it, so no key, no menu item outside the right-click menu, and no toolbar button later.

## 2. The solution, in brief

A LexPen action Voice typing (Edit > Voice typing..., a key of its own, in Keyboard shortcuts and commands) that puts
the focus in the editor at the cursor and opens Windows voice typing as Win+H does. Whether it listens at once is
Windows' own choice: its panel has a setting for that, which the action's hint and the help point to. LexPen does not
press the microphone button itself.

## 3. Details

### 3.1 The action

- `voice.typing`: the editor of the active document pane gets the focus (a preview-only tab first shows its editor),
  then the host sends Win+H (SendInput) to the window. The text goes in where the cursor is, as typed text: one undo
  step per phrase, as Windows delivers it.
- Edit > Voice typing...; the right-click item stays as it is (with the setting); the setting `voiceTyping` keeps
  deciding only the right-click item.
- No key by default (Win+H already works in the editor by itself); one can be set in keys.json.

### 3.2 Listening at once

- Windows' voice typing panel has a settings gear of its own. Whether it has an option to start listening when the
  panel opens, and what it is called on this Windows version, is [not yet checked]: to be checked by hand before
  building, and named in the hint if it exists.
- Pressing the microphone button for you (UI Automation on Windows' panel) is left out: it is another program's
  window, its layout and names change with Windows updates, and a click that misses leaves you waiting without a
  sign of why.

### 3.3 What does not work, alternatives

- WebView2's own Voice typing item cannot be run from a command: it exists only in the right-click menu.
- The Web Speech API (`webkitSpeechRecognition`) in WebView2: speech goes to an online service, needs its own
  permission and does not work offline; Windows' voice typing is the one the user already knows.

### 3.4 Tests

- By hand (a microphone is needed): the action opens the panel; dictated text lands at the cursor; Undo removes it;
  in a preview-only tab the editor shows first.
- Automated: the action is listed, and with no editor (no document) it does nothing.

## 4. Open questions

1. Is Edit the right menu, or Tools (plan 25)?
2. Should the action also be a button for the coming action bar (plan 25 3.7)?
