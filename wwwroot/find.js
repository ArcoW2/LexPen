'use strict';
// Find (and replace) inside one pane: the editor or the preview, whichever the user works in.
// Loaded on the first Ctrl+F / Ctrl+H / F3 (see findKey in app.js), so startup does not pay for it.
// Per pane by default; with "One search for both panes" (More menu) both panes share one search.

const newFind = () => ({ query: '', replace: '', case: false, word: false, regex: false });
const finds = [newFind(), newFind()];
const findOf = pane => localStorage.findShared === 'on' ? finds[0] : finds[pane.index];
const FIND_LIMIT = 5000;   // matches counted / highlighted; more is shown as "5000+"

// ---------- The bar ----------
const chevron = d => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const FIND_HTML =
  '<div class="mm-find-row">' +
  '<button class="mm-find-toggle" data-find="replaceRow" title="Replace (Ctrl+H; editor only)">' + chevron('M6 4l4 4-4 4') + '</button>' +
  '<input class="mm-find-input" type="text" spellcheck="false" placeholder="Find" title="Enter / F3: next; Shift+Enter / Shift+F3: previous; Esc: close. Codes as in the file search: ^p line break, ^t tab, ...">' +
  '<span class="mm-find-count"></span>' +
  '<button data-find="case" class="mm-find-opt" title="Match case">Aa</button>' +
  '<button data-find="word" class="mm-find-opt" title="Whole word only">W</button>' +
  '<button data-find="regex" class="mm-find-opt" title="Regular expression (then the ^ codes do not apply)">.*</button>' +
  '<button data-find="prev" title="Previous (Shift+F3)">' + chevron('M4 10l4-4 4 4') + '</button>' +
  '<button data-find="next" title="Next (F3)">' + chevron('M4 6l4 4 4-4') + '</button>' +
  '<button data-find="close" class="mm-find-close" title="Close (Esc)"></button>' +
  '</div><div class="mm-find-row mm-find-replace" hidden>' +
  '<span class="mm-find-indent"></span>' +
  '<input class="mm-find-with" type="text" spellcheck="false" placeholder="Replace" title="Enter: replace and find the next. With a regular expression, $1 etc. insert the groups">' +
  '<button data-find="replaceOne" title="Replace this one and find the next (Enter)">Replace</button>' +
  '<button data-find="replaceAll" title="Replace all in this file (one undo step)">All</button>' +
  '</div>';

function findBar(pane) {
  if (pane.find) return pane.find;
  const el = pane.el.querySelector('.mm-find');
  el.innerHTML = FIND_HTML;
  const bar = pane.find = {
    el, input: el.querySelector('.mm-find-input'), with: el.querySelector('.mm-find-with'),
    count: el.querySelector('.mm-find-count'), replaceRow: el.querySelector('.mm-find-replace'),
    target: null, origin: null, at: null,
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
    } else if (action === 'replaceRow') showReplace(pane, bar.replaceRow.hidden);
    else if (action === 'close') closeFind(pane);
    else if (action === 'next') go(pane, 1);
    else if (action === 'prev') go(pane, -1);
    else if (action === 'replaceOne') replaceOne(pane);
    else if (action === 'replaceAll') replaceAll(pane);
  });
  bar.input.addEventListener('input', () => {
    findOf(pane).query = bar.input.value;
    refresh(pane, true);   // as you type: the first match from where the search started
  });
  bar.with.addEventListener('input', () => findOf(pane).replace = bar.with.value);
  for (const input of [bar.input, bar.with]) input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(pane, true); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (input === bar.with && !e.shiftKey) replaceOne(pane); else go(pane, e.shiftKey ? -1 : 1);
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
}

