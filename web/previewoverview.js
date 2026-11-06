'use strict';
// The preview's scroll bar: the same strip as the editor's (overview.js), in place of the browser's scroll bar. A mark
// for each highlight, find match, bookmark, unsaved and git change at the height its text is shown at, the editor's
// cursor line, and a block for the part in view. Drag the block to scroll; a click on a mark brings it to the middle
// of the view; a click elsewhere scrolls there (and the drag goes on from there); the wheel over it scrolls. The same
// settings: overviewWidth and overview.<kind>. Positions come from the preview itself: a source line's block
// (previewjump.js previewBlockAt), a highlight's or a find match's ranges. A PDF scrolls in its frame: the sizes, the
// marks and the moves are pdfview.js's (pdfScroller, pdfOverviewMarks). Loaded after highlights.js.

const pvWidth = () => Math.min(40, Math.max(10, +setting('overviewWidth') || 20));
const pvKind = kind => setting('overview.' + kind) !== false;
// The lanes as the editor's (overview.js overviewLanes), the cursor's line across all of them.
function pvLanes(width) {
  const inner = width - 1, side = Math.max(2, Math.round(inner / 5)), find = Math.max(3, Math.round(inner / 3));
  return { changes: [1, side], git: [1 + side, side], bookmarks: [1 + 2 * side, width - 1 - 2 * side],
    highlights: [1 + 2 * side, width - 1 - 2 * side], find: [width - find, find], occurrences: [width - find, find], cursor: [1, width - 1],
    chapters: [1 + 2 * side, width - 1 - 2 * side] };
}
const PV_THUMB = 24;
const PV_NAMES = { find: 'Find match', occurrences: 'Occurrence', changes: 'Unsaved change', git: 'Git change', bookmarks: 'Bookmark', highlights: 'Highlight', cursor: 'The editor\'s cursor', chapters: 'Chapter' };

// Where the preview scrolls: itself, or a PDF's frame (pdfview.js).
function pvScroller(pane) {
  if (pane.active?.doc.pdf) return pdfScroller(pane.active);
  const el = pane.previewEl;
  return { top: el.scrollTop, total: el.scrollHeight, client: el.clientHeight, scrollTo: y => { el.scrollTop = y; } };
}

function setupPreviewOverview(pane) {
  if (pane.pvCanvas) return;
  const canvas = pane.pvCanvas = document.createElement('canvas'), view = pane.pvView = document.createElement('div');
  canvas.className = 'mm-overview mm-pv-overview';
  view.className = 'mm-overview-view mm-pv-overview-view';
  pane.previewEl.parentElement.append(canvas, view);   // in the pane's body, over the preview's right edge (placed below)
  canvas.addEventListener('mousedown', e => { e.preventDefault(); pvDown(pane, e); });
  canvas.addEventListener('mousemove', e => { const { mark } = pvHit(pane, e); canvas.title = mark ? PV_NAMES[mark.kind] + (mark.title ? ': ' + mark.title : '') : ''; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); const s = pvScroller(pane); s.scrollTo(s.top + e.deltaY); }, { passive: false });
  pane.previewEl.addEventListener('scroll', () => placePvView(pane), { passive: true });
  new ResizeObserver(() => schedulePreviewOverview(pane)).observe(pane.previewEl);
}

function schedulePreviewOverview(pane) {
  if (!pane || pane.pvFrame) return;
  pane.pvFrame = requestAnimationFrame(() => { pane.pvFrame = 0; drawPreviewOverview(pane); });
}

// Where a place of the preview's content goes on the strip, as the editor's: the block as high as the view is of the
// whole, at least PV_THUMB px; a place is drawn where the block's middle is when that place is in the middle of the
// view.
function pvGeometry(pane) {
  const s = pvScroller(pane), track = Math.max(1, pane.previewEl.clientHeight), total = Math.max(1, s.total), client = s.client;
  const range = Math.max(0, total - client);
  const thumb = range ? Math.min(track, Math.max(PV_THUMB, track * client / total)) : track;
  const yOf = h => range ? Math.min(1, Math.max(0, (h - client / 2) / range)) * (track - thumb) + thumb / 2 : h / total * track;
  const scrollOf = y => range ? Math.min(1, Math.max(0, (y - thumb / 2) / Math.max(1, track - thumb))) * range : 0;
  const blockTop = () => range ? Math.min(1, pvScroller(pane).top / range) * (track - thumb) : 0;
  return { height: track, yOf, scrollOf, thumb, range, blockTop };
}

