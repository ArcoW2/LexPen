'use strict';
// Compare two files (docs/plans/executed/PLAN-file-compare.md): side by side in the two panes, the differing lines tinted,
// the changed characters marked, filler lines keeping both sides level, the panes scrolling together, F7 / Shift+F7
// through the differences. The bar above the panes: the count, ignore whitespace / case, Align (ties the two cursor
// lines), copy across, Swap, leave. The line strip below them: the cursor line and its match, one above the other.
// The differences come from a worker (diff.worker.js, with diff.js). Loaded with the page, after app.js's helpers are
// declared (it only uses them when a compare starts).

const cmp = {
  on: false, sides: null,      // sides: [left, right], each { pane, tab, opened, mode }
  before: null,                // the window as it was: restored when the compare ends
  hunks: [], ties: [],         // the differences; ties [{ a, b }] as bookmarks in the two documents
  worker: null, run: 0, timer: 0, decor: [null, null],
  blocks: null, fills: null,   // the blocks to level and their fillers (compareBlocks)
  alignFrame: 0, alignRuns: 0, // the fillers measured again on the next frame; redraws in a row that changed one (alignSoon)
  restoreAt: null,             // reopened: the cursors and the scroll to put back after the first compare
  mirror: null,                // the selection of one side shown on the other (mirrorSelection)
};
const COMPARE_DELAY = 300;     // ms after an edit before comparing again

// ---------- Starting and leaving ----------
// `left`, `right`: { path } a file, { tab } an open tab, { saved: doc } the text of a document as last saved,
// { git: { path, rev, label } } a file as a git version has it (startGitCompare).
async function startCompare(left, right) {
  if (cmp.on) await stopCompare();
  await loadEditor();   // the editor and its helpers (diff.js, gutter.js)
  cmp.before = {
    orient: state.orient, ratio: state.ratio, hidden: state.hidden, sync: state.sync, activePane: state.activePane,
    active: panes.map(p => p.active),
  };
  state.orient = 'v';
  state.hidden = null;
  state.sync = false;   // the compare scrolls the two panes itself (line for line, the fillers counted)
  const sides = [];
  for (const [i, what] of [left, right].entries()) {
    const side = await placeSide(panes[i], what);
    if (!side) { await stopCompare(); return; }
    sides.push(side);
  }
  if (sides[0].tab.doc === sides[1].tab.doc) {
    toast('Both sides are the same document.');
    cmp.sides = sides;
    return stopCompare();
  }
  cmp.sides = sides;
  cmp.on = true;
  cmp.ties = [];
  for (const s of sides) {
    s.mode = s.tab.mode;
    s.tab.mode = 'edit';
    await activate(s.pane, s.tab);
    await showActive(s.pane);
    watchSide(s);
  }
  showCompareUi(true);
  afterPaneChange();
  runCompare(true);
  saveSession();
}

// A side in its pane: an open tab moves there, a file opens there, a saved text or a git version gets a read-only tab
// of its own.
async function placeSide(pane, what) {
  if (what.git) {
    const { path, rev, label } = what.git;
    const text = await host('gitShow', { path, rev }).catch(() => null);
    if (text == null) { toast(`${nameOf(path)} is not in git at ${label}.`); return null; }
    const doc = makeDoc({ text });
    doc.temp = true;
    doc.gitOf = what.git;   // the session keeps which version (compareSession)
    doc.label = `${nameOf(path)} @ ${label}`;
    doc.language = codeLang(path, text);
    const tab = makeTab(doc, 'edit');
    tab.readOnly = true;
    insertTab(pane, tab);
    return { pane, tab, opened: true };
  }
  if (what.saved) {
    const doc = makeDoc({ text: what.saved.savedText ?? docText(what.saved) });
    doc.temp = true;   // not kept in the session (saveSession), closed when the compare ends
    doc.savedOf = what.saved;   // the session keeps which document's saved text (compareSession)
    doc.label = docName(what.saved) + ' (saved)';
    doc.language = what.saved.language;
    const tab = makeTab(doc, 'edit');
    tab.readOnly = true;
    insertTab(pane, tab);
    return { pane, tab, opened: true };
  }
  let tab = what.tab ?? allTabs().find(t => samePath(t.doc.path, what.path));
  if (tab) {
    if (paneOf(tab) !== pane) await moveToPane(tab, pane);
    tab = pane.tabs.find(t => t.doc === tab.doc) ?? tab;
    return { pane, tab, opened: false };
  }
  try { tab = await openFile(what.path, { pane, mode: 'edit' }); }
  catch (e) { toast(e.message); return null; }
  return { pane, tab, opened: true };
}

// Leaves the compare: the marks gone, the tabs the compare opened closed (a changed one asks), the panes as before.
async function stopCompare() {
  const sides = cmp.sides ?? [], before = cmp.before;
  cmp.on = false;
  cmp.mirror?.clear();
  cmp.mirror = null;
  clearTimeout(cmp.timer);
  clearDecor();
  showCompareUi(false);
  for (const s of sides) {
    unwatchSide(s);
    if (!paneOf(s.tab)) continue;
    if (s.opened) await closeTab(s.tab, !!s.tab.doc.temp);
    else if (s.mode) s.tab.mode = s.mode;
  }
  for (const t of cmp.ties) { t.ma.clear(); t.mb.clear(); }
  cmp.ties = [];
  cmp.sides = null;
  cmp.hunks = [];
  if (before) {
    Object.assign(state, { orient: before.orient, ratio: before.ratio, hidden: before.hidden, sync: before.sync });
    before.active.forEach((tab, i) => { if (tab && paneOf(tab) === panes[i]) panes[i].active = tab; });
    state.activePane = before.activePane;
    cmp.before = null;
  }
  afterPaneChange();
  await showAll();
  saveSession();
}

// ---------- Watching the two editors ----------
function watchSide(s) {
  const cm = s.pane.cm;
  s.onScroll = () => {
    // A scroll of more than a pixel or two (not the nudge a filler gives): the fillers may be measured again.
    const top = cm.getScrollInfo().top;
    if (Math.abs(top - (s.alignTop ?? -Infinity)) > 2) { cmp.alignRuns = 0; s.alignTop = top; }
    followScroll(s);
  };
  s.onRefresh = () => { cmp.alignRuns = 0; alignSoon(); };   // a resize, wrap switched
  s.onChange = () => { clearTimeout(cmp.timer); cmp.timer = setTimeout(() => runCompare(), COMPARE_DELAY); };
  s.onCursor = () => { drawStrip(); showCompareCount(); mirrorSelection(s); };
  s.onSwap = () => { if (cmp.on && cm.getDoc() !== s.tab.cmDoc) stopCompare(); };   // another tab here, or closed
  cm.on('scroll', s.onScroll);
  cm.on('update', alignSoon);   // a redraw: wrapped lines measured, the fillers to match
  cm.on('refresh', s.onRefresh);
  cm.on('optionChange', s.onRefresh);
  cm.on('changes', s.onChange);
  cm.on('cursorActivity', s.onCursor);
  cm.on('swapDoc', s.onSwap);
}

