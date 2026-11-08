'use strict';
// Word completion (docs/plans/executed/PLAN-autocomplete.md): Ctrl+Space lists what can complete the word before the
// cursor: the language's keywords (its word lists), the document's words that start with a "starts with" entry of
// those lists ('@*': every @word of the document), the document's other words, the language's snippets. The setting
// completeDelay opens the list by itself after a pause in typing. The document's words come from a worker
// (words.worker.js), refreshed a while after the last edit; the lines near the cursor and the lines edited since are
// read on the spot, so the list never waits and a word just typed is in it. Loaded with the editor, after format.js.

const COMPLETE_MAX = 200;     // entries drawn; typing narrows the list
const WORDS_DELAY = 500;      // ms after the last edit before the worker gathers the words again
const NEAR_LINES = 300;       // the lines above and below the cursor read on the spot
const EDITED_MAX = 5000;      // edited lines remembered between two worker runs (more: the worker catches up)
const WORD_CHAR = /[\w$]/;

const byLower = (a, b) => a.lw < b.lw ? -1 : a.lw > b.lw ? 1 : 0;

// The entries of a list sorted by lw that start with `typed`, in any case.
function* startingWith(list, typed) {
  const key = typed.toLowerCase();
  let lo = 0, hi = list.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].lw < key) lo = m + 1; else hi = m; }
  for (let i = lo; i < list.length && list[i].lw.startsWith(key); i++) yield list[i];
}

// ---------- The language's own words, once per pack ----------
const packWords = new WeakMap();
function wordsOf(lang) {
  const pack = packs[lang] ?? packs.plaintext ?? {};
  if (packWords.has(pack)) return packWords.get(pack);
  const nocase = pack.caseSensitive === false, words = [], prefixes = [], seen = new Set();
  for (const token of pack.wordOrder ?? Object.keys(pack.words ?? {})) {
    const list = pack.words?.[token];
    if (!Array.isArray(list)) continue;
    for (const w of list.map(String)) {
      if (w.endsWith('*')) { if (w.length > 1) prefixes.push({ prefix: w.slice(0, -1), token }); continue; }
      const key = nocase ? w.toLowerCase() : w;
      if (!w || seen.has(key)) continue;   // in more than one list: the first list's, as the highlighter does
      seen.add(key);
      words.push({ w, lw: w.toLowerCase(), token });
    }
  }
  words.sort(byLower);
  prefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  // Snippets: the pack's insert actions, named by their title without "Snippet: ".
  const snippets = Object.entries(pack.actions ?? {}).filter(([, a]) => a?.insert != null).map(([name, a]) => {
    const label = String(a.title ?? name).replace(/^snippet:\s*/i, '');
    return { w: label, lw: label.toLowerCase(), insert: String(a.insert) };
  });
  const entry = { words, prefixes, snippets, nocase };
  packWords.set(pack, entry);
  return entry;
}

// The prefixes of every pack, for the worker (the document's words do not depend on the language at the cursor).
function allPrefixes() {
  const set = new Set();
  for (const pack of Object.values(packs)) for (const list of Object.values(pack?.words ?? {}))
    if (Array.isArray(list)) for (const w of list.map(String)) if (w.endsWith('*') && w.length > 1) set.add(w.slice(0, -1));
  return [...set];
}

// Where the word before `ch` starts: word characters, and before them the leading signs of a prefix ('@', '@@').
function wordStart(line, ch, prefixes) {
  let start = ch;
  while (start > 0 && WORD_CHAR.test(line[start - 1])) start--;
  for (const { prefix } of prefixes) {   // the longest first
    const lead = prefix.match(/^[^\w$]*/)[0];
    if (lead && start >= lead.length && line.slice(start - lead.length, start) === lead) return start - lead.length;
  }
  return start;
}

// ---------- The document's words: the worker ----------
let wordsWorker = null, wordsRun = 0;
const wordsWaiting = new Map();

function startWords(doc) {
  if (!doc?.cmDoc) return;
  if (doc.wordsBusy) { doc.wordsAgain = true; return; }
  if (!wordsWorker) {
    try { wordsWorker = new Worker('words.worker.js'); } catch { return; }   // without it: the lines read on the spot
    wordsWorker.onmessage = ({ data }) => {
      const d = wordsWaiting.get(data.id);
      wordsWaiting.delete(data.id);
      if (!d) return;
      d.wordsBusy = false;
      d.wordsList = { words: data.words, prefixed: data.prefixed };
      if (d.wordsAgain) { d.wordsAgain = false; scheduleWords(d); }
    };
  }
  doc.wordsBusy = true;
  doc.wordsEdited = new Set();   // edits from now on are read on the spot until the next run
  const id = ++wordsRun;
  wordsWaiting.set(id, doc);
  wordsWorker.postMessage({ id, text: doc.cmDoc.getValue(), prefixes: allPrefixes() });
}

