'use strict';
// The editor's commands: markdown formatting, comments and section moves (run by the language actions, see
// actions.js), and the formatting bar above the editor.
// Loaded together with the editor (see loadEditor): starting in Read mode loads and runs none of this.

const Pos = CodeMirror.Pos;
const fmtPane = cm => panes.find(p => p.cm === cm);
const fmtDoc = cm => fmtPane(cm)?.active?.doc;

// Runs `edit(from, to, empty)` for every selection, last first; it returns the new [from, to].
// These are kept as bookmarks, so the edits for the other selections move them along. One undo step.
function eachRange(cm, edit) {
  if (cm.getOption('readOnly')) return;
  cm.operation(() => {
    const kept = [];
    for (const range of cm.listSelections().slice().reverse()) {
      const from = range.from(), to = range.to();
      const [a, b] = edit(from, to, from.line === to.line && from.ch === to.ch);
      kept.unshift([cm.setBookmark(a), cm.setBookmark(b)]);
    }
    cm.setSelections(kept.map(([a, b]) => {
      const range = { anchor: a.find(), head: b.find() };
      a.clear();
      b.clear();
      return range;
    }));
  });
}

// Position `offset` characters after `pos`.
const shift = (cm, pos, offset) => cm.posFromIndex(cm.indexFromPos(pos) + offset);

// ---------- Inline: bold, italic, strikethrough, code ----------
const runBefore = (text, i, c) => { let n = 0; while (i - n > 0 && text[i - n - 1] === c) n++; return n; };
const runAfter = (text, i, c) => { let n = 0; while (i + n < text.length && text[i + n] === c) n++; return n; };

// Does a run of n mark characters on both sides hold this mark? `*` is in 1 and 3 (***x***), `**` in 2 and 3.
function holds(mark, n) {
  if (mark === '*') return n === 1 || n >= 3;
  return n >= mark.length;
}

// Where the mark of the text a..b on a line is: around it ('outer'), its own first and last characters
// ('inner'), or nowhere (null).
function markAt(text, a, b, mark) {
  const c = mark[0];
  if (holds(mark, Math.min(runBefore(text, a, c), runAfter(text, b, c)))) return 'outer';
  if (b - a > 2 * mark.length && holds(mark, Math.min(runAfter(text, a, c), runBefore(text, b, c)))) return 'inner';
  return null;
}

// With a selection: the selected text gets the mark, or loses it. Without one: the mark is added with the
// cursor in between (pressed again on such an empty pair: the pair goes).
function toggleInline(cm, mark) {
  const len = mark.length;
  eachRange(cm, (from, to, empty) => {
    if (empty) {
      const text = cm.getLine(from.line), i = from.ch;
      if (holds(mark, Math.min(runBefore(text, i, mark[0]), runAfter(text, i, mark[0])))
          && text.slice(i - len, i + len) === mark + mark) {
        cm.replaceRange('', Pos(from.line, i - len), Pos(from.line, i + len));
        const at = Pos(from.line, i - len);
        return [at, at];
      }
      cm.replaceRange(mark + mark, from);
      const at = Pos(from.line, i + len);
      return [at, at];
    }
    // Line by line, last first, so a mark never spans a paragraph break. Spaces at the ends stay outside
    // the mark (`** bold **` is not bold).
    const parts = [];
    for (let line = from.line; line <= to.line; line++) {
      const text = cm.getLine(line);
      let a = line === from.line ? from.ch : 0, b = line === to.line ? to.ch : text.length;
      while (a < b && /\s/.test(text[a])) a++;
      while (b > a && /\s/.test(text[b - 1])) b--;
      if (a < b) parts.push({ line, a, b, where: markAt(text, a, b, mark) });
    }
    if (!parts.length) return [from, to];
    const remove = parts.every(p => p.where);
    let start = from, end = to;
    for (const p of parts.reverse()) {
      let a = p.a, b = p.b;
      if (remove && p.where === 'outer') {
        cm.replaceRange('', Pos(p.line, b), Pos(p.line, b + len));
        cm.replaceRange('', Pos(p.line, a - len), Pos(p.line, a));
        a -= len; b -= len;
      } else if (remove) {
        cm.replaceRange('', Pos(p.line, b - len), Pos(p.line, b));
        cm.replaceRange('', Pos(p.line, a), Pos(p.line, a + len));
        b -= 2 * len;
      } else if (!p.where) {
        cm.replaceRange(mark, Pos(p.line, b));
        cm.replaceRange(mark, Pos(p.line, a));
        a += len; b += len;
      }
      if (p === parts[0]) end = Pos(p.line, b);   // the last line, done first
      start = Pos(p.line, a);
    }
    return [start, end];
  });
}

// ---------- Link and image ----------
const URL_TEXT = /^(https?:\/\/|mailto:|www\.)\S+$/i;

// [text](url). A URL on the clipboard becomes the target; a selected URL becomes the target too.
async function insertLink(cm) {
  if (cm.getOption('readOnly')) return;
  const clip = (await host('clipboardText').catch(() => null) || '').trim();
  const url = URL_TEXT.test(clip) ? clip : '';
  eachRange(cm, (from, to) => {
    const text = cm.getRange(from, to);
    if (!url && URL_TEXT.test(text.trim())) {
      cm.replaceRange(`[](${text.trim()})`, from, to);
      const at = shift(cm, from, 1);
      return [at, at];
    }
    cm.replaceRange(`[${text}](${url})`, from, to);
    // Without text: type it. Without url: type that. With both: carry on after the link.
    const at = shift(cm, from, !text ? 1 : !url ? text.length + 3 : text.length + url.length + 4);
    return [at, at];
  });
}

async function insertImageFromFile(cm) {
  const pane = fmtPane(cm);
  if (!pane || cm.getOption('readOnly')) return;
  const paths = await host('pickImage');
  if (paths?.length) await insertImages(pane, [], paths, false);
}

// A picture on the Windows clipboard, or image files copied in Explorer (whatever clipboard is active).
async function insertImageFromClipboard(cm) {
  const pane = fmtPane(cm);
  if (!pane || cm.getOption('readOnly')) return;
  const found = await host('clipboardImage');
  if (!found.paths?.length && !found.png) return toast('No picture or image file on the Windows clipboard.');
  await insertImages(pane, [], found.paths || [], false, found.png);
}

