'use strict';
// F1: every action with its key, grouped as in the key tables and searchable; Enter runs the selected one,
// like a command palette. Loaded before app.js.

// Keys that are not actions: they work where they are (the editor, the folder pane, a search, a menu).
const FIXED_KEYS = [
  ['Editor', [
    ['Tab / Shift+Tab', 'In a table: next / previous cell (in the last cell: a new row). Elsewhere: indent / indent less'],
    ['Enter', 'At the end of a table row: a new row. On an empty last row: end the table'],
    ['Shift+Enter', 'Line break as <br> (also inside a table cell)'],
    ['Ctrl+V', 'With the Windows clipboard: a picture or an image file becomes an image link'],
    ['Ctrl+Shift+V', 'Paste an image file, asking how to link it (also: drop it with Shift held)'],
    ['Ctrl+click / Alt+drag', 'Another cursor / a rectangular selection'],
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
    ['Esc', 'Back to the document'],
  ]],
  ['Search codes', [
    ['^p ^t ^?', 'A line break (CR, LF or CRLF), a tab, any character'],
    ['^# ^$ ^w ^^', 'A digit, a letter, spaces or tabs, the ^ itself'],
  ]],
];

const palette = {
  dialog: document.querySelector('.mm-palette'),
  input: document.querySelector('.mm-pal-search'),
  list: document.querySelector('.mm-pal-list'),
  foot: document.querySelector('.mm-pal-foot'),
  rows: [],          // the rows shown: { name, params, folded }
  selected: -1,      // index in rows of the selected (runnable) row
  unfolded: new Set(),
  focus: null,       // where the focus was before F1
};

