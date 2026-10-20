'use strict';
// Actions: what a key (keys.json), a menu item, a formatting bar button or F1 runs.
// App actions work the same in every file; they are defined here. Language actions (format, comments,
// sections) belong to the language of the file: languages\<name>\language.json, its `actions` part, with
// the action kinds command and jump (PLAN-language-packs.md adds linePrefix, wrap, insert). Loaded before app.js;
// the functions the actions call are in app.js and format.js.

const PASS = Symbol('pass');   // returned by an action that does not apply here: the key keeps its own meaning

// F1 shows the actions in these groups, in this order.
const ACTION_GROUPS = [
  ['files', 'Files'], ['tabs', 'Tabs and documents'], ['view', 'View'], ['edit', 'Edit and find'],
  ['clipboard', 'Clipboards'], ['bookmarks', 'Bookmarks'], ['format', 'Format'], ['settings', 'Settings'],
];

// ---------- App actions ----------
// { title, hint, group, run(params, ctx), editor: works on the editor, move: Shift selects,
//   variants: the parameter lists F1 offers: [[1], [2]], variantTitles: { "1": "..." },
//   checked(params): a tick in the menu, enabled(params): greyed out when false }
const appActions = new Map();
const appAction = (name, def) => appActions.set(name, { name, ...def });

// ---------- Language packs ----------
// The packs, the language of a document and its actions: languages.js. Plain text is the base: an action a
// language does not have itself is taken from plain text.

const isAction = name => appActions.has(name) || packActionNames().includes(name);
const isMove = name => !!appActions.get(name)?.move || !!langDef(activeDoc(), name)?.jump;

// The definition of an action for the active file: { title, hint, group, ... } or null.
function actionDef(name) {
  const app = appActions.get(name);
  if (app) return app;
  for (const pack of [packs[languageOf(activeDoc())], ...PACK_NAMES.map(n => packs[n])]) {
    const def = pack?.actions?.[name];
    if (def) return { name, group: 'format', ...def };
  }
  return null;
}

function actionTitle(name, params = []) {
  const def = actionDef(name);
  if (!def) return name;
  return def.variantTitles?.[params.join(' ')] ?? (params.length ? `${def.title} ${params.join(' ')}` : def.title);
}

// Can the action run on the active file? Language actions need the language to have them (and comments
// need comment markers); editor actions need an editor.
function actionAvailable(name, params = []) {
  const app = appActions.get(name);
  if (app) return app.enabled ? !!app.enabled(params) : !app.editor || !!editorPane();
  const doc = activeDoc(), def = langDef(doc, name);
  if (!def || !editorPane()) return false;
  if (COMMENT_COMMANDS.includes(def.command)) return !!commentMarkers(doc)[def.command === 'toggleComment' ? 'any' : 'block'];
  return true;
}

// The pane whose editor an action works on. From a key: the editor that has the focus. From a menu, the
// format bar or F1: the active pane's editor, which then gets the focus back.
function editorPane(ctx = {}) {
  if (ctx.from === 'key') return panes.find(p => p.cm?.hasFocus() && p.active && p.el.dataset.mode !== 'preview') ?? null;
  const pane = panes[state.activePane];
  if (!pane.cm || !pane.active || pane.el.dataset.mode === 'preview') return null;
  if (ctx.from) pane.cm.focus();
  return pane;
}

// A key typed in a text field outside the editor (find, replace, the search, ...): an editor action leaves it to
// the field, so Ctrl+V pastes there, Ctrl+C copies from it, Ctrl+Z undoes in it.
const inTextField = ctx => ctx.from === 'key' && !!document.activeElement?.matches('input, textarea, [contenteditable]:not([contenteditable=false])')
  && !document.activeElement.closest('.CodeMirror');

