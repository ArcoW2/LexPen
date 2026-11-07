'use strict';
// The character picker, the main window's side (docs/plans/15-PLAN-character-picker-window.md): the picker is a
// window of its own (CharPickerForm, charpicker.html / charpage.js). Here: the code at the cursor in the bottom bar
// (charAtCursor; at a line's end the line end), opening the picker there, inserting what it sends (the event
// insertText: at every cursor, on every line of a block), and while it is open telling it the character after the
// cursor.

const charPicker = { open: false, timer: 0, names: new Map() };
const codeLabel = n => 'U+' + n.toString(16).toUpperCase().padStart(4, '0');
const utf8 = s => [...new TextEncoder().encode(s)].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

async function charName(code) {
  if (!charPicker.names.has(code)) charPicker.names.set(code, await host('charName', { code }).catch(() => null));
  return charPicker.names.get(code);
}

// What follows the cursor: a character (its code; a surrogate pair as one), a stand-in for a byte the encoding of
// the file could not read (TextFile.StandIn, U+F780 plus the byte) as that byte, or at a line's end the line end
// (LF, CRLF; on the last line: end).
function charAtCursor(cm) {
  const pos = cm.getCursor('head'), text = cm.getLine(pos.line);
  if (pos.ch >= text.length) {
    const last = pos.line === cm.lastLine(), eol = activeDoc()?.eol === '\r\n' ? 'CRLF' : 'LF';
    return { eol: true, last, label: last ? 'end' : eol };
  }
  const code = text.codePointAt(pos.ch);
  if (code >= 0xF780 && code <= 0xF87F) return { code, label: '0x' + (code - 0xF780).toString(16).toUpperCase().padStart(2, '0'), byte: true };
  return { code, label: codeLabel(code) };
}

async function charTitle(at) {
  if (at.eol) return at.last ? 'The end of the text (click: the character picker)'
    : `The end of the line: ${at.label === 'CRLF' ? 'CR LF, U+000D U+000A' : 'LF, U+000A'} (click: the character picker)`;
  if (at.byte) return `A byte the encoding of the file could not read (${at.label}); saving writes it back as it was`;
  const name = await charName(at.code);
  return `${name ?? 'No name known'}: ${at.label}, decimal ${at.code}, UTF-8 ${utf8(String.fromCodePoint(at.code))} (click: the character picker)`;
}

const pickerCode = at => at && !at.byte && !at.eol ? at.code : null;

// The picker at a character, as it was last (docs/plans/executed/PLAN-docking.md 3.7a): the active editor pane's own when it
// has one (not closed); else the window's: its window of its own (opened, or brought to the front), or docked in this
// window (shown, its area opened).
function openCharPicker(code = null) {
  const at = openToolPane('chars', 'openCharPicker', { code });   // app.js
  if (at !== undefined) host('charPickerGoTo', { code, pane: at });
}

// The bottom bar moved on: the picker, when open, hears the character after the active editor pane's cursor (not at
// every key at once); a picker of the other editor pane keeps its own.
function tellCharPicker(at) {
  const docked = ['chars', `chars:${state.activePane}`].some(id => dockPanes.has(id) && dockPaneVisible(id));
  if (!charPicker.open && !docked) return;   // floating open, or docked and shown here
  clearTimeout(charPicker.timer);
  charPicker.timer = setTimeout(() => host('pickerCursor', { code: pickerCode(at), pane: state.activePane }), 150);
}

// The host's events; app.js (loaded after this file) makes `events`, so they are set once every script has run.
addEventListener('DOMContentLoaded', () => {
  events.charPicker = ({ open }) => {
    charPicker.open = open;
    if (open) updateStatus();
  };
  // From the picker: at the cursor(s) of the active editor (`pane`: an editor pane's own picker: that pane's), as
  // typing does (several cursors, a block in column mode: on every line; past a line's end the spaces first).
  events.insertText = ({ text, pane: index }) => {
    const pane = panes[index ?? state.activePane], cm = pane?.cm;
    if (!cm || !pane.active || pane.el.dataset.mode === 'preview') return toast('The editor is not shown: nothing inserted.');
    if (cm.getOption('readOnly')) return toast('This tab is read-only: nothing inserted.');
    if (virtualOf(cm)) fillVirtual(cm);
    cm.replaceSelection(text, 'end', '+input');
    cm.focus();
  };
});