// ---------- Line commands: headings, lists, quote ----------
const QUOTES = /^(?:[ \t]*>[ \t]?)*/;
const PREFIX = /^([ \t]*)(?:(#{1,6})[ \t]+|[-*+][ \t]+\[[ xX]\][ \t]+()|([-*+])[ \t]+|\d{1,9}[.)][ \t]+())?/;

// What a line starts with: quote marks, then one heading or list marker. `end`: where the text starts.
function parseLine(text) {
  const quote = text.match(QUOTES)[0];
  const m = text.slice(quote.length).match(PREFIX);
  const kind = m[2] ? 'h' + m[2].length : m[3] !== undefined ? 'task' : m[4] ? 'bullet' : m[5] !== undefined ? 'number' : '';
  return { quote, indent: m[1], kind, end: quote.length + m[0].length };
}

// The lines a selection covers (a selection ending at the start of a line leaves that line out).
function coveredLines(from, to) {
  const lines = [];
  for (let line = from.line; line <= (to.line > from.line && to.ch === 0 ? to.line - 1 : to.line); line++) lines.push(line);
  return lines;
}

// Gives each covered line a new start: `prefixOf(parsed, n)` returns [replace up to, new text] or null.
// Blank lines are left alone, unless all are blank. The selection keeps its place in the text.
function editLines(cm, choose) {
  eachRange(cm, (from, to, empty) => {
    let lines = coveredLines(from, to);
    const filled = lines.filter(l => cm.getLine(l).trim());
    if (filled.length) lines = filled;
    const parsed = lines.map(l => parseLine(cm.getLine(l)));
    const prefixOf = choose(parsed);
    const moved = new Map();
    parsed.forEach((p, n) => {
      const change = prefixOf(p, n);
      if (!change) return;
      const [upTo, text] = change;
      cm.replaceRange(text, Pos(lines[n], 0), Pos(lines[n], upTo));
      moved.set(lines[n], [upTo, text.length]);
    });
    const place = (pos, keepStart) => {
      const m = moved.get(pos.line);
      if (!m) return pos;
      const [oldLen, newLen] = m;
      if (pos.ch === 0 && keepStart) return pos;
      return Pos(pos.line, pos.ch < oldLen ? newLen : pos.ch - oldLen + newLen);
    };
    return [place(from, !empty), place(to, false)];
  });
}

// Heading 1-6, a list kind, or '' (plain text). The same kind on all lines again: plain text.
function setLineKind(cm, kind) {
  editLines(cm, parsed => {
    const all = kind && parsed.every(p => p.kind === kind);
    const target = all ? '' : kind;
    return (p, n) => {
      const marker = target.startsWith('h') ? '#'.repeat(+target[1]) + ' '
        : target === 'bullet' ? '- ' : target === 'task' ? '- [ ] ' : target === 'number' ? `${n + 1}. ` : '';
      // A heading has no indent; a list item keeps its own; plain text keeps it only when it had no marker.
      const indent = target.startsWith('h') || (!target && p.kind) ? '' : p.indent;
      return [p.end, p.quote + indent + marker];
    };
  });
}

function toggleQuote(cm) {
  editLines(cm, parsed => {
    const all = parsed.every(p => p.quote);
    return p => all ? [p.quote.length, p.quote.replace(/^[ \t]*>[ \t]?/, '')] : p.quote ? null : [0, '> '];
  });
}

// ---------- Blocks: code block, horizontal rule ----------
const FENCE = /^[ \t]*(```|~~~)/;

function toggleCodeBlock(cm) {
  eachRange(cm, (from, to, empty) => {
    const lines = coveredLines(from, to), first = lines[0], last = lines[lines.length - 1];
    if (last > first && FENCE.test(cm.getLine(first)) && FENCE.test(cm.getLine(last))) {
      cm.replaceRange('', Pos(last - 1, cm.getLine(last - 1).length), Pos(last, cm.getLine(last).length));
      cm.replaceRange('', Pos(first, 0), Pos(first + 1, 0));
      return [Pos(first, 0), Pos(last - 2, cm.getLine(last - 2).length)];
    }
    if (empty && !cm.getLine(first).trim()) {
      cm.replaceRange('```\n\n```', Pos(first, 0), Pos(first, cm.getLine(first).length));
    } else {
      cm.replaceRange('\n```', Pos(last, cm.getLine(last).length));
      cm.replaceRange('```\n', Pos(first, 0));
    }
    return [Pos(first, 3), Pos(first, 3)];   // after the opening fence: type the language
  });
}

// Inserts lines as a block of their own: on the current line when it is blank, else below it, with blank
// lines around where markdown needs them. Returns the line where the block starts.
function insertBlock(cm, lines, blankAfter) {
  const line = cm.getCursor().line, text = cm.getLine(line);
  let at = line, before = '';
  if (text.trim()) {
    cm.replaceRange('\n', Pos(line, text.length));
    at = line + 1;
    before = '\n';   // a line of text right above `---` makes it a heading; above a table, part of it
  } else if (line > 0 && cm.getLine(line - 1).trim()) before = '\n';
  const next = at + 1 < cm.lineCount() && cm.getLine(at + 1).trim();
  cm.replaceRange(before + lines.join('\n') + (blankAfter && next ? '\n' : ''), Pos(at, 0), Pos(at, cm.getLine(at).length));
  return at + (before ? 1 : 0);
}

function insertRule(cm) {
  if (cm.getOption('readOnly')) return;
  cm.operation(() => {
    const at = insertBlock(cm, ['---', ''], false);
    cm.setCursor(Pos(at + 1, 0));
  });
}

// ---------- Tables ----------
// The ranges of the cells of a table row: [start, end) between the pipes. Pipes escaped with \ or inside
// `code` do not count.
function cellSpans(text) {
  const pipes = [];
  let code = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '`') code = !code;
    else if (text[i] === '|' && !code) pipes.push(i);
  }
  if (!pipes.length) return [];
  const lead = !text.slice(0, pipes[0]).trim();
  const trail = !text.slice(pipes[pipes.length - 1] + 1).trim() && (pipes.length > 1 || !lead);
  const bounds = [lead ? pipes[0] : -1, ...pipes.slice(lead ? 1 : 0, trail ? -1 : undefined), trail ? pipes[pipes.length - 1] : text.length];
  const spans = [];
  for (let i = 0; i + 1 < bounds.length; i++) spans.push({ start: bounds[i] + 1, end: bounds[i + 1] });
  return spans;
}

