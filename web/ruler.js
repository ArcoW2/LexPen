'use strict';
// The ruler, column guides, tab stops and helper lines (docs/plans/executed/PLAN-column-guides.md and
// PLAN-ruler-helper-lines.md). Columns are the bottom bar's (from 1).
// - Column guides: faint lines from the settings columnGuideStart, columnGuideStep and columnGuideExtra, each after
//   that many characters (80: after the 80th); the same for every file. Only show. Their colour (--col-guide, app.css)
//   is the theme colour columnGuideColour (default the border colour) mixed into the background, columnGuideIntensity
//   percent colour. A line on the ruler in a theme colour (the menu's colours, the defaults) is mixed the same way, a
//   helper line by helperLineIntensity, a tab stop by tabStopIntensity; a colour from Other colour... is drawn as
//   picked. The handles on the ruler keep full colour.
// - The ruler (setting ruler, View > Ruler): above the text, the column numbers, the cursors' columns, the guides.
//   At its left, above the gutter: Clear, Copy from..., Copy to....
// - Lines on the ruler, per document (doc.mmTabs, [{ col, colour, kind }]), one per column, kind 'tab' (a tab stop)
//   or 'helper' (a helper line, only shows): a click on the ruler sets one of the kind chosen in the right-click menu
//   (at the column whose left edge is nearest), a click on its handle removes it, a drag on the handle moves it; the
//   right-click menu adds either kind there (also the next plain click's kind), in the colour chosen below those
//   items (kept, also for the next plain click), and clears them. A tab stop is drawn as a
//   line through the text, wider and stronger than a guide; Tab before one goes there (spaces), Shift+Tab back to the
//   one before; elsewhere Tab and Shift+Tab work as always (tabs.js asks manualTabAfter / manualTabBefore). A helper
//   line is drawn behind the text as a guide, in its colour.
// - Kept by the host (RulerStore, file-rulers.json) per file path or draft id, for the last 100 files with lines:
//   read when a document is first shown, written after every change.
// Drawn with a monospaced editor font only (as virtual space). Loaded after cursors.js, before app.js.

const TAB_DEFAULT = 'var(--find-current)';
const HELPER_DEFAULT = 'var(--border)';   // the theme's border colour, mixed by helperLineIntensity
// What a plain click adds (the kind last added from the menu) and the colour chosen (null: the kind's default).
const ruler = { kind: 'tab', colour: null };
const TAB_COLOURS = [[TAB_DEFAULT, '&Orange (a found text)'], ['var(--find-box)', 'The &find box'], ['var(--accent)', '&Blue (the cursor)'],
  ['var(--tip)', '&Green'], ['var(--important)', '&Purple'], ['var(--caution)', '&Red'], ['var(--warning)', 'Bro&wn']];
const LINE_DEFAULT = { tab: TAB_DEFAULT, helper: HELPER_DEFAULT };
const RULER_SETTINGS = ['ruler', 'columnGuideStart', 'columnGuideStep', 'columnGuideExtra', 'columnGuideColour', 'columnGuideIntensity',
  'helperLineIntensity', 'tabStopIntensity'];
// The colours a colour setting offers (kind colour: columnGuideColour, indentGuideColour, indentGuideCursorColour):
// a theme colour's name (it follows the theme), or a colour picked in the settings window (#rrggbb, as picked).
const GUIDE_COLOURS = [['border', 'The border colour'], ['hl-comment', 'The comment colour'], ['find-current', 'Orange (a found text)'],
  ['find-box', 'The find box'], ['accent', 'Blue (the cursor)'], ['tip', 'Green'], ['important', 'Purple'], ['caution', 'Red'],
  ['warning', 'Brown'], ['highlight', 'Yellow (the highlight)']];
const colourCss = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value
  : `var(--${GUIDE_COLOURS.some(([name]) => name === value) ? value : fallback})`;
// A line's colour in the text: a theme colour mixed into the background by its kind's intensity, a picked one as is.
const mixedColour = t => t.colour.startsWith('var(')
  ? `color-mix(in srgb, ${t.colour} var(${isTabStop(t) ? '--col-tab-mix' : '--col-helper-mix'}), var(--bg))` : t.colour;
const percent = (name, fallback) => { const v = setting(name); return (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback) + '%'; };

