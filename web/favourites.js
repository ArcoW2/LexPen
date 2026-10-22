'use strict';
// Favourite files and folders (docs/plans/25-PLAN-favourite-folders.md). Kept by the host (favourites.json,
// favourite-folders.json next to settings.json, shared by all windows), in your order. The File menu has a submenu
// for each: the list, then Add current (the file of the tab; the folder pane's base folder), Add... (a picker) and
// Manage... (a window to put them in order, add, change and delete). The right-click menus of the tabs and the folder pane
// add or remove one. A favourite folder opens in the folder pane: selected when it lies inside the folder open
// there, else as the pane's base folder. Loaded after menus.js, before app.js.

const favs = { files: [], folders: [] };
const FAV_WORDS = { files: ['file', 'favourite files'], folders: ['folder', 'favourite folders'] };
const isFavourite = (path, kind = 'files') => favs[kind].some(p => samePath(p, path));

// The lists as the host has them (also changed in another window); each entry with whether it still exists.
async function loadFavourites() {
  const lists = await host('recent');
  favs.files = lists.favourites.map(e => e.path);
  favs.folders = lists.favouriteFolders.map(e => e.path);
  return { files: lists.favourites, folders: lists.favouriteFolders };
}

// The "Add to / Remove from favourite files (folders)" item of a right-click menu; hidden without a path. The label
// follows the list as the host has it (asked when the menu opens).
function favouriteItem(menu, path, kind = 'files') {
  const item = menu.querySelector('.mm-fav-item');
  item.hidden = !path;
  if (!path) return;
  item.dataset.kind = kind;
  const label = () => item.textContent = `${isFavourite(path, kind) ? 'Remove from' : 'Add to'} ${FAV_WORDS[kind][1]}`;
  label();
  loadFavourites().then(label, () => {});
}

async function toggleFavourite(path, kind = 'files') {
  if (!path) return;
  const on = !isFavourite(path, kind);
  await host(on ? 'favouriteAdd' : 'favouriteRemove', { kind, path });
  favs[kind] = on ? [...favs[kind], path] : favs[kind].filter(p => !samePath(p, path));
  toast(`${nameOf(path) || path} ${on ? 'added to' : 'removed from'} ${FAV_WORDS[kind][1]}.`, true);
}

// A favourite file that is open somewhere in the window: that tab is selected; else it opens.
async function openFavourite(path) {
  const tab = allTabs().find(t => samePath(t.doc.path, path));
  if (tab) return activate(paneOf(tab), tab);
  await openFile(path).catch(e => toast(e.message));
}

// A favourite folder: in the folder pane, selected when inside the folder open there, else the pane's base folder.
async function openFavouriteFolder(path) {
  setSidebar(true);
  setSideView('folder');
  const base = (state.root || '').replace(/\\$/, '').toLowerCase(), p = path.replace(/\\$/, '').toLowerCase();
  if (base && p.startsWith(base + '\\')) return showInTree(path);
  if (base && p === base) {
    const row = ui.tree.querySelector('.mm-row.mm-base');
    if (row) setTreeCursor(row);
    return;
  }
  await openFolder(path);
}

// The current one of a kind: the file of the active tab; the folder pane's base folder.
const currentFavourite = kind => kind === 'files' ? activeDoc()?.path : state.root || null;

// File > Favourite files / Favourite folders.
async function favouriteItems(kind) {
  const entries = (await loadFavourites())[kind], current = currentFavourite(kind), word = FAV_WORDS[kind][0];
  const items = entries.map(({ path, exists }) => ({
    label: nameOf(path) || path, plain: true, key: dirOf(path),
    title: exists ? path : `${path}\nNo longer exists; click to remove it from the list`,
    cls: exists ? '' : 'mm-missing',
    run: () => !exists ? removeMissing(kind, path) : kind === 'files' ? openFavourite(path) : openFavouriteFolder(path),
  }));
  // The favourites first (mostly one is chosen), then adding and managing.
  return [
    ...items, ...(items.length ? ['-'] : []),
    { label: current && isFavourite(current, kind) ? `&Remove current ${word}` : `&Add current ${word}`, enabled: !!current,
      run: () => toggleFavourite(current, kind) },
    { label: `Add a ${word}...`, run: () => addFavourites(kind) },
    { label: '&Manage...', run: () => manageFavourites(kind) },
  ];
}

function removeMissing(kind, path) {
  host('favouriteRemove', { kind, path });
  favs[kind] = favs[kind].filter(p => !samePath(p, path));
  toast(`${path} no longer exists; removed from the list.`, true);
}

// The picker: files (several at once) or a folder; at: start there (Change).
async function pickFavourites(kind, at = '') {
  if (kind === 'folders') { const p = await host('pickFolder', { at }); return p ? [p] : []; }
  return await host('pickFile', { at, one: !!at }) ?? [];
}

async function addFavourites(kind) {
  for (const path of await pickFavourites(kind)) if (!isFavourite(path, kind)) await toggleFavourite(path, kind);
}

