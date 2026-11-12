// The Folder pane as a page of its own (docs/plans/executed/PLAN-docking.md 3.3): the window's page knows the folder, lists
// a folder when asked (each entry with its marks: git, a backup next to it, highlights, a file type no pack knows, a
// file gone) and acts on what is done here: open, rename, the right-click menu, up a folder. This page shows the tree
// and keeps which folders are open, the cursor row and the scroll; it tells the window those, for its session.
const tree = document.querySelector('.mm-tree');
const PATH_TYPE = 'application/x-lexpen-path';   // as app.js: a tree row dragged onto a pane or the editor
let root = null, parentPath = null;
let expanded = new Set();
let marks = { active: null, fresh: [] };

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const rows = () => [...tree.querySelectorAll('.mm-row')].filter(r => r.offsetParent !== null);
const cursorRow = () => tree.querySelector('.mm-row.mm-cursor');
const rowOf = path => [...tree.querySelectorAll('.mm-row:not(.mm-up)')].find(r => same(r.dataset.path, path));

// A folder's entries, asked of the window (it asks the host and adds the marks).
const asked = new Map();
let nextAsk = 1;
function list(path) {
  const id = nextAsk++;
  toWindow({ kind: 'list', id, path });
  return new Promise(resolve => asked.set(id, resolve));
}
paneHandlers.listed = m => { asked.get(m.id)?.(m.items ?? []); asked.delete(m.id); };

// The head (docs/plans/executed/PLAN-folder-pane-head.md): drop-downs for the sort (its button shows the order and the
// direction), the filters (marked while one is on), the recent folders (the roots opened lately) and what the rows show.
const ORDERS = [['Modified', 'modified'], ['Name', 'name'], ['Extension', 'extension'], ['Size', 'size']];
let head = {};
paneHandlers.head = m => {
  head = m;
  document.querySelector('.mm-tree-sort-label').textContent = ORDERS.find(([, v]) => v === m.sort)?.[0] ?? m.sort;
  document.body.toggleAttribute('data-sort-desc', !!m.desc);
  document.body.dataset.tree = m.known ? 'known' : 'all';
  document.body.toggleAttribute('data-sizes', !!m.size);
  document.querySelector('.mm-tree-filter').classList.toggle('mm-on', !!(m.known || m.hidden));
};
for (const b of document.querySelectorAll('.mm-tree-head [data-cmd]')) b.addEventListener('click', () => toWindow({ kind: 'cmd', name: b.dataset.cmd }));

const cmd = name => () => toWindow({ kind: 'cmd', name });
// A button's menu, under it.
const dropDown = (sel, items) => document.querySelector(sel).addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  paneMenu({ x: r.left, y: r.bottom + 2, above: r.top - 2, button: e.currentTarget, items: items() });
});
// The current order again turns the direction round (as a column header in Explorer).
dropDown('.mm-tree-sort', () => [
  ...ORDERS.map(([label, value]) => ({ label, checked: head.sort === value, run: value === head.sort ? cmd('sortDir') : () => toWindow({ kind: 'sort', value }) })),
  '-',
  { label: 'Up', checked: !head.desc, run: () => head.desc && cmd('sortDir')() },
  { label: 'Down', checked: !!head.desc, run: () => !head.desc && cmd('sortDir')() },
]);
dropDown('.mm-tree-filter', () => [
  { label: 'Known files', checked: head.known, run: cmd('knownOnly') },
  { label: 'Hidden folders / files', checked: head.hidden, run: cmd('hiddenFiles') },
]);
dropDown('.mm-tree-view', () => [{ label: 'Size', checked: head.size, run: cmd('fileSizes') }]);

// Recent: the recent folders (File > Recent folders), asked of the window; a choice becomes the root (one gone: removed
// from the list, as there).
const recentButton = document.querySelector('.mm-tree-recent');
recentButton.addEventListener('click', () => toWindow({ kind: 'recent' }));
paneHandlers.recent = m => {
  const r = recentButton.getBoundingClientRect();
  paneMenu({ x: r.left, y: r.bottom + 2, above: r.top - 2, button: recentButton, items: m.items.length ? m.items.map(f => ({
    label: f.name, key: f.dir, title: f.exists ? f.path : f.path + '\nNo longer exists; click to remove it from the list', dim: !f.exists,
    checked: same(f.path, root), run: () => toWindow({ kind: 'openRecent', path: f.path, missing: !f.exists }) })) : [{ label: '(none yet)', disabled: true }] });
};

// A file's size as the Explorer shows it: bytes, then KB, MB, GB.
function sizeText(n) {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i === 0 || n >= 10 ? Math.round(n) : n.toFixed(1)) + ' ' + units[i];
}

