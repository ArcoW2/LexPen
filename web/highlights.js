'use strict';
// Highlights (docs/plans/executed/PLAN-highlights.md): parts of a document's text marked as with a highlighter pen, with an
// optional note, kept per file (the host's HighlightStore: LexPen's store or a .lph next to the file). They belong to
// the document, not to an editor or a preview: one set per document (doc.hls), shown in every editor and preview of
// it. In the editor a highlight is a CodeMirror mark on the document's main Doc (shared with every tab's linked Doc),
// so it moves with every edit; in the preview the CSS Custom Highlight API draws it where its source text shows
// (sourcemap.js). Placing them again in a file changed outside LexPen runs in the background (highlights.worker.js),
// when the window is idle, the document in view first, and never holds up opening a file.
// Loaded after previewjump.js and sourcemap.js.

// doc.hls: { list, loaded, loading }; each highlight { id, from, to ([line, ch], null when detached), text, before,
// after, note, state ('', 'adjusted', 'detached'), was (the text before it was adjusted), mark, sign }.
const hl = { worker: null, run: 0, waiting: new Map(), queue: [], idle: 0, id: 0, readonlySaid: false };
const HL_AROUND = 40;

const hlsOf = doc => doc.hls ??= { list: [], loaded: false, loading: null };
const placedHls = doc => hlsOf(doc).list.filter(h => h.state !== 'detached');
// Line starts of a text, made once per text (the last one kept): a place [line, ch] to an offset and back without
// walking a large file again for every highlight.
const hlLines = { text: null, starts: null };
function lineStartsOf(text) {
  if (hlLines.text === text) return hlLines.starts;
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  hlLines.text = text;
  hlLines.starts = starts;
  return starts;
}
const hlOffset = (text, p) => { const starts = lineStartsOf(text); return p[0] >= starts.length ? text.length : Math.min(text.length, starts[p[0]] + p[1]); };
function hlPlace(text, o) {
  const starts = lineStartsOf(text);
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= o) lo = mid; else hi = mid - 1; }
  return [lo, o - starts[lo]];
}

// A highlight's place now: from its mark when the editor has one (it moved with the edits), else as stored. The main
// Doc's own part of the mark (rootMark) answers when the shared mark cannot: CodeMirror keeps a shared mark's place in
// a tab's linked Doc, and a tab released (releaseTabDoc) takes that along.
function hlRange(doc, h) {
  if (h.mark || h.rootMark) {
    const r = h.mark?.find() ?? h.rootMark?.find();
    if (!r) return null;   // its text was deleted
    return { from: [r.from.line, r.from.ch], to: [r.to.line, r.to.ch] };
  }
  return h.from && h.to ? { from: h.from, to: h.to } : null;
}

// ---------- Loading and placing ----------
// Asked when a document is shown (in an editor or a preview): the stored highlights, placed in the background.
function loadHighlights(doc) {
  const hls = hlsOf(doc);
  if (hls.loaded || hls.loading || (!doc.path && !doc.draft)) return hls.loading;
  hls.loading = (async () => {
    const got = await host('highlightsGet', { path: doc.path, draft: doc.draft }).catch(() => null);
    if (!got || !got.list.length) return finishLoad(doc, []);
    const list = got.list.map(h => ({ ...h, id: ++hl.id, state: h.state ?? '' }));
    const unchanged = !doc.dirty && got.size != null && got.size === got.nowSize && got.time === got.nowTime;
    // 1. The file as when they were written: their places, when their text is still there (costs next to nothing).
    if (unchanged) {
      const text = docText(doc);
      if (list.every(h => h.state === 'detached' || (h.from && text.slice(hlOffset(text, h.from), hlOffset(text, h.to)) === h.text)))
        return finishLoad(doc, list);
    }
    // 2 to 4: looked up in the background, when the window is idle.
    await placeInBackground(doc, list, unchanged);
  })();
  return hls.loading;
}

