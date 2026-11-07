'use strict';
// Sort (docs/plans/executed/PLAN-sort-lines.md): Edit > Sort... shows the Sort panel (sort.html: the sort at hand, its
// keys, its options, a live preview; the stored sorts: SortStore, sorts.json, through the host), docked or floating as
// the other panels. It sorts the selection widened to whole lines, a block's part of its lines, else the whole file;
// a CSV by its columns or as text. While the panel is shown the ruler shows each key's From and To as lines in the
// key's colour with its number (ruler.js asks sortRulerWanted and sortMarks). edit.sort, edit.sortAsc and
// edit.sortDesc sort at once, optionally by a stored sort's name. Loaded after app.js and csvview.js; registered with
// the other panels (registerDockPanes).

// The keys' colours by their place in the list (the colour says the order); ruler.js's theme colours.
const SORT_COLOURS = ['var(--accent)', 'var(--tip)', 'var(--important)', 'var(--caution)', 'var(--warning)', 'var(--find-current)', 'var(--find-box)'];
const sortColour = i => SORT_COLOURS[i % SORT_COLOURS.length];
const SORT_NUMBER = /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/;

// A sort: As text (keys: From / To, 1-based, To null: to the end) or By columns (columns: a header name and a
// 0-based index); each key its own direction; the options for all keys.
const sortDefault = () => ({ kind: 'text', keys: [{ from: 1, to: null, desc: false }], columns: [{ name: null, index: 0, desc: false }],
  ignoreCase: true, upperFirst: true, numeric: false, dups: false, dupsWhole: false, dupsTrim: false, empty: false });
const sortCopy = spec => JSON.parse(JSON.stringify(spec));
// A stored or remembered sort completed with what it lacks (an older or hand-made one).
function sortFill(spec) {
  const out = { ...sortDefault(), ...(spec ?? {}) };
  if (!Array.isArray(out.keys) || !out.keys.length) out.keys = sortDefault().keys;
  if (!Array.isArray(out.columns) || !out.columns.length) out.columns = sortDefault().columns;
  return out;
}

// ---------- The sort itself (pure: text in, text out) ----------
// A line's text as shown: each tab as the spaces to its stop (tabs.js counts the same way), so a key's columns are
// the ruler's.
function visualText(text, stops) {
  let out = '', lead = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\t') { const size = lead ? stops.indent : stops.tab; out += ' '.repeat(size - out.length % size); }
    else { if (c !== ' ') lead = false; out += c; }
  }
  return out;
}

// Two keys' texts compared by the options: the user's language, case ignored or which case first, numbers by value.
function sortComparer(spec) {
  const coll = new Intl.Collator(undefined, { numeric: !!spec.numeric, sensitivity: spec.ignoreCase ? 'accent' : 'variant',
    caseFirst: spec.ignoreCase ? 'false' : spec.upperFirst ? 'upper' : 'lower' });
  return (a, b) => spec.numeric && SORT_NUMBER.test(a) && SORT_NUMBER.test(b) ? Number(a) - Number(b) || coll.compare(a, b) : coll.compare(a, b);
}

// What duplicates are compared by: trimmed when asked, case folded when ignored.
const sortSame = (spec, s) => { const t = spec.dupsTrim ? s.trim() : s; return spec.ignoreCase ? t.toLocaleLowerCase() : t; };

// The items (each { keys, dup, empty }) left after removing empty ones and duplicates (the first stays), sorted:
// their indexes. compare(k, a, b): key k of two items, the direction included.
function sortOrder(items, spec, count, compare) {
  const seen = new Set(), left = [];
  items.forEach((item, i) => {
    if (spec.empty && item.empty) return;
    if (spec.dups) { const d = sortSame(spec, item.dup); if (seen.has(d)) return; seen.add(d); }
    left.push(i);
  });
  return left.sort((x, y) => {
    for (let k = 0; k < count; k++) { const c = compare(k, items[x], items[y]); if (c) return c; }
    return x - y;   // stable
  });
}

