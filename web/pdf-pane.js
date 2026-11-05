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

const pdf = { viewer: null, doc: null, started: performance.now(), firstPage: null, mode: 'original', threshold: 50, light: new Map() };
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

async function open() {
  const file = here.searchParams.get('file'), bg = here.searchParams.get('bg');
  pdf.mode = here.searchParams.get('mode') || 'original';
  pdf.threshold = +(here.searchParams.get('threshold') ?? 50);
  if (bg) document.documentElement.style.setProperty('--pdf-bg', bg);
  // How far a page is turned round: so that its paper becomes the preview's background (dark mode: white paper turns
  // that dark; light mode: black paper turns that light), not pure black or white.
  if (bg && pdf.mode !== 'original') {
    const l = luminance(bg);
    if (l !== null) document.documentElement.style.setProperty('--pdf-invert', String(pdf.mode === 'dark' ? 1 - l : l));
  }
  const container = document.getElementById('pdf-scroll'), eventBus = new EventBus(), linkService = new PDFLinkService({ eventBus });
  pdf.viewer = new PDFViewer({ container, eventBus, linkService, textLayerMode: 1 });
  linkService.setViewer(pdf.viewer);
  eventBus.on('pagerendered', ({ source, pageNumber }) => {
    pdf.firstPage ??= performance.now() - pdf.started;
    const canvas = source.div.querySelector('canvas');
    if (canvas) pdf.light.set(pageNumber, brightness(canvas));
    look(pageNumber);
  });
  eventBus.on('pagesinit', () => { pdf.viewer.currentScaleValue = 'page-width'; });
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

pdf.set = (mode, threshold) => { pdf.mode = mode; pdf.threshold = threshold; lookAll(); };
open();