// The window's folder: { root, parent (null at a drive's root), open: the folders to open, top, cursor }.
let building = Promise.resolve();
paneHandlers.root = m => {
  building = building.then(async () => {
    root = m.root;
    parentPath = m.parent;
    expanded = new Set(m.open ?? []);
    const fresh = await build();
    tree.replaceChildren(...fresh.childNodes);
    tree.scrollTop = m.top ?? 0;
    if (m.cursor) setCursor(rowOf(m.cursor));
    applyMarks();
    keep();
  });
};

// The same folder read again (a change on disk, the sort, the filter): built off screen and swapped in, so the open
// folders, the scroll and the cursor stay put.
paneHandlers.refresh = () => {
  building = building.then(async () => {
    if (!root) return;
    const fresh = await build();
    const top = tree.scrollTop, cursor = cursorRow()?.dataset.path;
    tree.replaceChildren(...fresh.childNodes);
    tree.scrollTop = top;
    if (cursor) setCursor(rowOf(cursor), false);
    applyMarks();
  });
};

// A file or folder renamed: the open folders and the cursor follow, then the tree is read again.
paneHandlers.renamed = m => {
  const renamed = p => same(p, m.from) ? m.to : p.toLowerCase().startsWith(m.from.toLowerCase() + '\\') ? m.to + p.slice(m.from.length) : p;
  expanded = new Set([...expanded].map(renamed));
  const cursor = cursorRow();
  if (cursor) cursor.dataset.path = renamed(cursor.dataset.path);
  if (m.root) root = m.root;
  paneHandlers.refresh();
};

async function build() {
  const fresh = document.createElement('div');
  await fill(fresh, root, 0);
  addTop(fresh);
  return fresh;
}

async function fill(container, path, depth) {
  const items = await list(path);
  container.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'mm-row' + (item.dir ? ' mm-dir' : item.other ? ' mm-other' : '') + (item.gone ? ' mm-gone' : '');
    row.dataset.path = item.path;
    row.dataset.depth = depth;
    row.draggable = floating && !item.dir && !item.gone;   // docked: the drag below
    row.style.paddingLeft = 8 + depth * 14 + 'px';
    row.title = item.name;
    const name = document.createElement('span');
    name.className = 'mm-name';
    name.textContent = item.name;
    if (item.backup) {
      row.classList.add('mm-has-backup');
      row.title += ' (has a .bak file)';
      row.append(Object.assign(document.createElement('span'), { className: 'mm-backup-dot', title: 'A backup file exists next to this file' }));
    }
    if (item.columns) {   // a CSV definition next to it (plan 29)
      row.classList.add('mm-has-columns');
      row.title += `\nHas a CSV definition (${item.name}-metadata.json)`;
      row.append(Object.assign(document.createElement('span'), { className: 'mm-columns-mark', title: `Has a CSV definition (${item.name}-metadata.json)` }));
    }
    row.append(name);
    if (item.size != null) row.append(Object.assign(document.createElement('span'), { className: 'mm-size', textContent: sizeText(item.size) }));   // shown with View > Size
    if (item.highlights) {
      row.classList.add('mm-has-highlights');
      row.title += '\nHas highlights next to it (' + item.name + '.lph)';
    }
    if (item.git) row.dataset.git = item.git;
    container.append(row);
    if (item.dir && !item.gone) {
      const children = document.createElement('div');
      children.hidden = true;
      container.append(children);
      if (expanded.has(item.path)) await toggle(row, false);
    }
  }
}

// The two rows on top: the base folder with its full path (to right-click: copy, favourite folders; not a folder to
// open or close), and above it `..`, up a folder (none at a drive's root).
function addTop(container) {
  const base = document.createElement('div');
  base.className = 'mm-row mm-base';
  base.dataset.path = root;
  base.dataset.depth = -1;
  base.style.paddingLeft = '8px';
  base.title = root;
  // The path as text in a right-to-left row (app.css), held left-to-right by a mark at each end: a long one is cut
  // off at its start, so the folder's own name stays in view.
  const ltr = String.fromCharCode(0x200E);
  base.textContent = ltr + root + ltr;
  container.prepend(base);
  if (!parentPath) return;
  const row = document.createElement('div');
  row.className = 'mm-row mm-dir mm-up';
  row.dataset.path = parentPath;
  row.dataset.depth = 0;
  row.style.paddingLeft = '8px';
  row.title = 'Up to ' + parentPath + ' (Alt+Up)';
  row.innerHTML = '<span class="mm-name">..</span>';
  container.prepend(row);
}

