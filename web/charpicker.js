'use strict';
// The character picker (docs/plans/15-PLAN-character-tools.md), like the Windows Character Map: every character of
// the editor's font in a grid, drawn in that font, a heading per Unicode block; a search field (a code: e9, 0xe9,
// U+E9, #233 decimal; an entity: &eacute;; the character itself; or words of its name); a free field where picked
// characters gather (a click or Enter adds one, the field is ordinary text); Insert puts it at the cursor, Copy on
// the clipboard; a double click inserts one character at once. The host gives the font's characters, the blocks and
// the names (CharInfo.cs: GetFontUnicodeRanges, getuname.dll). The grid makes only the rows in view, so "All
// characters" (every assigned one up to U+FFFF) stays quick. Its size, zoom and "All characters" are remembered
// (localStorage), so are the recently used characters. Also the code at the cursor in the bottom bar (charAtCursor).

const picker = {
  el: null, chars: [], inFont: null, blocks: [], shown: [], current: 0, lines: [], lineOf: [], cols: 1, cell: 32,
  names: new Map(), searchTimer: 0, font: '', snapshot: null,
};
const PICKER_RECENT = 32;
const hex4 = n => n.toString(16).toUpperCase().padStart(4, '0');
const codeLabel = n => 'U+' + hex4(n);
const utf8 = s => [...new TextEncoder().encode(s)].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const stored = (key, fallback) => { try { return JSON.parse(localStorage[key]) ?? fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage[key] = JSON.stringify(value); } catch { /* per session only */ } };
const editorFontName = () => setting('editorFont') || 'Consolas';

// The name of a character (the host asks Windows; kept).
async function charName(code) {
  if (!picker.names.has(code)) picker.names.set(code, await host('charName', { code }).catch(() => null));
  return picker.names.get(code);
}

// ---------- The code at the cursor (bottom bar) ----------
// The character after the cursor: its code (a surrogate pair as one), or a stand-in for a byte the encoding of the
// file could not read (TextFile.StandIn, U+F780 plus the byte) as that byte. Null at a line's end.
function charAtCursor(cm) {
  const pos = cm.getCursor('head'), text = cm.getLine(pos.line);
  if (pos.ch >= text.length) return null;
  const code = text.codePointAt(pos.ch);
  if (code >= 0xF780 && code <= 0xF87F) return { code, label: '0x' + (code - 0xF780).toString(16).toUpperCase().padStart(2, '0'), byte: true };
  return { code, label: codeLabel(code) };
}

async function charTitle(at) {
  if (at.byte) return `A byte the encoding of the file could not read (${at.label}); saving writes it back as it was`;
  const name = await charName(at.code);
  return `${name ?? 'No name known'}: ${at.label}, decimal ${at.code}, UTF-8 ${utf8(String.fromCodePoint(at.code))} (click: the character picker)`;
}

