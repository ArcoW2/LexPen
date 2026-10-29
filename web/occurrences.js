'use strict';
// Occurrences (docs/plans/executed/PLAN-show-occurrences.md): the text of a field marked everywhere in the document, in the
// editor and in the preview, in colours of their own (occurrenceHit, occurrenceBox) and on the scroll bar strip,
// without a current one and without moving the cursor (only First does). Beside Find: its own marks, so neither
// clears the other, Find drawn on top. The field is filled by Show all occurrences of this selection (the right-click
// menu, Edit), and with the settings by a double click on a word in the editor or by any selection you make of a
// minimum length. The bar is not needed for the marks: occurrences.bar decides whether it opens with them.
// The matching and the preview's text come from find.js (loaded when needed). Loaded after previewcursor.js.

const newOccurrence = () => ({ query: '', case: true, word: false, regex: false });
const occurrenceSearches = [newOccurrence(), newOccurrence()];
const occOf = pane => setting('findShared') ? occurrenceSearches[0] : occurrenceSearches[pane.index];
const OCC_BOX_LIMIT = 3000;   // marks per match (a box, a multi-line match) up to this many; past it the overlay only
const OCC_DELAY = 400;        // a selection (with the setting): marked once it stops changing for this long

const OCC_HTML =
  '<div class="mm-find-row">' +
  '<span class="mm-find-label">Occurrences</span>' +
  '<input class="mm-find-input" type="text" spellcheck="false" title="Marked everywhere as you type; the cursor stays. Codes: ^p line break, ^t tab (the ? button of Find)">' +
  '<span class="mm-find-count"></span>' +
  '<button data-occ="case" class="mm-find-opt" title="Match case">Aa</button>' +
  '<button data-occ="word" class="mm-find-opt" title="Whole word only">W</button>' +
  '<button data-occ="regex" class="mm-find-opt" title="Regular expression (then the ^ codes do not apply)">.*</button>' +
  '<button data-occ="first" class="mm-occ-first-button" title="The cursor to the first occurrence (most times where it is declared); Ctrl+Alt+- back">First</button>' +
  '<button data-occ="close" class="mm-find-close" title="Close the bar (the occurrences stay marked; View > Occurrences > Clear occurrences clears them)"></button>' +
  '</div>';

// ---------- The bar ----------
function occBar(pane) {
  if (pane.occ) return pane.occ;
  const el = pane.el.querySelector('.mm-occ');
  el.innerHTML = OCC_HTML;
  const bar = pane.occ = { el, input: el.querySelector('input'), count: el.querySelector('.mm-find-count') };
  el.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });   // the focus stays where it is
  el.addEventListener('click', e => {
    const what = e.target.closest('[data-occ]')?.dataset.occ, q = occOf(pane);
    if (!what) return;
    if (what === 'close') return closeOccBar(pane);
    if (what === 'first') return occFirst(pane);
    q[what] = !q[what];
    occChanged(pane);
  });
  bar.input.addEventListener('input', () => {
    occOf(pane).query = bar.input.value;
    clearTimeout(pane.occTypeTimer);
    pane.occTypeTimer = setTimeout(() => occChanged(pane), (pane.cm?.lineCount() ?? 0) < 5000 ? 0 : 150);
  });
  // The history: the find bar's searches (history.js); Up / Down in the field.
  attachHistory(bar.input, 'find', (entry, typed) => {
    const q = occOf(pane);
    bar.input.value = q.query = entry.text;
    if (!typed) for (const k of ['case', 'word', 'regex']) q[k] = !!entry[k];
    occChanged(pane);
  });
  bar.input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); recordFind(occOf(pane).query, occOf(pane)); }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    // The bar set to show: it stays, the focus goes back; else Esc closes it.
    if (setting('occurrences.bar') === false) closeOccBar(pane);
    occFocusBack(pane);
  });
  return bar;
}

function occFocusBack(pane) {
  if (pane.active?.mode !== 'preview' && pane.cm && pane.active?.focusPart !== 'preview') pane.cm.focus();
  else pane.previewEl.focus({ preventScroll: true });
}