// The marks: { kind, top, bottom (heights in the preview's content), line }.
function pvMarks(pane) {
  const tab = pane.active, el = pane.previewEl, out = [];
  if (!tab || tab.mode === 'edit') return out;
  if (tab.doc.pdf) return pdfOverviewMarks(tab);
  const doc = tab.doc, base = el.getBoundingClientRect().top - el.scrollTop;
  const span = rect => rect && rect.height ? { top: rect.top - base, bottom: rect.bottom - base } : null;
  // A code preview in blocks of lines (codeHtml, docs/plans/executed/PLAN-large-preview.md): a line's place as its share of
  // the code's height, from its line number; measuring anything per mark (the line, even its block) lays out the
  // blocks again after a tab switch, and with many marks brings back the freeze of a large file. Close enough for
  // a strip; lines that wrap make it less exact.
  const code = tab.article.querySelector('pre.mm-code');
  const codeRect = code?.getBoundingClientRect(), codeTop = codeRect ? codeRect.top - base : 0, codeHeight = codeRect?.height ?? 0;
  const lineCount = code ? +(code.lastElementChild?.lastElementChild?.dataset.line ?? 0) + 1 : 1;
  const lineSpan = lineEl => {
    const h = codeHeight / lineCount, top = codeTop + +lineEl.dataset.line * h;
    return h ? { top, bottom: top + h } : null;
  };
  const inBlock = el => el?.parentElement?.classList.contains('mm-chunk');
  const rangeSpan = range => {
    const node = range.startContainer, line = (node.nodeType === 1 ? node : node.parentElement)?.closest('[data-line]');
    return inBlock(line) ? lineSpan(line) : span(range.getBoundingClientRect());
  };
  const ofLine = line => {
    const b = typeof previewBlockAt === 'function' ? previewBlockAt(tab, line) : null;
    return b && (inBlock(b) ? lineSpan(b) : span(b.getBoundingClientRect()));
  };
  const add = (kind, s, line) => { if (s) out.push({ kind, ...s, line }); };
  const editor = tab.mode === 'split' ? pane : panes.find(p => p !== pane && p.active?.doc === doc && p.active.mode !== 'preview' && !p.el.hidden);
  if (pvKind('changes')) for (const h of editor?.changeHunks ?? []) add('changes', ofLine(h.bFrom), h.bFrom);
  if (pvKind('git')) for (const h of editor?.gitHunks ?? []) add('git', ofLine(h.bFrom), h.bFrom);
  if (pvKind('bookmarks') && typeof previewBookmarkList === 'function')   // previewcursor.js: also before an editor has them
    for (const { line } of previewBookmarkList(doc)) add('bookmarks', ofLine(line), line);
  if (pvKind('highlights') && doc.hls) {
    const text = docText(doc);
    for (const h of doc.hls.list) {
      const r = h.state !== 'detached' && hlRange(doc, h);
      if (!r) continue;
      const ranges = previewRangesOf(tab, hlOffset(text, r.from), hlOffset(text, r.to));
      if (ranges.length) add('highlights', rangeSpan(ranges[0]), r.from[0]);
    }
  }
  if (pvKind('occurrences')) {   // occurrences.js, below the find marks
    let n = 0;
    for (const r of pane.occPreview ?? []) { if (++n > 3000) break; add('occurrences', rangeSpan(r)); }
  }
  if (pvKind('find')) {   // the preview's find marks (find.js), at most a few thousand looked at
    let n = 0;
    for (const r of CSS.highlights.get('mm-find-' + pane.index) ?? []) { if (++n > 3000) break; add('find', rangeSpan(r)); }
  }
  if (editor?.cm) add('cursor', ofLine(editor.cm.getCursor().line), editor.cm.getCursor().line);
  return out;
}

