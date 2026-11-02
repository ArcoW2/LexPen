'use strict';
// The highlights window's page (highlights.html; HighlightsForm hosts it), docs/plans/executed/PLAN-highlights.md 3.5: the
// highlights of the document last worked in (each LexPen window tells the host; event `shown`), or of every file
// (the host's store; op `all`), in text order, each with its line, its text and its note; detached ones in a group of
// their own. A search (Ctrl+F) keeps only those whose note or text has every word typed (any case, any order), the
// words marked; with no match in this file it offers all files. Enter, a click or a double click goes to the
// highlight in the LexPen window last worked in (the window stays open, the search too); Up / Down move through the
// list; Esc empties the search, Esc again goes back to the LexPen window. Right-click: Edit note, Keep, Attach to
// selection, Remove.

const $ = s => document.querySelector(s);

// ---------- Host bridge (as in charpage.js) ----------
const pending = new Map(), events = {};
let lastId = 0;
function host(op, args) {
  return new Promise((resolve, reject) => {
    pending.set(++lastId, { resolve, reject });
    chrome.webview.postMessage({ ...args, id: lastId, op });
  });
}
chrome.webview.addEventListener('message', e => {
  if (e.data.event) return events[e.data.event]?.(e.data);
  const { id, result, error } = e.data;
  const call = pending.get(id);
  pending.delete(id);
  error ? call.reject(new Error(error)) : call.resolve(result);
});

const view = {
  search: $('.hv-search'), list: $('.hv-list'), name: $('.hv-name'), count: $('.hv-count'), offer: $('.hv-offer'), menu: $('.hv-menu'),
  shown: null, all: null, scope: 'file', items: [], on: -1, menuItem: null, values: {},
};
const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nameOf = p => p ? p.split(/[\\/]/).pop() : '';

// ---------- Look: the app's theme (as the character picker) ----------
let themeVars = [];
function applyLook(look) {
  if (look) {
    document.documentElement.dataset.theme = look.mode;
    for (const name of themeVars) document.documentElement.style.removeProperty(name);
    for (const [name, value] of Object.entries(look.app.vars)) document.documentElement.style.setProperty(name, value);
    themeVars = Object.keys(look.app.vars);
  }
  const v = view.values, root = document.documentElement.style;
  root.setProperty('--app-font', v.appFont ? `"${v.appFont.replace(/["\\]/g, '')}", "Segoe UI", system-ui, sans-serif` : '"Segoe UI", system-ui, sans-serif');
  root.setProperty('--ui-scale', v.appSize ? v.appSize * 96 / 72 / 13 : 1);
}