const rulerShown = () => setting('ruler') === true;
const rulerDrawable = () => (virtual.mono ??= editorMonospaced());
const docTabs = doc => doc ? (doc.mmTabs ??= []) : [];
const isTabStop = t => t.kind !== 'helper';
const paneDoc = pane => pane?.active && pane.el.dataset.mode !== 'preview' ? pane.active.doc : null;
const colNumber = v => Number.isInteger(v) && v > 0 ? v : 0;
const lineColour = kind => ruler.colour ?? LINE_DEFAULT[kind];

// The tab stop columns of an editor's document, as visual columns from 0 (where a cursor stands before it).
const manualStops = cm => docTabs(paneDoc(paneOfCm(cm))).filter(isTabStop).map(t => t.col - 1).sort((a, b) => a - b);
const manualTabAfter = (cm, col) => manualStops(cm).find(c => c > col) ?? null;
const manualTabBefore = (cm, col) => manualStops(cm).reverse().find(c => c < col) ?? null;

// The guides' places: after so many characters.
function guideCols(upTo) {
  const start = colNumber(setting('columnGuideStart')), step = colNumber(setting('columnGuideStep'));
  const extra = colNumber(setting('columnGuideExtra')), cols = new Set();
  if (start) {
    cols.add(start);
    if (step) for (let c = start + step; c <= upTo; c += step) cols.add(c);
  }
  if (extra) cols.add(extra);
  return [...cols];
}

// Where the columns are on screen: x0 the window x of the text's start, cw a character's width.
function columnGeometry(cm) {
  return { x0: cm.charCoords(CodeMirror.Pos(cm.firstLine(), 0), 'window').left, cw: cm.defaultCharWidth(), span: visibleSpan(cm) };
}
const boundaryAt = (cm, x) => { const g = columnGeometry(cm); return Math.max(0, Math.round((x - g.x0) / g.cw)); };

// The main cursor's column (from 0): a block's head, past the line's end, or in the text.
function cursorColumn(cm) {
  const b = blockOf(cm);
  if (b) return b.head.col;
  const r = cm.listSelections()[cm.getDoc().sel.primIndex] ?? cm.listSelections()[0];
  return pastColOf(cm, r) ?? vcolAt(cm, r.head.line, r.head.ch);
}

// ---------- Changing the lines ----------
// Redraws the panes showing the document and stores the lines (store false: as read from the host).
function changedTabs(doc, store = true) {
  doc.mmTabs.sort((a, b) => a.col - b.col);
  for (const pane of panes) if (paneDoc(pane) === doc) drawRuler(pane);
  if (store) storeRulerLinesSoon(doc);
}

// One line per column: a line of the other kind there is replaced.
function addLine(doc, col, kind, colour = lineColour(kind)) {
  if (!doc) return;
  const tabs = docTabs(doc), was = tabs.find(t => t.col === col);
  if (was) Object.assign(was, { colour, kind }); else tabs.push({ col, colour, kind });
  changedTabs(doc);
}
const addTab = (doc, col, colour) => addLine(doc, col, 'tab', colour);

// kind null: either kind.
function removeLine(doc, col, kind = null) {
  const tabs = docTabs(doc), i = tabs.findIndex(t => t.col === col && (!kind || (t.kind ?? 'tab') === kind));
  if (i < 0) return false;
  tabs.splice(i, 1);
  changedTabs(doc);
  return true;
}

function clearLines(doc, kind = null) {
  if (!doc) return;
  doc.mmTabs = docTabs(doc).filter(t => kind && (t.kind ?? 'tab') !== kind);
  changedTabs(doc);
}
const clearTabs = doc => clearLines(doc, 'tab');

// The actions: tabAdd / tabRemove / helperAdd / helperRemove with a column, or at the main cursor's column.
const tabColumnOf = (pane, [col]) => Number.isInteger(+col) && +col > 0 ? +col : cursorColumn(pane.cm) + 1;
const tabAddAction = (pane, params) => addLine(paneDoc(pane), tabColumnOf(pane, params), 'tab');
const tabRemoveAction = (pane, params) => removeLine(paneDoc(pane), tabColumnOf(pane, params), 'tab');
const helperAddAction = (pane, params) => addLine(paneDoc(pane), tabColumnOf(pane, params), 'helper');
const helperRemoveAction = (pane, params) => removeLine(paneDoc(pane), tabColumnOf(pane, params), 'helper');

