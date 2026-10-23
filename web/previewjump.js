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
