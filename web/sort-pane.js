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

paneHandlers.sortPreview = ({ preview, problem, target, tab }) => {
  if (!sp.st) return;
  Object.assign(sp.st, { preview, problem, target });
  $s('.sp-doc').innerHTML = docLine();
  $s('[data-page=sort]').textContent = tab;
  const p = $s('.sp-problem'), pre = $s('.sp-preview'), apply = $s('[data-do=apply]');
  if (p) { p.hidden = !problem; p.textContent = problem ?? ''; }
  if (pre) pre.innerHTML = problem ? '' : preview;   // built by the window, its texts escaped
  if (apply) apply.disabled = !!problem;
};

// Edit > Sort...: the focus on the first field (the first key's).
paneHandlers.focus = () => document.querySelector('.sp-body [data-f]:not([type=radio]), .sp-list')?.focus();

const docLine = () => sp.st.doc ? `${esc(sp.st.doc)} <span class="sp-dim">${esc(sp.st.target)}</span>` : '<span class="sp-dim">No document</span>';

function draw() {
  const st = sp.st, spec = st.spec;
  $s('.sp-doc').innerHTML = docLine();
  $s('[data-page=sort]').textContent = st.tab;
  for (const b of document.querySelectorAll('.sp-tabs button')) b.classList.toggle('sp-on', b.dataset.page === st.page);
  const body = $s('.sp-body');
  if (!st.doc) { body.innerHTML = '<div class="sp-empty">No document to sort.</div>'; return; }
  if (st.page === 'stored') {
    const items = st.list.map((e, i) => `<div class="sp-stored${i === st.storedAt ? ' sp-sel' : ''}${e.off ? ' sp-off' : ''}" data-i="${i}"` +
      `${e.off ? ' title="Sorts by columns: for a file with columns (CSV)"' : ''}><b>${esc(e.name)}</b><span class="sp-dim">${esc(e.desc)}</span></div>`).join('')
      || '<div class="sp-dim sp-none">No stored sorts yet: Save as... on the Sort tab stores one.</div>';
    const sel = st.list[st.storedAt];
    body.innerHTML = `<div class="sp-list" tabindex="0">${items}</div>` +
      `<div class="sp-bar"><button type="button" data-do="select"${sel && !sel.off ? '' : ' disabled'}>Select</button>` +
      `<button type="button" data-do="deleteStored"${sel ? '' : ' disabled'}>Delete...</button></div>`;
    return;
  }
  const columns = spec.kind === 'columns', list = columns ? spec.columns : spec.keys, one = list.length === 1;
  const kind = st.csv ? `<div class="sp-kind"><label><input type="radio" name="sp-kind" data-f="kind" value="columns"${columns ? ' checked' : ''}> By columns</label>` +
    `<label><input type="radio" name="sp-kind" data-f="kind" value="text"${columns ? '' : ' checked'}> As text</label></div>` : '';
  const dir = (key, i) => `<select data-f="desc" data-k="${i}" title="Direction"><option value=""${key.desc ? '' : ' selected'}>A to Z</option><option value="1"${key.desc ? ' selected' : ''}>Z to A</option></select>`;
  const mark = i => `<span class="sp-grip" draggable="true" tabindex="0" data-k="${i}" title="Drag to change the order (also Alt+Up / Alt+Down); Delete removes the key">${GRIP}</span>` +
    `<span class="sp-num" style="background:${st.colours[i].bg};color:${st.colours[i].fg}">${i + 1}</span>`;
  const del = i => `<button type="button" class="sp-del" data-do="del" data-k="${i}" title="Delete this key"${one ? ' disabled' : ''}>x</button>`;
  const rows = list.map((key, i) => `<div class="sp-key${i === st.focusKey ? ' sp-focus' : ''}" data-k="${i}">${mark(i)}` + (columns
    ? `<select data-f="column" data-k="${i}">` + (st.cols[i] < 0 ? `<option value="" selected>${esc(key.name ?? `Column ${key.index + 1}`)} (not in this file)</option>` : '') +
      st.names.map((n, j) => `<option value="${j}"${j === st.cols[i] ? ' selected' : ''}>${esc(n)}</option>`).join('') + '</select>'
    : `<label>From <input class="sp-col" data-f="from" data-k="${i}" value="${Number.isFinite(key.from) ? key.from : ''}"></label>` +
      `<label>To <input class="sp-col" data-f="to" data-k="${i}" value="${key.to ?? ''}" placeholder="end"></label>`) + dir(key, i) + del(i) + '</div>').join('');
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
    `<div class="sp-problem"${st.problem ? '' : ' hidden'}>${esc(st.problem ?? '')}</div><pre class="sp-preview">${st.problem ? '' : st.preview}</pre>` +
    `<div class="sp-bar"><button type="button" data-do="apply" class="sp-main"${st.problem ? ' disabled' : ''} title="Enter">Apply</button>` +
    `<button type="button" data-do="save"${st.name && st.changed ? '' : ' disabled'} title="${st.name ? `Under its name: ${esc(st.name)}` : 'Under its name (select a stored sort first)'}">Save</button>` +
    '<button type="button" data-do="saveAs">Save as...</button></div>';
}

// ---------- What is done here ----------
document.addEventListener('input', e => {
  const el = e.target;
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
  const b = e.target.closest('button[data-do]');
  if (!b) return;
  toWindow({ kind: b.dataset.do, k: b.dataset.k === undefined ? null : +b.dataset.k });
});
document.addEventListener('dblclick', e => { if (e.target.closest('.sp-stored')) toWindow({ kind: 'select' }); });
document.addEventListener('keydown', e => {
  const row = e.target.closest?.('.sp-key'), k = row ? +row.dataset.k : -1, st = sp.st;
  if (!st) return;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'Escape') { stop(); return toWindow({ kind: 'escape' }); }
  if (row && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { stop(); return toWindow({ kind: 'move', from: k, to: k + (e.key === 'ArrowUp' ? -1 : 1) }); }
  if (row && e.key === 'Delete' && e.target.matches('.sp-grip, select, button')) { stop(); return toWindow({ kind: 'del', k }); }
  if (e.target.closest('.sp-list') && st.list.length && ['ArrowUp', 'ArrowDown', 'Enter', 'Delete'].includes(e.key)) {
    stop();
    if (e.key === 'Enter') return toWindow({ kind: 'select' });
    if (e.key === 'Delete') return toWindow({ kind: 'deleteStored' });
    return toWindow({ kind: 'storedAt', i: Math.max(0, Math.min(st.list.length - 1, (st.storedAt ?? 0) + (e.key === 'ArrowUp' ? -1 : 1))) });
  }
  if (e.key === 'Enter' && st.page === 'sort' && !e.ctrlKey && !e.altKey && !e.target.matches('button, select')) { stop(); toWindow({ kind: 'apply' }); }
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