function copyTabsMenu(pane, el, dir) {
  const doc = paneDoc(pane);
  if (!doc) return;
  const others = [...new Set(panes.flatMap(p => p.tabs).map(t => t.doc))].filter(d => d !== doc);
  if (!others.length) return toast('No other document is open.');
  // A heading says which way the lines go.
  const heading = { label: dir === 'from' ? 'Use rulers from:' : 'Copy these rulers to:', plain: true, enabled: false, cls: 'mm-menu-caption' };
  openMenuBelow([heading, ...others.map(d => ({ label: docName(d), plain: true, run: () => {
    const [from, to] = dir === 'from' ? [d, doc] : [doc, d];
    to.mmTabs = docTabs(from).map(t => ({ ...t }));
    to.mmTabsLoad ??= Promise.resolve();   // what the host had for it is replaced
    changedTabs(to);
    toast(`${docTabs(from).length ? 'Tab stops and helper lines copied' : 'No lines to copy'} ${dir === 'from' ? 'from' : 'to'} ${docName(d)}.`, true);
  } }))], el);
}

// ---------- Kept by the host ----------
const rulerKey = doc => ({ path: doc.path, draft: doc.draft });

// Once per document, when it is first shown: the lines it had (a line set meanwhile wins).
function loadRulerLines(doc) {
  if (!doc || (!doc.path && !doc.draft)) return Promise.resolve();
  return doc.mmTabsLoad ??= host('rulersGet', rulerKey(doc)).then(list => {
    if (docTabs(doc).length || !Array.isArray(list) || !list.length) return;
    doc.mmTabs = list.filter(t => colNumber(t?.col) && typeof t.colour === 'string')
      .map(t => ({ col: t.col, colour: t.colour === 'var(--col-guide)' ? HELPER_DEFAULT : t.colour, kind: t.kind === 'helper' ? 'helper' : 'tab' }));
    changedTabs(doc, false);
  }).catch(() => {});
}

function storeRulerLines(doc) {
  clearTimeout(doc.mmTabsTimer);
  doc.mmTabsTimer = 0;
  return doc.path || doc.draft ? host('rulersSet', { ...rulerKey(doc), lines: docTabs(doc) }).catch(() => {}) : Promise.resolve();
}
function storeRulerLinesSoon(doc) {
  clearTimeout(doc.mmTabsTimer);
  doc.mmTabsTimer = setTimeout(() => storeRulerLines(doc), 500);
}

// Saved under another name (a draft's first save, Save as): the lines go along.
function moveRulerLines(doc, was) {
  if (samePath(was.path, doc.path) && was.draft === doc.draft) return;
  if (!docTabs(doc).length) return;
  host('rulersSet', { ...was, lines: [] }).catch(() => {});
  storeRulerLines(doc);
}

// ---------- Drawing ----------
function setupRuler(pane) {
  const cm = pane.cm, wrapper = cm.getWrapperElement();
  const bar = pane.rulerEl = document.createElement('div');
  bar.className = 'mm-ruler';
  bar.hidden = true;
  bar.innerHTML = '<div class="mm-ruler-left">' +
    '<button class="mm-ruler-clear" title="Clear the tab stops and helper lines">' + rulerIcon('M4 4l8 8M12 4l-8 8') + '</button>' +
    '<button class="mm-ruler-from" title="Use rulers from... (the tab stops and helper lines of another open document replace these)">' + rulerIcon('M2 8h9M8 5l3 3-3 3M14 3v10') + '</button>' +
    '<button class="mm-ruler-to" title="Copy these rulers to... (they replace the tab stops and helper lines of another open document)">' + rulerIcon('M5 8h9M11 5l3 3-3 3M2 3v10') + '</button></div>' +
    '<div class="mm-ruler-scale"><canvas></canvas><span class="mm-ruler-probe"></span></div>';
  wrapper.before(bar);
  bar.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
  bar.querySelector('.mm-ruler-clear').addEventListener('click', () => clearLines(paneDoc(pane)));
  bar.querySelector('.mm-ruler-from').addEventListener('click', e => copyTabsMenu(pane, e.currentTarget, 'from'));
  bar.querySelector('.mm-ruler-to').addEventListener('click', e => copyTabsMenu(pane, e.currentTarget, 'to'));
  const scale = bar.querySelector('.mm-ruler-scale');
  scale.addEventListener('mousedown', e => onRulerMouseDown(pane, e));
  scale.addEventListener('contextmenu', e => rulerMenu(pane, e));
  // The lines: the guides and helper lines behind the text, the tab stops over it.
  pane.guideLayer = document.createElement('div');
  pane.guideLayer.className = 'mm-cols mm-cols-guides';
  pane.tabLayer = document.createElement('div');
  pane.tabLayer.className = 'mm-cols mm-cols-tabs';
  cm.getScrollerElement().before(pane.guideLayer);
  cm.getScrollerElement().after(pane.tabLayer);
  for (const ev of ['scroll', 'refresh', 'cursorActivity', 'swapDoc', 'viewportChange']) cm.on(ev, () => drawRuler(pane));
  new ResizeObserver(() => drawRuler(pane)).observe(wrapper);
  new ResizeObserver(() => drawRuler(pane)).observe(cm.getGutterElement());
  drawRuler(pane);
}

