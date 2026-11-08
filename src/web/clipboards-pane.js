'use strict';
// The Clipboards pane's page (clipboards.html; docs/plans/executed/PLAN-docking.md stage 12): the Windows clipboard and
// clipboards 1 to 9 with the start of their text (from its window's page, app.js: the message `clips`), the active one
// marked; a click (or Enter on the one marked) makes one active (`select`): copy, cut and paste then use it. Up / Down
// move the mark; Esc back to the document (`escape`).

const cb = { list: document.querySelector('.cb-list'), items: [], on: -1 };
const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

paneHandlers.clips = ({ items, active }) => {
  cb.items = items;
  if (cb.on < 0) cb.on = active;
  cb.list.innerHTML = items.map(c => `<div class="cb-row${c.n === active ? ' cb-active' : ''}${c.text ? '' : ' cb-empty'}" data-n="${c.n}" title="${escapeHtml(c.text || '(empty)')}">` +
    `<span class="cb-name">${escapeHtml(c.name)}</span>${c.block ? '<span class="cb-block">[block]</span>' : ''}<span class="cb-text">${escapeHtml(c.text || '(empty)')}</span></div>`).join('');
  mark();
};
paneHandlers.focus = () => cb.list.focus();

function mark() {
  for (const el of cb.list.querySelectorAll('.cb-row')) el.classList.toggle('cb-on', +el.dataset.n === cb.on);
}
const select = n => toWindow({ kind: 'select', n });
cb.list.addEventListener('click', e => { const row = e.target.closest('.cb-row'); if (row) { cb.on = +row.dataset.n; select(cb.on); } });
addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return toWindow({ kind: 'escape' }); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopImmediatePropagation();
    cb.on = Math.max(0, Math.min(cb.items.length - 1, cb.on + (e.key === 'ArrowDown' ? 1 : -1)));
    mark();
  } else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); select(Math.max(0, cb.on)); }
}, true);
