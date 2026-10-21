'use strict';
// The cursor past the end of the line (docs/plans/PLAN-virtual-space.md), setting virtualSpace, monospaced fonts only.
// CodeMirror has no place past a line's end, so the column is kept here (cm.state.mmVirtual = { line, col }, a visual
// column as column mode counts) while the real cursor waits at the line's end; LexPen draws the cursor there. Up and
// Down keep the cursor's horizontal place (also over wrapped rows); a click past the end puts it there. Typing or a
// paste there first fills the line with spaces (tabs with useTabs) up to the column; moving away adds nothing.
// Column mode has it too, whatever the setting: a block goes past line ends, so its cursor does.
// The head of a selection or a block gets a drawn cursor as well (CodeMirror draws none there), so Shift+arrows show
// where they are; a block's head can be past a line's end.
// Loaded after column.js, before app.js; CodeMirror is needed only once an editor exists.

const virtual = { mono: null };   // mono: the editor font is monospaced (measured again when the fonts change)

const virtualOf = cm => cm.state.mmVirtual ?? null;
const virtualFontChanged = () => { virtual.mono = null; };

// May the cursor go past the end: the setting or column mode, with a monospaced font.
function virtualAllowed() {
  if (!setting('virtualSpace') && !column.on) return false;
  virtual.mono ??= editorMonospaced();
  return virtual.mono;
}

// Is the cursor past the end here: allowed, one cursor, no selection, no block.
const virtualOn = cm => virtualAllowed() && !blockOf(cm) && !cm.somethingSelected() && cm.listSelections().length === 1;

// Selection changes made here: the beforeSelectionChange handler leaves the column and the goal alone.
function placing(cm, run) {
  cm.state.mmPlacing = (cm.state.mmPlacing ?? 0) + 1;
  try { return cm.operation(run); } finally { cm.state.mmPlacing--; }
}

// A line into view, up or down only: CodeMirror would also scroll sideways to its cursor, at the line's end, while
// LexPen scrolls to the drawn cursor (drawVirtual): the two would make the text and the gutter jump left and right.
function lineIntoView(cm, line) {
  const top = cm.heightAtLine(line, 'local'), left = cm.getScrollInfo().left;
  cm.scrollIntoView({ left: left + 1, right: left + 2, top, bottom: top + cm.defaultTextHeight() }, 20);
}

// The cursor at line, past its end at col (a visual column), or in the text when col is not past the end.
function placeAt(cm, line, col, reveal = true) {
  const end = lineEndCol(cm, line);
  placing(cm, () => {
    if (col > end) {
      cm.setCursor(CodeMirror.Pos(line, cm.getLine(line).length), null, { scroll: false });
      lineIntoView(cm, line);
    } else cm.setCursor(CodeMirror.Pos(line, chAtCol(cm, line, col)));
    cm.state.mmVirtual = col > end ? { line, col } : null;
  });
  drawVirtual(cm, true);
  updateStatus();
}

const clearVirtual = cm => {
  if (!cm.state.mmVirtual) return;
  cm.state.mmVirtual = null;
  drawVirtual(cm);
};

// ---------- Where it is on screen ----------
const charWidth = cm => cm.defaultCharWidth();

// The cursor's place in the editor ("div": the coordinates the cursors are drawn in): past the end for a virtual
// column, else the real cursor's.
function cursorBox(cm) {
  const v = virtualOf(cm), head = cm.getCursor();
  const at = cm.charCoords(v ? CodeMirror.Pos(v.line, cm.getLine(v.line).length) : head, 'div');
  const left = v ? at.left + (v.col - lineEndCol(cm, v.line)) * charWidth(cm) : at.left;
  return { left, top: at.top, bottom: at.bottom };
}

// The editor's visible text area, in window coordinates: right of the gutter, left of the scroll bar.
function visibleSpan(cm) {
  const wrapper = cm.getWrapperElement(), bar = wrapper.querySelector('.CodeMirror-vscrollbar');
  return { left: cm.getGutterElement().getBoundingClientRect().right,
    right: wrapper.getBoundingClientRect().right - (bar && bar.offsetWidth && getComputedStyle(bar).display !== 'none' ? bar.offsetWidth : 0) };
}

