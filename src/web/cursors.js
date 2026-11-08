'use strict';
// Multiple cursors (docs/plans/04-PLAN-multiple-cursors.md). CodeMirror keeps several selections; here are the ways to
// make them and what LexPen adds to them:
// - The mouse: Ctrl+Alt+click adds a cursor (on a cursor or inside a selection it removes that one, never the last);
//   held and dragged, the new cursor follows the mouse. Ctrl+Alt+double-click selects the find match there (the find
//   bar open), else the word.
// - The keys: a search text (the find bar's, else the selection exactly) and a current occurrence: Ctrl+Alt+Right /
//   Left move it, Ctrl+D, A adds it to the cursors, Ctrl+D, D (or R) removes it, Ctrl+D, C clears the added ones.
// - Past the end of a line (virtual space) per cursor: cm.state.mmCursorCols, line -> visual column, while CodeMirror's
//   cursor waits at the line's end (so one per line: CodeMirror merges cursors on one place). Typing fills each line up
//   to its own cursor's column. LexPen draws all the cursors (virtual.js, drawVirtual).
// - The arrows move each cursor as one cursor moves (leftWraps, past the end); Esc: back to the first cursor.
// Loaded after virtual.js, before app.js; CodeMirror is needed only once an editor exists.

const OCC_LIMIT = 5000;   // occurrences looked at, as find's FIND_LIMIT

const multiOn = cm => cm.listSelections().length > 1 && !blockOf(cm);
const paneOfCm = cm => panes.find(p => p.cm === cm);

// ---------- The cursors as items: { anchor, head, col } (col: the column past the line's end, else null) ----------
// A selection's column past its line's end: an empty one at the end of its line, with a column further right.
function pastColOf(cm, range) {
  if (CodeMirror.cmpPos(range.anchor, range.head) !== 0) return null;
  const { line, ch } = range.head;
  if (ch !== cm.getLine(line).length) return null;
  const v = virtualOf(cm), col = cm.listSelections().length === 1 ? (v?.line === line ? v.col : null) : cm.state.mmCursorCols?.get(line);
  return col != null && col > lineEndCol(cm, line) ? col : null;
}

const itemsOf = cm => cm.listSelections().map(r => ({ anchor: r.anchor, head: r.head, col: pastColOf(cm, r) }));
const itemCol = (cm, it) => it.col ?? vcolAt(cm, it.head.line, it.head.ch);
const isCursor = it => CodeMirror.cmpPos(it.anchor, it.head) === 0;

// A cursor at a visual column of a line: past its end when allowed (virtual space or column mode), else in the text.
function cursorItem(cm, line, col) {
  const end = lineEndCol(cm, line);
  if (col > end && virtualAllowed()) {
    const at = CodeMirror.Pos(line, cm.getLine(line).length);
    return { anchor: at, head: at, col };
  }
  const at = CodeMirror.Pos(line, chAtCol(cm, line, Math.min(col, end)));
  return { anchor: at, head: at, col: null };
}

// The cursors set: `primary` an index in items. Cursors on one place merge (past one line's end: the last one).
function setItems(cm, items, primary, reveal = true) {
  const byPlace = new Map();
  items.forEach((it, i) => {
    const key = isCursor(it) ? `${it.head.line}:${it.head.ch}` : `${it.anchor.line}:${it.anchor.ch}-${it.head.line}:${it.head.ch}`;
    const was = byPlace.get(key);
    byPlace.set(key, { ...it, col: it.col ?? was?.col ?? null, primary: i === primary || !!was?.primary });
  });
  const list = [...byPlace.values()];
  const prim = Math.max(0, list.findIndex(it => it.primary));
  const cols = new Map();
  for (const it of list) if (it.col != null) cols.set(it.head.line, it.col);
  placing(cm, () => own(cm, () => {
    cm.setSelections(list.map(it => ({ anchor: it.anchor, head: it.head })), prim, { scroll: false });
    cm.state.mmBlock = null;
    // One cursor: the single column past the end (virtual.js); several: one per line.
    cm.state.mmVirtual = list.length === 1 && list[0].col != null ? { line: list[0].head.line, col: list[0].col } : null;
    cm.state.mmCursorCols = list.length > 1 ? cols : null;
    if (reveal) lineIntoView(cm, list[prim].head.line);
  }));
  drawVirtual(cm, reveal);
  updateStatus();
}

