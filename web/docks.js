'use strict';
// The dock areas (docs/plans/executed/PLAN-docking.md 3.6, 3.7, 3.7a, 3.10): left, right and bottom of the window around
// the editor area (the bottom one the full width of the window or between the side areas), and left, right and
// bottom of each editor pane around its text (the bottom one the full width of the pane). An area holds groups (above
// or under each other at the sides, next to each other at the bottom), a group its panes as tabs, one shown at a time,
// with splitters between the groups and against what the area is beside. An area closes to a strip along its edge with
// a tab per pane (turned at the sides) and opens again as it was. A pane is shown, hidden (no tab; it comes back in its
// place) or floating (a window of its own, panechannel.js).
// An area's key: `left`, `right`, `bottom` (the window's), `0.left` ... `1.bottom` (an editor pane's). A pane's scope
// says where it can be: a window pane (Folder, Search) in the window's areas; an editor pane's own pane (its outline)
// at that editor pane only. Kept in the window's layout: `docks` (an editor pane's areas under `editor`), with
// `sidebar` and `sidebarWidth` as before (the left area open, its width).
// Moving a pane's view in the page loads its frame again, so the groups' elements stay, a hidden pane's view stays in
// its group, and a view only moves when its pane changes group. Loaded before app.js; nothing here runs before app.js
// has started.

const DOCK_SIDES = ['left', 'right', 'bottom'];
const DOCK_AREAS = [...DOCK_SIDES, ...[0, 1].flatMap(p => DOCK_SIDES.map(s => `${p}.${s}`))];
const DOCK_MIN = 120;      // an area's least width (sides) or height (bottom), in px
const EDITOR_MIN = 300;    // what the editor area keeps at least, in px
const TEXT_MIN = 200;      // what an editor pane's text keeps at least beside its own areas, in px
const dockPanes = new Map();
// id -> { title, view: element, channel, focus(), scope: 'window' | 'pane', pane: its editor pane (scope pane),
// home: its area the first time, startHidden / startState ('hidden', 'floating'): its state the first time, hidden() / setHidden(on): its own on / off (else
// the layout's state), available(): whether it has something to show here (else no tab, no room), kind: a pane with a
// place per editor pane and one for the window (the Outline: outline:0, outline:1, outline:w; Characters: chars:0,
// chars:1, chars), leave(m): it leaves its
// place to another of its kind, sync(): after each change, its own state to the docks' (the window's outline),
// hostId: its floating window's name for the host when that is not its id }

function registerDockPane(id, def) { dockPanes.set(id, { scope: 'window', home: 'left', ...def }); }

const areaSide = key => key.split('.').pop();
const areaPane = key => key.includes('.') ? +key[0] : -1;
// A pane of a kind, at a place of another of its kind: that one (3.10: away from its editor pane it is the window's,
// at an editor pane that pane's own).
function dockInstance(id, key) {
  const kind = dockPanes.get(id)?.kind;
  if (!kind) return id;
  const want = areaPane(key) < 0 ? [...dockPanes].find(([, d]) => d.kind === kind && d.scope === 'window')?.[0] : `${kind}:${areaPane(key)}`;
  return dockPanes.has(want) ? want : id;
}
// Where a pane may be: a window pane in the window's areas, an editor pane's own pane at that editor pane (a pane of a
// kind: wherever one of its kind may be).
const dockAllowed = (id, key) => {
  const d = dockPanes.get(dockInstance(id, key));
  return d.scope === 'pane' ? areaPane(key) === d.pane : areaPane(key) < 0;
};

