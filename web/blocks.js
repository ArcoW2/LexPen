'use strict';
// Next and previous block, Alt+PgDn / Alt+PgUp (docs/plans/executed/PLAN-block-jump.md), in the editor and in the preview at
// its cursor (previewcursor.js). The blocks come from the text itself, so a preview without an editor has them too:
// - a line's depth is its indentation as the editor shows it (the language's tab stops); in markdown a heading is a
//   level of its own and the text under it one deeper, a fence's lines deeper than the fence;
// - a line followed by deeper lines opens a block: the line, the deeper lines, and a closing line at its own depth
//   right after them (only closing brackets, an end keyword, a closing tag; a fence's end) belong to it;
// - a closing line is never a target: it belongs to the block it closes.
// Alt+PgDn: the first line after the cursor's block that is not a closing line. Alt+PgUp: the header of the cursor's
// block (the line that opens it); on that header, the previous header at its depth in the same parent, else the
// parent's header. The cursor's block: the block a line opens, the block a closing line closes, else the block around
// the line.

const BLOCK_CLOSER = /^\s*(?:[\]})]+[\s;,)\]}]*|end\b.*|(?:fi|done|esac)\b.*|<\/[\w:.-]+>\s*)$/i;
const BLOCK_LEVEL = 100000;   // markdown: a heading level's depth step, above any indentation

// The lines' depths (null for an empty line) and which are closing lines.
function blockModel(doc) {
  const lines = docText(doc).split('\n'), stops = tabStops(doc), md = !doc.language || packOf(doc)?.fold === 'markdown';   // tabs.js, languages.js
  const depth = new Array(lines.length).fill(null), closer = new Array(lines.length).fill(false);
  let level = 0, fence = null;
  lines.forEach((raw, i) => {
    const text = raw.replace(/\r$/, '');
    if (!text.trim()) return;
    const col = textColumn(text, text.match(/^[ \t]*/)[0].length, stops), base = level * BLOCK_LEVEL;
    if (!md) {
      depth[i] = col;
      closer[i] = BLOCK_CLOSER.test(text);
      return;
    }
    if (fence) {
      const end = new RegExp(`^ {0,3}${fence.mark}{${fence.length},}\\s*$`).test(text);
      depth[i] = end ? base + fence.col : base + fence.col + 1 + col;
      closer[i] = end;
      if (end) fence = null;
      return;
    }
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(text), h = /^ {0,3}(#{1,6})(\s|$)/.exec(text);
    if (f) fence = { mark: f[1][0] === '`' ? '`' : '~', length: f[1].length, col };
    if (h && !f) {
      level = h[1].length;
      depth[i] = (level - 1) * BLOCK_LEVEL;
      return;
    }
    depth[i] = base + col;
  });
  return { depth, closer, count: lines.length };
}

// The next line with text from i on in direction dir (i itself not included); -1 when there is none.
function blockNextText(m, i, dir) {
  for (let k = i + dir; k >= 0 && k < m.count; k += dir) if (m.depth[k] !== null) return k;
  return -1;
}

const blockOpens = (m, i) => { const next = blockNextText(m, i, 1); return !m.closer[i] && next >= 0 && m.depth[next] > m.depth[i]; };

// The last line of the block line o opens: the deeper lines after it, and its closing line.
function blockLast(m, o) {
  let last = o;
  for (let k = blockNextText(m, o, 1); k >= 0; k = blockNextText(m, k, 1)) {
    if (m.depth[k] > m.depth[o]) { last = k; continue; }
    if (m.depth[k] === m.depth[o] && m.closer[k]) last = k;
    break;
  }
  return last;
}

// The nearest line above i, not a closing line, whose depth passes the test; -1 when there is none.
function blockAbove(m, i, test) {
  for (let k = blockNextText(m, i, -1); k >= 0; k = blockNextText(m, k, -1)) if (!m.closer[k] && test(m.depth[k])) return k;
  return -1;
}

// The first line of the cursor's block; -1 when that is the whole file.
function cursorBlock(m, line) {
  if (m.depth[line] === null) line = blockNextText(m, line, -1) >= 0 ? blockNextText(m, line, -1) : blockNextText(m, line, 1);
  if (line < 0) return -1;
  const d = m.depth[line];
  const o = m.closer[line] ? blockAbove(m, line, x => x <= d) : blockOpens(m, line) ? line : blockAbove(m, line, x => x < d);
  if (o < 0) return -1;
  const first = blockNextText(m, -1, 1), last = blockNextText(m, m.count, -1);
  return o <= first && blockLast(m, o) >= last ? -1 : o;
}

// The target line of a move from `line`: dir 1 the next block, -1 the previous one; -1 when there is none.
function blockTarget(doc, line, dir) {
  const m = blockModel(doc), o = cursorBlock(m, line);
  if (dir > 0) {
    // The whole file: the next block below the cursor.
    if (o < 0) { for (let k = blockNextText(m, line, 1); k >= 0; k = blockNextText(m, k, 1)) if (blockOpens(m, k)) return k; return -1; }
    for (let k = blockNextText(m, blockLast(m, o), 1); k >= 0; k = blockNextText(m, k, 1)) if (!m.closer[k]) return k;
    return -1;
  }
  if (o < 0) { for (let k = blockNextText(m, line, -1); k >= 0; k = blockNextText(m, k, -1)) if (blockOpens(m, k)) return k; return -1; }
  // Inside the block (or on its closing line): its header.
  if (line > o) return o;
  // On the header: a header at its depth before it, else the line less deep above it, the parent's header.
  const d = m.depth[o];
  for (let k = blockNextText(m, o, -1); k >= 0; k = blockNextText(m, k, -1)) {
    if (m.closer[k]) continue;
    if (m.depth[k] < d || (m.depth[k] === d && blockOpens(m, k))) return k;
  }
  return -1;
}

// Where the cursor goes on the target line: the start of its text (in the preview: past markdown's marks).
function blockStart(doc, line, preview) {
  const text = docText(doc).split('\n')[line] ?? '';
  const lead = preview && (!doc.language || packOf(doc)?.fold === 'markdown')
    ? /^\s*(>\s*)*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)?/ : /^\s*/;
  return { line, ch: text.match(lead)[0].length };
}

// The action: in the editor (with Shift: selected to it), or the preview's cursor.
function goBlock(pane, dir, extend, preview) {
  const tab = pane.active, doc = tab.doc;
  const from = preview ? ensurePreviewCursor(pane) : pane.cm.getCursor('head');
  if (!from) return;
  const line = blockTarget(doc, from.line, dir);
  if (line < 0) return toast(dir > 0 ? 'No next block.' : 'No previous block.', true);
  const to = blockStart(doc, line, preview);
  if (preview) return previewCursorTo(pane, to);
  const cm = pane.cm, pos = CodeMirror.Pos(to.line, to.ch);
  asFound(pane, () => extend ? cm.setSelection(cm.getCursor('anchor'), pos) : cm.setCursor(pos));   // places.js
  revealFound(cm, pos);
  cm.focus();
}
