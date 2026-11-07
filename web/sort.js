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
// With case not ignored, the order of capitals and small letters (stated for A to Z): paired per letter, or each
// case as a group.
const SORT_CASE_ORDERS = ['AaBbCc', 'aAbBcC', 'ABCabc', 'abcABC'];

// A sort: As text (keys: From / To, 1-based, To null: to the end) or By columns (columns: a header name and a
// 0-based index); each key its own direction; the options for all keys.
const sortDefault = () => ({ kind: 'text', keys: [{ from: 1, to: null, desc: false }], columns: [{ name: null, index: 0, desc: false }],
  ignoreCase: true, caseOrder: 'AaBbCc', numeric: false, decimal: '.', numIgnore: ', ', dups: false, dupsWhole: false, dupsTrim: false, empty: false });
const sortCopy = spec => JSON.parse(JSON.stringify(spec));
// A stored or remembered sort completed with what it lacks (an older or hand-made one).
function sortFill(spec) {
  const out = { ...sortDefault(), ...(spec ?? {}) };
  if (!Array.isArray(out.keys) || !out.keys.length) out.keys = sortDefault().keys;
  if (!Array.isArray(out.columns) || !out.columns.length) out.columns = sortDefault().columns;
  if (!SORT_CASE_ORDERS.includes(spec?.caseOrder)) out.caseOrder = spec?.upperFirst === false ? 'aAbBcC' : 'AaBbCc';
  delete out.upperFirst;
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
  const order = spec.ignoreCase ? null : spec.caseOrder;
  const coll = new Intl.Collator(undefined, { numeric: !!spec.numeric, sensitivity: order ? 'variant' : 'accent',
    caseFirst: !order ? 'false' : order[0] === 'A' ? 'upper' : 'lower' });
  const text = order === 'ABCabc' || order === 'abcABC' ? sortGrouped(coll, order[0] === 'A', !!spec.numeric) : coll.compare;
  if (!spec.numeric) return text;
  return (a, b) => { const x = sortNumberOf(spec, a), y = sortNumberOf(spec, b); return isNaN(x) || isNaN(y) ? text(a, b) : x - y || text(a, b); };
}

// A key's text as a number by the options (its decimal sign, the characters ignored, such as a thousands
// separator), else NaN; a point that is neither makes it no number.
function sortNumberOf(spec, s) {
  const dec = spec.decimal || '.', skip = spec.numIgnore ?? '';
  let t = '';
  for (const c of s) t += c === dec ? '.' : skip.includes(c) ? '' : c === '.' ? 'x' : c;
  return SORT_NUMBER.test(t) ? Number(t) : NaN;
}

