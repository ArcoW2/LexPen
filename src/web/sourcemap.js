'use strict';
// Characters of the preview against characters of the source text (docs/plans/executed/PLAN-highlights.md, 3.4): a place in
// the preview to a place in the source, and a source range to ranges in the preview, character exact where the
// preview shows the text as it is:
// - code shown coloured (pre.mm-code): a line per element, its text the source line;
// - a fence: its code's lines are the fence's lines;
// - markdown: per block (an element with a source line, data-line), its own text (not that of blocks inside it) lined
//   up with its source lines, markdown's marks skipped (* _ ` ~ # > [ ] ( ), a link's address, a tag, a list mark).
// The maps are built when asked and kept per element until the preview is drawn again (new elements).

const blockMaps = new WeakMap();   // element -> { nodes, text, src: Int32Array (rendered index -> source offset) }

// The text nodes of a block that are its own (not inside a block of its own further in).
function ownTextNodes(block) {
  const nodes = [], walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.parentElement.closest('[data-line]') === block) nodes.push(t);
  return nodes;
}

// Where each source line starts in the text.
function lineOffsets(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

// A markdown block's map: its own rendered text, character by character, to offsets in the document's source.
function markdownMap(tab, block, starts, source) {
  let map = blockMaps.get(block);
  if (map) return map;
  const nodes = ownTextNodes(block), text = nodes.map(n => n.data).join('');
  const line = +block.dataset.line, end = blockEndLine(tab, line, starts.length);
  const from = starts[line] ?? source.length, to = starts[end] ?? source.length;
  // The source, a link's address and tags blanked (same length), then the marks skipped as the text is lined up.
  const src = source.slice(from, to).replace(/\]\([^)]*\)/g, m => ']' + '\u0000'.repeat(m.length - 1)).replace(/<[^>\n]+>/g, m => '\u0000'.repeat(m.length));
  const marks = new Set(['*', '_', '`', '~', '#', '>', '[', ']', '(', ')', '!', '|', '\\', '\u0000']);
  const out = new Int32Array(text.length);
  let j = 0;
  // A list or quote mark at a line's start is not text.
  const skipLineStart = () => { const m = /^[ \t]*(>[ \t]?)*([-*+][ \t]+(\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)?/.exec(src.slice(j)); if (m && (j === 0 || src[j - 1] === '\n')) j += m[0].length; };
  skipLineStart();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    while (j < src.length && src[j] !== ch && (marks.has(src[j]) || (/\s/.test(src[j]) && !/\s/.test(ch)))) {
      j++;
      if (src[j - 1] === '\n') skipLineStart();
    }
    if (j < src.length && (src[j] === ch || (/\s/.test(ch) && /\s/.test(src[j])))) {
      out[i] = from + j++;
      if (src[j - 1] === '\n') skipLineStart();
    } else out[i] = from + Math.min(j, src.length);   // made up by markdown: where the source is at
  }
  map = { nodes, text, src: out, from, to };
  blockMaps.set(block, map);
  return map;
}

function blockEndLine(tab, line, count) {
  const list = previewLineBlocks(tab);   // previewjump.js
  const next = list.find(([l]) => l > line);
  return next ? next[0] : count;
}

// A DOM range over characters [a, b) of a list of text nodes.
function nodesRange(nodes, a, b) {
  const range = document.createRange();
  let at = 0, started = false;
  for (const t of nodes) {
    const end = at + t.data.length;
    if (!started && a <= end) { range.setStart(t, a - at); started = true; }
    if (started && b <= end) { range.setEnd(t, b - at); return range; }
    at = end;
  }
  return started ? range : null;
}

// Where in the source (an offset) a place (node, offset) in the preview of `tab` is; null when not in it.
function sourceOffsetAt(tab, node, offset) {
  const article = tab.article, source = docText(tab.doc), starts = lineOffsets(source);
  const el = node.nodeType === 1 ? node : node.parentElement;
  if (!el || !article.contains(el)) return null;
  // Code shown coloured: its line element.
  const row = el.closest('pre.mm-code [data-line]');
  if (row) return Math.min(source.length, (starts[+row.dataset.line] ?? source.length) + textBefore(row, node, offset).length);
  const block = el.closest('[data-line]');
  if (!block) return null;
  const line = +block.dataset.line;
  // A fence: its code's lines.
  const pre = el.closest('pre');
  if (pre && block.contains(pre) || block.tagName === 'CODE' && block.parentElement?.tagName === 'PRE') {
    const code = pre?.querySelector('code') ?? block, before = textBefore(code, node, offset);
    const opener = /^\s*(`{3,}|~{3,}|---\s*$)/.test(source.slice(starts[line], starts[line + 1] ?? undefined)) ? 1 : 0;
    const l = line + opener + before.split('\n').length - 1;
    return Math.min(source.length, (starts[l] ?? source.length) + before.length - before.lastIndexOf('\n') - 1);
  }
  const map = markdownMap(tab, block, starts, source);
  // The rendered index of the place among the block's own text.
  let index = 0;
  const own = node.nodeType === 3 && map.nodes.includes(node);
  for (const t of map.nodes) { if (t === node) { index += offset; break; } if (own || textBefore(block, t, 0).length < textBefore(block, node, offset).length) index += t.data.length; else break; }
  if (!map.text.length) return map.from;
  return index >= map.text.length ? map.src[map.text.length - 1] + 1 : map.src[index];
}

// The preview's ranges (DOM Range objects) that show source offsets [from, to) of `tab`.
function previewRangesOf(tab, from, to) {
  const source = docText(tab.doc), starts = lineOffsets(source), ranges = [];
  const lineOf = o => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= o) lo = m; else hi = m - 1; } return lo; };
  const first = lineOf(from), last = lineOf(Math.max(from, to - 1));
  const article = tab.article;
  // Code shown coloured: a range per line.
  if (article.querySelector('pre.mm-code')) {
    for (let l = first; l <= last; l++) {
      const row = article.querySelector(`pre.mm-code [data-line="${l}"]`);
      if (!row) continue;
      const a = Math.max(from, starts[l]) - starts[l], b = Math.min(to, starts[l + 1] ?? source.length) - starts[l];
      const r = textRange(row, a, Math.min(b, row.textContent.length));
      if (r && b > a) ranges.push(r);
    }
    return ranges;
  }
  const seen = new Set();
  for (let l = first; l <= last; l++) {
    let block = previewBlockAt(tab, l);   // previewjump.js (a fence: its pre)
    if (!block || seen.has(block)) continue;
    seen.add(block);
    if (block.tagName === 'PRE') {
      const code = block.querySelector('code') ?? block, start = +(code.dataset.line ?? block.dataset.line);
      const opener = /^\s*(`{3,}|~{3,}|---\s*$)/.test(source.slice(starts[start], starts[start + 1] ?? undefined)) ? 1 : 0;
      const codeFrom = starts[start + opener] ?? source.length;
      const a = Math.max(0, from - codeFrom), b = Math.min(code.textContent.length, to - codeFrom);
      const r = b > a ? textRange(code, a, b) : null;
      if (r) ranges.push(r);
      continue;
    }
    const map = markdownMap(tab, block, starts, source);
    let a = -1, b = -1;
    for (let i = 0; i < map.text.length; i++) if (map.src[i] >= from && map.src[i] < to) { if (a < 0) a = i; b = i + 1; }
    if (a >= 0) { const r = nodesRange(map.nodes, a, b); if (r) ranges.push(r); }
  }
  return ranges;
}