function unwatchSide(s) {
  const cm = s.pane.cm;
  if (!cm || !s.onScroll) return;
  cm.off('scroll', s.onScroll);
  cm.off('update', alignSoon);
  cm.off('refresh', s.onRefresh);
  cm.off('optionChange', s.onRefresh);
  cm.off('changes', s.onChange);
  cm.off('cursorActivity', s.onCursor);
  cm.off('swapDoc', s.onSwap);
}

// The other side scrolls along, to the same place (both are the same height, the fillers counted).
function followScroll(s) {
  if (s.ignoreScroll) { s.ignoreScroll = false; return; }
  const other = cmp.sides?.find(o => o !== s);
  if (!other?.pane.cm) return;
  const from = s.pane.cm.getScrollInfo(), to = other.pane.cm.getScrollInfo();
  // At most as far as the other side goes: a side a pixel taller (rounding) would otherwise make the two push each
  // other back and forth at the bottom.
  const top = Math.min(from.top, Math.max(0, to.height - to.clientHeight)), left = Math.min(from.left, Math.max(0, to.width - to.clientWidth));
  if (Math.abs(top - to.top) < 1 && Math.abs(left - to.left) < 1) return;
  other.ignoreScroll = true;
  other.pane.cm.scrollTo(left, top);
}

// ---------- Comparing ----------
const compareOpts = () => ({ whitespace: !!setting('compareWhitespace'), case: !!setting('compareCase') });

function runCompare(first) {
  if (!cmp.on) return;
  const [a, b] = cmp.sides.map(s => s.pane.cm.getValue().split('\n'));
  const ties = cmp.ties.map(t => ({ a: t.ma.find()?.line ?? -1, b: t.mb.find()?.line ?? -1 }));
  cmp.worker ??= new Worker('diff.worker.js');
  const id = ++cmp.run;
  cmp.worker.onmessage = ({ data }) => {
    if (data.id !== cmp.run || !cmp.on) return;   // a newer compare is under way, or it ended
    cmp.hunks = data.hunks;
    applyCompare();
    if (!first) return;
    const at = cmp.restoreAt;   // reopened (restoreCompare): the cursors and the scroll as they were
    cmp.restoreAt = null;
    if (!at) return compareGo(1, true);
    cmp.sides.forEach((s, i) => { const c = at.cursors?.[i]; if (Array.isArray(c)) s.pane.cm.setCursor(CodeMirror.Pos(c[0] | 0, c[1] | 0), null, { scroll: false }); });
    if (Number.isFinite(at.top)) cmp.sides[0].pane.cm.scrollTo(null, at.top);
    drawStrip();
    showCompareCount();
  };
  cmp.worker.postMessage({ id, a, b, opts: compareOpts(), ties });
}

// The differences drawn: the line tints, the changed characters, the fillers, the ties, the overview's marks.
function applyCompare() {
  clearDecor();
  cmp.sides.forEach((s, i) => {
    const cm = s.pane.cm, d = cmp.decor[i] = { lines: [], marks: [] }, marks = [];
    const mine = h => i === 0 ? [h.aFrom, h.aTo, h.bTo - h.bFrom] : [h.bFrom, h.bTo, h.aTo - h.aFrom];
    cm.operation(() => {
      for (const h of cmp.hunks) {
        const [from, to, other] = mine(h), n = to - from;
        if (!h.ignorable) {
          const kind = n && other ? 'chg' : n ? (i === 0 ? 'del' : 'add') : (i === 0 ? 'add' : 'del');
          for (let l = from; l < to; l++) {
            const lineKind = l - from < other ? 'chg' : (i === 0 ? 'del' : 'add');
            d.lines.push([cm.addLineClass(l, 'background', 'mm-cmp-' + lineKind), 'mm-cmp-' + lineKind]);
          }
          for (const p of h.pairs) for (const [f, t] of (i === 0 ? p.ac : p.bc))
            d.marks.push(cm.markText(CodeMirror.Pos(i === 0 ? p.a : p.b, f), CodeMirror.Pos(i === 0 ? p.a : p.b, t), { className: 'mm-cmp-char' }));
          marks.push({ from: Math.min(from, cm.lastLine()), to: Math.max(from, Math.min(to - 1, cm.lastLine())), kind });
        }
      }
      for (const t of cmp.ties) {
        const at = (i === 0 ? t.ma : t.mb).find()?.line;
        if (at !== undefined) d.lines.push([cm.addLineClass(at, 'gutter', 'mm-cmp-tie'), 'mm-cmp-tie', 'gutter']);
      }
    });
    s.pane.compareMarks = marks;
    if (typeof scheduleOverview === 'function') scheduleOverview(s.pane);
  });
  cmp.blocks = compareBlocks();
  cmp.alignRuns = 0;
  alignFillers();
  followScroll(cmp.sides[state.activePane] ?? cmp.sides[0]);
  showCompareCount();
  drawStrip();
}

// The fillers keeping both sides level: the text in blocks that match (each difference, and each run of equal lines
// between two), and below a block on the side where it is lower a filler as high as the difference. Measured in
// pixels, so a wrapped line (more rows on one side than on the other) counts as it is shown; a run of equal lines
// whose heights differ (the panes not as wide: a line wraps on one side only) is levelled line by line. Measured
// again after each redraw (alignSoon), since a wrapped line's height is only known once it is drawn.
function compareBlocks() {
  const blocks = [], [A, B] = cmp.sides.map(s => s.pane.cm);
  // kind: '' lines missing on one side, 'quiet' a difference that is ignored, 'wrap' equal lines wrapped differently.
  const add = (af, at, bf, bt, equal, kind) => { if (at > af || bt > bf) blocks.push({ r: [[af, at], [bf, bt]], equal, kind }); };
  let a = 0, b = 0;
  for (const h of cmp.hunks) {
    add(a, h.aFrom, b, h.bFrom, true, 'wrap');
    // As many lines on both sides: a filler there only evens out wrapping.
    add(h.aFrom, h.aTo, h.bFrom, h.bTo, false, h.ignorable ? 'quiet' : h.aTo - h.aFrom === h.bTo - h.bFrom ? 'wrap' : '');
    [a, b] = [h.aTo, h.bTo];
  }
  add(a, A.lineCount(), b, B.lineCount(), true, 'wrap');
  cmp.fills = [new Map(), new Map()];   // per side: the line a filler is below (-1: above line 0) -> { w, el, px }
  return blocks;
}

const FILL_RANK = { '': 2, quiet: 1, wrap: 0 };

