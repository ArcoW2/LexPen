'use strict';
// A PDF in a tab (docs/plans/38-PLAN-pdf-view.md): always on the preview side, read-only. The tab's preview holds a
// bar (as the bar above the editor of other files) and a frame with pdf.html (pdf-pane.js), where pdf.js draws the file
// and turns each page that does not suit the mode round. This side builds them, tells the frame the mode, the
// threshold and the preview's background, passes the bar's buttons on, and shows what the frame reports (its page, its
// zoom). Loaded after app.js.

const isPdfPath = path => /\.pdf$/i.test(path ?? '');
const pdfFrames = new Map();   // a frame's window -> its tab

// Follow the theme or the original: per file (the host keeps it, as a file's language); the threshold is a setting.
const pdfLook = doc => doc.pdfLook ?? 'theme';
async function loadPdfLook(doc) {
  try { doc.pdfLook = (await host('pdfLookGet', { path: doc.path }))?.look ?? 'theme'; } catch { doc.pdfLook = 'theme'; }
}

// The mode the PDF follows: the preview's (its own theme's, when it has one), from its background's lightness.
function pdfMode(tab) {
  if (pdfLook(tab.doc) === 'original') return 'original';
  const bg = pdfBackground(tab);
  return pdfLuminance(bg) < 0.5 ? 'dark' : 'light';
}
// The preview's background: its theme's --bg (the element itself is transparent), resolved to rgb().
function pdfBackground(tab) {
  const el = paneOf(tab)?.previewEl ?? document.body, probe = document.createElement('span');
  probe.style.color = 'var(--bg)';
  el.append(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return rgb;
}
function pdfLuminance(css) {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255];
  return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255;
}

const PDF_ICON = {
  theme: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>',
  width: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h12M4.5 5.5 2 8l2.5 2.5M11.5 5.5 14 8l-2.5 2.5"/></svg>',
  page: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="4" y="1.5" width="8" height="13" rx="1"/></svg>',
  prev: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4"/></svg>',
  next: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>',
};

// The tab's preview: the bar and the frame, built once; again only for a new version of the file (pdfChanged), so a
// render for another reason (a setting, the theme) keeps the place in the PDF: the frame is told instead.
function pdfViewElement(tab) {
  const doc = tab.doc;
  if (tab.pdf?.wrap && tab.pdf.version === (doc.pdfVersion ?? 0)) { pdfTellAll(); return tab.pdf.wrap; }
  const wrap = document.createElement('div');
  wrap.className = 'mm-pdf';
  const bar = document.createElement('div');
  bar.className = 'mm-pdf-bar';   // looks as .mm-format (app.css), which a code language's pane hides
  bar.innerHTML =
    `<button class="mm-fmt" data-pdf="look">${PDF_ICON.theme}</button>` +
    '<span class="mm-pdf-threshold"><button class="mm-fmt" data-pdf="less" title="Threshold lower">-</button>' +
    '<span class="mm-pdf-value"></span><button class="mm-fmt" data-pdf="more" title="Threshold higher">+</button></span>' +
    '<span class="mm-fmt-sep"></span>' +
    `<button class="mm-fmt" data-pdf="fitWidth" title="Fit the width">${PDF_ICON.width}</button>` +
    `<button class="mm-fmt" data-pdf="fitPage" title="Fit the page">${PDF_ICON.page}</button>` +
    '<button class="mm-fmt" data-pdf="zoomOut" title="Smaller (Ctrl+mouse wheel)">-</button><span class="mm-pdf-zoom"></span>' +
    '<button class="mm-fmt" data-pdf="zoomIn" title="Larger (Ctrl+mouse wheel)">+</button>' +
    '<span class="mm-fmt-sep"></span>' +
    `<button class="mm-fmt" data-pdf="prev" title="Previous page">${PDF_ICON.prev}</button>` +
    '<input class="mm-pdf-page" title="Go to page (Enter)"><span class="mm-pdf-pages"></span>' +
    `<button class="mm-fmt" data-pdf="next" title="Next page">${PDF_ICON.next}</button>`;
  bar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  bar.addEventListener('click', e => { const b = e.target.closest('[data-pdf]'); if (b) pdfCommand(tab, b.dataset.pdf); });
  const page = bar.querySelector('.mm-pdf-page');
  page.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    pdfSend(tab, { kind: 'page', page: parseInt(page.value, 10) || 1 });
  });
  const frame = document.createElement('iframe');
  frame.className = 'mm-pdf-frame';
  frame.title = docName(doc);
  const q = new URLSearchParams({ file: FILE_URL + encodeURIComponent(doc.path) + '?v=' + (doc.pdfVersion ?? 0),
    mode: pdfMode(tab), threshold: String(setting('pdfThreshold') ?? 50), bg: pdfBackground(tab) });
  frame.src = PANE_ORIGIN + '/pdf.html?' + q;
  wrap.append(bar, frame);
  tab.pdf = { wrap, frame, bar, state: tab.pdf?.state ?? null, version: doc.pdfVersion ?? 0 };
  frame.addEventListener('load', () => pdfFrames.set(frame.contentWindow, tab));
  pdfSyncBar(tab);
  return wrap;
}