const rulerIcon = d => `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

function drawRuler(pane) {
  cancelAnimationFrame(pane.rulerFrame);
  pane.rulerFrame = requestAnimationFrame(() => paintRuler(pane));
}

// The settings, the theme or the fonts changed.
function applyRuler() {
  document.body.style.setProperty('--col-guide-colour', colourCss(setting('columnGuideColour'), 'border'));
  document.body.style.setProperty('--col-guide-mix', percent('columnGuideIntensity', 40));
  document.body.style.setProperty('--col-helper-mix', percent('helperLineIntensity', 20));
  document.body.style.setProperty('--col-tab-mix', percent('tabStopIntensity', 50));
  for (const pane of panes) if (pane.cm) {
    const shown = rulerShown();
    if (pane.rulerEl.hidden === shown) {
      pane.rulerEl.hidden = !shown;
      pane.cm.refresh();   // the editor's height changed
    }
    drawRuler(pane);
  }
}

function paintRuler(pane) {
  const cm = pane.cm, doc = paneDoc(pane), wrapper = cm.getWrapperElement();
  pane.rulerEl.hidden = !rulerShown() || !doc;
  const mono = rulerDrawable(), lines = docTabs(doc);
  if (!doc || !mono || !wrapper.offsetWidth) {
    pane.guideLayer.innerHTML = pane.tabLayer.innerHTML = '';
    if (!pane.rulerEl.hidden) paintScale(pane, null);
    return;
  }
  const g = columnGeometry(cm), w = wrapper.getBoundingClientRect(), bar = wrapper.querySelector('.CodeMirror-hscrollbar');
  const below = bar && bar.offsetHeight && getComputedStyle(bar).display !== 'none' ? bar.offsetHeight : 0;
  for (const layer of [pane.guideLayer, pane.tabLayer]) Object.assign(layer.style, { left: g.span.left - w.left + 'px',
    width: Math.max(0, g.span.right - g.span.left) + 'px', bottom: below + 'px' });
  const upTo = Math.ceil((g.span.right - g.x0) / g.cw) + 1, at = c => g.x0 + c * g.cw - g.span.left;
  pane.guideLayer.innerHTML = guideCols(upTo).map(c => `<div class="mm-colguide" style="left:${at(c)}px"></div>`).join('') +
    lines.filter(t => !isTabStop(t)).map(t => `<div class="mm-colhelper" style="left:${at(t.col - 1)}px;background:${mixedColour(t)}"></div>`).join('');
  pane.tabLayer.innerHTML = lines.filter(isTabStop).map(t => `<div class="mm-coltab" style="left:${at(t.col - 1)}px;background:${mixedColour(t)}"></div>`).join('');
  if (!pane.rulerEl.hidden) paintScale(pane, g, upTo);
}

// The ruler: the left part as wide as the gutter, then the numbers and ticks per column, the cursors' columns, the
// guides as long ticks and the lines (a tab stop with its handle, a filled square; a helper line only a line).
function paintScale(pane, g, upTo) {
  const cm = pane.cm, left = pane.rulerEl.querySelector('.mm-ruler-left'), scale = pane.rulerEl.querySelector('.mm-ruler-scale');
  const canvas = scale.querySelector('canvas'), w = cm.getWrapperElement().getBoundingClientRect();
  const lines = docTabs(paneDoc(pane));
  left.style.width = Math.max(0, (g ? g.span.left : cm.getGutterElement().getBoundingClientRect().right) - w.left) + 'px';
  pane.rulerEl.querySelector('.mm-ruler-clear').hidden = !lines.length;
  scale.classList.toggle('mm-ruler-off', !g);
  for (const el of scale.querySelectorAll('.mm-ruler-tab')) el.remove();
  const dpr = devicePixelRatio || 1, width = scale.clientWidth, height = scale.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  Object.assign(canvas.style, { width: width + 'px', height: height + 'px' });
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!g) {
    scale.title = 'The ruler needs a monospaced editor font';
    return;
  }
  scale.title = `Click: a ${ruler.kind === 'helper' ? 'helper line' : 'tab stop'} (on a line: remove it); drag a line to move it; right-click: tab stop or helper line, colours`;
  const css = getComputedStyle(pane.rulerEl), colour = name => css.getPropertyValue(name).trim();
  const base = scale.getBoundingClientRect().left, at = c => g.x0 + c * g.cw - base;
  ctx.fillStyle = colour('--select');
  for (const s of cursorSpots(cm)) ctx.fillRect(s.x - base, 0, g.cw, height);
  ctx.fillStyle = ctx.strokeStyle = colour('--fg-dim');
  ctx.font = `9px ${colour('--app-font') || 'sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const first = Math.max(1, Math.floor((base - g.x0) / g.cw));
  for (let n = first; n <= upTo; n++) {
    const mid = at(n - 1) + g.cw / 2;
    if (n % 10 === 0) ctx.fillText(String(n), mid, 1);
    else ctx.fillRect(Math.round(mid), height - (n % 5 === 0 ? 6 : 3), 1, n % 5 === 0 ? 6 : 3);
  }
  ctx.fillStyle = getComputedStyle(scale.querySelector('.mm-ruler-probe')).color;   // --col-guide, resolved
  for (const c of guideCols(upTo)) ctx.fillRect(Math.round(at(c)), 0, 1, height);
  for (const t of lines) {
    const el = document.createElement('div'), helper = !isTabStop(t);
    el.className = 'mm-ruler-tab' + (helper ? ' mm-ruler-helper' : '');
    el.style.left = at(t.col - 1) + 'px';
    // A helper line in the guide colour is drawn on the ruler in a colour you can see.
    if (helper) el.style.color = t.colour === HELPER_DEFAULT ? 'var(--fg-dim)' : t.colour; else el.style.background = t.colour;
    el.title = `${helper ? 'Helper line' : 'Tab stop'} at column ${t.col}: click to remove, drag to move`;
    scale.append(el);
  }
}

