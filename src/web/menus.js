'use strict';
// The menu bar: File, Edit, Select, Find, Go, Format, View, Window, Tools, Options. Every item runs an action (actions.js), so its key
// comes from keys.json and the same thing can be done from a key, F1 or here. Alt+letter opens a menu;
// in an open menu the arrows move, Enter runs, Esc closes one level, a letter runs its item. The focus
// stays where it was (the editor), so an item works on the cursor and the selection there.
// Loaded before app.js.

// An item: [label with &letter, action, ...parameters], '-' (a line), { header: text } (a line with a name, not an
// item: the View menu's groups), { label, sub: [items] } or
// { label, fill: async () => items } (a submenu, filled when it opens), or { label, run, plain: true }
// (an entry of a recent list: a file, not an action). `font`: the key column (a sample) is shown in that font.
// View > Gutter, also the right-click menu of the gutter (app.js).
const GUTTER_ITEMS = [{ label: '&Line numbers', sub: [['&None', 'lineNumbers.set', 'none'], ['Every &10', 'lineNumbers.set', 'tens'],
  ['&Every line', 'lineNumbers.set', 'all'], '-', ['&Absolute', 'lineNumberCount.set', 'absolute'],
  ['&Relative to the cursor', 'lineNumberCount.set', 'relative']] }, ['&Bookmarks', 'gutterColumn.toggle', 'bookmarks'],
  ['&Change markers (not saved)', 'gutterColumn.toggle', 'changes'], ['&Git markers (since the last commit)', 'gutterColumn.toggle', 'git'],
  ['&Fold markers', 'gutterColumn.toggle', 'folds'], ['&Highlights (a strip at the edge)', 'gutterColumn.toggle', 'highlights'], ['&Occurrences (their line numbers)', 'gutterColumn.toggle', 'occurrences']];
