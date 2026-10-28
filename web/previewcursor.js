'use strict';
// The preview's cursor (docs/plans/executed/PLAN-preview-bookmarks.md): one per tab, beside the editor's and independent of
// it. A single click places it, the movement keys move it (the view follows), and the bookmark actions work at it
// while the preview has the focus. Drawn as a thin caret at its character, in a layer after the preview's content
// (as the editor's cursor bar, previewjump.js), together with the bookmarks at the far left of the text. Where it
// starts: the first character at the top of the view when the preview opens. Loaded after sourcemap.js.
//
// tab.pc: { line, ch }, its place in the source; tab.pcMark: the same as a bookmark on the document's main Doc while
// there is one, so edits in an editor carry it along; tab.pcDom: { node, offset }, its place in the rendered text
// while that is drawn (a move keeps it, so a step over text markdown made up, a list number, goes on); tab.pcGoal:
// the x Up / Down keep.

const pcLineOf = (text, o) => { const starts = lineOffsets(text); let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= o) lo = m; else hi = m - 1; } return { line: lo, ch: o - starts[lo] }; };
const pcOffsetOf = (text, p) => { const starts = lineOffsets(text); return p.line >= starts.length ? text.length : Math.min(text.length, starts[p.line] + p.ch); };

// The cursor's source place, or null before it is placed.
function previewCursorPos(tab) {
  const doc = tab.doc;
  if (!tab.pcMark && tab.pc && doc.cmDoc) tab.pcMark = doc.cmDoc.setBookmark(CodeMirror.Pos(tab.pc.line, tab.pc.ch), { insertLeft: true });
  const at = tab.pcMark?.find();
  if (at) return { line: at.line, ch: at.ch };
  return tab.pc ?? null;
}

function setPcSource(tab, pos) {
  tab.pc = pos;
  tab.pcMark?.clear();
  tab.pcMark = null;
  previewCursorPos(tab);   // the mark again, when the main Doc is there
}

// The cursor placed by source (a bookmark gone to): the rendered place is found again from it.
function placePreviewCursor(tab, pos) {
  setPcSource(tab, pos);
  tab.pcDom = null;
  tab.pcGoal = null;
}

// The cursor placed in the rendered text (a click, a move): its source place from there; text markdown made up keeps
// the source place it had.
function placePreviewCursorDom(tab, node, offset, keepGoal) {
  const at = pcText(node, offset);
  if (!at || !tab.article.contains(at.node)) return false;
  tab.pcDom = at;
  if (!keepGoal) tab.pcGoal = null;
  const o = sourceOffsetAt(tab, at.node, at.offset);
  if (o != null) setPcSource(tab, pcLineOf(docText(tab.doc), o));
  return true;
}

// A place in an element (between its children) as a place in a text node: the first text at or after it, else the
// last before it.
function pcText(node, offset) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) return { node, offset };
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const child = node.childNodes[offset];
  if (child) {
    if (child.nodeType === Node.TEXT_NODE) return { node: child, offset: 0 };
    const inner = document.createTreeWalker(child, NodeFilter.SHOW_TEXT).nextNode();
    if (inner) return { node: inner, offset: 0 };
  }
  let last = null;
  for (let t = walker.nextNode(); t; t = walker.nextNode()) last = t;
  return last ? { node: last, offset: last.data.length } : null;
}

// Where it is in the rendered text now: its kept place while that is still drawn, else found from its source place.
function pcDomOf(tab) {
  const dom = tab.pcDom;
  if (dom && dom.node.isConnected && tab.article.contains(dom.node)) return dom;
  const pos = previewCursorPos(tab);
  if (!pos) return null;
  const text = docText(tab.doc), o = pcOffsetOf(text, pos);
  // The character at it, else the one before it (a line's end).
  const on = previewRangesOf(tab, o, o + 1)[0], before = !on && o > 0 ? previewRangesOf(tab, o - 1, o)[0] : null;
  let at = on ? { node: on.startContainer, offset: on.startOffset } : before ? { node: before.endContainer, offset: before.endOffset } : null;
  if (!at) { const block = previewBlockAt(tab, pos.line); at = block && pcText(block, 0); }   // made up by markdown: its block
  at = at && pcText(at.node, at.offset);
  return tab.pcDom = at && tab.article.contains(at.node) ? at : null;
}