// Capitals as a group before (or after) the small letters: compared position by position, a capital against a small
// letter by its case alone, anything else by the collator (a run of digits as one part with Numbers by value).
function sortGrouped(coll, upperFirst, numeric) {
  const part = numeric ? /\d+|[^]/gu : /[^]/gu;
  const rank = c => c !== c.toLocaleLowerCase() ? 0 : c !== c.toLocaleUpperCase() ? 1 : -1;
  return (a, b) => {
    const pa = a.match(part) ?? [], pb = b.match(part) ?? [];
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
      const x = pa[i], y = pb[i];
      if (x === y) continue;
      const rx = rank(x), ry = rank(y);
      if (rx >= 0 && ry >= 0 && rx !== ry) return upperFirst ? rx - ry : ry - rx;
      const d = coll.compare(x, y);
      if (d) return d;
    }
    return pa.length - pb.length || coll.compare(a, b);
  };
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
// removed parts emptied at the bottom). The result's order: which line (a block: which line's part) each one is.
function sortTextLines(lines, spec, stops, box = null) {
  const cmp = sortComparer(spec), keys = spec.keys;
  const items = lines.map(text => {
    const vis = visualText(text, stops), part = box ? vis.slice(box.left, box.right) : vis;
    const piece = box ? text.slice(textCh(text, box.left, stops), textCh(text, box.right, stops)) : text;
    const ks = keys.map(k => part.slice(k.from - 1, k.to ?? undefined));
    return { text, piece, keys: ks, dup: spec.dupsWhole ? part : ks.join('\u0001'), empty: !part.trim() };
  });
  const order = sortOrder(items, spec, keys.length, (k, a, b) => { const c = cmp(a.keys[k], b.keys[k]); return keys[k].desc ? -c : c; });
  if (!box) return Object.assign(order.map(i => items[i].text), { order });
  const pieces = order.map(i => items[i].piece), width = box.right - box.left;
  return Object.assign(lines.map((text, r) => {
    const p = pieces[r] ?? '', toCh = textCh(text, box.right, stops), rest = text.slice(toCh);
    let before = text.slice(0, textCh(text, box.left, stops));
    const short = box.left - textColumn(text, text.length, stops);   // the line ends before the block
    if (short > 0 && p) before += ' '.repeat(short);
    // A piece with text after it is filled up to the block's width (the rest stays in its column); at the line's
    // end it is not.
    return before + (rest ? p + ' '.repeat(Math.max(0, width - visualText(p, stops).length)) : p) + rest;
  }), { order });
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
// limit: only the first so many records (the preview); cut says some were left out.
function sortCsvRecords(text, def, spec, fromLine = null, toLine = null, limit = 0) {
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
  const cut = limit > 0 && last - first + 1 > limit;
  if (cut) last = first + limit - 1;
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
  // Where each record went (sortMovePlaces): its old place [a, b) and its new start n.
  let n = start;
  const pieces = order.map(i => { const a = read.rows[first + i].start, p = { a, b: a + segs[i].length, n }; n += segs[i].length + 1; return p; });
  return { start, end, text: order.map(i => segs[i]).join('\n') + (text.slice(start, end).endsWith('\n') ? '\n' : ''), cut, pieces };
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
// limit: only the first so many lines or records (the preview, sortPreviewLines); cut: some were left out.
function sortResult(t, spec, limit = 0) {
  if (spec.kind === 'columns') {
    if (!sortIsCsv(t.doc)) return { problem: 'This file has no columns: sort it as text.' };
    const text = docText(t.doc).replace(/\r\n?/g, '\n');
    const r = sortCsvRecords(text, t.doc.csvDef, spec, t.kind === 'lines' && !t.all ? t.from : null, t.kind === 'lines' && !t.all ? t.to : null, limit);
    return r.problem ? r : { from: r.start, to: r.end, text: r.text, cut: r.cut, pieces: r.pieces };
  }
  const problem = sortKeysProblem(spec, t);
  if (problem) return { problem };
  const cd = t.cd, stops = t.cm ? stopsOf(t.cm) : { tab: 4, indent: 2, useTabs: false };
  if (!cd) return { problem: 'Show the file in its editor to sort it as text.' };
  const top = t.kind === 'block' ? t.top : t.from, all = t.kind === 'block' ? t.bottom : t.to;
  const cut = limit > 0 && all - top + 1 > limit, bottom = cut ? top + limit - 1 : all;
  const lines = [];
  for (let l = top; l <= bottom; l++) lines.push(cd.getLine(l));
  const out = sortTextLines(lines, spec, stops, t.kind === 'block' ? { left: t.left, right: t.right } : null);
  const from = cd.indexFromPos(CodeMirror.Pos(top, 0));
  return { from, to: cd.indexFromPos(CodeMirror.Pos(bottom, cd.getLine(bottom).length)),
    text: out.join('\n'), lines: out, top, cut, pieces: () => sortTextPieces(lines, out, from, stops, t.kind === 'block' ? t : null) };
}

// Where each part of the text went (for the highlights, sortCarry): [{ a, b, n }], old offsets [a, b) now at n. A line
// moves whole; in a block each line keeps its text left and right of the block (moved by what the block part became)
// and the block part comes from the line in the order.
function sortTextPieces(lines, out, from, stops, box) {
  const pieces = [];
  const starts = [];
  for (let i = 0, at = from; i < lines.length; i++) { starts.push(at); at += lines[i].length + 1; }
  let n = from;
  out.forEach((line, r) => {
    if (!box) {
      const o = out.order[r];
      pieces.push({ a: starts[o], b: starts[o] + lines[o].length, n });
    } else {
      const text = lines[r], left = textCh(text, box.left, stops), right = textCh(text, box.right, stops), rest = text.length - right;
      pieces.push({ a: starts[r], b: starts[r] + left, n });
      pieces.push({ a: starts[r] + right, b: starts[r] + text.length, n: n + line.length - rest });
      const o = out.order[r];
      if (o !== undefined) {
        const src = lines[o], pa = textCh(src, box.left, stops), pb = textCh(src, box.right, stops);
        const short = box.left - textColumn(text, text.length, stops);
        pieces.push({ a: starts[o] + pa, b: starts[o] + pb, n: n + left + (short > 0 && pb > pa ? short : 0) });
      }
    }
    n += line.length + 1;
  });
  return pieces;
}

// ---------- The highlights go along ----------
// A sort replaces its text in one go, which takes the highlights' marks with it. So each highlight in it goes where its
// text went (pieces: a line, a CSV record, a block part): its marks cleared before the change (else an undo would
// bring the old ones back too), placed after it. One that crosses the edge of what is sorted (the selected lines, a
// block's side) or spans parts that no longer follow each other is split: a highlight per part, each with its note;
// parts that still follow each other stay one. One whose text went (a duplicate removed) goes as with deleted text.
// Gives what was done ([{ h, ha, hb, parts: [{ h, a, b }] }]), so Undo and Redo put back exactly what was there.
function sortCarry(doc, lo, hi, newLen, pieces) {
  if (typeof placedHls !== 'function' || !doc.hls?.loaded) return () => [];
  const text = docText(doc), delta = newLen - (hi - lo), carried = [];
  for (const h of placedHls(doc)) {
    const r = hlRange(doc, h);
    if (!r) continue;
    const ha = hlOffset(text, r.from), hb = hlOffset(text, r.to);
    if (hb <= lo || ha >= hi) continue;
    // Its parts, old [oa, ob) to new [a, b), in the old order; then those that still follow each other joined.
    const parts = [];
    if (ha < lo) parts.push({ oa: ha, ob: lo, a: ha, b: lo });
    for (const p of pieces) {
      const oa = Math.max(p.a, ha), ob = Math.min(p.b, hb);
      if (ob > oa) parts.push({ oa, ob, a: p.n + oa - p.a, b: p.n + ob - p.a });
    }
    if (hb > hi) parts.push({ oa: hi, ob: hb, a: hi + delta, b: hb + delta });
    parts.sort((x, y) => x.oa - y.oa);
    const joined = [];
    for (const q of parts) {
      const last = joined[joined.length - 1];
      if (last && q.oa - last.ob === q.a - last.b && q.a >= last.b) Object.assign(last, { ob: q.ob, b: q.b });
      else joined.push({ ...q });
    }
    clearHlMarks(h);
    carried.push({ h, ha, hb, parts: joined.map(({ a, b }) => ({ a, b })) });
  }
  return () => {
    const now = docText(doc), list = hlsOf(doc).list;
    // A part that starts or ends at a line break leaves it out (a highlight split at the edge of the sorted lines).
    for (const c of carried) {
      for (const q of c.parts) { while (q.b > q.a && now[q.b - 1] === '\n') q.b--; while (q.a < q.b && now[q.a] === '\n') q.a++; }
      c.parts = c.parts.filter(q => q.b > q.a);
    }
    for (const c of carried) c.parts.forEach((q, i) => {
      if (i === 0) { Object.assign(c.h, { from: hlPlace(now, q.a), to: hlPlace(now, q.b), markKey: null }); q.h = c.h; }
      else { q.h = describe(now, q.a, q.b, { id: ++hl.id, note: c.h.note, state: c.h.state ?? '' }); list.push(q.h); }
    });
    if (carried.length) changedHighlights(doc);
    return carried.filter(c => c.parts.length);
  };
}

// Undo / Redo of a sort: the highlights as they were before it (each whole again) or after it (its parts); one taken
// away meanwhile (none of its parts left) stays away. Marks cleared before the change, placed after it.
function sortPutBack(doc, carried, undo) {
  const list = hlsOf(doc).list, live = carried.filter(c => c.parts.some(q => list.includes(q.h)));
  for (const c of live) for (const q of c.parts) clearHlMarks(q.h);
  return () => {
    const now = docText(doc);
    for (const c of live) {
      for (const q of c.parts) { const i = list.indexOf(q.h); if (i >= 0) list.splice(i, 1); }
      const back = undo ? [{ h: c.h, a: c.ha, b: c.hb }] : c.parts;
      for (const q of back) { Object.assign(q.h, { from: hlPlace(now, q.a), to: hlPlace(now, q.b), markKey: null }); list.push(q.h); }
    }
    if (live.length) changedHighlights(doc);
  };
}

// The sorts done in a document, to put its highlights back on Undo and Redo: { lo, oldText, newText, carried } (the
// last few).
const SORT_MOVES_KEPT = 20;
function sortBeforeChange(pane, change) {
  const doc = pane.active?.doc;
  if (!doc?.sortMoves?.length || (change.origin !== 'undo' && change.origin !== 'redo')) return;
  const cd = pane.cm.getDoc(), a = cd.indexFromPos(change.from), b = cd.indexFromPos(change.to), text = change.text.join('\n');
  for (const m of doc.sortMoves) {
    if (a !== m.lo) continue;
    const undo = b === m.lo + m.newText.length && text === m.oldText, redo = b === m.lo + m.oldText.length && text === m.newText;
    if (undo || redo) return queueMicrotask(sortPutBack(doc, m.carried, undo));
  }
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
  const pieces = typeof r.pieces === 'function' ? r.pieces() : r.pieces, old = cd.getRange(from, to);
  const done = sortCarry(t.doc, r.from, r.to, r.text.length, pieces);
  cd.replaceRange(r.text, from, to, '+sort');
  const carried = done();
  (t.doc.sortMoves ??= []).unshift({ lo: r.from, oldText: old, newText: r.text, carried });
  t.doc.sortMoves.length = Math.min(t.doc.sortMoves.length, SORT_MOVES_KEPT);
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
// name: the stored sort it is (Save stores there); origin: the template a new sort started from (Revert goes back to it,
// Save does not change it).
const sortUi = { spec: null, doc: null, name: null, origin: null, changed: false, focusKey: 0, page: 'sort', list: [], storedAt: 0, timer: 0, target: null };
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
// sortPreviewLines: 0 is all of it.
const sortPreviewLimit = () => Number.isInteger(setting('sortPreviewLines')) && setting('sortPreviewLines') >= 0 ? setting('sortPreviewLines') : 100;
// sortPreviewWarn: a preview that takes this many seconds or longer says so, with the setting that makes it quicker
// (0: never).
const sortSlowMs = () => (Number.isFinite(setting('sortPreviewWarn')) && setting('sortPreviewWarn') >= 0 ? setting('sortPreviewWarn') : 2) * 1000;

// The preview sorted and drawn, timed: { r, preview, slow } (slow: the ms it took when at sortSlowMs or over, else 0).
function sortPreviewOf(t, spec) {
  const start = performance.now(), r = sortResult(t, spec, sortPreviewLimit()), preview = r.problem ? '' : sortPreviewHtml(r, t);
  const ms = performance.now() - start;
  const warn = sortSlowMs();
  return { r, preview, slow: warn > 0 && ms >= warn ? Math.round(ms) : 0 };
}

// The preview: the first lines sorted (sortPreviewLimit), the keys' columns in their colours; a note when cut.
function sortPreviewHtml(r, t) {
  const note = r.cut ? `\n<span class="sp-dim">(the first ${sortPreviewLimit()} ${sortUi.spec.kind === 'columns' ? 'records' : 'lines'} only; Apply sorts all)</span>` : '';
  return sortPreviewBody(r, t) + note;
}
// Each line says where its text is in the editor now (data-l: a double-click there puts the cursor on it).
function sortPreviewBody(r, t) {
  const spec = sortUi.spec, at = (l, html) => `<span data-l="${l}">${html}</span>`;
  if (spec.kind === 'columns') {
    const text = docText(t.doc).replace(/\r\n?/g, '\n'), read = csvRead(text, t.doc.csvDef);
    const head = read.pre.map((p, i) => at(i, `<span class="sp-dim">${sortEsc(p.text)}</span>`));
    const lines = [];
    for (const p of r.pieces ?? []) text.slice(p.a, p.b).split('\n').forEach((s, j) => lines.push(at(hlPlace(text, p.a)[0] + j, sortEsc(s))));
    return [...head, ...lines].join('\n');
  }
  const stops = t.cm ? stopsOf(t.cm) : { tab: 4, indent: 2, useTabs: false };
  const base = t.kind === 'block' ? t.left : 0;
  return r.lines.map((line, ri) => {
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
    return at(r.top + (r.lines.order[ri] ?? ri), out);   // a block: the line its part comes from
  }).join('\n');
}

// The sort as it is now kept as the last one (sorts.json `last`, not in the list), with the stored sort it came from
// and whether it was changed since, a moment after each change: LexPen opens with it again, and Save still stores it
// under that name. A stored sort itself is only written by Save or Save as.
function sortRemember() {
  clearTimeout(sortUi.rememberTimer);
  sortUi.rememberTimer = setTimeout(() => host('sortLast', { sort: { sort: sortCopy(sortUi.spec), name: sortUi.name, origin: sortUi.origin, changed: sortUi.changed } })
    .catch(() => {}), 300);
}

// Everything the page shows. focusAt: where its focus goes ('grip' of the focused key, 'list'); else the field it was in.
function sortState(focusAt = null) {
  const doc = activeDoc();
  sortUi.spec ??= sortDefault();
  if (!doc) return { kind: 'sort', doc: null, page: sortUi.page, spec: sortUi.spec, list: [], colours: [] };
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
  const { r, preview, slow } = sortPreviewOf(t, spec);
  sortMarkCsvHeads();
  return { kind: 'sort', doc: docName(doc), target: sortTargetText(t), csv, page: sortUi.page, spec, names, cols,
    colours: sortList().map((_, i) => ({ bg: sortColour(i), fg: sortTextOn(sortColour(i)) })),
    name: sortUi.name, origin: sortUi.origin, changed: sortUi.changed, focusKey: sortUi.focusKey,
    problem: r.problem ?? null, preview, slow, all: sortPreviewLimit() === 0,
    list: sortUi.list.map(e => ({ name: e.name, desc: sortDescription(sortFill(e.sort)), off: e.sort?.kind === 'columns' && !csv, template: !!e.template })),
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
    const t = sortUi.target = sortTarget(), { r, preview, slow } = sortPreviewOf(t, sortUi.spec);
    sortChannel.send({ kind: 'sortPreview', preview, slow, all: sortPreviewLimit() === 0, problem: r.problem ?? null,
      target: sortTargetText(t), name: sortUi.name, origin: sortUi.origin, changed: sortUi.changed });
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
  sortRemember();
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
      if (f === 'decimal' || f === 'numIgnore') { spec[f] = String(value); return sortChanged(false); }
      if (f === 'kind') { spec.kind = value; sortUi.focusKey = 0; sortChanged(); return sortRedrawRuler(); }
      if (f === 'desc') list[k].desc = !!value;
      else if (f === 'caseOrder') spec.caseOrder = value;
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
    case 'storedAt': sortUi.storedAt = m.i; return m.quiet ? undefined : sortSend('list');   // quiet: the page marked it itself
    case 'renameStored': return sortRenameStored(m.i ?? sortUi.storedAt);
    case 'pinStored': return sortPinStored(m.i ?? sortUi.storedAt, !!m.on);
    case 'editStored': return sortSelectStored(m.i ?? sortUi.storedAt, true);
    case 'apply': {
      const s = sortCopy(spec);
      if (!await sortApply(sortTarget(), s)) return;
      return sortSend();
    }
    case 'new': return sortNew();
    case 'revert': return sortRevert();
    case 'gotoLine': return sortGotoLine(m.line);
    case 'openSetting': return host('openSetting', { name: 'sortPreviewLines' });
    case 'save': return sortSave(sortUi.name);
    case 'saveAs': return sortSaveAs();
    case 'select': return sortSelectStored(m.i ?? sortUi.storedAt);
    case 'deleteStored': return sortDeleteStored();
  }
}

// New: a sort from the start (one key, the options as at first), no stored sort's name; a CSV by its first column.
function sortNew() {
  sortUi.spec = sortDefault();
  if (sortIsCsv(activeDoc())) sortUi.spec.kind = 'columns';
  Object.assign(sortUi, { name: null, origin: null, changed: false, focusKey: 0 });
  sortRemember();
  sortSend('grip');
  sortRedrawRuler();
}

// A double-click on a line of the preview: the cursor on that line in the editor (where its text is now).
async function sortGotoLine(line) {
  const doc = sortUi.target?.doc, pane = editorPane();
  if (!doc || pane?.active?.doc !== doc || !Number.isInteger(line)) return;
  if (pane.active.mode === 'preview' || !pane.cm) await setMode('split');
  goToLine(pane, line, true, true);
  pane.cm?.setCursor(CodeMirror.Pos(line, 0));
  focusPane(pane);
}

// Revert: the stored sort it is, or the template it started from, as stored (the changes since gone). Not an undo of
// Apply: the text stays as it is.
async function sortRevert() {
  const from = sortUi.name ?? sortUi.origin;
  if (!from) return;
  await sortStoredList();
  const e = sortUi.list.find(x => x.name.toLowerCase() === from.toLowerCase());
  if (!e) return toast(`The stored sort "${from}" is not there any more.`);
  sortUi.spec = sortFill(sortCopy(e.sort));
  if (sortUi.spec.kind === 'columns' && !sortIsCsv(activeDoc())) sortUi.spec.kind = 'text';
  Object.assign(sortUi, { changed: false, focusKey: 0 });
  sortRemember();
  sortSend('grip');
  sortRedrawRuler();
}

// Save: under the name it was selected as. Save as: a name asked; one that exists asks whether to replace it.
async function sortSave(name) {
  if (!name) return;
  await host('sortSave', { name, sort: sortCopy(sortUi.spec) });
  await sortStoredList();
  Object.assign(sortUi, { name, origin: null, changed: false });
  sortRemember();
  sortSend();
  toast(`Sort "${name}" stored.`, true);
}

async function sortSaveAs() {
  await sortStoredList();
  const name = await askName('Store this sort as', sortUi.name ?? '', 'A name');
  sortChannel.focus();
  if (!name) return;
  const same = sortUi.list.find(e => e.name.toLowerCase() === name.toLowerCase());
  if (same?.template) return toast(`"${same.name}" is a template: change it with Edit (right-click it on the Stored sorts tab).`);
  if (same && !await confirmBox(`A stored sort "${same.name}" exists. Save as overwrites it.`, 'Overwrite')) return;
  await sortSave(name);
}

// Select (double-click, Enter): a regular one to work on, Save storing it there again; a template is used as new (as
// New, with it as the start: no name, so Save cannot change it). edit: a template to work on (its Edit), as Select.
function sortSelectStored(i, edit = false) {
  const e = sortUi.list[i];
  if (!e || (e.sort?.kind === 'columns' && !sortIsCsv(activeDoc()))) return;
  sortUi.storedAt = i;
  sortUi.spec = sortFill(sortCopy(e.sort));
  const asNew = e.template && !edit;
  Object.assign(sortUi, { name: asNew ? null : e.name, origin: asNew ? e.name : null, changed: false, focusKey: 0, page: 'sort' });
  sortRemember();
  sortSend();
  sortRedrawRuler();
}

// Rename...: a name no other stored sort has (its own in another case is fine).
async function sortRenameStored(i) {
  const e = sortUi.list[i];
  if (!e) return;
  const name = await askName(`Rename the ${e.template ? 'template' : 'stored sort'} "${e.name}" to`, e.name, 'A name');
  sortChannel.focus();
  if (!name || name === e.name) return;
  const other = sortUi.list.find(x => x !== e && x.name.toLowerCase() === name.toLowerCase());
  if (other || !await host('sortRename', { from: e.name, to: name })) return toast(`A stored sort "${other?.name ?? name}" exists: choose another name.`);
  if (sortUi.name?.toLowerCase() === e.name.toLowerCase()) { sortUi.name = name; sortRemember(); }
  if (sortUi.origin?.toLowerCase() === e.name.toLowerCase()) { sortUi.origin = name; sortRemember(); }
  await sortStoredList();
  sortUi.storedAt = Math.max(0, sortUi.list.findIndex(x => x.name === name));
  sortSend('list');
}

// Pin as template / Unpin as template: the list puts the templates first.
async function sortPinStored(i, on) {
  const e = sortUi.list[i];
  if (!e) return;
  await host('sortTemplate', { name: e.name, on });
  await sortStoredList();
  sortUi.storedAt = Math.max(0, sortUi.list.findIndex(x => x.name === e.name));
  sortSend('list');
}

async function sortDeleteStored() {
  const e = sortUi.list[sortUi.storedAt];
  if (!e || !await confirmBox(`Delete the stored sort "${e.name}"?`, 'Delete')) return;
  await host('sortDelete', { name: e.name });
  await sortStoredList();
  if (sortUi.name?.toLowerCase() === e.name.toLowerCase()) { sortUi.name = null; sortRemember(); }
  if (sortUi.origin?.toLowerCase() === e.name.toLowerCase()) { sortUi.origin = null; sortRemember(); }
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
  // The sort it opens with: the last one (with the name of the stored sort it came from; an older file has the sort
  // alone); the stored sorts.
  host('sorts').then(s => {
    sortUi.list = s?.list ?? [];
    const last = s?.last;
    if (last?.sort) Object.assign(sortUi, { spec: sortFill(last.sort), name: last.name ?? null, origin: last.origin ?? null, changed: !!last.changed });
    else if (last) sortUi.spec = sortFill(last);
  }).catch(() => {});
}
