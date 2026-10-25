'use strict';
// The Manage projects window's page (projects.html; ProjectsForm hosts it), docs/plans/executed/PLAN-manage-projects.md:
// every project in one list with a checkbox, its name, open or closed, folders, tabs, drafts, created and last used;
// a row unfolds to show its windows and their files. A search filters on name, folder and file; the list sorts by
// name, created or last used (View menu or the column headers; the choice is the setting projectsSort). The menus
// (Project, Select, View) and the buttons act on the checked projects that are shown; the host does the work
// (AppHost: open, close, merge, rename, delete, new) and asks about unsaved documents and drafts itself.
// Checking: a click toggles a project and is the anchor; Shift+click sets every row from the anchor to it to the
// clicked one's new state. The order of checking is kept: the first one checked is the target of Merge.
// Keys: Up / Down move, Space checks (Shift: range), Enter opens, F2 renames, Del deletes, Right / Left unfold and
// fold (Ctrl: the checked rows, or all), Ctrl+A checks all, Ctrl+F searches, Esc empties the search, then goes back.

const $ = s => document.querySelector(s);

// ---------- Host bridge (as in highlightsview.js) ----------
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
  list: [], values: {}, search: $('.pv-search'), el: $('.pv-list'), count: $('.pv-count'),
  checked: new Map(),   // id -> true, in the order of checking (Merge: the first is the target)
  anchor: null, focus: null, unfolded: new Set(), renaming: null, busy: false, shown: [],
};
const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Look: the app's theme (as the highlights window) ----------
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

// ---------- Sorting and filtering ----------
// The setting projectsSort: "name", "created" or "used", then "-asc" or "-desc".
function sortOf() {
  const [by, dir] = String(view.values.projectsSort ?? 'used-desc').split('-');
  return { by: ['name', 'created', 'used'].includes(by) ? by : 'used', desc: dir !== 'asc' };
}
function setSort(by, desc) {
  view.values.projectsSort = `${by}-${desc ? 'desc' : 'asc'}`;
  host('setting', { name: 'projectsSort', value: view.values.projectsSort });
  draw();
}
// Name: the named projects alphabetically (case ignored), then the unnamed ones by their number. Created: those from
// before LexPen kept the date by their id (the creation order), before the dated ones.
function compare(a, b, by) {
  if (by === 'name') {
    if (!!a.name !== !!b.name) return a.name ? -1 : 1;
    return a.name ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.id - b.id : a.id - b.id;
  }
  if (by === 'created') {
    if (!!a.created !== !!b.created) return a.created ? 1 : -1;
    return a.created ? Date.parse(a.created) - Date.parse(b.created) || a.id - b.id : a.id - b.id;
  }
  return (a.used ? Date.parse(a.used) : 0) - (b.used ? Date.parse(b.used) : 0) || a.id - b.id;
}

const words = () => view.search.value.toLowerCase().split(/\s+/).filter(Boolean);
const filesOf = p => p.windows.flatMap(w => w.files ?? []);
const haystack = p => [p.display, ...p.windows.map(w => w.folder ?? ''), ...filesOf(p).map(f => f.path ?? f.name)].join('\n').toLowerCase();

// The rows shown: filtered, then sorted.
function shownRows() {
  const ws = words(), { by, desc } = sortOf();
  const rows = view.list.filter(p => { const hay = haystack(p); return ws.every(w => hay.includes(w)); });
  rows.sort((a, b) => compare(a, b, by));
  if (desc) rows.reverse();
  return rows;
}

// The checked projects that are shown, in the order of checking.
function selected() {
  const shown = new Set(view.shown.map(p => p.id));
  return [...view.checked.keys()].filter(id => shown.has(id));
}
const byId = id => view.list.find(p => p.id === id);