function drawPreviewOverview(pane) {
  const tab = pane.active, show = !!tab && tab.mode !== 'edit' && (!tab.doc.pdf || !!tab.pdf?.layout) && !pane.el.hidden && pane.previewEl.offsetParent;   // a PDF: once its frame told its layout
  if (show) setupPreviewOverview(pane);
  if (!pane.pvCanvas) return;
  const canvas = pane.pvCanvas, view = pane.pvView;
  canvas.hidden = view.hidden = !show;
  if (!show) return;
  // Over the preview's right edge, as high as it is (the content keeps clear of it: app.css, --mm-overview-w).
  const el = pane.previewEl, width = pvWidth();
  document.body.style.setProperty('--mm-overview-w', width + 'px');
  for (const s of [canvas.style, view.style]) Object.assign(s, { left: el.offsetLeft + el.offsetWidth - width + 'px', top: el.offsetTop + 'px', right: 'auto' });
  const g = pane.pvGeometry = pvGeometry(pane), ratio = devicePixelRatio || 1, lanes = pvLanes(width);
  canvas.style.height = g.height + 'px';
  canvas.width = width * ratio;
  canvas.height = Math.round(g.height * ratio);
  const ctx = canvas.getContext('2d'), css = getComputedStyle(el), colour = name => css.getPropertyValue(name).trim();
  const colours = { changes: colour('--warning'), git: colour('--git-modified'), bookmarks: colour('--accent'),
    highlights: colour('--highlight-mark') || colour('--highlight'), find: colour('--find-current'), occurrences: colour('--occurrence-box'), cursor: colour('--accent'), chapters: colour('--accent') };
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, g.height);
  pane.pvDrawn = [];
  // The editor's cursor first (under the others), as a thin line across.
  const marks = pvMarks(pane).sort((a, b) => (a.kind === 'cursor' ? -1 : 0) - (b.kind === 'cursor' ? -1 : 0));
  for (const m of marks) {
    const a = g.yOf(m.top), b = g.yOf(m.bottom), [x, w] = lanes[m.kind];
    const h = m.kind === 'cursor' ? 2 : Math.max(4, b - a), y = Math.min(Math.max(0, (a + b) / 2 - h / 2), g.height - h);
    ctx.fillStyle = colours[m.kind];
    ctx.fillRect(x, y, w, h);
    pane.pvDrawn.push({ ...m, y: y, yEnd: y + h });
  }
  placePvView(pane);
}

function placePvView(pane) {
  const g = pane.pvGeometry, view = pane.pvView;
  if (!g || !view || view.hidden) return;
  view.style.height = g.thumb + 'px';
  view.style.transform = `translateY(${g.blockTop()}px)`;
}

function pvHit(pane, e) {
  const y = e.clientY - pane.pvCanvas.getBoundingClientRect().top;
  let best = null, gap = 4;
  for (const m of pane.pvDrawn ?? []) {
    if (m.kind === 'cursor') continue;
    const d = y < m.y ? m.y - y : y > m.yEnd ? y - m.yEnd : 0;
    if (d <= gap) { best = m; gap = d; }
  }
  return { mark: best, y };
}

// The mouse down on the strip: on a mark its place to the middle of the view; on the block a drag; elsewhere the view
// there, and the drag goes on from there.
function pvDown(pane, e) {
  const s = pvScroller(pane), g = pvGeometry(pane), { mark, y } = pvHit(pane, e), top = g.blockTop();
  const onBlock = g.range && y >= top && y <= top + g.thumb;
  if (!onBlock && mark) { s.scrollTo(Math.max(0, (mark.top + mark.bottom) / 2 - s.client / 2)); return; }
  if (!g.range) return;
  if (!onBlock) s.scrollTo(g.scrollOf(y));
  const startY = e.clientY, startTop = pvScroller(pane).top, perPx = g.range / Math.max(1, g.height - g.thumb);
  pane.pvView.classList.add('mm-dragging');
  const move = ev => { s.scrollTo(Math.min(g.range, Math.max(0, startTop + (ev.clientY - startY) * perPx))); };
  const up = () => {
    removeEventListener('mousemove', move);
    removeEventListener('mouseup', up);
    pane.pvView.classList.remove('mm-dragging');
  };
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
}

// Every pane: after a render, a layout change, a change of marks.
function schedulePreviewOverviews() { for (const pane of panes) schedulePreviewOverview(pane); }