// The caret's box (window coordinates) at a rendered place.
function pcRect(at) {
  const r = document.createRange();
  r.setStart(at.node, at.offset);
  r.collapse(true);
  let box = [...r.getClientRects()].find(q => q.height) ?? r.getBoundingClientRect();
  if (!box.height && at.offset < at.node.data.length) { r.setEnd(at.node, at.offset + 1); const q = r.getBoundingClientRect(); if (q.height) box = { left: q.left, top: q.top, bottom: q.bottom, height: q.height }; }
  if (!box.height) { const q = at.node.parentElement.getBoundingClientRect(); box = { left: q.left, top: q.top, bottom: q.bottom, height: q.height }; }
  return { left: box.left, top: box.top, bottom: box.top + box.height, height: box.height };
}

// The first character at the top of the view (where the cursor starts when the preview opens); null before the
// preview shows text.
function pcTopOfView(pane) {
  const tab = pane.active, view = pane.previewEl.getBoundingClientRect(), box = tab.article.getBoundingClientRect();
  if (!box.height) return null;
  const pad = parseFloat(getComputedStyle(tab.article).paddingLeft) * (box.width / Math.max(1, tab.article.offsetWidth));
  for (let y = Math.max(view.top, box.top) + 2; y < view.bottom; y += 6) {
    const found = pcCaretAt(tab, box.left + pad + 1, y);
    if (found && pcRect(found).bottom > view.top) return found;
  }
  return null;
}

// The text place under a point of the preview, or null.
function pcCaretAt(tab, x, y) {
  const caret = document.caretPositionFromPoint?.(x, y), old = !caret && document.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? old?.startContainer, offset = caret?.offset ?? old?.startOffset ?? 0;
  if (!node || !tab.article.contains(node)) return null;
  return pcText(node, offset);
}

// The cursor of a pane's preview, placed at the top of the view when it has none yet; null without a preview.
function ensurePreviewCursor(pane) {
  const tab = pane.active;
  if (!tab || tab.mode === 'edit') return null;
  if (!previewCursorPos(tab)) {
    const top = pcTopOfView(pane);
    if (top) placePreviewCursorDom(tab, top.node, top.offset);
    else setPcSource(tab, { line: 0, ch: 0 });
  }
  return previewCursorPos(tab);
}

// The preview opens (a tab switched from the editor alone to a mode with the preview): the cursor starts again.
function resetPreviewCursor(tab) {
  tab.pcMark?.clear();
  tab.pc = tab.pcMark = tab.pcDom = tab.pcGoal = null;
}

// ---------- Drawing: the caret and the bookmarks ----------
function drawPreviewCaret(pane) {
  const tab = pane.active, el = pane.previewEl;
  let layer = pane.pcLayer;
  if (!tab || tab.mode === 'edit' || pane.el.hidden || el.firstChild !== tab.article) { layer?.remove(); return; }
  if (!layer) {
    layer = pane.pcLayer = document.createElement('div');
    layer.className = 'mm-pcaret-layer';
  }
  if (layer.previousElementSibling !== tab.article) tab.article.after(layer);
  ensurePreviewCursor(pane);
  const origin = layer.getBoundingClientRect(), parts = [];
  const at = pcDomOf(tab);
  if (at) {
    const r = pcRect(at), caret = document.createElement('div');
    caret.className = 'mm-pcaret';
    Object.assign(caret.style, { left: r.left - origin.left + 'px', top: r.top - origin.top + 'px', height: Math.max(r.height, 2) + 'px' });
    parts.push(caret);
  }
  // The bookmarks: beside their line, the numbers together as in the gutter.
  const lines = new Map();
  for (const { n, line } of previewBookmarkList(tab.doc)) {
    if (!lines.has(line)) lines.set(line, []);
    lines.get(line).push(n);
  }
  for (const [line, ns] of lines) {
    const spot = previewSpotOf(tab, line);
    if (!spot) continue;
    const numbers = ns.filter(Boolean), mark = document.createElement('span');
    mark.className = numbers.length ? 'mm-bm mm-pbm' : 'mm-bm mm-bm-free mm-pbm';
    mark.textContent = numbers.join('');
    mark.title = numbers.length ? 'Bookmark ' + numbers.join(', ') : 'Bookmark';
    mark.style.top = spot.line.top - origin.top + 'px';
    parts.push(mark);
  }
  layer.replaceChildren(...parts);
}