// ---------- The mouse on the ruler ----------
// On a line or a tab stop's handle (right of it): that line. A helper line has no handle: a few pixels either side.
function tabAtX(pane, x) {
  const g = columnGeometry(pane.cm);
  return docTabs(paneDoc(pane)).find(t => { const tx = g.x0 + (t.col - 1) * g.cw; return x >= tx - 3 && x <= tx + (isTabStop(t) ? 8 : 3); }) ?? null;
}

function onRulerMouseDown(pane, e) {
  const doc = paneDoc(pane);
  if (e.button !== 0 || !doc || !rulerDrawable()) return;
  e.preventDefault();
  const hit = tabAtX(pane, e.clientX);
  if (!hit) return addLine(doc, boundaryAt(pane.cm, e.clientX) + 1, ruler.kind);
  let moved = false;
  const move = ev => {
    const col = boundaryAt(pane.cm, ev.clientX) + 1;
    if (col === hit.col) return;
    moved = true;
    hit.col = col;
    changedTabs(doc);
  };
  const up = () => {
    removeEventListener('mousemove', move, true);
    removeEventListener('mouseup', up, true);
    if (!moved) return removeLine(doc, hit.col);
    // Dropped on another line: one is left, the one dragged.
    doc.mmTabs = doc.mmTabs.filter(t => t === hit || t.col !== hit.col);
    changedTabs(doc);
  };
  addEventListener('mousemove', move, true);
  addEventListener('mouseup', up, true);
}

