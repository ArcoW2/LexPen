'use strict';
// Line commands (docs/plans/executed/PLAN-line-commands.md): duplicate, move up / down, delete and join the lines the
// cursors or selections touch (a selection ending at a line's start does not take that line; a block of column mode:
// its lines; a folded part moves as a whole). Each is one undo step. Moving with a key (Ctrl+L, Up / Down) starts move
// mode: Up / Down go on moving the lines (PgUp / PgDn: a page), Esc (or any other key, a click) stops it; a marker in the gutter of the
// lines being moved shows it. Loaded before app.js; the actions are in actions.js.

// The lines a fold hides with the line it starts on: [first, last]; [line, line] when none.
function foldSpan(cm, line) {
  let first = line, last = line;
  for (const m of cm.findMarks({ line: Math.max(0, line - 1), ch: 0 }, { line: Math.min(cm.lastLine(), line + 1), ch: 0 })) {
    const r = m.__isFold && m.find();
    if (r && r.from.line <= line && line <= r.to.line) { first = Math.min(first, r.from.line); last = Math.max(last, r.to.line); }
  }
  return [first, last];
}

// The blocks of lines to act on, top to bottom, [first, last] each, overlapping and adjacent ones joined.
function lineBlocks(cm) {
  const blocks = cm.listSelections().map(r => {
    const from = r.from(), to = r.to();
    const last = to.line > from.line && to.ch === 0 ? to.line - 1 : to.line;
    return [foldSpan(cm, from.line)[0], foldSpan(cm, last)[1]];
  }).sort((a, b) => a[0] - b[0]);
  const joined = [];
  for (const b of blocks) {
    const prev = joined[joined.length - 1];
    if (prev && b[0] <= prev[1] + 1) prev[1] = Math.max(prev[1], b[1]); else joined.push([...b]);
  }
  return joined;
}

const linesText = (cm, first, last) => cm.getRange({ line: first, ch: 0 }, { line: last, ch: cm.getLine(last).length });
const writable = cm => cm.getOption('readOnly') ? (toast('This tab is read-only.'), false) : true;

// The selections again, each line moved by the shift of the block it is in (shift(line) -> lines to add).
function shiftSelections(cm, shift) {
  const at = p => ({ line: p.line + shift(p.line), ch: p.ch });
  cm.setSelections(cm.listSelections().map(r => ({ anchor: at(r.anchor), head: at(r.head) })));
}
// The block a line belongs to; a selection end at the start of the line after a block counts with it.
const moveBlockOf = (blocks, line) => blocks.find(([f, l]) => line >= f && line <= l + 1);

// Moves the blocks a line (past a fold: the whole fold) up (dir -1) or down (1). Nothing when one is at the edge.
function moveLines(cm, dir) {
  if (!writable(cm)) return false;
  const blocks = lineBlocks(cm);
  if (!blocks.length || (dir < 0 ? blocks[0][0] === 0 : blocks[blocks.length - 1][1] === cm.lastLine())) return false;
  const shifts = new Map();
  cm.operation(() => {
    for (const block of dir < 0 ? blocks : [...blocks].reverse()) {
      const [f, l] = block;
      if (dir < 0) {
        const a = foldSpan(cm, f - 1)[0];
        cm.replaceRange(linesText(cm, f, l) + '\n' + linesText(cm, a, f - 1), { line: a, ch: 0 }, { line: l, ch: cm.getLine(l).length }, '*moveLines');
        shifts.set(block, a - f);
      } else {
        const b = foldSpan(cm, l + 1)[1];
        cm.replaceRange(linesText(cm, l + 1, b) + '\n' + linesText(cm, f, l), { line: f, ch: 0 }, { line: b, ch: cm.getLine(b).length }, '*moveLines');
        shifts.set(block, b - l);
      }
    }
  });
  return { blocks, shifts };
}

function moveLinesBy(cm, dir) {
  const sel = cm.listSelections().map(r => ({ anchor: r.anchor, head: r.head }));
  const moved = moveLines(cm, dir);
  if (!moved) return false;
  cm.setSelections(sel);
  shiftSelections(cm, line => moved.shifts.get(moveBlockOf(moved.blocks, line)) ?? 0);
  cm.scrollIntoView(cm.getCursor('head'));
  return true;
}

// The lines again below them; the cursors and selections on the copy.
function duplicateLines(cm) {
  if (!writable(cm)) return;
  const blocks = lineBlocks(cm), sel = cm.listSelections().map(r => ({ anchor: r.anchor, head: r.head }));
  cm.operation(() => {
    for (const [f, l] of [...blocks].reverse())
      cm.replaceRange('\n' + linesText(cm, f, l), { line: l, ch: cm.getLine(l).length }, null, '*duplicateLines');
    cm.setSelections(sel);
    // A block's copy lies below it and below the copies of the blocks above it.
    shiftSelections(cm, line => {
      let n = 0;
      for (const [f, l] of blocks) { if (f <= line) n += l - f + 1; else break; }
      return n;
    });
  });
}

