'use strict';
// Indent guides (docs/plans/22-PLAN-indent-guides.md): a thin vertical line at the indent of every enclosing line
// left of a line's text (the lines above it with less indent), so an indented run of lines shows a line from the
// indent to the unindent; an indent of several steps at once shows one line, not one per step. An empty line takes
// the smaller level of the lines around it. Setting indentGuides: comment (the theme's comment colour), rainbow
// (guide1 to guide6 per nesting depth), off. Setting indentGuideCursor: the guide of the block the cursor is in, in
// the find box's colour. Drawn by CSS (app.css) from a line class per set of guide columns (mm-gk-0-4: guides at
// columns 0 and 4, in ch), its rule made here on first use; only the lines in view get their class. Loaded together
// with the editor (see loadEditor).

const GUIDE_MAX = 40;          // guides per line at most
const GUIDE_LOOK = 200;        // an empty line: how far to look for the lines around it
const GUIDE_RUN = 20000;       // the cursor's guide: how far it may run up and down; the guides: how far up to look

// The rule of a set of guide columns: one 1px gradient per guide, the colour by depth (--mm-guide1 to 6, app.css).
const guideRules = new Set();
const guideStyle = document.createElement('style');
document.head.append(guideStyle);
function guideClass(cols) {
  const key = cols.join('-'), cls = 'mm-gk-' + key;
  if (!guideRules.has(key)) {
    guideRules.add(key);
    const c = i => `var(--mm-guide${i % 6 + 1})`;
    guideStyle.sheet.insertRule(`.mm-editor-pane .CodeMirror pre.CodeMirror-line.${cls} {` +
      ` --mm-guide-img: ${cols.map((_, i) => `linear-gradient(${c(i)}, ${c(i)})`).join(', ')};` +
      ` --mm-guide-pos: ${cols.map(col => col + 'ch 0').join(', ')};` +
      ` --mm-guide-size: ${cols.map(() => '1px 100%').join(', ')}; }`, guideStyle.sheet.cssRules.length);
  }
  return cls;
}

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

// The guide columns of the lines from to to: the indents of the enclosing lines left of each line's level. Read
// down from the nearest line above with no indent (it encloses nothing), keeping the indents still open.
function guideColumns(cm, from, to, stops) {
  let start = from;
  for (let n = 0; start > cm.firstLine() && n < GUIDE_RUN && guideIndent(cm, start, stops) !== 0; start--, n++) ;
  const open = [], out = new Map();
  for (let l = start; l <= to; l++) {
    const own = guideIndent(cm, l, stops);
    if (own === null) {
      if (l >= from) { const level = guideLevelCol(cm, l, stops); out.set(l, open.filter(c => c < level).slice(0, GUIDE_MAX)); }
      continue;
    }
    while (open.length && open[open.length - 1] >= own) open.pop();
    if (l >= from) out.set(l, open.slice(0, GUIDE_MAX));
    open.push(own);
  }
  return out;
}

function scheduleGuides(cm) {
  clearTimeout(cm.state.mmGuideTimer);
  cm.state.mmGuideTimer = setTimeout(() => paintGuides(cm), 40);
}

function paintGuides(cm) {
  const stops = stopsOf(cm), mode = setting('indentGuides') || 'comment';
  const vp = cm.getViewport(), from = Math.max(cm.firstLine(), vp.from - 20), to = Math.min(cm.lastLine(), vp.to + 20);
  const cols = mode === 'off' ? null : guideColumns(cm, from, to, stops);
  cm.operation(() => {
    for (let l = from; l <= to; l++) {
      const h = cm.getLineHandle(l), c = cols?.get(l) ?? [];
      const cls = c.length ? guideClass(c) : '';
      if ((h.mmGuides ?? '') === cls) continue;
      if (h.mmGuides) cm.removeLineClass(h, 'text', h.mmGuides);
      if (cls) cm.addLineClass(h, 'text', cls);
      h.mmGuides = cls;
    }
    paintCursorGuide(cm, stops);
  });
}

// The cursor's guide. On a line that opens an indent (the next line with text is indented further, as after
// `begin`): the guide at its own indent, from the next line down. Else the last guide left of the cursor line's
// text (for an empty line: the level it takes), up and down while the lines are indented further (empty lines in
// between included, not at the ends).
function cursorGuideRun(cm, stops) {
  const line = cm.getCursor('head').line;
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
    if (next !== null && next > own) return { at: own, from: line + 1, to: edge(own, line + 1, 1) };
  }
  const cols = guideColumns(cm, line, line, stops).get(line);
  if (!cols.length) return null;
  const at = cols[cols.length - 1];
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
