'use strict';
// The Columns pane's page (columns.html; docs/plans/executed/PLAN-csv-columns.md 3.2): how the active document is read as
// CSV. At the top the file's settings (delimiter, lines before the data, header line, quote and escape); below them the
// columns found with those settings, each with its own; or the definition as CSVW text. What is set stays here (the
// draft) until Apply; a change is tried on the text by the window (`probe`), which sends back the columns it finds.
// Ticked columns take a value set in one of them. Messages from the window (columnspane.js): `columns` (the document
// and its kept definition), `probe` (a draft fitted to the text, and what it finds).

const $c = s => document.querySelector(s);
const cp = { state: null, draft: null, found: null, ticked: new Set(), tab: 'columns', timer: 0 };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const copy = def => JSON.parse(JSON.stringify(def));
const showSign = s => (s ?? '').replace(/\t/g, '\\t');
const readSign = s => s.replace(/\\t/g, '\t');

paneHandlers.columns = st => {
  cp.state = st;
  // The document, and where its definition is kept when that is a file next to it (Save next to the file).
  const file = st.beside ? st.beside.replace(/^.*[\\/]/, '') : '';
  $c('.cp-name').innerHTML = esc(st.name ?? 'No document') + (file ? ` <span class="cp-beside">(definition: ${esc(file)})</span>` : '');
  $c('.cp-name').title = st.beside ? `${st.name}\nThe definition is kept in ${st.beside}` : st.name ?? '';
  const empty = $c('.cp-empty');
  empty.hidden = !!st.def;
  $c('.cp-main').hidden = !st.def;
  if (!st.def) {
    empty.innerHTML = !st.name ? 'No document.'
      : `${esc(st.name)} is not read as CSV.<br><button type="button" class="cp-read">Read as CSV</button>`;
    empty.querySelector('.cp-read')?.addEventListener('click', () => toWindow({ kind: 'readAsCsv' }));
    return;
  }
  cp.draft = copy(st.def);
  cp.found = st.found;
  cp.ticked.clear();
  drawAll();
};

paneHandlers.probe = ({ def, found, detected }) => {
  // The file's settings stay as typed (the window fitted the columns only); the columns as found. Detect: everything.
  if (detected) cp.draft = def;
  else cp.draft.columns = def.columns;
  cp.found = found;
  for (const i of [...cp.ticked]) if (i >= cp.draft.columns.length) cp.ticked.delete(i);
  drawAll(true);
};

// Column settings... in the column view: that column's row, in view and marked.
paneHandlers.showColumn = ({ column }) => {
  if (cp.tab !== 'columns') document.querySelector('[data-tab=columns]').click();
  const tr = $c(`tr[data-i="${column}"]`);
  if (!tr) return;
  tr.scrollIntoView({ block: 'nearest' });
  tr.querySelector('[data-f=name]')?.focus();
  tr.classList.add('cp-flash');
  setTimeout(() => tr.classList.remove('cp-flash'), 1200);
};

paneHandlers.focus = () => ($c('.cp-main').hidden ? $c('.cp-read') : $c('.cp-tabs .cp-on'))?.focus();   // the tab shown

// ---------- Drawing ----------
function drawAll(keepFocus) {
  drawFile();
  if (cp.tab === 'definition') drawDefinition();
  else drawColumns(keepFocus);
  const f = cp.found, before = f?.pre.filter((_, i) => i !== cp.draft.header - 1) ?? [];   // the header line aside
  $c('.cp-note').textContent = f ? `${f.rows.toLocaleString()} rows${f.partial ? ' in the first 64 KB' : ''}, ${cp.draft.columns.length} columns` +
    (before.length ? `; before the data: ${before.map(l => JSON.stringify(l)).slice(0, 3).join(', ')}` : '') : '';
  // Where the definition is kept: LexPen's own store (the default), or a file next to the CSV; the button moves it.
  const save = $c('.cp-save'), file = cp.state?.beside?.replace(/^.*[\\/]/, '');
  save.disabled = !cp.state?.path;
  save.textContent = file ? 'Keep in LexPen instead' : 'Save next to the file';
  save.title = file ? `The definition is kept in ${file} next to the CSV. This deletes that file (Recycle Bin) and LexPen keeps the definition itself`
    : 'LexPen keeps the definition itself (in its data folder). This applies it and saves it as name.csv-metadata.json next to the CSV ' +
      '(CSV on the Web, which other tools read too), to share it or keep it in source control; Apply then writes there';
}

