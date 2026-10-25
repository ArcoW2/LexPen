'use strict';

const FILE_URL = 'https://file.lexpen.example/';   // served by the host, see MainForm.OnFileRequested
// A markdown file (the folder pane's markdown-only filter): by the markdown pack's extensions.
const MARKDOWN_FILE = { test: name => languageFor(name) === 'markdown' };
// The language of a file (languages.js, by its pack's extensions); undefined for markdown (and a draft).
const codeLang = (path, text) => {
  if (!path) return undefined;
  const name = languageFor(path, text);
  return name === 'markdown' ? undefined : name;
};
const WELCOME = `<h1>LexPen</h1><p>Open a file or a folder to get started (File menu).</p>
<p>All commands and their keys: <kbd>F1</kbd>.</p>`;
// Drag and drop between tabs, panes and windows.
const TAB_TYPE = 'application/x-lexpen-tab';
const PATH_TYPE = 'application/x-lexpen-path';

const $ = sel => document.querySelector(sel);
const ui = {
  tree: $('.mm-tree'), treeTitle: $('.mm-tree-title'), docName: $('.mm-doc-name'),
  panes: $('.mm-panes'), divider: $('.mm-divider'), sync: $('.mm-sync'),
  splitter: $('.mm-splitter'), toast: $('.mm-toast'), sort: $('.mm-sort'),
  about: $('.mm-about-dialog'), aboutBody: $('.mm-about-body'),
  treeMenu: $('.mm-tree-menu'), tabMenu: $('.mm-tab-menu'), stripMenu: $('.mm-strip-menu'),
  paneMenu: $('.mm-pane-menu'), dividerMenu: $('.mm-divider-menu'),
};

const state = {
  root: null,           // open folder
  theme: document.documentElement.dataset.theme,
  win: 0,               // this window's id at the host
  primary: true,        // the primary window saves the session
  activePane: 0,
  hidden: null,         // the pane hidden with its tabs (0 or 1), or null
  sync: false,          // scroll both panes together
  orient: 'v',          // panes side by side (v) or above each other (h): the layout's orient
  ratio: 50,            // size of the first pane, in percent: the layout's ratio
};

// ---------- Host bridge ----------
const pending = new Map();
let lastId = 0;

// Shows the busy bar for as long as the promise is pending.
let busyCount = 0;
// The busy bar is an element of its own: an attribute on body (with the progress cursor all of the page inherited)
// made the browser restyle the whole page twice per host call, about a second with a large file in the preview.
const busyBar = document.querySelector('.mm-busy');
function track(promise) {
  const update = change => busyBar.toggleAttribute('data-on', (busyCount += change) > 0);
  update(1);
  promise.then(() => update(-1), () => update(-1));
  return promise;
}

function call(op, args, send) {
  return new Promise((resolve, reject) => {
    pending.set(++lastId, { resolve, reject });
    send({ ...args, id: lastId, op });   // after the arguments: an argument named id or op cannot replace them
  });
}
function host(op, args) {
  const result = call(op, args, msg => chrome.webview.postMessage(msg));
  // Not busy while the user is looking at a native dialog, nor for writes in the background.
  return /^(pick|confirm|close|draft|docText|session)/.test(op) ? result : track(result);
}
// Files dropped from Explorer: the host reads their paths from the File objects.
const hostFiles = (files, op = 'droppedFiles', args = {}) =>
  track(call(op, args, msg => chrome.webview.postMessageWithAdditionalObjects(msg, files)));

const events = {};   // host -> page, by name; filled further down

// ---------- Settings (settings.json, see SettingsFile.cs) ----------
// Every window holds the merged set (the defaults with your settings.json on top). A change goes to the host,
// which writes your file and sends the new set to every window (events.settings), this one included; the
// settings window (settings.html) and a hand edit of the file arrive the same way.
const settings = { values: {}, defaults: {}, user: [] };
const setting = name => settings.values[name];

// A value set here and not yet confirmed by the host wins over a set the host sent meanwhile: two quick
// changes would otherwise flicker back (the host's set after the first change arrives after the second).
const unconfirmed = new Map();   // name -> count of writes on their way

function setSetting(name, value) {
  if (LAYOUT.has(name)) return setLayout(name, value);
  if (settings.values[name] === value) return;
  settings.values[name] = value;
  applySettings();
  unconfirmed.set(name, (unconfirmed.get(name) ?? 0) + 1);
  host('settingSet', { name, value }).finally(() => {
    if (unconfirmed.get(name) > 1) unconfirmed.set(name, unconfirmed.get(name) - 1);
    else unconfirmed.delete(name);
  });
}
events.settings = ({ settings: s }) => {
  const mine = Object.fromEntries([...unconfirmed.keys()].map(n => [n, settings.values[n]]));
  Object.assign(settings, s);
  mergeLayout();
  Object.assign(settings.values, mine);
  applySettings();
  showThemeSet();
};

// ---------- This window's layout (docs/plans/executed/PLAN-settings-layers.md) ----------
// What is open and shown in this window, kept with its session, so per window and per project: the names of
// defaultLayout in the shipped settings.json. A name this window has no value of (yet) comes from your defaultLayout,
// else the shipped one. settings.values holds them with the global settings, so setting() serves them as any other;
// setSetting() keeps them here, not in settings.json. Menus, actions and keys stay as they are.
let LAYOUT = new Set(), layoutOwn = {};

function layoutValue(name) {
  const shipped = settings.defaults.defaultLayout?.[name], mine = settings.values.defaultLayout?.[name];
  const fits = v => v !== undefined && v !== null && typeof v === typeof shipped;
  return fits(layoutOwn[name]) ? layoutOwn[name] : fits(mine) ? mine : shipped;
}

const windowLayout = () => Object.fromEntries([...LAYOUT].map(n => [n, layoutValue(n)]));

// The layout's values into settings.values (after the host sent the settings, or the window got its layout).
function mergeLayout() {
  LAYOUT = new Set(Object.keys(settings.defaults.defaultLayout ?? {}));
  for (const name of LAYOUT) settings.values[name] = layoutValue(name);
}

// A layout value changed: applied (unless `applied`: the caller did that already), kept with the session, and told to
// the host for this window's settings window.
function setLayout(name, value, applied = false) {
  if (settings.values[name] === value && layoutOwn[name] === value) return;
  layoutOwn[name] = settings.values[name] = value;
  if (applied) { if (appliedSettings) appliedSettings[name] = value; }
  else applySettings();
  layoutChanged();
}
const keepLayout = (name, value) => setLayout(name, value, true);

function layoutChanged() {
  if (!started) return;
  saveSession();
  clearTimeout(layoutChanged.timer);
  layoutChanged.timer = setTimeout(() => host('layoutShown', { layout: windowLayout() }), 150);
}

// From this window's settings window: a row of "this window".
events.layoutSet = ({ name, value }) => setSetting(name, value);

// View > Layout > Save as default: this window's layout becomes defaultLayout in settings.json, the layout new
// projects start with; at once, the message offers Undo (the default as it was).
// With a theme set of its own that new projects do not get yet, the host asks first: the layout and the set, one of
// them, or nothing (docs/plans/executed/PLAN-theme-sets.md, 3.11); Undo puts back both.
async function saveLayoutAsDefault() {
  const answer = await host('saveAsDefault');
  if (!answer) return;
  const before = settings.user.includes('defaultLayout') ? settings.values.defaultLayout : settings.defaults.defaultLayout;
  if (answer.layout) setSetting('defaultLayout', windowLayout());
  const set = answer.set;
  const what = [answer.layout && "This window's layout", set && `the theme set "${set.name}"`].filter(Boolean).join(' and ');
  toast(`${what[0].toUpperCase() + what.slice(1)} ${answer.layout && set ? 'are' : 'is'} now the default for new projects` +
    (set?.for === 'desktop' ? ' on this desktop.' : '.'), true, { label: 'Undo', run: () => {
    if (answer.layout) setSetting('defaultLayout', before);
    if (set) host('themeSetCommand', { kind: 'use', for: set.for, desktop: set.desktop, name: set.before });
  } });
}

// View > Layout > Reset to default: this window's layout back to defaultLayout; its tabs and folder stay.
function resetLayoutToDefault() {
  layoutOwn = {};
  mergeLayout();
  applySettings();
  layoutChanged();
  // The project's own theme set goes too: the desktop's or the app's default again (docs/plans/executed/PLAN-theme-sets.md).
  const own = settings.themeSet?.own;
  if (own) host('themeSet', { set: null });
  toast(own ? `This window has the default layout and theme set again (no longer "${own}").` : 'This window has the default layout again.', true);
}
chrome.webview.addEventListener('message', e => {
  if (e.data.event) return events[e.data.event]?.(e.data);
  const { id, result, error } = e.data;
  const pendingCall = pending.get(id);
  pending.delete(id);
  error ? pendingCall.reject(new Error(error)) : pendingCall.resolve(result);
});

// Errors and warnings are red; `info` (a confirmation) is blue.
// `action` ({ label, run }): a button in the message, as Undo.
function toast(message, info, action) {
  ui.toast.textContent = message;
  if (action) {
    const b = document.createElement('button');
    b.className = 'mm-toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => { ui.toast.hidden = true; action.run(); });
    ui.toast.append(' ', b);
  }
  ui.toast.classList.toggle('mm-info', !!info);
  ui.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ui.toast.hidden = true, 5000);
}
// With the page's own place it came from (file:line), so a report can be traced.
addEventListener('unhandledrejection', e => {
  const at = /\/(\w+\.js):(\d+)/.exec((e.reason?.stack ?? '').split('\n').find(s => /\.js:\d/.test(s) && !/\/lib\//.test(s)) ?? '');
  toast((e.reason?.message || String(e.reason)) + (at ? ` (${at[1]}:${at[2]})` : ''));
});

// ---------- Paths ----------
const dirOf = path => path.slice(0, path.lastIndexOf('\\'));
const nameOf = path => path.slice(path.lastIndexOf('\\') + 1);
const isUrl = s => /^[a-z][a-z0-9+.-]+:|^\/\//i.test(s);
const samePath = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// Resolves a link/image path from a document to an absolute Windows path.
function resolvePath(dir, rel) {
  rel = rel.replace(/\//g, '\\');
  let full = rel;
  if (!/^[a-z]:\\|^\\\\/i.test(rel))
    full = rel.startsWith('\\') ? (state.root || dir) + rel : dir + '\\' + rel;
  const out = [];
  for (const part of full.split('\\')) {
    if (part === '..') { if (out.length > 1) out.pop(); }
    else if (part !== '.' && (part !== '' || out.length < 2)) out.push(part);
  }
  return out.join('\\');
}

// ---------- Markdown ----------
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const md = markdownit({
  html: true,
  linkify: true,
  highlight(code, lang) {
    if (lang === 'mermaid') return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
    // A language with a pack: its own colouring, as in the editor (PLAN-embedded-languages.md 3.3); else highlight.js.
    const pack = fencePack(lang);
    if (pack) return fenceHtml(code, pack);
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    return '';
  },
})
  .use(markdownItAnchor, {
    slugify: s => s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-'),
  })
  .use(markdownitDeflist)
  .use(markdownitEmoji)
  .use(markdownitFootnote)
  .use(markdownitMark)
  .use(markdownitSub)
  .use(markdownitSup)
  .use(markdownitTaskLists)
  // Math is only marked here; KaTeX is loaded and run in render() when a document needs it.
  .use(texmath, {
    delimiters: 'dollars',
    engine: {
      renderToString: (tex, options) =>
        `<span class="tex"${options.displayMode ? ' data-display' : ''}>${escapeHtml(tex)}</span>`,
    },
  });

// A fence's language as a pack (found by name, languages.js), once the colouring engine is there; markdown and
// plain text are left to markdown-it / highlight.js.
function fencePack(lang) {
  if (!lang || !window.CodeMirror?.runMode) return null;
  const name = languageByName(lang);
  return name && name !== 'markdown' && name !== 'plaintext' ? name : null;
}

// Code in a language's own colours, as spans; every token also carries "in-<language>" (its looks, languages.js).
function fenceHtml(code, name) {
  let html = '';
  CodeMirror.runMode(code.replace(/\n$/, ''), languageMode(name), (token, style) => {
    if (token === '\n') { html += '\n'; return; }
    const cls = `${style ? style.replace(/\S+/g, 'cm-$&') + ' ' : ''}cm-in-${name}`;
    html += `<span class="${cls}">${escapeHtml(token)}</span>`;
  });
  return html + '\n';
}

// Markdown with lines you gave a language (3.1.2): the text in parts, each range a code block of its language and
// the rest markdown, with their source lines kept (data-line, for scrolling the two panes together).
function renderMarkdownWithRanges(text, doc) {
  const lines = text.split('\n'), parts = [], tokens = [];
  let at = 0;
  for (const r of [...doc.ranges].map(r => [...rangeLines(doc, r), r.language]).sort((x, y) => x[0] - y[0])) {
    const [from, to, language] = r;
    if (from < at || !packs[language]) continue;
    if (from > at) parts.push({ from: at, text: lines.slice(at, from).join('\n') });
    parts.push({ from, to, language, text: lines.slice(from, to + 1).join('\n') });
    at = to + 1;
  }
  if (at < lines.length) parts.push({ from: at, text: lines.slice(at).join('\n') });
  const env = {}, Token = new md.core.State('', md, env).Token;
  for (const part of parts) {
    if (part.language) {
      const t = new Token('fence', 'code', 0);
      Object.assign(t, { info: part.language, content: part.text + '\n', markup: '```', block: true, map: [part.from, part.to + 1] });
      t.attrSet('data-line', part.from);
      tokens.push(t);
      continue;
    }
    for (const t of md.parse(withFrontMatter(part.text), env)) {   // its lines counted from the part's start
      if (t.map) {
        t.map = [t.map[0] + part.from, t.map[1] + part.from];
        if (t.attrGet('data-line') != null) t.attrSet('data-line', t.map[0]);
      }
      tokens.push(t);
    }
  }
  return md.renderer.render(tokens, md.options, env);
}

// The source line of every block, for scrolling the two panes together.
md.core.ruler.push('source_lines', s => {
  for (const token of s.tokens)
    if (token.map && token.nesting >= 0 && token.type !== 'inline') token.attrSet('data-line', token.map[0]);
});

const scripts = {};
function loadScript(src) {
  return scripts[src] ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error('Could not load ' + src));
    document.head.append(el);
  });
}
function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const el = document.createElement('link');
  el.rel = 'stylesheet';
  el.href = href;
  document.head.append(el);
}

// YAML front matter is shown as a code block instead of a stray <hr> and heading (same line count).
const withFrontMatter = src =>
  src.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/, (_, yaml) => '```yaml\n' + yaml + '\n```\n');

// ---------- Documents and tabs ----------
// A document is one file (or draft) in this window; a tab shows a document in a pane, and a
// document can be in both panes. The text lives in a CodeMirror Doc once the editor has loaded
// (each tab gets a linked Doc of it); until then in doc.text. Only one tab may edit a file: the
// first one in this window, and only when this window holds the file's lock (see AppHost.Lock).
const docs = new Set();
let lastTabId = 0;

const findDoc = path => [...docs].find(d => samePath(d.path, path));
const findDraft = id => [...docs].find(d => d.draft === id);
const docText = doc => doc.cmDoc ? doc.cmDoc.getValue() : doc.text;
const diskText = doc => doc.cmDoc ? doc.cmDoc.getValue(doc.eol) : doc.text;   // with the file's own line endings
const eolOf = text => text.includes('\r\n') ? '\r\n' : '\n';
const docName = doc => doc.label ?? (doc.path ? nameOf(doc.path) : doc.draft);   // label: a compare's saved text
const changed = doc => doc.dirty || doc.draftChanged;

function makeDoc({ path = null, draft = null, text = '', encoding = 'UTF-8' }) {
  const doc = {
    path, draft, text, eol: eolOf(text), language: codeLang(path, text),
    encoding,              // as read from disk (see TextFile.cs); saving writes it back the same way
    savedText: text,       // as last read or saved: the change markers compare with it (gutter.js)
    cmDoc: null, history: null, savedGeneration: 0,
    dirty: false,          // a file with unsaved edits
    draftChanged: false,   // a draft edited in this session
    lock: !path,           // this window may edit it (drafts always)
    shared: false,         // other windows show it read-only: send them the text
    disk: 'ok',            // ok | changed | removed: what happened to the file on disk
    editTab: null,         // the tab that may edit it
    diskReadOnly: false,   // the file has the read-only attribute: every tab of it is read-only
    draftTimer: 0, pushTimer: 0,
    version: 0,            // counts text changes, for the outline cache
  };
  docs.add(doc);
  return doc;
}

async function loadDoc(path) {
  const { text, encoding, readOnly, language, ranges } = await host('read', { path });
  const found = findDoc(path), doc = found ?? makeDoc({ path, text, encoding });
  doc.diskReadOnly = readOnly;
  if (!found && language && packs[language]) {   // chosen for this file before (the language selector)
    doc.language = language === 'markdown' ? undefined : language;
    doc.languageChosen = true;
  }
  if (!found) doc.ranges = rangesFound(text, ranges);   // lines you gave a language, found again in the text
  doc.lock = await host('lock', { path });
  unfresh(path);
  syncWatchFiles();
  return doc;
}

// The document is no longer shown in this window.
function dropDoc(doc, release = true) {
  docs.delete(doc);
  if (doc.marks) saveBookmarks(doc);
  dropPlaces(doc);   // places.js
  clearTimeout(doc.pushTimer);
  if (doc.path && release) host('unlock', { path: doc.path });
  syncWatchFiles();
}

// Markdown opens as the setting says (Options > Settings > Open markdown in); other files in the editor.
// How a file opens: openMode in languages.js.

function makeTab(doc, mode) {
  const article = document.createElement('article');
  article.className = 'mm-preview';
  const tab = {
    id: ++lastTabId, doc, article,
    mode: mode ?? openMode(doc),
    stale: true,         // the preview does not match the text
    cmDoc: null,         // linked CodeMirror Doc, see tabDoc
    previewTop: 0,
    dot: null,           // changed / removed on disk while not looked at
    lines: null,         // source line -> preview position, see lineMap
    renderId: 0,
    pinned: false,       // closing it alone asks first; closing several leaves it open (tab menu: Pin tab)
    readOnly: false,     // set by the user (tab menu: Read-only)
  };
  // Images and diagrams change the heights the line map was built from.
  article.addEventListener('load', () => { tab.lines = null; if (typeof markPreviewCursors === 'function') markPreviewCursors(); }, true);
  if (!doc.editTab || doc.editTab.readOnly) doc.editTab = tab;   // a read-only tab hands the editing on
  return tab;
}

const panes = [0, 1].map(makePane);
const allTabs = () => panes.flatMap(p => p.tabs);
const tabsOf = doc => allTabs().filter(t => t.doc === doc);
const paneOf = tab => panes.find(p => p.tabs.includes(tab));
const activeTab = () => panes[state.activePane].active;
const twoPanes = () => panes[1].tabs.length > 0;
const bothShown = () => twoPanes() && state.hidden === null;   // two panes, neither hidden
// Every tab of a file in this window edits it (the split, plan 13), unless set read-only; another window: the lock.
const editable = tab => tab.doc.lock && !tab.readOnly && !tab.doc.diskReadOnly;

function makePane(index) {
  const el = document.createElement('section');
  el.className = 'mm-pane';
  el.dataset.mode = 'preview';
  el.innerHTML = '<div class="mm-tabs-row"><button class="mm-sync-tree" title="Show the file in the folder pane">' +
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5h11M10 2.5l3 3-3 3M14 10.5H3M6 7.5l-3 3 3 3"/></svg></button>' +
    '<div class="mm-tabs"></div>' +
    '<button class="mm-tabs-more" title="Tabs out of view" hidden></button>' +
    '<button class="mm-pane-button" title="This pane: hide or close it; show a hidden pane">' +
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M8 2.5v11"/></svg></button></div>' +
    '<div class="mm-find" hidden></div>' +
    '<div class="mm-body"><div class="mm-editor-pane"></div>' +
    '<div class="mm-split" title="Drag: the widths of editor and preview; double-click: half and half"></div><div class="mm-preview-pane"></div>' +
    '<nav class="mm-outline"><div class="mm-outline-edge" title="Drag to resize"></div><div class="mm-outline-list"></div></nav>' +
    '<div class="mm-drop" hidden></div><div class="mm-bar" hidden></div></div>';
  const pane = {
    index, el, tabs: [], active: null, cm: null, ignoreScroll: false, ignoreEditorScroll: false,
    tabsEl: el.querySelector('.mm-tabs'), editorEl: el.querySelector('.mm-editor-pane'),
    previewEl: el.querySelector('.mm-preview-pane'), dropEl: el.querySelector('.mm-drop'), barEl: el.querySelector('.mm-bar'),
    outlineEl: el.querySelector('.mm-outline-list'),
  };
  pane.outlineEl.addEventListener('click', e => {
    if (pane.sneakEnded) { pane.sneakEnded = false; return; }   // the release of a sneak preview
    const head = e.target.closest('[data-group-head]');
    if (head) return toggleOutlineGroup(pane, head);      // a group's header: fold or unfold
    const item = e.target.closest('[data-line]');
    if (item) goToLine(pane, +item.dataset.line, true, true);   // placed as a find; the cursor stays (a double-click moves it)
  });
  // A long click: a sneak preview (startSneak).
  pane.outlineEl.addEventListener('pointerdown', e => { pane.sneakEnded = false; startSneak(pane, e); });
  pane.outlineEl.addEventListener('pointermove', e => { if (pane.sneak) sneakTo(pane, e.target.closest('[data-line]')); });
  for (const type of ['pointerup', 'pointercancel']) addEventListener(type, () => endSneak(pane));
  pane.outlineEl.addEventListener('contextmenu', outlineMenu);
  // A double-click: the cursor on the entry's own text in its line, in the editor.
  pane.outlineEl.addEventListener('dblclick', e => {
    const item = e.target.closest('[data-line]');
    if (!item || !pane.cm || pane.active?.mode === 'preview') return;
    const line = +item.dataset.line, ch = Math.min(+item.dataset.ch || 0, pane.cm.getLine(line)?.length ?? 0);
    pane.cm.setCursor(line, ch);
    pane.cm.focus();
  });
  el.querySelector('.mm-outline-edge').addEventListener('pointerdown', e => resizeOutline(e));
  el.querySelector('.mm-split').addEventListener('pointerdown', e => resizeSplit(e));
  el.querySelector('.mm-split').addEventListener('dblclick', () => setSplit(null));
  el.querySelector('.mm-tabs-more').addEventListener('click', e => showTabsMore(pane, e.currentTarget));
  // Alt + mouse wheel: this pane alone, the distance to the other taken again (scroll together, plan 13).
  el.addEventListener('wheel', e => { if (e.altKey && state.sync && keepsDistance()) pane.solo = performance.now(); }, { capture: true, passive: true });
  // The file of the pane's tab in the folder pane (as Visual Studio's "Sync with active document").
  el.querySelector('.mm-sync-tree').addEventListener('click', () => {
    const path = pane.active?.doc.path;
    if (path) showInTree(path); else toast('This file is not saved yet, so it is in no folder.');
  });
  el.querySelector('.mm-tabs').addEventListener('scroll', () => updateTabsMore(pane));
  el.querySelector('.mm-pane-button').addEventListener('click', e => {
    const open = ui.paneMenu.hidden;
    hideMenus();
    if (!open) return;
    menuPaneIndex = index;
    paneItems(ui.paneMenu);
    ui.paneMenu.hidden = false;
    const r = e.currentTarget.getBoundingClientRect();
    ui.paneMenu.style.left = Math.max(4, r.right - ui.paneMenu.offsetWidth) + 'px';
    ui.paneMenu.style.top = r.bottom + 2 + 'px';
  });

  el.addEventListener('pointerdown', () => setActivePane(index), true);
  pane.previewEl.tabIndex = -1;   // can take the focus (Esc from the tree), so the keys scroll it
  // The part of the tab shown that has the focus, editor or preview: the tab gets it back when shown again.
  pane.el.addEventListener('focusin', e => {
    if (!pane.active) return;
    if (pane.editorEl.contains(e.target)) pane.active.focusPart = 'editor';
    else if (pane.previewEl.contains(e.target)) pane.active.focusPart = 'preview';
  });
  pane.previewEl.addEventListener('scroll', () => onPreviewScroll(pane));
  pane.previewEl.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  pane.previewEl.addEventListener('click', e => onPreviewClick(pane, e));
  pane.previewEl.addEventListener('dblclick', e => typeof previewToEditor === 'function' && previewToEditor(pane, e));   // previewjump.js
  pane.previewEl.addEventListener('mousemove', e => {   // a highlight's note as tooltip (highlights.js)
    if (typeof previewNoteAt !== 'function' || !pane.hlSpots?.length) return;
    const note = previewNoteAt(pane, e.clientX, e.clientY) ?? '';
    if (pane.previewEl.title !== note) pane.previewEl.title = note;
  });
  pane.barEl.addEventListener('click', e => onBarClick(pane, e));

  const tabOf = e => pane.tabs.find(t => t.id === +e.target.closest('.mm-tab')?.dataset.tab);
  // The full name above the tabs follows the mouse over the tabs (showDocName).
  pane.tabsEl.addEventListener('mouseover', e => {
    const tab = tabOf(e) ?? null;
    if (tab === hoverTab) return;
    hoverTab = tab;
    showDocName();
  });
  pane.tabsEl.addEventListener('mouseleave', () => {
    hoverTab = null;
    showDocName();
  });
  pane.tabsEl.addEventListener('click', e => {
    const tab = tabOf(e);
    if (!tab) return;
    if (e.target.closest('.mm-tab-close')) return closeTab(tab);
    // Double-click: the other pane goes out of view (two panes), or comes back (one hidden). The first
    // click redraws the tab strip, so the browser's dblclick never comes; the click count does.
    if (e.detail === 2) {
      if (bothShown()) hidePane(1 - index);
      else if (state.hidden !== null) showHiddenPane();
      return;
    }
    activate(pane, tab).then(() => focusPane(pane));   // the tab's editor or preview, as it had the focus last
  });
  pane.tabsEl.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });   // no autoscroll
  pane.tabsEl.addEventListener('auxclick', e => {
    const tab = e.button === 1 && tabOf(e);
    if (tab) closeTab(tab);
  });
  // Right-click a tab: its menu; the empty part of the bar: reopen a closed tab.
  pane.tabsEl.addEventListener('contextmenu', e => {
    const tab = tabOf(e);
    menuPaneIndex = index;
    if (tab) return showMenu(ui.tabMenu, e, () => {
      menuTab = tab;
      paneItems(ui.tabMenu);
      favouriteItem(ui.tabMenu, tab.doc.path);
      ui.tabMenu.querySelector('[data-cmd=tabPin]').textContent = tab.pinned ? 'Unpin tab' : 'Pin tab';
      ui.tabMenu.querySelector('[data-cmd=tabReadOnly]').classList.toggle('mm-on', tab.readOnly || tab.doc.diskReadOnly);
      ui.tabMenu.querySelector('[data-cmd=tabShowInTree]').hidden = !tab.doc.path;
      ui.tabMenu.querySelector('[data-cmd=tabRevert]').hidden = !canRevert(tab.doc);
      const other = panes[1 - index].active;   // the compare (compare.js)
      ui.tabMenu.querySelector('[data-cmd=tabCompareOther]').hidden = !twoPanes() || !other || other.doc === tab.doc;
      ui.tabMenu.querySelector('[data-cmd=tabCompareSaved]').hidden = !tab.doc.path || !changed(tab.doc);
      leftSideItems(ui.tabMenu, 'tab', tab.doc.path, false);
    });
    ui.stripMenu.querySelector('button').disabled = !closedTabs.length;
    ui.stripMenu.querySelector('[data-cmd=stripCloseAll]').disabled = !pane.tabs.length;
    showMenu(ui.stripMenu, e, () => { menuPane = pane; paneItems(ui.stripMenu); });
  });
  pane.tabsEl.addEventListener('dragstart', e => {
    const tab = tabOf(e);
    if (!tab) return;
    draggedTab = tab;
    e.dataTransfer.setData(TAB_TYPE, JSON.stringify({ win: state.win, tab: tab.id }));
    if (tab.doc.path) e.dataTransfer.setData('text/plain', tab.doc.path);
    e.dataTransfer.effectAllowed = 'move';
  });
  // Dropped outside every window: the tab gets a window of its own.
  pane.tabsEl.addEventListener('dragend', e => {
    hideDrops();
    draggedTab = null;
    const tab = tabOf(e);
    if (!tab || e.dataTransfer.dropEffect !== 'none') return;
    const inside = e.screenX >= screenX && e.screenX < screenX + outerWidth && e.screenY >= screenY && e.screenY < screenY + outerHeight;
    if (!inside) moveTab(tab, 'new', { screenX: Math.round(e.screenX * devicePixelRatio), screenY: Math.round(e.screenY * devicePixelRatio) });
  });

  el.addEventListener('dragover', e => {
    // A tab of this window over a tab bar: it goes between the tabs, at the marker.
    if (draggedTab && e.target.closest('.mm-tabs')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      hideDrops();
      const at = stripIndex(pane, e.clientX, e.clientY);
      pane.tabsEl.children[at]?.classList.add('mm-insert');
      pane.tabsEl.classList.toggle('mm-insert-end', at === pane.tabs.length);
      return;
    }
    // Images over the editor become links there (CodeMirror shows where): no pane marker.
    if (e.target.closest('.CodeMirror') && dragHasImages(e.dataTransfer)) return hideDrops();
    const target = dropTarget(pane, e);
    if (!target) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move';
    hideDrops();
    pane.dropEl.hidden = false;
    pane.dropEl.dataset.half = target === pane ? '' : state.orient;
  });
  el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) pane.dropEl.hidden = true; });
  el.addEventListener('drop', e => {
    if (e.defaultPrevented) return hideDrops();   // the editor took it (images, see onEditorDrop)
    if (draggedTab && e.target.closest('.mm-tabs')) {
      e.preventDefault();
      hideDrops();
      return moveToPane(draggedTab, pane, stripIndex(pane, e.clientX, e.clientY));
    }
    const target = dropTarget(pane, e);
    hideDrops();
    if (!target) return;
    e.preventDefault();
    onDrop(e.dataTransfer, target);
  });
  return pane;
}
ui.panes.prepend(panes[0].el);
ui.panes.append(panes[1].el);

