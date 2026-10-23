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

let lastAction = null;   // the last action run, for the stall log (app.js)

function runAction(name, params = [], ctx = {}) {
  lastAction = name;
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
  // ctx.language: an action of that language (the inner language's bar), else of the document's.
  const pane = editorPane(ctx), def = pane && (ctx.language && packs[ctx.language]
    ? packs[ctx.language].actions?.[name] ?? packs.plaintext?.actions?.[name] : langDef(pane.active.doc, name));
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
  if (def.convert) return runConvert(pane, String(def.convert));   // convert.js
  if (def.format) return runFormat(pane, String(def.format), ctx.language);
}

// ---------- The app actions ----------
appAction('newFile', { title: 'New file', hint: 'A draft until it is saved', group: 'files', run: () => newFile() });
appAction('openFile', { title: 'Open file...', hint: 'One or more files, in tabs', group: 'files', run: () => commands.openFile() });
appAction('openFolder', { title: 'Open folder...', hint: 'In the folder pane', group: 'files', run: () => commands.openFolder() });
appAction('save', { title: 'Save', hint: 'The file of the active tab', group: 'files', run: () => commands.save() });
appAction('saveAs', { title: 'Save as...', hint: 'Under another name; an ANSI file becomes UTF-8', group: 'files', run: () => commands.saveAs() });
appAction('revertToSaved', { title: 'Revert to saved', hint: 'The file as it is on disk; Ctrl+Z gives your changes back', group: 'files',
  enabled: () => canRevert(activeDoc()), run: () => revertDoc(activeDoc()) });
appAction('closeTab', { title: 'Close tab', hint: 'Asks about unsaved changes', group: 'files', run: () => commands.closeTab() });
appAction('reopenTab', { title: 'Reopen closed tab', hint: 'The last tab closed in this window', group: 'files', run: () => reopenTab() });
appAction('closeAllTabs', { title: 'Close all tabs', hint: 'Of the active pane; pinned tabs stay', group: 'files',
  run: () => closeTabs([...panes[state.activePane].tabs]) });
// An on/off action as three (plan 23): name.toggle (the menus' one, with its check mark) switches it; name.on and
// name.off (or .show / .hide; words) set it, and do nothing when it already is so. get: on or not; flip: switch it.
function toggleAction(name, def, get, flip, words = ['on', 'off']) {
  appAction(name + '.toggle', { ...def, checked: get, run: flip });
  for (const [word, on] of [[words[0], true], [words[1], false]])
    appAction(`${name}.${word}`, { ...def, title: `${def.title}: ${word}`, hint: `${def.hint} (${word}; nothing when it already is)`,
      run: (params, ctx) => { if (!!get(params, ctx) !== on) flip(params, ctx); } });
}

toggleAction('pin', { title: 'Pin tab', hint: 'Closing it asks first; closing several tabs leaves it open', group: 'tabs',
  enabled: () => !!activeTab() }, () => !!activeTab()?.pinned, () => activeTab() && togglePin(activeTab()));
toggleAction('readOnly', { title: 'Read-only', hint: 'This tab cannot change the file', group: 'tabs', enabled: () => !!activeTab() },
  () => !!activeTab()?.readOnly || !!activeDoc()?.diskReadOnly, () => activeTab() && setReadOnly(activeTab(), !activeTab().readOnly));
appAction('projects', { title: 'Projects...', hint: 'Every project and its windows: open one, a new project, rename, move this window', group: 'files',
  run: () => openProjectMenu() });
appAction('newProject', { title: 'New project...', hint: 'A new empty window in a new project', group: 'files',
  run: async () => { const name = await askName('New project', ''); if (name !== null) host('project', { kind: 'new', name }); } });
appAction('renameProject', { title: 'Rename this project...', hint: 'The name of this window\'s project', group: 'files', run: () => renameProject() });
appAction('moveWindowToProject', { title: 'Move this window to a project...', hint: 'Another project, or a new one', group: 'files',
  run: () => openProjectMenu('move') });
appAction('closeWindow', { title: 'Close window', hint: 'Asks about unsaved changes', group: 'files', run: () => host('exit') });

appAction('nextDocument', { title: 'Next document', hint: 'Through the tabs of the window', group: 'tabs', run: () => nextDocument(1) });
appAction('previousDocument', { title: 'Previous document', hint: 'Through the tabs of the window', group: 'tabs', run: () => nextDocument(-1) });
// While comparing, the key with a selection or with the cursor in a difference copies it across instead (compare.js).
appAction('nextTab', { title: 'Next tab', hint: 'The tab to the right in this pane, in tab bar order; comparing, with a selection or the cursor in a difference: the left side\'s lines over the right side\'s', group: 'tabs',
  run: (_, ctx) => (ctx.from === 'key' && comparing() && compareCopy(1)) || cycleTab(1) });
appAction('previousTab', { title: 'Previous tab', hint: 'The tab to the left in this pane, in tab bar order; comparing, with a selection or the cursor in a difference: the right side\'s lines over the left side\'s', group: 'tabs',
  run: (_, ctx) => (ctx.from === 'key' && comparing() && compareCopy(-1)) || cycleTab(-1) });

// ---------- The compare (compare.js) ----------
const comparing = () => typeof cmp !== 'undefined' && cmp.on;   // compare.js loads after this file
appAction('compareFiles', { title: 'Compare files...', hint: 'Two files side by side, the differences marked: pick the left one, then the right one', group: 'files',
  run: async () => {
    const [a] = await host('pickFile', { one: true }) ?? [];
    if (!a) return;
    const [b] = await host('pickFile', { one: true, at: a }) ?? [];
    if (b) startCompare({ path: a }, { path: b });
  } });
appAction('compareFolders', { title: 'Compare folders...', hint: 'Two folders in the folder pane, each file marked as equal, different or on one side only: pick the left one, then the right one', group: 'files',
  run: async () => {
    const a = await host('pickFolder', {});
    if (!a) return;
    const b = await host('pickFolder', { at: a });
    if (b) startFolderCompare(a, b);
  } });
appAction('compareNext', { title: 'Next difference', hint: 'Comparing: the next difference below the cursor, in both files', group: 'edit', enabled: comparing, run: () => compareGo(1) });
appAction('comparePrevious', { title: 'Previous difference', hint: 'Comparing: the previous difference above the cursor, in both files', group: 'edit', enabled: comparing, run: () => compareGo(-1) });
appAction('compareAlign', { title: 'Align the cursor lines', hint: 'Comparing: the left cursor line and the right cursor line are compared as each other\'s match, and what follows from there; on a tied pair: untied', group: 'edit', enabled: comparing, run: () => compareAlign() });
appAction('compareSwap', { title: 'Swap the compared files', hint: 'Comparing: left and right change places', group: 'view', enabled: comparing, run: () => compareSwap() });
appAction('compareClose', { title: 'Leave the compare', hint: 'The panes as they were before the compare', group: 'view', enabled: comparing, run: () => stopCompare() });
toggleAction('compareWhitespace', { title: 'Compare: ignore whitespace', hint: 'Spaces and tabs: their amount inside a line and all of them at the ends; an empty line against none', group: 'view' },
  () => !!setting('compareWhitespace'), () => setSetting('compareWhitespace', !setting('compareWhitespace')));
