'use strict';
// The ribbon (docs/plans/executed/PLAN-ribbon.md): tabs of named groups of buttons, each button an action as its menu item
// is (ribbon.json: yours, else the shipped one; RibbonFile.cs). Shown as the setting commandBar says: "menu" (no
// ribbon), "ribbon" (its tab names in the top bar in the menus' place, its buttons under it) or "both" (under the
// menus, its tab names in a row of their own). A button is large (icon above its label, the full height) or small
// (icon and label, a third of it); up to three small ones stack in a column. A group may have an action in each
// bottom corner. An action with variants is a split button: its arrow (and its right-click) lists them. Alt with the
// ribbon only shows key tips (setting altOpens). The ribbon changes only in its change mode: dragging (also from
// F1's list), right-click, "New...", Ctrl+Z; every change is written to your ribbon.json at once.

// ---------- State ----------
const rb = {
  model: null,        // { tabs: [{ name, groups: [{ name, corners: { left, right }, items }] }] }
  user: false,        // your ribbon.json is in use
  tab: null,          // the tab shown: its name
  changing: false,    // change mode
  undo: [],           // the model before each change (change mode)
  tips: 0,            // key tips: 0 off, 1 the tabs', 2 the shown tab's buttons'
  typed: '',          // the first letter of a two-letter tip
  altAlone: false,    // Alt pressed with no other key yet
  menus: false,       // the menus shown in the tab names' place (altOpens menu)
  els: null,
};

const rbCall = item => [item.action, ...(item.params ?? [])];
const rbMode = () => ['ribbon', 'both'].includes(setting('commandBar')) ? setting('commandBar') : 'menu';
const rbShown = () => rbMode() !== 'menu' && !!rb.model;
const rbTabIndex = () => Math.max(0, rb.model?.tabs.findIndex(t => t.name === rb.tab) ?? 0);
const ribbonChanging = () => rb.changing;

async function loadRibbon() {
  const r = await host('ribbon').catch(() => null);
  if (!r) return;
  rb.model = r.ribbon;
  rb.user = !!r.user;
  if (r.problems?.length) toast('ribbon.json: ' + r.problems.join(' '), true);
  renderRibbon();
}
events.ribbon = () => { if (!rb.changing) loadRibbon(); };   // changed in another window

// The ribbon's elements: its tab names in the top bar (ribbon only), the ribbon under the top bar.
function rbElements() {
  if (rb.els) return rb.els;
  const header = document.querySelector('.mm-toolbar');
  const top = Object.assign(document.createElement('nav'), { className: 'mm-rb-tabs mm-rb-tabs-top' });
  header.querySelector('.mm-menubar').after(top);
  const el = Object.assign(document.createElement('div'), { className: 'mm-ribbon' });
  el.innerHTML = '<nav class="mm-rb-tabs mm-rb-tabs-row"></nav><div class="mm-rb-bodies"></div>';
  header.after(el);
  rb.els = { top, el, row: el.querySelector('.mm-rb-tabs-row'), bodies: el.querySelector('.mm-rb-bodies') };
  for (const box of [top, el]) {
    box.addEventListener('mousedown', e => { if (!rb.changing && e.target.closest('button')) e.preventDefault(); });   // the focus stays in the document
    box.addEventListener('click', rbClick);
    box.addEventListener('contextmenu', rbContext);
    box.addEventListener('dragstart', rbDragStart);
    box.addEventListener('dragover', rbDragOver);
    box.addEventListener('dragleave', e => { if (!e.currentTarget.contains(e.relatedTarget)) rbMarkDrop(null); });
    box.addEventListener('drop', rbDrop);
    box.addEventListener('dragend', rbDragEnd);
  }
  new ResizeObserver(() => rbOverflow()).observe(el);
  return rb.els;
}

// ---------- Drawing ----------
function renderRibbon() {
  const mode = rbMode();
  document.body.dataset.commandBar = mode;
  if (!rb.model) return;
  const { top, el, row, bodies } = rbElements();
  el.hidden = mode === 'menu';
  top.hidden = mode !== 'ribbon';
  row.hidden = mode !== 'both';
  document.body.classList.toggle('mm-rb-changing', rb.changing);
  el.classList.toggle('mm-rb-names', setting('ribbonGroupNames') !== false);
  el.style.setProperty('--rb-ch', (Number(setting('ribbonLabelWidth')) || 24) + 'ch');
  const tabs = rb.model.tabs;
  if (!tabs.some(t => t.name === rb.tab)) rb.tab = tabs.some(t => t.name === setting('ribbonTab')) ? setting('ribbonTab') : tabs[0]?.name ?? null;
  const tabsHtml = tabs.map((t, ti) => `<button class="mm-rb-tab${t.name === rb.tab ? ' mm-on' : ''}" data-tab="${ti}"${rb.changing ? ' draggable="true"' : ''} tabindex="-1">${escapeHtml(t.name)}</button>`).join('') +
    (rb.changing ? '<button class="mm-rb-tab mm-rb-new" data-new-tab tabindex="-1">New...</button>' : '');
  (mode === 'ribbon' ? top : row).innerHTML = tabsHtml;
  (mode === 'ribbon' ? row : top).innerHTML = '';
  // Every tab's groups (one shown): a tab name dragged over shows its tab without taking away the dragged button.
  bodies.innerHTML = tabs.map((t, ti) => `<div class="mm-rb-body" data-body="${ti}"${t.name === rb.tab ? '' : ' hidden'}>` +
    t.groups.map((g, gi) => rbGroupHtml(ti, gi, g)).join('') +
    (rb.changing ? `<div class="mm-rb-group mm-rb-new-group" data-new-group="${ti}"><div class="mm-rb-cols"><i>New...</i></div></div>` : '') +
    '</div>').join('') +
    `<button class="mm-rb-more" hidden tabindex="-1" title="The groups that do not fit">&gt;&gt;</button>` +
    (rb.changing ? '<button class="mm-rb-done" tabindex="-1" title="End changing the ribbon (Esc); Ctrl+Z takes the last change back">Done</button>' : '');
  if (rb.tips) rbShowTips();
  rbRefresh();
  rbOverflow();
}

