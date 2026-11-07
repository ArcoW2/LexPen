'use strict';
// The Macros window's page (macros.html; docs/plans/executed/PLAN-docking.md 7b, plan 36 3.3, 3.4): Manage (the stored
// macros in a list) or one macro's window, what it shows from its window's page (macros.js: the message `macros`),
// what is done in it going there: a button (`macro`, with the macro it acts on), another macro chosen in the list
// (`select`), Esc (`escape`). A double click in the list plays that macro.

const mp = { list: document.querySelector('.mp-list'), title: document.querySelector('.mp-title'), key: document.querySelector('.mp-key'), state: null, value: '' };
const chosen = () => mp.state?.manage ? mp.value || null : mp.state?.name ?? null;
const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The list (Manage): a row per macro, drawn here as the Folder pane's rows are (a list box's chosen row would have the
// browser's colours). `notify`: chosen by a click or a key, the window hears of it.
const rows = () => [...mp.list.querySelectorAll('.mp-row')];
function choose(name, notify) {
  mp.value = name ?? '';
  for (const r of rows()) r.classList.toggle('mp-on', r.dataset.name === mp.value);
  mp.list.querySelector('.mp-on')?.scrollIntoView({ block: 'nearest' });
  if (notify) toWindow({ kind: 'select', name: mp.value });
}

paneHandlers.macros = m => {
  mp.state = m;
  document.body.toggleAttribute('data-manage', m.manage);
  if (m.manage) {
    const keep = mp.value;
    mp.list.innerHTML = m.names.map(n => `<div class="mp-row" role="option" data-name="${escapeHtml(n.name)}" title="${escapeHtml(n.name)}">` +
      `${escapeHtml(n.name)}${n.keys ? ` <span class="mp-keys">(${escapeHtml(n.keys)})</span>` : ''}</div>`).join('');
    choose(m.names.some(n => n.name === m.selected) ? m.selected : m.names.some(n => n.name === keep) ? keep : m.names[0]?.name ?? '', false);
  }
  mp.title.textContent = m.title;
  mp.key.textContent = m.keyText;
  for (const b of document.querySelectorAll('.mp-one')) b.disabled = !chosen();
};
paneHandlers.focus = () => (mp.state?.manage ? mp.list : document.querySelector('[data-menu="play"]')).focus();

// A button with a menu: its menu (`buttonMenu`, the button's place in this page), the button pressed while it is open
// (menuClosed: no longer); a click on it while its menu is open only closes the menu. Else the button's own action.
let menuOpen = null, menuWasOpen = null;
const pressed = name => { menuOpen = name; for (const b of document.querySelectorAll('[data-menu]')) b.classList.toggle('mp-open', b.dataset.menu === name); };
// A menu closed: its button no longer pressed (not one opened since: another button's menu replaces it).
paneHandlers.menuClosed = ({ menu }) => { if (!menu || menu === menuOpen) pressed(null); };
// Before the press closes the menu (pane.js, the menu's own): which one was open.
addEventListener('pointerdown', () => { menuWasOpen = menuOpen; }, true);
document.addEventListener('click', e => {
  const drop = e.target.closest('[data-menu]');
  if (drop) {
    if (menuWasOpen === drop.dataset.menu) return pressed(null);
    const r = drop.getBoundingClientRect();
    pressed(drop.dataset.menu);
    return toWindow({ kind: 'buttonMenu', menu: drop.dataset.menu, x: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom), name: chosen() });
  }
  const what = e.target.closest('[data-macro]')?.dataset.macro;
  if (what) toWindow({ kind: 'macro', what, name: chosen() });
});
mp.list.addEventListener('mousedown', e => { const row = e.target.closest('.mp-row'); if (row) choose(row.dataset.name, true); });
mp.list.addEventListener('dblclick', e => { const row = e.target.closest('.mp-row'); if (row) toWindow({ kind: 'macro', what: 'play', name: row.dataset.name }); });
// Up / Down, Home / End, PgUp / PgDn through the list (handled here: not passed on to the window, pane.js).
mp.list.addEventListener('keydown', e => {
  const list = rows(), at = list.findIndex(r => r.dataset.name === mp.value), page = Math.max(1, Math.floor(mp.list.clientHeight / (list[0]?.offsetHeight || 20)) - 1);
  const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: list.length - 1, PageDown: at + page, PageUp: at - page }[e.key];
  if (to === undefined || !list.length) return;
  e.preventDefault();
  choose(list[Math.max(0, Math.min(list.length - 1, to))].dataset.name, true);
});
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  toWindow({ kind: 'escape' });
}, true);
