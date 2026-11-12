// A tool pane's page (docs/plans/executed/PLAN-docking.md 3.5): a frame in its window's page, from a site of its own, so it
// runs in a process of its own; or floating, a window of its own (PaneForm.cs), where the host passes its messages.
// Either way it talks to its window's page only: what it shows comes from there, what is done in it goes there. The
// window gives it its theme and fonts, and gets every key the pane does not use itself (F1, Ctrl+Shift+Tab, Ctrl+M,
// ...), so the window's keys work here too.
const APP_ORIGIN = 'https://lexpen.example';
const floating = parent === window;   // a window of its own
const paneHandlers = {};   // kind -> what the window's message does here

function toWindow(msg) {
  if (floating) chrome.webview.postMessage({ fromPane: msg });
  else parent.postMessage({ fromPane: msg }, APP_ORIGIN);
}

function fromWindow(m) {
  if (m.kind === 'look') return applyPaneLook(m);
  if (m.kind === 'title') return void (document.title = m.text);
  if (m.kind === 'menu') return paneMenu(m);
  paneHandlers[m.kind]?.(m);
}
// Shown by an action while floating (docks.js flashDock): the page flashes as a docked pane's group does; once: one blink
// (F3 come here, app.js f3Step).
paneHandlers.flash = m => {
  const body = document.body;
  body.classList.remove('mm-pane-flash');
  body.classList.toggle('mm-flash-once', !!m?.once);
  void body.offsetWidth;   // the animation again when it was still running
  body.classList.add('mm-pane-flash');
  setTimeout(() => body.classList.remove('mm-pane-flash'), 1300);
};
addEventListener('message', e => { if (e.origin === APP_ORIGIN && e.data?.toPane) fromWindow(e.data.toPane); });
if (floating) chrome.webview.addEventListener('message', e => { if (e.data?.toPane) fromWindow(e.data.toPane); });

// The window's theme colours and fonts (its root's own values), and its day / night.
function applyPaneLook({ css, theme, mode }) {
  const root = document.documentElement;
  root.style.cssText = css;
  if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
  if (mode) root.dataset.mode = mode; else delete root.dataset.mode;
}