function alignFillers() {
  if (!cmp.on || !cmp.blocks) return false;
  const cms = cmp.sides.map(s => s.pane.cm);
  const top = (cm, l) => l > cm.lastLine() ? cm.heightAtLine(cm.lastLine(), 'local') + cm.getLineHandle(cm.lastLine()).height : cm.heightAtLine(l, 'local');
  // A range's height on a side, the fillers in it left out (the drawn heights hold them): their lines in order, summed.
  const own = cmp.fills.map(m => [...m].map(([at, f]) => [Math.max(0, at), f.px]).sort((x, y) => x[0] - y[0]));
  const sums = own.map(list => list.reduce((s, [, px]) => (s.push(s.at(-1) + px), s), [0]));
  const below = (list, l) => { let lo = 0, hi = list.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid][0] < l) lo = mid + 1; else hi = mid; } return lo; };
  const height = (i, [f, t]) => top(cms[i], t) - top(cms[i], f) - (sums[i][below(own[i], t)] - sums[i][below(own[i], f)]);
  // The pieces to level: a block, or each line of a run of equal lines that is not as high on both sides.
  const pieces = [];
  for (const bl of cmp.blocks) {
    const h = [height(0, bl.r[0]), height(1, bl.r[1])];
    if (!bl.equal || Math.abs(h[0] - h[1]) < 0.5) { pieces.push({ r: bl.r, h, kind: bl.kind }); continue; }
    for (let k = 0; k < bl.r[0][1] - bl.r[0][0]; k++) {
      const r = [[bl.r[0][0] + k, bl.r[0][0] + k + 1], [bl.r[1][0] + k, bl.r[1][0] + k + 1]];
      pieces.push({ r, h: [height(0, r[0]), height(1, r[1])], kind: 'wrap' });
    }
  }
  // Whole pixels (a filler is drawn that high), the rounding carried on: `off`, how far the left side's bottom is
  // below the right side's so far, goes into the next piece's fillers, so it does not add up down the file. A filler
  // within a pixel of what it should be stays as it is: the browser places lines on whole pixels, so a filler's own
  // height moves what is measured by a fraction, and rounding again would make it flip on every redraw.
  const wants = [new Map(), new Map()];
  const atOf = (p, i) => { const [from, to] = p.r[i]; return to > from ? to - 1 : from - 1; };
  let off = 0;
  for (const p of pieces) {
    const d = off + p.h[0] - p.h[1], now = [0, 1].map(i => cmp.fills[i].get(atOf(p, i))?.px ?? 0);
    const w = [Math.max(0, Math.round(-d)), Math.max(0, Math.round(d))].map((px, i) => Math.abs(px - now[i]) <= 1 ? now[i] : px);
    off = d + w[0] - w[1];
    w.forEach((px, i) => {
      if (!px) return;
      const at = atOf(p, i), was = wants[i].get(at);
      // Two pieces below one line: the filler shows the one that matters most (missing lines over the others).
      const kind = was && FILL_RANK[was.kind] > FILL_RANK[p.kind] ? was.kind : p.kind;
      wants[i].set(at, { px: (was?.px ?? 0) + px, kind });
    });
  }
  let changed = false;
  cms.forEach((cm, i) => cm.operation(() => {
    const fills = cmp.fills[i];
    for (const [at, f] of fills) if (!wants[i].has(at)) { f.w.clear(); fills.delete(at); changed = true; }
    for (const [at, want] of wants[i]) {
      const f = fills.get(at), cls = 'mm-cmp-filler' + (want.kind ? ' mm-cmp-' + want.kind : '');
      if (f && f.px === want.px && f.el.className === cls) continue;
      changed = true;
      if (f) { f.px = want.px; f.el.className = cls; f.el.style.height = want.px + 'px'; f.w.changed(); continue; }
      const el = document.createElement('div');
      el.className = cls;
      el.style.height = want.px + 'px';
      const w = at >= 0 ? cm.addLineWidget(Math.min(at, cm.lastLine()), el) : cm.addLineWidget(0, el, { above: true });
      fills.set(at, { w, el, px: want.px });
    }
  }));
  return changed;
}

// After a redraw (a wrapped line measured, the pane's width changed): the fillers again, once per frame. A filler
// changed redraws too, and a line's measured height moves by a pixel with where it lands, so this could go on
// forever: after a few redraws in a row that each changed a filler, it waits for a scroll, a resize or an edit
// (alignRuns back to 0).
const ALIGN_RUNS = 3;
function alignSoon() {
  if (cmp.alignFrame || cmp.alignRuns >= ALIGN_RUNS) return;
  cmp.alignFrame = requestAnimationFrame(() => { cmp.alignFrame = 0; cmp.alignRuns = alignFillers() ? cmp.alignRuns + 1 : 0; });
}

function clearDecor() {
  cmp.decor.forEach((d, i) => {
    const cm = cmp.sides?.[i]?.pane.cm;
    if (!d || !cm) return;
    cm.operation(() => {
      for (const [h, cls, where] of d.lines) cm.removeLineClass(h, where ?? 'background', cls);
      for (const m of d.marks) m.clear();
    });
  });
  for (const m of cmp.fills ?? []) for (const f of m.values()) f.w.clear();
  cmp.fills = null;
  cmp.blocks = null;
  cmp.decor = [null, null];
  for (const p of panes) if (p.compareMarks) { p.compareMarks = null; if (typeof scheduleOverview === 'function') scheduleOverview(p); }
}

// ---------- Moving through the differences ----------
const realHunks = () => cmp.hunks.filter(h => !h.ignorable);
const sideIndex = () => cmp.sides?.findIndex(s => s.pane.index === state.activePane) ?? -1;
const rangeOf = (h, i) => i === 0 ? [h.aFrom, h.aTo] : [h.bFrom, h.bTo];

// What F7 steps through and the bar counts: with the setting compareStep 'block' (the default) differences that touch
// as one block (a run of changed lines is a difference per line pair, diff.js pairUp); 'line': each of them.
function compareSteps() {
  const list = realHunks();
  if (setting('compareStep') === 'line') return list;
  const blocks = [];
  for (const h of list) {
    const last = blocks[blocks.length - 1];
    if (last && h.aFrom === last.aTo && h.bFrom === last.bTo) Object.assign(last, { aTo: h.aTo, bTo: h.bTo });
    else blocks.push({ aFrom: h.aFrom, aTo: h.aTo, bFrom: h.bFrom, bTo: h.bTo });
  }
  return blocks;
}

// The difference (of `list`) the cursor of the active side is in (a removal: on the line after it), else -1.
function currentHunk(list = realHunks()) {
  const i = Math.max(0, sideIndex()), line = cmp.sides[i].pane.cm.getCursor().line;
  return list.findIndex(h => { const [f, t] = rangeOf(h, i); return f === t ? line === f : line >= f && line < t; });
}

// F7 / Shift+F7: the next / previous difference after (before) the cursor's line; both cursors there, a third down.
function compareGo(dir, fromTop) {
  if (!cmp.on) return;
  const list = compareSteps(), i = Math.max(0, sideIndex()), line = fromTop ? -1 : cmp.sides[i].pane.cm.getCursor().line;
  const h = dir > 0 ? list.find(h => rangeOf(h, i)[0] > line) : list.findLast(h => rangeOf(h, i)[0] < line);
  if (!h) { if (!fromTop) toast(dir > 0 ? 'No more differences below.' : 'No more differences above.', true); return; }
  // No scrolling of their own: this side is placed (revealFound, app.js), the other follows (followScroll).
  cmp.sides.forEach((s, n) => {
    const cm = s.pane.cm, at = Math.min(rangeOf(h, n)[0], cm.lastLine());
    cm.setCursor(CodeMirror.Pos(at, 0), null, { scroll: false });
  });
  const cm = cmp.sides[i].pane.cm, at = Math.min(rangeOf(h, i)[0], cm.lastLine());
  revealFound(cm, CodeMirror.Pos(at, 0));
  if (!fromTop) cm.focus();
  showCompareCount();
}

