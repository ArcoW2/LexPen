// A PDF's page (pdf.html; docs/plans/executed/PLAN-pdf-view.md): pdf.js draws the file; each page, once drawn, is measured
// (its overall brightness) and inverted (its hues kept) when it does not suit the mode: in dark mode a page brighter
// than the threshold, in light mode one darker than it; a page that already suits the mode stays as it is, so a dark
// page is never lightened in dark mode. The address says which file and how:
// ?file=<url>&mode=dark|light|original&threshold=<0-100>&bg=<the preview's background>&fg=<its text colour>&sb=<the
// scroll bars' width>. The vertical scroll bar is LexPen's strip in the window (previewoverview.js), from the layout
// and the scroll told here; the horizontal one looks as LexPen's.
import * as pdfjsLib from './vendor/pdfjs/pdf.min.mjs';

globalThis.pdfjsLib = pdfjsLib;   // the viewer finds the library there
const { EventBus, PDFViewer, PDFLinkService } = await import('./vendor/pdfjs/pdf_viewer.mjs');

const here = new URL(location.href), asset = p => new URL(p, here).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = asset('vendor/pdfjs/pdf.worker.min.mjs');

// restoring: no state told until the window has answered `ready` with the place it had (or none).
const pdf = { viewer: null, doc: null, started: performance.now(), firstPage: null, mode: 'original', threshold: 50, light: new Map(), restoring: true };
globalThis.pdfPane = pdf;   // for a look from outside (the tests)

// A drawn page's overall brightness, 0 to 1 (its canvas drawn small, the pixels' luminance averaged).
const probe = Object.assign(document.createElement('canvas'), { width: 48, height: 64 });
function brightness(canvas) {
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';   // a transparent part counts as the white of paper
  ctx.fillRect(0, 0, probe.width, probe.height);
  ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
  const px = ctx.getImageData(0, 0, probe.width, probe.height).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return sum / (px.length / 4) / 255;
}

// A CSS colour's luminance, 0 to 1 (null when it is not one).
function luminance(css) {
  const ctx = probe.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillStyle = css;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ctx.fillStyle);
  return m ? (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255 : null;
}

// Inverted or not, by the mode and the threshold.
const inverts = light => pdf.mode === 'dark' ? light * 100 > pdf.threshold : pdf.mode === 'light' ? light * 100 < pdf.threshold : false;
function look(pageNumber) {
  const view = pdf.viewer?.getPageView(pageNumber - 1), light = pdf.light.get(pageNumber);
  if (!view?.div || light === undefined) return;
  view.div.classList.toggle('pdf-inverted', inverts(light));
}
const lookAll = () => { for (const n of pdf.light.keys()) look(n); };

// The mode, the threshold and the preview's background: from the address at first, later from the window (`look`).
function setLook(mode, threshold, bg, fg, sb) {
  pdf.mode = mode || 'original';
  pdf.threshold = Number.isFinite(+threshold) ? +threshold : 50;
  const root = document.documentElement.style;
  if (bg) root.setProperty('--pdf-bg', bg);
  if (fg) root.setProperty('--pdf-fg', fg);
  if (sb) root.setProperty('--pdf-sb', sb + 'px');
  // How far a page is turned round: so that its paper becomes the preview's background (dark mode: white paper turns
  // that dark; light mode: black paper turns that light), not pure black or white.
  const l = bg ? luminance(bg) : null;
  if (l !== null && pdf.mode !== 'original') root.setProperty('--pdf-invert', String(pdf.mode === 'dark' ? 1 - l : l));
  lookAll();
}