// ---------- Find in a pane ----------
// Find / find next / previous / replace search the pane the user works in (find.js, loaded on first use).
// They replace CodeMirror's search box and WebView2's own find, which searches the whole window.
async function findKey(action, pane) {
  pane ??= panes.find(p => !p.el.hidden && p.el.contains(document.activeElement)) ?? panes[state.activePane];
  await loadScript('find.js');
  findCommand(pane, action);
}

// ---------- Editor ----------
let editorLoaded;
function loadEditor() {
  loadCss('vendor/editor.css');
  // format.js: the formatting commands and bar; it needs CodeMirror, so it comes second.
  return editorLoaded ??= loadScript('vendor/editor.js').then(() => loadScript('format.js'))
    .then(() => loadScript('bookmarks.js')).then(() => loadScript('diff.js')).then(() => loadScript('gutter.js')).then(() => loadScript('brackets.js'))
    .then(() => loadScript('guides.js')).then(() => loadScript('complete.js')).then(() => loadScript('overview.js'));
}

// The editor mode: the language's, with blocks of other languages and lines you set (documentMode, languages.js).
const editorMode = doc => documentMode(doc);

// Markdown keys (Enter, Tab in tables); in code files the key keeps its editor default.
const markdownOnly = run => editor =>
  panes.find(p => p.cm === editor)?.active?.doc.language ? CodeMirror.Pass : run(editor);

// The document's own CodeMirror Doc, created when the editor is first needed.
function materialize(doc) {
  if (doc.cmDoc) return doc.cmDoc;
  doc.cmDoc = CodeMirror.Doc(doc.text, editorMode(doc));
  if (doc.history) doc.cmDoc.setHistory(doc.history);   // moved here from another window
  doc.history = null;
  // A file moved here with unsaved edits stays unsaved, even when undone (-1 never matches).
  doc.savedGeneration = doc.dirty ? -1 : doc.cmDoc.changeGeneration(true);
  doc.cmDoc.on('change', () => onDocChange(doc));
  attachRanges(doc);   // lines you gave a language follow the edits
  if (typeof markHighlights === 'function') markHighlights(doc);   // highlights.js: on the main Doc, every tab shows them
  return doc.cmDoc;
}

// Each tab edits a linked Doc with shared history, so both panes show the same text live.
// A tab restored from the session gets its cursor and editor scroll position back here (restoreCursor).
function tabDoc(tab) {
  if (tab.cmDoc) return tab.cmDoc;
  // CodeMirror copies the main Doc's shared marks into a new linked Doc and fails on a shared bookmark (bookmarks.js):
  // its find() is a place, not a range. Those are left out of the copy (CodeMirror copies no
  // empty mark anyway); their places stay right on the main Doc.
  const root = materialize(tab.doc), shared = root.getAllMarks().filter(m => m.parent && m.type === 'bookmark');
  const parents = shared.map(m => m.parent);
  for (const m of shared) m.parent = null;
  try { tab.cmDoc = root.linkedDoc({ sharedHist: true }); } finally { shared.forEach((m, i) => m.parent = parents[i]); }
  if (typeof signHighlights === 'function') signHighlights(tab.doc, tab.cmDoc);   // highlights.js: the note signs in this tab too
  const at = tab.restoreCursor;
  if (at) {
    tab.cmDoc.setCursor(Math.min(at.line, tab.cmDoc.lastLine()), at.ch);
    tab.cmDoc.scrollTop = at.top ?? 0;   // the editor takes it over when it shows this document
    tab.restoreCursor = null;
  }
  return tab.cmDoc;
}

function releaseTabDoc(tab) {
  if (!tab.cmDoc) return;
  for (const pane of panes) if (pane.cm?.getDoc() === tab.cmDoc) pane.cm.swapDoc(CodeMirror.Doc(''));
  tab.doc.cmDoc.unlinkDoc(tab.cmDoc);
  tab.cmDoc = null;
  if (typeof remarkHighlights === 'function' && tab.doc.hls?.list.length) remarkHighlights(tab.doc);   // highlights.js
}