function showCompareCount() {
  const el = $('.mm-cmp-count');
  if (!el || !cmp.on) return;
  const list = compareSteps(), at = currentHunk(list);
  el.textContent = !cmp.hunks.length ? 'No differences' : !list.length ? 'Equal apart from what is ignored'
    : at >= 0 ? `${at + 1} of ${list.length}` : `${list.length} difference${list.length === 1 ? '' : 's'}`;
  const inside = currentHunk() >= 0 || !!cmp.sides[Math.max(0, sideIndex())]?.pane.cm.somethingSelected();
  for (const b of document.querySelectorAll('[data-cmp=copyLeft], [data-cmp=copyRight]')) b.disabled = !inside;
  const eols = cmp.sides.map(s => s.tab.doc.eol);
  $('.mm-cmp-note').textContent = eols[0] !== eols[1] ? 'Line endings differ (not counted)' : '';
  $('[data-cmp=untie]').hidden = !cmp.ties.length;
}

// ---------- The selection on the other side ----------
// A selection in the side with the focus shows on the other side over the matching lines, in the selection's colour
// (a mark: the other side's own cursor and selection stay). Lines without a match: from or to the other side's part
// of that difference.
function mirrorSelection(s) {
  const cm = s.pane.cm;
  if (!cm.hasFocus() && cm.somethingSelected()) return;   // set from elsewhere (compareGo): not the user's selection
  cmp.mirror?.clear();
  cmp.mirror = null;
  if (!cmp.on || !cm.somethingSelected()) return;
  const i = cmp.sides.indexOf(s), other = cmp.sides[1 - i]?.pane.cm;
  if (i < 0 || !other) return;
  const r = cm.listSelections()[cm.getDoc().sel.primIndex] ?? cm.listSelections()[0];
  const [f, t] = CodeMirror.cmpPos(r.anchor, r.head) <= 0 ? [r.anchor, r.head] : [r.head, r.anchor];
  const place = (p, end) => {
    const m = matchingLine(i, p.line);
    if (m.line != null) return CodeMirror.Pos(Math.min(m.line, other.lastLine()), p.ch);
    const [of, ot] = rangeOf(m.hunk, 1 - i);
    return CodeMirror.Pos(Math.min(end ? ot : of, other.lastLine()), 0);
  };
  const from = place(f, false), to = place(t, true);
  if (CodeMirror.cmpPos(from, to) < 0) cmp.mirror = other.markText(from, to, { className: 'mm-cmp-mirror' });
}

// ---------- Align: ties ----------
// The two cursor lines tied (Ctrl+F7); the cursor lines already tied: untied.
function compareAlign() {
  if (!cmp.on) return;
  const [la, lb] = cmp.sides.map(s => s.pane.cm.getCursor().line);
  const same = cmp.ties.findIndex(t => t.ma.find()?.line === la && t.mb.find()?.line === lb);
  if (same >= 0) {
    const [t] = cmp.ties.splice(same, 1);
    t.ma.clear(); t.mb.clear();
    toast('The tie is undone.', true);
  } else {
    const [da, db] = cmp.sides.map(s => s.tab.doc.cmDoc);
    cmp.ties.push({ ma: da.setBookmark(CodeMirror.Pos(la, 0)), mb: db.setBookmark(CodeMirror.Pos(lb, 0)) });
    toast(`Line ${la + 1} on the left and line ${lb + 1} on the right are compared as each other's match.`, true);
  }
  runCompare();
}

function compareUntieAll() {
  for (const t of cmp.ties) { t.ma.clear(); t.mb.clear(); }
  cmp.ties = [];
  runCompare();
}

// ---------- Copy across, swap ----------
// The difference at the cursor copied to the other side: dir 1 left to right, -1 right to left. False when the cursor
// is in no difference (Alt+Left / Alt+Right then go through the tabs as usual).
function compareCopy(dir) {
  if (!cmp.on) return false;
  const h = compareSelectedLines() ?? realHunks()[currentHunk()];
  if (!h) return false;
  const [from, to] = dir > 0 ? [0, 1] : [1, 0];
  const src = cmp.sides[from].pane.cm, dst = cmp.sides[to].pane.cm;
  if (dst.getOption('readOnly') || !editable(cmp.sides[to].tab)) { toast('That side is read-only.'); return true; }
  const [sf, st] = rangeOf(h, from), [df, dt] = rangeOf(h, to);
  const lines = [];
  for (let l = sf; l < st; l++) lines.push(src.getLine(l));
  replaceLines(dst, df, dt, lines);
  return true;
}

// A selection in the active side as whole lines (a last line it only reaches the start of is not in it), with the
// lines they match on the other side, as a difference is ({ aFrom, aTo, bFrom, bTo }); null without a selection.
// A boundary inside a difference with fewer lines on the other side goes to the end of that side's part.
// Not selectedLines: tabs.js has a global function of that name (Tab on a selection), and the one loaded last replaced the other.
function compareSelectedLines() {
  const i = Math.max(0, sideIndex()), cm = cmp.sides[i].pane.cm;
  if (!cm.somethingSelected()) return null;
  const r = cm.listSelections()[cm.getDoc().sel.primIndex] ?? cm.listSelections()[0];
  const [f, t] = CodeMirror.cmpPos(r.anchor, r.head) <= 0 ? [r.anchor, r.head] : [r.head, r.anchor];
  const from = f.line, to = t.ch > 0 || t.line === f.line ? t.line + 1 : t.line;
  const across = line => { const m = matchingLine(i, line); return m.line ?? rangeOf(m.hunk, 1 - i)[1]; };
  const [of, ot] = [across(from), across(to)];
  return i === 0 ? { aFrom: from, aTo: to, bFrom: of, bTo: ot } : { aFrom: of, aTo: ot, bFrom: from, bTo: to };
}

// Lines [from, to) of an editor replaced by `lines` (as one undo step).
function replaceLines(cm, from, to, lines) {
  const n = cm.lineCount(), Pos = CodeMirror.Pos, end = l => Pos(l, cm.getLine(l).length);
  if (to < n) cm.replaceRange(lines.length ? lines.join('\n') + '\n' : '', Pos(from, 0), Pos(to, 0), '+compare');
  else if (from < n) cm.replaceRange(lines.length ? (from > 0 ? '\n' : '') + lines.join('\n') : '', from > 0 ? end(from - 1) : Pos(0, 0), end(n - 1), '+compare');
  else if (lines.length) cm.replaceRange('\n' + lines.join('\n'), end(n - 1), undefined, '+compare');
}

// Left and right change places.
async function compareSwap() {
  if (!cmp.on) return;
  const [a, b] = cmp.sides, ties = cmp.ties.map(t => ({ ma: t.mb, mb: t.ma }));
  for (const s of cmp.sides) unwatchSide(s);
  clearDecor();
  cmp.on = false;
  // The right tab into the left pane, then the left one into the right pane.
  await moveToPane(b.tab, panes[0]);
  await moveToPane(a.tab, panes[1]);
  cmp.sides = [{ ...b, pane: panes[0] }, { ...a, pane: panes[1] }];
  cmp.ties = ties;
  cmp.on = true;
  for (const s of cmp.sides) {
    await activate(s.pane, s.tab);
    watchSide(s);
  }
  await showAll();
  runCompare();
}

