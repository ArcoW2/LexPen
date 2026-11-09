'use strict';
// Find (and replace) inside one pane: the editor or the preview, whichever the user works in.
// Loaded on the first find (see findKey in app.js), so startup does not pay for it.
// Per pane by default; with "One search for both panes" (More menu) both panes share one search.

const newFind = () => ({ query: '', replace: '', case: false, word: false, regex: false });
const finds = [newFind(), newFind()];
const findOf = pane => setting('findShared') ? finds[0] : finds[pane.index];
const FIND_TYPE_LINES = 5000, FIND_TYPE_DELAY = 150;   // a file this long: the search waits for a pause in typing
const FIND_LIMIT = 1000000;   // matches counted / highlighted (all of them in practice); more is shown as "1000000+"

// ---------- The bar ----------
const chevron = d => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
// docs/plans/executed/PLAN-find-bar-replace.md: a label before each field (one width, so the fields line up), a Replace button
// that opens the replace row, and the replace row's own way through the file: Replace all, Replace, Skip, Previous.
const REPLACE_TIP = withKey('Replace: the replace row', 'replace');
const FIND_HTML =
  '<div class="mm-find-row">' +
  '<span class="mm-find-label">Find</span>' +
  '<input class="mm-find-input" type="text" spellcheck="false" title="Enter / F3: next; Shift+Enter / Shift+F3: previous; Esc: close. Codes: ^p line break, ^t tab, ... (the ? button)">' +
  // The count, a button: the same search in the Search pane, on this file (findToSearch); a divider before the switches.
  '<button data-find="toSearch" class="mm-find-tosearch" title="Search this file in the Search pane, with these switches (every match in a list)">' +
  '<span class="mm-find-count"></span>' + chevron('M2.5 3.5h11v9h-11zM9.5 3.5v9M4.5 6l1.5 2-1.5 2') + '</button><span class="mm-find-div"></span>' +
  // A CSV (csvfind.js): in which column, and in which order.
  '<select class="mm-find-csvcol" title="Find in this column, or in all columns" hidden></select>' +
  '<button data-find="csvOrder" class="mm-find-csvorder" hidden></button>' +
  '<button data-find="case" class="mm-find-opt" title="Match case">Aa</button>' +
  '<button data-find="word" class="mm-find-opt" title="Whole word only">W</button>' +
  '<button data-find="regex" class="mm-find-opt" title="Regular expression (then the ^ codes do not apply)">.*</button>' +
  `<button data-find="prev" title="${withKey('Previous', 'findPrevious')}">` + chevron('M4 10l4-4 4 4') + '</button>' +
  `<button data-find="next" title="${withKey('Next', 'findNext')}">` + chevron('M4 6l4 4 4-4') + '</button>' +
  // Lit while F3 comes here, dimmed while it goes to the Search pane (app.js f3Take; plan 47); a click: F3 here.
  '<button data-find="f3" class="mm-find-f3" title="F3 / Shift+F3: the next / previous match here (a click: F3 here)">F3</button>' +
  `<button class="mm-find-toggle" data-find="replaceRow" title="${REPLACE_TIP}">Replace</button>` +
  '<button data-find="codes" class="mm-find-codes" title="The codes of the find and replace fields">?</button>' +
  '<button data-find="close" class="mm-find-close" title="Close (Esc)"></button>' +
  '</div><div class="mm-find-row mm-find-replace" hidden>' +
  '<span class="mm-find-label">Replace with</span>' +
  '<input class="mm-find-with" type="text" spellcheck="false" title="Enter: Replace; Shift+Enter: Previous. ^p a line break, ^t a tab; with a regular expression \\n, \\t, $1, $& (the ? button)">' +
  '<button data-find="replaceAll" title="All matches in the selection or the file, one undo step (Alt+A)">Replace all</button>' +
  '<button data-find="replaceOne" title="This match, then the next. With no match chosen yet: first to the next one, to see it (Enter)">Replace</button>' +
  `<button data-find="skip" title="${withKey('Skip: the next match, this one unchanged', 'findNext')}">Skip</button>` +
  `<button data-find="prev" title="${withKey('Previous: back one match, to replace one skipped', 'findPrevious')}">Previous</button>` +
  '</div>';