// The bookmarks of a document for the preview: the editor's (bookmarks.js) once it has them, else the stored ones
// placed in the text, asked for once, so a preview alone does not need the editor library.
function previewBookmarkList(doc) {
  if (doc.marks && typeof bookmarkList === 'function') return bookmarkList(doc);
  if (doc.bmList) return doc.bmList;
  if (!doc.pvBmLoading && (doc.path || doc.draft)) doc.pvBmLoading = (async () => {
    const stored = await host('bookmarksGet', { path: doc.path, draft: doc.draft }).catch(() => []);
    const list = stored.length ? await host('bookmarksResolve', { list: stored, text: docText(doc) }).catch(() => []) : [];
    if (!doc.marks && !doc.bmList) doc.bmList = list;
    if (list.length) { markPreviewCursors(); schedulePreviewOverviews(); }
  })();
  return [];
}

// ---------- Moving ----------
// The caret kept in the view, a line from its edges (as the editor scrolls along with its cursor).
function pcReveal(pane, at) {
  const el = pane.previewEl, view = el.getBoundingClientRect(), r = pcRect(at), margin = Math.min(r.height, view.height / 4);
  if (r.top < view.top + margin) el.scrollTop -= view.top + margin - r.top;
  else if (r.bottom > view.bottom - margin) el.scrollTop += r.bottom - (view.bottom - margin);
}

// The browser's own caret movement through the rendered text (Selection.modify), from the cursor's place; the
// selection is taken off again (a collapsed one in the preview would read as its cursor elsewhere, highlights.js).
function pcModify(tab, at, direction, unit) {
  const sel = getSelection();
  sel.collapse(at.node, at.offset);
  sel.modify('move', direction, unit);
  const to = sel.focusNode && tab.article.contains(sel.focusNode) ? pcText(sel.focusNode, sel.focusOffset) : null;
  sel.removeAllRanges();
  return to;
}

// A text place near a point: up or down (dir) from it a few lines at most, past the space between blocks.
function pcCaretNear(tab, x, y, dir, lh) {
  for (let d = 0; d <= 3 * lh; d += 4) {
    const at = pcCaretAt(tab, x, y + dir * d);
    if (at) return at;
  }
  return null;
}