// Lines sorted as text. box: a block ({ left, right }, visual columns from 0): only each line's part in it moves, the
// keys counted from its left edge. Gives the new lines (fewer when lines were removed; a block keeps the count, the
// removed parts emptied at the bottom).
function sortTextLines(lines, spec, stops, box = null) {
  const cmp = sortComparer(spec), keys = spec.keys;
  const items = lines.map(text => {
    const vis = visualText(text, stops), part = box ? vis.slice(box.left, box.right) : vis;
    const piece = box ? text.slice(textCh(text, box.left, stops), textCh(text, box.right, stops)) : text;
    const ks = keys.map(k => part.slice(k.from - 1, k.to ?? undefined));
    return { text, piece, keys: ks, dup: spec.dupsWhole ? part : ks.join('\u0001'), empty: !part.trim() };
  });
  const order = sortOrder(items, spec, keys.length, (k, a, b) => { const c = cmp(a.keys[k], b.keys[k]); return keys[k].desc ? -c : c; });
  if (!box) return order.map(i => items[i].text);
  const pieces = order.map(i => items[i].piece), width = box.right - box.left;
  return lines.map((text, r) => {
    const p = pieces[r] ?? '', toCh = textCh(text, box.right, stops), rest = text.slice(toCh);
    let before = text.slice(0, textCh(text, box.left, stops));
    const short = box.left - textColumn(text, text.length, stops);   // the line ends before the block
    if (short > 0 && p) before += ' '.repeat(short);
    // A piece with text after it is filled up to the block's width (the rest stays in its column); at the line's
    // end it is not.
    return before + (rest ? p + ' '.repeat(Math.max(0, width - visualText(p, stops).length)) : p) + rest;
  });
}

// A CSV field's value for its column's type: { empty } or { ok, v, s }.
function csvSortValue(s, col) {
  if (!s.trim()) return { empty: true, s };
  const type = col?.type ?? 'text';
  if (type === 'integer' || type === 'decimal') { const n = csvNumber(s, col); return { ok: n !== null, v: n, s }; }
  if (type === 'date') {
    const d = csvDate(s, col.pattern);
    return { ok: !!d, v: d ? ((((d.y * 12 + d.M) * 31 + d.d) * 24 + d.H) * 60 + d.m) * 60 + d.s : null, s };
  }
  if (type === 'boolean') { const t = s.trim(); const v = /^(true|yes|1)$/i.test(t) ? 1 : /^(false|no|0)$/i.test(t) ? 0 : null; return { ok: v !== null, v, s }; }
  return { ok: true, v: s, s, text: true };
}

// Which column a By columns key means in this file: its header name when the file has it, else its index; -1: none.
function csvSortColumn(key, read) {
  const byName = key.name && read.names ? read.names.findIndex(n => n.trim().toLowerCase() === key.name.trim().toLowerCase()) : -1;
  if (byName >= 0) return byName;
  return Number.isInteger(key.index) && key.index >= 0 && key.index < read.columns ? key.index : -1;
}

