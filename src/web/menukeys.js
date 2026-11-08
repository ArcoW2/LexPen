// A right-click menu its own page draws (the highlights window's, the columns pane's), working as the window's
// right-click menus (app.js showMenu): it takes the keys while open (Up / Down, Home / End, Enter, Esc), the focus going
// back where it was after. Its item marked is the one with the focus, set by the pointer moving over it or the keys;
// none as it opens (the menu itself has the focus). Not :hover: the page keeps the pointer's last place over a menu.
// A click outside it or the focus gone elsewhere (another window, another program) closes it, the focus staying there.
// Called as it opens, shown and placed; `hide`: how it closes (hidden or removed).
function menuKeys(menu, hide) {
  menu.closeMenuKeys?.(false);   // still open from the last time
  const from = document.activeElement;
  const buttons = () => [...menu.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled);
  const move = e => { const b = e.target.closest('button'); if (b && !b.disabled) b.focus({ preventScroll: true }); };
  const leave = () => menu.focus({ preventScroll: true });
  const keys = e => {
    if (!menu.contains(document.activeElement)) return;
    const list = buttons(), at = list.indexOf(document.activeElement);
    const to = { ArrowDown: (at + 1) % list.length, ArrowUp: at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }[e.key];
    if (to === undefined && e.key !== 'Escape') return;   // Enter, Space: the button's own click
    e.preventDefault();
    e.stopPropagation();
    if (to !== undefined) list[to]?.focus({ preventScroll: true });
    else close(true);
  };
  const outside = e => { if (!menu.contains(e.target)) close(false); };
  const gone = () => setTimeout(() => { if (!document.hasFocus() || !menu.contains(document.activeElement)) close(false); });
  const chosen = e => { if (e.target.closest('button')) setTimeout(() => close(true)); };   // after its own click handler
  function close(restore) {
    menu.closeMenuKeys = null;
    removeEventListener('keydown', keys, true);
    removeEventListener('pointerdown', outside, true);
    menu.removeEventListener('mousemove', move);
    menu.removeEventListener('mouseleave', leave);
    menu.removeEventListener('focusout', gone);
    menu.removeEventListener('click', chosen);
    hide();
    const now = document.activeElement;   // a hidden menu can keep it for a moment
    if (restore && (now === document.body || menu.contains(now))) from?.focus?.({ preventScroll: true });
  }
  menu.closeMenuKeys = close;
  addEventListener('keydown', keys, true);
  addEventListener('pointerdown', outside, true);
  menu.addEventListener('mousemove', move);
  menu.addEventListener('mouseleave', leave);
  menu.addEventListener('focusout', gone);
  menu.addEventListener('click', chosen);
  menu.tabIndex = -1;
  menu.focus({ preventScroll: true });
}
