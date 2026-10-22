'use strict';
// The ruler, column guides and manual tabs (docs/plans/10-PLAN-column-guides.md). Columns are the bottom bar's (from 1).
// - Column guides: faint lines from the settings columnGuideStart, columnGuideStep and columnGuideExtra, each after
//   that many characters (80: after the 80th); the same for every file. Only show.
// - The ruler (setting ruler, View > Ruler): above the text, the column numbers, the cursors' columns, the guides.
//   At its left, above the gutter: Clear tabs, Copy tabs from..., Copy tabs to....
// - Manual tabs, per document (doc.mmTabs, [{ col, colour }]): a click on the ruler sets one (at the column whose left
//   edge is nearest), a click on its handle removes it, a drag on the handle moves it; the right-click menu gives a
//   colour (also the next plain click's) and clears them. Drawn as a line through the text, wider and stronger than a
//   guide. Tab before a manual tab goes there (spaces), Shift+Tab back to the one before; elsewhere Tab and Shift+Tab
//   work as always (tabs.js asks manualTabAfter / manualTabBefore).
// Drawn with a monospaced editor font only (as virtual space). Loaded after cursors.js, before app.js.

const ruler = { colour: null };   // the last colour chosen for a tab; null: the current find match's background
const TAB_DEFAULT = 'var(--find-current)';
const TAB_COLOURS = [[TAB_DEFAULT, '&Orange (a found text)'], ['var(--find-box)', 'The &find box'], ['var(--accent)', '&Blue (the cursor)'],
  ['var(--tip)', '&Green'], ['var(--important)', '&Purple'], ['var(--caution)', '&Red'], ['var(--warning)', 'Bro&wn']];
const RULER_SETTINGS = ['ruler', 'columnGuideStart', 'columnGuideStep', 'columnGuideExtra'];

const rulerShown = () => setting('ruler') === true;
const rulerDrawable = () => (virtual.mono ??= editorMonospaced());
const docTabs = doc => doc ? (doc.mmTabs ??= []) : [];
const paneDoc = pane => pane?.active && pane.el.dataset.mode !== 'preview' ? pane.active.doc : null;
const colNumber = v => Number.isInteger(v) && v > 0 ? v : 0;

// The manual tab columns of an editor's document, as visual columns from 0 (where a cursor stands before it).
const manualStops = cm => docTabs(paneDoc(paneOfCm(cm))).map(t => t.col - 1).sort((a, b) => a - b);
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

// ---------- Changing the tabs ----------
function changedTabs(doc) {
  doc.mmTabs.sort((a, b) => a.col - b.col);
  for (const pane of panes) if (paneDoc(pane) === doc) drawRuler(pane);
}

function addTab(doc, col, colour = ruler.colour ?? TAB_DEFAULT) {
  const tabs = docTabs(doc), was = tabs.find(t => t.col === col);
  if (was) was.colour = colour; else tabs.push({ col, colour });
  changedTabs(doc);
}

function removeTab(doc, col) {
  const tabs = docTabs(doc), i = tabs.findIndex(t => t.col === col);
  if (i < 0) return false;
  tabs.splice(i, 1);
  changedTabs(doc);
  return true;
}

function clearTabs(doc) {
  if (!doc) return;
  docTabs(doc).length = 0;
  changedTabs(doc);
}

// The actions: tabAdd / tabRemove with a column, or at the main cursor's column.
const tabColumnOf = (pane, [col]) => Number.isInteger(+col) && +col > 0 ? +col : cursorColumn(pane.cm) + 1;
const tabAddAction = (pane, params) => addTab(paneDoc(pane), tabColumnOf(pane, params));
const tabRemoveAction = (pane, params) => removeTab(paneDoc(pane), tabColumnOf(pane, params));

function copyTabsMenu(pane, el, dir) {
  const doc = paneDoc(pane);
  if (!doc) return;
  const others = [...new Set(panes.flatMap(p => p.tabs).map(t => t.doc))].filter(d => d !== doc);
  if (!others.length) return toast('No other document is open.');
  openMenuBelow(others.map(d => ({ label: docName(d), plain: true, run: () => {
    const [from, to] = dir === 'from' ? [d, doc] : [doc, d];
    to.mmTabs = docTabs(from).map(t => ({ ...t }));
    changedTabs(to);
    toast(`${docTabs(from).length ? 'Tabs copied' : 'No tabs to copy'} ${dir === 'from' ? 'from' : 'to'} ${docName(d)}.`, true);
  } })), el);
}