const SEPARATOR = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const rowLike = text => text.trim() && cellSpans(text).length > 0;

// The table around a line: { first, last } (the separator is first + 1), or null.
function tableAt(cm, line) {
  if (!rowLike(cm.getLine(line))) return null;
  let first = line, last = line;
  while (first > 0 && rowLike(cm.getLine(first - 1))) first--;
  while (last + 1 < cm.lineCount() && rowLike(cm.getLine(last + 1))) last++;
  // Lines with a pipe right above the header belong to the paragraph before it, not to the table.
  for (let header = first; header < last; header++)
    if (SEPARATOR.test(cm.getLine(header + 1)) && header <= line) return { first: header, last };
  return null;
}

const cellText = (text, span) => text.slice(span.start, span.end).trim();

// The table as data: header, alignment per column, rows.
function readTable(cm, table) {
  const row = line => { const text = cm.getLine(line); return cellSpans(text).map(s => cellText(text, s)); };
  const align = row(table.first + 1).map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : '');
  const rows = [];
  for (let line = table.first + 2; line <= table.last; line++) rows.push(row(line));
  return { header: row(table.first), align, rows };
}

// Writes the table back with the columns lined up.
function writeTable(cm, table, model) {
  const cols = Math.max(model.header.length, model.align.length, ...model.rows.map(r => r.length), 1);
  const all = [model.header, ...model.rows];
  const width = [];
  for (let c = 0; c < cols; c++) width.push(Math.max(3, ...all.map(r => (r[c] ?? '').length)));
  const pad = (text, c) => {
    const room = width[c] - text.length, align = model.align[c];
    if (align === 'right') return ' '.repeat(room) + text;
    if (align === 'center') return ' '.repeat(room >> 1) + text + ' '.repeat(room - (room >> 1));
    return text + ' '.repeat(room);
  };
  const line = cells => '| ' + width.map((w, c) => pad(cells[c] ?? '', c)).join(' | ') + ' |';
  const separator = '| ' + width.map((w, c) => {
    const align = model.align[c];
    return align === 'center' ? ':' + '-'.repeat(w - 2) + ':' : align === 'right' ? '-'.repeat(w - 1) + ':'
      : align === 'left' ? ':' + '-'.repeat(w - 1) : '-'.repeat(w);
  }).join(' | ') + ' |';
  const text = [line(model.header), separator, ...model.rows.map(line)].join('\n');
  cm.replaceRange(text, Pos(table.first, 0), Pos(table.last, cm.getLine(table.last).length));
  return { first: table.first, last: table.first + 1 + model.rows.length };
}

// Puts the cursor in cell `col` of `line`, selecting its text.
function selectCell(cm, line, col) {
  const text = cm.getLine(line), spans = cellSpans(text), span = spans[Math.min(col, spans.length - 1)];
  let a = span.start, b = span.end;
  while (a < b && text[a] === ' ') a++;
  while (b > a && text[b - 1] === ' ') b--;
  if (a === b) a = b = Math.min(span.start + 1, span.end);
  cm.setSelection(Pos(line, a), Pos(line, b));
}

// Which cell the cursor is in: { table, line, col }, or null outside a table.
function cellAtCursor(cm) {
  if (cm.listSelections().length > 1) return null;
  const pos = cm.getCursor('head'), table = tableAt(cm, pos.line);
  if (!table) return null;
  const spans = cellSpans(cm.getLine(pos.line));
  let col = spans.findIndex(s => pos.ch <= s.end);
  if (col < 0) col = spans.length - 1;
  return { table, line: pos.line, col };
}

const emptyRow = cols => '|' + '   |'.repeat(cols);

// Tab / Shift+Tab: the next or previous cell; Tab in the last cell adds a row. False outside a table.
function moveCell(cm, step) {
  const at = cellAtCursor(cm);
  if (!at) return false;
  const { table } = at;
  let line = at.line, col = at.col + step;
  const cols = line => cellSpans(cm.getLine(line)).length;
  if (line === table.first + 1) { line = table.first; col = step > 0 ? 0 : cols(line) - 1; }   // on the separator
  else if (col >= cols(line)) {
    line = line === table.first ? table.first + 2 : line + 1;
    col = 0;
    if (line > table.last) {
      cm.replaceRange('\n' + emptyRow(cols(table.first)), Pos(table.last, cm.getLine(table.last).length));
      line = table.last + 1;
    }
  } else if (col < 0) {
    if (line === table.first) return true;
    line = line === table.first + 2 ? table.first : line - 1;
    col = cols(line) - 1;
  }
  selectCell(cm, line, col);
  return true;
}

// Enter at the end of a row: a new row below. On an empty last row: the row goes and the table ends.
function enterInTable(cm) {
  const at = cellAtCursor(cm);
  if (!at || cm.somethingSelected()) return false;
  const text = cm.getLine(at.line);
  if (cm.getCursor().ch < text.trimEnd().length || at.line === at.table.first + 1) return false;
  const cols = cellSpans(cm.getLine(at.table.first)).length;
  if (at.line > at.table.first + 1 && cellSpans(text).every(s => !cellText(text, s))) {
    cm.replaceRange('', Pos(at.line, 0), Pos(at.line, text.length));
    return true;
  }
  const line = at.line === at.table.first ? at.table.first + 1 : at.line;   // below the header: after the separator
  cm.replaceRange('\n' + emptyRow(cols), Pos(line, cm.getLine(line).length));
  selectCell(cm, line + 1, 0);
  return true;
}

function insertTable(cm, cols, rows) {
  if (cm.getOption('readOnly')) return;
  cm.operation(() => {
    const header = [], separator = [], blank = [];
    for (let c = 1; c <= cols; c++) {
      const name = 'Column ' + c;
      header.push(name);
      separator.push('-'.repeat(name.length));
      blank.push(' '.repeat(name.length));
    }
    const row = cells => '| ' + cells.join(' | ') + ' |';
    const at = insertBlock(cm, [row(header), row(separator), ...Array(rows).fill(row(blank))], true);
    selectCell(cm, at, 0);
  });
}