// ---------- Drawing ----------
const pad = n => String(n).padStart(2, '0');
function dateText(iso, time) {
  if (!iso) return '--';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` + (time ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : '');
}
function marked(text, ws) {
  let html = escapeHtml(text);
  for (const w of ws) html = html.replace(new RegExp(escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<span class="pv-mark">${m}</span>`);
  return html;
}
const folderOf = p => [...new Set(p.windows.map(w => w.folder).filter(Boolean))];
const tabsOf = p => p.windows.reduce((n, w) => n + (w.tabs ?? 0), 0);

function rowHtml(p, ws) {
  const unfolded = view.unfolded.has(p.id);
  const cls = ['pv-row', 'pv-grid', view.checked.has(p.id) && 'pv-checked', view.focus === p.id && 'pv-focus', unfolded && 'pv-unfolded'].filter(Boolean).join(' ');
  const folders = folderOf(p);
  const name = view.renaming === p.id
    ? `<input class="pv-rename" value="${escapeHtml(p.name)}" placeholder="Empty: Project ${p.id}" spellcheck="false">`
    : marked(p.display, ws);
  let html = `<div class="${cls}" data-id="${p.id}">` +
    `<button class="pv-fold" tabindex="-1" title="Its windows and files (Right / Left)"></button>` +
    `<input type="checkbox" class="pv-check" tabindex="-1"${view.checked.has(p.id) ? ' checked' : ''}>` +
    `<span class="pv-name${p.name ? '' : ' pv-unnamed'}" title="${escapeHtml(p.display)}">${name}</span>` +
    `<span class="pv-state${p.open ? ' pv-open-now' : ''}">${p.open ? 'open' : 'closed'}</span>` +
    `<span class="pv-folders" title="${escapeHtml(folders.join('\n'))}">${marked(folders.join('; ') || '(no folder)', ws)}</span>` +
    `<span class="pv-num">${tabsOf(p)}</span>` +
    `<span class="pv-num pv-drafts" title="${p.drafts ? 'Drafts: new documents never saved as a file' : ''}">${p.drafts ? '\u270E ' + p.drafts : ''}</span>` +
    `<span class="pv-date">${dateText(p.created, false)}</span>` +
    `<span class="pv-date">${dateText(p.used, true)}</span></div>`;
  if (unfolded) {
    html += `<div class="pv-details" data-id="${p.id}">` + (p.windows.length ? p.windows.map((w, i) => {
      const files = (w.files ?? []).map(f => f.draft ? `<span class="pv-draft">\u270E ${marked(f.name, ws)}</span>` : marked(f.name, ws)).join(', ');
      return `<button class="pv-window" data-key="${w.key}" title="Open just this window"><b>Window ${i + 1}</b>: ` +
        `${marked(w.folder ?? '(no folder)', ws)}, ${w.open ? 'open' : 'closed'}` +
        `<span class="pv-files">${files || '(no tabs)'}</span></button>`;
    }).join('') : '(no windows)') + '</div>';
  }
  return html;
}

function draw() {
  const ws = words(), { by, desc } = sortOf();
  view.shown = shownRows();
  const top = view.el.scrollTop;
  view.el.innerHTML = view.shown.length ? view.shown.map(p => rowHtml(p, ws)).join('')
    : `<div class="pv-empty">${view.list.length ? 'No project matches the search.' : 'No projects.'}</div>`;
  view.el.scrollTop = top;
  for (const b of document.querySelectorAll('.pv-sort')) {
    b.classList.toggle('pv-on', b.dataset.sort === by);
    b.classList.toggle('pv-desc', b.dataset.sort === by && desc);
  }
  const sel = selected();
  const all = $('.pv-all');
  all.checked = view.shown.length > 0 && sel.length === view.shown.length;
  all.indeterminate = sel.length > 0 && sel.length < view.shown.length;
  view.count.textContent = `${view.shown.length} of ${view.list.length} project${view.list.length === 1 ? '' : 's'}` +
    (sel.length ? `, ${sel.length} checked` : '');
  $('.pv-open').disabled = view.busy || !sel.length && view.focus === null;
  $('.pv-close').disabled = view.busy || !targets().some(id => byId(id)?.open);
  const input = view.el.querySelector('.pv-rename');
  if (input) { input.focus(); input.select(); }
}