// The menus follow the features (docs/plans/executed/PLAN-menu-structure.md): each menu one subject, in the order of the
// work (File, Edit, Select, Find, Go, Format, View, Window, Tools, Options); F1 groups the actions the same way.
const MENUS = [
  ['&File', [
    ['&New file', 'newFile'], ['&Open file...', 'openFile'], ['Open &folder...', 'openFolder'], '-',
    { label: '&Recents && Favourites', sub: [
      { label: '&Recent files', fill: () => recentItems('files') },
      { label: 'Recent fold&ers', fill: () => recentItems('folders') },
      { label: 'Recently &closed', fill: () => recentItems('closed') }, '-',
      { label: 'Fa&vourite files', fill: () => favouriteItems('files') },
      { label: 'Favo&urite folders', fill: () => favouriteItems('folders') }] }, '-',
    ['&Save', 'save'], ['Save &as...', 'saveAs'], ['Revert to save&d', 'revertToSaved'],
    { label: 'Cop&y name to Windows clipboard', fill: () => copyNameItems(), enabled: () => !!activeDoc()?.path },   // app.js, plan 37
    ['Rena&me...', 'file.rename'], '-',
    ['&Print...', 'print'], '-',
    ['Close &tab', 'closeTab'], ['Close a&ll tabs', 'closeAllTabs'], ['Reopen closed ta&b', 'reopenTab'], '-',
    { label: 'Close &window', action: 'closeWindow', key: 'Alt+F4' },   // Windows' own key: the window closes as by its X
  ]],
  ['&Edit', [
    ['&Undo', 'undo'], ['&Redo', 'redo'], '-',
    ['Cu&t', 'cut'], ['&Copy', 'copy'], ['&Paste', 'paste'], ['E&xchange with clipboard', 'clipboard.exchange'], ['Paste i&mage (asks how to link it)...', 'pasteImage'], '-',
    { label: 'C&lipboards', fill: async () => [...await clipboardItems(), '-', ['&Manage clipboards...', 'clipboards.pane']] }, '-',
    { label: '&Insert', sub: [['&Character...', 'insertCharacter'], '-', ['&Link...', 'link'], ['&Image...', 'imageFromFile']] },
    ['Complete wor&d', 'complete'], ['Insert / &overwrite', 'overwrite.toggle'], '-',
    ['&Sort...', 'edit.sortWindow'],
    { label: 'Li&nes', sub: [['&Duplicate', 'duplicateLines'], ['Move &up', 'moveLinesUp'], ['Move do&wn', 'moveLinesDown'],
      ['De&lete', 'deleteLines'], ['&Join', 'joinLines'], '-', ['&Indent', 'indentMore'], ['&Outdent', 'indentLess']] },
    { label: 'H&elpers', sub: [['&Add tab stop', 'tabAdd'], ['&Remove tab stop', 'tabRemove'], ['&Clear tab stops', 'tabClear'], '-',
      ['Add &helper line', 'helperAdd'], ['R&emove helper line', 'helperRemove'], ['C&lear helper lines', 'helperClear']] },
    { label: '&Highlights', sub: [['&Highlight', 'highlight.toggle'], ['&Selection to highlight', 'highlight.fromSelection'],
      ['Highlight &note...', 'highlight.note'], ['&Remove highlight', 'highlight.remove'], ['Remove &all highlights in this file', 'highlight.clear'],
      ['&Keep the adjusted highlight', 'highlight.keep'], ['&Move all highlights to where the setting says', 'highlight.moveAll'], '-',
      ['Manage highlights...', 'highlight.list']] },
  ]],
  ['&Select', [
    ['Select &all', 'selectAll'], ['Select &line', 'selectLine'], ['Select inside &brackets', 'selectInsideBrackets'], '-',
    ['&Column mode', 'columnMode.toggle'], { label: 'Select a bloc&k', sub: [['&Up', 'blockSelect', 'up'], ['&Down', 'blockSelect', 'down'],
      ['&Left', 'blockSelect', 'left'], ['&Right', 'blockSelect', 'right']] }, '-',
    { label: '&Multiple cursors', sub: [['&Add occurrence', 'cursorAdd'], ['&Next occurrence', 'cursorNext'],
      ['&Previous occurrence', 'cursorPrevious'], ['&Remove occurrence', 'cursorRemove'], ['&Clear added cursors', 'cursorClear']] },
  ]],
  ['F&ind', [
    ['&Find', 'find'], ['Find &next', 'findNext'], ['Find &previous', 'findPrevious'], '-',
    { label: '&Occurrences', fill: () => [['&Show all occurrences', 'occurrences.show'], ['Occurrences &field', 'occurrences.field'],
      ...occurrenceItems()] },   // occurrences.js: Clear, and the bar shown or closed
    '-', ['&Replace', 'replace'], ['Replace &all', 'replaceAll'], '-',
    ['&Search in files', 'searchInFiles'], ['R&eplace in files', 'searchReplace'],
  ]],
  ['&Go', [
    ['Go to &line...', 'goToLine'], ['Locate the &cursor (tap Ctrl)', 'locateCursor'], '-',
    ['Go to d&efinition', 'goToDefinition'], ['Go to definition in &this tab', 'goToDefinitionHere'], ['&Go to definition in a new tab', 'goToDefinitionNewTab'], ['Find reference&s', 'findReferences'], '-',
    { label: '&Bookmarks', sub: [
      { label: '&Go to bookmark', fill: () => loadEditor().then(() => bookmarkItems('go')) },   // bookmarks.js comes with the editor
      { label: '&Store bookmark', fill: () => loadEditor().then(() => bookmarkItems('store')) },
      { label: '&Toggle bookmark', fill: () => loadEditor().then(() => bookmarkItems('toggle')) },
      ['Toggle &unnumbered bookmark', 'bookmarkToggleFree'], ['&Next bookmark', 'bookmarkNext', 1], ['&Previous bookmark', 'bookmarkNext', -1],
      { label: '&Clear bookmark', fill: () => loadEditor().then(() => bookmarkItems('clear')) },
      ['Bookmarks of this &file...', 'bookmarkList'], '-', ['&Manage bookmarks...', 'bookmarks.pane']] }, '-',
    ['Next &highlight', 'highlight.next', 1], ['Previous h&ighlight', 'highlight.next', -1], '-',
    ['Next secti&on', 'section', 1], ['Pre&vious section', 'section', -1], ['Ne&xt block', 'block.next', 1], ['Previous bloc&k', 'block.next', -1], '-',
    ['Opening b&racket', 'goToOpenBracket'], ['Closing br&acket', 'goToCloseBracket'], '-',
    ['&Position back', 'positionBack'], ['Position &forward', 'positionForward'], '-',
    ['Next &document', 'nextDocument'], ['Previous docu&ment', 'previousDocument'], ['Back in the &window', 'back'], ['Forward in the wi&ndow', 'forward'],
  ]],
  // Filled when it opens: the bar items of the file's language and of the cursor line's, then Convert.
  ['Fo&rmat', () => formatMenuItems()],
  ['&View', [
    ['&Editor', 'editor.toggle'], ['&Preview', 'preview.toggle'], ['Editor &and preview', 'split.toggle'], ['&Hex mode', 'hex.toggle'], '-',
    { label: 'Preview pla&ce', sub: [['At the &right', 'preview.right'], ['At the &left', 'preview.left'], ['&Above', 'preview.top'], ['&Below', 'preview.bottom']] }, '-',
    ['&Wrap long lines', 'wrap.toggle'], ['R&uler', 'ruler.toggle'], ['For&matting bar', 'formatBar.toggle'], ['&Ribbon', 'ribbon.toggle'], ['Ribbon only when wan&ted', 'ribbon.onDemand'], '-',
    { label: '&Gutter', sub: GUTTER_ITEMS },
    { label: 'Scroll &bar marks', sub: [['&Find matches', 'overviewMark.toggle', 'find'], ['&Occurrences', 'overviewMark.toggle', 'occurrences'],
      ['&Unsaved changes', 'overviewMark.toggle', 'changes'], ['&Git changes', 'overviewMark.toggle', 'git'],
      ['&Bookmarks', 'overviewMark.toggle', 'bookmarks'], ['&Highlights', 'overviewMark.toggle', 'highlights'], ['&Compare differences', 'overviewMark.toggle', 'compare']] },
    { label: '&Tab bar', sub: [['One row that &scrolls', 'tabBar.set', 'scroll'], ['One row, a &menu for the rest', 'tabBar.set', 'menu'],
      ['Several &rows', 'tabBar.set', 'rows']] },
  ]],
  ['&Window', [
    // Panels: every panel with a check when shown, the dock areas, Reset docking (docks.js, docs/plans/executed/PLAN-docking.md 3.14).
    { label: '&Panels', fill: () => panelItems() }, '-',
    { label: '&Document panes', sub: [['&Left and right', 'paneOrientation.set', 'v'], ['&Top and bottom', 'paneOrientation.set', 'h'], '-',
      ['&Hide this document pane', 'paneHide'], ['Hide the &other document pane', 'paneHideOther'], ['&Close this document pane', 'paneClose'],
      ['C&lose the other document pane', 'paneCloseOther'], ['&Show the hidden document pane', 'paneShow'], '-',
      ['This document in the other pane &too', 'split'], ['Le&vel the document panes', 'levelPanes'], ['Scroll both document panes toget&her', 'compareScroll.toggle']] },
    { label: 'La&yout', sub: [['&Save as default', 'layoutSaveDefault'], ['&Reset to default', 'layoutResetDefault'],
      { label: '&Use layout of', fill: () => layoutSourceItems() }] }, '-',   // app.js
    // Filled when it opens: Manage, New, Rename, Move this window to, then every project with its windows (app.js).
    { label: 'P&rojects', fill: () => projectMenuItems() }, '-',
    { label: 'Close &window', action: 'closeWindow', key: 'Alt+F4' },
  ]],
  ['&Tools', [
    { label: '&Macros', fill: () => macroMenuItems() }, '-',   // macros.js
    { label: '&Compare', sub: [['Compare &files...', 'compareFiles'], ['Compare f&olders...', 'compareFolders'], '-',
      ['&Next difference', 'compareNext'], ['&Previous difference', 'comparePrevious'],
      ['&Align the cursor lines', 'compareAlign'], ['&Swap the files', 'compareSwap'], ['L&eave the compare', 'compareClose'], '-',
      ['Ignore &whitespace', 'compareWhitespace.toggle'], ['Ignore &case', 'compareCase.toggle'], ['&Line strip', 'compareStrip.toggle']] }, '-',
    ['&Theme colours...', 'themeColours'],
  ]],
  ['&Options', [
    ['&Settings...', 'settings'],
    { label: '&Theme set', fill: () => themeSetMenuItems() },   // this project's set (docs/plans/executed/PLAN-theme-sets.md)
    ['&File types...', 'fileTypes'], '-',
    ['&Day / night', 'theme.toggle'],
    { label: '&Zoom', sub: [['Zoom &in', 'zoomIn'], ['Zoom &out', 'zoomOut'], ['&100%', 'zoomReset'], '-', ['Use on &every screen', 'zoomEveryScreen']] }, '-',
    ['&Keyboard shortcuts and commands', 'commands'], ['The &macro language', 'macro.reference'], '-',
    ['&About LexPen', 'about'],
  ]],
];