// To the window (pdfview.js): its state for the bar, a right-click, a key that is the window's.
const toWindow = msg => parent.postMessage({ fromPdf: msg }, 'https://lexpen.example');
// Its place too (the zoom, how far it is scrolled), so the window can give it back: a frame moved with its tab (another
// tab shown in the pane and back) loads again.
function tellState() {
  const v = pdf.viewer, c = document.getElementById('pdf-scroll');
  if (v?.pagesCount && !pdf.restoring) toWindow({ kind: 'state', page: v.currentPageNumber, pages: v.pagesCount, scale: v.currentScale,
    scaleValue: v.currentScaleValue, top: c.scrollTop, left: c.scrollLeft });
}
// Where its pages are (their tops and heights in the scroll area), how high it all is and how much is in view: for the
// window's scroll strip; again when that changes (a zoom, the room, the pages' real sizes read).
function tellLayout() {
  const c = document.getElementById('pdf-scroll'), v = pdf.viewer;
  if (!v?.pagesCount) return;
  const base = c.getBoundingClientRect().top - c.scrollTop, tops = [], heights = [];
  for (let i = 0; i < v.pagesCount; i++) {
    const r = v.getPageView(i).div.getBoundingClientRect();
    tops.push(Math.round(r.top - base));
    heights.push(Math.round(r.height));
  }
  toWindow({ kind: 'layout', tops, heights, total: c.scrollHeight, client: c.clientHeight, top: c.scrollTop });
}
const laterLayout = () => { clearTimeout(pdf.layoutTimer); pdf.layoutTimer = setTimeout(tellLayout, 50); };

// Its bookmarks (the PDF's outline, chapters and their parts) for the Outline pane: each with its level and the page
// its place is on; a click there comes back as `dest` (its number in this list) and goes to its place on that page.
async function tellOutline() {
  const outline = await pdf.doc.getOutline().catch(() => null), entries = [];
  pdf.dests = [];
  const pageOf = async dest => {
    try {
      const d = typeof dest === 'string' ? await pdf.doc.getDestination(dest) : dest;
      const ref = Array.isArray(d) ? d[0] : null;
      return ref == null ? null : typeof ref === 'number' ? ref + 1 : await pdf.doc.getPageIndex(ref) + 1;
    } catch { return null; }
  };
  const walk = async (items, level) => {
    for (const item of items ?? []) {
      const page = item.dest ? await pageOf(item.dest) : null;
      if (page) {
        entries.push({ title: item.title?.trim() || '(untitled)', level, page });
        pdf.dests.push(item.dest);
      }
      await walk(item.items, level + 1);
    }
  };
  await walk(outline, 1);
  toWindow({ kind: 'outline', entries });
}

// The place it had (from the window, after a load): the zoom first, then the scroll, once the pages have that size.
// Opened again: a page and how far down it (a share of its height) instead of the scroll.
function restore({ scaleValue, scale, top, left, page, within }) {
  const v = pdf.viewer, c = document.getElementById('pdf-scroll');
  if (/^(page-width|page-fit|page-actual|auto)$/.test(scaleValue)) v.currentScaleValue = scaleValue; else if (scale) v.currentScale = scale;
  requestAnimationFrame(() => {
    const div = page ? v.getPageView(Math.min(v.pagesCount, page) - 1)?.div : null;
    if (div) {
      const r = div.getBoundingClientRect();
      top = r.top - c.getBoundingClientRect().top + c.scrollTop + (within ?? 0) * r.height;
    }
    c.scrollTop = top ?? 0;
    c.scrollLeft = left ?? 0;
    pdf.restoring = false;
    tellState();
  });
}

