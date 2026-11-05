// A PDF's page (pdf.html; docs/plans/38-PLAN-pdf-view.md): pdf.js draws the file; each page, once drawn, is measured
// (its overall brightness) and inverted (its hues kept) when it does not suit the mode: in dark mode a page brighter
// than the threshold, in light mode one darker than it; a page that already suits the mode stays as it is, so a dark
// page is never lightened in dark mode. The address says which file and how:
// ?file=<url>&mode=dark|light|original&threshold=<0-100>&bg=<the preview's background>
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
function setLook(mode, threshold, bg) {
  pdf.mode = mode || 'original';
  pdf.threshold = Number.isFinite(+threshold) ? +threshold : 50;
  const root = document.documentElement.style;
  if (bg) root.setProperty('--pdf-bg', bg);
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
// The place it had (from the window, after a load): the zoom first, then the scroll, once the pages have that size.
function restore({ scaleValue, scale, top, left }) {
  const v = pdf.viewer, c = document.getElementById('pdf-scroll');
  if (/^(page-width|page-fit|page-actual|auto)$/.test(scaleValue)) v.currentScaleValue = scaleValue; else if (scale) v.currentScale = scale;
  requestAnimationFrame(() => {
    c.scrollTop = top ?? 0;
    c.scrollLeft = left ?? 0;
    pdf.restoring = false;
    tellState();
  });
}

async function open() {
  const file = here.searchParams.get('file');
  setLook(here.searchParams.get('mode'), here.searchParams.get('threshold') ?? 50, here.searchParams.get('bg'));
  const container = document.getElementById('pdf-scroll'), eventBus = new EventBus(), linkService = new PDFLinkService({ eventBus });
  pdf.viewer = new PDFViewer({ container, eventBus, linkService, textLayerMode: 1 });
  linkService.setViewer(pdf.viewer);
  eventBus.on('pagerendered', ({ source, pageNumber }) => {
    pdf.firstPage ??= performance.now() - pdf.started;
    const canvas = source.div.querySelector('canvas');
    if (canvas) pdf.light.set(pageNumber, brightness(canvas));
    look(pageNumber);
  });
  eventBus.on('pagesinit', () => {
    pdf.viewer.currentScaleValue = 'page-width';
    toWindow({ kind: 'ready', pages: pdf.viewer.pagesCount });
  });
  document.getElementById('pdf-scroll').addEventListener('scroll', () => { clearTimeout(pdf.scrollTimer); pdf.scrollTimer = setTimeout(tellState, 200); });
  eventBus.on('pagechanging', tellState);
  eventBus.on('scalechanging', tellState);
  try {
    pdf.doc = await pdfjsLib.getDocument({
      url: file, isEvalSupported: false,
      cMapUrl: asset('vendor/pdfjs/cmaps/'), cMapPacked: true, standardFontDataUrl: asset('vendor/pdfjs/standard_fonts/'),
      wasmUrl: asset('vendor/pdfjs/wasm/'), iccUrl: asset('vendor/pdfjs/iccs/'),
    }).promise;
    pdf.viewer.setDocument(pdf.doc);
    linkService.setDocument(pdf.doc);
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
  if (m.kind === 'look') return setLook(m.mode, m.threshold, m.bg);
  if (m.kind === 'restore') return m.top === undefined ? (pdf.restoring = false, tellState()) : restore(m);
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
addEventListener('contextmenu', e => { e.preventDefault(); toWindow({ kind: 'menu', x: e.clientX, y: e.clientY }); });
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

globalThis.pdfPane.setLook = setLook;
open();
