'use strict';
// The Manage theme sets window's page (themesets.html; ThemeSetsForm hosts it), docs/plans/executed/PLAN-theme-sets.md, 3.10:
// the sets ("Default" first: settings.json itself) with their look in the current mode (the app's, the editor's and the
// preview's background) and what uses them; the desktops with their default set. A set is selected by a click (Up /
// Down); New makes one from the look the window last worked in shows, Duplicate copies the selected one; Rename (F2)
// and Delete (Del) not for "Default". Use the selected set for the project of the window last worked in, its desktop,
// or the app (the default for desktops without one). The host does the work (AppHost.ThemeSetCommand) and sends the
// list again after every change. Esc: back to the window last worked in.

const $ = s => document.querySelector(s);

// ---------- Host bridge (as in projectsview.js) ----------
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

const view = { list: null, values: {}, selected: 'Default', el: $('.ts-list') };
const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Look: the app's theme (as the projects window) ----------
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

// ---------- Drawing ----------
const SOURCE = { project: "this project's", desktop: "this desktop's default", app: "the app's default" };

function usedBy(s) {
  const parts = [];
  if (s.projects.length) parts.push((s.projects.length === 1 ? 'project ' : 'projects ') + s.projects.join(', '));
  if (s.desktops.length) parts.push((s.desktops.length === 1 ? 'desktop ' : 'desktops ') + s.desktops.join(', '));
  if (s.app) parts.push("the app's default");
  return parts.join('; ') || '-';
}

function draw() {
  const list = view.list;
  if (!list) return;
  if (!list.sets.some(s => s.name === view.selected)) view.selected = 'Default';
  const w = list.window;
  $('.ts-window').textContent = w
    ? `The window last worked in: ${w.project || 'no project'}${w.desktop ? ' on ' + w.desktop : ''}, theme set ${w.info.name} (${SOURCE[w.info.source]})`
    : 'No LexPen window';
  view.el.innerHTML = list.sets.map(s => `<div class="ts-row ts-grid${s.name === view.selected ? ' ts-on' : ''}" data-name="${escapeHtml(s.name)}">` +
    `<span class="ts-name">${escapeHtml(s.name)}${s.default ? ' <span class="ts-dim">(settings.json)</span>' : ''}` +
    `${w?.info.name === s.name ? ' <span class="ts-dim">(shown now)</span>' : ''}</span>` +
    `<span class="ts-swatches" title="The app, the editor and the preview in the current mode">` +
    ['app', 'editor', 'preview'].map(k => `<span class="ts-swatch" style="background:${escapeHtml(s.swatches[k])}"></span>`).join('') + '</span>' +
    `<span class="ts-used">${escapeHtml(usedBy(s))}</span></div>`).join('');
  const isDefault = view.selected === 'Default';
  $('[data-cmd=rename]').disabled = $('[data-cmd=delete]').disabled = isDefault;
  $('[data-none=project]').disabled = w?.info.source !== 'project';
  $('.ts-desktops').innerHTML = list.desktops.map(d => `<div class="ts-desktop" data-id="${escapeHtml(d.id)}">` +
    `<span class="ts-dname">${escapeHtml(d.name)}${d.here ? ' <span class="ts-dim">(this desktop)</span>' : ''}</span>` +
    `<select class="ts-dset" title="Its default set: for the windows on it whose project has none">` +
    `<option value="">None (the app's default)</option>` +
    list.sets.map(s => `<option${s.name === d.set ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('') + '</select>' +
    (d.gone ? '<button class="ts-remove" title="This desktop is gone (removed, or another PC): forget its default">Remove</button>' : '') +
    '</div>').join('') || '<div class="ts-dim">No virtual desktops known.</div>';
}

// A command to the host; a refusal (a name taken) is shown under the buttons.
async function command(args) {
  const error = $('.ts-error');
  error.hidden = true;
  try { await host('command', args); }
  catch (e) { error.textContent = e.message; error.hidden = false; }
}

// A name, asked in the window's own small dialog; null when cancelled.
function askName(label, value) {
  const dialog = $('.ts-dialog'), input = $('.ts-dialog-input');
  $('.ts-dialog-label').textContent = label;
  input.value = value;
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok' ? input.value : null), { once: true });
    dialog.showModal();
    input.select();
  });
}

async function run(cmd) {
  const name = view.selected;
  switch (cmd) {
    case 'new': {
      const n = await askName('A new theme set, with the look shown now. Its name:', '');
      if (n !== null) { await command({ kind: 'new', name: n }); view.selected = n.trim(); }
      break;
    }
    case 'duplicate': {
      const n = await askName(`A copy of "${name}". Its name:`, `${name} copy`);
      if (n !== null) { await command({ kind: 'duplicate', from: name, name: n }); view.selected = n.trim(); }
      break;
    }
    case 'rename': {
      if (name === 'Default') return;
      const n = await askName(`Rename "${name}" to:`, name);
      if (n !== null) { await command({ kind: 'rename', from: name, name: n }); view.selected = n.trim(); }
      break;
    }
    case 'delete':
      if (name !== 'Default') await command({ kind: 'delete', name });
      break;
    case 'edit':
      await command({ kind: 'edit', name });
      break;
  }
  draw();
}

for (const b of document.querySelectorAll('[data-cmd]')) b.addEventListener('click', () => run(b.dataset.cmd));
for (const b of document.querySelectorAll('[data-use]')) b.addEventListener('click', () => command({ kind: 'use', for: b.dataset.use, name: view.selected }));
for (const b of document.querySelectorAll('[data-none]')) b.addEventListener('click', () => command({ kind: 'use', for: b.dataset.none, name: null }));

view.el.addEventListener('click', e => {
  const row = e.target.closest('.ts-row');
  if (!row) return;
  view.selected = row.dataset.name;
  draw();
});
view.el.addEventListener('dblclick', e => { if (e.target.closest('.ts-row')) run('edit'); });

$('.ts-desktops').addEventListener('change', e => {
  const id = e.target.closest('.ts-desktop')?.dataset.id;
  if (id && e.target.matches('.ts-dset')) command({ kind: 'use', for: 'desktop', desktop: id, name: e.target.value || null });
});
$('.ts-desktops').addEventListener('click', e => {
  const id = e.target.closest('.ts-desktop')?.dataset.id;
  if (id && e.target.matches('.ts-remove')) command({ kind: 'removeDesktop', desktop: id });
});

// Keys: Up / Down select, F2 renames, Del deletes, Enter edits, Esc back to the window last worked in.
addEventListener('keydown', e => {
  if ($('.ts-dialog').open) return;
  const names = view.list?.sets.map(s => s.name) ?? [], at = names.indexOf(view.selected);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    view.selected = names[Math.max(0, Math.min(names.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))] ?? view.selected;
    draw();
  } else if (e.key === 'F2') { e.preventDefault(); run('rename'); }
  else if (e.key === 'Delete' && !e.target.matches('input, select')) { e.preventDefault(); run('delete'); }
  else if (e.key === 'Enter' && e.target === view.el) { e.preventDefault(); run('edit'); }
  else if (e.key === 'Escape') { e.preventDefault(); host('back'); }
});

events.list = ({ list }) => { view.list = list; draw(); };
events.look = ({ look }) => applyLook(look);
events.settings = ({ settings }) => { view.values = settings ?? {}; applyLook(null); };

// ---------- Start ----------
(async () => {
  const init = await host('init');
  view.values = init.settings ?? {};
  applyLook(init.look);
  view.list = init.list;
  view.selected = init.list.window?.info.name ?? 'Default';
  draw();
  view.el.focus();
})();