async function ensureEditor(pane) {
  if (pane.cm) return;
  await loadEditor();
  if (pane.cm) return;
  pane.editorEl.append(makeFormatBar(pane), makeCodeBar(pane));   // see format.js
  pane.cm = CodeMirror(pane.editorEl, {
    value: '',
    lineNumbers: true,
    lineWrapping: setting('wrap'),
    indentUnit: 2,
    tabSize: 4,
    extraKeys: formatKeys(),
    gutters: ['CodeMirror-linenumbers', BM_GUTTER],   // all columns: setupGutter (gutter.js)
    scrollbarStyle: 'mmHorizontal',   // the vertical scroll bar is the overview strip (overview.js)
  });
  // The last line has no line end (showLineEnds): the line elements know which one is the last.
  pane.cm.on('renderLine', (cm, line, el) => {
    el.classList.toggle('mm-last-line', cm.getLineNumber(line) === cm.lastLine());
    drawTabs(cm, line, el);   // a tab after text to the next tab stop (tabs.js)
  });
  applyWhitespace();
  pane.cm.on('gutterClick', (cm, line, gutter) => {
    if (gutter === BM_GUTTER && pane.active) toggleFreeBookmark(pane, line, 0);
    if (gutter === GIT_GUTTER && pane.active) showGitChange(pane, line);
  });
  // Bookmarks move with the text; a removed line can put two on one line: draw them again. The change
  // and git markers follow the text too.
  pane.cm.on('changes', () => {
    clearTimeout(pane.bookmarkTimer);
    pane.bookmarkTimer = setTimeout(() => paintBookmarks(pane), 150);
    scheduleGutter(pane);
  });
  pane.cm.on('cursorActivity', () => {
    updateInnerBar(pane);   // the inner language's bar (format.js)
    markOutline(pane);   // the outline's entry at the cursor
    updateRelativeNumbers(pane);
    markCursorLines(pane);   // the cursor's line in the gutter (gutter.js)
    if (typeof markPreviewCursors === 'function') markPreviewCursors(true);   // and in the preview, kept in view (previewjump.js)
    saveSession();   // the cursor is kept in the session (after a second without moving)
    refreshFormatBar(pane);
    if (pane.index === state.activePane) updateStatus();
  });
  pane.cm.on('scroll', () => onEditorScroll(pane));
  pane.cm.on('paste', (cm, e) => onEditorPaste(pane, e));
  pane.cm.on('change', (cm, change) => electricReformat(cm, change));   // a closing word typed: its column (format.js)
  setupColumn(pane);   // column mode and blocks (column.js); its paste handler comes after the picture one
  setupVirtual(pane);   // the cursor past the end of the line (virtual.js); its keys before column mode's
  setupCursors(pane);   // multiple cursors (cursors.js); its keys before virtual.js's
  setupBrackets(pane);   // matching brackets: the highlight, closing signs while typing (brackets.js)
  setupGuides(pane);   // indent guides (guides.js)
  setupRuler(pane);   // the ruler, column guides and manual tabs (ruler.js)
  setupPlaces(pane);   // the places the cursor jumped from, for Position back / forward (places.js)
  setupComplete(pane);   // word completion: the document's words, the pause in typing (complete.js)
  setupOverview(pane);   // the marks along the scroll bar (overview.js)
  pane.cm.on('drop', (cm, e) => onEditorDrop(pane, e));
  pane.cm.getWrapperElement().addEventListener('wheel', e => {   // Ctrl+wheel: the editor font size
    if (!e.ctrlKey) return;
    e.preventDefault();
    editorSizeBy(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
}

function onDocChange(doc) {
  if (typeof highlightsEdited === 'function') highlightsEdited(doc);   // highlights.js: written again a second later
  const clean = doc.cmDoc.isClean(doc.savedGeneration);
  const before = changed(doc);
  if (doc.draft) {
    doc.draftChanged = !clean;
    clearTimeout(doc.draftTimer);
    doc.draftTimer = setTimeout(() => writeDraft(doc), 1000);   // after a second without typing
  } else doc.dirty = !clean;
  for (const tab of tabsOf(doc)) {
    tab.stale = true;
    tab.lines = null;
    if (paneOf(tab).active === tab && tab.mode === 'split') scheduleRender(tab);
  }
  doc.version++;
  scheduleOutline();
  if (doc.shared && doc.lock) {
    clearTimeout(doc.pushTimer);
    doc.pushTimer = setTimeout(() => pushText(doc), 300);
  }
  if (changed(doc) !== before) {
    refreshTabs();
    updateChrome();
  }
}

// Replaces the text with what is on disk (or what another window sent); not an edit.
function setDocText(doc, text, encoding) {
  doc.version++;
  doc.text = doc.savedText = text;
  if (encoding) doc.encoding = encoding;
  doc.eol = eolOf(text);
  if (doc.cmDoc) {
    const kept = doc.marks && bookmarkList(doc);
    const keptHighlights = typeof keepHighlights === 'function' && keepHighlights(doc);   // highlights.js
    doc.cmDoc.setValue(text);
    if (kept) reloadBookmarks(doc, kept);
    if (keptHighlights) placeHighlightsAgain(doc, keptHighlights);
    doc.cmDoc.clearHistory();
    doc.savedGeneration = doc.cmDoc.changeGeneration(true);
  }
  doc.dirty = false;
  doc.disk = 'ok';
  for (const tab of tabsOf(doc)) {
    tab.stale = true;
    tab.lines = null;
  }
  if (doc.lock && doc.shared) pushText(doc);
}

// Revert to saved (File menu, tab menu): the file as it is on disk, as one edit, so Ctrl+Z gives the changes back;
// then it counts as saved. Only for a file whose text differs from the disk (changed here, or there) and still
// exists.
const canRevert = doc => !!doc?.path && doc.lock && doc.disk !== 'removed' && (doc.dirty || doc.disk === 'changed');
async function revertDoc(doc) {
  if (!canRevert(doc)) return;
  const { text, encoding, readOnly } = await host('read', { path: doc.path });
  doc.diskReadOnly = readOnly;
  if (!doc.cmDoc) return reloadDoc(doc, text, encoding);    // never in an editor: no undo to keep
  const cd = doc.cmDoc, keep = panes.filter(p => p.active?.doc === doc && p.cm).map(p => ({ p, top: p.cm.getScrollInfo().top }));
  const cursor = cd.getCursor();
  const keptHighlights = typeof keepHighlights === 'function' && keepHighlights(doc);   // highlights.js
  cd.replaceRange(text, CodeMirror.Pos(cd.firstLine(), 0), CodeMirror.Pos(cd.lastLine(), cd.getLine(cd.lastLine()).length), 'revert');
  if (keptHighlights) placeHighlightsAgain(doc, keptHighlights);
  doc.savedText = text;
  if (encoding) doc.encoding = encoding;
  doc.eol = eolOf(text);
  doc.savedGeneration = cd.changeGeneration(true);
  doc.dirty = false;
  doc.disk = 'ok';
  cd.setCursor(CodeMirror.Pos(Math.min(cursor.line, cd.lastLine()), cursor.ch));
  for (const { p, top } of keep) p.cm.scrollTo(null, top);
  refreshTabs();
  updateChrome();
  await showAll();
  saveSession();
}

// Same, keeping the scroll positions and the cursor of the panes that show it.
async function reloadDoc(doc, text, encoding) {
  const keep = panes.filter(p => p.active?.doc === doc).map(p => ({
    p, top: p.previewEl.scrollTop,
    editor: p.cm && p.active.cmDoc && { cursor: p.active.cmDoc.getCursor(), top: p.cm.getScrollInfo().top },
  }));
  setDocText(doc, text, encoding);
  for (const { p, top, editor } of keep) {
    p.active.previewTop = top;
    await showActive(p);
    p.previewEl.scrollTop = top;
    if (editor && p.cm) {
      p.cm.setCursor(editor.cursor);
      p.cm.scrollTo(null, editor.top);
    }
  }
  refreshTabs();
  updateChrome();
}

// ---------- Rendering ----------
const render = tab => track(renderNow(tab));
async function renderNow(tab) {
  const id = ++tab.renderId;
  tab.stale = false;
  tab.lines = null;
  tab.lineBlocks = null;
  const doc = tab.doc, text = docText(doc), article = tab.article;

  // Built in a <template> so images are not requested before their paths are fixed.
  // A code file: its language's colouring (languages.js, the editor script has the colouring engine); markdown
  // too when it has fenced code or lines you gave a language (coloured by their packs).
  const needsEngine = doc.language || doc.ranges?.length || /^\s*(`{3,}|~{3,})\s*[\w#+.-]/m.test(text);
  if (needsEngine && !window.CodeMirror?.runMode) {
    await loadEditor();
    if (id !== tab.renderId) return;
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = doc.language
    ? `<pre class="mm-code" data-lang="${doc.language}">${codeHtml(text, text.length > PREVIEW_COLOUR_LIMIT ? 'text/plain' : editorMode(doc))}</pre>`
    : doc.ranges?.length ? renderMarkdownWithRanges(text, doc) : md.render(withFrontMatter(text));
  const content = tpl.content;
  if (doc.language && hasLongLine(text)) content.firstElementChild.classList.add('mm-long-line');

  const dir = doc.path ? dirOf(doc.path) : state.root;
  if (dir) {
    for (const img of content.querySelectorAll('img[src]')) {
      const src = img.getAttribute('src');
      if (!isUrl(src)) img.src = FILE_URL + encodeURIComponent(resolvePath(dir, safeDecode(src.split(/[?#]/)[0])));
    }
  }

  // GitHub alerts: > [!NOTE]
  for (const p of content.querySelectorAll('blockquote > p:first-child')) {
    const m = p.innerHTML.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/);
    if (!m) continue;
    const kind = m[1].toLowerCase();
    p.innerHTML = p.innerHTML.slice(m[0].length);
    p.parentElement.classList.add('mm-alert', 'mm-alert-' + kind);
    p.insertAdjacentHTML('beforebegin', `<p class="mm-alert-title">${m[1][0]}${kind.slice(1)}</p>`);
  }

  for (const code of content.querySelectorAll('pre > code'))
    if (hasLongLine(code.textContent)) code.parentElement.classList.add('mm-long-line');

  article.replaceChildren(content);

  const formulas = article.querySelectorAll('.tex');
  if (formulas.length) {
    loadCss('vendor/katex/katex.min.css');
    await loadScript('vendor/katex/katex.min.js');
    if (id !== tab.renderId) return;
    for (const el of formulas)
      katex.render(el.textContent, el, { displayMode: el.hasAttribute('data-display'), throwOnError: false });
  }

  const diagrams = article.querySelectorAll('pre.mermaid');
  if (diagrams.length) {
    await loadScript('vendor/mermaid.min.js');
    if (id !== tab.renderId) return;
    mermaid.initialize({ startOnLoad: false, theme: state.theme === 'dark' ? 'dark' : 'default' });
    await mermaid.run({ nodes: diagrams, suppressErrors: true });
  }
  tab.lines = null;
  tab.lineBlocks = null;   // the blocks by source line (previewjump.js), and the cursor's bar in the preview
  if (typeof markPreviewCursors === 'function') markPreviewCursors();
  if (typeof drawPreviewHighlights === 'function') for (const pane of panes) if (pane.active === tab) drawPreviewHighlights(pane);   // highlights.js
  if (typeof schedulePreviewOverviews === 'function') schedulePreviewOverviews();   // the preview's scroll bar (previewoverview.js)
}

function scheduleRender(tab) {
  clearTimeout(tab.renderTimer);
  tab.renderTimer = setTimeout(() => paneOf(tab)?.active === tab && render(tab), 150);
}

let welcome;
function welcomeArticle() {
  if (!welcome) {
    welcome = document.createElement('article');
    welcome.className = 'mm-preview';
    welcome.innerHTML = WELCOME;
  }
  return welcome;
}

function scrollToAnchor(pane, id) {
  pane.previewEl.querySelector('#' + CSS.escape(safeDecode(id)))?.scrollIntoView();
}

function onPreviewClick(pane, e) {
  const href = e.target.closest('a')?.getAttribute('href');
  if (!href) return;
  const tab = pane.active;
  if (href.startsWith('#')) {
    e.preventDefault();
    scrollToAnchor(pane, href.slice(1));
  } else if (!isUrl(href)) {
    // Relative link: open other documents in place (Ctrl+click: in a new tab). Web links fall
    // through to the host, which opens them in the default browser.
    e.preventDefault();
    const [path, anchor] = href.split('#');
    const target = resolvePath(tab?.doc.path ? dirOf(tab.doc.path) : state.root || '', safeDecode(path));
    if (codeLang(target) === 'plaintext') return;
    if (!tab || e.ctrlKey || tab.doc.draft) openFile(target, { pane, anchor });
    else navigate(tab, target, anchor);
  }
}

// ---------- Panes ----------
function layout() {
  if (state.hidden !== null && (!twoPanes() || !panes[state.hidden].tabs.length)) state.hidden = null;
  const two = bothShown();
  if (!two) state.activePane = state.hidden === 0 ? 1 : 0;   // the one pane that is shown
  document.body.toggleAttribute('data-two', two);
  document.body.toggleAttribute('data-pane-hidden', state.hidden !== null);
  document.body.dataset.orient = state.orient;
  panes[0].el.hidden = state.hidden === 0;
  panes[1].el.hidden = !twoPanes() || state.hidden === 1;
  ui.divider.hidden = !two;
  ui.panes.style.setProperty('--ratio', `calc(${state.ratio}% - 3px)`);
  for (const pane of panes) pane.el.classList.toggle('mm-active', pane.index === state.activePane);
  ui.sync.classList.toggle('mm-on', state.sync);
  document.body.toggleAttribute('data-align-line', !keepsDistance());   // no Level button (app.css)
  updatePaneMarks();
}

// The bottom bar: per pane a page with an arrow to where it is (left / right, or up / down when above each other)
// and an eye: shown, or struck through when hidden. Grey without documents. The eye shows or hides the pane.
const PANE_EYE = '<path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/>';
const PANE_ARROWS = { left: 'M12 13.5H3M5.5 11L3 13.5 5.5 16', right: 'M2 13.5h9M8.5 11l2.5 2.5L8.5 16',
  up: 'M7 16v-5.5M4.5 13L7 10.5 9.5 13', down: 'M7 10.5V16M4.5 13.5L7 16l2.5-2.5' };
function updatePaneMarks() {
  for (const el of document.querySelectorAll('.mm-st-pane')) {
    const index = Number(el.dataset.pane), pane = panes[index], count = pane.tabs.length;
    const side = state.orient === 'h' ? (index ? 'down' : 'up') : (index ? 'right' : 'left');
    const where = { left: 'Left', right: 'Right', up: 'Top', down: 'Bottom' }[side] + ' pane';
    const shown = count > 0 && state.hidden !== index;
    const key = [side, count > 0, shown].join();
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.innerHTML = '<svg class="mm-st-pane-page" viewBox="0 0 14 17" width="13" height="16" fill="none" stroke="currentColor" stroke-width="1.2">' +
        `<rect x="2.5" y="0.6" width="9" height="8.5" rx="1"/><path d="M4.5 3.2h5M4.5 5h5M4.5 6.8h3"/><path d="${PANE_ARROWS[side]}"/></svg>` +
        '<button class="mm-st-eye"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3">' +
        PANE_EYE + (shown ? '' : '<path d="M2.5 13.5l11-11"/>') + '</svg></button>';
    }
    el.classList.toggle('mm-empty', !count);
    el.classList.toggle('mm-off', !shown);
    el.querySelector('.mm-st-pane-page').setAttribute('aria-label', where);
    el.title = `${where}: ${count === 1 ? '1 document' : `${count} documents`}`;
    el.querySelector('.mm-st-eye').title = !count ? `${where}: no documents`
      : shown ? (canHide(index) ? `Hide the ${where.toLowerCase()}` : `${where}: the only one with documents`)
      : `Show the ${where.toLowerCase()}`;
  }
}

// A shown pane can be hidden when the other one has documents (it is then shown instead: never both hidden).
const canHide = index => panes[index].tabs.length > 0 && state.hidden !== index && panes[1 - index].tabs.length > 0;

function togglePaneShown(index) {
  if (!panes[index].tabs.length) return;
  if (state.hidden === index) return showHiddenPane();
  if (!canHide(index)) return;
  if (state.hidden === null) return hidePane(index);
  // The other one is hidden: this one goes, that one comes back.
  const pane = panes[index], other = panes[state.hidden];
  if (pane.active) pane.active.previewTop = pane.previewEl.scrollTop;
  state.hidden = index;
  layout();
  if (other.active && other.active.mode !== 'edit') other.previewEl.scrollTop = other.active.previewTop;
  afterPaneChange();
}
document.querySelector('.mm-st-panes').addEventListener('click', e => {
  const eye = e.target.closest('.mm-st-eye');
  if (eye) togglePaneShown(Number(eye.closest('.mm-st-pane').dataset.pane));
});

function setActivePane(index) {
  if (state.activePane === index || panes[index].el.hidden) return;
  state.activePane = index;
  layout();
  updateChrome();
  updateStatus();
  saveSession();
}

// Hide a pane with its tabs, or show it again. A hidden element loses its scroll position, so the
// preview goes back to where its tab was.
function hidePane(index) {
  if (!bothShown()) return;
  const pane = panes[index];
  if (pane.active) pane.active.previewTop = pane.previewEl.scrollTop;
  state.hidden = index;
  afterPaneChange();
}

function showHiddenPane() {
  const pane = panes[state.hidden];
  if (!pane) return;
  state.hidden = null;
  layout();
  if (pane.active && pane.active.mode !== 'edit') pane.previewEl.scrollTop = pane.active.previewTop;
  afterPaneChange();
}

// Closes the pane's tabs (each asks about unsaved changes, as Ctrl+W). The first pane is the one that
// always stays, so closing it moves the second pane's tabs into it.
// Pinned tabs stay: in the main pane they stay where they are, the second pane's go to the main pane
// (Options > Settings > Move pinned tabs; off, they keep the second pane open).
async function closePane(index) {
  if (!bothShown()) return;
  await closeTabs([...panes[index].tabs]);
  const kept = panes[index].tabs;
  if (kept.some(t => !t.pinned)) return;   // kept for its unsaved changes
  if (index === 1 && kept.length) {
    if (!setting('movePinned')) return;
    for (const tab of [...kept]) await intoMainPane(tab);
  }
  if (index === 0) {
    const active = panes[1].active;
    for (const tab of [...panes[1].tabs]) await intoMainPane(tab);
    if (active && paneOf(active)) await activate(panes[0], active);
  }
  afterPaneChange();
}

// To the end of the main pane; a file the main pane already shows is not shown twice.
async function intoMainPane(tab) {
  const there = panes[0].tabs.find(t => t.doc === tab.doc);
  if (!there) return moveToPane(tab, panes[0], panes[0].tabs.length);
  there.pinned ||= tab.pinned;
  detachTab(tab);
  releaseTabDoc(tab);
}

function afterPaneChange() {
  layout();
  relayout();
  refreshTabs();
  updateChrome();
  saveSession();
}

// The pane items of a menu, each only where it applies.
let menuPaneIndex = 0;
function paneItems(menu) {
  const two = bothShown();
  for (const b of menu.querySelectorAll('.mm-pane-item'))
    b.hidden = b.dataset.cmd === 'paneShow' ? state.hidden === null : !two;
  const sep = menu.querySelector('.mm-pane-sep');
  if (sep) sep.hidden = !two && state.hidden === null;
}

// After a resize: editors measure again, line maps are rebuilt.
function relayout() {
  for (const pane of panes) pane.cm?.refresh();
  for (const tab of allTabs()) tab.lines = null;
}
addEventListener('resize', () => { for (const tab of allTabs()) tab.lines = null; });

// Shows the pane's active tab (or the welcome page when it has none).
async function showActive(pane) {
  layout();
  if (typeof markPreviewCursors === 'function') markPreviewCursors();
  if (typeof schedulePreviewOverviews === 'function') schedulePreviewOverviews();
  const tab = pane.active;
  if (!tab) {
    pane.el.dataset.mode = 'preview';
    if (pane.index === 0) pane.previewEl.replaceChildren(welcomeArticle());
    pane.barEl.hidden = true;
  } else {
    pane.el.dataset.mode = tab.mode;
    if (typeof loadHighlights === 'function') { loadHighlights(tab.doc); tellHighlightsWindow(); }   // highlights.js
    const swapped = pane.previewEl.firstChild !== tab.article;
    if (swapped) pane.previewEl.replaceChildren(tab.article);
    if (tab.mode !== 'edit' && tab.stale) render(tab);   // builds the content before the first await
    if (swapped) pane.previewEl.scrollTop = tab.previewTop;
    if (tab.mode !== 'preview') {
      await track(ensureEditor(pane));
      if (pane.active !== tab) return;
      const doc = tabDoc(tab);
      if (pane.cm.getDoc() !== doc) pane.cm.swapDoc(doc);
      setupGutter(pane);
      loadBookmarks(tab.doc).then(() => pane.active === tab && paintBookmarks(pane));
      loadRulerLines(tab.doc);   // the ruler's tab stops and helper lines (ruler.js)
      if (tab.doc.gitHead === undefined) loadGitHead(tab.doc).then(() => pane.active === tab && paintGit(pane));
      const mode = editorMode(tab.doc), modeKey = JSON.stringify(mode);
      if (pane.modeKey !== modeKey) {   // setting the mode re-colours the whole file, even when it is the same
        pane.modeKey = modeKey;
        pane.cm.setOption('mode', mode);
      }
      pane.cm.setOption('readOnly', !editable(tab));
      applyTabStops(pane, tab.doc);   // tab and indent sizes of its language (tabs.js)
      if (tab.doc.language) pane.editorEl.dataset.lang = tab.doc.language; else delete pane.editorEl.dataset.lang;
      fillCodeBar(pane);
      pane.cm.refresh();
      updateInnerBar(pane);
      refreshFormatBar(pane);
    }
    updateBar(pane);
  }
  showOutline(pane);
  refreshTabs(pane);
  updateChrome();
  if (pane.index === state.activePane) updateStatus();
}

const showAll = () => Promise.all(panes.map(showActive));

// Back / forward, like a browser, for the whole window: every switch to another tab and every link
// followed inside a tab is a step. Entries: { tab: id, path, top }.
const navHistory = { back: [], forward: [] };
let goingBack = false;   // a back/forward step itself is not recorded

function remember(tab, path) {
  if (!started || goingBack || !tab) return;
  const pane = paneOf(tab);
  const top = pane?.active === tab ? pane.previewEl.scrollTop : tab.previewTop;
  const last = navHistory.back.at(-1);
  if (last?.tab === tab.id && samePath(last.path, path)) last.top = top;
  else navHistory.back.push({ tab: tab.id, path, top });
  if (navHistory.back.length > 100) navHistory.back.shift();
  navHistory.forward.length = 0;
}

// One step: to the tab of the entry (skipping tabs closed since), showing the entry's file again.
async function go(from, to) {
  const here = activeTab();
  while (from.length) {
    const entry = from.pop();
    const tab = allTabs().find(t => t.id === entry.tab);
    if (!tab || (tab === here && samePath(tab.doc.path, entry.path))) continue;
    goingBack = true;
    try {
      if (here) {
        const herePane = paneOf(here);
        to.push({ tab: here.id, path: here.doc.path, top: herePane.active === here ? herePane.previewEl.scrollTop : here.previewTop });
      }
      const pane = paneOf(tab);
      if (!samePath(tab.doc.path, entry.path) && entry.path) {
        if (!await navigate(tab, entry.path, null, true).catch(() => false)) {
          to.pop();
          continue;   // the file is gone (or unsaved changes were kept): the step before that
        }
      } else await activate(pane, tab);
      if (tab.mode !== 'edit') pane.previewEl.scrollTop = tab.previewTop = entry.top;
    } finally {
      goingBack = false;
    }
    return;
  }
}

async function activate(pane, tab) {
  const before = activeTab();
  if (before && before !== tab) remember(before, before.doc.path);
  if (state.hidden === pane.index) showHiddenPane();   // something sent to the hidden pane brings it back
  if (pane.active && pane.active !== tab) pane.active.previewTop = pane.previewEl.scrollTop;
  pane.active = tab;
  noteActive(tab);
  if (tab.dot === 'changed') tab.notice = true;   // reloaded while in the background: say so now
  tab.dot = null;
  if (tab.doc.path) unfresh(tab.doc.path);
  state.activePane = pane.index;
  await showActive(pane);
  saveSession();
}

// A new tab: after the active one, but never before or among the pinned tabs (after the last of them); `last`: at the
// end (a file opened into a window that was closed, its tabs as they were).
function insertTab(pane, tab, last = false) {
  const active = pane.tabs.indexOf(pane.active);
  let at = last || active < 0 ? pane.tabs.length : active + 1;
  if (!tab.pinned) at = Math.max(at, pane.tabs.findLastIndex(t => t.pinned) + 1);
  pane.tabs.splice(at, 0, tab);
}

// Takes the tab out of its pane; the neighbor becomes active.
function detachTab(tab) {
  const pane = paneOf(tab);
  const at = pane.tabs.indexOf(tab);
  pane.tabs.splice(at, 1);
  if (pane.cm?.getDoc() === tab.cmDoc) pane.cm.swapDoc(CodeMirror.Doc(''));
  if (pane.active === tab) {
    pane.active = pane.tabs[Math.min(at, pane.tabs.length - 1)] ?? null;
    if (pane.active) pane.active.dot = null;
  }
  // The other tab of the document may edit it now (unless it is read-only).
  if (tab.doc.editTab === tab) tab.doc.editTab = tabsOf(tab.doc).find(t => !t.readOnly) ?? tabsOf(tab.doc)[0] ?? null;
  return pane;
}

// `index`: the position in the target's tab bar (dropped between tabs); otherwise after the active tab.
async function moveToPane(tab, target, index) {
  const from = paneOf(tab);
  if (from === target) {
    if (index !== undefined) {
      const at = from.tabs.indexOf(tab);
      from.tabs.splice(at, 1);
      from.tabs.splice(index > at ? index - 1 : index, 0, tab);
    }
    return activate(target, tab);
  }
  const existing = target.tabs.find(t => t.doc === tab.doc);   // a document is in a pane only once
  if (existing) return activate(target, existing);
  tab.previewTop = from.active === tab ? from.previewEl.scrollTop : tab.previewTop;
  detachTab(tab);
  tab.doc.editTab ??= tab;   // detachTab found no other tab to hand the editing to: it stays with this one
  if (index === undefined) insertTab(target, tab); else target.tabs.splice(index, 0, tab);
  await activate(target, tab);
  await showAll();
}

const otherPane = () => panes[1 - state.activePane];   // with one pane: the second, which then appears

// ---------- Tab strips ----------
function refreshTabs(only) {
  for (const pane of only ? [only] : panes) {
    pane.tabsEl.replaceChildren(...pane.tabs.map(tab => tabElement(pane, tab)));
    if (setting('tabBar') === 'menu') pane.tabsEl.querySelector('.mm-tab.mm-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    updateTabsMore(pane);
  }
  markTreeActive();
  updatePaneMarks();   // the number of documents per pane
}

// Tab bar "menu": the tabs not (fully) in view, and the button that lists them (with their number).
function hiddenTabs(pane) {
  const box = pane.tabsEl.getBoundingClientRect();
  return pane.tabs.filter(tab => {
    const r = pane.tabsEl.querySelector(`[data-tab="${tab.id}"]`)?.getBoundingClientRect();
    return r && (r.left < box.left - 1 || r.right > box.right + 1);
  });
}

function updateTabsMore(pane) {
  const button = pane.el.querySelector('.mm-tabs-more'), hidden = setting('tabBar') === 'menu' ? hiddenTabs(pane) : [];
  button.hidden = !hidden.length;
  button.textContent = hidden.length;
}
addEventListener('resize', () => panes.forEach(updateTabsMore));

function showTabsMore(pane, button) {
  const r = button.getBoundingClientRect();
  closeMenus();
  hideMenus();
  openMenuLevel(hiddenTabs(pane).map(tab => ({ label: docName(tab.doc), plain: true, key: tab.doc.path ? dirOf(tab.doc.path) : '',
    run: () => activate(pane, tab) })), Math.max(4, r.right - 320), r.bottom + 2, true);
}

function tabElement(pane, tab) {
  const doc = tab.doc, el = document.createElement('div');
  el.className = 'mm-tab' + (tab === pane.active ? ' mm-on' : '') + (changed(doc) ? ' mm-dirty' : '') +
    (editable(tab) ? '' : ' mm-ro') + (doc.draft ? ' mm-draft' : '');
  const dot = doc.lock && doc.disk !== 'ok' ? doc.disk : tab.dot;
  if (dot) el.dataset.dot = dot;
  el.dataset.tab = tab.id;
  el.draggable = true;
  el.title = (doc.path || `Draft ${doc.draft}, not saved as a file yet`) + (tab.pinned ? '\nPinned: asks before closing' : '') +
    (editable(tab) ? '' : tab.readOnly ? '\nRead-only (set by you)' : doc.diskReadOnly ? '\nRead-only file on disk'
      : doc.lock ? '\nRead-only: edited in the other pane' : '\nRead-only: edited in another window');
  if (tab.pinned) el.classList.add('mm-pinned');
  applyTabStyle(el, doc, tab === pane.active);
  const name = document.createElement('span');
  name.className = 'mm-tab-name';
  name.textContent = docName(doc);
  const close = document.createElement('button');
  close.className = 'mm-tab-close';
  close.title = withKey('Close', 'closeTab');
  if (tab.pinned) el.insertAdjacentHTML('beforeend', PIN_ICON);
  if (!editable(tab)) el.insertAdjacentHTML('beforeend', tab.readOnly ? LOCK_ICON_MINE : LOCK_ICON);
  el.append(name, close);
  return el;
}

// A pinned tab: a pin before the name.
const PIN_ICON = '<svg class="mm-pin" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-label="Pinned">' +
  '<path d="M9.8 1.5l4.7 4.7-1.4 1.4-.7-.7-2.6 2.6.3 3-1.4 1.4-2.9-2.9-3.6 3.6-.7-.7 3.6-3.6-2.9-2.9 1.4-1.4 3 .3 2.6-2.6-.7-.7z"/></svg>';

// A read-only tab (read-only on disk, or edited in the other pane or another window): a padlock.
const LOCK_ICON = '<svg class="mm-lock" viewBox="0 0 16 16" width="12" height="12" aria-label="Read-only">' +
  '<path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
  '<rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor"/></svg>';
// Read-only set by you (tab menu): the padlock underlined.
const LOCK_ICON_MINE = '<svg class="mm-lock" viewBox="0 0 16 16" width="12" height="12" aria-label="Read-only (set by you)">' +
  '<path d="M5 5.5V4a3 3 0 0 1 6 0v1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
  '<rect x="3" y="5.5" width="10" height="6.5" rx="1.5" fill="currentColor"/><rect x="1.5" y="14" width="13" height="1.6" fill="currentColor"/></svg>';

// ---------- Tab colours ----------
// Rules from tab-colours.json in the data folder (the host reads it and sends changes; the format is
// described at the top of the file, see TabColourFile.cs). The first rule that fits a tab styles it.
let tabRules = [];

// A file that cannot be read (saved half-way through an edit) keeps the rules that were there.
function setTabColours(text) {
  if (text == null) return;
  let list;
  try { list = parseJsonc(text); } catch (e) { return toast('tab-colours.json: ' + e.message); }
  if (!Array.isArray(list)) return toast('tab-colours.json: the file must hold a list [ ... ] of rules.');
  tabRules = [];
  const problems = [];
  list.forEach((rule, n) => {
    const tests = String(rule?.match ?? '').split(';').map(p => p.trim()).filter(Boolean).map(wildcardTest);
    if (rule?.regex) {
      try {
        const re = new RegExp(rule.regex, 'i');
        tests.push(path => re.test(path));
      } catch (e) { return problems.push(`rule ${n + 1}: ${e.message}`); }
    }
    if (!tests.length) return problems.push(`rule ${n + 1}: no match or regex`);
    tabRules.push({ tests, rule, label: [rule.match, rule.regex].filter(Boolean).join(' / ') });
  });
  if (problems.length) toast('tab-colours.json: ' + problems.join('; '));
}

// A wildcard pattern as a test on (path, name): the whole name, or the whole path when the pattern
// holds a "\". * and ? stay within one folder; ** crosses folders. Not case sensitive.
function wildcardTest(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') { source += '.*'; i++; }
    else if (c === '*') source += '[^\\\\]*';
    else if (c === '?') source += '[^\\\\]';
    else source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const re = new RegExp('^' + source + '$', 'i'), onPath = pattern.includes('\\');
  return (path, name) => re.test(onPath ? path : name);
}

// JSON with // and /* */ comments and trailing commas (as the pack and settings files allow).
function parseJsonc(text) {
  const stringEnd = (t, i) => { for (i++; i < t.length && t[i] !== '"'; i += t[i] === '\\' ? 2 : 1); return i + 1; };
  let plain = '';
  for (let i = 0; i < text.length;) {
    if (text[i] === '"') { const end = stringEnd(text, i); plain += text.slice(i, end); i = end; }
    else if (text.startsWith('//', i)) { const nl = text.indexOf('\n', i); i = nl < 0 ? text.length : nl; }
    else if (text.startsWith('/*', i)) { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; }
    else plain += text[i++];
  }
  let json = '';
  for (let i = 0; i < plain.length;) {
    if (plain[i] === '"') { const end = stringEnd(plain, i); json += plain.slice(i, end); i = end; }
    else if (plain[i] === ',' && /^\s*[\]}]/.test(plain.slice(i + 1))) i++;
    else json += plain[i++];
  }
  return JSON.parse(json);
}

// Styles a tab element by the first rule that fits; returns that rule's label, or null.
function applyTabStyle(el, doc, active) {
  const name = doc.path ? nameOf(doc.path) : String(docName(doc)), path = doc.path || name;
  const hit = tabRules.find(r => r.tests.some(test => test(path, name)));
  const base = hit?.rule[state.theme];
  if (!base) return null;
  const s = active ? { ...base, ...base.active } : base;
  const set = (key, value) => { if (value !== undefined && value !== null) el.style.setProperty(key, value); };
  set('--tab-bg', s.background);
  set('--tab-fg', s.color);
  if (s.bold !== undefined) set('--tab-weight', s.bold ? '700' : 'normal');
  if (s.italic) set('--tab-style', 'italic');
  if (s.underline) set('--tab-deco', 'underline');
  if (s.size) set('--tab-size', Math.max(-3, Math.min(3, parseFloat(s.size) || 0)) + 'px');
  if (active) set('--tab-line', s.line);
  return hit.label;
}

// The document reached gets the focus (also when it was elsewhere: the tree, a tab clicked before).
async function cycleTab(step) {
  const pane = panes[state.activePane];
  if (pane.tabs.length < 2) return;
  const at = pane.tabs.indexOf(pane.active);
  await activate(pane, pane.tabs[(at + step + pane.tabs.length) % pane.tabs.length]);
  focusPane(pane);
}

// ---------- Window chrome ----------
// The full name above the tabs: of the tab the mouse is on, else of the active file.
let hoverTab = null;
function showDocName() {
  const doc = (hoverTab && paneOf(hoverTab) ? hoverTab : activeTab())?.doc;
  ui.docName.textContent = ui.docName.title = doc ? doc.path || `${doc.draft} (draft, not saved as a file yet)` : '';
}

function updateChrome() {
  const tab = activeTab(), doc = tab?.doc;
  document.title = (doc && changed(doc) ? '\u25CF ' : '') + (doc ? docName(doc) + ' - ' : '') + 'LexPen';
  showDocName();
  // A draft can always be saved as a file.
  document.body.toggleAttribute('data-dirty', !!doc && (doc.dirty || !!doc.draft));
  $('.mm-switch-editor').classList.toggle('mm-on', !!tab && tab.mode !== 'preview');
  $('.mm-switch-preview').classList.toggle('mm-on', !!tab && tab.mode !== 'edit');
  $('.mm-outline-button').disabled = !!doc && !hasOutline(doc);   // markdown's headings, or a pack's outline
  markTreeActive();
}

async function setMode(mode) {
  const pane = panes[state.activePane], tab = pane.active;
  if (!tab) return;
  if (tab.mode === 'preview') tab.previewTop = pane.previewEl.scrollTop;
  tab.mode = mode;
  await showActive(pane);
  if (mode !== 'preview') pane.cm.focus();
  saveSession();
}

// The preview next to the editor on or off (action togglePreview, no key by default); with the preview alone, the editor comes back.
function togglePreview() {
  const tab = activeTab();
  if (tab) setMode(tab.mode === 'split' ? 'edit' : 'split');
}

// The Editor and Preview switches: at least one stays on, so switching off the last one switches on the other.
function setSwitch(part) {
  const tab = activeTab();
  if (!tab) return;
  const editor = tab.mode !== 'preview', preview = tab.mode !== 'edit';
  const [e, p] = part === 'editor' ? [!editor, preview || editor] : [editor || preview, !preview];
  setMode(e && p ? 'split' : e ? 'edit' : 'preview');
}

// ---------- Next document: Ctrl+Tab ----------
// Recently used order (the default) or tab bar order (Options > Settings > Ctrl+Tab order). In recently
// used order, holding Ctrl and pressing Tab again goes further back; letting go of Ctrl makes the
// document reached the most recent one.
const recentTabs = [];   // tab ids, most recently active first
let tabWalk = null;      // { list, at } while Ctrl is held

function noteActive(tab) {
  if (tabWalk) return;
  const at = recentTabs.indexOf(tab.id);
  if (at >= 0) recentTabs.splice(at, 1);
  recentTabs.unshift(tab.id);
}

function nextDocument(step, held = true) {
  if (setting('tabOrder') === 'tabs') return cycleTab(step);
  const tabs = allTabs(), byId = id => tabs.find(t => t.id === id);
  if (!tabWalk) {
    const list = [...recentTabs.map(byId).filter(Boolean), ...tabs.filter(t => !recentTabs.includes(t.id))];
    if (list.length < 2) return;
    tabWalk = { list, at: 0 };
  }
  const { list } = tabWalk;
  tabWalk.at = (tabWalk.at + step + list.length) % list.length;
  const tab = list[tabWalk.at], pane = paneOf(tab);
  activate(pane, tab).then(() => focusPane(pane));
  if (!held) endTabWalk();
}

function endTabWalk() {
  if (!tabWalk) return;
  const tab = tabWalk.list[tabWalk.at];
  tabWalk = null;
  if (paneOf(tab)) noteActive(tab);
}
addEventListener('keyup', e => { if (e.key === 'Control') endTabWalk(); });
addEventListener('blur', endTabWalk);

// ---------- Bottom bar ----------
// The active pane's file: cursor, insert / overwrite, encoding, line endings, language, a pending chord.
const statusUi = {
  chord: $('.mm-st-chord'), pos: $('.mm-st-pos'), ins: $('.mm-st-ins'), enc: $('.mm-st-enc'),
  eol: $('.mm-st-eol'), lang: $('.mm-st-lang'), col: $('.mm-st-col'), char: $('.mm-st-char'), clip: $('.mm-st-clip'), alive: $('.mm-st-alive'), long: $('.mm-st-long'),
};

// The heartbeat at the right of the bottom bar: turned by the page itself, so it stands still exactly
// while the page is stuck (a CSS animation would keep turning on its own thread).
const ALIVE = ['-', '\\', '|', '/'];
let aliveStep = 0;
setInterval(() => statusUi.alive.textContent = ALIVE[aliveStep = (aliveStep + 1) % ALIVE.length], 250);
// A script that ran more than half a second goes to the host's stall log (StallLog.cs), with the last action and the
// document, so a stall names its cause.
try {
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) if (e.duration > 500) {
      const doc = panes[state.activePane]?.active?.doc;
      host('stallNote', { text: `a script ran ${Math.round(e.duration)} ms; last action ${lastAction ?? '-'}; ${doc ? docName(doc) : 'no document'}` }).catch(() => {});
    }
  }).observe({ type: 'longtask' });
} catch { }   // no long task timing: no notes

function updateStatus() {
  const pane = panes[state.activePane], tab = pane.active, doc = tab?.doc;
  const cm = tab && pane.cm && pane.el.dataset.mode !== 'preview' ? pane.cm : null;
  let pos = '';
  if (cm) {
    const head = cm.getCursor('head'), selected = cm.getSelection(), block = blockSize(cm);
    // Past the end of the line (virtual.js), or a block's head (also past a line's end): that column.
    const past = blockOf(cm)?.head ?? virtualOf(cm), line = past ? past.line : head.line;
    pos = `Ln ${line + 1}, Col ${(past ? past.col : textColumn(cm.getLine(head.line), head.ch, stopsOf(cm))) + 1}`;   // a tab to its stop
    const many = cursorStatus(cm);   // several cursors, occurrences (cursors.js)
    if (block) pos += ` (Block ${block})`;
    else if (many) pos += ` (${many})`;
    else if (selected) {
      const lines = selected.split('\n').length;
      pos += ` (${selected.length} selected${lines > 1 ? `, ${lines} lines` : ''})`;
    }
  }
  statusUi.pos.textContent = pos;
  // The character after the cursor (charpicker.js): its code; its name in the tooltip, asked when the mouse is on it.
  const at = cm && !cm.somethingSelected() ? charAtCursor(cm) : null;
  statusUi.char.hidden = !at;
  statusUi.char.textContent = at ? at.label : '';
  statusUi.char.title = '';
  tellCharPicker(at);   // while the picker window is open (charpicker.js)
  statusUi.ins.textContent = cm ? (cm.state.overwrite ? 'OVR' : 'INS') : '';
  statusUi.col.hidden = !column.on;
  statusUi.ins.classList.toggle('mm-on', !!cm?.state.overwrite);
  statusUi.enc.textContent = doc ? doc.encoding : '';
  statusUi.eol.textContent = doc ? (doc.eol === '\r\n' ? 'CRLF' : 'LF') : '';
  // The line end each editor shows (showLineEnds): its own document's.
  for (const p of panes) if (p.cm && p.active) p.cm.getWrapperElement().dataset.eol = p.active.doc.eol === '\r\n' ? 'crlf' : 'lf';
  // In a block of another language (a fence, lines you gave a language): that one too, "Markdown -> KQL (Kusto)". A
  // click still changes the file's language.
  const inner = cm && doc && typeof lineLanguage === 'function' ? lineLanguage(cm, cm.getCursor().line) : null;
  const innerShown = inner && inner !== languageOf(doc) && packs[inner] ? packs[inner].name : null;
  statusUi.lang.textContent = doc ? languageTitle(doc) + (innerShown ? ' -> ' + innerShown : '') : '';
  statusUi.lang.title = innerShown ? `Language: ${languageTitle(doc)}, the cursor in a block of ${innerShown} (click: choose another for the file)`
    : 'Language (click: choose another)';
  statusUi.long.hidden = !(cm && longLineIn(doc));
  statusUi.clip.textContent = 'Clip: ' + (clips.active === 0 ? 'Win' : clips.active);
  statusUi.clip.classList.toggle('mm-on', clips.active !== 0);
  statusUi.clip.title = clips.active === 0 ? 'The Windows clipboard is active (click: the clipboards)'
    : `Clipboard ${clips.active} is active: ${clips.previews[clips.active] || '(empty)'} (click: the clipboards)`;
}

statusUi.lang.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
statusUi.char.addEventListener('mousedown', e => e.preventDefault());
statusUi.char.addEventListener('mouseenter', async () => {
  const cm = panes[state.activePane].cm, at = cm && charAtCursor(cm);
  if (at) statusUi.char.title = await charTitle(at);
});
statusUi.char.addEventListener('click', () => {
  const cm = panes[state.activePane].cm;
  openCharPicker(pickerCode(cm && charAtCursor(cm)));
});
statusUi.lang.addEventListener('click', () => showLanguageList());

events.findHistory = onFindHistory;   // history.js
events.clipboards = ({ state }) => {
  Object.assign(clips, state);
  updateStatus();
};

function showChord(stroke) {
  statusUi.chord.textContent = stroke ? stroke + ', ...' : '';
}

statusUi.ins.addEventListener('click', () => runAction('overwrite.toggle', [], { from: 'bar' }));
statusUi.col.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
statusUi.col.addEventListener('click', () => setColumnMode(false));
events.clipboardColumn = ({ column: marked }) => { clips.windowsColumn = marked; };
statusUi.clip.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
statusUi.clip.addEventListener('click', () => showClipboardList());

// ---------- Opening and closing ----------
// Opens a file in a tab of the pane, or activates the tab that already shows it there.
async function openFile(path, { pane = panes[state.activePane], anchor, mode, last } = {}) {
  let tab = pane.tabs.find(t => samePath(t.doc.path, path));
  if (!tab) {
    const doc = findDoc(path) ?? await loadDoc(path);
    tab = pane.tabs.find(t => t.doc === doc) ?? makeTab(doc, mode);
    if (!pane.tabs.includes(tab)) insertTab(pane, tab, last);
  }
  noteOpened('files', tab.doc.path);
  await activate(pane, tab);
  if (pane.index === 1) await showActive(panes[0]);   // the first pane gets its share of the width
  if (anchor) scrollToAnchor(pane, anchor);
  return tab;
}

// A link followed inside a tab: the tab shows the other file, with back / forward.
// Returns false when the user kept unsaved changes instead. `restoring`: a back/forward step.
async function navigate(tab, path, anchor, restoring) {
  const pane = paneOf(tab);
  if (samePath(tab.doc.path, path)) {
    if (anchor) scrollToAnchor(pane, anchor);
    return true;
  }
  const already = pane.tabs.find(t => samePath(t.doc.path, path));
  if (already) {
    await activate(pane, already);
    if (anchor) scrollToAnchor(pane, anchor);
    return true;
  }
  const old = tab.doc, last = tabsOf(old).length === 1;
  if (last && old.dirty && old.lock) {
    // Yes saves it, No drops the changes, Cancel stays.
    const answer = await host('askSave', { text: `Save the changes to ${nameOf(old.path)}?` });
    if (answer === 'yes' ? !await saveDoc(old) : answer !== 'no') return false;
  }
  const doc = findDoc(path) ?? await loadDoc(path);

  if (!restoring && old.path) remember(tab, old.path);
  // The file left the window (no other tab has it): recently closed, as closing its tab would (Reopen closed tab too).
  if (last && old.path) {
    noteOpened('closed', old.path);
    closedTabs.push({ path: old.path, pane: pane.index, mode: tab.mode, top: pane.active === tab ? pane.previewEl.scrollTop : tab.previewTop });
    if (closedTabs.length > 20) closedTabs.shift();
  }
  releaseTabDoc(tab);
  if (old.editTab === tab) old.editTab = tabsOf(old).find(t => t !== tab) ?? null;
  tab.doc = doc;
  doc.editTab ??= tab;
  tab.stale = true;
  tab.previewTop = 0;
  tab.mode = openMode(doc);
  if (last) dropDoc(old);
  syncWatchFiles();
  noteOpened('files', path);
  await activate(pane, tab);
  pane.previewEl.scrollTop = 0;   // same article element, new content
  await showAll();   // the other pane may have become editable
  if (anchor) scrollToAnchor(pane, anchor);
  return true;
}

// Returns false when the user kept it. `force`: no questions about unsaved changes, the draft stays ("Close"
// on a removed file). `bulk`: one of several (other tabs, all tabs, a pane): a pinned tab stays, unasked;
// alone, a pinned tab asks first.
async function closeTab(tab, force, bulk) {
  const doc = tab.doc, last = tabsOf(doc).length === 1;
  if (tab.pinned) {
    if (bulk) return false;
    if (!await host('confirm', { text: `${docName(doc)} is pinned. Close it anyway?` })) return false;
  }
  if (last && !force) {
    if (doc.draft) {
      // Yes saves it as a file (Save As), No drops it, Cancel keeps the tab.
      const answer = docText(doc).trim() ? await host('askSave', { text: `Save draft ${doc.draft}?` }) : 'no';
      if (answer === 'yes') return await saveDoc(doc) && closeTab(tab, force, bulk);
      if (answer !== 'no') return false;
    } else if (doc.dirty && doc.lock) {
      // Yes saves it, No drops the changes, Cancel keeps the tab.
      const answer = await host('askSave', { text: `Save the changes to ${nameOf(doc.path)}?` });
      if (answer === 'yes' ? !await saveDoc(doc) : answer !== 'no') return false;
    }
  }
  const pane = paneOf(tab);
  if (!pane) return false;   // closed meanwhile
  if (doc.path && !force) {
    noteOpened('closed', doc.path);
    closedTabs.push({ path: doc.path, pane: pane.index, mode: tab.mode,
      top: pane.active === tab ? pane.previewEl.scrollTop : tab.previewTop });
    if (closedTabs.length > 20) closedTabs.shift();
  }
  detachTab(tab);
  releaseTabDoc(tab);
  if (last) {
    dropDoc(doc);
    if (doc.draft && !force) {
      clearTimeout(doc.draftTimer);
      clearTimeout(doc.mmTabsTimer);   // the host drops its ruler lines with it
      host('draftDelete', { draft: doc.draft });
    }
  }
  await showAll();
  saveSession();
  return true;
}

// Files closed in this window, most recent last (drafts are deleted when closed, so not here).
const closedTabs = [];

// Into `pane` (the tab bar that was right-clicked), or where it was.
async function reopenTab(pane) {
  const entry = closedTabs.pop();
  if (!entry) return toast('No closed tab to reopen.', true);
  const tab = await openFile(entry.path, { pane: pane ?? panes[entry.pane], mode: entry.mode });
  const shown = paneOf(tab);
  if (tab.mode !== 'edit' && shown.active === tab) shown.previewEl.scrollTop = tab.previewTop = entry.top;
}

async function newFile() {
  const id = await host('newDraft');
  const doc = makeDoc({ draft: id });
  const pane = panes[state.activePane];
  const tab = makeTab(doc, openMode(doc) === 'preview' ? 'split' : openMode(doc));   // a new file is for typing
  insertTab(pane, tab);
  await activate(pane, tab);
  pane.cm?.focus();
}

function writeDraft(doc) {
  clearTimeout(doc.draftTimer);
  doc.draftTimer = 0;
  if (doc.draft) return host('draftWrite', { draft: doc.draft, text: docText(doc) });
}
const flushDrafts = () => Promise.all([...docs].filter(d => d.draftTimer).map(writeDraft));

// Returns false when nothing was saved (dialog cancelled, or the file is edited elsewhere).
async function saveDoc(doc, saveAs) {
  let path = doc.path;
  const was = { path: doc.path, draft: doc.draft };   // the ruler's lines move to the new name (ruler.js)
  if (!path || saveAs) {
    path = await host('pickSave', {
      name: path ? nameOf(path) : doc.draft + '.md',
      dir: path ? dirOf(path) : state.root || '',
    });
    if (!path) return false;
  }
  if (!doc.lock && samePath(path, doc.path)) {
    toast('This file is being edited in another window; save it there.');
    return false;
  }
  // Save as another name turns an ANSI file into UTF-8 (the way out when it cannot hold a character).
  const encoding = !samePath(path, doc.path) && doc.encoding === 'ANSI' ? 'UTF-8' : doc.encoding;
  trimOnSave(doc);   // the whitespace at line ends (convert.js)
  await host('write', { path, text: diskText(doc), encoding, backup: setting('backup') });
  doc.encoding = encoding;
  if (doc.cmDoc) doc.savedGeneration = doc.cmDoc.changeGeneration(true);
  if (doc.draft) {
    clearTimeout(doc.draftTimer);
    host('draftDelete', { draft: doc.draft });
    doc.draft = null;
    doc.draftChanged = false;
  }
  if (!samePath(path, doc.path) && doc.marks) {
    host('bookmarksSet', { path: doc.path, draft: doc.draft, list: [] }).catch(() => {});
    saveBookmarks(doc, { path });
  }
  if (!samePath(path, doc.path)) {
    if (doc.path) host('unlock', { path: doc.path });
    doc.path = path;
    doc.lock = await host('lock', { path });
    if (!doc.languageChosen) doc.language = codeLang(path, docText(doc));   // saved as another file type
    unfresh(path);
  }
  moveRulerLines(doc, was);
  if (doc.hls?.list.length && (was.draft || !samePath(was.path, doc.path))) {   // highlights.js: to the new name
    host('highlightsSet', { path: was.path, draft: was.draft, list: [], beside: false }).catch(() => {});
    saveHighlights(doc, true);
  }
  doc.dirty = false;
  doc.disk = 'ok';
  doc.savedText = docText(doc);
  syncWatchFiles();
  updateStatus();
  if (doc.marks) saveBookmarks(doc);
  for (const pane of panes) if (pane.active?.doc === doc && pane.cm) paintGutter(pane);
  for (const tab of tabsOf(doc)) tab.stale = true;
  await showAll();
  saveSession();
  return true;
}

// ---------- Changes on disk ----------
// The host watches the open folder and files (see MainForm) and reports changes here.
let watchedRoot = null, watchedFiles = '';
function syncWatch() {
  if (state.root === watchedRoot) return;
  watchedRoot = state.root;
  host('watch', { root: state.root || '' });
}
function syncWatchFiles() {
  const paths = [...docs].filter(d => d.path).map(d => d.path);
  const key = paths.join('|');
  if (key === watchedFiles) return;
  watchedFiles = key;
  host('watchFiles', { paths });
}

events.changed = async ({ tree, git, files, fresh }) => {
  for (const path of fresh) if (!findDoc(path)) freshPaths.add(path.toLowerCase());
  if (git && typeof loadGitHead === 'function') {
    for (const doc of docs) if (doc.gitHead !== undefined) await loadGitHead(doc);
    for (const pane of panes) if (pane.cm && pane.active) paintGit(pane);
  }
  if (tree || git) await refreshTree();
  else if (fresh.length) markFresh();
  for (const { path, kind } of files) {
    const doc = findDoc(path);
    if (doc?.lock) await diskChange(doc, kind);   // read-only copies follow the editing window
  }
};

async function diskChange(doc, kind, retry = true) {
  const path = doc.path;
  let text = null, encoding;
  if (kind === 'changed') {
    try {
      let readOnly;
      ({ text, encoding, readOnly } = await host('read', { path }));
      doc.diskReadOnly = readOnly;
    } catch {
      // Still being written: try once more.
      if (retry) setTimeout(() => findDoc(path) === doc && diskChange(doc, kind, false), 500);
      return;
    }
  }
  if (doc.path !== path) return;
  const unseen = tab => !document.hasFocus() || paneOf(tab)?.active !== tab;
  if (kind === 'removed') {
    doc.disk = 'removed';
  } else if (text === diskText(doc)) {
    doc.disk = 'ok';   // our own save, or back as it was
  } else if (!doc.dirty) {
    // Nothing to lose: just show it. Unseen, it is announced: a dot, and a banner once the tab is in view.
    for (const tab of tabsOf(doc)) if (unseen(tab)) {
      tab.dot = 'changed';
      if (paneOf(tab).active === tab) tab.notice = true;
    }
    await reloadDoc(doc, text, encoding);
  } else {
    doc.disk = 'changed';
  }
  for (const pane of panes) updateBar(pane);
  refreshTabs();
}

function updateBar(pane) {
  const doc = pane.active?.doc;
  let kind = doc?.lock ? doc.disk : 'ok';
  if (kind === 'ok' && pane.active?.notice) kind = 'reloaded';
  pane.barEl.hidden = kind === 'ok';
  if (kind === 'ok') return;
  pane.barEl.dataset.kind = kind;
  const text = document.createElement('span');
  text.className = 'mm-bar-text';
  text.textContent = {
    changed: `${docName(doc)} changed on disk. Reload it, or keep your unsaved changes?`,
    removed: `${docName(doc)} was removed or renamed on disk.`,
    reloaded: `${docName(doc)} changed on disk and has been reloaded. (Click anywhere or press Esc to hide this.)`,
  }[kind];
  const buttons = {
    changed: [['reload', 'Reload'], ['keep', 'Keep mine']],
    removed: [['close', 'Close'], ['save', 'Save it again'], ['draft', 'Keep as draft']],
    reloaded: [],
  }[kind];
  pane.barEl.replaceChildren(text, ...buttons.map(([action, label]) => {
    const button = document.createElement('button');
    button.dataset.bar = action;
    button.textContent = label;
    return button;
  }));
}

async function onBarClick(pane, e) {
  const action = e.target.closest('[data-bar]')?.dataset.bar, doc = pane.active?.doc;
  if (!action || !doc) return;
  if (action === 'reload') {
    const { text, encoding, readOnly } = await host('read', { path: doc.path });
    doc.diskReadOnly = readOnly;
    await reloadDoc(doc, text, encoding);
  }
  else if (action === 'keep') doc.disk = 'ok';
  else if (action === 'close') { for (const tab of tabsOf(doc)) await closeTab(tab, true); }
  else if (action === 'save') await saveDoc(doc);
  else if (action === 'draft') {
    host('unlock', { path: doc.path });
    doc.draft = await host('newDraft');
    doc.path = null;
    doc.lock = true;
    doc.disk = 'ok';
    doc.dirty = false;
    doc.draftChanged = true;
    writeDraft(doc);
    syncWatchFiles();
    saveSession();
  }
  await showAll();
}

// Other windows that show this file read-only get its text as it is typed.
function pushText(doc) {
  clearTimeout(doc.pushTimer);
  if (doc.path && doc.lock && doc.shared) host('docText', { path: doc.path, text: docText(doc) });
}
events.shared = ({ path, shared }) => {
  const doc = findDoc(path);
  if (!doc) return;
  doc.shared = shared;
  pushText(doc);
};
events.pushText = ({ path }) => { const doc = findDoc(path); if (doc) pushText(doc); };
events.docText = ({ path, text }) => {
  const doc = findDoc(path);
  if (doc && !doc.lock && text !== docText(doc)) reloadDoc(doc, text);
};
// The window that edited the file let go of it: this one may edit now, starting from disk.
events.lock = async ({ path }) => {
  const doc = findDoc(path);
  if (!doc) return;
  doc.lock = true;
  try {
    const { text, encoding, readOnly } = await host('read', { path });
    doc.diskReadOnly = readOnly;
    await reloadDoc(doc, text, encoding);
  }
  catch { doc.disk = 'removed'; }
  await showAll();
};

// ---------- Git status ----------
// Changed files in the repository around the open folder, keyed by lower-case path.
// Status is M (modified), A (added), U (untracked), D (deleted), R (renamed) or ! (conflict).
let git = new Map();
const GIT_PRIORITY = '!MDRAU';   // a folder shows the most important status inside it

async function loadGit(root) {
  const entries = await host('gitStatus', { path: root }).catch(() => null) || [];
  if (state.root === root || !state.root) git = new Map(entries.map(e => [e.path.toLowerCase(), e]));
}

// Git can take a moment on a large repository, so a folder is shown first and gets its git colours
// when the status is in. At startup the status is asked for once the documents are shown.
let gitWaiting = null;
function loadGitLater(root) {
  if (!started) return gitWaiting = root;
  gitWaiting = null;
  setTimeout(async () => {
    if (state.root !== root) return;
    await loadGit(root);
    if (state.root === root && git.size) await refreshTree(false);
  }, 100);
}

function gitStatusOf(item) {
  const key = item.path.toLowerCase();
  if (!item.dir) return git.get(key)?.status;
  let best;
  for (const [path, { status }] of git)
    if (path.startsWith(key + '\\') && (!best || GIT_PRIORITY.indexOf(status) < GIT_PRIORITY.indexOf(best))) best = status;
  return best;
}

// Deleted files (and folders that held them) are gone from disk, so add them to the listing.
function deletedIn(dir, items) {
  const prefix = dir.toLowerCase() + '\\';
  const names = new Set(items.map(i => i.name.toLowerCase()));
  const gone = [];
  for (const [path, entry] of git) {
    if (entry.status !== 'D' || !path.startsWith(prefix)) continue;
    const rest = entry.path.slice(prefix.length), cut = rest.indexOf('\\');
    const name = cut < 0 ? rest : rest.slice(0, cut);
    if (names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    gone.push({ name, path: entry.path.slice(0, prefix.length) + name, dir: cut >= 0, gone: true });
  }
  return gone;
}

// ---------- Folder tree ----------
const expanded = new Set();
// Files that changed while the window was not active (lower case), highlighted until opened.
const freshPaths = new Set();

// Folders first, then files; each by name or by modified time.
function sortItems(items) {
  const desc = setting('sortDesc') ? -1 : 1;
  const byName = (a, b) => { const x = a.name.toLowerCase(), y = b.name.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; };
  const key = setting('sort') === 'modified' ? (a, b) => a.modified - b.modified || byName(a, b) : byName;
  return items.sort((a, b) => b.dir - a.dir || desc * key(a, b));
}

async function fillDir(container, path, depth) {
  // Backup files (name.ext.bak) only with the setting showBackupFiles; highlights next to a file (name.ext.lph,
  // highlights.js) never: the file gets a mark instead.
  const listed = await host('list', { path });
  const withHighlights = new Set(listed.filter(i => !i.dir && /\.lph$/i.test(i.name)).map(i => i.name.slice(0, -4).toLowerCase()));
  const items = listed.filter(i => i.dir || (!/\.lph$/i.test(i.name) && (setting('showBackupFiles') || !/\.bak$/i.test(i.name))));
  container.replaceChildren();
  for (const item of [...sortItems(items), ...deletedIn(path, items)]) {
    const row = document.createElement('div');
    row.className = 'mm-row' + (item.dir ? ' mm-dir' : MARKDOWN_FILE.test(item.name) ? '' : ' mm-other') +
      (item.gone ? ' mm-gone' : '');
    row.dataset.path = item.path;
    row.dataset.depth = depth;
    row.draggable = !item.dir && !item.gone;
    row.style.paddingLeft = 8 + depth * 14 + 'px';
    row.title = item.name;
    const name = document.createElement('span');
    name.className = 'mm-name';
    name.textContent = item.name;
    row.append(name);
    if (!item.dir && withHighlights.has(item.name.toLowerCase())) {
      row.classList.add('mm-has-highlights');
      row.title += '\nHas highlights next to it (' + item.name + '.lph)';
    }
    const status = gitStatusOf(item);
    if (status) row.dataset.git = status;
    container.append(row);
    if (item.dir && !item.gone) {
      const children = document.createElement('div');
      children.hidden = true;
      container.append(children);
      if (expanded.has(item.path)) await toggleDir(row);
    }
  }
}

// Rebuilds the tree off screen and swaps it in, so open folders and scroll position stay put.
// `withGit`: also ask git again (false: the status was just loaded).
async function refreshTree(withGit = true) {
  if (!state.root) return;
  if (withGit) await loadGit(state.root);
  const fresh = document.createElement('div');
  await fillDir(fresh, state.root, 0);
  addUpRow(fresh);
  const top = ui.tree.scrollTop, cursor = treeCursor()?.dataset.path;
  ui.tree.replaceChildren(...fresh.childNodes);
  ui.tree.scrollTop = top;
  if (cursor) setTreeCursor(treeRows().find(r => r.dataset.path === cursor), false);
  markFresh();
  markTreeActive();
}

// The folder that holds this one; null at a drive or share root.
function parentOf(path) {
  const trimmed = path.replace(/\\$/, ''), cut = trimmed.lastIndexOf('\\');
  if (cut < 0) return null;
  const parent = trimmed.slice(0, cut);
  if (/^\\\\[^\\]*$/.test(parent)) return null;   // \\server: no folder above a share
  return /^[a-z]:$/i.test(parent) ? parent + '\\' : parent;
}

// ".." at the top of the tree: the folder above the open one.
// The two rows on top: the base folder with its full path (to right-click: copy, favourite folders; not a folder to
// open or close), and above it `..`, up a folder (none at a drive's root).
function addUpRow(container) {
  if (state.root) {
    const base = document.createElement('div');
    base.className = 'mm-row mm-base';
    base.dataset.path = state.root;
    base.dataset.depth = -1;
    base.style.paddingLeft = '8px';
    base.title = state.root;
    // The path as text in a right-to-left row (app.css), held left-to-right by a mark at each end: a long one is cut
    // off at its start, so the folder's own name stays in view.
    const ltr = String.fromCharCode(0x200E);
    base.textContent = ltr + state.root + ltr;
    container.prepend(base);
  }
  const parent = parentOf(state.root || '');
  if (!parent) return;
  const row = document.createElement('div');
  row.className = 'mm-row mm-dir mm-up';
  row.dataset.path = parent;
  row.dataset.depth = 0;
  row.style.paddingLeft = '8px';
  row.title = 'Up to ' + parent + ' (Alt+Up)';
  row.innerHTML = '<span class="mm-name">..</span>';
  container.prepend(row);
}

// Opens the folder above as the tree's root, with the folder we came from open and selected.
async function goUp() {
  const from = state.root, parent = parentOf(from || '');
  if (!parent) return;
  await openFolder(parent);
  const row = treeRows().find(r => samePath(r.dataset.path, from));
  if (row) {
    await toggleDir(row);
    setTreeCursor(row);
  }
}

// ---------- Folder pane keyboard ----------
// The tree takes the focus (click a row, or Ctrl+Shift+E); the cursor row is where the keys act.
ui.tree.tabIndex = 0;
const treeRows = () => [...ui.tree.querySelectorAll('.mm-row')].filter(r => r.offsetParent !== null);
const treeCursor = () => ui.tree.querySelector('.mm-row.mm-cursor');

function setTreeCursor(row, scroll = true) {
  if (!row) return;
  treeCursor()?.classList.remove('mm-cursor');
  row.classList.add('mm-cursor');
  if (scroll) row.scrollIntoView({ block: 'nearest' });
}

// The keys go to the pane's file: the editor, or the preview (arrows scroll it).
// The editor or the preview, as the tab had it last (both are shown in split; the editor at first).
function focusPane(pane) {
  const mode = pane.el.dataset.mode, part = pane.active?.focusPart;
  if (pane.cm && mode !== 'preview' && (mode !== 'split' || part !== 'preview')) pane.cm.focus(); else pane.previewEl.focus();
}

// The clicked Save button hides itself once saved, which would leave the focus nowhere: back to the file.
function refocus() {
  const el = document.activeElement;
  if (el === document.body || el?.matches('.mm-save')) focusPane(panes[state.activePane]);
}

function focusTree() {
  setSidebar(true);
  setSideView('folder');
  ui.tree.focus();
  if (!treeCursor()) setTreeCursor(ui.tree.querySelector('.mm-row.mm-active') || treeRows()[0]);
}

ui.tree.addEventListener('keydown', async e => {
  const rows = treeRows(), row = treeCursor() ?? rows[0];
  if (!row) return;
  const at = rows.indexOf(row), page = Math.max(1, Math.floor(ui.tree.clientHeight / (row.offsetHeight || 22)) - 1);
  const move = to => setTreeCursor(rows[Math.max(0, Math.min(rows.length - 1, to))]);
  const isDir = row.classList.contains('mm-dir') && !row.classList.contains('mm-up');
  const open = row.classList.contains('mm-open');
  let handled = true;
  switch (e.key) {
    case 'ArrowDown': move(at + 1); break;
    case 'ArrowUp':
      if (e.altKey) await goUp(); else move(at - 1);
      break;
    case 'Home': move(0); break;
    case 'End': move(rows.length - 1); break;
    case 'PageDown': move(at + page); break;
    case 'PageUp': move(at - page); break;
    case 'ArrowRight':
      if (isDir && !open) await toggleDir(row);
      else if (isDir) move(at + 1);
      break;
    case 'ArrowLeft':
      if (isDir && open) await toggleDir(row);
      else {
        // To the folder this row is in.
        const parent = rows.slice(0, at).reverse().find(r => r.classList.contains('mm-dir') && +r.dataset.depth < +row.dataset.depth);
        if (parent) move(rows.indexOf(parent));
      }
      break;
    case 'Enter':
      if (row.classList.contains('mm-up')) await goUp();
      else if (isDir) await toggleDir(row);
      else if (!row.classList.contains('mm-gone') && !row.classList.contains('mm-base')) {
        await openFromTree(row.dataset.path, e);
        ui.tree.focus();   // keep walking the tree
      }
      break;
    case 'Backspace': await goUp(); break;
    case 'Escape': focusPane(panes[state.activePane]); break;
    default: handled = false;
  }
  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
});

function markTreeActive() {
  const path = activeTab()?.doc.path;
  for (const row of ui.tree.querySelectorAll('.mm-row'))
    row.classList.toggle('mm-active', samePath(row.dataset.path, path));
}

function markFresh() {
  for (const row of ui.tree.querySelectorAll('.mm-row:not(.mm-up):not(.mm-base)')) {
    const key = row.dataset.path.toLowerCase();
    row.classList.toggle('mm-fresh', freshPaths.has(key));
    row.classList.toggle('mm-fresh-dir', row.classList.contains('mm-dir') && [...freshPaths].some(p => p.startsWith(key + '\\')));
  }
}

function unfresh(path) {
  if (freshPaths.delete(path.toLowerCase())) markFresh();
}

// The file's row in the folder pane: the pane is opened, the folders on the way to the file are opened,
// the row is selected, scrolled to and lights up. A file outside the open folder: its folder is opened.
async function showInTree(path) {
  if (!path) return;
  setSidebar(true);
  setSideView('folder');
  const inside = root => root && path.toLowerCase().startsWith(root.replace(/\\$/, '').toLowerCase() + '\\');
  if (!inside(state.root)) await openFolder(dirOf(path));
  if (document.body.dataset.tree === 'md' && !MARKDOWN_FILE.test(path)) {
    setMarkdownOnly(false);   // the filter would hide it
    toast('The folder pane shows all files again (not only markdown), so the file can be shown.', true);
  }
  const rowOf = p => [...ui.tree.querySelectorAll('.mm-row:not(.mm-up)')].find(r => samePath(r.dataset.path, p));
  let dir = state.root.replace(/\\$/, '');
  for (const part of path.slice(dir.length + 1).split('\\').slice(0, -1)) {
    dir += '\\' + part;
    const row = rowOf(dir);
    if (!row) break;
    if (!row.classList.contains('mm-open')) await toggleDir(row);
  }
  const row = rowOf(path);
  if (!row) return toast(`${nameOf(path)} is not listed in the folder pane.`);
  setTreeCursor(row, false);
  row.scrollIntoView({ block: 'center' });
  ui.tree.focus({ preventScroll: true });
  row.classList.remove('mm-flash');
  void row.offsetWidth;   // restart the animation when it is asked for again
  row.classList.add('mm-flash');
  row.addEventListener('animationend', () => row.classList.remove('mm-flash'), { once: true });
}

async function toggleDir(row) {
  const children = row.nextElementSibling;
  const open = row.classList.toggle('mm-open');
  children.hidden = !open;
  if (open) expanded.add(row.dataset.path); else expanded.delete(row.dataset.path);
  saveSession();   // the open folders are kept with the window (sessionData)
  if (open && !children.childElementCount) {
    await fillDir(children, row.dataset.path, +row.dataset.depth + 1);
    markFresh();
    markTreeActive();
  }
}

ui.tree.addEventListener('scroll', () => saveSession(), { passive: true });   // its scroll position, with the session
ui.tree.addEventListener('click', e => {
  const row = e.target.closest('.mm-row');
  if (!row) return;
  setTreeCursor(row, false);
  if (row.classList.contains('mm-gone') || row.classList.contains('mm-base')) return;
  if (row.classList.contains('mm-up')) goUp();
  else if (row.classList.contains('mm-dir')) toggleDir(row);
  else openFromTree(row.dataset.path, e);
});

// A file from the tree: shown in the current tab of the pane (when it is already open there: that tab).
// Ctrl: the other pane; Shift: a new tab. A draft or a changed file is never replaced (a new tab instead).
function openFromTree(path, { ctrlKey, shiftKey }) {
  const pane = ctrlKey ? otherPane() : panes[state.activePane], tab = pane.active;
  if (shiftKey || !tab || tab.doc.draft || tab.doc.dirty || pane.tabs.some(t => samePath(t.doc.path, path))) return openFile(path, { pane });
  return navigate(tab, path);
}
ui.tree.addEventListener('dragstart', e => {
  const row = e.target.closest('.mm-row');
  if (!row || row.classList.contains('mm-base')) return;
  draggedPathIsImage = IMAGE_FILE.test(row.dataset.path);
  e.dataTransfer.setData(PATH_TYPE, row.dataset.path);
  e.dataTransfer.setData('text/plain', row.dataset.path);
  e.dataTransfer.effectAllowed = 'copyMove';
});

// `open`: the folders to open again (a restored session: the tree as it was).
async function openFolder(path, open = []) {
  expanded.clear();
  for (const dir of open) if (typeof dir === 'string') expanded.add(dir);
  git = new Map();   // no colours of the previous folder meanwhile
  await fillDir(ui.tree, path, 0);
  state.root = path;
  loadGitLater(path);
  addUpRow(ui.tree);
  noteOpened('folders', path);
  ui.treeTitle.textContent = ui.treeTitle.title = nameOf(path) || path;
  markFresh();
  markTreeActive();
  syncWatch();
  saveSession();
}

ui.sort.addEventListener('change', () => {
  keepLayout('sort', ui.sort.value);
  refreshTree();
});

function showSort() {
  ui.sort.value = setting('sort') === 'modified' ? 'modified' : 'name';
  document.body.toggleAttribute('data-sort-desc', !!setting('sortDesc'));
}

// ---------- Drag and drop ----------
// Where a drag over this pane lands: with only one pane, its far half opens the second one.
function dropTarget(pane, e) {
  const types = e.dataTransfer.types;
  if (!types.includes(TAB_TYPE) && !types.includes(PATH_TYPE) && !types.includes('Files')) return null;
  if (!bothShown()) {
    const r = pane.el.getBoundingClientRect();
    const far = state.orient === 'v' ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    if (far) return panes[1 - pane.index];   // the second pane, or the hidden one
  }
  return pane;
}

function hideDrops() {
  for (const pane of panes) {
    pane.dropEl.hidden = true;
    pane.tabsEl.classList.remove('mm-insert-end');
    for (const el of pane.tabsEl.querySelectorAll('.mm-insert')) el.classList.remove('mm-insert');
  }
}

// The tab being dragged inside this window, for dropping it between other tabs.
let draggedTab = null;

// Where a tab dropped at x lands in the pane's tab bar: before the first tab whose middle is right of x.
// With the tabs on several rows the row counts first: above a tab's row, or on it left of its middle.
function stripIndex(pane, x, y) {
  const els = [...pane.tabsEl.children];
  const at = els.findIndex(el => {
    const r = el.getBoundingClientRect();
    return y < r.top || (y <= r.bottom && x < r.left + r.width / 2);
  });
  return at < 0 ? els.length : at;
}

async function onDrop(data, pane) {
  const tab = data.getData(TAB_TYPE);
  if (tab) {
    const { win, tab: id } = JSON.parse(tab);
    if (win !== state.win) return host('pullTab', { win, tab: id, pane: pane.index });   // from another window
    const moving = allTabs().find(t => t.id === id);
    if (moving) await moveToPane(moving, pane);
    return;
  }
  const path = data.getData(PATH_TYPE);
  if (path) return openFile(path, { pane });
  if (!data.files.length) return;
  for (const item of await hostFiles([...data.files])) {
    if (!item.path) continue;
    if (item.dir) {
      await openFolder(item.path);
      setSidebar(true);
    } else await openFile(item.path, { pane }).catch(e => toast(e.message));
  }
}

// ---------- Images ----------
// Pasted or dropped into the editor, images become links. The host copies them when needed
// (see ImageLinks): in the document's folder or below it they are linked where they are.
const IMAGE_FILE = /\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i;

// During a drag only the types are known: files whose type is an image, or a tree row of an image.
function dragHasImages(data) {
  const items = [...data.items];
  return items.some(i => i.kind === 'file' && i.type.startsWith('image/')) ||
    (data.types.includes(PATH_TYPE) && !items.some(i => i.kind === 'file') && draggedPathIsImage);
}
let draggedPathIsImage = false;

// Ctrl+Shift+V: ask how to link (the browser pastes as plain text then, which fires the same event).
let pasteAsk = false;
document.addEventListener('keydown', e => { pasteAsk = e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v'; }, true);

function onEditorPaste(pane, e) {
  const data = e.clipboardData;
  // Text wins (copying from Word also puts a picture on the clipboard).
  if (!data.files.length || data.types.includes('text/plain')) return;
  if (![...data.files].some(f => f.type.startsWith('image/') || IMAGE_FILE.test(f.name))) return;
  e.preventDefault();
  insertImages(pane, [...data.files], [], pasteAsk);
}

function onEditorDrop(pane, e) {
  const data = e.dataTransfer, path = data.getData(PATH_TYPE);
  const files = [...data.files].filter(f => f.type.startsWith('image/') || IMAGE_FILE.test(f.name));
  if (!data.types.includes(TAB_TYPE) && !path && !data.files.length) return;   // text dragged in the editor
  e.preventDefault();   // CodeMirror would otherwise paste a dropped file's text into the document
  if (!files.length && !(path && IMAGE_FILE.test(path))) return onDrop(data, pane);   // open it, as elsewhere in the pane
  const cm = pane.cm;
  cm.focus();
  cm.setCursor(cm.coordsChar({ left: e.clientX, top: e.clientY }));
  insertImages(pane, files, path ? [path] : [], e.shiftKey);
}

async function insertImages(pane, files, paths, ask, picture = null) {
  const tab = pane.active, doc = tab?.doc;
  if (!tab || !editable(tab)) return toast('This tab is read-only.');
  if (doc.language) return toast('Images can only be added to markdown files.');
  if (doc.draft) {
    if (!await host('confirm', { text: 'An image link needs the document to be saved as a file first. Save it now?' })) return;
    if (!await saveDoc(doc, true)) return;
  }
  // Files with a path are linked or copied by the host; a picture from the clipboard has no path
  // and goes over as PNG data.
  let png = picture;
  for (const file of files) {
    // WebView2 refuses to pass on a File that is not on disk: that is a picture.
    const path = await hostFiles([file]).then(found => found[0]?.path, () => '');
    if (path) paths.push(path);
    else if (!png && file.type.startsWith('image/')) png = await pngData(file);
  }
  const links = await host('placeImages', { doc: doc.path, paths, data: png, ask });
  if (!links?.length) return;
  pane.cm.replaceSelection(links.join('\n'));
  pane.cm.focus();
}

// Base64 PNG of a pasted picture (converted when it is not a PNG already).
async function pngData(file) {
  let blob = file;
  if (file.type !== 'image/png') {
    const bitmap = await createImageBitmap(file);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    blob = await canvas.convertToBlob({ type: 'image/png' });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

// ---------- Tabs between windows ----------
// Moves the tab to another window: 'next', 'new' or a window id. Text, unsaved changes and undo
// history go along. A file that is also in the other pane stays here; the other window then gets
// a read-only copy. A draft always moves as a whole.
async function moveTab(tab, target, { pane, screenX, screenY, closing } = {}) {
  const doc = tab.doc;
  const whole = !!doc.draft || tabsOf(doc).length === 1;
  if (doc.draftTimer) await writeDraft(doc);
  const source = paneOf(tab);
  const payload = {
    path: doc.path, draft: doc.draft, text: docText(doc), eol: doc.eol, encoding: doc.encoding,
    dirty: whole && doc.dirty, draftChanged: doc.draftChanged,
    history: whole && doc.cmDoc ? doc.cmDoc.getHistory() : null,
    mode: tab.mode, top: source.active === tab ? source.previewEl.scrollTop : tab.previewTop,
    bookmarks: doc.marks ? bookmarkList(doc) : doc.bmList ?? null,
    pinned: tab.pinned, readOnly: tab.readOnly,
  };
  await host('moveTab', {
    target, tab: payload, pane: pane ?? null,
    transfer: whole && doc.path && doc.lock ? doc.path : null,   // the other window takes over the edit lock
    screenX, screenY,
  });
  for (const t of whole ? tabsOf(doc) : [tab]) {
    detachTab(t);
    releaseTabDoc(t);
  }
  if (whole) {
    clearTimeout(doc.draftTimer);
    dropDoc(doc, !doc.lock);
  }
  await showAll();
  saveSession();
  // A secondary window without tabs has done its job.
  if (!state.primary && !allTabs().length && !closing) host('exit');
}

events.giveTab = ({ tab, to, pane }) => {
  const moving = allTabs().find(t => t.id === tab);
  if (moving) moveTab(moving, to, { pane });
};

events.adoptTab = async ({ tab: p, pane: index }) => {
  const pane = panes[index ?? state.activePane] ?? panes[0];
  if (p.history) await track(loadEditor());
  let doc = p.path ? findDoc(p.path) : findDraft(p.draft);
  if (!doc) doc = makeDoc({ path: p.path, draft: p.draft, text: p.text, encoding: p.encoding });
  if (p.path) doc.lock = await host('lock', { path: p.path });
  // Holding the lock now (moved as a whole): the moved text wins, unsaved edits and undo included.
  if (doc.lock || p.draft) {
    doc.text = p.text;
    doc.eol = p.eol;
    doc.encoding = p.encoding;
    doc.savedText = p.dirty ? undefined : p.text;   // with unsaved edits the saved text is not known here
    if (p.bookmarks) {
      if (doc.marks) setMarks(doc, p.bookmarks); else doc.bmList = p.bookmarks;
    }
    doc.dirty = !!p.dirty;
    doc.draftChanged = !!p.draftChanged;
    if (doc.cmDoc) {
      doc.cmDoc.setValue(p.text);
      if (p.history) doc.cmDoc.setHistory(p.history); else doc.cmDoc.clearHistory();
      doc.savedGeneration = doc.dirty ? -1 : doc.cmDoc.changeGeneration(true);
    } else doc.history = p.history;
  }
  let tab = pane.tabs.find(t => t.doc === doc);
  if (!tab) {
    tab = makeTab(doc, p.mode);
    insertTab(pane, tab);
  }
  tab.previewTop = p.top;
  tab.pinned ||= !!p.pinned;
  tab.readOnly ||= !!p.readOnly;
  if (p.path && doc.lock) doc.diskReadOnly = (await host('read', { path: p.path }).catch(() => ({}))).readOnly ?? false;
  for (const t of tabsOf(doc)) t.stale = true;
  syncWatchFiles();
  await activate(pane, tab);
  await showAll();
};

// ---------- Search ----------
// In the current file, the open files (their text as it is, unsaved edits included) or the files in
// the folder (searched by the host; open ones are searched here instead). One pattern serves both:
// the ^ codes become regular expression parts that JavaScript and .NET read the same way.
const SEARCH_CODES = { p: '(?:\\r\\n|\\n|\\r)', t: '\\t', '?': '.', '#': '\\d', '$': '[A-Za-z]', w: '[ \\t]+', '^': '\\^' };
const searchUi = {
  input: $('.mm-search-input'), scope: $('.mm-search-scope'),
  status: $('.mm-search-status'), results: $('.mm-search-results'),
};
const searchOptions = { case: false, word: false, regex: false };
let searchRun = 0, searchHits = [];

// `options`: case / word / regex; the file search's by default, the find bar (find.js) passes its own.
function searchPattern(text, options = searchOptions) {
  let source = '';
  if (options.regex) source = text;
  else for (let i = 0; i < text.length; i++) {
    const code = text[i] === '^' && SEARCH_CODES[text[i + 1]?.toLowerCase()];
    if (code) {
      source += code;
      i++;
    } else source += text[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return options.word ? `\\b(?:${source})\\b` : source;
}

// Matches in a text, with lines and columns as CodeMirror counts them.
function searchText(text, regex) {
  const starts = [0];
  for (let i = 0; i < text.length; i++)
    if (text[i] === '\n' || (text[i] === '\r' && text[i + 1] !== '\n')) starts.push(i + 1);
  const at = index => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1; }
    return { line: lo, col: index - starts[lo] };
  };
  const matches = [];
  for (const m of text.matchAll(regex)) {
    if (!m[0].length) continue;
    const from = at(m.index), to = at(m.index + m[0].length);
    const end = from.line + 1 < starts.length ? starts[from.line + 1] : text.length;
    matches.push({ line: from.line, col: from.col, endLine: to.line, endCol: to.col,
      text: text.slice(starts[from.line], end).replace(/[\r\n]+$/, '') });
    if (matches.length >= 2000) break;
  }
  return matches;
}

function searchFolder() {
  return state.root || (activeDoc()?.path ? dirOf(activeDoc().path) : null);
}

async function runSearch() {
  const text = searchUi.input.value;
  if (!text) return;
  recordFind(text, searchOptions);   // the history, shared with the find bar (history.js)
  const run = ++searchRun, scope = searchUi.scope.value;
  const source = searchPattern(text);
  let regex;
  try { regex = new RegExp(source, searchOptions.case ? 'g' : 'gi'); }
  catch (e) { return searchUi.status.textContent = 'Not a valid regular expression: ' + e.message; }
  searchUi.status.textContent = 'Searching...';
  const markdownOnly = document.body.dataset.tree === 'md';
  const folder = scope === 'folder' ? searchFolder() : null;
  if (scope === 'folder' && !folder) return searchUi.status.textContent = 'No folder: open a folder or a file first.';

  // Open documents are searched here, so unsaved edits count.
  let docsHere = scope === 'file' ? [activeDoc()].filter(Boolean) : [...docs];
  if (folder) docsHere = docsHere.filter(d => d.path && d.path.toLowerCase().startsWith(folder.toLowerCase().replace(/\\$/, '') + '\\') &&
    (!markdownOnly || MARKDOWN_FILE.test(d.path)));
  const groups = docsHere.map(doc => ({ path: doc.path, draft: doc.draft, matches: searchText(docText(doc), regex) }))
    .filter(g => g.matches.length);
  let truncated = false;
  if (folder) {
    try {
      const found = await host('search', { root: folder, pattern: source, ignoreCase: !searchOptions.case, markdownOnly,
        skip: docsHere.map(d => d.path) });
      groups.push(...found.files);
      truncated = found.truncated;
    } catch (e) {
      if (run === searchRun) searchUi.status.textContent = e.message;
      return;
    }
  }
  if (run !== searchRun) return;   // a newer search started meanwhile
  groups.sort((a, b) => (a.path || '').toLowerCase() < (b.path || '').toLowerCase() ? -1 : 1);
  showSearchResults(groups, truncated, folder);
}

function showSearchResults(groups, truncated, folder) {
  searchHits = [];
  const total = groups.reduce((n, g) => n + g.matches.length, 0);
  searchUi.status.textContent = !total ? 'No matches.' :
    `${total} match${total === 1 ? '' : 'es'} in ${groups.length} file${groups.length === 1 ? '' : 's'}` +
    (truncated ? ' (stopped at 2000)' : '') + (folder ? ` - ${folder}` : '');
  const parts = [];
  for (const group of groups) {
    const head = document.createElement('div');
    head.className = 'mm-result-file';
    head.title = group.path || `Draft ${group.draft}`;
    head.innerHTML = `<span class="mm-result-name">${escapeHtml(group.path ? nameOf(group.path) : group.draft)}</span>` +
      `<span class="mm-result-dir">${escapeHtml(group.path && !samePath(dirOf(group.path), state.root) ? relativePath(dirOf(group.path)) : '')}</span>` +
      `<span class="mm-result-count">${group.matches.length}</span>`;
    const list = document.createElement('div');
    list.className = 'mm-result-list';
    for (const m of group.matches) {
      const row = document.createElement('div');
      row.className = 'mm-result';
      row.dataset.hit = searchHits.push({ ...m, path: group.path, draft: group.draft }) - 1;
      const end = m.endLine === m.line ? m.endCol : m.text.length;
      // Long lines: start a little before the match.
      const from = Math.max(0, m.col - 30);
      row.innerHTML = `<span class="mm-result-line">${m.line + 1}</span><span class="mm-result-text">` +
        (from ? '...' : '') + escapeHtml(m.text.slice(from, m.col)) + `<mark>${escapeHtml(m.text.slice(m.col, end))}</mark>` +
        escapeHtml(m.text.slice(end, end + 200)) + '</span>';
      list.append(row);
    }
    parts.push(head, list);
  }
  searchUi.results.replaceChildren(...parts);
}

searchUi.results.addEventListener('click', async e => {
  const head = e.target.closest('.mm-result-file');
  if (head) return head.classList.toggle('mm-closed');
  const row = e.target.closest('.mm-result');
  if (!row) return;
  for (const on of searchUi.results.querySelectorAll('.mm-result.mm-on')) on.classList.remove('mm-on');
  row.classList.add('mm-on');
  const hit = searchHits[+row.dataset.hit];
  let tab;
  if (hit.draft) {
    const doc = findDraft(hit.draft);
    if (!doc) return toast('That draft is closed.');
    tab = tabsOf(doc).find(t => paneOf(t).index === state.activePane) ?? tabsOf(doc)[0];
    await activate(paneOf(tab), tab);
  } else tab = await openFile(hit.path);
  const pane = paneOf(tab);
  if (tab.mode !== 'edit') setPreviewLine(pane, Math.max(0, hit.line - 3));
  if (tab.mode !== 'preview' && pane.cm) {
    pane.placed = tab.mode === 'split';
    asFound(pane, () => pane.cm.setSelection({ line: hit.line, ch: hit.col }, { line: hit.endLine, ch: hit.endCol }));   // places.js
    revealFound(pane.cm, { line: hit.line, ch: 0 }, { line: hit.endLine, ch: hit.endCol });
  }
});

// The history (history.js): an entry with its switches; `typed`: the text as typed, the switches as they are.
attachHistory(searchUi.input, 'find', (entry, typed) => {
  searchUi.input.value = entry.text;
  if (typed) return;
  for (const button of document.querySelectorAll('.mm-search-bar [data-opt]')) {
    searchOptions[button.dataset.opt] = !!entry[button.dataset.opt];
    button.classList.toggle('mm-on', searchOptions[button.dataset.opt]);
  }
});
searchUi.input.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    runSearch();
  }
});
// Esc in the search (unless a find bar is open: that closes first): the sidebar as before the search, back to the file.
$('.mm-search-view').addEventListener('keydown', e => {
  if (e.key !== 'Escape' || panes.some(p => p.find && !p.find.el.hidden)) return;
  e.preventDefault();
  const back = searchReturn ?? { sidebar: true, view: 'folder' };
  searchReturn = null;
  setSideView(back.view && back.view !== 'search' ? back.view : 'folder');
  if (!back.sidebar) setSidebar(false);
  focusPane(panes[state.activePane]);
});
searchUi.scope.addEventListener('change', () => { keepLayout('searchScope', searchUi.scope.value); runSearch(); });
for (const button of document.querySelectorAll('.mm-search-bar [data-opt]')) {
  button.addEventListener('click', () => {
    searchOptions[button.dataset.opt] = !searchOptions[button.dataset.opt];
    button.classList.toggle('mm-on', searchOptions[button.dataset.opt]);
    runSearch();
  });
}

function setSideView(view) {
  document.body.dataset.side = view;
  keepLayout('sideView', view);
}

// Ctrl+Shift+F: the search, filled with the editor's selection when that is one line.
let searchReturn = null;   // the sidebar as it was before the search opened: Esc goes back to it
function startSearch() {
  if (document.body.dataset.side !== 'search' || document.body.dataset.sidebar !== 'on')
    searchReturn = { sidebar: document.body.dataset.sidebar === 'on', view: document.body.dataset.side };
  setSidebar(true);
  setSideView('search');
  const selected = activeTab() && paneOf(activeTab()).cm?.getSelection();
  if (selected && !selected.includes('\n')) searchUi.input.value = selected;
  searchUi.input.focus();
  searchUi.input.select();
}

// ---------- Zoom per screen (docs/plans/executed/PLAN-settings-layers.md, 3.6) ----------
// How readable text is depends on the screen, not on the project. The base is global (editorSize, zoom in the
// settings); the monitor this window is on adds its own, which the host keeps per monitor: points added to the editor
// font, a factor on the preview zoom. Zoom in / out / 100% change this screen's (the editor's with the focus there,
// else the preview's); every window on the monitor follows (events.screen), and a window moved to another monitor
// takes that one's.
const ZOOM_MIN = 0.5, ZOOM_MAX = 3;
const screenZoom = { key: '', name: '', editorStep: 0, previewFactor: 1 };
const clampZoom = z => Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) * 100) / 100;
const previewZoom = () => clampZoom((setting('zoom') || 1) * screenZoom.previewFactor);
const baseEditorPt = () => fontSetting('editorSize') || ptOf(EDITOR_PX);
const editorPt = () => Math.max(6, Math.min(48, baseEditorPt() + screenZoom.editorStep));

events.screen = s => {
  const was = { ...screenZoom };
  Object.assign(screenZoom, s);
  if (was.editorStep !== screenZoom.editorStep) applyFonts();
  if (was.previewFactor !== screenZoom.previewFactor) applyZoom(previewZoom());
};

// This screen's zoom changed here: applied at once (quick steps, as the mouse wheel, build on each other), then to
// the host, which tells the other windows on the monitor.
function setScreenZoom(change) {
  events.screen({ ...screenZoom, ...change });
  host('screenZoom', change);
}

// The preview in steps of 10% (of what it shows), on this screen.
const zoomBy = step => {
  const target = clampZoom(Math.round((previewZoom() + step / 10) * 10) / 10);
  setScreenZoom({ previewFactor: Math.round(target / (setting('zoom') || 1) * 10000) / 10000 });
};

// Zoom 100%: this screen back to the base, the editor's or the preview's.
function zoomReset(editor) {
  setScreenZoom(editor ? { editorStep: 0 } : { previewFactor: 1 });
  if (editor) toast(`Editor font ${baseEditorPt()} pt on this screen, as on every screen`, true);
}

// View > Zoom > Use on every screen: this screen's zoom becomes the base, no monitor keeps its own.
async function zoomOnEveryScreen() {
  const pt = editorPt(), zoom = previewZoom();
  setSetting('editorSize', pt === ptOf(EDITOR_PX) ? 0 : pt);
  setSetting('zoom', zoom);
  await host('screenZoomClear');
  toast(`Editor font ${pt} pt and preview ${Math.round(zoom * 100)}% on every screen`, true);
}

function applyZoom(zoom) {
  // Keep each pane at the line it shows.
  const at = panes.map(p => p.active && p.el.dataset.mode !== 'edit' ? previewLine(p) : null);
  document.body.style.setProperty('--zoom', zoom);
  document.body.toggleAttribute('data-zoomed', zoom !== 1);
  $('.mm-zoom').textContent = Math.round(zoom * 100) + '%';
  for (const tab of allTabs()) tab.lines = null;
  panes.forEach((p, i) => at[i] !== null && setPreviewLine(p, at[i]));
  for (const p of panes) if (p.previewBoxes) drawPreviewBoxes(p);   // found text's boxes: the text has another size (find.js)
}
// ---------- Fonts (Options > Settings > Fonts) ----------
// The editor font and the app font, each with a size in points (as Windows shows them). Not chosen:
// Consolas 14 px in the editor, Segoe UI 13 px for the app. The editor also has a line height (times
// the font size). The app's smaller texts scale along (--ui-scale in app.css). Settings in settings.json
// (0 or "": the default), so every window follows a change.
const EDITOR_FONT = 'Consolas, "Cascadia Mono", monospace', APP_FONT = '"Segoe UI", system-ui, sans-serif';
const EDITOR_PX = 14, APP_PX = 13, FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24];
const FONT_SETTINGS = ['editorFont', 'editorSize', 'editorLine', 'appFont', 'appSize', 'statusFont', 'statusSize'];
const EDITOR_LINE = 1.3, LINE_HEIGHTS = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2];   // editorLine: times the font size
const ptOf = px => px * 72 / 96, pxOf = pt => pt * 96 / 72;

const fontSetting = name => setting(name);
const setFontSetting = (name, value) => setSetting(name, value || settings.defaults[name]);

function applyFonts() {
  const font = (name, rest) => name ? `"${name.replace(/["\\]/g, '')}", ${rest}` : rest;
  const root = document.documentElement.style;
  root.setProperty('--editor-font', font(fontSetting('editorFont'), EDITOR_FONT));
  root.setProperty('--editor-size', pxOf(editorPt()) + 'px');   // the base and this screen's step
  root.setProperty('--editor-line', fontSetting('editorLine') || EDITOR_LINE);
  root.setProperty('--app-font', font(fontSetting('appFont'), APP_FONT));
  root.setProperty('--ui-scale', fontSetting('appSize') ? pxOf(fontSetting('appSize')) / APP_PX : 1);
  // The bottom bar: its own font and size, else the app's (app.css).
  if (fontSetting('statusFont')) root.setProperty('--status-font', font(fontSetting('statusFont'), APP_FONT));
  else root.removeProperty('--status-font');
  if (fontSetting('statusSize')) root.setProperty('--status-size', pxOf(fontSetting('statusSize')) + 'px');
  else root.removeProperty('--status-size');
  relayout();
  columnFontChanged();
  virtualFontChanged();
  if (typeof applyRuler === 'function') applyRuler();   // the columns' width (ruler.js)
}

// ---------- Wrap long lines (View menu, Alt+Z) ----------
// The editor and the code in the preview (code files and fenced blocks). Off, a line longer than
// LONG_LINE characters is still wrapped in the preview: one long coloured line takes the browser seconds
// to find what is under the mouse (measured on a 241,477-character JSON line), wrapped it does not.
const LONG_LINE = 10000;   // also where the editor stops colouring a line (CodeMirror's maxHighlightLength)

const setWrap = on => setSetting('wrap', on);

// Wrap long lines: the editor's (setting wrap); the code blocks of the preview have their own (previewWrap).
function applyWrap(on) {
  for (const pane of panes) pane.cm?.setOption('lineWrapping', on);
  relayout();
}

// Per file, checked again only when the text changed (the bottom bar asks on every cursor move).
function longLineIn(doc) {
  if (doc.longLineVersion !== doc.version) {
    doc.longLineVersion = doc.version;
    doc.longLine = hasLongLine(docText(doc));
  }
  return doc.longLine;
}

const hasLongLine = text => text.length > LONG_LINE && text.split('\n').some(line => line.length > LONG_LINE);

// Ctrl+mouse wheel and the zoom keys in the editor: a point bigger or smaller, from 6 to 48.
// The editor font a point bigger or smaller on this screen (Ctrl+wheel, Zoom in / out in the editor).
function editorSizeBy(step) {
  const pt = editorPt(), next = Math.max(6, Math.min(48, step > 0 ? Math.floor(pt) + 1 : Math.ceil(pt) - 1));
  setScreenZoom({ editorStep: next - baseEditorPt() });
  toast(`Editor font ${next} pt on this screen`, true);
}

// ---------- Outline ----------
// The headings of each pane's active tab, at its right. Built from the source (markdown-it's parse),
// so it also works in the editor; each heading knows its source line.
function headingsOf(doc) {
  if (doc.headingsVersion === doc.version && doc.headings) return doc.headings;
  const tokens = md.parse(withFrontMatter(docText(doc)), {});
  const headings = [];
  tokens.forEach((token, i) => {
    if (token.type !== 'heading_open' || !token.map) return;
    const text = tokens[i + 1].children?.filter(c => c.type === 'text' || c.type === 'code_inline' || c.type === 'emoji')
      .map(c => c.content).join('') || tokens[i + 1].content;
    headings.push({ level: +token.tag.slice(1), text, line: token.map[0] });
  });
  doc.headingsVersion = doc.version;
  return doc.headings = headings;
}

function setOutline(on) {
  document.body.toggleAttribute('data-outline', on);
  keepLayout('outline', on);
  for (const pane of panes) {
    if (typeof setupGutter === 'function') setupGutter(pane);   // the outline's column in the gutter, or not
    pane.outlineFor = null;
    showOutline(pane);
  }
  relayout();
}

function showOutline(pane) {
  const doc = pane.active?.doc;
  const show = document.body.hasAttribute('data-outline') && hasOutline(doc);
  pane.el.toggleAttribute('data-no-outline', !show);
  if (!show) return;
  const headings = outlineOf(doc) ?? [];
  if (pane.outlineFor === doc && pane.outlineVersion === doc.version) return markOutline(pane);
  pane.outlineFor = doc;
  pane.outlineVersion = doc.version;
  // Groups (a pack's tag groups): a header per group with entries, or all together in line order (outlineMerged);
  // a bullet in the group's colour (outlineBullets).
  const groups = headings.groups, merged = !groups || setting('outlineMerged'), bullets = groups && setting('outlineBullets') !== false;
  const folded = outlineFolded(doc);
  const item = h => {
    const el = document.createElement('div'), level = merged ? h.mergedLevel ?? h.level : h.level;   // indent: auto (languages.js)
    el.className = 'mm-outline-item';
    el.dataset.line = h.line;
    el.dataset.ch = h.ch ?? 0;
    el.dataset.level = level;
    el.style.paddingLeft = 8 + (level - 1) * 12 + (groups && !merged ? 10 : 0) + 'px';
    if (h.group !== undefined) el.dataset.group = h.group;
    if (bullets) {
      const b = document.createElement('span');
      b.className = 'mm-outline-bullet';
      b.style.background = groups[h.group].colour;
      el.append(b);
    }
    el.append(h.text);
    el.title = groups ? `${h.text} (${groups[h.group].name})` : h.text;
    if (!merged && folded.has(groups[h.group].name)) el.hidden = true;
    return el;
  };
  if (merged) pane.outlineEl.replaceChildren(...[...headings].sort((a, b) => a.line - b.line).map(item));
  else pane.outlineEl.replaceChildren(...groups.flatMap((g, gi) => {
    const own = headings.filter(h => h.group === gi);
    if (!own.length) return [];                             // a group without entries is left out
    const head = document.createElement('div');
    head.className = 'mm-outline-group';
    head.dataset.groupHead = gi;
    head.toggleAttribute('data-folded', folded.has(g.name));
    if (bullets) { const b = document.createElement('span'); b.className = 'mm-outline-bullet'; b.style.background = g.colour; head.append(b); }
    head.append(`${g.name} (${own.length})`);
    head.title = 'Click: fold or unfold';
    return [head, ...own.map(item)];
  }));
  if (!headings.length) pane.outlineEl.innerHTML = `<div class="mm-outline-none">${doc.language ? 'Nothing found' : 'No headings'}</div>`;
  paintOutlineGutter(pane, headings);
  markOutline(pane);
}

// While the outline is open: every entry's bullet in the gutter on its line, in its group's colour (gutter.js
// adds the column).
function paintOutlineGutter(pane, headings) {
  const cm = pane.cm;
  if (!cm || typeof OUTLINE_GUTTER === 'undefined') return;
  cm.clearGutter(OUTLINE_GUTTER);
  if (!document.body.hasAttribute('data-outline')) return;
  const groups = headings.groups;
  cm.operation(() => {
    for (const h of headings) {
      if (h.line > cm.lastLine()) continue;
      const el = document.createElement('span');
      el.className = 'mm-outline-mark';
      el.style.background = groups ? groups[h.group].colour : 'var(--accent)';
      el.title = groups ? `${h.text} (${groups[h.group].name})` : h.text;
      cm.setGutterMarker(h.line, OUTLINE_GUTTER, el);
    }
  });
}

// Folded groups, per language (the group names).
function outlineFolded(doc) {
  try { return new Set(JSON.parse(localStorage['outlineFolded.' + languageOf(doc)] ?? '[]')); } catch { return new Set(); }
}
function setOutlineFolded(doc, name, fold) {
  const set = outlineFolded(doc);
  if (fold) set.add(name); else set.delete(name);
  try { localStorage['outlineFolded.' + languageOf(doc)] = JSON.stringify([...set]); } catch { }
}
function toggleOutlineGroup(pane, head, fold = !head.hasAttribute('data-folded')) {
  const doc = pane.active?.doc, gi = head.dataset.groupHead, name = outlineOf(doc)?.groups?.[gi]?.name;
  if (name === undefined) return;
  setOutlineFolded(doc, name, fold);
  head.toggleAttribute('data-folded', fold);
  for (const el of pane.outlineEl.querySelectorAll(`.mm-outline-item[data-group="${gi}"]`)) el.hidden = fold;
}

// The outline's right-click menu: its two settings.
function outlineMenu(e) {
  e.preventDefault();
  openPopupMenu([
    { label: 'Groups together, by line', plain: true, checked: !!setting('outlineMerged'), run: () => setSetting('outlineMerged', !setting('outlineMerged')) },
    { label: 'Bullet in the group\'s colour', plain: true, checked: setting('outlineBullets') !== false, run: () => setSetting('outlineBullets', setting('outlineBullets') === false) },
  ], e.clientX, e.clientY);
}

let outlineTimer = 0;
function scheduleOutline() {
  clearTimeout(outlineTimer);
  outlineTimer = setTimeout(() => panes.forEach(showOutline), 300);
}

// The heading the pane is at: the last one at or above the cursor's line (the editor shown), else the top line of
// the preview.
function markOutline(pane) {
  if (pane.el.hasAttribute('data-no-outline') || !document.body.hasAttribute('data-outline')) return;
  cancelAnimationFrame(pane.markFrame);
  pane.markFrame = requestAnimationFrame(() => {
    const tab = pane.active;
    if (!tab) return;
    const line = tab.mode !== 'preview' && pane.cm ? pane.cm.getCursor().line : previewLine(pane);
    // The last entry at or above the line, of all groups (in groups the list is not in line order).
    let current = null;
    for (const item of pane.outlineEl.querySelectorAll('[data-line]'))
      if (+item.dataset.line <= line + 0.5 && (!current || +item.dataset.line >= +current.dataset.line)) current = item;
    if (current?.hidden) {                                 // in a folded group: the group opens
      const head = pane.outlineEl.querySelector(`[data-group-head="${current.dataset.group}"]`);
      if (head) toggleOutlineGroup(pane, head, false);
    }
    for (const item of pane.outlineEl.querySelectorAll('.mm-on')) if (item !== current) item.classList.remove('mm-on');
    if (current && !current.classList.contains('mm-on')) {
      current.classList.add('mm-on');
      current.scrollIntoView({ block: 'nearest' });
    }
  });
}

// A found place (a find, a search result, a compare difference, a bookmark, Go to line) into view, after the cursor
// went there. Settings: revealInView (stay: the view stays, unless the place is within revealLines of an edge;
// center), revealOutOfView (keep: revealLines from the edge it comes in at, the top going up, the bottom going down;
// center) and revealLines. Never so many lines that the place itself would fall out of view.
function revealFound(cm, from, to = from) {
  const info = cm.getScrollInfo(), view = info.clientHeight;
  const start = cm.charCoords(from, 'local'), top = start.top;
  const tall = cm.charCoords(to, 'local').bottom - top > view;   // taller than the view: its start
  const bottom = tall ? start.bottom : cm.charCoords(to, 'local').bottom;
  const y = revealTop(info.top, view, top, bottom, cm.defaultTextHeight());
  if (y != null) cm.scrollTo(null, Math.max(0, y));
  cm.scrollIntoView(tall ? from : { from, to }, 0);   // sideways (up or down it is in view by now)
}

// The same for a found place in the preview (a find, a highlight): the ranges from `first` to `last`. A line is the
// line height where the place starts, on screen: the computed one is without the preview zoom, the box with it.
function revealFoundInPreview(pane, first, last = first) {
  const el = pane.previewEl, box = el.getBoundingClientRect(), view = el.clientHeight;
  const start = first.getBoundingClientRect(), top = start.top - box.top + el.scrollTop;
  const tall = last.getBoundingClientRect().bottom - start.top > view;   // taller than the view: its start
  const bottom = (tall ? start.bottom : last.getBoundingClientRect().bottom) - box.top + el.scrollTop;
  const node = first.startContainer, block = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const article = block?.closest('.mm-preview');
  const scale = article?.offsetHeight ? article.getBoundingClientRect().height / article.offsetHeight : 1;
  const lh = (parseFloat(getComputedStyle(block ?? el).lineHeight) || start.height) * scale;
  const y = revealTop(el.scrollTop, view, top, bottom, lh);
  if (y != null) el.scrollTop = Math.max(0, y);
}

// Where a found place scrolls to, as the settings say (revealFound): the new top, or null when the view stays. All
// in pixels from the top of the content: the view's top and height, the place's top and bottom, a line's height.
function revealTop(viewTop, view, top, bottom, lh) {
  const height = bottom - top;
  const lines = Number.isInteger(setting('revealLines')) ? setting('revealLines') : 5;
  const keep = Math.max(0, Math.min(lines, Math.floor((view - height) / lh / 2))) * lh;
  const inView = top >= viewTop && bottom <= viewTop + view;
  if (inView ? setting('revealInView') === 'center' : setting('revealOutOfView') === 'center') return top - (view - height) / 2;
  if (top < viewTop + keep) return top - keep;
  if (bottom > viewTop + view - keep) return bottom - view + keep;
  return null;
}

// A highlight (settings highlightStyle, highlightColour, highlightIntensity): its colour as --highlight-mark, its
// style as body[data-highlight] (app.css). The intensity moves the colour along the line from the background through
// it: 0 the background, 100 the colour, beyond it further away (each channel clamped), so it can be more intense than
// the colour itself. Again when the theme changes (applyLook).
function applyHighlight() {
  const colour = colourCss(setting('highlightColour'), 'highlight'), percent = setting('highlightIntensity');
  document.documentElement.style.setProperty('--highlight-mark', atIntensity(colour, percent));
  for (const pane of panes)   // the editor with a theme of its own: from its colours and background
    if (look?.editor) pane.editorEl.style.setProperty('--highlight-mark', atIntensity(colour, percent, pane.editorEl));
    else pane.editorEl.style.removeProperty('--highlight-mark');
  document.body.dataset.highlight = setting('highlightStyle') === 'underline' ? 'underline' : 'background';
}

// The box behind code within a line of text (app.css --md-code-bg): the theme colour inlineCode at the setting
// inlineCodeIntensity. Again when the theme changes (applyLook).
// The editor or the preview with a theme of its own gets its own, from its colours and background.
function applyInlineCode() {
  const percent = setting('inlineCodeIntensity');
  document.documentElement.style.setProperty('--inline-code-mark', atIntensity('var(--inline-code)', percent));
  for (const pane of panes)
    for (const [el, own] of [[pane.editorEl, look?.editor], [pane.previewEl, look?.preview]])
      if (own) el.style.setProperty('--inline-code-mark', atIntensity('var(--inline-code)', percent, el));
      else el.style.removeProperty('--inline-code-mark');
}

// A colour (any CSS, theme variables too) moved along the line from the background through it: 0% the background,
// 100% the colour, beyond further away (each channel clamped, up to 200%), as an rgb() for a CSS variable.
function atIntensity(css, percent, where = document.body) {
  const probe = document.createElement('div');
  where.append(probe);   // the colours and background of `where` (the preview may have a theme of its own)
  const rgb = value => { probe.style.color = ''; probe.style.color = value; return getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number); };
  const colour = rgb(css), bg = rgb('var(--bg)');
  probe.remove();
  const k = (Number.isFinite(percent) ? Math.min(200, Math.max(0, percent)) : 100) / 100;
  return `rgb(${colour.map((c, i) => Math.round(Math.min(255, Math.max(0, bg[i] + (c - bg[i]) * k)))).join(', ')})`;
}