// ---------- Manage: a window for one list: in order, add, change, delete ----------
const manage = { el: null, kind: 'files', list: [], at: 0, exists: new Map() };

function buildManage() {
  const el = manage.el = document.createElement('dialog');
  el.className = 'mm-about mm-fav-dialog';
  el.innerHTML = `<h3 class="mm-fav-title"></h3>
    <div class="mm-fav-list" tabindex="0"></div>
    <div class="mm-fav-buttons">
      <button data-do="up" title="Ctrl+Up">Up</button><button data-do="down" title="Ctrl+Down">Down</button>
      <button data-do="add">Add...</button><button data-do="change">Change...</button><button data-do="delete" title="Del">Delete</button>
      <span class="mm-fav-gap"></span><button data-do="close">Close</button>
    </div>`;
  document.body.append(el);
  const list = el.querySelector('.mm-fav-list');
  list.addEventListener('click', e => { const r = e.target.closest('[data-i]'); if (r) { manage.at = +r.dataset.i; drawManage(); } });
  list.addEventListener('dblclick', e => { if (e.target.closest('[data-i]')) manageDo('change'); });
  el.querySelector('.mm-fav-buttons').addEventListener('click', e => { const b = e.target.closest('[data-do]'); if (b) manageDo(b.dataset.do); });
  el.addEventListener('keydown', e => {
    const key = (e.ctrlKey ? 'Ctrl+' : '') + e.key;
    const what = { 'Ctrl+ArrowUp': 'up', 'Ctrl+ArrowDown': 'down', Delete: 'delete', ArrowUp: 'prev', ArrowDown: 'next', Enter: 'change' }[key];
    if (!what || e.target.closest('button') && e.key === 'Enter') return;
    e.preventDefault();
    if (what === 'prev' || what === 'next') { manage.at = Math.max(0, Math.min(manage.list.length - 1, manage.at + (what === 'next' ? 1 : -1))); drawManage(); }
    else manageDo(what);
  });
  el.addEventListener('close', () => focusPane(panes[state.activePane]));
}

async function manageFavourites(kind) {
  if (!manage.el) buildManage();
  const entries = (await loadFavourites())[kind];
  Object.assign(manage, { kind, list: entries.map(e => e.path), at: 0, exists: new Map(entries.map(e => [e.path, e.exists])) });
  manage.el.querySelector('.mm-fav-title').textContent = kind === 'files' ? 'Favourite files' : 'Favourite folders';
  drawManage();
  manage.el.showModal();
  manage.el.querySelector('.mm-fav-list').focus();
}

function drawManage() {
  const box = manage.el.querySelector('.mm-fav-list');
  box.innerHTML = manage.list.length ? manage.list.map((p, i) =>
    `<div class="mm-fav-row${i === manage.at ? ' mm-sel' : ''}${manage.exists.get(p) === false ? ' mm-missing' : ''}" data-i="${i}" title="${escapeHtml(p)}">` +
    `<span class="mm-fav-name">${escapeHtml(nameOf(p) || p)}</span><span class="mm-fav-dir">${escapeHtml(dirOf(p))}</span></div>`).join('')
    : `<div class="mm-fav-none">No favourite ${FAV_WORDS[manage.kind][0]}s yet: Add... picks one.</div>`;
  box.querySelector('.mm-sel')?.scrollIntoView({ block: 'nearest' });
  const none = !manage.list.length;
  for (const b of manage.el.querySelectorAll('[data-do=up], [data-do=down], [data-do=change], [data-do=delete]')) b.disabled = none;
}

// Every change to the host at once: the whole list in its new order.
async function saveManage() {
  manage.list = [...new Map(manage.list.map(p => [p.toLowerCase(), p])).values()];
  await host('favouriteSet', { kind: manage.kind, list: manage.list });
  favs[manage.kind] = [...manage.list];
  drawManage();
}

async function manageDo(what) {
  const list = manage.list, at = manage.at;
  switch (what) {
    case 'close': return manage.el.close();
    case 'up': case 'down': {
      const to = at + (what === 'up' ? -1 : 1);
      if (to < 0 || to >= list.length) return;
      [list[at], list[to]] = [list[to], list[at]];
      manage.at = to;
      return saveManage();
    }
    case 'delete':
      if (!list.length) return;
      list.splice(at, 1);
      manage.at = Math.min(at, list.length - 1);
      return saveManage();
    case 'add': {
      const picked = (await pickFavourites(manage.kind)).filter(p => !list.some(q => samePath(q, p)));
      if (!picked.length) return;
      for (const p of picked) manage.exists.set(p, true);
      list.push(...picked);
      manage.at = list.length - 1;
      return saveManage();
    }
    case 'change': {
      if (!list.length) return;
      const [picked] = await pickFavourites(manage.kind, list[at]);
      if (!picked) return;
      manage.exists.set(picked, true);
      list[at] = picked;
      return saveManage();
    }
  }
}
