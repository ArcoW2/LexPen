'use strict';
// The Sort panel's page (sort.html; docs/plans/executed/PLAN-sort-lines.md 3.3): the sort at hand (its keys, options and
// a preview; Apply, Save, Save as...) and the stored sorts (Select, Delete...). The window (sort.js) keeps the sort and
// does the work; this page shows what it sends and tells it what is done here. Messages from the window: `sort` (all
// of it, drawn again) and `sortPreview` (the preview and what does not fit, while typing). To the window: `set`,
// `add`, `del`, `move`, `focusKey`, `page`, `storedAt`, `apply`, `save`, `saveAs`, `select`, `deleteStored`, `escape`.

const $s = sel => document.querySelector(sel);
const sp = { st: null };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GRIP = '<svg viewBox="0 0 8 14" width="8" height="14" fill="currentColor"><circle cx="2" cy="3" r="1.2"/><circle cx="6" cy="3" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="11" r="1.2"/><circle cx="6" cy="11" r="1.2"/></svg>';

paneHandlers.sort = st => {
  // The field with the focus gets it back after the drawing (by its field and key).
  const was = document.activeElement, f = was?.dataset?.f, k = was?.dataset?.k, grip = was?.classList.contains('sp-grip');
  sp.st = st;
  draw();
  const again = st.focusAt === 'grip' ? $s(`.sp-key[data-k="${st.focusKey}"] .sp-grip`)
    : st.focusAt === 'list' ? $s('.sp-list')
    : f ? $s(`[data-f="${f}"]${k !== undefined ? `[data-k="${k}"]` : ''}`) : grip ? $s(`.sp-key[data-k="${st.focusKey}"] .sp-grip`) : null;
  again?.focus();
};

paneHandlers.sortPreview = ({ preview, problem, target, name, origin, changed, slow, all }) => {
  if (!sp.st) return;
  Object.assign(sp.st, { preview, problem, target, name, origin, changed, slow, all });
  const w = $s('.sp-slow');
  if (w) { w.hidden = !slow; w.textContent = slowLine(); }
  $s('.sp-doc').innerHTML = docLine();
  const n = $s('.sp-name');
  if (n) n.innerHTML = nameLine();
  for (const m of MANAGE) { const b = m !== '-' && $s(`[data-do=${m.id}]`); if (b) b.disabled = !m.on(sp.st); }
  fitBar();
  const p = $s('.sp-problem'), pre = $s('.sp-preview'), apply = $s('[data-do=apply]');
  if (p) { p.hidden = !problem; p.textContent = problem ?? ''; }
  if (pre) pre.innerHTML = problem ? '' : preview;   // built by the window, its texts escaped
  if (apply) apply.disabled = !!problem;
};

// Edit > Sort...: the focus on the first field (the first key's).
paneHandlers.focus = () => document.querySelector('.sp-body [data-f]:not([type=radio]), .sp-list')?.focus();

// A slow preview: how long it took, and the setting that makes it quicker.
// A click on it opens that setting.
const slowLine = () => sp.st.slow ? `The preview took ${(sp.st.slow / 1000).toFixed(1)} s. Settings > Editor > Sort: ${sp.st.all ? 'fewer lines than All' : 'fewer lines'} make it quicker (click to change).` : '';

// The stored sort this one came from, at the bottom (not in the tab: a narrow panel cuts it there).
// Changed since: the name in italics. A new sort from a template: that template's name (Revert goes back to it).
const nameLine = () => {
  const { name, origin, changed } = sp.st, shown = name ?? origin;
  if (!shown) return '';
  return (name ? '' : '<span class="sp-dim">New from template</span> ') + (changed ? `<i>${esc(shown)}</i> <span class="sp-dim">(changed)</span>` : esc(shown));
};

const docLine = () => sp.st.doc ? `${esc(sp.st.doc)} <span class="sp-dim">${esc(sp.st.target)}</span>` : '<span class="sp-dim">No document</span>';

