'use strict';
// A tool pane's page and this window's page (docs/plans/24-PLAN-docking.md 3.5): the pane is a frame from the panes'
// site in a view of this page (a process of its own), or floats in a window of its own (PaneForm.cs, its messages
// through the host). Until the page it is shown in says it is ready, the last message of each kind waits (a message
// with a `key` under that key); when it says so, it gets everything it shows (`state()`), as a frame loads again when
// it moves. What its page sends goes to `receive(m, from)`; the channel itself does the common part: ready, a press
// there closing this window's menus, a key it does not use (this window's), a choice in a menu it drew floating. The
// Folder and Search panes use it (app.js).
// Loaded before app.js; nothing here runs before app.js has started.

const paneChannels = new Map();   // id -> channel

// `id`: the pane's name for the host (folder, search); `page`: its page; `view()`: the element its frame goes in;
// `state()`: a Map of kind -> message of what it shows; `onFloat()` / `onDock()`: this page around it.
function paneChannel({ id, page, title, view, state, receive, onFloat, onDock }) {
  const ch = { id, frame: null, ready: false, queue: new Map(), floating: false, floatQueue: null, runs: null };

  ch.frameEl = () => {
    if (ch.frame) return ch.frame;
    const frame = document.createElement('iframe');
    frame.className = `mm-pane-frame mm-${id}-frame`;
    frame.title = title;
    frame.src = PANE_ORIGIN + '/' + page;
    ch.frame = frame;
    view().append(frame);
    return frame;
  };

  ch.send = msg => {
    if (ch.floating) {
      if (ch.floatQueue) return void ch.floatQueue.set(msg.key ?? msg.kind, msg);
      return void host('paneSend', { pane: id, msg });
    }
    ch.frameEl();
    if (!ch.ready) return void ch.queue.set(msg.key ?? msg.kind, msg);
    ch.frame.contentWindow.postMessage({ toPane: msg }, PANE_ORIGIN);
  };

  ch.focus = () => {
    if (ch.floating) return false;
    ch.frameEl().focus();
    return true;
  };

  // `atCursor`: dropped outside this window, its window opens at the cursor (else at its kept place).
  ch.float = ({ atCursor = false } = {}) => {
    if (ch.floating) return;
    ch.floating = true;
    ch.floatQueue = new Map();
    document.body.toggleAttribute(`data-${id}-floating`, true);
    onFloat?.();
    host('paneFloat', { pane: id, page, atCursor });
  };
  ch.back = () => { if (ch.floating) host('paneDock', { pane: id }); };   // paneClosed follows
  ch.docked = () => {   // its window closed: in its view again, showing what it shows now
    if (!ch.floating) return;
    ch.floating = false;
    ch.floatQueue = null;
    document.body.removeAttribute(`data-${id}-floating`);
    for (const msg of state().values()) ch.send(msg);
    onDock?.();
  };

  // A menu of this page (its buttons, as shown now) drawn by the floating page, which cannot be drawn over here.
  ch.menuThere = (menuEl, x, y) => {
    const items = [], runs = [];
    for (const el of menuEl.children) {
      if (el.tagName === 'HR') { if (items.length && items.at(-1) !== '-') items.push('-'); continue; }
      if (el.tagName !== 'BUTTON' || el.hidden) continue;
      runs.push(() => el.click());
      items.push({ label: el.textContent, id: runs.length - 1 });
    }
    ch.runs = runs;
    ch.send({ kind: 'menu', x, y, items });
  };

  ch.receive = (m, from) => {
    if (m.kind === 'ready') {
      const waiting = new Map([...state(), ...(from === 'float' ? ch.floatQueue : ch.queue) ?? []]);
      if (from === 'frame') { ch.ready = true; ch.queue = null; }
      else ch.floatQueue = null;
      if ((from === 'float') !== ch.floating) return;   // not the one shown now
      for (const msg of waiting.values()) ch.send(msg);
      return;
    }
    if ((from === 'float') !== ch.floating) return;
    switch (m.kind) {
      case 'activate':   // a press in its page: as a press here, it closes this window's menus
        closeMenus();
        return hideMenus();
      case 'menuPick': return ch.runs?.[m.id]?.();
      case 'key':   // a key the pane does not use: this window's (keys.js), as if pressed here
        return document.dispatchEvent(new KeyboardEvent('keydown', { key: m.key, code: m.code, ctrlKey: m.ctrlKey,
          shiftKey: m.shiftKey, altKey: m.altKey, metaKey: m.metaKey, bubbles: true, cancelable: true }));
      default: return receive(m, from);
    }
  };

  paneChannels.set(id, ch);
  return ch;
}

// The messages of the panes' pages: from a frame of this page, or (fromPane) from a floating window.
addEventListener('message', e => {
  if (e.origin !== PANE_ORIGIN || !e.data?.fromPane) return;
  for (const ch of paneChannels.values())
    if (ch.frame && ch.frame.contentWindow === e.source) return void ch.receive(e.data.fromPane, 'frame');
});
