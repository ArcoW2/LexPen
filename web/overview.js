'use strict';
// The overview ruler (docs/plans/executed/PLAN-overview-ruler.md): the editor's vertical scroll bar, a strip at its
// right with a mark for each find match, unsaved change, git change and bookmark at its height in the file, and a block
// for the part of the text in view (always there; the setting overview that switched it off is gone). Drag the block to scroll; a click on a mark goes to its line, a click elsewhere
// scrolls there (and the drag goes on from there); the wheel over it scrolls.
// The setting overview.<kind> shows or hides each kind of mark, overviewWidth sets its width. The marks come from where they are made
// (find.js: pane.findLines; gutter.js: pane.changeHunks, pane.gitHunks; bookmarks.js: bookmarkList), not from the
// gutter columns, so a kind can be in the strip while its gutter column is off. Loaded with the editor.

// The strip's width in px: the setting overviewWidth (app.css takes it as --mm-overview-w, set by applyOverview).
const overviewWidth = () => Math.min(40, Math.max(10, +setting('overviewWidth') || 20));
const OVERVIEW_KINDS = [
  ['find', 'Find matches'], ['changes', 'Unsaved changes'], ['git', 'Git changes'], ['bookmarks', 'Bookmarks'],
];
const overviewOn = () => true;   // the editor's scroll bar: always there

// CodeMirror's own scroll bars without the vertical one (the strip is that): only the horizontal one, and no room kept
// for a vertical one, so scrolling sideways counts the editor's whole width (the setting scrollMargin is exact on
// the right too). The editor's option scrollbarStyle (app.js).
CodeMirror.scrollbarModel.mmHorizontal = class extends CodeMirror.scrollbarModel.native {
  update(measure) { return super.update({ ...measure, scrollHeight: measure.clientHeight }); }
};
const overviewKind = kind => overviewOn() && setting('overview.' + kind) !== false;

function setupOverview(pane) {
  const cm = pane.cm, wrapper = cm.getWrapperElement();
  const canvas = pane.overviewEl = document.createElement('canvas');
  canvas.className = 'mm-overview';
  canvas.title = '';
  const view = pane.overviewView = document.createElement('div');   // the block: the part of the text in view
  view.className = 'mm-overview-view';
  pane.editorEl.append(canvas, view);   // next to the editor, outside the text: the text never runs under it (app.css)
  canvas.addEventListener('mousedown', e => { e.preventDefault(); overviewDown(pane, e); });
  canvas.addEventListener('mousemove', e => { canvas.title = overviewTip(pane, e) ?? ''; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); cm.scrollTo(null, cm.getScrollInfo().top + e.deltaY); }, { passive: false });
  cm.on('scroll', () => placeOverviewView(pane));
  cm.on('refresh', () => scheduleOverview(pane));
  cm.on('swapDoc', () => scheduleOverview(pane));
  new ResizeObserver(() => scheduleOverview(pane)).observe(wrapper);
  applyOverview();
}

// The setting changed (applySettings, app.js): the strip shown or hidden, the marks drawn again.
function applyOverview() {
  document.body.dataset.overview = overviewOn() ? 'on' : 'off';
  document.body.style.setProperty('--mm-overview-w', overviewWidth() + 'px');
  for (const pane of panes) if (pane.cm) { pane.cm.refresh(); scheduleOverview(pane); }
}

function scheduleOverview(pane) {
  if (!pane?.overviewEl || pane.overviewFrame) return;
  pane.overviewFrame = requestAnimationFrame(() => { pane.overviewFrame = 0; drawOverview(pane); });
}

// The marks: { kind, from, to (lines, to included), colour }, in the order they are drawn (find matches on top).
function overviewMarks(pane) {
  const cm = pane.cm, doc = pane.active?.doc, out = [];
  if (!doc || pane.el.dataset.mode === 'preview') return out;
  const css = getComputedStyle(document.body), colour = name => css.getPropertyValue(name).trim();
  const hunks = (list, kind, changed, added) => {
    for (const h of list ?? []) {
      const from = Math.min(h.bFrom, cm.lastLine()), to = Math.max(from, Math.min(h.bTo - 1, cm.lastLine()));
      out.push({ kind, from, to, colour: h.aFrom === h.aTo ? added : h.bFrom === h.bTo ? colour('--git-deleted') : changed });
    }
  };
  if (overviewKind('changes')) hunks(pane.changeHunks, 'changes', colour('--warning'), colour('--warning'));
  if (overviewKind('git')) hunks(pane.gitHunks, 'git', colour('--git-modified'), colour('--git-added'));
  // Bookmarks before the find matches: a match on a bookmark's line is drawn over it.
  if (overviewKind('bookmarks') && typeof bookmarkList === 'function')
    for (const { line } of bookmarkList(doc)) out.push({ kind: 'bookmarks', from: line, to: line, colour: colour('--accent') });
  if (overviewKind('find')) {   // lines in a row as one mark: a common word can be on a hundred thousand lines
    const c = colour('--find-current');
    for (const line of pane.findLines ?? []) {
      const last = out[out.length - 1];
      if (last?.kind === 'find' && last.to === line - 1) last.to = line;
      else out.push({ kind: 'find', from: line, to: line, colour: c });
    }
  }
  return out;
}