// ---------- The bar and the line strip ----------
function showCompareUi(on) {
  $('.mm-cmp-bar').hidden = !on;
  $('.mm-cmp-strip').hidden = !on || setting('compareStrip') === false;
  document.body.toggleAttribute('data-comparing', on);
  if (on) {
    for (const box of document.querySelectorAll('[data-cmp-opt]')) box.checked = !!setting(box.dataset.cmpOpt);
    const names = cmp.sides.map(s => s.tab.doc.path || docName(s.tab.doc));
    $('.mm-cmp-files').textContent = 'Compare';
    $('.mm-cmp-files').title = `Left: ${names[0]}\nRight: ${names[1]}`;
  }
}

// The cursor line of the active side and its match on the other, one above the other, left on top.
function drawStrip() {
  const strip = $('.mm-cmp-strip');
  if (!cmp.on || strip.hidden) return;
  const i = Math.max(0, sideIndex()), cur = cmp.sides[i].pane.cm.getCursor(), match = matchingLine(i, cur.line);
  const lines = i === 0 ? [cur.line, match.line] : [match.line, cur.line];
  const pair = match.hunk?.pairs.find(p => (i === 0 ? p.a : p.b) === cur.line);
  const labels = strip.querySelectorAll('.mm-cmp-label'), texts = strip.querySelectorAll('.mm-cmp-text');
  [0, 1].forEach(n => {
    const cm = cmp.sides[n].pane.cm, lang = cmp.sides[n].tab.doc.language;
    // A line past the end (the text changed, its differences not compared again yet): none.
    const line = lines[n] != null && lines[n] <= cm.lastLine() ? lines[n] : null;
    labels[n].innerHTML = `<span>${n === 0 ? 'L' : 'R'} ${line == null ? '' : line + 1}</span>${STRIP_ARROWS[n]}`;
    texts[n].dataset.line = line ?? '';
    if (lang) texts[n].dataset.lang = lang; else delete texts[n].dataset.lang;   // the language's colours (languages.js)
    texts[n].innerHTML = line == null ? '<span class="mm-cmp-none">(none)</span>'
      : stripHtml(cm.getLine(line), pair ? (n === 0 ? pair.ac : pair.bc) : match.hunk && !match.hunk.ignorable ? [[0, cm.getLine(line).length]] : [],
        cm.getLineTokens(line, true));
  });
  // The cursor's column in view.
  const box = strip.querySelector('.mm-cmp-texts'), span = [...texts[i].querySelectorAll('[data-from]')]
    .findLast(s => +s.dataset.from <= cur.ch);
  if (span) {
    const x = span.offsetLeft;
    if (x < box.scrollLeft + 20 || x > box.scrollLeft + box.clientWidth - 40) box.scrollLeft = Math.max(0, x - box.clientWidth / 2);
  } else box.scrollLeft = 0;
}

// The line of the other side that matches line `line` of side `i`: { line (null: none), hunk }.
function matchingLine(i, line) {
  let delta = 0;
  for (const h of cmp.hunks) {
    const [f, t] = rangeOf(h, i), [of, ot] = rangeOf(h, 1 - i);
    if (line < f) break;
    if (line < t) return { line: of + (line - f) < ot ? of + (line - f) : null, hunk: h };
    delta = ot - t;
  }
  return { line: line + delta, hunk: null };
}

// The strip's gutter: an arrow to the left pane before the left line, one to the right pane before the right line.
const STRIP_ARROWS = ['M14 8H3M7 4L3 8l4 4', 'M2 8h11M9 4l4 4-4 4'].map(d =>
  `<svg class="mm-cmp-dir" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="${d}"/></svg>`);

// A line's text for the strip: in the language's colours (the editor's tokens), spaces as a dot and tabs as an arrow,
// the differing characters marked; each piece knows where it starts in the line (data-from), for a click.
function stripHtml(text, ranges, tokens = []) {
  const out = [], tab = setting('tabSize') || 4;
  let col = 0;
  const inRange = at => ranges.some(([f, t]) => at >= f && at < t);
  const kind = new Array(text.length).fill('');
  for (const t of tokens) if (t.type) kind.fill(t.type.replace(/\S+/g, 'cm-$&'), t.start, t.end);
  for (let at = 0; at < text.length;) {
    const diff = inRange(at);
    let end = at;
    while (end < text.length && inRange(end) === diff && kind[end] === kind[at] && (text[end] === '\t') === (text[at] === '\t') && end - at < 200) {
      end++;
      if (text[at] === '\t') break;
    }
    let piece = '';
    for (let k = at; k < end; k++) {
      if (text[k] === '\t') { const w = tab - (col % tab); piece += '\u2192' + ' '.repeat(w - 1); col += w; }
      else { piece += text[k] === ' ' ? '\u00b7' : text[k]; col++; }
    }
    const ws = /^[\t ]+$/.test(text.slice(at, end));
    const cls = [diff && 'mm-cmp-char', ws ? 'mm-cmp-ws' : kind[at]].filter(Boolean).join(' ');
    out.push(`<span data-from="${at}" class="${cls}">${escapeHtml(piece)}</span>`);
    at = end;
  }
  return out.join('') || '<span data-from="0"></span>';
}

// A click on a row of the strip: that side's cursor there.
function stripClick(e) {
  const text = e.target.closest('.mm-cmp-text');
  if (!text || text.dataset.line === '' || !cmp.on) return;
  const n = [...document.querySelectorAll('.mm-cmp-strip .mm-cmp-text')].indexOf(text), cm = cmp.sides[n].pane.cm;
  let ch = cm.getLine(+text.dataset.line).length;
  const at = document.caretRangeFromPoint?.(e.clientX, e.clientY), span = at?.startContainer.parentElement?.closest('[data-from]');
  if (span) ch = +span.dataset.from + (span.textContent.startsWith('\u2192') ? 0 : at.startOffset);
  cm.setCursor(CodeMirror.Pos(+text.dataset.line, ch));
  cm.focus();
}

// ---------- The page's parts ----------
document.addEventListener('DOMContentLoaded', () => {
  $('.mm-cmp-bar').addEventListener('click', e => {
    const b = e.target.closest('[data-cmp]');
    if (!b) return;
    ({ prev: () => compareGo(-1), next: () => compareGo(1), align: compareAlign, untie: compareUntieAll,
      copyLeft: () => compareCopy(-1), copyRight: () => compareCopy(1), swap: compareSwap, close: stopCompare })[b.dataset.cmp]?.();
  });
  // The buttons leave the focus in the editor that had it (copy across, Align, Swap act on its cursor).
  $('.mm-cmp-bar').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  $('.mm-cmp-bar').addEventListener('change', e => {
    const box = e.target.closest('[data-cmp-opt]');
    if (box) setSetting(box.dataset.cmpOpt, box.checked);
  });
  $('.mm-cmp-strip').addEventListener('click', stripClick);
  $('.mm-divider').addEventListener('click', e => {
    const b = e.target.closest('.mm-cmp-go');
    if (b) compareGo(b.dataset.cmp === 'prev' ? -1 : 1);
  });
});

