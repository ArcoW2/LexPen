'use strict';
// Bookmarks: numbered 1 to 9 and unnumbered ones, per file, at a line and column. They are CodeMirror
// bookmarks on the document's own Doc, shared with the tabs' linked Docs, so they follow inserted and
// removed text (a line inserted above moves them down, one removed above moves them up). While a file is
// closed the host keeps them (BookmarkStore.cs). In the editor, and in the preview at the preview's cursor
// (previewcursor.js, docs/plans/executed/PLAN-preview-bookmarks.md): each action's `preview` says which. Loaded with the editor.

const BM_GUTTER = 'mm-bookmarks';
const Pos5 = CodeMirror.Pos;

// The document's bookmarks: { 1: marker, ..., 9: marker, free: [markers] }, made from the stored list the
// first time the document is in an editor.
async function loadBookmarks(doc) {
  if (doc.marks) return;
  doc.marksLoading ??= (async () => {
    // The stored ones first; the text goes to the host only when there are bookmarks to place in it.
    let list = doc.bmList;
    if (!list) {
      const stored = await host('bookmarksGet', { path: doc.path, draft: doc.draft }).catch(() => []);
      list = stored.length ? await host('bookmarksResolve', { list: stored, text: docText(doc) }).catch(() => []) : [];
    }
    doc.bmList = null;
    if (!doc.marks) setMarks(doc, list);
  })();
  await doc.marksLoading;
  doc.marksLoading = null;
}

function setMarks(doc, list) {
  for (const marker of allMarkers(doc)) marker.clear();
  doc.marks = { free: [] };
  const cmDoc = materialize(doc);
  // insertLeft: text typed at a bookmark's place (Enter at the start of its line) pushes it along.
  for (const { n, line, ch } of list) {
    const marker = cmDoc.setBookmark(Pos5(line, ch), { insertLeft: true, shared: true });
    if (n) doc.marks[n] = marker; else doc.marks.free.push(marker);
  }
  repaintBookmarks(doc);
}

const allMarkers = doc => !doc.marks ? [] : [...Object.entries(doc.marks).filter(([k]) => k !== 'free').map(([, m]) => m), ...doc.marks.free];
const markerPos = marker => marker?.find() ?? null;

// The bookmarks as a list for the host: { n, line, ch, text }, in text order.
function bookmarkList(doc) {
  if (!doc.marks) return doc.bmList ?? [];
  const list = [];
  const add = (n, marker) => {
    const pos = markerPos(marker);
    if (pos) list.push({ n, line: pos.line, ch: pos.ch, text: doc.cmDoc.getLine(pos.line) });
  };
  for (let n = 1; n <= 9; n++) add(n, doc.marks[n]);
  for (const marker of doc.marks.free) add(0, marker);
  return list.sort((a, b) => a.line - b.line || a.ch - b.ch);
}

// To the host: after a change of the bookmarks at once; their positions again when the file is saved or closed.
function saveBookmarks(doc, key = { path: doc.path, draft: doc.draft }) {
  if (!doc.marks && !doc.bmList) return;
  return host('bookmarksSet', { ...key, list: bookmarkList(doc) }).catch(() => {});
}

// A reload from disk replaces the whole text: the bookmarks are placed again by their line text.
async function reloadBookmarks(doc, kept) {
  const list = await host('bookmarksResolve', { list: kept, text: docText(doc) }).catch(() => []);
  setMarks(doc, list);
}

// ---------- The gutter ----------
function paintBookmarks(pane) {
  const cm = pane.cm, doc = pane.active?.doc;
  if (!cm || !doc) return;
  cm.clearGutter(BM_GUTTER);
  const lines = new Map();
  for (const { n, line } of bookmarkList(doc)) {
    if (!lines.has(line)) lines.set(line, []);
    lines.get(line).push(n);
  }
  for (const [line, ns] of lines) {
    const el = document.createElement('span');
    const numbers = ns.filter(Boolean);
    el.className = numbers.length ? 'mm-bm' : 'mm-bm mm-bm-free';
    el.textContent = numbers.join('');
    el.title = (numbers.length ? 'Bookmark ' + numbers.join(', ') : 'Bookmark') + ' (click: toggle an unnumbered one)';
    cm.setGutterMarker(line, BM_GUTTER, el);
  }
  scheduleOverview(pane);   // overview.js
}

function repaintBookmarks(doc) {
  for (const pane of panes) if (pane.active?.doc === doc && pane.cm && pane.el.dataset.mode !== 'preview') paintBookmarks(pane);
  markPreviewCursors();   // the previews draw them beside their lines (previewcursor.js)
  schedulePreviewOverviews();
}

