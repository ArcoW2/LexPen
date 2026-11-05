'use strict';
// F1's page (commands.html): the rows its window's page makes (palette.js: the message `commands`), the search, a
// section list and a mark per section on the scrollbar. What is done here goes there: the search as typed (`search`),
// a row run (`run`: Enter, a double click), Esc on an empty search (`close`), and the focus coming back (`refresh`: the
// active document may have changed, and with it which commands work). Up / Down, PgUp / PgDn move the selection.

const cp = {
  input: document.querySelector('.mm-pal-search'),
  jump: document.querySelector('.mm-pal-jump'),
  list: document.querySelector('.mm-pal-list'),
  marks: document.querySelector('.mm-pal-marks'),
  selected: -1,
};
const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

paneHandlers.commands = ({ html, sections, foot, q }) => {
  if (cp.input.value !== q && document.activeElement !== cp.input) cp.input.value = q;   // a new F1: the search empty
  const searched = cp.list.dataset.q !== q;
  cp.list.dataset.q = q;
  const top = cp.list.scrollTop;
  // Where your own keys are: above the table, so it scrolls away with it.
  cp.list.innerHTML = `<p class="mm-pal-foot">${escapeHtml(foot)}</p>` + html;
  cp.jump.innerHTML = '<option value="">Go to section...</option>' + sections.map((s, i) => `<option value="${i}">${escapeHtml(s)}</option>`).join('');
  // The same search again (a family opened, the focus back): the place stays; a new one starts at the top.
  if (searched) { cp.list.scrollTop = 0; select(firstRow(), 0); }
  else { cp.list.scrollTop = top; select(Math.max(0, cp.selected), 0); }
  markSections();
  showSection();
};
paneHandlers.focus = () => { cp.input.focus(); cp.input.select(); };

// A row Enter can run: a command that works here, or a numbered family to open.
const rowEl = i => cp.list.querySelector(`[data-row="${i}"]`);
const runnable = i => !!rowEl(i)?.matches('.mm-pal-row:not(.mm-pal-off)');
const firstRow = () => { const el = cp.list.querySelector('.mm-pal-row:not(.mm-pal-off)'); return el ? +el.dataset.row : -1; };

// The selection to row `from` or the next runnable one in direction `dir` (0: that row or after it).
function select(from, dir) {
  let i = from;
  const last = cp.list.querySelectorAll('[data-row]').length;
  if (dir === 0) { while (i >= 0 && i < last && !runnable(i)) i++; }
  else { do i += dir; while (i >= 0 && i < last && !runnable(i)); }
  if (!runnable(i)) return;
  cp.selected = i;
  for (const el of cp.list.querySelectorAll('.mm-pal-sel')) el.classList.remove('mm-pal-sel');
  rowEl(i).classList.add('mm-pal-sel');
  rowEl(i).scrollIntoView({ block: 'nearest' });
}
const run = i => { if (runnable(i)) toWindow({ kind: 'run', row: i }); };

// Where a section's header is in the list (its scroll position), and a mark per section on the scrollbar.
const sectionTop = tr => tr.getBoundingClientRect().top - cp.list.getBoundingClientRect().top + cp.list.scrollTop;
function markSections() {
  const { scrollHeight, clientHeight } = cp.list;
  cp.marks.replaceChildren(...(scrollHeight > clientHeight ? [...cp.list.querySelectorAll('[data-section]')] : []).map(tr => {
    const mark = document.createElement('div');
    mark.style.top = Math.round(sectionTop(tr) / scrollHeight * clientHeight) + 'px';
    return mark;
  }));
}
new ResizeObserver(markSections).observe(cp.list);

// The section the list is in: its name instead of the Keys column's, once its header has scrolled away under the
// column names (at the top of the list: Keys).
function showSection() {
  const head = cp.list.querySelector('thead th');
  if (!head) return;
  const line = head.getBoundingClientRect().bottom - 1;   // the stuck cell: the thead itself scrolls along
  const current = [...cp.list.querySelectorAll('[data-section]')].findLast(tr => tr.getBoundingClientRect().top < line);
  const label = current?.textContent ?? '';
  if (head.dataset.label === label) return;
  head.dataset.label = label;
  head.classList.toggle('mm-pal-section', !!current);
  head.replaceChildren(current ? Object.assign(document.createElement('span'), { textContent: label }) : 'Keys');
}
cp.list.addEventListener('scroll', showSection);

// The section list: its first row at the top, under the column names (its header just scrolled away: its name is
// there); the keyboard back in the search.
cp.jump.addEventListener('change', () => {
  const tr = cp.list.querySelector(`[data-section="${cp.jump.value}"]`);
  if (tr) cp.list.scrollTop = sectionTop(tr) + tr.offsetHeight - cp.list.querySelector('thead').offsetHeight;
  cp.jump.value = '';
  cp.input.focus();
});

cp.input.addEventListener('input', () => toWindow({ kind: 'search', q: cp.input.value }));
// Its own keys, before the window gets the ones it does not use (pane.js).
addEventListener('keydown', e => {
  if (e.target === cp.jump) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') select(cp.selected, e.key === 'ArrowDown' ? 1 : -1);
  else if (e.key === 'PageDown' || e.key === 'PageUp') for (let n = 0; n < 10; n++) select(cp.selected, e.key === 'PageDown' ? 1 : -1);
  else if (e.key === 'Enter') run(cp.selected);
  else if (e.key === 'Escape') {   // first the search goes, then the window
    if (cp.input.value) { cp.input.value = ''; toWindow({ kind: 'search', q: '' }); }
    else toWindow({ kind: 'close' });
  } else return;
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);
cp.list.addEventListener('click', e => {
  const row = e.target.closest('[data-row]');
  if (row) select(+row.dataset.row, 0);
  cp.input.focus();
});
cp.list.addEventListener('dblclick', e => {
  const row = e.target.closest('[data-row]');
  if (row) run(+row.dataset.row);
});
addEventListener('focus', () => toWindow({ kind: 'refresh' }));