// Format, add / delete a row or column, on the table the cursor is in.
function tableCommand(cm, op) {
  const at = cellAtCursor(cm);
  if (!at || cm.getOption('readOnly')) return;
  cm.operation(() => {
    const model = readTable(cm, at.table), cols = Math.max(model.header.length, 1);
    let row = at.line - at.table.first - 2, col = at.col;   // row -2: header, -1: separator
    if (op === 'addRow') {
      row = Math.max(row, -1) + 1;
      model.rows.splice(row, 0, []);
      col = 0;
    } else if (op === 'deleteRow') {
      if (row < 0) return toast('The header row cannot be deleted.');
      model.rows.splice(row, 1);
      row = Math.min(row, model.rows.length - 1);
    } else if (op === 'addColumn') {
      for (const cells of [model.header, ...model.rows]) cells.splice(col + 1, 0, '');
      model.align.splice(col + 1, 0, '');
      col++;
    } else if (op === 'deleteColumn') {
      if (cols < 2) return toast('A table needs at least one column.');
      for (const cells of [model.header, ...model.rows]) cells.splice(col, 1);
      model.align.splice(col, 1);
      col = Math.min(col, cols - 2);
    }
    const table = writeTable(cm, at.table, model);
    selectCell(cm, row < 0 ? table.first : table.first + 2 + row, col);
  });
}

// ---------- Comments ----------
// The language's comment markers: its pack's "comments", else those of its editor mode. With an editor: the
// language of the cursor's line (a block of another language comments as that language, PLAN-embedded-languages.md).
function commentMarkers(doc, cm) {
  const inner = cm && lineLanguage(cm, cm.getCursor('from').line), lang = inner && packs[inner] ? inner : languageOf(doc);
  const own = packs[lang]?.comments;
  const mode = CodeMirror.getMode(CodeMirror.defaults, lang === languageOf(doc) ? editorMode(doc) : languageMode(lang));
  const line = own ? own.line : mode.lineComment;
  const block = own ? own.block : mode.blockCommentStart && [mode.blockCommentStart, mode.blockCommentEnd];
  return { line, block, any: line || block };
}

const COMMENT_COMMANDS = ['toggleComment', 'blockComment', 'removeBlockComment'];

// Comments the selected lines, or uncomments them (CodeMirror's comment add-on). Without a line comment
// (markdown, XML) each line goes into a block comment.
function toggleComment(cm) {
  const doc = fmtDoc(cm), m = commentMarkers(doc, cm);
  if (!m.any) return toast(`${languageTitle(doc)} has no comments.`);
  cm.toggleComment({ lineComment: m.line, blockCommentStart: m.block?.[0], blockCommentEnd: m.block?.[1], indent: true });
}

// The block comment around the cursor: [start, end] (text index of the markers), or null.
function enclosingComment(cm, open, close) {
  const text = cm.getValue(), at = cm.indexFromPos(cm.getCursor('from'));
  const start = text.lastIndexOf(open, at);
  if (start < 0) return null;
  const end = text.indexOf(close, start + open.length);
  return end < 0 || end + close.length < at ? null : [start, end];   // closed before the cursor: not in it
}

// Takes the markers of the block comment around the cursor away (with the space next to each). False
// when the cursor is not in one.
function removeBlockComment(cm, quiet) {
  const doc = fmtDoc(cm), block = commentMarkers(doc, cm).block, found = block && enclosingComment(cm, ...block);
  if (!found) {
    if (!quiet) toast(block ? 'The cursor is not in a block comment.' : `${languageTitle(doc)} has no block comments.`);
    return false;
  }
  const text = cm.getValue(), [start, end] = found;
  const closeFrom = text[end - 1] === ' ' ? end - 1 : end, closeTo = end + block[1].length;
  const openFrom = start, openTo = start + block[0].length + (text[start + block[0].length] === ' ' && start + block[0].length < closeFrom ? 1 : 0);
  cm.operation(() => {
    cm.replaceRange('', cm.posFromIndex(closeFrom), cm.posFromIndex(closeTo));
    cm.replaceRange('', cm.posFromIndex(openFrom), cm.posFromIndex(openTo));
  });
  return true;
}

// Inside a block comment: removes it. Else the selection goes into one (without a selection: an empty
// one with the cursor in it).
function blockComment(cm) {
  const doc = fmtDoc(cm), block = commentMarkers(doc, cm).block;
  if (!block) return toast(`${languageTitle(doc)} has no block comments.`);
  if (removeBlockComment(cm, true)) return;
  const [open, close] = block;
  eachRange(cm, (from, to) => {
    const length = cm.indexFromPos(to) - cm.indexFromPos(from);
    cm.replaceRange(' ' + close, to);
    cm.replaceRange(open + ' ', from);
    const a = shift(cm, from, open.length + 1);
    return [a, shift(cm, a, length)];
  });
}

// ---------- Sections ----------
// To the next (dir 1) or previous (-1) line the language calls a section start (`spec` from its pack:
// "line" pattern, "after": the line before matches, "token": the editor's token type there). None
// further: the end or the start of the text. `extend`: select from where the cursor was.
function jumpTo(cm, spec, dir, extend) {
  const line = new RegExp(spec.line, spec.flags ?? ''), after = spec.after && new RegExp(spec.after, spec.flags ?? '');
  const hit = l => line.test(cm.getLine(l)) && (!after || l === 0 || after.test(cm.getLine(l - 1))) &&
    (!spec.token || (cm.getTokenTypeAt(Pos(l, 1)) || '').split(' ').includes(spec.token));
  const last = cm.lastLine();
  let l = cm.getCursor('head').line + dir;
  while (l >= 0 && l <= last && !hit(l)) l += dir;
  const to = l < 0 ? Pos(0, 0) : l > last ? Pos(last, cm.getLine(last).length) : Pos(l, 0);
  if (extend) cm.setSelection(cm.getCursor('anchor'), to); else cm.setCursor(to);
  cm.scrollIntoView(to, 80);
}