// The lanes, by the strip's width (after the light line at 0): unsaved changes and git changes a fifth each, then a
// bookmark from there to the right edge with a find match over its right third. At 16 px: 3, 3, 9 and 5 px.
function overviewLanes(width) {
  const inner = width - 1, side = Math.max(2, Math.round(inner / 5)), find = Math.max(3, Math.round(inner / 3));
  return { changes: [1, side], git: [1 + side, side], bookmarks: [1 + 2 * side, width - 1 - 2 * side], find: [width - find, find] };
}

// Where a place in the text goes on the strip. The block (the part in view) is as high as the view is of the whole
// text, at least OVERVIEW_THUMB px, and runs from the top of the strip (the text at its start) to the bottom (at its
// end), as a scroll bar's thumb does. A place is drawn where the block's middle is when that place is in the middle
// of the view: click a mark and the block lands on it.
const OVERVIEW_THUMB = 24;
const OVERVIEW_SNAP = 3;   // px: a dragged block's middle this near a mark snaps to it
function overviewGeometry(pane) {
  const cm = pane.cm, info = cm.getScrollInfo(), wrapper = cm.getWrapperElement();
  const vbar = wrapper.querySelector('.CodeMirror-vscrollbar'), hbar = wrapper.querySelector('.CodeMirror-hscrollbar');
  const bottom = hbar && hbar.style.display !== 'none' ? hbar.offsetHeight : 0;
  const track = Math.max(1, wrapper.clientHeight - bottom);
  const total = Math.max(info.height, 1), count = cm.lineCount(), range = Math.max(0, total - info.clientHeight);
  const thumb = range ? Math.min(track, Math.max(OVERVIEW_THUMB, track * info.clientHeight / total)) : track;
  // A height in the text -> y on the strip; and back (a click): a y -> the scroll position that puts the thumb there.
  const yOf = h => range ? Math.min(1, Math.max(0, (h - info.clientHeight / 2) / range)) * (track - thumb) + thumb / 2 : h / total * track;
  const scrollOf = y => range ? Math.min(1, Math.max(0, (y - thumb / 2) / Math.max(1, track - thumb))) * range : 0;
  // A line's height in the text, sampled about twice per pixel of the strip and filled in between: asking the
  // editor for every mark took most of the drawing with thousands of marks (a common word in a long file).
  const step = Math.max(1, Math.floor(count / (track * 2))), samples = [];
  for (let l = 0; l <= count; l += step) samples.push(l < count ? cm.heightAtLine(l, 'local') : total);
  const top = line => {
    if (line >= count) return total;
    const i = Math.min(Math.floor(line / step), samples.length - 1), at = samples[i];
    const next = i + 1 < samples.length ? samples[i + 1] : total, span = Math.min(step, count - i * step) || 1;
    return at + (next - at) * (line - i * step) / span;
  };
  const blockTop = () => range ? Math.min(1, cm.getScrollInfo().top / range) * (track - thumb) : 0;
  return { height: track, yOf, scrollOf, lineTop: top, thumb, range, blockTop };
}

function drawOverview(pane) {
  const canvas = pane.overviewEl, cm = pane.cm;
  if (!canvas || !cm) return;
  const show = overviewOn() && pane.active && pane.el.dataset.mode !== 'preview';
  canvas.hidden = pane.overviewView.hidden = !show;
  if (!show) return;
  const g = overviewGeometry(pane), ratio = devicePixelRatio || 1;
  canvas.style.top = pane.overviewView.style.top = cm.getWrapperElement().offsetTop + 'px';
  pane.overviewGeometry = g;
  placeOverviewView(pane);
  canvas.style.height = g.height + 'px';
  const width = overviewWidth(), lanes = overviewLanes(width);
  canvas.width = width * ratio;
  canvas.height = Math.round(g.height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, g.height);
  pane.overviewDrawn = [];
  for (const m of overviewMarks(pane)) {
    // From the middle of the first line to the middle of the last, at least a few pixels, centred on that.
    const a = g.yOf((g.lineTop(m.from) + g.lineTop(m.from + 1)) / 2), b = g.yOf((g.lineTop(m.to) + g.lineTop(m.to + 1)) / 2);
    const [x, w] = lanes[m.kind], h = Math.max(4, b - a);
    const y = Math.min(Math.max(0, (a + b) / 2 - h / 2), g.height - h);
    ctx.fillStyle = m.colour;
    ctx.fillRect(x, y, w, h);
    pane.overviewDrawn.push({ ...m, top: y, bottom: y + h });
  }
}