// ---------- The list ----------
// The search's words, lower case.
const words = () => view.search.value.toLowerCase().split(/\s+/).filter(Boolean);
const matches = (h, ws) => { const hay = (h.note + '\n' + h.text).toLowerCase(); return ws.every(w => hay.includes(w)); };
// A text with the search's words marked.
function marked(text, ws) {
  let html = escapeHtml(text);
  for (const w of ws) html = html.replace(new RegExp(escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<span class="hv-mark">${m}</span>`);
  return html;
}

// The files the list holds: this file (the document last worked in, live), or every file (the store; the document
// last worked in replaced by its live list).
function files() {
  const shown = view.shown;
  if (view.scope === 'file') return shown ? [{ path: shown.path, draft: shown.draft, name: shown.name, list: shown.list, live: true }] : [];
  const all = (view.all ?? []).map(f => ({ ...f, name: f.path ? nameOf(f.path) : 'Draft ' + f.draft,
    list: (f.list ?? []).map((h, i) => ({ id: null, index: i, line: h.from ? h.from[0] : null, text: h.text ?? '', note: h.note ?? '', state: h.state ?? '', was: h.was ?? null })) }));
  const same = f => shown && (shown.path ? f.path && f.path.toLowerCase() === shown.path.toLowerCase() : f.draft === shown.draft);
  const rest = all.filter(f => !same(f));
  return shown?.list.length ? [{ path: shown.path, draft: shown.draft, name: shown.name, list: shown.list, live: true }, ...rest] : rest;
}

function draw() {
  const ws = words(), out = [];
  view.items = [];
  let total = 0, shownHere = 0;
  const all = files();
  for (const f of all) {
    const hits = f.list.filter(h => matches(h, ws));
    if (f.live) shownHere = hits.length;
    if (!hits.length) continue;
    total += hits.length;
    if (view.scope === 'all') out.push(`<div class="hv-group${f.missing ? ' hv-missing' : ''}" title="${escapeHtml(f.path ?? '')}">${escapeHtml(f.name)}${f.missing ? ' (the file is gone)' : ''}</div>`);
    const placed = hits.filter(h => h.state !== 'detached'), detached = hits.filter(h => h.state === 'detached');
    for (const [group, list] of [[null, placed], ['No longer in the file', detached]]) {
      if (!list.length) continue;
      if (group) out.push(`<div class="hv-group-sub">${group}</div>`);
      for (const h of list) {
        const i = view.items.push({ file: f, h }) - 1;
        out.push(`<div class="hv-item${h.state ? ' hv-' + h.state : ''}" data-i="${i}" title="${escapeHtml(h.note || h.text)}">` +
          `<span class="hv-line">${h.line == null ? '' : h.line + 1}</span><span class="hv-text">${marked(h.text.replace(/\s+/g, ' '), ws)}</span>` +
          (h.note ? `<span class="hv-note">${marked(h.note, ws)}</span>` : '') +
          (h.state === 'adjusted' && h.was != null ? `<span class="hv-was">The text was: ${escapeHtml(h.was.replace(/\s+/g, ' '))}</span>` : '') + '</div>');
      }
    }
  }
  view.list.innerHTML = out.join('') || `<div class="hv-empty">${ws.length ? 'No highlight matches the search.' : view.scope === 'file' ? 'No highlights in this document.' : 'No highlights in any file.'}</div>`;
  const here = view.shown;
  view.name.textContent = view.scope === 'file' ? (here ? here.name : 'No document') : 'All files';
  view.count.textContent = total + (ws.length ? ' found' : ' highlight' + (total === 1 ? '' : 's'));
  view.offer.hidden = !(view.scope === 'file' && ws.length && !shownHere);
  view.on = Math.min(view.on, view.items.length - 1);
  if (view.on < 0 && view.items.length && ws.length) view.on = 0;
  mark();
}

function mark() {
  for (const el of view.list.querySelectorAll('.hv-item')) el.classList.toggle('hv-on', +el.dataset.i === view.on);
  view.list.querySelector('.hv-on')?.scrollIntoView({ block: 'nearest' });
}

// To a highlight: in the LexPen window last worked in (this window stays open).
function go(i) {
  const item = view.items[i];
  if (!item || item.h.state === 'detached') return;
  view.on = i;
  mark();
  const { file, h } = item;
  if (file.live) host('go', { hid: h.id, from: h.from, to: h.to });
  else host('go', { path: file.path, hid: null, from: null, to: null, index: h.index, line: h.line, text: h.text });
}

// ---------- Input ----------
view.search.addEventListener('input', () => { view.on = -1; draw(); });
view.search.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    view.on = Math.max(0, Math.min(view.items.length - 1, view.on + (e.key === 'ArrowDown' ? 1 : -1)));
    mark();
  } else if (e.key === 'Enter') { e.preventDefault(); go(Math.max(0, view.on)); }
});
view.list.addEventListener('click', e => { const el = e.target.closest('.hv-item'); if (el) go(+el.dataset.i); });
view.list.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); view.on = Math.max(0, Math.min(view.items.length - 1, view.on + (e.key === 'ArrowDown' ? 1 : -1))); mark(); }
  else if (e.key === 'Enter') { e.preventDefault(); go(view.on); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'f' && e.ctrlKey) { e.preventDefault(); view.search.focus(); view.search.select(); }
  else if (e.key === 'Escape') {
    view.menu.hidden = true;
    if (view.search.value) { view.search.value = ''; view.on = -1; draw(); view.search.focus(); }
    else host('back');
  }
});
for (const radio of document.querySelectorAll('[name=hv-scope]'))
  radio.addEventListener('change', async () => { view.scope = radio.value; if (view.scope === 'all') view.all = await host('all'); view.on = -1; draw(); });
$('.hv-search-all').addEventListener('click', async () => {
  document.querySelector('[name=hv-scope][value=all]').checked = true;
  view.scope = 'all';
  view.all = await host('all');
  view.on = -1;
  draw();
});

// Right-click: what can be done with it (the document last worked in; a file that is gone: forget it).
view.list.addEventListener('contextmenu', e => {
  const el = e.target.closest('.hv-item');
  e.preventDefault();
  if (!el) return;
  const item = view.items[+el.dataset.i];
  view.menuItem = item;
  const live = item.file.live, h = item.h;
  for (const b of view.menu.querySelectorAll('button')) {
    const act = b.dataset.act;
    b.hidden = act === 'forget' ? !item.file.missing : !live || (act === 'keep' && h.state !== 'adjusted') || (act === 'attach' && h.state !== 'detached');
  }
  view.menu.hidden = false;
  view.menu.style.left = Math.min(e.clientX, innerWidth - view.menu.offsetWidth - 4) + 'px';
  view.menu.style.top = Math.min(e.clientY, innerHeight - view.menu.offsetHeight - 4) + 'px';
});
view.menu.addEventListener('click', async e => {
  const act = e.target.closest('button')?.dataset.act, item = view.menuItem;
  view.menu.hidden = true;
  if (!act || !item) return;
  if (act === 'forget') { await host('forget', { path: item.file.path, draft: item.file.draft }); view.all = await host('all'); return draw(); }
  host('action', { action: act, hid: item.h.id });
});
document.addEventListener('mousedown', e => { if (!view.menu.contains(e.target)) view.menu.hidden = true; });

// ---------- From the host ----------
events.look = ({ look }) => applyLook(look);
events.settings = ({ settings }) => { view.values = settings ?? {}; applyLook(null); };
events.shown = ({ shown }) => { view.shown = shown?.none ? null : shown; draw(); };   // none: no document there
events.changed = async () => { if (view.scope === 'all') { view.all = await host('all'); draw(); } };

(async () => {
  const init = await host('init');
  view.values = init.settings ?? {};
  applyLook(init.look);
  view.shown = init.shown?.none ? null : init.shown;
  draw();
  if (parent === window) view.search.focus();   // docked (a frame), the keys stay where they are
})();