// ---------- Keys that type ----------
// Enter and Tab stay editor keys (in a table they move between cells); everything else is an action.
const mdKey = run => markdownOnly(cm => { if (!cm.getOption('readOnly')) run(cm); });

// Home (setting homeStop): column 1, or the first non-blank character first (again: column 1, CodeMirror's smart
// home). A motion: with Shift it selects.
const homeKey = Object.assign(cm => cm.execCommand(setting('homeStop') ? 'goLineStart' : 'goLineStartSmart'), { motion: true });

function formatKeys() {
  return {
    Home: homeKey,
    'Enter': cm => {
      const md = markdownOnly(c => { if (!enterInTable(c)) c.execCommand('newlineAndIndentContinueMarkdownList'); })(cm);
      return md === CodeMirror.Pass ? formatEnter(cm) : md;
    },
    'Shift-Enter': mdKey(cm => cm.replaceSelection('<br>')),
    'Tab': cm => { if (cm.getOption('mode').name !== 'gfm' || !moveCell(cm, 1)) tabKey(cm); },   // tabs.js
    'Shift-Tab': cm => { if (cm.getOption('mode').name !== 'gfm' || !moveCell(cm, -1)) shiftTabKey(cm); },
  };
}

// ---------- Indentation while typing (docs/plans/executed/PLAN-reformat.md 3.4) ----------
// In a language with format parameters, Enter gives the new line the indentation Format would give it, and typing
// a closing word or sign at the start of a line (end if, else, }, </name>) moves that line to its column.
function reformatContext(cm, line) {
  const doc = panes.find(p => p.cm === cm)?.active?.doc;
  if (!doc) return null;
  const fileLang = languageOf(doc), langAt = l => lineLanguage(cm, l) ?? fileLang, lang = langAt(line);
  const cfg = rfConfig(lang);
  if (!cfg || cfg.keepIndent) return null;                // Python, markdown: their indentation is their structure
  let from = line;
  while (from > 0 && line - from < 2000 && (lang !== fileLang ? langAt(from - 1) === lang : true)) from--;
  const stops = tabStops({ language: lang === 'markdown' ? undefined : lang });
  const opts = { indent: stops.indent, useTabs: stops.useTabs };
  const base = lang !== fileLang ? (cm.getLine(from).match(/^[ \t]*/)[0].replace(/\t/g, ' '.repeat(stops.indent)).length) : 0;
  return { cfg, opts, from, lang, base, langAt };
}

function reindentLine(cm, line) {
  const ctx = reformatContext(cm, line);
  if (!ctx) return;
  const texts = [];
  for (let l = ctx.from; l <= line; l++) {
    const t = cm.getLine(l);
    texts.push(ctx.langAt(l) !== ctx.lang ? '\u0000' + l : ctx.base ? t.replace(new RegExp(`^[ \\t]{0,${ctx.base}}`), '') : t);
  }
  const col = reformatIndentAt(texts.join('\n'), ctx.cfg, ctx.opts);
  if (col === null || col === undefined) return;
  const have = cm.getLine(line).match(/^[ \t]*/)[0], want = rfIndentText(col + ctx.base, ctx.opts);
  if (have !== want) cm.replaceRange(want, CodeMirror.Pos(line, 0), CodeMirror.Pos(line, have.length), '+input');
}

function formatEnter(cm) {
  if (cm.getOption('readOnly') || !reformatContext(cm, cm.getCursor().line)) return CodeMirror.Pass;
  cm.operation(() => {
    // The line being left first: `else` then Enter puts the else at its column (no space or sign came after it).
    for (const line of new Set(cm.listSelections().map(s => s.head.line))) if (startsWithCloser(cm, line)) reindentLine(cm, line);
    cm.execCommand('newlineAndIndent');
    for (const sel of cm.listSelections()) reindentLine(cm, sel.head.line);
  });
}

// The closing and middle words of a language (end if, else, when, then on its own line) and its closing signs.
function closerWords(cfg) {
  const b = cfg.blocks ?? {};
  return [...Object.keys(b.close ?? {}), ...(b.middle ?? []).map(m => m.w), ...(b.open ?? []).flatMap(o => o.until ?? []),
    ...(b.open ?? []).filter(o => o.endsBefore?.length && o.closes === false).map(o => o.w)];
}

