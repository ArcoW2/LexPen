'use strict';
// Conversions (docs/plans/executed/PLAN-formatters.md 3.1): the action kind `convert` of a pack (the plain text pack has them
// all, so every language does). Case: the selections (a block of column mode: each line's part), else the word at
// the cursor. Tabs to spaces, spaces to tabs and trailing whitespace: the lines the selections touch, whole, else the
// whole file. One undo step; the selection stays on the converted text. Trailing whitespace on save: trimOnSave.
// Loaded before app.js; CodeMirror is needed only once an editor exists.

// ---------- Case ----------
// The names in a text: words joined by spaces, "-" and "_" are one name ("file name", "file-name"); a name is split
// into its words there and where a lower case letter or digit is followed by a capital ("fileName", "XMLFile").
const NAME_RUN = /[\p{L}\p{N}]+(?:[ _-]+[\p{L}\p{N}]+)*/gu;
const nameWords = name => name.split(/[ _-]+/).flatMap(w => w.split(/(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u)).filter(Boolean);
const capital = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const NAME_CASES = {
  snake: ws => ws.map(w => w.toLowerCase()).join('_'),
  kebab: ws => ws.map(w => w.toLowerCase()).join('-'),
  constant: ws => ws.map(w => w.toUpperCase()).join('_'),
  camel: ws => ws.map((w, i) => i ? capital(w) : w.toLowerCase()).join(''),
  pascal: ws => ws.map(capital).join(''),
};
// Each line on its own: a name does not go on over a line break.
const nameCase = (text, kind) => text.split('\n').map(line => line.replace(NAME_RUN, run => NAME_CASES[kind](nameWords(run)))).join('\n');

// Smart capitalize (3.1.1): a capital first letter for a word after "." or ":" with a space or line break between, after
// an empty line, and at the start of the file. `before`: the text before (for the first word); only the first letter
// of a word changes.
function capitalizeText(text, before) {
  const tail = before.match(/\s*$/)[0], rest = before.slice(0, before.length - tail.length);
  let sign = /[.:]$/.test(rest), space = tail.length > 0;     // a sign before the whitespace; whitespace before
  let start = rest === '' || /\n[ \t]*\n/.test(tail);          // the start of the file, or after an empty line
  let broken = /\n/.test(tail), blank = rest === '' || /\n[ \t]*$/.test(tail);   // a line break seen; this line blank so far
  let out = '';
  for (const c of text) {
    if (/\s/.test(c)) {
      if (c === '\n') {
        if (blank && broken) start = true;
        broken = blank = true;
      }
      space = true;
      out += c;
      continue;
    }
    const wordStart = space || out === '' && !/[\p{L}\p{N}]$/u.test(before);
    out += /\p{L}/u.test(c) && wordStart && (start || space && sign) ? c.toUpperCase() : c;
    sign = c === '.' || c === ':';
    space = start = blank = false;
  }
  return out;
}

// ---------- Tabs and trailing whitespace (per line) ----------
function tabsToSpacesLine(text, stops) {
  if (!text.includes('\t')) return text;
  let out = '';
  for (let i = 0; i < text.length; i++)
    out += text[i] === '\t' ? ' '.repeat(textColumn(text, i + 1, stops) - textColumn(text, i, stops)) : text[i];
  return out;
}
// The indentation as one tab per whole indent step, the rest spaces; the rest of the line as it is.
function spacesToTabsLine(text, stops) {
  const lead = text.match(/^[ \t]*/)[0], col = textColumn(text, lead.length, stops);
  return '\t'.repeat(Math.floor(col / stops.indent)) + ' '.repeat(col % stops.indent) + text.slice(lead.length);
}
// How long the line stays: without its trailing spaces and tabs, at most `keep` of them left.
function trimmedLength(text, keep = 0) {
  const tail = text.match(/[ \t]*$/)[0].length;
  return text.length - tail + Math.min(tail, keep);
}

// The trailing whitespace rule of a document's language (its "trimTrailing"): mode true / false / 'setting', keep N.
function trimRule(doc) {
  const t = packOf(doc)?.trimTrailing;
  if (t === true || t === false) return { mode: t, keep: 0 };
  const o = t && typeof t === 'object' ? t : {};
  return { mode: o.mode === true || o.mode === false ? o.mode : 'setting', keep: Number.isInteger(o.keep) && o.keep > 0 ? o.keep : 0 };
}

// ---------- On the editor ----------
// The lines the selections touch (a selection ending at a line's start leaves that line out), else all lines.
function convertLines(cm) {
  if (!cm.somethingSelected() && !blockOf(cm)) return Array.from({ length: cm.lineCount() }, (_, i) => i);
  return selectedLines(cm);
}

// Every line changed by `change` (text -> text), each as its own edit (cursors, bookmarks and folds stay put).
function changeLines(cm, lines, change) {
  for (const l of lines) {
    const text = cm.getLine(l), next = change(text);
    if (next !== text) cm.replaceRange(next, CodeMirror.Pos(l, 0), CodeMirror.Pos(l, text.length), 'convert');
  }
}

// Trailing whitespace off the lines (all of them without `lines`), keeping `keep`; only that part is removed.
function trimLines(cm, keep, lines = Array.from({ length: cm.lineCount() }, (_, i) => i)) {
  for (const l of lines) {
    const text = cm.getLine(l), length = trimmedLength(text, keep);
    if (length < text.length) cm.replaceRange('', CodeMirror.Pos(l, length), CodeMirror.Pos(l, text.length), 'convert');
  }
}

// The case conversions on the selections, else on the word at each cursor.
function convertCase(cm, kind) {
  const doc = cm.getDoc(), convert = (text, from) => kind === 'upper' ? text.toUpperCase() : kind === 'lower' ? text.toLowerCase()
    : kind === 'capitalize' ? capitalizeText(text, doc.getRange(CodeMirror.Pos(doc.firstLine(), 0), from)) : nameCase(text, kind);
  if (cm.somethingSelected()) {
    const ranges = cm.listSelections(), texts = ranges.map(r => convert(cm.getRange(r.from(), r.to()), r.from()));
    return own(cm, () => cm.replaceSelections(texts, 'around', 'convert'));   // a block (column.js) stays a block
  }
  const heads = cm.listSelections().map(r => r.head);
  const words = heads.map(h => cm.findWordAt(h)).filter(w => CodeMirror.cmpPos(w.anchor, w.head) !== 0);
  if (!words.length) return;
  cm.operation(() => {
    for (const w of [...words].sort((a, b) => CodeMirror.cmpPos(b.anchor, a.anchor))) {
      const from = w.anchor, to = w.head;
      cm.replaceRange(convert(cm.getRange(from, to), from), from, to, 'convert');
    }
    cm.setSelections(heads.map(h => {
      const p = CodeMirror.Pos(h.line, Math.min(h.ch, cm.getLine(h.line).length));
      return { anchor: p, head: p };
    }));
  });
}

// The action kind `convert` (runLanguage, actions.js).
function runConvert(pane, kind) {
  const cm = pane.cm, doc = pane.active.doc;
  if (kind === 'trimTrailing') {
    const rule = trimRule(doc);
    if (rule.mode === false) return toast(`${languageTitle(doc)} keeps the whitespace at line ends (its trimTrailing is false).`);
    return own(cm, () => trimLines(cm, rule.keep, convertLines(cm)));
  }
  if (kind === 'tabsToSpaces' || kind === 'spacesToTabs') {
    const stops = stopsOf(cm), change = kind === 'tabsToSpaces' ? t => tabsToSpacesLine(t, stops) : t => spacesToTabsLine(t, stops);
    return own(cm, () => changeLines(cm, convertLines(cm), change));
  }
  if (['upper', 'lower', 'capitalize', ...Object.keys(NAME_CASES)].includes(kind)) return convertCase(cm, kind);
}

// Before a save: the whole file without its trailing whitespace, when the setting (or the language) says so. Its
// own undo step, so Ctrl+Z after the save gives the spaces back. A read-only tab is never changed.
function trimOnSave(doc) {
  const rule = trimRule(doc);
  if (!(rule.mode === true || rule.mode === 'setting' && setting('trimTrailing'))) return;
  if (!tabsOf(doc).some(editable)) return;
  if (!doc.cmDoc) {   // never in an editor: the text itself
    doc.text = doc.text.split('\n').map(l => {
      const cr = l.endsWith('\r') ? '\r' : '', body = cr ? l.slice(0, -1) : l;
      return body.slice(0, trimmedLength(body, rule.keep)) + cr;
    }).join('\n');
    return;
  }
  // In the editor that shows it: one operation, one undo step. Else on the document ("+": its edits are one step).
  const cm = panes.find(p => p.cm && p.active?.doc === doc)?.cm;
  const target = cm ? cm.getDoc() : doc.cmDoc;
  const run = () => {
    for (let l = target.firstLine(); l <= target.lastLine(); l++) {
      const text = target.getLine(l), length = trimmedLength(text, rule.keep);
      if (length < text.length) target.replaceRange('', CodeMirror.Pos(l, length), CodeMirror.Pos(l, text.length), '+trim');
    }
  };
  if (cm) own(cm, run); else run();
}

// ---------- Pretty print (3.3) ----------
// The action kind `format` (json, xml): the selection, else the whole file, formatted by the host (Formatters.cs),
// indented one indent step per level (a tab where the language uses tabs). JSON with comments: the host is asked
// whether to keep them. A text that does not parse is left alone; the message says where, the cursor goes there.
async function runFormat(pane, kind, language) {
  const cm = pane.cm;
  if (cm.somethingSelected() && cm.listSelections().length > 1) return toast('Format works on one selection.');
  let from = cm.getCursor('from'), to = cm.getCursor('to');
  // Without a selection: the whole file, or for another language inside it (its bar, its Format menu) its block.
  if (!cm.somethingSelected() && language && language !== languageOf(pane.active.doc)) {
    let a = from.line, b = from.line;
    while (a > cm.firstLine() && lineLanguage(cm, a - 1) === language) a--;
    while (b < cm.lastLine() && lineLanguage(cm, b + 1) === language) b++;
    from = CodeMirror.Pos(a, 0);
    to = CodeMirror.Pos(b, cm.getLine(b).length);
  } else if (!cm.somethingSelected()) {
    from = CodeMirror.Pos(cm.firstLine(), 0);
    to = CodeMirror.Pos(cm.lastLine(), cm.getLine(cm.lastLine()).length);
  }
  const whole = from.line === cm.firstLine() && from.ch === 0 && to.line === cm.lastLine() && to.ch === cm.getLine(to.line).length && !cm.somethingSelected();
  const text = cm.getRange(from, to);
  if (!text.trim()) return;
  const stops = stopsOf(cm), indent = stops.useTabs ? '\t' : ' '.repeat(stops.indent);
  let result = await host('format', { kind, text, indent, comments: 'ask' });
  if (result.ask) {
    const answer = await host('askKeepComments');
    if (!answer) return;
    result = await host('format', { kind, text, indent, comments: answer });
  }
  if (cm.getRange(from, to) !== text) return toast('The text changed meanwhile; nothing was formatted.');
  const name = kind.toUpperCase();
  if (result.error) {
    const at = CodeMirror.Pos(from.line + result.line - 1, (result.line === 1 ? from.ch : 0) + Math.max(0, result.column - 1));
    cm.setCursor(at);
    cm.scrollIntoView(at, 80);
    cm.focus();
    return toast(`${name} not formatted: ${result.error} (line ${at.line + 1}, column ${at.ch + 1}).`);
  }
  let out = result.text;
  if (whole) {
    if (text.endsWith('\n')) out += '\n';
  } else {   // the lines get the indentation the selection started at (the first one: what it lacks of it)
    const base = cm.getLine(from.line).match(/^[ \t]*/)[0], first = base.slice(Math.min(from.ch, base.length));
    out = out.split('\n').map((l, i) => !l ? l : i ? base + l : first + l).join('\n');
  }
  if (out === text) return toast(`The ${name} was formatted already.`);
  const line = cm.getCursor().line;
  cm.operation(() => {
    cm.replaceRange(out, from, to, 'format');
    if (whole) cm.setCursor(CodeMirror.Pos(Math.min(line, cm.lastLine()), 0));
    else cm.setSelection(from, cm.posFromIndex(cm.indexFromPos(from) + out.length));
  });
}
