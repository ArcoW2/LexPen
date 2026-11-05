'use strict';
// The preview of a CSV: the column view (docs/plans/executed/PLAN-csv-columns.md, 3.3). The rows in aligned columns, each
// value in its column's format, drawn per screen (only the rows in view are in the page), the header kept at the top.
// The reading is csv.js; the definition is the document's (detected when it has none). Loaded after csv.js.

// ---------- The definition (3.4) ----------
// Where it comes from when the file opens: next to the file (a CSVW file; doc.csvBeside its path), LexPen's own
// store, else detected (setting csvGuess; off: comma, double quotes, a header line). A kept one is fitted to the
// columns the file has now.
async function csvLoad(doc, text) {
  if (text.includes('\r')) text = text.replace(/\r\n?/g, '\n');
  let found = null;
  try { found = doc.path || doc.draft ? await host('columnsGet', { path: doc.path, draft: doc.draft }) : null; } catch { }
  if (doc.csvDef) return;   // set meanwhile (the pane)
  let def = null;
  if (found?.table) try { def = csvFit(csvwRead(found.table), text); } catch { }
  doc.csvBeside = def && found.beside || null;
  doc.csvDef = def ?? (setting('csvGuess') === false ? csvFit(csvDefinition(), text) : csvDetect(text));
}

// The definition as CSVW, for the store or the file next to it.
const csvTable = doc => JSON.parse(csvwWrite(doc.csvDef, doc.path ? doc.path.replace(/^.*[\\/]/, '') : 'draft.csv'));

// Apply (the pane): the preview redraws with it, and it is kept: next to the file when it came from there or was
// saved there, else in LexPen's store a second later.
function csvApply(doc, def) {
  doc.csvDef = def;
  doc.csv = null;
  for (const tab of tabsOf(doc)) if (paneOf(tab)?.active === tab && tab.mode !== 'edit') render(tab); else tab.stale = true;
  clearTimeout(doc.csvTimer);
  if (doc.csvBeside && doc.path) return csvSaveBeside(doc);
  if (doc.path || doc.draft) doc.csvTimer = setTimeout(() => host('columnsSet', { path: doc.path, draft: doc.draft, table: csvTable(doc) }).catch(() => {}), 1000);
}

// Save definition next to the file: name.csv-metadata.json (or the folder's csv-metadata.json that describes it).
async function csvSaveBeside(doc) {
  if (!doc?.path || !doc.csvDef) return;
  try {
    doc.csvBeside = await host('columnsSaveBeside', { path: doc.path, table: csvTable(doc) });
    toast(`Definition saved: ${doc.csvBeside}`, true);
    if (state.root) refreshTree(false);   // its mark in the Folder pane
  } catch (e) { toast(`The definition could not be saved: ${e.message ?? e}`); }
}

// The document read as CSV, kept until its text changes: { gen, text, def, read, lines (the source line each row
// starts on), widths (per column, in characters), longest (per column, its longest value as shown), order (the shown
// columns as shown), slots (every column in its place: a hidden one as a thin mark) }.
function csvData(doc, text) {
  const gen = doc.cmDoc ? doc.cmDoc.changeGeneration() : -1;
  if (text.includes('\r')) text = text.replace(/\r\n?/g, '\n');   // as the editor has it (a tab not yet in one: as read)
  if (doc.csv && doc.csv.gen === gen && doc.csv.text === text) return doc.csv;
  doc.csvDef ??= csvDetect(text);
  let def = doc.csvDef, read = csvRead(text, def);
  // A column now at another place in the header (an undo of Write the columns in this order, an edit): the definition
  // follows the columns by their names.
  if (read.names && def.columns.some((c, i) => c.name && read.names[i] !== undefined && c.name !== read.names[i] && read.names.includes(c.name))) {
    def = doc.csvDef = csvFit(def, text);
    read = csvRead(text, def);
  }
  const lines = new Int32Array(read.rows.length);
  let line = 0, at = 0;
  read.pre.forEach(p => { for (; at < p.start; at++) if (text.charCodeAt(at) === 10) line++; });
  read.rows.forEach((r, i) => {
    for (; at < r.start; at++) if (text.charCodeAt(at) === 10) line++;
    lines[i] = line;
  });
  const max = setting('csvMaxWidth') || 40, longest = new Array(read.columns).fill(0);
  for (const r of read.rows)
    r.fields.forEach((f, c) => {
      const n = csvCellText(f.text, def.columns[c]).text.length;   // as shown
      if (n > longest[c]) longest[c] = n;
    });
  const widths = longest.map((n, c) => def.columns[c]?.width > 0 ? def.columns[c].width   // set by hand
    : Math.min(max, Math.max(3, n, csvName(read, def, c).length)));
  // The columns in their places: by their order (unset: their place in the file); the hidden ones are not shown.
  const slots = widths.map((_, c) => c).sort((a, b) => (def.columns[a]?.order ?? a) - (def.columns[b]?.order ?? b) || a - b);
  const order = slots.filter(c => !def.columns[c]?.hidden);
  return doc.csv = { gen, text, def, read, lines, widths, longest, order, slots };
}