// A compare setting changed (applySettings, app.js).
function onCompareSettings() {
  if (!cmp.on) return;
  for (const box of document.querySelectorAll('[data-cmp-opt]')) box.checked = !!setting(box.dataset.cmpOpt);
  $('.mm-cmp-strip').hidden = setting('compareStrip') === false;
  runCompare();
}

// ---------- The left side to compare (docs/plans/executed/PLAN-explorer-compare.md) ----------
// One file or folder kept as the left side, shared with Explorer's right-click menu (the host keeps it, ExplorerMenu.cs):
// "Select as left side to compare", then on another "Compare to <its name>".
async function selectLeftSide(path) {
  if (!path) return;
  await host('compareLeftSet', { path });
  toast(`${nameOf(path) || path} is the left side to compare: right-click another one, Compare to.`, true);
}

// The menu's two items: Select as (new) left side; Compare to <name> on a path of the same kind, not the left itself.
function leftSideItems(menu, prefix, path, folder) {
  const select = menu.querySelector(`[data-cmd=${prefix}CompareLeft]`), to = menu.querySelector(`[data-cmd=${prefix}CompareTo]`);
  select.hidden = !path;
  to.hidden = true;
  host('compareLeft').then(left => {
    select.textContent = left ? 'Select as new left side to compare' : 'Select as left side to compare';
    to.hidden = !path || !left || !!left.folder !== folder || samePath(left.path, path);
    to.textContent = left ? `Compare to ${left.name}` : 'Compare to';
  }, () => {});
}

async function compareToLeftSide(right, folder) {
  const left = await host('compareLeft');
  if (!left) return;
  if (!left.exists) return toast(`The left side to compare, ${left.path}, no longer exists.`);
  if (folder) startFolderCompare(left.path, right.path);
  else startCompare({ path: left.path }, right);
}

// ---------- In the session ----------
// What the session keeps of a compare (sessionData, app.js): the two sides (a file, a draft, a document's saved text),
// the cursors and the scroll; the window as it was before (before, opened: the tabs the compare opened, modes: the
// modes of the tabs it showed in the editor). And a folder compare: the two folders, the open ones, the view.
function compareSession() {
  const out = {};
  if (cmp.on && cmp.sides) {
    const side = s => {
      const doc = s.tab.doc, of = doc.savedOf;
      if (doc.gitOf) return { git: doc.gitOf };
      if (doc.temp) return of && { saved: of.path ? { path: of.path } : { draft: of.draft } };
      return doc.path ? { path: doc.path } : { draft: doc.draft };
    };
    const [left, right] = cmp.sides.map(side);
    if (left && right) {
      out.compare = { left, right, cursors: cmp.sides.map(s => { const c = s.pane.cm.getCursor(); return [c.line, c.ch]; }),
        top: Math.round(cmp.sides[0].pane.cm.getScrollInfo().top) };
      out.before = cmp.before;
      out.opened = new Set(cmp.sides.filter(s => s.opened).map(s => s.tab));
      out.modes = new Map(cmp.sides.filter(s => !s.opened && s.mode).map(s => [s.tab, s.mode]));
    }
  }
  if (fcmp.on) out.folders = { left: fcmp.left, right: fcmp.right, open: [...fcmp.open], diffOnly: fcmp.diffOnly, git: fcmp.git };
  return out;
}

// The compare the window was in when it closed (startup, app.js); a side that is gone: no compare.
async function restoreCompare(c, f) {
  const docOf = d => d?.path ? findDoc(d.path) : d?.draft ? findDraft(d.draft) : null;
  const what = d => {
    if (d?.git) return { git: d.git };
    if (d?.path && !d.saved) return { path: d.path };
    if (d?.draft) { const tab = allTabs().find(t => t.doc.draft === d.draft); return tab && { tab }; }
    const doc = docOf(d?.saved);
    return doc && { saved: doc };
  };
  if (c && typeof c === 'object') {
    const left = what(c.left), right = what(c.right);
    cmp.restoreAt = { cursors: c.cursors, top: c.top };   // placed once the first compare is in (runCompare)
    if (left && right) await startCompare(left, right);
    if (!cmp.on) cmp.restoreAt = null;
  }
  if (f && typeof f === 'object' && f.left && f.right) {
    await startFolderCompare(f.left, f.right, f.git ?? null);
    if (!fcmp.on || !fcmp.el) return;
    if (Array.isArray(f.open)) fcmp.open = new Set(f.open);
    fcmp.diffOnly = !!f.diffOnly;
    const radio = fcmp.el.querySelector(`[name=mm-fcmp-show][value=${fcmp.diffOnly ? 'diff' : 'all'}]`);
    if (radio) radio.checked = true;
    drawFolderCompare();
  }
}

// ---------- Compare two folders (3.5) ----------
// The folder pane in compare mode: one tree of both folders, each file marked (= equal, ~ different, ? not checked
// yet, < only on the left, > only on the right), a folder by what is inside it. First by size and date (the host's
// list, FolderCompare.cs), then the contents of the files that need it, in the background (folderCheck events).
// Read-only. Enter or a double click on a file of both sides compares it; on a file of one side opens it.
// With git (docs/plans/executed/PLAN-git-compare.md): one folder against a git version, the rows from git itself (only
// what differs: ~ changed, > added or not tracked, < deleted); left and right are both the folder, git: { rev, label }.
const fcmp = { on: false, left: '', right: '', rows: [], byRel: new Map(), open: new Set(), cursor: null, check: 0,
  progress: null, diffOnly: false, el: null, list: null, frame: 0, git: null };
const FCMP_TIPS = { '=': 'Equal', '=~': 'Equal apart from what the compare ignores', '~': 'Different', '?': 'Same size, another date: not checked yet',
  '<': 'Only on the left', '>': 'Only on the right', '!': 'Could not be read' };
const GIT_TIPS = { '~': 'Changed since the version', '>': 'Added since the version, or not in git', '<': 'Deleted since the version' };

async function startFolderCompare(left, right, git = null) {
  if (fcmp.on) stopFolderCompare();
  Object.assign(fcmp, { on: true, left, right, rows: [], byRel: new Map(), open: new Set(), cursor: null, progress: null, git });
  buildFolderCompare();
  setSidebar(true);
  setSideView('folder');
  const paths = fcmp.el.querySelector('.mm-fcmp-paths');
  paths.textContent = git ? `${left} @ ${git.label}  <->  as it is now` : `${left}  <->  ${right}`;
  paths.title = git ? `Left: ${left} in git at ${git.label}\nRight: ${left} on disk` : `Left: ${left}\nRight: ${right}`;
  document.body.toggleAttribute('data-folder-compare', true);
  fcmp.list.textContent = git ? 'Asking git...' : 'Listing both folders...';
  try {
    const rows = git ? await host('gitFolderDiff', { folder: left, rev: git.rev }) : await host('folderList', { left, right });
    if (!fcmp.on) return;
    fcmp.rows = rows.map(r => ({ ...r, tip: null }));
    fcmp.byRel = new Map(fcmp.rows.map(r => [r.rel.toLowerCase(), r]));
    for (const r of fcmp.rows) if (r.dir && !r.rel.includes('\\')) fcmp.open.add(r.rel.toLowerCase());   // the first level open
  } catch (e) {
    fcmp.list.textContent = e.message;
    return;
  }
  drawFolderCompare();
  if (!git) checkFolderContents(false);
  saveSession();
}