// The layout value made whole: every pane in exactly one group of an area it may be in (one in none goes to its home
// area's first group), a group's active pane one of its own.
function dockModel() {
  const raw = setting('docks');
  const m = { left: { groups: [] }, right: { open: true, size: 0, groups: [] }, bottom: { open: true, size: 0, width: 'inner', groups: [] },
    editor: [0, 1].map(() => ({ left: { open: true, size: 0, groups: [] }, right: { open: true, size: 0, groups: [] }, bottom: { open: true, size: 0, groups: [] } })),
    state: {} };
  const seen = new Set();
  for (const key of DOCK_AREAS) {
    const a = (areaPane(key) < 0 ? raw?.[key] : raw?.editor?.[areaPane(key)]?.[areaSide(key)]) ?? {}, to = dockArea(m, key);
    if (key !== 'left') { to.open = a.open !== false; to.size = +a.size || 0; }
    if (key === 'bottom') to.width = a.width === 'full' ? 'full' : 'inner';
    for (const g of Array.isArray(a.groups) ? a.groups : []) {
      const ids = (Array.isArray(g?.panes) ? g.panes : []).filter(id => dockPanes.has(id) && !seen.has(id) && dockAllowed(id, key));
      ids.forEach(id => seen.add(id));
      if (ids.length) to.groups.push({ panes: ids, active: ids.includes(g.active) ? g.active : ids[0], size: +g.size > 0 ? +g.size : 1, ...(g.rolled ? { rolled: true } : {}) });
    }
  }
  for (const [id, s] of Object.entries(raw?.state ?? {})) if (dockPanes.has(id) && (s === 'hidden' || s === 'floating')) m.state[id] = s;
  for (const [id, d] of dockPanes) if (!seen.has(id)) {
    const groups = dockArea(m, d.home).groups;
    if (!groups.length) groups.push({ panes: [], active: id, size: 1 });
    groups[0].panes.push(id);
    const first = d.startState ?? (d.startHidden ? 'hidden' : null);   // its state the first time
    if (first && !(raw?.state && id in raw.state)) m.state[id] = first;
  }
  return m;
}
const dockArea = (m, key) => areaPane(key) < 0 ? m[key] : m.editor[areaPane(key)][areaSide(key)];
const dockHidden = (m, id) => { const d = dockPanes.get(id); return d.hidden ? d.hidden() : m.state[id] === 'hidden'; };
const dockShown = (m, id) => !dockHidden(m, id) && m.state[id] !== 'floating' && (dockPanes.get(id).available?.() ?? true);
function dockGroupOf(m, id) {
  for (const key of DOCK_AREAS) for (const g of dockArea(m, key).groups) if (g.panes.includes(id)) return { key, side: areaSide(key), g };
  return null;
}
const dockOpen = (m, key) => key === 'left' ? document.body.dataset.sidebar === 'on' : dockArea(m, key).open;
// Where an area's state shows: the body for the window's, the editor pane's element for its own.
const dockHost = key => areaPane(key) < 0 ? document.body : panes[areaPane(key)].el;
const dockAttr = key => 'dock' + areaSide(key)[0].toUpperCase() + areaSide(key).slice(1);
const dockAreaEl = key => document.querySelector(`.mm-dock[data-area="${key}"]`);
const dockSizeVar = key => areaPane(key) < 0 ? { left: '--sidebar-w', right: '--dock-right-w', bottom: '--dock-bottom-h' }[key]
  : { left: '--pdock-left-w', right: '--pdock-right-w', bottom: '--pdock-bottom-h' }[areaSide(key)];

function setDockHidden(m, id, on) {
  const d = dockPanes.get(id);
  if (d.setHidden) return d.setHidden(on);
  if (on) m.state[id] = 'hidden'; else if (m.state[id] === 'hidden') delete m.state[id];
}

function saveDocks(m) {
  for (const key of DOCK_AREAS) { const a = dockArea(m, key); a.groups = a.groups.filter(g => g.panes.length); }
  keepLayout('docks', JSON.parse(JSON.stringify(m)));
  renderDocks();
}

// ---------- What the page shows ----------
function renderDocks() {
  if (!dockPanes.size) return;
  const m = dockModel(), hold = $('.mm-dock-hold'), shape = [];
  for (const key of DOCK_AREAS) {
    const area = dockAreaEl(key);
    if (!area) continue;
    const body = area.querySelector('.mm-dock-body'), strip = area.querySelector('.mm-dock-strip'), side = areaSide(key);
    // Every group keeps its element (a hidden pane's view stays in it); a group with no pane shown is hidden.
    const groups = dockArea(m, key).groups.map(g => ({ g, placed: g.panes.filter(id => m.state[id] !== 'floating'), shown: g.panes.filter(id => dockShown(m, id)) }))
      .filter(x => x.placed.length);
    const any = groups.some(x => x.shown.length), open = dockOpen(m, key);
    const state = !any ? 'none' : open ? 'open' : 'closed';
    dockHost(key).dataset[dockAttr(key)] = state;
    shape.push(state, dockArea(m, key).size);
    strip.replaceChildren(dockButton(key, false), ...groups.flatMap(x => x.shown.map(id => dockTab(id, true))));
    while (body.children.length > groups.length) {
      const el = body.lastElementChild;
      for (const view of el.querySelectorAll(':scope > .mm-dock-views > *')) hold.append(view);
      el.remove();
    }
    while (body.children.length < groups.length) body.append(dockGroupElement());
    let first = true, before = null;   // before: the shown group above (its roll-up)
    const stacked = groups.filter(x => x.shown.length).length > 1;   // a roll-up only in a stack of groups
    // The groups' shares relative to the shown ones' sum (not rolled up), so they always fill the area: shares left by a
    // group that went (halved by a drop beside it, its tabs joined elsewhere) would leave room empty.
    const total = groups.filter(x => x.shown.length && !(x.g.rolled && side !== 'bottom' && stacked)).reduce((n, x) => n + x.g.size, 0) || 1;
    groups.forEach(({ g, placed, shown }, i) => {
      const el = body.children[i], views = el.querySelector('.mm-dock-views'), active = shown.includes(g.active) ? g.active : shown[0];
      const rolled = !!g.rolled && side !== 'bottom' && stacked;
      el.hidden = !shown.length;
      el.classList.toggle('mm-rolled', rolled);
      el.style.flexGrow = rolled ? 0 : g.size / total;
      el.dataset.index = i;
      el.dataset.pane = placed[0];   // a pane of it, for a drop (dockDropAt)
      el.querySelector('.mm-dock-gsplit').hidden = first || !shown.length || rolled || before?.rolled;
      el.querySelector('.mm-dock-tabs').replaceChildren(...shown.map(id => dockTab(id, false, id === active)));
      el.querySelector('.mm-dock-head').replaceChildren(el.querySelector('.mm-dock-tabs'),
        ...(side !== 'bottom' && stacked && shown.length ? [rollButton(key, placed[0], rolled)] : []),
        ...(first && shown.length ? [dockButton(key, true)] : []));
      if (shown.length) { first = false; before = { rolled }; }
      for (const id of placed) {
        const view = dockPanes.get(id).view;
        if (view.parentElement !== views) views.append(view);
        view.hidden = id !== active;
      }
    });
    if (key === 'bottom') document.body.dataset.dockBottomWidth = m.bottom.width;
    layoutWidth(dockSizeVar(key), dockArea(m, key).size, dockHost(key));
  }
  // A floating pane keeps its view out of sight.
  for (const [id, p] of dockPanes) if (m.state[id] === 'floating' && p.view.parentElement !== hold) hold.append(p.view);
  for (const p of dockPanes.values()) p.sync?.();
  reportPanesWanted();   // the floating panels that follow the focus: which this window wants (panechannel.js)
  // The editors measured again (relayout: costly on a large file) only when the areas' shape or sizes changed.
  shape.push(m.bottom.width, setting('sidebarWidth'));
  const key = shape.join(',');
  if (key !== renderDocks.shape) relayout();
  renderDocks.shape = key;
}

