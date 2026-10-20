'use strict';
// Tab stops and indent stops (docs/plans/executed/PLAN-formatters.md 3.4). Two sizes: tabSize (where the tab stops are) and
// indentSize (the indent stops), from the settings; a language pack can set its own, and useTabs: Tab and indent
// write a tab. In a line's indentation (only spaces and tabs before it) the stops are indent stops, after the first
// other character tab stops: for the Tab key and for showing a tab. The editor gets the indent size as its own tab
// size, so its indentation and a tab in it use indent stops; drawTabs redraws the tabs after text to the tab stops.
// Loaded before column.js and app.js; CodeMirror is needed only once an editor exists.

// The sizes for a document: its language's own, else the settings (defaults 4 and 2).
function tabStops(doc) {
  const pack = packOf(doc), size = (v, d) => Number.isInteger(v) && v >= 1 && v <= 16 ? v : d;
  return { tab: size(pack?.tabSize, size(setting('tabSize'), 4)), indent: size(pack?.indentSize, size(setting('indentSize'), 2)),
    useTabs: pack?.useTabs === true };
}
const stopsOf = cm => cm.state.mmStops ?? { tab: 4, indent: 2, useTabs: false };

// The visual column of ch in a line's text.
function textColumn(text, ch, stops) {
  let col = 0, lead = true;
  for (let i = 0; i < ch && i < text.length; i++) {
    const c = text[i];
    if (c === '\t') {
      const size = lead ? stops.indent : stops.tab;
      col += size - col % size;
    } else {
      if (c !== ' ') lead = false;
      col++;
    }
  }
  return col;
}

// The character at a visual column: inside a tab, that tab; past the end of the text, its end.
function textCh(text, col, stops) {
  let at = 0, lead = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    let next = at + 1;
    if (c === '\t') {
      const size = lead ? stops.indent : stops.tab;
      next = at + size - at % size;
    } else if (c !== ' ') lead = false;
    if (next > col) return i;
    at = next;
  }
  return text.length;
}

// The sizes on an editor, for the document it shows (showActive, and a changed setting).
function applyTabStops(pane, doc) {
  const cm = pane.cm, stops = tabStops(doc), key = JSON.stringify(stops);
  if (pane.stopsKey === key) return;
  pane.stopsKey = key;
  cm.state.mmStops = stops;
  cm.setOption('indentUnit', stops.indent);
  cm.setOption('indentWithTabs', stops.useTabs);
  if (cm.getOption('tabSize') !== stops.indent) cm.setOption('tabSize', stops.indent);   // draws every line again
  else cm.refresh();
}

// renderLine: a tab after text drawn up to the next tab stop (the editor drew it to the next indent stop).
function drawTabs(cm, line, el) {
  const stops = stopsOf(cm);
  if (stops.tab === stops.indent || !line.text.includes('\t')) return;
  let col = 0, lead = true;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node; (node = walk.nextNode());) {
    if (node.parentNode.classList?.contains('cm-tab')) {
      if (!lead) node.nodeValue = ' '.repeat(stops.tab - col % stops.tab);
      col += node.nodeValue.length;
    } else {
      if (lead && /[^ \u200b]/.test(node.nodeValue)) lead = false;
      col += node.nodeValue.length;
    }
  }
}

// One line to the next indent stop (dir 1) or the one before (-1); an empty line too.
function indentLineStop(cm, line, dir) {
  const stops = stopsOf(cm), text = cm.getLine(line), col = textColumn(text, text.match(/^[ \t]*/)[0].length, stops);
  const target = dir > 0 ? (Math.floor(col / stops.indent) + 1) * stops.indent : Math.max(0, (Math.ceil(col / stops.indent) - 1) * stops.indent);
  cm.indentLine(line, target - col, true);
}

// The lines of every selection (a selection ending at a line's start leaves that line out), each once.
function selectedLines(cm) {
  const lines = new Set();
  for (const r of cm.listSelections()) {
    const from = r.from(), to = r.to(), last = to.ch === 0 && to.line > from.line ? to.line - 1 : to.line;
    for (let l = from.line; l <= last; l++) lines.add(l);
  }
  return [...lines];
}

function indentLines(cm, dir, lines = selectedLines(cm)) {
  if (cm.isReadOnly()) return;
  cm.operation(() => { for (const l of lines) indentLineStop(cm, l, dir); });
}

// Tab: with a selection its lines one indent stop in. A cursor in the indentation (or at the line's start), or in a
// markdown list item: its line to the next indent stop. A cursor after text: a tab, or spaces to the next tab stop.
function tabKey(cm) {
  if (cm.isReadOnly()) return;
  if (cm.somethingSelected()) return indentLines(cm, 1);
  const stops = stopsOf(cm);
  const listItem = text => cm.getOption('mode')?.name === 'gfm' && typeof parseLine === 'function' && ['bullet', 'number', 'task'].includes(parseLine(text).kind);
  cm.operation(() => {
    const heads = cm.listSelections().map(r => r.head).sort((a, b) => b.line - a.line || b.ch - a.ch);
    for (const pos of heads) {
      const text = cm.getLine(pos.line);
      if (/^[ \t]*$/.test(text.slice(0, pos.ch)) || listItem(text)) indentLineStop(cm, pos.line, 1);
      else {
        const col = textColumn(text, pos.ch, stops);
        cm.replaceRange(stops.useTabs ? '\t' : ' '.repeat(stops.tab - col % stops.tab), pos, pos, '+input');
      }
    }
  });
}

// Shift+Tab: the selected lines, or the cursor's line, to the indent stop before.
const shiftTabKey = cm => indentLines(cm, -1);