// Before the first extra cursor: where Esc goes back to.
function noteFirst(cm) {
  if (cm.listSelections().length > 1) return;
  cm.state.mmFirst?.clear();
  cm.state.mmFirst = cm.setBookmark(cm.getCursor('head'));
}

// Esc: one cursor again, the first one made (or the main one when that is gone); a selection stays selected.
function backToFirst(cm) {
  const ranges = cm.listSelections(), at = cm.state.mmFirst?.find();
  let keep = ranges[cm.getDoc().sel.primIndex];
  if (at) keep = ranges.find(r => CodeMirror.cmpPos(r.from(), at) <= 0 && CodeMirror.cmpPos(at, r.to()) <= 0) ?? keep;
  setItems(cm, [{ anchor: keep.anchor, head: keep.head, col: pastColOf(cm, keep) }], 0);
}

// A block (column mode) becomes a cursor per line at its head's column.
function blockToCursors(cm) {
  const b = blockOf(cm);
  if (!b) return;
  const box = blockBox(b), items = [];
  for (let line = box.top; line <= box.bottom; line++) items.push(cursorItem(cm, line, b.head.col));
  setItems(cm, items, b.head.line - box.top, false);
}

// ---------- Drawing (from drawVirtual, virtual.js) ----------
// Several cursors: LexPen draws each (CodeMirror's hidden), also past a line's end and at a selection's head. False
// with one cursor.
function drawCursors(cm, reveal) {
  const pool = cm.state.mmCursorEls ??= [];
  if (!multiOn(cm)) {
    for (const el of pool) el.hidden = true;
    return false;
  }
  cm.getWrapperElement().classList.add('mm-virtual');
  if (cm.state.mmVirtualEl) cm.state.mmVirtualEl.hidden = true;
  drawBlockFill(cm);
  const view = cm.getViewport(), cw = charWidth(cm), prim = cm.getDoc().sel.primIndex, boxes = [];
  let primBox = null, farthest = null;
  cm.listSelections().forEach((r, i) => {
    const line = r.head.line;
    if (line < view.from || line >= view.to) return;
    const col = pastColOf(cm, r), at = cm.charCoords(r.head, 'div');
    const box = { left: col != null ? at.left + (col - lineEndCol(cm, line)) * cw : at.left, top: at.top, bottom: at.bottom };
    boxes.push(box);
    if (i === prim) primBox = box;
    if (col != null && (!farthest || box.left > farthest.left)) farthest = box;
  });
  while (pool.length < boxes.length) {
    const el = document.createElement('div');
    el.className = 'mm-vcursor';
    cm.display.lineSpace.append(el);
    pool.push(el);
  }
  pool.forEach((el, i) => {
    const box = boxes[i];
    el.hidden = !box;
    if (!box) return;
    Object.assign(el.style, { left: box.left + 'px', top: box.top + 'px', height: box.bottom - box.top + 'px' });
    el.style.animation = 'none';   // the blink starts again on every move
    void el.offsetWidth;
    el.style.animation = '';
  });
  const hidden = Math.max(0, cm.getScrollerElement().getBoundingClientRect().right - visibleSpan(cm).right);
  if (farthest) placeSpacer(cm, farthest.left + 4 * cw + hidden, farthest.top);
  else if (cm.state.mmSpacer) placeSpacer(cm, 0);
  if (reveal && primBox) queueMicrotask(() => {
    const left = cm.display.lineSpace.getBoundingClientRect().left + primBox.left;
    revealX(cm, left, left + 2);
  });
  return true;
}

// ---------- Moving: each cursor as one cursor moves ----------
function stepLeft(cm, it) {
  const { line, ch } = it.head;
  if (it.col != null) return cursorItem(cm, line, it.col - 1);
  if (ch > 0) return cursorItem(cm, line, vcolAt(cm, line, cm.findPosH(it.head, -1, 'char').ch));
  if (line > cm.firstLine() && setting('leftWraps') !== false) return cursorItem(cm, line - 1, lineEndCol(cm, line - 1));
  return it;   // leftWraps off: this one stays
}