// ---------- Drawing ----------
function setupRuler(pane) {
  const cm = pane.cm, wrapper = cm.getWrapperElement();
  const bar = pane.rulerEl = document.createElement('div');
  bar.className = 'mm-ruler';
  bar.hidden = true;
  bar.innerHTML = '<div class="mm-ruler-left">' +
    '<button class="mm-ruler-clear" title="Clear tabs">' + rulerIcon('M4 4l8 8M12 4l-8 8') + '</button>' +
    '<button class="mm-ruler-from" title="Copy tabs from...">' + rulerIcon('M2 8h9M8 5l3 3-3 3M14 3v10') + '</button>' +
    '<button class="mm-ruler-to" title="Copy tabs to...">' + rulerIcon('M5 8h9M11 5l3 3-3 3M2 3v10') + '</button></div>' +
    '<div class="mm-ruler-scale" title="Click: a tab (on a tab: remove it); drag a tab to move it; right-click: colours, guides"><canvas></canvas></div>';
  wrapper.before(bar);
  bar.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
  bar.querySelector('.mm-ruler-clear').addEventListener('click', () => clearTabs(paneDoc(pane)));
  bar.querySelector('.mm-ruler-from').addEventListener('click', e => copyTabsMenu(pane, e.currentTarget, 'from'));
  bar.querySelector('.mm-ruler-to').addEventListener('click', e => copyTabsMenu(pane, e.currentTarget, 'to'));
  const scale = bar.querySelector('.mm-ruler-scale');
  scale.addEventListener('mousedown', e => onRulerMouseDown(pane, e));
  scale.addEventListener('contextmenu', e => rulerMenu(pane, e));
  // The lines: the guides behind the text, the tabs over it.
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

function applyRuler() {
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
  const mono = rulerDrawable(), tabs = docTabs(doc);
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
  pane.guideLayer.innerHTML = guideCols(upTo).map(c => `<div class="mm-colguide" style="left:${at(c)}px"></div>`).join('');
  pane.tabLayer.innerHTML = tabs.map(t => `<div class="mm-coltab" style="left:${at(t.col - 1)}px;background:${t.colour}"></div>`).join('');
  if (!pane.rulerEl.hidden) paintScale(pane, g, upTo);
}

// The ruler: the left part as wide as the gutter, then the numbers and ticks per column, the cursors' columns, the
// guides as long ticks and the tabs with their handles.
function paintScale(pane, g, upTo) {
  const cm = pane.cm, left = pane.rulerEl.querySelector('.mm-ruler-left'), scale = pane.rulerEl.querySelector('.mm-ruler-scale');
  const canvas = scale.querySelector('canvas'), w = cm.getWrapperElement().getBoundingClientRect();
  const tabs = docTabs(paneDoc(pane));
  left.style.width = Math.max(0, (g ? g.span.left : cm.getGutterElement().getBoundingClientRect().right) - w.left) + 'px';
  pane.rulerEl.querySelector('.mm-ruler-clear').hidden = !tabs.length;
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
  scale.title = 'Click: a tab (on a tab: remove it); drag a tab to move it; right-click: colours, guides';
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
  ctx.fillStyle = colour('--border');
  for (const c of guideCols(upTo)) ctx.fillRect(Math.round(at(c)), 0, 1, height);
  for (const t of tabs) {
    const el = document.createElement('div');
    el.className = 'mm-ruler-tab';
    el.style.left = at(t.col - 1) + 'px';
    el.style.background = t.colour;
    el.title = `Tab at column ${t.col}: click to remove, drag to move`;
    scale.append(el);
  }
}

// ---------- The mouse on the ruler ----------
// On a tab's line or its handle (right of it): that tab.
function tabAtX(pane, x) {
  const g = columnGeometry(pane.cm);
  return docTabs(paneDoc(pane)).find(t => { const tx = g.x0 + (t.col - 1) * g.cw; return x >= tx - 3 && x <= tx + 8; }) ?? null;
}

function onRulerMouseDown(pane, e) {
  const doc = paneDoc(pane);
  if (e.button !== 0 || !doc || !rulerDrawable()) return;
  e.preventDefault();
  const hit = tabAtX(pane, e.clientX);
  if (!hit) return addTab(doc, boundaryAt(pane.cm, e.clientX) + 1);
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
    if (!moved) return removeTab(doc, hit.col);
    // Dropped on another tab: one is left, the one dragged.
    doc.mmTabs = doc.mmTabs.filter(t => t === hit || t.col !== hit.col);
    changedTabs(doc);
  };
  addEventListener('mousemove', move, true);
  addEventListener('mouseup', up, true);
}

const swatch = colour => `<svg viewBox="0 0 16 16" width="14" height="14"><rect x="2" y="2" width="12" height="12" rx="2" fill="${colour}" stroke="currentColor" stroke-opacity=".3"/></svg>`;

function rulerMenu(pane, e) {
  e.preventDefault();
  const doc = paneDoc(pane);
  if (!doc || !rulerDrawable()) return;
  const b = boundaryAt(pane.cm, e.clientX), col = b + 1;
  const choose = colour => { ruler.colour = colour; addTab(doc, col, colour); };
  openPopupMenu([
    ...TAB_COLOURS.map(([colour, label]) => ({ label, icon: swatch(colour), checked: (ruler.colour ?? TAB_DEFAULT) === colour, run: () => choose(colour) })),
    { label: 'Other &colour...', icon: swatch('none'), run: () => pickColour(choose) }, '-',
    { label: `Column g&uide here (after ${b})`, run: () => setSetting('columnGuideExtra', b) },
    { label: 'Clear column guid&es', enabled: guideCols(0).length > 0, run: () => { for (const n of ['columnGuideStart', 'columnGuideStep', 'columnGuideExtra']) setSetting(n, 0); } }, '-',
    { label: 'Clear &all tabs', enabled: docTabs(doc).length > 0, run: () => clearTabs(doc) },
  ], e.clientX, e.clientY);
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
