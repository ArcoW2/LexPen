'use strict';
// Bookmarks in a PDF (docs/plans/executed/PLAN-pdf-bookmarks.md): numbered 1 to 9 and unnumbered ones, as in a text
// file, each a page and an offset in that page's text (the offsets the find bar and the highlights use), with the
// start of the text there. The window keeps them (doc.pdfMarks, in page and offset order) and the host stores them
// with a text file's (BookmarkStore.cs, under the PDF's path). The frame (pdf-pane.js) says where the PDF is (`where`:
// the place clicked last, else the top of the view, and the line there), draws them in its gutter, shows one gone to
// and tells a click in its gutter. bookmarks.js hands a PDF here. Loaded after pdffind.js.

// A question to the frame, its answer as a promise (null when it does not answer).
const pdfAsks = { n: 0, waiting: new Map() };
function pdfAsk(tab, msg) {
  const id = ++pdfAsks.n;
  return new Promise(resolve => {
    pdfAsks.waiting.set(id, resolve);
    pdfSend(tab, { ...msg, id });
    setTimeout(() => { if (pdfAsks.waiting.delete(id)) resolve(null); }, 3000);
  });
}
function pdfAnswer(m) {
  const resolve = pdfAsks.waiting.get(m.id);
  if (resolve) { pdfAsks.waiting.delete(m.id); resolve(m.value ?? null); }
}

const pdfMarkOrder = (a, b) => a.page - b.page || a.offset - b.offset;

// The stored ones, the first time they are asked for.
async function pdfLoadMarks(doc) {
  if (doc.pdfMarks) return doc.pdfMarks;
  doc.pdfMarksLoading ??= host('bookmarksGet', { path: doc.path }).catch(() => []).then(list => {
    doc.pdfMarks ??= list.filter(b => b.page >= 1).map(b => ({ n: b.n ?? 0, page: b.page, offset: b.offset ?? 0, text: b.text ?? '' })).sort(pdfMarkOrder);
  });
  await doc.pdfMarksLoading;
  return doc.pdfMarks;
}

// A change: stored, drawn in every tab of the PDF, its scroll strip and the Bookmarks panes.
function pdfMarksChanged(doc) {
  doc.pdfMarks.sort(pdfMarkOrder);
  host('bookmarksSet', { path: doc.path, list: doc.pdfMarks }).catch(() => {});
  for (const tab of tabsOf(doc)) pdfMarksSend(tab);
  tellBookmarksPanes();   // bookmarkspane.js
}

function pdfMarksSend(tab) {
  if (!tab.pdf || !tab.doc.pdfMarks) return;
  const el = paneOf(tab)?.previewEl ?? document.body, probe = document.createElement('span');
  el.append(probe);
  probe.style.color = 'var(--accent)';
  const fill = getComputedStyle(probe).color;
  probe.style.color = 'var(--bookmark-fg)';
  const fg = getComputedStyle(probe).color;
  probe.remove();
  pdfSend(tab, { kind: 'bookmarks', list: tab.doc.pdfMarks.map(({ n, page, offset }) => ({ n, page, offset })), fill, fg });
  pdfStripChanged(tab);
}

// The frame is ready (pdfview.js): its bookmarks drawn; with any, the pages' texts read to check them (pdfMarksCheck).
async function pdfMarksReady(tab) {
  const list = await pdfLoadMarks(tab.doc);
  pdfMarksSend(tab);
  if (list.length) pdfTexts(tab);   // pdffind.js; its answer comes to pdfMarksCheck
}

// The pages' texts read (pdffind.js pdfGotTexts): a PDF changed on disk gets its bookmarks back by their text.
function pdfMarksCheck(tab) {
  const doc = tab.doc;
  if (!doc.pdfMarks?.length) return;
  const { list, changed } = pdfResolveMarks(doc.pdfMarks, tab.pdf.texts);
  if (!changed) return;
  doc.pdfMarks = list;
  pdfMarksChanged(doc);
}

// Each bookmark placed in the pages' texts: it stays when its text is still at its place; else it goes to where that
// text is, on its page (the nearest to its offset) or the nearest page with it (the one before wins a tie); else it
// stays where it was. Its page at most the last one.
function pdfResolveMarks(list, texts) {
  let changed = false;
  const out = list.map(b => {
    const t = b.text ?? '';
    if (!t.trim() || (texts[b.page - 1] ?? '').startsWith(t, b.offset)) return b;
    for (let d = 0; d < texts.length + b.page; d++) {
      for (const page of d ? [b.page - d, b.page + d] : [b.page]) {
        const text = texts[page - 1];
        if (text == null) continue;
        let best = -1;
        for (let i = text.indexOf(t); i >= 0; i = text.indexOf(t, i + 1)) if (best < 0 || Math.abs(i - b.offset) < Math.abs(best - b.offset)) best = i;
        if (best >= 0) { changed = true; return { ...b, page, offset: best }; }
      }
    }
    if (b.page > texts.length && texts.length) { changed = true; return { ...b, page: texts.length, offset: 0 }; }
    return b;
  });
  return { list: out, changed };
}

