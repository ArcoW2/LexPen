'use strict';
// The editor's gutter, left to right: line numbers, bookmarks (bookmarks.js), change markers (lines changed
// since the file was saved), git markers (lines changed since the last commit; a click shows the old text
// and can put it back) and fold markers (headings and fenced code in markdown, braces or indentation in
// code). Each column can be switched off: View > Gutter. Loaded with the editor.

const CHANGE_GUTTER = 'mm-changes', GIT_GUTTER = 'mm-git', FOLD_GUTTER = 'CodeMirror-foldgutter';
const OUTLINE_GUTTER = 'mm-outline-gutter';   // the outline's bullets, while the outline is open (app.js)
const GUTTER_COLUMNS = [
  ['lineNumbers', 'Line numbers'], ['bookmarks', 'Bookmarks'], ['changes', 'Change markers (not saved)'],
  ['git', 'Git markers (since the last commit)'], ['folds', 'Fold markers'],
];
const gutterOn = name => setting('gutter.' + name) !== false;

// The line diff (diffLines) is in diff.js, shared with the compare.

// ---------- Markers ----------
const linesOf = text => text.replace(/\r\n?/g, '\n').split('\n');

// One marker per changed line of the editor; a removal is a mark on the line after it.
function paintHunks(cm, gutter, hunks, title) {
  cm.clearGutter(gutter);
  for (const h of hunks) {
    const kind = h.bFrom === h.bTo ? 'removed' : h.aFrom === h.aTo ? 'added' : 'changed';
    const lines = kind === 'removed' ? [Math.min(h.bFrom, cm.lastLine())] : Array.from({ length: h.bTo - h.bFrom }, (_, n) => h.bFrom + n);
    for (const line of lines) {
      const el = document.createElement('span');
      el.className = `mm-mark-${kind}`;
      el.dataset.gutter = gutter;   // CodeMirror does not put the mark inside its gutter column: app.css picks the colour by this
      el.title = title(kind, h);
      cm.setGutterMarker(line, gutter, el);
    }
  }
}

// The text the file had when it was last read or saved: doc.savedText (see app.js).
function paintChanges(pane) {
  const cm = pane.cm, doc = pane.active?.doc;
  if (!cm || !doc) return;
  // The hunks also feed the overview ruler (overview.js), which can show them while the gutter column is off.
  const wanted = gutterOn('changes') || overviewKind('changes');
  pane.changeHunks = wanted && doc.savedText !== undefined ? diffLines(linesOf(doc.savedText), linesOf(cm.getValue())) : [];
  if (!gutterOn('changes') || doc.savedText === undefined) return cm.clearGutter(CHANGE_GUTTER);
  const hunks = pane.changeHunks;
  paintHunks(cm, CHANGE_GUTTER, hunks, kind => ({ added: 'Added', changed: 'Changed', removed: 'Removed' })[kind] + ' since the last save');
}

// The file at git HEAD: asked from the host when the file is first shown, after a save and when git changes. First
// which version the commit holds (gitHeadId, small): the text itself only when that is another one than the one
// here, so a large file is not sent again on every change in the repository.
async function loadGitHead(doc) {
  if (!doc.path) return doc.gitHead = null;
  // Asked again while a load is under way (a save and a change in git at once): the one load answers both.
  if (doc.gitHeadLoading) return doc.gitHeadLoading;
  doc.gitHeadLoading = loadGitHeadNow(doc);
  try { return await doc.gitHeadLoading; } finally { doc.gitHeadLoading = null; }
}

async function loadGitHeadNow(doc) {
  const id = await host('gitHeadId', { path: doc.path }).catch(() => null);
  if (!id) { doc.gitHeadId = null; return doc.gitHead = null; }
  if (id === doc.gitHeadId && doc.gitHead !== undefined) return doc.gitHead;
  doc.gitHead = await host('gitHead', { path: doc.path }).catch(() => null);
  doc.gitHeadId = doc.gitHead == null ? null : id;
  return doc.gitHead;
}

// A commit is usually made outside LexPen: back in the window, the files on screen ask for HEAD again.
addEventListener('focus', async () => {
  const shown = [...new Set(panes.filter(p => p.cm && p.active && p.el.dataset.mode !== 'preview').map(p => p.active.doc))];
  for (const doc of shown) await loadGitHead(doc);
  for (const pane of panes) if (pane.cm && pane.active) paintGit(pane);
});

function paintGit(pane) {
  const cm = pane.cm, doc = pane.active?.doc;
  if (!cm || !doc) return;
  pane.gitHunks = (gutterOn('git') || overviewKind('git')) && doc.gitHead != null ? diffLines(linesOf(doc.gitHead), linesOf(cm.getValue())) : [];
  scheduleOverview(pane);   // overview.js
  if (!gutterOn('git') || doc.gitHead == null) return cm.clearGutter(GIT_GUTTER);
  paintHunks(cm, GIT_GUTTER, pane.gitHunks, kind => ({ added: 'Added', changed: 'Changed', removed: 'Removed' })[kind] +
    ' since the last commit (click: the old text)');
}