const csvName = (read, def, c) => def.columns[c]?.name || read.names?.[c] || `Column ${c + 1}`;

// A value as shown: in its column's format, a field with a line break as its first line and '...'.
function csvCellText(raw, col) {
  const shown = csvShow(raw, col), nl = shown.text.search(/[\r\n]/);
  return nl < 0 ? shown : { text: shown.text.slice(0, nl) + '...', ok: shown.ok };
}

// The view's element for the tab: the lines before the data (folded), the header and the body, whose height holds
// every row; csvDraw fills it with the rows in view.
function csvViewElement(tab, text) {
  const data = csvData(tab.doc, text), { read, def, widths, order } = data;
  const view = document.createElement('div');
  view.className = 'mm-csv';
  view.style.setProperty('--rows', read.rows.length);
  view.classList.toggle('mm-csv-sticky', setting('csvStickyHeader') !== false);
  const before = read.pre.filter((p, i) => i !== def.header - 1);   // the header line is the header
  if (before.length) {
    const pre = document.createElement('details');
    pre.className = 'mm-csv-pre';
    pre.innerHTML = `<summary>${before.length} ${before.length === 1 ? 'line' : 'lines'} before the data</summary>`;
    const lines = document.createElement('pre');
    lines.textContent = before.map(p => p.text).join('\n');
    pre.append(lines);
    pre.addEventListener('toggle', () => { tab.lines = null; });
    view.append(pre);
  }
  const head = document.createElement('div');
  head.className = 'mm-csv-head';
  head.append(...data.slots.map(c => {
    if (def.columns[c]?.hidden) return csvGap(c, csvName(read, def, c));
    const cell = csvCell(csvName(read, def, c), widths[c], def.columns[c], c);
    const type = def.columns[c]?.type ?? 'text';
    cell.title = `${csvName(read, def, c)}\n${type === 'date' ? 'date / time' : type}, longest ${data.longest[c]} characters\nDrag the name: move; drag the edge: size (double click: to the longest)`;
    // The name cut in a box of its own, so the edge's handle can reach past the cell on both sides.
    cell.replaceChildren(Object.assign(document.createElement('span'), { className: 'mm-csv-name', textContent: cell.textContent }),
      Object.assign(document.createElement('span'), { className: 'mm-csv-grip' }));
    return cell;
  }));
  csvHeadEvents(tab, head);
  const body = document.createElement('div');
  body.className = 'mm-csv-body';
  const rows = document.createElement('div');
  rows.className = 'mm-csv-rows';
  body.append(rows);
  view.append(head, body);
  tab.csv = { data, body, rows, first: -1, last: -1 };
  return view;
}

function csvCell(text, width, col, c) {
  const el = document.createElement('span');
  el.className = 'mm-csv-cell';
  el.style.width = width + 'ch';
  el.dataset.c = c;
  if (col?.align === 'right') el.classList.add('mm-csv-right');
  el.textContent = text;
  return el;
}