const swatch = colour => `<svg viewBox="0 0 16 16" width="14" height="14"><rect x="2" y="2" width="12" height="12" rx="2" fill="${colour}" stroke="currentColor" stroke-opacity=".3"/></svg>`;

// The ruler's panel (right-click). At the top the actions, which close it: on empty ruler Add a tab stop / Add a
// helper line at that column (that kind is also the next plain click's); on a line Tab stop / Helper line, checked by
// what it is (the one clicked is what it becomes), and Remove this line; the clearing; Cancel. Below, under
// Settings, the colour of the line to add or of this line: a click only moves the check (the panel stays open); an
// action takes it, Cancel (or a click elsewhere) drops it. The colour chosen for adding is kept for plain clicks.
function rulerMenu(pane, e) {
  e.preventDefault();
  const doc = paneDoc(pane);
  if (!doc || !rulerDrawable()) return;
  const line = tabAtX(pane, e.clientX);
  const kind = line && (isTabStop(line) ? 'tab' : 'helper');
  openRulerPanel({ doc, line, kind, col: line ? line.col : boundaryAt(pane.cm, e.clientX) + 1,
    // null: the kind's default (a line in its kind's default colour counts as that)
    colour: line ? (line.colour === LINE_DEFAULT[kind] ? null : line.colour) : ruler.colour }, e.clientX, e.clientY);
}

function openRulerPanel(p, x, y) {
  const { doc, line, col } = p, lines = docTabs(doc);
  const add = k => {
    ruler.kind = k;
    ruler.colour = p.colour;
    addLine(doc, col, k, p.colour ?? LINE_DEFAULT[k]);
  };
  // A line made the other kind in the default colour takes that kind's default.
  const change = k => addLine(doc, col, k, p.colour ?? LINE_DEFAULT[k]);
  const actions = line ? [
    { label: '&Tab stop', checked: p.kind === 'tab', run: () => change('tab') },
    { label: '&Helper line', checked: p.kind === 'helper', run: () => change('helper') },
    { label: 'Re&move this line', run: () => removeLine(doc, col) },
  ] : [
    { label: `Add a &tab stop (column ${col})`, run: () => add('tab') },
    { label: `Add a &helper line (column ${col})`, run: () => add('helper') },
  ];
  const choose = colour => { p.colour = colour; };
  const isOther = () => p.colour !== null && !TAB_COLOURS.some(([c]) => c === p.colour);
  openPopupMenu([
    ...actions, '-',
    { label: 'Clear column guid&es', enabled: guideCols(0).length > 0, run: () => { for (const n of ['columnGuideStart', 'columnGuideStep', 'columnGuideExtra']) setSetting(n, 0); } },
    { label: 'Clear &all tab stops', enabled: lines.some(isTabStop), run: () => clearLines(doc, 'tab') },
    { label: 'Clear all helper &lines', enabled: lines.some(t => !isTabStop(t)), run: () => clearLines(doc, 'helper') }, '-',
    { label: 'Ca&ncel', run: () => {} }, '-',
    { label: line ? `Settings (this line, column ${col})` : 'Settings (the line to add)', plain: true, enabled: false, cls: 'mm-menu-caption' },
    { label: '&Default (a tab stop orange, a helper line the border colour)', icon: swatch('none'), keep: true, checked: () => p.colour === null, run: () => choose(null) },
    ...TAB_COLOURS.map(([colour, label]) => ({ label, icon: swatch(colour), keep: true, checked: () => p.colour === colour, run: () => choose(colour) })),
    // The colour dialog takes the focus, which closes the panel: it opens again with the colour picked.
    { label: 'Other &colour...', icon: swatch(isOther() ? p.colour : 'none'), keep: true, checked: isOther,
      run: () => pickColour(colour => { choose(colour); openRulerPanel(p, x, y); }) },
  ], x, y);
}

function pickColour(done) {
  const input = document.createElement('input');
  input.type = 'color';
  input.style.cssText = 'position:fixed;left:-100px;top:0';
  document.body.append(input);
  input.addEventListener('change', () => { done(input.value); input.remove(); });
  input.addEventListener('blur', () => setTimeout(() => input.remove(), 1000));
  input.click();
}