function dockGroupElement() {
  const el = document.createElement('div');
  el.className = 'mm-dock-group';
  el.innerHTML = '<div class="mm-dock-gsplit"></div><div class="mm-dock-head"><div class="mm-dock-tabs"></div></div><div class="mm-dock-views"></div>';
  el.querySelector('.mm-dock-gsplit').addEventListener('pointerdown', e => resizeDockGroup(e, el));
  // The setting dockTabBar "scroll": the wheel scrolls the row of tabs.
  el.querySelector('.mm-dock-tabs').addEventListener('wheel', e => {
    const tabs = e.currentTarget;
    if (tabs.scrollWidth <= tabs.clientWidth || !e.deltaY) return;
    e.preventDefault();
    tabs.scrollLeft += getComputedStyle(tabs).flexDirection === 'row-reverse' ? -e.deltaY : e.deltaY;
  }, { passive: false });
  return el;
}

// A pane's tab: in its group's head, or in the strip of its closed area.
function dockTab(id, inStrip, active = false) {
  const b = document.createElement('button');
  b.className = 'mm-dock-tab' + (active ? ' mm-on' : '');
  b.dataset.pane = id;
  b.textContent = dockPanes.get(id).title;
  b.title = inStrip ? `${dockPanes.get(id).title}: open the area with it` : dockPanes.get(id).title + ' (drag: move it; right-click: dock, float, close)';
  const click = () => inStrip ? showDockPane(id, true) : activateDockPane(id);
  b.addEventListener('click', e => { if (e.detail === 0) click(); });   // the keyboard's (Enter, Space); the mouse's: dragDockTab
  b.addEventListener('pointerdown', e => dragDockTab(e, id, click));
  b.addEventListener('contextmenu', e => {
    e.preventDefault();
    openContextMenu(dockPaneMenu(id), e.clientX, e.clientY);
  });
  return b;
}

// A group's roll-up (at the sides): rolled up it is as high as its tabs, the other groups there get its room; a pane
// of it shown (its tab, its menu item, a drop) rolls it down again.
function rollButton(key, pane, rolled) {
  const b = document.createElement('button');
  b.className = 'mm-dock-roll';
  b.dataset.dir = rolled ? 'down' : 'up';
  b.title = rolled ? 'Roll down' : 'Roll up (as high as its tabs)';
  b.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l5-5 5 5"/></svg>';
  b.addEventListener('click', () => {
    const m = dockModel(), at = dockGroupOf(m, pane);
    if (!at) return;
    if (rolled) delete at.g.rolled; else at.g.rolled = true;
    saveDocks(m);
  });
  return b;
}

// The button that closes an area (toward its edge) or opens it (the other way).
function dockButton(key, closes) {
  const b = document.createElement('button'), side = areaSide(key);
  b.className = 'mm-dock-button';
  const toEdge = { left: 'left', right: 'right', bottom: 'down' }[side], away = { left: 'right', right: 'left', bottom: 'up' }[side];
  b.dataset.dir = closes ? toEdge : away;
  b.title = closes ? 'Close this dock area' : 'Open this dock area';
  b.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>';
  b.addEventListener('click', () => setDockOpen(key, !closes));
  return b;
}

