'use strict';
// Column mode and blocks (docs/plans/executed/PLAN-column-selection.md). A block is a rectangle: lines x visual columns (a tab
// counts to its tab stop, so the block lines up with what you see). CodeMirror cannot select past the end of a line,
// so the block is kept here, per editor (cm.state.mmBlock: anchor and head as { line, col }), and shown as one
// selection per line, cut off at the line's end.
// Column mode (Alt+C, COL in the bottom bar) makes a drag and Shift+arrows select a block; Alt+drag and
// Alt+Shift+arrows make one without it. Typing, Backspace and Delete work on every line of a block; a line shorter
// than the typing column is filled up with spaces first. Copy and cut mark a block on the clipboard; paste puts a
// marked text, or any text in column mode, in as a column. Loaded before app.js; CodeMirror is needed only once an
// editor exists.

const column = { on: false };

const blockOf = cm => cm.state.mmBlock ?? null;
const vcolAt = (cm, line, ch) => textColumn(cm.getLine(line), ch, stopsOf(cm));   // tabs.js: indent and tab stops
const chAtCol = (cm, line, col) => textCh(cm.getLine(line), col, stopsOf(cm));
const lineEndCol = (cm, line) => vcolAt(cm, line, cm.getLine(line).length);

function blockBox({ anchor, head }) {
  return { top: Math.min(anchor.line, head.line), bottom: Math.max(anchor.line, head.line),
    left: Math.min(anchor.col, head.col), right: Math.max(anchor.col, head.col) };
}

// "5 x 12" (lines x columns) for the bottom bar, or null without a block.
function blockSize(cm) {
  const b = blockOf(cm);
  if (!b) return null;
  const box = blockBox(b);
  return `${box.bottom - box.top + 1} x ${box.right - box.left}`;
}

// Selection changes and edits made here: the handlers below leave them alone (a counter: these nest).
function own(cm, run) {
  cm.state.mmOwn = (cm.state.mmOwn ?? 0) + 1;
  try { return cm.operation(run); } finally { cm.state.mmOwn--; }
}

// The block from anchor to head, shown as a selection per line; the head's line is the primary one.
function setBlock(cm, anchor, head) {
  cm.state.mmBlock = { anchor: { ...anchor }, head: { ...head } };
  const box = blockBox(cm.state.mmBlock), ranges = [];
  for (let line = box.top; line <= box.bottom; line++)
    ranges.push({ anchor: CodeMirror.Pos(line, chAtCol(cm, line, anchor.col)), head: CodeMirror.Pos(line, chAtCol(cm, line, head.col)) });
  own(cm, () => {
    cm.setSelections(ranges, head.line - box.top, { scroll: false });
    lineIntoView(cm, head.line);   // up or down only: sideways to the head is drawVirtual's (virtual.js)
  });
  rememberBlock(cm);
  // The head's cursor (virtual.js): also when the selections stay the same (the head past every line's end).
  drawVirtual(cm, true);
  updateStatus();
}

// Back to one cursor, at the block's head. False without a block.
function collapseBlock(cm) {
  const b = blockOf(cm);
  if (!b) return false;
  cm.state.mmBlock = null;
  if (virtualAllowed()) placeAt(cm, b.head.line, b.head.col);   // past the line's end when the head is (virtual.js)
  else cm.setCursor(CodeMirror.Pos(b.head.line, chAtCol(cm, b.head.line, b.head.col)));
  return true;
}

// One column further along a line: over a character inside the text (a tab is one step), one column past its end.
function stepCol(cm, line, col, dir) {
  const end = lineEndCol(cm, line);
  if (dir > 0) return col >= end ? col + 1 : vcolAt(cm, line, chAtCol(cm, line, col) + 1);
  if (col > end) return col - 1;
  return col === 0 ? 0 : vcolAt(cm, line, Math.max(0, chAtCol(cm, line, col) - 1));
}