// A CSV's records sorted by columns: only the records that the lines [fromLine, toLine] touch (all: null). Gives
// { start, end, text } (offsets in text: the part replaced) or { problem }.
function sortCsvRecords(text, def, spec, fromLine = null, toLine = null) {
  const read = csvRead(text, def), cmp = sortComparer(spec);
  const cols = spec.columns.map(k => csvSortColumn(k, read));
  if (cols.some(c => c < 0)) return { problem: `Column ${spec.columns[cols.findIndex(c => c < 0)].name ?? spec.columns[cols.findIndex(c => c < 0)].index + 1} is not in this file.` };
  // Each record's first and last line, to see which a selection touches.
  const lineAt = [];
  let line = 0, at = 0;
  const lineOf = offset => { while (at < offset) { if (text[at] === '\n') line++; at++; } return line; };
  read.rows.forEach((r, i) => { const end = (read.rows[i + 1]?.start ?? text.length) - 1; lineAt.push([lineOf(r.start), lineOf(Math.max(r.start, end))]); });
  let first = 0, last = read.rows.length - 1;
  if (fromLine !== null) {
    first = lineAt.findIndex(([a, b]) => b >= fromLine && a <= toLine);
    if (first < 0) return { problem: 'The selection holds no records.' };
    last = first;
    while (last + 1 < read.rows.length && lineAt[last + 1][0] <= toLine) last++;
  }
  if (last < first) return { problem: 'The file has no records.' };
  const start = read.rows[first].start, end = read.rows[last + 1]?.start ?? text.length;
  const segs = [], items = [];
  for (let i = first; i <= last; i++) {
    const r = read.rows[i], seg = text.slice(r.start, read.rows[i + 1]?.start ?? text.length).replace(/\n$/, '');
    segs.push(seg);
    const fields = r.fields.map(f => f.text);
    items.push({ values: cols.map(c => csvSortValue(fields[c] ?? '', def.columns[c])),
      dup: spec.dupsWhole ? fields.join('\u0001') : cols.map(c => fields[c] ?? '').join('\u0001'), empty: fields.every(f => !f.trim()) });
  }
  const order = sortOrder(items, spec, cols.length, (k, a, b) => {
    const x = a.values[k], y = b.values[k], desc = spec.columns[k].desc;
    if (x.empty || y.empty) return (x.empty ? 1 : 0) - (y.empty ? 1 : 0);   // empty last, either way
    if (x.ok !== y.ok) return x.ok ? -1 : 1;   // what does not read as its type after what does
    const c = x.ok && !x.text ? (x.v > y.v ? 1 : x.v < y.v ? -1 : 0) : cmp(x.s, y.s);
    return desc ? -c : c;
  });
  return { start, end, text: order.map(i => segs[i]).join('\n') + (text.slice(start, end).endsWith('\n') ? '\n' : '') };
}

// ---------- What is sorted ----------
// The active document's part to sort: { doc, cd (its text in the editor showing it: that editor's own linked copy,
// which has its selection; null when not shown in one), cm, kind: 'lines' (from, to: line numbers) or 'block' (top,
// bottom, left, right) }; nothing selected: every line.
function sortTarget(pane = editorPane(), doc = activeDoc()) {
  if (!doc) return null;
  const cm = pane?.cm && pane.active?.doc === doc ? pane.cm : null, cd = cm ? cm.getDoc() : doc.cmDoc ?? null;
  const b = cm ? blockOf(cm) : null;
  if (b) { const box = blockBox(b); if (box.right > box.left) return { doc, cd, cm, kind: 'block', ...box }; }
  if (!cd) return { doc, cd, cm, kind: 'lines', from: null, to: null };
  const sels = cd.listSelections().filter(r => !r.empty());
  if (!sels.length) return { doc, cd, cm, kind: 'lines', from: 0, to: cd.lastLine(), all: true };
  let from = Infinity, to = -1;
  for (const r of sels) {
    const a = r.from(), z = r.to();
    from = Math.min(from, a.line);
    to = Math.max(to, z.ch === 0 && z.line > a.line ? z.line - 1 : z.line);   // ending at a line's start: not that line
  }
  return { doc, cd, cm, kind: 'lines', from, to };
}

// The selection widened to the whole lines it touches (3.1), so it shows what is sorted.
function widenSelection(t) {
  if (t.kind !== 'lines' || t.all || !t.cd) return;
  t.cd.setSelection(CodeMirror.Pos(t.from, 0), CodeMirror.Pos(t.to, t.cd.getLine(t.to).length));
}

const sortIsCsv = doc => doc?.language === 'csv' && !!doc.csvDef;

// The sort applied to the target: { from, to (offsets), text } to put in, or { problem }.
function sortResult(t, spec) {
  if (spec.kind === 'columns') {
    if (!sortIsCsv(t.doc)) return { problem: 'This file has no columns: sort it as text.' };
    const text = docText(t.doc).replace(/\r\n?/g, '\n');
    const r = sortCsvRecords(text, t.doc.csvDef, spec, t.kind === 'lines' && !t.all ? t.from : null, t.kind === 'lines' && !t.all ? t.to : null);
    return r.problem ? r : { from: r.start, to: r.end, text: r.text };
  }
  const problem = sortKeysProblem(spec, t);
  if (problem) return { problem };
  const cd = t.cd, stops = t.cm ? stopsOf(t.cm) : { tab: 4, indent: 2, useTabs: false };
  if (!cd) return { problem: 'Show the file in its editor to sort it as text.' };
  const top = t.kind === 'block' ? t.top : t.from, bottom = t.kind === 'block' ? t.bottom : t.to;
  const lines = [];
  for (let l = top; l <= bottom; l++) lines.push(cd.getLine(l));
  const out = sortTextLines(lines, spec, stops, t.kind === 'block' ? { left: t.left, right: t.right } : null);
  return { from: cd.indexFromPos(CodeMirror.Pos(top, 0)), to: cd.indexFromPos(CodeMirror.Pos(bottom, cd.getLine(bottom).length)),
    text: out.join('\n'), lines: out, top };
}