function findBar(pane) {
  if (pane.find) return pane.find;
  const el = pane.el.querySelector('.mm-find');
  el.innerHTML = FIND_HTML;
  const bar = pane.find = {
    el, input: el.querySelector('.mm-find-input'), with: el.querySelector('.mm-find-with'),
    count: el.querySelector('.mm-find-count'), replaceRow: el.querySelector('.mm-find-replace'),
    toggle: el.querySelector('.mm-find-toggle'),
    csvColEl: el.querySelector('.mm-find-csvcol'), csvOrderEl: el.querySelector('.mm-find-csvorder'),
    target: null, origin: null, at: null, lap: null, wrapped: false,
    scope: null,   // the selection the bar finds in: { doc, marks, id } (3.3), else the whole file
  };
  // Which part of the pane the search works on: the last one that had the focus.
  pane.el.addEventListener('focusin', e => {
    if (pane.editorEl.contains(e.target)) bar.target = 'editor';
    else if (pane.previewEl.contains(e.target)) bar.target = 'preview';
  });
  el.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });   // keep the focus where it is
  el.addEventListener('click', e => {
    const action = e.target.closest('[data-find]')?.dataset.find;
    if (!action) return;
    const f = findOf(pane);
    if (action === 'case' || action === 'word' || action === 'regex') {
      f[action] = !f[action];
      syncBar(pane);
      refresh(pane, true);
    } else if (action === 'csvOrder') {   // a CSV: by row / by column (csvfind.js)
      bar.csvOrder = bar.csvOrder === 'col' ? 'row' : 'col';
      syncBar(pane);
      refresh(pane, true);
    } else if (action === 'replaceRow') showReplace(pane, bar.replaceRow.hidden);
    else if (action === 'close') closeFind(pane);
    else if (action === 'f3') f3Take('find');
    else if (action === 'next') { f3Take('find'); findGo(pane, 1); }
    else if (action === 'prev') { f3Take('find'); findGo(pane, -1); }
    else if (action === 'skip') { f3Take('find'); findGo(pane, 1); }
    else if (action === 'replaceOne') replaceOne(pane);
    else if (action === 'replaceAll') replaceAll(pane);
    else if (action === 'toSearch') findToSearch(pane);
    else if (action === 'codes') showSearchCodes(e.target.closest('button'), bar.replaceRow.hidden ? bar.input : bar.with);
  });
  // Alt+A: Replace all, only while the bar has the focus (the menus' Alt letters elsewhere stay as they are).
  el.addEventListener('keydown', e => {
    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'a' && !bar.replaceRow.hidden) {
      e.preventDefault();
      e.stopPropagation();
      replaceAll(pane);
    }
  });
  bar.csvColEl.addEventListener('change', () => { bar.csvCol = bar.csvColEl.value; syncBar(pane); refresh(pane, true); });
  // As you type: the first match from where the search started. In a large file after a short pause in typing, so
  // the letters keep coming while a first letter is found on thousands of lines.
  bar.input.addEventListener('input', () => {
    findOf(pane).query = bar.input.value;
    f3Take('find');   // typed in: F3 goes here (plan 47)
    clearTimeout(pane.findTypeTimer);
    if ((pane.cm?.lineCount() ?? 0) < FIND_TYPE_LINES) return refresh(pane, true);
    pane.findTypeTimer = setTimeout(() => refresh(pane, true), FIND_TYPE_DELAY);
  });
  bar.with.addEventListener('input', () => findOf(pane).replace = bar.with.value);
  // The history (history.js): an entry in the field, a search with its switches; `typed`: the text as typed, the
  // switches as they are.
  attachHistory(bar.input, 'find', (entry, typed) => {
    const f = findOf(pane);
    bar.input.value = f.query = entry.text;
    if (!typed) for (const k of ['case', 'word', 'regex']) f[k] = !!entry[k];
    syncBar(pane);
    refresh(pane, true);
  });
  attachHistory(bar.with, 'replace', entry => { bar.with.value = findOf(pane).replace = entry.text; });
  for (const input of [bar.input, bar.with]) input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(pane, true); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      f3Take('find');
      if (input === bar.with && !e.shiftKey) replaceOne(pane); else findGo(pane, e.shiftKey ? -1 : 1);
    }
    // Tab from Find to Replace with (the row open), Shift+Tab back; else Tab goes on to the buttons.
    else if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      const to = input === bar.input && !e.shiftKey && !bar.replaceRow.hidden ? bar.with
        : input === bar.with && e.shiftKey ? bar.input : null;
      if (to) { e.preventDefault(); to.focus(); to.select(); }
    }
  });
  return bar;
}

// The bar shows this pane's search (or the shared one).
function syncBar(pane) {
  const bar = pane.find, f = findOf(pane);
  if (bar.input.value !== f.query) bar.input.value = f.query;
  if (bar.with.value !== f.replace) bar.with.value = f.replace;
  for (const b of bar.el.querySelectorAll('.mm-find-opt')) b.classList.toggle('mm-on', f[b.dataset.find]);
  csvSyncFindBar(pane);   // a CSV: its column list and order (csvfind.js)
}

function showReplace(pane, on) {
  const bar = pane.find;
  bar.replaceRow.hidden = !on;
  bar.toggle.classList.toggle('mm-on', on);   // shown pressed while the row is open
  pane.cm?.refresh();
}