function runAction(name, params = [], ctx = {}) {
  const app = appActions.get(name);
  if (app) {
    if (app.editor) {
      const pane = editorPane(ctx);
      if (pane) return app.run(params, { ...ctx, pane });
      if (!inTextField(ctx)) return;
      return app.field ? app.field(document.activeElement) : PASS;
    }
    return app.run(params, ctx);
  }
  const pane = editorPane(ctx), def = pane && langDef(pane.active.doc, name);
  if (!def) return inTextField(ctx) ? PASS : undefined;   // no editor, or not in this language: nothing happens
  return runLanguage(pane, def, params, ctx);
}

function runLanguage(pane, def, params, ctx) {
  const cm = pane.cm;
  if (def.jump) return jumpTo(cm, def.jump, params[0] ?? 1, ctx.extend);
  if (cm.getOption('readOnly')) return toast('This tab is read-only.');
  if (def.command) return EDIT_COMMANDS[def.command]?.(cm, ...params);
  if (def.insert != null) return insertSnippet(cm, def.insert);
  if (Array.isArray(def.wrap)) return wrapSelection(cm, ...def.wrap);
  if (def.linePrefix != null) return toggleLinePrefix(cm, String(def.linePrefix));
}

// ---------- The app actions ----------
appAction('newFile', { title: 'New file', hint: 'A draft until it is saved', group: 'files', run: () => newFile() });
appAction('openFile', { title: 'Open file...', hint: 'One or more files, in tabs', group: 'files', run: () => commands.openFile() });
appAction('openFolder', { title: 'Open folder...', hint: 'In the folder pane', group: 'files', run: () => commands.openFolder() });
appAction('save', { title: 'Save', hint: 'The file of the active tab', group: 'files', run: () => commands.save() });
appAction('saveAs', { title: 'Save as...', hint: 'Under another name; an ANSI file becomes UTF-8', group: 'files', run: () => commands.saveAs() });
appAction('closeTab', { title: 'Close tab', hint: 'Asks about unsaved changes', group: 'files', run: () => commands.closeTab() });
appAction('reopenTab', { title: 'Reopen closed tab', hint: 'The last tab closed in this window', group: 'files', run: () => reopenTab() });
appAction('closeAllTabs', { title: 'Close all tabs', hint: 'Of the active pane; pinned tabs stay', group: 'files',
  run: () => closeTabs([...panes[state.activePane].tabs]) });
appAction('pinTab', { title: 'Pin tab', hint: 'Closing it asks first; closing several tabs leaves it open', group: 'tabs',
  enabled: () => !!activeTab(), checked: () => !!activeTab()?.pinned, run: () => activeTab() && togglePin(activeTab()) });
appAction('readOnly', { title: 'Read-only', hint: 'This tab cannot change the file', group: 'tabs',
  enabled: () => !!activeTab(), checked: () => !!activeTab()?.readOnly || !!activeDoc()?.diskReadOnly,
  run: () => activeTab() && setReadOnly(activeTab(), !activeTab().readOnly) });
appAction('closeWindow', { title: 'Close window', hint: 'Asks about unsaved changes', group: 'files', run: () => host('exit') });

appAction('nextDocument', { title: 'Next document', hint: 'Through the tabs of the window', group: 'tabs', run: () => nextDocument(1) });
appAction('previousDocument', { title: 'Previous document', hint: 'Through the tabs of the window', group: 'tabs', run: () => nextDocument(-1) });
appAction('back', { title: 'Back', hint: 'To the tab and file shown before, like a browser (also the mouse back button)', group: 'tabs', run: () => commands.back() });
appAction('forward', { title: 'Forward', hint: 'Again forward (also the mouse forward button)', group: 'tabs', run: () => commands.forward() });

appAction('togglePreview', { title: 'Show / hide the preview', hint: 'Next to the editor', group: 'view', run: () => togglePreview() });
appAction('editorSwitch', { title: 'Editor', hint: 'Show or hide the editor (at least one of editor and preview stays)', group: 'view',
  checked: () => !!activeTab() && activeTab().mode !== 'preview', enabled: () => !!activeTab(), run: () => setSwitch('editor') });