function stopFolderCompare() {
  if (!fcmp.on) return;
  setTimeout(saveSession);   // after fcmp.on is off
  if (fcmp.check) host('folderCheckStop', { check: fcmp.check }).catch(() => {});
  fcmp.on = false;
  fcmp.check = 0;
  document.body.toggleAttribute('data-folder-compare', false);
  fcmp.el?.remove();
  fcmp.el = fcmp.list = null;
  focusFolder();
}

// The second pass: the contents of the files with the same size and another date; with the compare's options on also
// those of another size (as text they may be equal). `all`: every file on both sides.
function checkFolderContents(all) {
  if (fcmp.check) host('folderCheckStop', { check: fcmp.check }).catch(() => {});
  const opts = compareOpts(), loose = opts.whitespace || opts.case;
  const files = fcmp.rows.filter(r => !r.dir && (all ? !['<', '>'].includes(r.state) : r.state === '?' || (loose && r.state === '~')))
    .map(r => r.rel);
  if (!files.length) { fcmp.progress = null; drawFolderProgress(); return; }
  fcmp.check = Date.now() % 1e9;
  fcmp.progress = { done: 0, total: files.length };
  drawFolderProgress();
  host('folderCheck', { check: fcmp.check, left: fcmp.left, right: fcmp.right, files, whitespace: opts.whitespace, case: opts.case }).catch(e => toast(e.message));
}

function onFolderCheck(ev) {
  if (!fcmp.on || ev.check !== fcmp.check) return;
  if (ev.rel) {
    const r = fcmp.byRel.get(ev.rel.toLowerCase());
    if (r) {
      const was = r.state;
      r.state = ev.state;
      r.tip = ev.state === '=' && was === '?' ? 'Same contents, another date' : null;
    }
  }
  fcmp.progress = ev.end ? null : { done: ev.done, total: ev.total };
  if (ev.end) { fcmp.check = 0; if (ev.stopped) toast(`Checking stopped: ${ev.done} of ${ev.total} files checked.`, true); }
  if (!fcmp.frame) fcmp.frame = requestAnimationFrame(() => { fcmp.frame = 0; drawFolderCompare(); });
}

// A folder's mark: < or > when it is on one side only; else = when all inside is equal, ? when something is not
// checked yet, ~ when something differs.
function folderState(row) {
  if (row.state === '<' || row.state === '>') return row.state;
  const prefix = row.rel.toLowerCase() + '\\';
  let state = '=';
  for (const r of fcmp.rows) {
    if (r.dir || !r.rel.toLowerCase().startsWith(prefix)) continue;
    const s = r.state === '=~' ? '=' : r.state;
    if (s !== '=' && s !== '?') return '~';
    if (s === '?') state = '?';
  }
  return state;
}

const shownState = r => r.dir ? folderState(r) : r.state === '=~' ? '=' : r.state;

function drawFolderCompare() {
  if (!fcmp.on || !fcmp.list) return;
  const parts = [];
  for (const r of fcmp.rows) {
    const segs = r.rel.split('\\');
    let hidden = false;
    for (let k = 1; k < segs.length && !hidden; k++) hidden = !fcmp.open.has(segs.slice(0, k).join('\\').toLowerCase());
    if (hidden) continue;
    const state = shownState(r);
    if (fcmp.diffOnly && state === '=') continue;
    const tip = r.tip ?? (fcmp.git ? GIT_TIPS : FCMP_TIPS)[r.dir ? state : r.state] ?? '';
    parts.push(`<div class="mm-row mm-fcmp-row${r.dir ? ' mm-dir' : ''}${r.dir && fcmp.open.has(r.rel.toLowerCase()) ? ' mm-open' : ''}` +
      `${fcmp.cursor === r.rel ? ' mm-cursor' : ''}" data-rel="${escapeHtml(r.rel)}" data-state="${escapeHtml(state)}" style="padding-left:${8 + (segs.length - 1) * 14}px"` +
      ` title="${escapeHtml(r.rel + '\n' + tip)}"><span class="mm-name">${escapeHtml(segs[segs.length - 1])}</span><span class="mm-fcmp-mark">${escapeHtml(state)}</span></div>`);
  }
  fcmp.list.innerHTML = parts.join('') || `<div class="mm-fcmp-none">${fcmp.git ? `Nothing changed since ${escapeHtml(fcmp.git.label)}.` : fcmp.diffOnly ? 'No differences.' : 'Both folders are empty.'}</div>`;
  drawFolderProgress();
}

function drawFolderProgress() {
  const el = fcmp.el?.querySelector('.mm-fcmp-progress');
  if (!el) return;
  el.hidden = !fcmp.progress;
  if (fcmp.progress) el.querySelector('span').textContent = `Checking contents... ${fcmp.progress.done} of ${fcmp.progress.total}`;
}

// A row chosen: a folder opens or closes; a file of both sides is compared, a file of one side opens.
function openFolderCompareRow(rel) {
  const r = fcmp.byRel.get(rel.toLowerCase());
  if (!r) return;
  if (r.dir) {
    const k = rel.toLowerCase();
    if (fcmp.open.has(k)) fcmp.open.delete(k); else fcmp.open.add(k);
    return drawFolderCompare();
  }
  const a = fcmp.left + '\\' + rel, b = fcmp.right + '\\' + rel;
  if (fcmp.git) {
    if (r.state === '>') return openFile(b).catch(e => toast(e.message));
    if (r.state === '<') return openGitVersion(b, fcmp.git);
    return startGitCompare(b, fcmp.git.rev, fcmp.git.label);
  }
  if (r.state === '<') return openFile(a).catch(e => toast(e.message));
  if (r.state === '>') return openFile(b).catch(e => toast(e.message));
  startCompare({ path: a }, { path: b });
}