// In the preview the replace row cannot work (the editor's text is what changes): the Replace button is disabled.
function syncReplaceButton(pane) {
  const bar = pane.find, editor = findTarget(pane) === 'editor', csv = csvReplaceBlocked(pane);
  bar.toggle.disabled = !editor || csv;
  bar.toggle.title = csv ? 'Replace works with All columns, By row' : editor ? REPLACE_TIP : 'Replace works in the editor';
  if ((!editor || csv) && !bar.replaceRow.hidden) showReplace(pane, false);
}

// ---------- The scope: the selection or the file (3.3) ----------
// Taken when the bar opens (Ctrl+F, Ctrl+R): the selections of the editor (several with multiple cursors, one per line
// in a column block), each marked, so they move with the text as replacements change its length. None: the file.
let scopeIds = 0;
function takeScope(pane) {
  const bar = pane.find, cm = pane.cm;
  if (findTarget(pane) !== 'editor' || !cm) return clearScope(pane);
  const ranges = cm.listSelections().map(r => [r.from(), r.to()]).filter(([a, b]) => CodeMirror.cmpPos(a, b) < 0);
  // The current match selected (after a find): not a new scope, the one there was stays.
  const current = pane.findCurrent?.find();
  if (ranges.length === 1 && current && !CodeMirror.cmpPos(ranges[0][0], current.from) && !CodeMirror.cmpPos(ranges[0][1], current.to)) return;
  clearScope(pane);
  if (!ranges.length) return;
  bar.scope = { doc: cm.getDoc(), id: ++scopeIds, marks: ranges.map(([a, b]) => cm.markText(a, b,
    { className: 'mm-find-scope', inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false })) };
  cm.setCursor(ranges[0][0]);   // the matches are found from the scope's start, its text not selected
}

function clearScope(pane) {
  const bar = pane.find;
  for (const m of bar?.scope?.marks ?? []) m.clear();
  if (bar) bar.scope = null;
}

// The scope's parts as [start, end] in the text, in order; null without a scope (or in another document).
function scopeParts(pane) {
  const scope = pane.find?.scope, cm = pane.cm;
  if (!scope || !cm || scope.doc !== cm.getDoc()) return null;
  return scope.marks.map(m => m.find()).filter(Boolean)
    .map(({ from, to }) => [cm.indexFromPos(from), cm.indexFromPos(to)]).sort((a, b) => a[0] - b[0]);
}

// The part of the pane to search: where the focus is, else where it was, else by the tab's mode.
function findTarget(pane) {
  const bar = pane.find, active = document.activeElement, mode = pane.active?.mode;
  if (pane.editorEl.contains(active)) bar.target = 'editor';
  else if (pane.previewEl.contains(active)) bar.target = 'preview';
  if (mode === 'edit') return 'editor';
  if (mode === 'preview') return 'preview';
  return bar.target || 'editor';
}

// ---------- Entry points (from findKey in app.js) ----------
// open: show the bar and focus it; with a selection in the editor, the bar finds only within it (3.3). replace: the
// same, with the replace row. replaceAll: Replace all with the bar shown, else as replace.
// next / prev: the next match; with an empty search, or a hidden bar in per-pane mode: open.
function findCommand(pane, action) {
  if (!pane?.active) return;
  const bar = findBar(pane), f = findOf(pane), shown = !bar.el.hidden;
  const shared = setting('findShared');
  syncBar(pane);   // shared: the other pane may have changed the search
  if ((action === 'next' || action === 'prev') && f.query && (shown || shared)) {
    if (!shown) showBar(pane, false);
    return findGo(pane, action === 'next' ? 1 : -1);
  }
  if (action === 'replaceAll' && shown && !bar.replaceRow.hidden) return replaceAll(pane);
  showBar(pane, true);
  if (action === 'replace' || action === 'replaceAll') showReplace(pane, findTarget(pane) === 'editor');
}

function showBar(pane, focus) {
  const bar = pane.find, f = findOf(pane);
  // The editor's selection is the scope, not the search; the preview's (one line) still fills the field.
  if (focus && findTarget(pane) === 'editor') takeScope(pane);
  const selected = focus && findTarget(pane) === 'preview' && selectedText(pane);
  if (selected) f.query = selected;
  bar.el.hidden = false;
  bar.origin = bar.lap = bar.csvOrigin = null;
  if (focus) f3Take('find'); else showF3();   // opened to type in: F3 here (plan 47)
  syncBar(pane);
  syncReplaceButton(pane);
  pane.cm?.refresh();
  if (focus) {
    bar.input.focus();
    bar.input.select();
  }
  refresh(pane, false);
}

// The count clicked: the same search (its text, case, whole word, regular expression) in the Search pane on this file, every
// match in a list there; the bar stays as it is.
function findToSearch(pane) {
  const f = findOf(pane);
  if (!f.query) return;
  Object.assign(searchOptions, { case: !!f.case, word: !!f.word, regex: !!f.regex });
  toSearch({ kind: 'options', options: { ...searchOptions } });
  searchUi.input.value = f.query;
  searchUi.scope.value = 'file';
  keepLayout('searchScope', 'file');
  if (!dockPaneVisible('search')) searchReturn = dockSnapshot('search');   // Esc there: the area as it was (app.js)
  showDockPane('search');
  runSearch();
}