appAction('previewSwitch', { title: 'Preview', hint: 'Show or hide the preview (at least one of editor and preview stays)', group: 'view',
  checked: () => !!activeTab() && activeTab().mode !== 'edit', enabled: () => !!activeTab(), run: () => setSwitch('preview') });
appAction('outline', { title: 'Outline', hint: 'The headings (or procedures, classes, ...) at the right of each pane; click one to go there', group: 'view',
  enabled: () => hasOutline(activeDoc()),
  checked: () => document.body.hasAttribute('data-outline'), run: () => commands.outline() });
appAction('wrap', { title: 'Wrap long lines', hint: 'In the editor and in code in the preview', group: 'view',
  checked: () => setting('wrap'), run: () => setWrap(!setting('wrap')) });
appAction('sidebar', { title: 'Sidebar', hint: 'Show or hide the folder pane and the search', group: 'view',
  checked: () => document.body.dataset.sidebar === 'on', run: () => commands.sidebar() });
appAction('folders', { title: 'Folders', hint: 'The folder pane, with the keyboard in it', group: 'view', run: () => focusTree() });
appAction('searchView', { title: 'Search', hint: 'The search in the sidebar', group: 'view', run: () => startSearch() });
appAction('paneOrientation', { title: 'Panes', hint: 'Side by side or above each other', group: 'view',
  variants: [['v'], ['h']], variantTitles: { v: 'Panes side by side', h: 'Panes above each other' },
  checked: ([o]) => state.orient === o, run: ([o]) => state.orient === o || commands.orient() });
const paneAction = (name, title, run, enabled = () => bothShown()) =>
  appAction(name, { title, group: 'view', enabled, run: () => { menuPaneIndex = state.activePane; run(); } });
paneAction('paneHide', 'Hide this pane', () => commands.paneHide());
paneAction('paneHideOther', 'Hide other pane', () => commands.paneHideOther());
paneAction('paneClose', 'Close this pane', () => commands.paneClose());
paneAction('paneCloseOther', 'Close other pane', () => commands.paneCloseOther());
paneAction('paneShow', 'Show hidden pane', () => showHiddenPane(), () => state.hidden !== null);
appAction('tabBar', { title: 'Tab bar', hint: 'Tabs that do not fit: one row that scrolls, one row with a menu for the tabs out of view, or several rows', group: 'view',
  variants: [['scroll'], ['menu'], ['rows']],
  variantTitles: { scroll: 'Tab bar: one row that scrolls', menu: 'Tab bar: one row, a menu for the rest', rows: 'Tab bar: several rows' },
  checked: ([kind]) => setting('tabBar') === kind, run: ([kind]) => setSetting('tabBar', kind) });
appAction('formatBar', { title: 'Formatting bar', hint: 'The bar with bold, headings, lists, tables, ... above the editor', group: 'view',
  checked: () => setting('formatBar'), run: () => commands.formatBar() });
appAction('searchInFiles', { title: 'Search in files', hint: 'In the file, the open files or the folder; codes ^p ^t ^? ^# ^$ ^w ^^', group: 'view', run: () => startSearch() });
// In the editor (it has the focus) the zoom is the editor font size; elsewhere the preview zoom.
const editorFocused = () => panes.some(p => p.cm?.hasFocus());
appAction('zoomIn', { title: 'Zoom in', hint: 'The editor font size in the editor, else the preview (also Ctrl+mouse wheel)', group: 'view',
  run: () => editorFocused() ? editorSizeBy(1) : zoomBy(1) });
appAction('zoomOut', { title: 'Zoom out', hint: 'The editor font size in the editor, else the preview', group: 'view',
  run: () => editorFocused() ? editorSizeBy(-1) : zoomBy(-1) });
appAction('zoomReset', { title: 'Zoom 100%', hint: 'The editor font at its default size in the editor, else the preview at its normal size', group: 'view',
  run: () => editorFocused() ? setFontSetting('editorSize', 0) : setZoom(1) });
appAction('theme', { title: 'Day / night', hint: 'Light or dark, for all windows', group: 'view', run: () => commands.theme() });
appAction('compareScroll', { title: 'Scroll both panes together', hint: 'By source line', group: 'view',
  checked: () => state.sync, enabled: () => bothShown(), run: () => commands.sync() });