function syncOccBar(pane) {
  const bar = pane.occ, q = occOf(pane);
  if (!bar) return;
  if (bar.input.value !== q.query) bar.input.value = q.query;
  for (const b of bar.el.querySelectorAll('.mm-find-opt')) b.classList.toggle('mm-on', q[b.dataset.occ]);
}

function openOccBar(pane) {
  const bar = occBar(pane);
  if (!bar.el.hidden) return syncOccBar(pane);
  bar.el.hidden = false;
  syncOccBar(pane);
  showOccCount(pane);
  pane.cm?.refresh();
}

function closeOccBar(pane) {
  if (!pane.occ || pane.occ.el.hidden) return;
  pane.occ.el.hidden = true;
  pane.cm?.refresh();
}

const occBarOpen = pane => !!pane.occ && !pane.occ.el.hidden;

// The search changed (typed, a switch, a new text): marked again, in this pane and, shared, in the other.
function occChanged(pane) {
  for (const p of setting('findShared') ? panes : [pane]) { syncOccBar(p); markOccurrences(p); }
}

// ---------- Filling the field ----------
// A text into the field (its line breaks and tabs as codes, a caret as ^^), the bar opened when the setting says so.
function showOccurrences(pane, text, word) {
  if (!pane?.active || !text) return;
  const q = occOf(pane);
  Object.assign(q, { query: text.replace(/\^/g, '^^').replace(/\r?\n/g, '^p').replace(/\t/g, '^t'), case: true, word: !!word, regex: false });
  if (setting('occurrences.bar') !== false) openOccBar(pane);
  occChanged(pane);
}

// The first selection only: of several cursors the first, of a block its first line.
function editorSelectionText(cm) {
  if (typeof blockOf === 'function' && blockOf(cm)) return blockText(cm, '\n').split('\n')[0];   // column.js
  const [first] = cm.listSelections();
  return first ? cm.getRange(first.from(), first.to()) : '';
}

// The preview's selection in a pane, or ''.
function previewSelectionText(pane) {
  const sel = getSelection();
  return sel.rangeCount && !sel.isCollapsed && pane.active?.mode !== 'edit' && pane.previewEl.contains(sel.anchorNode) ? sel.toString() : '';
}

// Show all occurrences of this selection (the action): the preview's selection, else the editor's, else the word at
// the editor's cursor (as a whole word).
function showOccurrencesOfSelection(ctx = {}) {
  const inPreview = panes.find(p => previewSelectionText(p));
  if (inPreview) return showOccurrences(inPreview, previewSelectionText(inPreview));
  const pane = editorPane(ctx) ?? panes[state.activePane], cm = pane?.cm;
  if (!cm || pane.active?.mode === 'preview') return toast('Select text to show its occurrences.', true);
  const text = editorSelectionText(cm);
  if (text) return showOccurrences(pane, text);
  const w = cm.findWordAt(cm.getCursor()), word = cm.getRange(w.anchor, w.head);
  if (/[\p{L}\p{N}_]/u.test(word)) return showOccurrences(pane, word, true);
  toast('Select text to show its occurrences.', true);
}

function clearOccurrences(pane) {
  const q = occOf(pane);
  q.query = '';
  occChanged(pane);
}

// ---------- Marking ----------
function occRegex(pane) {
  const q = occOf(pane);
  if (!q.query) return null;
  try { return new RegExp(searchPattern(q.query, q), q.case ? 'g' : 'gi'); }   // app.js
  catch (e) { return e; }
}

async function markOccurrences(pane) {
  const run = pane.occRun = (pane.occRun ?? 0) + 1;
  if (occOf(pane).query && typeof matchesIn !== 'function') {
    await loadScript('find.js');
    if (run !== pane.occRun) return;
  }
  markOccEditor(pane);
  markOccPreview(pane);
  showOccCount(pane);
}

function clearOccEditor(pane) {
  if (pane.occOverlay) pane.cm?.removeOverlay(pane.occOverlay);
  pane.occOverlay = null;
  for (const m of pane.occMarks ?? []) m.clear();
  pane.occMarks = [];
  pane.occEditor = null;
  if (pane.occLines) { pane.occLines = null; if (typeof scheduleOverview === 'function') scheduleOverview(pane); }
}