// Shift+arrows in column mode, Alt+Shift+arrows: the head moves, the anchor stays (a block can grow in every
// direction and shrink back past its anchor). Without a block it starts at the selection (its anchor and head).
function extendBlock(cm, dir) {
  let b = blockOf(cm);
  if (!b) {
    const range = cm.listSelections()[cm.listSelections().length - 1], at = p => ({ line: p.line, col: vcolAt(cm, p.line, p.ch) });
    const past = virtualOf(cm);   // the cursor past the end of the line (virtual.js): the block starts there
    b = past ? { anchor: { ...past }, head: { ...past } } : { anchor: at(range.anchor), head: at(range.head) };
  }
  const head = { ...b.head }, page = Math.max(1, Math.floor(cm.getScrollInfo().clientHeight / cm.defaultTextHeight()) - 1);
  switch (dir) {
    case 'left': head.col = stepCol(cm, head.line, head.col, -1); break;
    case 'right': head.col = Math.min(stepCol(cm, head.line, head.col, 1), Math.max(head.col, maxCol(cm, head.line))); break;
    case 'up': head.line = Math.max(cm.firstLine(), head.line - 1); break;
    case 'down': head.line = Math.min(cm.lastLine(), head.line + 1); break;
    case 'pageUp': head.line = Math.max(cm.firstLine(), head.line - page); break;
    case 'pageDown': head.line = Math.min(cm.lastLine(), head.line + page); break;
    case 'home': {   // as Home (setting homeStop): the first non-blank column first, again: column 0
      const first = vcolAt(cm, head.line, cm.getLine(head.line).search(/\S|$/));
      head.col = setting('homeStop') || head.col === first ? 0 : first;
      break;
    }
    case 'wordLeft': case 'wordRight': {   // Ctrl+Shift+arrows: the next word end / start on the head's line only
      const step = dir === 'wordRight' ? 1 : -1, end = lineEndCol(cm, head.line);
      if (head.col > end) { if (step < 0) head.col = end; break; }   // past the end: back to it; further right: no word
      const to = cm.findPosH(CodeMirror.Pos(head.line, chAtCol(cm, head.line, head.col)), step, 'group');
      head.col = to.line === head.line ? vcolAt(cm, head.line, to.ch) : step > 0 ? end : 0;
      break;
    }
    case 'end': {   // the end of the head's line; when already there, of the block's longest line
      const end = lineEndCol(cm, head.line), box = blockBox({ anchor: b.anchor, head });
      let longest = end;
      for (let l = box.top; l <= box.bottom; l++) longest = Math.max(longest, lineEndCol(cm, l));
      head.col = head.col === end ? longest : end;
      break;
    }
  }
  setBlock(cm, b.anchor, head);
}

// Column mode on or off (the window, all its tabs); the selection changes along (below).
function setColumnMode(on) {
  if (on && !editorMonospaced())
    return toast('Column mode needs a monospaced editor font (Options > Settings > Editor view > Font and colours): with another font the columns do not line up.');
  column.on = on;
  if (!on && !setting('virtualSpace')) for (const pane of panes) if (pane.cm) clearVirtual(pane.cm);
  // The selection changes with the mode: a block becomes the selection from its anchor to its head (a column past a
  // line's end: that line's end), a selection becomes the block from its anchor to its head.
  for (const pane of panes) {
    const cm = pane.cm;
    if (!cm) continue;
    const b = blockOf(cm), pos = p => CodeMirror.Pos(p.line, chAtCol(cm, p.line, p.col));
    if (!on && b) {
      cm.state.mmBlock = null;
      cm.setSelection(pos(b.anchor), pos(b.head));
    } else if (on && !b && cm.somethingSelected()) {
      const r = cm.listSelections()[cm.getDoc().sel.primIndex], at = p => ({ line: p.line, col: vcolAt(cm, p.line, p.ch) });
      setBlock(cm, at(r.anchor), at(r.head));
    }
    drawVirtual(cm);
  }
  updateStatus();
}

// After a font change: a proportional editor font ends column mode.
function columnFontChanged() {
  if (!column.on || editorMonospaced()) return;
  setColumnMode(false);
  toast('Column mode is off: the editor font is not monospaced.');
}