// The lines removed (their line breaks too); each cursor on the line that came up in their place.
function deleteLines(cm) {
  if (!writable(cm)) return;
  const blocks = lineBlocks(cm), heads = cm.listSelections().map(r => r.head);
  const cols = new Map(blocks.map(b => [b, heads.find(h => h.line >= b[0] && h.line <= b[1])?.ch ?? 0]));
  cm.operation(() => {
    for (const [f, l] of [...blocks].reverse()) {
      if (l < cm.lastLine()) cm.replaceRange('', { line: f, ch: 0 }, { line: l + 1, ch: 0 }, '*deleteLines');
      else if (f > 0) cm.replaceRange('', { line: f - 1, ch: cm.getLine(f - 1).length }, { line: l, ch: cm.getLine(l).length }, '*deleteLines');
      else cm.replaceRange('', { line: 0, ch: 0 }, { line: l, ch: cm.getLine(l).length }, '*deleteLines');
    }
    let gone = 0;
    cm.setSelections(blocks.map(b => {
      const line = Math.min(b[0] - gone, cm.lastLine());
      gone += b[1] - b[0] + 1;
      return { anchor: { line, ch: Math.min(cols.get(b), cm.getLine(line).length) } };
    }));
  });
}

// Each block's lines onto its first (one line: the next line onto it): the indentation in between becomes one space
// (none next to an empty line); the cursor where the last two came together.
function joinLines(cm) {
  if (!writable(cm)) return;
  const blocks = lineBlocks(cm).map(([f, l]) => [f, Math.max(l, Math.min(f + 1, cm.lastLine()))]).filter(([f, l]) => l > f);
  if (!blocks.length) return;
  const ends = [];
  cm.operation(() => {
    for (const [f, l] of [...blocks].reverse()) {
      let text = cm.getLine(f), at = 0;
      for (let line = f + 1; line <= l; line++) {
        const left = text.replace(/\s+$/, ''), right = cm.getLine(line).replace(/^\s+/, '');
        at = left.length;
        text = left && right ? left + ' ' + right : left + right;
      }
      cm.replaceRange(text, { line: f, ch: 0 }, { line: l, ch: cm.getLine(l).length }, '*joinLines');
      ends.push({ f, at });
    }
    // Lines above a block got fewer: its first line moved up by what the blocks above it joined.
    let gone = 0;
    cm.setSelections(blocks.map(([f, l]) => {
      const { at } = ends.find(e => e.f === f), line = f - gone;
      gone += l - f;
      return { anchor: { line, ch: at } };
    }));
  });
}

// ---------- Move mode ----------
let lineMove = null;   // { pane, lines: the gutter's marked line handles }

function markMoveLines() {
  const cm = lineMove.pane.cm;
  for (const h of lineMove.lines) cm.removeLineClass(h, 'gutter', 'mm-line-move');
  lineMove.lines = lineBlocks(cm).flatMap(([f, l]) => Array.from({ length: l - f + 1 }, (_, n) => cm.addLineClass(f + n, 'gutter', 'mm-line-move')));
}

function startLineMove(pane) {
  if (lineMove?.pane === pane) return markMoveLines();
  stopLineMove();
  lineMove = { pane, lines: [] };
  markMoveLines();
  pane.cm.on('blur', stopLineMove);
  toast('Moving lines: Up / Down move them on, PgUp / PgDn a page, Esc stops.', true);
}

function stopLineMove() {
  if (!lineMove) return;
  const cm = lineMove.pane.cm;
  for (const h of lineMove.lines) cm.removeLineClass(h, 'gutter', 'mm-line-move');
  cm.off('blur', stopLineMove);
  lineMove = null;
}

// A page of lines up (dir -1) or down: as many as the editor shows, less one; up to the edge. One undo step.
function moveLinesPage(cm, dir) {
  const page = Math.max(1, Math.floor(cm.getScrollInfo().clientHeight / cm.defaultTextHeight()) - 1);
  let moved = false;
  cm.operation(() => { for (let n = 0; n < page && moveLinesBy(cm, dir); n++) moved = true; });
  return moved;
}

const MOVE_KEYS = { ArrowUp: [moveLinesBy, -1], ArrowDown: [moveLinesBy, 1], PageUp: [moveLinesPage, -1], PageDown: [moveLinesPage, 1] };

// Before every other key handler (the window's capture phase): Up / Down move a line, PgUp / PgDn a page, Esc stops,
// another key stops and does what it does.
addEventListener('keydown', e => {
  if (!lineMove || ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return;
  const plain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
  if (plain && MOVE_KEYS[e.key]) {
    e.preventDefault();
    e.stopPropagation();
    const [move, dir] = MOVE_KEYS[e.key];
    if (move(lineMove.pane.cm, dir)) markMoveLines();
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
  stopLineMove();
}, true);
addEventListener('mousedown', () => stopLineMove(), true);
