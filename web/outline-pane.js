// An editor pane's outline, as a page of its own (docs/plans/24-PLAN-docking.md 3.3): the window's page works out the
// entries (app.js showOutline) and sends them as rows; this page shows them and sends back what is done with them:
// a click, a double-click, a group folded, a long press (a sneak preview), the right-click menu. Up / Down, PgUp /
// PgDn, Ctrl+Home / Ctrl+End go through the entries shown here; Enter goes there, the focus staying here.
const list = document.querySelector('.mm-outline-list');
let current = null;   // the line of the entry at the cursor

paneHandlers.rows = m => {
  list.replaceChildren(...m.rows.map(row));
  markCurrent(current);
};
paneHandlers.current = m => markCurrent(m.line);
paneHandlers.fold = m => {
  list.querySelector(`[data-group-head="${m.gi}"]`)?.toggleAttribute('data-folded', m.fold);
  for (const el of list.querySelectorAll(`.mm-outline-item[data-group="${m.gi}"]`)) el.hidden = m.fold;
};
paneHandlers.sneak = m => {
  for (const el of list.querySelectorAll('.mm-sneak')) el.classList.remove('mm-sneak');
  if (m.line != null) itemAt(m.line)?.classList.add('mm-sneak');
};
paneHandlers.focus = () => {
  setKey(list.querySelector('.mm-outline-key:not([hidden])') ?? list.querySelector('.mm-outline-item.mm-on') ?? items()[0]);
  list.focus();
};

// A row: { t: 'item', line, ch, level, pad, text, title, group, hidden, colour } | { t: 'group', gi, label, folded,
// colour } | { t: 'none', text }.
function row(r) {
  const el = document.createElement('div');
  if (r.t === 'none') { el.className = 'mm-outline-none'; el.textContent = r.text; return el; }
  if (r.colour) {
    const b = document.createElement('span');
    b.className = 'mm-outline-bullet';
    b.style.background = r.colour;
    el.append(b);
  }
  if (r.t === 'group') {
    el.className = 'mm-outline-group';
    el.dataset.groupHead = r.gi;
    el.toggleAttribute('data-folded', r.folded);
    el.append(r.label);
    el.title = 'Click: fold or unfold';
    return el;
  }
  el.className = 'mm-outline-item';
  Object.assign(el.dataset, { line: r.line, ch: r.ch, level: r.level });
  if (r.group !== undefined) el.dataset.group = r.group;
  el.style.paddingLeft = r.pad + 'px';
  el.append(r.text);
  el.title = r.title;
  el.hidden = !!r.hidden;
  return el;
}

const items = () => [...list.querySelectorAll('.mm-outline-item')].filter(el => !el.hidden);
const itemAt = line => list.querySelector(`.mm-outline-item[data-line="${line}"]`);

function markCurrent(line) {
  current = line;
  const item = line == null ? null : itemAt(line);
  for (const el of list.querySelectorAll('.mm-on')) if (el !== item) el.classList.remove('mm-on');
  if (item && !item.classList.contains('mm-on')) {
    item.classList.add('mm-on');
    item.scrollIntoView({ block: 'nearest' });
  }
}

function setKey(item) {
  for (const el of list.querySelectorAll('.mm-outline-key')) el.classList.remove('mm-outline-key');
  if (!item) return;
  item.classList.add('mm-outline-key');
  item.scrollIntoView({ block: 'nearest' });
}

const entry = e => e.target.closest('[data-line]');
list.addEventListener('click', e => {
  const head = e.target.closest('[data-group-head]');
  if (head) return toWindow({ kind: 'group', gi: +head.dataset.groupHead });
  const item = entry(e);
  if (item) toWindow({ kind: 'click', line: +item.dataset.line });
});
list.addEventListener('dblclick', e => {
  const item = entry(e);
  if (item) toWindow({ kind: 'dblclick', line: +item.dataset.line, ch: +item.dataset.ch || 0 });
});
// A long press: a sneak preview, worked by the window (its timing, the text going there and back).
list.addEventListener('pointerdown', e => {
  const item = entry(e);
  toWindow({ kind: 'down', line: item ? +item.dataset.line : null, text: item?.textContent ?? '', button: e.button });
});
list.addEventListener('pointermove', e => {
  const item = entry(e);
  if (item && e.buttons) toWindow({ kind: 'move', line: +item.dataset.line, text: item.textContent });
});
for (const type of ['pointerup', 'pointercancel']) addEventListener(type, () => toWindow({ kind: 'up' }));
list.addEventListener('contextmenu', e => {
  e.preventDefault();
  toWindow({ kind: 'menu', x: e.clientX, y: e.clientY });   // the window shows it, over everything
});

list.addEventListener('keydown', e => {
  const all = items();
  if (!all.length) return;
  const at = Math.max(0, all.indexOf(list.querySelector('.mm-outline-key')));
  const page = Math.max(1, Math.floor(list.clientHeight / (all[0].offsetHeight || 20)) - 1);
  const to = { ArrowDown: at + 1, ArrowUp: at - 1, PageDown: at + page, PageUp: at - page }[e.key]
    ?? (e.ctrlKey && e.key === 'Home' ? 0 : e.ctrlKey && e.key === 'End' ? all.length - 1 : null);
  if (to !== null) {
    e.preventDefault();
    setKey(all[Math.max(0, Math.min(all.length - 1, to))]);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    toWindow({ kind: 'enter', line: +all[at].dataset.line });
  }
});