// A key's From / To that does not fit: why, or null.
function sortKeysProblem(spec, t) {
  const width = t?.kind === 'block' ? t.right - t.left : Infinity;
  for (const [i, k] of spec.keys.entries()) {
    if (!Number.isInteger(k.from) || k.from < 1) return `Key ${i + 1}: From is a column from 1.`;
    if (k.to !== null && (!Number.isInteger(k.to) || k.to < k.from)) return `Key ${i + 1}: To is never before From.`;
    if (k.from > width || (k.to ?? 0) > width) return `Key ${i + 1}: the block is ${width} columns wide.`;
  }
  return null;
}

// Puts the result in: one undo step; the sorted text selected (a block: the block again).
async function sortApply(t, spec) {
  const r = sortResult(t, spec);
  if (r.problem) { toast(r.problem); return false; }
  let cd = t.cd;
  if (!cd) {   // a CSV shown as its column view only: the editor holds the undo step
    await setMode('split');
    cd = t.doc.cmDoc;
    if (!cd) return false;
  }
  const from = cd.posFromIndex(r.from), to = cd.posFromIndex(r.to);
  if (cd.getRange(from, to) === r.text) { toast('Already in this order.', true); return true; }
  cd.replaceRange(r.text, from, to, '+sort');
  if (t.kind === 'block' && t.cm) setBlock(t.cm, { line: t.top, col: t.left }, { line: t.bottom, col: t.right });
  else if (!t.all) cd.setSelection(from, cd.posFromIndex(r.from + r.text.length));
  return true;
}

// ---------- The actions ----------
// Sorts at once: a stored sort by its name (as stored, or every key ascending / descending), else one key, the whole
// line (a CSV: its first column), the default options.
async function sortNow(name, direction = null) {
  const pane = editorPane(), doc = activeDoc(), tab = activeTab();
  if (!doc || !tab) return;
  if (!editable(tab)) return toast('This tab is read-only.');
  let spec;
  if (name) {
    spec = await host('sortGet', { name }).catch(() => null);
    if (!spec) return toast(`There is no stored sort "${name}".`);
    spec = sortFill(spec);
  } else spec = { ...sortDefault(), kind: sortIsCsv(doc) ? 'columns' : 'text' };
  if (direction) for (const k of [...spec.keys, ...spec.columns]) k.desc = direction === 'desc';
  const t = sortTarget(pane, doc);
  widenSelection(t);
  await sortApply(sortTarget(pane, doc), spec);
}

appAction('edit.sortWindow', { title: 'Sort...', hint: 'The Sort panel: keys (From / To, or a CSV\'s columns), options, a preview; stored sorts', group: 'edit',
  enabled: () => !!activeDoc(), run: () => openSortPane() });
appAction('edit.sort', { title: 'Sort', hint: 'Sorts the selected lines (a block: its part; nothing selected: the file) at once; with a stored sort\'s name: that sort',
  group: 'edit', enabled: () => !!activeDoc(), run: ([name] = []) => sortNow(name) });
appAction('edit.sortAsc', { title: 'Sort ascending', hint: 'As Sort, every key A to Z (also a stored sort\'s, with its name)', group: 'edit',
  enabled: () => !!activeDoc(), run: ([name] = []) => sortNow(name, 'asc') });
appAction('edit.sortDesc', { title: 'Sort descending', hint: 'As Sort, every key Z to A (also a stored sort\'s, with its name)', group: 'edit',
  enabled: () => !!activeDoc(), run: ([name] = []) => sortNow(name, 'desc') });