function drawFile() {
  const d = cp.draft, active = document.activeElement;
  const put = (sel, value) => { const el = $c(sel); if (el !== active) el.value = value; };
  put('#cp-delim', showSign(d.delimiter));
  $c('#cp-trim').checked = !!d.trim;
  put('#cp-skip', d.skip ?? 0);
  const header = $c('#cp-header');
  header.innerHTML = `<option value="0">none</option>` + Array.from({ length: d.skip ?? 0 }, (_, i) => `<option value="${i + 1}">line ${i + 1}</option>`).join('');
  header.value = String(Math.min(d.header ?? 0, d.skip ?? 0));
  put('#cp-quote', d.quote ?? '');
  put('#cp-quote-end', d.quoteEnd ?? d.quote ?? '');
  $c('#cp-escape').value = d.escape ?? 'double';
  put('#cp-escape-char', d.escapeChar ?? '\\');
  $c('#cp-escape-char').hidden = d.escape !== 'char';
}

const TYPES = [['text', 'text'], ['integer', 'integer'], ['decimal', 'decimal'], ['date', 'date / time'], ['boolean', 'boolean'], ['auto', 'auto']];
const SIGNS = [['.', '.'], [',', ','], ["'", "'"], [' ', 'space'], ['', 'none']];
const options = (list, value) => list.map(([v, t]) => `<option value="${esc(v)}"${v === (value ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('');
const numeric = t => t === 'integer' || t === 'decimal';

function drawColumns(keepFocus) {
  const body = $c('.cp-list tbody'), cols = cp.draft.columns, found = cp.found?.columns ?? [];
  // Typing in the list: only what the window found changes (samples, warnings), so the field keeps the focus.
  if (keepFocus && body.contains(document.activeElement) && body.rows.length === cols.length) {
    [...body.rows].forEach((tr, i) => { tr.querySelector('.cp-sample').textContent = found[i]?.sample ?? ''; tr.querySelector('.cp-w').innerHTML = warn(i); });
    return;
  }
  $c('.cp-list thead').innerHTML = `<tr><th><input type="checkbox" class="cp-tick-all" title="Tick all"${cp.ticked.size && cp.ticked.size === cols.length ? ' checked' : ''}></th>` +
    '<th>#</th><th>Name</th><th>Sample</th><th>Type</th><th title="Start and end quote; empty: the file\'s">Quotes</th>' +
    '<th title="How the value is written in the file: the decimal and thousands sign, or a date pattern (dd-MM-yyyy HH:mm)">Read as</th>' +
    '<th title="How the preview shows it: #,##0.00 for a number, yyyy-MM-dd for a date; empty: as read">Format</th>' +
    '<th>Align</th><th>Trim</th><th>Shown</th><th title="In characters; empty: as wide as its longest value">Width</th><th title="Its place in the view; empty: as in the file">Order</th><th></th></tr>';
  body.innerHTML = cols.map((c, i) => {
    const readAs = numeric(c.type)
      ? `<select data-f="decimal" title="Decimal sign">${options(SIGNS.slice(0, 2), c.decimal ?? '.')}</select> <select data-f="group" title="Thousands sign">${options(SIGNS, c.group ?? '')}</select>`
      : c.type === 'date' ? `<input class="cp-text" data-f="pattern" value="${esc(c.pattern ?? 'yyyy-MM-dd')}" title="As written in the file: yyyy yy MM M dd d HH H mm ss, 'text' as it is">` : '';
    return `<tr data-i="${i}"${cp.ticked.has(i) ? ' class="cp-ticked"' : ''}>` +
      `<td><input type="checkbox" class="cp-tick"${cp.ticked.has(i) ? ' checked' : ''}></td><td class="cp-n">${i + 1}</td>` +
      `<td><input class="cp-text" data-f="name" value="${esc(c.name)}" placeholder="${esc(found[i]?.name || `Column ${i + 1}`)}"></td>` +
      `<td class="cp-sample" title="${esc(found[i]?.sample)}">${esc(found[i]?.sample)}</td>` +
      `<td><select data-f="type">${options(TYPES, c.type ?? 'text')}</select></td>` +
      `<td><input class="cp-sign" data-f="quote" value="${esc(c.quote ?? '')}" placeholder="${esc(cp.draft.quote)}"><input class="cp-sign" data-f="quoteEnd" value="${esc(c.quoteEnd ?? '')}" placeholder="${esc(cp.draft.quoteEnd ?? cp.draft.quote)}"></td>` +
      `<td>${readAs}</td>` +
      `<td><input class="cp-text" data-f="format" value="${esc(c.format ?? '')}" placeholder="${numeric(c.type) ? '#,##0.00' : c.type === 'date' ? 'yyyy-MM-dd' : ''}"></td>` +
      `<td><select data-f="align">${options([['left', 'left'], ['right', 'right']], c.align ?? 'left')}</select></td>` +
      `<td><input type="checkbox" data-f="trim"${c.trim ? ' checked' : ''}></td>` +
      `<td><input type="checkbox" data-f="shown"${c.hidden ? '' : ' checked'}></td>` +
      `<td><input class="cp-num" type="number" min="1" data-f="width" value="${c.width ?? ''}"></td>` +
      `<td><input class="cp-num" type="number" min="1" data-f="order" value="${c.order === undefined ? '' : c.order + 1}"></td>` +
      `<td class="cp-w">${warn(i)}</td></tr>`;
  }).join('');
}

function warn(i) {
  const f = cp.found?.columns?.[i];
  return f?.bad ? `<span class="cp-warn" title="${f.bad} ${f.bad === 1 ? 'value does' : 'values do'} not fit its type or Read as${cp.found.partial ? ' (in the first 64 KB)' : ''}; the first in row ${f.firstBad}">&#9888; ${f.bad}</span>` : '';
}