function paintGutter(pane) {
  paintChanges(pane);
  paintGit(pane);   // also draws the overview ruler again
  paintHighlightLines(pane);
}

// The lines a highlight is on (highlights.js), with the setting gutter.highlights: the gutter's last few pixels in the
// highlight colour, the full line height (app.css .mm-hl-gutter, on the gutter's background).
function paintHighlightLines(pane) {
  const cm = pane.cm, doc = pane.active?.doc;
  if (!cm) return;
  const lines = new Set();
  if (doc?.hls && gutterOn('highlights') && typeof hlRange === 'function')
    for (const h of doc.hls.list) {
      const r = h.state !== 'detached' && hlRange(doc, h);
      if (r) for (let l = r.from[0]; l <= Math.min(r.to[0], cm.lastLine()); l++) lines.add(l);
    }
  cm.operation(() => {
    for (const h of pane.hlGutter ?? []) cm.removeLineClass(h, 'gutter', 'mm-hl-gutter');
    pane.hlGutter = [...lines].map(l => cm.addLineClass(l, 'gutter', 'mm-hl-gutter'));
  });
}

function scheduleGutter(pane) {
  clearTimeout(pane.gutterTimer);
  pane.gutterTimer = setTimeout(() => paintGutter(pane), 300);
}

// ---------- The old text of a git change ----------
function showGitChange(pane, line) {
  const h = pane.gitHunks?.find(h => h.bFrom === h.bTo ? Math.min(h.bFrom, pane.cm.lastLine()) === line : line >= h.bFrom && line < h.bTo);
  if (!h) return;
  closeGitChange();
  const old = linesOf(pane.active.doc.gitHead).slice(h.aFrom, h.aTo);
  const box = document.createElement('div');
  box.className = 'mm-git-change';
  box.innerHTML = '<div class="mm-git-head"></div><pre></pre><button>Revert this block</button>';
  box.querySelector('.mm-git-head').textContent = old.length
    ? `In the last commit (line ${h.aFrom + 1}${old.length > 1 ? '-' + h.aTo : ''}):` : 'Not in the last commit (added since).';
  box.querySelector('pre').textContent = old.join('\n');
  if (!old.length) box.querySelector('pre').remove();
  box.querySelector('button').disabled = pane.cm.getOption('readOnly');
  box.querySelector('button').addEventListener('click', () => {
    revertHunk(pane.cm, h, old);
    closeGitChange();
  });
  document.body.append(box);
  const at = pane.cm.charCoords({ line, ch: 0 }, 'window');
  box.style.left = Math.min(at.left, innerWidth - box.offsetWidth - 8) + 'px';
  box.style.top = Math.min(at.bottom + 2, innerHeight - box.offsetHeight - 8) + 'px';
}

// Puts the lines of the last commit back in place of the hunk.
function revertHunk(cm, h, old) {
  const last = cm.lastLine();
  if (h.bFrom === h.bTo) {
    // Lines were removed: insert them before line bFrom (or after the last line).
    if (h.bFrom > last) cm.replaceRange('\n' + old.join('\n'), CodeMirror.Pos(last));
    else cm.replaceRange(old.join('\n') + '\n', CodeMirror.Pos(h.bFrom, 0));
  } else if (!old.length) {
    // Lines were added: take them out with their line break (at the end: the one before them).
    if (h.bTo <= last) cm.replaceRange('', CodeMirror.Pos(h.bFrom, 0), CodeMirror.Pos(h.bTo, 0));
    else if (h.bFrom > 0) cm.replaceRange('', CodeMirror.Pos(h.bFrom - 1, cm.getLine(h.bFrom - 1).length), CodeMirror.Pos(last));
    else cm.setValue('');
  } else cm.replaceRange(old.join('\n'), CodeMirror.Pos(h.bFrom, 0), CodeMirror.Pos(h.bTo - 1, cm.getLine(h.bTo - 1).length));
}

function closeGitChange() {
  document.querySelector('.mm-git-change')?.remove();
}
addEventListener('mousedown', e => { if (!e.target.closest('.mm-git-change, .' + GIT_GUTTER)) closeGitChange(); }, true);
addEventListener('keydown', e => { if (e.key === 'Escape') closeGitChange(); }, true);