function stepRight(cm, it) {
  const { line, ch } = it.head, len = cm.getLine(line).length;
  if (it.col != null) return cursorItem(cm, line, Math.min(it.col + 1, Math.max(it.col, maxCol(cm, line))));
  if (ch < len) return cursorItem(cm, line, vcolAt(cm, line, cm.findPosH(it.head, 1, 'char').ch));
  if (virtualAllowed()) return cursorItem(cm, line, Math.min(lineEndCol(cm, line) + 1, Math.max(lineEndCol(cm, line), maxCol(cm, line))));
  if (line < cm.lastLine()) return cursorItem(cm, line + 1, 0);
  return it;
}

// Up / Down: the cursor's horizontal place (goal, kept over several moves), past a shorter line's end too.
const goalOf = (cm, it) => {
  const at = cm.charCoords(it.head, 'local');
  return it.col != null ? at.left + (it.col - lineEndCol(cm, it.head.line)) * charWidth(cm) : at.left;
};

function stepVertical(cm, it, dir, goal) {
  const box = cm.charCoords(it.head, 'local');
  if (dir > 0 && box.bottom >= cm.charCoords(CodeMirror.Pos(cm.lastLine(), cm.getLine(cm.lastLine()).length), 'local').bottom - 1) return it;
  if (dir < 0 && box.top <= cm.charCoords(CodeMirror.Pos(cm.firstLine(), 0), 'local').top + 1) return it;
  const pos = cm.coordsChar({ left: goal, top: dir > 0 ? box.bottom + 1 : box.top - 1 }, 'local');
  const text = cm.getLine(pos.line), end = cm.charCoords(CodeMirror.Pos(pos.line, text.length), 'local');
  const past = pos.ch === text.length && goal > end.left + charWidth(cm) / 2;
  const col = past ? lineEndCol(cm, pos.line) + Math.round((goal - end.left) / charWidth(cm)) : vcolAt(cm, pos.line, pos.ch);
  return cursorItem(cm, pos.line, Math.min(col, Math.max(lineEndCol(cm, pos.line), maxCol(cm, pos.line))));
}

function moveCursors(cm, dir) {
  const items = itemsOf(cm), prim = cm.getDoc().sel.primIndex;
  let out;
  if (dir === 'up' || dir === 'down') {
    const kept = cm.state.mmGoals;
    const goals = kept?.length === items.length ? kept : items.map(it => goalOf(cm, it));
    out = items.map((it, i) => stepVertical(cm, it, dir === 'down' ? 1 : -1, goals[i]));
    setItems(cm, out, prim);
    cm.state.mmGoals = goals;
    return;
  }
  out = items.map(it => dir === 'left' ? stepLeft(cm, it) : stepRight(cm, it));
  setItems(cm, out, prim);
}

// ---------- Editing with cursors past the end ----------
// Typing or a paste at a cursor past its line's end: the fill goes in front, in the same change (one undo step).
function onCursorsBeforeChange(cm, change) {
  cm.state.mmChanging = true;
  const cols = cm.state.mmCursorCols;
  if (!cols?.size || cm.state.mmOwn) return;
  if (!/^(\+input|paste|\*compose|\+mmpaste|drop)/.test(change.origin ?? '')) return;
  if (change.origin === '+input' && change.text.length > 1) return;   // Enter: no spaces before the line break
  const { from, to } = change, col = cols.get(from.line);
  if (col == null || CodeMirror.cmpPos(from, to) !== 0 || from.ch !== cm.getLine(from.line).length || col <= lineEndCol(cm, from.line)) return;
  const text = [...change.text];
  text[0] = fillTo(cm, from.line, col) + text[0];
  change.update(from, to, text);
  cols.delete(from.line);
}

// Lines added or removed: the columns past the end move along with their lines.
function onCursorsChange(cm, change) {
  const cols = cm.state.mmCursorCols;
  const d = change.text.length - 1 - (change.to.line - change.from.line);
  if (!cols?.size || !d) return;
  const moved = new Map();
  for (const [line, col] of cols) {
    if (line <= change.from.line) moved.set(line, col);
    else if (line > change.to.line) moved.set(line + d, col);
  }
  cm.state.mmCursorCols = moved;
}