function drawDefinition() {
  const area = $c('.cp-def textarea');
  if (document.activeElement !== area) area.value = csvwWrite(cp.draft, cp.state?.path ? cp.state.path.replace(/^.*[\\/]/, '') : 'draft.csv');
  $c('.cp-def-error').textContent = '';
}

// ---------- Changes ----------
// The draft tried on the text again, a moment after the last change.
function probe() {
  clearTimeout(cp.timer);
  cp.timer = setTimeout(() => toWindow({ kind: 'probe', def: cp.draft }), 250);
}

function fileChanged() {
  const d = cp.draft;
  d.delimiter = readSign($c('#cp-delim').value) || ',';
  d.trim = $c('#cp-trim').checked;
  d.skip = Math.max(0, parseInt($c('#cp-skip').value, 10) || 0);
  d.header = Math.min(+$c('#cp-header').value || 0, d.skip);
  d.quote = $c('#cp-quote').value;
  d.quoteEnd = $c('#cp-quote-end').value || d.quote;
  d.escape = $c('#cp-escape').value;
  d.escapeChar = $c('#cp-escape-char').value || '\\';
  drawFile();
  probe();
}
for (const el of document.querySelectorAll('.cp-file input, .cp-file select')) el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', fileChanged);

// A value set in a column: in every ticked column too when this one is ticked.
function setField(col, f, el) {
  if (f === 'shown') { if (el.checked) delete col.hidden; else col.hidden = true; return; }
  if (f === 'trim') { if (el.checked) col.trim = true; else delete col.trim; return; }
  if (f === 'width' || f === 'order') {
    const n = parseInt(el.value, 10);
    if (n > 0) col[f] = f === 'order' ? n - 1 : n; else delete col[f];
    return;
  }
  if (f === 'quote' || f === 'quoteEnd' || f === 'format' || f === 'name') {
    if (el.value === '' && f !== 'name') delete col[f]; else col[f] = el.value;
    return;
  }
  col[f] = el.value;
  if (f === 'type') {   // its defaults: numbers and dates at the right, a decimal sign, a date pattern
    col.align = numeric(el.value) || el.value === 'date' ? 'right' : 'left';
    if (numeric(el.value)) { col.decimal ??= '.'; col.group ??= ''; }
    if (el.value === 'date') col.pattern ??= 'yyyy-MM-dd';
  }
}