// ---------- Folding ----------
// A fenced code block folds from its opening fence: a fence line is an opening one when an even number
// of fences come before it.
function fenceFold(cm, start) {
  const fence = /^\s*(```|~~~)/, text = cm.getLine(start.line);
  if (!fence.test(text)) return;
  let before = 0;
  for (let l = 0; l < start.line; l++) if (fence.test(cm.getLine(l))) before++;
  if (before % 2) return;
  for (let l = start.line + 1; l <= cm.lastLine(); l++)
    if (fence.test(cm.getLine(l))) return { from: CodeMirror.Pos(start.line, text.length), to: CodeMirror.Pos(l, cm.getLine(l).length) };
}

// Folding as the language pack says ("fold": markdown, brace, indent or none).
function foldFinder(doc) {
  const fold = doc.language ? packOf(doc)?.fold : 'markdown';
  return fold === 'markdown' ? CodeMirror.fold.combine(fenceFold, CodeMirror.fold.markdown)
    : fold === 'indent' ? CodeMirror.fold.indent : fold === 'brace' ? CodeMirror.fold.brace : () => undefined;
}

// ---------- The columns ----------
// Line numbers: absolute, or relative to the cursor line (which shows its own number). "Every 10": the number on
// every tenth line, a dash halfway, a small dot on the others; relative, counted from the cursor line.
function lineNumberFormatter(pane) {
  const tens = setting('lineNumbers') === 'tens', relative = setting('lineNumberCount') === 'relative';
  const at = pane.numbersAt = relative ? pane.cm.getCursor().line + 1 : 0;
  return n => {
    if (relative && n === at) return String(n);
    const shown = relative ? Math.abs(n - at) : n;
    return !tens || shown % 10 === 0 ? String(shown) : shown % 5 === 0 ? '-' : '\u00b7';
  };
}

// Relative numbers follow the cursor: again when it moved to another line (from cursorActivity in app.js).
// The cursor line's own number is in italics, so it does not read as a distance.
function updateRelativeNumbers(pane) {
  const cm = pane.cm;
  if (!cm) return;
  const relative = setting('lineNumberCount') === 'relative' && setting('lineNumbers') !== 'none';
  const line = relative ? cm.getLineHandle(cm.getCursor().line) : null;
  if (pane.numberLine !== line) {
    if (pane.numberLine) cm.removeLineClass(pane.numberLine, 'gutter', 'mm-cursor-number');
    if (line) cm.addLineClass(line, 'gutter', 'mm-cursor-number');
    pane.numberLine = line;
  }
  if (relative && pane.numbersAt !== cm.getCursor().line + 1) cm.setOption('lineNumberFormatter', lineNumberFormatter(pane));
}

// The cursors' lines in the gutter (setting gutter.cursor), in the colour the ruler shows the cursors' columns in:
// again when a cursor moved (from cursorActivity in app.js). Their line numbers are bold in any case (mm-cursor-bold):
// the gutter's backgrounds mark other things too (changes, find, occurrences).
function markCursorLines(pane) {
  const cm = pane.cm;
  if (!cm) return;
  const lines = [...new Set(cm.listSelections().map(r => r.head.line))].map(l => cm.getLineHandle(l)), on = gutterOn('cursor');
  const had = pane.cursorLines ?? [];
  if (had.length === lines.length && had.every((h, i) => h === lines[i]) && pane.cursorGutterOn === on) return;
  cm.operation(() => {
    for (const h of had) { cm.removeLineClass(h, 'gutter', 'mm-cursor-gutter'); cm.removeLineClass(h, 'gutter', 'mm-cursor-bold'); }
    for (const h of lines) { cm.addLineClass(h, 'gutter', 'mm-cursor-bold'); if (on) cm.addLineClass(h, 'gutter', 'mm-cursor-gutter'); }
  });
  pane.cursorLines = lines;
  pane.cursorGutterOn = on;
}

// Applies View > Gutter to the pane's editor for its file.
function setupGutter(pane) {
  const cm = pane.cm, doc = pane.active?.doc;
  if (!cm || !doc) return;
  const numbers = setting('lineNumbers');   // none | tens | all
  const gutters = [
    ...(numbers !== 'none' ? ['CodeMirror-linenumbers'] : []),
    ...(outlineServed(pane) && hasOutline(doc) ? [OUTLINE_GUTTER] : []),
    ...(gutterOn('bookmarks') ? [BM_GUTTER] : []),
    ...(gutterOn('changes') ? [CHANGE_GUTTER] : []), ...(gutterOn('git') ? [GIT_GUTTER] : []), ...(gutterOn('folds') ? [FOLD_GUTTER] : []),
  ];
  // Only when something changed: setting the columns or the fold finder makes the editor measure every line
  // again, which a switch to or from the preview does not need.
  const key = [gutters.join(), numbers, setting('lineNumberCount'), doc.language ?? 'markdown', languagesVersion].join('|');   // the fold finder follows the language
  if (pane.gutterKey !== key) {
    pane.gutterKey = key;
    cm.setOption('lineNumbers', numbers !== 'none');
    cm.setOption('lineNumberFormatter', lineNumberFormatter(pane));
    cm.setOption('gutters', gutters);
    cm.setOption('foldGutter', gutterOn('folds') && { rangeFinder: foldFinder(doc) });
  }
  updateRelativeNumbers(pane);   // another file: another cursor line
  markCursorLines(pane);
  paintGutter(pane);
}