function rbGroupHtml(ti, gi, g) {
  const cols = ribbonColumns(g.items).map(c => {
    if (c.kind === 'divider') return `<div class="mm-rb-div" data-path="${ti}.${gi}.${c.i}"${rb.changing ? ' draggable="true"' : ''}></div>`;
    if (c.kind === 'large') return rbButtonHtml(`${ti}.${gi}.${c.items[0].i}`, c.items[0].item, 'large');
    return `<div class="mm-rb-col">${c.items.map(({ item, i }) => rbButtonHtml(`${ti}.${gi}.${i}`, item, 'small')).join('')}</div>`;
  }).join('');
  const corner = side => {
    const call = g.corners?.[side], c = Array.isArray(call) ? call : call ? [call] : null;
    if (!c && !rb.changing) return '';
    const title = c ? withKey(actionTitle(c[0], c.slice(1)), ...c) : `The ${side} corner: drop an action here`;
    return `<button class="mm-rb-corner mm-rb-${side}${c ? '' : ' mm-rb-empty'}" data-corner="${ti}.${gi}.${side}"${c && rb.changing ? ' draggable="true"' : ''} title="${escapeHtml(title)}" tabindex="-1"></button>`;
  };
  return `<div class="mm-rb-group" data-group="${ti}.${gi}" title="${setting('ribbonGroupNames') === false ? escapeHtml(g.name) : ''}">` +
    (rb.changing ? `<span class="mm-rb-grip" draggable="true" data-grip="${ti}.${gi}" title="Drag the group; right-click: rename, remove"></span>` : '') +
    `<div class="mm-rb-cols">${cols}</div><div class="mm-rb-name">${corner('left')}<span>${escapeHtml(g.name)}</span>${corner('right')}</div></div>`;
}

// The icon has a drawing for the parameter itself (Previous, a panel): no number on it.
const rbOwnDrawing = call => call[0] === 'panel' || !!RIBBON_ICONS.buttons[call.join(' ')];

function rbButtonHtml(path, item, size) {
  const call = rbCall(item), def = actionDef(item.action);
  if (!def) return rb.changing ? `<button class="mm-rb-btn mm-rb-${size} mm-rb-missing" data-path="${path}" draggable="true" title="No action ${escapeHtml(item.action)} (drag it off to remove it)" tabindex="-1">?</button>` : '';
  const title = actionTitle(item.action, item.params ?? []), label = item.label || title;
  const icon = ribbonIcon(call, size) ?? `<span class="mm-rb-letter">${escapeHtml(label.trim()[0] ?? '?')}</span>`;
  const list = rbHasList(item), arrow = '<span class="mm-rb-arrow" data-arrow title="Its list"></span>', mark = item.params?.length && !rbOwnDrawing(call) ? `<span class="mm-rb-mark">${escapeHtml(String(item.params[0]))}</span>` : '';
  return `<button class="mm-rb-btn mm-rb-${size}" data-path="${path}" data-call="${escapeHtml(JSON.stringify(call))}"${rb.changing ? ' draggable="true"' : ''} title="${escapeHtml(withKey(title, ...call))}" tabindex="-1">` +
    `<span class="mm-rb-icon">${icon}${mark}<span class="mm-rb-badge" hidden></span></span>` +
    // With a list, a split button: the arrow a part of its own that opens it (a large button's: a row under the label).
    `<span class="mm-rb-text"><span class="mm-rb-label">${escapeHtml(label)}</span>${list && size !== 'large' ? arrow : ''}</span>${list && size === 'large' ? arrow : ''}</button>`;
}

// ---------- State of the buttons: pressed, greyed out, the clipboard badge ----------
let rbRefreshFrame = 0;
const rbRefreshSoon = () => { if (rbShown() && !rbRefreshFrame) rbRefreshFrame = requestAnimationFrame(() => { rbRefreshFrame = 0; rbRefresh(); }); };
function rbRefresh() {
  if (!rbShown()) return;
  const body = rb.els.bodies.querySelector(`[data-body="${rbTabIndex()}"]`);
  for (const b of body?.querySelectorAll('.mm-rb-btn[data-call]') ?? []) {
    const [name, ...params] = JSON.parse(b.dataset.call), def = appActions.get(name);
    b.classList.toggle('mm-on', !!def?.checked?.(params));
    b.classList.toggle('mm-off', !rb.changing && !actionAvailable(name, params) && !rbListOnly({ action: name, params }));
    const badge = b.querySelector('.mm-rb-badge');
    const n = name === 'paste' && !params.length ? clips.active : 0;
    badge.hidden = !n;
    badge.textContent = n || '';
  }
}
for (const type of ['focusin', 'mouseup', 'keyup']) addEventListener(type, rbRefreshSoon, true);
// The panels' checks need the windows of their own (docks.js), asked now and then.
setInterval(() => { if (rbShown() && typeof refreshPanelsOpen === 'function') refreshPanelsOpen().then(rbRefreshSoon); }, 2000);

// ---------- Overflow: the groups that do not fit go into ">>" ----------
function rbOverflow() {
  if (!rbShown() || rb.changing) return;
  const body = rb.els.bodies.querySelector(`[data-body="${rbTabIndex()}"]`), more = rb.els.bodies.querySelector('.mm-rb-more');
  if (!body || !more) return;
  const groups = [...body.querySelectorAll('.mm-rb-group')];
  for (const g of groups) g.hidden = false;
  more.hidden = true;
  const room = () => rb.els.bodies.clientWidth - (more.hidden ? 0 : more.offsetWidth + 4);
  const used = () => groups.filter(g => !g.hidden).reduce((w, g) => w + g.offsetWidth, 0);
  for (let i = groups.length - 1; i > 0 && used() > room(); i--) { groups[i].hidden = true; more.hidden = false; }
}

function rbOverflowItems() {
  const ti = rbTabIndex(), tab = rb.model.tabs[ti];
  const body = rb.els.bodies.querySelector(`[data-body="${ti}"]`);
  return [...body.querySelectorAll('.mm-rb-group[hidden]')].map(el => {
    const g = tab.groups[+el.dataset.group.split('.')[1]];
    return { label: g.name.replace(/&/g, '&&'), sub: g.items.filter(it => it !== 'divider' && actionDef(it.action))
      .map(it => ({ label: (it.label || actionTitle(it.action, it.params ?? [])).replace(/&/g, '&&'), action: it.action, params: it.params ?? [] })) };
  });
}