const menuBar = {
  el: document.querySelector('.mm-menubar'),
  levels: [],    // the open menus, top first: { el, items, index (selected), button }
  top: -1,       // the open top menu
};

// "Save &as..." -> label "Save as..." with "a" as its letter; "&&" is an & itself ("Recents && Favourites").
function menuLabel(text, plain) {
  const show = s => escapeHtml(plain ? s : s.replace(/&&/g, '&'));
  const at = plain ? -1 : text.search(/(?<!&)&(?!&)/);
  if (at < 0) return { html: show(text), letter: '' };
  return { html: show(text.slice(0, at)) + '<u>' + escapeHtml(text[at + 1]) + '</u>' + show(text.slice(at + 2)),
    letter: text[at + 1].toLowerCase() };
}

function buildMenuBar() {
  menuBar.el.replaceChildren(...MENUS.map(([title], i) => {
    const button = document.createElement('button');
    button.className = 'mm-menutitle';
    button.innerHTML = menuLabel(title).html;
    button.tabIndex = -1;
    button.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
    button.addEventListener('click', () => menuBar.top === i ? closeMenus() : openTopMenu(i));
    button.addEventListener('mouseenter', () => { if (menuBar.top >= 0 && menuBar.top !== i) openTopMenu(i); });
    return button;
  }));
}