function finishLoad(doc, list, counts) {
  const hls = hlsOf(doc);
  hls.list = list;
  hls.loaded = true;
  hls.loading = null;
  markHighlights(doc);
  drawHighlightsOf(doc);
  if (counts) {
    const said = [counts.adjusted && `${counts.adjusted} highlight${counts.adjusted === 1 ? '' : 's'} adjusted`,
      counts.detached && `${counts.detached} detached (no longer in the file; see the highlights window)`].filter(Boolean);
    if (said.length) toast(`${docName(doc)}: ${said.join(', ')}.`, true);
    saveHighlights(doc, true);   // each placed one written back as it is now in the file
  }
  tellHighlightsWindow();
}

// The lookup, queued: one document at a time, when the window is idle, the one in view first.
function placeInBackground(doc, list, unchanged) {
  return new Promise(resolve => {
    hl.queue.push({ doc, list, unchanged, resolve });
    runQueue();
  });
}

function runQueue() {
  if (hl.idle || !hl.queue.length) return;
  const idle = window.requestIdleCallback ?? (f => setTimeout(f, 50));
  hl.idle = idle(() => {
    hl.idle = 0;
    const shown = panes[state.activePane]?.active?.doc;
    const i = Math.max(0, hl.queue.findIndex(q => q.doc === shown));
    const [job] = hl.queue.splice(i, 1);
    hl.worker ??= new Worker('highlights.worker.js');
    const id = ++hl.run;
    hl.waiting.set(id, job);
    hl.worker.onmessage = ({ data }) => {
      const done = hl.waiting.get(data.id);
      hl.waiting.delete(data.id);
      if (!done) return;
      finishLoad(done.doc, data.list.map(h => ({ ...h, id: ++hl.id })), data.counts);
      done.resolve();
      runQueue();
    };
    // The text as it is when the lookup runs (an edit made meanwhile included).
    hl.worker.postMessage({ id, text: docText(job.doc), list: job.list.map(plainHighlight), unchanged: job.unchanged });
  }, { timeout: 3000 });
}

// What is stored of a highlight (and sent to the worker).
const plainHighlight = h => ({ from: h.from, to: h.to, text: h.text, before: h.before, after: h.after, note: h.note ?? '', state: h.state ?? '', was: h.was ?? null });

// ---------- In the editor ----------
// The marks on the document's main Doc (every tab's linked Doc shows them), made once the document has one.
// A mark is made again only when its look changes (its note, adjusted or not), at the place the old one has now (it
// moved with the edits); the others stay as they are.
function markHighlights(doc) {
  if (!doc.cmDoc || !hlsOf(doc).loaded) return;
  const cmDoc = doc.cmDoc;
  for (const h of hlsOf(doc).list) {
    const key = (h.state ?? '') + '|' + (h.note ?? ''), alive = h.mark?.find() ?? h.rootMark?.find();
    if (alive && h.markKey === key && h.state !== 'detached') continue;
    const at = alive ? { from: [alive.from.line, alive.from.ch], to: [alive.to.line, alive.to.ch] } : h.from && h.to ? { from: h.from, to: h.to } : null;
    clearHlMarks(h);
    h.markKey = key;
    if (h.state === 'detached' || !at) continue;
    Object.assign(h, at);
    const from = CodeMirror.Pos(...at.from), to = CodeMirror.Pos(...at.to);
    h.mark = cmDoc.markText(from, to, {
      className: 'mm-hl' + (h.state === 'adjusted' ? ' mm-hl-adjusted' : ''), shared: true, clearWhenEmpty: true,
      attributes: h.note ? { title: h.note } : undefined,
    });
    h.rootMark = h.mark.markers?.find(m => m.doc === cmDoc) ?? null;
    // The note's sign: one per tab's Doc (a shared bookmark has one widget for all of them, shown in one editor only).
    if (h.note) { h.signs = []; cmDoc.iterLinkedDocs(d => h.signs.push(d.setBookmark(to, { widget: noteSign(h.note) }))); }
  }
}

// Not clearMarks: find.js has a global function of that name, and the one loaded last replaced the other.
function clearHlMarks(h) {
  h.mark?.clear(); h.rootMark?.clear();
  for (const s of h.signs ?? []) s.clear();
  h.mark = h.rootMark = h.signs = null;
}

// A tab's linked Doc released (app.js releaseTabDoc): the marks made again on the main Doc, at their places, so every
// other tab shows them again.
function remarkHighlights(doc) {
  for (const h of doc.hls?.list ?? []) h.markKey = null;
  markHighlights(doc);
}

