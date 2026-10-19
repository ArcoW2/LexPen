'use strict';
// The menu bar: File, Edit, Format, View, Options. Every item runs an action (actions.js), so its key
// comes from keys.json and the same thing can be done from a key, F1 or here. Alt+letter opens a menu;
// in an open menu the arrows move, Enter runs, Esc closes one level, a letter runs its item. The focus
// stays where it was (the editor), so an item works on the cursor and the selection there.
// Loaded before app.js.

// An item: [label with &letter, action, ...parameters], '-' (a line), { label, sub: [items] } or
// { label, fill: async () => items } (a submenu, filled when it opens), or { label, run, plain: true }
// (an entry of a recent list: a file, not an action). `font`: the key column (a sample) is shown in that font.
const MENUS = [
  ['&File', [
    ['&New file', 'newFile'], ['Open &file...', 'openFile'], ['&Open folder...', 'openFolder'], '-',
    { label: 'Fa&vourites', fill: () => recentItems('favourites') },
    { label: '&Recent files', fill: () => recentItems('files') },
    { label: 'Recent fold&ers', fill: () => recentItems('folders') },
    { label: 'Recently &closed', fill: () => recentItems('closed') }, '-',
    ['&Save', 'save'], ['Save &as...', 'saveAs'], '-',
    ['Close &tab', 'closeTab'], ['Close a&ll tabs', 'closeAllTabs'], ['Reopen closed ta&b', 'reopenTab'], ['Close &window', 'closeWindow'],
  ]],
  ['&Edit', [
    ['&Undo', 'undo'], ['&Redo', 'redo'], '-',
    ['Cu&t', 'cut'], ['&Copy', 'copy'], ['&Paste', 'paste'], ['Paste &image (asks how to link it)...', 'pasteImage'],
    { label: 'Select c&lipboard', fill: () => clipboardItems() }, '-',
    ['&Find', 'find'], ['R&eplace', 'replace'], ['&Search in files', 'searchInFiles'], '-',
    ['Next secti&on', 'section', 1], ['Pre&vious section', 'section', -1], '-',
    { label: '&Go to bookmark', fill: () => bookmarkItems('go') }, { label: 'Store &bookmark', fill: () => bookmarkItems('store') },
    ['&Next bookmark', 'bookmarkNext', 1], ['Previous boo&kmark', 'bookmarkNext', -1],
  ]],
  ['Fo&rmat', [
    ['Toggle &comment', 'toggleComment'], ['Toggle block comm&ent', 'blockComment'], ['Remove block co&mment', 'removeBlockComment'], '-',
    ['&Bold', 'bold'], ['&Italic', 'italic'], ['&Strikethrough', 'strikethrough'], ['Inline co&de', 'inlineCode'], '-',
    ['Insert &link', 'link'], ['Insert ima&ge from clipboard', 'imageFromClipboard'], ['Insert image from &file...', 'imageFromFile'], '-',
    { label: '&Heading', sub: [1, 2, 3, 4, 5, 6].map(n => [`Heading &${n}`, 'heading', n]) },
    ['Plain &paragraph', 'paragraph'], ['B&ulleted list', 'bulletList'], ['&Numbered list', 'numberList'],
    ['&Task list item', 'taskList'], ['&Quote', 'quote'], ['Code bloc&k', 'codeBlock'], ['Horizontal &rule', 'rule'],
    { label: 'T&able', sub: [['&Insert table', 'table', 3, 2], ['&Format table', 'tableFormat'], '-',
      ['Add &row', 'tableAddRow'], ['Add &column', 'tableAddColumn'], ['&Delete row', 'tableDeleteRow'], ['D&elete column', 'tableDeleteColumn']] },
  ]],
  ['&View', [
    ['&Editor', 'editorSwitch'], ['&Preview', 'previewSwitch'], ['&Outline', 'outline'], '-',
    ['S&idebar', 'sidebar'], ['&Folders', 'folders'], ['&Search', 'searchView'], '-',
    { label: 'P&anes', sub: [['Side &by side', 'paneOrientation', 'v'], ['&Above each other', 'paneOrientation', 'h'], '-',
      ['&Hide this pane', 'paneHide'], ['Hide &other pane', 'paneHideOther'], ['&Close this pane', 'paneClose'],
      ['C&lose other pane', 'paneCloseOther'], ['&Show hidden pane', 'paneShow']] },
    ['Scroll both panes &together', 'compareScroll'], '-',
    ['&Wrap long lines', 'wrap'], ['For&matting bar', 'formatBar'],
    { label: 'Tab ba&r', sub: [['One row that &scrolls', 'tabBar', 'scroll'], ['One row, a &menu for the rest', 'tabBar', 'menu'],
      ['Several &rows', 'tabBar', 'rows']] },
    { label: '&Gutter', sub: [{ label: '&Line numbers', sub: [['&None', 'lineNumbers', 'none'], ['Every &10', 'lineNumbers', 'tens'],
      ['&Every line', 'lineNumbers', 'all'], '-', ['&Absolute', 'lineNumberCount', 'absolute'],
      ['&Relative to the cursor', 'lineNumberCount', 'relative']] }, ['&Bookmarks', 'gutterColumn', 'bookmarks'],
      ['&Change markers (not saved)', 'gutterColumn', 'changes'], ['&Git markers (since the last commit)', 'gutterColumn', 'git'],
      ['&Fold markers', 'gutterColumn', 'folds']] }, '-',
    ['&Day / night', 'theme'],
    { label: '&Zoom', sub: [['Zoom &in', 'zoomIn'], ['Zoom &out', 'zoomOut'], ['&100%', 'zoomReset']] },
  ]],
  ['&Options', [
    ['&Settings...', 'settings'], '-',
    ['&Keyboard shortcuts and commands', 'commands'], ['&About LexPen', 'about'],
  ]],
];