appAction('commands', { title: 'Keyboard shortcuts and commands', hint: 'This list; Enter runs the selected command', group: 'view', run: () => showPalette() });
appAction('about', { title: 'About LexPen', hint: 'Version and libraries', group: 'view', run: () => showAbout() });

appAction('find', { title: 'Find', hint: 'In this pane: the editor or the preview (the selection is filled in)', group: 'edit', run: () => findKey('open') });
appAction('findNext', { title: 'Find next', hint: 'With an empty or hidden find bar: show it', group: 'edit', run: () => findKey('next') });
appAction('findPrevious', { title: 'Find previous', hint: 'The match before', group: 'edit', run: () => findKey('prev') });
appAction('replace', { title: 'Replace', hint: 'Find and replace, in the editor', group: 'edit', run: () => findKey('replace') });
// ---------- Clipboards ----------
// 0 is the Windows clipboard, 1 to 9 are LexPen's own (ClipboardStore.cs, shared by all windows). Copy, cut
// and paste work on the active one. With the Windows clipboard, a key is left to the editor, the preview or
// the input it is pressed in (they copy and paste themselves); the menu goes through the host, which reads
// and writes the clipboard without the page having to ask for permission. A find box or the search
// always uses the Windows clipboard.
const clips = { active: 0, previews: Array(10).fill('') };
const inInput = () => !!document.activeElement?.matches('input, textarea, select') && !document.activeElement.closest('.CodeMirror');
const focusedEditor = () => panes.find(p => p.cm?.hasFocus() && p.active && p.el.dataset.mode !== 'preview') ?? null;

// What to copy: the editor's selection (nothing selected: the cursor's line, as the editor does), else the
// selection in the preview.
function textToCopy(pane) {
  if (!pane) return getSelection().toString();
  const cm = pane.cm;
  return cm.getSelection() || cm.getLine(cm.getCursor().line) + '\n';
}

function putOnClipboard(text) {
  if (!text) return;
  if (clips.active === 0) host('clipboardSetText', { text });
  else host('clipSet', { n: clips.active, text });
}

appAction('copy', { title: 'Copy', hint: 'To the active clipboard', group: 'edit', run: (_, ctx) => {
  if (ctx.from === 'key' && (clips.active === 0 || inInput())) return PASS;
  putOnClipboard(textToCopy(ctx.from === 'key' ? focusedEditor() : editorPane(ctx)));
} });
appAction('cut', { title: 'Cut', hint: 'To the active clipboard', group: 'edit', editor: true, run: (_, ctx) => {
  if (ctx.from === 'key' && clips.active === 0) return PASS;
  const cm = ctx.pane.cm;
  if (cm.getOption('readOnly')) return;
  putOnClipboard(textToCopy(ctx.pane));
  if (cm.somethingSelected()) cm.replaceSelection('');
  else {
    const line = cm.getCursor().line;
    cm.replaceRange('', CodeMirror.Pos(line, 0), line < cm.lastLine() ? CodeMirror.Pos(line + 1, 0) : CodeMirror.Pos(line));
  }
} });
// Not async: the key handler must see PASS itself, not a promise of it.
appAction('paste', { title: 'Paste', hint: 'From the active clipboard', group: 'edit', editor: true, run: (_, ctx) => {
  if (ctx.from === 'key' && clips.active === 0) return PASS;
  return (async () => {
    const text = clips.active === 0 ? await host('clipboardText') : await host('clipGet', { n: clips.active });
    if (text && !ctx.pane.cm.getOption('readOnly')) ctx.pane.cm.replaceSelection(text);
  })();
},
  // In a text field (find, the search, ...): the Windows clipboard by the field's own paste, another one inserted
  // here (one line: a field has no line breaks), with the field's undo and input event.
  field: el => {
    if (clips.active === 0) return PASS;
    host('clipGet', { n: clips.active }).then(text => {
      if (!text || document.activeElement !== el) return;
      document.execCommand('insertText', false, String(text).replace(/\r?\n/g, ' '));
    });
  } });