// Backspace / Delete with cursors past the end, per cursor: past the end Backspace steps back, Delete fills the line
// up to the cursor and joins the next one on; in the text as always. One undo step.
function deleteCursors(cm, back) {
  const items = itemsOf(cm), prim = cm.getDoc().sel.primIndex;
  const marks = items.map(it => cm.setBookmark(it.head)), cols = items.map(it => it.col);
  const order = items.map((_, i) => i).sort((a, b) => CodeMirror.cmpPos(items[b].head, items[a].head));   // from the bottom
  cm.operation(() => own(cm, () => {
    for (const i of order) {
      const at = marks[i].find();
      if (!at) continue;
      const { line } = at, len = cm.getLine(line).length;
      if (cols[i] != null) {
        if (back) { cols[i]--; continue; }
        if (line >= cm.lastLine()) continue;
        const fill = fillTo(cm, line, cols[i]);
        cm.replaceRange(fill, CodeMirror.Pos(line, len), CodeMirror.Pos(line + 1, 0), '+delete');
        marks[i].clear();
        marks[i] = cm.setBookmark(CodeMirror.Pos(line, len + fill.length));
        cols[i] = null;
      } else if (back) {
        if (at.ch > 0) cm.replaceRange('', cm.findPosH(at, -1, 'char'), at, '+delete');
        else if (line > cm.firstLine()) cm.replaceRange('', CodeMirror.Pos(line - 1, cm.getLine(line - 1).length), at, '+delete');
      } else {
        if (at.ch < len) cm.replaceRange('', at, cm.findPosH(at, 1, 'char'), '+delete');
        else if (line < cm.lastLine()) cm.replaceRange('', at, CodeMirror.Pos(line + 1, 0), '+delete');
      }
    }
  }));
  const out = items.map((_, i) => {
    const at = marks[i].find();
    marks[i].clear();
    if (!at) return null;
    return cols[i] != null ? cursorItem(cm, at.line, cols[i]) : { anchor: at, head: at, col: null };
  });
  setItems(cm, out.filter(Boolean), Math.min(prim, out.filter(Boolean).length - 1));
}

// Tab: the lines filled up to their cursors first; then Tab does its own work.
function fillCursors(cm) {
  const items = itemsOf(cm).filter(it => it.col != null);
  cm.operation(() => own(cm, () => {
    for (const it of items) cm.replaceRange(fillTo(cm, it.head.line, it.col), CodeMirror.Pos(it.head.line, cm.getLine(it.head.line).length), undefined, '+input');
  }));
  cm.state.mmCursorCols = null;
}

const anyPast = cm => itemsOf(cm).some(it => it.col != null);
const allCursors = cm => cm.listSelections().every(r => r.empty());

// ---------- The mouse ----------
// The place under the mouse: a line and a visual column, past the end of the line when allowed.
function spotAt(cm, x, y) {
  const pos = cm.coordsChar({ left: x, top: y }, 'window');
  const len = cm.getLine(pos.line).length, end = cm.charCoords(CodeMirror.Pos(pos.line, len), 'window');
  if (virtualAllowed() && pos.ch === len && y >= end.top && y <= end.bottom && x > end.left + charWidth(cm) / 2)
    return { line: pos.line, col: Math.min(lineEndCol(cm, pos.line) + Math.round((x - end.left) / charWidth(cm)), Math.max(lineEndCol(cm, pos.line), maxCol(cm, pos.line))) };
  return { line: pos.line, col: vcolAt(cm, pos.line, pos.ch) };
}

// Is the spot on this cursor, or inside this selection?
function onItem(cm, it, spot) {
  if (isCursor(it)) return it.head.line === spot.line && itemCol(cm, it) === spot.col;
  if (spot.col > lineEndCol(cm, spot.line)) return false;
  const at = CodeMirror.Pos(spot.line, chAtCol(cm, spot.line, spot.col)), from = CodeMirror.cmpPos(it.anchor, it.head) < 0 ? it.anchor : it.head;
  const to = from === it.anchor ? it.head : it.anchor;
  return CodeMirror.cmpPos(from, at) <= 0 && CodeMirror.cmpPos(at, to) <= 0;
}

