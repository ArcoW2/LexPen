'use strict';
// The preview of a CSV: the column view (docs/plans/29-PLAN-csv-columns.md, 3.3). The rows in aligned columns, each
// value in its column's format, drawn per screen (only the rows in view are in the page), the header kept at the top.
// The reading is csv.js; the definition is the document's (detected when it has none). Loaded after csv.js.

// The document read as CSV, kept until its text changes: { gen, text, def, read, lines (the source line each row
// starts on), widths (per column, in characters) }.
function csvData(doc, text) {
  const gen = doc.cmDoc ? doc.cmDoc.changeGeneration() : -1;
  if (text.includes('\r')) text = text.replace(/\r\n?/g, '\n');   // as the editor has it (a tab not yet in one: as read)
  if (doc.csv && doc.csv.gen === gen && doc.csv.text === text) return doc.csv;
  doc.csvDef ??= csvDetect(text);
  const def = doc.csvDef, read = csvRead(text, def);
  const lines = new Int32Array(read.rows.length);
  let line = 0, at = 0;
  read.pre.forEach(p => { for (; at < p.start; at++) if (text.charCodeAt(at) === 10) line++; });
  read.rows.forEach((r, i) => {
    for (; at < r.start; at++) if (text.charCodeAt(at) === 10) line++;
    lines[i] = line;
  });
  const max = setting('csvMaxWidth') || 40, widths = [];
  for (let c = 0; c < read.columns; c++) widths.push(Math.min(max, Math.max(3, csvName(read, def, c).length)));
  for (const r of read.rows)
    r.fields.forEach((f, c) => {
      if (widths[c] >= max) return;
      const n = csvCellText(f.text, def.columns[c]).text.length;
      if (n > widths[c]) widths[c] = Math.min(max, n);
    });
  return doc.csv = { gen, text, def, read, lines, widths };
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
  const data = csvData(tab.doc, text), { read, def, widths } = data;
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
  head.append(...widths.map((w, c) => csvCell(csvName(read, def, c), w, def.columns[c], c)));
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
  const { data: { read, def, widths, text }, body, rows } = view, count = read.rows.length;
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
    for (let c = 0; c < widths.length; c++) {
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