// Does the line start with a closing or middle word as a whole word (else, end if;), or a closing sign?
function startsWithCloser(cm, line) {
  const ctx = reformatContext(cm, line);
  if (!ctx) return false;
  const cfg = ctx.cfg, text = cm.getLine(line).replace(/^[ \t]+/, '');
  if ((cfg.groups ?? []).some(g => text.startsWith(g.pair[1])) || (cfg.markup && text.startsWith('</'))) return true;
  return closerWords(cfg).some(w => {
    const head = text.slice(0, w.length);
    return rfLow(cfg, head) === rfLow(cfg, w) && !/[\w$#@]/.test(text.charAt(w.length));
  });
}

// A character typed: when it ends a closing word at the start of the line (`end if` then a space or `;`), or is a
// closing sign there, the line goes to its column.
function electricReformat(cm, change) {
  if (change.origin !== '+input' || change.text.length !== 1 || change.text[0].length !== 1) return;
  const line = change.from.line, ctx = reformatContext(cm, line);
  if (!ctx) return;
  const typed = change.text[0], head = cm.getLine(line).slice(0, change.from.ch).replace(/^[ \t]+/, '');
  const cfg = ctx.cfg, words = closerWords(cfg);
  const closers = (cfg.groups ?? []).map(g => g.pair[1]);
  const isWordEnd = !/[\w$#@]/.test(typed);
  const hit = (isWordEnd && words.some(w => rfLow(cfg, w) === rfLow(cfg, head))) || (!head && closers.includes(typed)) ||
    (cfg.markup && typed === '>' && head.startsWith('</'));
  if (hit) reindentLine(cm, line);
}

// The commands the language packs name ("command" in an action); parameters come from the key.
const EDIT_COMMANDS = {
  bold: cm => toggleInline(cm, '**'),
  italic: cm => toggleInline(cm, '*'),
  strikethrough: cm => toggleInline(cm, '~~'),
  inlineCode: cm => toggleInline(cm, '`'),
  link: insertLink,
  imageFromFile: insertImageFromFile,
  imageFromClipboard: insertImageFromClipboard,
  heading: (cm, level) => setLineKind(cm, 'h' + Math.max(1, Math.min(6, level | 0))),
  paragraph: cm => setLineKind(cm, ''),
  bulletList: cm => setLineKind(cm, 'bullet'),
  numberList: cm => setLineKind(cm, 'number'),
  taskList: cm => setLineKind(cm, 'task'),
  quote: toggleQuote,
  codeBlock: toggleCodeBlock,
  rule: insertRule,
  table: (cm, cols = 3, rows = 2) => insertTable(cm, cols, rows),
  tableFormat: cm => tableCommand(cm, 'format'),
  tableAddRow: cm => tableCommand(cm, 'addRow'),
  tableAddColumn: cm => tableCommand(cm, 'addColumn'),
  tableDeleteRow: cm => tableCommand(cm, 'deleteRow'),
  tableDeleteColumn: cm => tableCommand(cm, 'deleteColumn'),
  toggleComment,
  blockComment,
  removeBlockComment: cm => { removeBlockComment(cm); },
  indent: cm => indentLines(cm, 1),   // the selected lines (or the cursor's) to the next / previous indent stop, tabs.js
  outdent: cm => indentLines(cm, -1),
};

// ---------- The bar of a code language (its pack's bar.yaml) ----------
// Markdown has the formatting bar above; another language gets the buttons its pack lists: an icon (of the
// pack, else of plain text), an optional label, the action's title and key as tooltip.
function makeCodeBar(pane) {
  const bar = document.createElement('div');
  bar.className = 'mm-format mm-code-bar';
  bar.hidden = true;
  bar.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
  bar.addEventListener('click', e => {
    const button = e.target.closest('[data-action], [data-convert]');
    if (!button || !pane.cm) return;
    if (button.dataset.convert !== undefined) openMenuBelow(CONVERT_ITEMS, button);
    else runAction(button.dataset.action, [], { from: 'bar' });
  });
  pane.codeBar = bar;
  return bar;
}

function fillCodeBar(pane) {
  const doc = pane.active?.doc, key = (doc?.language ?? '') + ':' + languagesVersion;
  if (!pane.codeBar || pane.codeBarKey === key) return;
  pane.codeBarKey = key;
  const bar = pane.codeBar;
  bar.replaceChildren(...(doc?.language ? barButtons(doc.language) : []));
  bar.hidden = !bar.children.length;
}

// ---------- One list for the bar and the Format menu (executed/PLAN-formatters.md 3.2, 3.6) ----------
// A language's bar: its bar.yaml (markdown: MARKDOWN_BAR), with Convert, and Format where the language has it, at the
// end unless the bar names them itself ({ action: convert }, { action: format }). A language without a bar gets none
// (the Format menu still has Convert).
function barItems(lang) {
  const pack = packs[lang], items = [...(lang === 'markdown' ? MARKDOWN_BAR : Array.isArray(pack?.bar) ? pack.bar : [])]
    .filter(i => i === '-' || i?.action || i?.menu);
  if (!items.length) return [];
  const has = name => items.some(i => i?.action === name), extra = [];
  if (!has('convert')) extra.push({ action: 'convert', icon: 'case' });
  if (pack?.actions?.format && !has('format')) extra.push({ action: 'format', icon: 'format' });
  if (extra.length && items.at(-1) !== '-') items.push('-');
  return [...items, ...extra];
}

// The icon of a bar item: the pack's, else plain text's (by name), or markdown's own content.
const itemIcon = (lang, item) => item.html ?? packs[lang]?.icons?.[item.icon] ?? packs.plaintext?.icons?.[item.icon] ?? '';
// The title of an action in a language (the inner language's bar and menu are not the file's).
const titleIn = (lang, name) => (packs[lang]?.actions?.[name] ?? packs.plaintext?.actions?.[name] ?? appActions.get(name))?.title ?? name;

// The Convert button's tooltip, with the key of the menu at the cursor (Ctrl+Alt+C).
const CONVERT_TITLE = () => withKey('Convert: case, tabs and spaces, whitespace at line ends', 'convertMenu');
// The conversions (3.1), the Convert button's menu and submenu.
const CONVERT_ITEMS = [
  ['&UPPER CASE', 'upperCase'], ['&lower case', 'lowerCase'], ['Smart &capitalize', 'capitalize'], '-',
  ['&snake_case', 'snakeCase'], ['ca&melCase', 'camelCase'], ['&PascalCase', 'pascalCase'], ['&kebab-case', 'kebabCase'],
  ['C&ONSTANT_CASE', 'constantCase'], '-',
  ['&Tabs to spaces', 'tabsToSpaces'], ['Spaces to t&abs', 'spacesToTabs'], ['Remove &whitespace at line ends', 'trimTrailing'],
];

// The buttons of a code language's bar: separators, buttons with their action, icon and label, Convert with its menu.
function barButtons(lang) {
  return barItems(lang).map(item => {
    if (item === '-') return Object.assign(document.createElement('span'), { className: 'mm-fmt-sep' });
    const button = document.createElement('button');
    button.className = 'mm-fmt';
    button.tabIndex = -1;
    if (item.action === 'convert') {
      button.dataset.convert = '';
      button.title = CONVERT_TITLE();
      button.innerHTML = itemIcon(lang, item) + CARET;
      return button;
    }
    button.dataset.action = item.action;
    button.title = withKey(titleIn(lang, item.action), item.action);
    button.innerHTML = itemIcon(lang, item) + (item.label ? `<span class="mm-fmt-label">${escapeHtml(String(item.label))}</span>` : '');
    return button;
  });
}

// ---------- The inner language's bar (PLAN-embedded-languages.md 3.2) ----------
// While the cursor is on a line of another language (a block, a fence, lines you set), that language's bar lies
// over the editor's top text row, starting with its name: the editor never shifts. Its buttons act in that
// language. On the first visible line the text scrolls one line, so the cursor's line is under the bar.

// The language of an editor line: the block mode's state after it (documentMode, languages.js); null: the file's.
function lineLanguage(cm, line) {
  const state = cm.getStateAfter(line, true);
  return state && typeof state === 'object' && 'lang' in state ? state.lang ?? null : null;
}

function updateInnerBar(pane) {
  const cm = pane.cm, doc = pane.active?.doc;
  if (!cm || !doc) return;
  if (!pane.gutterWidthWatched) {   // the tint behind the gutter of a line of another language needs its width
    pane.gutterWidthWatched = true;
    const width = () => cm.getWrapperElement().style.setProperty('--mm-gutter-w', cm.getGutterElement().offsetWidth + 'px');
    cm.on('update', width);
    width();
  }
  let bar = pane.innerBar;
  if (!bar) {
    bar = pane.innerBar = document.createElement('div');
    bar.className = 'mm-inner-bar';
    bar.hidden = true;
    bar.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
    bar.addEventListener('click', e => {
      const button = e.target.closest('[data-action], [data-convert]');
      if (button?.dataset.convert !== undefined) openMenuBelow(CONVERT_ITEMS, button);
      else if (button) runAction(button.dataset.action, [], { from: 'bar', language: bar.dataset.lang });
    });
    cm.getWrapperElement().append(bar);
  }
  const line = cm.getCursor().line, lang = lineLanguage(cm, line);
  const show = !!lang && lang !== languageOf(doc) && !!packs[lang] && pane.el.dataset.mode !== 'preview';
  if (show && bar.dataset.key !== lang + ':' + languagesVersion) {
    bar.replaceChildren(Object.assign(document.createElement('span'), { className: 'mm-inner-name', textContent: packs[lang].name + ':' }),
      ...barButtons(lang));
    bar.dataset.key = lang + ':' + languagesVersion;
  }
  if (show) bar.dataset.lang = lang;
  bar.hidden = !show;
  // The cursor on the first visible line, under the bar: one line down, unless it is the document's first line.
  if (show && line > 0) {
    const top = cm.getScrollInfo().top, first = cm.lineAtHeight(top + 1, 'local');
    if (line <= first) cm.scrollTo(null, cm.heightAtLine(line - 1, 'local'));
  }
}

// ---------- The formatting bar ----------
const svg = body => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const CARET = '<span class="mm-fmt-caret"></span>';
const ICONS = {
  bullet: svg('<circle cx="3" cy="4" r=".9" fill="currentColor"/><circle cx="3" cy="8" r=".9" fill="currentColor"/><circle cx="3" cy="12" r=".9" fill="currentColor"/><path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5"/>'),
  number: svg('<path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5"/><text x="0.6" y="5.6" font-size="5" fill="currentColor" stroke="none" font-family="Segoe UI">1</text><text x="0.6" y="9.6" font-size="5" fill="currentColor" stroke="none" font-family="Segoe UI">2</text><text x="0.6" y="13.6" font-size="5" fill="currentColor" stroke="none" font-family="Segoe UI">3</text>'),
  task: svg('<rect x="1.5" y="2" width="5" height="5" rx="1"/><path d="M2.7 4.6l1.1 1.1 1.7-2.1M9 4.5h5.5"/><rect x="1.5" y="9" width="5" height="5" rx="1"/><path d="M9 11.5h5.5"/>'),
  quote: svg('<path d="M2.5 3v10M6 4.5h8M6 8h8M6 11.5h5.5"/>'),
  link: svg('<path d="M6.5 9.5l3-3M7.2 4.6l1.1-1.1a2.6 2.6 0 0 1 3.7 3.7l-1.1 1.1M8.8 11.4l-1.1 1.1a2.6 2.6 0 0 1-3.7-3.7l1.1-1.1"/>'),
  image: svg('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><circle cx="5.5" cy="6" r="1.2"/><path d="M2 12.5l4-4 3 3 2-2 3.5 3.5"/>'),
  table: svg('<rect x="1.5" y="2.5" width="13" height="11" rx="1"/><path d="M1.5 6.2h13M1.5 9.9h13M6 2.5v11M10.5 2.5v11"/>'),
  code: svg('<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5"/>'),
  codeBlock: svg('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6.2 6L4.5 8l1.7 2M9.8 6l1.7 2-1.7 2"/>'),
  rule: svg('<path d="M2 8h12" stroke-width="2"/><path d="M2 4h12M2 12h12" opacity=".35"/>'),
};

// A bar button runs an action (with parameters: data-params); its tooltip shows the action's key.
function button(name, content, params = []) {
  const title = escapeHtml(withKey(actionTitle(name, params), name, ...params));
  return `<button class="mm-fmt" data-action="${name}" data-params="${params.join(' ')}" title="${title}" tabindex="-1">${content}</button>`;
}
const menuButton = (menu, title, content) =>
  `<button class="mm-fmt" data-menu-open="${menu}" title="${title}" tabindex="-1">${content}</button>`;
const menuItem = (name, label, params = [], cls = '') =>
  `<button data-action="${name}" data-params="${params.join(' ')}" class="mm-fmt-item ${cls}">${label}<span class="mm-key">${keyText(name, ...params)}</span></button>`;
const GRID_COLS = 8, GRID_ROWS = 6;

// Markdown's bar as a list, as a pack's bar.yaml: { action, html: its content } and the Heading and Table menus.
// The bar and the Format menu are both built from it (barItems adds Convert).
const MARKDOWN_BAR = [
  { action: 'bold', html: '<b>B</b>' }, { action: 'italic', html: '<i>I</i>' }, { action: 'strikethrough', html: '<s>S</s>' },
  { action: 'inlineCode', html: ICONS.code }, '-',
  { menu: 'heading', html: '<span class="mm-fmt-h">H</span>' },
  { action: 'bulletList', html: ICONS.bullet }, { action: 'numberList', html: ICONS.number }, { action: 'taskList', html: ICONS.task },
  { action: 'quote', html: ICONS.quote }, '-',
  { action: 'link', html: ICONS.link }, { action: 'imageFromFile', html: ICONS.image }, { menu: 'table', html: ICONS.table },
  { action: 'codeBlock', html: ICONS.codeBlock }, { action: 'rule', html: ICONS.rule },
];
// The items of the Heading and Table menus in the Format menu (the bar's own menus: barHtml).
const HEADING_ITEMS = () => [...[1, 2, 3, 4, 5, 6].map(n => [`Heading &${n}`, 'heading', n]), '-', ['Plain &paragraph', 'paragraph']];
const TABLE_ITEMS = () => [['&Insert table 3 x 2', 'table', 3, 2], ['&Format table', 'tableFormat'], '-',
  ['Add &row', 'tableAddRow'], ['Add &column', 'tableAddColumn'], ['&Delete row', 'tableDeleteRow'], ['D&elete column', 'tableDeleteColumn']];

const barHtml = () => barItems('markdown').map(item => {
  if (item === '-') return '<span class="mm-fmt-sep"></span>';
  if (item.menu === 'heading') return `<span class="mm-fmt-wrap">${menuButton('headingMenu', 'Heading', item.html + CARET)}` +
    '<div class="mm-menu mm-fmt-menu" data-menu="headingMenu" hidden>' +
    [1, 2, 3, 4, 5, 6].map(n => menuItem('heading', 'Heading ' + n, [n], 'mm-fmt-h' + n)).join('') +
    '<hr>' + menuItem('paragraph', 'Plain paragraph') + '</div></span>';
  if (item.menu === 'table') return `<span class="mm-fmt-wrap">${menuButton('tableMenu', 'Table', item.html + CARET)}` +
    '<div class="mm-menu mm-fmt-menu" data-menu="tableMenu" hidden>' +
    `<div class="mm-fmt-grid" style="--cols:${GRID_COLS}">` +
    Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => `<span data-c="${i % GRID_COLS + 1}" data-r="${(i / GRID_COLS | 0) + 1}"></span>`).join('') +
    '</div><div class="mm-fmt-size">Insert a table</div><hr>' +
    menuItem('tableFormat', 'Format table (line up the columns)', [], 'mm-fmt-in-table') +
    menuItem('tableAddRow', 'Add row below', [], 'mm-fmt-in-table') +
    menuItem('tableAddColumn', 'Add column right', [], 'mm-fmt-in-table') +
    menuItem('tableDeleteRow', 'Delete row', [], 'mm-fmt-in-table') +
    menuItem('tableDeleteColumn', 'Delete column', [], 'mm-fmt-in-table') + '</div></span>';
  if (item.action === 'convert')
    return `<button class="mm-fmt" data-convert title="${escapeHtml(CONVERT_TITLE())}" tabindex="-1">${itemIcon('markdown', item)}${CARET}</button>`;
  return button(item.action, itemIcon('markdown', item));
}).join('');

function makeFormatBar(pane) {
  const bar = document.createElement('div');
  bar.className = 'mm-format';
  bar.innerHTML = barHtml();
  pane.formatBar = bar;
  const menus = [...bar.querySelectorAll('.mm-fmt-menu')];
  const closeMenus = () => { for (const menu of menus) menu.hidden = true; };
  // A click on the bar must not take the focus (and with it the selection) from the editor.
  bar.addEventListener('mousedown', e => e.preventDefault());
  bar.addEventListener('click', e => {
    const cell = e.target.closest('.mm-fmt-grid span');
    const opener = e.target.closest('[data-menu-open]');
    const menu = opener && menus.find(m => m.dataset.menu === opener.dataset.menuOpen);
    if (menu) {
      const open = menu.hidden;
      closeMenus();
      menu.hidden = !open;
      if (open) refreshFormatBar(pane);
      return;
    }
    closeMenus();
    if (!pane.cm) return;
    const convert = e.target.closest('[data-convert]');
    if (convert) return openMenuBelow(CONVERT_ITEMS, convert);
    const item = !cell && e.target.closest('[data-action]');
    if (cell) runAction('table', [+cell.dataset.c, +cell.dataset.r], { from: 'bar' });
    else if (item) runAction(item.dataset.action, item.dataset.params ? item.dataset.params.split(' ').map(Number) : [], { from: 'bar' });
    pane.cm.focus();
  });
  // The table grid: the hovered size is shown and inserted on a click.
  const grid = bar.querySelector('.mm-fmt-grid'), size = bar.querySelector('.mm-fmt-size');
  grid.addEventListener('mouseover', e => {
    const cell = e.target.closest('span');
    if (!cell) return;
    const c = +cell.dataset.c, r = +cell.dataset.r;
    for (const s of grid.children) s.classList.toggle('mm-on', +s.dataset.c <= c && +s.dataset.r <= r);
    size.textContent = `${c} columns, ${r} rows + header`;
  });
  grid.addEventListener('mouseleave', () => {
    for (const s of grid.children) s.classList.remove('mm-on');
    size.textContent = 'Insert a table';
  });
  document.addEventListener('mousedown', e => { if (!bar.contains(e.target)) closeMenus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
  return bar;
}

// Shows what the cursor sits in (bold, a heading, a list, a table, ...); dims the bar in a read-only tab.
function refreshFormatBar(pane) {
  const bar = pane.formatBar, cm = pane.cm;
  if (!bar || !cm || pane.active?.doc.language) return;
  const pos = cm.getCursor('head'), type = cm.getTokenTypeAt(pos) || '';
  const line = parseLine(cm.getLine(pos.line));
  const inTable = !!tableAt(cm, pos.line);
  const on = {
    bold: /\bstrong\b/.test(type), italic: /\bem\b/.test(type), strikethrough: /\bstrikethrough\b/.test(type),
    inlineCode: /\bcomment\b/.test(type) && !/\bformatting-code-block\b/.test(type),
    headingMenu: line.kind.startsWith('h'), bulletList: line.kind === 'bullet', numberList: line.kind === 'number',
    taskList: line.kind === 'task', quote: !!line.quote, tableMenu: inTable,
  };
  for (const b of bar.querySelectorAll('button.mm-fmt')) b.classList.toggle('mm-on', !!on[b.dataset.action || b.dataset.menuOpen]);
  bar.querySelector('.mm-fmt-h').textContent = line.kind.startsWith('h') ? 'H' + line.kind[1] : 'H';
  for (const b of bar.querySelectorAll('.mm-fmt-in-table')) b.disabled = !inTable;
  bar.toggleAttribute('data-disabled', !!cm.getOption('readOnly'));
}
