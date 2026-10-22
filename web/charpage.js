'use strict';
// The character picker window's page (charpicker.html; CharPickerForm hosts it), like the Windows Character Map
// (docs/plans/15-PLAN-character-picker-window.md): every character of the editor's font in a grid, drawn in that
// font, a heading per Unicode block; a search field (a code: e9, 0xe9, U+E9, #233 decimal; an entity: &eacute;; the
// character itself; or words of its name); a free field where picked characters gather (a click or Enter adds one).
// Insert puts the field at the cursor(s) of the LexPen window last worked in and keeps the picker open (the field
// too; Clear empties it); a double click puts that one character there at once; Enter on a code in the search too.
// The host gives the characters, the blocks and the names (CharInfo.cs). The grid makes only the rows in view, so
// "All characters" stays quick. The window's place and size are kept by the host; the zoom, All characters and the
// recently used characters here (localStorage). Esc closes the window.

const $ = s => document.querySelector(s);

// ---------- Host bridge (as in settings.js) ----------
const pending = new Map(), events = {};
let lastId = 0;
function host(op, args) {
  return new Promise((resolve, reject) => {
    pending.set(++lastId, { resolve, reject });
    chrome.webview.postMessage({ ...args, id: lastId, op });
  });
}
chrome.webview.addEventListener('message', e => {
  if (e.data.event) return events[e.data.event]?.(e.data);
  const { id, result, error } = e.data;
  const call = pending.get(id);
  pending.delete(id);
  error ? call.reject(new Error(error)) : call.resolve(result);
});

const picker = {
  search: $('.mm-cp-search'), all: $('.mm-cp-all input'), zoom: $('.mm-cp-zoom'), recent: $('.mm-cp-recent'),
  blockList: $('.mm-cp-blocks'), grid: $('.mm-cp-grid'), space: $('.mm-cp-space'), info: $('.mm-cp-info'), note: $('.mm-cp-note'),
  field: $('.mm-cp-field'),
  chars: [], inFont: null, blocks: [], shown: [], current: 0, lines: [], lineOf: [], cols: 1, cell: 32,
  names: new Map(), searchTimer: 0, font: '', snapshot: null, cursor: null, values: {},
};
const PICKER_RECENT = 32;
const hex4 = n => n.toString(16).toUpperCase().padStart(4, '0');
const codeLabel = n => 'U+' + hex4(n);
const utf8 = s => [...new TextEncoder().encode(s)].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stored = (key, fallback) => { try { return JSON.parse(localStorage[key]) ?? fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage[key] = JSON.stringify(value); } catch { /* per session only */ } };
const editorFontName = () => picker.values.editorFont || 'Consolas';
const fontCss = () => `"${editorFontName().replace(/["\\]/g, '')}", monospace`;

// ---------- Look: the app's theme and font, as the settings window ----------
let themeVars = [];
function applyLook(look) {
  if (look) {
    document.documentElement.dataset.theme = look.mode;
    for (const name of themeVars) document.documentElement.style.removeProperty(name);
    for (const [name, value] of Object.entries(look.app.vars)) document.documentElement.style.setProperty(name, value);
    themeVars = Object.keys(look.app.vars);
  }
  const v = picker.values, root = document.documentElement.style;
  root.setProperty('--app-font', v.appFont ? `"${v.appFont.replace(/["\\]/g, '')}", "Segoe UI", system-ui, sans-serif` : '"Segoe UI", system-ui, sans-serif');
  root.setProperty('--ui-scale', v.appSize ? v.appSize * 96 / 72 / 13 : 1);
}

async function charName(code) {
  if (!picker.names.has(code)) picker.names.set(code, await host('charName', { code }).catch(() => null));
  return picker.names.get(code);
}

function note(text) {
  picker.note.hidden = !text;
  picker.note.textContent = text || '';
}

// The characters: the font's (or all, those of the font apart), and the blocks.
async function loadChars() {
  const font = editorFontName(), all = picker.all.checked;
  const r = await host('charList', { font, all });
  Object.assign(picker, { chars: r.chars, inFont: r.inFont ? new Set(r.inFont) : null, blocks: r.blocks, font });
  note(r.found ? '' : `Windows has no font "${font}": the characters cannot be listed (turn on All characters).`);
  picker.grid.style.fontFamily = picker.recent.style.fontFamily = picker.field.style.fontFamily = fontCss();
}