async function openTopMenu(i, select) {
  closeMenus();
  hideMenus();   // the right-click menus
  menuBar.top = i;
  const button = menuBar.el.children[i];
  button.classList.add('mm-on');
  const r = button.getBoundingClientRect();
  // A menu filled when it opens (Projects): a function giving its items.
  const items = typeof MENUS[i][1] === 'function' ? await MENUS[i][1]() : MENUS[i][1];
  if (menuBar.top !== i || menuBar.levels.length) return;   // closed or moved on meanwhile
  openMenuLevel(items, r.left, r.bottom + 2, select);
}

// Builds one menu (a dropdown or a submenu) at x, y and makes it the deepest open level. A submenu that does not fit
// right of x opens left of leftX instead (its parent's left edge), so it never covers its parent.
async function openMenuLevel(items, x, y, select, above, leftX) {
  const el = document.createElement('div');
  el.className = 'mm-menu mm-dropdown';
  const level = { el, items: [], index: -1 };
  menuBar.levels.push(level);
  const icons = items.some(i => i?.icon);   // a menu with icons (Format): every item gets the place of one
  for (const item of items) {
    if (item === '-') { el.append(document.createElement('hr')); continue; }
    if (item?.header) {   // a group's name: not an item (the arrows and letters pass it)
      const h = document.createElement('div');
      h.className = 'mm-menu-header';
      h.textContent = item.header;
      el.append(h);
      continue;
    }
    const button = document.createElement('button');
    button.tabIndex = -1;
    const it = Array.isArray(item) ? { label: item[0], action: item[1], params: item.slice(2) } : item;
    const isSub = !!(it.sub || it.fill), params = it.params ?? [];
    const { html, letter } = menuLabel(it.label, it.plain);
    // An item of another language (the Format menu's submenu of the cursor line's language) works as its bar button.
    const available = () => it.language ? !!editorPane() : actionAvailable(it.action, params);
    // A submenu: greyed out when its own enabled() says so (File > Copy name on a draft never saved).
    const enabled = isSub ? (typeof it.enabled === 'function' ? !!it.enabled() : it.enabled !== false) : it.enabled !== false && (!it.action || available());
    // Or the item's own: a value, or a function asked again after an item that keeps the menu open (keep).
    const checked = typeof it.checked === 'function' ? it.checked() : it.checked ?? (it.action && appActions.get(it.action)?.checked?.(params));
    // The check mark and the arrow are drawn by the style sheet (mm-checked, mm-arrow).
    button.innerHTML = `<span class="mm-mark"></span>` + (icons ? `<span class="mm-icon">${it.icon ?? ''}</span>` : '') + `<span class="mm-label">${html}</span>` +
      (isSub ? '<span class="mm-arrow"></span>' : `<span class="mm-key">${escapeHtml(it.key ?? (it.action ? keyText(it.action, ...params) : ''))}</span>`);
    button.classList.toggle('mm-checked', !!checked);
    if (it.title) button.title = it.title;
    if (it.font) button.querySelector('.mm-key').style.fontFamily = `"${it.font.replace(/["\\]/g, '')}"`;
    button.disabled = !enabled;
    if (it.cls) button.classList.add(it.cls);
    const entry = { item: it, button, letter, enabled, isSub };
    level.items.push(entry);
    button.addEventListener('mousedown', e => e.preventDefault());
    // The pointer moving over it, not mouseenter: the page keeps the pointer's last place over a menu, so a menu opened
    // elsewhere would get the item now at that place (and :hover marks nothing in a menu, app.css).
    button.addEventListener('mousemove', () => { const i = level.items.indexOf(entry); if (level.index !== i) selectMenuItem(level, i, true); });
    button.addEventListener('click', () => chooseMenuItem(level, level.items.indexOf(entry)));
    el.append(button);
  }
  if (!level.items.length) {
    const none = document.createElement('button');
    none.disabled = true;
    none.textContent = '(none)';
    el.append(none);
  }
  document.body.append(el);
  const left = leftX !== undefined && x + el.offsetWidth > innerWidth - 4 ? leftX - el.offsetWidth + 2 : x;
  el.style.left = Math.max(4, Math.min(left, innerWidth - el.offsetWidth - 4)) + 'px';
  el.style.top = Math.max(4, Math.min(above ? y - el.offsetHeight - 2 : y, innerHeight - el.offsetHeight - 4)) + 'px';
  if (select) selectMenuItem(level, level.items.findIndex(e => e.enabled), false);
}