// All characters equally wide in the editor's font (measured, so a fallback font counts as what it is).
function editorMonospaced() {
  const lines = panes.find(p => p.cm)?.cm.getWrapperElement().querySelector('.CodeMirror-lines');
  const style = getComputedStyle(lines ?? document.documentElement);
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${style.fontSize} ${lines ? style.fontFamily : getComputedStyle(document.documentElement).getPropertyValue('--editor-font')}`;
  return Math.abs(ctx.measureText('iiiiiiiiii').width - ctx.measureText('MMMMMMMMMM').width) < 0.5;
}

// ---------- Typing, Backspace and Delete on a block ----------
// CodeMirror types into every line's selection itself; here a short line is first filled up with spaces to the
// block's column, Backspace / Delete do nothing on a line with nothing to remove (they never join lines), and
// afterwards the block follows the cursors (width 0, at their column). Anything else (undo, Enter) ends the block.
function onBeforeChange(cm, change) {
  const b = blockOf(cm);
  if (!b || cm.state.mmOwn) return;
  const box = blockBox(b), line = change.from.line;
  if (!['+input', '+delete', 'paste', '*compose'].includes(change.origin) || line < box.top || line > box.bottom) {
    cm.state.mmBlock = null;
    return;
  }
  if (change.origin === '+delete') {
    const empty = box.right > box.left ? chAtCol(cm, line, box.left) === chAtCol(cm, line, box.right) : lineEndCol(cm, line) < box.left;
    if (change.to.line !== line || empty) return change.cancel();
  } else {
    if (change.text.length > 1 || change.to.line !== line) {   // Enter, a line break pasted: a stream again
      cm.state.mmBlock = null;
      return;
    }
    const end = lineEndCol(cm, line);
    if (end < box.left && change.from.ch === cm.getLine(line).length && change.to.ch === change.from.ch)
      change.update(change.from, change.to, [' '.repeat(box.left - end) + change.text[0]]);
  }
  (cm.state.mmEdited ??= []).push(line);
}

function onChanges(cm) {
  const edited = cm.state.mmEdited, b = blockOf(cm);
  cm.state.mmEdited = null;
  if (!edited || !b || cm.state.mmOwn) return;
  const range = cm.listSelections().find(r => r.head.line === edited[0]);
  const col = range ? vcolAt(cm, edited[0], range.head.ch) : blockBox(b).left;
  setBlock(cm, { line: b.anchor.line, col }, { line: b.head.line, col });
}

// Undo and redo give back the selections of a block (one per line), not the block: the blocks are remembered by
// their selections, so the block comes back with them (a key then moves from its head, not every line's cursor).
const rangesKey = ranges => ranges.map(r => `${r.anchor.line}:${r.anchor.ch}-${r.head.line}:${r.head.ch}`).join(',');
function rememberBlock(cm) {
  const known = cm.state.mmBlocks ??= new Map(), key = rangesKey(cm.listSelections());
  known.delete(key);
  known.set(key, { anchor: { ...cm.state.mmBlock.anchor }, head: { ...cm.state.mmBlock.head } });
  if (known.size > 200) known.delete(known.keys().next().value);   // the oldest
}

// A selection made elsewhere (a click, a key, find) ends the block; not the cursors moving with an edit of it.
// Selections that undo or redo give back: the block they belonged to, when there was one.
function onBeforeSelectionChange(cm, change) {
  if (cm.state.mmOwn || cm.state.mmEdited) return;
  const known = change?.ranges.length > 1 || /undo|redo/.test(change?.origin ?? '') ? cm.state.mmBlocks?.get(rangesKey(change.ranges)) : null;
  cm.state.mmBlock = known ? { anchor: { ...known.anchor }, head: { ...known.head } } : null;
}

// Tab / Shift+Tab: the block's lines indented or outdented; the block moves along.
function indentBlock(cm, dir) {
  const b = blockOf(cm), box = blockBox(b), lines = [];
  for (let l = box.top; l <= box.bottom; l++) lines.push(l);
  const before = vcolAt(cm, b.head.line, cm.getLine(b.head.line).match(/^[ 	]*/)[0].length);
  own(cm, () => indentLines(cm, dir, lines));
  const unit = vcolAt(cm, b.head.line, cm.getLine(b.head.line).match(/^[ 	]*/)[0].length) - before;
  const by = p => ({ line: p.line, col: Math.max(0, p.col + unit) });
  setBlock(cm, by(b.anchor), by(b.head));
}

// ---------- Copy, cut and paste ----------
// The block's text: each line's part, joined with the file's line end; a short line's part is filled up with
// spaces to the block's width, so the text is a rectangle wherever it is pasted.
function blockText(cm, eol) {
  const box = blockBox(blockOf(cm)), parts = [];
  for (let line = box.top; line <= box.bottom; line++) {
    const from = chAtCol(cm, line, box.left), to = chAtCol(cm, line, box.right);
    parts.push(cm.getLine(line).slice(from, to) + ' '.repeat(Math.max(0, box.right - box.left - (vcolAt(cm, line, to) - vcolAt(cm, line, from)))));
  }
  return parts.join(eol);
}

// The block's part removed from every line; the lines stay, the block is then width 0 at its left column.
function clearBlock(cm) {
  const b = blockOf(cm), box = blockBox(b);
  own(cm, () => {
    for (let line = box.top; line <= box.bottom; line++)
      cm.replaceRange('', CodeMirror.Pos(line, chAtCol(cm, line, box.left)), CodeMirror.Pos(line, chAtCol(cm, line, box.right)), '*mmcolumn');
  });
  setBlock(cm, { line: b.anchor.line, col: box.left }, { line: b.head.line, col: box.left });
}

// Where a piece goes in at visual column col of a line, and what goes in: a shorter line is filled up with spaces
// first. Pure, as columnInsert (the tests use both).
function columnPiece(text, col, piece, stops) {
  const end = textColumn(text, text.length, stops);
  if (end < col) return { ch: text.length, insert: ' '.repeat(col - end) + piece };
  return { ch: textCh(text, col, stops), insert: piece };
}

// The lines with the pieces put in as a column from line first on: past the end, lines are added; an empty piece
// leaves its line as it is.
function columnInsert(lines, pieces, first, col, stops) {
  const out = [...lines];
  pieces.forEach((piece, i) => {
    while (out.length <= first + i) out.push('');
    if (!piece) return;
    const text = out[first + i], { ch, insert } = columnPiece(text, col, piece, stops);
    out[first + i] = text.slice(0, ch) + insert + text.slice(ch);
  });
  return out;
}

// The pieces in as a column at line, col; one undo step (the caller's operation). The cursor: at the paste's start.
function pasteColumn(cm, pieces, line, col) {
  own(cm, () => {
    pieces.forEach((piece, i) => {
      const at = line + i;
      if (at > cm.lastLine()) cm.replaceRange('\n', CodeMirror.Pos(cm.lastLine()), undefined, '*mmcolumn');
      if (!piece) return;
      const { ch, insert } = columnPiece(cm.getLine(at), col, piece, stopsOf(cm));
      cm.replaceRange(insert, CodeMirror.Pos(at, ch), undefined, '*mmcolumn');
    });
    cm.state.mmBlock = null;
    cm.setCursor(CodeMirror.Pos(line, chAtCol(cm, line, col)));
  });
}

// Paste (3.5 of the plan): as a column in column mode, with a block, or when the text is a marked block; else as many
// selections as the text has lines each get their own line; else as one text.
function pasteText(cm, text, marked) {
  if (!text || cm.getOption('readOnly')) return;
  let pieces = text.split(/\r?\n/);
  if (pieces.length > 1 && pieces.at(-1) === '') pieces.pop();
  const b = blockOf(cm);
  if (column.on || marked || b) {
    cm.operation(() => {
      let line, col;
      if (b) {
        const box = blockBox(b);
        if (box.right > box.left) clearBlock(cm);
        [line, col] = [box.top, box.left];
        if (pieces.length === 1) pieces = Array(box.bottom - box.top + 1).fill(pieces[0]);   // one line: on every line
      } else {
        const from = cm.getCursor('from');
        [line, col] = [from.line, vcolAt(cm, from.line, from.ch)];
        if (cm.somethingSelected()) cm.replaceSelection('');
      }
      pasteColumn(cm, pieces, line, col);
    });
    return;
  }
  const ranges = cm.listSelections();
  if (ranges.length > 1 && ranges.length === pieces.length) cm.replaceSelections(pieces, null, 'paste');
  else cm.replaceSelection(text, null, 'paste');
}

// Ctrl+V with the Windows clipboard is the editor's own paste: taken over for a block, column mode, a marked text.
function onNativePaste(cm, e) {
  if (e.defaultPrevented) return;   // a picture (onEditorPaste, app.js)
  const text = e.clipboardData?.getData('text/plain');
  if (!text || !(column.on || blockOf(cm) || clips.windowsColumn)) return;
  e.preventDefault();
  pasteText(cm, text, clips.windowsColumn);
}

// ---------- The mouse ----------
// In column mode, or with Alt: a drag draws a block (past the end of short lines too); a click without a drag places
// the cursor. A double click keeps its own meaning (a word).
function mouseSpot(cm, e) {
  const line = Math.max(cm.firstLine(), Math.min(cm.lastLine(), cm.lineAtHeight(e.clientY, 'window')));
  const left = cm.charCoords(CodeMirror.Pos(line, 0), 'window').left;
  return { line, col: Math.max(0, Math.round((e.clientX - left) / cm.defaultCharWidth())) };
}

function onMouseDown(cm, e) {
  if (e.button !== 0 || e.detail > 1 || e.shiftKey || e.ctrlKey || !(column.on || e.altKey)) return;
  if (!e.target.closest('.CodeMirror-lines')) return;   // the gutter, a scroll bar
  if (e.altKey && !column.on && !editorMonospaced()) return;
  e.preventDefault();
  e.stopPropagation();
  cm.focus();
  const start = mouseSpot(cm, e);
  let moved = false;
  const move = ev => {
    const spot = mouseSpot(cm, ev);
    if (!moved && spot.line === start.line && spot.col === start.col) return;
    moved = true;
    setBlock(cm, start, spot);
  };
  const up = () => {
    removeEventListener('mousemove', move, true);
    removeEventListener('mouseup', up, true);
    if (moved) return;
    cm.state.mmBlock = null;
    if (column.on) placeAt(cm, start.line, start.col, false);   // past the end of the line where clicked (virtual.js)
    else cm.setCursor(CodeMirror.Pos(start.line, chAtCol(cm, start.line, start.col)));
  };
  addEventListener('mousemove', move, true);
  addEventListener('mouseup', up, true);
}

// ---------- Per editor ----------
function setupColumn(pane) {
  const cm = pane.cm;
  cm.on('beforeChange', onBeforeChange);
  cm.on('changes', onChanges);
  cm.on('beforeSelectionChange', onBeforeSelectionChange);
  cm.on('swapDoc', () => { cm.state.mmBlock = null; cm.state.mmBlocks = null; });
  cm.on('paste', onNativePaste);
  cm.getWrapperElement().addEventListener('mousedown', e => onMouseDown(cm, e), true);
  const extend = dir => c => column.on ? extendBlock(c, dir) : CodeMirror.Pass;
  const collapse = c => { collapseBlock(c); return CodeMirror.Pass; };
  cm.addKeyMap({
    'Shift-Left': extend('left'), 'Shift-Right': extend('right'), 'Shift-Up': extend('up'), 'Shift-Down': extend('down'),
    'Shift-Ctrl-Left': extend('wordLeft'), 'Shift-Ctrl-Right': extend('wordRight'),
    'Shift-Home': extend('home'), 'Shift-End': extend('end'), 'Shift-PageUp': extend('pageUp'), 'Shift-PageDown': extend('pageDown'),
    Left: collapse, Right: collapse, Up: collapse, Down: collapse, Home: collapse, End: collapse, PageUp: collapse, PageDown: collapse,
    Esc: c => collapseBlock(c) ? undefined : CodeMirror.Pass,
    Tab: c => blockOf(c) ? indentBlock(c, 1) : CodeMirror.Pass,
    'Shift-Tab': c => blockOf(c) ? indentBlock(c, -1) : CodeMirror.Pass,
  });
}
