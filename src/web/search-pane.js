// The Search pane as a page of its own (docs/plans/executed/PLAN-docking.md 3.3): search and replace in files. The window's
// page does the work: it searches (the open documents' text as it has it, unsaved edits too; the files in the folder
// through the host), replaces (an open document as one undo step) and keeps the history; it sends the results as rows
// to show. This page has the fields, the switches, the scope, the replace row and the results, and sends what is done
// with them. The find history's keys and list (history.js, as in the window's find bar) work here on its two fields.
const $ = sel => document.querySelector(sel);
const input = $('.mm-search-input'), withEl = $('.mm-search-with'), scopeEl = $('.mm-search-scope');
const row = $('.mm-search-replace'), toggleEl = $('.mm-search-toggle'), statusEl = $('.mm-search-status'), results = $('.mm-search-results');
const options = { case: false, word: false, regex: false, known: false };

// history.js asks the host only to clear a list: that goes to the window, which keeps the lists.
function host(op, args) {
  if (op === 'findHistoryClear') toWindow({ kind: 'clearHistory', which: args.kind });
  return Promise.resolve();
}
function setting() { return undefined; }

const field = name => name === 'with' ? withEl : input;
paneHandlers.text = m => { field(m.field).value = m.value; };
paneHandlers.focus = m => {
  const el = field(m.field);
  el.focus();
  if (m.select) el.select();
};
paneHandlers.options = m => { Object.assign(options, m.options); showOptions(); };
paneHandlers.scope = m => { scopeEl.value = m.value; };
paneHandlers.replace = m => {
  row.hidden = !m.on;
  toggleEl.classList.toggle('mm-on', m.on);
  document.body.toggleAttribute('data-search-replace', m.on);
};
paneHandlers.status = m => { statusEl.textContent = m.text; };
// F3 (the window's f3Take; plan 47): the tag lit while F3 comes here, shown while there are results; the result F3 went
// to marked and in view (quiet: the list drawn again, the mark back).
const f3El = $('.mm-search-f3');
paneHandlers.f3 = m => { f3El.hidden = !m.shown; f3El.classList.toggle('mm-on', !!m.on); };
f3El.addEventListener('click', () => toWindow({ kind: 'f3' }));
paneHandlers.current = m => {
  for (const on of results.querySelectorAll('.mm-result.mm-on')) on.classList.remove('mm-on');
  const hit = results.querySelector(`.mm-result[data-hit="${m.hit}"]`);
  hit?.classList.add('mm-on');
  if (!m.quiet) { hit?.closest('.mm-result-list')?.previousElementSibling?.classList.remove('mm-closed'); hit?.scrollIntoView({ block: 'nearest' }); }
};
paneHandlers.results = m => { results.innerHTML = m.html; };   // made by the window's page, its texts escaped
paneHandlers.history = m => Object.assign(findHistory, m.lists);

function showOptions() {
  for (const b of document.querySelectorAll('.mm-search-bar [data-opt]')) b.classList.toggle('mm-on', !!options[b.dataset.opt]);
}

input.addEventListener('input', () => toWindow({ kind: 'input', field: 'find', value: input.value }));
withEl.addEventListener('input', () => toWindow({ kind: 'input', field: 'with', value: withEl.value }));
for (const el of [input, withEl])
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;   // the history list takes its own Enter
    e.preventDefault();
    toWindow({ kind: 'run' });
  });
for (const b of document.querySelectorAll('.mm-search-bar [data-opt]'))
  b.addEventListener('click', () => {
    options[b.dataset.opt] = !options[b.dataset.opt];
    showOptions();
    toWindow({ kind: 'options', options: { ...options }, run: true });
  });
scopeEl.addEventListener('change', () => toWindow({ kind: 'scope', value: scopeEl.value }));
toggleEl.addEventListener('click', () => toWindow({ kind: 'toggleReplace' }));
$('.mm-search-all').addEventListener('click', () => toWindow({ kind: 'replaceAll' }));
$('.mm-search-preview').addEventListener('click', () => toWindow({ kind: 'preview' }));
$('.mm-search-codes').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  toWindow({ kind: 'codes', left: r.left, right: r.right, top: r.top, bottom: r.bottom });
});

// The results: a file's head folds its matches or (its Replace) replaces in that file; a match goes there in the
// window (Alt+click: in the active tab; Ctrl+click: in the other pane; Shift+click: a new tab) or (its Replace) is replaced.
results.addEventListener('click', e => {
  const head = e.target.closest('.mm-result-file');
  if (head && e.target.closest('.mm-result-rep')) return toWindow({ kind: 'replaceFile', group: +head.dataset.group });
  if (head) return head.classList.toggle('mm-closed');
  const hit = e.target.closest('.mm-result');
  if (!hit) return;
  if (e.target.closest('.mm-result-rep')) return toWindow({ kind: 'replaceMatch', hit: +hit.dataset.hit });
  for (const on of results.querySelectorAll('.mm-result.mm-on')) on.classList.remove('mm-on');
  hit.classList.add('mm-on');
  toWindow({ kind: 'goto', hit: +hit.dataset.hit, here: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
});

// Esc: back as before the search (the window decides); Alt+A: Replace all, with the replace row shown. On the document:
// before pane.js's own listener on the window, which passes on the keys the pane does not use.
document.addEventListener('keydown', e => {
  if (e.defaultPrevented) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    toWindow({ kind: 'escape' });
  } else if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'a' && !row.hidden) {
    e.preventDefault();
    toWindow({ kind: 'replaceAll' });
  }
});

// The history on its fields, once history.js has run (it comes after this script).
addEventListener('DOMContentLoaded', () => {
  attachHistory(input, 'find', (entry, typed) => {
    input.value = entry.text;
    toWindow({ kind: 'input', field: 'find', value: input.value });
    if (typed) return;
    for (const k of Object.keys(options)) options[k] = !!entry[k];
    showOptions();
    toWindow({ kind: 'options', options: { ...options } });
  });
  attachHistory(withEl, 'replace', entry => {
    withEl.value = entry.text;
    toWindow({ kind: 'input', field: 'with', value: withEl.value });
  });
});