function selectMenuItem(level, index, byMouse) {
  // Hovering an item closes the submenus of its siblings; on a submenu item it opens its submenu.
  while (menuBar.levels.at(-1) !== level && menuBar.levels.length) menuBar.levels.pop().el.remove();
  level.items[level.index]?.button.classList.remove('mm-sel');
  level.index = index;
  const entry = level.items[index];
  if (!entry) return;
  entry.button.classList.add('mm-sel');
  if (byMouse && entry.isSub && entry.enabled) openSubmenu(level, false);
}

async function openSubmenu(level, select) {
  const entry = level.items[level.index];
  const items = entry.item.sub ?? await entry.item.fill();
  if (menuBar.levels.at(-1) !== level || level.items[level.index] !== entry) return;   // moved on meanwhile
  const r = entry.button.getBoundingClientRect();
  openMenuLevel(items, r.right - 2, r.top - 5, select, false, level.el.getBoundingClientRect().left);
}

function chooseMenuItem(level, index) {
  const entry = level.items[index];
  if (!entry?.enabled) return;
  if (entry.isSub) {
    selectMenuItem(level, index, false);
    return openSubmenu(level, true);
  }
  // keep: a setting in the menu (the ruler's colours): it runs, the menu stays and its check marks follow.
  if (entry.item.keep) {
    entry.item.run();
    for (const e of level.items) if (typeof e.item.checked === 'function') e.button.classList.toggle('mm-checked', !!e.item.checked());
    return;
  }
  const context = menuBar.fromContext;   // a submenu of a right-click menu (app.js, copyNameFlyout): that one closes too
  closeMenus();
  if (context) hideMenus();
  if (entry.item.run) entry.item.run();
  else runAction(entry.item.action, entry.item.params, { from: 'menu', language: entry.item.language });
}

function closeMenus() {
  for (const level of menuBar.levels) level.el.remove();
  menuBar.levels = [];
  menuBar.fromContext = false;
  if (menuBar.top >= 0) menuBar.el.children[menuBar.top]?.classList.remove('mm-on');
  menuBar.top = -1;
  if (typeof rbShowMenus === 'function') rbShowMenus(false);   // the ribbon only: its tab names back in the menus' place
  // A right-click menu's (openContextMenu): the focus back where it was, unless it went elsewhere meanwhile.
  const from = menuBar.focusFrom;
  menuBar.focusFrom = null;
  if (from && document.activeElement === document.body) from.focus?.({ preventScroll: true });
}