async function toggle(row, save = true) {
  const children = row.nextElementSibling;
  const open = row.classList.toggle('mm-open');
  children.hidden = !open;
  if (open) expanded.add(row.dataset.path); else expanded.delete(row.dataset.path);
  if (open && !children.childElementCount) {
    await fill(children, row.dataset.path, +row.dataset.depth + 1);
    applyMarks();
  }
  if (save) keep();
}

// The open folders and the scroll, for the window's session.
let keepTimer = 0;
function keep() {
  clearTimeout(keepTimer);
  keepTimer = setTimeout(() => toWindow({ kind: 'state', open: [...expanded], top: Math.round(tree.scrollTop) }), 150);
}
tree.addEventListener('scroll', keep, { passive: true });

// The marks of the window: its active document's row, the files that changed while it was not active.
paneHandlers.marks = m => { marks = m; applyMarks(); };
function applyMarks() {
  const fresh = new Set(marks.fresh);
  for (const row of tree.querySelectorAll('.mm-row')) {
    row.classList.toggle('mm-active', same(row.dataset.path, marks.active));
    if (row.classList.contains('mm-up') || row.classList.contains('mm-base')) continue;
    const key = row.dataset.path.toLowerCase();
    row.classList.toggle('mm-fresh', fresh.has(key));
    row.classList.toggle('mm-fresh-dir', row.classList.contains('mm-dir') && [...fresh].some(p => p.startsWith(key + '\\')));
  }
}

function setCursor(row, scroll = true) {
  if (!row) return;
  cursorRow()?.classList.remove('mm-cursor');
  row.classList.add('mm-cursor');
  if (scroll) row.scrollIntoView({ block: 'nearest' });
}
paneHandlers.cursor = m => setCursor(rowOf(m.path));
paneHandlers.focus = () => {
  tree.focus();
  if (!cursorRow()) setCursor(tree.querySelector('.mm-row.mm-active') || rows()[0]);
};

// A file's row shown (Show in folder pane, a favourite folder): the folders on the way opened, the row selected,
// scrolled to the middle and lit up. Not listed (a filter, gone): the window says so.
paneHandlers.reveal = m => {
  building = building.then(async () => {
    let dir = root.replace(/\\$/, '');
    if (!m.path.toLowerCase().startsWith(dir.toLowerCase() + '\\')) return;
    for (const part of m.path.slice(dir.length + 1).split('\\').slice(0, -1)) {
      dir += '\\' + part;
      const row = rowOf(dir);
      if (!row) break;
      if (!row.classList.contains('mm-open')) await toggle(row);
    }
    const row = rowOf(m.path);
    if (!row) return toWindow({ kind: 'notListed', path: m.path });
    setCursor(row, false);
    row.scrollIntoView({ block: 'center' });
    tree.focus({ preventScroll: true });
    row.classList.remove('mm-flash');
    void row.offsetWidth;   // restart the animation when it is asked for again
    row.classList.add('mm-flash');
    row.addEventListener('animationend', () => row.classList.remove('mm-flash'), { once: true });
  });
};