appAction('clipboardSelect', { title: 'Clipboard', hint: 'Copy, cut and paste work on it until another one is chosen', group: 'clipboard',
  variants: Array.from({ length: 10 }, (_, n) => [n]),
  variantTitles: Object.fromEntries(Array.from({ length: 10 }, (_, n) => [n, n === 0 ? 'Windows clipboard' : 'Clipboard ' + n])),
  checked: ([n]) => clips.active === n, run: ([n]) => host('clipSelect', { n }) });
appAction('clipboardList', { title: 'Clipboards', hint: 'The list of clipboards with the start of their text; choose one', group: 'clipboard',
  run: () => showClipboardList() });
appAction('pasteImage', { title: 'Paste image', hint: 'A picture or image files on the Windows clipboard; asks how to link them', group: 'edit',
  editor: true, enabled: () => !!editorPane() && !activeDoc()?.language, run: async (_, { pane }) => {
    const found = await host('clipboardImage');
    if (!found.paths?.length && !found.png) return toast('No picture or image file on the Windows clipboard.');
    await insertImages(pane, [], found.paths || [], true, found.png);
  } });
appAction('undo', { title: 'Undo', group: 'edit', editor: true, run: (_, { pane }) => pane.cm.undo() });
appAction('redo', { title: 'Redo', group: 'edit', editor: true, run: (_, { pane }) => pane.cm.redo() });
appAction('overwrite', { title: 'Insert / overwrite', hint: 'Typing replaces the character at the cursor (OVR in the bottom bar)', group: 'edit', editor: true,
  run: (_, { pane }) => { pane.cm.toggleOverwrite(); updateStatus(); } });

// ---------- Settings (Options > Settings: the settings window) ----------
appAction('settings', { title: 'Settings...', hint: 'Every setting, searchable; a change applies at once in every window', group: 'settings',
  run: () => host('openSettings') });
appAction('chooseLanguage', { title: 'Language...', hint: 'Of the active tab: colouring, outline, bar and actions (also a click on the language in the bottom bar)', group: 'view',
  enabled: () => !!activeDoc(), run: () => showLanguageList() });
appAction('tabOrder', { title: 'Ctrl+Tab order', hint: 'Recently used, or the order of the tab bar', group: 'settings',
  variants: [['recent'], ['tabs']], variantTitles: { recent: 'Ctrl+Tab in recently used order', tabs: 'Ctrl+Tab in tab bar order' },
  checked: ([order]) => setting('tabOrder') === order, run: ([order]) => setSetting('tabOrder', order) });
appAction('backup', { title: 'Keep a backup when saving', hint: 'The old file becomes name.bak (overwritten at the next save)', group: 'settings',
  checked: () => setting('backup'), run: () => setSetting('backup', !setting('backup')) });
appAction('findWrap', { title: 'Find: at the end of the file', hint: 'Stop with a message, go on from the top, or go on and stop where the search started', group: 'settings',
  variants: [['end'], ['around'], ['origin']],
  variantTitles: { end: 'Find: stop at the end', around: 'Find: go on from the top', origin: 'Find: go on, stop where the search started' },
  checked: ([mode]) => setting('findWrap') === mode, run: ([mode]) => setSetting('findWrap', mode) });
appAction('findShared', { title: 'One search for both panes', hint: 'Off: each pane has its own find', group: 'settings',
  checked: () => setting('findShared'), run: () => commands.findShared() });
appAction('lineBreaks', { title: 'Single line break starts a new line', hint: 'Off: a single line break joins the lines, as in GitHub files', group: 'settings',
  checked: () => setting('lineBreaks'), run: () => commands.lineBreaks() });
appAction('movePinned', { title: 'Move pinned tabs when closing a pane or window', hint: 'To the main pane / the primary window; off, they keep the pane open or close with the window', group: 'settings',
  checked: () => setting('movePinned'), run: () => setSetting('movePinned', !setting('movePinned')) });