function clearOccPreview(pane) {
  CSS.highlights.delete('mm-occ-' + pane.index);
  CSS.highlights.delete('mm-occ-first-' + pane.index);
  pane.occPreview = null;
  if (typeof schedulePreviewOverview === 'function') schedulePreviewOverview(pane);
}

// The editor: an overlay colours every single-line occurrence (fast on a long file); marks for what an overlay cannot
// do: an occurrence over several lines, the boxes (Find > Found text: marked with), the first one underlined.
function markOccEditor(pane) {
  const cm = pane.cm, regex = occRegex(pane);
  clearOccEditor(pane);
  if (!cm || pane.active?.mode === 'preview' || !regex || regex instanceof Error) return;
  const text = cm.getValue(), matches = matchesIn(text, regex);   // find.js
  pane.occEditor = matches;
  const multiLine = matches.some(([s, e]) => text.slice(s, e).includes('\n'));
  const boxes = (setting('findMark') || 'background') !== 'background';
  cm.operation(() => {
    if (!multiLine) {
      const re = new RegExp(regex.source, regex.flags);
      pane.occOverlay = { token(stream) {
        re.lastIndex = stream.pos;
        const m = re.exec(stream.string);
        if (m && m.index === stream.pos && m[0].length) { stream.pos += m[0].length; return 'mm-occ-hit'; }
        if (m && m[0].length) stream.pos = m.index; else stream.skipToEnd();
      } };
      cm.addOverlay(pane.occOverlay);
    }
    if (matches.length <= OCC_BOX_LIMIT && (multiLine || boxes))
      for (const [s, e] of matches) pane.occMarks.push(cm.markText(cm.posFromIndex(s), cm.posFromIndex(e),
        { className: (multiLine ? 'cm-mm-occ-hit' : '') + (boxes ? ' mm-occ-box' : ''), startStyle: 'mm-occ-box-start', endStyle: 'mm-occ-box-end' }));
    if (matches.length && setting('occurrences.markFirst'))
      pane.occMarks.push(cm.markText(cm.posFromIndex(matches[0][0]), cm.posFromIndex(matches[0][1]), { className: 'mm-occ-first' }));
  });
  // The lines with one, for the scroll bar strip (overview.js), in one pass over the line lengths.
  const lines = [], last = cm.lastLine();
  let line = 0, end = cm.getLine(0).length;
  for (const [start] of matches) {
    while (start > end && line < last) end += 1 + cm.getLine(++line).length;
    if (lines[lines.length - 1] !== line) lines.push(line);
  }
  pane.occLines = lines;
  if (typeof scheduleOverview === 'function') scheduleOverview(pane);
}

// The preview: the occurrences in its rendered text (as Find searches it), drawn with the CSS Custom Highlight API
// below Find's (a lower priority).
function markOccPreview(pane) {
  const regex = occRegex(pane);
  clearOccPreview(pane);
  if (!pane.active || pane.active.mode === 'edit' || !regex || regex instanceof Error) return;
  const index = previewText(pane), matches = matchesIn(index.text, regex);   // find.js
  const ranges = matches.map(([s, e]) => previewRange(index, s, e));
  pane.occPreview = ranges;
  const all = new Highlight(...ranges);
  all.priority = -1;
  CSS.highlights.set('mm-occ-' + pane.index, all);
  if (ranges.length && setting('occurrences.markFirst')) CSS.highlights.set('mm-occ-first-' + pane.index, new Highlight(ranges[0]));
  if (typeof schedulePreviewOverview === 'function') schedulePreviewOverview(pane);
}

function showOccCount(pane) {
  const bar = pane.occ;
  if (!bar) return;
  const regex = occRegex(pane);
  if (regex instanceof Error) { bar.count.textContent = 'Not valid'; return; }
  const n = (pane.active?.mode === 'preview' ? pane.occPreview : pane.occEditor ?? pane.occPreview)?.length ?? 0;
  bar.count.textContent = !regex ? '' : n ? `${n} occurrence${n === 1 ? '' : 's'}` : 'None';
  bar.count.classList.toggle('mm-none', !!regex && !n);
}

