'use strict';
// F1: every action with its key, grouped as in the key tables and searchable; Enter runs the selected one,
// like a command palette. A pane of its own (commands.html, commands-pane.js), floating the first time, dockable as
// the other panes; not modal: it stays open after a command, which runs on the active document. Its rows are made here
// (the actions and keys live in this page) and sent there; the search, a run and Esc come back. Loaded before app.js.

// The codes of the find field and the replacement (docs/plans/executed/PLAN-find-bar-replace.md 3.4): code, what it does,
// an example. The F1 list and the ? window of the find bar and the Search panel show this one list.
const SEARCH_CODE_HELP = [
  ['Find', [
    ['^p', 'a line break (CR, LF or CRLF)', 'end.^pNext finds "end." at a line end with "Next" on the next line'],
    ['^t', 'a tab', 'a^tb finds a, a tab, b'],
    ['^?', 'any one character', 'b^?t finds bat, bet, but'],
    ['^#', 'a digit', 'v^#.^# finds v1.2'],
    ['^$', 'a letter', '^$^$-^# finds AB-1'],
    ['^w', 'spaces or tabs, one or more', 'if^w( finds "if (" and "if    ("'],
    ['^^', 'the ^ itself', 'x^^2 finds x^2'],
  ]],
  ['Replace with', [
    ['^p', 'a line break, with the file\'s line end', 'a, b with ,^p puts b on a line of its own'],
    ['^t', 'a tab', 'a^tb gives a, a tab, b'],
    ['^^', 'the ^ itself', 'x^^2 gives x^2'],
  ]],
  ['Regular expression', [
    ['\\n', 'in the replacement: a line break, with the file\'s line end', '(\\w+), with $1\\n'],
    ['\\t', 'in the replacement: a tab', '(\\w+) (\\w+) with $1\\t$2'],
    ['$1', 'in the replacement: the text of group 1 ($2 group 2, ...)', '(\\w+)@(\\w+) with $2 at $1'],
    ['$&', 'in the replacement: the whole match', '\\d+ with [$&] puts brackets around a number'],
  ]],
];

// Keys that are not actions: they work where they are (the editor, the folder pane, a search, a menu). An editor key
// has a third element: what a macro writes for it (editorKey presses it in the editor, as it does the arrows).
const FIXED_KEYS = [
  ['Editor', [
    ['Tab / Shift+Tab', 'In a table: next / previous cell (in the last cell: a new row). Elsewhere: indent / indent less', 'editorKey "Tab" / "Shift-Tab"'],
    ['Enter', 'At the end of a table row: a new row. On an empty last row: end the table', 'editorKey "Enter"'],
    ['Shift+Enter', 'Line break as <br> (also inside a table cell)', 'editorKey "Shift-Enter"'],
    ['Ctrl+V', 'With the Windows clipboard: a picture or an image file becomes an image link', 'paste / imageFromClipboard'],
    ['Ctrl+Shift+V', 'Paste an image file, asking how to link it (also: drop it with Shift held)', 'pasteImage'],
    ['Ctrl+click / Alt+drag', 'Another cursor / a rectangular selection', '- / blockSelect'],
  ]],
  ['Menus', [
    ['Alt+F / E / R / V / O', 'Open the File / Edit / Format / View / Options menu'],
    ['Up / Down / Left / Right', 'In a menu: move; Right opens a submenu or the next menu'],
    ['Enter / Esc', 'In a menu: run the item / close one level'],
    ['Letter', 'In a menu: the item with that underlined letter'],
  ]],
  ['Folder pane', [
    ['Up / Down, Home / End, PgUp / PgDn', 'Move through the rows'],
    ['Right / Left', 'Open a folder (or go into it) / close it (or go to the folder above)'],
    ['Enter', 'Show the file in the current tab, or open / close the folder'],
    ['Shift+Enter', 'Open the file in a new tab'],
    ['Ctrl+Enter / Ctrl+Shift+Enter', 'In the other pane / in a new tab there'],
    ['Alt+Up, Backspace', 'Go up a folder'],
    ['F2', 'Rename the file or folder'],
    ['Esc', 'Back to the document'],
  ]],
  // One list with the find bar's and the Search panel's ? window (showSearchCodes in app.js).
  ['Search codes', SEARCH_CODE_HELP.flatMap(([group, codes]) => codes.map(([code, what]) => [code, `${group}: ${what}`]))],
];

