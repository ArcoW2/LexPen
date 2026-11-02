// A tool pane's page (docs/plans/24-PLAN-docking.md 3.5): a frame in its window's page, from a site of its own, so it
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
// drawn by the pane; a choice goes back as menuPick.
function paneMenu({ x, y, items }) {
  document.querySelector('.mm-pane-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'mm-pane-menu';
  for (const item of items) {
    if (item === '-') { menu.append(Object.assign(document.createElement('hr'), { className: 'mm-pane-menu-sep' })); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = (item.checked ? '\u2713 ' : '\u2003') + item.label;
    b.onclick = () => { close(); toWindow({ kind: 'menuPick', id: item.id }); };
    menu.append(b);
  }
  const outside = e => { if (!menu.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  function close() { menu.remove(); removeEventListener('pointerdown', outside, true); removeEventListener('keydown', esc, true); }
  addEventListener('pointerdown', outside, true);
  addEventListener('keydown', esc, true);
  document.body.append(menu);
  menu.style.left = Math.max(0, Math.min(x, innerWidth - menu.offsetWidth - 2)) + 'px';
  menu.style.top = Math.max(0, Math.min(y, innerHeight - menu.offsetHeight - 2)) + 'px';
  menu.querySelector('button')?.focus();
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
// (docs/plans/24-PLAN-docking.md 3.11).
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