function draw() {
  const st = sp.st, spec = st.spec;
  $s('.sp-doc').innerHTML = docLine();
  for (const b of document.querySelectorAll('.sp-tabs button')) b.classList.toggle('sp-on', b.dataset.page === st.page);
  const body = $s('.sp-body');
  if (!st.doc) { body.innerHTML = '<div class="sp-empty">No document to sort.</div>'; return; }
  if (st.page === 'stored') {
    // The templates first, a divider, the others (the window's list is in that order).
    const items = st.list.map((e, i) => (i > 0 && st.list[i - 1].template && !e.template ? '<div class="sp-divider"></div>' : '') +
      `<div class="sp-stored${i === st.storedAt ? ' sp-sel' : ''}${e.off ? ' sp-off' : ''}" data-i="${i}"` +
      ` title="${e.off ? 'Sorts by columns: for a file with columns (CSV). ' : ''}Right-click for more"><b>${esc(e.name)}${e.template ? ' <span class="sp-dim">(template)</span>' : ''}</b>` +
      `<span class="sp-dim">${esc(e.desc)}</span></div>`).join('')
      || '<div class="sp-dim sp-none">No stored sorts yet: Save as... on the Sort tab stores one.</div>';
    const sel = st.list[st.storedAt];
    body.innerHTML = `<div class="sp-list" tabindex="0">${items}</div>` +
      `<div class="sp-bar"><button type="button" data-do="select"${sel && !sel.off ? '' : ' disabled'}>${sel?.template ? 'Use as new' : 'Select'}</button>` +
      `<button type="button" data-do="deleteStored"${sel ? '' : ' disabled'}>Delete...</button></div>`;
    return;
  }
  const columns = spec.kind === 'columns', list = columns ? spec.columns : spec.keys, one = list.length === 1;
  const kind = st.csv ? `<div class="sp-kind"><label><input type="radio" name="sp-kind" data-f="kind" value="columns"${columns ? ' checked' : ''}> By columns</label>` +
    `<label><input type="radio" name="sp-kind" data-f="kind" value="text"${columns ? '' : ' checked'}> As text</label></div>` : '';
  const dir = (key, i) => `<select data-f="desc" data-k="${i}" title="Direction"><option value=""${key.desc ? '' : ' selected'}>A to Z</option><option value="1"${key.desc ? ' selected' : ''}>Z to A</option></select>`;
  const mark = i => `<span class="sp-grip" draggable="true" tabindex="0" data-k="${i}" title="Drag to change the order (also Alt+Up / Alt+Down); Delete removes the key">${GRIP}</span>` +
    `<span class="sp-num" style="background:${st.colours[i].bg};color:${st.colours[i].fg}">${i + 1}</span>`;
  const trim = (key, i) => `<label class="sp-trim" title="Compare this key without its leading and trailing spaces"><input type="checkbox" data-f="trim" data-k="${i}"${key.trim ? ' checked' : ''}>Trim</label>`;
  const del = i => `<button type="button" class="sp-del" data-do="del" data-k="${i}" title="Delete this key"${one ? ' disabled' : ''}>x</button>`;
  const rows = list.map((key, i) => `<div class="sp-key${i === st.focusKey ? ' sp-focus' : ''}" data-k="${i}">${mark(i)}` + (columns
    ? `<select data-f="column" data-k="${i}">` + (st.cols[i] < 0 ? `<option value="" selected>${esc(key.name ?? `Column ${key.index + 1}`)} (not in this file)</option>` : '') +
      st.names.map((n, j) => `<option value="${j}"${j === st.cols[i] ? ' selected' : ''}>${esc(n)}</option>`).join('') + '</select>'
    : `<label>From <input class="sp-col" inputmode="numeric" data-f="from" data-k="${i}" value="${Number.isFinite(key.from) ? key.from : ''}"></label>` +
      `<label>To <input class="sp-col" inputmode="numeric" data-f="to" data-k="${i}" value="${key.to ?? ''}" placeholder="end"></label>`) + `<span class="sp-order">${dir(key, i)}${trim(key, i)}</span>` + del(i) + '</div>').join('');
  const firstDesc = list[0]?.desc;
  const caseChoice = spec.ignoreCase ? '' : '<div class="sp-sub">' + ['AaBbCc', 'aAbBcC', 'ABCabc', 'abcABC'].map(o =>
    `<label title="Stated for A to Z; Z to A turns it round"><input type="radio" name="sp-case" data-f="caseOrder" value="${o}"${spec.caseOrder === o ? ' checked' : ''}> ${o}` +
    (firstDesc ? ` <span class="sp-dim">(Z to A: ${[...o].reverse().join('')})</span>` : '') + '</label>').join('') + '</div>';
  const unit = columns ? 'record' : 'line';
  const check = (f, label, title = '') => `<label${title ? ` title="${esc(title)}"` : ''}><input type="checkbox" data-f="${f}"${spec[f] ? ' checked' : ''}> ${label}</label>`;
  body.innerHTML = kind + `<div class="sp-keys">${rows}</div><div><button type="button" data-do="add">${columns ? 'Add a column' : 'Add a key'}</button></div>` +
    '<div class="sp-options">' + check('ignoreCase', 'Ignore case') + caseChoice +
    check('numeric', 'Numbers by value', 'file2 before file10; a key that is a number by its value') +
    (spec.numeric ? '<div class="sp-sub">' +
      `<label title="The sign between the whole number and its fraction">Decimal sign <input class="sp-col" data-f="decimal" maxlength="1" value="${esc(spec.decimal)}"></label>` +
      `<label title="Characters skipped in a number, such as the thousands separator (a space too)">Ignore <input class="sp-col" data-f="numIgnore" value="${esc(spec.numIgnore)}"></label></div>` : '') +
    check('dups', 'Remove duplicates', 'The first one stays') +
    (spec.dups ? `<div class="sp-sub">${check('dupsWhole', `By the whole ${unit}`, 'Else by the keys')}${check('dupsTrim', 'Ignore leading and trailing whitespace')}</div>` : '') +
    check('empty', `Remove empty ${unit}s`, 'Whitespace only counts as empty') + '</div>' +
    `<div class="sp-problem"${st.problem ? '' : ' hidden'}>${esc(st.problem ?? '')}</div><div class="sp-slow" data-do="openSetting" role="button" tabindex="0" title="Open this setting"${st.slow ? '' : ' hidden'}>${esc(slowLine())}</div><pre class="sp-preview">${st.problem ? '' : st.preview}</pre>` +
    `<div class="sp-bar"><span class="sp-name" title="The stored sort this one came from: Save stores it there">${nameLine()}</span><span class="sp-btns">` +
    `<button type="button" data-do="apply" class="sp-main"${st.problem ? ' disabled' : ''} title="Enter">Apply</button>` +
    MANAGE.map(m => m === '-' ? '' : `<button type="button" class="sp-full" data-do="${m.id}"${m.on(st) ? '' : ' disabled'} title="${esc(m.title(st))}">${m.label}</button>`).join('') +
    '<button type="button" class="sp-manage" data-manage title="Save, Save as..., Revert, New">Manage \u25be</button></span></div>';
  fitBar();
  fitKeys();
}