// Up to where a column can go on a line: without wrapping as far as you like (the editor scrolls along, drawVirtual);
// with wrapping the editor does not scroll sideways, so up to its visible right edge.
function maxCol(cm, line) {
  if (!cm.getOption('lineWrapping')) return Infinity;
  const end = cm.charCoords(CodeMirror.Pos(line, cm.getLine(line).length), 'window');
  return lineEndCol(cm, line) + Math.max(0, Math.floor((visibleSpan(cm).right - end.left) / charWidth(cm)) - 1);
}

// Where LexPen draws a cursor: past the end of the line, at a block's head (also past a line's end), at the head of a
// selection; null where CodeMirror's own cursor does (one cursor in the text).
function drawnBox(cm) {
  const b = blockOf(cm);
  if (b) {
    const end = lineEndCol(cm, b.head.line), at = cm.charCoords(CodeMirror.Pos(b.head.line, chAtCol(cm, b.head.line, b.head.col)), 'div');
    return { left: at.left + Math.max(0, b.head.col - end) * charWidth(cm), top: at.top, bottom: at.bottom };
  }
  if (virtualOf(cm)) return cursorBox(cm);
  if (!cm.somethingSelected()) return null;
  const head = cm.listSelections()[cm.getDoc().sel.primIndex]?.head ?? cm.getCursor('head');
  return cm.charCoords(head, 'div');
}

// The spacer at x (the "div" coordinates), but never left of what is in view now: a narrower editor would make the
// browser pull the scroll back (the text and the gutter jumping left and right while the cursor moves left). It
// shrinks as the view moves left.
function placeSpacer(cm, x, top) {
  let spacer = cm.state.mmSpacer;
  if (!spacer) {
    spacer = cm.state.mmSpacer = document.createElement('div');
    spacer.className = 'mm-vspacer';
    cm.display.lineSpace.append(spacer);
  }
  const scroller = cm.getScrollerElement();
  const inView = scroller.getBoundingClientRect().left + scroller.clientWidth - cm.display.lineSpace.getBoundingClientRect().left;
  // While scrolled sideways it only grows (each shrink would pull the view back); at the left again it may shrink.
  const kept = cm.getScrollInfo().left > 0 ? parseFloat(spacer.style.left) || 0 : 0;
  spacer.style.left = Math.max(x, inView - 1, kept) + 'px';
  if (top !== undefined) spacer.style.top = top + 'px';
  spacer.hidden = false;
}

// Sideways into view, with room: the editor scrolls when the cursor comes within scrollMargin columns of the left or
// right edge (at most a third of the view). Without wrapping only (with wrapping nothing scrolls sideways).
function revealX(cm, left, right) {
  if (cm.getOption('lineWrapping')) return;
  const span = visibleSpan(cm), cols = Number.isInteger(setting('scrollMargin')) ? setting('scrollMargin') : 8;
  const margin = Math.min(Math.max(1, cols) * charWidth(cm), (span.right - span.left) / 3), at = cm.getScrollInfo().left;
  if (right + margin > span.right) {
    // The room right of the cursor may lie past the longest line: the spacer gives the editor that width.
    const hidden = Math.max(0, cm.getScrollerElement().getBoundingClientRect().right - span.right);
    const before = cm.getScrollerElement().scrollWidth;
    placeSpacer(cm, right + margin + hidden - cm.display.lineSpace.getBoundingClientRect().left);
    // CodeMirror's scroll bar was sized for the narrower editor and would pull the view back: it measures again.
    if (cm.getScrollerElement().scrollWidth > before) cm.setSize();
    cm.scrollTo(at + right + margin - span.right, null);
  }
  else if (left - margin < span.left && at > 0) cm.scrollTo(Math.max(0, at - (span.left - left + margin)), null);
}