// ---------- The dialog ----------
function buildPicker() {
  const el = picker.el = document.createElement('dialog');
  el.className = 'mm-charpicker';
  el.innerHTML = `
    <div class="mm-cp-top">
      <input class="mm-cp-search" placeholder="A code (e9, U+E9, #233), &amp;eacute;, a character or words of its name" spellcheck="false">
      <label class="mm-cp-all"><input type="checkbox"> All characters</label>
      <input class="mm-cp-zoom" type="range" min="20" max="72" step="2" title="Size">
    </div>
    <div class="mm-cp-recent" title="Recently used"></div>
    <div class="mm-cp-body">
      <div class="mm-cp-blocks"></div>
      <div class="mm-cp-grid" tabindex="0"><div class="mm-cp-space"></div></div>
      <div class="mm-cp-info"><div class="mm-cp-big"></div><div class="mm-cp-code"></div><div class="mm-cp-name"></div><div class="mm-cp-bytes"></div></div>
    </div>
    <div class="mm-cp-note" hidden></div>
    <div class="mm-cp-bottom">
      <input class="mm-cp-field" placeholder="Characters to insert" spellcheck="false">
      <button class="mm-cp-insert">&amp;Insert</button><button class="mm-cp-copy">&amp;Copy</button><button class="mm-cp-close">Close</button>
    </div>`;
  for (const b of el.querySelectorAll('button')) {   // an & marks the Alt+letter, as in the menus
    b.innerHTML = b.textContent.replace(/&(.)/, '<u>$1</u>');
  }
  document.body.append(el);
  const q = s => el.querySelector(s);
  Object.assign(picker, { search: q('.mm-cp-search'), all: q('.mm-cp-all input'), zoom: q('.mm-cp-zoom'), recent: q('.mm-cp-recent'),
    blockList: q('.mm-cp-blocks'), grid: q('.mm-cp-grid'), space: q('.mm-cp-space'), info: q('.mm-cp-info'), note: q('.mm-cp-note'),
    field: q('.mm-cp-field') });
  // The size as last left (the dialog is resizable), the zoom, All characters.
  const size = stored('charPickerSize', null);
  if (size) Object.assign(el.style, { width: size.w + 'px', height: size.h + 'px' });
  new ResizeObserver(() => {
    if (!el.open) return;
    store('charPickerSize', { w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) });
    layoutGrid();
  }).observe(el);
  picker.zoom.value = picker.cell = stored('charPickerZoom', 32);
  picker.all.checked = stored('charPickerAll', false);
  picker.zoom.addEventListener('input', () => { picker.cell = +picker.zoom.value; store('charPickerZoom', picker.cell); layoutGrid(); });
  picker.all.addEventListener('change', () => { store('charPickerAll', picker.all.checked); loadChars().then(() => applySearch()); });
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
  // A double click: the two clicks did not happen (the field as before), that character goes in at once.
  picker.grid.addEventListener('dblclick', e => {
    const i = cellIndex(e);
    if (i === null) return;
    if (picker.snapshot) picker.field.value = picker.snapshot.value;
    insertText(String.fromCodePoint(picker.shown[i]));
  });
  picker.blockList.addEventListener('click', e => {
    const b = e.target.closest('[data-first]');
    if (!b) return;
    const i = picker.shown.findIndex(c => c >= +b.dataset.first);
    if (i >= 0) { select(i); scrollToCurrent(true); }
  });
  picker.recent.addEventListener('click', e => { const b = e.target.closest('[data-code]'); if (b) addToField(+b.dataset.code); });
  q('.mm-cp-insert').addEventListener('click', () => insertText(picker.field.value));
  q('.mm-cp-copy').addEventListener('click', () => { if (picker.field.value) copyText(picker.field.value).then(() => toast('Copied.', true)); });
  q('.mm-cp-close').addEventListener('click', () => el.close());
  el.addEventListener('keydown', e => {   // Alt+I insert, Alt+C copy
    if (!e.altKey || e.ctrlKey) return;
    const b = { i: '.mm-cp-insert', c: '.mm-cp-copy' }[e.key.toLowerCase()];
    if (b) { e.preventDefault(); q(b).click(); }
  });
  el.addEventListener('close', () => { panes[state.activePane]?.cm?.focus(); });
}

// The characters: the font's (or all, those of the font apart), and the blocks.
async function loadChars() {
  const font = editorFontName(), all = picker.all.checked;
  const r = await host('charList', { font, all });
  Object.assign(picker, { chars: r.chars, inFont: r.inFont ? new Set(r.inFont) : null, blocks: r.blocks, font });
  picker.note.hidden = r.found;
  picker.note.textContent = r.found ? '' : `Windows has no font "${font}": the characters cannot be listed (turn on All characters).`;
  picker.grid.style.fontFamily = `"${font.replace(/["\\]/g, '')}", monospace`;
}

async function openCharPicker(code = null) {
  if (!picker.el) buildPicker();
  if (picker.el.open) return;
  picker.el.showModal();
  picker.field.value = '';
  picker.search.value = '';
  await loadChars();
  drawRecent();
  picker.shown = picker.chars;
  layoutGrid();
  const at = code === null ? -1 : picker.shown.indexOf(code);
  select(at >= 0 ? at : 0);
  scrollToCurrent(true);
  picker.search.focus();
}