// ---------- Split buttons: an action's variants ----------
// A button lists: its action's variants (without a parameter of its own), or an action's own list (Toggle bookmark:
// the numbered ones). Only a list: the action needs a parameter (Line numbers, Select a block): a click lists too.
const RB_LISTS = {
  bookmarkToggleFree: () => loadEditor().then(async () => [
    { label: '&Toggle bookmark', fill: () => bookmarkItems('toggle') }, { label: '&Go to bookmark', fill: () => bookmarkItems('go') },
    { label: '&Clear bookmark', fill: () => bookmarkItems('clear') }, '-', ['&Manage bookmarks...', 'bookmarks.pane']]),
};
function rbHasList(item) {
  if (item.params?.length) return false;
  const v = actionDef(item.action)?.variants;
  return !!RB_LISTS[item.action] || Array.isArray(v) && v.filter(p => p.length).length > 1;
}
const rbListOnly = item => !item.params?.length && !RB_LISTS[item.action] && Array.isArray(actionDef(item.action)?.variants) &&
  !actionDef(item.action).variants.some(p => !p.length);

async function rbListItems(item) {
  if (RB_LISTS[item.action]) return RB_LISTS[item.action]();
  const def = actionDef(item.action), clip = ['paste', 'copy', 'cut'].includes(item.action);
  if (clip) Object.assign(clips, await host('clipState').catch(() => ({})));
  const items = def.variants.filter(p => p.length).map(p => ({ label: actionTitle(item.action, p).replace(/&/g, '&&'), action: item.action, params: p,
    key: clip ? (clips.previews[p[0]] || '(empty)') : keyText(item.action, ...p), checked: def.checked?.(p) }));
  if (item.action === 'paste')
    items.push('-', { label: '&Active clipboard', fill: () => clipboardItems() }, '-', ['C&lear clipboard', 'clipboardClear'], ['&Manage clipboards...', 'clipboards.pane']);
  return items;
}

async function rbOpenList(button, item) {
  openMenuBelow(await rbListItems(item), button);
}

// What opens a list: a split button's arrow, a button that is only a list, ">>". Pressed again while its list shows,
// the list only closes (menus.js closes it on mousedown; pointerdown comes first, so the click after it is skipped).
let rbListFrom = null, rbSkipClick = null;
const rbOpener = t => t.closest('.mm-ribbon [data-arrow], .mm-rb-more') ?? (() => {
  const b = t.closest('.mm-ribbon .mm-rb-btn[data-path]'), item = b && rbItemAt(rbPath(b.dataset.path));
  return item && rbListOnly(item) ? b : null;
})();
addEventListener('pointerdown', e => {
  const o = e.target instanceof Element ? rbOpener(e.target) : null;
  rbSkipClick = o && o === rbListFrom && menuBar.levels.length ? o : null;
}, true);

// ---------- Clicks ----------
const rbPath = s => s.split('.').map(x => /^-?\d+$/.test(x) ? +x : x);
const rbItemAt = ([t, g, i]) => rb.model.tabs[t]?.groups[g]?.items[i];

function rbShowTab(ti) {
  const tab = rb.model.tabs[ti];
  if (!tab) return;
  rb.tab = tab.name;
  if (!rb.changing) setSetting('ribbonTab', tab.name);
  for (const b of (rbMode() === 'ribbon' ? rb.els.top : rb.els.row).querySelectorAll('[data-tab]')) b.classList.toggle('mm-on', +b.dataset.tab === ti);
  for (const body of rb.els.bodies.querySelectorAll('[data-body]')) body.hidden = +body.dataset.body !== ti;
  rbRefresh();
  rbOverflow();
}

async function rbClick(e) {
  const el = e.target.closest('button');
  if (!el) return;
  rbTipsOff();
  const opener = rbOpener(e.target);
  if (opener && opener === rbSkipClick) { rbSkipClick = rbListFrom = null; return; }   // its list was open: now closed
  rbListFrom = opener;
  if (el.matches('[data-tab]')) return rbShowTab(+el.dataset.tab);
  if (el.matches('[data-new-tab]')) return rbNewTab();
  if (el.matches('.mm-rb-done')) return rbChangeMode(false);
  if (el.matches('.mm-rb-more')) return openMenuBelow(rbOverflowItems(), el);
  if (rb.changing) return;   // in change mode the buttons do not run
  if (el.matches('[data-corner]')) {
    const [t, g, side] = rbPath(el.dataset.corner), c = rb.model.tabs[t].groups[g].corners?.[side];
    const call = Array.isArray(c) ? c : [c];
    if (c) runAction(call[0], call.slice(1), { from: 'ribbon' });
    return rbRefreshSoon();
  }
  if (el.matches('[data-path]')) {
    const item = rbItemAt(rbPath(el.dataset.path));
    if (!item || el.classList.contains('mm-off')) return;
    if (e.target.closest('[data-arrow]') || rbListOnly(item)) return rbOpenList(el, item);
    await runAction(item.action, item.params ?? [], { from: 'ribbon' });
    rbRefreshSoon();
  }
}

// ---------- The right-click ----------
function rbContext(e) {
  e.preventDefault();
  if (rb.changing) return rbEditMenu(e);
  const el = e.target.closest('.mm-rb-btn[data-path]');
  const item = el && rbItemAt(rbPath(el.dataset.path));
  if (item && rbHasList(item)) return rbOpenList(el, item);
  openContextMenu(rbMenuItems(), e.clientX, e.clientY);
}

// The ribbon's own: change it, the Customize window, Reset, and what the top bar shows.
const rbMenuItems = () => [['&Change the ribbon', 'ribbon.change'], ['C&ustomize...', 'ribbon.customize'], ['&Reset to the shipped ribbon', 'ribbon.reset'], '-',
  ['&Menu only', 'commandBar.set', 'menu'], ['&Ribbon only', 'commandBar.set', 'ribbon'], ['Menu &and ribbon', 'commandBar.set', 'both']];

// ---------- Key tips (Alt with the ribbon only; setting altOpens) ----------
const rbTipsWanted = () => rbMode() === 'ribbon' && (setting('altOpens') || 'tips') === 'tips' && !rb.changing;

function rbTipTargets() {
  if (rb.tips === 1) {
    const els = [...rb.els.top.querySelectorAll('[data-tab]')];
    return { els, tips: ribbonTips(els.map(b => b.textContent)) };
  }
  const ti = rbTabIndex(), tab = rb.model.tabs[ti], body = rb.els.bodies.querySelector(`[data-body="${ti}"]`);
  const els = [...body.querySelectorAll('.mm-rb-btn[data-path], .mm-rb-corner:not(.mm-rb-empty)')].filter(b => !b.closest('[hidden]'));
  const names = els.map(b => b.matches('[data-corner]') ? b.title : b.querySelector('.mm-rb-label').textContent);
  const own = els.map(b => b.matches('[data-path]') ? rbItemAt(rbPath(b.dataset.path))?.tip : '');
  return { els, tips: ribbonTips(names, own), tab };
}

