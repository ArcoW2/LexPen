'use strict';
// Step by step's page (step.html; docs/plans/executed/PLAN-docking.md stage 13, plan 36 3.6): where the macro stopped, its
// buttons (Step, Step into, Continue, Stop: `step` with how), and its variables and the system ones apart, a value that
// changed since the last stop marked (from its window's page, macros.js: the message `step`). Its keys (F10, F11, F5,
// Shift+F5) are the window's, as everywhere; Esc back to the document (`escape`).

const sp = { where: document.querySelector('.sp-where'), vars: document.querySelector('.sp-vars') };

paneHandlers.step = ({ where, running, ended, tables, titles }) => {
  sp.where.textContent = ended ? 'The macro ended' : running ? (where ? where + ' (running)' : 'Running') : where;
  for (const b of document.querySelectorAll('[data-how]')) {
    b.disabled = running || ended;
    b.title = titles?.[b.dataset.how] ?? '';
  }
  sp.vars.replaceChildren(...tables.map(({ title, rows }) => {
    const t = document.createElement('table'), head = t.insertRow().insertCell();
    head.colSpan = 2;
    head.className = 'sp-head';
    head.textContent = title;
    if (!rows.length) { const c = t.insertRow().insertCell(); c.colSpan = 2; c.className = 'sp-none'; c.textContent = '(none yet)'; }
    for (const { name, value, changed } of rows) {
      const r = t.insertRow();
      if (changed) r.className = 'sp-changed';
      r.insertCell().textContent = name;
      Object.assign(r.insertCell(), { textContent: value === '' ? '""' : value, title: value });
    }
    return t;
  }));
};

document.addEventListener('click', e => { const how = e.target.closest('[data-how]')?.dataset.how; if (how) toWindow({ kind: 'step', how }); });
document.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });   // the keys stay where they are
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  toWindow({ kind: 'escape' });
}, true);