// Puts the source line at the top of the pane: preview, editor or both. The cursor stays where it is (a click in
// the outline; a double-click moves it). `focus`: the editor gets the keys again.
// `found` (a click in the outline): placed as a found place is, by the settings of Find > Jump to a found place
// (centred, or the lines kept from the edge; revealFound), in the editor and in the preview.
function goToLine(pane, line, focus = true, found = false) {
  const tab = pane.active;
  if (!tab) return;
  if (tab.mode !== 'edit') {
    const el = tab.article.querySelector(`[data-line="${line}"]`);
    if (el && found) {
      const range = document.createRange();
      range.selectNodeContents(el);
      revealFoundInPreview(pane, range);
    } else if (el) pane.previewEl.scrollTop = el.getBoundingClientRect().top - pane.previewEl.getBoundingClientRect().top + pane.previewEl.scrollTop - 8;
    else setPreviewLine(pane, line);
  }
  if (tab.mode !== 'preview' && pane.cm) {
    pane.placed = tab.mode === 'split';
    if (found) revealFound(pane.cm, CodeMirror.Pos(line, 0));
    else pane.cm.scrollTo(null, pane.cm.heightAtLine(line, 'local'));
    if (focus) pane.cm.focus();
  }
}

// A long click on an outline entry: a sneak preview. While the button is held the pane shows the entry (and the
// entry under the pointer as it moves along the outline); on release it goes back to where it was.
const SNEAK_DELAY = 400;
function startSneak(pane, e) {
  const item = e.target.closest('[data-line]');
  if (!item || e.button !== 0) return;
  clearTimeout(pane.sneakTimer);
  pane.sneakTimer = setTimeout(() => {
    pane.sneak = { editor: pane.cm?.getScrollInfo().top ?? 0, preview: pane.previewEl.scrollTop, line: null };
    pane.el.toggleAttribute('data-sneak', true);
    // A theme of its own (setting sneakTheme): the editor and the preview in it while it lasts.
    if (look?.sneak) {
      const mode = look.sneak.chain.includes('light') ? 'light' : look.sneak.chain.includes('dark') ? 'dark' : look.mode;
      for (const el of [pane.editorEl, pane.previewEl]) { setThemeVars(el, look.sneak.vars); el.dataset.theme = mode; }
      pane.el.toggleAttribute('data-sneak-themed', true);
    }
    sneakTo(pane, item);
  }, SNEAK_DELAY);
}
function sneakTo(pane, item) {
  if (!pane.sneak || !item || +item.dataset.line === pane.sneak.line) return;
  pane.sneak.line = +item.dataset.line;
  for (const el of pane.outlineEl.querySelectorAll('.mm-sneak')) el.classList.remove('mm-sneak');
  item.classList.add('mm-sneak');
  goToLine(pane, pane.sneak.line, false);
  // The previewed line tinted, and a badge that says what this is (app.css: the frame, the tint, no cursor).
  if (pane.cm && pane.active?.mode !== 'preview') {
    if (pane.sneak.mark) pane.cm.removeLineClass(pane.sneak.mark, 'background', 'mm-sneak-line');
    pane.sneak.mark = pane.cm.addLineClass(pane.sneak.line, 'background', 'mm-sneak-line');
  }
  let badge = pane.el.querySelector('.mm-sneak-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'mm-sneak-badge';
    pane.el.querySelector('.mm-body').append(badge);
  }
  badge.textContent = `Sneak preview: line ${pane.sneak.line + 1}, ${item.textContent} (release to go back)`;
}
function endSneak(pane) {
  clearTimeout(pane.sneakTimer);
  const s = pane.sneak;
  if (!s) return;
  pane.sneak = null;
  pane.sneakEnded = true;                                  // the click that follows the release does nothing
  pane.el.removeAttribute('data-sneak');
  if (pane.el.hasAttribute('data-sneak-themed')) {          // back to the editor's own theme, and the preview's
    pane.el.removeAttribute('data-sneak-themed');
    themePane(pane.editorEl, look.editor);
    themePane(pane.previewEl, look.preview);
  }
  pane.el.querySelector('.mm-sneak-badge')?.remove();
  if (s.mark && pane.cm) pane.cm.removeLineClass(s.mark, 'background', 'mm-sneak-line');
  for (const el of pane.outlineEl.querySelectorAll('.mm-sneak')) el.classList.remove('mm-sneak');
  if (pane.cm) pane.cm.scrollTo(null, s.editor);
  pane.previewEl.scrollTop = s.preview;
}