function rbShowTips() {
  for (const t of document.querySelectorAll('.mm-rb-tip')) t.remove();
  if (!rb.tips) return;
  const { els, tips } = rbTipTargets();
  els.forEach((el, i) => el.append(Object.assign(document.createElement('span'), { className: 'mm-rb-tip', textContent: tips[i] })));
}
function rbTipsOff() {
  if (!rb.tips) return;
  rb.tips = 0;
  rb.typed = '';
  rbShowTips();
}

addEventListener('keydown', e => {
  if (e.key === 'Alt') { rb.altAlone = !e.repeat && rbShown(); return; }
  rb.altAlone = false;
  if (rb.changing && rbShown()) return rbChangeKey(e);
  if (!rb.tips) {
    // Alt+letter with the ribbon only: the tab of that tip at once (tips), or the menus in the tab names' place.
    if (e.altKey && !e.ctrlKey && !e.shiftKey && /^Key[A-Z]$/.test(e.code) && rbMode() === 'ribbon' && !menuBar.levels.length) {
      if (rbTipsWanted()) {
        rb.tips = 1;
        if (rbTipKey(e.code[3])) { e.preventDefault(); e.stopImmediatePropagation(); }
        else rbTipsOff();
      } else rbShowMenus(true);
    }
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key === 'Escape') { if (rb.tips === 2) { rb.tips = 1; rb.typed = ''; rbShowTips(); } else rbTipsOff(); return; }
  const c = /^Key[A-Z]$|^Digit\d$/.test(e.code) ? e.code.at(-1) : '';
  if (!c || !rbTipKey(c)) rbTipsOff();
}, true);
addEventListener('keyup', e => {
  if (e.key !== 'Alt' || !rb.altAlone) return;
  rb.altAlone = false;
  if (rb.tips) return rbTipsOff();
  if (rbTipsWanted()) { e.preventDefault(); rb.tips = 1; rbShowTips(); }
  else if (rbMode() === 'ribbon' && !rb.changing) { rbShowMenus(true); openTopMenu(0, true); }
}, true);
addEventListener('mousedown', e => { if (rb.tips && !e.target.closest('.mm-rb-tip')) rbTipsOff(); }, true);
addEventListener('blur', rbTipsOff);

// A letter typed while the tips show: a tab opened (its buttons' tips then), a button run; two-letter tips wait for
// their second letter. True: it was one.
function rbTipKey(c) {
  const { els, tips } = rbTipTargets(), typed = rb.typed + c;
  const hit = tips.findIndex(t => t === typed);
  if (hit < 0) {
    if (tips.some(t => t.length === 2 && t.startsWith(typed))) { rb.typed = typed; return true; }
    return false;
  }
  rb.typed = '';
  const el = els[hit];
  if (rb.tips === 1) { rbShowTab(+el.dataset.tab); rb.tips = 2; rbShowTips(); return true; }
  rbTipsOff();
  el.click();
  return true;
}

// The menus in the tab names' place (altOpens menu), until they close (menus.js closeMenus).
function rbShowMenus(on) {
  if (rb.menus === on) return;
  rb.menus = on;
  document.body.classList.toggle('mm-rb-menus', on);
}

// ---------- Change mode ----------
function rbChangeMode(on) {
  if (rb.changing === on) return;
  rb.changing = on;
  rb.undo = [];
  rbTipsOff();
  if (on && rbMode() === 'menu') setSetting('commandBar', 'both');
  renderRibbon();
  if (typeof commandsPane !== 'undefined' && commandsPane) commandsPane.send(renderPalette());   // F1's rows draggable or not
  if (on && typeof showPalette === 'function') showPalette();
}

function rbChangeKey(e) {
  if (document.querySelector('dialog[open]') || menuBar.levels.length) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return rbChangeMode(false); }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyZ') { e.preventDefault(); e.stopImmediatePropagation(); rbUndo(); }
}

// Every change: the model before it kept for Ctrl+Z, then written to your ribbon.json and drawn again.
function rbChange(edit) {
  const before = structuredClone(rb.model);
  if (edit(rb.model) === false) return;
  rb.undo.push(before);
  rbSave();
}
function rbSave() {
  rb.user = true;
  host('ribbonSave', { ribbon: rb.model }).catch(e => toast('ribbon.json: ' + e.message, true));
  renderRibbon();
}
function rbUndo() {
  const before = rb.undo.pop();
  if (!before) return toast('Nothing to take back.', true);
  rb.model = before;
  rbSave();
}
async function rbReset() {
  const r = await host('ribbonReset').catch(() => null);
  if (!r) return;
  if (rb.changing) rb.undo.push(structuredClone(rb.model));
  rb.model = r.ribbon;
  rb.user = false;
  renderRibbon();
  toast('The shipped ribbon' + (rb.changing ? ' (Ctrl+Z takes it back).' : '.'), true);
}

async function rbNewTab() {
  const name = await askName('New tab', '', 'Its name');
  if (!name?.trim()) return;
  rbChange(m => { m.tabs.push({ name: name.trim(), groups: [] }); });
  rbShowTab(rb.model.tabs.length - 1);
}
async function rbNewGroup(ti, item) {
  const name = await askName('New group', '', 'Its name');
  if (!name?.trim()) return false;
  rbChange(m => { m.tabs[ti].groups.push({ name: name.trim(), items: item ? [item] : [] }); });
  return true;
}

// ---------- Dragging (change mode) ----------
// What is dragged, as text: "lexpen-ribbon:" and { kind: item | divider | group | corner | tab, path }, or from F1
// "lexpen-call:" and an action's call. A button, a group or a corner dropped off the ribbon is removed.
let rbDragging = null;
function rbDragStart(e) {
  if (!rb.changing) return e.preventDefault();
  const el = e.target.closest('[data-path], [data-grip], [data-corner], [data-tab]');
  if (!el) return;
  const what = el.matches('[data-grip]') ? { kind: 'group', path: rbPath(el.dataset.grip) }
    : el.matches('[data-corner]') ? { kind: 'corner', path: rbPath(el.dataset.corner) }
    : el.matches('[data-tab]') ? { kind: 'tab', path: [+el.dataset.tab] }
    : { kind: el.matches('.mm-rb-div') ? 'divider' : 'item', path: rbPath(el.dataset.path) };
  rbDragging = { ...what, dropped: false };
  e.dataTransfer.setData('text/plain', 'lexpen-ribbon:' + JSON.stringify(what));
  e.dataTransfer.effectAllowed = 'move';
}