// The rows in view (and a screen above and below) into the body.
function csvDraw(pane) {
  const tab = pane.active, view = tab?.csv;
  if (!view || !view.body.isConnected) return;
  const { data: { read, def, widths, slots, text }, body, rows } = view, count = read.rows.length;
  if (!count) return rows.replaceChildren();
  const r = body.getBoundingClientRect(), p = pane.previewEl.getBoundingClientRect(), h = r.height / count;
  if (!h) return;
  const screen = Math.ceil(p.height / h);
  const first = Math.max(0, Math.floor((p.top - r.top) / h) - screen), last = Math.min(count, first + 3 * screen);
  if (first === view.first && last === view.last) return;
  view.first = first;
  view.last = last;
  rows.style.setProperty('--first', first);
  const out = [];
  for (let i = first; i < last; i++) {
    const row = read.rows[i], el = document.createElement('div');
    el.className = 'mm-csv-row';
    el.dataset.r = i;
    el.dataset.line = view.data.lines[i];
    if (row.problem) {
      el.classList.add('mm-csv-problem');
      el.title = 'An end quote that never comes: the row ends at its line';
    }
    for (const c of slots) {
      if (def.columns[c]?.hidden) { el.append(csvGap(c)); continue; }
      const f = row.fields[c], shown = f ? csvCellText(f.text, def.columns[c]) : { text: '', ok: true };
      const cell = csvCell(shown.text, widths[c], def.columns[c], c);
      if (!shown.ok) cell.classList.add('mm-csv-bad');
      if (f) cell.title = text.slice(f.start, f.end);   // the field as it is in the file
      el.append(cell);
    }
    out.push(el);
  }
  rows.replaceChildren(...out);
}

// The preview's lines for the scroll sync (app.js lineMap): where each row is, by its source line.
function csvLineMap(tab, base) {
  const view = tab.csv, count = view.data.read.rows.length, map = [{ line: 0, y: tab.article.getBoundingClientRect().top - base }];
  if (!count) return map;
  const r = view.body.getBoundingClientRect(), top = r.top - base, h = r.height / count, lines = view.data.lines;
  for (let i = 0; i < count; i++) if (lines[i] > map[map.length - 1].line) map.push({ line: lines[i], y: top + i * h });
  return map;
}

// The row and the field a text offset is in: { row, col } (0-based), or null before the data.
function csvAt(data, offset) {
  const rows = data.read.rows;
  let lo = 0, hi = rows.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].start <= offset) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (found < 0) return null;
  const fields = rows[found].fields;
  let col = fields.findIndex(f => offset <= f.end);
  if (col < 0) col = fields.length - 1;
  return { row: found, col };
}

const csvPlace = (data, at) => at && `Row ${at.row + 1}, Col ${at.col + 1} (${csvName(data.read, data.def, at.col)})`;

// The bottom bar: the cell under the mouse, else the one the editor's cursor is in (when the document was read with
// its text as it is now).
function csvStatus(pane, cm) {
  const doc = pane.active?.doc, data = doc?.csv;
  if (!data || doc.language !== 'csv') return '';
  if (pane.csvHover) return csvPlace(data, pane.csvHover);
  // Read before the editor had it: the same text while unchanged.
  const gen = doc.cmDoc ? doc.cmDoc.changeGeneration() : -1;
  if (!cm || (data.gen !== gen && !(data.gen === -1 && !doc.dirty))) return '';
  return csvPlace(data, csvAt(data, cm.indexFromPos(cm.getCursor('head')))) || '';
}

function csvHover(pane, e) {
  const cell = e.target.closest?.('.mm-csv-row .mm-csv-cell');
  const at = cell ? { row: +cell.parentElement.dataset.r, col: +cell.dataset.c } : null;
  if (at?.row === pane.csvHover?.row && at?.col === pane.csvHover?.col) return;
  pane.csvHover = at;
  updateStatus();
}

// ---------- Sizing, hiding and moving (3.5) ----------
// The header is the view's ruler: each column's name, its right edge a handle. These change the view only; they land
// in the definition (width, hidden, order) as Apply in the Columns pane does.

// A hidden column: a thin mark at its place; a click shows it again.
function csvGap(c, name) {
  const el = document.createElement('span');
  el.className = 'mm-csv-gap';
  el.dataset.c = c;
  if (name !== undefined) el.title = `${name} (hidden; click: show it)`;
  return el;
}

