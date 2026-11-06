'use strict';
// A tool pane's page and this window's page (docs/plans/24-PLAN-docking.md 3.5): the pane is a frame from the panes'
// site in a view of this page (a process of its own), or floats in a window of its own (PaneForm.cs, its messages
// through the host). Until the page it is shown in says it is ready, the last message of each kind waits (a message
// with a `key` under that key); when it says so, it gets everything it shows (`state()`), as a frame loads again when
// it moves. What its page sends goes to `receive(m, from)`; the channel itself does the common part: ready, a press
// there closing this window's menus, a key it does not use (this window's), a choice in a menu it drew floating. The
// Folder and Search panes use it (app.js).
// A pane that follows the focus (docs/plans/executed/PLAN-floating-panel-scope.md 3.2; FOLLOWING_PANES) floats in one window
// for LexPen, serving the window worked in that wants it (reportPanesWanted): floating here, this window may not be the
// one it serves now (`owner` false): then nothing is sent to it, and all it shows is sent when it comes here (paneServe).
// Loaded before app.js; nothing here runs before app.js has started.

const paneChannels = new Map();   // id -> channel

// `id`: the pane's name for the host (folder, search); `page`: its page; `view()`: the element its frame goes in;
// `state()`: a Map of kind -> message of what it shows; `onFloat()` / `onDock()`: this page around it.
function paneChannel({ id, page, title, view, state, receive, onFloat, onDock }) {
  const ch = { id, frame: null, ready: false, queue: new Map(), floating: false, owner: false, floatQueue: null, runs: null };

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
      if (!ch.owner) return;   // it serves another window now: all of it is sent when it comes back (serve)
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

  // `atCursor`: dropped outside this window, its window opens at the cursor (else at its kept place). One that follows
  // the focus: the window there already serves this one now ("open": sent all it shows), or stays with the window
  // holding it ("elsewhere").
  ch.float = ({ atCursor = false } = {}) => {
    if (ch.floating && ch.owner) return;
    if (!ch.floating) {
      ch.floating = true;
      document.body.toggleAttribute(`data-${id}-floating`, true);
      onFloat?.();
    }
    ch.owner = true;
    ch.floatQueue = new Map();
    host('paneFloat', { pane: id, page, atCursor }).then(r => {
      if (!ch.floating || r === 'created') return;   // its page says when it is ready
      if (r === 'elsewhere') return void Object.assign(ch, { owner: false, floatQueue: null });
      ch.flush();
    });
  };
  // Everything it shows, to its window of its own (and what waited for it).
  ch.flush = () => {
    const waiting = new Map([...state(), ...ch.floatQueue ?? []]);
    ch.floatQueue = null;
    for (const msg of waiting.values()) ch.send(msg);
  };
  // One that follows the focus comes to this window (paneServe; floating here now, also when it was hidden here), or
  // goes to another (paneRelease).
  ch.serve = () => {
    if (!ch.floating) {
      ch.floating = true;
      document.body.toggleAttribute(`data-${id}-floating`, true);
      onFloat?.();
    }
    ch.owner = true;
    ch.flush();
  };
  ch.release = () => { ch.owner = false; ch.floatQueue = null; };
  // Back in this window: its window closes (paneClosed follows), or (one that follows the focus) it moves on to
  // another window, or it served another window: back here at once.
  ch.back = () => {
    if (!ch.floating) return;
    host('paneDock', { pane: id }).then(r => { if (r !== 'closed') ch.docked(); });
  };
  ch.docked = () => {   // its window closed: in its view again, showing what it shows now
    if (!ch.floating) return;
    ch.floating = false;
    ch.owner = false;
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
      if ((from === 'float') !== ch.floating || from === 'float' && !ch.owner) return;   // not the one shown now
      for (const msg of waiting.values()) ch.send(msg);
      return;
    }
    if ((from === 'float') !== ch.floating || from === 'float' && !ch.owner) return;
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

// The panes that follow the focus (plan 22 3.2; AppHost.FollowingPanes): the window's ones (an editor pane's own,
// bm:0, ..., stay this window's), and Characters and Highlights (windows of their own; their channel in app.js).
const FOLLOWING_PANES = ['folder', 'search', 'bm', 'messages', 'clips', 'macros', 'cols', 'commands', 'chars', 'hls'];
let panesWantedSent = '';

// Which of them this window wants now, told to the host when it changes: one not docked here (hidden, or floating),
// and no editor pane's own of its kind shown beside the active document.
function reportPanesWanted() {
  if (typeof dockModel !== 'function' || !dockPanes.size) return;
  const m = dockModel(), wants = {};
  for (const id of FOLLOWING_PANES) {
    if (!dockPanes.has(id)) continue;
    const own = `${id}:${state.activePane}`;
    wants[id] = (m.state[id] === 'floating' || dockHidden(m, id)) && !(dockPanes.has(own) && !dockHidden(m, own));
  }
  const told = JSON.stringify(wants);
  if (told === panesWantedSent) return;
  panesWantedSent = told;
  host('panesWanted', { wants });
}

// A window holds one that follows the focus (`why`: playing, recording, searching; null: lets it go).
const holdPane = (id, why = null) => host('paneHold', { pane: id, why }).catch(() => {});

// The messages of the panes' pages: from a frame of this page, or (fromPane) from a floating window.
addEventListener('message', e => {
  if (e.origin !== PANE_ORIGIN || !e.data?.fromPane) return;
  for (const ch of paneChannels.values())
    if (ch.frame && ch.frame.contentWindow === e.source) return void ch.receive(e.data.fromPane, 'frame');
});