// Where a drop lands: { at: [t, g, i] and how: before | after | under }, a group's end, a corner, a tab, a new group.
function rbDropTarget(e) {
  const btn = e.target.closest('.mm-rb-btn[data-path], .mm-rb-div[data-path]');
  if (btn) {
    const r = btn.getBoundingClientRect(), small = btn.classList.contains('mm-rb-small');
    const how = small && e.clientY > r.top + r.height * 0.6 ? 'under' : e.clientX < r.left + r.width / 2 ? 'before' : 'after';
    return { kind: 'item', el: btn, path: rbPath(btn.dataset.path), how };
  }
  const corner = e.target.closest('[data-corner]');
  if (corner) return { kind: 'corner', el: corner, path: rbPath(corner.dataset.corner) };
  const tab = e.target.closest('[data-tab]');
  if (tab) return { kind: 'tab', el: tab, path: [+tab.dataset.tab] };
  const newGroup = e.target.closest('[data-new-group]');
  if (newGroup) return { kind: 'newGroup', el: newGroup, path: [+newGroup.dataset.newGroup] };
  const group = e.target.closest('[data-group]');
  if (group) return { kind: 'group', el: group, path: rbPath(group.dataset.group) };
  return null;
}
function rbMarkDrop(target) {
  for (const el of document.querySelectorAll('.mm-rb-drop')) el.classList.remove('mm-rb-drop', 'mm-rb-before', 'mm-rb-after', 'mm-rb-under');
  if (target?.el) target.el.classList.add('mm-rb-drop', target.how ? 'mm-rb-' + target.how : 'mm-rb-drop');
}
let rbTabTimer = 0;
function rbDragOver(e) {
  if (!rb.changing) return;
  const target = rbDropTarget(e);
  if (!target) return rbMarkDrop(null);
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  rbMarkDrop(target);
  // Over a tab name: that tab shows, so the button can go there.
  if (target.kind === 'tab' && rbTabIndex() !== target.path[0] && !rbTabTimer)
    rbTabTimer = setTimeout(() => { rbTabTimer = 0; rbShowTab(target.path[0]); }, 400);
}

function rbDragged(e) {
  const text = e.dataTransfer.getData('text/plain') || '';
  try {
    if (text.startsWith('lexpen-ribbon:')) return JSON.parse(text.slice('lexpen-ribbon:'.length));
    if (text.startsWith('lexpen-call:')) return { kind: 'call', call: JSON.parse(text.slice('lexpen-call:'.length)) };
  } catch { }
  return null;
}

// The item being moved, taken out of where it was (its place given back for an index fix), or made from a call.
function rbTake(m, what) {
  if (what.kind === 'call') {
    const [action, ...params] = what.call;
    return { item: params.length ? { action, params } : { action } };
  }
  if (what.kind === 'corner') {
    const [t, g, side] = what.path, corners = m.tabs[t].groups[g].corners, c = corners?.[side];
    if (!c) return null;
    delete corners[side];
    const call = Array.isArray(c) ? c : [c];
    return { item: call.length > 1 ? { action: call[0], params: call.slice(1) } : { action: call[0] } };
  }
  if (what.kind === 'item' || what.kind === 'divider') {
    const [t, g, i] = what.path, items = m.tabs[t].groups[g].items, item = items[i];
    items.splice(i, 1);
    // The one under it in its column now starts it.
    if (item !== 'divider' && !item.stack && items[i] && items[i] !== 'divider' && items[i].stack) items[i] = { ...items[i], stack: false };
    return { item, from: [t, g, i] };
  }
  return null;
}

function rbDrop(e) {
  if (!rb.changing) return;
  const what = rbDragged(e), target = rbDropTarget(e);
  rbMarkDrop(null);
  if (!what || !target) return;
  e.preventDefault();
  if (rbDragging) rbDragging.dropped = true;
  if (target.kind === 'newGroup') {
    const taken = what.kind === 'group' || what.kind === 'tab' ? null : rbTake(structuredClone(rb.model), what);
    if (!taken) return;
    const make = async () => {
      const before = structuredClone(rb.model);
      const m = structuredClone(rb.model), t = rbTake(m, what);
      const name = await askName('New group', '', 'Its name');
      if (!name?.trim()) return;
      m.tabs[target.path[0]].groups.push({ name: name.trim(), items: [{ ...t.item, stack: false }] });
      rb.undo.push(before);
      rb.model = m;
      rbSave();
    };
    return make();
  }
  rbChange(m => {
    if (what.kind === 'tab') {   // a tab moved: before the one it is dropped on
      if (target.kind !== 'tab') return false;
      const [from] = what.path, [to] = target.path;
      if (from === to) return false;
      const [tab] = m.tabs.splice(from, 1);
      m.tabs.splice(to, 0, tab);
      return;
    }
    if (what.kind === 'group') {   // a group moved: before the group (or the button's group) it is dropped on, or to a tab
      const [ft, fg] = what.path, [g] = m.tabs[ft].groups.splice(fg, 1);
      if (target.kind === 'tab') { m.tabs[target.path[0]].groups.push(g); return; }
      const [tt, tg] = target.path;
      const at = tt === ft && tg > fg ? tg - 1 : tg;
      m.tabs[tt].groups.splice(target.kind === 'item' && target.how === 'after' ? at + 1 : at, 0, g);
      return;
    }
    // A target's path before the item is taken out of the same group: one less after it.
    let tpath = target.path;
    const taken = rbTake(m, what);
    if (!taken) return false;
    const item = taken.item;
    if (taken.from && target.kind === 'item' && taken.from[0] === tpath[0] && taken.from[1] === tpath[1] && taken.from[2] < tpath[2])
      tpath = [tpath[0], tpath[1], tpath[2] - 1];
    if (target.kind === 'corner') {
      if (item === 'divider') return false;
      const [t, g, side] = tpath, grp = m.tabs[t].groups[g];
      grp.corners = { ...(grp.corners ?? {}), [side]: item.params?.length ? [item.action, ...item.params] : item.action };
      return;
    }
    if (target.kind === 'tab') {
      const tab = m.tabs[tpath[0]];
      if (!tab.groups.length) tab.groups.push({ name: tab.name, items: [] });
      tab.groups.at(-1).items.push(item === 'divider' ? item : { ...item, stack: false });
      return;
    }
    if (target.kind === 'group') { m.tabs[tpath[0]].groups[tpath[1]].items.push(item === 'divider' ? item : { ...item, stack: false }); return; }
    const [t, g, i] = tpath, items = m.tabs[t].groups[g].items;
    if (item === 'divider') { items.splice(target.how === 'before' ? i : i + 1, 0, item); return; }
    if (target.how === 'under') items.splice(i + 1, 0, { ...item, size: undefined, stack: true });
    else if (target.how === 'before') items.splice(i, 0, { ...item, stack: false });
    else items.splice(i + 1, 0, { ...item, stack: false });
  });
}