// Every action, also the ones without a key: app actions first, then the language actions.
function paletteEntries() {
  const entries = [];
  const seen = new Set();
  const add = (name, params, def) => {
    const id = callId([name, ...params]);
    if (seen.has(id)) return;
    seen.add(id);
    entries.push({ name, params, group: def.group || 'format', title: actionTitle(name, params), hint: def.hint || '', keys: keysOf(name, ...params) });
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
  const q = palette.input.value.trim().toLowerCase();
  const language = languageTitle(activeDoc()) || 'this file';
  const entries = paletteEntries().filter(e => !q ||
    [e.keys.join(' '), e.title, e.hint, callId([e.name, ...e.params])].some(t => t.toLowerCase().includes(q)));
  palette.rows = [];
  let html = '';
  for (const [group, label] of ACTION_GROUPS) {
    let list = entries.filter(e => e.group === group);
    if (!list.length) continue;
    list = [...list.filter(e => e.keys.length), ...list.filter(e => !e.keys.length)];   // no key: at the end
    html += `<tr><th colspan="3">${label}</th></tr>`;
    for (let i = 0; i < list.length; i++) {
      const e = list[i], family = list.filter(f => f.name === e.name);
      // A numbered family is one row until searched for or opened (Enter).
      if (!q && family.length > 2 && !palette.unfolded.has(e.name)) {
        if (family[0] !== e) continue;
        const def = actionDef(e.name), first = family[0].keys[0], last = family.at(-1).keys[0];
        palette.rows.push({ name: e.name, params: [], folded: true });
        html += `<tr class="mm-pal-row" data-row="${palette.rows.length - 1}"><td>${first && last ? escapeHtml(first + ' .. ' + last) : '<i>no key</i>'}</td>` +
          `<td>${escapeHtml(def.title)} n<span class="mm-pal-hint">${escapeHtml(def.hint || '')} (Enter: show all)</span></td><td class="mm-pal-name">${escapeHtml(e.name)}</td></tr>`;
        continue;
      }
      const available = actionAvailable(e.name, e.params);
      const why = available ? '' : appActions.has(e.name) || langDef(activeDoc(), e.name) ? 'not here' : 'not in ' + language;
      palette.rows.push({ name: e.name, params: e.params, folded: false, available });
      // Your own keys are marked; a default key that no longer runs this action is shown struck through.
      const replaced = (keys.defaults.get(callId([e.name, ...e.params])) ?? []).filter(k => !e.keys.includes(k));
      const keyCell = (e.keys.length ? e.keys.map(k => keys.user.has(k) ? `<span class="mm-pal-mine" title="Your keys.json">${markIn(k, q)}</span>` : markIn(k, q)).join(' ') : '<i>no key</i>') +
        replaced.map(k => ` <s class="mm-pal-replaced" title="Default, replaced in your keys.json">${escapeHtml(k)}</s>`).join('');
      html += `<tr class="mm-pal-row${available ? '' : ' mm-pal-off'}" data-row="${palette.rows.length - 1}"><td>${keyCell}</td>` +
        `<td>${markIn(e.title, q)}<span class="mm-pal-hint">${markIn(e.hint, q)}${why ? ` (${why})` : ''}</span></td>` +
        `<td class="mm-pal-name">${markIn(e.params.length ? JSON.stringify([e.name, ...e.params]) : e.name, q)}</td></tr>`;
    }
  }
  if (!q) for (const [group, rows] of FIXED_KEYS)
    html += `<tr><th colspan="3">${group} (fixed keys)</th></tr>` + rows.map(([k, t]) => `<tr class="mm-pal-fixed"><td>${escapeHtml(k)}</td><td>${escapeHtml(t)}</td><td></td></tr>`).join('');
  palette.list.innerHTML = `<table>${html || '<tr><td>Nothing found.</td></tr>'}</table>`;
  selectPaletteRow(palette.rows.findIndex(r => r.folded || r.available), 0);
}

// Moves the selection to row `from` or the next runnable one in direction `dir` (0: that row or after it).
function selectPaletteRow(from, dir) {
  const ok = i => palette.rows[i] && (palette.rows[i].folded || palette.rows[i].available);
  let i = from;
  if (dir === 0) { while (i >= 0 && i < palette.rows.length && !ok(i)) i++; }
  else { do i += dir; while (i >= 0 && i < palette.rows.length && !ok(i)); }
  if (!ok(i)) return;
  palette.selected = i;
  for (const el of palette.list.querySelectorAll('.mm-pal-sel')) el.classList.remove('mm-pal-sel');
  const el = palette.list.querySelector(`[data-row="${i}"]`);
  el?.classList.add('mm-pal-sel');
  el?.scrollIntoView({ block: 'nearest' });
}

function showPalette() {
  if (palette.dialog.open) return;
  palette.focus = document.activeElement;
  palette.input.value = '';
  palette.unfolded.clear();
  palette.foot.textContent = `Your own keys: ${keys.userFile} (create it to change keys; it overrides the defaults key by key).`;
  palette.dialog.showModal();
  renderPalette();
  palette.list.scrollTop = 0;
  palette.input.focus();
}

function runPaletteRow(i) {
  const row = palette.rows[i];
  if (!row) return;
  if (row.folded) {
    palette.unfolded.add(row.name);
    return renderPalette();
  }
  if (!row.available) return;
  palette.dialog.close();
  palette.focus?.focus?.();
  setTimeout(() => runAction(row.name, row.params, { from: 'palette' }));
}

palette.input.addEventListener('input', renderPalette);
palette.input.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') selectPaletteRow(palette.selected, e.key === 'ArrowDown' ? 1 : -1);
  else if (e.key === 'PageDown' || e.key === 'PageUp') for (let n = 0; n < 10; n++) selectPaletteRow(palette.selected, e.key === 'PageDown' ? 1 : -1);
  else if (e.key === 'Enter') runPaletteRow(palette.selected);
  else return;
  e.preventDefault();
});
// Esc: first clears the search, then closes.
palette.dialog.addEventListener('cancel', e => {
  if (!palette.input.value) return;
  e.preventDefault();
  palette.input.value = '';
  renderPalette();
});
palette.dialog.addEventListener('close', () => {
  if (document.activeElement === document.body) palette.focus?.focus?.();
});
palette.list.addEventListener('click', e => {
  const row = e.target.closest('[data-row]');
  if (row) selectPaletteRow(+row.dataset.row, 0);
  palette.input.focus();
});
palette.list.addEventListener('dblclick', e => {
  const row = e.target.closest('[data-row]');
  if (row) runPaletteRow(+row.dataset.row);
});