function closeFind(pane, focusBack) {
  const bar = pane.find;
  if (!bar || bar.el.hidden) return;
  clearTimeout(pane.findTypeTimer);   // a search still waiting for the pause in typing
  bar.el.hidden = true;
  clearMarks(pane);
  clearScope(pane);   // closing the bar ends the scope
  pane.cm?.refresh();
  if (focusBack) {
    if (findTarget(pane) === 'editor' && pane.cm) pane.cm.focus();
    else if (pane.active?.pdf?.frame?.isConnected) pane.active.pdf.frame.focus();   // a PDF: its frame
    else pane.previewEl.focus({ preventScroll: true });
  }
}

// A one-line selection in the part being searched.
function selectedText(pane) {
  let text = '';
  if (findTarget(pane) === 'editor') text = pane.cm?.getSelection() || '';
  else if (pdfFinding(pane)) return pdfSelectedText(pane);   // the selection in its frame (pdffind.js)
  else {
    const sel = getSelection();
    if (sel.rangeCount && pane.previewEl.contains(sel.anchorNode)) text = sel.toString();
  }
  return text && !text.includes('\n') ? text : '';
}

// ---------- Matching ----------
function findRegex(pane) {
  const f = findOf(pane);
  if (!f.query) return null;
  try { return new RegExp(searchPattern(f.query, f), f.case ? 'g' : 'gi'); }
  catch (e) { return e; }
}

function matchesIn(text, regex) {
  const found = [];
  for (const m of text.matchAll(regex)) {
    if (!m[0].length) continue;
    found.push([m.index, m.index + m[0].length]);
    if (found.length >= FIND_LIMIT) break;
  }
  return found;
}

// Recounts and re-marks. `moving`: the search text or options changed, so go to the first match from
// where the search started.
function refresh(pane, moving) {
  const bar = pane.find, regex = findRegex(pane);
  clearMarks(pane);
  if (!regex) return bar.count.textContent = '';
  if (regex instanceof Error) return bar.count.textContent = 'Not valid';
  const where = findTarget(pane);
  syncReplaceButton(pane);
  if (csvFinding(pane)) return csvRefresh(pane, regex, where, moving);   // a CSV: by cell (csvfind.js)
  if (pdfFinding(pane)) return pdfFindRefresh(pane, regex, moving);   // a PDF: on its pages' text (pdffind.js)
  const matches = where === 'editor' ? editorMatches(pane, regex) : previewMatches(pane, regex);
  if (where === 'editor' && pane.cm) scheduleFindLines(pane, regex);   // the gutter and the overview ruler, after this key
  mark(pane, where, regex, matches);
  if (moving && matches.length) findGo(pane, 1, true);
  else showCount(pane, matches, null);
}

function showCount(pane, matches, current) {
  const total = matches.length >= FIND_LIMIT ? FIND_LIMIT + '+' : matches.length;
  const within = findTarget(pane) === 'editor' && scopeParts(pane) ? ' in the selection' : '';
  pane.find.count.textContent = (!matches.length ? 'No matches' : current === null ? `${total} found` : `${current + 1} of ${total}`) + within;
  pane.find.count.classList.toggle('mm-none', !matches.length);
}

// To the next (dir 1) or previous (-1) match, from the cursor; at the end it wraps around.
// Not named go: that is back / forward in app.js, and a second global function of that name replaced it.
// `fromOrigin`: as you type, from where the search started instead.
function findGo(pane, dir, fromOrigin) {
  const bar = pane.find, regex = findRegex(pane);
  if (!regex || regex instanceof Error) return;
  const where = findTarget(pane);
  if (!fromOrigin) recordFind(findOf(pane).query, findOf(pane));   // a search done, not one typed (history.js)
  if (typeof recordMacroFind === 'function') recordMacroFind(findOf(pane).query, findOf(pane), dir < 0, fromOrigin);   // macros.js
  if (bar.marked !== where + pane.active?.id) refresh(pane, false);   // another tab or mode since the marks
  if (csvFinding(pane)) return csvGo(pane, regex, where, dir, fromOrigin);   // a CSV: by cell (csvfind.js)
  if (pdfFinding(pane)) return pdfFindGo(pane, regex, dir, fromOrigin);   // a PDF (pdffind.js)
  if (where === 'editor') return goEditor(pane, regex, dir, fromOrigin);
  goPreview(pane, regex, dir, fromOrigin);
}

