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
};
const COMPARE_DELAY = 300;     // ms after an edit before comparing again

// ---------- Starting and leaving ----------
// `left`, `right`: { path } a file, { tab } an open tab, { saved: doc } the text of a document as last saved.
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
    s.pane.cm.setOption('lineWrapping', false);   // a wrapped line would take more rows on one side than the other
    watchSide(s);
  }
  showCompareUi(true);
  afterPaneChange();
  runCompare(true);
}

// A side in its pane: an open tab moves there, a file opens there, a saved text gets a read-only tab of its own.
async function placeSide(pane, what) {
  if (what.saved) {
    const doc = makeDoc({ text: what.saved.savedText ?? docText(what.saved) });
    doc.temp = true;   // not kept in the session (saveSession), closed when the compare ends
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
  clearTimeout(cmp.timer);
  clearDecor();
  showCompareUi(false);
  for (const s of sides) {
    unwatchSide(s);
    if (s.pane.cm) s.pane.cm.setOption('lineWrapping', setting('wrap'));
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
}

// ---------- Watching the two editors ----------
function watchSide(s) {
  const cm = s.pane.cm;
  s.onScroll = () => followScroll(s);
  s.onChange = () => { clearTimeout(cmp.timer); cmp.timer = setTimeout(() => runCompare(), COMPARE_DELAY); };
  s.onCursor = () => { drawStrip(); showCompareCount(); };
  s.onSwap = () => { if (cmp.on && cm.getDoc() !== s.tab.cmDoc) stopCompare(); };   // another tab here, or closed
  cm.on('scroll', s.onScroll);
  cm.on('changes', s.onChange);
  cm.on('cursorActivity', s.onCursor);
  cm.on('swapDoc', s.onSwap);
}

function unwatchSide(s) {
  const cm = s.pane.cm;
  if (!cm || !s.onScroll) return;
  cm.off('scroll', s.onScroll);
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
  if (Math.abs(from.top - to.top) < 1 && Math.abs(from.left - to.left) < 1) return;
  other.ignoreScroll = true;
  other.pane.cm.scrollTo(from.left, from.top);
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
    if (first) compareGo(1, true);
  };
  cmp.worker.postMessage({ id, a, b, opts: compareOpts(), ties });
}

// The differences drawn: the line tints, the changed characters, the fillers, the ties, the overview's marks.
function applyCompare() {
  clearDecor();
  const lh = cmp.sides[0].pane.cm.defaultTextHeight();
  cmp.sides.forEach((s, i) => {
    const cm = s.pane.cm, d = cmp.decor[i] = { lines: [], marks: [], widgets: [] }, marks = [];
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
        if (other > n) {   // this side lacks lines: a filler as high as the missing lines
          const el = document.createElement('div');
          el.className = 'mm-cmp-filler' + (h.ignorable ? ' mm-cmp-quiet' : '');
          el.style.height = (other - n) * lh + 'px';
          const at = n ? to - 1 : from - 1;
          d.widgets.push(at >= 0 ? cm.addLineWidget(Math.min(at, cm.lastLine()), el) : cm.addLineWidget(0, el, { above: true }));
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
  followScroll(cmp.sides[state.activePane] ?? cmp.sides[0]);
  showCompareCount();
  drawStrip();
}

function clearDecor() {
  cmp.decor.forEach((d, i) => {
    const cm = cmp.sides?.[i]?.pane.cm;
    if (!d || !cm) return;
    cm.operation(() => {
      for (const [h, cls, where] of d.lines) cm.removeLineClass(h, where ?? 'background', cls);
      for (const m of d.marks) m.clear();
      for (const w of d.widgets) w.clear();
    });
  });
  cmp.decor = [null, null];
  for (const p of panes) if (p.compareMarks) { p.compareMarks = null; if (typeof scheduleOverview === 'function') scheduleOverview(p); }
}

// ---------- Moving through the differences ----------
const realHunks = () => cmp.hunks.filter(h => !h.ignorable);
const sideIndex = () => cmp.sides?.findIndex(s => s.pane.index === state.activePane) ?? -1;
const rangeOf = (h, i) => i === 0 ? [h.aFrom, h.aTo] : [h.bFrom, h.bTo];

// The difference the cursor of the active side is in (a removal: on the line after it), else -1.
function currentHunk() {
  const i = Math.max(0, sideIndex()), line = cmp.sides[i].pane.cm.getCursor().line;
  return realHunks().findIndex(h => { const [f, t] = rangeOf(h, i); return f === t ? line === f : line >= f && line < t; });
}

// F7 / Shift+F7: the next / previous difference after (before) the cursor's line; both cursors there, a third down.
function compareGo(dir, fromTop) {
  if (!cmp.on) return;
  const list = realHunks(), i = Math.max(0, sideIndex()), line = fromTop ? -1 : cmp.sides[i].pane.cm.getCursor().line;
  const h = dir > 0 ? list.find(h => rangeOf(h, i)[0] > line) : list.findLast(h => rangeOf(h, i)[0] < line);
  if (!h) { if (!fromTop) toast(dir > 0 ? 'No more differences below.' : 'No more differences above.', true); return; }
  cmp.sides.forEach((s, n) => {
    const cm = s.pane.cm, at = Math.min(rangeOf(h, n)[0], cm.lastLine());
    cm.setCursor(CodeMirror.Pos(at, 0));
  });
  const cm = cmp.sides[i].pane.cm, at = Math.min(rangeOf(h, i)[0], cm.lastLine());
  cm.scrollTo(null, Math.max(0, cm.heightAtLine(at, 'local') - cm.getScrollInfo().clientHeight / 3));
  if (!fromTop) cm.focus();
  showCompareCount();
}

function showCompareCount() {
  const el = $('.mm-cmp-count');
  if (!el || !cmp.on) return;
  const list = realHunks(), at = currentHunk();
  el.textContent = !cmp.hunks.length ? 'No differences' : !list.length ? 'Equal apart from what is ignored'
    : at >= 0 ? `${at + 1} of ${list.length}` : `${list.length} difference${list.length === 1 ? '' : 's'}`;
  const inside = at >= 0;
  for (const b of document.querySelectorAll('[data-cmp=copyLeft], [data-cmp=copyRight]')) b.disabled = !inside;
  const eols = cmp.sides.map(s => s.tab.doc.eol);
  $('.mm-cmp-note').textContent = eols[0] !== eols[1] ? 'Line endings differ (not counted)' : '';
  $('[data-cmp=untie]').hidden = !cmp.ties.length;
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
  const at = currentHunk();
  if (at < 0) return false;
  const h = realHunks()[at], [from, to] = dir > 0 ? [0, 1] : [1, 0];
  const src = cmp.sides[from].pane.cm, dst = cmp.sides[to].pane.cm;
  if (dst.getOption('readOnly') || !editable(cmp.sides[to].tab)) { toast('That side is read-only.'); return true; }
  const [sf, st] = rangeOf(h, from), [df, dt] = rangeOf(h, to);
  const lines = [];
  for (let l = sf; l < st; l++) lines.push(src.getLine(l));
  replaceLines(dst, df, dt, lines);
  return true;
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
    s.pane.cm.setOption('lineWrapping', false);
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
    const line = lines[n], cm = cmp.sides[n].pane.cm;
    labels[n].textContent = (n === 0 ? 'L ' : 'R ') + (line == null ? '' : line + 1);
    texts[n].dataset.line = line ?? '';
    texts[n].innerHTML = line == null ? '<span class="mm-cmp-none">(none)</span>'
      : stripHtml(cm.getLine(line), pair ? (n === 0 ? pair.ac : pair.bc) : match.hunk && !match.hunk.ignorable ? [[0, cm.getLine(line).length]] : []);
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

// A line's text for the strip: spaces as a dot and tabs as an arrow, the differing characters marked; each piece
// knows where it starts in the line (data-from), for a click.
function stripHtml(text, ranges) {
  const out = [], tab = setting('tabSize') || 4;
  let col = 0;
  const inRange = at => ranges.some(([f, t]) => at >= f && at < t);
  for (let at = 0; at < text.length;) {
    const diff = inRange(at);
    let end = at;
    while (end < text.length && inRange(end) === diff && (text[end] === '\t') === (text[at] === '\t') && end - at < 200) {
      end++;
      if (text[at] === '\t') break;
    }
    let piece = '';
    for (let k = at; k < end; k++) {
      if (text[k] === '\t') { const w = tab - (col % tab); piece += '\u2192' + ' '.repeat(w - 1); col += w; }
      else { piece += text[k] === ' ' ? '\u00b7' : text[k]; col++; }
    }
    const ws = /^[\t ]+$/.test(text.slice(at, end));
    out.push(`<span data-from="${at}" class="${diff ? 'mm-cmp-char ' : ''}${ws ? 'mm-cmp-ws' : ''}">${escapeHtml(piece)}</span>`);
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
  $('.mm-cmp-bar').addEventListener('change', e => {
    const box = e.target.closest('[data-cmp-opt]');
    if (box) setSetting(box.dataset.cmpOpt, box.checked);
  });
  $('.mm-cmp-strip').addEventListener('click', stripClick);
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

// ---------- Compare two folders (3.5) ----------
// The folder pane in compare mode: one tree of both folders, each file marked (= equal, ~ different, ? not checked
// yet, < only on the left, > only on the right), a folder by what is inside it. First by size and date (the host's
// list, FolderCompare.cs), then the contents of the files that need it, in the background (folderCheck events).
// Read-only. Enter or a double click on a file of both sides compares it; on a file of one side opens it.
const fcmp = { on: false, left: '', right: '', rows: [], byRel: new Map(), open: new Set(), cursor: null, check: 0,
  progress: null, diffOnly: false, el: null, list: null, frame: 0 };
const FCMP_TIPS = { '=': 'Equal', '=~': 'Equal apart from what the compare ignores', '~': 'Different', '?': 'Same size, another date: not checked yet',
  '<': 'Only on the left', '>': 'Only on the right', '!': 'Could not be read' };

async function startFolderCompare(left, right) {
  if (fcmp.on) stopFolderCompare();
  Object.assign(fcmp, { on: true, left, right, rows: [], byRel: new Map(), open: new Set(), cursor: null, progress: null });
  buildFolderCompare();
  setSidebar(true);
  setSideView('folder');
  fcmp.el.querySelector('.mm-fcmp-paths').textContent = `${left}  <->  ${right}`;
  fcmp.el.querySelector('.mm-fcmp-paths').title = `Left: ${left}\nRight: ${right}`;
  document.body.toggleAttribute('data-folder-compare', true);
  fcmp.list.textContent = 'Listing both folders...';
  try {
    const rows = await host('folderList', { left, right });
    if (!fcmp.on) return;
    fcmp.rows = rows.map(r => ({ ...r, tip: null }));
    fcmp.byRel = new Map(fcmp.rows.map(r => [r.rel.toLowerCase(), r]));
    for (const r of fcmp.rows) if (r.dir && !r.rel.includes('\\')) fcmp.open.add(r.rel.toLowerCase());   // the first level open
  } catch (e) {
    fcmp.list.textContent = e.message;
    return;
  }
  drawFolderCompare();
  checkFolderContents(false);
}

function stopFolderCompare() {
  if (!fcmp.on) return;
  if (fcmp.check) host('folderCheckStop', { check: fcmp.check }).catch(() => {});
  fcmp.on = false;
  fcmp.check = 0;
  document.body.toggleAttribute('data-folder-compare', false);
  fcmp.el?.remove();
  fcmp.el = fcmp.list = null;
  ui.tree.focus?.();
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
    const tip = r.tip ?? FCMP_TIPS[r.dir ? state : r.state] ?? '';
    parts.push(`<div class="mm-row mm-fcmp-row${r.dir ? ' mm-dir' : ''}${r.dir && fcmp.open.has(r.rel.toLowerCase()) ? ' mm-open' : ''}` +
      `${fcmp.cursor === r.rel ? ' mm-cursor' : ''}" data-rel="${escapeHtml(r.rel)}" data-state="${escapeHtml(state)}" style="padding-left:${8 + (segs.length - 1) * 14}px"` +
      ` title="${escapeHtml(r.rel + '\n' + tip)}"><span class="mm-name">${escapeHtml(segs[segs.length - 1])}</span><span class="mm-fcmp-mark">${escapeHtml(state)}</span></div>`);
  }
  fcmp.list.innerHTML = parts.join('') || `<div class="mm-fcmp-none">${fcmp.diffOnly ? 'No differences.' : 'Both folders are empty.'}</div>`;
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
    <div class="mm-fcmp-progress" hidden><span></span><button data-fcmp="stop">Stop</button></div>
    <div class="mm-fcmp-legend" title="= equal, ~ different, ? not checked yet (same size, another date), &lt; only on the left, &gt; only on the right">= equal &nbsp;~ different &nbsp;? to check &nbsp;&lt; left only &nbsp;&gt; right only</div>
    <div class="mm-fcmp-tree" tabindex="0"></div>`;
  view.prepend(el);
  fcmp.list = el.querySelector('.mm-fcmp-tree');
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-fcmp]');
    if (b?.dataset.fcmp === 'close') return stopFolderCompare();
    if (b?.dataset.fcmp === 'stop' && fcmp.check) return host('folderCheckStop', { check: fcmp.check });
    const row = e.target.closest('.mm-fcmp-row');
    if (row) { fcmp.cursor = row.dataset.rel; if (row.classList.contains('mm-dir')) openFolderCompareRow(row.dataset.rel); else drawFolderCompare(); }
  });
  el.addEventListener('dblclick', e => { const row = e.target.closest('.mm-fcmp-row:not(.mm-dir)'); if (row) openFolderCompareRow(row.dataset.rel); });
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
  // The right-click menu: check all contents, compare (a file), refresh.
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
  menu.innerHTML = '<button data-fcmp-do="checkAll">Check contents of all</button><button data-fcmp-do="compare">Compare</button><button data-fcmp-do="refresh">Refresh</button>';
  document.body.append(menu);
  menu.addEventListener('click', e => {
    const what = e.target.closest('[data-fcmp-do]')?.dataset.fcmpDo;
    menu.hidden = true;
    if (what === 'checkAll') checkFolderContents(true);
    else if (what === 'compare' && fcmp.cursor) openFolderCompareRow(fcmp.cursor);
    else if (what === 'refresh') startFolderCompare(fcmp.left, fcmp.right);
  });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; }, true);
});