// reveal: the editor scrolls sideways to show the cursor (after a move; not when you scroll yourself). Past the
// longest line the editor has no width to scroll into: a spacer just right of the cursor gives it that.
// A block is a rectangle: past a shorter line's end its part is drawn too, as selected (CodeMirror selects only up to
// a line's end). Only the lines on screen.
function drawBlockFill(cm) {
  let layer = cm.state.mmFill;
  const b = blockOf(cm);
  if (!b) { if (layer) layer.replaceChildren(); return; }
  if (!layer) {
    layer = cm.state.mmFill = document.createElement('div');
    layer.className = 'mm-vfill';
    cm.display.lineSpace.insertBefore(layer, cm.display.cursorDiv);   // under the text, as CodeMirror's selection
  }
  const box = blockBox(b), view = cm.getViewport(), cw = charWidth(cm), parts = [];
  for (let line = Math.max(box.top, view.from); line <= Math.min(box.bottom, view.to - 1); line++) {
    const end = lineEndCol(cm, line), from = Math.max(box.left, end);
    if (box.right <= from) continue;
    const at = cm.charCoords(CodeMirror.Pos(line, cm.getLine(line).length), 'div');
    const part = document.createElement('div');
    part.className = 'CodeMirror-selected';
    Object.assign(part.style, { position: 'absolute', left: at.left + (from - end) * cw + 'px', top: at.top + 'px',
      width: (box.right - from) * cw + 'px', height: at.bottom - at.top + 'px' });
    parts.push(part);
  }
  layer.replaceChildren(...parts);
}

function drawVirtual(cm, reveal = false) {
  if (drawCursors(cm, reveal)) return;   // several cursors: cursors.js draws them
  const wrapper = cm.getWrapperElement();
  // CodeMirror's cursors hidden: past the end of the line, and on a block with width (its cursors at short lines' ends
  // would compete with the head's); a block of width 0 keeps them, one per line where typing goes.
  const block = blockOf(cm);
  wrapper.classList.toggle('mm-virtual', !!virtualOf(cm) || !!block && block.anchor.col !== block.head.col);
  drawBlockFill(cm);
  let el = cm.state.mmVirtualEl;
  const box = drawnBox(cm);
  if (!box) {
    if (el) el.hidden = true;
    if (cm.state.mmSpacer) placeSpacer(cm, 0);
    if (reveal && !cm.somethingSelected())   // CodeMirror's own cursor: the same margin to the edges
      queueMicrotask(() => { const at = cm.cursorCoords(null, 'window'); revealX(cm, at.left, at.left + 2); });
    return;
  }
  if (!el) {
    el = cm.state.mmVirtualEl = document.createElement('div');
    el.className = 'mm-vcursor';
    cm.display.lineSpace.append(el);
  }
  Object.assign(el.style, { left: box.left + 'px', top: box.top + 'px', height: box.bottom - box.top + 'px' });
  el.hidden = false;
  // The scroller reaches further right than what is visible (CodeMirror hides its own scroll bar that way): the
  // spacer is that much further, so the cursor can be scrolled fully into view.
  const hidden = Math.max(0, cm.getScrollerElement().getBoundingClientRect().right - visibleSpan(cm).right);
  placeSpacer(cm, box.left + 4 * charWidth(cm) + hidden, box.top);
  // After CodeMirror's own scroll for this move (it is applied when its operation ends; it would undo this one).
  if (reveal) queueMicrotask(() => { if (el.hidden) return; const r = el.getBoundingClientRect(); revealX(cm, r.left, r.right); });
  el.style.animation = 'none';   // the blink starts again on every move, as CodeMirror's
  void el.offsetWidth;
  el.style.animation = '';
}

// ---------- Moving ----------
// Up / Down (and PgUp / PgDn): the cursor keeps its horizontal place (the goal, kept over several moves); on a row
// that ends before it, the cursor stays past that line's end. A row that wraps is full: no place past its end.
function moveVertical(cm, dir, page) {
  const box = cursorBox(cm);
  cm.state.mmGoalX ??= box.left;
  let y;
  if (page) {
    placing(cm, () => cm.execCommand(dir > 0 ? 'goPageDown' : 'goPageUp'));
    y = cm.charCoords(cm.getCursor(), 'div').top + 1;
  } else {
    if (dir > 0 && cm.getCursor().line >= cm.lastLine() && box.bottom >= cm.charCoords(CodeMirror.Pos(cm.lastLine(), cm.getLine(cm.lastLine()).length), 'div').bottom - 1) return;
    if (dir < 0 && box.top <= cm.charCoords(CodeMirror.Pos(cm.firstLine(), 0), 'div').top + 1) return;
    y = dir > 0 ? box.bottom + 1 : box.top - 1;
  }
  const goal = cm.state.mmGoalX;
  const pos = cm.coordsChar({ left: goal + cm.display.lineSpace.getBoundingClientRect().left, top: y + cm.display.lineSpace.getBoundingClientRect().top }, 'window');
  const text = cm.getLine(pos.line), end = cm.charCoords(CodeMirror.Pos(pos.line, text.length), 'div');
  const pastEnd = pos.ch === text.length && goal > end.left + charWidth(cm) / 2;
  const col = pastEnd ? lineEndCol(cm, pos.line) + Math.round((goal - end.left) / charWidth(cm)) : vcolAt(cm, pos.line, pos.ch);
  placeAt(cm, pos.line, col);
  cm.state.mmGoalX = goal;
  lineIntoView(cm, pos.line);
}