// Dropped outside the ribbon: removed.
function rbDragEnd(e) {
  clearTimeout(rbTabTimer);
  rbTabTimer = 0;
  rbMarkDrop(null);
  const what = rbDragging;
  rbDragging = null;
  if (!rb.changing || !what || what.dropped) return;
  const inside = [rb.els.el, rb.els.top].some(el => { const r = el.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
  if (inside) return;
  rbRemove(what);
}
function rbRemove(what) {
  rbChange(m => {
    if (what.kind === 'tab') { m.tabs.splice(what.path[0], 1); return; }
    if (what.kind === 'group') { m.tabs[what.path[0]].groups.splice(what.path[1], 1); return; }
    if (!rbTake(m, what)) return false;
  });
}

// ---------- The right-click in change mode ----------
function rbEditMenu(e) {
  const el = e.target.closest('[data-path], [data-corner], [data-grip], [data-group], [data-tab]');
  let items = [];
  if (el?.matches('.mm-rb-btn[data-path]')) {
    const path = rbPath(el.dataset.path), [t, g, i] = path, item = rbItemAt(path), def = actionDef(item.action);
    const set = (fn) => () => rbChange(m => { const it = m.tabs[t].groups[g].items[i]; if (it === 'divider') return false; fn(it, m.tabs[t].groups[g].items); });
    const variants = def?.variants?.filter(p => p.length) ?? [];
    items = [
      { label: '&Large', checked: item.size === 'large', run: set(it => { it.size = 'large'; delete it.stack; }) },
      { label: '&Small', checked: item.size !== 'large', run: set(it => { delete it.size; }) },
      { label: 'S&tacked under the one above', checked: !!item.stack, enabled: item.size !== 'large', run: set(it => { it.stack = !it.stack; }) },
      ...(variants.length ? [{ label: '&Parameter', sub: [
        { label: '&None (the action itself, its list)', checked: !item.params?.length, run: set(it => { delete it.params; }) },
        ...variants.map(p => ({ label: actionTitle(item.action, p).replace(/&/g, '&&'), checked: JSON.stringify(item.params ?? []) === JSON.stringify(p), run: set(it => { it.params = p; }) }))] }] : []),
      { label: 'Rena&me...', run: async () => { const v = await askName('Label (empty: the action\'s title)', item.label ?? '', actionTitle(item.action, item.params ?? [])); if (v !== null) set(it => { if (v.trim()) it.label = v.trim(); else delete it.label; })(); } },
      { label: '&Key tip...', run: async () => {
        const v = await askName('Key tip (one or two letters; empty: from the label)', item.tip ?? '', 'A letter');
        if (v === null) return;
        const tip = v.trim().slice(0, 2).toUpperCase();
        // No tip on this tab may start another ("P" and "PF": the P would run before the F is typed).
        const clash = rb.model.tabs[t].groups.flatMap(gr => gr.items).find(it => it !== item && it.tip && tip && (it.tip.startsWith(tip) || tip.startsWith(it.tip)));
        if (clash) return toast(`Key tip ${tip} clashes with ${clash.tip} (${clash.label || actionTitle(clash.action, clash.params ?? [])}): one may not start the other.`, true);
        set(it => { if (tip) it.tip = tip; else delete it.tip; })();
      } },
      { label: '&Divider before it', checked: g >= 0 && rb.model.tabs[t].groups[g].items[i - 1] === 'divider',
        run: () => rbChange(m => { const its = m.tabs[t].groups[g].items; if (its[i - 1] === 'divider') its.splice(i - 1, 1); else its.splice(i, 0, 'divider'); }) },
      '-',
      { label: 'Into the l&eft corner', run: () => rbChange(m => { const grp = m.tabs[t].groups[g], [it] = grp.items.splice(i, 1); grp.corners = { ...(grp.corners ?? {}), left: it.params?.length ? [it.action, ...it.params] : it.action }; }) },
      { label: 'Into the r&ight corner', run: () => rbChange(m => { const grp = m.tabs[t].groups[g], [it] = grp.items.splice(i, 1); grp.corners = { ...(grp.corners ?? {}), right: it.params?.length ? [it.action, ...it.params] : it.action }; }) },
      '-', { label: '&Remove', run: () => rbRemove({ kind: 'item', path }) }];
  } else if (el?.matches('.mm-rb-div[data-path]')) {
    items = [{ label: '&Remove the divider', run: () => rbRemove({ kind: 'divider', path: rbPath(el.dataset.path) }) }];
  } else if (el?.matches('[data-corner]')) {
    const path = rbPath(el.dataset.corner), [t, g, side] = path, has = !!rb.model.tabs[t].groups[g].corners?.[side];
    items = [{ label: 'Make it a &button', enabled: has, run: () => rbChange(m => { const taken = rbTake(m, { kind: 'corner', path }); if (!taken) return false; m.tabs[t].groups[g].items.push(taken.item); }) },
      { label: '&Remove from the corner', enabled: has, run: () => rbRemove({ kind: 'corner', path }) }];
  } else if (el?.matches('[data-grip], [data-group]')) {
    const [t, g] = rbPath(el.dataset.grip ?? el.dataset.group), grp = rb.model.tabs[t].groups[g];
    items = [{ label: '&Rename the group...', run: async () => { const v = await askName('Group name', grp.name, 'Its name'); if (v?.trim()) rbChange(m => { m.tabs[t].groups[g].name = v.trim(); }); } },
      { label: '&Remove the group', run: () => rbRemove({ kind: 'group', path: [t, g] }) }];
  } else if (el?.matches('[data-tab]')) {
    const t = +el.dataset.tab, tab = rb.model.tabs[t];
    items = [{ label: '&Rename the tab...', run: async () => { const v = await askName('Tab name', tab.name, 'Its name'); if (v?.trim()) rbChange(m => { if (rb.tab === m.tabs[t].name) rb.tab = v.trim(); m.tabs[t].name = v.trim(); }); } },
      { label: 'Move &left', enabled: t > 0, run: () => rbChange(m => { m.tabs.splice(t - 1, 0, ...m.tabs.splice(t, 1)); }) },
      { label: 'Move ri&ght', enabled: t < rb.model.tabs.length - 1, run: () => rbChange(m => { m.tabs.splice(t + 1, 0, ...m.tabs.splice(t, 1)); }) },
      { label: 'R&emove the tab', run: () => rbRemove({ kind: 'tab', path: [t] }) }];
  }
  items.push(...(items.length ? ['-'] : []), ['C&ustomize...', 'ribbon.customize'], ['Reset to the &shipped ribbon', 'ribbon.reset'], { label: '&Done', run: () => rbChangeMode(false) });
  openContextMenu(items, e.clientX, e.clientY);
}

// ---------- Actions ----------
appAction('ribbon.toggle', { title: 'Ribbon', hint: 'The ribbon under the menus, or the menus alone (Settings: the ribbon only, its tab names in the menus\' place)', group: 'view',
  checked: () => rbMode() !== 'menu', run: () => setSetting('commandBar', rbMode() === 'menu' ? 'both' : 'menu') });
appAction('commandBar.set', { title: 'Menu and ribbon', hint: 'What the top bar shows: the menus, the ribbon (its tab names in the menus\' place), or both', group: 'view',
  variants: [['menu'], ['ribbon'], ['both']], variantTitles: { menu: 'Menu only', ribbon: 'Ribbon only', both: 'Menu and ribbon' },
  checked: ([v]) => rbMode() === v, run: ([v]) => setSetting('commandBar', v) });
appAction('ribbon.change', { title: 'Change the ribbon', hint: 'Its change mode: drag actions from F1 onto it, buttons, groups and tabs around and off it; right-click a button for its size, label and more; Esc or Done ends it',
  group: 'view', checked: () => rb.changing, run: () => rbChangeMode(!rb.changing) });
appAction('ribbon.reset', { title: 'Reset the ribbon', hint: 'Back to the ribbon LexPen ships (your ribbon.json removed)', group: 'view', run: () => rbReset() });

// ---------- The Customize window (the ribbon's right-click > Customize...) ----------
// The same changes by list and by keyboard: at the left every command (F1's, with its search), at the right the
// ribbon's tabs, groups, buttons, dividers and corners in order. Enter in the left list adds the command after the
// line chosen at the right (into its group); Del removes the line chosen; Alt+Up / Alt+Down move it.
function rbCustomize() {
  let dlg = document.querySelector('.mm-rb-customize');
  if (!dlg) {
    dlg = Object.assign(document.createElement('dialog'), { className: 'mm-rb-customize' });
    dlg.innerHTML = `<div class="mm-rbc-head">Customize the ribbon</div>
      <div class="mm-rbc-lists">
        <div class="mm-rbc-side"><input class="mm-rbc-search" type="text" spellcheck="false" placeholder="Search a command">
          <select class="mm-rbc-actions" size="20"></select></div>
        <div class="mm-rbc-mid"><button data-rbc="add" title="After the line chosen at the right (Enter in the left list)">Add &gt;</button></div>
        <div class="mm-rbc-side"><select class="mm-rbc-ribbon" size="21"></select></div>
        <div class="mm-rbc-buttons">
          <button data-rbc="up" title="Alt+Up">Up</button><button data-rbc="down" title="Alt+Down">Down</button>
          <button data-rbc="remove" title="Del">Remove</button><hr>
          <button data-rbc="size">Large / small</button><button data-rbc="stack">Stacked</button>
          <button data-rbc="divider">Divider</button><button data-rbc="rename" title="A tab, a group, or a button (its label)">Rename...</button><hr>
          <button data-rbc="newTab">New tab...</button><button data-rbc="newGroup">New group...</button><hr>
          <button data-rbc="reset">Reset</button><button data-rbc="close">Close</button></div>
      </div>`;
    document.body.append(dlg);
    const $q = s => dlg.querySelector(s), search = $q('.mm-rbc-search'), actions = $q('.mm-rbc-actions'), list = $q('.mm-rbc-ribbon');
    search.addEventListener('input', () => rbcFillActions(dlg));
    actions.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); rbcDo(dlg, 'add'); } });
    actions.addEventListener('dblclick', () => rbcDo(dlg, 'add'));
    list.addEventListener('keydown', e => {
      if (e.key === 'Delete') { e.preventDefault(); rbcDo(dlg, 'remove'); }
      else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); rbcDo(dlg, e.key === 'ArrowUp' ? 'up' : 'down'); }
    });
    dlg.addEventListener('click', e => { const b = e.target.closest('[data-rbc]'); if (b) rbcDo(dlg, b.dataset.rbc); });
    dlg.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); dlg.close(); } }, true);
    list.addEventListener('change', () => rbcShow(dlg));
    dlg.addEventListener('close', () => rbcShow(dlg));   // the outline gone
  }
  rbcFillActions(dlg);
  if (rbMode() === 'menu') setSetting('commandBar', 'both');   // as change mode: a ribbon to see the changes on
  dlg.style.margin = `${Math.round(document.querySelector('.mm-ribbon')?.getBoundingClientRect().bottom ?? 0) + 8}px auto auto`;   // under the ribbon
  dlg.showModal();
  rbcFillRibbon(dlg, 0);
  dlg.querySelector('.mm-rbc-search').focus();
}