function resizeOutline(e) {
  const edge = e.target;
  edge.setPointerCapture(e.pointerId);
  const right = edge.parentElement.getBoundingClientRect().right;
  const move = ev => document.body.style.setProperty('--outline-w', Math.max(120, Math.min(right - ev.clientX, 600)) + 'px');
  edge.addEventListener('pointermove', move);
  edge.addEventListener('pointerup', () => {
    edge.removeEventListener('pointermove', move);
    keepLayout('outlineWidth', parseInt(document.body.style.getPropertyValue('--outline-w')) || 0);
    relayout();
  }, { once: true });
}

// Editor and preview side by side: the editor's share of the width, 0.1 to 0.9 (half and half when not
// set). One value for all panes of the window, kept with its layout.
function setSplit(share) {
  keepLayout('editShare', share || 0);
  document.body.style.setProperty('--edit-share', share || 0.5);
  relayout();
}

function resizeSplit(e) {
  const edge = e.target;
  edge.setPointerCapture(e.pointerId);
  const box = edge.parentElement.getBoundingClientRect();
  const share = ev => Math.round(Math.max(0.1, Math.min(0.9, (ev.clientX - box.left) / box.width)) * 1000) / 1000;
  const move = ev => document.body.style.setProperty('--edit-share', share(ev));
  edge.addEventListener('pointermove', move);
  edge.addEventListener('pointerup', ev => {
    edge.removeEventListener('pointermove', move);
    setSplit(share(ev));
  }, { once: true });
}