// The definition changed by `change(def)` (a copy), applied and kept; the Columns pane shows it.
function csvChange(doc, change) {
  const def = JSON.parse(JSON.stringify(doc.csvDef)), count = doc.csv?.widths.length ?? def.columns.length;
  for (let c = def.columns.length; c < count; c++) def.columns.push({ name: csvName(doc.csv.read, def, c), type: 'text', align: 'left' });
  change(def);
  csvApply(doc, def);
  if (typeof tellColumnsPane === 'function') tellColumnsPane();
}

// The columns in a new order: `slots` every column in its place; each gets its place as its order.
function csvOrder(doc, slots) {
  csvChange(doc, def => slots.forEach((c, i) => { def.columns[c].order = i; }));
}

function csvMoveBy(doc, c, by) {
  const data = doc.csv, shown = data.order, at = shown.indexOf(c), to = at + by;
  if (at < 0 || to < 0 || to >= shown.length) return;
  const slots = data.slots.slice(), a = slots.indexOf(c), b = slots.indexOf(shown[to]);
  slots.splice(a, 1);
  slots.splice(b, 0, c);
  csvOrder(doc, slots);
}

const csvSizeToLongest = (doc, c) => csvChange(doc, def => { def.columns[c].width = Math.max(1, doc.csv.longest[c]); });
const csvHide = (doc, c) => csvChange(doc, def => { def.columns[c].hidden = true; });
const csvShowAll = doc => csvChange(doc, def => def.columns.forEach(col => delete col.hidden));

// Dragging an edge sizes its column (the cells in view follow; kept when let go); dragging a name moves the column to
// where it is let go; a double click on an edge sizes to the longest value; a click on a hidden column's mark shows it.
function csvHeadEvents(tab, head) {
  const doc = tab.doc;
  head.addEventListener('dblclick', e => {
    const grip = e.target.closest('.mm-csv-grip');
    if (grip) { e.stopPropagation(); csvSizeToLongest(doc, +grip.parentElement.dataset.c); }
  });
  head.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const cell = e.target.closest('.mm-csv-cell');
    if (!cell) return;
    const c = +cell.dataset.c, startX = e.clientX, view = head.parentElement;
    const grip = e.target.closest('.mm-csv-grip');
    e.preventDefault();
    head.setPointerCapture(e.pointerId);
    let moved = false, width = doc.csv.widths[c];
    const chPx = cell.getBoundingClientRect().width / (width + 1.2);   // its padding: 0.6ch each side
    const move = ev => {
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      if (!moved) return;
      if (grip) {
        width = Math.max(1, Math.round(doc.csv.widths[c] + (ev.clientX - startX) / chPx));
        for (const el of view.querySelectorAll(`.mm-csv-cell[data-c="${c}"]`)) el.style.width = width + 'ch';
      } else head.classList.add('mm-csv-moving');
    };
    const up = ev => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      head.classList.remove('mm-csv-moving');
      if (!moved) return;
      if (grip) return csvChange(doc, def => { def.columns[c].width = width; });
      // Let go over another column: this one takes its place.
      const over = [...head.querySelectorAll('.mm-csv-cell')].find(el => { const r = el.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX < r.right; });
      const to = over ? +over.dataset.c : null;
      if (to === null || to === c) return;
      const slots = doc.csv.slots.slice();
      slots.splice(slots.indexOf(c), 1);
      slots.splice(slots.indexOf(to) + (ev.clientX > startX ? 1 : 0), 0, c);
      csvOrder(doc, slots);
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  });
}

// A click on a hidden column's mark (the header or a row): shown again.
function csvClick(pane, e) {
  const gap = e.target.closest?.('.mm-csv-gap');
  if (gap && pane.active?.csv) csvChange(pane.active.doc, def => { delete def.columns[+gap.dataset.c].hidden; });
}

// The right-click in the column view: the column's own items (on a cell or its name), then the view's.
function csvMenu(pane, e) {
  const tab = pane.active;
  if (!tab?.csv) return;
  e.preventDefault();
  const cell = e.target.closest('.mm-csv-cell');
  if (cell) return csvColumnBox(tab.doc, +cell.dataset.c, e.clientX, e.clientY);
  openPopupMenu(csvViewItems(tab.doc), e.clientX, e.clientY);
}