async function open() {
  const file = here.searchParams.get('file');
  setLook(here.searchParams.get('mode'), here.searchParams.get('threshold') ?? 50, here.searchParams.get('bg'), here.searchParams.get('fg'), here.searchParams.get('sb'));
  const container = document.getElementById('pdf-scroll'), eventBus = new EventBus(), linkService = new PDFLinkService({ eventBus });
  pdf.viewer = new PDFViewer({ container, eventBus, linkService, textLayerMode: 1 });
  linkService.setViewer(pdf.viewer);
  eventBus.on('textlayerrendered', ({ pageNumber }) => { drawHighlights(pageNumber); drawFind(pageNumber); });   // its highlights and matches over its text
  eventBus.on('pagerendered', ({ source, pageNumber }) => {
    pdf.firstPage ??= performance.now() - pdf.started;
    const canvas = source.div.querySelector('canvas');
    if (canvas) pdf.light.set(pageNumber, brightness(canvas));
    look(pageNumber);
  });
  eventBus.on('pagesinit', () => {
    pdf.viewer.currentScaleValue = 'page-width';
    toWindow({ kind: 'ready', pages: pdf.viewer.pagesCount });
    laterLayout();
  });
  eventBus.on('pagesloaded', laterLayout);
  // Fit to the width or the page: fitted again when its room changes (the outline opened, the pane resized).
  new ResizeObserver(() => {
    const v = pdf.viewer;
    if (v?.pagesCount && /^(page-width|page-fit|auto)$/.test(v.currentScaleValue)) v.currentScaleValue = v.currentScaleValue;
    laterLayout();
  }).observe(document.getElementById('pdf-scroll'));
  // The scroll: to the window's strip at once (a frame at a time), the state a moment later.
  document.getElementById('pdf-scroll').addEventListener('scroll', () => {
    clearTimeout(pdf.scrollTimer);
    pdf.scrollTimer = setTimeout(tellState, 200);
    if (!pdf.scrollFrame) pdf.scrollFrame = requestAnimationFrame(() => { pdf.scrollFrame = 0; toWindow({ kind: 'scroll', top: document.getElementById('pdf-scroll').scrollTop }); });
  });
  eventBus.on('pagechanging', tellState);
  eventBus.on('scalechanging', () => { tellState(); laterLayout(); });
  try {
    pdf.doc = await pdfjsLib.getDocument({
      url: file, isEvalSupported: false,
      cMapUrl: asset('vendor/pdfjs/cmaps/'), cMapPacked: true, standardFontDataUrl: asset('vendor/pdfjs/standard_fonts/'),
      wasmUrl: asset('vendor/pdfjs/wasm/'), iccUrl: asset('vendor/pdfjs/iccs/'),
    }).promise;
    pdf.viewer.setDocument(pdf.doc);
    linkService.setDocument(pdf.doc);
    pdf.linkService = linkService;
    tellOutline();
    readAnnotations();   // the PDF's own highlights, in the background
  } catch (e) {
    const error = document.getElementById('pdf-error');
    error.textContent = `This PDF cannot be shown: ${e.message ?? e}`;
    error.hidden = false;
  }
}

// From the window: the bar's buttons, a new look.
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
function zoom(dir) {
  const v = pdf.viewer, now = v.currentScale;
  v.currentScale = dir > 0 ? ZOOM_STEPS.find(z => z > now + 0.001) ?? now : [...ZOOM_STEPS].reverse().find(z => z < now - 0.001) ?? now;
}
addEventListener('message', e => {
  if (e.origin !== 'https://lexpen.example' || !e.data?.toPdf) return;
  const m = e.data.toPdf, v = pdf.viewer;
  if (m.kind === 'look') return setLook(m.mode, m.threshold, m.bg, m.fg, m.sb);
  if (m.kind === 'scrollTo') return void (document.getElementById('pdf-scroll').scrollTop = m.top);
  if (m.kind === 'highlights') {   // the ones to draw, in the preview's highlight look
    hl.list = m.list;
    hl.underline = !!m.underline;
    document.documentElement.style.setProperty('--pdf-hl', m.fill);
    document.documentElement.style.setProperty('--pdf-hl-line', m.line);
    return drawAllHighlights();
  }
  if (m.kind === 'showHighlight') return void showHighlight(m);
  if (m.kind === 'texts') return void tellTexts();
  if (m.kind === 'findMarks') return findMarks(m);
  if (m.kind === 'findShow') return void findShow(m);
  if (m.kind === 'save') return void save(m).catch(e => toWindow({ kind: 'saved', error: String(e?.message ?? e) }));
  if (m.kind === 'dest') return void (pdf.dests?.[m.i] && pdf.linkService?.goToDestination(pdf.dests[m.i]));
  if (m.kind === 'restore') return m.top === undefined && !m.page ? (pdf.restoring = false, tellState()) : restore(m);
  if (!v?.pagesCount) return;
  if (m.kind === 'fitWidth') v.currentScaleValue = 'page-width';
  else if (m.kind === 'fitPage') v.currentScaleValue = 'page-fit';
  else if (m.kind === 'zoomIn') zoom(1);
  else if (m.kind === 'zoomOut') zoom(-1);
  else if (m.kind === 'next') v.nextPage();
  else if (m.kind === 'prev') v.previousPage();
  else if (m.kind === 'page') v.currentPageNumber = Math.max(1, Math.min(v.pagesCount, m.page));
});