// ---------- Scrolling both panes together ----------
// By source line: the line at the top of one pane is brought to the top of the other.

// Source line -> vertical position in the preview, for the blocks that carry data-line.
function lineMap(pane) {
  const tab = pane.active;
  if (tab.lines) return tab.lines;
  const base = pane.previewEl.getBoundingClientRect().top - pane.previewEl.scrollTop;
  const map = [];
  if (tab.doc.language) {
    // A code file is one <pre>: its lines are evenly spaced.
    const pre = tab.article.querySelector('pre');
    if (pre) {
      const style = getComputedStyle(pre), r = pre.getBoundingClientRect();
      const top = r.top - base + parseFloat(style.paddingTop);
      const lines = docText(tab.doc).split('\n').length;
      map.push({ line: 0, y: top }, { line: lines, y: r.bottom - base - parseFloat(style.paddingBottom) });
    }
  } else {
    let last = { line: -1, y: -1 };
    for (const el of tab.article.querySelectorAll('[data-line]')) {
      const line = +el.dataset.line, y = el.getBoundingClientRect().top - base;
      if (line > last.line && y >= last.y) map.push(last = { line, y });
    }
  }
  return tab.lines = map;
}

function previewLine(pane) {
  const map = lineMap(pane), top = pane.previewEl.scrollTop;
  if (!map.length) return 0;
  let i = 0;
  while (i + 1 < map.length && map[i + 1].y <= top) i++;
  const a = map[i], b = map[i + 1];
  if (top < a.y) return a.line * Math.max(0, top) / Math.max(1, a.y);
  if (!b) return a.line;
  return a.line + (top - a.y) / Math.max(1, b.y - a.y) * (b.line - a.line);
}

function setPreviewLine(pane, line) {
  const map = lineMap(pane);
  if (!map.length) return;
  let i = 0;
  while (i + 1 < map.length && map[i + 1].line <= line) i++;
  const a = map[i], b = map[i + 1];
  const y = line < a.line ? a.y * line / Math.max(1, a.line)
    : !b ? a.y : a.y + (line - a.line) / (b.line - a.line) * (b.y - a.y);
  const el = pane.previewEl, target = Math.max(0, Math.min(Math.round(y), el.scrollHeight - el.clientHeight));
  if (Math.abs(el.scrollTop - target) < 1) return;
  pane.ignoreScroll = true;   // not an echo back to the pane that started it
  el.scrollTop = target;
}

function editorLine(cm) {
  const top = cm.getScrollInfo().top, line = cm.lineAtHeight(top, 'local');
  const a = cm.heightAtLine(line, 'local'), b = cm.heightAtLine(line + 1, 'local');
  return line + Math.max(0, Math.min(1, (top - a) / Math.max(1, b - a)));
}

// Lines far away have estimated heights until drawn, so check once more after the scroll.
function setEditorLine(pane, line, again = true) {
  const cm = pane.cm, i = Math.floor(line);
  const a = cm.heightAtLine(i, 'local'), b = cm.heightAtLine(i + 1, 'local');
  const info = cm.getScrollInfo(), y = Math.max(0, Math.min(a + (line - i) * (b - a), info.height - info.clientHeight));
  if (Math.abs(info.top - y) < 1) return;
  pane.ignoreEditorScroll = true;
  cm.scrollTo(null, y);
  if (again) requestAnimationFrame(() => setEditorLine(pane, line, false));
}

// The other pane, when both are visible and scrolling together.
function syncPartner(pane) {
  const other = panes[1 - pane.index];
  return state.sync && bothShown() && pane.active && other.active ? other : null;
}

// Scroll together (docs/plans/executed/PLAN-split-view.md): Align scrolling by keeping the line distance (the default)
// or by the same line number. The distance, in lines (the second pane's top line minus the first's), is taken when
// scroll together is turned on, and again when another tab shows in either pane; Alt + mouse wheel scrolls one pane
// alone and takes it again; Level sets it to 0. A pane at its end stops there; the distance stays.
function keepsDistance() { return setting('scrollTogether') !== 'line'; }
const paneTopLine = pane => pane.el.dataset.mode !== 'preview' && pane.cm ? editorLine(pane.cm) : previewLine(pane);
function takeDistance() {
  state.syncPair = [panes[0].active, panes[1].active];
  state.syncGap = keepsDistance() && bothShown() ? paneTopLine(panes[1]) - paneTopLine(panes[0]) : 0;
}
// The other pane's line for this pane's line.
function partnerLine(pane, line) {
  if (!keepsDistance()) return line;
  if (state.syncPair?.[0] !== panes[0].active || state.syncPair?.[1] !== panes[1].active) takeDistance();
  return Math.max(0, line + (pane.index === 0 ? state.syncGap : -state.syncGap));
}
// Scrolled by Alt + mouse wheel just now: this pane alone.
function scrolledAlone(pane) {
  if (!pane.solo || performance.now() - pane.solo > 400) return false;
  if (syncPartner(pane)) takeDistance();
  return true;
}

function onPreviewScroll(pane) {
  markOutline(pane);
  if (pane.ignoreScroll) return pane.ignoreScroll = false;
  if (scrolledAlone(pane)) return;
  const other = syncPartner(pane);
  if (other && other.el.dataset.mode !== 'edit') setPreviewLine(other, partnerLine(pane, previewLine(pane)));
}

function onEditorScroll(pane) {
  const tab = pane.active;
  if (!tab) return;
  markOutline(pane);
  // Split view: the preview follows the editor proportionally (not when goToLine placed both).
  if (pane.placed) pane.placed = false;
  else if (tab.mode === 'split') {
    const info = pane.cm.getScrollInfo(), el = pane.previewEl;
    el.scrollTop = info.top / Math.max(1, info.height - info.clientHeight) * (el.scrollHeight - el.clientHeight);
    if (typeof markPreviewCursors === 'function') markPreviewCursors(true);   // the cursor's bar kept in the preview's view
  }
  if (pane.ignoreEditorScroll) return pane.ignoreEditorScroll = false;
  if (scrolledAlone(pane)) return;
  const other = syncPartner(pane);
  if (other?.cm && other.el.dataset.mode !== 'preview') setEditorLine(other, partnerLine(pane, editorLine(pane.cm)));
}