function rbcFillActions(dlg) {
  const q = dlg.querySelector('.mm-rbc-search').value.trim().toLowerCase(), sel = dlg.querySelector('.mm-rbc-actions');
  const entries = paletteEntries().filter(e => !q || (e.title + ' ' + e.name).toLowerCase().includes(q));
  sel.innerHTML = ACTION_GROUPS.map(([group, label]) => {
    const list = entries.filter(e => e.group === group);
    return list.length ? `<optgroup label="${escapeHtml(label)}">` + list.map(e => `<option value="${escapeHtml(JSON.stringify([e.name, ...e.params]))}">${escapeHtml(e.title)}</option>`).join('') + '</optgroup>' : '';
  }).join('');
  sel.selectedIndex = 0;
}

// The lines at the right: { path, kind (tab | group | item | divider | corner), text }.
function rbcLines() {
  const lines = [];
  rb.model.tabs.forEach((t, ti) => {
    lines.push({ kind: 'tab', path: [ti], text: `${t.name}` });
    t.groups.forEach((g, gi) => {
      lines.push({ kind: 'group', path: [ti, gi], text: `   ${g.name}` });
      for (const side of ['left', 'right']) if (g.corners?.[side]) {
        const c = Array.isArray(g.corners[side]) ? g.corners[side] : [g.corners[side]];
        lines.push({ kind: 'corner', path: [ti, gi, side], text: `      corner ${side}: ${actionTitle(c[0], c.slice(1))}` });
      }
      g.items.forEach((it, i) => lines.push(it === 'divider'
        ? { kind: 'divider', path: [ti, gi, i], text: '      ----' }
        : { kind: 'item', path: [ti, gi, i], text: `      ${it.stack ? '  + ' : ''}${it.label || actionTitle(it.action, it.params ?? [])}${it.size === 'large' ? ' (large)' : ''}` }));
    });
  });
  return lines;
}
function rbcFillRibbon(dlg, select) {
  const sel = dlg.querySelector('.mm-rbc-ribbon'), lines = rbcLines();
  sel.innerHTML = lines.map((l, n) => `<option value="${n}" class="mm-rbc-${l.kind}">${escapeHtml(l.text)}</option>`).join('');
  sel.selectedIndex = Math.max(0, Math.min(select ?? sel.selectedIndex, lines.length - 1));
  dlg.rbcLines = lines;
  rbcShow(dlg);
}