function onCursorMouseDown(cm, e) {
  if (e.button !== 0 || !e.ctrlKey || !e.altKey || e.shiftKey || !e.target.closest('.CodeMirror-lines')) return;
  e.preventDefault();
  e.stopPropagation();
  cm.focus();
  endOccurrences(cm);
  if (blockOf(cm)) blockToCursors(cm);
  const spot = spotAt(cm, e.clientX, e.clientY);
  if (e.detail === 2) return addMatchAt(cm, spot);
  if (e.detail > 2) return;
  const items = itemsOf(cm), hit = items.findIndex(it => onItem(cm, it, spot));
  if (hit >= 0) {
    if (items.length > 1) {   // never the last one
      items.splice(hit, 1);
      setItems(cm, items, items.length - 1, false);
    }
    return;
  }
  noteFirst(cm);
  // Past a line's end there is room for one cursor per line: the new one takes that line's place.
  const placed = spot => {
    const item = cursorItem(cm, spot.line, spot.col);
    const others = items.filter(it => !(item.col != null && it.col != null && it.head.line === spot.line));
    setItems(cm, [...others, item], others.length, false);
  };
  placed(spot);
  // Held and dragged: the new cursor follows the mouse until the button is released.
  const move = ev => placed(spotAt(cm, ev.clientX, ev.clientY));
  const up = () => {
    removeEventListener('mousemove', move, true);
    removeEventListener('mouseup', up, true);
  };
  addEventListener('mousemove', move, true);
  addEventListener('mouseup', up, true);
}

// The find bar's search of the pane, when it is open with a valid one; else null.
function findBarRegex(pane) {
  if (!pane?.find || pane.find.el.hidden || typeof findRegex !== 'function') return null;
  const regex = findRegex(pane);
  return regex instanceof RegExp && findTarget(pane) === 'editor' ? regex : null;
}

function occMatches(cm, regex) {
  const found = [];
  for (const m of cm.getValue().matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'))) {
    if (!m[0].length) continue;
    found.push([m.index, m.index + m[0].length]);
    if (found.length >= OCC_LIMIT) break;
  }
  return found;
}

// Ctrl+Alt+double-click: the find match there becomes a selection (the cursor the first click made goes); without
// a find, the word.
function addMatchAt(cm, spot) {
  const at = CodeMirror.Pos(spot.line, chAtCol(cm, spot.line, Math.min(spot.col, lineEndCol(cm, spot.line))));
  const regex = findBarRegex(paneOfCm(cm));
  let range = null;
  if (regex) {
    const i = cm.indexFromPos(at), m = occMatches(cm, regex).find(([s, e]) => s <= i && i <= e);
    if (m) range = { anchor: cm.posFromIndex(m[0]), head: cm.posFromIndex(m[1]) };
  } else {
    const word = cm.findWordAt(at);
    if (CodeMirror.cmpPos(word.anchor, word.head) !== 0) range = word;
  }
  if (!range) return;
  const items = itemsOf(cm).filter(it => !(isCursor(it) && it.head.line === spot.line && itemCol(cm, it) === spot.col));
  setItems(cm, [...items, { anchor: range.anchor, head: range.head, col: null }], items.length, false);
}

// ---------- Occurrences: Ctrl+D chords, Ctrl+Alt+Right / Left ----------
// cm.state.mmOcc: { regex, bar (the find bar's search), added: [{ s, e, col }], cur: { s, e }, marks }, offsets in
// the text. Ends with an edit, a selection made elsewhere, Esc.
function startOccurrences(cm, pane) {
  if (cm.state.mmOcc) return cm.state.mmOcc;
  if (blockOf(cm)) blockToCursors(cm);
  const ranges = cm.listSelections(), prim = ranges[cm.getDoc().sel.primIndex];
  let regex = findBarRegex(pane);
  const bar = !!regex;
  if (!regex) {
    const text = cm.getRange(prim.from(), prim.to());
    if (!text) {
      toast('Select a text, or find one (Ctrl+F), first.', true);
      return null;
    }
    regex = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  }
  const all = occMatches(cm, regex);
  if (!all.length) {
    toast('Not found.', true);
    return null;
  }
  const s = cm.indexFromPos(prim.from()), e = cm.indexFromPos(prim.to());
  const first = all.find(m => m[0] === s && m[1] === e) ?? all.find(m => m[0] >= s) ?? all[0];
  const added = ranges.length > 1
    ? ranges.map(r => ({ s: cm.indexFromPos(r.from()), e: cm.indexFromPos(r.to()), col: pastColOf(cm, r) })) : [];
  noteFirst(cm);
  return cm.state.mmOcc = { regex, bar, added, cur: { s: first[0], e: first[1] }, marks: [], overlay: null };
}