// Floating, the window's page cannot draw here: a menu it sends ({ x, y, items: [{ label, checked, id } | '-'] }) is
// drawn by the pane; a choice goes back as menuPick. The pane's own menus (sort-pane.js) give an item `run` (done
// here instead), `disabled`, `key` (dimmed text after the label: a folder's path), `dim` (one that no longer exists)
// and `title`. `above`: where it ends when it does not fit below y (a button's menu: above the button, not over it);
// `closed`: a message kind for the pane's own page once it closes; `button`: the pane's button that opened it, a press
// on which closes it (not opened again by the click that follows).
// It takes the keys (Up / Down, Home / End, Enter, Right / Left for a submenu, Esc), the focus going back where it was
// after. Its item marked is the one with the focus, set by the pointer moving over it or the keys; none as it opens
// (the menu itself has the focus). Not :hover: the page keeps the pointer's last place over a menu.
function paneMenu({ x, y, above, closed, button, items }) {
  document.querySelectorAll('.mm-pane-menu').forEach(m => m.remove());
  const from = document.activeElement;
  const menu = document.createElement('div');
  menu.className = 'mm-pane-menu';
  menu.tabIndex = -1;
  let subMenu = null;   // an item's submenu ({ label, sub: [items] }): beside it, on hover, click or Right
  const closeSub = () => { subMenu?.remove(); subMenu = null; };
  const fill = (el, list) => {
    for (const item of list) {
      if (item === '-') { el.append(Object.assign(document.createElement('hr'), { className: 'mm-pane-menu-sep' })); continue; }
      if (item.header) { el.append(Object.assign(document.createElement('div'), { className: 'mm-pane-menu-head', textContent: item.header })); continue; }   // a section's name: not an item
      const b = document.createElement('button');
      b.type = 'button';
      b.disabled = !!item.disabled;
      b.textContent = (item.checked ? '\u2713 ' : '\u2003') + item.label + (item.sub ? '  \u203a' : '');
      if (item.key) b.append(Object.assign(document.createElement('span'), { className: 'mm-pane-menu-key', textContent: item.key }));
      if (item.dim) b.classList.add('mm-dim');
      if (item.title) b.title = item.title;
      if (item.sub) {
        b.onclick = () => openSub(b, item.sub);
        b.onmousemove = () => { b.focus(); openSub(b, item.sub); };
        b.onkeydown = e => { if (e.key === 'ArrowRight') { e.preventDefault(); openSub(b, item.sub, true); } };
      } else {
        b.onclick = () => { close(); if (item.run) item.run(); else toWindow({ kind: 'menuPick', id: item.id }); };
        b.onmousemove = () => { b.focus(); if (el === menu) closeSub(); };
      }
      el.append(b);
    }
  };
  function openSub(b, list, focus) {
    if (subMenu?.from === b) return focus && subMenu.querySelector('button')?.focus();
    closeSub();
    subMenu = Object.assign(document.createElement('div'), { className: 'mm-pane-menu', from: b });
    fill(subMenu, list);
    subMenu.onkeydown = e => { if (e.key === 'ArrowLeft') { e.preventDefault(); closeSub(); b.focus(); } };
    subMenu.addEventListener('focusout', focusGone);
    document.body.append(subMenu);
    // Right of the item, else left of the menu; a pane too narrow for either: under the item, which stays readable.
    const r = b.getBoundingClientRect(), w = subMenu.offsetWidth;
    const right = r.right + w <= innerWidth - 2, left = menu.offsetLeft - w >= 0;
    subMenu.style.left = (right ? r.right : left ? menu.offsetLeft - w : Math.max(0, Math.min(r.left + 16, innerWidth - w - 2))) + 'px';
    subMenu.style.top = Math.max(0, Math.min(right || left ? r.top - 4 : r.bottom, innerHeight - subMenu.offsetHeight - 2)) + 'px';
    if (focus) subMenu.querySelector('button')?.focus();
  }
  fill(menu, items);
  const outside = e => {
    if (menu.contains(e.target) || subMenu?.contains(e.target)) return;
    close();
    if (!button?.contains(e.target)) return;
    // Its button's click (this press's): stopped before it reaches the button; the next press drops the stop.
    const stop = ev => { if (button.contains(ev.target)) ev.stopPropagation(); };
    addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => addEventListener('pointerdown', () => removeEventListener('click', stop, true), { capture: true, once: true }));
  };
  menu.onmouseleave = () => { if (!subMenu) menu.focus(); };
  // The focus gone elsewhere (the window, another pane, another program): it closes, the focus staying there. Once
  // the focus has settled: Esc or Left in the submenu puts it back in the menu.
  function focusGone() {
    setTimeout(() => {
      const inside = document.activeElement && (menu.contains(document.activeElement) || subMenu?.contains(document.activeElement));
      if (menu.isConnected && (!document.hasFocus() || !inside)) close(false);
    });
  }
  menu.addEventListener('focusout', focusGone);
  const keys = e => {
    const level = subMenu?.contains(document.activeElement) ? subMenu : menu;
    const list = [...level.querySelectorAll('button:not(:disabled)')], at = list.indexOf(document.activeElement);
    const to = { ArrowDown: (at + 1) % list.length, ArrowUp: at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }[e.key];
    if (to !== undefined) { e.preventDefault(); return list[to]?.focus(); }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (subMenu) { const from = subMenu.from; closeSub(); from.focus(); } else close();
  };
  function close(restore = true) {
    closeSub();
    menu.remove();
    removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', keys, true);
    if (restore && document.activeElement === document.body) from?.focus?.();
    if (closed) paneHandlers[closed]?.({ kind: closed });
  }
  addEventListener('pointerdown', outside, true);
  addEventListener('keydown', keys, true);
  document.body.append(menu);
  menu.style.left = Math.max(0, Math.min(x, innerWidth - menu.offsetWidth - 2)) + 'px';
  const top = above !== undefined && y + menu.offsetHeight > innerHeight - 2 ? above - menu.offsetHeight : y;
  menu.style.top = Math.max(0, Math.min(top, innerHeight - menu.offsetHeight - 2)) + 'px';
  menu.focus();
}

// In a text field (the Search pane's) its editing keys stay there: typing, the arrows, Ctrl+C / V / X / Z / Y / A,
// Ctrl+arrows, Ctrl+Backspace / Delete.
const fieldKey = e => e.target.matches?.('input, textarea, select') && !/^F\d+$/.test(e.key) &&
  (!(e.ctrlKey || e.altKey || e.metaKey) || (e.ctrlKey && !e.altKey && !e.metaKey &&
    /^(a|c|v|x|z|y|arrowleft|arrowright|arrowup|arrowdown|home|end|backspace|delete|insert)$/i.test(e.key)));
addEventListener('keydown', e => {
  if (e.defaultPrevented || ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key) || document.querySelector('.mm-pane-menu') || fieldKey(e)) return;
  const { key, code, ctrlKey, shiftKey, altKey, metaKey } = e;
  toWindow({ kind: 'key', key, code, ctrlKey, shiftKey, altKey, metaKey });
  if (ctrlKey || altKey || metaKey || /^F\d+$/.test(key)) e.preventDefault();   // the window's, not the browser's
});

// Floating, its window with the focus has the active frame, as the part with the focus in the window's page has
// (docs/plans/executed/PLAN-docking.md 3.11).
if (floating) {
  const ring = document.createElement('div');
  ring.className = 'mm-pane-active-ring';
  ring.style.cssText = 'position: fixed; inset: 0; border: 2px solid var(--pane-active); pointer-events: none; z-index: 2147483647;';
  const show = () => { ring.hidden = !document.hasFocus(); };
  addEventListener('focus', show);
  addEventListener('blur', show);
  const add = () => { document.body.append(ring); show(); };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
}

// A press anywhere in the pane: its window's pane becomes the active one, as a press in the page does.
addEventListener('pointerdown', () => toWindow({ kind: 'activate' }), true);

// Ready once every script of the page has run (the pane's own comes after this one): a message before that would
// find no handler.
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => toWindow({ kind: 'ready' }));
else toWindow({ kind: 'ready' });