// ---------- The grid: lines of a block heading or a row of characters, only those in view are made ----------
function layoutGrid() {
  const cell = picker.cell, width = picker.grid.clientWidth;
  picker.cols = Math.max(1, Math.floor(width / cell));
  picker.grid.style.setProperty('--cp-cell', cell + 'px');
  const lines = [], lineOf = new Array(picker.shown.length);
  let block = -1, row = null, lastBlock = null;
  const blockAt = c => { while (block + 1 < picker.blocks.length && picker.blocks[block + 1][0] <= c) block++; return picker.blocks[block]; };
  picker.shown.forEach((c, i) => {
    const b = blockAt(c);
    if (b !== lastBlock) {
      lastBlock = b;
      lines.push({ heading: b ? b[2] : 'Other', first: c });
      row = null;
    }
    if (!row || row.items.length === picker.cols) lines.push(row = { items: [] });
    row.items.push(i);
    lineOf[i] = lines.length - 1;
  });
  Object.assign(picker, { lines, lineOf });
  picker.space.style.height = lines.length * cell + 'px';
  picker.blockList.innerHTML = lines.filter(l => l.heading).map(l => `<button data-first="${l.first}">${escapeHtml(l.heading)}</button>`).join('');
  drawRows();
}

function drawRows() {
  const cell = picker.cell, top = picker.grid.scrollTop, height = picker.grid.clientHeight;
  const from = Math.max(0, Math.floor(top / cell) - 2), to = Math.min(picker.lines.length, Math.ceil((top + height) / cell) + 2);
  let html = '';
  for (let n = from; n < to; n++) {
    const line = picker.lines[n];
    if (line.heading) { html += `<div class="mm-cp-heading" style="top:${n * cell}px">${escapeHtml(line.heading)}</div>`; continue; }
    line.items.forEach((i, k) => {
      const c = picker.shown[i], lack = picker.inFont && !picker.inFont.has(c);
      html += `<span class="mm-cp-cell${i === picker.current ? ' mm-cp-current' : ''}${lack ? ' mm-cp-lack' : ''}" data-i="${i}" ` +
        `style="top:${n * cell}px;left:${k * cell}px" title="${codeLabel(c)}${lack ? ' (not in the font of the editor)' : ''}">${escapeHtml(String.fromCodePoint(c))}</span>`;
    });
  }
  picker.space.innerHTML = html;
}

const cellIndex = e => { const c = e.target.closest('.mm-cp-cell'); return c ? +c.dataset.i : null; };

function select(i) {
  if (!picker.shown.length) return;
  picker.current = Math.max(0, Math.min(picker.shown.length - 1, i));
  for (const c of picker.space.querySelectorAll('.mm-cp-current')) c.classList.remove('mm-cp-current');
  picker.space.querySelector(`[data-i="${picker.current}"]`)?.classList.add('mm-cp-current');
  showInfo(picker.shown[picker.current]);
}

function scrollToCurrent(center = false) {
  const line = picker.lineOf[picker.current] ?? 0, cell = picker.cell, g = picker.grid;
  const top = line * cell;
  if (center) g.scrollTop = Math.max(0, top - g.clientHeight / 2 + cell);
  else if (top < g.scrollTop + cell) g.scrollTop = Math.max(0, top - cell);
  else if (top + cell > g.scrollTop + g.clientHeight) g.scrollTop = top + cell - g.clientHeight;
  drawRows();
}

// To a character (when it is in the grid), the search emptied.
function goTo(code) {
  if (code === null || code === undefined) return;
  if (picker.shown !== picker.chars) { picker.search.value = ''; picker.shown = picker.chars; layoutGrid(); }
  const i = picker.shown.indexOf(code);
  if (i >= 0) { select(i); scrollToCurrent(true); }
}

async function showInfo(code) {
  const ch = String.fromCodePoint(code), big = picker.info.querySelector('.mm-cp-big');
  big.textContent = ch;
  big.style.fontFamily = fontCss();
  picker.info.querySelector('.mm-cp-code').textContent = `${codeLabel(code)}  #${code}`;
  picker.info.querySelector('.mm-cp-bytes').textContent = 'UTF-8 ' + utf8(ch);
  const name = await charName(code);
  if (picker.shown[picker.current] === code) picker.info.querySelector('.mm-cp-name').textContent = name ?? '';
}