// The buttons beside Apply; in a narrow panel they go into Manage's menu (fitBar).
const MANAGE = [
  { id: 'save', label: 'Save', on: st => !!(st.name && st.changed), title: st => st.name ? `Under its name: ${st.name}` : 'Under its name (select a stored sort first)' },
  { id: 'saveAs', label: 'Save as...', on: () => true, title: () => 'Under a new name' },
  '-',
  { id: 'revert', label: 'Revert', on: st => !!((st.name || st.origin) && st.changed),
    title: st => st.name ? `Back to the stored sort ${st.name} (not an undo: the text stays)` : st.origin ? `Back to the template ${st.origin} (not an undo: the text stays)` : 'Back to the stored sort or template it came from (none here)' },
  { id: 'new', label: 'New', on: () => true, title: () => 'A sort from the start' },
];
// All the buttons when they fit on the panel's width, else Apply and Manage.
function fitBar() {
  const bar = $s('.sp-body > .sp-bar'), btns = bar?.querySelector('.sp-btns');
  if (!btns || !btns.querySelector('.sp-manage')) return;
  bar.classList.remove('sp-compact');
  bar.classList.toggle('sp-compact', btns.offsetWidth > bar.clientWidth);
}
// A key row with room: its direction and Trim side by side; else Trim under the direction (a narrow panel).
function fitKeys() {
  const keys = $s('.sp-keys');
  if (!keys) return;
  keys.classList.remove('sp-narrow');
  keys.classList.toggle('sp-narrow', [...keys.querySelectorAll('.sp-key')].some(r => r.scrollWidth > r.clientWidth));
}
new ResizeObserver(() => { fitBar(); fitKeys(); }).observe(document.body);
document.addEventListener('click', e => {
  const b = e.target.closest('[data-manage]');
  if (!b) return;
  const r = b.getBoundingClientRect();
  paneMenu({ x: r.left, y: r.bottom, above: r.top, items: MANAGE.map(m => m === '-' ? m
    : { label: m.label, disabled: !m.on(sp.st), run: () => toWindow({ kind: m.id }) }) });
});