// A tab's linked Doc made (app.js tabDoc): the note signs in it too.
function signHighlights(doc, cmDoc) {
  for (const h of doc.hls?.list ?? []) {
    const at = h.signs && hlRange(doc, h);
    if (at) h.signs.push(cmDoc.setBookmark(CodeMirror.Pos(...at.to), { widget: noteSign(h.note) }));
  }
}

const noteSign = note => Object.assign(document.createElement('span'), { className: 'mm-hl-sign', title: note });

// The whole text replaced (a reload from disk, Revert to saved): the marks go with it. Kept just before (as they are
// then), and placed again in the new text in the background, as a file changed outside LexPen is.
function keepHighlights(doc) {
  const hls = doc.hls;
  if (!hls?.loaded || !hls.list.length) return null;
  const text = docText(doc);
  const list = hls.list.map(h => {
    const r = hlRange(doc, h);
    if (!r) return plainHighlight(h);
    const now = describe(text, hlOffset(text, r.from), hlOffset(text, r.to), {});
    return { ...plainHighlight(h), from: now.from, to: now.to, text: now.text, before: now.before, after: now.after };
  });
  for (const h of hls.list) clearHlMarks(h);
  return list;
}

function placeHighlightsAgain(doc, list) {
  const hls = hlsOf(doc);
  hls.list = [];
  hls.loaded = false;
  hls.loading = placeInBackground(doc, list, false);
}

// An edit: the marks moved by themselves; the list is written again a second later, and the previews redrawn.
function highlightsEdited(doc) {
  if (!doc.hls?.list.length) return;
  saveHighlights(doc);
}

// ---------- Making and removing ----------
// Highlight source ranges ([from, to] offsets) of a document: merged with highlights they touch or overlap (their
// notes joined).
function addHighlights(doc, ranges) {
  const text = docText(doc), hls = hlsOf(doc);
  hls.loaded = true;
  for (let [a, b] of ranges) {
    if (b <= a) continue;
    const notes = [];
    for (const h of [...hls.list]) {
      const r = hlRange(doc, h);
      if (!r) continue;
      const ha = hlOffset(text, r.from), hb = hlOffset(text, r.to);
      if (hb < a || ha > b) continue;
      a = Math.min(a, ha); b = Math.max(b, hb);
      if (h.note) notes.push(h.note);
      dropHighlight(doc, h);
    }
    hls.list.push(describe(text, a, b, { id: ++hl.id, note: notes.join('\n'), state: '' }));
  }
  changedHighlights(doc);
}

// A highlight's description from offsets in the text.
function describe(text, a, b, h) {
  return { ...h, from: hlPlace(text, a), to: hlPlace(text, b), text: text.slice(a, b), before: text.slice(Math.max(0, a - HL_AROUND), a), after: text.slice(b, b + HL_AROUND), mark: null, sign: null };
}

function dropHighlight(doc, h) {
  clearHlMarks(h);
  const list = hlsOf(doc).list, i = list.indexOf(h);
  if (i >= 0) list.splice(i, 1);
}

// The highlights at an offset, or overlapping [a, b).
function highlightsAt(doc, a, b = a) {
  const text = docText(doc);
  return placedHls(doc).filter(h => {
    const r = hlRange(doc, h);
    if (!r) return false;
    const ha = hlOffset(text, r.from), hb = hlOffset(text, r.to);
    return b > a ? ha < b && hb > a : ha <= a && a <= hb;
  });
}

// After any change: the marks, the store (a second later), the previews, the window.
function changedHighlights(doc) {
  markHighlights(doc);
  saveHighlights(doc);
  drawHighlightsOf(doc);
  tellHighlightsWindow();
}