const palette = {
  rows: [],          // the rows shown: { name, params, folded, available }
  q: '',             // the search, as typed in the pane
  unfolded: new Set(),
};

// Every action, also the ones without a key: app actions first, then the language actions.
function paletteEntries() {
  const entries = [];
  const seen = new Set();
  const add = (name, params, def) => {
    const id = callId([name, ...params]);
    if (seen.has(id)) return;
    seen.add(id);
    entries.push({ name, params, group: actionGroup(name, def), title: actionTitle(name, params), hint: def.hint || '', keys: keysOf(name, ...params) });
  };
  for (const name of [...appActions.keys(), ...packActionNames()]) {
    const def = actionDef(name);
    for (const params of def.variants ?? [[]]) add(name, params, def);
  }
  // Keys of the user's that call an action with parameters the list does not have yet.
  for (const call of keys.bindings.values()) if (isAction(call[0])) add(call[0], call.slice(1), actionDef(call[0]));
  return entries;
}

const markIn = (text, q) => {
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  return at < 0 ? escapeHtml(text) : escapeHtml(text.slice(0, at)) + '<mark>' + escapeHtml(text.slice(at, at + q.length)) + '</mark>' + escapeHtml(text.slice(at + q.length));
};

function renderPalette() {
  const q = palette.q.trim().toLowerCase();
  const language = languageTitle(activeDoc()) || 'this file';
  const entries = paletteEntries().filter(e => !q ||
    [e.keys.join(' '), e.title, e.hint, callId([e.name, ...e.params])].some(t => t.toLowerCase().includes(q)));
  palette.rows = [];
  const sections = [];
  const sectionHead = label => `<tr data-section="${sections.push(label) - 1}"><th colspan="3">${escapeHtml(label)}</th></tr>`;
  let html = '';
  for (const [group, label] of ACTION_GROUPS) {
    let list = entries.filter(e => e.group === group);
    if (!list.length) continue;
    list = [...list.filter(e => e.keys.length), ...list.filter(e => !e.keys.length)];   // no key: at the end
    html += sectionHead(label);
    for (let i = 0; i < list.length; i++) {
      const e = list[i], family = list.filter(f => f.name === e.name);
      // A numbered family is one row until searched for or opened (Enter).
      if (!q && family.length > 2 && !palette.unfolded.has(e.name)) {
        if (family[0] !== e) continue;
        const def = actionDef(e.name), first = family[0].keys[0], last = family.at(-1).keys[0];
        palette.rows.push({ name: e.name, params: [], folded: true });
        html += `<tr class="mm-pal-row" data-row="${palette.rows.length - 1}"><td>${first && last ? `<span class="mm-pal-key">${escapeHtml(first)} ..</span> <span class="mm-pal-key">${escapeHtml(last)}</span>` : '<i>no key</i>'}</td>` +
          `<td>${escapeHtml(def.title)} n<span class="mm-pal-hint">${escapeHtml(def.hint || '')} (Enter: show all)</span></td><td class="mm-pal-name">${escapeHtml(e.name)}</td></tr>`;
        continue;
      }
      const available = actionAvailable(e.name, e.params);
      const why = available ? '' : appActions.has(e.name) || langDef(activeDoc(), e.name) ? 'not here' : 'not in ' + language;
      palette.rows.push({ name: e.name, params: e.params, folded: false, available });
      // Your own keys are marked; a default key that no longer runs this action is shown struck through.
      const replaced = (keys.defaults.get(callId([e.name, ...e.params])) ?? []).filter(k => !e.keys.includes(k));
      const keyCell = (e.keys.length ? e.keys.map(k => keys.user.has(k) ? `<span class="mm-pal-key mm-pal-mine" title="Your keys.json">${markIn(k, q)}</span>` : `<span class="mm-pal-key">${markIn(k, q)}</span>`).join(' ') : '<i>no key</i>') +
        replaced.map(k => ` <s class="mm-pal-key mm-pal-replaced" title="Default, replaced in your keys.json">${escapeHtml(k)}</s>`).join('');
      html += `<tr class="mm-pal-row${available ? '' : ' mm-pal-off'}" data-row="${palette.rows.length - 1}"><td>${keyCell}</td>` +
        `<td>${markIn(e.title, q)}<span class="mm-pal-hint">${markIn(e.hint, q)}${why ? ` (${why})` : ''}</span></td>` +
        `<td class="mm-pal-name">${markIn(e.params.length ? JSON.stringify([e.name, ...e.params]) : e.name, q)}</td></tr>`;
    }
  }
  if (!q) for (const [group, rows] of FIXED_KEYS)
    html += sectionHead(`${group} (fixed keys)`) + rows.map(([k, t, macro]) => `<tr class="mm-pal-fixed"><td>${escapeHtml(k)}</td><td>${escapeHtml(t)}</td><td class="mm-pal-name">${escapeHtml(macro ?? '')}</td></tr>`).join('');
  // The column names stay on top while the list scrolls; a group's header stays just under them.
  return { kind: 'commands', q: palette.q, sections, foot: `Your own keys: ${keys.userFile} (create it to change keys; it overrides the defaults key by key).`,
    html: '<table><thead><tr class="mm-pal-head"><th>Keys</th><th>Command</th><th>Action</th></tr></thead>' +
      `<tbody>${html || '<tr><td>Nothing found.</td></tr>'}</tbody></table>` };
}