// Ctrl+mouse wheel: zoom, as the preview does.
addEventListener('wheel', e => {
  if (!e.ctrlKey || !pdf.viewer?.pagesCount) return;
  e.preventDefault();
  zoom(e.deltaY < 0 ? 1 : -1);
}, { passive: false });
// The right-click: where, the selection, and the page and offset under it (a highlight there: its items).
addEventListener('contextmenu', e => { e.preventDefault(); toWindow({ kind: 'menu', x: e.clientX, y: e.clientY, parts: selectionParts(), at: offsetAt(e.clientX, e.clientY) }); });
// A press: its pane the active one; the keys scroll the PDF (PgUp / PgDn, the arrows, Home / End: its scroll area's
// own), so the scroll area takes the focus.
addEventListener('pointerdown', e => {
  toWindow({ kind: 'activate' });
  if (!e.target.closest?.('input, textarea, select')) setTimeout(() => document.getElementById('pdf-scroll').focus({ preventScroll: true }));
}, true);
addEventListener('focus', () => { if (document.activeElement === document.body) document.getElementById('pdf-scroll').focus({ preventScroll: true }); });
// The window's keys (a key with Ctrl or Alt, F1 to F12, Esc); the arrows, PgUp / PgDn, Home / End and typing stay here.
addEventListener('keydown', e => {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  if (!(e.ctrlKey || e.altKey || e.metaKey || /^F\d+$/.test(e.key) || e.key === 'Escape')) return;
  if (e.ctrlKey && !e.altKey && ['c', 'a'].includes(e.key.toLowerCase())) return;   // copy, select all: the PDF's text
  e.preventDefault();
  const { key, code, ctrlKey, shiftKey, altKey, metaKey } = e;
  toWindow({ kind: 'key', key, code, ctrlKey, shiftKey, altKey, metaKey });
});

// ---------- Highlights (docs/plans/executed/PLAN-pdf-view.md 3.2b) ----------
// A highlight is a part of one page's text: { page, from, to } in that page's text, which is its text items in order,
// each followed by a line break when it ends a line: the text layer pdf.js lays over the page has the same, a span per
// item and a <br> after one that ends a line, so an offset there is an offset here. The window keeps them (in LexPen,
// next to the file, or as the PDF's own highlight annotations) and sends the ones to draw; the PDF's own are drawn by
// pdf.js itself (their look is part of the page).
const hl = { list: [], colour: 'rgb(255 230 0 / .45)', underline: false, texts: new Map(), annots: null };

// A page's text and its items (each with where it starts in the text, and where it is on the page).
async function pageText(n) {
  if (hl.texts.has(n)) return hl.texts.get(n);
  const page = await pdf.doc.getPage(n), content = await page.getTextContent();
  let text = '';
  const items = [];
  for (const it of content.items) {
    if (it.str === undefined) continue;
    items.push({ start: text.length, str: it.str, t: it.transform, w: it.width, h: it.height });
    text += it.str + (it.hasEOL ? '\n' : '');
  }
  const got = { text, items };
  hl.texts.set(n, got);
  return got;
}