// The view's own items (the right-click beside the columns, More... in a column's box).
function csvViewItems(doc) {
  return [
    { label: 'Show &all columns', run: () => csvShowAll(doc), enabled: doc.csvDef.columns.some(col => col.hidden) },
    { label: 'Column &info', action: 'csv.info' },
    { label: '&Write the columns in this order...', action: 'csv.writeOrder', params: [false] },
    { label: 'Write the &shown columns in this order...', action: 'csv.writeOrder', params: [true], enabled: doc.csvDef.columns.some(col => col.hidden) },
    '-',
    { label: '&Columns...', action: 'csv.columns' },
    { label: 'Sa&ve definition next to the file', action: 'csv.saveBeside' }];
}

// ---------- A column's box (the right-click on a column) ----------
// A small window at the mouse with that column's settings, as the Columns pane has them; a change shows at once (a
// typed one a moment after the last key). Below them the column's actions and More... (the view's items). Esc or
// Cancel puts the column back as it was; Close, Enter or a click outside keeps it.
const CSV_BOX_TYPES = [['text', 'text'], ['integer', 'integer'], ['decimal', 'decimal'], ['date', 'date / time'], ['boolean', 'boolean'], ['auto', 'auto']];
const CSV_BOX_SIGNS = [['.', '.'], [',', ','], ["'", "'"], [' ', 'space'], ['', 'none']];