// First: the cursor to the first occurrence, selected, as a place jumped to (back with Ctrl+Alt+-); in the preview
// (the focus there, or a preview only tab) the preview's own cursor (previewcursor.js).
function occFirst(pane) {
  const tab = pane.active;
  if (!tab) return;
  const inPreview = tab.mode === 'preview' || (tab.mode === 'split' && tab.focusPart === 'preview');
  if (inPreview) {
    const r = pane.occPreview?.[0];
    if (!r) return toast('No occurrences.', true);
    const o = sourceOffsetAt(tab, r.startContainer, r.startOffset);   // sourcemap.js
    if (o == null) return revealFoundInPreview(pane, r);
    const starts = lineOffsets(docText(tab.doc));
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= o) line++;
    return previewCursorTo(pane, { line, ch: o - starts[line] });
  }
  const cm = pane.cm, m = pane.occEditor?.[0];
  if (!cm || !m) return toast('No occurrences.', true);
  const from = cm.posFromIndex(m[0]), to = cm.posFromIndex(m[1]);
  asFound(pane, () => cm.setSelection(from, to));   // places.js
  revealFound(cm, from, to);
  cm.focus();
}

// ---------- Following the text, and the triggers ----------
// The editor (made on first use, app.js ensureEditor): marked again after an edit and on another document; a double
// click and, with the setting, a selection of the minimum length you made (not one LexPen made: a find, a jump).
function setupOccurrences(pane) {
  const cm = pane.cm;
  const again = () => {
    clearTimeout(pane.occEditTimer);
    pane.occEditTimer = setTimeout(() => { if (occOf(pane).query) { markOccEditor(pane); showOccCount(pane); } }, 250);
  };
  cm.on('changes', again);
  cm.on('swapDoc', again);
  cm.on('dblclick', () => setTimeout(() => {
    if (!setting('occurrences.doubleClick')) return;
    const text = editorSelectionText(cm);
    if (/^[\p{L}\p{N}_]+$/u.test(text)) { pane.occSkip = text; showOccurrences(pane, text, true); }
  }));
  cm.on('cursorActivity', () => {
    if (!setting('occurrences.select')) return;
    if (pane.placeHow) { pane.occSkip = editorSelectionText(cm); return; }   // a selection LexPen made (asFound)
    clearTimeout(pane.occSelectTimer);
    pane.occSelectTimer = setTimeout(() => {
      const text = editorSelectionText(cm);
      if (!cm.hasFocus() || text === pane.occSkip || text.length < (+setting('occurrences.minLength') || 3)) return;
      pane.occSkip = text;
      showOccurrences(pane, text);
    }, OCC_DELAY);
  });
}

// The preview: a selection you made (not the word a double click selects: that goes to the editor).
for (const pane of panes) {
  pane.previewEl.addEventListener('mousedown', e => { pane.occDouble = e.detail >= 2; });
}
let occSelectionTimer = 0;
document.addEventListener('selectionchange', () => {
  if (!setting('occurrences.select')) return;
  clearTimeout(occSelectionTimer);
  occSelectionTimer = setTimeout(() => {
    const pane = panes.find(p => previewSelectionText(p));
    if (!pane || pane.occDouble) return;
    const text = previewSelectionText(pane);
    if (text.length < (+setting('occurrences.minLength') || 3) || text === pane.occSkip) return;
    pane.occSkip = text;
    showOccurrences(pane, text);
  }, OCC_DELAY);
});

// Another tab shown, the preview drawn again, a setting changed: marked again (app.js calls these).
function refreshOccurrences(pane) {
  if (occOf(pane).query || pane.occEditor || pane.occPreview) markOccurrences(pane);
}
function refreshOccurrencesPreview(tab) {
  for (const pane of panes) if (pane.active === tab && occOf(pane).query) { markOccPreview(pane); showOccCount(pane); }
}

// View > Occurrences.
const occurrenceItems = () => {
  const pane = panes[state.activePane];
  return [{ label: '&Clear occurrences', action: 'occurrences.clear', params: [], key: keyText('occurrences.clear') },
    { label: occBarOpen(pane) ? 'Close &bar' : 'Show &bar', action: 'occurrences.bar', params: [], key: keyText('occurrences.bar') }];
};