// Fonts: with a font name or a size in points (''/0: the default); without one (F1) the list opens.
for (const [name, title, hint] of [
  ['editorFont', 'Editor font', 'Monospaced fonts first'], ['editorSize', 'Editor font size', 'In points; also Ctrl+mouse wheel in the editor'],
  ['editorLine', 'Editor line height', 'Times the font size'],
  ['appFont', 'App font', 'Menus, tabs, panes, bars and dialogs'], ['appSize', 'App font size', 'In points'],
  ['statusFont', 'Bottom bar font', 'Line and column, encoding, language, ...; default: the app font'],
  ['statusSize', 'Bottom bar font size', 'In points; default: as the app\'s small texts'],
]) {
  appAction(name, { title, hint, group: 'settings',
    checked: ([value]) => value !== undefined && fontSetting(name) === value,
    run: ([value]) => value === undefined ? showFontList(name) : setFontSetting(name, value) });
}

// The rows of the settings window (settings.html), in its groups and order: the setting's name in
// settings.json, its kind (toggle, choice, font, size) and, for a choice, its options. Title and hint come
// from the action of the same name where there is one. Sent to the host at start (settingDefs).
const SETTING_GROUPS = ['General', 'Editor', 'Preview', 'Files', 'Tabs', 'Find', 'App', 'Keys'];
const SETTING_ROWS = [
  { name: 'followWindows', group: 'General', sub: 'Theme', kind: 'toggle', title: 'Follow Windows',
    hint: 'Light or dark as Windows is (Settings > Personalization > Colors), at once; Day / night switches until Windows changes' },
  { name: 'themeLight', group: 'General', sub: 'Theme', kind: 'choice', title: 'Theme for light mode',
    hint: 'Your own themes: themes\\ in the data folder', options: () => themeOptions() },
  { name: 'themeDark', group: 'General', sub: 'Theme', kind: 'choice', title: 'Theme for dark mode',
    hint: 'A theme with a light base works too', options: () => themeOptions() },
  { name: 'theme', group: 'General', sub: 'Theme', kind: 'choice', title: 'Day / night when not following Windows',
    hint: 'Also the Day / night button', options: () => [['light', 'Day (light mode)'], ['dark', 'Night (dark mode)']] },
  { name: 'editorFont', group: 'Editor', kind: 'font' },
  { name: 'editorSize', group: 'Editor', kind: 'size', base: () => ptOf(EDITOR_PX) + ' pt' },
  { name: 'editorLine', group: 'Editor', kind: 'choice',
    options: () => [[0, `Default (${EDITOR_LINE})`], ...LINE_HEIGHTS.map(n => [n, String(n)])] },
  { name: 'wrap', group: 'Editor', kind: 'toggle' },
  { name: 'formatBar', group: 'Editor', kind: 'toggle' },
  { name: 'showWhitespace', group: 'Editor', kind: 'toggle', title: 'Show spaces and tabs',
    hint: 'In the editor: a space as a small dot, a tab as an arrow (theme colour: whitespace)' },
  { name: 'showLineEnds', group: 'Editor', kind: 'toggle', title: 'Show line ends',
    hint: 'In the editor: \u00B6 at the end of a line for CRLF, \u240A for LF (theme colour: whitespace)' },
  { name: 'lineNumbers', group: 'Editor', sub: 'Gutter', kind: 'choice',
    options: () => [['none', 'None'], ['tens', 'Every 10 (a dash at 5, a dot on the others)'], ['all', 'Every line']] },
  { name: 'lineNumberCount', group: 'Editor', sub: 'Gutter', kind: 'choice',
    options: () => [['absolute', 'Absolute'], ['relative', 'Relative to the cursor']] },
  ...[['bookmarks', 'Bookmarks'], ['changes', 'Change markers'], ['git', 'Git markers'], ['folds', 'Fold markers']]
    .map(([n, title]) => ({ name: 'gutter.' + n, group: 'Editor', sub: 'Gutter', kind: 'toggle', title,
      hint: { bookmarks: 'Bookmarks 1 to 9 and unnumbered ones', changes: 'Lines changed since the last save',
        git: 'Lines changed since the last commit (click: the old text)', folds: 'Fold headings, code blocks and braces' }[n] })),
  { name: 'lineBreaks', group: 'Preview', kind: 'toggle' },
  { name: 'previewThemeLight', group: 'Preview', kind: 'choice', title: 'Theme for the preview in light mode',
    hint: 'Same as the app, or a theme of its own', options: () => [['', 'Same as the app'], ...themeOptions()] },
  { name: 'previewThemeDark', group: 'Preview', kind: 'choice', title: 'Theme for the preview in dark mode',
    hint: 'Same as the app, or a theme of its own (as a light preview next to a dark editor)',
    options: () => [['', 'Same as the app'], ...themeOptions()] },
  { name: 'zoom', group: 'Preview', kind: 'choice', title: 'Preview zoom', hint: 'Also Ctrl+mouse wheel over a preview',
    options: () => Array.from({ length: 26 }, (_, i) => (5 + i) / 10).map(z => [z, Math.round(z * 100) + '%']) },
  { name: 'backup', group: 'Files', kind: 'toggle' },
  { name: 'tabOrder', group: 'Tabs', kind: 'choice', options: () => [['recent', 'Recently used'], ['tabs', 'Tab bar order']] },
  { name: 'tabBar', group: 'Tabs', kind: 'choice', title: 'Tab bar', hint: 'When the tabs do not fit in one row',
    options: () => [['scroll', 'One row that scrolls'], ['menu', 'One row, a menu for the tabs out of view'], ['rows', 'Several rows']] },
  { name: 'movePinned', group: 'Tabs', kind: 'toggle' },
  { name: 'findShared', group: 'Find', kind: 'toggle' },
  { name: 'findWrap', group: 'Find', kind: 'choice', title: 'Search: at the end of the file', hint: 'What find / search next (F3) does past the last match (Shift+F3: before the first)',
    options: () => [['end', 'Stop, with a message'], ['around', 'Go on from the top'], ['origin', 'Go on from the top, stop where the search started']] },
  { name: 'appFont', group: 'App', kind: 'font' },
  { name: 'appSize', group: 'App', kind: 'size', base: () => ptOf(APP_PX) + ' pt' },
  { name: 'statusFont', group: 'App', kind: 'font' },
  { name: 'statusSize', group: 'App', kind: 'size', base: () => 'as the app' },
  { name: 'keys', group: 'Keys', kind: 'keys', title: 'Keys', hint: 'Every action and its keys: F1. Your own keys go in your keys.json, on top of the defaults.' },
];

