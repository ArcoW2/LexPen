// A PDF's page (pdf.html; docs/plans/38-PLAN-pdf-view.md): pdf.js draws the file, its pages in the colours of the
// preview's theme (pdf.js's page colours: the text and lines in the foreground, the page in the background, pictures
// as they are), or as the PDF is. The address says which file and which colours: ?file=<url>&bg=<colour>&fg=<colour>
// (no bg / fg: as it is).
import * as pdfjsLib from './vendor/pdfjs/pdf.min.mjs';

globalThis.pdfjsLib = pdfjsLib;   // the viewer finds the library there
const { EventBus, PDFViewer, PDFLinkService } = await import('./vendor/pdfjs/pdf_viewer.mjs');

const here = new URL(location.href), asset = p => new URL(p, here).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = asset('vendor/pdfjs/pdf.worker.min.mjs');

const pdf = { viewer: null, doc: null, started: performance.now(), firstPage: null };
globalThis.pdfPane = pdf;   // for a look from outside (the tests)

async function open() {
  const file = here.searchParams.get('file'), bg = here.searchParams.get('bg'), fg = here.searchParams.get('fg');
  const colours = bg && fg ? { background: bg, foreground: fg } : null;
  if (colours) document.documentElement.style.setProperty('--pdf-bg', bg);
  const container = document.getElementById('pdf-scroll'), eventBus = new EventBus(), linkService = new PDFLinkService({ eventBus });
  pdf.viewer = new PDFViewer({ container, eventBus, linkService, pageColors: colours, textLayerMode: 1 });
  linkService.setViewer(pdf.viewer);
  eventBus.on('pagerendered', () => { pdf.firstPage ??= performance.now() - pdf.started; });
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

open();
