'use strict';
// A PDF in a tab (docs/plans/executed/PLAN-pdf-view.md): always on the preview side, read-only. The tab's preview holds a
// frame with pdf.html (pdf-pane.js), where pdf.js draws the file and turns each page that does not suit the mode round;
// its bar is the pane's, where the other files have theirs (above the editor and the preview: pane.barsEl), shown
// while the pane's active tab is a PDF. This side builds them, tells the frame the mode, the
// threshold and the preview's background, passes the bar's buttons on, and shows what the frame reports (its page, its
// zoom). Loaded after app.js.

const pdfFrames = new Map();   // a frame's window -> its tab

// Follow the theme or the original: per file (the host keeps it, as a file's language); the threshold is a setting.
const pdfLook = doc => doc.pdfLook ?? 'theme';
// With the rest the host keeps of the PDF (doc.pdfPrefs): where its highlights are kept, and whether it is read-only.
async function loadPdfLook(doc) {
  try { doc.pdfPrefs = await host('pdfLookGet', { path: doc.path }) ?? {}; } catch { doc.pdfPrefs = {}; }
  doc.pdfLook = doc.pdfPrefs.look ?? 'theme';
}

// The mode the PDF follows: the preview's (its own theme's, when it has one), from its background's lightness.
function pdfMode(tab) {
  if (pdfLook(tab.doc) === 'original') return 'original';
  const bg = pdfBackground(tab);
  return pdfLuminance(bg) < 0.5 ? 'dark' : 'light';
}
// The preview's background: its theme's --bg (the element itself is transparent), resolved to rgb(); its text colour
// the same way (the frame's horizontal scroll bar is drawn with both).
function pdfBackground(tab, name = '--bg') {
  const el = paneOf(tab)?.previewEl ?? document.body, probe = document.createElement('span');
  probe.style.color = `var(${name})`;
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

// The pane's PDF bar, made the first time; it works on the pane's active tab.
function pdfBar(pane) {
  if (pane.pdfBar) return pane.pdfBar;
  const bar = pane.pdfBar = document.createElement('div');
  bar.className = 'mm-pdf-bar';   // looks as .mm-format (app.css), which is hidden while a PDF is shown
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
    `<button class="mm-fmt" data-pdf="next" title="Next page">${PDF_ICON.next}</button>` +
    '<span class="mm-fmt-sep"></span>' +
    '<label class="mm-pdf-place-label" title="Where the highlights of this PDF are kept">Highlights: <select class="mm-pdf-place">' +
    '<option value="pdf">inside the file</option><option value="beside">next to the file</option><option value="lexpen">in LexPen</option></select></label>';
  bar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  // Where its highlights are kept (pdfhighlights.js); Cancel on the question puts the choice back.
  const place = bar.querySelector('.mm-pdf-place');
  place.addEventListener('change', async () => {
    const tab = pane.active;
    if (!tab?.doc.pdf) return;
    await pdfHlPlace(tab.doc, place.value);
    pdfSyncBar(tab);
  });
  bar.addEventListener('click', e => { const b = e.target.closest('[data-pdf]'); if (b && pane.active?.doc.pdf) pdfCommand(pane.active, b.dataset.pdf); });
  const page = bar.querySelector('.mm-pdf-page');
  page.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !pane.active?.doc.pdf) return;
    e.preventDefault();
    pdfSend(pane.active, { kind: 'page', page: parseInt(page.value, 10) || 1 });
  });
  paneBars(pane).append(bar);   // app.js
  return bar;
}

// The pane shows its active tab (showActive): its PDF bar shown while that is a PDF.
function pdfShowBar(pane) {
  const tab = pane.active, on = !!tab?.doc.pdf;
  pane.el.toggleAttribute('data-pdf', on);
  if (on) { pdfBar(pane); pdfSyncBar(tab); }
}

// The tab's preview: the frame, built once; again only for a new version of the file (pdfChanged), so a render for
// another reason (a setting, the theme) keeps the place in the PDF: the frame is told instead.
function pdfViewElement(tab) {
  const doc = tab.doc;
  if (tab.pdf?.wrap && tab.pdf.version === (doc.pdfVersion ?? 0)) { pdfTellAll(); return tab.pdf.wrap; }
  const wrap = document.createElement('div');
  wrap.className = 'mm-pdf';
  const frame = document.createElement('iframe');
  frame.className = 'mm-pdf-frame';
  frame.title = docName(doc);
  const q = new URLSearchParams({ file: FILE_URL + encodeURIComponent(doc.path) + '?v=' + (doc.pdfVersion ?? 0),
    mode: pdfMode(tab), threshold: String(setting('pdfThreshold') ?? 50), bg: pdfBackground(tab), fg: pdfBackground(tab, '--fg'), sb: String(pvWidth()) });
  frame.src = PANE_ORIGIN + '/pdf.html?' + q;
  wrap.append(frame);
  tab.pdf = { wrap, frame, state: tab.pdf?.state ?? null, version: doc.pdfVersion ?? 0 };
  frame.addEventListener('load', () => pdfFrames.set(frame.contentWindow, tab));
  pdfSyncBar(tab);
  return wrap;
}