// ---------- The grid: lines of a block heading or a row of characters, only those in view are made ----------
function layoutGrid() {
  if (!picker.el?.open) return;
  const cell = picker.cell, width = picker.grid.clientWidth;
  picker.cols = Math.max(1, Math.floor(width / cell));
  picker.grid.style.setProperty('--cp-cell', cell + 'px');
  const lines = [], lineOf = new Array(picker.shown.length);
  let block = -1, row = null;
  const blockAt = c => { while (block + 1 < picker.blocks.length && picker.blocks[block + 1][0] <= c) block++; return picker.blocks[block]; };
  let lastBlock = null;
  picker.shown.forEach((c, i) => {
    const b = blockAt(c);
    if (b !== lastBlock) {
      lastBlock = b;
      lines.push({ heading: b ? b[2] : 'Other' });
      row = null;
    }
    if (!row || row.items.length === picker.cols) lines.push(row = { items: [] });
    row.items.push(i);
    lineOf[i] = lines.length - 1;
  });
  Object.assign(picker, { lines, lineOf });
  picker.space.style.height = lines.length * cell + 'px';
  // The blocks at the side: those with characters shown.
  picker.blockList.innerHTML = lines.filter(l => l.heading).map(l => {
    const first = picker.shown[lines[lines.indexOf(l) + 1]?.items[0]];
    return `<button data-first="${first}">${escapeHtml(l.heading)}</button>`;
  }).join('');
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

async function showInfo(code) {
  const ch = String.fromCodePoint(code);
  picker.info.querySelector('.mm-cp-big').textContent = ch;
  picker.info.querySelector('.mm-cp-big').style.fontFamily = picker.grid.style.fontFamily;
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
  picker.note.hidden = true;
  if (!text || code !== null) {
    if (picker.shown !== picker.chars) { picker.shown = picker.chars; layoutGrid(); }
    if (code === null) return;
    const i = picker.shown.indexOf(code);
    if (i >= 0) { select(i); scrollToCurrent(true); return; }
    showInfo(code);
    picker.note.hidden = false;
    picker.note.textContent = `${codeLabel(code)} is not in the font of the editor${picker.all.checked ? '' : ' (All characters shows more)'}; Enter inserts it all the same.`;
    return;
  }
  const found = await host('charSearch', { font: picker.font, all: picker.all.checked, words: text });
  if (picker.search.value.trim() !== text) return;   // typed on meanwhile
  picker.shown = found;
  layoutGrid();
  picker.grid.scrollTop = 0;
  select(0);
  picker.note.hidden = found.length > 0;
  picker.note.textContent = 'No character with that name.';
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
  picker.recent.style.fontFamily = `"${editorFontName().replace(/["\\]/g, '')}", monospace`;
  picker.recent.innerHTML = recent.map(c => `<button data-code="${c}" title="${codeLabel(c)}">${escapeHtml(String.fromCodePoint(c))}</button>`).join('');
}

function rememberRecent(text) {
  const recent = stored('charRecent', []).filter(c => !text.includes(String.fromCodePoint(c)));
  store('charRecent', [...new Set([...text].map(ch => ch.codePointAt(0)))].concat(recent).slice(0, PICKER_RECENT));
}

// At the cursor of the active editor (several cursors and a block in column mode: on each line, as typing does).
function insertText(text) {
  if (!text) return;
  const pane = panes[state.activePane], cm = pane?.cm;
  picker.el.close();
  if (!cm || !pane.active || pane.el.dataset.mode === 'preview') return toast('The editor is not shown.');
  if (cm.getOption('readOnly')) return toast('This tab is read-only.');
  if (virtualOf(cm)) fillVirtual(cm);   // past the end of the line (virtual.js): spaces up to the cursor first
  cm.replaceSelection(text, 'end', '+input');
  rememberRecent(text);
  cm.focus();
}