function csvColumnBox(doc, c, x, y) {
  document.querySelector('.mm-csv-box')?.remove();
  const was = JSON.parse(JSON.stringify(doc.csvDef));
  const box = document.createElement('div');
  box.className = 'mm-csv-box';
  const opts = (list, value) => list.map(([v, t]) => `<option value="${escapeHtml(v)}"${v === (value ?? '') ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('');
  const numeric = t => t === 'integer' || t === 'decimal';
  let timer = 0;

  const draw = () => {
    const data = csvData(doc, docText(doc)), def = doc.csvDef, col = def.columns[c] ?? {}, shown = data.order, at = shown.indexOf(c);   // as applied just now
    const readAs = numeric(col.type)
      ? `<select data-f="decimal" title="Decimal sign">${opts(CSV_BOX_SIGNS.slice(0, 2), col.decimal ?? '.')}</select> <select data-f="group" title="Thousands sign">${opts(CSV_BOX_SIGNS, col.group ?? '')}</select>`
      : col.type === 'date' ? `<input data-f="pattern" value="${escapeHtml(col.pattern ?? 'yyyy-MM-dd')}" title="As written in the file: yyyy yy MM M dd d HH H mm ss, 'text' as it is">`
      : '<span class="mm-csv-box-dim">as it is</span>';
    box.innerHTML = `<div class="mm-csv-box-title">${escapeHtml(csvName(data.read, def, c))} <span class="mm-csv-box-dim">column ${c + 1}</span></div>` +
      '<div class="mm-csv-box-grid">' +
      `<label>Name</label><input data-f="name" value="${escapeHtml(col.name ?? '')}" placeholder="${escapeHtml(data.read.names?.[c] ?? `Column ${c + 1}`)}">` +
      `<label>Type</label><div><select data-f="type">${opts(CSV_BOX_TYPES, col.type ?? 'text')}</select></div>` +
      `<label>Quotes</label><div><input class="mm-csv-box-sign" data-f="quote" value="${escapeHtml(col.quote ?? '')}" placeholder="${escapeHtml(def.quote)}" title="Start quote; empty: the file's">` +
        ` <input class="mm-csv-box-sign" data-f="quoteEnd" value="${escapeHtml(col.quoteEnd ?? '')}" placeholder="${escapeHtml(def.quoteEnd ?? def.quote)}" title="End quote; empty: the file's"></div>` +
      `<label>Read as</label><div>${readAs}</div>` +
      `<label>Format</label><input data-f="format" value="${escapeHtml(col.format ?? '')}" placeholder="${numeric(col.type) ? '#,##0.00' : col.type === 'date' ? 'yyyy-MM-dd' : 'as read'}" title="How the view shows it; empty: as read">` +
      `<label>Align</label><div><select data-f="align">${opts([['left', 'left'], ['right', 'right']], col.align ?? 'left')}</select>` +
        ` <label><input type="checkbox" data-f="trim"${col.trim ? ' checked' : ''}> Trim</label></div>` +
      `<label>Width</label><div><input class="mm-csv-box-num" type="number" min="1" data-f="width" value="${col.width ?? ''}" placeholder="${data.widths[c]}" title="In characters; empty: as wide as its longest value">` +
        ` <label><input type="checkbox" data-f="shown"${col.hidden ? '' : ' checked'}${!col.hidden && shown.length < 2 ? ' disabled' : ''}> Shown</label></div>` +
      '</div><div class="mm-csv-box-actions">' +
      `<button type="button" data-do="left" title="Move left"${at > 0 ? '' : ' disabled'}>&lt;</button>` +
      `<button type="button" data-do="right" title="Move right"${at >= 0 && at < shown.length - 1 ? '' : ' disabled'}>&gt;</button>` +
      '<button type="button" data-do="fit" title="Size to its longest value">Fit</button>' +
      `<button type="button" data-do="hide"${col.hidden || shown.length < 2 ? ' disabled' : ''}>Hide</button>` +
      '<button type="button" data-do="info" title="Column info: every column">Info</button>' +
      '<button type="button" data-do="more">More...</button></div>' +
      '<div class="mm-csv-box-bar"><button type="button" data-do="close">Close</button><button type="button" data-do="cancel" title="The column as it was (Esc)">Cancel</button></div>';
  };

  // A value set: the column changed and shown at once (typing: a moment after the last key).
  const set = (el, later) => {
    const f = el.dataset.f;
    const change = () => csvChange(doc, def => {
      const col = def.columns[c];
      if (f === 'shown') { if (el.checked) delete col.hidden; else col.hidden = true; }
      else if (f === 'trim') { if (el.checked) col.trim = true; else delete col.trim; }
      else if (f === 'width') { const n = parseInt(el.value, 10); if (n > 0) col.width = n; else delete col.width; }
      else if (f === 'name' || el.value !== '' || ['type', 'align', 'decimal', 'group'].includes(f)) col[f] = el.value;
      else delete col[f];
      if (f === 'type') {   // its defaults: numbers and dates at the right, a decimal sign, a date pattern
        col.align = numeric(el.value) || el.value === 'date' ? 'right' : 'left';
        if (numeric(el.value)) { col.decimal ??= '.'; col.group ??= ''; }
        if (el.value === 'date') col.pattern ??= 'yyyy-MM-dd';
      }
    });
    clearTimeout(timer);
    if (later) timer = setTimeout(change, 400);
    else { change(); if (f === 'type' || f === 'shown') { draw(); box.querySelector(`[data-f="${f}"]`)?.focus(); } }
  };
  box.addEventListener('input', e => { if (e.target.matches('input:not([type=checkbox])')) set(e.target, true); });
  box.addEventListener('change', e => { if (e.target.dataset.f && (e.target.tagName === 'SELECT' || e.target.type === 'checkbox')) set(e.target, false); });

  const close = keep => {
    clearTimeout(timer);
    removeEventListener('pointerdown', outside, true);
    if (!keep) { csvApply(doc, was); if (typeof tellColumnsPane === 'function') tellColumnsPane(); }
    box.remove();
  };
  const flush = () => { const typed = box.querySelector('input:focus:not([type=checkbox])'); if (typed) { clearTimeout(timer); set(typed, false); } };
  box.addEventListener('click', e => {
    const what = e.target.closest('button')?.dataset.do;
    if (!what) return;
    flush();
    if (what === 'close') return close(true);
    if (what === 'cancel') return close(false);
    if (what === 'left' || what === 'right') csvMoveBy(doc, c, what === 'left' ? -1 : 1);
    if (what === 'fit') csvSizeToLongest(doc, c);
    if (what === 'hide') csvHide(doc, c);
    if (what === 'info') { close(true); return showColumnInfo(doc); }
    if (what === 'more') { const r = e.target.getBoundingClientRect(); close(true); return openPopupMenu(csvViewItems(doc), r.left, r.bottom); }
    draw();
  });
  box.addEventListener('keydown', e => {
    e.stopPropagation();   // the box's keys, not the window's
    if (e.key === 'Escape') { e.preventDefault(); close(false); }
    else if (e.key === 'Enter' && !e.target.matches('button')) { e.preventDefault(); flush(); close(true); }
  });
  const outside = e => { if (!box.contains(e.target)) { flush(); close(true); } };
  addEventListener('pointerdown', outside, true);

  draw();
  document.body.append(box);
  box.style.left = Math.max(4, Math.min(x, innerWidth - box.offsetWidth - 4)) + 'px';
  box.style.top = Math.max(4, Math.min(y, innerHeight - box.offsetHeight - 4)) + 'px';
  box.querySelector('[data-f=type]').focus();
}

// ---------- Column info (3.8) ----------
// Per column: its name, type, longest and shortest value, how many are empty, how many do not fit its type.
function csvColumnInfo(data) {
  const { read, def } = data;
  return data.widths.map((_, c) => {
    let longest = '', shortest = null, empty = 0, bad = 0;
    for (const r of read.rows) {
      const v = r.fields[c]?.text ?? '';
      if (!v.trim()) { empty++; continue; }
      if (v.length > longest.length) longest = v;
      if (shortest === null || v.length < shortest.length) shortest = v;
      if (!csvShow(v, def.columns[c]).ok) bad++;
    }
    return { name: csvName(read, def, c), type: def.columns[c]?.type ?? 'text', longest, shortest: shortest ?? '', empty, bad };
  });
}

function showColumnInfo(doc) {
  if (!doc?.csv) return;
  const info = csvColumnInfo(doc.csv), cut = s => s.length > 40 ? s.slice(0, 40) + '...' : s;
  const dialog = document.createElement('dialog');
  dialog.className = 'mm-csv-info';
  dialog.innerHTML = `<h3>Column info: ${escapeHtml(docName(doc))} (${doc.csv.read.rows.length.toLocaleString()} rows)</h3>` +
    '<div class="mm-csv-info-list"><table><thead><tr><th>#</th><th>Name</th><th>Type</th><th>Longest</th><th>Shortest</th><th>Empty</th><th>Do not fit</th></tr></thead><tbody>' +
    info.map((i, c) => `<tr><td>${c + 1}</td><td>${escapeHtml(i.name)}</td><td>${i.type === 'date' ? 'date / time' : i.type}</td>` +
      `<td title="${escapeHtml(i.longest)}">${i.longest.length}: ${escapeHtml(cut(i.longest))}</td><td title="${escapeHtml(i.shortest)}">${i.shortest.length}: ${escapeHtml(cut(i.shortest))}</td>` +
      `<td>${i.empty}</td><td${i.bad ? ' class="mm-csv-info-bad"' : ''}>${i.bad}</td></tr>`).join('') +
    '</tbody></table></div><div class="mm-csv-info-bar"><button type="button" value="close">Close</button></div>';
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

// ---------- Writing the order to the editor (3.6) ----------
// Every row (and the header line) rewritten in the shown order, each field's text and quotes as they are, as one undo
// step; `withoutHidden`: the hidden columns left out. The other lines before the data stay. Asks first.
async function csvWriteOrder(doc, withoutHidden) {
  if (!doc?.csvDef) return;
  const data = csvData(doc, docText(doc)), { read, def, text } = data;
  const slots = withoutHidden ? data.order : data.slots;
  const same = slots.length === data.widths.length && slots.every((c, i) => c === i);
  if (same) return toast('The columns are in the order of the file already.', true);
  const hidden = data.slots.length - data.order.length;
  if (!await confirmBox(`Rewrite every row of ${docName(doc)} in the order shown${withoutHidden && hidden ? `, without the ${hidden} hidden column${hidden === 1 ? '' : 's'}` : ''}? ` +
    'One undo step; the file changes when saved.')) return;
  const dl = def.delimiter || ',';
  // A row's fields from its first to its last, in the new order (a field it does not have: empty).
  const rewrite = fields => slots.map(c => fields[c] ? text.slice(fields[c].start, fields[c].end) : '').join(dl);
  const edits = [];
  const header = def.header > 0 ? read.pre[def.header - 1] : null;
  if (header) {
    const fields = csvRow(text, header.start, def, () => [def.quote ?? '', def.quoteEnd ?? def.quote ?? '']).fields;
    edits.push([fields[0].start, fields[fields.length - 1].end, rewrite(fields)]);
  }
  for (const r of read.rows) if (r.fields.length) edits.push([r.fields[0].start, r.fields[r.fields.length - 1].end, rewrite(r.fields)]);
  let out = '', at = 0;
  for (const [from, to, by] of edits) { out += text.slice(at, from) + by; at = to; }
  out += text.slice(at);
  // The columns follow: the definition in the file's new order, the order unset.
  const columns = slots.map(c => { const col = { ...(def.columns[c] ?? { name: csvName(read, def, c), type: 'text' }) }; delete col.order; return col; });
  const tab = panes[state.activePane].active?.doc === doc ? panes[state.activePane].active : tabsOf(doc)[0];
  if (!doc.cmDoc) { state.activePane = paneOf(tab).index; await setMode('split'); }   // the editor holds the undo step
  const cd = doc.cmDoc;
  cd.replaceRange(out, CodeMirror.Pos(cd.firstLine(), 0), CodeMirror.Pos(cd.lastLine(), cd.getLine(cd.lastLine()).length), 'csvOrder');
  csvApply(doc, { ...def, columns });
  if (typeof tellColumnsPane === 'function') tellColumnsPane();
}

appAction('csv.info', { title: 'Column info', hint: 'Per column of the CSV: its type, longest and shortest value, how many are empty and how many do not fit', group: 'view',
  enabled: () => !!activeDoc()?.csv, run: () => showColumnInfo(activeDoc()) });
appAction('csv.writeOrder', { title: 'Write the columns in this order', hint: 'Every row of the text rewritten in the order of the column view, as one undo step; asks first', group: 'edit',
  variants: [[false], [true]], variantTitles: { false: 'Write the columns in this order', true: 'Write the shown columns in this order (without the hidden ones)' },
  enabled: () => !!activeDoc()?.csvDef && activeDoc()?.language === 'csv', run: ([withoutHidden = false] = []) => csvWriteOrder(activeDoc(), !!withoutHidden) });

// A double click on a cell: the editor's cursor at that character of the field (previewjump.js previewToEditor).
function csvSourceAt(tab, e) {
  const cell = e.target.closest?.('.mm-csv-row .mm-csv-cell');
  const data = tab.doc.csv;
  if (!cell || !data) return null;
  const row = data.read.rows[+cell.parentElement.dataset.r], f = row?.fields[+cell.dataset.c];
  if (!f) {   // a cell the row has no field for: the end of the row
    const last = row?.fields[row.fields.length - 1];
    if (!last) return null;
    const pos = csvPos(data.text, last.end);
    return { from: pos, to: pos };
  }
  const { def } = data, col = def.columns[+cell.dataset.c];
  let pos = f.start;
  // Shown as in the file: the character clicked, counting an escaped quote as one.
  if (cell.textContent === f.text) {
    const caret = document.caretPositionFromPoint?.(e.clientX, e.clientY);
    const k = caret && cell.contains(caret.offsetNode) ? caret.offset : 0;
    const q = col?.quote ?? def.quote ?? '', qe = col?.quoteEnd ?? col?.quote ?? def.quoteEnd ?? q;
    if (f.quoted) pos += q.length;
    const text = data.text;
    for (let i = 0; i < k && pos < f.end; i++)
      if (def.escape === 'double' && qe && text.startsWith(qe + qe, pos)) pos += 2 * qe.length;
      else if (def.escape === 'char' && def.escapeChar && qe && text.startsWith(def.escapeChar + qe, pos)) pos += def.escapeChar.length + qe.length;
      else pos++;
  }
  const at = csvPos(data.text, pos);
  return { from: at, to: at };
}

// A text offset as an editor place (the text has \n line ends, as docText gives it); no editor needed yet.
function csvPos(text, index) {
  let line = 0, start = 0;
  for (let i = text.indexOf('\n'); i >= 0 && i < index; i = text.indexOf('\n', i + 1)) { line++; start = i + 1; }
  return { line, ch: index - start };
}