// ---------- Kept ----------
// Written a second after a change (`now`: at once), each as it is now in the text.
function saveHighlights(doc, now) {
  const hls = hlsOf(doc);
  clearTimeout(hls.timer);
  const write = () => {
    if (!doc.path && !doc.draft) return;
    const text = docText(doc), list = [];
    for (const h of [...hls.list]) {
      if (h.state === 'detached') { list.push(plainHighlight(h)); continue; }
      const r = hlRange(doc, h);
      if (!r) { dropHighlight(doc, h); continue; }   // its whole text deleted: gone
      const now = describe(text, hlOffset(text, r.from), hlOffset(text, r.to), {});
      Object.assign(h, { from: now.from, to: now.to, text: now.text, before: now.before, after: now.after });
      list.push(plainHighlight(h));
    }
    host('highlightsSet', { path: doc.path, draft: doc.draft, list, beside: setting('highlightsStore') === 'beside' }).then(where => {
      if (where === 'store-readonly' && !hl.readonlySaid) {
        hl.readonlySaid = true;
        toast(`The highlights of ${docName(doc)} could not be written next to it (its folder cannot be written to): kept in LexPen's store.`);
      }
    }).catch(() => {});
  };
  if (now) write(); else hls.timer = setTimeout(write, 1000);
}

// Another window changed the highlights of a file shown here: read again.
events.highlights = ({ path, draft }) => {
  for (const doc of docs) {
    if (!(path ? samePath(doc.path, path) : doc.draft === draft)) continue;
    for (const h of hlsOf(doc).list) clearHlMarks(h);
    doc.hls = null;
    loadHighlights(doc);
  }
};

// ---------- Going through them ----------
// The next / previous highlight from the cursor (editor) or the top of what is visible (preview): selected, placed as
// a place jumped to; past the last one as find does at the end of the file (findWrap).
function goHighlight(pane, dir) {
  const tab = pane.active, doc = tab?.doc;
  if (!doc) return;
  const text = docText(doc);
  const spots = placedHls(doc).map(h => { const r = hlRange(doc, h); return r && { h, a: hlOffset(text, r.from), b: hlOffset(text, r.to) }; })
    .filter(Boolean).sort((x, y) => x.a - y.a);
  if (!spots.length) return toast('No highlights in this document.', true);
  let here;
  if (tab.mode !== 'preview' && pane.cm) {
    const c = pane.cm.getCursor(dir > 0 ? 'to' : 'from');
    here = pane.cm.indexFromPos(c);
  } else here = previewTopOffset(pane);
  let next = dir > 0 ? spots.find(s => s.a > here || (s.a === here && pane.cm?.somethingSelected() === false)) : spots.findLast(s => s.a < here);
  if (!next) {
    if ((setting('findWrap') || 'end') === 'end') return toast(dir > 0 ? 'No more highlights below.' : 'No more highlights above.', true);
    next = dir > 0 ? spots[0] : spots[spots.length - 1];
  }
  goToHighlight(pane, next.h);
}

// A highlight shown: in the editor selected (placed as a place jumped to; a preview of it scrolls along by its cursor
// bar), in a preview only scrolled to and blinking once.
function goToHighlight(pane, h) {
  const tab = pane.active, doc = tab.doc, r = hlRange(doc, h);
  if (!r) return;
  if (tab.mode !== 'preview' && pane.cm) {
    const cm = pane.cm, from = CodeMirror.Pos(...r.from), to = CodeMirror.Pos(...r.to);
    asFound(pane, () => cm.setSelection(from, to));
    revealFound(cm, from, to);
    cm.focus();
    return;
  }
  const text = docText(doc), ranges = previewRangesOf(tab, hlOffset(text, r.from), hlOffset(text, r.to));
  if (!ranges.length) return;
  revealFoundInPreview(pane, ranges[0], ranges.at(-1));
  CSS.highlights.set('mm-hl-blink', new Highlight(...ranges));
  setTimeout(() => CSS.highlights.delete('mm-hl-blink'), 700);
}

// The source offset at the top of what a preview shows.
function previewTopOffset(pane) {
  const tab = pane.active, view = pane.previewEl.getBoundingClientRect();
  const caret = document.caretRangeFromPoint?.(view.left + 40, view.top + 10);
  const at = caret && sourceOffsetAt(tab, caret.startContainer, caret.startOffset);
  return at ?? 0;
}