function scheduleWords(doc) {
  clearTimeout(doc.wordsTimer);
  doc.wordsTimer = setTimeout(() => startWords(doc), WORDS_DELAY);
}

function noteEdit(doc, change) {
  if (!doc) return;
  const edited = doc.wordsEdited ??= new Set();
  if (edited.size < EDITED_MAX) for (let l = change.from.line; l < change.from.line + change.text.length; l++) edited.add(l);
  scheduleWords(doc);
}

// The words of the lines near the cursor and of the lines edited since the worker's run: { w -> { n, near } }.
function freshWords(cm, doc, at, preRe) {
  const words = new Map(), prefixed = new Map(), last = cm.lastLine();
  const lines = new Set(doc.wordsEdited ?? []);
  for (let l = Math.max(0, at - NEAR_LINES); l <= Math.min(last, at + NEAR_LINES); l++) lines.add(l);
  const add = (map, w, l) => {
    const e = map.get(w), near = Math.abs(l - at);
    if (e) { e.n++; e.near = Math.min(e.near, near); } else map.set(w, { n: 1, near });
  };
  for (const l of lines) {
    if (l > last) continue;
    const t = cm.getLine(l);
    for (const m of t.matchAll(/[\w$]+/g)) if (m[0].length >= 3 && !/^\d/.test(m[0])) add(words, m[0], l);
    if (preRe) for (const m of t.matchAll(preRe)) add(prefixed, m[0], l);
  }
  return { words, prefixed };
}

// The distance from line `at` to the closest of `lines` (sorted).
function nearest(lines, at) {
  let lo = 0, hi = lines.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (lines[m] < at) lo = m + 1; else hi = m; }
  let best = Infinity;
  if (lo < lines.length) best = lines[lo] - at;
  if (lo > 0) best = Math.min(best, at - lines[lo - 1]);
  return best;
}

// A keyword of an any-case language in the case of what is typed: SEL -> SELECT, sel -> select, Sel -> Select.
function caseLike(w, typed) {
  if (!/[a-z]/i.test(typed)) return w;
  if (typed === typed.toUpperCase()) return w.toUpperCase();
  if (typed === typed.toLowerCase()) return w.toLowerCase();
  if (typed[0] === typed[0].toUpperCase() && typed.slice(1) === typed.slice(1).toLowerCase()) return w[0].toUpperCase() + w.slice(1).toLowerCase();
  return w;
}

// ---------- The list ----------
// What completes the word before the main cursor; null for no list (also when only the word itself would be in it).
function completionsAt(cm, pane) {
  const doc = pane.active?.doc;
  if (!doc) return null;
  const cur = cm.getCursor(), text = cm.getLine(cur.line);
  const lang = lineLanguage(cm, cur.line) ?? languageOf(doc), L = wordsOf(lang);   // format.js, languages.js
  const start = wordStart(text, cur.ch, L.prefixes), typed = text.slice(start, cur.ch);
  let end = cur.ch;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  const whole = text.slice(start, end), lower = typed.toLowerCase();
  const fits = w => L.nocase ? w.toLowerCase().startsWith(lower) : w.startsWith(typed);
  const out = [], seen = new Set(), key = w => L.nocase ? w.toLowerCase() : w;
  const add = (w, rank, label, near = Infinity, insert) => {
    const k = key(w);
    if (seen.has(k) || w === typed) return;   // what is typed already completes nothing
    seen.add(k);
    out.push({ w, rank, label, near, insert, exact: w.startsWith(typed) });
  };
  // 1. Keywords.
  for (const e of startingWith(L.words, typed)) if (fits(e.w)) add(L.nocase ? caseLike(e.w, typed) : e.w, 0, e.token);
  // 2 and 3. The document's words: the worker's list, and the lines read on the spot.
  const list = doc.wordsList;
  if (!list && !doc.wordsBusy) startWords(doc);   // the first time: from now on in the background
  const preRe = L.prefixes.length
    ? new RegExp('(?:' + L.prefixes.map(p => escapeRegex(p.prefix)).join('|') + ')[\\w$]*', 'g') : null;
  const fresh = freshWords(cm, doc, cur.line, preRe);
  const docWord = (w, rank, label, workerEntry, freshEntry) => {
    if (w === whole && (workerEntry?.n ?? 0) <= 1 && (freshEntry?.n ?? 0) <= 1) return;   // only the word being typed
    if (!fits(w)) return;
    const near = Math.min(workerEntry ? nearest(workerEntry.lines, cur.line) : Infinity, freshEntry?.near ?? Infinity);
    add(w, rank, label, near);
  };
  if (preRe) {
    const tokenOf = w => L.prefixes.find(p => w.startsWith(p.prefix) && w.length > p.prefix.length)?.token;
    const freshPre = [...fresh.prefixed.keys()].filter(w => w.toLowerCase().startsWith(lower));
    const candidates = new Set([...(list ? [...startingWith(list.prefixed, typed)].map(e => e.w) : []), ...freshPre]);
    const workerPre = list && new Map([...startingWith(list.prefixed, typed)].map(e => [e.w, e]));
    for (const w of candidates) { const t = tokenOf(w); if (t) docWord(w, 1, t, workerPre?.get(w), fresh.prefixed.get(w)); }
  }
  if (WORD_CHAR.test(typed[0] ?? 'a')) {   // a typed '@' has no plain words
    const workerWords = list ? new Map([...startingWith(list.words, typed)].map(e => [e.w, e])) : new Map();
    const freshW = [...fresh.words.keys()].filter(w => w.toLowerCase().startsWith(lower));
    for (const w of new Set([...workerWords.keys(), ...freshW])) docWord(w, 2, '', workerWords.get(w), fresh.words.get(w));
  }
  // 4. Snippets (any case).
  for (const s of L.snippets) if (s.lw.startsWith(lower)) out.push({ w: s.w, rank: 3, label: 'snippet', near: Infinity, insert: s.insert, exact: true });
  out.sort((a, b) => a.rank - b.rank || (b.exact - a.exact) || a.near - b.near || byLower({ lw: a.w.toLowerCase() }, { lw: b.w.toLowerCase() }));
  if (!out.length) return null;
  return { from: CodeMirror.Pos(cur.line, start), to: cur, typed, prefixes: L.prefixes, entries: out.slice(0, COMPLETE_MAX) };
}