toggleAction('compareCase', { title: 'Compare: ignore case', hint: 'Upper and lower case count as the same', group: 'view' },
  () => !!setting('compareCase'), () => setSetting('compareCase', !setting('compareCase')));
toggleAction('compareStrip', { title: 'Compare: line strip', hint: 'Below the panes: the cursor line and its match, one above the other', group: 'view' },
  () => setting('compareStrip') !== false, () => setSetting('compareStrip', setting('compareStrip') === false), ['show', 'hide']);
appAction('back', { title: 'Back in the window', hint: 'To the tab and file shown before, like a browser (also Ctrl + the mouse back button)', group: 'tabs', run: () => commands.back() });
appAction('forward', { title: 'Forward in the window', hint: 'Again forward through the tabs and files (also Ctrl + the mouse forward button)', group: 'tabs', run: () => commands.forward() });
// The places the cursor jumped from in the document (places.js).
appAction('positionBack', { title: 'Position back', hint: 'The cursor back to where it was before its last jump in this document (go to line, a find, a bookmark, Ctrl+Home, a click far away); also the mouse back button', group: 'edit', run: () => stepPlace(-1) });
appAction('positionForward', { title: 'Position forward', hint: 'Again forward after Position back; also the mouse forward button', group: 'edit', run: () => stepPlace(1) });

toggleAction('split', { title: 'Editor and preview side by side', hint: 'The preview next to the editor, or the editor alone', group: 'view',
  enabled: () => !!activeTab() }, () => activeTab()?.mode === 'split', () => togglePreview());
toggleAction('editor', { title: 'Editor', hint: 'Show or hide the editor (at least one of editor and preview stays)', group: 'view',
  enabled: () => !!activeTab() }, () => !!activeTab() && activeTab().mode !== 'preview', () => setSwitch('editor'), ['show', 'hide']);
toggleAction('preview', { title: 'Preview', hint: 'Show or hide the preview (at least one of editor and preview stays)', group: 'view',
  enabled: () => !!activeTab() }, () => !!activeTab() && activeTab().mode !== 'edit', () => setSwitch('preview'), ['show', 'hide']);
toggleAction('outline', { title: 'Outline', hint: 'The headings (or procedures, classes, ...) at the right of each pane; click one to go there', group: 'view',
  enabled: () => hasOutline(activeDoc()) }, () => document.body.hasAttribute('data-outline'), () => commands.outline(), ['show', 'hide']);
toggleAction('wrap', { title: 'Wrap long lines', hint: 'In the editor (code blocks in the preview: Options > Settings, Preview)', group: 'view' },
  () => setting('wrap'), () => setWrap(!setting('wrap')));
appAction('locateCursor', { title: 'Locate the cursor', hint: 'Rings shrink onto every cursor, in both panes when two show; a cursor out of view gets a marker at that edge (also a short tap on Ctrl)', group: 'view',
  enabled: () => !!editorPane(), run: () => locateCursor(editorPane({ from: 'menu' })) });
toggleAction('overviewMark', { title: 'Scroll bar marks', hint: 'Show or hide this kind of mark on the editor\'s scroll bar', group: 'view',
  variants: [['find'], ['changes'], ['git'], ['bookmarks'], ['compare']],
  variantTitles: { find: 'Scroll bar marks: find matches', changes: 'Scroll bar marks: unsaved changes', git: 'Scroll bar marks: git changes', bookmarks: 'Scroll bar marks: bookmarks', compare: 'Scroll bar marks: compare differences' } },
  ([name]) => setting('overview.' + name) !== false,
  ([name]) => setSetting('overview.' + name, setting('overview.' + name) === false), ['show', 'hide']);
toggleAction('ruler', { title: 'Ruler', hint: 'Above the editor: the columns, the column of the cursor, column guides, tab stops and helper lines (click it for one)', group: 'view' },
  () => rulerShown(), () => setSetting('ruler', !rulerShown()), ['show', 'hide']);
toggleAction('sidebar', { title: 'Sidebar', hint: 'Show or hide the folder pane and the search', group: 'view' },
  () => document.body.dataset.sidebar === 'on', () => commands.sidebar(), ['show', 'hide']);
appAction('folders', { title: 'Folders', hint: 'The folder pane, with the keyboard in it', group: 'view', run: () => focusTree() });
appAction('searchView', { title: 'Search', hint: 'The search in the sidebar', group: 'view', run: () => startSearch() });
appAction('paneOrientation.set', { title: 'Panes', hint: 'Side by side or above each other', group: 'view',
  variants: [['v'], ['h']], variantTitles: { v: 'Panes side by side', h: 'Panes above each other' },
  checked: ([o]) => state.orient === o, run: ([o]) => state.orient === o || commands.orient() });
const paneAction = (name, title, run, enabled = () => bothShown()) =>
  appAction(name, { title, group: 'view', enabled, run: () => { menuPaneIndex = state.activePane; run(); } });
paneAction('paneHide', 'Hide this pane', () => commands.paneHide());
paneAction('paneHideOther', 'Hide other pane', () => commands.paneHideOther());
paneAction('paneClose', 'Close this pane', () => commands.paneClose());
paneAction('paneCloseOther', 'Close other pane', () => commands.paneCloseOther());
paneAction('paneShow', 'Show hidden pane', () => showHiddenPane(), () => state.hidden !== null);
appAction('tabBar.set', { title: 'Tab bar', hint: 'Tabs that do not fit: one row that scrolls, one row with a menu for the tabs out of view, or several rows', group: 'view',
  variants: [['scroll'], ['menu'], ['rows']],
  variantTitles: { scroll: 'Tab bar: one row that scrolls', menu: 'Tab bar: one row, a menu for the rest', rows: 'Tab bar: several rows' },
  checked: ([kind]) => setting('tabBar') === kind, run: ([kind]) => setSetting('tabBar', kind) });
toggleAction('formatBar', { title: 'Formatting bar', hint: 'The bar with bold, headings, lists, tables, ... above the editor', group: 'view' },
  () => setting('formatBar'), () => commands.formatBar(), ['show', 'hide']);
appAction('searchInFiles', { title: 'Search in files', hint: 'In the file, the open files or the folder; codes ^p ^t ^? ^# ^$ ^w ^^', group: 'view', run: () => startSearch() });
// In the editor (it has the focus) the zoom is the editor font size; elsewhere the preview zoom.
const editorFocused = () => panes.some(p => p.cm?.hasFocus());
appAction('zoomIn', { title: 'Zoom in', hint: 'The editor font size in the editor, else the preview (also Ctrl+mouse wheel)', group: 'view',
  run: () => editorFocused() ? editorSizeBy(1) : zoomBy(1) });
appAction('zoomOut', { title: 'Zoom out', hint: 'The editor font size in the editor, else the preview', group: 'view',
  run: () => editorFocused() ? editorSizeBy(-1) : zoomBy(-1) });
appAction('zoomReset', { title: 'Zoom 100%', hint: 'The editor font at its default size in the editor, else the preview at its normal size', group: 'view',
  run: () => editorFocused() ? setFontSetting('editorSize', 0) : setZoom(1) });
toggleAction('theme', { title: 'Day / night', hint: 'Light or dark, for all windows', group: 'view' },
  () => state.theme === 'dark', () => commands.theme(), ['night', 'day']);