// ---------- In the preview ----------
// Every pane showing a preview of the document: its highlights drawn where their source text shows, in the look of
// Preview > Highlight; a highlight with a note gets a small sign at its end, and its note as a tooltip.
function drawHighlightsOf(doc) {
  for (const pane of panes) if (pane.active?.doc === doc) {
    drawPreviewHighlights(pane);
    if (typeof scheduleOverview === 'function' && pane.cm) scheduleOverview(pane);   // the scroll bar's marks
    if (typeof paintHighlightLines === 'function' && pane.cm) paintHighlightLines(pane);   // gutter.js: the gutter's strip
  }
}

function drawPreviewHighlights(pane) {
  const name = 'mm-hl-' + pane.index, tab = pane.active;
  pane.hlSigns?.remove();
  pane.hlSigns = null;
  pane.hlSpots = [];
  if (!tab || tab.mode === 'edit' || !tab.doc.hls?.list.length) return CSS.highlights.delete(name);
  const doc = tab.doc, text = docText(doc), all = [];
  for (const h of placedHls(doc)) {
    const r = hlRange(doc, h);
    if (!r) continue;
    const ranges = previewRangesOf(tab, hlOffset(text, r.from), hlOffset(text, r.to));
    all.push(...ranges);
    if (h.note && ranges.length) pane.hlSpots.push({ h, ranges });
  }
  if (all.length) CSS.highlights.set(name, new Highlight(...all)); else CSS.highlights.delete(name);
  if (typeof schedulePreviewOverview === 'function') schedulePreviewOverview(pane);   // the preview's scroll bar
  // The note signs, in a layer after the content (as the cursor's bar).
  if (!pane.hlSpots.length) return;
  const layer = pane.hlSigns = document.createElement('div');
  layer.className = 'mm-hl-signs';
  pane.previewEl.append(layer);
  const origin = layer.getBoundingClientRect();
  for (const { h, ranges } of pane.hlSpots) {
    const rects = [...ranges[ranges.length - 1].getClientRects()];
    const last = rects[rects.length - 1];
    if (!last) continue;
    const sign = noteSign(h.note);
    Object.assign(sign.style, { position: 'absolute', left: last.right - origin.left + 'px', top: last.top - origin.top + 'px' });
    layer.append(sign);
  }
}

// The preview's look (Preview > Highlight): a style of the highlight per pane, from the preview's own colours.
function applyPreviewHighlight() {
  let style = document.getElementById('mm-hl-preview-style');
  if (!style) { style = Object.assign(document.createElement('style'), { id: 'mm-hl-preview-style' }); document.head.append(style); }
  const rules = [];
  for (const pane of panes) {
    const colour = atIntensity(colourCss(setting('previewHighlightColour'), 'highlight'), setting('previewHighlightIntensity'), pane.previewEl);
    rules.push(setting('previewHighlightStyle') === 'underline'
      ? `::highlight(mm-hl-${pane.index}) { text-decoration: underline 2px ${colour}; text-underline-offset: 3px; }`
      : `::highlight(mm-hl-${pane.index}) { background-color: ${colour}; }`);
  }
  rules.push('::highlight(mm-hl-blink) { background-color: var(--find-current); color: var(--find-current-fg); }');
  style.textContent = rules.join('\n');
}

// A highlight's note as a tooltip in the preview: the mouse resting on its text.
function previewNoteAt(pane, x, y) {
  for (const { h, ranges } of pane.hlSpots ?? [])
    for (const r of ranges) for (const q of r.getClientRects())
      if (x >= q.left && x <= q.right && y >= q.top && y <= q.bottom) return h.note;
  return null;
}

// ---------- The actions ----------
// The selection (or each of them) in the editor, or the selection in the preview, as source offset ranges; null when
// the preview's selection cannot be placed in the text.
function selectedRanges(pane) {
  const tab = pane.active;
  if (!tab) return [];
  const sel = getSelection();
  if (tab.mode !== 'edit' && sel.rangeCount && !sel.isCollapsed && pane.previewEl.contains(sel.anchorNode)) {
    const r = sel.getRangeAt(0);
    const a = sourceOffsetAt(tab, r.startContainer, r.startOffset), b = sourceOffsetAt(tab, r.endContainer, r.endOffset);
    if (a == null || b == null || b <= a) { toast('That part of the preview cannot be placed in the text (made up by markdown).'); return null; }
    return [[a, b]];
  }
  if (!pane.cm || tab.mode === 'preview') return [];
  return pane.cm.listSelections().filter(r => !r.empty()).map(r => [pane.cm.indexFromPos(r.from()), pane.cm.indexFromPos(r.to())]);
}