function setSync(on) {
  state.sync = on;
  if (on) takeDistance();
  layout();
  saveSession();
  toast(!on ? 'The panes scroll on their own.' : keepsDistance() ? 'The two panes scroll together, as they are aligned now.'
    : 'The two panes scroll together, on the same line number.', true);
}

// Level: the other pane on the active pane's top line, the distance 0, scroll together on.
function levelPanes() {
  if (!bothShown() || comparing()) return;
  const from = panes[state.activePane], other = panes[1 - from.index], line = paneTopLine(from);
  if (other.cm && other.el.dataset.mode !== 'preview') setEditorLine(other, line); else setPreviewLine(other, line);
  state.sync = true;
  state.syncPair = [panes[0].active, panes[1].active];
  state.syncGap = 0;
  layout();
  saveSession();
}

// Split: the active file in the other pane too (the pane shown when hidden), at the same place, with its own cursor
// and scroll position; both edit it. Already open there: that tab, put at this place.
async function splitToOther() {
  const from = panes[state.activePane], tab = from.active;
  if (!tab) return;
  const to = panes[1 - from.index], inEditor = from.cm && tab.mode !== 'preview';
  const line = inEditor ? editorLine(from.cm) : previewLine(from), cursor = tab.cmDoc?.getCursor();
  let twin = to.tabs.find(t => t.doc === tab.doc);
  if (!twin) {
    twin = makeTab(tab.doc, tab.mode);
    insertTab(to, twin);
  }
  await activate(to, twin);
  if (to.index === 1) await showActive(panes[0]);   // the first pane gets its share of the width
  if (to.cm && twin.mode !== 'preview') {
    if (cursor) to.cm.setCursor(cursor, null, { scroll: false });
    setEditorLine(to, line);
  } else setPreviewLine(to, line);
  saveSession();
}

// Dragging the divider resizes the panes; right-click: orientation, hide or close a pane.
ui.divider.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('button')) return;
  ui.divider.setPointerCapture(e.pointerId);
  const move = ev => {
    const r = ui.panes.getBoundingClientRect();
    const at = state.orient === 'v' ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height;
    state.ratio = Math.round(Math.max(.1, Math.min(.9, at)) * 1000) / 10;
    layout();
  };
  ui.divider.addEventListener('pointermove', move);
  ui.divider.addEventListener('pointerup', () => {
    ui.divider.removeEventListener('pointermove', move);
    keepLayout('ratio', state.ratio);
    relayout();
  }, { once: true });
});
ui.divider.addEventListener('contextmenu', e => showMenu(ui.dividerMenu, e, () => {
  const v = state.orient === 'v', menu = ui.dividerMenu;
  menu.querySelector('.mm-orient-v').classList.toggle('mm-on', v);
  menu.querySelector('.mm-orient-h').classList.toggle('mm-on', !v);
  for (const b of menu.querySelectorAll('.mm-first, .mm-second')) {
    const side = b.classList.contains('mm-first') ? (v ? 'left' : 'top') : (v ? 'right' : 'bottom');
    b.textContent = b.textContent.replace(/\w+ pane$/, side + ' pane');
  }
}));

// ---------- Session ----------
// Every window keeps its folder, tabs and panes with its project (the host's projects.json, ProjectStore.cs), a
// second after a change and when it closes; drafts live in Drafts\.
// While comparing (compare.js): the window as it was before the compare, and the compare itself, which is started
// again when the window opens (restoreCompare).
function sessionData() {
  const c = typeof compareSession === 'function' ? compareSession() : {}, before = c.before;   // compare.js loads after this file
  const kept = pane => pane.tabs.filter(t => !t.doc.temp && !c.opened?.has(t));   // the compare opens those again
  return {
    layout: windowLayout(),   // every name, so a later Save as default changes only new projects
    root: state.root,
    tree: state.root ? { open: [...expanded], top: Math.round(ui.tree.scrollTop) } : undefined,   // the open folders, the scroll
    activePane: before ? before.activePane : state.activePane,
    hidden: before ? before.hidden : state.hidden,
    ...((before ? before.sync : state.sync) && { sync: true, syncGap: before ? 0 : Math.round((state.syncGap ?? 0) * 100) / 100 }),
    ...(c.compare && { compare: c.compare }), ...(c.folders && { folderCompare: c.folders }),
    panes: panes.map((pane, i) => ({   // a compare's saved text (doc.temp) is not kept
      active: kept(pane).indexOf(before ? before.active[i] : pane.active),
      tabs: kept(pane).map(tab => ({
        path: tab.doc.path, draft: tab.doc.draft, mode: c.modes?.get(tab) ?? tab.mode,
        top: pane.active === tab && !pane.el.hidden ? pane.previewEl.scrollTop : tab.previewTop,
        ...(tab.pinned && { pinned: true }), ...(tab.readOnly && { readOnly: true }),
        ...(tab.doc.draft && tab.doc.languageChosen && { language: languageOf(tab.doc) }),   // a file's choice: the host keeps it
        ...tabCursor(tab),
      })),
    })),
  };
}

// A tab's cursor and editor scroll position: from its editor document, or as restored and not shown yet.
function tabCursor(tab) {
  if (tab.cmDoc) {
    const { line, ch } = tab.cmDoc.getCursor();
    return { cursor: [line, ch], editorTop: Math.round(tab.cmDoc.scrollTop || 0) };
  }
  const at = tab.restoreCursor;
  return at ? { cursor: [at.line, at.ch], editorTop: at.top } : {};
}

let started = false;
function saveSession() {
  if (!started) return;
  clearTimeout(saveSession.timer);
  saveSession.timer = setTimeout(() => host('session', { data: sessionData() }), 1000);
}

async function restore(session, drafts) {
  const waiting = new Map(drafts.map(d => [d.id, d]));
  const draftDoc = id => {
    const saved = waiting.get(id);
    waiting.delete(id);
    return findDraft(id) ?? (saved && makeDoc({ draft: id, text: saved.text }));
  };
  for (const [i, saved] of (session?.panes || []).entries()) {
    const pane = panes[i];
    if (!pane) break;
    for (const t of saved.tabs || []) {
      let doc;
      try { doc = t.draft ? draftDoc(t.draft) : findDoc(t.path) ?? await loadDoc(t.path); }
      catch { continue; }   // gone since
      if (!doc || pane.tabs.some(x => x.doc === doc)) continue;
      // A draft is still new: it opens to edit.
      const tab = makeTab(doc, doc.draft ? (t.mode === 'edit' ? 'edit' : 'split') : t.mode);
      tab.previewTop = t.top || 0;
      tab.pinned = !!t.pinned;
      tab.readOnly = !!t.readOnly;
      if (Array.isArray(t.cursor)) tab.restoreCursor = { line: t.cursor[0] | 0, ch: t.cursor[1] | 0, top: t.editorTop | 0 };
      if (doc.draft && t.language && packs[t.language]) {
        doc.language = t.language === 'markdown' ? undefined : t.language;
        doc.languageChosen = true;
      }
      pane.tabs.push(tab);
    }
    pane.active = pane.tabs[saved.active] ?? pane.tabs[0] ?? null;
  }
  // Drafts that were not in a tab of the session (left in another window, or a crash).
  for (const { id } of [...waiting.values()]) {
    const tab = makeTab(draftDoc(id), 'split');
    panes[0].tabs.push(tab);
    panes[0].active ??= tab;
  }
  state.hidden = session?.hidden === 0 || session?.hidden === 1 ? session.hidden : null;
  state.activePane = session?.activePane === 1 && twoPanes() ? 1 : 0;   // layout() moves it off a hidden pane
  // Scroll together as it was, the panes as far apart.
  state.sync = !!session?.sync;
  state.syncGap = Number.isFinite(session?.syncGap) ? session.syncGap : 0;
  state.syncPair = [panes[0].active, panes[1].active];
}

// Closing: one prompt for unsaved files and changed drafts, then the host closes the window.
// Pinned tabs go to `peer`, another open window of this project (the host says which), when the setting says so.
// `answer` (Manage projects: the window closes with its project): "save" or "discard" for the unsaved documents,
// already asked; the drafts are written as always (the host keeps or deletes them).
events.closeRequest = async ({ peer, answer } = {}) => {
  try {
    if (peer && setting('movePinned'))
      for (const tab of allTabs().filter(t => t.pinned)) if (paneOf(tab)) await moveTab(tab, peer, { closing: true });
    const dirty = [...docs].filter(d => d.path && d.dirty && d.lock);
    // Changed drafts are asked about only with the setting; otherwise they stay drafts, unasked.
    const drafts = !answer && setting('askSaveDrafts') ? [...docs].filter(d => d.draft && d.draftChanged && docText(d).trim()) : [];
    if (answer === 'save') {
      for (const doc of dirty) if (!await saveDoc(doc)) return host('closeCancel');
    } else if (!answer && (dirty.length || drafts.length)) {
      const answer = await host('closePrompt', { dirty: dirty.map(d => d.path), drafts: drafts.map(d => d.draft) });
      if (answer === 'cancel') return host('closeCancel');
      if (answer === 'save') {
        for (const doc of dirty) if (!await saveDoc(doc)) return host('closeCancel');
        for (const doc of drafts) await saveDoc(doc);   // cancelling "Save as" keeps it as a draft
      }
    }
    await flushDrafts();
    await Promise.all([...docs].filter(d => d.mmTabsTimer).map(storeRulerLines));   // ruler.js
    await Promise.all([...docs].filter(d => d.marks).map(d => saveBookmarks(d)));
    await host('session', { data: sessionData() });
    host('closeNow');
  } catch (e) {
    host('closeCancel');
    throw e;
  }
};

// The host asks what is unsaved here (Manage projects: before closing or deleting this window's project): the
// documents with unsaved changes this window edits, the drafts with text (a title: the first line) and the empty ones.
const draftTitle = doc => docText(doc).split('\n').map(l => l.trim().replace(/^#+\s*/, '')).find(l => l) ?? '';
events.unsavedList = ({ ask }) => {
  const drafts = [...docs].filter(d => d.draft);
  host('answer', { ask, result: {
    documents: [...docs].filter(d => d.path && d.dirty && d.lock).map(d => d.path),
    drafts: drafts.filter(d => docText(d).trim()).map(d => ({ id: d.draft, title: draftTitle(d) })),
    empty: drafts.filter(d => !docText(d).trim()).map(d => d.draft),
  } });
};

// Drafts of deleted projects, kept (Manage projects > Delete): each opens as a draft tab here and belongs to this
// window's project from now on. A window just opened for them waits until it has started.
events.adoptDrafts = async ({ drafts }) => {
  while (!started) await new Promise(r => setTimeout(r, 100));
  const pane = panes[state.activePane];
  let last = null;
  for (const { id, text } of drafts ?? []) {
    if (findDraft(id)) continue;
    last = makeTab(makeDoc({ draft: id, text }), 'split');
    insertTab(pane, last);
  }
  if (last) await activate(pane, last);
  saveSession();
};

// ---------- Projects (the host's ProjectStore): the Projects menu, the bottom bar, names ----------
// A project has windows; every window is in one. The menu lists every project (checked: open) with its windows
// (checked: open) and what can be done with them; the host does it (AppHost.ProjectCommand).
// ---------- The theme set (docs/plans/executed/PLAN-theme-sets.md) ----------
// The bottom bar shows the set this window shows (its project's own, its desktop's default or the app's); a click, or
// Options > Theme set, chooses the project's own, or opens Manage theme sets.
const setChip = $('.mm-st-set');
const SET_SOURCE = { project: "this project's own", desktop: "this desktop's default", app: "the app's default" };
function showThemeSet() {
  const s = settings.themeSet;
  setChip.hidden = !s;
  if (!s) return;
  setChip.textContent = 'Theme set: ' + s.name;
  setChip.title = `Theme set ${s.name}: ${SET_SOURCE[s.source] ?? ''} (click: choose this project's set)`;
}
function themeSetMenuItems() {
  const s = settings.themeSet ?? { sets: ['Default'], own: null };
  return [
    { label: "None (the desktop's or the app's default)", plain: true, checked: !s.own, run: () => host('themeSet', { set: null }) },
    ...s.sets.map(name => ({ label: name, plain: true, checked: s.own === name, run: () => host('themeSet', { set: name }) })),
    '-', { label: 'Manage theme sets...', plain: true, run: () => host('openThemeSets') },
  ];
}
setChip.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
setChip.addEventListener('click', () => {
  closeMenus();
  hideMenus();
  const r = setChip.getBoundingClientRect();
  openMenuLevel(themeSetMenuItems(), r.left, r.top, true, true);
});

const projectChip = $('.mm-st-project');
function setProject(project) {
  state.project = project ?? null;
  projectChip.textContent = project?.display ?? '';
  projectChip.hidden = !project;
}
events.project = ({ project }) => setProject(project);
projectChip.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
projectChip.addEventListener('click', () => openProjectMenu());

// The Projects menu at the bottom bar (a click on the project, the action "projects"): the same items as in
// the menu bar; `only` picks a part of it ("move": the projects to move this window to).
async function openProjectMenu(only) {
  closeMenus();
  hideMenus();
  const items = await projectMenuItems();
  const shown = only === 'move' ? items.find(i => i.move).sub : items;
  const r = projectChip.getBoundingClientRect();
  openMenuLevel(shown, r.left, r.top, true, true);
}

async function projectMenuItems() {
  const list = await host('projects');
  const ask = async (title, then) => { const name = await askName(title, ''); if (name !== null) then(name); };
  const tabs = n => `${n} tab${n === 1 ? '' : 's'}`;
  const projectItem = p => ({
    label: p.display + (p.mine ? '   (this window)' : ''), plain: true, checked: p.open, sub: [
      { label: 'Open project', plain: true, title: 'All its windows', run: () => host('project', { kind: 'open', project: p.id }) },
      ...(p.windows.length ? ['-'] : []),
      ...p.windows.map((w, i) => ({
        label: `Window ${i + 1}: ${w.folder ?? '(no folder)'}, ${tabs(w.tabs)}${w.mine ? '   (this window)' : ''}`,
        plain: true, checked: w.open, run: () => host('project', { kind: 'window', key: w.key }),
      })),
      '-',
      { label: 'New window in this project', plain: true, run: () => host('project', { kind: 'newWindow', project: p.id }) },
      ...(p.open ? [] : [{ label: 'Delete project...', plain: true, run: async () => {
        if (await host('confirm', { text: `Delete the project "${p.display}"? Its files stay; unsaved new documents come back in a window.` }))
          host('project', { kind: 'delete', project: p.id });
      } }]),
    ],
  });
  return [
    { label: '&Manage projects...', title: 'All projects in a window: open, close, merge, rename, delete', run: () => host('openProjects') }, '-',
    ...list.map(projectItem), '-',
    { label: '&New project...', title: 'A new empty window in a new project', run: () => ask('New project', name => host('project', { kind: 'new', name })) },
    '-',
    { label: '&Rename this project...', run: () => renameProject() },
    { label: '&Move this window to', move: true, sub: [
      ...list.filter(p => !p.mine).map(p => ({ label: p.display, plain: true, run: () => host('project', { kind: 'move', project: p.id }) })),
      ...(list.some(p => !p.mine) ? ['-'] : []),
      { label: 'New project...', plain: true, run: () => ask('Move this window to a new project', name => host('project', { kind: 'move', name })) },
    ] },
  ];
}

async function renameProject() {
  const name = await askName('Name of this project', state.project?.name ?? '');
  if (name !== null) host('project', { kind: 'rename', name });
}

// Asks a name: the text, or null for Cancel / Esc.
// `placeholder`: the hint in the empty field (a project name: a number when left empty).
function askName(title, value, placeholder = 'Empty: a number') {
  const dialog = $('.mm-name-dialog'), input = dialog.querySelector('.mm-name-input');
  dialog.querySelector('.mm-name-label').textContent = title;
  input.placeholder = placeholder;
  input.value = value;
  dialog.returnValue = '';
  dialog.showModal();
  input.select();
  return new Promise(resolve => {
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok' ? input.value.trim() : null);
      focusPane(panes[state.activePane]);
    }, { once: true });
  });
}
$('.mm-name-dialog .mm-name-cancel').addEventListener('click', () => $('.mm-name-dialog').close('cancel'));

// ---------- Window role, theme ----------
function setRole({ primary, index }) {
  state.primary = primary;   // all windows look the same; the primary is the one a closing window's tab may go to
  document.body.dataset.window = index;
  saveSession();
}
events.role = setRole;

function applyTheme(theme) {
  state.theme = document.documentElement.dataset.theme = theme;
  for (const tab of allTabs()) if (tab.article.querySelector('pre.mermaid, svg[id^=mermaid]')) tab.stale = true;
  showAll();   // diagrams carry their own colors
}

// ---------- The look: themes (defaults\themes, your themes\) and light / dark mode ----------
// The host decides (AppHost.Look): the app's theme, a theme of the editor's and of the preview's own or null, the mode. A theme comes
// with all its colours (through its bases), set as inline variables; light or dark is the mode (data-theme), which
// picks the app.css fallback, color-scheme, the tab colour rules and the diagrams.
let look = null;
const themedVars = new WeakMap();   // element -> the variables set on it

function setThemeVars(el, vars) {
  for (const name of themedVars.get(el) ?? []) el.style.removeProperty(name);
  for (const [name, value] of Object.entries(vars ?? {})) el.style.setProperty(name, value);
  themedVars.set(el, Object.keys(vars ?? {}));
}

// A pane part (the editor, the preview) in a theme of its own, or in the app's (theme null).
function themePane(el, theme) {
  el.classList.toggle('mm-themed', !!theme);
  if (theme) el.dataset.theme = look.mode; else delete el.dataset.theme;
  setThemeVars(el, theme?.vars);
}

function applyLook(next) {
  const before = look;
  look = next;
  const root = document.documentElement;
  root.dataset.mode = look.mode;
  setThemeVars(root, look.app.vars);
  if (typeof applyRuler === 'function') applyRuler();   // the ruler's canvas takes the theme's colours (ruler.js)
  for (const pane of panes) {
    themePane(pane.editorEl, look.editor);
    themePane(pane.previewEl, look.preview);
    if (typeof scheduleOverview === 'function') scheduleOverview(pane);   // the overviews draw in the pane's colours
  }
  applyHighlight();   // after the editor's own theme: its colour is measured from its background
  applyInlineCode();   // after the editor's and the preview's own themes: the box is measured from their background
  if (typeof applyPreviewHighlight === 'function') applyPreviewHighlight();   // highlights.js: the same for the highlights
  if (!before) state.theme = root.dataset.theme = look.mode;   // at start, before anything is shown
  else if (look.mode !== state.theme) applyTheme(look.mode);   // the mode: tab colour rules, diagrams
  // Another list of themes: the settings window's lists follow.
  if (before && before.themes.map(t => t.id + t.name).join() !== look.themes.map(t => t.id + t.name).join())
    host('settingDefs', { defs: settingDefs() });
}
events.look = ({ look }) => {
  applyLook(look);
  updatePackColours();   // a pack's own colours depend on the theme
};

// The language packs changed (your languages folder): editors, previews, outlines and the settings window follow.
events.languages = ({ languages }) => {
  applyLanguages(languages);
  for (const doc of docs) doc.outline = null;
  for (const tab of allTabs()) tab.stale = true;
  for (const pane of panes) pane.modeKey = pane.codeBarKey = pane.gutterKey = null;
  showAll();
  host('settingDefs', { defs: settingDefs() });
};
events.runAction = ({ name }) => runAction(name, [], { from: 'menu' });   // from the settings window
events.tabColours = ({ text }) => {
  setTabColours(text);
  refreshTabs();
};

// View in LexPen in this window (the project for viewing, docs/plans/executed/PLAN-view-window.md): a file as a tab in the
// preview (one already open comes to the front as it is), a folder as the Folder pane's folder, shown.
events.view = async ({ folder, files }) => {
  if (folder) {
    await openFolder(folder).catch(e => toast(e.message));
    setSidebar(true);
    setSideView('folder');
  }
  for (const path of files || []) await viewFile(path).catch(e => toast(e.message));
};

// A viewed file: in the preview. As a click in the folder pane (openFromTree), it replaces the document shown,
// unless that one is a draft, has changes or is pinned (then a tab of its own); a file already open in the pane: that
// tab, as it is. A tab it gets is read-only with the setting viewReadOnly (the tab menu's Read-only takes that off),
// so it cannot be changed by accident; without the setting it can be edited at once.
async function viewFile(path, last = false) {
  const pane = panes[state.activePane], shown = pane.active;
  if (allTabs().some(t => samePath(t.doc.path, path))) return goToOrOpen(path);
  let tab;
  if (shown && !shown.doc.draft && !shown.doc.dirty && !shown.pinned && await navigate(shown, path)) {
    tab = shown;
    if (tab.mode !== 'preview') { tab.mode = 'preview'; await showActive(pane); }
  } else tab = await openFile(path, { pane, mode: 'preview', last });
  if (!!tab.readOnly !== !!setting('viewReadOnly')) await setReadOnly(tab, !!setting('viewReadOnly'));
  return tab;
}

// Settings > Reset to view layout: the layout the host gives, one pane (the second's tabs into the first), every tab in
// the preview, no compare; the tabs and the folder stay.
events.viewLayout = async ({ layout }) => {
  if (comparing()) await stopCompare();
  if (panes[1].tabs.length) {
    const active = panes[1].active;
    for (const tab of [...panes[1].tabs]) await intoMainPane(tab);
    if (active && paneOf(active)) await activate(panes[0], active);
    afterPaneChange();
  }
  for (const tab of allTabs()) tab.mode = 'preview';
  layoutOwn = { ...layout };
  mergeLayout();
  applySettings();
  layoutChanged();
  await showAll();
  saveSession();
};

events.open = async ({ folder, files }) => {
  if (folder) {
    await openFolder(folder);
    setSidebar(true);
  }
  for (const path of files || []) await goToOrOpen(path).catch(e => toast(e.message));
};

// A file from outside (Explorer, a launch, View in LexPen): its tab when this window has it already, in either pane,
// so it is never there twice; else a new tab (openFile, with its options).
async function goToOrOpen(path, options) {
  const tab = allTabs().find(t => samePath(t.doc.path, path));
  if (!tab) return openFile(path, options);
  const pane = paneOf(tab);
  await activate(pane, tab);
  focusPane(pane);
  return tab;
}

// The "reloaded" banner and its dot stay until a click anywhere in the window or Esc: switching to the
// window alone (Alt+Tab, taskbar) is not enough to have seen it.
function dismissNotices() {
  const shown = panes.map(p => p.active).filter(t => t?.notice);
  if (!shown.length) return;
  for (const tab of shown) tab.notice = false, tab.dot = null;
  for (const pane of panes) updateBar(pane);
  refreshTabs();
}
document.addEventListener('pointerdown', dismissNotices, true);

// ---------- Context menus ----------
let contextPath = null, menuTab = null, menuPane = null;
let contextKind = 'files';   // the tree row right-clicked: a file or a folder (favourites)

function showMenu(menu, e, remember) {
  e.preventDefault();
  hideMenus();
  remember();
  menu.hidden = false;
  menu.style.left = Math.min(e.clientX, innerWidth - menu.offsetWidth - 4) + 'px';
  menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 4) + 'px';
}
const hideMenus = () => ui.treeMenu.hidden = ui.tabMenu.hidden = ui.stripMenu.hidden =
  ui.paneMenu.hidden = ui.dividerMenu.hidden = true;

// Right-click on a tree row: copy its path, absolute or relative to the open folder.
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.mm-tree .mm-row');
  if (row) showMenu(ui.treeMenu, e, () => {
    contextPath = row.dataset.path;
    contextKind = row.classList.contains('mm-dir') || row.classList.contains('mm-base') ? 'folders' : 'files';
    favouriteItem(ui.treeMenu, contextPath, contextKind);   // favourites.js
    ui.treeMenu.querySelector('[data-cmd=treeSetRoot]').hidden = contextKind !== 'folders' || samePath(contextPath, state.root);
    // The compare (compare.js): a file with the file in the editor or a picked one; a folder with a picked folder.
    const active = activeDoc()?.path, file = contextKind === 'files';
    ui.treeMenu.querySelector('[data-cmd=treeCompareActive]').hidden = !file || !active || samePath(active, contextPath);
    ui.treeMenu.querySelector('[data-cmd=treeCompareWith]').hidden = !file;
    ui.treeMenu.querySelector('[data-cmd=treeCompareFolder]').hidden = file;
    leftSideItems(ui.treeMenu, 'tree', contextPath, !file);   // compare.js: the left side to compare
  });
  else if (!e.target.closest('.mm-tabs, .mm-divider')) hideMenus();   // those open their own menu
});

function relativePath(path) {
  if (!state.root) return path;
  const base = state.root.replace(/\\$/, '') + '\\';   // the root may be a drive, "D:\"
  return path.toLowerCase().startsWith(base.toLowerCase()) ? path.slice(base.length) : path;
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  toast('Copied ' + text, true);
}

// Tree filter: all files, or markdown files only (folders always stay).
function setMarkdownOnly(on) {
  document.body.dataset.tree = on ? 'md' : 'all';
  keepLayout('tree', on ? 'md' : 'all');
  $('.mm-md-only').classList.toggle('mm-on', on);
}

// Off (the default) follows the spec: a single line break inside a paragraph renders as a space.
// The formatting bar above the editor (format.js); on unless switched off.
function applyFormatBar(on) {
  document.body.toggleAttribute('data-no-format-bar', !on);
  for (const pane of panes) pane.cm?.refresh();
}

// The tab bar: scroll | menu | rows (the setting tabBar). With "menu", a button at the end of the row lists the
// tabs out of view.
function applyTabBar(kind) {
  document.body.dataset.tabBar = kind;
  for (const pane of panes) updateTabsMore(pane);
  relayout();
}

// Closes the tabs one by one, each asking about unsaved changes; a kept one stays open.
async function closeTabs(tabs) {
  for (const tab of tabs) if (paneOf(tab)) await closeTab(tab, false, true);
}