function endOccurrences(cm) {
  const occ = cm.state.mmOcc;
  if (!occ) return;
  for (const m of occ.marks) m.clear();
  if (occ.overlay) cm.removeOverlay(occ.overlay);
  cm.state.mmOcc = null;
  updateStatus();
}

// The next (1) or previous (-1) occurrence from the current one; wrap: past the end as findWrap says (else null).
function stepOccurrence(cm, occ, dir, wrap) {
  const all = occMatches(cm, occ.regex);
  let i = dir > 0 ? all.findIndex(m => m[0] > occ.cur.s) : all.findLastIndex(m => m[0] < occ.cur.s);
  if (i < 0) {
    if (!wrap || setting('findWrap') === 'end' || !all.length) {
      if (wrap) toast(dir > 0 ? 'No more matches below.' : 'No more matches above.', true);
      return null;
    }
    i = dir > 0 ? 0 : all.length - 1;
    toast(dir > 0 ? 'Went on from the top.' : 'Went on from the bottom.', true);
  }
  return { s: all[i][0], e: all[i][1] };
}

const sameOcc = (a, b) => a.s === b.s && a.e === b.e;

// The cursors: the added ones, or without them the current occurrence as the selection; the current one boxed, the
// other occurrences marked (by find when its bar is open).
function showOccurrences(cm, occ) {
  const pos = i => cm.posFromIndex(i);
  const items = occ.added.length ? occ.added.map(a => ({ anchor: pos(a.s), head: pos(a.e), col: a.col ?? null }))
    : [{ anchor: pos(occ.cur.s), head: pos(occ.cur.e), col: null }];
  const at = occ.added.findIndex(a => sameOcc(a, occ.cur));
  occ.busy = true;
  try { setItems(cm, items, occ.added.length ? (at >= 0 ? at : items.length - 1) : 0, false); } finally { occ.busy = false; }
  for (const m of occ.marks) m.clear();
  occ.marks = [];
  const pane = paneOfCm(cm);
  if (occ.bar && pane) {   // find's own current match would be a second box
    pane.findCurrent?.clear();
    pane.findCurrent = null;
  }
  cm.operation(() => {
    const all = occMatches(cm, occ.regex);
    if (!occ.bar) {
      if (!occ.overlay) {
        const re = new RegExp(occ.regex.source, 'g');
        occ.overlay = { token(stream) {
          re.lastIndex = stream.pos;
          const m = re.exec(stream.string);
          if (m && m.index === stream.pos && m[0].length) { stream.pos += m[0].length; return 'mm-find-hit'; }
          if (m && m[0].length) stream.pos = m.index; else stream.skipToEnd();
        } };
        cm.addOverlay(occ.overlay);
      }
      if ((setting('findMark') || 'background') !== 'background' && all.length <= 3000)
        for (const [s, e] of all) if (s !== occ.cur.s) occ.marks.push(cm.markText(pos(s), pos(e),
          { className: 'mm-find-box', startStyle: 'mm-find-box-start', endStyle: 'mm-find-box-end' }));
    }
    occ.marks.push(cm.markText(pos(occ.cur.s), pos(occ.cur.e), { className: 'mm-find-box mm-find-current' + (at >= 0 ? ' mm-occ-added' : ''),
      startStyle: 'mm-find-box-start', endStyle: 'mm-find-box-end' }));
    occ.total = all.length;
    occ.index = all.findIndex(m => m[0] === occ.cur.s);
  });
  cm.scrollIntoView({ from: pos(occ.cur.s), to: pos(occ.cur.e) }, 80);
  updateStatus();
}

