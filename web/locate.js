'use strict';
// Locate the cursor (docs/plans/02-PLAN-locate-cursor.md): a short tap on Ctrl alone shows rings that shrink onto every
// cursor of the editor with the focus, in the find box's colour; a cursor out of view gets a marker at that edge (top:
// higher, bottom: lower; left / right for a long line) with its line number. Settings locateCursor (the tap on / off),
// locateCursorTap (the longest tap, ms) and locateCursorJump (a double tap scrolls to the cursor). Also the action
// locateCursor. Only draws: the document and the selection stay as they are.
// Loaded after cursors.js, before app.js.

const LOCATE_MS = 1100;   // the rings' animation and the delays between them (app.css), then the layer goes
const locate = { down: null, lastTap: 0, layer: null, timer: 0 };

// The pane to show it for: the editor with the focus, else the pane whose find bar has it; never in a dialog.
function locatePane() {
  if (document.querySelector('dialog[open]')) return null;
  const at = document.activeElement;
  const pane = panes.find(p => p.cm?.hasFocus()) ?? panes.find(p => p.cm && p.el.contains(at));
  return pane?.active && pane.el.dataset.mode !== 'preview' ? pane : null;
}

// Every cursor's place in window coordinates: a block's head, or each selection's head (past the line's end too).
function cursorSpots(cm) {
  const spot = (line, ch, past) => {
    const at = cm.charCoords(CodeMirror.Pos(line, ch), 'window');
    const left = past != null ? at.left + (past - lineEndCol(cm, line)) * charWidth(cm) : at.left;
    return { line, x: left, top: at.top, bottom: at.bottom };
  };
  const b = blockOf(cm);
  if (b) {
    const end = lineEndCol(cm, b.head.line);
    return [spot(b.head.line, chAtCol(cm, b.head.line, b.head.col), b.head.col > end ? b.head.col : null)];
  }
  return cm.listSelections().map(r => spot(r.head.line, r.head.ch, pastColOf(cm, r)));
}

// The visible text area in window coordinates.
function locateView(cm) {
  const wrapper = cm.getWrapperElement(), rect = wrapper.getBoundingClientRect(), span = visibleSpan(cm);
  const bar = wrapper.querySelector('.CodeMirror-hscrollbar');
  const below = bar && bar.offsetHeight && getComputedStyle(bar).display !== 'none' ? bar.offsetHeight : 0;
  return { left: span.left, right: span.right, top: rect.top, bottom: rect.bottom - below };
}

function locateCursor(pane = locatePane()) {
  if (!pane) return;
  const cm = pane.cm, view = locateView(cm);
  clearTimeout(locate.timer);
  locate.layer?.remove();
  const layer = locate.layer = document.createElement('div');
  layer.className = 'mm-locate';
  Object.assign(layer.style, { left: view.left + 'px', top: view.top + 'px', width: view.right - view.left + 'px',
    height: view.bottom - view.top + 'px' });
  const edges = new Map();   // dir -> the spots out of view that way
  for (const s of cursorSpots(cm)) {
    const dir = s.bottom <= view.top ? 'up' : s.top >= view.bottom ? 'down' : s.x < view.left ? 'left' : s.x > view.right ? 'right' : null;
    if (dir) {
      edges.set(dir, [...edges.get(dir) ?? [], s]);
      continue;
    }
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('div');
      ring.className = 'mm-locate-ring';
      Object.assign(ring.style, { left: s.x - view.left + 'px', top: (s.top + s.bottom) / 2 - view.top + 'px', animationDelay: i * 120 + 'ms' });
      layer.append(ring);
    }
  }
  for (const [dir, spots] of edges) {
    const el = document.createElement('div');
    el.className = 'mm-locate-edge';
    el.dataset.dir = dir;
    el.textContent = spots.length === 1 ? `line ${spots[0].line + 1}` : `${spots.length} cursors`;
    const s = spots[0], clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    if (dir === 'up' || dir === 'down') el.style.left = clamp(s.x - view.left, 40, view.right - view.left - 40) + 'px';
    else el.style.top = clamp((s.top + s.bottom) / 2 - view.top, 16, view.bottom - view.top - 16) + 'px';
    layer.append(el);
  }
  document.body.append(layer);
  locate.timer = setTimeout(() => { layer.remove(); if (locate.layer === layer) locate.layer = null; }, LOCATE_MS);
}

// A double tap: the editor scrolls to the (first) cursor, which then gets the rings.
function jumpToCursor(pane) {
  const cm = pane.cm, prim = cm.listSelections()[cm.getDoc().sel.primIndex] ?? cm.listSelections()[0];
  const line = blockOf(cm)?.head.line ?? prim.head.line;
  const info = cm.getScrollInfo(), top = cm.heightAtLine(line, 'local');
  if (top < info.top || top + cm.defaultTextHeight() > info.top + info.clientHeight) cm.scrollTo(null, top - info.clientHeight / 3);
  const s = cursorSpots(cm)[blockOf(cm) ? 0 : cm.getDoc().sel.primIndex];
  if (s) revealX(cm, s.x, s.x + 2);
  cm.focus();
}

// The tap: Ctrl down alone and up again within locateCursorTap, nothing else pressed, clicked or scrolled meanwhile.
const tapMs = () => Number.isInteger(setting('locateCursorTap')) ? setting('locateCursorTap') : 400;
addEventListener('keydown', e => {
  if (e.key === 'Control' && !e.altKey && !e.shiftKey && !e.metaKey) {
    if (!e.repeat) locate.down = performance.now();
  } else locate.down = null;
}, true);
addEventListener('keyup', e => {
  if (e.key !== 'Control' || locate.down == null) return;
  const now = performance.now(), tap = now - locate.down <= tapMs();
  locate.down = null;
  if (!tap || setting('locateCursor') === false) return;
  const pane = locatePane();
  if (!pane) return;
  const double = now - locate.lastTap <= 2 * tapMs();
  locate.lastTap = double ? 0 : now;
  if (double && setting('locateCursorJump')) jumpToCursor(pane);
  locateCursor(pane);
}, true);
for (const type of ['mousedown', 'wheel', 'blur']) addEventListener(type, () => { locate.down = null; locate.lastTap = 0; }, { capture: true, passive: true });