// A row clicked: a folder opens or closes, a file opens in the window (Ctrl: the other pane; Shift: a new tab).
tree.addEventListener('click', e => {
  const row = e.target.closest('.mm-row');
  if (!row) return;
  setCursor(row, false);
  if (row.classList.contains('mm-gone') || row.classList.contains('mm-base')) return;
  if (row.classList.contains('mm-up')) toWindow({ kind: 'up' });
  else if (row.classList.contains('mm-dir')) toggle(row);
  else toWindow({ kind: 'open', path: row.dataset.path, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
});

// While its right-click menu is open, and a question asked from it (Delete...), the row right-clicked is the one
// marked, the open document's mark hidden. Back at the next click or key here or in the window (menuDone), or when a
// LexPen window gets the focus again (focus here; menuDone from the window: windowActivated).
const menuSubject = on => tree.classList.toggle('mm-menu-subject', on);
paneHandlers.menuDone = () => menuSubject(false);
addEventListener('focus', () => menuSubject(false));
for (const type of ['pointerdown', 'keydown'])
  addEventListener(type, e => { if (!e.target.closest?.('.mm-pane-menu')) menuSubject(false); }, true);

tree.addEventListener('contextmenu', e => {
  const row = e.target.closest('.mm-row');
  e.preventDefault();
  if (!row) return;
  setCursor(row, false);   // the menu's subject: the cursor goes there, as with a click
  menuSubject(true);
  const has = c => row.classList.contains(c);
  toWindow({ kind: 'menu', x: e.clientX, y: e.clientY, path: row.dataset.path, dir: has('mm-dir'), base: has('mm-base'),
    up: has('mm-up'), gone: has('mm-gone'), backup: has('mm-has-backup'), columns: has('mm-has-columns') });
});

// Docked (a frame of another site than the window): the browser lets no drag from here drop in the window around it,
// so a file's drag is done with the pointer. It starts here (drag); the moves and the release over this frame are told
// from here (dragMove, dragEnd: the point in this frame), those over the rest of the window the window sees itself; it
// shows the place and opens the file there, and says when the drag is over (dragDone). Esc: it ends, nothing opens.
// Floating: the browser's drag (dragstart below), between windows.
let endDrag = null;
if (!floating) tree.addEventListener('pointerdown', e => {
  endDrag?.();
  const row = e.target.closest('.mm-row');
  if (e.button !== 0 || !row || ['mm-dir', 'mm-base', 'mm-gone', 'mm-up'].some(c => row.classList.contains(c))) return;
  const x0 = e.clientX, y0 = e.clientY, path = row.dataset.path;
  let dragging = false;
  const move = ev => {
    if (!dragging) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      dragging = true;
      document.body.style.cursor = 'copy';
      toWindow({ kind: 'dragStart', path });
    }
    toWindow({ kind: 'dragMove', x: ev.clientX, y: ev.clientY });
  };
  const up = ev => {
    if (dragging) {
      toWindow({ kind: 'dragEnd', drop: true, x: ev.clientX, y: ev.clientY, shift: ev.shiftKey });
      addEventListener('click', stop => stop.stopPropagation(), { capture: true, once: true });   // not also the row's click
    }
    endDrag();
  };
  const key = ev => {
    if (ev.key !== 'Escape' || !dragging) return;
    ev.preventDefault();
    ev.stopPropagation();
    toWindow({ kind: 'dragEnd', drop: false });
    endDrag();
  };
  endDrag = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('keydown', key, true);
    document.body.style.cursor = '';
    endDrag = null;
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('keydown', key, true);
});
paneHandlers.dragDone = () => endDrag?.();

tree.addEventListener('dragstart', e => {
  const row = e.target.closest('.mm-row');
  if (!row || row.classList.contains('mm-base')) return;
  e.dataTransfer.setData(PATH_TYPE, row.dataset.path);
  e.dataTransfer.setData('text/plain', row.dataset.path);
  e.dataTransfer.effectAllowed = 'copyMove';
  toWindow({ kind: 'drag', path: row.dataset.path });
});

// The keys: the cursor row moves, folders open and close, Enter opens (the focus stays here), F2 renames, Esc back to
// the document, Alt+Up or Backspace up a folder.
tree.addEventListener('keydown', async e => {
  const all = rows(), row = cursorRow() ?? all[0];
  if (!row) return;
  const at = all.indexOf(row), page = Math.max(1, Math.floor(tree.clientHeight / (row.offsetHeight || 22)) - 1);
  const move = to => setCursor(all[Math.max(0, Math.min(all.length - 1, to))]);
  const isDir = row.classList.contains('mm-dir') && !row.classList.contains('mm-up');
  const open = row.classList.contains('mm-open');
  let handled = true;
  switch (e.key) {
    case 'ArrowDown': move(at + 1); break;
    case 'ArrowUp':
      if (e.altKey) toWindow({ kind: 'up' }); else move(at - 1);
      break;
    case 'Home': move(0); break;
    case 'End': move(all.length - 1); break;
    case 'PageDown': move(at + page); break;
    case 'PageUp': move(at - page); break;
    case 'ArrowRight':
      if (isDir && !open) await toggle(row);
      else if (isDir) move(at + 1);
      break;
    case 'ArrowLeft':
      if (isDir && open) await toggle(row);
      else {
        // To the folder this row is in.
        const parent = all.slice(0, at).reverse().find(r => r.classList.contains('mm-dir') && +r.dataset.depth < +row.dataset.depth);
        if (parent) move(all.indexOf(parent));
      }
      break;
    case 'Enter':
      if (row.classList.contains('mm-up')) toWindow({ kind: 'up' });
      else if (isDir) await toggle(row);
      else if (!row.classList.contains('mm-gone') && !row.classList.contains('mm-base'))
        toWindow({ kind: 'open', path: row.dataset.path, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, keep: true });
      break;
    case 'Backspace': toWindow({ kind: 'up' }); break;
    case 'F2':   // rename, as in Explorer
      if (row.classList.contains('mm-up') || row.classList.contains('mm-gone')) break;
      toWindow({ kind: 'rename', path: row.dataset.path, folder: isDir || row.classList.contains('mm-base') });
      break;
    case 'Escape': toWindow({ kind: 'escape' }); break;
    default: handled = false;
  }
  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
});