// ---------- In the editor ----------
// The matches are found once per text and search: a keystroke asks for them for the count, the marks and the move.
// With a scope (3.3): the matches within each of its parts, a match never across two.
function editorMatches(pane, regex) {
  const cm = pane.cm;
  if (!cm) return [];
  const parts = scopeParts(pane);
  const key = regex.source + '/' + regex.flags + '/' + (parts ? pane.find.scope.id : 0), doc = cm.getDoc(), gen = doc.changeGeneration();
  const c = pane.matchCache;
  if (c && c.key === key && c.doc === doc && c.gen === gen) return c.matches;
  const text = cm.getValue();
  const matches = parts ? parts.flatMap(([s, e]) => matchesIn(text.slice(s, e), regex).map(([a, b]) => [a + s, b + s])) : matchesIn(text, regex);
  pane.matchCache = { key, doc, gen, matches, lines: null };
  return matches;
}

// The lines with a match (the gutter's marks, the overview ruler), in one pass over the line lengths: asking the
// editor for each match's position searches from the top every time, which stalls on thousands of matches.
function editorMatchLines(pane, regex) {
  const matches = editorMatches(pane, regex), c = pane.matchCache;
  if (c?.lines) return c.lines;
  const cm = pane.cm, lines = [], last = cm.lastLine();
  let line = 0, end = cm.getLine(0).length;   // the index of the line's end (its line break)
  for (const [start] of matches) {
    while (start > end && line < last) end += 1 + cm.getLine(++line).length;
    if (lines[lines.length - 1] !== line) lines.push(line);
  }
  if (c) c.lines = lines;
  return lines;
}

function goEditor(pane, regex, dir, fromOrigin) {
  const cm = pane.cm, bar = pane.find;
  if (!cm) return;
  const matches = editorMatches(pane, regex);
  if (!matches.length) return notFound(pane, matches, fromOrigin);
  const from = cm.indexFromPos(cm.getCursor('from')), to = cm.indexFromPos(cm.getCursor('to'));
  // A found item is a place to go back to (places.js); while typing only the first, the place the search started.
  const how = fromOrigin && bar.origin != null ? 'quiet' : 'found';
  if (fromOrigin) bar.origin ??= from; else bar.origin = null;
  let i;
  if (fromOrigin) i = matches.findIndex(([s]) => s >= bar.origin);
  else if (dir > 0) i = matches.findIndex(([s]) => s >= to && !(s === from && to > from));
  else i = matches.findLastIndex(([, e]) => e <= from);
  i = pickMatch(pane, matches, i, dir, fromOrigin);
  if (i < 0) return;
  const [s, e] = matches[i];
  asFound(pane, () => cm.setSelection(cm.posFromIndex(s), cm.posFromIndex(e)), how);
  // The selection is drawn below the other matches' colour, so the current one gets its own mark.
  pane.findCurrent?.clear();
  pane.findCurrent = cm.markText(cm.posFromIndex(s), cm.posFromIndex(e),
    { className: 'mm-find-current', startStyle: 'mm-find-current-start', endStyle: 'mm-find-current-end' });
  markCurrentLine(pane);
  revealFound(cm, cm.posFromIndex(s), cm.posFromIndex(e));
  showCount(pane, matches, i);
}

// All matches get a background: an overlay on the editor, single-line matches only. With a scope the overlay would
// mark the matches outside it too: a text mark per match instead (up to BOX_LIMIT).
function markEditor(pane, regex) {
  const cm = pane.cm;
  if (!cm) return;
  if (scopeParts(pane)) {
    const matches = editorMatches(pane, regex);
    cm.operation(() => {
      pane.findHits ??= [];
      if (matches.length <= BOX_LIMIT) for (const [s, e] of matches) pane.findHits.push(cm.markText(cm.posFromIndex(s), cm.posFromIndex(e), { className: 'cm-mm-find-hit' }));
    });
    return boxMatches(pane, regex);
  }
  const re = new RegExp(regex.source, regex.flags);
  pane.findOverlay = {
    token(stream) {
      re.lastIndex = stream.pos;
      const m = re.exec(stream.string);
      if (m && m.index === stream.pos && m[0].length) { stream.pos += m[0].length; return 'mm-find-hit'; }
      if (m && m[0].length) stream.pos = m.index; else stream.skipToEnd();
    },
  };
  cm.addOverlay(pane.findOverlay);
  boxMatches(pane, regex);
}

// The setting findMark outline / both: one box around each whole match (its first piece a line on the left, its
// last one on the right, top and bottom all along), as text marks; the colouring splits a match into pieces, so a
// box per piece would box every word. Up to BOX_LIMIT matches; past that only the background.
const BOX_LIMIT = 3000;
function boxMatches(pane, regex) {
  for (const m of pane.findBoxes ?? []) m.clear();
  pane.findBoxes = [];
  clearGutterMarks(pane);
  const cm = pane.cm;
  if (!cm) return;
  const boxes = (setting('findMark') || 'background') !== 'background';
  if (!boxes) return;
  const matches = editorMatches(pane, regex);
  cm.operation(() => {
    if (boxes && matches.length <= BOX_LIMIT)
      for (const [s, e] of matches) pane.findBoxes.push(cm.markText(cm.posFromIndex(s), cm.posFromIndex(e),
        { className: 'mm-find-box', startStyle: 'mm-find-box-start', endStyle: 'mm-find-box-end' }));
  });
  markCurrentLine(pane);
}