// ---------- Pin and read-only (tab menu) ----------
function togglePin(tab) {
  tab.pinned = !tab.pinned;
  refreshTabs();
  saveSession();
}

// Read-only on: another tab of the file may edit it; with every tab of it here read-only and another window
// showing it, that window gets the editing. Off: only when no other tab or window edits it, and the file is
// not read-only on disk.
async function setReadOnly(tab, on) {
  const doc = tab.doc;
  if (on) {
    tab.readOnly = true;
    if (doc.editTab === tab) doc.editTab = tabsOf(doc).find(t => !t.readOnly) ?? tab;
    if (doc.path && doc.lock && doc.shared && !doc.dirty && tabsOf(doc).every(t => t.readOnly)) {
      await host('unlock', { path: doc.path });
      doc.lock = await host('lock', { path: doc.path });   // back in line, after the window that edits it now
    }
  } else {
    if (doc.diskReadOnly) return toast(`${docName(doc)} is read-only on disk.`);
    if (!doc.lock) return toast(`${docName(doc)} is edited in another window; set that one read-only first.`);
    tab.readOnly = false;
    doc.editTab = tab;
  }
  await showAll();
  saveSession();
}

function applyLineBreaks(on) {
  md.set({ breaks: on });
}

// Spaces, tabs and line ends shown in the editor (Options > Settings > Editor view; the look: app.css, the colour: the
// theme's whitespace). Spaces get their own token from an overlay; tabs and line ends are drawn by CSS alone.
const WS_OVERLAY = {
  name: 'whitespace',
  token(stream) {
    if (stream.eatWhile(' ')) return 'ws-space';
    if (!stream.skipTo(' ')) stream.skipToEnd();
    return null;
  },
};
function applyWhitespace() {
  const spaces = !!setting('showWhitespace'), special = !!setting('showSpecialChars');
  document.body.toggleAttribute('data-show-ws', spaces);
  document.body.toggleAttribute('data-show-eol', !!setting('showLineEnds'));
  for (const pane of panes) {
    if (!pane.cm) continue;
    if (!!pane.wsOverlay !== spaces) {
      if (spaces) pane.cm.addOverlay(WS_OVERLAY); else pane.cm.removeOverlay(WS_OVERLAY);
      pane.wsOverlay = spaces;
    }
    if (!!pane.specialShown !== special) {
      pane.cm.setOption('specialChars', special ? SPECIAL_CHARS : CodeMirror.defaults.specialChars);
      pane.cm.setOption('specialCharPlaceholder', special ? specialBox : CodeMirror.defaults.specialCharPlaceholder);
      pane.specialShown = special;
    }
  }
}

// Characters that cannot be seen (setting showSpecialChars): each drawn as its code in a box in inverted colours,
// still one character (one step of the cursor, removed whole, one column). Control characters as 0x1B, invisible
// Unicode signs as U+200B, a byte the file's encoding could not read as 0xAB (a stand-in from the host, U+F780 plus
// the byte: TextFile.StandIn) in the caution colour. A tab is drawn as a tab (CodeMirror takes it before these).
const SPECIAL_CHARS = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffc\uf780-\uf87f]/;
const hex = (n, width) => n.toString(16).toUpperCase().padStart(width, '0');
function specialBox(ch) {
  const code = ch.charCodeAt(0), el = document.createElement('span');
  const unread = code >= 0xF780 && code <= 0xF87F;
  el.className = 'mm-special' + (unread ? ' mm-unread' : '');
  el.textContent = unread ? '0x' + hex(code - 0xF780, 2) : code <= 0xFF ? '0x' + hex(code, 2) : 'U+' + hex(code, 4);
  el.title = unread ? `A byte the encoding of the file could not read (${el.textContent}); saving writes it back as it was`
    : `An invisible character, ${el.textContent}`;
  return el;
}

// Applies the settings that changed since the last time (at start: all of them).
let appliedSettings = null;
function applySettings() {
  const now = settings.values, was = appliedSettings ?? {};
  appliedSettings = { ...now };
  const changed = name => !(name in was) || was[name] !== now[name];
  if (FONT_SETTINGS.some(changed)) applyFonts();
  if (changed('wrap')) applyWrap(now.wrap);
  if (changed('previewWrap')) document.body.toggleAttribute('data-preview-nowrap', now.previewWrap === false);
  if (changed('showBackupFiles') && 'showBackupFiles' in was) refreshTree(false);
  if (changed('tabBar')) applyTabBar(now.tabBar);
  if (changed('scrollTogether')) { takeDistance(); layout(); }
  if ((changed('outlineMerged') || changed('outlineBullets')) && 'outlineMerged' in was)
    for (const pane of panes) { pane.outlineFor = null; showOutline(pane); }   // the outline drawn again
  if (changed('findMark') || changed('findGutter')) {   // app.css: how matches look; boxes and line numbers: find.js
    document.body.dataset.findMark = now.findMark || 'background';
    if (typeof refreshMarks === 'function') for (const pane of panes) if (pane.find?.marked) refreshMarks(pane);
  }
  if (changed('bracketHighlight')) {   // app.css: how the pair at the cursor looks (brackets.js marks it)
    document.body.dataset.bracketHighlight = now.bracketHighlight || 'colour';
    if (typeof paintBrackets === 'function') for (const pane of panes) if (pane.cm) paintBrackets(pane.cm);
  }
  if (['indentGuides', 'indentGuideCursor', 'indentGuideColour', 'indentGuideIntensity', 'indentGuideCursorColour',
    'indentGuideCursorIntensity'].some(changed)) {   // app.css draws them; guides.js sets the line classes
    document.body.dataset.indentGuides = now.indentGuides || 'comment';
    const style = document.body.style;
    style.setProperty('--mm-guide-mix', percent('indentGuideIntensity', 55));
    style.setProperty('--mm-guide-one', colourCss(now.indentGuideColour, 'accent'));
    style.setProperty('--mm-gcur-colour', colourCss(now.indentGuideCursorColour, 'find-box'));
    style.setProperty('--mm-gcur-mix', percent('indentGuideCursorIntensity', 100));
    if (typeof repaintGuides === 'function') repaintGuides();
  }
  if (RULER_SETTINGS.some(changed) && typeof applyRuler === 'function') applyRuler();   // ruler.js
  if (['highlightStyle', 'highlightColour', 'highlightIntensity'].some(changed)) applyHighlight();
  if (changed('inlineCodeIntensity')) applyInlineCode();
  if (['previewHighlightStyle', 'previewHighlightColour', 'previewHighlightIntensity'].some(changed) && typeof applyPreviewHighlight === 'function') applyPreviewHighlight();
  // compare.js, loaded after this file: at the start the settings can be here before it is.
  if (['compareWhitespace', 'compareCase', 'compareStrip', 'compareStep'].some(changed) && typeof onCompareSettings === 'function') onCompareSettings();
  if (['overviewWidth', 'overview.find', 'overview.changes', 'overview.git', 'overview.bookmarks', 'overview.highlights'].some(changed) && typeof schedulePreviewOverviews === 'function')
    schedulePreviewOverviews();   // the preview's scroll bar
  if (['overview', 'overviewWidth', 'overview.find', 'overview.changes', 'overview.git', 'overview.bookmarks', 'gutter.changes', 'gutter.git'].some(changed)
    && typeof applyOverview === 'function') {   // overview.js; the hunks are made for the strip or the gutter
    for (const pane of panes) if (pane.cm && pane.active) paintGutter(pane);
    applyOverview();
  }
  if (changed('formatBar')) applyFormatBar(now.formatBar);
  if (changed('languageNames') && 'languageNames' in was) {   // fences and blocks may now be another language
    languagesVersion++;
    for (const tab of allTabs()) tab.stale = true;
    showAll();
  }
  if (changed('showWhitespace') || changed('showLineEnds') || changed('showSpecialChars')) applyWhitespace();
  if (changed('virtualSpace') && !now.virtualSpace && !column.on)
    for (const pane of panes) if (pane.cm) clearVirtual(pane.cm);
  if ((changed('tabSize') || changed('indentSize')) && 'tabSize' in was)
    for (const pane of panes) if (pane.cm && pane.active) applyTabStops(pane, pane.active.doc);
  if (changed('zoom')) applyZoom(previewZoom());
  if (changed('lineBreaks')) {
    applyLineBreaks(now.lineBreaks);
    if ('lineBreaks' in was) {
      welcome = null;
      for (const tab of allTabs()) if (!tab.doc.language) tab.stale = true;
      showAll();
    }
  }
  if (Object.keys(now).some(n => (n.startsWith('gutter.') || n === 'lineNumbers' || n === 'lineNumberCount') && changed(n)) && typeof setupGutter === 'function')
    for (const pane of panes) if (pane.cm && pane.active) setupGutter(pane);
  // The window's layout: the sidebar, the outline, the panes (the setters keep a value they set themselves, so these run
  // at the start and when the layout comes from elsewhere: the settings window, Reset to default).
  if (changed('sidebarWidth')) layoutWidth('--sidebar-w', now.sidebarWidth);
  if (changed('outlineWidth')) layoutWidth('--outline-w', now.outlineWidth);
  if (changed('tree')) setMarkdownOnly(now.tree === 'md');
  if (changed('outline')) setOutline(!!now.outline);
  if (changed('editShare')) setSplit(now.editShare || null);
  if (changed('sideView')) setSideView(now.sideView === 'search' ? 'search' : 'folder');
  if (changed('searchScope') && ['file', 'open', 'folder'].includes(now.searchScope)) searchUi.scope.value = now.searchScope;
  if (changed('sort') || changed('sortDesc')) { showSort(); if ('sort' in was) refreshTree(); }
  if (changed('orient') || changed('ratio')) {
    state.orient = now.orient === 'h' ? 'h' : 'v';
    state.ratio = +now.ratio || 50;
    if ('orient' in was) { layout(); relayout(); }
  }
  if (changed('sidebar') && 'sidebar' in was && state.root) setSidebar(!!now.sidebar);
}

// A width of the layout in px (0: the standard one, app.css).
function layoutWidth(property, px) {
  if (px > 0) document.body.style.setProperty(property, px + 'px');
  else document.body.style.removeProperty(property);
}

// The layout values this page kept in its storage before they were per window: moved to defaultLayout in your
// settings.json once (the host remembers that it happened), so every window opens as before.
async function moveLayoutStorage() {
  const ls = localStorage, values = {};
  if (ls.sidebar) values.sidebar = ls.sidebar !== 'off';
  if (ls.sideView) values.sideView = ls.sideView === 'search' ? 'search' : 'folder';
  if (parseInt(ls.sidebarWidth)) values.sidebarWidth = parseInt(ls.sidebarWidth);
  if (ls.outline) values.outline = ls.outline === 'on';
  if (parseInt(ls.outlineWidth)) values.outlineWidth = parseInt(ls.outlineWidth);
  if (ls.orient) values.orient = ls.orient === 'h' ? 'h' : 'v';
  if (+ls.ratio) values.ratio = +ls.ratio;
  if (+ls.editShare) values.editShare = +ls.editShare;
  if (['file', 'open', 'folder'].includes(ls.searchScope)) values.searchScope = ls.searchScope;
  if (ls.tree) values.tree = ls.tree === 'md' ? 'md' : 'all';
  if (ls.sort) values.sort = ls.sort === 'modified' ? 'modified' : 'name';
  if (ls.sortDesc) values.sortDesc = ls.sortDesc === 'on';
  await host('layoutImport', { values });
  Object.assign(settings, await host('settings'));
}

// Settings this page kept in its own storage before settings.json existed: moved there once (the host
// remembers that it happened), then gone from the page's storage.
async function movePageSettings() {
  const ls = localStorage, values = {};
  const was = (name, on) => { if (ls[name] !== undefined) values[name] = ls[name] === on; };
  const notOff = name => { if (ls[name] !== undefined) values[name] = ls[name] !== 'off'; };
  for (const name of ['tabOrder', 'editorFont', 'appFont']) if (ls[name]) values[name] = ls[name];
  if (ls.openMarkdownIn) values['openIn.markdown'] = ls.openMarkdownIn;
  for (const name of ['editorSize', 'editorLine', 'appSize', 'zoom']) if (+ls[name]) values[name] = +ls[name];
  for (const name of ['findShared', 'lineBreaks']) was(name, 'on');
  if (ls.tabRows === 'on') values.tabBar = 'rows';
  if (ls['gutter.lineNumbers'] === 'off') values.lineNumbers = 'none';
  for (const name of ['backup', 'wrap', 'movePinned', 'formatBar', ...GUTTER_NAMES.map(n => 'gutter.' + n)]) notOff(name);
  await host('settingsImport', { values });
  for (const name of [...Object.keys(values), 'tabRows', 'gutter.lineNumbers', 'openMarkdownIn']) delete ls[name];
  Object.assign(settings, await host('settings'));
}
const GUTTER_NAMES = ['bookmarks', 'changes', 'git', 'folds'];

function setSidebar(visible) {
  document.body.dataset.sidebar = visible ? 'on' : 'off';
  keepLayout('sidebar', visible);
  relayout();
}

ui.splitter.addEventListener('pointerdown', e => {
  ui.splitter.setPointerCapture(e.pointerId);
  const move = ev => document.body.style.setProperty('--sidebar-w', Math.max(120, Math.min(ev.clientX, innerWidth - 300)) + 'px');
  ui.splitter.addEventListener('pointermove', move);
  ui.splitter.addEventListener('pointerup', () => {
    ui.splitter.removeEventListener('pointermove', move);
    keepLayout('sidebarWidth', parseInt(document.body.style.getPropertyValue('--sidebar-w')) || 0);
    relayout();
  }, { once: true });
});

async function openRecent(list, path, missing) {
  if (missing) {
    host('recentRemove', { path });
    return toast(`${path} no longer exists; removed from the list.`, true);
  }
  if (list === 'folders') {
    await openFolder(path);
    setSidebar(true);
  } else await openFile(path).catch(e => toast(e.message));
}

// Opened by the user (not restored): on top of the recent list.
const noteOpened = (kind, path) => host('recentAdd', { kind, path }).catch(() => {});

// ---------- About ----------
async function showAbout() {
  const info = await host('about');
  const built = info.built ? new Date(info.built).toLocaleString() : 'unknown';
  const section = (title, rows) => `<tr><th colspan="2">${title}</th></tr>` +
    rows.map(([name, value]) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(value)}</td></tr>`).join('');
  const commit = info.commit ? ` (${escapeHtml(info.commit)})` : '';
  ui.aboutBody.innerHTML = `<p>Version ${escapeHtml(info.version)}${commit} &middot; built ${escapeHtml(built)}</p><table>` +
    section('Needed to run (installed)', [
      ['Windows 10 or 11, x64', info.os],
      ['.NET 10 Desktop Runtime', info.dotnet],
      ['Microsoft Edge WebView2 Runtime', info.webView2],
    ]) +
    section('Included', [
      ['WebView2 SDK', info.webView2Sdk],
      ...Object.entries(info.libraries).map(([name, version]) =>
        [name === '@highlightjs/cdn-assets' ? 'highlight.js' : name, version]),
    ]) +
    '</table>';
  ui.about.showModal();
}

// ---------- Commands ----------
const activeDoc = () => activeTab()?.doc;

const commands = {
  async openFile() {
    for (const path of await host('pickFile') || []) await openFile(path).catch(e => toast(e.message));
  },
  async openFolder() {
    const path = await host('pickFolder');
    if (!path) return;
    await openFolder(path);
    setSidebar(true);
  },
  newFile,
  save: () => activeDoc() && saveDoc(activeDoc()).then(refocus),
  saveAs: () => activeDoc() && saveDoc(activeDoc(), true).then(refocus),
  sidebar: () => setSidebar(document.body.dataset.sidebar === 'off'),
  refresh: refreshTree,
  markdownOnly: () => setMarkdownOnly(document.body.dataset.tree !== 'md'),
  lineBreaks: () => setSetting('lineBreaks', !setting('lineBreaks')),
  sortDir() {
    keepLayout('sortDesc', !setting('sortDesc'));
    showSort();
    refreshTree();
  },
  back: () => go(navHistory.back, navHistory.forward),
  forward: () => go(navHistory.forward, navHistory.back),
  closeTab: () => activeTab() && closeTab(activeTab()),
  nextTab: () => cycleTab(1),
  prevTab: () => cycleTab(-1),
  sync: () => !comparing() && setSync(!state.sync),   // comparing: the compare scrolls the panes itself
  level: () => levelPanes(),
  search: startSearch,
  focusTree,
  viewSearch: () => { setSideView('search'); searchUi.input.focus(); },
  viewFolder: () => setSideView('folder'),
  zoomIn: () => zoomBy(1),
  zoomOut: () => zoomBy(-1),
  zoomReset: () => zoomReset(false),
  outline: () => setOutline(!document.body.hasAttribute('data-outline')),
  orient() {
    state.orient = state.orient === 'v' ? 'h' : 'v';
    keepLayout('orient', state.orient);
    layout();
    relayout();
  },
  tabOtherPane: () => menuTab && moveToPane(menuTab, panes[1 - paneOf(menuTab).index]),
  tabSplit: async () => { if (menuTab) { await activate(paneOf(menuTab), menuTab); await splitToOther(); } },
  tabNextWindow: () => menuTab && moveTab(menuTab, 'next'),
  tabNewWindow: () => menuTab && moveTab(menuTab, 'new'),
  tabCopyPath: () => menuTab?.doc.path && copyText(menuTab.doc.path),
  tabShowInTree: () => menuTab && showInTree(menuTab.doc.path),
  tabClose: () => menuTab && closeTab(menuTab),
  // The compare (compare.js): this tab on the left.
  async tabCompareWith() {
    const tab = menuTab, [path] = await host('pickFile', { one: true }) ?? [];
    if (tab && path) startCompare({ tab }, { path });
  },
  tabCompareOther: () => menuTab && startCompare({ tab: menuTab }, { tab: panes[1 - menuPaneIndex].active }),
  tabCompareSaved: () => menuTab && startCompare({ saved: menuTab.doc }, { tab: menuTab }),
  tabCompareLeft: () => menuTab?.doc.path && selectLeftSide(menuTab.doc.path),
  tabCompareTo: () => menuTab && compareToLeftSide({ tab: menuTab }, false),
  tabCloseOthers: () => menuTab && closeTabs(paneOf(menuTab).tabs.filter(t => t !== menuTab)),
  tabCloseRight: () => menuTab && closeTabs(paneOf(menuTab).tabs.slice(paneOf(menuTab).tabs.indexOf(menuTab) + 1)),
  tabCloseAll: () => menuTab && closeTabs([...paneOf(menuTab).tabs]),
  tabPin: () => menuTab && togglePin(menuTab),
  tabReadOnly: () => menuTab && setReadOnly(menuTab, !menuTab.readOnly),
  tabRevert: () => menuTab && revertDoc(menuTab.doc),
  formatBar: () => setSetting('formatBar', !setting('formatBar')),
  findShared: () => setSetting('findShared', !setting('findShared')),
  reopenTab: () => reopenTab(),
  stripReopen: () => reopenTab(menuPane),
  stripCloseAll: () => menuPane && closeTabs([...menuPane.tabs]),
  paneHide: () => hidePane(menuPaneIndex),
  paneClose: () => closePane(menuPaneIndex),
  paneHideOther: () => hidePane(1 - menuPaneIndex),
  paneCloseOther: () => closePane(1 - menuPaneIndex),
  paneShow: showHiddenPane,
  hideFirst: () => hidePane(0),
  hideSecond: () => hidePane(1),
  closeFirst: () => closePane(0),
  closeSecond: () => closePane(1),
  orientV: () => state.orient === 'v' || commands.orient(),
  orientH: () => state.orient === 'h' || commands.orient(),
  copyPath: () => copyText(contextPath),
  copyRelativePath: () => copyText(relativePath(contextPath)),
  favouriteToggle: () => toggleFavourite(activeDoc()?.path),
  tabFavourite: () => menuTab && toggleFavourite(menuTab.doc.path),
  treeFavourite: () => toggleFavourite(contextPath, contextKind),
  // The folder becomes the tree's root; its subfolders that were open stay open.
  treeSetRoot: () => {
    const under = contextPath.replace(/\\$/, '').toLowerCase() + '\\';
    return openFolder(contextPath, [...expanded].filter(dir => dir.toLowerCase().startsWith(under)));
  },
  treeCompareActive: () => activeTab() && startCompare({ tab: activeTab() }, { path: contextPath }),
  async treeCompareWith() {
    const left = contextPath, [right] = await host('pickFile', { one: true, at: left }) ?? [];
    if (right) startCompare({ path: left }, { path: right });
  },
  treeCompareLeft: () => selectLeftSide(contextPath),
  treeCompareTo: () => compareToLeftSide({ path: contextPath }, contextKind === 'folders'),
  async treeCompareFolder() {
    const left = contextPath, right = await host('pickFolder', { at: left });
    if (right) startFolderCompare(left, right);
  },
  about: showAbout,
  exit: () => host('exit'),   // the window still asks about unsaved changes
  // Day / night: following Windows, the other mode until Windows changes mode; else the other mode, kept.
  theme: () => setting('followWindows') ? host('switchMode') : setSetting('theme', look?.mode === 'dark' ? 'light' : 'dark'),
};

document.addEventListener('click', e => {
  const button = e.target.closest('button');
  if (button?.classList.contains('mm-sub-title')) return;   // a flyout title: the menu stays open
  // Any other click closes the menus (except the click that opens one).
  ui.treeMenu.hidden = ui.tabMenu.hidden = ui.stripMenu.hidden = ui.dividerMenu.hidden = true;
  if (!button?.classList.contains('mm-pane-button')) ui.paneMenu.hidden = true;   // that one opens it
  if (button?.dataset.cmd) commands[button.dataset.cmd]();
  else if (button?.dataset.action && !button.closest('.mm-format, .mm-dropdown')) runAction(button.dataset.action, [], { from: 'menu' });
});

// Mouse back / forward buttons: the places of the document (places.js); with Ctrl the tabs and files of the window.
document.addEventListener('mouseup', e => {
  if (e.button !== 3 && e.button !== 4) return;
  e.preventDefault();
  if (e.ctrlKey) commands[e.button === 3 ? 'back' : 'forward']();
  else stepPlace(e.button === 3 ? -1 : 1);
});

// The keys themselves are in keys.js (keys.json). Here: what is not an action.
document.addEventListener('keydown', e => {
  // A reload would throw away unsaved text.
  if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) return e.preventDefault();
  if (e.key === 'Escape') {
    // An open find bar closes first (from anywhere in the window); the next Esc does the rest.
    const finding = panes.find(p => p.find && !p.find.el.hidden);
    if (finding) {
      e.preventDefault();
      // From the sidebar search the focus stays there: its own Esc comes next.
      closeFind(panes[state.activePane].find?.el.hidden === false ? panes[state.activePane] : finding,
        !e.target.closest?.('.mm-search-view'));
      return;
    }
    hideMenus();
    dismissNotices();
  }
});

// Buttons with data-action get their action's title and key as tooltip; context menu items with
// data-key-of show the key of that action.
function showKeys() {
  for (const el of document.querySelectorAll('.mm-toolbar [data-action]'))
    el.title = withKey(el.dataset.title || actionTitle(el.dataset.action), el.dataset.keyAction || el.dataset.action);
  for (const el of document.querySelectorAll('[data-key-of]')) {
    el.querySelector('.mm-key')?.remove();
    const key = keyText(el.dataset.keyOf);
    if (key) el.insertAdjacentHTML('beforeend', `<span class="mm-key">${escapeHtml(key)}</span>`);
  }
}

// ---------- Startup ----------
track((async () => {
  Object.assign(settings, await host('settings'));
  if (!settings.pageSettingsMoved) await movePageSettings();
  if (!settings.layoutMoved) await moveLayoutStorage();
  layoutOwn = (await host('windowLayout')) ?? {};   // its own, or its project's last window's
  Object.assign(screenZoom, await host('screen'));   // the zoom of the monitor it is on
  mergeLayout();
  applySettings();   // the layout too: sidebar, outline, panes
  showThemeSet();
  applyLook(await host('look'));
  layout();

  // A window of a project opened again restores its session; folder and files on the command line come on top.
  const start = await host('init');
  await loadLanguages();   // first: the keys name their actions
  setKeys(await host('keys'));
  host('settingDefs', { defs: settingDefs() });   // the rows of the settings window
  Object.assign(clips, await host('clipState').catch(() => ({})));   // the Windows clipboard busy elsewhere: no previews
  await loadFindHistory();   // history.js
  buildMenuBar();
  showKeys();
  state.win = start.id;
  setRole(start);
  setProject(start.project);
  setTabColours(start.tabColours);
  const session = start.restore;
  const root = start.folder ?? session?.root ?? null;

  document.body.dataset.sidebar = root && setting('sidebar') ? 'on' : 'off';
  // The tree as it was: its open folders and scroll position (when it is the session's folder).
  const tree = root && session?.root === root && session.tree && typeof session.tree === 'object' ? session.tree : null;
  if (root) await openFolder(root, Array.isArray(tree?.open) ? tree.open : []).catch(() => {});
  if (tree && Number.isFinite(tree.top)) ui.tree.scrollTop = tree.top;
  if (start.restore !== undefined || start.drafts) await restore(session, start.drafts || []);
  // View in LexPen (docs/plans/executed/PLAN-view-window.md): the files in the preview, the folder in the Folder pane.
  // A window of a project opened again for them (it was closed): the files after its tabs as they were.
  const reopened = start.restore !== undefined && start.restore !== null;
  for (const path of start.files) await (start.view ? viewFile(path, reopened) : goToOrOpen(path, { last: reopened })).catch(e => toast(e.message));
  if (start.view && start.folder) { setSidebar(true); setSideView('folder'); }
  syncWatch();
  syncWatchFiles();
  await showAll();
  // The keys act on the file shown last right away.
  if (panes[state.activePane].active) focusPane(panes[state.activePane]);
  started = true;
  // --compare (compare.js): two files side by side, or two folders in the folder pane.
  if (start.compare) {
    const { left, right, folders } = start.compare;
    if (folders) startFolderCompare(left, right); else await startCompare({ path: left }, { path: right });
  } else if (session) await restoreCompare(session.compare, session.folderCompare);   // the compare it was in
  if (gitWaiting) loadGitLater(gitWaiting);
  saveSession();
  host('layoutShown', { layout: windowLayout() });   // for this window's settings window
})());