const menuBar = {
  el: document.querySelector('.mm-menubar'),
  levels: [],    // the open menus, top first: { el, items, index (selected), button }
  top: -1,       // the open top menu
};

// "Save &as..." -> label "Save as..." with "a" as its letter.
function menuLabel(text, plain) {
  const at = plain ? -1 : text.indexOf('&');
  if (at < 0) return { html: escapeHtml(text), letter: '' };
  return { html: escapeHtml(text.slice(0, at)) + '<u>' + escapeHtml(text[at + 1]) + '</u>' + escapeHtml(text.slice(at + 2)),
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

function openTopMenu(i, select) {
  closeMenus();
  hideMenus();   // the right-click menus
  menuBar.top = i;
  const button = menuBar.el.children[i];
  button.classList.add('mm-on');
  const r = button.getBoundingClientRect();
  openMenuLevel(MENUS[i][1], r.left, r.bottom + 2, select);
}

// Builds one menu (a dropdown or a submenu) at x, y and makes it the deepest open level.
async function openMenuLevel(items, x, y, select, above) {
  const el = document.createElement('div');
  el.className = 'mm-menu mm-dropdown';
  const level = { el, items: [], index: -1 };
  menuBar.levels.push(level);
  for (const item of items) {
    if (item === '-') { el.append(document.createElement('hr')); continue; }
    const button = document.createElement('button');
    button.tabIndex = -1;
    const it = Array.isArray(item) ? { label: item[0], action: item[1], params: item.slice(2) } : item;
    const isSub = !!(it.sub || it.fill), params = it.params ?? [];
    const { html, letter } = menuLabel(it.label, it.plain);
    const enabled = isSub || it.enabled !== false && (!it.action || actionAvailable(it.action, params));
    const checked = it.action && appActions.get(it.action)?.checked?.(params);
    // The check mark and the arrow are drawn by the style sheet (mm-checked, mm-arrow).
    button.innerHTML = `<span class="mm-mark"></span><span class="mm-label">${html}</span>` +
      (isSub ? '<span class="mm-arrow"></span>' : `<span class="mm-key">${escapeHtml(it.key ?? (it.action ? keyText(it.action, ...params) : ''))}</span>`);
    button.classList.toggle('mm-checked', !!checked);
    if (it.title) button.title = it.title;
    if (it.font) button.querySelector('.mm-key').style.fontFamily = `"${it.font.replace(/["\\]/g, '')}"`;
    button.disabled = !enabled;
    if (it.cls) button.classList.add(it.cls);
    const entry = { item: it, button, letter, enabled, isSub };
    level.items.push(entry);
    button.addEventListener('mousedown', e => e.preventDefault());
    button.addEventListener('mouseenter', () => selectMenuItem(level, level.items.indexOf(entry), true));
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
  el.style.left = Math.max(4, Math.min(x, innerWidth - el.offsetWidth - 4)) + 'px';
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
  openMenuLevel(items, r.right - 2, r.top - 5, select);
}

function chooseMenuItem(level, index) {
  const entry = level.items[index];
  if (!entry?.enabled) return;
  if (entry.isSub) {
    selectMenuItem(level, index, false);
    return openSubmenu(level, true);
  }
  closeMenus();
  if (entry.item.run) entry.item.run();
  else runAction(entry.item.action, entry.item.params, { from: 'menu' });
}

function closeMenus() {
  for (const level of menuBar.levels) level.el.remove();
  menuBar.levels = [];
  if (menuBar.top >= 0) menuBar.el.children[menuBar.top]?.classList.remove('mm-on');
  menuBar.top = -1;
}

// Keys: Alt+letter opens a menu; in an open menu the menu takes every key (before keys.js and the editor).
addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (!menuBar.levels.length) {
    if (!e.altKey || e.ctrlKey || e.shiftKey || !/^Key[A-Z]$/.test(e.code)) return;
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
function openPopupMenu(items, x, y) {
  closeMenus();
  hideMenus();
  openMenuLevel(items, x, y, true, true);
}

// ---------- Clipboards (Edit menu, the bottom bar, Ctrl+Shift+C) ----------
async function clipboardItems() {
  Object.assign(clips, await host('clipState'));
  return Array.from({ length: 10 }, (_, n) => ({
    label: n === 0 ? '&Windows clipboard' : `Clipboard &${n}`, action: 'clipboardSelect', params: [n],
    key: clips.previews[n] || '(empty)', title: keyText('clipboardSelect', n),
  }));
}

async function showClipboardList() {
  const r = statusUi.clip.getBoundingClientRect();
  openPopupMenu(await clipboardItems(), r.left, r.top);
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
  favourites = lists.favourites.map(e => e.path);
  const items = lists[list].map(({ path, exists }) => ({
    label: nameOf(path) || path, plain: true, key: dirOf(path),
    title: exists ? path : `${path}
No longer exists; click to remove it from the list`,
    cls: exists ? '' : 'mm-missing', run: () => openRecent(list, path, !exists),
  }));
  if (list !== 'favourites') return items;
  const path = activeDoc()?.path;
  return [{ label: path && isFavourite(path) ? '&Remove current file' : '&Add current file', enabled: !!path,
    run: () => toggleFavourite(path) }, ...(items.length ? ['-'] : []), ...items];
}