// The lines with a match, for the gutter (findGutter) and the overview ruler: worked out after the keystroke is
// handled, not in it, so typing never waits for thousands of matches.
function scheduleFindLines(pane, regex) {
  clearTimeout(pane.findLinesTimer);
  pane.findLinesTimer = setTimeout(() => {
    if (!pane.find?.marked) return;   // the bar closed meanwhile (a new search clears this timer)
    pane.findLines = editorMatchLines(pane, regex);
    paintFindGutter(pane);
    if (typeof scheduleOverview === 'function') scheduleOverview(pane);   // overview.js
  });
}

// The setting findGutter: the line numbers of the lines with a match, marked as the matches are. Only the lines in
// view, and again as others come into view: marking every line of thousands of matches made each keystroke wait.
function paintFindGutter(pane) {
  const cm = pane.cm, lines = pane.findLines;
  if (!cm) return;
  for (const h of pane.findGutter ?? []) cm.removeLineClass(h, 'gutter', 'mm-find-line');
  pane.findGutter = [];
  if (!lines?.length || setting('findGutter') === false) return;
  if (!pane.findGutterWatched) {
    pane.findGutterWatched = true;
    cm.on('viewportChange', () => { if (pane.findLines) paintFindGutter(pane); });
  }
  const { from, to } = cm.getViewport();
  let i = 0, hi = lines.length;
  while (i < hi) { const m = (i + hi) >> 1; if (lines[m] < from) i = m + 1; else hi = m; }
  cm.operation(() => {
    for (; i < lines.length && lines[i] < to; i++) pane.findGutter.push(cm.addLineClass(lines[i], 'gutter', 'mm-find-line'));
  });
}

// The line number of the current match's line: marked as the current match (findGutter).
function markCurrentLine(pane) {
  const cm = pane.cm;
  if (!cm) return;
  if (pane.findGutterCurrent) cm.removeLineClass(pane.findGutterCurrent, 'gutter', 'mm-find-line-current');
  pane.findGutterCurrent = null;
  const at = pane.findCurrent?.find();
  if (at && setting('findGutter') !== false) pane.findGutterCurrent = cm.addLineClass(at.from.line, 'gutter', 'mm-find-line-current');
}

function clearGutterMarks(pane) {
  const cm = pane.cm;
  if (cm) {
    for (const h of pane.findGutter ?? []) cm.removeLineClass(h, 'gutter', 'mm-find-line');
    if (pane.findGutterCurrent) cm.removeLineClass(pane.findGutterCurrent, 'gutter', 'mm-find-line-current');
  }
  pane.findGutter = [];
  pane.findGutterCurrent = null;
}

// The replacement of one match: its text in the file (a regular expression's $1 reads it), the codes read (3.4).
function replacedText(f, regex, part) {
  const rep = replacementText(f.replace, f.regex);
  return f.regex ? part.replace(new RegExp(regex.source, regex.flags.replace('g', '')), rep) : rep;
}

// Replace: the current match (the one selected), then the next. With no current match (the bar just opened, the
// cursor moved away) only to the next one, so you see what you replace. Each replace is its own undo step.
function replaceOne(pane) {
  const cm = pane.cm, f = findOf(pane), regex = findRegex(pane);
  if (findTarget(pane) !== 'editor' || !cm || !regex || regex instanceof Error) return;
  if (cm.getOption('readOnly')) return toast('This tab is read-only.');
  recordReplace(f.replace);   // the history (history.js); findGo below keeps the search
  if (typeof recordMacroReplace === 'function') recordMacroReplace(f.query, f.replace, f, false);   // macros.js
  const from = cm.indexFromPos(cm.getCursor('from')), to = cm.indexFromPos(cm.getCursor('to'));
  if (to > from && editorMatches(pane, regex).some(([s, e]) => s === from && e === to))
    cm.replaceSelection(replacedText(f, regex, cm.getSelection()), 'start');
  findGo(pane, 1);
  refreshMarks(pane);
}

// Replace all: every match in the scope (the selection, else the file), one undo step.
function replaceAll(pane) {
  const cm = pane.cm, f = findOf(pane), regex = findRegex(pane);
  if (findTarget(pane) !== 'editor' || !cm || !regex || regex instanceof Error) return;
  if (cm.getOption('readOnly')) return toast('This tab is read-only.');
  const text = cm.getValue(), matches = editorMatches(pane, regex), within = scopeParts(pane) ? ' in the selection' : '';
  recordFind(f.query, f);   // the history (history.js)
  recordReplace(f.replace);
  if (typeof recordMacroReplace === 'function') recordMacroReplace(f.query, f.replace, f, true);   // macros.js
  if (!matches.length) return toast('Not found' + within + ': ' + f.query, true);
  cm.operation(() => {   // one undo step
    for (const [s, e] of [...matches].reverse())
      cm.replaceRange(replacedText(f, regex, text.slice(s, e)), cm.posFromIndex(s), cm.posFromIndex(e));
  });
  toast(`Replaced ${matches.length}${within}${matches.length >= FIND_LIMIT ? ' (the limit; search again for more)' : ''}.`, true);
  refresh(pane, false);
}