function buildFolderCompare() {
  const view = $('.mm-folder-view'), el = fcmp.el = document.createElement('div');
  el.className = 'mm-fcmp';
  el.innerHTML = `<div class="mm-fcmp-head"><b>Compare</b><span class="mm-fcmp-paths"></span><button data-fcmp="close" title="Back to the folder pane">&#10005;</button></div>
    <div class="mm-fcmp-show"><label><input type="radio" name="mm-fcmp-show" value="all" checked> All</label>
      <label><input type="radio" name="mm-fcmp-show" value="diff"> Differences only</label></div>
    <div class="mm-fcmp-actions"><button data-fcmp="checkAll" title="Compare the contents of every file on both sides, also those that size and date say are equal">Check all contents</button><button data-fcmp="refresh" title="Read both folders again">Refresh</button></div>
    <div class="mm-fcmp-progress" hidden><span></span><button data-fcmp="stop">Stop</button></div>
    <div class="mm-fcmp-legend" title="= equal, ~ different, ? not checked yet (same size, another date), &lt; only on the left, &gt; only on the right">= equal &nbsp;~ different &nbsp;? to check &nbsp;&lt; left only &nbsp;&gt; right only</div>
    <div class="mm-fcmp-tree" tabindex="0"></div>`;
  view.prepend(el);
  fcmp.list = el.querySelector('.mm-fcmp-tree');
  if (fcmp.git) {   // git lists only what differs: no contents to check, no All / Differences only
    el.querySelector('[data-fcmp=checkAll]').hidden = true;
    el.querySelector('.mm-fcmp-show').hidden = true;
    const legend = el.querySelector('.mm-fcmp-legend');
    legend.textContent = '~ changed   > added or not in git   < deleted';
    legend.title = `Against ${fcmp.git.label}: ~ changed, > added since (or not in git), < deleted since`;
  }
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-fcmp]');
    if (b?.dataset.fcmp === 'close') return stopFolderCompare();
    if (b?.dataset.fcmp === 'stop' && fcmp.check) return host('folderCheckStop', { check: fcmp.check });
    if (b?.dataset.fcmp === 'checkAll') return checkFolderContents(true);
    if (b?.dataset.fcmp === 'refresh') return startFolderCompare(fcmp.left, fcmp.right, fcmp.git);
    const row = e.target.closest('.mm-fcmp-row');
    if (!row) return;
    fcmp.cursor = row.dataset.rel;
    if (row.classList.contains('mm-dir')) return openFolderCompareRow(row.dataset.rel);
    // Double-click on a file: the two files compared (or the one side's file opened). The first click redraws the
    // list, so the browser's dblclick never comes; the click count does.
    if (e.detail === 2) return openFolderCompareRow(row.dataset.rel);
    drawFolderCompare();
  });
  el.addEventListener('change', e => { if (e.target.name === 'mm-fcmp-show') { fcmp.diffOnly = e.target.value === 'diff'; drawFolderCompare(); } });
  fcmp.list.addEventListener('keydown', e => {
    const rows = [...fcmp.list.querySelectorAll('.mm-fcmp-row')], at = rows.findIndex(r => r.dataset.rel === fcmp.cursor);
    const go = n => { const r = rows[Math.max(0, Math.min(rows.length - 1, n))]; if (r) { fcmp.cursor = r.dataset.rel; drawFolderCompare(); fcmp.list.querySelector('.mm-cursor')?.scrollIntoView({ block: 'nearest' }); } };
    const row = rows[at], k = row?.dataset.rel.toLowerCase();
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'ArrowRight' && row?.classList.contains('mm-dir') && !fcmp.open.has(k)) openFolderCompareRow(row.dataset.rel);
    else if (e.key === 'ArrowLeft' && row?.classList.contains('mm-dir') && fcmp.open.has(k)) openFolderCompareRow(row.dataset.rel);
    else if (e.key === 'Enter' && row) openFolderCompareRow(row.dataset.rel);
    else return;
    e.preventDefault();
  });
  // The right-click menu: compare (a file), refresh. Check all contents is a button above the list (it is about every
  // file, not the one clicked).
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    const row = e.target.closest('.mm-fcmp-row');
    if (row) fcmp.cursor = row.dataset.rel;
    const menu = $('.mm-fcmp-menu');
    menu.querySelector('[data-fcmp-do=compare]').hidden = !row || row.classList.contains('mm-dir') || ['<', '>'].includes(row.dataset.state);
    menu.hidden = false;
    menu.style.left = Math.min(e.clientX, innerWidth - menu.offsetWidth - 4) + 'px';
    menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 4) + 'px';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  events.folderCheck = onFolderCheck;
  const menu = document.createElement('div');
  menu.className = 'mm-menu mm-context mm-fcmp-menu';
  menu.hidden = true;
  menu.innerHTML = '<button data-fcmp-do="compare">Compare</button><button data-fcmp-do="refresh">Refresh</button>';
  document.body.append(menu);
  menu.addEventListener('click', e => {
    const what = e.target.closest('[data-fcmp-do]')?.dataset.fcmpDo;
    menu.hidden = true;
    if (what === 'compare' && fcmp.cursor) openFolderCompareRow(fcmp.cursor);
    else if (what === 'refresh') startFolderCompare(fcmp.left, fcmp.right, fcmp.git);
  });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; }, true);
});

// ---------- Compare with git (docs/plans/executed/PLAN-git-compare.md) ----------
// The file as a git version has it on the left (read-only, "name @ version"), the file as it is on the right (its tab
// when open, unsaved edits included). rev: HEAD, a branch or a commit; label: how it is named.
function startGitCompare(path, rev = 'HEAD', label = 'HEAD') {
  const tab = allTabs().find(t => samePath(t.doc.path, path));
  return startCompare({ git: { path, rev, label } }, tab ? { tab } : { path });
}

// A file deleted since the version (a < row): that version alone, read-only, in the active pane.
async function openGitVersion(path, git) {
  const pane = panes[state.activePane], side = await placeSide(pane, { git: { path, rev: git.rev, label: git.label } });
  if (side) await activate(pane, side.tab);
}

// The versions to compare with, as a menu at x, y: the last commit, the branches, the file's (or folder's) own history.
async function gitVersionMenu(path, folder, x, y) {
  const v = await host('gitVersions', { path }).catch(() => null);
  if (!v) return toast(`${nameOf(path) || path} is not in a git repository.`);
  const run = (rev, label) => () => folder ? startFolderCompare(path, path, { rev, label }) : startGitCompare(path, rev, label);
  const items = [{ label: 'HEAD (the last commit)', plain: true, key: v.current ?? '', run: run('HEAD', 'HEAD') }];
  if (v.branches.length) items.push({ label: 'Branch', plain: true, sub: v.branches.map(b => ({ label: b, plain: true, key: b === v.current ? 'current' : '', run: run(b, b) })) });
  items.push({ label: folder ? 'History of this folder' : 'History of this file', plain: true,
    sub: v.commits.length ? v.commits.map(c => ({ label: `${c.short}  ${c.date}  ${c.subject}`, plain: true, key: c.author, run: run(c.id, c.short) }))
      : [{ label: 'No commits yet', plain: true, run: () => {} }] });
  openPopupMenu(items, x, y);
}

// The menu items of a file or folder (the tab menu, the folder pane): Compare with Git (HEAD) when it differs from the
// last commit (a file: also with unsaved edits), Compare with Git version... when it is in git. Hidden until git says.
function gitCompareItems(menu, prefix, path, dirty) {
  const now = menu.querySelector(`[data-cmd=${prefix}CompareGit]`), version = menu.querySelector(`[data-cmd=${prefix}CompareGitVersion]`);
  now.hidden = version.hidden = true;
  if (!path) return;
  host('gitState', { path }).then(s => {
    if (!s) return;
    version.hidden = false;
    now.hidden = !s.changed && !dirty;
  }, () => {});
}