// ---------- Checking ----------
function setChecked(id, on) {
  if (on) { if (!view.checked.has(id)) view.checked.set(id, true); } else view.checked.delete(id);
}
// A click on a checkbox (or Space): toggles it; with Shift, every row from the anchor to it gets its new state.
function toggle(id, range) {
  const on = !view.checked.has(id);
  const ids = view.shown.map(p => p.id), from = ids.indexOf(view.anchor), to = ids.indexOf(id);
  if (range && from >= 0 && to >= 0) {
    const [a, b] = from <= to ? [from, to] : [to, from];
    for (const x of ids.slice(a, b + 1)) setChecked(x, on);   // in the order shown, after the rows already checked
  } else setChecked(id, on);
  view.anchor = view.focus = id;
  draw();
}
function checkAll(on) {
  for (const p of view.shown) setChecked(p.id, on);
  draw();
}
function invert() {
  for (const p of view.shown) setChecked(p.id, !view.checked.has(p.id));
  draw();
}
// Adds the shown projects that pass the test to the checked ones.
function checkWhere(test) {
  for (const p of view.shown) if (test(p)) setChecked(p.id, true);
  draw();
}
const DAY = 24 * 3600 * 1000;
const SINCE = [['A week', 7], ['A month', 30], ['Three months', 91], ['Half a year', 182], ['A year', 365]];

// What an action works on: the checked projects shown, else the row with the focus.
const targets = () => { const sel = selected(); return sel.length ? sel : view.focus !== null && byId(view.focus) ? [view.focus] : []; };

// ---------- Folding ----------
function fold(ids, open) {
  for (const id of ids) open ? view.unfolded.add(id) : view.unfolded.delete(id);
  draw();
}
const shownIds = () => view.shown.map(p => p.id);

// ---------- Actions ----------
async function busy(work) {
  view.busy = true;
  draw();
  try { await work(); } finally { view.busy = false; await refresh(); }
}
const openProjects = () => { const ids = targets(); if (ids.length) host('open', { projects: ids }); };
const closeProjects = () => { const ids = targets().filter(id => byId(id)?.open); if (ids.length) busy(() => host('close', { projects: ids })); };
const deleteProjects = () => { const ids = targets(); if (ids.length) busy(() => host('delete', { projects: ids })); };
const mergeProjects = () => { const ids = selected(); if (ids.length > 1) busy(() => host('merge', { projects: ids })); };
async function newProject() {
  const name = await askName('Name of the new project');
  if (name !== null) host('new', { name });
}
function startRename() {
  const id = view.focus ?? selected()[0];
  if (id === undefined || id === null) return;
  view.focus = view.renaming = id;
  draw();
}
function endRename(keep) {
  const input = view.el.querySelector('.pv-rename');
  const id = view.renaming;
  view.renaming = null;
  if (keep && input && id !== null) host('rename', { project: id, name: input.value.trim() }).then(refresh);
  draw();
  view.el.focus();
}

// A name, or null for Cancel / Esc.
function askName(title) {
  const dialog = $('.pv-dialog'), input = $('.pv-dialog-input');
  $('.pv-dialog-label').textContent = title;
  input.value = '';
  dialog.returnValue = '';
  dialog.showModal();
  input.focus();
  return new Promise(resolve => dialog.addEventListener('close', () => {
    resolve(dialog.returnValue === 'ok' ? input.value.trim() : null);
    view.el.focus();
  }, { once: true }));
}