// ---------- In the preview ----------
// The preview's text, with a line break between blocks, and where each text node starts in it.
const FIND_BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,td,th,pre,blockquote,dt,dd,tr,div,section,figcaption,summary';

function previewText(pane) {
  const walker = document.createTreeWalker(pane.previewEl, NodeFilter.SHOW_TEXT, {
    // Not the layers drawn over the content (the cursors, the bookmarks' numbers, find's boxes).
    acceptNode: n => n.parentElement.closest('script, style, .katex-mathml, .mm-pcaret-layer, .mm-pcursor-layer, .mm-pfind-boxes') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = [];
  let text = '', lastBlock = null;
  for (let node; (node = walker.nextNode());) {
    const block = node.parentElement.closest(FIND_BLOCKS);
    if (text && block !== lastBlock) text += '\n';
    nodes.push({ node, start: text.length });
    text += node.data;
    lastBlock = block;
  }
  return { text, nodes };
}

// A DOM range for [s, e) of previewText.
function previewRange(index, s, e) {
  const find = i => {
    let lo = 0, hi = index.nodes.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (index.nodes[mid].start <= i) lo = mid; else hi = mid - 1; }
    const n = index.nodes[lo];
    return [n.node, Math.min(i - n.start, n.node.data.length)];
  };
  const range = document.createRange();
  range.setStart(...find(s));
  range.setEnd(...find(e));
  return range;
}

function previewMatches(pane, regex) {
  const index = previewText(pane);
  pane.find.index = index;
  return matchesIn(index.text, regex);
}

function goPreview(pane, regex, dir, fromOrigin) {
  const bar = pane.find, matches = previewMatches(pane, regex);
  if (!matches.length) return notFound(pane, matches, fromOrigin);
  // Start: the current match; else the selection in the preview; else the top of what is visible.
  let start = bar.at;
  if (start === null || fromOrigin) {
    const sel = getSelection();
    const node = sel.rangeCount && pane.previewEl.contains(sel.anchorNode) && bar.index.nodes.find(n => n.node === sel.anchorNode);
    if (node) start = node.start + sel.anchorOffset;
    else {
      const top = pane.previewEl.getBoundingClientRect().top;
      const first = matches.findIndex(([s, e]) => previewRange(bar.index, s, e).getBoundingClientRect().bottom >= top);
      start = first < 0 ? 0 : matches[first][0];
    }
    if (fromOrigin) bar.origin ??= start;
  }
  let i;
  if (fromOrigin) i = matches.findIndex(([s]) => s >= bar.origin);
  else if (bar.at === null) i = dir > 0 ? matches.findIndex(([s]) => s >= start) : matches.findLastIndex(([s]) => s < start);
  else i = dir > 0 ? matches.findIndex(([s]) => s > start) : matches.findLastIndex(([s]) => s < start);
  i = pickMatch(pane, matches, i, dir, fromOrigin);
  if (i < 0) return;
  bar.at = matches[i][0];
  const range = previewRange(bar.index, ...matches[i]);
  CSS.highlights.set('mm-find-cur-' + pane.index, new Highlight(range));
  pane.previewBoxes.current = range;
  drawPreviewBoxes(pane);
  revealFoundInPreview(pane, range);
  showCount(pane, matches, i);
}

// Past the last match (or before the first, going back), Options > Settings > "At the end of the file" decides:
// end: stop there, with a message; around: go on from the other end; origin: go on from the other end, and
// stop when back at the first match of this search (the next F3 starts a new round). -1: stay where you are.
function pickMatch(pane, matches, i, dir, fromOrigin) {
  const bar = pane.find, mode = setting('findWrap');
  if (fromOrigin) bar.lap = null;   // typing: a new search
  if (i < 0) {
    if (mode === 'end' && !fromOrigin) {
      toast(dir > 0 ? 'No more matches below.' : 'No more matches above.', true);
      return -1;
    }
    i = dir > 0 ? 0 : matches.length - 1;
    if (bar.lap !== null) bar.wrapped = true;
    if (!fromOrigin) toast(dir > 0 ? 'Went on from the top.' : 'Went on from the bottom.', true);
  }
  if (mode === 'origin') {
    if (bar.lap === null || fromOrigin) {   // the first match of this search: where a round ends
      bar.lap = matches[i][0];
      bar.wrapped = false;
    } else if (bar.wrapped && (dir > 0 ? matches[i][0] >= bar.lap : matches[i][0] <= bar.lap)) {
      bar.lap = null;
      toast('No more matches: back where the search started.', true);
      return -1;
    }
  }
  return i;
}

// No match at all: the bar says so; from F3 / Enter also a message (not while typing).
function notFound(pane, matches, fromOrigin) {
  showCount(pane, matches, null);
  if (!fromOrigin) toast('Not found: ' + findOf(pane).query, true);
}

// ---------- Marks ----------
function mark(pane, where, regex, matches) {
  pane.find.marked = where + pane.active?.id;
  if (where === 'editor') return markEditor(pane, regex);
  const ranges = matches.map(([s, e]) => previewRange(pane.find.index, s, e));
  CSS.highlights.set('mm-find-' + pane.index, new Highlight(...ranges));
  if (typeof schedulePreviewOverview === 'function') schedulePreviewOverview(pane);   // the preview's scroll bar
  pane.previewBoxes = { ranges, current: null };
  drawPreviewBoxes(pane);
}

// The setting findMark outline / both in the preview: the highlight API has no box, so a box per line piece of
// each match is drawn over the text (a layer after the preview's content, scrolling with it; not before it: the
// article stays the first child, see showActive); the current match's box is thicker. Drawn again when the
// preview changes width or zoom (the text wraps anew).
function drawPreviewBoxes(pane) {
  pane.previewBoxLayer?.remove();
  pane.previewBoxLayer = null;
  const boxes = pane.previewBoxes;
  if (!boxes || (setting('findMark') || 'background') === 'background') return;
  const layer = document.createElement('div');
  layer.className = 'mm-pfind-boxes';
  pane.previewEl.append(layer);
  pane.previewBoxLayer = layer;
  if (!pane.previewBoxObserver) {
    let width = pane.previewEl.clientWidth;
    pane.previewBoxObserver = new ResizeObserver(() => {
      if (pane.previewEl.clientWidth === width) return;
      width = pane.previewEl.clientWidth;
      if (pane.previewBoxes) drawPreviewBoxes(pane);
    });
    pane.previewBoxObserver.observe(pane.previewEl);
  }
  const origin = layer.getBoundingClientRect();
  const draw = (range, current) => {
    const rects = [...range.getClientRects()].filter(r => r.width > 0);
    rects.forEach((r, i) => {
      const box = document.createElement('div');
      box.className = 'mm-pfind-box' + (current ? ' mm-find-current' : '') + (i === 0 ? ' mm-find-box-start' : '')
        + (i === rects.length - 1 ? ' mm-find-box-end' : '');
      Object.assign(box.style, { left: r.left - origin.left + 'px', top: r.top - origin.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      layer.append(box);
    });
  };
  if (boxes.ranges.length <= BOX_LIMIT) for (const range of boxes.ranges) draw(range, false);
  if (boxes.current) draw(boxes.current, true);
}

function clearMarks(pane) {
  clearTimeout(pane.findLinesTimer);
  if (pane.findLines) { pane.findLines = null; if (typeof scheduleOverview === 'function') scheduleOverview(pane); }
  if (pane.findOverlay) pane.cm?.removeOverlay(pane.findOverlay);
  pane.findOverlay = null;
  for (const m of [...pane.findBoxes ?? [], ...pane.findHits ?? []]) m.clear();
  pane.findBoxes = [];
  pane.findHits = [];
  CSS.highlights.delete('mm-find-' + pane.index);
  if (typeof schedulePreviewOverview === 'function') schedulePreviewOverview(pane);
  pane.previewBoxes = null;
  pane.previewBoxLayer?.remove();
  pane.previewBoxLayer = null;
  pane.findCurrent?.clear();
  pane.findCurrent = null;
  clearGutterMarks(pane);
  if (pane.find) pane.find.at = pane.find.marked = null;
  CSS.highlights.delete('mm-find-cur-' + pane.index);
  csvClearFind(pane);   // a CSV's marks in the column view (csvfind.js)
  pdfClearFind(pane);   // a PDF's in its frame (pdffind.js)
}

function refreshMarks(pane) {
  if (csvFinding(pane) || pdfFinding(pane)) return refresh(pane, false);   // a CSV marks by cell (csvfind.js), a PDF in its frame
  const regex = findRegex(pane);
  if (pane.findOverlay) pane.cm?.removeOverlay(pane.findOverlay);
  pane.findOverlay = null;
  for (const m of [...pane.findBoxes ?? [], ...pane.findHits ?? []]) m.clear();
  pane.findBoxes = [];
  pane.findHits = [];
  if (regex && !(regex instanceof Error) && findTarget(pane) === 'editor') {
    markEditor(pane, regex);
    scheduleFindLines(pane, regex);   // the gutter and the overview ruler again
  } else drawPreviewBoxes(pane);
}