const pcEdge = (tab, end) => {
  const walker = document.createTreeWalker(tab.article, NodeFilter.SHOW_TEXT, { acceptNode: t => t.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
  let first = walker.nextNode(), last = first;
  if (!end) return first && { node: first, offset: 0 };
  for (let t = first; t; t = walker.nextNode()) last = t;
  return last && { node: last, offset: last.data.length };
};

function movePreviewCursor(pane, key, ctrl) {
  const tab = pane.active, el = pane.previewEl;
  ensurePreviewCursor(pane);
  const at = pcDomOf(tab);
  if (!at) return;
  const r = pcRect(at), lh = r.height || 16;
  let to = null, vertical = false;
  switch (key) {
    case 'ArrowLeft': to = pcModify(tab, at, 'backward', ctrl ? 'word' : 'character'); break;
    case 'ArrowRight': to = pcModify(tab, at, 'forward', ctrl ? 'word' : 'character'); break;
    case 'Home': to = ctrl ? pcEdge(tab, false) : pcModify(tab, at, 'backward', 'lineboundary'); break;
    case 'End': to = ctrl ? pcEdge(tab, true) : pcModify(tab, at, 'forward', 'lineboundary'); break;
    case 'ArrowUp': case 'ArrowDown': {
      vertical = true;
      const dir = key === 'ArrowDown' ? 1 : -1;
      tab.pcGoal ??= r.left;
      to = pcModify(tab, at, dir > 0 ? 'forward' : 'backward', 'line');
      if (to) {   // the column it started at
        pcReveal(pane, to);
        const q = pcRect(to), there = pcCaretAt(tab, tab.pcGoal, (q.top + q.bottom) / 2);
        if (there) to = there;
      }
      break;
    }
    case 'PageUp': case 'PageDown': {
      vertical = true;
      const dir = key === 'PageDown' ? 1 : -1, page = Math.max(lh, el.clientHeight - lh), before = el.scrollTop;
      tab.pcGoal ??= r.left;
      el.scrollTop += dir * page;
      const moved = el.scrollTop - before, view = el.getBoundingClientRect();
      const y = (r.top + r.bottom) / 2 - moved + dir * page;   // the caret's line after the scroll, a page on
      if (y > view.bottom - 2) to = pcEdge(tab, true);
      else if (y < view.top + 2) to = pcEdge(tab, false);
      else to = pcCaretNear(tab, tab.pcGoal, y, dir, lh) ?? pcCaretNear(tab, tab.pcGoal, y, -dir, lh);
      break;
    }
  }
  if (!to) return;
  const goal = tab.pcGoal;
  placePreviewCursorDom(tab, to.node, to.offset, vertical);
  if (vertical) tab.pcGoal = goal;
  pcReveal(pane, tab.pcDom);
  drawPreviewCaret(pane);
}

// A bookmark gone to: the cursor there, in view.
function previewCursorTo(pane, pos) {
  const tab = pane.active;
  placePreviewCursor(tab, pos);
  const at = pcDomOf(tab);
  if (at) {
    const r = document.createRange();
    r.setStart(at.node, at.offset);
    r.setEnd(at.node, Math.min(at.node.data.length, at.offset + 1));
    revealFoundInPreview(pane, r);
  }
  drawPreviewCaret(pane);
  pane.previewEl.focus({ preventScroll: true });
}

// The caret's place on screen, for a list opened at it.
function previewCursorCoords(pane) {
  const at = pcDomOf(pane.active);
  if (at) { const r = pcRect(at); return { left: r.left, top: r.bottom }; }
  const view = pane.previewEl.getBoundingClientRect();
  return { left: view.left + 40, top: view.top + 40 };
}

// ---------- Mouse and keys ----------
for (const pane of panes) {
  // A single click: the preview's cursor only (a drag: at the selection's end). A link is followed as well.
  pane.previewEl.addEventListener('click', e => {
    const tab = pane.active;
    if (!tab || tab.mode === 'edit' || e.button !== 0) return;
    const sel = getSelection();
    const placed = !sel.isCollapsed && pane.previewEl.contains(sel.focusNode)
      ? placePreviewCursorDom(tab, sel.focusNode, sel.focusOffset)
      : (() => { const at = pcCaretAt(tab, e.clientX, e.clientY); return at && placePreviewCursorDom(tab, at.node, at.offset); })();
    if (placed) drawPreviewCaret(pane);
  });
}

const PC_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
// Before the keys of keys.json (keys.js listens on the document): with the focus in a preview, these keys move its
// cursor. Shift is ignored for now; Ctrl+Up / Ctrl+Down and Ctrl+PgUp / Ctrl+PgDn keep their own meaning.
window.addEventListener('keydown', e => {
  if (!PC_KEYS.has(e.key) || e.altKey || e.metaKey || e.defaultPrevented || keys.pending || document.querySelector('dialog[open]')) return;
  if (e.ctrlKey && !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const pane = panes.find(p => p.active && p.active.mode !== 'edit' && !p.el.hidden && p.previewEl.contains(document.activeElement));
  if (!pane) return;
  e.preventDefault();
  e.stopPropagation();
  movePreviewCursor(pane, e.key, e.ctrlKey);
}, true);