// The themes from the host (look.themes: Light and Dark first, then by name), with their base and marked when
// they are yours: "Lighter bluish (on Bluish, yours)".
const themeOptions = () => (look?.themes ?? []).map(t => {
  const on = t.base && `on ${look.themes.find(b => b.id === t.base)?.name ?? t.base}`;
  const notes = [on, t.mine && 'yours'].filter(Boolean).join(', ');
  return [t.id, notes ? `${t.name} (${notes})` : t.name];
});

// General > Open in: a row per language (its pack's "open" unless you choose).
const openInRows = () => PACK_NAMES.map(name => ({
  name: 'openIn.' + name, group: 'General', sub: 'Open in', kind: 'choice', title: packs[name].name, default: '',
  hint: (packs[name].extensions ?? []).join(' ') || 'Files you give this language',
  options: () => [['', `As the language says (${({ edit: 'the editor', split: 'editor and preview', preview: 'the preview' })[packs[name].open] ?? 'the editor'})`],
    ['edit', 'The editor'], ['split', 'Editor and preview'], ['preview', 'The preview']],
}));

function settingDefs() {
  const rows = [...SETTING_ROWS];
  rows.splice(rows.findIndex(r => r.group === 'General'), 0, ...openInRows());
  return rows.map(r => {
    const action = appActions.get(r.name);
    return {
      name: r.name, group: r.group, sub: r.sub ?? null, kind: r.kind, default: r.default,
      title: r.title ?? action?.title ?? r.name, hint: r.hint ?? action?.hint ?? '',
      options: r.options?.() ?? (r.kind === 'size' ? [[0, `Default (${r.base()})`], ...FONT_SIZES.map(pt => [pt, pt + ' pt'])] : null),
      monoFirst: r.name === 'editorFont',
    };
  });
}