// Keys: Alt+letter opens a menu; in an open menu the menu takes every key (before keys.js and the editor).
addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (!menuBar.levels.length) {
    if (!e.altKey || e.ctrlKey || e.shiftKey || !/^Key[A-Z]$/.test(e.code)) return;
    // The ribbon only, its key tips for Alt: the ribbon's (ribbon.js); its menus for Alt: shown first.
    if (typeof rbMode === 'function' && rbMode() === 'ribbon') {
      if ((setting('altOpens') || 'tips') === 'tips') return;
      rbShowMenus(true);
    }
    const i = MENUS.findIndex(([title]) => menuLabel(title).letter === e.code[3].toLowerCase());
    if (i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    return openTopMenu(i, true);
  }
  if (['Control', 'Shift', 'Alt'].includes(e.key)) return;
  e.preventDefault();
  e.stopPropagation();
  const level = menuBar.levels.at(-1), move = dir => {
    let i = level.index;
    for (let n = 0; n < level.items.length; n++) {
      i = (i + dir + level.items.length) % level.items.length;
      if (level.items[i].enabled) return selectMenuItem(level, i, false);
    }
  };
  switch (e.key) {
    case 'ArrowDown': return move(1);
    case 'ArrowUp': return move(-1);
    case 'ArrowRight':
      if (level?.items[level.index]?.isSub && level.items[level.index].enabled) return openSubmenu(level, true);
      return menuBar.top >= 0 && openTopMenu((menuBar.top + 1) % MENUS.length, true);
    case 'ArrowLeft':
      if (menuBar.levels.length > 1) return menuBar.levels.pop().el.remove();
      if (menuBar.fromContext) return closeMenus();   // back to its right-click menu
      return menuBar.top >= 0 && openTopMenu((menuBar.top - 1 + MENUS.length) % MENUS.length, true);
    case 'Enter': return chooseMenuItem(level, level.index);
    case 'Escape':
      if (menuBar.levels.length > 1) return menuBar.levels.pop().el.remove();
      return closeMenus();
  }
  const letter = /^Key[A-Z]$|^Digit\d$/.test(e.code) ? e.code.at(-1).toLowerCase() : '';
  const at = letter ? level.items.findIndex(entry => entry.letter === letter && entry.enabled) : -1;
  if (at >= 0) chooseMenuItem(level, at);
}, true);

// A click outside the menus closes them.
addEventListener('mousedown', e => {
  if (menuBar.levels.length && !e.target.closest('.mm-dropdown, .mm-menubar')) closeMenus();
}, true);
addEventListener('blur', closeMenus);

// A menu of its own, not from the menu bar: above x, y (the bottom bar).
function openPopupMenu(items, x, y, select = true) {
  closeMenus();
  hideMenus();
  openMenuLevel(items, x, y, select, true);
}

// A right-click menu (a dock tab's, the gutter's, the outline's, ...), as openPopupMenu, but no item marked as it opens
// and it takes the focus, out of a pane's frame too, so the keys go to it; the focus back where it was after. The
// focus gone elsewhere (another pane, docked or floating; another program) closes it, the focus staying there.
function openContextMenu(items, x, y) {
  openPopupMenu(items, x, y, false);
  const el = menuBar.levels[0]?.el;
  if (!el) return;
  menuBar.focusFrom = document.activeElement;
  el.tabIndex = -1;
  el.focus({ preventScroll: true });
  el.addEventListener('focusout', () => setTimeout(() => {
    if (menuBar.levels[0]?.el !== el || document.hasFocus() && el.contains(document.activeElement)) return;
    menuBar.focusFrom = null;
    closeMenus();
  }));
}

// A menu of its own below an element (a bar's Convert button).
function openMenuBelow(items, el) {
  closeMenus();
  hideMenus();
  const r = el.getBoundingClientRect();
  openMenuLevel(items, r.left, r.bottom + 2, false);
}

// ---------- The Format and Convert menus (docs/plans/executed/PLAN-formatters.md 3.6) ----------
// Format: the comment group (every language), then the bar items of the file's language in the bar's order, with
// their icons (Convert left out: it has a menu of its own). Convert: the conversions. On a line of another language
// (a block, a fence, lines you set) each menu gets a submenu named after that language with its items, acting in
// that language; a submenu without items is left out. One list with the bar (barItems, format.js), so a change to
// a bar shows here.
const COMMENT_ITEMS = [['Toggle &comment', 'toggleComment'], ['Toggle block comm&ent', 'blockComment'], ['Remove block co&mment', 'removeBlockComment']];

async function formatMenuItems() {
  await loadEditor();   // the bars are in format.js
  const doc = activeDoc(), lang = languageOf(doc) ?? 'plaintext';
  const icon = { toggleComment: 'comment', blockComment: 'blockcomment' };   // as on the bars
  const items = [...COMMENT_ITEMS.map(([label, action]) => ({ label, action, icon: packs.plaintext?.icons?.[icon[action]] })), '-', ...barMenuItems(lang, null)];
  // Convert (no menu of its own: docs/plans/executed/PLAN-menu-structure.md) and the file's language, after the language's own.
  return [...withInner(lang, items, inner => barMenuItems(inner, inner)), '-', { label: 'Con&vert', fill: () => convertMenuItems() },
    ['Lan&guage...', 'chooseLanguage']];
}