// ---------- What can be done ----------
function setDockOpen(key, open) {
  if (key === 'left') return setSidebar(open);   // app.js: the layout's `sidebar`, then renderDocks
  const m = dockModel();
  dockArea(m, key).open = open;
  saveDocks(m);
}
const toggleDock = key => setDockOpen(key, !dockOpen(dockModel(), key));

// A pane in front of its group (shown again when hidden: in a closed area only its tab comes back).
function activateDockPane(id) {
  const m = dockModel(), at = dockGroupOf(m, id);
  if (!at) return;
  at.g.active = id;
  delete at.g.rolled;
  if (dockHidden(m, id)) setDockHidden(m, id, false);
  saveDocks(m);
}
// The same, and its area opens (`open`); false: it floats (its window is where it is).
function showDockPane(id, open = true) {
  const m = dockModel(), at = dockGroupOf(m, id);
  if (!at || m.state[id] === 'floating') return false;
  at.g.active = id;
  delete at.g.rolled;
  if (dockHidden(m, id)) setDockHidden(m, id, false);
  if (open && at.key !== 'left') dockArea(m, at.key).open = true;
  saveDocks(m);
  if (open && at.key === 'left' && document.body.dataset.sidebar !== 'on') setSidebar(true);
  return true;
}
const dockPaneVisible = id => { const m = dockModel(), at = dockGroupOf(m, id); return !!at && dockShown(m, id) && dockOpen(m, at.key) && at.g.active === id; };

// How a pane was shown, and back to that (Esc in the Search pane: the area as before the search).
function dockSnapshot(id) {
  const m = dockModel(), at = dockGroupOf(m, id);
  return at && { key: at.key, active: at.g.active, open: dockOpen(m, at.key), hidden: dockHidden(m, id) };
}
function dockRestore(id, was) {
  if (!was) return;
  const m = dockModel(), at = dockGroupOf(m, id);
  if (!at) return;
  if (at.g.panes.includes(was.active)) at.g.active = was.active;
  if (was.hidden) setDockHidden(m, id, true);
  if (was.key !== 'left') dockArea(m, was.key).open = was.open;
  saveDocks(m);
  if (was.key === 'left' && !was.open) setSidebar(false);
}

// focusPane's stop at the window's dock areas: the pane in front of the first open group (left, right, bottom); null:
// none. (An editor pane's own panes are its parts: Ctrl+Shift+Tab.)
function dockFocusPane() {
  const m = dockModel();
  for (const key of DOCK_SIDES) {
    if (!dockOpen(m, key)) continue;
    for (const g of dockArea(m, key).groups) {
      const shown = g.panes.filter(id => dockShown(m, id));
      if (shown.length) return shown.includes(g.active) ? g.active : shown[0];
    }
  }
  return null;
}

function hideDockPane(id) {
  const m = dockModel();
  setDockHidden(m, id, true);
  saveDocks(m);
}

// The pane floats, or came back (panechannel.js onFloat / onDock).
function setDockFloating(id, on) {
  const m = dockModel();
  if (on) m.state[id] = 'floating'; else delete m.state[id];
  saveDocks(m);
}

// Docked in an area: a tab in its first group (a new group when it has none). `width`: the bottom area's.
function dockPaneAt(id, key, width) {
  dockMove(id, { key, group: dockArea(dockModel(), key).groups.find(g => g.panes.length)?.panes[0] ?? null, where: 'tab', width });
}

function dockPaneMenu(id) {
  const d = dockPanes.get(id), m = dockModel(), at = dockGroupOf(m, id);
  const here = (key, width) => at?.key === key && (key !== 'bottom' || !width || m.bottom.width === width);
  const p = d.scope === 'pane' ? d.pane : state.activePane;
  const atText = [['At the left of the text', `${p}.left`], ['At the right of the text', `${p}.right`], ['Under the text', `${p}.bottom`]];
  const inWindow = [['Dock left', 'left'], ['Dock right', 'right'], ['Dock at the bottom, the full width', 'bottom', 'full'], ['Dock at the bottom, between the sides', 'bottom', 'inner']];
  const places = d.kind ? [...atText, '-', ...inWindow] : d.scope === 'pane' ? atText : inWindow;
  return [
    { label: 'Float in a window of its own', run: () => d.channel?.float(), plain: true },
    '-',
    ...places.map(x => x === '-' ? '-' : { label: x[0], checked: here(x[1], x[2]), run: () => dockPaneAt(id, x[1], x[2]), plain: true }),
    '-',
    { label: 'Close', run: () => hideDockPane(id), plain: true },
  ];
}

