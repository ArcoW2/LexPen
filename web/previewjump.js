'use strict';
// From the preview to the editor (docs/plans/30-PLAN-preview-to-editor.md): a double click in the preview puts the
// editor's cursor on the same place in the source text, the word double-clicked selected, and gives the editor the
// focus. sourceRangeOf maps a place in the preview to the source (also for the highlights of plan 28):
// - code shown coloured (pre.mm-code): its text is the source text, the offset is the place;
// - markdown: the block's first source line (data-line); a fence (and front matter, and lines you gave a language)
//   counted as lines of code; other text by the word's occurrence in its block, with link addresses and tags left
//   out; what markdown made up itself (a list number, a picture, a diagram): the block's first line.
// Loaded after app.js.

// The rendered text from the start of `el` up to the place (node, offset).
function textBefore(el, node, offset) {
  const r = document.createRange();
  r.setStart(el, 0);
  r.setEnd(node, offset);
  return r.toString();
}

// The source range { from, to } (CodeMirror positions, `to` equal to `from` when nothing is selected) of the place
// (node, offset) in the preview of `doc`, with the word there (`word`, may be empty); null when it is not in it.
function sourceRangeOf(doc, article, node, offset, word) {
  const text = docText(doc), lines = text.split('\n');
  const pos = (line, ch) => ({ line: Math.max(0, Math.min(line, lines.length - 1)), ch: Math.max(0, ch) });
  const range = (line, ch, length) => {
    const from = pos(line, ch);
    return { from, to: { line: from.line, ch: Math.min(from.ch + length, lines[from.line].length) } };
  };
  // Code shown coloured: the same text, an element per line (data-line).
  const code = (node.nodeType === 1 ? node : node.parentElement)?.closest('pre.mm-code');
  if (code && article.contains(code)) {
    const row = (node.nodeType === 1 ? node : node.parentElement).closest('[data-line]');
    if (!row || !code.contains(row)) return range(0, 0, 0);
    return range(+row.dataset.line, textBefore(row, node, offset).length, word.length);
  }
  const el = node.nodeType === 1 ? node : node.parentElement;
  const block = el?.closest('[data-line]');
  if (!block || !article.contains(block)) return null;
  const start = +block.dataset.line;
  // A fence: the code's lines follow the fence's first line (``` or ~~~, or --- of front matter); lines you gave a
  // language have none.
  const pre = el.closest('pre');
  if (pre && block.contains(pre)) {
    const inner = pre.querySelector('code') ?? pre, before = textBefore(inner, node, offset);
    const opener = /^\s*(`{3,}|~{3,}|---\s*$)/.test(lines[start] ?? '') ? 1 : 0;
    const line = start + opener + before.split('\n').length - 1;
    return range(line, before.length - before.lastIndexOf('\n') - 1, word.length);
  }
  if (!word) return range(start, 0, 0);
  // Other text: the n-th time the word is in the block's rendered text before the place is the n-th time in its
  // source lines, link addresses, tags and reference definitions blanked out (same length, so columns stay).
  const end = blockEnd(article, start, lines.length);
  const source = lines.slice(start, end).join('\n')
    .replace(/\]\([^)]*\)/g, m => ']' + ' '.repeat(m.length - 1))
    .replace(/<[^>\n]+>/g, m => ' '.repeat(m.length))
    .replace(/^\s*\[[^\]]+\]:.*$/gm, m => ' '.repeat(m.length));
  const n = occurrences(textBefore(block, node, offset), word);
  let at = -1;
  for (let i = 0, from = 0; i <= n; i++) {
    at = source.indexOf(word, from);
    if (at < 0) break;
    from = at + word.length;
  }
  if (at < 0) return range(start, 0, 0);   // made up by markdown (a list number, a table border): the block's line
  const before = source.slice(0, at), line = start + before.split('\n').length - 1;
  return range(line, before.length - before.lastIndexOf('\n') - 1, word.length);
}

// The line after a block: the next block's first line further down (any element with a source line), else the end.
function blockEnd(article, start, count) {
  let end = count;
  for (const el of article.querySelectorAll('[data-line]')) {
    const line = +el.dataset.line;
    if (line > start && line < end) end = line;
  }
  return end;
}

const occurrences = (text, word) => { let n = 0; for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + word.length)) n++; return n; };

// The word under the point (x, y): { node, offset (its start), word }, the word empty when the point is not on one
// (beside a list number, on a picture). Found from the text itself, not from what the browser selected (a link's
// click, or a click beside a word, selects otherwise or nothing).
function wordAt(x, y, fallback) {
  const caret = document.caretPositionFromPoint?.(x, y), old = !caret && document.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? old?.startContainer ?? fallback, offset = caret?.offset ?? old?.startOffset ?? 0;
  if (node.nodeType !== Node.TEXT_NODE) return { node, offset, word: '' };
  const text = node.data, isWord = ch => /[\p{L}\p{N}_]/u.test(ch ?? '');
  let a = offset, b = offset;
  if (!isWord(text[a]) && isWord(text[a - 1])) a = b = offset - 1;
  while (a > 0 && isWord(text[a - 1])) a--;
  while (b < text.length && isWord(text[b])) b++;
  if (b <= a) return { node, offset, word: '' };
  const r = document.createRange();
  r.setStart(node, a);
  r.setEnd(node, b);
  const on = [...r.getClientRects()].some(q => x >= q.left - 1 && x <= q.right + 1 && y >= q.top - 1 && y <= q.bottom + 1);
  return on ? { node, offset: a, word: text.slice(a, b) } : { node, offset, word: '' };
}

// The double click, to the editor.
async function previewToEditor(pane, e) {
  const tab = pane.active;
  if (!tab || e.button !== 0) return;
  const { node, offset, word } = wordAt(e.clientX, e.clientY, e.target);
  const found = sourceRangeOf(tab.doc, tab.article, node, offset, word);
  if (!found) return;
  // The editor that takes it: this pane's (split view, or preview only: it becomes split view), or the other pane's
  // when that shows this document in the editor.
  let target = pane;
  if (tab.mode === 'preview') {
    const other = panes.find(p => p !== pane && p.active?.doc === tab.doc && p.active.mode !== 'preview' && !p.el.hidden);
    if (other) target = other;
    else {
      state.activePane = pane.index;
      await setMode('split');
    }
  }
  const cm = target.cm;
  if (!cm) return;
  state.activePane = target.index;
  asFound(target, () => cm.setSelection(found.from, found.to));   // places.js: a place to go back to
  revealFound(cm, found.from, found.to);
  cm.focus();
  updateStatus();
}

// ---------- The editor's cursor line in the preview ----------
// A bar at the preview's left edge beside the block that holds the editor's cursor line, in the colour the ruler and
// the gutter show the cursor in (--select), and over it, more pronounced (--accent), what the cursor line itself became
// (a preview with a theme of its own: its own colours):
// - a line of code (a code file, a line inside a fence): that line;
// - a line of a paragraph, list item, quote: the rendered lines its text ended up on (its text looked up in the block,
//   markup left out); when that cannot be found, the whole block.
// The editor: this pane's in split view, else the other pane's when it shows the same document in the editor; none
// without one. Drawn in a layer after the preview's content (as find's boxes), so it scrolls along. After a cursor
// move or an editor scroll, with the cursor in the editor's view, the bar is kept touching the preview's view (wholly
// in it when it fits).
function markPreviewCursor(pane, reveal) {
  const tab = pane.active, el = pane.previewEl;
  // Another width reflows the text: the lines move.
  if (!pane.previewCursorWatch) (pane.previewCursorWatch = new ResizeObserver(() => markPreviewCursors())).observe(el);
  let line = null, editor = null;
  if (tab && tab.mode !== 'edit' && !pane.el.hidden) {
    editor = tab.mode === 'split' ? pane
      : panes.find(p => p !== pane && p.active?.doc === tab.doc && p.active.mode !== 'preview' && !p.el.hidden);
    if (editor?.cm) line = editor.cm.getCursor().line;
  }
  const spot = line == null ? null : previewSpotOf(tab, line);
  if (!spot) { pane.previewCursor?.remove(); pane.previewCursor = null; return; }
  let layer = pane.previewCursor;
  if (!layer || layer.parentElement !== el) {
    layer?.remove();
    layer = pane.previewCursor = document.createElement('div');
    layer.className = 'mm-pcursor-layer';
    layer.append(Object.assign(document.createElement('div'), { className: 'mm-pcursor' }),
      Object.assign(document.createElement('div'), { className: 'mm-pcursor-line' }));
  }
  if (el.lastElementChild !== layer) el.append(layer);   // after the content (and after find's boxes)
  const origin = layer.getBoundingClientRect(), [block, own] = layer.children;
  const place = (bar, r) => Object.assign(bar.style, { top: r.top - origin.top + 'px', height: Math.max(r.bottom - r.top, 2) + 'px' });
  place(block, spot.block);
  place(own, spot.line);
  if (reveal && cursorInView(editor.cm)) alignWithCursor(pane, editor.cm, spot.line);
  if (typeof schedulePreviewOverview === 'function') schedulePreviewOverview(pane);   // its mark on the preview's scroll bar
}

// Is the editor's cursor on screen in the editor.
function cursorInView(cm) {
  const info = cm.getScrollInfo(), at = cm.charCoords(cm.getCursor(), 'local');
  return at.bottom > info.top && at.top < info.top + info.clientHeight;
}

// The preview scrolled so the cursor's line (spot: window coordinates) is at the same height in its view as the cursor
// is in the editor's (as a share of each view's height, so a lower or higher pane lines up too). The preview's text
// has another height than its source, so following the editor in proportion alone drifts away from the cursor.
function alignWithCursor(pane, cm, spot) {
  const el = pane.previewEl, view = el.getBoundingClientRect(), info = cm.getScrollInfo();
  const at = cm.charCoords(cm.getCursor(), 'local');
  const share = Math.min(1, Math.max(0, (at.top - info.top) / Math.max(1, info.clientHeight)));
  const height = Math.min(spot.bottom - spot.top, view.height);
  const by = spot.top - (view.top + share * (view.height - height));
  if (Math.abs(by) < 1) return;
  const before = el.scrollTop;
  pane.ignoreScroll = true;   // not an echo to the editor or the other pane (onPreviewScroll)
  el.scrollTop += by;
  if (el.scrollTop === before) pane.ignoreScroll = false;   // it could not move: no scroll event comes
}

// Where source line `line` is in the preview: { block, line }, each { top, bottom } in window coordinates (the line
// the whole block when it cannot be told apart), or null.
function previewSpotOf(tab, line) {
  const block = previewBlockAt(tab, line);
  if (!block) return null;
  const whole = block.getBoundingClientRect();
  const own = lineSpot(tab, line, block, whole);
  return { block: { top: whole.top, bottom: whole.bottom }, line: own ?? { top: whole.top, bottom: whole.bottom } };
}

// The source line's own place inside its block, or null (then the block).
function lineSpot(tab, line, block, whole) {
  const rect = r => r && r.height ? { top: r.top, bottom: r.bottom } : null;
  const start = +(block.dataset.line ?? block.querySelector('[data-line]')?.dataset.line ?? line);
  const lines = docText(tab.doc).split('\n');
  // A fence: its code's line; its opener: the box's top edge, its closer (and a line after it): the bottom edge, so a box
  // taller than the view is not shown from its top for a line at its end.
  if (block.tagName === 'PRE' && !block.classList.contains('mm-code')) {
    const code = block.querySelector('code') ?? block, opener = /^\s*(`{3,}|~{3,}|---\s*$)/.test(lines[start] ?? '') ? 1 : 0;
    const n = line - start - opener, text = code.textContent, rows = text.split('\n');
    const edge = Math.min(whole.bottom - whole.top, parseFloat(getComputedStyle(code).lineHeight) || 16);
    if (n < 0) return { top: whole.top, bottom: whole.top + edge };
    if (n >= rows.length || (opener && n === rows.length - 1 && rows[n] === '')) return { top: whole.bottom - edge, bottom: whole.bottom };
    const from = rows.slice(0, n).join('\n').length + (n ? 1 : 0);
    return rect(textRange(code, from, from + Math.max(rows[n].length, 1))?.getBoundingClientRect()) ?? rect(whole);
  }
  // One source line, or a block of one line: the block.
  if (+block.dataset.line === line && blockLines(tab, block, start, lines.length) <= 1) return rect(whole);
  // A line inside a block: its text, markup left out, in the block's text (the n-th time when it is there more often).
  const plain = plainLine(lines[line] ?? '');
  if (plain.length < 2) return rect(whole);
  const pattern = new RegExp(plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'g');
  const before = lines.slice(start, line).map(plainLine).join(' '), n = (before.match(pattern) ?? []).length;
  const text = block.textContent;
  let m;
  for (let i = 0; (m = pattern.exec(text)) && i < n; i++) ;
  if (!m) return rect(whole);
  const rects = [...(textRange(block, m.index, m.index + m[0].length)?.getClientRects() ?? [])].filter(r => r.height);
  return rects.length ? { top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) } : rect(whole);
}