// The actions: add, next, previous, remove, clear.
function occurrence(pane, kind) {
  const cm = pane?.cm;
  if (!cm) return;
  const occ = startOccurrences(cm, pane);
  if (!occ) return;
  if (kind === 'add') {
    if (!occ.added.some(a => sameOcc(a, occ.cur))) occ.added.push({ ...occ.cur, col: null });
    occ.cur = stepOccurrence(cm, occ, 1, true) ?? occ.cur;
  } else if (kind === 'next' || kind === 'previous') {
    occ.cur = stepOccurrence(cm, occ, kind === 'next' ? 1 : -1, true) ?? occ.cur;
  } else if (kind === 'remove') {
    occ.added = occ.added.filter(a => !sameOcc(a, occ.cur));
    occ.cur = stepOccurrence(cm, occ, 1, false) ?? stepOccurrence(cm, occ, -1, false) ?? occ.cur;
  } else if (kind === 'clear') occ.added = [];
  showOccurrences(cm, occ);
}

// The bottom bar: "3 selected, at 4 of 9" with occurrences, "3 cursors" with several cursors; else null.
function cursorStatus(cm) {
  const occ = cm.state.mmOcc;
  if (occ) return `${occ.added.length} selected, at ${occ.index + 1} of ${occ.total >= OCC_LIMIT ? OCC_LIMIT + '+' : occ.total}`;
  const n = cm.listSelections().length;
  return n > 1 && !blockOf(cm) ? `${n} cursors` : null;
}

// ---------- Per editor ----------
function onCursorsSelectionChange(cm) {
  const occ = cm.state.mmOcc;
  if (occ && !occ.busy) queueMicrotask(() => { if (cm.state.mmOcc === occ) endOccurrences(cm); });
  if (cm.state.mmPlacing) return;
  cm.state.mmGoals = null;
  if (!cm.state.mmChanging) cm.state.mmCursorCols = null;   // a move or a click; not the cursors moving with an edit
}

function setupCursors(pane) {
  const cm = pane.cm;
  cm.on('beforeChange', onCursorsBeforeChange);
  cm.on('change', onCursorsChange);
  cm.on('changes', () => {
    cm.state.mmChanging = false;
    if (cm.state.mmOcc) endOccurrences(cm);
  });
  cm.on('beforeSelectionChange', onCursorsSelectionChange);
  cm.on('swapDoc', () => { endOccurrences(cm); cm.state.mmCursorCols = null; cm.state.mmGoals = null; });
  cm.getWrapperElement().addEventListener('mousedown', e => onCursorMouseDown(cm, e), true);
  // CodeMirror selects the word on a double click by itself as well.
  cm.getWrapperElement().addEventListener('dblclick', e => { if (e.ctrlKey && e.altKey) { e.preventDefault(); e.stopPropagation(); } }, true);
  // Several cursors, none selecting: each moves as one cursor does. Added after virtual.js's keys: these come first.
  const each = (dir, need) => c => multiOn(c) && allCursors(c) && need(c) ? moveCursors(c, dir) : CodeMirror.Pass;
  const past = () => virtualAllowed();
  cm.addKeyMap({
    Left: each('left', c => virtualAllowed() || anyPast(c) || setting('leftWraps') === false),
    Right: each('right', past), Up: each('up', past), Down: each('down', past),
    Backspace: c => multiOn(c) && allCursors(c) && anyPast(c) ? deleteCursors(c, true) : CodeMirror.Pass,
    Delete: c => multiOn(c) && allCursors(c) && anyPast(c) ? deleteCursors(c, false) : CodeMirror.Pass,
    Tab: c => { if (multiOn(c) && anyPast(c)) fillCursors(c); return CodeMirror.Pass; },
    // Esc: the occurrences end, several cursors become the first one; an open find bar closes first (app.js).
    Esc: c => {
      if (panes.some(p => p.find && !p.find.el.hidden)) return;   // handled: CodeMirror's own Esc would drop the cursors
      const occ = !!c.state.mmOcc;
      endOccurrences(c);
      if (c.listSelections().length > 1 && !blockOf(c)) backToFirst(c);
      else if (!occ) return CodeMirror.Pass;
    },
  });
}