// ---------- Moving a pane (3.8) ----------
// Where a pane goes: `to` = { key: the area, group: a pane of the group it goes to (null: none), where: 'tab' (in that
// group), 'before' / 'after' (a group of its own beside it), 'end' (a group of its own at the area's end), width: the
// window's bottom area's }. Shown there (also when it was hidden); from a floating window it docks (its window closes).
function dockMove(id, to) {
  const m = dockModel(), other = dockInstance(id, to.key);
  if (other !== id) { dockPanes.get(id).leave?.(m, other); id = other; }   // the window's outline at an editor pane, ...
  const from = dockGroupOf(m, id), groups = dockArea(m, to.key).groups;
  const target = to.group ? groups.find(g => g.panes.includes(to.group)) : null;   // found before the pane leaves
  // Beside or in its own group when it is the only pane there: it stays in that group (only shown, opened, the width).
  const stays = target && target === from?.g && target.panes.length === 1;
  if (stays) delete target.rolled;
  else {
    const was = target?.panes.indexOf(id) ?? -1;   // dropped on its own tab: it stays there
    if (from) from.g.panes = from.g.panes.filter(p => p !== id);
    if (to.where === 'tab' && target) {
      const at = !to.before ? -1 : to.before === id ? was : target.panes.indexOf(to.before);   // a drop between tabs (dropOnHead)
      target.panes.splice(at < 0 ? target.panes.length : at, 0, id);
      target.active = id;
      delete target.rolled;
    }
    else if ((to.where === 'before' || to.where === 'after') && target) {
      const size = target.size / 2;
      target.size = size;
      groups.splice(groups.indexOf(target) + (to.where === 'after' ? 1 : 0), 0, { panes: [id], active: id, size });
    } else groups.push({ panes: [id], active: id, size: 1 });
  }
  if (to.key === 'bottom' && to.width) m.bottom.width = to.width;
  if (to.key !== 'left') dockArea(m, to.key).open = true;
  if (dockHidden(m, id)) setDockHidden(m, id, false);
  saveDocks(m);
  if (to.key === 'left' && document.body.dataset.sidebar !== 'on') setSidebar(true);
  const ch = dockPanes.get(id).channel;
  if (ch?.floating) ch.back();   // onDock shows it at its new place
}

// The place under x, y (in this page) for pane `id`, with the rectangle that lights up; null: no place (it floats
// there). Only the areas it may be in (dockAllowed). A group: its head as a tab, its body by the third (above / under
// at the sides, left / right at the bottom). The strip of a closed area: a tab in it. A window pane: the window's left
// and right edge (a group of its own there), the bottom bar's edge (the bottom area the full width) and just above it
// (between the side areas). An editor pane's own pane: the left, right and bottom edge of its editor pane.
function dockDropAt(x, y, id) {
  const main = $('.mm-main').getBoundingClientRect();
  if (x < main.left || x > main.right || y < main.top || y > main.bottom) return null;
  const rect = (left, top, width, height) => ({ left, top, width, height });
  const inside = r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const d = dockPanes.get(id);
  // The editor panes whose edges are places for it: every one with a pane of its kind (there it becomes that pane's
  // own: from the window, or from the other editor pane), else its own (an editor pane's own pane).
  const edgePanes = d.kind ? panes.map(p => p.index).filter(i => dockPanes.has(`${d.kind}:${i}`)) : d.scope === 'pane' ? [d.pane] : [];
  if (d.scope !== 'pane' && y > main.bottom - 14) return { key: 'bottom', where: 'end', width: 'full', rect: rect(main.left, main.bottom - 140, main.width, 140) };
  for (const el of document.querySelectorAll('.mm-dock-group')) {
    const key = el.closest('.mm-dock').dataset.area;
    if (!el.offsetParent || !dockAllowed(id, key)) continue;
    const r = el.getBoundingClientRect();
    if (!inside(r)) continue;
    const group = el.dataset.pane, across = areaSide(key) === 'bottom';
    if (y <= el.querySelector('.mm-dock-head').getBoundingClientRect().bottom) return dropOnHead(el, x, y, { key, group, where: 'tab' });
    const f = across ? (x - r.left) / r.width : (y - r.top) / r.height;
    if (f < 1 / 3) return { key, group, where: 'before', rect: across ? rect(r.left, r.top, r.width / 2, r.height) : rect(r.left, r.top, r.width, r.height / 2) };
    if (f > 2 / 3) return { key, group, where: 'after', rect: across ? rect(r.left + r.width / 2, r.top, r.width / 2, r.height) : rect(r.left, r.top + r.height / 2, r.width, r.height / 2) };
    return { key, group, where: 'tab', rect: rect(r.left, r.top, r.width, r.height) };
  }
  for (const key of DOCK_AREAS) {
    const strip = dockAreaEl(key)?.querySelector('.mm-dock-strip');
    if (!strip?.offsetParent || !dockAllowed(id, key) || !inside(strip.getBoundingClientRect())) continue;
    const r = strip.getBoundingClientRect(), g = dockArea(dockModel(), key).groups.find(g => g.panes.length);
    return { key, group: g?.panes[0] ?? null, where: g ? 'tab' : 'end', rect: rect(r.left, r.top, r.width, r.height) };
  }
  const EDGE = 32;
  for (const p of edgePanes) {
    if (panes[p].el.hidden) continue;
    const mine = panes[p].el.querySelector('.mm-body').getBoundingClientRect();
    if (!inside(mine)) continue;
    if (x < mine.left + EDGE) return { key: `${p}.left`, where: 'end', rect: rect(mine.left, mine.top, 200, mine.height) };
    if (x > mine.right - EDGE) return { key: `${p}.right`, where: 'end', rect: rect(mine.right - 200, mine.top, 200, mine.height) };
    if (y > mine.bottom - 40) return { key: `${p}.bottom`, where: 'end', rect: rect(mine.left, mine.bottom - 140, mine.width, 140) };
  }
  if (d.scope === 'pane') return null;
  const work = $('.mm-work').getBoundingClientRect();
  if (x < main.left + EDGE) return { key: 'left', group: null, where: 'end', rect: rect(main.left, main.top, 240, main.height) };
  if (x > main.right - EDGE) return { key: 'right', group: null, where: 'end', rect: rect(main.right - 240, main.top, 240, main.height) };
  if (y > main.bottom - 60) return { key: 'bottom', where: 'end', width: 'inner', rect: rect(work.left, main.bottom - 140, work.width, 140) };
  return null;
}

