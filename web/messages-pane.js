'use strict';
// The Messages pane's page (messages.html; docs/plans/executed/PLAN-docking.md stage 11): every message of its window since
// it opened (from its window's page, app.js: the message `messages`), newest first, with its time and the document
// active then; a click on the document goes there (`go`); Clear (`clear`); Esc back to the document (`escape`).

const ms = { list: document.querySelector('.ms-list'), none: document.querySelector('.ms-none') };

paneHandlers.messages = ({ list }) => {
  ms.list.replaceChildren(...list.map(m => {
    const row = document.createElement('tr');
    row.className = m.info ? 'ms-info' : 'ms-error';
    const doc = document.createElement('td');
    if (m.name) {
      const link = Object.assign(document.createElement('a'), { href: '#', textContent: m.name, title: m.where });
      link.addEventListener('click', e => { e.preventDefault(); toWindow({ kind: 'go', i: m.i }); });
      doc.append(link);
    }
    row.append(Object.assign(document.createElement('td'), { textContent: m.at, className: 'ms-at' }),
      Object.assign(document.createElement('td'), { textContent: m.text }), doc);
    return row;
  }));
  ms.none.hidden = list.length > 0;
};
paneHandlers.focus = () => document.querySelector('.ms-clear').focus();

document.querySelector('.ms-clear').addEventListener('click', () => toWindow({ kind: 'clear' }));
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  toWindow({ kind: 'escape' });
}, true);