// The line chosen at the right shown on the ribbon: its tab opened, the tab, group, corner or button outlined.
function rbcShow(dlg) {
  for (const x of document.querySelectorAll('.mm-rb-picked')) x.classList.remove('mm-rb-picked');
  const line = dlg.rbcLines?.[dlg.querySelector('.mm-rbc-ribbon').selectedIndex];
  if (!line || !dlg.open) return;
  rbShowTab(line.path[0]);
  const p = line.path.join('.'), attr = { tab: 'data-tab', group: 'data-group', corner: 'data-corner' }[line.kind] ?? 'data-path';
  for (const x of document.querySelectorAll(`.mm-ribbon [${attr}="${p}"], .mm-rb-tabs-top [${attr}="${p}"]`)) x.classList.add('mm-rb-picked');
}
const rbcSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function rbcDo(dlg, what) {
  const sel = dlg.querySelector('.mm-rbc-ribbon'), line = dlg.rbcLines?.[sel.selectedIndex];
  const pick = path => { const n = rbcLines().findIndex(l => rbcSame(l.path, path)); rbcFillRibbon(dlg, n < 0 ? sel.selectedIndex : n); };
  if (what === 'close') return dlg.close();
  if (what === 'reset') { await rbReset(); return rbcFillRibbon(dlg, 0); }
  if (what === 'newTab') {
    const name = await askName('New tab', '', 'Its name');
    if (name?.trim()) { rbChange(m => { m.tabs.push({ name: name.trim(), groups: [] }); }); pick([rb.model.tabs.length - 1]); }
    return;
  }
  if (!line) return;
  const [t, g, i] = line.path;
  if (what === 'add') {
    const v = dlg.querySelector('.mm-rbc-actions').value;
    if (!v) return;
    const [action, ...params] = JSON.parse(v), item = params.length ? { action, params } : { action };
    let to = null;
    rbChange(m => {
      const tab = m.tabs[t];
      if (line.kind === 'tab') { if (!tab.groups.length) tab.groups.push({ name: tab.name, items: [] }); to = [t, tab.groups.length - 1, tab.groups.at(-1).items.push(item) - 1]; return; }
      const items = tab.groups[g].items;
      if (line.kind === 'group' || line.kind === 'corner') { to = [t, g, items.push(item) - 1]; return; }
      items.splice(i + 1, 0, item);
      to = [t, g, i + 1];
    });
    return pick(to);
  }
  if (what === 'newGroup') {
    const name = await askName('New group', '', 'Its name');
    if (name?.trim()) { rbChange(m => { m.tabs[t].groups.splice(g === undefined ? m.tabs[t].groups.length : g + 1, 0, { name: name.trim(), items: [] }); }); pick([t, g === undefined ? rb.model.tabs[t].groups.length - 1 : g + 1]); }
    return;
  }
  if (what === 'rename' && (line.kind === 'tab' || line.kind === 'group')) {
    const old = line.kind === 'tab' ? rb.model.tabs[t].name : rb.model.tabs[t].groups[g].name;
    const name = await askName(line.kind === 'tab' ? 'Tab name' : 'Group name', old, 'Its name');
    if (name?.trim()) rbChange(m => { if (line.kind === 'tab') { if (rb.tab === old) rb.tab = name.trim(); m.tabs[t].name = name.trim(); } else m.tabs[t].groups[g].name = name.trim(); });
    return pick(line.path);
  }
  if (what === 'remove') {
    rbRemove({ kind: line.kind, path: line.path });
    return rbcFillRibbon(dlg, sel.selectedIndex);
  }
  if (what === 'up' || what === 'down') {
    const d = what === 'up' ? -1 : 1;
    let to = line.path;
    rbChange(m => {
      const list = line.kind === 'tab' ? m.tabs : line.kind === 'group' ? m.tabs[t].groups : line.kind === 'corner' ? null : m.tabs[t].groups[g].items;
      if (!list) return false;
      const at = line.path.at(-1), next = at + d;
      if (next < 0 || next >= list.length) return false;
      [list[at], list[next]] = [list[next], list[at]];
      to = [...line.path.slice(0, -1), next];
    });
    return pick(to);
  }
  if (line.kind !== 'item' && what !== 'divider') return;
  if (what === 'divider') { rbChange(m => { const its = m.tabs[t].groups[g]?.items; if (!its) return false; its.splice((i ?? its.length - 1) + 1, 0, 'divider'); }); return pick([t, g, (i ?? 0) + 1]); }
  if (what === 'size') rbChange(m => { const it = m.tabs[t].groups[g].items[i]; if (it.size === 'large') delete it.size; else { it.size = 'large'; delete it.stack; } });
  if (what === 'stack') rbChange(m => { const it = m.tabs[t].groups[g].items[i]; if (it.size === 'large') return false; it.stack = !it.stack; });
  if (what === 'rename') {   // a button's name is its label (a long macro name made short)
    const it = rb.model.tabs[t].groups[g].items[i];
    const v = await askName('Label (empty: the action\'s title)', it.label ?? '', actionTitle(it.action, it.params ?? []));
    if (v !== null) rbChange(m => { const x = m.tabs[t].groups[g].items[i]; if (v.trim()) x.label = v.trim(); else delete x.label; });
  }
  pick(line.path);
}
appAction('ribbon.customize', { title: 'Customize the ribbon...', hint: 'The ribbon\'s tabs, groups and buttons as a list beside every command: add, remove, move, large or small, labels (also by keyboard)', group: 'view',
  run: () => { if (!rb.model) return; rbCustomize(); } });