// ---------- Bookmarks (bookmarks.js) ----------
const bookmarkNumbers = Array.from({ length: 9 }, (_, i) => [i + 1]);
appAction('bookmarkStore', { title: 'Store bookmark', hint: 'At the cursor; moves it there when it is elsewhere', group: 'bookmarks',
  editor: true, variants: bookmarkNumbers, run: ([n], { pane }) => storeBookmark(pane, n) });
appAction('bookmarkToggle', { title: 'Toggle bookmark', hint: 'On the cursor line: removed; else stored at the cursor', group: 'bookmarks',
  editor: true, variants: bookmarkNumbers, run: ([n], { pane }) => toggleBookmark(pane, n) });
appAction('bookmarkClear', { title: 'Clear bookmark', hint: 'Wherever it is in this file', group: 'bookmarks',
  editor: true, variants: bookmarkNumbers, run: ([n], { pane }) => clearBookmark(pane, n) });
appAction('bookmarkGo', { title: 'Go to bookmark', hint: 'Line and column; with Shift: select to it', group: 'bookmarks',
  editor: true, move: true, variants: bookmarkNumbers, run: ([n], { pane, extend }) => goToBookmark(pane, n, extend) });
appAction('bookmarkToggleFree', { title: 'Toggle unnumbered bookmark', hint: 'On the cursor line (also a click in the bookmark gutter)', group: 'bookmarks',
  editor: true, run: (_, { pane }) => toggleFreeBookmark(pane) });
appAction('bookmarkNext', { title: 'Bookmark', hint: 'Numbered or not; with Shift: select to it', group: 'bookmarks', editor: true, move: true,
  variants: [[1], [-1]], variantTitles: { 1: 'Next bookmark', '-1': 'Previous bookmark' }, run: ([dir], { pane, extend }) => nextBookmark(pane, dir, extend) });
appAction('bookmarkList', { title: 'Bookmarks of this file', hint: 'A list to choose from', group: 'bookmarks',
  editor: true, run: (_, { pane }) => showBookmarkList(pane) });

// ---------- The gutter (gutter.js): View > Gutter ----------
appAction('lineNumbers', { title: 'Line numbers', hint: 'None, every 10 (a dash at 5, a dot on the others) or every line', group: 'view',
  variants: [['none'], ['tens'], ['all']], variantTitles: { none: 'Line numbers: none', tens: 'Line numbers: every 10', all: 'Line numbers: every line' },
  checked: ([kind]) => setting('lineNumbers') === kind, run: ([kind]) => setSetting('lineNumbers', kind) });
appAction('lineNumberCount', { title: 'Line number count', hint: 'Absolute, or relative to the cursor line (that line shows its own number)', group: 'view',
  variants: [['absolute'], ['relative']], variantTitles: { absolute: 'Line numbers: absolute', relative: 'Line numbers: relative to the cursor' },
  checked: ([kind]) => setting('lineNumberCount') === kind, run: ([kind]) => setSetting('lineNumberCount', kind) });
appAction('gutterColumn', { title: 'Gutter', hint: 'Show or hide this column left of the text', group: 'view',
  variants: [['bookmarks'], ['changes'], ['git'], ['folds']],
  variantTitles: { bookmarks: 'Bookmark gutter', changes: 'Change markers (not saved)',
    git: 'Git markers (since the last commit)', folds: 'Fold markers' },
  checked: ([name]) => setting('gutter.' + name),
  run: ([name]) => setSetting('gutter.' + name, !setting('gutter.' + name)) });   // applySettings sets up the editors