// ---------- What the actions do (bookmarks.js hands a PDF here) ----------
// Where the PDF is: { page, offset, line, lineEnd (that line's start and end in the page's text), text, x, y (in the
// window) }, or null.
async function pdfWhere(tab) {
  const at = await pdfAsk(tab, { kind: 'where' });
  if (!at) return null;
  const r = tab.pdf.frame.getBoundingClientRect();
  return { ...at, x: r.left + at.x, y: r.top + at.y };
}

const onLine = (b, at) => b.page === at.page && b.offset >= at.line && b.offset <= at.lineEnd;

async function pdfStoreBookmark(tab, n, at) {
  const doc = tab.doc, list = await pdfLoadMarks(doc);
  at ??= await pdfWhere(tab);
  if (!at) return;
  doc.pdfMarks = list.filter(b => b.n !== n);
  doc.pdfMarks.push({ n, page: at.page, offset: at.offset, text: at.text });
  pdfMarksChanged(doc);
}

// As in a text file: bookmark n on the line of the place goes; else it is stored there.
async function pdfToggleBookmark(tab, n) {
  const list = await pdfLoadMarks(tab.doc), at = await pdfWhere(tab), b = list.find(b => b.n === n);
  if (!at) return;
  if (b && onLine(b, at)) return pdfClearBookmark(tab, n);
  return pdfStoreBookmark(tab, n, at);
}

async function pdfClearBookmark(tab, n) {
  const doc = tab.doc, list = await pdfLoadMarks(doc);
  if (!list.some(b => b.n === n)) return;
  doc.pdfMarks = list.filter(b => b.n !== n);
  pdfMarksChanged(doc);
}

// An unnumbered one on the line of the place (or the line clicked in the gutter, `at`): removed, else one there.
async function pdfToggleFree(tab, at) {
  const doc = tab.doc, list = await pdfLoadMarks(doc);
  at ??= await pdfWhere(tab);
  if (!at) return;
  const here = list.find(b => !b.n && onLine(b, at));
  if (here) doc.pdfMarks = list.filter(b => b !== here);
  else doc.pdfMarks.push({ n: 0, page: at.page, offset: at.offset, text: at.text });
  pdfMarksChanged(doc);
}

// To a bookmark: its line in view and the caret there, so F3 and the next bookmark go on from it (pdffind.js).
function pdfShowMark(tab, b) {
  pdfSend(tab, { kind: 'bookmarkShow', page: b.page, offset: b.offset });
  tab.pdf.pressedAt = { page: b.page, offset: b.offset };
  const pane = paneOf(tab);
  if (pane?.find) pane.find.at = null;
  tab.pdf.frame.focus();
}

async function pdfGoToBookmark(tab, n) {
  const b = (await pdfLoadMarks(tab.doc)).find(b => b.n === n);
  if (!b) return toast(`Bookmark ${n} is not set in this file.`);
  pdfShowMark(tab, b);
}

// The next (dir 1) or previous (-1) one of any kind from the place, around to the first / last at the end.
async function pdfNextBookmark(tab, dir) {
  const list = await pdfLoadMarks(tab.doc);
  if (!list.length) return toast('This file has no bookmarks.');
  const at = await pdfWhere(tab) ?? { page: 1, offset: -1 };
  const after = b => b.page > at.page || (b.page === at.page && b.offset > at.offset);
  const before = b => b.page < at.page || (b.page === at.page && b.offset < at.offset);
  pdfShowMark(tab, dir > 0 ? list.find(after) ?? list[0] : list.findLast(before) ?? list.at(-1));
}

// In the lists: its page and the start of its text.
const pdfBookmarkText = b => `p. ${b.page}  ${String(b.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 50)}`;

async function pdfBookmarkGoItems(tab) {
  return (await pdfLoadMarks(tab.doc)).map(b => ({ label: b.n ? `Bookmark &${b.n}` : 'Bookmark', key: pdfBookmarkText(b), run: () => pdfShowMark(tab, b) }));
}

// Ctrl+K, L: the list at the place.
async function pdfShowBookmarkList(tab) {
  const items = await pdfBookmarkGoItems(tab);
  if (!items.length) return toast('This file has no bookmarks.');
  const at = await pdfWhere(tab), r = tab.pdf.frame.getBoundingClientRect();
  openPopupMenu(items, at?.x ?? r.left + 40, at?.y ?? r.top + 40);
}

// The frame's gutter clicked (pdfview.js): an unnumbered bookmark toggled on that line.
const pdfGutterClick = (tab, m) => pdfToggleFree(tab, m);