// ---------- The menu bar ----------
// An item: { label (with &letter), key, run, enabled, checked, sub }; '-' a line.
const MENUS = [
  ['&Project', () => {
    const sel = selected(), target = byId(sel[0]);
    return [
      { label: '&New project...', run: newProject },
      { label: '&Open', key: 'Enter', run: openProjects, enabled: targets().length > 0 },
      { label: '&Close...', run: closeProjects, enabled: targets().some(id => byId(id)?.open) },
      { label: sel.length > 1 ? `&Merge to '${target?.display ?? ''}'...` : '&Merge to...', run: mergeProjects, enabled: sel.length > 1 },
      { label: '&Rename', key: 'F2', run: startRename, enabled: view.focus !== null || sel.length > 0 },
      '-',
      { label: '&Delete...', key: 'Del', run: deleteProjects, enabled: targets().length > 0 },
    ];
  }],
  ['&Select', () => [
    { label: '&All', key: 'Ctrl+A', run: () => checkAll(true) },
    { label: '&None', run: () => checkAll(false) },
    { label: '&Invert', run: invert },
    '-',
    { label: '&Empty projects', run: () => checkWhere(p => tabsOf(p) === 0) },
    { label: 'Not &used since', sub: SINCE.map(([label, days]) => ({ label, run: () => {
      const before = Date.now() - days * DAY;
      checkWhere(p => !p.used || Date.parse(p.used) < before);
    } })) },
  ]],
  ['&View', () => {
    const { by, desc } = sortOf(), any = selected().length > 0;
    return [
      { label: 'Sort by &name', checked: by === 'name', run: () => setSort('name', false) },
      { label: 'Sort by &created', checked: by === 'created', run: () => setSort('created', true) },
      { label: 'Sort by &last used', checked: by === 'used', run: () => setSort('used', true) },
      { label: '&Reverse order', run: () => setSort(by, !desc) },
      '-',
      { label: '&Unfold all', key: 'Ctrl+Right', run: () => fold(shownIds(), true) },
      { label: 'Unfold &selected', run: () => fold(selected(), true), enabled: any },
      { label: '&Fold all', key: 'Ctrl+Left', run: () => fold(shownIds(), false) },
      { label: 'F&old selected', run: () => fold(selected(), false), enabled: any },
    ];
  }],
];
const letterOf = label => (label.match(/&(.)/)?.[1] ?? '').toLowerCase();
const labelHtml = label => escapeHtml(label).replace(/&amp;(.)/, '<u>$1</u>');

const bar = $('.pv-menubar');
const menu = { open: null, stack: [] };   // stack: the open dropdowns, each { el, items, sel }
for (const [i, [title]] of MENUS.entries()) {
  const b = document.createElement('button');
  b.className = 'mm-menutitle';
  b.innerHTML = labelHtml(title);
  b.addEventListener('mousedown', e => { e.preventDefault(); menu.open === i ? closeMenus() : openMenu(i); });
  b.addEventListener('mouseenter', () => { if (menu.open !== null && menu.open !== i) openMenu(i); });
  bar.append(b);
}

function closeMenus() {
  for (const m of menu.stack) m.el.remove();
  menu.stack = [];
  menu.open = null;
  for (const b of bar.children) b.classList.remove('mm-on');
}

function openMenu(i) {
  closeMenus();
  menu.open = i;
  const title = bar.children[i];
  title.classList.add('mm-on');
  const r = title.getBoundingClientRect();
  dropdown(MENUS[i][1](), r.left, r.bottom + 2);
}