toggleAction('compareScroll', { title: 'Scroll both panes together', hint: 'By source line', group: 'view', enabled: () => bothShown() },
  () => state.sync, () => commands.sync());
appAction('commands', { title: 'Keyboard shortcuts and commands', hint: 'This list; Enter runs the selected command', group: 'view', run: () => showPalette() });
appAction('about', { title: 'About LexPen', hint: 'Version and libraries', group: 'view', run: () => showAbout() });

// Go to line: a line number (or line:column); the cursor goes there, the line in the middle when it was out of view.
// Ctrl+Down / Ctrl+Up (virtual.js scrollLine): the text a line, the cursor along with the setting scrollMovesCursor.
appAction('scrollLine.down', { title: 'Scroll down a line', hint: 'The text moves up a line, the view showing one line further down; the cursor stays on its line unless Ctrl+Up / Ctrl+Down move the cursor along (setting); then with Shift: select along', group: 'edit', editor: true, move: true,
  run: (_, { pane, extend }) => scrollLine(pane.cm, 1, extend) });
appAction('scrollLine.up', { title: 'Scroll up a line', hint: 'The text moves down a line, the view showing one line further up; the cursor stays on its line unless Ctrl+Up / Ctrl+Down move the cursor along (setting); then with Shift: select along', group: 'edit', editor: true, move: true,
  run: (_, { pane, extend }) => scrollLine(pane.cm, -1, extend) });
// The character picker (charpicker.js), at the character after the cursor.
appAction('insertCharacter', { title: 'Insert character', hint: 'A picker like the Windows Character Map: the characters of the editor font, search by code, entity or name, gather some and insert them', group: 'edit', editor: true,
  run: (_, { pane }) => openCharPicker(pickerCode(charAtCursor(pane.cm))) });
// Word completion (complete.js): keywords, the document's words, snippets.
appAction('complete', { title: 'Complete word', hint: 'A list of what completes the word before the cursor: the keywords of the language, the words of the document (an @word list for @ and the like), its snippets; Enter or Tab inserts', group: 'edit', editor: true,
  run: (_, { pane }) => showCompletion(pane) });
appAction('goToLine', { title: 'Go to line', hint: 'A line number, or line:column; the cursor goes there', group: 'edit', editor: true,
  run: async (_, { pane }) => {
    const cm = pane.cm, here = cm.getCursor();
    const answer = await askName(`Go to line (1 to ${cm.lineCount()})`, String(here.line + 1), 'A line number, or line:column');
    if (answer === null || answer === '') return;
    const m = answer.match(/^(\d+)\s*(?:[:,]\s*(\d+))?$/);
    if (!m) return toast(`Not a line number: ${answer}`);
    const line = Math.min(Math.max(+m[1], 1), cm.lineCount()) - 1;
    const ch = m[2] ? Math.min(Math.max(+m[2], 1) - 1, cm.getLine(line).length) : 0;
    cm.setCursor(CodeMirror.Pos(line, ch));
    revealFound(cm, CodeMirror.Pos(line, ch));
    cm.focus();
  } });
// Select inside brackets (brackets.js): what lies between the pair or word set at the cursor. No key.
appAction('selectInsideBrackets', { title: 'Select inside brackets', hint: 'Between the pair the highlight shows: ( ), begin ... end, a string', group: 'edit', editor: true,
  run: (_, { pane }) => { selectInsideBrackets(pane.cm); pane.cm.focus(); } });
// The opener / closer of that pair: the cursor before the opener or after the closer, so the next press goes on to
// the pair around it. With Shift: select to there.
appAction('goToOpenBracket', { title: 'Go to opening bracket', hint: 'Of the pair the highlight shows (begin of begin ... end); with Shift: select to it', group: 'edit', editor: true, move: true,
  run: (_, { pane, extend }) => { goToBracket(pane.cm, 'open', extend); pane.cm.focus(); } });
appAction('goToCloseBracket', { title: 'Go to closing bracket', hint: 'Of the pair the highlight shows (end of begin ... end); with Shift: select to it', group: 'edit', editor: true, move: true,
  run: (_, { pane, extend }) => { goToBracket(pane.cm, 'close', extend); pane.cm.focus(); } });
// Multiple cursors (cursors.js): the current occurrence of the find bar's text, else of the selection. Also from the
// find field (after Ctrl+F, Enter), on that pane's editor.
const occurrenceAction = (kind, title, hint) => appAction('cursor' + kind[0].toUpperCase() + kind.slice(1), { title, hint, group: 'edit', editor: true,
  run: (_, { pane }) => occurrence(pane, kind),
  field: el => { const pane = panes.find(p => p.find?.el.contains(el) && p.cm && p.el.dataset.mode !== 'preview'); return pane ? occurrence(pane, kind) : PASS; } });
occurrenceAction('add', 'Add occurrence as cursor', 'The current occurrence of the selection (or the find text) joins the cursors; then the next one is current');
occurrenceAction('next', 'Next occurrence', 'The current occurrence moves on, without adding it');
occurrenceAction('previous', 'Previous occurrence', 'The current occurrence moves back, without adding it');
occurrenceAction('remove', 'Remove occurrence', 'The current occurrence leaves the cursors; the next one is current (none: the previous one)');
occurrenceAction('clear', 'Clear added cursors', 'Only the current occurrence stays selected');
// Tab stops and helper lines on the ruler (ruler.js), per document: a column (tabAdd 10), else the cursor's column.
appAction('tabAdd', { title: 'Add tab stop', hint: 'A tab stop at a column (tabAdd 10), without one at the column of the cursor: Tab goes there (a helper line there becomes a tab stop)', group: 'edit', editor: true,
  run: (params, { pane }) => tabAddAction(pane, params) });
appAction('tabRemove', { title: 'Remove tab stop', hint: 'The tab stop at a column (tabRemove 10), without one at the column of the cursor', group: 'edit', editor: true,
  run: (params, { pane }) => tabRemoveAction(pane, params) });
appAction('tabClear', { title: 'Clear tab stops', hint: 'All tab stops of this document (the helper lines stay)', group: 'edit', editor: true,
  run: (_, { pane }) => clearTabs(paneDoc(pane)) });
appAction('helperAdd', { title: 'Add helper line', hint: 'A helper line at a column (helperAdd 10), without one at the column of the cursor: it only shows (a tab stop there becomes a helper line)', group: 'edit', editor: true,
  run: (params, { pane }) => helperAddAction(pane, params) });
appAction('helperRemove', { title: 'Remove helper line', hint: 'The helper line at a column (helperRemove 10), without one at the column of the cursor', group: 'edit', editor: true,
  run: (params, { pane }) => helperRemoveAction(pane, params) });
appAction('helperClear', { title: 'Clear helper lines', hint: 'All helper lines of this document (the tab stops stay)', group: 'edit', editor: true,
  run: (_, { pane }) => clearLines(paneDoc(pane), 'helper') });
appAction('indentMore', { title: 'Indent', hint: 'The lines of the cursor or selection one indent step right', group: 'edit', editor: true,
  run: (_, { pane }) => { pane.cm.execCommand('indentMore'); pane.cm.focus(); } });