function pdfSend(tab, msg) {
  tab.pdf?.frame.contentWindow?.postMessage({ toPdf: msg }, PANE_ORIGIN);
}

// The bar as the PDF is now: the look, the threshold, the zoom and the page (the bar of the pane it is active in).
function pdfSyncBar(tab) {
  const pane = paneOf(tab), bar = pane?.active === tab ? pane.pdfBar : null, s = tab.pdf?.state;
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
  const hls = typeof pdfHlsOf === 'function' ? pdfHlsOf(tab.doc) : null, place = bar.querySelector('.mm-pdf-place');
  if (hls) {
    place.value = hls.place;
    place.querySelector('[value=pdf]').disabled = !hls.changeable && hls.place !== 'pdf';
  }
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
    pdfSend(tab, { kind: 'look', mode: pdfMode(tab), threshold: setting('pdfThreshold') ?? 50, bg: pdfBackground(tab), fg: pdfBackground(tab, '--fg'), sb: pvWidth() });
    pdfSyncBar(tab);
  }
}

// The right-click on the PDF (its frame tells where): the look and the threshold.
function pdfMenu(tab, x, y, m = {}) {
  const r = tab.pdf.frame.getBoundingClientRect(), doc = tab.doc, t = setting('pdfThreshold') ?? 50, following = pdfLook(doc) !== 'original';
  openContextMenu([
    ...(typeof pdfHlMenuItems === 'function' ? pdfHlMenuItems(tab, m) : []),   // its highlights (pdfhighlights.js)
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
  if (m.kind === 'state') {
    const page = tab.pdf.state?.page;
    tab.pdf.state = m;
    pdfSyncBar(tab);
    if (m.page !== page) { const pane = paneOf(tab); if (pane?.active === tab) markOutline(pane); }   // its bookmark (app.js)
    clearTimeout(tab.pdf.placeTimer);
    tab.pdf.placeTimer = setTimeout(() => pdfKeepPlace(tab), 1000);
  }
  else if (m.kind === 'outline') pdfOutline(tab.doc, m.entries);
  // Its layout and scroll, for the pane's scroll strip (previewoverview.js).
  else if (m.kind === 'layout') { tab.pdf.layout = m; tab.pdf.scrollTop = m.top; pdfStripChanged(tab); }
  else if (m.kind === 'scroll') { tab.pdf.scrollTop = m.top; const pane = paneOf(tab); if (pane?.active === tab) placePvView(pane); }
  // Loaded (again: the tab was moved, or shown again in its pane): the place it had, when it had one; opened, the place
  // it was read last (pdfKeepPlace).
  else if (m.kind === 'ready') {
    pdfSend(tab, { ...(tab.pdf.state ?? tab.doc.pdfPrefs?.place ?? {}), kind: 'restore' });
    pdfHlSend(tab);
    pdfFindAgain(tab);
    pdfMarksReady(tab);   // its bookmarks (pdfbookmarks.js)
  }
  else if (m.kind === 'texts') pdfGotTexts(tab, m.texts);   // its pages' texts, for the find bar (pdffind.js)
  else if (m.kind === 'menu') pdfMenu(tab, m.x, m.y, m);
  else if (m.kind === 'answer') pdfAnswer(m);   // to a question asked (pdfbookmarks.js pdfAsk)
  else if (m.kind === 'gutter') pdfGutterClick(tab, m);   // a click in its bookmark gutter (pdfbookmarks.js)
  else if (m.kind === 'selection') tab.pdf.selection = m.parts;   // for Highlight from the keys (pdfhighlights.js)
  else if (m.kind === 'annotations') pdfHlAnnotations(tab.doc, m);
  else if (m.kind === 'saved') { for (const resolve of pdfHl.saving.values()) resolve(m); }
  else if (m.kind === 'activate') {   // a press in the PDF: also outside an open menu, which closes (menus.js)
    closeMenus();
    const pane = paneOf(tab);
    if (m.at) {   // where it was pressed: the find bar goes on from there, not from its last match (pdffind.js)
      tab.pdf.pressedAt = m.at;
      if (pane?.find) pane.find.at = null;
    }
    if (pane && pane.index !== state.activePane) setActivePane(pane.index);
  }
  else if (m.kind === 'key') document.dispatchEvent(new KeyboardEvent('keydown', { key: m.key, code: m.code, ctrlKey: m.ctrlKey,
    shiftKey: m.shiftKey, altKey: m.altKey, metaKey: m.metaKey, bubbles: true, cancelable: true }));
});

// A chord begun (keys.js setPending): the frames pass the next key on as well, whatever it is (Ctrl+K, 1), and stop
// when it is over.
function pdfChord(on) {
  for (const tab of allTabs()) if (tab.pdf?.frame.isConnected) pdfSend(tab, { kind: 'chord', on });
}

// Its bookmarks as the document's outline (app.js showOutline, languages.js outlineOf): an entry's line is its page
// (0-based) and its ch its number in the frame's list, so a click goes to its own place (pdfOutlineGo).
function pdfOutline(doc, entries) {
  doc.pdfOutline = entries.map((e, i) => ({ level: Math.max(1, Math.min(6, e.level)), text: e.title, line: e.page - 1, ch: i }));
  doc.version++;   // the outline is built again
  scheduleOutline();
}
const pdfOutlineGo = (tab, m) => pdfSend(tab, { kind: 'dest', i: m.ch ?? 0 });
// The line the outline marks its current entry by: the page shown (0-based).
const pdfOutlineLine = tab => (tab.pdf?.state?.page ?? 1) - 1;

// Where it is read, kept by the host for the next time it is opened (the last 100 PDFs): the page at the top of the view,
// how far down that page (a share of its height, so another width or zoom finds the same place) and the zoom.
function pdfKeepPlace(tab) {
  const s = tab.pdf?.state, l = tab.pdf?.layout;
  if (!s?.pages || !l?.tops?.length) return;
  let i = l.tops.findLastIndex(t => t <= s.top);
  if (i < 0) i = 0;
  const within = Math.max(0, Math.min(1, (s.top - l.tops[i]) / Math.max(1, l.heights[i])));
  const place = { page: i + 1, within: Math.round(within * 1e4) / 1e4, scaleValue: String(s.scaleValue ?? ''), scale: s.scale };
  tab.doc.pdfPrefs = { ...tab.doc.pdfPrefs, place };
  host('pdfLookSet', { path: tab.doc.path, place }).catch(() => {});
}

// ---------- The scroll strip ----------
// The pane's scroll strip (previewoverview.js) on a PDF: the frame scrolls, so its sizes are the ones it told (layout,
// scroll), and a move is sent to it (and shown at once).
function pdfScroller(tab) {
  const l = tab.pdf?.layout ?? { total: 1, client: 1 };
  return { top: tab.pdf?.scrollTop ?? 0, total: l.total, client: l.client, scrollTo: y => {
    tab.pdf.scrollTop = Math.max(0, Math.min(l.total - l.client, y));
    pdfSend(tab, { kind: 'scrollTo', top: tab.pdf.scrollTop });
    const pane = paneOf(tab);
    if (pane) placePvView(pane);
  } };
}

// Its marks on the strip: chapters (the bookmarks at the first level with more than one), highlights, its reader's
// bookmarks (pdfbookmarks.js) and find matches,
// each at its page and, with the page's text known, its share of the way down the page.
function pdfOverviewMarks(tab) {
  const l = tab.pdf?.layout, doc = tab.doc, out = [];
  if (!l) return out;
  const at = (page, from) => {
    const top = l.tops[page - 1], len = tab.pdf.texts?.[page - 1]?.length;
    if (top == null) return null;
    const y = top + (len && from ? from / len : 0) * l.heights[page - 1];
    return { top: y, bottom: y };
  };
  if (pvKind('bookmarks') && doc.pdfOutline?.length) {
    const level = [1, 2, 3, 4, 5, 6].find(n => doc.pdfOutline.filter(e => e.level === n).length > 1) ?? 1;
    for (const e of doc.pdfOutline) if (e.level === level) { const s = at(e.line + 1, 0); if (s) out.push({ kind: 'chapters', ...s, title: e.text }); }
  }
  if (pvKind('highlights')) for (const h of pdfHlsOf(doc).list) { const s = at(h.page, h.from); if (s) out.push({ kind: 'highlights', ...s }); }
  if (pvKind('bookmarks')) for (const b of doc.pdfMarks ?? []) { const s = at(b.page, b.offset); if (s) out.push({ kind: 'bookmarks', ...s }); }
  if (pvKind('find')) for (const f of tab.pdf.findMarks ?? []) { const s = at(f.page, f.from); if (s) out.push({ kind: 'find', ...s }); }
  return out;
}

const pdfStripChanged = tab => { const pane = paneOf(tab); if (pane?.active === tab) schedulePreviewOverview(pane); };

// The file changed on disk: drawn again (a new version, so the browser does not show the old one).
function pdfChanged(doc) {
  doc.pdfVersion = (doc.pdfVersion ?? 0) + 1;
  for (const tab of tabsOf(doc)) { tab.stale = true; if (paneOf(tab)?.active === tab) render(tab); }
}