function showReplace(pane, on) {
  const bar = pane.find;
  bar.replaceRow.hidden = !on;
  bar.el.querySelector('.mm-find-toggle').classList.toggle('mm-open', on);
  pane.cm?.refresh();
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
// open: show the bar (filled with the selection) and focus it. replace: the same, with the replace row.
// next / prev: the next match; with an empty search, or a hidden bar in per-pane mode: open.
function findCommand(pane, action) {
  if (!pane?.active) return;
  const bar = findBar(pane), f = findOf(pane), shown = !bar.el.hidden;
  const shared = localStorage.findShared === 'on';
  syncBar(pane);   // shared: the other pane may have changed the search
  if ((action === 'next' || action === 'prev') && f.query && (shown || shared)) {
    if (!shown) showBar(pane, false);
    return go(pane, action === 'next' ? 1 : -1);
  }
  showBar(pane, true);
  if (action === 'replace') showReplace(pane, findTarget(pane) === 'editor');
}

function showBar(pane, focus) {
  const bar = pane.find, f = findOf(pane);
  const selected = focus && selectedText(pane);
  if (selected) f.query = selected;
  bar.el.hidden = false;
  bar.origin = null;
  syncBar(pane);
  pane.cm?.refresh();
  if (focus) {
    bar.input.focus();
    bar.input.select();
  }
  refresh(pane, false);
}

function closeFind(pane, focusBack) {
  const bar = pane.find;
  if (!bar || bar.el.hidden) return;
  bar.el.hidden = true;
  clearMarks(pane);
  pane.cm?.refresh();
  if (focusBack) {
    if (findTarget(pane) === 'editor' && pane.cm) pane.cm.focus(); else pane.previewEl.focus({ preventScroll: true });
  }
}

// A one-line selection in the part being searched.
function selectedText(pane) {
  let text = '';
  if (findTarget(pane) === 'editor') text = pane.cm?.getSelection() || '';
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
  const matches = where === 'editor' ? editorMatches(pane, regex) : previewMatches(pane, regex);
  mark(pane, where, regex, matches);
  if (moving && matches.length) go(pane, 1, true);
  else showCount(pane, matches, null);
}

function showCount(pane, matches, current) {
  const total = matches.length >= FIND_LIMIT ? FIND_LIMIT + '+' : matches.length;
  pane.find.count.textContent = !matches.length ? 'No matches' : current === null ? `${total} found` : `${current + 1} of ${total}`;
  pane.find.count.classList.toggle('mm-none', !matches.length);
}

// To the next (dir 1) or previous (-1) match, from the cursor; at the end it wraps around.
// `fromOrigin`: as you type, from where the search started instead.
function go(pane, dir, fromOrigin) {
  const bar = pane.find, regex = findRegex(pane);
  if (!regex || regex instanceof Error) return;
  const where = findTarget(pane);
  if (bar.marked !== where + pane.active?.id) refresh(pane, false);   // another tab or mode since the marks
  if (where === 'editor') return goEditor(pane, regex, dir, fromOrigin);
  goPreview(pane, regex, dir, fromOrigin);
}

// ---------- In the editor ----------
const editorMatches = (pane, regex) => pane.cm ? matchesIn(pane.cm.getValue(), regex) : [];

function goEditor(pane, regex, dir, fromOrigin) {
  const cm = pane.cm, bar = pane.find;
  if (!cm) return;
  const matches = editorMatches(pane, regex);
  if (!matches.length) return showCount(pane, matches, null);
  const from = cm.indexFromPos(cm.getCursor('from')), to = cm.indexFromPos(cm.getCursor('to'));
  if (fromOrigin) bar.origin ??= from; else bar.origin = null;
  let i;
  if (fromOrigin) i = matches.findIndex(([s]) => s >= bar.origin);
  else if (dir > 0) i = matches.findIndex(([s]) => s >= to && !(s === from && to > from));
  else i = matches.findLastIndex(([, e]) => e <= from);
  if (i < 0) i = dir > 0 ? 0 : matches.length - 1;
  const [s, e] = matches[i];
  cm.setSelection(cm.posFromIndex(s), cm.posFromIndex(e));
  cm.scrollIntoView({ from: cm.posFromIndex(s), to: cm.posFromIndex(e) }, 80);
  showCount(pane, matches, i);
}

// All matches get a background: an overlay on the editor, single-line matches only.
function markEditor(pane, regex) {
  const cm = pane.cm;
  if (!cm) return;
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
}

function replaceOne(pane) {
  const cm = pane.cm, f = findOf(pane), regex = findRegex(pane);
  if (findTarget(pane) !== 'editor' || !cm || !regex || regex instanceof Error) return;
  if (cm.getOption('readOnly')) return toast('This tab is read-only.');
  const whole = new RegExp('^(?:' + regex.source + ')$', regex.flags.replace('g', ''));
  const selected = cm.getSelection();
  if (selected && whole.test(selected))
    cm.replaceSelection(f.regex ? selected.replace(whole, f.replace) : f.replace, 'start');
  go(pane, 1);
  refreshMarks(pane);
}

function replaceAll(pane) {
  const cm = pane.cm, f = findOf(pane), regex = findRegex(pane);
  if (findTarget(pane) !== 'editor' || !cm || !regex || regex instanceof Error) return;
  if (cm.getOption('readOnly')) return toast('This tab is read-only.');
  const text = cm.getValue(), matches = matchesIn(text, regex);
  if (!matches.length) return;
  const single = new RegExp(regex.source, regex.flags.replace('g', ''));
  cm.operation(() => {   // one undo step
    for (const [s, e] of [...matches].reverse()) {
      const part = text.slice(s, e);
      cm.replaceRange(f.regex ? part.replace(single, f.replace) : f.replace, cm.posFromIndex(s), cm.posFromIndex(e));
    }
  });
  toast(`Replaced ${matches.length}${matches.length >= FIND_LIMIT ? ' (the limit; search again for more)' : ''}.`, true);
  refresh(pane, false);
}

// ---------- In the preview ----------
// The preview's text, with a line break between blocks, and where each text node starts in it.
const FIND_BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,td,th,pre,blockquote,dt,dd,tr,div,section,figcaption,summary';

function previewText(pane) {
  const walker = document.createTreeWalker(pane.previewEl, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.parentElement.closest('script, style, .katex-mathml') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
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
  if (!matches.length) return showCount(pane, matches, null);
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
  if (i < 0) i = dir > 0 ? 0 : matches.length - 1;
  bar.at = matches[i][0];
  const range = previewRange(bar.index, ...matches[i]);
  CSS.highlights.set('mm-find-cur-' + pane.index, new Highlight(range));
  const r = range.getBoundingClientRect(), box = pane.previewEl.getBoundingClientRect();
  if (r.top < box.top + 20 || r.bottom > box.bottom - 20) pane.previewEl.scrollTop += r.top - box.top - box.height / 3;
  showCount(pane, matches, i);
}

// ---------- Marks ----------
function mark(pane, where, regex, matches) {
  pane.find.marked = where + pane.active?.id;
  if (where === 'editor') return markEditor(pane, regex);
  CSS.highlights.set('mm-find-' + pane.index, new Highlight(...matches.map(([s, e]) => previewRange(pane.find.index, s, e))));
}

function clearMarks(pane) {
  if (pane.findOverlay) pane.cm?.removeOverlay(pane.findOverlay);
  pane.findOverlay = null;
  CSS.highlights.delete('mm-find-' + pane.index);
  if (pane.find) pane.find.at = pane.find.marked = null;
  CSS.highlights.delete('mm-find-cur-' + pane.index);
}

function refreshMarks(pane) {
  const regex = findRegex(pane);
  if (pane.findOverlay) pane.cm?.removeOverlay(pane.findOverlay);
  pane.findOverlay = null;
  if (regex && !(regex instanceof Error) && findTarget(pane) === 'editor') markEditor(pane, regex);
}