function onGridKey(e) {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -picker.cols, ArrowDown: picker.cols }[e.key];
  const page = Math.max(1, Math.floor(picker.grid.clientHeight / picker.cell) - 1) * picker.cols;
  let to = null;
  if (step) to = picker.current + step;
  else if (e.key === 'PageDown') to = picker.current + page;
  else if (e.key === 'PageUp') to = picker.current - page;
  else if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = picker.shown.length - 1;
  else if (e.key === 'Enter') { e.preventDefault(); addToField(picker.shown[picker.current]); return; }
  if (to === null) return;
  e.preventDefault();
  if (e.key === 'ArrowUp' && to < 0) return picker.search.focus();
  select(to);
  scrollToCurrent();
}

// ---------- The search ----------
// A code: U+E9, 0xe9, #233 (decimal), or hex with a digit in it (e9; a word as "face" is a name), an entity, or one
// character. Null: words of a name.
function parseCode(text) {
  const t = text.trim();
  if (!t) return null;
  let m;
  if ((m = t.match(/^(?:u\+|0x)([0-9a-f]{1,6})$/i)) || (m = t.match(/^(?=[0-9a-f]*[0-9])([0-9a-f]{1,6})$/i))) return valid(parseInt(m[1], 16));
  if ((m = t.match(/^#(\d{1,7})$/))) return valid(parseInt(m[1], 10));
  if (/^&[#a-z0-9]+;?$/i.test(t)) {
    const box = document.createElement('textarea');
    box.innerHTML = t.endsWith(';') ? t : t + ';';
    const v = box.value;
    if ([...v].length === 1 && v !== t) return v.codePointAt(0);
  }
  if ([...t].length === 1) return t.codePointAt(0);
  return null;
}
const valid = n => n > 0 && n <= 0x10FFFF && !(n >= 0xD800 && n < 0xE000) ? n : null;

async function applySearch() {
  const text = picker.search.value.trim(), code = parseCode(text);
  note('');
  if (!text || code !== null) {
    if (picker.shown !== picker.chars) { picker.shown = picker.chars; layoutGrid(); }
    if (code === null) return;
    const i = picker.shown.indexOf(code);
    if (i >= 0) { select(i); scrollToCurrent(true); return; }
    showInfo(code);
    note(`${codeLabel(code)} is not in the font of the editor${picker.all.checked ? '' : ' (All characters shows more)'}; Enter inserts it all the same.`);
    return;
  }
  const found = await host('charSearch', { font: picker.font, all: picker.all.checked, words: text });
  if (picker.search.value.trim() !== text) return;   // typed on meanwhile
  picker.shown = found;
  layoutGrid();
  picker.grid.scrollTop = 0;
  select(0);
  note(found.length ? '' : 'No character with that name.');
}

// ---------- The free field, inserting ----------
function addToField(code) {
  const f = picker.field, ch = String.fromCodePoint(code), at = f.selectionStart ?? f.value.length, end = f.selectionEnd ?? at;
  f.value = f.value.slice(0, at) + ch + f.value.slice(end);
  f.setSelectionRange(at + ch.length, at + ch.length);
}

function drawRecent() {
  const recent = stored('charRecent', []);
  picker.recent.hidden = !recent.length;
  picker.recent.innerHTML = recent.map(c => `<button data-code="${c}" title="${codeLabel(c)}">${escapeHtml(String.fromCodePoint(c))}</button>`).join('');
}

function rememberRecent(text) {
  const recent = stored('charRecent', []).filter(c => !text.includes(String.fromCodePoint(c)));
  store('charRecent', [...new Set([...text].map(ch => ch.codePointAt(0)))].concat(recent).slice(0, PICKER_RECENT));
  drawRecent();
}

// At the cursor(s) of the LexPen window last worked in (it comes to the front); the picker stays open.
async function insertText(text) {
  if (!text) return;
  if (!await host('insert', { text })) return note('No LexPen window to insert into.');
  rememberRecent(text);
}

// ---------- The character at the cursor of the window last worked in (sent while the picker is open) ----------
function showCursor(code) {
  picker.cursor = code ?? null;
  const box = picker.info.querySelector('.mm-cp-cursor');
  box.hidden = picker.cursor === null;
  if (picker.cursor !== null) box.querySelector('.mm-cp-cursor-char').textContent = `${String.fromCodePoint(picker.cursor)} ${codeLabel(picker.cursor)}`;
}

// ---------- Wiring ----------
picker.zoom.addEventListener('input', () => { picker.cell = +picker.zoom.value; store('charPickerZoom', picker.cell); layoutGrid(); });
picker.all.addEventListener('change', () => { store('charPickerAll', picker.all.checked); loadChars().then(() => { picker.shown = picker.chars; layoutGrid(); applySearch(); }); });
picker.search.addEventListener('input', () => { clearTimeout(picker.searchTimer); picker.searchTimer = setTimeout(applySearch, 150); });
picker.search.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const code = parseCode(picker.search.value);
    if (code !== null) return insertText(String.fromCodePoint(code));   // a code or entity: inserted at once
    if (picker.shown.length) addToField(picker.shown[picker.current]);
  } else if (e.key === 'ArrowDown') { e.preventDefault(); picker.grid.focus(); }
});
picker.grid.addEventListener('scroll', drawRows);
picker.grid.addEventListener('keydown', onGridKey);
picker.grid.addEventListener('mousedown', e => {
  const i = cellIndex(e);
  if (i === null) return;
  if (e.detail === 1) picker.snapshot = { value: picker.field.value, at: picker.field.selectionStart };
  select(i);
});
picker.grid.addEventListener('click', e => { const i = cellIndex(e); if (i !== null) addToField(picker.shown[i]); });
// A double click: the two clicks did not happen (the field as before), that one character goes to the cursor(s).
picker.grid.addEventListener('dblclick', e => {
  const i = cellIndex(e);
  if (i === null) return;
  if (picker.snapshot) picker.field.value = picker.snapshot.value;
  insertText(String.fromCodePoint(picker.shown[i]));
});
picker.blockList.addEventListener('click', e => {
  const b = e.target.closest('[data-first]');
  if (!b) return;
  const i = picker.shown.indexOf(+b.dataset.first);
  if (i >= 0) { select(i); scrollToCurrent(true); }
});
picker.recent.addEventListener('click', e => { const b = e.target.closest('[data-code]'); if (b) addToField(+b.dataset.code); });
$('.mm-cp-insert').addEventListener('click', () => insertText(picker.field.value));
$('.mm-cp-clear').addEventListener('click', () => { picker.field.value = ''; picker.field.focus(); });
$('.mm-cp-copy').addEventListener('click', () => { if (picker.field.value) navigator.clipboard.writeText(picker.field.value).then(() => note('Copied.')); });
$('.mm-cp-cursor-go').addEventListener('click', () => goTo(picker.cursor));
new ResizeObserver(() => layoutGrid()).observe(picker.grid);
addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); host('close'); return; }
  if (!e.altKey || e.ctrlKey) return;   // Alt+I insert, Alt+C copy, Alt+L clear
  const b = { i: '.mm-cp-insert', c: '.mm-cp-copy', l: '.mm-cp-clear' }[e.key.toLowerCase()];
  if (b) { e.preventDefault(); $(b).click(); }
});

events.goTo = ({ code }) => goTo(code);
events.cursor = ({ code }) => showCursor(code);
events.look = ({ look }) => applyLook(look);
events.settings = ({ settings }) => {
  const font = editorFontName();
  picker.values = settings ?? {};
  applyLook(null);
  if (editorFontName() !== font) loadChars().then(() => { picker.shown = picker.chars; layoutGrid(); select(0); });
};

// ---------- Start ----------
(async () => {
  const init = await host('init');
  picker.values = init.settings ?? {};
  applyLook(init.look);
  picker.zoom.value = picker.cell = stored('charPickerZoom', 32);
  picker.all.checked = stored('charPickerAll', false);
  await loadChars();
  drawRecent();
  picker.shown = picker.chars;
  layoutGrid();
  const at = init.code === null || init.code === undefined ? -1 : picker.shown.indexOf(init.code);
  select(at >= 0 ? at : 0);
  scrollToCurrent(true);
  picker.search.focus();
  document.body.dataset.ready = '1';
})();