// ---------- The panel (sort.html, sort-pane.js) ----------
// A panel as the others (View > Panels): docked in the window's dock areas (at the right the first time) or floating;
// hidden at first. It serves the active document: what it sorts (the selection, a block, the file) follows the
// editor, and the preview with it. While it is shown, the ruler shows a text sort's keys. The page shows what is sent
// here (sortState) and tells what is done there (fromSortPane).
let sortChannel = null, sortView = null;
const sortUi = { spec: null, doc: null, name: null, changed: false, focusKey: 0, page: 'sort', list: [], storedAt: 0, timer: 0, target: null };
const sortShown = () => !!sortChannel && (sortChannel.floating || !!sortView?.offsetParent);
const sortRulerWanted = () => sortShown() && sortUi.spec?.kind === 'text';
const sortList = () => sortUi.spec.kind === 'columns' ? sortUi.spec.columns : sortUi.spec.keys;

// The marks on the ruler and in the text for an editor pane: [{ col (a boundary, visual columns from 0), colour,
// num, side ('from' | 'to' | 'one'), strong }].
function sortMarks(pane) {
  const t = sortUi.target;
  if (!sortRulerWanted() || !t?.cm || pane.cm !== t.cm) return [];
  const base = t.kind === 'block' ? t.left : 0, marks = [];
  sortUi.spec.keys.forEach((k, i) => {
    if (!Number.isInteger(k.from) || k.from < 1) return;
    const colour = sortColour(i), num = i + 1, strong = i === sortUi.focusKey, from = base + k.from - 1;
    const to = k.to !== null && Number.isInteger(k.to) && k.to >= k.from ? base + k.to : null;
    if (to !== null && to - from <= 2) marks.push({ col: from, end: to, colour, num, side: 'one', strong });
    else {
      marks.push({ col: from, colour, num, side: 'from', strong });
      if (to !== null) marks.push({ col: to, colour, num, side: 'to', strong });
    }
  });
  return marks;
}

// White or black, whichever reads best on a theme colour.
function sortTextOn(colour) {
  const probe = document.createElement('span');
  probe.style.color = colour;
  document.body.append(probe);
  const [r, g, b] = (getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) ?? [0, 0, 0]).map(Number);
  probe.remove();
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? '#000' : '#fff';
}

function sortRedrawRuler() {
  applyRuler();   // shown while the panel is (rulerShown), hidden again after
  for (const pane of panes) if (pane.cm) drawRuler(pane);
}

// The key columns' headers in the CSV column view, in their keys' colours with their numbers.
function sortMarkCsvHeads() {
  for (const el of document.querySelectorAll('.mm-sort-head')) { el.classList.remove('mm-sort-head'); el.style.removeProperty('--sort-colour'); el.style.removeProperty('--sort-text'); delete el.dataset.sortNum; }
  const t = sortUi.target;
  if (!sortShown() || sortUi.spec?.kind !== 'columns' || !sortIsCsv(t?.doc)) return;
  const read = csvRead(docText(t.doc).replace(/\r\n?/g, '\n'), t.doc.csvDef);
  sortUi.spec.columns.forEach((k, i) => {
    const c = csvSortColumn(k, read);
    for (const el of document.querySelectorAll(`.mm-csv-head .mm-csv-cell[data-c="${c}"]`)) {
      el.classList.add('mm-sort-head');
      el.style.setProperty('--sort-colour', sortColour(i));
      el.style.setProperty('--sort-text', sortTextOn(sortColour(i)));
      el.dataset.sortNum = (el.dataset.sortNum ? el.dataset.sortNum + ',' : '') + (i + 1);
    }
  });
}

// What the target is, in words.
function sortTargetText(t) {
  if (t.kind === 'block') return `a block of ${t.bottom - t.top + 1} lines x ${t.right - t.left} columns`;
  if (t.all || t.from === null) return 'the whole file';
  return t.from === t.to ? `line ${t.from + 1}` : `lines ${t.from + 1} to ${t.to + 1}`;
}