// The offset of the cursor (editor) or of the selection's start (preview).
function cursorOffset(pane) {
  const tab = pane.active, sel = getSelection();
  const inPreview = sel.rangeCount && pane.previewEl.contains(sel.anchorNode);
  if (tab.mode !== 'preview' && pane.cm && !inPreview) return pane.cm.indexFromPos(pane.cm.getCursor());
  return inPreview ? sourceOffsetAt(tab, sel.anchorNode, sel.anchorOffset) : null;
}

// Highlight: the selection gets a highlight; nothing selected and the cursor in one: that one removed.
async function highlightToggle(pane) {
  const doc = pane.active?.doc;
  if (!doc) return;
  await loadHighlights(doc);
  const ranges = selectedRanges(pane);
  if (ranges === null) return;
  if (ranges.length) return addHighlights(doc, ranges);
  const at = cursorOffset(pane), hit = at == null ? [] : highlightsAt(doc, at);
  if (!hit.length) return toast('Select text to highlight it.', true);
  await removeHighlights(doc, hit);
}

// Selection to highlight: only adds.
async function highlightFromSelection(pane) {
  const doc = pane.active?.doc;
  if (!doc) return;
  await loadHighlights(doc);
  const ranges = selectedRanges(pane);
  if (ranges?.length) addHighlights(doc, ranges);
}

// Remove highlight: at the cursor, or every one within the selection.
async function highlightRemove(pane) {
  const doc = pane.active?.doc;
  if (!doc) return;
  await loadHighlights(doc);
  const ranges = selectedRanges(pane) ?? [];
  const hit = ranges.length ? ranges.flatMap(([a, b]) => highlightsAt(doc, a, b)) : highlightsAt(doc, cursorOffset(pane) ?? -1);
  if (hit.length) await removeHighlights(doc, [...new Set(hit)]);
}

// Removed; one with a note asks first.
async function removeHighlights(doc, list) {
  const notes = list.filter(h => h.note).length;
  if (notes && !await confirmBox(list.length === 1 ? 'Remove the highlight and its note?' : `Remove ${list.length} highlights, ${notes} with a note?`)) return;
  for (const h of list) dropHighlight(doc, h);
  changedHighlights(doc);
}

// Remove all highlights in this file: asks first (the count from the document).
async function highlightClear(pane) {
  const doc = pane.active?.doc;
  if (!doc) return;
  await loadHighlights(doc);
  const list = hlsOf(doc).list, notes = list.filter(h => h.note).length;
  if (!list.length) return toast('No highlights in this document.', true);
  if (!await confirmBox(`Remove the ${list.length} highlight${list.length === 1 ? '' : 's'} in ${docName(doc)}${notes ? `, ${notes} with a note` : ''}?`)) return;
  for (const h of [...list]) dropHighlight(doc, h);
  changedHighlights(doc);
}

// Highlight note: write or change the note of the highlight at the cursor (or at the preview's right-click). Not in
// one: the selection, else the word there (the nearest on its line), highlighted with the note once it is written
// (cancelled or empty: nothing highlighted). Empty on a highlight: the note gone, the highlight stays.
async function highlightNote(pane, target) {
  const doc = pane.active?.doc;
  if (!doc) return;
  await loadHighlights(doc);
  let h = target, ranges = [];
  if (!h) {
    ranges = selectedRanges(pane);
    if (ranges === null) return;
    const at = menuOffset(pane) ?? cursorOffset(pane);
    h = (ranges.length ? highlightsAt(doc, ranges[0][0], ranges[0][1]) : highlightsAt(doc, at ?? -1))[0];
    if (!h && !ranges.length && at != null) ranges = [wordNear(docText(doc), at)].filter(Boolean);
  }
  if (!h && !ranges.length) return toast('Put the cursor on a word or in a highlight, or select text, to write a note.', true);
  const note = await noteBox(h?.note ?? '', h ? h.text ?? '' : docText(doc).slice(...ranges[0]));
  if (note === null) return;
  if (!h) {
    if (!note.trim()) return;
    addHighlights(doc, ranges);   // merged with highlights it touches: their notes first
    h = highlightsAt(doc, ranges[0][0], ranges[0][1])[0];
    if (!h) return;
    h.note = [h.note, note.trim()].filter(Boolean).join('\n');
  } else h.note = note.trim();
  changedHighlights(doc);
  if (pane.cm && pane.active.mode !== 'preview') pane.cm.focus();
}