// On a group's head: between its tabs (`before`: the pane whose tab it goes in front of; none: after the last), lit
// up as a line there. The tabs in their order, row by row (wrapped), at the right from right to left.
function dropOnHead(el, x, y, to) {
  const tabs = [...el.querySelectorAll('.mm-dock-tabs .mm-dock-tab')], rtl = getComputedStyle(el.querySelector('.mm-dock-tabs')).flexDirection === 'row-reverse';
  const at = tabs.find(t => { const r = t.getBoundingClientRect(); return y < r.top || y <= r.bottom && (rtl ? x > r.left + r.width / 2 : x < r.left + r.width / 2); });
  const r = (at ?? tabs.at(-1))?.getBoundingClientRect();
  if (!r) return { ...to, rect: el.getBoundingClientRect() };
  const edge = !at === rtl ? r.left : r.right;   // the front of `at`, else the end of the last
  return { ...to, before: at?.dataset.pane ?? null, rect: { left: edge - 2, top: r.top, width: 4, height: r.height } };
}

// The lit-up place: one element over everything, shown at `to.rect` (null: hidden).
function showDropPlace(to) {
  let el = $('.mm-drop-place');
  if (!el) document.body.append(el = Object.assign(document.createElement('div'), { className: 'mm-drop-place' }));
  el.hidden = !to;
  if (to) Object.assign(el.style, { left: to.rect.left + 'px', top: to.rect.top + 'px', width: to.rect.width + 'px', height: to.rect.height + 'px' });
}

// A tab dragged: past a few pixels the drag starts and the place under the pointer lights up; let go there, the pane
// goes there; let go elsewhere (outside the window too), it floats there. Esc: the drag ends, nothing moves. A cover
// lies over the page from the press on, else a move over a pane's frame (its own process) would go there and never
// come here; so a press and release without a drag is the tab's click (`click`). The tab keeps the pointer, so the
// release outside the window comes too.
function dragDockTab(e, id, click) {
  if (e.button !== 0) return;
  const tab = e.currentTarget, x0 = e.clientX, y0 = e.clientY;
  let dragging = false, to = null;
  e.preventDefault();
  tab.setPointerCapture(e.pointerId);
  const cover = Object.assign(document.createElement('div'), { className: 'mm-drag-cover' });
  document.body.append(cover);
  const finish = drop => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('keydown', key, true);
    cover.remove();
    showDropPlace(null);
    if (!dragging) return drop && click();
    if (!drop) return;
    if (to) dockMove(id, to);
    else dockPanes.get(id).channel?.float({ atCursor: true });
  };
  const move = ev => {
    if (!dragging) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      dragging = true;
      cover.style.cursor = 'grabbing';
    }
    to = dockDropAt(ev.clientX, ev.clientY, id);
    showDropPlace(to);
  };
  const up = () => finish(true);
  const key = ev => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    finish(false);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('keydown', key, true);
}

// A floating pane's window moved by its title bar (PaneForm.cs): over this window the place under the cursor lights
// up; let go there, it docks there.
const dockByHost = pane => dockPanes.has(pane) ? pane : [...dockPanes].find(([, d]) => d.hostId === pane)?.[0];
function onPaneMoving({ pane, at }) { const id = dockByHost(pane); if (id) showDropPlace(dockDropAt(at[0], at[1], id)); }
function onPaneMoved({ pane, at }) {
  showDropPlace(null);
  const id = dockByHost(pane), to = id && dockDropAt(at[0], at[1], id);
  if (to) dockMove(id, to);
}