// The window shows the keys' lines in the editor only while this page has the focus.
addEventListener('focus', () => toWindow({ kind: 'paneFocus', on: true }));
addEventListener('blur', () => toWindow({ kind: 'paneFocus', on: false }));

// ---------- What is done here ----------
// From / To take digits only: anything else typed or pasted is left out, the cursor staying where it was.
document.addEventListener('beforeinput', e => {
  if (e.target.matches?.('[data-f=from], [data-f=to]') && e.data && /\D/.test(e.data) && e.inputType === 'insertText') e.preventDefault();
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.matches?.('[data-f=from], [data-f=to]') && /\D/.test(el.value)) {
    const at = el.selectionStart - (el.value.slice(0, el.selectionStart).match(/\D/g)?.length ?? 0);
    el.value = el.value.replace(/\D/g, '');
    el.setSelectionRange(at, at);
  }
  if (['from', 'to', 'decimal', 'numIgnore'].includes(el.dataset.f)) toWindow({ kind: 'set', f: el.dataset.f, k: +el.dataset.k, value: el.value });
});
document.addEventListener('change', e => {
  const el = e.target, f = el.dataset.f;
  if (!f || ['from', 'to', 'decimal', 'numIgnore'].includes(f)) return;
  toWindow({ kind: 'set', f, k: el.dataset.k === undefined ? null : +el.dataset.k, value: el.type === 'checkbox' ? el.checked : el.value });
});
document.addEventListener('focusin', e => {
  const row = e.target.closest('.sp-key');
  if (!row || +row.dataset.k === sp.st?.focusKey) return;
  sp.st.focusKey = +row.dataset.k;
  for (const el of document.querySelectorAll('.sp-key')) el.classList.toggle('sp-focus', el === row);
  toWindow({ kind: 'focusKey', k: sp.st.focusKey });
});
document.addEventListener('click', e => {
  const page = e.target.closest('[data-page]');
  if (page) return toWindow({ kind: 'page', page: page.dataset.page });
  const item = e.target.closest('.sp-stored');
  if (item) return toWindow({ kind: 'storedAt', i: +item.dataset.i });
  const b = e.target.closest('button[data-do], .sp-slow');
  if (!b) return;
  toWindow({ kind: b.dataset.do, k: b.dataset.k === undefined ? null : +b.dataset.k });
});
document.addEventListener('dblclick', e => {
  const line = e.target.closest('.sp-preview [data-l]');
  if (line) toWindow({ kind: 'gotoLine', line: +line.dataset.l });
});
document.addEventListener('dblclick', e => { const item = e.target.closest('.sp-stored'); if (item) toWindow({ kind: 'select', i: +item.dataset.i }); });

