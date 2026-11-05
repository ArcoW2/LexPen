'use strict';
// The find bar on a CSV (csvview.js): in one column or all, by row (a row's columns left to right, then the next row)
// or by column (down a column, then the next one, in the order shown), from the current cell. In the column view a
// match is in a value as shown (its format); in the editor in the field's text as it is in the file. find.js hands a
// CSV here (csvFinding); the bar's own parts (the search, its switches, the count, the wrap) stay its. Replace (by line,
// over the whole text) waits for All columns, By row.

const csvFinding = pane => pane.active?.doc.language === 'csv' && !!pane.active.doc.csvDef && !!pane.find;

// The bar's column list and order button, shown for a CSV only; the list as the view shows the columns now.
function csvSyncFindBar(pane) {
  const bar = pane.find, on = csvFinding(pane);
  bar.csvColEl.hidden = bar.csvOrderEl.hidden = !on;
  if (!on) return;
  const doc = pane.active.doc, data = csvData(doc, docText(doc));
  const options = [['', 'All columns'], ...data.order.map(c => [String(c), csvName(data.read, data.def, c)])];
  if (!options.some(([v]) => v === (bar.csvCol ?? ''))) bar.csvCol = '';
  const html = options.map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('');
  if (bar.csvColEl.dataset.html !== html) { bar.csvColEl.innerHTML = html; bar.csvColEl.dataset.html = html; }
  bar.csvColEl.value = bar.csvCol ?? '';
  bar.csvOrder ??= 'row';
  bar.csvOrderEl.textContent = bar.csvOrder === 'row' ? 'By row' : 'By column';
  bar.csvOrderEl.title = bar.csvOrder === 'row' ? 'Each row left to right, then the next row (click: by column)'
    : 'Down each column, then the next column (click: by row)';
}

// Replace works by line on the whole text: only with All columns, By row.
const csvReplaceBlocked = pane => csvFinding(pane) && ((pane.find.csvCol ?? '') !== '' || pane.find.csvOrder === 'col');

// The matches in the chosen columns, in the chosen order: each [n, { row, col, s, e, at }]; n its place in that order
// (find.js compares matches by their first item), s / e the match in the value, `at` (the editor) its offset in the
// text. Kept per search and text.
function csvMatches(pane, regex, where) {
  const bar = pane.find, doc = pane.active.doc, data = csvData(doc, docText(doc));
  const key = [regex.source, regex.flags, where, bar.csvCol ?? '', bar.csvOrder].join('\u0001');
  if (bar.csvCache?.key === key && bar.csvCache.data === data) return bar.csvCache.matches;
  const { read, def, text } = data, place = csvPlaces(data);
  const cols = (bar.csvCol ?? '') === '' ? data.order : [+bar.csvCol];
  const found = [];
  read.rows.forEach((r, row) => {
    for (const col of cols) {
      const f = r.fields[col];
      if (!f || found.length >= FIND_LIMIT) continue;
      const value = where === 'editor' ? text.slice(f.start, f.end) : csvShow(f.text, def.columns[col]).text;
      for (const [s, e] of matchesIn(value, regex)) found.push({ row, col, p: place.get(col), s, e, at: where === 'editor' ? f.start + s : null });
    }
  });
  if (bar.csvOrder === 'col') found.sort((a, b) => a.p - b.p || a.row - b.row || a.s - b.s);
  const matches = found.map((m, n) => [n, m]);
  bar.csvCache = { key, data, matches };
  return matches;
}

// Each column's place in the view (the hidden ones too, at their place).
const csvPlaces = data => new Map(data.slots.map((c, i) => [c, i]));

// Before (< 0), at (0) or after (> 0) a place, in the chosen order.
function csvCompare(pane, a, b) {
  return pane.find.csvOrder === 'col' ? a.p - b.p || a.row - b.row || a.s - b.s : a.row - b.row || a.p - b.p || a.s - b.s;
}

// Where the search is now: the editor's cursor (its cell, and where in the field's text), or the column view's current
// match, else its current cell (from the cell's start), else the first row in view.
function csvHere(pane, where, end) {
  const tab = pane.active, data = csvData(tab.doc, docText(tab.doc)), place = csvPlaces(data);
  if (where === 'editor' && pane.cm) {
    const off = pane.cm.indexFromPos(pane.cm.getCursor(end ? 'to' : 'from')), at = csvAt(data, off);
    if (!at) return { row: -1, p: -1, s: 0 };
    const f = data.read.rows[at.row].fields[at.col];
    return { row: at.row, p: place.get(at.col), s: f ? off - f.start : 0 };
  }
  const cur = tab.csvFound;
  if (cur && tab.csvCur?.row === cur.row && tab.csvCur.col === cur.col) return { row: cur.row, p: place.get(cur.col), s: end ? cur.s + 1 : cur.s };
  if (tab.csvCur) return { row: tab.csvCur.row, p: place.get(tab.csvCur.col), s: 0 };
  return { row: Math.max(0, (tab.csv?.first ?? 0)), p: -1, s: 0 };
}