// ---------- What the actions do ----------
// The editor's cursor, or the preview's (`preview`), as a place in the text.
function cursorOf(pane, preview) {
  if (!preview) return pane.cm.getCursor('head');
  const doc = pane.active.doc, at = ensurePreviewCursor(pane) ?? { line: 0, ch: 0 };
  const line = Math.min(at.line, doc.cmDoc.lastLine());
  return Pos5(line, Math.min(at.ch, doc.cmDoc.getLine(line).length));
}

async function storeBookmark(pane, n, preview) {
  const doc = pane.active.doc;
  await loadBookmarks(doc);
  doc.marks[n]?.clear();
  doc.marks[n] = doc.cmDoc.setBookmark(cursorOf(pane, preview), { insertLeft: true, shared: true });
  repaintBookmarks(doc);
  saveBookmarks(doc);
}

// Looks at the line only: bookmark n on the cursor line goes, wherever its column; else it is stored here.
async function toggleBookmark(pane, n, preview) {
  const doc = pane.active.doc;
  await loadBookmarks(doc);
  const pos = markerPos(doc.marks[n]);
  if (pos && pos.line === cursorOf(pane, preview).line) return clearBookmark(pane, n);
  return storeBookmark(pane, n, preview);
}

async function clearBookmark(pane, n) {
  const doc = pane.active.doc;
  await loadBookmarks(doc);
  if (!doc.marks[n]) return;
  doc.marks[n].clear();
  delete doc.marks[n];
  repaintBookmarks(doc);
  saveBookmarks(doc);
}

async function toggleFreeBookmark(pane, line, ch, preview) {
  const doc = pane.active.doc;
  await loadBookmarks(doc);
  line ??= cursorOf(pane, preview).line;
  ch ??= cursorOf(pane, preview).ch;
  const here = doc.marks.free.find(m => markerPos(m)?.line === line);
  if (here) {
    here.clear();
    doc.marks.free.splice(doc.marks.free.indexOf(here), 1);
  } else doc.marks.free.push(doc.cmDoc.setBookmark(Pos5(line, ch), { insertLeft: true, shared: true }));
  repaintBookmarks(doc);
  saveBookmarks(doc);
}

// Puts the cursor at pos; `extend`: selects from where it was. The preview's cursor: there, in view (no selection).
function moveTo(pane, pos, extend, preview) {
  if (preview) return previewCursorTo(pane, pos);
  const cm = pane.cm;
  if (extend) cm.setSelection(cm.getCursor('anchor'), pos); else cm.setCursor(pos);
  revealFound(cm, pos);
  cm.focus();
}

async function goToBookmark(pane, n, extend, preview) {
  await loadBookmarks(pane.active.doc);
  const pos = markerPos(pane.active.doc.marks[n]);
  if (!pos) return toast(`Bookmark ${n} is not set in this file.`);
  moveTo(pane, pos, extend, preview);
}

// The next (dir 1) or previous (-1) bookmark of any kind, around to the first / last at the end.
async function nextBookmark(pane, dir, extend, preview) {
  const doc = pane.active.doc;
  await loadBookmarks(doc);
  const list = bookmarkList(doc);
  if (!list.length) return toast('This file has no bookmarks.');
  const here = cursorOf(pane, preview), after = b => b.line > here.line || (b.line === here.line && b.ch > here.ch);
  const before = b => b.line < here.line || (b.line === here.line && b.ch < here.ch);
  const target = dir > 0 ? list.find(after) ?? list[0] : list.findLast(before) ?? list.at(-1);
  moveTo(pane, Pos5(target.line, target.ch), extend, preview);
}

// ---------- Lists: Edit > Go to / Store bookmark, and Ctrl+K, L ----------
const bookmarkText = b => `${b.line + 1}:${b.ch + 1}  ${b.text.slice(b.ch).trim().slice(0, 50)}`;

async function bookmarkItems(kind) {
  const pane = previewOrEditor()?.pane;   // actions.js
  if (!pane) return [];
  await loadBookmarks(pane.active.doc);
  const list = bookmarkList(pane.active.doc);
  return Array.from({ length: 9 }, (_, i) => {
    const n = i + 1, b = list.find(x => x.n === n);
    return { label: `Bookmark &${n}`, action: kind === 'go' ? 'bookmarkGo' : 'bookmarkStore', params: [n],
      key: b ? bookmarkText(b) : '(not set)', enabled: kind === 'store' || !!b };
  });
}

async function showBookmarkList(pane, preview) {
  await loadBookmarks(pane.active.doc);
  const list = bookmarkList(pane.active.doc);
  if (!list.length) return toast('This file has no bookmarks.');
  const at = preview ? previewCursorCoords(pane) : pane.cm.cursorCoords(null, 'window');
  openPopupMenu(list.map(b => ({
    label: b.n ? `Bookmark &${b.n}` : 'Bookmark', key: bookmarkText(b), run: () => moveTo(pane, Pos5(b.line, b.ch), false, preview),
  })), at.left, at.top);
}
