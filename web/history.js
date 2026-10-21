'use strict';
// Find history (docs/plans/07-PLAN-find-history.md): the last searches with their switches (case, word, regex) and
// the last replacements, newest first, shared by all windows (the host keeps them, AppHost.FindHistory). The find
// bar's field and the search in files share the searches; the replace field has its own list. In a field: Up / Down
// step through the list (Up: older); Alt+Down, or Down in an empty field, opens it to pick from; the list ends with
// "Clear history". Recorded when a search is done (Enter, F3, the arrows, Replace, the search in files), not while
// typing. Setting findHistory: how many are kept.
// Loaded before app.js; nothing here runs before app.js has started.

const findHistory = { find: [], replace: [] };
let historyList = null;   // the open list: { el, input, kind, apply, items, at }

async function loadFindHistory() {
  Object.assign(findHistory, await host('findHistory').catch(() => ({})));
}
// Another window (or this one) changed a list.
function onFindHistory({ lists }) { Object.assign(findHistory, lists); }

// A search done: its text and switches on top of the list (every window gets it).
function recordFind(text, options) {
  if (!text || (setting('findHistory') ?? 20) <= 0) return;
  const top = findHistory.find[0];
  if (top && top.text === text && !!top.case === !!options.case && !!top.word === !!options.word && !!top.regex === !!options.regex) return;
  host('findHistoryAdd', { kind: 'find', entry: { text, case: !!options.case, word: !!options.word, regex: !!options.regex } }).catch(() => {});
}

function recordReplace(text) {
  if (!text || findHistory.replace[0] === text || (setting('findHistory') ?? 20) <= 0) return;
  host('findHistoryAdd', { kind: 'replace', entry: { text } }).catch(() => {});
}

// A field with a history: `kind` find or replace; `apply(entry)` puts an entry in (find: its switches too).
const historyFields = new Map();
function attachHistory(input, kind, apply) {
  historyFields.set(input, { kind, apply, at: -1, typed: '' });
  input.addEventListener('input', () => { const f = historyFields.get(input); f.at = -1; f.typed = input.value; });
  input.addEventListener('blur', () => setTimeout(() => { if (historyList?.input === input && !historyList.el.contains(document.activeElement)) closeHistory(); }, 150));
}

const historyEntries = kind => kind === 'find' ? findHistory.find : findHistory.replace.map(text => ({ text }));

// Up / Down: the next older / newer entry in the field; past the newest, the text as typed.
function stepHistory(input, dir) {
  const f = historyFields.get(input), list = historyEntries(f.kind);
  if (f.at === -1) f.typed = input.value;
  const at = Math.max(-1, Math.min(list.length - 1, f.at + dir));
  if (at === f.at) return;
  f.at = at;
  if (at === -1) f.apply({ text: f.typed }, true); else f.apply(list[at]);
  input.setSelectionRange(input.value.length, input.value.length);
}

function openHistory(input) {
  closeHistory();
  const f = historyFields.get(input), items = historyEntries(f.kind);
  const el = document.createElement('div');
  el.className = 'mm-history';
  const flags = e => ['case', 'word', 'regex'].filter(k => e[k]).map(k => ({ case: 'Aa', word: 'W', regex: '.*' })[k]).join(' ');
  el.innerHTML = (items.length ? items.map((e, i) => `<div class="mm-history-item" data-i="${i}"><span class="mm-history-text"></span>` +
    (flags(e) ? `<span class="mm-history-flags">${flags(e)}</span>` : '') + '</div>').join('')
    : '<div class="mm-history-none">No earlier ' + (f.kind === 'find' ? 'searches' : 'replacements') + '</div>') +
    (items.length ? '<div class="mm-history-item mm-history-clear" data-i="clear">Clear history</div>' : '');
  el.querySelectorAll('.mm-history-text').forEach((s, i) => { s.textContent = items[i].text; });
  const r = input.getBoundingClientRect();
  Object.assign(el.style, { left: r.left + 'px', top: r.bottom + 2 + 'px', minWidth: r.width + 'px' });
  el.addEventListener('mousedown', e => e.preventDefault());   // the field keeps the focus
  el.addEventListener('click', e => {
    const item = e.target.closest('.mm-history-item');
    if (item) pickHistory(item.dataset.i);
  });
  document.body.append(el);
  const max = innerHeight - r.bottom - 12;
  el.style.maxHeight = Math.max(120, max) + 'px';
  historyList = { el, input, kind: f.kind, apply: f.apply, items, at: -1 };
}

function closeHistory() {
  historyList?.el.remove();
  historyList = null;
}

function moveHistory(dir) {
  const rows = [...historyList.el.querySelectorAll('.mm-history-item')], n = rows.length;
  if (!n) return;
  let at = historyList.at + dir;
  if (at < -1) at = n - 1;
  if (at >= n) at = -1;
  historyList.at = at;
  rows.forEach((r, i) => r.classList.toggle('mm-on', i === at));
  rows[at]?.scrollIntoView({ block: 'nearest' });
}

function pickHistory(i) {
  const { input, kind, apply, items } = historyList;
  closeHistory();
  if (i === 'clear') { host('findHistoryClear', { kind }).catch(() => {}); return; }
  const entry = items[+i];
  if (!entry) return;
  historyFields.get(input).at = +i;
  apply(entry);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

// The keys, before the app's own (Alt+Down is next tab elsewhere).
addEventListener('keydown', e => {
  const input = e.target;
  if (!historyFields.has(input)) return;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (historyList?.input === input) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { stop(); return moveHistory(e.key === 'ArrowDown' ? 1 : -1); }
    if (e.key === 'Enter' && historyList.at >= 0) {
      stop();
      return pickHistory(historyList.el.querySelectorAll('.mm-history-item')[historyList.at].dataset.i);
    }
    if (e.key === 'Escape' || (e.key === 'ArrowUp' && e.altKey)) { stop(); return closeHistory(); }
    closeHistory();
    return;
  }
  if (e.ctrlKey || e.shiftKey || e.metaKey) return;
  if (e.key === 'ArrowDown' && (e.altKey || !input.value)) { stop(); return openHistory(input); }
  if (e.altKey) return;
  if (e.key === 'ArrowUp') { stop(); return stepHistory(input, 1); }
  if (e.key === 'ArrowDown') { stop(); return stepHistory(input, -1); }
}, true);