async function convertMenuItems() {
  await loadEditor();
  const lang = languageOf(activeDoc()) ?? 'plaintext';
  const items = withInner(lang, convertItems(lang, null), inner => convertItems(inner, inner));
  // The file's line ends (as the bottom bar's CRLF / LF): the file, whatever the language of a line.
  return [...items, '-', { label: 'Line &ends', sub: withLetters([['CRLF (Windows)', 'crlf'], ['LF (Unix, macOS)', 'lf'], ['CR (old Mac)', 'cr']]
    .map(([label, kind]) => ({ label, action: 'lineEnd.set', params: [kind] }))) }];
}

// The menu's items, and on a line of another language a submenu with that language's items (when it has any).
function withInner(lang, items, innerItems) {
  const pane = panes[state.activePane], cm = pane.cm && pane.active && pane.el.dataset.mode !== 'preview' ? pane.cm : null;
  const inner = cm && lineLanguage(cm, cm.getCursor().line);
  if (inner && inner !== lang && packs[inner]) {
    const sub = tidyLines(innerItems(inner));
    if (sub.some(it => it !== '-')) items.push('-', { label: packs[inner].name, sub: withLetters(sub) });
  }
  return withLetters(tidyLines(items));
}

// The conversions of a language: plain text's (every language has them), then the pack's own conversion actions.
// `language`: they act in that language (its indent size, the whitespace it keeps at line ends).
function convertItems(lang, language) {
  const own = CONVERT_ITEMS.filter(it => it !== '-').map(([, action]) => action);
  const extra = Object.entries(packs[lang]?.actions ?? {}).filter(([name, def]) => def.convert && !own.includes(name))
    .map(([name, def]) => ({ label: def.title ?? name, action: name, params: [], language }));
  const items = CONVERT_ITEMS.map(it => it === '-' ? it : { label: it[0], action: it[1], params: [], language });
  return extra.length ? [...items, '-', ...extra] : items;
}

// The menu items of a language's bar: the comment group left out (it comes first already), Convert too (the
// Convert menu), markdown's Heading and Table as submenus. `language`: the items act in that language.
function barMenuItems(lang, language) {
  return barItems(lang).flatMap(item => {
    if (item === '-') return ['-'];
    if (COMMENT_COMMANDS.includes(item.action)) return [];
    const icon = itemIcon(lang, item);
    if (item.menu === 'heading') return [{ label: '&Heading', icon, sub: HEADING_ITEMS() }];
    if (item.menu === 'table') return [{ label: 'T&able', icon, sub: TABLE_ITEMS() }];
    if (item.action === 'convert') return [];
    const title = titleIn(lang, item.action).replace(/&/g, '');
    if (item.action === 'format') return [{ label: '&' + title, action: 'format', icon, language }];
    return [{ label: title, action: item.action, params: item.params ?? [], icon, language, letter: item.letter }];
  });
}

// No line at the start or end of a menu, nor two in a row.
const tidyLines = items => items.filter((it, i, all) => it !== '-' || i > 0 && i < all.length - 1 && all[i + 1] !== '-');

// Letters (&) for the items without one: the one the bar gives (`letter:` in bar.yaml) first, else the first letter
// of the title that no other item of the menu has yet.
function withLetters(items) {
  const taken = new Set(items.filter(i => i !== '-').map(i => menuLabel(Array.isArray(i) ? i[0] : i.label).letter).filter(Boolean));
  const mark = (it, at) => ({ ...it, label: it.label.slice(0, at) + '&' + it.label.slice(at) });
  const out = items.map(it => {
    if (it === '-' || Array.isArray(it) || it.label.includes('&') || !it.letter) return it;
    const want = String(it.letter).toLowerCase(), at = it.label.toLowerCase().indexOf(want);
    if (!want || taken.has(want)) return it;
    taken.add(want);
    return at >= 0 ? mark(it, at) : { ...it, label: `${it.label} (&${want.toUpperCase()})` };
  });
  return out.map(it => {
    if (it === '-' || Array.isArray(it) || it.label.includes('&')) return it;
    const at = [...it.label].findIndex(c => /[a-z0-9]/i.test(c) && !taken.has(c.toLowerCase()));
    if (at < 0) return it;
    taken.add(it.label[at].toLowerCase());
    return mark(it, at);
  });
}

// A menu at the cursor (Ctrl+Alt+C: the conversions).
function openPopupAtCursor(pane, items) {
  const at = pane.cm.cursorCoords(null, 'window');
  closeMenus();
  hideMenus();
  openMenuLevel(items, at.left, at.bottom + 2, true);
}