// Right at or past the end: one column further; Left / Backspace past the end: one back.
function stepVirtual(cm, dir) {
  const head = cm.getCursor(), v = virtualOf(cm), end = lineEndCol(cm, head.line);
  const col = v ? v.col : vcolAt(cm, head.line, head.ch);
  if (dir > 0 && col < end) return CodeMirror.Pass;
  if (dir < 0 && !v) return CodeMirror.Pass;
  const next = Math.min(col + dir, maxCol(cm, head.line));
  if (next === col) return;
  placeAt(cm, head.line, next);
}

// The text that fills a line from its end to col: spaces, or with useTabs tabs as far as the stops allow, then spaces.
function fillTo(cm, line, col) {
  const stops = stopsOf(cm), text = cm.getLine(line), lead = /^[ \t]*$/.test(text);
  let at = lineEndCol(cm, line), fill = '';
  while (stops.useTabs) {
    const size = lead ? stops.indent : stops.tab, next = at + size - at % size;
    if (next > col) break;
    fill += '\t';
    at = next;
  }
  return fill + ' '.repeat(col - at);
}

// The line filled up to the cursor (Tab, before it does its own work).
function fillVirtual(cm) {
  const v = virtualOf(cm);
  if (!v) return;
  const fill = fillTo(cm, v.line, v.col);
  placing(cm, () => { cm.state.mmVirtual = null; cm.replaceRange(fill, CodeMirror.Pos(v.line, cm.getLine(v.line).length), undefined, '+input'); });
  drawVirtual(cm);
}

// Delete past the end: the line filled up to the cursor and the next line joined on there; the cursor stays.
function deleteVirtual(cm) {
  const v = virtualOf(cm);
  if (v.line >= cm.lastLine()) return;
  const fill = fillTo(cm, v.line, v.col), end = cm.getLine(v.line).length;
  placing(cm, () => {
    cm.state.mmVirtual = null;
    cm.replaceRange(fill, CodeMirror.Pos(v.line, end), CodeMirror.Pos(v.line + 1, 0), '+delete');
    cm.setCursor(CodeMirror.Pos(v.line, end + fill.length));
  });
  drawVirtual(cm);
}

// ---------- Typing and paste past the end ----------
// A change at the cursor's place while it is past the end: the fill goes in front of it, in the same change (one undo
// step). Another change: the cursor is no longer past the end.
function onVirtualBeforeChange(cm, change) {
  const v = virtualOf(cm);
  if (!v || cm.state.mmPlacing || cm.state.mmOwn) return;
  const end = CodeMirror.Pos(v.line, cm.getLine(v.line).length);
  cm.state.mmVirtual = null;
  queueMicrotask(() => drawVirtual(cm));
  if (change.origin === 'setValue' || CodeMirror.cmpPos(change.from, end) !== 0 || CodeMirror.cmpPos(change.to, end) !== 0) return;
  if (!/^(\+input|paste|\*compose|\+mmpaste|drop)/.test(change.origin ?? '') && change.origin !== undefined) return;
  const text = [...change.text];
  text[0] = fillTo(cm, v.line, v.col) + text[0];
  change.update(change.from, change.to, text);
}

// Any other move (a key CodeMirror handles, a click, a selection) ends the column past the end and the goal.
function onVirtualSelectionChange(cm, change) {
  cm.state.mmMouse = change?.origin === '*mouse';   // a click or a drag: the view does not scroll for the margin
  if (cm.state.mmPlacing) return;
  cm.state.mmGoalX = null;
  if (cm.state.mmVirtual) {
    cm.state.mmVirtual = null;
    queueMicrotask(() => drawVirtual(cm));
  }
}