// ---------- The actions (F1, keys.json): a pane as their value ----------
const DOCK_PANE_TITLES = { folder: 'the Folder pane', search: 'the Search pane', chars: 'Characters', hls: 'Highlights', settings: 'Settings', projects: 'Manage projects', themesets: 'Theme sets', macros: 'Macros', bm: 'Bookmarks', cols: 'Columns', messages: 'Messages', clips: 'Clipboards', step: 'Step by step', commands: 'Keyboard shortcuts and commands' };
for (const [name, title, hint, run] of [
  ['dock.left', 'Dock left', 'In the dock area at the left, a tab beside the panes there', id => dockPaneAt(id, 'left')],
  ['dock.right', 'Dock right', 'In the dock area at the right, a tab beside the panes there', id => dockPaneAt(id, 'right')],
  ['dock.bottom', 'Dock at the bottom', 'In the dock area at the bottom, a tab beside the panes there', id => dockPaneAt(id, 'bottom')],
  ['dock.float', 'Float', 'In a window of its own', id => dockPanes.get(id).channel?.float()],
  ['dock.close', 'Close', 'Hidden, its tab too; shown again in its place', id => hideDockPane(id)],
])
  appAction(name, { title, hint, group: 'view', variants: Object.keys(DOCK_PANE_TITLES).map(id => [id]),
    variantTitles: Object.fromEntries(Object.entries(DOCK_PANE_TITLES).map(([id, t]) => [id, `${title}: ${t}`])),
    run: ([id]) => dockPanes.has(id) && run(id) });

// ---------- View > Panels (3.14) ----------
// Every panel with a check when it is shown: docked in front in an open area (the window's, or an editor pane's own),
// or its window of its own open (the host knows: toolWindowsOpen). Choosing one hides it when shown (docked: hidden;
// floating: its window closed, as by hand), else shows it as it was last through its own action (docked where it was,
// a tab beside what is there, or its window). Below them the window's dock areas, open or closed, and Reset docking.
const PANELS = [
  ['&Folder', 'folder', () => runAction('folders')],
  ['&Search', 'search', () => runAction('searchView')],
  ['&Outline', 'outline', () => runAction('outline.toggle')],
  ['&Characters', 'chars', () => runAction('insertCharacter')],
  ['&Highlights', 'hls', () => runAction('highlight.list')],
  ['&Bookmarks', 'bm', () => runAction('bookmarks.pane')],
  ['Col&umns (CSV)', 'cols', () => runAction('csv.columns')],
  ['Step b&y step', 'step', () => showStepPane()],
  ['&Messages', 'messages', () => runAction('messages')],
  ['C&lipboards', 'clips', () => runAction('clipboards.pane')],
  ['M&acros', 'macros', () => runAction('macro.manage')],
  ['&Keyboard shortcuts and commands', 'commands', () => runAction('commands')],
  ['Se&ttings', 'settings', () => runAction('settings')],
  ['Manage &projects', 'projects', () => openToolPane('projects', 'openProjects')],
  ['Th&eme sets', 'themesets', () => openToolPane('themesets', 'openThemeSetsWindow')],
];
// A kind's panes: the window's and each editor pane's own (Outline: the editor panes' own and the window's).
const panelIds = kind => [kind === 'outline' ? 'outline:w' : kind, ...panes.map(p => `${kind}:${p.index}`)].filter(id => dockPanes.has(id));
const panelHost = id => dockPanes.get(id).hostId ?? id;   // its window's name for the host
// Docked in front of its group in an open area (the front: the group's active pane when shown, else its first shown).
function dockInFront(id) {
  const m = dockModel(), at = dockGroupOf(m, id);
  if (!at || !dockShown(m, id) || !dockOpen(m, at.key)) return false;
  const shown = at.g.panes.filter(p => dockShown(m, p));
  return (shown.includes(at.g.active) ? at.g.active : shown[0]) === id;
}
function panelShown(kind, open) {
  return panelIds(kind).some(id => dockInFront(id) || dockModel().state[id] === 'floating' && open.includes(panelHost(id)));
}
function togglePanel(kind, run, open) {
  if (!panelShown(kind, open)) return run();
  for (const id of panelIds(kind)) {
    if (dockInFront(id)) hideDockPane(id);
    else if (dockModel().state[id] === 'floating' && open.includes(panelHost(id))) host('closeToolWindow', { kind: panelHost(id) });
  }
}
// Step by step has no action of its own (a step by step shows it): the window's as it was, else the active editor pane's.
function showStepPane() {
  const m = dockModel();
  if (m.state.step === 'floating') return dockPanes.get('step').channel.float();
  showDockPane(dockHidden(m, 'step') ? `step:${state.activePane}` : 'step');
}