// ---------- Clipboards (Edit menu, the bottom bar, Ctrl+Shift+C) ----------
async function clipboardItems() {
  Object.assign(clips, await host('clipState'));
  return Array.from({ length: 10 }, (_, n) => ({
    label: n === 0 ? '&Windows clipboard' : `Clipboard &${n}`, action: 'clipboardSelect', params: [n],
    key: (clips.columns?.[n] ? '[block] ' : '') + (clips.previews[n] || '(empty)'), title: keyText('clipboardSelect', n), checked: clips.active === n,
  }));
}

async function showClipboardList() {
  const r = statusUi.clip.getBoundingClientRect();
  openPopupMenu([...await clipboardItems(), '-', ['&Manage clipboards...', 'clipboards.pane']], r.left, r.top);   // as the ribbon's drop-down
}

// ---------- Fonts (F1: the font settings without a value) ----------
// The installed fonts (fontlist.js), each with a sample in its own font (the name stays readable for symbol
// fonts). The editor lists the monospaced fonts first and the others under "Other fonts"; the app the other
// way round.
async function fontItems(setting) {
  const installedFonts = await usableFonts();
  const item = ({ name }) => ({ label: name, plain: true, font: name, key: 'AaBb 0O 1lI', action: setting, params: [name] });
  const editor = setting === 'editorFont';
  const first = installedFonts.filter(f => f.mono === editor), rest = installedFonts.filter(f => f.mono !== editor);
  return [{ label: '&Default', action: setting, params: [''], key: editor ? 'Consolas' : 'Segoe UI' }, '-',
    ...first.map(item), '-', { label: editor ? '&Other fonts (not monospaced)' : '&Monospaced fonts', fill: () => rest.map(item) }];
}

function sizeItems(setting) {
  const normal = setting === 'statusSize' ? 'as the app' : ptOf(setting === 'editorSize' ? EDITOR_PX : APP_PX) + ' pt';
  return [{ label: '&Default', action: setting, params: [0], key: normal }, '-',
    ...FONT_SIZES.map(pt => ({ label: pt + ' pt', plain: true, action: setting, params: [pt] }))];
}

function lineItems() {
  return [{ label: '&Default', action: 'editorLine', params: [0], key: String(EDITOR_LINE) }, '-',
    ...LINE_HEIGHTS.map(n => ({ label: String(n), plain: true, action: 'editorLine', params: [n] }))];
}

// From F1 (the action without a font or size): the list on its own.
async function showFontList(setting) {
  openPopupMenu(await (setting === 'editorLine' ? lineItems() : setting.endsWith('Size') ? sizeItems(setting) : fontItems(setting)), innerWidth / 2 - 120, innerHeight - 40);
}

// ---------- Recently used and favourites (File menu) ----------
// The host keeps the lists, shared by all windows; an entry that is gone is dimmed, and clicking it
// takes it off the list.
async function recentItems(list) {
  const lists = await host('recent');
  const items = lists[list].map(({ path, exists }) => ({
    label: nameOf(path) || path, plain: true, key: dirOf(path),
    title: exists ? path : `${path}
No longer exists; click to remove it from the list`,
    cls: exists ? '' : 'mm-missing', run: () => openRecent(list, path, !exists),
  }));
  return items;
}

// The same lists as actions: on the ribbon a drop-down under the button (dropDownOnly: the action is its list; ribbon.js),
// from F1 or a key at the cursor.
async function showListHere(items) {
  const pane = panes[state.activePane], cm = pane?.active?.mode !== 'preview' ? pane?.cm : null;
  const at = cm ? cm.cursorCoords(null, 'window') : pane?.el.getBoundingClientRect();
  openPopupMenu(items, at?.left ?? 100, at?.bottom ?? 100);
}
const orNone = (items, none) => items.length ? items : [{ label: none, enabled: false }];
appAction('recent.list', { title: 'Recent', hint: 'The files or folders opened lately, or the tabs closed lately; a click opens one', group: 'files',
  variants: [['files'], ['folders'], ['closed']], variantTitles: { files: 'Recent files', folders: 'Recent folders', closed: 'Recently closed' },
  dropDownOnly: true, dropDown: async ([list = 'files']) => orNone(await recentItems(list), '(none yet)'),
  run: async ([list = 'files']) => showListHere(orNone(await recentItems(list), '(none yet)')) });
appAction('favourites.list', { title: 'Favourites', hint: 'Your favourite files or folders; a click opens one; also adding the current one and managing them', group: 'files',
  variants: [['files'], ['folders']], variantTitles: { files: 'Favourite files', folders: 'Favourite folders' },
  dropDownOnly: true, dropDown: ([kind = 'files']) => favouriteItems(kind),
  run: async ([kind = 'files']) => showListHere(await favouriteItems(kind)) });