// The text layer's text nodes and line breaks in order, each with where it starts in the page's text.
function layerParts(layer) {
  const parts = [], walk = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    { acceptNode: n => n.nodeType === 3 || n.nodeName === 'BR' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
  let at = 0;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const len = n.nodeType === 3 ? n.length : 1;
    parts.push({ node: n, start: at, len });
    at += len;
  }
  return parts;
}

// A place in a text layer (a node and an offset in it) as an offset in its page's text: in a text node, its own; on an
// element, where the first text (or line break) at or after that point starts.
function layerOffset(layer, node, offset) {
  const parts = layerParts(layer);
  if (node.nodeType === 3) { const p = parts.find(p => p.node === node); return p ? p.start + Math.min(offset, p.len) : null; }
  const at = document.createRange();
  at.setStart(node, offset);
  at.collapse(true);
  const next = parts.find(p => at.comparePoint(p.node, 0) >= 0);
  return next ? next.start : parts.at(-1) ? parts.at(-1).start + parts.at(-1).len : 0;
}

// Offsets of a page's text as DOM ranges in its text layer (one per text node they cross).
function layerRanges(layer, from, to) {
  const ranges = [];
  for (const p of layerParts(layer)) {
    if (p.node.nodeType !== 3 || p.start + p.len <= from || p.start >= to) continue;
    const r = document.createRange();
    r.setStart(p.node, Math.max(0, from - p.start));
    r.setEnd(p.node, Math.min(p.len, to - p.start));
    ranges.push(r);
  }
  return ranges;
}

const pageOfNode = node => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.('.page');
const layerOf = pageDiv => pageDiv?.querySelector('.textLayer');

// The selection as parts of pages' texts: [{ page, from, to, text }] (a selection over several pages: a part each).
function selectionParts() {
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return [];
  const r = sel.getRangeAt(0), parts = [];
  for (const pageDiv of document.querySelectorAll('.pdfViewer .page')) {
    const layer = layerOf(pageDiv);
    if (!layer || !r.intersectsNode(layer)) continue;
    const startIn = layer.contains(r.startContainer), endIn = layer.contains(r.endContainer);
    const from = startIn ? layerOffset(layer, r.startContainer, r.startOffset) : 0;
    const all = layerParts(layer), end = all.length ? all.at(-1).start + all.at(-1).len : 0;
    const to = endIn ? layerOffset(layer, r.endContainer, r.endOffset) : end;
    if (from == null || to == null || to <= from) continue;
    const page = +pageDiv.dataset.pageNumber, text = layerParts(layer).map(p => p.node.nodeType === 3 ? p.node.data : '\n').join('').slice(from, to);
    if (text.trim()) parts.push({ page, from, to, text });
  }
  return parts;
}

// The page and the offset in its text under a point (a right-click), or null.
function offsetAt(x, y) {
  const caret = document.caretPositionFromPoint?.(x, y), pageDiv = pageOfNode(caret?.offsetNode), layer = layerOf(pageDiv);
  if (!caret || !layer || !layer.contains(caret.offsetNode)) return null;
  const at = layerOffset(layer, caret.offsetNode, caret.offset);
  return at == null ? null : { page: +pageDiv.dataset.pageNumber, offset: at };
}

// The selection told to the window as it changes (Highlight acts on it from the window's keys and menus).
let selTimer = 0;
document.addEventListener('selectionchange', () => {
  clearTimeout(selTimer);
  selTimer = setTimeout(() => toWindow({ kind: 'selection', parts: selectionParts() }), 120);
});