// The mark under the pointer (within a few pixels), else null.
function overviewHit(pane, e) {
  const y = e.clientY - pane.overviewEl.getBoundingClientRect().top;
  let best = null, gap = 4;
  for (const m of pane.overviewDrawn ?? []) {
    const d = y < m.top ? m.top - y : y > m.bottom ? y - m.bottom : 0;
    if (d <= gap) { best = m; gap = d; }
  }
  return { mark: best, y };
}

const OVERVIEW_NAMES = { find: 'Find match', changes: 'Unsaved change', git: 'Git change', bookmarks: 'Bookmark' };
function overviewTip(pane, e) {
  const { mark } = overviewHit(pane, e);
  return mark ? `${OVERVIEW_NAMES[mark.kind]}, line ${mark.from + 1}` : null;
}

// The block over the strip, where the text is scrolled to (on every scroll: only the block moves, the marks stay).
function placeOverviewView(pane) {
  const g = pane.overviewGeometry, view = pane.overviewView;
  if (!g || !view || view.hidden) return;
  view.style.height = g.thumb + 'px';
  view.style.transform = `translateY(${g.blockTop()}px)`;
}

// The mouse down on the strip: on the block it drags (the text follows the mouse, a mark near the block's middle
// holding it on that mark's line); on a mark the cursor goes to its
// line, the line in the middle (the block then on the mark), also on a mark under the block when the mouse does not
// move; elsewhere the text scrolls so the block's middle is there, and the drag goes on from there.
function overviewDown(pane, e) {
  const cm = pane.cm, g = overviewGeometry(pane), { mark, y } = overviewHit(pane, e), top = g.blockTop();
  const onBlock = g.range && y >= top && y <= top + g.thumb;
  // A line in the middle of the view, by its exact height (the strip's heights are sampled: close enough to draw,
  // not to land on a line).
  const centred = line => {
    const at = cm.heightAtLine(line, 'local'), next = line < cm.lastLine() ? cm.heightAtLine(line + 1, 'local') : at;
    return Math.min(g.range, Math.max(0, (at + next) / 2 - cm.getScrollInfo().clientHeight / 2));
  };
  const toMark = () => {
    cm.setCursor(CodeMirror.Pos(mark.from, 0));
    cm.scrollTo(null, centred(mark.from));
    cm.focus();
  };
  if (!onBlock && mark) return toMark();
  if (!g.range) return;
  if (!onBlock) cm.scrollTo(null, g.scrollOf(y));
  const startY = e.clientY, startTop = cm.getScrollInfo().top, perPx = g.range / Math.max(1, g.height - g.thumb);
  let moved = false;
  pane.overviewView.classList.add('mm-dragging');
  // A mark the block's middle comes near holds it: its line in the middle of the view, as a click on it does. In a
  // long file a pixel of the strip is hundreds of lines, so the mouse alone cannot reach that line.
  const move = ev => {
    if (Math.abs(ev.clientY - startY) > 2) moved = true;
    if (!moved) return;
    let top = Math.min(g.range, Math.max(0, startTop + (ev.clientY - startY) * perPx));
    const middle = top / g.range * (g.height - g.thumb) + g.thumb / 2;
    let near = null, gap = OVERVIEW_SNAP + 1;
    for (const m of pane.overviewDrawn ?? []) {   // by whole pixels; marks as near as each other: the first in the text
      const d = Math.round(Math.abs((m.top + m.bottom) / 2 - middle));
      if (d < gap || (d === gap && (!near || m.from < near.from))) { near = m; gap = d; }
    }
    if (near) top = centred(near.from);
    cm.scrollTo(null, top);
  };
  const up = () => {
    removeEventListener('mousemove', move);
    removeEventListener('mouseup', up);
    pane.overviewView.classList.remove('mm-dragging');
    if (!moved && onBlock && mark) toMark();   // a click, not a drag, on a mark under the block
  };
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
}