$c('.cp-list').addEventListener('change', e => listChanged(e));
$c('.cp-list').addEventListener('input', e => { if (e.target.matches('input.cp-text, input.cp-sign, input.cp-num')) listChanged(e); });
function listChanged(e) {
  const el = e.target;
  if (el.classList.contains('cp-tick-all')) {
    cp.ticked = new Set(el.checked ? cp.draft.columns.map((_, i) => i) : []);
    return drawColumns();
  }
  const tr = el.closest('tr[data-i]');
  if (!tr) return;
  const i = +tr.dataset.i;
  if (el.classList.contains('cp-tick')) {
    if (el.checked) cp.ticked.add(i); else cp.ticked.delete(i);
    tr.classList.toggle('cp-ticked', el.checked);
    return;
  }
  const f = el.dataset.f;
  if (!f) return;
  const targets = cp.ticked.has(i) ? [...cp.ticked] : [i];
  for (const t of targets) setField(cp.draft.columns[t], f, el);
  // A type (its Read as differs) or a value in other ticked columns: the list drawn again.
  if (f === 'type' || (targets.length > 1 && e.type === 'change')) drawColumns();
  else if (targets.length > 1) for (const t of targets) {
    const other = $c(`tr[data-i="${t}"] [data-f="${f}"]`);
    if (other && other !== el) { if (other.type === 'checkbox') other.checked = el.checked; else other.value = el.value; }
  }
  if (['type', 'decimal', 'group', 'pattern', 'quote', 'quoteEnd', 'trim'].includes(f)) probe();
}

// Right-click on a column: tick all of its type.
$c('.cp-list').addEventListener('contextmenu', e => {
  const tr = e.target.closest('tr[data-i]');
  if (!tr) return;
  e.preventDefault();
  const type = cp.draft.columns[+tr.dataset.i].type ?? 'text';
  const name = TYPES.find(t => t[0] === type)?.[1] ?? type;
  smallMenu(e.clientX, e.clientY, [[`Tick all of this type (${name})`, () => {
    cp.draft.columns.forEach((c, i) => { if ((c.type ?? 'text') === type) cp.ticked.add(i); });
    drawColumns();
  }], ['Untick all', () => { cp.ticked.clear(); drawColumns(); }]]);
});

function smallMenu(x, y, items) {
  document.querySelector('.cp-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'cp-menu';
  for (const [label, run] of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => { menu.remove(); run(); };
    menu.append(b);
  }
  document.body.append(menu);
  menu.style.left = Math.max(0, Math.min(x, innerWidth - menu.offsetWidth - 2)) + 'px';
  menu.style.top = Math.max(0, Math.min(y, innerHeight - menu.offsetHeight - 2)) + 'px';
  const away = ev => { if (!menu.contains(ev.target)) { menu.remove(); removeEventListener('pointerdown', away, true); } };
  addEventListener('pointerdown', away, true);
}

// ---------- The tabs and the buttons ----------
for (const b of document.querySelectorAll('.cp-tabs button')) b.addEventListener('click', () => {
  if (cp.tab === 'definition' && b.dataset.tab !== 'definition' && !readDefinition()) return;   // a broken text stays on its tab
  cp.tab = b.dataset.tab;
  for (const t of document.querySelectorAll('.cp-tabs button')) t.classList.toggle('cp-on', t === b);
  $c('.cp-file').hidden = cp.tab !== 'file';
  $c('.cp-list').hidden = cp.tab !== 'columns';
  $c('.cp-def').hidden = cp.tab !== 'definition';
  drawAll();
});

// The Definition tab's text into the draft; a text that is not a definition is refused with where it went wrong.
function readDefinition() {
  const text = $c('.cp-def textarea').value;
  try {
    cp.draft = csvwRead(text);
    return true;
  } catch (e) {
    const at = /position (\d+)/.exec(e.message)?.[1], line = /line (\d+)/.exec(e.message)?.[1] ?? (at ? text.slice(0, +at).split('\n').length : null);
    $c('.cp-def-error').textContent = `Not a definition${line ? ` (line ${line})` : ''}: ${e.message}`;
    return false;
  }
}

function apply(kind = 'apply') {
  if (cp.tab === 'definition' && !readDefinition()) return;
  toWindow({ kind, def: cp.draft });
}
$c('.cp-apply').addEventListener('click', () => apply());
$c('.cp-save').addEventListener('click', () => cp.state?.beside ? toWindow({ kind: 'deleteBeside' }) : apply('saveBeside'));
$c('.cp-revert').addEventListener('click', () => { if (cp.state) paneHandlers.columns(cp.state); });
$c('.cp-detect').addEventListener('click', () => toWindow({ kind: 'detect' }));
$c('.cp-info').addEventListener('click', () => toWindow({ kind: 'info' }));

addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey && !e.altKey && !e.shiftKey && !$c('.cp-main').hidden) { e.preventDefault(); e.stopImmediatePropagation(); apply(); }
  else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (document.querySelector('.cp-menu')) document.querySelector('.cp-menu').remove();
    else toWindow({ kind: 'escape' });
  }
}, true);