// ---------- Drawn ----------
// Each drawn page gets a layer between the page and its text layer, with a box per line piece of each highlight on it,
// and the note's sign at its end; drawn again when the page's text layer is drawn again (a zoom, a page come in view).
function drawHighlights(pageNumber) {
  const view = pdf.viewer?.getPageView(pageNumber - 1), pageDiv = view?.div, layer = layerOf(pageDiv);
  pageDiv?.querySelector('.pdf-hl-layer')?.remove();
  if (!pageDiv || !layer) return;
  const mine = hl.list.filter(h => h.page === pageNumber);
  if (!mine.length) return;
  const box = document.createElement('div');
  box.className = 'pdf-hl-layer';
  layer.before(box);
  const origin = pageDiv.getBoundingClientRect();
  for (const h of mine) {
    const rects = layerRanges(layer, h.from, h.to).flatMap(r => [...r.getClientRects()]).filter(q => q.width > 0.5);
    h.rects = rects.map(q => ({ left: q.left - origin.left, top: q.top - origin.top, width: q.width, height: q.height }));
    for (const q of h.rects) {
      const el = document.createElement('div');
      el.className = 'pdf-hl' + (hl.underline ? ' pdf-hl-under' : '') + (h.blink ? ' pdf-hl-blink' : '');
      Object.assign(el.style, { left: q.left + 'px', top: q.top + 'px', width: q.width + 'px', height: q.height + 'px' });
      box.append(el);
    }
    const last = h.rects.at(-1);
    if (h.note && last) {
      const sign = document.createElement('div');
      sign.className = 'pdf-hl-sign';
      Object.assign(sign.style, { left: last.left + last.width + 'px', top: last.top + 'px' });
      box.append(sign);
    }
  }
}
const drawAllHighlights = () => { for (let n = 1; n <= (pdf.viewer?.pagesCount ?? 0); n++) if (pdf.viewer.getPageView(n - 1)?.div?.querySelector('.textLayer')) drawHighlights(n); };
document.documentElement.style.setProperty('--pdf-hl', hl.colour);

// A highlight's note on the mouse: the scroll area's tooltip while over one with a note.
document.addEventListener('mousemove', e => {
  const pageDiv = e.target.closest?.('.page'), scroll = document.getElementById('pdf-scroll');
  let note = '';
  if (pageDiv) {
    const o = pageDiv.getBoundingClientRect(), x = e.clientX - o.left, y = e.clientY - o.top, n = +pageDiv.dataset.pageNumber;
    const h = hl.list.find(h => h.page === n && h.note && h.rects?.some(q => x >= q.left && x <= q.left + q.width && y >= q.top && y <= q.top + q.height));
    note = h?.note ?? '';
  }
  if (scroll.title !== note) scroll.title = note;
});

// To a highlight (the Highlights pane, Next highlight): its page, it in view, blinking once.
async function showHighlight({ page, from, to }) {
  const v = pdf.viewer;
  v.scrollPageIntoView({ pageNumber: page });
  for (let k = 0; k < 40 && !layerOf(v.getPageView(page - 1)?.div)?.childElementCount; k++) await new Promise(r => setTimeout(r, 50));
  const h = hl.list.find(x => x.page === page && x.from === from && x.to === to) ?? { page, from, to };
  if (!hl.list.includes(h)) { h.temp = true; hl.list.push(h); }
  h.blink = true;
  drawHighlights(page);
  const first = h.rects?.[0], scroll = document.getElementById('pdf-scroll'), pageDiv = v.getPageView(page - 1).div;
  if (first) scroll.scrollTop = pageDiv.offsetTop + first.top - scroll.clientHeight / 3;
  setTimeout(() => { h.blink = false; if (h.temp) hl.list.splice(hl.list.indexOf(h), 1); drawHighlights(page); }, 900);
}

// ---------- Find (the window's find bar) ----------
// The window searches the pages' texts (asked once: `texts`) and sends the matches to mark ({ page, from, to }, in the
// same offsets as the highlights) and the current one to show; a layer per drawn page, as the highlights have.
const found = { list: [], current: null, byPage: new Map() };

async function tellTexts() {
  while (!pdf.doc) await new Promise(r => setTimeout(r, 100));   // asked before the file is read
  const texts = [];
  for (let n = 1; n <= pdf.doc.numPages; n++) {
    texts.push((await pageText(n)).text);
    if (n % 20 === 0) await new Promise(r => setTimeout(r));
  }
  toWindow({ kind: 'texts', texts });
}