// ---------- The mouse ----------
// A click past the end of a line's last row: the cursor at the clicked column (after CodeMirror placed it at the end).
function onVirtualMouseDown(cm, e) {
  if (e.button !== 0 || e.detail > 1 || e.shiftKey || e.ctrlKey || e.altKey || column.on) return;
  if (!e.target.closest('.CodeMirror-lines')) return;
  const x = e.clientX, y = e.clientY;
  addEventListener('mouseup', () => setTimeout(() => {
    if (!virtualOn(cm)) return;
    const head = cm.getCursor(), text = cm.getLine(head.line);
    if (head.ch !== text.length) return;
    const end = cm.charCoords(CodeMirror.Pos(head.line, text.length), 'window');
    if (y < end.top || y > end.bottom || x <= end.left + charWidth(cm) / 2) return;   // not right of the line's end
    placeAt(cm, head.line, Math.min(lineEndCol(cm, head.line) + Math.round((x - end.left) / charWidth(cm)), maxCol(cm, head.line)), false);
  }), { once: true, capture: true });
}

// ---------- Per editor ----------
// A key on a block (column mode): the block ends at its head, past the line's end when it is there, and the key
// moves on from there.
function fromBlock(cm) {
  const b = blockOf(cm);
  if (!b || !virtualAllowed()) return;
  cm.state.mmBlock = null;
  placeAt(cm, b.head.line, b.head.col);
}

function setupVirtual(pane) {
  const cm = pane.cm;
  cm.on('cursorActivity', () => drawVirtual(cm, !cm.state.mmMouse));   // a selection's head, a block's head
  cm.on('beforeChange', onVirtualBeforeChange);
  cm.on('beforeSelectionChange', onVirtualSelectionChange);
  cm.on('swapDoc', () => { cm.state.mmVirtual = null; cm.state.mmGoalX = null; drawVirtual(cm); });
  // A font, wrap or size change, scrolling (the block's lines on screen).
  cm.on('update', () => { if (cm.state.mmVirtualEl && !cm.state.mmVirtualEl.hidden || blockOf(cm) || multiOn(cm)) drawVirtual(cm); });
  cm.on('scroll', () => { if (cm.state.mmSpacer && !drawnBox(cm)) placeSpacer(cm, 0); });   // the width follows the view back
  cm.getWrapperElement().addEventListener('mousedown', e => onVirtualMouseDown(cm, e), true);
  const when = run => c => virtualOn(c) ? run(c) : CodeMirror.Pass;
  const move = run => c => { fromBlock(c); return when(run)(c); };   // a moving key ends a block at its head
  const ending = c => { clearVirtual(c); return CodeMirror.Pass; };
  cm.addKeyMap({
    Up: move(c => moveVertical(c, -1)), Down: move(c => moveVertical(c, 1)),
    PageUp: move(c => moveVertical(c, -1, true)), PageDown: move(c => moveVertical(c, 1, true)),
    Right: move(c => stepVirtual(c, 1)),
    // Left at a line's start goes to the line above unless the setting leftWraps is off.
    Left: c => !setting('leftWraps') && !c.somethingSelected() && !virtualOf(c) && c.getCursor().ch === 0 ? undefined : move(x => stepVirtual(x, -1))(c),
    'Shift-Left': c => !setting('leftWraps') && !column.on && !blockOf(c) && c.getCursor('head').ch === 0 ? undefined : CodeMirror.Pass,
    // A word step on a block: from its head (CodeMirror would move every line's cursor).
    'Ctrl-Right': move(() => CodeMirror.Pass), 'Ctrl-Left': move(() => CodeMirror.Pass),
    Backspace: when(c => virtualOf(c) ? stepVirtual(c, -1) : CodeMirror.Pass),
    Delete: when(c => virtualOf(c) ? deleteVirtual(c) : CodeMirror.Pass),
    Tab: when(c => { fillVirtual(c); return CodeMirror.Pass; }),
    End: ending, Home: ending, Enter: ending,
  });
}