// How many source lines a block takes: up to the next element with a source line further down.
function blockLines(tab, block, start, count) {
  const list = previewLineBlocks(tab);
  const next = list.find(([l]) => l > start);
  return (next ? next[0] : count) - start;
}

// A source line's text as markdown shows it: list, heading and quote marks, emphasis, code ticks, link addresses and
// tags left out, spaces trimmed.
const plainLine = text => text
  .replace(/^\s*(>\s*)*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)?/, '')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/(\*\*|__|~~|`|\*)/g, '').replace(/\\(.)/g, '$1').trim();

// A DOM range over characters [from, to) of an element's text.
function textRange(el, from, to) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), range = document.createRange();
  let at = 0, started = false;
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const end = at + t.data.length;
    if (!started && from <= end) { range.setStart(t, Math.min(from - at, t.data.length)); started = true; }
    if (started && to <= end) { range.setEnd(t, Math.max(0, to - at)); return range; }
    at = end;
  }
  return started ? range : null;
}

// The blocks by source line, sorted (kept until the next render: tab.lineBlocks).
const previewLineBlocks = tab =>
  tab.lineBlocks ??= [...tab.article.querySelectorAll('[data-line]')].map(e => [+e.dataset.line, e]).sort((a, b) => a[0] - b[0]);

// The preview's block holding source line `line`: the element of that line (a code file has one per line, a markdown
// block starts there), else the last block starting before it (the innermost of those starting on the same line).
function previewBlockAt(tab, line) {
  const article = tab.article;
  // A fence's line is on its code: the block is the box around it.
  const box = el => el?.tagName === 'CODE' && el.parentElement?.tagName === 'PRE' ? el.parentElement : el;
  const exact = [...article.querySelectorAll(`[data-line="${line}"]`)].pop();
  if (exact) return box(exact);
  const list = previewLineBlocks(tab);
  let lo = 0, hi = list.length - 1, found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid][0] <= line) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found == null ? null : box(list[found][1]);
}

// All panes, once per frame: after a cursor move or an editor scroll (`reveal`: keep the bar in the preview's view),
// a render, a layout change.
function markPreviewCursors(reveal = false) {
  markPreviewCursors.reveal ||= reveal;
  if (markPreviewCursors.frame) return;
  markPreviewCursors.frame = requestAnimationFrame(() => {
    const keep = markPreviewCursors.reveal;
    markPreviewCursors.frame = 0;
    markPreviewCursors.reveal = false;
    for (const pane of panes) markPreviewCursor(pane, keep);
  });
}