function findMarks({ list, current, hit, now }) {
  const root = document.documentElement.style;
  if (hit) root.setProperty('--pdf-find', hit);
  if (now) root.setProperty('--pdf-find-current', now);
  found.list = list ?? [];
  found.current = current ?? null;
  found.byPage = new Map();
  for (const f of found.list) (found.byPage.get(f.page) ?? found.byPage.set(f.page, []).get(f.page)).push(f);
  for (const div of document.querySelectorAll('.pdfViewer .page')) drawFind(+div.dataset.pageNumber);
}

function drawFind(pageNumber) {
  const pageDiv = pdf.viewer?.getPageView(pageNumber - 1)?.div, layer = layerOf(pageDiv);
  pageDiv?.querySelector('.pdf-find-layer')?.remove();
  const cur = found.current?.page === pageNumber ? found.current : null;
  const mine = (found.byPage.get(pageNumber) ?? []).filter(f => !cur || f.from !== cur.from || f.to !== cur.to);
  if (!pageDiv || !layer || (!mine.length && !cur)) return null;
  const box = document.createElement('div');
  box.className = 'pdf-hl-layer pdf-find-layer';
  layer.before(box);
  const origin = pageDiv.getBoundingClientRect();
  let first = null;
  for (const f of cur ? [...mine, cur] : mine) {
    for (const q of layerRanges(layer, f.from, f.to).flatMap(r => [...r.getClientRects()]).filter(q => q.width > 0.5)) {
      const el = document.createElement('div');
      el.className = 'pdf-find' + (f === cur ? ' pdf-find-current' : '');
      Object.assign(el.style, { left: q.left - origin.left + 'px', top: q.top - origin.top + 'px', width: q.width + 'px', height: q.height + 'px' });
      box.append(el);
      if (f === cur) first ??= q.top - origin.top;
    }
  }
  return first;
}

// The current match: its page, it in view (a third down), marked as the current one.
async function findShow({ page, from, to }) {
  const v = pdf.viewer;
  if (!v?.pagesCount) return;
  const before = found.current?.page;
  found.current = { page, from, to };
  if (before && before !== page) drawFind(before);   // the one before: a plain match again
  const pageDiv = v.getPageView(page - 1)?.div, scroll = document.getElementById('pdf-scroll');
  if (!pageDiv) return;
  if (pageDiv.offsetTop + pageDiv.offsetHeight < scroll.scrollTop || pageDiv.offsetTop > scroll.scrollTop + scroll.clientHeight) v.scrollPageIntoView({ pageNumber: page });
  for (let k = 0; k < 40 && !layerOf(v.getPageView(page - 1)?.div)?.childElementCount; k++) await new Promise(r => setTimeout(r, 50));
  if (found.current?.page !== page || found.current.from !== from) return;   // another one asked for meanwhile
  const top = drawFind(page);
  if (top == null) return;
  const y = pageDiv.offsetTop + top;
  if (y < scroll.scrollTop + 20 || y > scroll.scrollTop + scroll.clientHeight - 40) scroll.scrollTop = y - scroll.clientHeight / 3;
}