// A short line of what a sort does (the stored sorts' list).
function sortDescription(spec) {
  const dir = k => k.desc ? 'Z to A' : 'A to Z';
  if (spec.kind === 'columns') return 'Columns: ' + spec.columns.map(k => `${k.name ?? `column ${k.index + 1}`} ${dir(k)}`).join(', ');
  return 'Text: ' + spec.keys.map(k => `${k.from}-${k.to ?? ''} ${dir(k)}`).join(', ');
}

const sortEsc = s => escapeHtml(String(s ?? ''));

// The first lines of the result, the keys' parts in their colours (a CSV: the header line above its records).
function sortPreviewHtml(r, t) {
  const spec = sortUi.spec, max = 60;
  if (spec.kind === 'columns') {
    const read = csvRead(docText(t.doc).replace(/\r\n?/g, '\n'), t.doc.csvDef);
    const head = read.pre.map(p => `<span class="sp-dim">${sortEsc(p.text)}</span>`);
    return [...head, ...r.text.split('\n').slice(0, max).map(sortEsc)].join('\n');
  }
  const stops = t.cm ? stopsOf(t.cm) : { tab: 4, indent: 2, useTabs: false };
  const base = t.kind === 'block' ? t.left : 0;
  return r.lines.slice(0, max).map(line => {
    const vis = visualText(line, stops), colours = new Array(vis.length).fill(null);
    spec.keys.forEach((k, i) => {
      const a = base + k.from - 1, z = k.to === null ? (t.kind === 'block' ? t.right : vis.length) : base + k.to;
      for (let c = Math.max(0, a); c < Math.min(z, vis.length); c++) colours[c] ??= sortColour(i);
    });
    let out = '', c = 0;
    while (c < vis.length) {
      let e = c + 1;
      while (e < vis.length && colours[e] === colours[c]) e++;
      const s = sortEsc(vis.slice(c, e));
      out += colours[c] ? `<span style="background:color-mix(in srgb, ${colours[c]} 30%, transparent)">${s}</span>` : s;
      c = e;
    }
    return out;
  }).join('\n');
}

const sortTabText = () => `Sort${sortUi.name ? `: ${sortUi.name}${sortUi.changed ? ' (changed)' : ''}` : ''}`;

// Everything the page shows. focusAt: where its focus goes ('grip' of the focused key, 'list'); else the field it was in.
function sortState(focusAt = null) {
  const doc = activeDoc();
  sortUi.spec ??= sortDefault();
  if (!doc) return { kind: 'sort', doc: null, tab: sortTabText(), page: sortUi.page, spec: sortUi.spec, list: [], colours: [] };
  const csv = sortIsCsv(doc);
  if (doc !== sortUi.doc) {   // another document: a CSV by its columns first, any other as text
    sortUi.doc = doc;
    sortUi.spec.kind = csv ? 'columns' : 'text';
    sortUi.focusKey = 0;
  }
  if (!csv) sortUi.spec.kind = 'text';
  const spec = sortUi.spec, t = sortUi.target = sortTarget();
  let names = [], cols = [];
  if (csv) {
    const read = csvRead(docText(doc).replace(/\r\n?/g, '\n'), doc.csvDef);
    names = Array.from({ length: read.columns }, (_, c) => csvName(read, doc.csvDef, c));
    cols = spec.columns.map(k => csvSortColumn(k, read));
  }
  const r = sortResult(t, spec);
  sortMarkCsvHeads();
  return { kind: 'sort', doc: docName(doc), target: sortTargetText(t), csv, page: sortUi.page, spec, names, cols,
    colours: sortList().map((_, i) => ({ bg: sortColour(i), fg: sortTextOn(sortColour(i)) })),
    name: sortUi.name, changed: sortUi.changed, focusKey: sortUi.focusKey, tab: sortTabText(),
    problem: r.problem ?? null, preview: r.problem ? '' : sortPreviewHtml(r, t),
    list: sortUi.list.map(e => ({ name: e.name, desc: sortDescription(sortFill(e.sort)), off: e.sort?.kind === 'columns' && !csv })),
    storedAt: sortUi.storedAt, focusAt };
}

