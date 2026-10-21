'use strict';
// Indent guides (docs/plans/22-PLAN-indent-guides.md): a thin vertical line at every indent step left of a line's
// text, so an indented run of lines shows a line from the indent to the unindent; an empty line takes the smaller
// level of the lines around it. Setting indentGuides: comment (the theme's comment colour), rainbow (guide1 to guide6
// per level), off. Setting indentGuideCursor: the guide of the block the cursor is in, in the find box's colour.
// Drawn by CSS (app.css) from a line class per number of guides (mm-g1, mm-g2, ...) and the indent step (--mm-step,
// in ch); only the lines in view get their class. Loaded together with the editor (see loadEditor).

const GUIDE_MAX = 40;          // guides per line at most
const GUIDE_LOOK = 200;        // an empty line: how far to look for the lines around it
const GUIDE_RUN = 20000;       // the cursor's guide: how far it may run up and down

// One rule per number of guides: the class gives the count, app.css draws them.
(() => {
  const style = document.createElement('style');
  style.textContent = Array.from({ length: GUIDE_MAX }, (_, i) => `.CodeMirror-line.mm-g${i + 1} { --mm-gn: ${i + 1}; }`).join('\n');
  document.head.append(style);
})();

// The visual column where a line's text starts; null for an empty line (or only whitespace).
function guideIndent(cm, l, stops) {
  const text = cm.getLine(l), lead = text.match(/^[ \t]*/)[0].length;
  return lead === text.length ? null : textColumn(text, lead, stops);
}

// A line's indentation for the guides: its own, or for an empty line the smaller of the nearest lines with text
// above and below (none found: 0).
function guideLevelCol(cm, l, stops) {
  const own = guideIndent(cm, l, stops);
  if (own !== null) return own;
  const near = dir => {
    for (let k = l + dir, n = 0; k >= 0 && k <= cm.lastLine() && n < GUIDE_LOOK; k += dir, n++) {
      const c = guideIndent(cm, k, stops);
      if (c !== null) return c;
    }
    return 0;
  };
  return Math.min(near(-1), near(1));
}

// The number of guides of a line: one per indent step left of its text (columns 0, step, 2 step, ...).
const guideCount = (col, step) => Math.min(GUIDE_MAX, Math.ceil(col / step));

function scheduleGuides(cm) {
  clearTimeout(cm.state.mmGuideTimer);
  cm.state.mmGuideTimer = setTimeout(() => paintGuides(cm), 40);
}

function paintGuides(cm) {
  const stops = stopsOf(cm), step = stops.indent, mode = setting('indentGuides') || 'comment';
  cm.getWrapperElement().style.setProperty('--mm-step', step + 'ch');
  const vp = cm.getViewport(), from = Math.max(cm.firstLine(), vp.from - 20), to = Math.min(cm.lastLine(), vp.to + 20);
  cm.operation(() => {
    for (let l = from; l <= to; l++) {
      const h = cm.getLineHandle(l);
      const n = mode === 'off' ? 0 : guideCount(guideLevelCol(cm, l, stops), step);
      if ((h.mmGuides ?? 0) === n) continue;
      if (h.mmGuides) cm.removeLineClass(h, 'text', 'mm-g' + h.mmGuides);
      if (n) cm.addLineClass(h, 'text', 'mm-g' + n);
      h.mmGuides = n;
    }
    paintCursorGuide(cm, stops);
  });
}

// The cursor's guide. On a line that opens an indent (the next line with text is indented further, as after
// `begin`): the guide of that indent, from the next line down. Else the last guide left of the cursor line's text
// (for an empty line: the level it takes), up and down while the lines are indented further (empty lines in
// between included, not at the ends).
function cursorGuideRun(cm, stops) {
  const step = stops.indent, line = cm.getCursor('head').line;
  const inside = (l, at) => { const c = guideIndent(cm, l, stops); return c === null ? null : c > at; };
  const edge = (at, start, dir) => {
    let last = null;
    for (let k = start, n = 0; k >= cm.firstLine() && k <= cm.lastLine() && n < GUIDE_RUN; k += dir, n++) {
      const v = inside(k, at);
      if (v === false) break;
      if (v) last = k;
    }
    return last;
  };
  const own = guideIndent(cm, line, stops);
  if (own !== null) {
    let next = null;
    for (let k = line + 1; k <= cm.lastLine() && k - line <= GUIDE_LOOK && next === null; k++) next = guideIndent(cm, k, stops);
    const at = Math.ceil(own / step) * step;
    if (next !== null && next > at) return { at, from: line + 1, to: edge(at, line + 1, 1) };
  }
  const col = guideLevelCol(cm, line, stops);
  if (col === 0) return null;
  const at = (Math.ceil(col / step) - 1) * step;
  return { at, from: edge(at, line - 1, -1) ?? line, to: edge(at, line + 1, 1) ?? line };
}

// Kept per document (a tab switch swaps it): the run and its line handles, to take the class off again.
function paintCursorGuide(cm, stops) {
  const doc = cm.getDoc(), gen = cm.changeGeneration();
  const run = setting('indentGuideCursor') === false ? null : cursorGuideRun(cm, stops);
  const was = doc.mmCursorGuide;
  if (was && run && was.gen === gen && was.at === run.at && was.from === run.from && was.to === run.to) return;
  if (was) for (const h of was.handles) if (h.parent) cm.removeLineClass(h, 'text', 'mm-guide-cur');   // not a deleted line
  doc.mmCursorGuide = null;
  if (!run) return;
  cm.getWrapperElement().style.setProperty('--mm-gc', run.at + 'ch');
  const handles = [];
  for (let l = run.from; l <= run.to; l++) handles.push(cm.addLineClass(l, 'text', 'mm-guide-cur'));
  doc.mmCursorGuide = { ...run, handles, gen };
}

function setupGuides(pane) {
  const cm = pane.cm;
  cm.on('viewportChange', () => scheduleGuides(cm));
  cm.on('changes', () => scheduleGuides(cm));
  cm.on('cursorActivity', () => scheduleGuides(cm));
  cm.on('swapDoc', () => scheduleGuides(cm));
  cm.on('refresh', () => scheduleGuides(cm));   // tab stops, fonts
  scheduleGuides(cm);
}

// A setting changed: every editor again (the classes are kept per line, so all lines in view are checked).
function repaintGuides() {
  for (const pane of panes) if (pane.cm) paintGuides(pane.cm);
}