// A stored sort's right-click menu (also the menu key, Shift+F10): a regular one Select, Rename..., Pin as template; a
// template Use as new, Rename..., Edit, Unpin as template.
function storedMenu(i, x, y) {
  const st = sp.st, e = st.list[i];
  if (!e) return;
  // Marked here, the window told without drawing the page again (that would take the focus from the menu).
  st.storedAt = i;
  for (const el of document.querySelectorAll('.sp-stored')) el.classList.toggle('sp-sel', +el.dataset.i === i);
  toWindow({ kind: 'storedAt', i, quiet: true });
  const select = $s('[data-do=select]');
  if (select) { select.textContent = e.template ? 'Use as new' : 'Select'; select.disabled = !!e.off; }
  const go = (kind, more = {}) => () => toWindow({ kind, i, ...more });
  paneMenu({ x, y, items: e.template
    ? [{ label: 'Use as new', disabled: e.off, run: go('select') }, '-', { label: 'Rename...', run: go('renameStored') },
      { label: 'Edit', disabled: e.off, run: go('editStored') }, { label: 'Unpin as template', run: go('pinStored', { on: false }) }]
    : [{ label: 'Select', disabled: e.off, run: go('select') }, '-', { label: 'Rename...', run: go('renameStored') },
      { label: 'Pin as template', run: go('pinStored', { on: true }) }] });
}
document.addEventListener('contextmenu', e => {
  const item = e.target.closest('.sp-stored');
  if (!item) return;
  e.preventDefault();
  storedMenu(+item.dataset.i, e.clientX, e.clientY);
});
document.addEventListener('keydown', e => {
  const row = e.target.closest?.('.sp-key'), k = row ? +row.dataset.k : -1, st = sp.st;
  if (!st) return;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'Escape') { stop(); return toWindow({ kind: 'escape' }); }
  if (row && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { stop(); return toWindow({ kind: 'move', from: k, to: k + (e.key === 'ArrowUp' ? -1 : 1) }); }
  if (row && e.key === 'Delete' && e.target.matches('.sp-grip, select, button')) { stop(); return toWindow({ kind: 'del', k }); }
  if (e.target.closest('.sp-list') && st.list.length && (e.key === 'ContextMenu' || e.key === 'F10' && e.shiftKey)) {
    stop();
    const r = $s(`.sp-stored[data-i="${st.storedAt}"]`)?.getBoundingClientRect();
    return r && storedMenu(st.storedAt, r.left + 16, r.bottom);
  }
  if (e.target.closest('.sp-list') && st.list.length && ['ArrowUp', 'ArrowDown', 'Enter', 'Delete'].includes(e.key)) {
    stop();
    if (e.key === 'Enter') return toWindow({ kind: 'select', i: st.storedAt });
    if (e.key === 'Delete') return toWindow({ kind: 'deleteStored' });
    return toWindow({ kind: 'storedAt', i: Math.max(0, Math.min(st.list.length - 1, (st.storedAt ?? 0) + (e.key === 'ArrowUp' ? -1 : 1))) });
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.sp-slow')) { stop(); return toWindow({ kind: 'openSetting' }); }
  if (e.key === 'Enter' && st.page === 'sort' && !e.ctrlKey && !e.altKey && !e.target.matches('button, select, .sp-slow')) { stop(); toWindow({ kind: 'apply' }); }
}, true);

// A key dragged by its grip to another place in the list.
let dragFrom = null;
document.addEventListener('dragstart', e => {
  const row = e.target.closest?.('.sp-key');
  if (!row) return;
  dragFrom = +row.dataset.k;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', '');
  e.dataTransfer.setDragImage(row, 10, row.offsetHeight / 2);
});
document.addEventListener('dragover', e => {
  const row = e.target.closest?.('.sp-key');
  if (!row || dragFrom === null) return;
  e.preventDefault();
  for (const el of document.querySelectorAll('.sp-key')) el.classList.toggle('sp-over', el === row);
});
document.addEventListener('drop', e => {
  const row = e.target.closest?.('.sp-key');
  if (!row || dragFrom === null) return;
  e.preventDefault();
  toWindow({ kind: 'move', from: dragFrom, to: +row.dataset.k });
});
document.addEventListener('dragend', () => {
  dragFrom = null;
  for (const el of document.querySelectorAll('.sp-over')) el.classList.remove('sp-over');
});