// The chosen entry: at every cursor, each completing its own word; a snippet at the main cursor.
function pickCompletion(cm, entry, prefixes) {
  if (entry.insert != null) {
    cm.operation(() => {
      cm.setCursor(cm.getCursor());
      const cur = cm.getCursor(), start = wordStart(cm.getLine(cur.line), cur.ch, prefixes);
      cm.replaceRange('', CodeMirror.Pos(cur.line, start), cur, '+complete');
      insertSnippet(cm, entry.insert);   // languages.js
    });
    return;
  }
  cm.operation(() => {
    const heads = cm.listSelections().filter(r => r.empty()).map(r => r.head).sort((a, b) => CodeMirror.cmpPos(b, a));
    for (const h of heads) {
      const start = wordStart(cm.getLine(h.line), h.ch, prefixes);
      cm.replaceRange(entry.w, CodeMirror.Pos(h.line, start), h, '+complete');
    }
  });
}

function showCompletion(pane) {
  const cm = pane?.cm;
  if (!cm || cm.getOption('readOnly') || pane.active?.mode === 'preview') return;
  // Several cursors: the list opens on the main one (show-hint takes one), the others back right after; a pick
  // completes at each of them (pickCompletion).
  const ranges = cm.listSelections();
  if (ranges.length > 1) {
    if (ranges.some(r => !r.empty())) return;
    cm.setSelection(cm.getCursor());
  }
  const main = ranges.findIndex(r => !CodeMirror.cmpPos(r.head, cm.getCursor()));
  try { openHint(cm, pane); } finally { if (ranges.length > 1) cm.setSelections(ranges, Math.max(0, main)); }
}

function openHint(cm, pane) {
  cm.showHint({
    completeSingle: false, alignWithWord: true, closeCharacters: /[^\w$]/,
    hint: c => {
      const found = completionsAt(c, pane);
      if (!found) return null;
      return {
        from: found.from, to: found.to,
        list: found.entries.map(e => ({
          text: e.w, displayText: e.w,
          render: el => {
            const name = document.createElement('span'), kind = document.createElement('span');
            name.textContent = e.w;
            kind.className = 'mm-hint-kind';
            kind.textContent = e.label;
            el.append(name, kind);
          },
          hint: cmx => pickCompletion(cmx, e, found.prefixes),
        })),
      };
    },
  });
}

// The editor's watch: the edits for the worker, and the pause in typing (setting completeDelay).
function setupComplete(pane) {
  const cm = pane.cm;
  cm.on('change', (_, change) => noteEdit(pane.active?.doc, change));
  cm.on('inputRead', (_, change) => {
    clearTimeout(pane.completeTimer);
    const delay = setting('completeDelay') ?? 0;
    if (!delay || change.origin !== '+input' || cm.state.completionActive) return;
    if (!WORD_CHAR.test(change.text.join('\n').slice(-1))) return;
    const at = cm.getCursor();
    pane.completeTimer = setTimeout(() => {
      if (cm.state.completionActive || !cm.hasFocus() || cm.somethingSelected() || CodeMirror.cmpPos(cm.getCursor(), at)) return;
      showCompletion(pane);
    }, delay);
  });
}