async function panelItems() {
  const open = await host('toolWindowsOpen').catch(() => []), m = dockModel();
  return [...PANELS.map(([label, kind, run]) => ({ label, checked: panelShown(kind, open), plain: false, run: () => togglePanel(kind, run, open) })),
    '-',
    ...[['Dock area at the &left', 'left'], ['Dock area at the &right', 'right'], ['Dock area at the botto&m', 'bottom']].map(([label, key]) =>
      ({ label, checked: dockOpen(m, key), run: () => toggleDock(key) })),
    '-', { label: 'Reset &docking', action: 'dock.reset', params: [] }];
}

// Reset docking: the default of a new window (3.13): Folder and Search tabbed at the left, the outline beside each
// editor pane's text, the other panes as they start (floating or hidden); the windows of their own of this window close.
appAction('dock.reset', { title: 'Reset docking', hint: 'Every pane back where a new window has it: Folder and Search at the left, the outline beside the text, the others floating or hidden', group: 'view',
  run: async () => {
    for (const kind of await host('toolWindowsOpen').catch(() => [])) host('closeToolWindow', { kind });
    keepLayout('docks', settings.values.defaultLayout?.docks ?? null);   // your Save as default's, else the shipped one
    setSidebar(true);
    renderDocks();
  } });

// ---------- Sizes ----------
// A drag of a splitter: over a pane's frame (its own process) the moves would not come back here, so a cover lies over
// the whole page until the button is released.
function dockDrag(e, cursor, move, done) {
  const cover = Object.assign(document.createElement('div'), { className: 'mm-drag-cover' });
  cover.style.cursor = cursor;
  document.body.append(cover);
  const up = () => {
    cover.remove();
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    done();
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  e.preventDefault();
}

// An area's splitter against what it is beside: its width (sides) or height (bottom). The window's areas leave the
// editor area EDITOR_MIN; an editor pane's leave its text TEXT_MIN.
function resizeDockArea(e, key) {
  const side = areaSide(key), own = areaPane(key) >= 0;
  const box = (own ? panes[areaPane(key)].el.querySelector('.mm-body') : $('.mm-main')).getBoundingClientRect();
  const keep = own ? TEXT_MIN : EDITOR_MIN, host = dockHost(key);
  const other = s => { const k = own ? `${areaPane(key)}.${s}` : s; return host.dataset[dockAttr(k)] === 'open' ? dockAreaEl(k).offsetWidth : 0; };
  let size = 0;
  dockDrag(e, side === 'bottom' ? 'row-resize' : 'col-resize', ev => {
    if (side === 'bottom') size = Math.max(own ? 60 : DOCK_MIN, Math.min(box.bottom - ev.clientY, box.height - (own ? 80 : DOCK_MIN)));
    else {
      const room = box.width - other(side === 'left' ? 'right' : 'left') - keep;
      size = Math.max(own ? 100 : DOCK_MIN, Math.min(side === 'left' ? ev.clientX - box.left : box.right - ev.clientX, room));
    }
    host.style.setProperty(dockSizeVar(key), size + 'px');
  }, () => {
    if (!size) return;
    if (key === 'left') keepLayout('sidebarWidth', size);
    else { const m = dockModel(); dockArea(m, key).size = size; keepLayout('docks', JSON.parse(JSON.stringify(m))); }
    relayout();
  });
}

// The splitter above (sides) or left of (bottom) a group: the share of it and the shown group before it.
function resizeDockGroup(e, el) {
  let prev = el.previousElementSibling;
  while (prev?.hidden) prev = prev.previousElementSibling;
  if (!prev) return;
  const key = el.closest('.mm-dock').dataset.area, across = areaSide(key) === 'bottom';
  const a = prev.getBoundingClientRect(), b = el.getBoundingClientRect();
  const total = across ? a.width + b.width : a.height + b.height, start = across ? a.left : a.top;
  const shares = +prev.style.flexGrow + +el.style.flexGrow;
  dockDrag(e, across ? 'col-resize' : 'row-resize', ev => {
    const first = Math.max(60, Math.min((across ? ev.clientX : ev.clientY) - start, total - 60)) / total;
    prev.style.flexGrow = first * shares;
    el.style.flexGrow = (1 - first) * shares;
  }, () => {
    const m = dockModel(), groups = dockArea(m, key).groups.filter(g => g.panes.some(id => m.state[id] !== 'floating'));
    const i = +el.dataset.index, j = +prev.dataset.index;
    if (groups[j] && groups[i]) { groups[j].size = +prev.style.flexGrow; groups[i].size = +el.style.flexGrow; }
    keepLayout('docks', JSON.parse(JSON.stringify(m)));
    relayout();
  });
}

// The areas' splitters; then the panes where the layout has them (app.js, once its panes are registered).
function initDocks() {
  events.paneMoving = onPaneMoving;
  events.paneMoved = onPaneMoved;
  for (const key of DOCK_AREAS) document.querySelector(`.mm-dock-split[data-area="${key}"]`)?.addEventListener('pointerdown', e => resizeDockArea(e, key));
  renderDocks();
}