// The pane: made on first use (panechannel.js loads after this file).
let commandsPane = null;
const commandsChannel = () => commandsPane ??= paneChannel({ id: 'commands', page: 'commands.html', title: 'Keyboard shortcuts and commands',
  view: () => $('.mm-commands-view'),
  state: () => new Map([['look', paneLook()], ['title', { kind: 'title', text: 'Keyboard shortcuts and commands' }], ['commands', renderPalette()]]),
  receive: m => fromCommandsPane(m),
  onFloat: () => setDockFloating('commands', true),
  // Back in its view: docked (moved onto the window); its window closed by hand: it stays floating.
  onDock: () => { if (commandsPane.toDock) { commandsPane.toDock = false; setDockFloating('commands', false); } } });

// F1: the pane as it was last (floating: its window; else docked), a new search; the keyboard in its search field.
function showPalette() {
  const ch = commandsChannel();
  palette.q = '';
  palette.unfolded.clear();
  ch.send(renderPalette());
  if (dockModel().state.commands === 'floating') ch.float();
  else showDockPane('commands');
  ch.send({ kind: 'focus' });
  ch.focus();
}

// Closed (Esc in it with nothing searched): hidden when docked, its window closed when floating (it stays floating).
function closePalette() {
  const floating = commandsPane.floating;
  if (floating) commandsPane.back();
  else hideDockPane('commands');
  toDocument(floating);
}

// The keyboard back to the active document; from a floating window its LexPen window comes to the front first.
async function toDocument(floating = commandsPane?.floating) {
  if (floating) await host('activate').catch(() => {});
  focusPane(panes[state.activePane]);
}

async function fromCommandsPane(m) {
  if (m.kind === 'search') { palette.q = m.q; return commandsPane.send(renderPalette()); }
  if (m.kind === 'refresh') return commandsPane.send(renderPalette());   // its window got the focus: this document's commands
  if (m.kind === 'close') return closePalette();
  if (m.kind !== 'run') return;
  const row = palette.rows[m.row];
  if (!row) return;
  if (row.folded) {   // a numbered family opened
    palette.unfolded.add(row.name);
    return commandsPane.send(renderPalette());
  }
  if (!row.available) return;
  await toDocument();
  setTimeout(() => runAction(row.name, row.params, { from: 'palette' }));
}