appAction('indentLess', { title: 'Outdent', hint: 'The lines of the cursor or selection one indent step left', group: 'edit', editor: true,
  run: (_, { pane }) => { pane.cm.execCommand('indentLess'); pane.cm.focus(); } });
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
// columns: which numbered clipboards hold a block; windowsColumn: the Windows clipboard does (the host says so on every
// change, so a paste knows at once; column.js).
const clips = { active: 0, previews: Array(10).fill(''), columns: Array(10).fill(false), windowsColumn: false };
const inInput = () => !!document.activeElement?.matches('input, textarea, select') && !document.activeElement.closest('.CodeMirror');
const focusedEditor = () => panes.find(p => p.cm?.hasFocus() && p.active && p.el.dataset.mode !== 'preview') ?? null;

// What to copy: a block (column.js), the editor's selection (nothing selected: the cursor's line, as the editor does),
// else the selection in the preview.
function textToCopy(pane) {
  if (!pane) return getSelection().toString();
  const cm = pane.cm;
  if (blockOf(cm)) return blockText(cm, pane.active.doc.eol);
  return cm.getSelection() || cm.getLine(cm.getCursor().line) + '\n';
}

// A block goes on the clipboard marked as one (the Windows clipboard: MSDEVColumnSelect), so paste puts it back as a column.
function putOnClipboard(text, column = false) {
  if (!text) return;
  if (clips.active === 0) host('clipboardSetText', { text, column });
  else host('clipSet', { n: clips.active, text, column });
}

// A key with the Windows clipboard is left to the editor, except on a block: the marker needs the host.
const editorCopies = (ctx, pane) => ctx.from === 'key' && clips.active === 0 && !(pane?.cm && blockOf(pane.cm));