// ---------- The PDF's own highlight annotations ----------
// Read once (every page, a few at a time, so a long PDF does not hold up its first pages): each with its id in the
// file, its page, its note, and the part of the page's text under it (the text items its quads cover).
async function readAnnotations() {
  const found = [];
  for (let n = 1; n <= pdf.doc.numPages; n++) {
    const page = await pdf.doc.getPage(n), annots = await page.getAnnotations();
    for (const a of annots) {
      if (a.subtype !== 'Highlight' || !a.quadPoints?.length) continue;
      const { text, items } = await pageText(n), spans = [];
      for (let q = 0; q + 7 < a.quadPoints.length; q += 8) {
        const xs = [0, 2, 4, 6].map(i => a.quadPoints[q + i]), ys = [1, 3, 5, 7].map(i => a.quadPoints[q + i]);
        const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
        for (const it of items) {
          const ix = it.t[4], iy = it.t[5] + it.h * 0.3, len = it.str.length;
          if (!len || iy < y1 || iy > y2 || ix + it.w < x1 || ix > x2) continue;
          const a0 = Math.max(0, Math.floor((x1 - ix) / (it.w || 1) * len)), b0 = Math.min(len, Math.ceil((x2 - ix) / (it.w || 1) * len));
          if (b0 > a0) spans.push([it.start + a0, it.start + b0]);
        }
      }
      if (!spans.length) continue;
      const from = Math.min(...spans.map(s => s[0])), to = Math.max(...spans.map(s => s[1]));
      found.push({ annotId: a.id, popupRef: a.popupRef ?? null, page: n, from, to, text: text.slice(from, to), note: a.contentsObj?.str ?? a.contents ?? '' });
    }
    if (n % 20 === 0) await new Promise(r => setTimeout(r));
  }
  hl.annots = found;
  toWindow({ kind: 'annotations', list: found, changeable: await changeable() });
}

// May its annotations be changed: not when the PDF's permissions leave out changing annotations (an encrypted one).
async function changeable() {
  const perms = await pdf.doc.getPermissions().catch(() => null);
  return !perms || perms.includes(pdfjsLib.PermissionFlag.MODIFY_ANNOTATIONS);
}

// ---------- Saved into the PDF ----------
// The window's changes as pdf.js's annotations: new highlights (quads from where their text is on the page), notes
// changed and highlights removed of the PDF's own; pdf.js writes the file's bytes with them, which go to the window.
async function quadsOf(page, from, to) {
  const { items } = await pageText(page), quads = [], outlines = [];
  for (const it of items) {
    const len = it.str.length, a = Math.max(from, it.start), b = Math.min(to, it.start + len);
    if (!len || b <= a) continue;
    const x1 = it.t[4] + (a - it.start) / len * it.w, x2 = it.t[4] + (b - it.start) / len * it.w;
    const y1 = it.t[5] - it.h * 0.25, y2 = it.t[5] + it.h * 0.85;
    quads.push(x1, y2, x2, y2, x1, y1, x2, y1);
    outlines.push([x1, y1, x2, y1, x2, y2, x1, y2]);
  }
  return { quads, outlines };
}

async function save({ added, notes, removed, colour }) {
  const storage = pdf.doc.annotationStorage;
  let n = 0;
  const key = () => `pdfjs_internal_editor_lexpen_${++n}`;   // pdf.js saves only keys with its editors' prefix
  for (const h of added) {
    const { quads, outlines } = await quadsOf(h.page, h.from, h.to);
    if (!quads.length) continue;
    const xs = quads.filter((_, i) => i % 2 === 0), ys = quads.filter((_, i) => i % 2 === 1);
    const rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    storage.setValue(key(), { annotationType: pdfjsLib.AnnotationEditorType.HIGHLIGHT, pageIndex: h.page - 1, color: colour, opacity: 1,
      rect, rotation: 0, quadPoints: quads, outlines, user: 'LexPen',
      ...(h.note ? { popup: { contents: h.note, rect: [rect[2], rect[3] - 40, rect[2] + 160, rect[3]] } } : {}) });
  }
  for (const h of notes) storage.setValue(key(), { annotationType: pdfjsLib.AnnotationEditorType.HIGHLIGHT, pageIndex: h.page - 1, id: h.annotId,
    popupRef: h.popupRef ?? undefined, popup: h.note ? { contents: h.note, rect: h.popupRect ?? [0, 0, 0, 0] } : { deleted: true } });
  for (const h of removed) storage.setValue(key(), { annotationType: pdfjsLib.AnnotationEditorType.HIGHLIGHT, pageIndex: h.page - 1, id: h.annotId,
    popupRef: h.popupRef ?? undefined, deleted: true });
  const bytes = await pdf.doc.saveDocument();
  toWindow({ kind: 'saved', data: bytes });
}

globalThis.pdfPane.setLook = setLook;
open();