// The word at an offset of the text, else the nearest one on its line: [from, to], or null (no word on the line).
function wordNear(text, at) {
  const start = text.lastIndexOf('\n', at - 1) + 1, nl = text.indexOf('\n', at), end = nl < 0 ? text.length : nl;
  let best = null;
  for (const m of text.slice(start, end).matchAll(/[\p{L}\p{N}_]+/gu)) {
    const a = start + m.index, b = a + m[0].length, gap = at < a ? a - at : at > b ? at - b : 0;
    if (!best || gap < best.gap) best = { a, b, gap };
  }
  return best && [best.a, best.b];
}

// The preview's right-click point, for the menu's Highlight note (the editor's own right-click moves its cursor):
// kept until the next mouse button or key.
addEventListener('mousedown', () => hl.menuAt = null, true);
addEventListener('keydown', () => hl.menuAt = null, true);
addEventListener('contextmenu', e => hl.menuAt = { target: e.target, x: e.clientX, y: e.clientY }, true);
// The right-click was in a document pane's editor or preview: only there does the browser's menu get the Highlight
// and occurrences items (MainForm.cs asks this; not in the Search pane's fields, the find bar, the status bar, ...).
const contextInDocument = () => !!hl.menuAt && panes.some(p => p.editorEl.contains(hl.menuAt.target) || p.previewEl.contains(hl.menuAt.target));
function menuOffset(pane) {
  const m = hl.menuAt;
  if (!m || !pane.previewEl.contains(m.target) || pane.active?.mode === 'edit') return null;
  const c = document.caretPositionFromPoint?.(m.x, m.y);
  return c && pane.previewEl.contains(c.offsetNode) ? sourceOffsetAt(pane.active, c.offsetNode, c.offset) : null;
}

// Keep: an adjusted highlight confirmed as it is now.
function highlightKeep(pane) {
  const doc = pane.active?.doc;
  if (!doc) return;
  const hit = highlightsAt(doc, cursorOffset(pane) ?? -1).filter(h => h.state === 'adjusted');
  if (!hit.length) return toast('The cursor is not in an adjusted highlight.', true);
  for (const h of hit) { h.state = ''; h.was = null; }
  changedHighlights(doc);
}

// Attach to selection: a detached highlight (the highlights window) put on the selected text, with its note.
function highlightAttach(pane, id) {
  const doc = pane.active?.doc, h = doc && hlsOf(doc).list.find(x => x.id === id);
  const ranges = selectedRanges(pane);
  if (!h || !ranges?.length) return toast('Select the text to attach the highlight to.', true);
  const [a, b] = ranges[0];
  dropHighlight(doc, h);
  addHighlights(doc, [[a, b]]);
  const placed = highlightsAt(doc, a, b)[0];
  if (placed && h.note) placed.note = [placed.note, h.note].filter(Boolean).join('\n');
  changedHighlights(doc);
}

// ---------- Boxes ----------
// The note: a small box, more lines; Ctrl+Enter or OK keeps it, Esc leaves it as it was (null).
function noteBox(value, text) {
  const dialog = $('.mm-note-dialog'), area = dialog.querySelector('.mm-note-text');
  const shown = text.replace(/\s+/g, ' ');
  dialog.querySelector('.mm-note-label').textContent = 'Note on "' + (shown.length > 60 ? shown.slice(0, 57) + '...' : shown) + '"';
  area.value = value;
  dialog.returnValue = '';
  dialog.showModal();
  area.focus();
  area.select();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok' ? area.value : null), { once: true }));
}

// A question with OK and Cancel (the page's own: the viewer shows no confirm()).
function confirmBox(question) {
  const dialog = $('.mm-confirm-dialog');
  dialog.querySelector('.mm-confirm-text').textContent = question;
  dialog.returnValue = '';
  dialog.showModal();
  dialog.querySelector('[value=ok]').focus();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}