// find.js refresh: counted and marked, and (typing) to the first match from where the search started.
function csvRefresh(pane, regex, where, moving) {
  const bar = pane.find, matches = csvMatches(pane, regex, where);
  bar.marked = where + pane.active.id;
  csvMarks(pane, where, matches);
  if (moving && matches.length) csvGo(pane, regex, where, 1, true);
  else showCount(pane, matches, null);
}

function csvGo(pane, regex, where, dir, fromOrigin) {
  const bar = pane.find, tab = pane.active, matches = csvMatches(pane, regex, where);
  if (!matches.length) return notFound(pane, matches, fromOrigin);
  // Typing: from where this search started, in this part (the editor or the column view).
  if (fromOrigin) { if (bar.csvOrigin?.where !== where) bar.csvOrigin = { ...csvHere(pane, where, false), where }; }
  else bar.csvOrigin = null;
  let i;
  if (fromOrigin) i = matches.findIndex(([, m]) => csvCompare(pane, m, bar.csvOrigin) >= 0);
  else if (dir > 0) { const here = csvHere(pane, where, true); i = matches.findIndex(([, m]) => csvCompare(pane, m, here) >= 0); }
  else { const here = csvHere(pane, where, false); i = matches.findLastIndex(([, m]) => csvCompare(pane, m, here) < 0); }
  i = pickMatch(pane, matches, i, dir, fromOrigin);
  if (i < 0) return;
  const m = matches[i][1];
  tab.csvFound = m;
  if (where === 'editor' && pane.cm) {
    const cm = pane.cm, from = cm.posFromIndex(m.at), to = cm.posFromIndex(m.at + m.e - m.s);
    asFound(pane, () => cm.setSelection(from, to), fromOrigin && bar.origin != null ? 'quiet' : 'found');
    if (fromOrigin) bar.origin ??= m.at;
    pane.findCurrent?.clear();
    pane.findCurrent = cm.markText(from, to, { className: 'mm-find-current', startStyle: 'mm-find-current-start', endStyle: 'mm-find-current-end' });
    revealFound(cm, from, to);
  } else {
    csvSetCell(pane, m.row, m.col);
    csvMarkCurrent(pane);   // also when no rows were drawn anew
  }
  showCount(pane, matches, i);
}

// The marks: in the column view every cell with a match (drawn as the rows come into view) and the current match's
// text; in the editor each match (up to find.js's BOX_LIMIT).
function csvMarks(pane, where, matches) {
  const tab = pane.active;
  tab.csvHits = null;
  if (where === 'editor') {
    const cm = pane.cm;
    if (!cm) return;
    pane.findHits ??= [];
    if (matches.length <= BOX_LIMIT) cm.operation(() => {
      for (const [, m] of matches) pane.findHits.push(cm.markText(cm.posFromIndex(m.at), cm.posFromIndex(m.at + m.e - m.s), { className: 'cm-mm-find-hit' }));
    });
  } else tab.csvHits = new Set(matches.map(([, m]) => m.row + ':' + m.col));
  if (tab.csv) { tab.csv.first = -1; csvDraw(pane); }
}

// The current match's text in its cell (when that cell is drawn), as the find bar marks it elsewhere.
function csvMarkCurrent(pane) {
  const tab = pane.active, m = tab?.csvFound;
  if (!m || !pane.find || pane.find.el.hidden || findTarget(pane) !== 'preview') return;
  const node = tab.article.querySelector(`.mm-csv-row[data-r="${m.row}"] .mm-csv-cell[data-c="${m.col}"]`)?.firstChild;
  if (!node || node.nodeType !== 3) return;
  const range = document.createRange(), len = node.length;
  range.setStart(node, Math.min(m.s, len));
  range.setEnd(node, Math.min(m.e, len));
  CSS.highlights.set('mm-find-cur-' + pane.index, new Highlight(range));
}

// find.js clearMarks: the view's marks go too.
function csvClearFind(pane) {
  const tab = pane.active;
  if (!tab?.csvHits && !tab?.csvFound) return;
  tab.csvHits = tab.csvFound = null;
  if (pane.find) pane.find.csvCache = null;
  if (tab.csv) { tab.csv.first = -1; csvDraw(pane); }
}
