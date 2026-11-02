'use strict';
// The Macros window's page (macros.html; docs/plans/24-PLAN-docking.md 7b, plan 36 3.3, 3.4): Manage (the stored
// macros in a list) or one macro's window, what it shows from its window's page (macros.js: the message `macros`),
// what is done in it going there: a button (`macro`, with the macro it acts on), another macro chosen in the list
// (`select`), Esc (`escape`). A double click in the list plays that macro.

const mp = { list: document.querySelector('.mp-list'), title: document.querySelector('.mp-title'), key: document.querySelector('.mp-key'), state: null };
const chosen = () => mp.state?.manage ? mp.list.value || null : mp.state?.name ?? null;

paneHandlers.macros = m => {
  mp.state = m;
  document.body.toggleAttribute('data-manage', m.manage);
  if (m.manage) {
    const keep = mp.list.value;
    mp.list.replaceChildren(...m.names.map(n => Object.assign(document.createElement('option'), { value: n.name, textContent: n.name + (n.keys ? `   (${n.keys})` : '') })));
    mp.list.value = m.names.some(n => n.name === m.selected) ? m.selected : m.names.some(n => n.name === keep) ? keep : m.names[0]?.name ?? '';
  }
  mp.title.textContent = m.title;
  mp.key.textContent = m.keyText;
  for (const b of document.querySelectorAll('.mp-one button')) b.disabled = !chosen();
};
paneHandlers.focus = () => (mp.state?.manage ? mp.list : document.querySelector('[data-macro="play"]')).focus();

document.addEventListener('click', e => {
  const what = e.target.closest('[data-macro]')?.dataset.macro;
  if (what) toWindow({ kind: 'macro', what, name: chosen() });
});
mp.list.addEventListener('change', () => toWindow({ kind: 'select', name: mp.list.value }));
mp.list.addEventListener('dblclick', () => { if (mp.list.value) toWindow({ kind: 'macro', what: 'play', name: mp.list.value }); });
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  toWindow({ kind: 'escape' });
}, true);