const sortSend = focusAt => { if (sortShown()) sortChannel.send(sortState(focusAt)); };

// The editor moved on (a selection, another document, an edit): what is sorted and the preview follow, a moment after
// the last change (app.js updateStatus).
function tellSortPane() {
  if (!sortShown()) return;
  clearTimeout(sortUi.timer);
  sortUi.timer = setTimeout(() => {
    if (activeDoc() !== sortUi.doc || sortUi.page !== 'sort') return sortSend();
    const t = sortUi.target = sortTarget(), r = sortResult(t, sortUi.spec);
    sortChannel.send({ kind: 'sortPreview', preview: r.problem ? '' : sortPreviewHtml(r, t), problem: r.problem ?? null,
      target: sortTargetText(t), tab: sortTabText() });
    sortMarkCsvHeads();
    for (const pane of panes) if (pane.cm) drawRuler(pane);
  }, 150);
}

// Edit > Sort...: the selection widened to whole lines (so it shows what is sorted), the panel shown and its focus.
async function openSortPane() {
  const doc = activeDoc(), tab = activeTab();
  if (!doc || !tab) return;
  if (!editable(tab)) return toast('This tab is read-only.');
  if (doc.language === 'csv' && !doc.csvDef) await csvLoad(doc, docText(doc));
  widenSelection(sortTarget());
  sortUi.page = 'sort';
  if (dockModel().state.sort === 'floating') sortChannel.float();
  else showDockPane('sort');
  sortSend();
  sortRedrawRuler();
  setTimeout(() => { sortChannel.focus(); sortChannel.send({ kind: 'focus' }); }, 100);
}

// A change made in the panel: kept, marked as changed; drawn again (sent: true), else only the preview follows.
function sortChanged(send = true, focusAt = null) {
  sortUi.changed = true;
  if (send) sortSend(focusAt);
  else tellSortPane();
  for (const pane of panes) if (pane.cm) drawRuler(pane);
}

async function sortStoredList() {
  sortUi.list = (await host('sorts').catch(() => null))?.list ?? sortUi.list;
  sortUi.storedAt = Math.max(0, Math.min(sortUi.storedAt, sortUi.list.length - 1));
}

async function fromSortPane(m) {
  const spec = sortUi.spec ??= sortDefault(), list = sortList();
  switch (m.kind) {
    case 'escape': return events.toolEscape();
    case 'set': {
      const { f, k, value } = m;
      if (f === 'from' || f === 'to') {
        const v = String(value).trim();
        spec.keys[k][f] = v === '' ? (f === 'to' ? null : NaN) : /^\d+$/.test(v) ? +v : NaN;
        return sortChanged(false);
      }
      if (f === 'kind') { spec.kind = value; sortUi.focusKey = 0; sortChanged(); return sortRedrawRuler(); }
      if (f === 'desc') list[k].desc = !!value;
      else if (f === 'upperFirst') spec.upperFirst = !!value;
      else if (f === 'column') {
        const read = csvRead(docText(activeDoc()).replace(/\r\n?/g, '\n'), activeDoc().csvDef), c = +value;
        spec.columns[k] = { ...spec.columns[k], index: c, name: read.names?.[c] ?? null };
      } else spec[f] = !!value;
      return sortChanged();
    }
    case 'focusKey':
      sortUi.focusKey = m.k;
      for (const pane of panes) if (pane.cm) drawRuler(pane);
      return;
    case 'add': {
      const last = list.at(-1);
      if (spec.kind === 'columns') {   // the next column, by its name
        const read = csvRead(docText(activeDoc()).replace(/\r\n?/g, '\n'), activeDoc().csvDef);
        const index = Math.max(0, Math.min((last?.index ?? -1) + 1, read.columns - 1));
        list.push({ name: read.names?.[index] ?? null, index, desc: false });
      } else list.push({ from: (Number.isFinite(last?.to) ? last.to : Number.isFinite(last?.from) ? last.from : 0) + 1, to: null, desc: false });
      sortUi.focusKey = list.length - 1;
      return sortChanged(true, 'grip');
    }
    case 'del':
      if (list.length < 2) return;
      list.splice(m.k, 1);
      sortUi.focusKey = Math.min(m.k, list.length - 1);
      return sortChanged(true, 'grip');
    case 'move':
      if (m.to < 0 || m.to >= list.length || m.from === m.to) return;
      list.splice(m.to, 0, list.splice(m.from, 1)[0]);
      sortUi.focusKey = m.to;
      return sortChanged(true, 'grip');
    case 'page':
      sortUi.page = m.page;
      if (m.page === 'stored') await sortStoredList();
      return sortSend(m.page === 'stored' ? 'list' : null);
    case 'storedAt': sortUi.storedAt = m.i; return sortSend('list');
    case 'apply': {
      const s = sortCopy(spec);
      if (!await sortApply(sortTarget(), s)) return;
      host('sortLast', { sort: s }).catch(() => {});
      return sortSend();
    }
    case 'save': return sortSave(sortUi.name);
    case 'saveAs': return sortSaveAs();
    case 'select': return sortSelectStored();
    case 'deleteStored': return sortDeleteStored();
  }
}

