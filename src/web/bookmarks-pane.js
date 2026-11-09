'use strict';
// The Bookmarks pane's page (bookmarks.html; docs/plans/executed/PLAN-docking.md stage 10): the bookmarks of the document
// it serves (from its window's page, bookmarkspane.js: the message `bookmarks`), each with its number (a dot for an
// unnumbered one), its line (in a PDF its page) and the start of the text on that line; a click, or Enter on the one marked, goes there
// (`go`); Up / Down move the mark; Esc back to the document (`escape`).

const bp = { list: document.querySelector('.bp-list'), name: document.querySelector('.bp-name'), count: document.querySelector('.bp-count'), items: [], on: -1 };
const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

paneHandlers.bookmarks = ({ name, list }) => {
  bp.items = list;
  bp.on = Math.min(bp.on, list.length - 1);
  bp.name.textContent = name ?? 'No document';
  bp.count.textContent = name ? list.length + (list.length === 1 ? ' bookmark' : ' bookmarks') : '';
  bp.list.innerHTML = list.length
    ? list.map((b, i) => `<div class="bp-row${i === bp.on ? ' bp-on' : ''}" data-i="${i}" title="${escapeHtml(b.text.trim())}">` +
      `<span class="bp-n">${b.n || '&bull;'}</span><span class="bp-line">${b.page ? 'p. ' + b.page : b.line + 1}</span><span class="bp-text">${escapeHtml(b.text.trim())}</span></div>`).join('')
    : `<div class="bp-empty">${name ? 'No bookmarks in this document.' : 'No document.'}</div>`;
};
paneHandlers.focus = () => bp.list.focus();

function go(i) {
  const b = bp.items[i];
  if (!b) return;
  bp.on = i;
  for (const el of bp.list.querySelectorAll('.bp-row')) el.classList.toggle('bp-on', +el.dataset.i === i);
  toWindow(b.page ? { kind: 'go', page: b.page, offset: b.offset } : { kind: 'go', line: b.line, ch: b.ch });
}
bp.list.addEventListener('click', e => { const row = e.target.closest('.bp-row'); if (row) go(+row.dataset.i); });
addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return toWindow({ kind: 'escape' }); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopImmediatePropagation();
    bp.on = Math.max(0, Math.min(bp.items.length - 1, bp.on + (e.key === 'ArrowDown' ? 1 : -1)));
    for (const el of bp.list.querySelectorAll('.bp-row')) el.classList.toggle('bp-on', +el.dataset.i === bp.on);
    bp.list.querySelector('.bp-on')?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); go(Math.max(0, bp.on)); }
}, true);