function pdfSend(tab, msg) {
  tab.pdf?.frame.contentWindow?.postMessage({ toPdf: msg }, PANE_ORIGIN);
}

// The bar as the PDF is now: the look, the threshold, the zoom and the page.
function pdfSyncBar(tab) {
  const bar = tab.pdf?.bar, s = tab.pdf.state;
  if (!bar) return;
  const following = pdfLook(tab.doc) !== 'original', mode = pdfMode(tab);
  const look = bar.querySelector('[data-pdf=look]');
  look.classList.toggle('mm-on', following);
  look.title = following ? `Follows the theme (${mode === 'dark' ? 'dark' : 'light'}): a page that does not suit it is turned round. Click: the original`
    : 'The original: every page as it is. Click: follow the theme';
  bar.querySelector('.mm-pdf-threshold').classList.toggle('mm-off', !following);
  const value = bar.querySelector('.mm-pdf-value');
  value.textContent = (setting('pdfThreshold') ?? 50) + '%';
  value.title = mode === 'light' ? 'Threshold: a page darker than this is turned round' : 'Threshold: a page brighter than this is turned round';
  bar.querySelector('.mm-pdf-zoom').textContent = s?.scale ? Math.round(s.scale * 100) + '%' : '';
  const page = bar.querySelector('.mm-pdf-page');
  if (document.activeElement !== page) page.value = s?.page ?? '';
  bar.querySelector('.mm-pdf-pages').textContent = s?.pages ? ' / ' + s.pages : '';
}

async function pdfCommand(tab, what) {
  if (what === 'look') return pdfSetLook(tab.doc, pdfLook(tab.doc) === 'original' ? 'theme' : 'original');
  if (what === 'less' || what === 'more') return setSetting('pdfThreshold', Math.max(0, Math.min(100, (setting('pdfThreshold') ?? 50) + (what === 'more' ? 5 : -5))));
  pdfSend(tab, { kind: what });
}

async function pdfSetLook(doc, look) {
  doc.pdfLook = look;
  host('pdfLookSet', { path: doc.path, look }).catch(() => {});
  pdfTellAll();
}

// The mode, the threshold or the background changed (the look, a setting, the theme): every PDF told.
function pdfTellAll() {
  for (const tab of allTabs()) if (tab.pdf?.frame.isConnected) {
    pdfSend(tab, { kind: 'look', mode: pdfMode(tab), threshold: setting('pdfThreshold') ?? 50, bg: pdfBackground(tab) });
    pdfSyncBar(tab);
  }
}

// The right-click on the PDF (its frame tells where): the look and the threshold.
function pdfMenu(tab, x, y) {
  const r = tab.pdf.frame.getBoundingClientRect(), doc = tab.doc, t = setting('pdfThreshold') ?? 50, following = pdfLook(doc) !== 'original';
  openPopupMenu([
    { label: 'Follow the &theme', checked: following, run: () => pdfSetLook(doc, 'theme') },
    { label: '&Original', checked: !following, run: () => pdfSetLook(doc, 'original') },
    '-',
    { label: 'T&hreshold', sub: [10, 20, 30, 40, 50, 60, 70, 80, 90].map(n => ({ label: n + '%', checked: n === t, run: () => setSetting('pdfThreshold', n) })) },
    '-',
    { label: 'Fit the &width', run: () => pdfSend(tab, { kind: 'fitWidth' }) },
    { label: 'Fit the &page', run: () => pdfSend(tab, { kind: 'fitPage' }) },
  ], r.left + x, r.top + y);
}

// From a PDF's frame: its state (page, pages, zoom), a right-click, a key the window has (Ctrl+Tab, Ctrl+W, F1, ...).
addEventListener('message', e => {
  if (e.origin !== PANE_ORIGIN || !e.data?.fromPdf) return;
  const tab = pdfFrames.get(e.source), m = e.data.fromPdf;
  if (!tab) return;
  if (m.kind === 'state') { tab.pdf.state = m; pdfSyncBar(tab); }
  else if (m.kind === 'menu') pdfMenu(tab, m.x, m.y);
  else if (m.kind === 'activate') { const pane = paneOf(tab); if (pane && pane.index !== state.activePane) setActivePane(pane.index); }
  else if (m.kind === 'key') document.dispatchEvent(new KeyboardEvent('keydown', { key: m.key, code: m.code, ctrlKey: m.ctrlKey,
    shiftKey: m.shiftKey, altKey: m.altKey, metaKey: m.metaKey, bubbles: true, cancelable: true }));
});

// The file changed on disk: drawn again (a new version, so the browser does not show the old one).
function pdfChanged(doc) {
  doc.pdfVersion = (doc.pdfVersion ?? 0) + 1;
  for (const tab of tabsOf(doc)) { tab.stale = true; if (paneOf(tab)?.active === tab) render(tab); }
}