// Save: under the name it was selected as. Save as: a name asked; one that exists asks whether to replace it.
async function sortSave(name) {
  if (!name) return;
  await host('sortSave', { name, sort: sortCopy(sortUi.spec) });
  await sortStoredList();
  Object.assign(sortUi, { name, changed: false });
  sortSend();
  toast(`Sort "${name}" stored.`, true);
}

async function sortSaveAs() {
  await sortStoredList();
  const name = await askName('Store this sort as', sortUi.name ?? '', 'A name');
  sortChannel.focus();
  if (!name) return;
  const same = sortUi.list.find(e => e.name.toLowerCase() === name.toLowerCase());
  if (same && !await confirmBox(`A stored sort "${same.name}" exists. Replace it?`, 'Replace')) return;
  await sortSave(name);
}

function sortSelectStored() {
  const e = sortUi.list[sortUi.storedAt];
  if (!e || (e.sort?.kind === 'columns' && !sortIsCsv(activeDoc()))) return;
  sortUi.spec = sortFill(sortCopy(e.sort));
  Object.assign(sortUi, { name: e.name, changed: false, focusKey: 0, page: 'sort' });
  sortSend();
  sortRedrawRuler();
}

async function sortDeleteStored() {
  const e = sortUi.list[sortUi.storedAt];
  if (!e || !await confirmBox(`Delete the stored sort "${e.name}"?`, 'Delete')) return;
  await host('sortDelete', { name: e.name });
  await sortStoredList();
  if (sortUi.name?.toLowerCase() === e.name.toLowerCase()) sortUi.name = null;
  sortSend('list');
}

function registerSortPane() {
  const view = sortView = Object.assign(document.createElement('div'), { className: 'mm-tool-view' });
  $('.mm-dock-hold').append(view);
  sortChannel = paneChannel({ id: 'sort', page: 'sort.html', title: 'Sort', view: () => view,
    state: () => new Map([['look', paneLook()], ['title', { kind: 'title', text: 'Sort' }], ['sort', sortState()]]),
    receive: fromSortPane,
    onFloat: () => { setDockFloating('sort', true); sortRedrawRuler(); },
    onDock: () => { if (sortUi.back) { sortUi.back = false; setDockFloating('sort', false); } sortRedrawRuler(); } });
  registerDockPane('sort', { title: 'Sort', view, home: 'right', startHidden: true,
    focus: () => sortChannel.focus(),
    leave: m => { if (m.state.sort === 'floating') sortChannel.back(); m.state.sort = 'hidden'; },
    sync: () => { if (dockShown(dockModel(), 'sort') && !sortChannel.frame) sortChannel.send(sortState()); setTimeout(sortRedrawRuler); },
    channel: { get floating() { return sortChannel.floating; }, float: opts => sortChannel.float(opts),
      back: () => { sortUi.back = true; sortChannel.back(); } } });
  // The sort it opens with: the last one applied; the stored sorts.
  host('sorts').then(s => { sortUi.list = s?.list ?? []; if (s?.last) sortUi.spec = sortFill(s.last); }).catch(() => {});
}