// A dropdown at x, y; its submenus open to the right of their item.
function dropdown(items, x, y) {
  const el = document.createElement('div');
  el.className = 'mm-menu mm-dropdown pv-menu';
  const level = { el, items: items.filter(it => it !== '-'), sel: -1 };
  for (const it of items) {
    if (it === '-') { el.append(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.disabled = it.enabled === false;
    if (it.checked) b.classList.add('mm-checked');
    b.innerHTML = `<span class="mm-mark"></span><span class="mm-label">${labelHtml(it.label)}</span>` +
      (it.key ? `<span class="mm-key">${escapeHtml(it.key)}</span>` : '') + (it.sub ? '<span class="mm-arrow"></span>' : '');
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('mouseenter', () => { select(level, level.items.indexOf(it)); if (it.sub) openSub(level, it, b); else closeSubsOf(level); });
    b.addEventListener('click', () => runItem(level, it, b));
    it.button = b;
    el.append(b);
  }
  document.body.append(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = Math.max(0, Math.min(x, innerWidth - w - 2)) + 'px';
  el.style.top = Math.max(0, Math.min(y, innerHeight - h - 2)) + 'px';
  menu.stack.push(level);
  return level;
}
function closeSubsOf(level) {
  while (menu.stack.length && menu.stack.at(-1) !== level) menu.stack.pop().el.remove();
}
function openSub(level, it, b) {
  closeSubsOf(level);
  const r = b.getBoundingClientRect();
  return dropdown(it.sub, r.right - 2, r.top - 4);
}
function select(level, n) {
  level.sel = n;
  for (const [i, it] of level.items.entries()) it.button.classList.toggle('mm-sel', i === n);
}
function runItem(level, it, b) {
  if (it.enabled === false) return;
  if (it.sub) { const sub = openSub(level, it, b); select(sub, 0); return; }
  closeMenus();
  it.run();
}
// The keys of an open menu: arrows, Enter, Esc, a letter.
function menuKey(e) {
  const level = menu.stack.at(-1);
  if (!level) return false;
  const usable = level.items.map((it, i) => it.enabled === false ? -1 : i).filter(i => i >= 0);
  const step = d => { const at = usable.indexOf(level.sel); select(level, usable[(at + d + usable.length) % usable.length] ?? -1); };
  if (e.key === 'ArrowDown') step(1);
  else if (e.key === 'ArrowUp') step(-1);
  else if (e.key === 'ArrowRight') {
    const it = level.items[level.sel];
    if (it?.sub) { const sub = openSub(level, it, it.button); select(sub, 0); }
    else if (menu.stack.length === 1) openMenu((menu.open + 1) % MENUS.length);
  } else if (e.key === 'ArrowLeft') {
    if (menu.stack.length > 1) menu.stack.pop().el.remove();
    else openMenu((menu.open + MENUS.length - 1) % MENUS.length);
  } else if (e.key === 'Enter') { const it = level.items[level.sel]; if (it) runItem(level, it, it.button); }
  else if (e.key === 'Escape') { if (menu.stack.length > 1) menu.stack.pop().el.remove(); else closeMenus(); }
  else if (e.key.length === 1) {
    const it = level.items.find(x => x.enabled !== false && letterOf(x.label) === e.key.toLowerCase());
    if (it) runItem(level, it, it.button);
  } else return false;
  return true;
}
document.addEventListener('mousedown', e => { if (menu.open !== null && !e.target.closest('.pv-menu, .pv-menubar')) closeMenus(); });

// ---------- Mouse ----------
view.el.addEventListener('click', e => {
  const win = e.target.closest('.pv-window');
  if (win) return host('window', { key: +win.dataset.key });
  const row = e.target.closest('.pv-row');
  if (!row || e.target.closest('.pv-rename')) return;
  const id = +row.dataset.id;
  if (e.target.closest('.pv-fold')) { view.focus = id; return fold([id], !view.unfolded.has(id)); }
  if (e.target.closest('.pv-check')) { e.preventDefault(); return toggle(id, e.shiftKey); }
  // A click on the name of the row that has the focus: rename.
  if (e.target.closest('.pv-name') && view.focus === id && !e.shiftKey && !e.ctrlKey) {
    clearTimeout(view.renameTimer);
    view.renameTimer = setTimeout(startRename, 450);   // not when it becomes a double click
    return;
  }
  view.focus = id;
  draw();
});
view.el.addEventListener('dblclick', e => {
  clearTimeout(view.renameTimer);
  const row = e.target.closest('.pv-row');
  if (!row || e.target.closest('.pv-check, .pv-fold, .pv-rename')) return;
  host('open', { projects: [+row.dataset.id] });
});
view.el.addEventListener('keydown', e => {
  if (!e.target.closest('.pv-rename')) return;
  if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); endRename(true); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endRename(false); }
});
view.el.addEventListener('focusout', e => { if (e.target.closest('.pv-rename')) setTimeout(() => { if (view.renaming !== null) endRename(true); }); });
for (const b of document.querySelectorAll('.pv-sort'))
  b.addEventListener('click', () => { const { by, desc } = sortOf(); setSort(b.dataset.sort, b.dataset.sort === by ? !desc : b.dataset.sort !== 'name'); });
$('.pv-all').addEventListener('change', e => checkAll(e.target.checked));
$('.pv-open').addEventListener('click', openProjects);
$('.pv-close').addEventListener('click', closeProjects);
view.search.addEventListener('input', () => draw());

// ---------- Keys ----------
function moveFocus(d) {
  const ids = shownIds();
  if (!ids.length) return;
  const at = ids.indexOf(view.focus);
  view.focus = ids[at < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, at + d))];
  draw();
  view.el.querySelector('.pv-focus')?.scrollIntoView({ block: 'nearest' });
}
document.addEventListener('keydown', e => {
  if ($('.pv-dialog').open || view.renaming !== null) return;
  if (menu.open !== null) { if (menuKey(e)) e.preventDefault(); return; }
  if (e.altKey && !e.ctrlKey && e.key.length === 1) {
    const i = MENUS.findIndex(([title]) => letterOf(title) === e.key.toLowerCase());
    if (i >= 0) { e.preventDefault(); openMenu(i); select(menu.stack[0], -1); }
    return;
  }
  if (e.key === 'Alt') return;
  const inSearch = e.target === view.search;
  if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); view.search.focus(); view.search.select(); return; }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (view.search.value) { view.search.value = ''; draw(); view.el.focus(); }
    else host('back');
    return;
  }
  if (inSearch) {
    if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); view.el.focus(); if (view.focus === null) moveFocus(0); }
    return;
  }
  const ctrl = e.ctrlKey;
  if (e.key === 'ArrowDown') moveFocus(1);
  else if (e.key === 'ArrowUp') moveFocus(-1);
  else if (e.key === 'Home') moveFocus(-1e9);
  else if (e.key === 'End') moveFocus(1e9);
  else if (e.key === ' ' && view.focus !== null) toggle(view.focus, e.shiftKey);
  else if (e.key === 'Enter') openProjects();
  else if (e.key === 'F2') startRename();
  else if (e.key === 'Delete') deleteProjects();
  else if (ctrl && e.key.toLowerCase() === 'a') checkAll(true);
  else if (e.key === 'ArrowRight') fold(ctrl ? (selected().length ? selected() : shownIds()) : view.focus !== null ? [view.focus] : [], true);
  else if (e.key === 'ArrowLeft') fold(ctrl ? (selected().length ? selected() : shownIds()) : view.focus !== null ? [view.focus] : [], false);
  else return;
  e.preventDefault();
});

// ---------- Host events ----------
async function refresh() {
  view.list = await host('list');
  const ids = new Set(view.list.map(p => p.id));
  for (const id of [...view.checked.keys()]) if (!ids.has(id)) view.checked.delete(id);
  for (const id of [...view.unfolded]) if (!ids.has(id)) view.unfolded.delete(id);
  if (!ids.has(view.focus)) view.focus = null;
  if (view.renaming === null) draw();
}
// The projects changed (the host saved them): the list follows, a moment later (changes come in groups).
events.projects = () => { clearTimeout(view.refreshTimer); view.refreshTimer = setTimeout(refresh, 300); };
events.look = ({ look }) => applyLook(look);
events.settings = ({ settings }) => { view.values = settings ?? {}; applyLook(null); if (view.renaming === null) draw(); };

(async () => {
  const init = await host('init');
  view.values = init.settings ?? {};
  applyLook(init.look);
  view.list = init.list ?? [];
  draw();
  view.el.focus();
})();