appAction('copy', { title: 'Copy', hint: 'To the active clipboard', group: 'edit', run: (_, ctx) => {
  const pane = ctx.from === 'key' ? focusedEditor() : editorPane(ctx);
  if (ctx.from === 'key' && inInput() || editorCopies(ctx, pane)) return PASS;
  putOnClipboard(textToCopy(pane), !!(pane?.cm && blockOf(pane.cm)));
} });
appAction('cut', { title: 'Cut', hint: 'To the active clipboard', group: 'edit', editor: true, run: (_, ctx) => {
  if (editorCopies(ctx, ctx.pane)) return PASS;
  const cm = ctx.pane.cm;
  if (cm.getOption('readOnly')) return;
  const block = !!blockOf(cm);
  putOnClipboard(textToCopy(ctx.pane), block);
  if (block) clearBlock(cm);
  else if (cm.somethingSelected()) cm.replaceSelection('');
  else {
    const line = cm.getCursor().line;
    cm.replaceRange('', CodeMirror.Pos(line, 0), line < cm.lastLine() ? CodeMirror.Pos(line + 1, 0) : CodeMirror.Pos(line));
  }
} });
// Not async: the key handler must see PASS itself, not a promise of it. The key with the Windows clipboard is the
// editor's own paste (a block or column mode: onNativePaste, column.js). As a column, or a line per selection: pasteText.
appAction('paste', { title: 'Paste', hint: 'From the active clipboard', group: 'edit', editor: true, run: (_, ctx) => {
  if (ctx.from === 'key' && clips.active === 0) return PASS;
  return (async () => {
    const n = clips.active, text = n === 0 ? await host('clipboardText') : await host('clipGet', { n });
    pasteText(ctx.pane.cm, text, n === 0 ? clips.windowsColumn : clips.columns[n]);
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
// ---------- Column mode and blocks (column.js) ----------
toggleAction('columnMode', { title: 'Column mode', hint: 'A drag and Shift+arrows select a block; typing, Backspace and Delete work on every line of it; paste goes in as a column (COL in the bottom bar)',
  group: 'edit', editor: true }, () => column.on, () => setColumnMode(!column.on));
appAction('blockSelect', { title: 'Select a block', hint: 'Grows or shrinks a block (a column selection) from the cursor, also without column mode',
  group: 'edit', editor: true, variants: [['up'], ['down'], ['left'], ['right']],
  variantTitles: { up: 'Select a block: up', down: 'Select a block: down', left: 'Select a block: left', right: 'Select a block: right' },
  run: ([dir], { pane }) => editorMonospaced() ? extendBlock(pane.cm, dir)
    : toast('A block needs a monospaced editor font (Options > Settings > Editor).') });
appAction('convertMenu', { title: 'Convert menu at the cursor', hint: 'The conversions (case, tabs and spaces, whitespace at line ends), as a menu at the cursor; also the Convert button of the bar', group: 'format',
  editor: true, run: (_, { pane }) => openPopupAtCursor(pane, CONVERT_ITEMS) });
toggleAction('overwrite', { title: 'Insert / overwrite', hint: 'Typing replaces the character at the cursor (OVR in the bottom bar)', group: 'edit', editor: true },
  () => !!editorPane()?.cm?.state.overwrite, (_, { pane }) => { pane.cm.toggleOverwrite(); updateStatus(); });

// ---------- Settings (Options > Settings: the settings window) ----------
appAction('settings', { title: 'Settings...', hint: 'Every setting, searchable; a change applies at once in every window', group: 'settings',
  run: () => host('openSettings') });
appAction('chooseLanguage', { title: 'Language...', hint: 'Of the active tab: colouring, outline, bar and actions (also a click on the language in the bottom bar)', group: 'view',
  enabled: () => !!activeDoc(), run: () => showLanguageList() });
appAction('tabOrder.set', { title: 'Ctrl+Tab order', hint: 'Recently used, or the order of the tab bar', group: 'settings',
  variants: [['recent'], ['tabs']], variantTitles: { recent: 'Ctrl+Tab in recently used order', tabs: 'Ctrl+Tab in tab bar order' },
  checked: ([order]) => setting('tabOrder') === order, run: ([order]) => setSetting('tabOrder', order) });
toggleAction('backup', { title: 'Keep a backup when saving', hint: 'The old file becomes name.ext.bak (overwritten at the next save)', group: 'settings' },
  () => setting('backup'), () => setSetting('backup', !setting('backup')));
appAction('findWrap.set', { title: 'Find: at the end of the file', hint: 'Stop with a message, go on from the top, or go on and stop where the search started', group: 'settings',
  variants: [['end'], ['around'], ['origin']],
  variantTitles: { end: 'Find: stop at the end', around: 'Find: go on from the top', origin: 'Find: go on, stop where the search started' },
  checked: ([mode]) => setting('findWrap') === mode, run: ([mode]) => setSetting('findWrap', mode) });
toggleAction('findShared', { title: 'One find for both panes', hint: 'Both panes share one find (Ctrl+F); off: each pane has its own', group: 'settings' },
  () => setting('findShared'), () => commands.findShared());
toggleAction('lineBreaks', { title: 'Single line break starts a new line', hint: 'In the preview; off: a single line break joins the lines, as in GitHub files', group: 'settings' },
  () => setting('lineBreaks'), () => commands.lineBreaks());
toggleAction('movePinned', { title: 'Move pinned tabs when closing a pane or window', hint: 'To the main pane / another open window of the same project; off, they keep the pane open or close with the window', group: 'settings' },
  () => setting('movePinned'), () => setSetting('movePinned', !setting('movePinned')));
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
// The settings window shows a tab per group, in this order; the rows of a group in their order below.
const SETTING_GROUPS = ['General', 'Files', 'Editor', 'Editor view', 'Preview', 'Outline', 'Tabs', 'Find', 'App', 'Keys', 'Languages'];
const SETTING_ROWS = [
  { name: 'languageNames', group: 'Languages', kind: 'names', title: 'Names of languages',
    hint: 'A name after a markdown fence (```bash) or in a block, and the language it is: bash=tcc, cmd=batch. Before the languages\' own names and aliases' },
  { name: 'newWindowProject', group: 'General', sub: 'Windows', kind: 'choice', title: 'A new window',
    hint: 'In which project a new window will be created (per virtual desktop)',
    options: () => [['new', 'New project'], ['same', 'Project of recent window']] },
  { name: 'keepUnnamedProjects', group: 'General', sub: 'Windows', kind: 'toggle', title: 'Keep unnamed projects',
    hint: 'Windows with files but with an unnamed project ("Project n") are kept for reopening',
    hintOff: 'Windows with files for unnamed projects ("Project n") are not remembered for reopening' },
  { name: 'followWindows', group: 'General', sub: 'Theme', kind: 'toggle', title: 'Follow Windows',
    hint: 'Light or dark follows Windows (Settings > Personalization > Colors); the Day / Night button switches until Windows changes',
    hintOff: 'A change between light and dark in Windows does not switch the mode of LexPen' },
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
  { name: 'wrap', group: 'Editor', kind: 'toggle',
    hint: 'Long lines wrap at the edge',
    hintOff: 'Long lines run on past the edge and scroll sideways' },
  { name: 'tabSize', group: 'Editor', sub: 'Tabs', kind: 'choice', title: 'Tab size',
    hint: 'Where the tab stops are: Tab after text goes to the next one, and a tab after text is shown that wide. A language can set its own (tabSize)',
    options: () => Array.from({ length: 16 }, (_, i) => [i + 1, String(i + 1)]) },
  { name: 'indentSize', group: 'Editor', sub: 'Tabs', kind: 'choice', title: 'Indent size',
    hint: 'Where the indent stops are: Tab in the indentation of a line, Indent / Outdent, and a tab in the indentation is shown that wide. A language can set its own (indentSize)',
    options: () => Array.from({ length: 16 }, (_, i) => [i + 1, String(i + 1)]) },
  { name: 'formatBar', group: 'Editor view', kind: 'toggle',
    hint: 'The bar with bold, headings, lists, tables, ... is shown above the editor (also View > Formatting bar)',
    hintOff: 'No formatting bar above the editor; its commands stay in the menus and on their keys (View > Formatting bar shows it)' },
  { name: 'showWhitespace', group: 'Editor view', sub: 'Invisible characters', kind: 'toggle', title: 'Show spaces and tabs',
    hint: 'In the editor: a space as a small dot, a tab as an arrow (theme colour: whitespace)',
    hintOff: 'Spaces and tabs are not marked in the editor' },
  { name: 'showLineEnds', group: 'Editor view', sub: 'Invisible characters', kind: 'toggle', title: 'Show line ends',
    hint: 'In the editor: \u00B6 at the end of a line for CRLF, \u240A for LF (theme colour: whitespace)',
    hintOff: 'Line ends are not marked in the editor' },
  { name: 'showSpecialChars', group: 'Editor view', sub: 'Invisible characters', kind: 'toggle', title: 'Show characters that cannot be seen',
    hint: 'Control characters (0x1B), invisible signs (U+200B) and bytes the encoding of the file could not read (0xAB, red) are shown as their code in a box; each is still one character',
    hintOff: 'Characters that cannot be seen are shown as a small red dot; a byte the encoding of the file could not read is kept and written back all the same' },
  { name: 'bracketHighlight', group: 'Editor view', sub: 'Brackets', kind: 'choice', title: 'The pair at the cursor: marked with',
    hint: 'The innermost pair or word set (begin ... end) around the cursor; one without its match in another colour',
    options: () => [['colour', 'A background colour'], ['underline', 'An underline (the colour of the find box)'], ['off', 'Not marked']] },
  { name: 'indentGuides', group: 'Editor view', sub: 'Indent guides', kind: 'choice', title: 'Indent guides',
    hint: 'A thin line at the indent of every enclosing line, from the indent to the unindent: in the comment colour, a colour per level, one colour (below) or none',
    options: () => [['comment', 'In the colour of comments'], ['rainbow', 'A colour per level'], ['colour', 'One colour (below)'], ['off', 'None']] },
  { name: 'indentGuideColour', group: 'Editor view', sub: 'Indent guides', kind: 'colour', title: 'Indent guides: the one colour',
    hint: 'When the indent guides are in one colour: that colour, a colour of the theme (it follows the theme) or one you pick',
    options: () => GUIDE_COLOURS },
  { name: 'indentGuideIntensity', group: 'Editor view', sub: 'Indent guides', kind: 'range', range: [0, 100, 5], unit: '%',
    title: 'Indent guides: intensity', hint: 'Intensity of the indent guides shown in the editor, whatever their colour: higher means brighter, lower fades them into the background' },
  { name: 'indentGuideCursor', group: 'Editor view', sub: 'Indent guides', kind: 'toggle', title: 'The guide of the block at the cursor highlighted',
    hint: 'The guide of the block the cursor is in is drawn in its own colour (below), also when the indent guides are off',
    hintOff: 'The guide of the block the cursor is in looks like the other guides (with the indent guides off: none)' },
  { name: 'indentGuideCursorColour', group: 'Editor view', sub: 'Indent guides', kind: 'colour', title: 'The guide at the cursor: colour',
    hint: 'When the guide of the block at the cursor is highlighted: its colour, a colour of the theme (it follows the theme) or one you pick',
    options: () => GUIDE_COLOURS },
  { name: 'indentGuideCursorIntensity', group: 'Editor view', sub: 'Indent guides', kind: 'range', range: [0, 100, 5], unit: '%',
    title: 'The guide at the cursor: intensity', hint: 'When the guide of the block at the cursor is highlighted: its intensity; higher means brighter, lower fades it into the background' },
  { name: 'closeBrackets', group: 'Editor', sub: 'Brackets', kind: 'toggle', title: 'Close brackets and quotes while typing',
    hint: 'An opening sign adds its closer; typing the closer before one steps over it; Backspace removes an empty pair. Signs only, never words',
    hintOff: 'Brackets and quotes are typed as they are: nothing is added' },
  { name: 'outlineMerged', group: 'Outline', kind: 'toggle', title: 'Outline: groups together, by line',
    hint: 'The outline lists all entries in line order, the groups mixed',
    hintOff: 'The outline has a header per group, its entries in line order' },
  { name: 'outlineBullets', group: 'Outline', kind: 'toggle', title: 'Outline: a bullet in the colour of the group',
    hint: 'Show a bullet in the colour of its group in front of every entry of a language with groups',
    hintOff: 'No bullets in front of the entries' },
  { name: 'sneakTheme', group: 'Outline', kind: 'choice', title: 'Theme of the sneak preview',
    hint: 'A long click on an outline entry shows it while the button is held: in the editor\'s own theme with a tint, or in a theme of its own (a light one next to a dark editor)',
    options: () => [['', 'The editor\'s theme, tinted'], ...themeOptions()] },
  { name: 'leftWraps', group: 'Editor', sub: 'Cursor', kind: 'toggle', title: 'Left at the start of a line goes to the line above',
    hint: 'At the first column, Left (and Shift+Left) goes on to the end of the line above',
    hintOff: 'At the first column, Left (and Shift+Left) stays at the start of the line' },
  { name: 'homeStop', group: 'Editor', sub: 'Cursor', kind: 'toggle', title: 'Home key goes to the first column',
    hint: 'Home key sets the cursor at the first column',
    hintOff: 'Home key sets the cursor at the first non-whitespace character on the line; a second Home goes to the first column' },
  { name: 'scrollMovesCursor', group: 'Editor', sub: 'Cursor', kind: 'toggle', title: 'Ctrl+Up / Ctrl+Down move the cursor along',
    hint: 'Ctrl+Down scrolls the text a line and the cursor goes a line down with it, keeping its place on the screen (Ctrl+Up the other way); at the end of the text the cursor still goes on to the last line. With Shift the selection goes along',
    hintOff: 'Ctrl+Down scrolls the text a line and the cursor stays on its line, also when that line leaves the view (Ctrl+Up the other way)' },
  { name: 'jumpLines', group: 'Editor', sub: 'Cursor', kind: 'range', range: [1, 100, 1], unit: ' lines', title: 'A jump: a move of more than',
    hint: 'How far the cursor must move, without typing, for the place it left to be kept for Position back (Ctrl+Alt+-). A found item is always kept, however close' },
  { name: 'completeDelay', group: 'Editor', sub: 'Completion', kind: 'range', range: [0, 2000, 100], unit: ' ms', title: 'Show completions after a pause in typing',
    hint: 'After typing a word character and stopping this long, the list of completions opens by itself; 0: only with Ctrl+Space' },
  { name: 'revealInView', group: 'Find', sub: 'Jump to a found place', kind: 'choice', title: 'A found place already in view',
    hint: 'A find, a search result, the next compare difference, a bookmark, Go to line: when the place is already on screen',
    options: () => [['stay', 'The view stays (unless it is within the lines kept from the edge)'], ['center', 'Centred']] },
  { name: 'revealOutOfView', group: 'Find', sub: 'Jump to a found place', kind: 'choice', title: 'A found place out of view',
    hint: 'When the place is not on screen: the view scrolls to it',
    options: () => [['keep', 'The lines kept from the edge (the top going up, the bottom going down)'], ['center', 'Centred']] },
  { name: 'revealLines', group: 'Find', sub: 'Jump to a found place', kind: 'range', range: [0, 20, 1], unit: ' lines', title: 'Lines kept from the edge',
    hint: 'A found place comes no closer than this many lines to the top or bottom of the view (fewer on a low view)' },
  { name: 'scrollMargin', group: 'Editor', sub: 'Cursor', kind: 'choice', title: 'Scroll sideways before the edge',
    hint: 'The editor scrolls left or right when the cursor comes this many columns from the edge (on keys, not on a click); without wrapping',
    options: () => [1, 2, 4, 8, 12, 16, 24, 32].map(n => [n, n === 1 ? '1 column' : n + ' columns']) },
  { name: 'virtualSpace', group: 'Editor', sub: 'Cursor', kind: 'toggle', title: 'Cursor past the end of the line',
    hint: 'Up, Down and a click keep the cursor in its column even after the end of a line; typing there fills the line with spaces first. Only with a monospaced editor font',
    hintOff: 'On a shorter line the cursor stops at its end (Up and Down return to the column on a longer line). Column mode still goes past the end' },
  { name: 'locateCursor', group: 'Editor view', sub: 'Locate the cursor', kind: 'toggle', title: 'A short tap on Ctrl shows where the cursor is',
    hint: 'A short tap on Ctrl: rings shrink onto every cursor, in the colour of the find box; a cursor out of view gets a marker at that edge with its line number (also View > Locate the cursor)',
    hintOff: 'A tap on Ctrl does nothing; View > Locate the cursor still shows where the cursor is' },
  { name: 'locateCursorTap', group: 'Editor view', sub: 'Locate the cursor', kind: 'choice', title: 'The longest tap on Ctrl',
    hint: 'Ctrl held longer, or with another key, a click or the mouse wheel, is not a tap',
    options: () => [200, 300, 400, 500, 700, 1000].map(n => [n, n + ' ms']) },
  { name: 'locateCursorJump', group: 'Editor view', sub: 'Locate the cursor', kind: 'toggle', title: 'A double tap on Ctrl scrolls to the cursor',
    hint: 'When a short tap on Ctrl shows the cursor: two quick taps scroll the editor to the cursor (with several: the main one), then show where it is',
    hintOff: 'When a short tap on Ctrl shows the cursor: two quick taps show it as one tap does; the editor does not scroll' },
  { name: 'ruler', group: 'Editor view', sub: 'Ruler and column guides', kind: 'toggle', title: 'The ruler above the editor',
    hint: 'The ruler above the editor shows the columns, the column of the cursor and the guides; a click sets a tab stop (Tab goes there) or a helper line (only shows), right-click for the panel. Kept per file. Only with a monospaced editor font',
    hintOff: 'No ruler (View > Ruler shows it); the tab stops and helper lines of a file still show in the text, and Tab still stops at the tab stops' },
  { name: 'columnGuideStart', group: 'Editor view', sub: 'Ruler and column guides', kind: 'choice', title: 'Column guide: the first one after',
    hint: 'A faint line after this many characters (also right-click on the ruler)', options: () => [[0, 'None'], ...[2, 4, 8, 10, 20, 40, 72, 80, 100, 120].map(n => [n, n + ' characters'])] },
  { name: 'columnGuideStep', group: 'Editor view', sub: 'Ruler and column guides', kind: 'choice', title: 'Column guides: then every',
    hint: 'After the first one, a guide every so many characters', options: () => [[0, 'None (only the first)'], ...[2, 4, 8, 10, 20, 40].map(n => [n, n + ' characters'])] },
  { name: 'columnGuideExtra', group: 'Editor view', sub: 'Ruler and column guides', kind: 'choice', title: 'Column guide: one more after',
    hint: 'One guide of its own, as at 80', options: () => [[0, 'None'], ...[72, 80, 100, 120, 132].map(n => [n, n + ' characters'])] },
  { name: 'columnGuideColour', group: 'Editor view', sub: 'Ruler and column guides', kind: 'colour', title: 'Column guides: colour',
    hint: 'The colour of the column guides: a colour of the theme (it follows the theme) or one you pick', options: () => GUIDE_COLOURS },
  { name: 'columnGuideIntensity', group: 'Editor view', sub: 'Ruler and column guides', kind: 'range', range: [0, 100, 5], unit: '%',
    title: 'Column guides: intensity', hint: 'Intensity of the column guides shown in the editor: higher means brighter, lower fades them into the background' },
  { name: 'helperLineIntensity', group: 'Editor view', sub: 'Ruler and column guides', kind: 'range', range: [0, 100, 5], unit: '%',
    title: 'Helper lines: intensity', hint: 'Intensity of the helper lines (set on the ruler) shown in the editor: higher means brighter, lower fades them into the background. A colour from Other colour... is drawn as picked' },
  { name: 'tabStopIntensity', group: 'Editor view', sub: 'Ruler and column guides', kind: 'range', range: [0, 100, 5], unit: '%',
    title: 'Tab stops: intensity', hint: 'Intensity of the tab stop lines shown in the editor: higher means brighter, lower fades them into the background. Their handles on the ruler keep full colour; a colour from Other colour... is drawn as picked' },
  { name: 'highlightStyle', group: 'Editor view', sub: 'Highlight', kind: 'choice', title: 'A highlight',
    hint: 'How a highlighted part of the text shows (comparing: the part of the other side that matches a selection): the text keeps its colours either way',
    options: () => [['background', 'A background colour'], ['underline', 'Underlined']] },
  { name: 'highlightColour', group: 'Editor view', sub: 'Highlight', kind: 'colour', title: 'Highlight: colour',
    hint: 'The background or the underline of a highlight: a colour of the theme (it follows the theme; the highlight colour of the theme is yellow) or one you pick',
    options: () => GUIDE_COLOURS },
  { name: 'highlightIntensity', group: 'Editor view', sub: 'Highlight', kind: 'range', range: [0, 200, 5], unit: '%',
    title: 'Highlight: intensity', hint: '100%: the colour itself; lower fades it into the background, higher takes it further from the background (brighter on a dark theme, deeper on a light one)' },
  { name: 'lineNumbers', group: 'Editor view', sub: 'Gutter', kind: 'choice',
    options: () => [['none', 'None'], ['tens', 'Every 10 (a dash at 5, a dot on the others)'], ['all', 'Every line']] },
  { name: 'lineNumberCount', group: 'Editor view', sub: 'Gutter', kind: 'choice',
    options: () => [['absolute', 'Absolute'], ['relative', 'Relative to the cursor']] },
  { name: 'gutter.cursor', group: 'Editor view', sub: 'Gutter', kind: 'toggle', title: 'Show cursor location in the gutter',
    hint: 'The gutter of the cursor\'s line in the colour the ruler shows the cursor\'s column in (every cursor\'s line with more cursors)',
    hintOff: 'The cursor\'s line is not marked in the gutter' },
  ...[['bookmarks', 'Bookmarks'], ['changes', 'Change markers'], ['git', 'Git markers'], ['folds', 'Fold markers']]
    .map(([n, title]) => ({ name: 'gutter.' + n, group: 'Editor view', sub: 'Gutter', kind: 'toggle', title,
      hint: { bookmarks: 'The gutter shows bookmarks 1 to 9 and unnumbered ones', changes: 'The gutter marks the lines changed since the last save',
        git: 'The gutter marks the lines changed since the last commit (a click shows the old text)', folds: 'The gutter has a marker to fold headings, code blocks and braces' }[n],
      hintOff: { bookmarks: 'No bookmark column in the gutter; bookmarks are kept and their keys still work', changes: 'No change markers in the gutter',
        git: 'No git markers in the gutter', folds: 'No fold markers in the gutter' }[n] })),
  { name: 'overviewWidth', group: 'Editor view', sub: 'Scroll bars', kind: 'range', range: [10, 40, 2], unit: ' px', title: 'Scroll bars: width',
    hint: 'How wide the editor\'s scroll bars are (the horizontal one as high); the marks on the vertical one take their share of it' },
  ...[['find', 'Find matches'], ['changes', 'Unsaved changes'], ['git', 'Git changes'], ['bookmarks', 'Bookmarks'], ['compare', 'Compare differences']]
    .map(([n, title]) => ({ name: 'overview.' + n, group: 'Editor view', sub: 'Scroll bars', kind: 'toggle', title: 'Marks: ' + title.toLowerCase(),
      hint: { find: 'The scroll bar marks the lines with a match of the find bar', changes: 'The scroll bar marks the lines changed since the last save',
        git: 'The scroll bar marks the lines changed since the last commit', bookmarks: 'The scroll bar marks the bookmarks',
        compare: 'Comparing, the scroll bar marks the differences' }[n],
      hintOff: { find: 'No find matches on the scroll bar', changes: 'No unsaved changes on the scroll bar',
        git: 'No git changes on the scroll bar', bookmarks: 'No bookmarks on the scroll bar', compare: 'No compare differences on the scroll bar' }[n] })),
  { name: 'explorerCompare', group: 'App', sub: 'Windows Explorer', kind: 'toggle', title: 'Compare entries in Explorer\'s right-click menu',
    hint: 'Explorer\'s right-click menu on files and folders gets Select left side to compare, and then Compare to <name>; on Windows 11 under Show more options (or Shift+right-click). They run the LexPen that turned this on',
    hintOff: 'No compare entries in Explorer\'s right-click menu' },
  { name: 'compareWhitespace', group: 'Editor view', sub: 'Compare', kind: 'toggle', title: 'Ignore whitespace',
    hint: 'Comparing, spaces and tabs count only as a separation: their amount inside a line and those at its ends make no difference, nor an empty line against none',
    hintOff: 'Comparing, every space and tab counts' },
  { name: 'compareCase', group: 'Editor view', sub: 'Compare', kind: 'toggle', title: 'Ignore case',
    hint: 'Comparing, upper and lower case count as the same', hintOff: 'Comparing, upper and lower case differ' },
  { name: 'compareStep', group: 'Editor view', sub: 'Compare', kind: 'choice', title: 'Next / previous difference (F7 / Shift+F7)',
    hint: 'Comparing, where F7 and Shift+F7 go when changed lines follow each other; the count in the bar counts the same',
    options: () => [['block', 'The next block of changed lines'], ['line', 'The next changed line, also inside a block']] },
  { name: 'compareStrip', group: 'Editor view', sub: 'Compare', kind: 'toggle', title: 'Line strip',
    hint: 'Comparing, below the panes the cursor line and its match one above the other, the differing characters marked',
    hintOff: 'Comparing, no line strip below the panes' },
  { name: 'lineBreaks', group: 'Preview', kind: 'toggle',
    hint: 'In the preview, a single line break starts a new line',
    hintOff: 'In the preview, a single line break joins the lines, as in GitHub files (an empty line starts a new paragraph)' },
  { name: 'previewWrap', group: 'Preview', kind: 'toggle', title: 'Wrap long lines in code blocks',
    hint: 'Long lines in the code blocks of the preview wrap at the edge',
    hintOff: 'Long lines in the code blocks of the preview run on and scroll sideways (a line of more than 10000 characters wraps all the same, to keep the preview fast)' },
  { name: 'previewThemeLight', group: 'Preview', kind: 'choice', title: 'Theme for the preview in light mode',
    hint: 'Same as the app, or a theme of its own', options: () => [['', 'Same as the app'], ...themeOptions()] },
  { name: 'previewThemeDark', group: 'Preview', kind: 'choice', title: 'Theme for the preview in dark mode',
    hint: 'Same as the app, or a theme of its own (as a light preview next to a dark editor)',
    options: () => [['', 'Same as the app'], ...themeOptions()] },
  { name: 'zoom', group: 'Preview', kind: 'choice', title: 'Preview zoom', hint: 'Also Ctrl+mouse wheel over a preview',
    options: () => Array.from({ length: 26 }, (_, i) => (5 + i) / 10).map(z => [z, Math.round(z * 100) + '%']) },
  { name: 'backup', group: 'Files', kind: 'toggle',
    hint: 'When saving, the old file becomes name.ext.bak (overwritten at the next save)',
    hintOff: 'Saving overwrites the file; no backup is made' },
  { name: 'showBackupFiles', group: 'Files', kind: 'toggle', title: 'Show backup files in the folder pane',
    hint: 'The folder pane lists the backup files (name.ext.bak) with the other files',
    hintOff: 'The folder pane leaves out the backup files (name.ext.bak); they stay on disk' },
  { name: 'trimTrailing', group: 'Files', kind: 'toggle', title: 'Remove whitespace at line ends on save',
    hint: 'On save, spaces and tabs at line ends are removed from the whole file, just before it is written (Ctrl+Z after the save gives them back). A language can keep some (markdown: 2) or never trim (trimTrailing)',
    hintOff: 'On save, spaces and tabs at line ends are kept' },
  { name: 'askSaveDrafts', group: 'Files', kind: 'toggle', title: 'Ask to save changed drafts when closing LexPen',
    hint: 'Closing LexPen with changed drafts asks whether to save them (closing a draft tab always asks)',
    hintOff: 'Closing LexPen keeps changed drafts as drafts without a question (closing a draft tab always asks)' },
  { name: 'tabOrder', group: 'Tabs', kind: 'choice', options: () => [['recent', 'Recently used'], ['tabs', 'Tab bar order']] },
  { name: 'tabBar', group: 'Tabs', kind: 'choice', title: 'Tab bar', hint: 'When the tabs do not fit in one row',
    options: () => [['scroll', 'One row that scrolls'], ['menu', 'One row, a menu for the tabs out of view'], ['rows', 'Several rows']] },
  { name: 'movePinned', group: 'Tabs', kind: 'toggle',
    hint: 'Closing a pane moves its pinned tabs to the main pane; closing a window moves them to another open window of the same project',
    hintOff: 'Pinned tabs keep their pane open, and close with their window' },
  { name: 'findShared', group: 'Find', kind: 'toggle',
    hint: 'Both panes share one find (Ctrl+F)',
    hintOff: 'Each pane has its own find (Ctrl+F), with its own text and options' },
  { name: 'findWrap', group: 'Find', kind: 'choice', title: 'Search: at the end of the file', hint: 'What find / search next (F3) does past the last match (Shift+F3: before the first)',
    options: () => [['end', 'Stop, with a message'], ['around', 'Go on from the top'], ['origin', 'Go on from the top, stop where the search started']] },
  { name: 'findHistory', group: 'Find', kind: 'choice', title: 'Searches kept in the history',
    hint: 'The find bar and the search in files share them, the replace field has its own; Up / Down in the field, Alt+Down for the list',
    options: () => [[0, 'None'], [10, '10'], [20, '20'], [50, '50'], [100, '100']] },
  { name: 'findMark', group: 'Find', kind: 'choice', title: 'Found text: marked with', hint: 'The matches of find and search, in the editor and the preview',
    options: () => [['background', 'A background colour'], ['outline', 'A box around it (the text keeps its own background)'], ['both', 'Both']] },
  { name: 'findGutter', group: 'Find', kind: 'toggle', title: 'Mark the line numbers of lines with found text',
    hint: 'Besides the found text, the line numbers of lines with found text are marked too',
    hintOff: 'The line numbers are not marked; only the found text is' },
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
  name: 'openIn.' + name, group: 'Languages', sub: 'Open in', kind: 'choice', title: packs[name].name, default: '',
  hint: (packs[name].extensions ?? []).join(' ') || 'Files you give this language',
  options: () => [['', `As the language says (${({ edit: 'the editor', split: 'editor and preview', preview: 'the preview' })[packs[name].open] ?? 'the editor'})`],
    ['edit', 'The editor'], ['split', 'Editor and preview'], ['preview', 'The preview']],
}));

// Languages > Format: <language>: a row per style attribute the language has (reformat.js), its own value unless
// you choose.
const formatRows = () => PACK_NAMES.filter(name => packs[name].format?.style).flatMap(name =>
  Object.keys(RF_ATTRIBUTES).filter(key => key in packs[name].format.style).map(key => {
    const [title, values] = RF_ATTRIBUTES[key], own = packs[name].format.style[key];
    return { name: `format.${name}.${key}`, group: 'Languages', sub: 'Format: ' + packs[name].name, kind: 'choice', title, default: '',
      hint: `${packs[name].name}: ${key}`, options: () => [['', `As the language says (${values.find(v => v[0] === own)?.[1] ?? own})`], ...values] };
  }));

function settingDefs() {
  // In the order of the groups (a stable sort keeps the rows' own order within a group).
  const rank = r => SETTING_GROUPS.indexOf(r.group);
  const rows = [...SETTING_ROWS, ...openInRows(), ...formatRows()].sort((a, b) => rank(a) - rank(b));
  return rows.map(r => {
    const action = appActions.get(r.name) ?? appActions.get(r.name + '.toggle') ?? appActions.get(r.name + '.set');
    return {
      name: r.name, group: r.group, sub: r.sub ?? null, kind: r.kind, default: r.default,
      title: r.title ?? action?.title ?? r.name, hint: r.hint ?? action?.hint ?? '',
      hintOff: r.hintOff ?? null,   // a toggle whose hint says what happens: hint when on, hintOff when off
      options: r.options?.() ?? (r.kind === 'size' ? [[0, `Default (${r.base()})`], ...FONT_SIZES.map(pt => [pt, pt + ' pt'])] : null),
      monoFirst: r.name === 'editorFont',
      range: r.range ?? null, unit: r.unit ?? '',
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
appAction('lineNumbers.set', { title: 'Line numbers', hint: 'None, every 10 (a dash at 5, a dot on the others) or every line', group: 'view',
  variants: [['none'], ['tens'], ['all']], variantTitles: { none: 'Line numbers: none', tens: 'Line numbers: every 10', all: 'Line numbers: every line' },
  checked: ([kind]) => setting('lineNumbers') === kind, run: ([kind]) => setSetting('lineNumbers', kind) });
appAction('lineNumberCount.set', { title: 'Line number count', hint: 'Absolute, or relative to the cursor line (that line shows its own number)', group: 'view',
  variants: [['absolute'], ['relative']], variantTitles: { absolute: 'Line numbers: absolute', relative: 'Line numbers: relative to the cursor' },
  checked: ([kind]) => setting('lineNumberCount') === kind, run: ([kind]) => setSetting('lineNumberCount', kind) });
toggleAction('gutterColumn', { title: 'Gutter', hint: 'Show or hide this column left of the text', group: 'view',
  variants: [['bookmarks'], ['changes'], ['git'], ['folds']],
  variantTitles: { bookmarks: 'Bookmark gutter', changes: 'Change markers (not saved)',
    git: 'Git markers (since the last commit)', folds: 'Fold markers' } },
  ([name]) => setting('gutter.' + name) !== false,
  ([name]) => setSetting('gutter.' + name, setting('gutter.' + name) === false), ['show', 'hide']);   // applySettings sets up the editors   // applySettings sets up the editors
