'use strict';
// The Bookmarks pane, the window's side (docs/plans/executed/PLAN-docking.md stage 10, 3.9, 3.10): a page of its own
// (bookmarks.html) that lists the bookmarks of the document it serves: docked in a dock area or floating, the window's
// active document (`bm`); beside an editor pane's text, that pane's own (`bm:0`, `bm:1`), its document. Hidden at
// first; shown docked at the right by its action. It follows the bookmarks (set, moved with the text, removed) and the
// document shown; a click goes to the bookmark in the editor pane it serves. The popup list (bookmarkList) stays.
// Loaded after app.js; its panes registered with the others (registerDockPanes).

const bmPanes = { channels: new Map(), timer: 0, back: false };

// The editor pane an instance serves, and its document: `bm` the active pane's, `bm:n` pane n's.
function bmServed(id) {
  const at = id.split(':')[1], pane = panes[at === undefined ? state.activePane : +at];
  return { pane, doc: pane?.active?.doc ?? null };
}

function bmState(id) {
  const { doc } = bmServed(id);
  const list = doc && typeof bookmarkList === 'function' ? bookmarkList(doc) : doc?.bmList ?? [];
  return { kind: 'bookmarks', name: doc ? docName(doc) : null,
    list: list.map(b => ({ n: b.n, line: b.line, ch: b.ch, text: String(b.text ?? '').slice(0, 300) })) };
}

function bmChannel(id) {
  const ch = paneChannel({ id, page: 'bookmarks.html', title: 'Bookmarks', view: () => dockPanes.get(id).view,
    state: () => new Map([['look', paneLook()], ['title', { kind: 'title', text: 'Bookmarks' }], ['bookmarks', bmState(id)]]),
    receive: m => fromBookmarksPane(id, m),
    onFloat: () => setDockFloating(id, true),
    // Back in its view: docked (moved onto the window); its window closed by hand: it stays floating.
    onDock: () => { if (bmPanes.back) { bmPanes.back = false; setDockFloating(id, false); } } });
  bmPanes.channels.set(id, ch);
  return ch;
}

// What the panes show, again (not at every key at once): the ones made already (shown, or floating).
function tellBookmarksPanes() {
  clearTimeout(bmPanes.timer);
  bmPanes.timer = setTimeout(() => {
    for (const [id, ch] of bmPanes.channels) if (ch.frame || ch.floating) ch.send(bmState(id));
  }, 200);
}

function fromBookmarksPane(id, m) {
  const { pane } = bmServed(id);
  if (m.kind === 'escape') return events.toolEscape({ pane: pane?.index });   // that pane active, its document the keys (app.js)
  if (m.kind !== 'go' || !pane?.active) return;
  setActivePane(pane.index);
  moveTo(pane, { line: m.line, ch: m.ch }, false, pane.el.dataset.mode === 'preview');   // bookmarks.js
}

// Its action: the active editor pane's own when it has one (not closed); else the window's as it was last (floating:
// its window; else docked, at the right the first time).
function openBookmarksPane() {
  const own = `bm:${state.activePane}`;
  if (dockPanes.has(own) && !dockHidden(dockModel(), own)) showDockPane(own);
  else if (dockModel().state.bm === 'floating') bmPanes.channels.get('bm').float();
  else showDockPane('bm');
  tellBookmarksPanes();
}

function registerBookmarksPanes() {
  const view = () => { const v = Object.assign(document.createElement('div'), { className: 'mm-tool-view' }); $('.mm-dock-hold').append(v); return v; };
  // Shown: its frame made (it gets all it shows once its page is ready: panechannel.js).
  const sync = (id, ch) => () => { if (dockShown(dockModel(), id) && !ch.frame) ch.send(bmState(id)); };
  registerDockPane('bm', { title: 'Bookmarks', view: view(), home: 'right', startHidden: true, kind: 'bm',
    focus: () => bmPanes.channels.get('bm').focus() });
  const win = bmChannel('bm');
  Object.assign(dockPanes.get('bm'), {
    leave: m => { if (m.state.bm === 'floating') win.back(); m.state.bm = 'hidden'; },
    sync: sync('bm', win),
    channel: { get floating() { return win.floating; }, float: opts => win.float(opts), back: () => { bmPanes.back = true; win.back(); } } });
  for (const pane of panes) {
    const id = `bm:${pane.index}`;
    registerDockPane(id, { title: 'Bookmarks', view: view(), scope: 'pane', pane: pane.index, home: `${pane.index}.right`, startHidden: true, kind: 'bm',
      focus: () => bmPanes.channels.get(id).focus() });
    const ch = bmChannel(id);
    Object.assign(dockPanes.get(id), {
      leave: m => { m.state[id] = 'hidden'; },
      sync: sync(id, ch),
      // Floating: the window's (its window of its own); this one goes.
      channel: { floating: false, back() {}, float: () => {
        const m = dockModel();
        m.state[id] = 'hidden';
        m.state.bm = 'floating';
        saveDocks(m);
        win.float();
      } } });
  }
}

appAction('bookmarks.pane', { title: 'Manage bookmarks...', hint: 'The bookmarks of the document, each with its line and the start of its text; a click goes there', group: 'bookmarks',
  run: () => openBookmarksPane() });