document.addEventListener('DOMContentLoaded', () => {
  const dialog = $('.mm-note-dialog');
  dialog.querySelector('.mm-note-text').addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); dialog.close('ok'); } });
  dialog.querySelector('.mm-note-cancel').addEventListener('click', () => dialog.close('cancel'));
  $('.mm-confirm-dialog .mm-confirm-cancel').addEventListener('click', () => $('.mm-confirm-dialog').close('cancel'));
});

// ---------- The highlights window (HighlightsForm.cs, web/highlightsview.js) and the docked ones ----------
// They list the highlights of a document: each editor pane's is told (with which pane is the active one) whenever they
// change or another document is shown there; the host passes them on (the window: the active pane's of the window last
// worked in; docked in the window: its active pane's; docked beside an editor pane: that pane's).
function tellHighlightsWindow() {
  clearTimeout(tellHighlightsWindow.timer);
  tellHighlightsWindow.timer = setTimeout(() => {
    for (const pane of panes) {
      const doc = pane.active?.doc, at = { pane: pane.index, active: pane.index === state.activePane };
      if (!doc) { host('highlightsShown', { ...at, none: true }).catch(() => {}); continue; }
      const text = docText(doc);
      const list = hlsOf(doc).list.map(h => {
        const r = hlRange(doc, h);
        return { id: h.id, line: r ? r.from[0] : null, text: h.text ?? '', note: h.note ?? '', state: h.state ?? '', was: h.was ?? null,
          from: r ? hlOffset(text, r.from) : null, to: r ? hlOffset(text, r.to) : null };
      }).sort((a, b) => (a.from ?? 1e15) - (b.from ?? 1e15));
      host('highlightsShown', { ...at, path: doc.path, draft: doc.draft, name: docName(doc), list }).catch(() => {});
    }
  }, 150);
}

// The window: go to a highlight (by its id in the document shown, or by path and offsets for another file); `pane`:
// from the highlights docked beside that editor pane (its document), else the active pane's.
events.highlightGo = async ({ path, id, from, to, line, text: wanted, pane: index }) => {
  let pane = panes[index ?? state.activePane], doc = pane.active?.doc;
  if (path && !(doc && samePath(doc.path, path))) {
    const tab = await openFile(path, { pane }).catch(e => { toast(e.message); return null; });
    if (!tab) return;
    pane = paneOf(tab);
    doc = tab.doc;
  }
  if (!doc) return;
  await loadHighlights(doc);
  let h = id != null && !path ? hlsOf(doc).list.find(x => x.id === id) : null;
  if (!h && from != null) {
    const text = docText(doc);
    h = placedHls(doc).find(x => { const r = hlRange(doc, x); return r && hlOffset(text, r.from) === from && hlOffset(text, r.to) === to; });
  }
  if (!h && id != null) h = hlsOf(doc).list.find(x => x.id === id);
  // From the list of all files (the file not open then): by its text, the one nearest its line.
  if (!h && wanted != null) {
    const near = r => Math.abs((r?.from[0] ?? 0) - (line ?? 0));
    h = placedHls(doc).filter(x => x.text === wanted).sort((a, b) => near(hlRange(doc, a)) - near(hlRange(doc, b)))[0];
  }
  if (h && h.state !== 'detached') goToHighlight(pane, h);
};

// The window's right-click on a highlight of the document shown.
events.highlightAction = async ({ action, id, pane: index }) => {
  const pane = panes[index ?? state.activePane], doc = pane.active?.doc;
  const h = doc && hlsOf(doc).list.find(x => x.id === id);
  if (!h) return;
  if (action === 'remove') await removeHighlights(doc, [h]);
  else if (action === 'note') await highlightNote(pane, h);
  else if (action === 'keep') { h.state = ''; h.was = null; changedHighlights(doc); }
  else if (action === 'attach') highlightAttach(pane, id);
};

// The editor's and the preview's right-click (the host adds Highlight items to the browser's own menu): the action
// on the pane the click was in.
events.contextAction = ({ action }) => runAction(action, [], { from: 'menu' });
