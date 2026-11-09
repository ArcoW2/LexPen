'use strict';

const FILE_URL = 'https://file.lexpen.example/';   // served by the host, see MainForm.OnFileRequested
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
  docName: $('.mm-doc-name'),
  panes: $('.mm-panes'), divider: $('.mm-divider'), sync: $('.mm-sync'),
  toast: $('.mm-toast'),
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

// View > Layout > Use layout of... (docs/plans/executed/PLAN-docking.md 3.13a): this window takes the layout of another open
// window, or of a project with no window open (its last window's); its tabs, folder and place stay; Undo in the message.
async function layoutSourceItems() {
  const sources = await host('layoutSources');
  if (!sources.length) return [{ label: '(no other window or project)', enabled: false }];
  return sources.map(s => ({ label: (s.kind === 'project' ? `${s.label}  (no window open)` : s.label).replace(/&/g, '&&'),
    action: 'layoutUseFrom', params: [s.kind, s.id, s.label] }));
}

async function useLayoutFrom(kind, id, name) {
  const layout = await host('layoutFrom', { kind, source: +id });
  if (!layout) return toast(`${name ?? 'That window'} has no layout to take (any more).`, true);
  const before = { ...layoutOwn };
  const take = values => { layoutOwn = values; mergeLayout(); applySettings(); layoutChanged(); };
  take({ ...layout });
  toast(`This window has the layout of ${name ?? 'the other window'} now.`, true, { label: 'Undo', run: () => take(before) });
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
  logMessage(message, info);
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
// ---------- Messages: what the toast showed, kept ----------
// Every toast of this window since it opened (the last 200), with its time and the document active then: the
// Messages pane (View > Messages..., also F1, and a click on the toast; docs/plans/executed/PLAN-docking.md stage 11) lists
// them, newest first, kept up to date while shown; a click on a document goes there. A page of its own (messages.html)
// that docks in the window's dock areas or floats in a window of its own, floating the first time; not modal. Its
// window closed by hand: it stays floating, so it opens floating again.
const messageLog = [];
function logMessage(text, info) {
  let doc = null, name = '';
  try { doc = activeTab()?.doc; name = doc ? docName(doc) : ''; } catch { /* a message while the page is still loading */ }
  messageLog.push({ at: new Date(), text: String(text), info: !!info, path: doc?.path ?? null, draft: doc?.draft ?? null, name });
  if (messageLog.length > 200) messageLog.shift();
  if (messagesPane.frame || messagesPane.floating) messagesPane.send(messagesState());
}

function messagesState() {
  const today = new Date().toDateString(), two = n => String(n).padStart(2, '0');
  const when = d => (d.toDateString() === today ? '' : `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} `) +
    `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  return { kind: 'messages', list: messageLog.map((m, i) => ({ i, at: when(m.at), text: m.text, info: m.info, name: m.name,
    where: m.path || (m.draft ? `Draft ${m.draft}` : '') })).reverse() };
}

const messagesPane = paneChannel({ id: 'messages', page: 'messages.html', title: 'Messages', view: () => $('.mm-messages-view'),
  state: () => new Map([['look', paneLook()], ['title', { kind: 'title', text: 'Messages' }], ['messages', messagesState()]]),
  receive: m => fromMessagesPane(m),
  onFloat: () => setDockFloating('messages', true),
  // Back in its view: docked (moved onto the window); its window closed by hand: it stays floating.
  onDock: () => { if (messagesPane.toDock) { messagesPane.toDock = false; setDockFloating('messages', false); } } });

// As it was last: its window (floating), or docked here.
function showMessages() {
  if (dockModel().state.messages === 'floating') messagesPane.float();
  else showDockPane('messages');
  messagesPane.send(messagesState());
}

function fromMessagesPane(m) {
  if (m.kind === 'escape') return events.toolEscape();
  if (m.kind === 'clear') { messageLog.length = 0; return messagesPane.send(messagesState()); }
  if (m.kind === 'go' && messageLog[m.i]) return goToMessageDoc(messageLog[m.i]);
}

async function goToMessageDoc(m) {
  if (m.path) return goToOrOpen(m.path).catch(e => toast(e.message));
  const doc = findDraft(m.draft), tab = doc && tabsOf(doc)[0];
  if (!tab) return toast('That draft is closed.', true);
  await activate(paneOf(tab), tab);
  focusPane(paneOf(tab));
}
ui.toast.addEventListener('click', e => { if (!e.target.closest('.mm-toast-action')) { ui.toast.hidden = true; showMessages(); } });

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
// With the file's line end (in an editor or not: a tab shown only in the preview has its text as read).
const diskText = doc => doc.cmDoc ? doc.cmDoc.getValue(doc.eol) : doc.text.split(/\r\n|\r|\n/).join(doc.eol);

// ---------- Line ends (docs/plans/executed/PLAN-line-endings-convert.md) ----------
// The editor holds lines; the file's line end is the document's eol, used on save (diskText). savedEol: the file's on
// disk; mixed: the file on disk has more than one kind and none was chosen yet (saved, it gets eol, the most used).
const EOLS = { crlf: '\r\n', lf: '\n', cr: '\r' };
const EOL_NAMES = { '\r\n': 'CRLF', '\n': 'LF', '\r': 'CR' };
const newFileEol = () => EOLS[setting('newFileEol')] ?? '\r\n';

// The line end of a read text: the kind most lines end with; without a line break, a new file's (the setting).
function readEol(doc, text) {
  let crlf = 0, lf = 0, cr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) { if (text.charCodeAt(i + 1) === 10) { crlf++; i++; } else cr++; }
    else if (c === 10) lf++;
  }
  const kinds = [['\r\n', crlf], ['\n', lf], ['\r', cr]].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  doc.eol = doc.savedEol = kinds.length ? kinds[0][0] : newFileEol();
  doc.mixed = doc.savedMixed = kinds.length > 1;
}

// The line end differs from the file on disk: a change to save.
const eolChanged = doc => doc.eol !== doc.savedEol || (doc.savedMixed && !doc.mixed);

// Line ends (the bottom bar, the Convert menu, the action lineEnd.set): the file's line end becomes `eol`, written at
// the next save. Not an edit of the text, so not an undo step: choosing the old one again makes the file unchanged.
function setLineEnd(doc, eol) {
  if (!doc || !eol || (doc.eol === eol && !doc.mixed)) return;
  const tab = activeTab()?.doc === doc ? activeTab() : tabsOf(doc).find(editable);   // the tab it is chosen in
  if (tab && !editable(tab)) return toast('This tab is read-only.');
  doc.eol = eol;
  doc.mixed = false;
  const textClean = doc.cmDoc ? doc.cmDoc.isClean(doc.savedGeneration) : doc.text === doc.savedText;
  if (doc.draft) { doc.draftChanged = !textClean || eolChanged(doc); writeDraft(doc); }
  else doc.dirty = !textClean || eolChanged(doc);
  refreshTabs();
  updateChrome();
  updateStatus();
  toast(`Line ends: ${EOL_NAMES[eol]}, written at the next save.`, true);
}

function showLineEndList() {
  const doc = activeDoc();
  if (!doc || doc.pdf || doc.binary) return;   // not text: no line ends
  const r = statusUi.eol.getBoundingClientRect();
  openPopupMenu([['crlf', 'CRLF (Windows)'], ['lf', 'LF (Unix, macOS)'], ['cr', 'CR (old Mac)']].map(([kind, label]) => ({
    label, plain: true, checked: () => doc.eol === EOLS[kind] && !doc.mixed, run: () => setLineEnd(doc, EOLS[kind]),
  })), r.left, r.top);
}
// label: a compare's saved text; draftName: a draft's name (Rename draft), else its id (edit3).
const docName = doc => doc.label ?? (doc.path ? nameOf(doc.path) : doc.draftName || doc.draft);
const changed = doc => doc.dirty || doc.draftChanged;

function makeDoc({ path = null, draft = null, text = '', encoding = 'UTF-8' }) {
  const doc = {
    path, draft, text, language: codeLang(path, text),
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
  readEol(doc, text);
  docs.add(doc);
  return doc;
}

async function loadDoc(path) {
  const got = await host('read', { path });
  // Not text, a kind a pack knows by its first bytes, whatever the file's name (docs/plans/executed/PLAN-non-text-files.md).
  if (got.kind) return loadKindDoc(path, got.kind);
  if (got.binary) return loadBinaryDoc(path, got.readOnly);
  const { text, encoding, readOnly, language, ranges, notKind } = got;
  const found = findDoc(path), doc = found ?? makeDoc({ path, text, encoding });
  // Named as such a kind (x.pdf) but text: opened as text, said so (its language is found by its text, never that kind).
  if (!found && notKind) toast(`${docName(doc)} is not a ${packs[notKind]?.name ?? notKind} file; opened as text.`, true);
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

// A file of a kind that is not text: a PDF (pdfview.js; not read as text, pdf.js reads the file itself; never written).
// A pack of such a kind LexPen has no view for (yours): refused.
async function loadKindDoc(path, kind) {
  if (kind !== 'pdf') throw new Error(`LexPen cannot show ${packs[kind]?.name ?? kind} files.`);
  const found = findDoc(path), doc = found ?? makeDoc({ path, text: '', encoding: '' });
  doc.pdf = doc.diskReadOnly = true;
  doc.language = kind;   // also when its name says otherwise (x.bin)
  if (!found) { await loadPdfLook(doc); pdfHlLoad(doc); }   // its look; its highlights (pdfhighlights.js)
  doc.lock = await host('lock', { path });
  unfresh(path);
  syncWatchFiles();
  return doc;
}

// A file that is neither text nor a kind LexPen knows: its bytes, in Hex only (hexview.js reads them; saved as they are).
async function loadBinaryDoc(path, readOnly) {
  const found = findDoc(path), doc = found ?? makeDoc({ path, text: '', encoding: '' });
  doc.binary = true;
  doc.diskReadOnly = readOnly;
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
    mode: doc.pdf ? 'preview' : mode ?? openMode(doc),   // a PDF is only its preview, whatever a session kept
    stale: true,         // the preview does not match the text
    cmDoc: null,         // linked CodeMirror Doc, see tabDoc
    previewTop: 0,
    dot: null,           // changed / removed on disk while not looked at
    lines: null,         // source line -> preview position, see lineMap
    renderId: 0,
    pinned: false,       // closing it alone asks first; closing several leaves it open (tab menu: Pin tab)
    readOnly: false,     // set by the user (tab menu: Read-only)
    hex: !!doc.binary,   // shown as its bytes (hexview.js); a file LexPen does not know only so
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
    // The tabs: pinned ones on a row of their own (setting pinnedTabs "row"), the others below (refreshTabs).
    '<div class="mm-tabs-stack"><div class="mm-tabs-pinned"></div><div class="mm-tabs"></div></div>' +
    '<button class="mm-tabs-more" title="Tabs out of view" hidden></button>' +
    '<button class="mm-pane-outline" title="The outline of this pane: show / hide">' +
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 3.5h9M4.5 7h9M4.5 10.5h9M2 14h7"/></svg></button>' +
    '<button class="mm-pane-button" title="This pane: hide or close it; show a hidden pane">' +
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M8 2.5v11"/></svg></button></div>' +
    '<div class="mm-find" hidden></div>' +
    '<div class="mm-find mm-occ" hidden></div>' +   // the Occurrences bar (occurrences.js)
    // Its body: the text (editor, preview) with its own dock areas around it (docks.js; 3.10), the outline in one.
    '<div class="mm-body">' + ['left', 'right', 'bottom'].map(side => `<div class="mm-dock" data-side="${side}" data-area="${index}.${side}">` +
      `<div class="mm-dock-strip"></div><div class="mm-dock-body"></div></div><div class="mm-dock-split" data-side="${side}" data-area="${index}.${side}"></div>`).join('') +
    '<div class="mm-content"><div class="mm-editor-pane"></div>' +
    '<div class="mm-split" title="Drag: the sizes of editor and preview; double-click: half and half; right-click: where the preview is"></div><div class="mm-preview-pane"></div></div>' +
    '<nav class="mm-outline"><div class="mm-outline-edge" title="Drag to resize"></div></nav>' +   // its page: outlineFrame
    '<div class="mm-drop" hidden></div><div class="mm-bar" hidden></div></div>';
  const pane = {
    index, el, tabs: [], active: null, cm: null, ignoreScroll: false, ignoreEditorScroll: false,
    tabsEl: el.querySelector('.mm-tabs'), pinnedEl: el.querySelector('.mm-tabs-pinned'), stackEl: el.querySelector('.mm-tabs-stack'),
    editorEl: el.querySelector('.mm-editor-pane'),
    previewEl: el.querySelector('.mm-preview-pane'), dropEl: el.querySelector('.mm-drop'), barEl: el.querySelector('.mm-bar'),
    outlineNav: el.querySelector('.mm-outline'), outlineFrame: null, outlineRows: [],
  };
  for (const type of ['pointerup', 'pointercancel']) addEventListener(type, () => endSneak(pane));   // a sneak released outside the outline
  el.querySelector('.mm-outline-edge').addEventListener('pointerdown', e => resizeOutline(e));
  el.querySelector('.mm-split').addEventListener('pointerdown', e => resizeSplit(e));
  el.querySelector('.mm-split').addEventListener('dblclick', () => setSplit(null));
  el.querySelector('.mm-split').addEventListener('contextmenu', e => previewPlaceMenu(e, pane));
  el.querySelector('.mm-tabs-more').addEventListener('click', e => showTabsMore(pane, e.currentTarget));
  // Alt + mouse wheel: this pane alone, the distance to the other taken again (scroll together, plan 13).
  el.addEventListener('wheel', e => { if (e.altKey && state.sync && keepsDistance()) pane.solo = performance.now(); }, { capture: true, passive: true });
  // The file of the pane's tab in the folder pane (as Visual Studio's "Sync with active document").
  el.querySelector('.mm-sync-tree').addEventListener('click', () => {
    const path = pane.active?.doc.path;
    if (path) showInTree(path); else toast('This file is not saved yet, so it is in no folder.');
  });
  el.querySelector('.mm-tabs').addEventListener('scroll', () => updateTabsMore(pane));
  el.querySelector('.mm-pane-outline').addEventListener('click', () => toggleOutline(pane));
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
  pane.previewEl.addEventListener('click', e => { csvClick(pane, e); onPreviewClick(pane, e); });   // a hidden column's mark (csvview.js)
  pane.previewEl.addEventListener('dblclick', e => typeof previewToEditor === 'function' && previewToEditor(pane, e));   // previewjump.js
  pane.previewEl.addEventListener('mousemove', e => csvHover(pane, e));   // the cell in the bottom bar (csvview.js)
  pane.previewEl.addEventListener('mouseleave', () => pane.csvHover && csvHover(pane, {}));
  pane.previewEl.addEventListener('contextmenu', e => csvMenu(pane, e));
  pane.previewEl.addEventListener('mousemove', e => {   // a highlight's note as tooltip (highlights.js)
    if (typeof previewNoteAt !== 'function' || !pane.hlSpots?.length) return;
    const note = previewNoteAt(pane, e.clientX, e.clientY) ?? '';
    if (pane.previewEl.title !== note) pane.previewEl.title = note;
  });
  pane.barEl.addEventListener('click', e => onBarClick(pane, e));

  const tabOf = e => pane.tabs.find(t => t.id === +e.target.closest('.mm-tab')?.dataset.tab);
  // The full name above the tabs follows the mouse over the tabs (showDocName).
  pane.stackEl.addEventListener('mouseover', e => {
    const tab = tabOf(e) ?? null;
    if (tab === hoverTab) return;
    hoverTab = tab;
    showDocName();
  });
  pane.stackEl.addEventListener('mouseleave', () => {
    hoverTab = null;
    showDocName();
  });
  pane.stackEl.addEventListener('click', e => {
    // The group of pinned tabs (setting pinnedTabs "grouped"): its list; empty: nothing.
    if (e.target.closest('.mm-tab-group')) return showPinnedList(pane, e.target.closest('.mm-tab-group'));
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
  pane.stackEl.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });   // no autoscroll
  pane.stackEl.addEventListener('auxclick', e => {
    const tab = e.button === 1 && tabOf(e);
    if (tab) closeTab(tab);
  });
  // Right-click a tab: its menu; the empty part of the bar: reopen a closed tab.
  pane.stackEl.addEventListener('contextmenu', e => {
    // The group of pinned tabs: the tab menu of the pinned document shown (none shown: the bar's menu).
    const group = e.target.closest('.mm-tab-group'), tab = group ? (pane.active?.pinned ? pane.active : null) : tabOf(e);
    menuPaneIndex = index;
    if (tab) return showTabMenu(pane, tab, e);
    ui.stripMenu.querySelector('button').disabled = !closedTabs.length;
    ui.stripMenu.querySelector('[data-cmd=stripCloseAll]').disabled = !pane.tabs.length;
    showMenu(ui.stripMenu, e, () => { menuPane = pane; paneItems(ui.stripMenu); pinnedTabsChecks(ui.stripMenu); });
  });
  pane.stackEl.addEventListener('dragstart', e => {
    const tab = tabOf(e);
    if (!tab) return;
    startTabDrag(tab, e);
  });
  // Dropped outside every window: the tab gets a window of its own.
  pane.stackEl.addEventListener('dragend', e => {
    hideDrops();
    draggedTab = null;
    const tab = tabOf(e);
    if (!tab || e.dataTransfer.dropEffect !== 'none') return;
    const inside = e.screenX >= screenX && e.screenX < screenX + outerWidth && e.screenY >= screenY && e.screenY < screenY + outerHeight;
    if (!inside) moveTab(tab, 'new', { screenX: Math.round(e.screenX * devicePixelRatio), screenY: Math.round(e.screenY * devicePixelRatio) });
  });

  el.addEventListener('dragover', e => {
    // A tab of this window over a tab bar: it goes between the tabs, at the marker (onto the group of pinned tabs:
    // pinned, the group marked).
    if (draggedTab && e.target.closest('.mm-tabs-stack')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      hideDrops();
      const at = stripAt(pane, e);
      if (at.el) at.el.classList.add(at.group ? 'mm-insert-group' : 'mm-insert');
      else at.row.classList.add('mm-insert-end');
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
    if (draggedTab && e.target.closest('.mm-tabs-stack')) {
      e.preventDefault();
      hideDrops();
      const at = stripAt(pane, e), tab = draggedTab;
      return moveToPane(tab, pane, at.index).then(() => { if (at.pinned !== null) setPinned(tab, at.pinned); });
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

// The pane's bars: above the text and the pane's right dock area, the whole width of the document but its left dock
// area (app.css: .mm-bars); made by the first that needs it (the editor, a PDF).
function paneBars(pane) {
  if (!pane.barsEl) {
    pane.barsEl = Object.assign(document.createElement('div'), { className: 'mm-bars' });
    pane.el.querySelector('.mm-body').append(pane.barsEl);
  }
  return pane.barsEl;
}

async function ensureEditor(pane) {
  if (pane.cm) return;
  await loadEditor();
  if (pane.cm) return;
  // The formatting bar and a code language's bar (format.js), before a PDF's (pdfview.js) when that came first.
  paneBars(pane).prepend(makeFormatBar(pane), makeCodeBar(pane));
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
  // The bars above the text change, so does the editor's height: its side areas' heads follow (alignPaneDocks).
  new ResizeObserver(() => { alignPaneDocks(pane); fitGutter(pane); }).observe(pane.cm.getWrapperElement());
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
  pane.cm.on('gutterContextMenu', (cm, line, gutter, e) => {   // View > Gutter, at the mouse
    e.preventDefault();
    openContextMenu(GUTTER_ITEMS, e.clientX, e.clientY);
  });
  // Bookmarks move with the text; a removed line can put two on one line: draw them again. The change
  // and git markers follow the text too.
  pane.cm.on('changes', () => {
    clearTimeout(pane.bookmarkTimer);
    pane.bookmarkTimer = setTimeout(() => paintBookmarks(pane), 150);
    scheduleGutter(pane);
  });
  if (typeof setupOccurrences === 'function') setupOccurrences(pane);   // occurrences.js: edits, double click, selection
  if (typeof setupMacroRecording === 'function') setupMacroRecording(pane);   // macros.js: typing, keys, clicks
  if (typeof setupMacroEditor === 'function') setupMacroEditor(pane);   // macros.js: a macro's tab checked as you type
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
  pane.cm.on('beforeChange', (cm, change) => { if (typeof sortBeforeChange === 'function') sortBeforeChange(pane, change); });   // Undo / Redo of a sort: its highlights along (sort.js)
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
    doc.draftChanged = !clean || eolChanged(doc);
    clearTimeout(doc.draftTimer);
    doc.draftTimer = setTimeout(() => writeDraft(doc), 1000);   // after a second without typing
  } else doc.dirty = !clean || eolChanged(doc);
  for (const tab of tabsOf(doc)) {
    tab.stale = true;
    tab.lines = null;
    if (paneOf(tab).active === tab && tab.mode === 'split') scheduleRender(tab);
  }
  doc.version++;
  if (doc.hexData) hexDocChanged(doc);   // a tab of it in Hex shows the new bytes (hexview.js)
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
  readEol(doc, text);
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
const canRevert = doc => !!doc?.path && !doc.pdf && doc.lock && doc.disk !== 'removed' && (doc.dirty || doc.disk === 'changed');
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
  readEol(doc, text);
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
// A large code file (docs/plans/executed/PLAN-large-preview.md 3.5, 3.6): a notice first ("Rendering preview..."), then its
// blocks of lines attached a slice at a time, a frame between, so the app keeps responding; the render stops when its
// preview is no longer wanted (switched off, another tab, an edit: a newer render).
const RENDER_NOTE_SIZE = 1024 * 1024;   // characters
const CHUNKS_PER_FRAME = 40;            // blocks of CODE_CHUNK lines (languages.js)
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r)));
const previewWanted = tab => tab.mode !== 'edit' && panes.some(p => p.active === tab);

async function renderNow(tab) {
  const id = ++tab.renderId;
  tab.stale = false;
  tab.lines = null;
  tab.lineBlocks = null;
  tab.csv = null;
  const doc = tab.doc, text = docText(doc), article = tab.article;
  article.classList.toggle('mm-pdf-article', !!doc.pdf);
  if (doc.pdf) {   // a PDF: its bar and its frame (pdfview.js); the same view not put in again (a frame moved reloads)
    const view = pdfViewElement(tab);
    if (view.parentElement !== article) article.replaceChildren(view);
    return;
  }
  const csv = doc.language === 'csv';   // the column view (csvview.js)

  // Built in a <template> so images are not requested before their paths are fixed.
  // A code file: its language's colouring (languages.js, the editor script has the colouring engine); markdown
  // too when it has fenced code or lines you gave a language (coloured by their packs).
  const needsEngine = (doc.language && !csv) || doc.ranges?.length || /^\s*(`{3,}|~{3,})\s*[\w#+.-]/m.test(text);
  if (needsEngine && !window.CodeMirror?.runMode) {
    await loadEditor();
    if (id !== tab.renderId) return;
  }
  if (csv && !doc.csvDef) {   // its definition: next to the file, kept, or detected (csvview.js)
    await csvLoad(doc, text);
    if (id !== tab.renderId) return;
  }
  const large = doc.language && !csv && text.length > RENDER_NOTE_SIZE;
  let note = null;
  if (large) {   // shown before the work, which takes the thread
    note = Object.assign(document.createElement('div'), { className: 'mm-render-note', textContent: 'Rendering preview...' });
    article.prepend(note);
    await nextFrame();
    if (id !== tab.renderId) return;
    if (!previewWanted(tab)) { tab.stale = true; note.remove(); return; }
  }
  const tpl = document.createElement('template');
  if (csv) tpl.content.append(csvViewElement(tab, text));
  else tpl.innerHTML = doc.language
    ? `<pre class="mm-code" data-lang="${doc.language}">${codeHtml(text, previewColoured(text) ? editorMode(doc) : 'text/plain')}</pre>`
    : doc.ranges?.length ? renderMarkdownWithRanges(text, doc) : md.render(withFrontMatter(text));
  const content = tpl.content;
  if (doc.language && !csv && hasLongLine(text)) content.firstElementChild.classList.add('mm-long-line');
  fixPreviewContent(content, doc);
  await stampImages(content);
  if (id !== tab.renderId) return;

  if (large) {
    const pre = content.firstElementChild, chunks = [...pre.children];
    pre.replaceChildren();
    article.replaceChildren(note, content);
    for (let i = 0; i < chunks.length; i += CHUNKS_PER_FRAME) {
      pre.append(...chunks.slice(i, i + CHUNKS_PER_FRAME));
      await nextFrame();
      if (id !== tab.renderId) return;
      if (!previewWanted(tab)) { tab.stale = true; return; }   // again when its preview is shown again
    }
    note.remove();
  } else article.replaceChildren(content);
  if (tab.csv) for (const pane of panes) if (pane.active === tab) csvDraw(pane);

  if (!await renderMathAndDiagrams(article, () => id === tab.renderId)) return;
  tab.lines = null;
  tab.lineBlocks = null;   // the blocks by source line (previewjump.js), and the cursor's bar in the preview
  if (typeof markPreviewCursors === 'function') markPreviewCursors();
  if (typeof drawPreviewHighlights === 'function') for (const pane of panes) if (pane.active === tab) drawPreviewHighlights(pane);   // highlights.js
  if (typeof refreshOccurrencesPreview === 'function') refreshOccurrencesPreview(tab);   // occurrences.js
  if (typeof schedulePreviewOverviews === 'function') schedulePreviewOverviews();   // the preview's scroll bar (previewoverview.js)
}

// A rendered document's parts made right (the preview, and printing: print.js): the images by their path next to the
// document, GitHub's alerts (> [!NOTE]), long lines in code blocks.
function fixPreviewContent(content, doc) {
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
}

// The pictures from disk get their file's last change in their address: the page reuses a picture it loaded by its
// address whatever the server says, so a picture changed on disk would show as it was. Unchanged: the same address,
// nothing loaded again while typing.
async function stampImages(content) {
  const imgs = [...content.querySelectorAll('img[src]')].filter(img => img.getAttribute('src').startsWith(FILE_URL));
  if (!imgs.length) return;
  const bare = img => img.getAttribute('src').split('?')[0];
  const times = await host('fileTimes', { paths: imgs.map(img => safeDecode(bare(img).slice(FILE_URL.length))) }).catch(() => null);
  imgs.forEach((img, i) => { if (times?.[i]) img.src = bare(img) + '?v=' + times[i]; });
}

// Formulas (KaTeX) and diagrams (mermaid) in a rendered document, their scripts loaded the first time. False when
// `wanted` says the result is no longer wanted (a newer render) while a script loaded.
async function renderMathAndDiagrams(root, wanted = () => true) {
  const formulas = root.querySelectorAll('.tex');
  if (formulas.length) {
    loadCss('vendor/katex/katex.min.css');
    await loadScript('vendor/katex/katex.min.js');
    if (!wanted()) return false;
    for (const el of formulas)
      katex.render(el.textContent, el, { displayMode: el.hasAttribute('data-display'), throwOnError: false });
  }

  const diagrams = root.querySelectorAll('pre.mermaid');
  if (diagrams.length) {
    await loadScript('vendor/mermaid.min.js');
    if (!wanted()) return false;
    mermaid.initialize({ startOnLoad: false, theme: state.theme === 'dark' ? 'dark' : 'default' });
    await mermaid.run({ nodes: diagrams, suppressErrors: true });
  }
  return true;
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
    // Relative link: open other documents in place (Ctrl+click or Shift+click: in a new tab). Web links fall
    // through to the host, which opens them in the default browser.
    e.preventDefault();
    const [path, anchor] = href.split('#');
    const target = resolvePath(tab?.doc.path ? dirOf(tab.doc.path) : state.root || '', safeDecode(path));
    if (codeLang(target) === 'plaintext') return;
    if (!tab || e.ctrlKey || e.shiftKey || tab.pinned || tab.doc.draft) openFile(target, { pane, anchor });   // a pinned tab stays
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
  if (winOutline) showOutline(panes[index]);   // the window's outline takes its document (when it has no outline of its own)
  reportOutlineWanted();   // the floating outline (7.3): this pane may have its own
  reportPanesWanted();   // the other panels that follow the focus (plan 22; panechannel.js): the same
  placeFocusRing();   // the document's dimmed frame, while a tool pane has the focus
  if (typeof tellHighlightsWindow === 'function') tellHighlightsWindow();   // the highlights shown: its document's (highlights.js)
  tellBookmarksPanes();   // the window's Bookmarks pane: its document's (bookmarkspane.js)
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
  // A pane hidden or closed (its button's menu, the divider's) with the focus in it: the focus fell to the page, and the
  // Ctrl tap and the keys had no part to act on. To the pane that shows; after the menu has closed.
  setTimeout(() => {
    const el = document.activeElement, pane = panes[state.activePane];
    if ((el === document.body || panes.some(p => p.el.contains(el) && !p.el.offsetParent)) && pane?.active && pane.el.offsetParent) focusPane(pane);
  });
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

// A very narrow editor (room for about GUTTER_HIDE characters of text beside the gutter, or less): the gutter goes, the
// text gets its room; it comes back once there is room for it and GUTTER_SHOW characters (not back and forth at the
// edge).
const GUTTER_HIDE = 6, GUTTER_SHOW = 12;
function fitGutter(pane) {
  const cm = pane.cm, wrap = cm.getWrapperElement(), off = wrap.classList.contains('mm-no-gutter');
  if (!wrap.clientWidth) return;
  if (!off) pane.gutterWidth = cm.getGutterElement().offsetWidth;
  const chars = (wrap.clientWidth - (pane.gutterWidth ?? 0)) / cm.defaultCharWidth();
  if (off === (off ? chars < GUTTER_SHOW : chars < GUTTER_HIDE)) return;
  wrap.classList.toggle('mm-no-gutter', !off);
  cm.refresh();   // the text's left edge follows (CodeMirror measures the gutter)
}

// After a resize: editors measure again, line maps are rebuilt.
// An editor pane's side areas (docks.js): their heads as high as what is above its text beside them, so a pane there
// starts at the height of the text: at the right the ruler (the bars are above that area too), at the left the bars
// and the ruler; with the editor not shown, their own height.
function alignPaneDocks(pane) {
  const cm = pane.cm?.getWrapperElement(), shown = cm && pane.el.dataset.mode !== 'preview';
  const top = shown ? cm.getBoundingClientRect().top : 0;
  const set = (name, h) => h > 0 ? pane.el.style.setProperty(name, Math.round(h) + 'px') : pane.el.style.removeProperty(name);
  set('--pane-bar-h', shown ? top - pane.editorEl.getBoundingClientRect().top : 0);
  set('--pane-bar-h-left', shown ? top - pane.el.querySelector('.mm-body').getBoundingClientRect().top : 0);
}

function relayout() {
  for (const pane of panes) alignPaneDocks(pane);
  for (const pane of panes) pane.cm?.refresh();
  for (const tab of allTabs()) tab.lines = null;
  if (typeof placeFocusRing === 'function') requestAnimationFrame(placeFocusRing);   // a part moved (sidebar, panes)
}
addEventListener('resize', () => {
  for (const tab of allTabs()) tab.lines = null;
  for (const pane of panes) csvDraw(pane);   // the rows in view of a CSV (csvview.js)
});

// Shows the pane's active tab (or the welcome page when it has none).
async function showActive(pane) {
  layout();
  if (typeof markPreviewCursors === 'function') markPreviewCursors();
  if (typeof schedulePreviewOverviews === 'function') schedulePreviewOverviews();
  const tab = pane.active;
  if (typeof pdfShowBar === 'function') pdfShowBar(pane);   // a PDF's bar, in the pane's bars (pdfview.js)
  pane.el.toggleAttribute('data-hex', !!tab?.hex);   // its bytes instead of editor and preview (hexview.js)
  if (!tab) {
    pane.el.dataset.mode = 'preview';
    if (pane.index === 0) pane.previewEl.replaceChildren(welcomeArticle());
    pane.barEl.hidden = true;
  } else if (tab.hex) {
    pane.el.dataset.mode = tab.mode;
    await hexShow(pane);
    if (pane.active !== tab) return;
    updateBar(pane);
  } else {
    pane.el.dataset.mode = tab.mode;
    if (typeof loadHighlights === 'function') { loadHighlights(tab.doc); tellHighlightsWindow(); }   // highlights.js
    const swapped = pane.previewEl.firstChild !== tab.article;
    if (swapped) pane.previewEl.replaceChildren(tab.article);
    if (tab.mode !== 'edit' && tab.stale) render(tab);   // builds the content before the first await
    if (swapped) pane.previewEl.scrollTop = tab.previewTop;
    csvDraw(pane);
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
      for (const el of [pane.editorEl, pane.el]) if (tab.doc.language) el.dataset.lang = tab.doc.language; else delete el.dataset.lang;
      fillCodeBar(pane);
      pane.cm.refresh();
      updateInnerBar(pane);
      refreshFormatBar(pane);
    }
    updateBar(pane);
  }
  if (typeof refreshOccurrences === 'function') refreshOccurrences(pane);   // occurrences.js: this tab's text
  showOutline(pane);
  refreshTabs(pane);
  updateChrome();
  if (pane.index === state.activePane) updateStatus();
}

const showAll = () => Promise.all(panes.map(showActive));

// Back / forward, like a browser, for the whole window: every switch to another tab and every link
// followed inside a tab is a step. Entries: { tab: id, path, top, link }; link: the step was a link followed (position
// back / forward take it too, places.js).
const navHistory = { back: [], forward: [] };
let goingBack = false;   // a back/forward step itself is not recorded

function remember(tab, path, link = false) {
  if (!started || goingBack || !tab) return;
  const pane = paneOf(tab);
  const top = pane?.active === tab ? pane.previewEl.scrollTop : tab.previewTop;
  const last = navHistory.back.at(-1);
  if (last?.tab === tab.id && samePath(last.path, path)) last.top = top, last.link ||= link;
  else navHistory.back.push({ tab: tab.id, path, top, link });
  if (navHistory.back.length > 100) navHistory.back.shift();
  navHistory.forward.length = 0;
}

// A link followed in a tab (or another file shown in it: Ctrl+click in the Folder pane or the search, go to
// definition): the step kept with the tab's cursor, so back returns to that line (go).
function rememberAt(tab) {
  remember(tab, tab.doc.path, true);
  const step = navHistory.back.at(-1), at = tab.cmDoc?.getCursor();
  if (at && step?.tab === tab.id && samePath(step.path, tab.doc.path)) step.cursor = { line: at.line, ch: at.ch };
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
        const at = here.cmDoc?.getCursor();   // forward (or back again): this line again
        to.push({ tab: here.id, path: here.doc.path, top: herePane.active === here ? herePane.previewEl.scrollTop : here.previewTop, link: entry.link,
          ...(at ? { cursor: { line: at.line, ch: at.ch } } : {}) });
      }
      const pane = paneOf(tab);
      if (!samePath(tab.doc.path, entry.path) && entry.path) {
        if (!await navigate(tab, entry.path, null, true).catch(() => false)) {
          to.pop();
          continue;   // the file is gone (or unsaved changes were kept): the step before that
        }
      } else await activate(pane, tab);
      if (tab.mode !== 'edit') pane.previewEl.scrollTop = tab.previewTop = entry.top;
      // A step with the cursor kept (go to definition, definitions.js): there again.
      if (entry.cursor && tab.mode !== 'preview' && pane.cm) {
        pane.cm.setCursor(entry.cursor);
        revealFound(pane.cm, entry.cursor);
      }
    } finally {
      goingBack = false;
    }
    return;
  }
}

let quietSwitch = false;   // a file opened in the other pane (Ctrl+click): leaving this pane's tab is no step back
async function activate(pane, tab) {
  const before = activeTab();
  if (before && before !== tab && !(quietSwitch && paneOf(before) !== pane)) remember(before, before.doc.path);
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
// Pinned tabs (docs/plans/executed/PLAN-pinned-tabs-grouped-or-own-row.md; setting pinnedTabs): "regular" among the
// others, "grouped" in one tab "Pinned (n)" whose click lists them, or "row" on a row of their own above the others.
const pinnedTabsMode = () => ['grouped', 'row'].includes(setting('pinnedTabs')) ? setting('pinnedTabs') : 'regular';

function refreshTabs(only) {
  const mode = pinnedTabsMode();
  for (const pane of only ? [only] : panes) {
    const pinned = pane.tabs.filter(t => t.pinned), rest = mode === 'regular' ? pane.tabs : pane.tabs.filter(t => !t.pinned);
    pane.el.dataset.pinnedMode = mode;
    pane.pinnedEl.replaceChildren(...(mode === 'row' ? pinned.map(tab => tabElement(pane, tab)) : []));
    pane.tabsEl.replaceChildren(...(mode === 'grouped' ? [pinnedGroupElement(pane, pinned)] : []), ...rest.map(tab => tabElement(pane, tab)));
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

// The group of pinned tabs: "Pinned (n)" and an arrow; one of them shown: "Pinned (n)-name", active, in that document's
// tab colours as its own tab would have them. None: "Pinned (0)", dimmed (still a place to drop a tab on to pin it).
function pinnedGroupElement(pane, pinned) {
  const shown = pinned.includes(pane.active) ? pane.active : null, el = document.createElement('div');
  el.className = 'mm-tab mm-tab-group' + (shown ? ' mm-on' : '') + (pinned.length ? '' : ' mm-off') + (shown && changed(shown.doc) ? ' mm-dirty' : '');
  el.dataset.group = 'pinned';
  el.title = (shown ? (shown.doc.path || docName(shown.doc)) + '\n' : '') +
    (pinned.length ? 'The pinned documents: a click lists them' : 'No pinned documents: drop a tab here to pin it');
  if (shown) applyTabStyle(el, shown.doc, true);
  el.insertAdjacentHTML('beforeend', PIN_ICON);
  const name = document.createElement('span');
  name.className = 'mm-tab-name';
  name.textContent = `Pinned (${pinned.length})` + (shown ? '-' + docName(shown.doc) : '');
  el.append(name, Object.assign(document.createElement('span'), { className: 'mm-tab-arrow' }));
  return el;
}

// Its click: the pinned tabs listed under it, each in its own tab colours, the one shown marked as active; a choice shows
// it, a right-click its tab menu, dragged out onto the bar it is unpinned there (stripAt). Again while open: closed.
let pinnedListFrom = null, pinnedListSkip = null;
// The menus close on a press (menus.js), before the click: whether this group's list was open is seen here.
addEventListener('pointerdown', e => {
  pinnedListSkip = pinnedListFrom && menuBar.levels.length && e.target instanceof Element && e.target.closest('.mm-tab-group') === pinnedListFrom ? pinnedListFrom : null;
}, true);
async function showPinnedList(pane, el) {
  const pinned = pane.tabs.filter(t => t.pinned);
  if (!pinned.length) return;
  if (pinnedListSkip === el) { pinnedListSkip = pinnedListFrom = null; return; }   // its list was open: now closed
  closeMenus();
  hideMenus();
  const r = el.getBoundingClientRect();
  await openMenuLevel(pinned.map(tab => ({ label: docName(tab.doc), plain: true, key: tab.doc.path ? dirOf(tab.doc.path) : '',
    cls: 'mm-tab-entry' + (tab === pane.active ? ' mm-on' : '') + (changed(tab.doc) ? ' mm-dirty' : '') + (editable(tab) ? '' : ' mm-ro'),
    run: () => activate(pane, tab).then(() => focusPane(pane)) })), r.left, r.bottom + 2, true);
  pinnedListFrom = el;
  const list = menuBar.levels.at(-1)?.el;
  if (!list) return;
  [...list.querySelectorAll('button')].forEach((b, i) => {
    const tab = pinned[i];
    applyTabStyle(b, tab.doc, tab === pane.active);
    b.draggable = true;
    b.addEventListener('dragstart', e => { startTabDrag(tab, e); list.style.visibility = 'hidden'; });
    b.addEventListener('dragend', () => { draggedTab = null; hideDrops(); closeMenus(); hideMenus(); });
    b.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); closeMenus(); hideMenus(); menuPaneIndex = pane.index; showTabMenu(pane, tab, e); });
  });
}

// A tab dragged (its bar, the list of pinned tabs): within the window to between the tabs, outside it a window of its own.
function startTabDrag(tab, e) {
  draggedTab = tab;
  e.dataTransfer.setData(TAB_TYPE, JSON.stringify({ win: state.win, tab: tab.id }));
  if (tab.doc.path) e.dataTransfer.setData('text/plain', tab.doc.path);
  e.dataTransfer.effectAllowed = 'move';
}

// The tab menus' Pinned tabs choice: the one in use checked.
const pinnedTabsChecks = menu => { for (const b of menu.querySelectorAll('[data-pinned-tabs]')) b.classList.toggle('mm-on', b.dataset.pinnedTabs === pinnedTabsMode()); };

// A tab's right-click menu (its tab, an entry of the list of pinned tabs).
function showTabMenu(pane, tab, e) {
  const index = pane.index;
  showMenu(ui.tabMenu, e, () => {
    menuTab = tab;
    paneItems(ui.tabMenu);
    pinnedTabsChecks(ui.tabMenu);
    favouriteItem(ui.tabMenu, tab.doc.path);
    ui.tabMenu.querySelector('[data-cmd=tabPin]').textContent = tab.pinned ? 'Unpin tab' : 'Pin tab';
    ui.tabMenu.querySelector('[data-cmd=tabReadOnly]').classList.toggle('mm-on', tab.readOnly || tab.doc.diskReadOnly);
    ui.tabMenu.querySelector('[data-cmd=tabShowInTree]').hidden = !tab.doc.path;
    ui.tabMenu.querySelector('.mm-copy-name').disabled = !tab.doc.path;   // a draft never saved: greyed out
    copyNameFor = () => copyNameItems(tab.doc.path, false);
    ui.tabMenu.querySelector('[data-cmd=tabRename]').hidden = !tab.doc.path;
    ui.tabMenu.querySelector('[data-cmd=tabRenameDraft]').hidden = !tab.doc.draft;
    ui.tabMenu.querySelector('[data-cmd=tabRevert]').hidden = !canRevert(tab.doc);
    const other = panes[1 - index].active;   // the compare (compare.js)
    ui.tabMenu.querySelector('[data-cmd=tabCompareOther]').hidden = !twoPanes() || !other || other.doc === tab.doc;
    ui.tabMenu.querySelector('[data-cmd=tabCompareSaved]').hidden = !tab.doc.path || !changed(tab.doc);
    leftSideItems(ui.tabMenu, 'tab', tab.doc.path, false);
    gitCompareItems(ui.tabMenu, 'tab', tab.doc.path, tab.doc.dirty);   // compare.js
  });
}

function tabElement(pane, tab) {
  const doc = tab.doc, el = document.createElement('div');
  el.className = 'mm-tab' + (tab === pane.active ? ' mm-on' : '') + (changed(doc) ? ' mm-dirty' : '') +
    (editable(tab) ? '' : ' mm-ro') + (doc.draft ? ' mm-draft' : '');
  const dot = doc.lock && doc.disk !== 'ok' ? doc.disk : tab.dot;
  if (dot) el.dataset.dot = dot;
  el.dataset.tab = tab.id;
  el.draggable = true;
  el.title = (doc.path || labelText(doc) || `Draft ${doc.draftName ? `${doc.draftName} (${doc.draft})` : doc.draft}, not saved as a file yet`) + (tab.pinned ? '\nPinned: asks before closing' : '') +
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

// Ctrl+Tab: the next tab in tab bar order, past the last one of this pane on to the first one of the other pane
// (Ctrl+Shift+Tab: back, from the first one to the last one of the other pane). A hidden pane is passed.
async function stepTab(step) {
  const tabs = panes.filter(p => p.index !== state.hidden).flatMap(p => p.tabs), tab = activeTab();
  if (tabs.length < 2) return;
  const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length], pane = paneOf(next);
  await activate(pane, next);
  focusPane(pane);
}

// F4: the document active before this one; again: back to this one.
async function previousActive() {
  const tab = allTabs().find(t => t.id === recentTabs[1]);
  if (!tab) return;
  const pane = paneOf(tab);
  await activate(pane, tab);
  focusPane(pane);
}

// ---------- Window chrome ----------
// The full name above the tabs: of the tab the mouse is on, else of the active file.
let hoverTab = null;
function showDocName() {
  const doc = (hoverTab && paneOf(hoverTab) ? hoverTab : activeTab())?.doc;
  ui.docName.textContent = ui.docName.title = doc ? doc.path || labelText(doc) || `${docName(doc)} (draft, not saved as a file yet)` : '';
}

// A compare's read-only side that is not a file: a git version (compare.js) or a document's saved text.
const labelText = doc => doc.gitOf ? `${doc.gitOf.path} @ ${doc.gitOf.label} (from git, read-only)` : doc.label ? `${doc.label} (read-only)` : '';

function updateChrome() {
  const tab = activeTab(), doc = tab?.doc;
  document.title = (doc && changed(doc) ? '\u25CF ' : '') + (doc ? docName(doc) + ' - ' : '') + 'LexPen';
  showDocName();
  // A draft can always be saved as a file.
  document.body.toggleAttribute('data-dirty', !!doc && (doc.dirty || !!doc.draft));
  $('.mm-switch-editor').classList.toggle('mm-on', !!tab && !tab.hex && tab.mode !== 'preview');
  $('.mm-switch-preview').classList.toggle('mm-on', !!tab && !tab.hex && tab.mode !== 'edit');
  $('.mm-switch-hex').classList.toggle('mm-on', !!tab?.hex);
  // Not possible for this file (a PDF has no editor, bytes neither preview): greyed out, as on the ribbon.
  $('.mm-switch-editor').disabled = !tab || notText(doc);
  $('.mm-switch-preview').disabled = !tab || !!doc?.binary;
  markTreeActive();
}

async function setMode(mode) {
  const pane = panes[state.activePane], tab = pane.active;
  if (!tab || tab.doc.pdf || tab.doc.binary) return;   // a PDF is only its preview, a file of bytes only Hex
  tab.hex = tab.hexChosen = false;   // a mode chosen: out of Hex (hexview.js)
  if (tab.mode === 'preview') tab.previewTop = pane.previewEl.scrollTop;
  // The preview opens: its cursor starts at the top of the view again (previewcursor.js).
  if (tab.mode === 'edit' && mode !== 'edit' && typeof resetPreviewCursor === 'function') resetPreviewCursor(tab);
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
  if (tab.hex) return hexSet(tab, false, part === 'editor' ? 'edit' : 'preview');   // out of Hex, to the part clicked
  const editor = tab.mode !== 'preview', preview = tab.mode !== 'edit';
  const [e, p] = part === 'editor' ? [!editor, preview || editor] : [editor || preview, !preview];
  setMode(e && p ? 'split' : e ? 'edit' : 'preview');
}

// ---------- Next document (nextDocument; no key by default) ----------
// Recently used order (the default) or tab bar order (Options > Settings > Document order). In recently
// used order, holding Ctrl and pressing its key again goes further back; letting go of Ctrl makes the
// document reached the most recent one.
const recentTabs = [];   // tab ids, most recently active first
let tabWalk = null;      // { list, at } while Ctrl is held

function noteActive(tab) {
  if (tabWalk) return;
  if (typeof recordActive === 'function') recordActive(tab);   // a macro being recorded: show "name" (macros.js)
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
  if (typeof tellBookmarksPanes === 'function') tellBookmarksPanes();   // their lines move with the text (bookmarkspane.js)
  if (typeof colsDoc === 'function' && colsDoc() !== colsPane.doc) tellColumnsPane();   // another document (columnspane.js)
  if (typeof tellSortPane === 'function') tellSortPane();   // what is sorted follows the selection (sort.js)
  const pane = panes[state.activePane], tab = pane.active, doc = tab?.doc;
  const cm = tab && !tab.hex && pane.cm && pane.el.dataset.mode !== 'preview' ? pane.cm : null;
  let pos = tab?.hex ? hexStatus(pane) : '';
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
  const cell = csvStatus(pane, cm);   // a CSV: the row and column (csvview.js)
  statusUi.pos.textContent = cell ? (pos ? pos + ' - ' : '') + cell : pos;
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
  statusUi.eol.textContent = doc && !doc.pdf && !doc.binary ? (doc.mixed ? 'Mixed' : EOL_NAMES[doc.eol]) : '';   // a PDF, bytes: no line ends
  statusUi.eol.title = doc?.mixed ? `Line ends: mixed; saved as ${EOL_NAMES[doc.eol]} (click: choose)` : 'Line ends (click: choose)';
  // The line end each editor shows (showLineEnds): its own document's.
  for (const p of panes) if (p.cm && p.active) p.cm.getWrapperElement().dataset.eol = { '\r\n': 'crlf', '\n': 'lf', '\r': 'cr' }[p.active.doc.eol];
  // In a block of another language (a fence, lines you gave a language): that one too, "Markdown -> KQL (Kusto)". A
  // click still changes the file's language.
  const inner = cm && doc && typeof lineLanguage === 'function' ? lineLanguage(cm, cm.getCursor().line) : null;
  const innerShown = inner && inner !== languageOf(doc) && packs[inner] ? packs[inner].name : null;
  statusUi.lang.textContent = doc?.binary ? 'Bytes' : doc ? languageTitle(doc) + (innerShown ? ' -> ' + innerShown : '') : '';
  statusUi.lang.title = innerShown ? `Language: ${languageTitle(doc)}, the cursor in a block of ${innerShown} (click: choose another for the file)`
    : doc?.binary ? 'Not text: shown as its bytes (Hex)' : doc?.pdf ? `${languageTitle(doc)}: not text, so its language stays` : 'Language (click: choose another)';
  statusUi.lang.classList.toggle('mm-fixed', !!doc?.pdf || !!doc?.binary);   // a kind that is not text: dimmed (app.css), no list
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
statusUi.eol.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
statusUi.eol.addEventListener('click', () => showLineEndList());

// history.js; the Search pane's page has its own copy of the lists for its fields.
events.findHistory = m => { onFindHistory(m); toSearch({ kind: 'history', lists: findHistory }); };
events.clipboards = ({ state }) => {
  Object.assign(clips, state);
  updateStatus();
  if (clipsPane.frame || clipsPane.floating) clipsPane.send(clipsState());
};

// ---------- The Clipboards pane (docs/plans/executed/PLAN-docking.md stage 12) ----------
// LexPen's clipboards (the Windows clipboard and 1 to 9) with the start of their text, the active one marked; a click
// makes one active. A page of its own (clipboards.html) docked in the window's dock areas or floating; hidden at
// first, docked at the right by its action. The popup list (clipboardList) stays.
function clipsState() {
  return { kind: 'clips', active: clips.active, items: Array.from({ length: 10 }, (_, n) => ({ n, name: n === 0 ? 'Windows clipboard' : `Clipboard ${n}`,
    text: String(clips.previews?.[n] ?? ''), block: !!clips.columns?.[n] })) };
}
const clipsPane = paneChannel({ id: 'clips', page: 'clipboards.html', title: 'Clipboards', view: () => $('.mm-clips-view'),
  state: () => new Map([['look', paneLook()], ['title', { kind: 'title', text: 'Clipboards' }], ['clips', clipsState()]]),
  receive: m => {
    if (m.kind === 'escape') return events.toolEscape();
    if (m.kind === 'select') return host('clipSelect', { n: m.n });   // every window hears it (events.clipboards)
  },
  onFloat: () => { setDockFloating('clips', true); saveSession(); },   // saveSession: clipsOpen
  // Back in its view: docked (moved onto the window); its window closed by hand: it stays floating.
  onDock: () => { if (clipsPane.toDock) { clipsPane.toDock = false; setDockFloating('clips', false); } saveSession(); } });

// Its action: as it was last (floating: its window; else docked), with the clipboards as they are now.
async function openClipboardsPane() {
  Object.assign(clips, await host('clipState'));
  if (dockModel().state.clips === 'floating') clipsPane.float();
  else showDockPane('clips');
  clipsPane.send(clipsState());
}

function showChord(stroke) {
  statusUi.chord.textContent = stroke ? stroke + ', ...' : '';
}

statusUi.ins.addEventListener('click', () => runAction('overwrite.toggle', [], { from: 'bar' }));
statusUi.col.addEventListener('mousedown', e => e.preventDefault());   // the focus stays in the editor
statusUi.col.addEventListener('click', () => setColumnMode(false));
// The Windows clipboard changed (here or in another program): also its start in the Clipboards pane, when that shows.
events.clipboardColumn = ({ column: marked }) => {
  clips.windowsColumn = marked;
  if (clipsPane.frame || clipsPane.floating)
    host('clipState').then(s => { Object.assign(clips, s); clipsPane.send(clipsState()); }).catch(() => {});
};
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
    if (!restoring && tab.doc.path) rememberAt(tab);
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

  if (!restoring && old.path) rememberAt(tab);
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
  // Hex: a file LexPen does not know always; another file only when Hex was chosen for this tab (hexview.js hexSet).
  tab.hex = !!doc.binary || !!tab.hexChosen;
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
      const answer = docText(doc).trim() ? await host('askSave', { text: `Save draft ${docName(doc)}?` }) : 'no';
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
  // The focus was in the closed tab's editor or preview and fell to the page (the Ctrl tap and the keys then had no
  // part to act on): to what the pane shows now, else to the other pane's document.
  if (document.activeElement === document.body) {
    const to = pane.active ? pane : panes.find(p => p.active && p.el.offsetParent);
    if (to) focusPane(to);
  }
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
  const active = activeDoc(), doc = makeDoc({ draft: id });
  // Its language (Settings > Files): the active document's, or the one given (also without an active document).
  const language = setting('newFileLanguageFrom') === 'active' && active ? languageOf(active) : setting('newFileLanguage');
  if (packs[language] && language !== 'markdown') Object.assign(doc, { language, languageChosen: true, languageByDefault: true });
  const pane = panes[state.activePane];
  const tab = makeTab(doc, openMode(doc) === 'preview' ? 'split' : openMode(doc));   // a new file is for typing
  insertTab(pane, tab);
  await activate(pane, tab);
  pane.cm?.focus();
}

function writeDraft(doc) {
  clearTimeout(doc.draftTimer);
  doc.draftTimer = 0;
  if (doc.draft) return host('draftWrite', { draft: doc.draft, text: diskText(doc) });   // its line ends kept along
}
const flushDrafts = () => Promise.all([...docs].filter(d => d.draftTimer).map(writeDraft));

// The name Save as offers a draft: its name as given (Rename draft), with the first extension of its language when
// the name has none; a name with an extension of its own keeps it.
function draftSaveName(doc) {
  const name = doc.draftName || doc.draft;
  if (/\.[^.]+$/.test(name)) return name;
  const ext = packOf(doc)?.extensions?.[0];
  return ext ? name + (ext.startsWith('.') ? ext : '.' + ext) : name;
}

// Returns false when nothing was saved (dialog cancelled, or the file is edited elsewhere).
async function saveDoc(doc, saveAs) {
  if (doc.binary) return hexSave(doc, saveAs);   // its bytes as they are (hexview.js)
  if (doc.pdf) {   // a PDF: written only with its highlights, when they are kept inside it (pdfhighlights.js)
    if (!doc.dirty) { toast('Nothing to save: LexPen writes a PDF only for its highlights kept inside it.', true); return true; }
    return pdfSave(doc);
  }
  let path = doc.path;
  const was = { path: doc.path, draft: doc.draft };   // the ruler's lines move to the new name (ruler.js)
  if (!path || saveAs) {
    path = await host('pickSave', {
      name: path ? nameOf(path) : draftSaveName(doc),
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
    doc.draft = doc.draftName = null;
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
    if (!doc.languageChosen || doc.languageByDefault) doc.language = codeLang(path, docText(doc));   // saved as another file type
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
  doc.savedEol = doc.eol;
  doc.mixed = doc.savedMixed = false;
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
  if (doc.pdf) {   // a PDF: drawn again from the file (pdfview.js); nothing to keep, it is never edited
    doc.disk = kind === 'removed' ? 'removed' : 'ok';
    if (kind !== 'removed') pdfChanged(doc);
    if (doc.hexData) { doc.hexData = null; await hexRedraw(doc); }   // shown in Hex: read again
    for (const pane of panes) updateBar(pane);
    return refreshTabs();
  }
  if (doc.binary) {   // bytes (hexview.js): read again when nothing is unsaved, else asked as a text file is
    doc.disk = kind === 'removed' ? 'removed' : doc.dirty ? 'changed' : 'ok';
    if (kind !== 'removed' && !doc.dirty) await hexReload(doc).catch(() => {});
    for (const pane of panes) updateBar(pane);
    return refreshTabs();
  }
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
    removed: [['close', 'Close'], ['save', 'Save it again'], ...(doc.binary ? [] : [['draft', 'Keep as draft']])],   // bytes: no draft
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
  if (action === 'reload' && doc.binary) await hexReload(doc);
  else if (action === 'reload') {
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
// The tree is the Folder pane's page (folder.html, folder-pane.js; docs/plans/executed/PLAN-docking.md 3.3): it shows the
// rows and keeps the open folders, the cursor and the scroll; this page lists a folder for it (listItems), keeps the
// window's folder and acts on what is done there (fromFolder). treeOpen and treeTop: what it reported, for the session.
let treeOpen = [], treeTop = 0;
// Files that changed while the window was not active (lower case), highlighted until opened.
const freshPaths = new Set();

// Folders first, then files; each by name, modified time, extension or size (folders have none: by name).
function treeSort() {
  return ['name', 'modified', 'extension', 'size'].includes(setting('sort')) ? setting('sort') : 'name';
}
function sortItems(items) {
  const desc = setting('sortDesc') ? -1 : 1;
  const byName = (a, b) => { const x = a.name.toLowerCase(), y = b.name.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; };
  const ext = i => { const at = i.name.lastIndexOf('.'); return at > 0 ? i.name.slice(at + 1).toLowerCase() : ''; };
  const key = {
    name: byName,
    modified: (a, b) => a.modified - b.modified || byName(a, b),
    extension: (a, b) => (a.dir ? 0 : ext(a) < ext(b) ? -1 : ext(a) > ext(b) ? 1 : 0) || byName(a, b),
    size: (a, b) => (a.dir ? 0 : (a.size ?? 0) - (b.size ?? 0)) || byName(a, b),
  }[treeSort()];
  return items.sort((a, b) => b.dir - a.dir || desc * key(a, b));
}

// A folder's entries for the Folder pane, with their marks. Backup files (name.ext.bak) only with the setting
// showBackupFiles; highlights next to a file (name.ext.lph, highlights.js) never: the file gets a mark instead. A file
// with a backup next to it: a dot before its name (plan 33). A CSV with its definition next to it (name.csv-metadata.json,
// plan 29): a mark before its name, the metadata file not listed; one whose CSV is not there is listed.
async function listItems(path) {
  const listed = await host('list', { path, hidden: !!setting('treeHidden') });
  const withHighlights = new Set(listed.filter(i => !i.dir && /\.lph$/i.test(i.name)).map(i => i.name.slice(0, -4).toLowerCase()));
  const withBackups = new Set(listed.filter(i => !i.dir && /\.bak$/i.test(i.name)).map(i => i.name.slice(0, -4).toLowerCase()));
  const withColumns = new Set(listed.filter(i => !i.dir && /-metadata\.json$/i.test(i.name)).map(i => i.name.slice(0, -14).toLowerCase()));
  const names = new Set(listed.filter(i => !i.dir).map(i => i.name.toLowerCase()));
  const besideItsCsv = i => /-metadata\.json$/i.test(i.name) && names.has(i.name.slice(0, -14).toLowerCase());
  const items = listed.filter(i => i.dir || (!/\.lph$/i.test(i.name) && !besideItsCsv(i) && (setting('showBackupFiles') || !/\.bak$/i.test(i.name))));
  return [...sortItems(items), ...deletedIn(path, items)].map(item => ({
    path: item.path, name: item.name, dir: !!item.dir, gone: !!item.gone, other: !item.dir && !knownFile(item.name), size: item.size,
    backup: !item.dir && !item.gone && withBackups.has(item.name.toLowerCase()),
    highlights: !item.dir && withHighlights.has(item.name.toLowerCase()), git: gitStatusOf(item) || null,
    columns: !item.dir && !item.gone && withColumns.has(item.name.toLowerCase()),
  }));
}

// The Folder pane reads its folder again, its open folders and scroll position staying put.
// `withGit`: also ask git again (false: the status was just loaded).
async function refreshTree(withGit = true) {
  if (!state.root) return;
  if (withGit) await loadGit(state.root);
  toFolder({ kind: 'refresh' });
  sendFolderMarks();
}

// The folder that holds this one; null at a drive or share root.
function parentOf(path) {
  const trimmed = path.replace(/\\$/, ''), cut = trimmed.lastIndexOf('\\');
  if (cut < 0) return null;
  const parent = trimmed.slice(0, cut);
  if (/^\\\\[^\\]*$/.test(parent)) return null;   // \\server: no folder above a share
  return /^[a-z]:$/i.test(parent) ? parent + '\\' : parent;
}

// Opens the folder above as the tree's root, with the folder we came from open and selected.
async function goUp() {
  const from = state.root, parent = parentOf(from || '');
  if (!parent) return;
  await openFolder(parent, [from], { cursor: from });
}

// ---------- Folder pane keyboard ----------
// The tree takes the focus (click a row, or Ctrl+Shift+E); its keys work in its page (folder-pane.js).
// The keys go to the pane's file: the editor, or the preview (arrows scroll it).
// The editor or the preview, as the tab had it last (both are shown in split; the editor at first).
function focusPane(pane) {
  if (pane.active?.hex && pane.hexEl) return pane.hexEl.focus();
  const mode = pane.el.dataset.mode, part = pane.active?.focusPart;
  if (pane.cm && mode !== 'preview' && (mode !== 'split' || part !== 'preview')) pane.cm.focus(); else pane.previewEl.focus();
}

// The clicked Save button hides itself once saved, which would leave the focus nowhere: back to the file.
function refocus() {
  const el = document.activeElement;
  if (el === document.body || el?.matches('.mm-save')) focusPane(panes[state.activePane]);
}

// ---------- The focused part: a border around it; Ctrl+Shift+F1, Shift+F1 and focusPane ----------
// Where the keyboard is: the sidebar (Folder or Search), or a document pane's editor, preview or outline (.mm-focused).
// A border lies over that part (.mm-focus-ring, one for the window, above the parts: the editor's gutter and scroll bar
// would cover a border of its own), placed again when the part moves or changes size. With the focus elsewhere (the
// tabs, the find bar, a menu, a dialog, another window) it stays on the part last used, dimmed (body[data-focus-away]):
// what Ctrl+Shift+F1, Shift+F1 and focusPane start from.
let focused = null;   // { pane: its index, or -1 for the sidebar; part: sidebar, editor, preview or outline }
const focusRing = Object.assign(document.createElement('div'), { className: 'mm-focus-ring', hidden: true });
document.body.append(focusRing);
const focusRingWatch = new ResizeObserver(() => placeFocusRing());

// While a tool pane has the focus (docked, its outline, or a floating pane's window: paneWindowFocus), the active
// document keeps a dimmed frame of its own and its cursors shown, steady (docs/plans/executed/PLAN-docking.md 3.11): so it is
// clear where Characters inserts and whose highlights are listed. Its selection keeps the colour without the focus.
const docRing = Object.assign(document.createElement('div'), { className: 'mm-focus-ring mm-doc-ring', hidden: true });
document.body.append(docRing);
let paneWindowActive = false;   // a floating pane's window of this window has the focus
const docPartEl = pane => pane.active?.mode === 'preview' || pane.lastPart === 'preview' && pane.active?.mode !== 'edit' ? pane.previewEl : pane.editorEl;

function placeFocusRing() {
  const el = focused && partEl(focused), r = el?.getBoundingClientRect();
  focusRing.hidden = !r || !r.width || !r.height;
  if (!focusRing.hidden) Object.assign(focusRing.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  const pane = panes[state.activePane], inTool = paneWindowActive || !!focused && !['editor', 'preview'].includes(focused.part);
  const d = inTool && pane?.active ? docPartEl(pane).getBoundingClientRect() : null;
  docRing.hidden = !d || !d.width || !d.height;
  if (!docRing.hidden) Object.assign(docRing.style, { left: d.left + 'px', top: d.top + 'px', width: d.width + 'px', height: d.height + 'px' });
  for (const p of panes) p.el.toggleAttribute('data-keep-cursor', inTool && p === pane);
}
addEventListener('resize', () => placeFocusRing());

function partAt(target) {
  if (!(target instanceof Element)) return null;
  // A tool pane: in the window's dock areas or at an editor pane (its own dock areas).
  if (target.closest('.mm-dock .mm-dock-group')) return { pane: -1, part: 'dock', el: target.closest('.mm-dock-group') };
  const pane = panes.find(p => p.el.contains(target));
  if (!pane) return null;
  if (pane.editorEl.contains(target)) return { pane: pane.index, part: 'editor' };
  if (pane.previewEl.contains(target)) return { pane: pane.index, part: 'preview' };
  if (pane.outlineNav.contains(target)) return { pane: pane.index, part: 'outline' };
  return null;
}
const partEl = p => p.pane < 0 ? p.el : panes[p.pane][{ editor: 'editorEl', preview: 'previewEl' }[p.part]] ?? panes[p.pane].outlineNav;

function markFocused(p) {
  for (const el of document.querySelectorAll('.mm-focused')) el.classList.remove('mm-focused');
  focused = p;
  const el = partEl(p);
  el.classList.add('mm-focused');
  if (p.pane >= 0) panes[p.pane].lastPart = p.part;
  focusRingWatch.disconnect();
  focusRingWatch.observe(el);
  placeFocusRing();
}
document.addEventListener('focusin', e => {
  const p = partAt(e.target);
  document.body.toggleAttribute('data-focus-away', !p);
  if (p) markFocused(p);
});
addEventListener('blur', () => document.body.toggleAttribute('data-focus-away', true));
addEventListener('focus', () => {
  const p = partAt(document.activeElement);
  document.body.toggleAttribute('data-focus-away', !p);
  if (p) markFocused(p);
});

// The parts of a document pane Ctrl+Shift+F1 goes through: the editor, the preview and the outline, each when shown (a part
// not shown is passed, not opened).
const outlineShown = pane => !pane.el.hasAttribute('data-no-outline');

// Ctrl+Shift+F1: the next part (-1: the previous) of the active document pane: editor, preview, outline (when shown).
function nextPart(dir) {
  const pane = panes[state.activePane], tab = pane.active;
  if (!tab) return;
  const parts = [...(tab.mode !== 'preview' ? ['editor'] : []), ...(tab.mode !== 'edit' ? ['preview'] : []), ...(outlineShown(pane) ? ['outline'] : [])];
  const now = focused?.pane === pane.index ? focused.part : pane.lastPart ?? (tab.mode === 'preview' ? 'preview' : 'editor');
  focusPart(pane, parts[(Math.max(0, parts.indexOf(now)) + dir + parts.length) % parts.length]);
}

// The focus into a part of a document pane; a part not shown: the editor or the preview, whichever is.
function focusPart(pane, part) {
  const tab = pane.active;
  if (!tab) return;
  if (pane.index !== state.activePane) setActivePane(pane.index);
  if (part === 'outline' && !outlineShown(pane)) part = tab.mode === 'preview' ? 'preview' : 'editor';
  if (part === 'editor' && tab.mode === 'preview' || part === 'preview' && tab.mode === 'edit') part = tab.mode === 'preview' ? 'preview' : 'editor';
  if (part === 'outline') return focusOutline(pane);
  tab.focusPart = part;
  if (part === 'editor') pane.cm?.focus(); else pane.previewEl.focus();
}

// focusPane (no key by default): the next pane (-1: the previous): the sidebar (when shown), document pane 1, document pane 2 (when
// shown); in a document pane the part it had last.
function nextPane(dir) {
  const dockPane = dockFocusPane();   // docks.js: the pane in front of the first open dock group
  const order = [...(dockPane ? [-1] : []), ...panes.filter(p => !p.el.hidden && p.active).map(p => p.index)];
  if (!order.length) return;
  const now = focused?.pane ?? state.activePane;
  const next = order[(Math.max(0, order.indexOf(now)) + dir + order.length) % order.length];
  if (next < 0) return dockPanes.get(dockPane).focus();
  focusPart(panes[next], panes[next].lastPart ?? (panes[next].active.mode === 'preview' ? 'preview' : 'editor'));
}

// Shift+F1: the keyboard to the other document pane (when shown), in the part it had last.
function otherDocPane() {
  const pane = panes[1 - state.activePane];
  if (pane.el.hidden || !pane.active) return;
  focusPart(pane, pane.lastPart ?? (pane.active.mode === 'preview' ? 'preview' : 'editor'));
}

// ---------- The outline with the keyboard ----------
// Its keys work in its page (outline-pane.js): Up / Down, PgUp / PgDn, Ctrl+Home / Ctrl+End, Enter. Here: the focus
// into it (Ctrl+Shift+F1), its entry at the cursor marked for the keys.
function focusOutline(pane) {
  outlineFrame(pane).focus();
  toOutline(pane, { kind: 'focus' });
}

function focusTree() {
  showFolderView();
  focusFolder();
}

// The Folder pane in view: the sidebar on its Folder view; floating, its window of its own is where it is.
function showFolderView() {
  showDockPane('folder');   // docks.js: floating, nothing
}

// The marks of the Folder pane: the active document's row, the files that changed while the window was not active.
function sendFolderMarks() {
  toFolder({ kind: 'marks', active: activeTab()?.doc.path ?? null, fresh: [...freshPaths] });
}
const markTreeActive = () => sendFolderMarks();
const markFresh = () => sendFolderMarks();

function unfresh(path) {
  if (freshPaths.delete(path.toLowerCase())) markFresh();
}

// The file's row in the folder pane: the pane is opened, the folders on the way to the file are opened,
// the row is selected, scrolled to and lights up. A file outside the open folder: its folder is opened.
async function showInTree(path) {
  if (!path) return;
  showFolderView();
  const inside = root => root && path.toLowerCase().startsWith(root.replace(/\\$/, '').toLowerCase() + '\\');
  if (!inside(state.root)) await openFolder(dirOf(path));
  if (document.body.dataset.tree === 'known' && !knownFile(path)) {
    setKnownOnly(false);   // the filter would hide it
    toast('The folder pane shows all files again (not only known file types), so the file can be shown.', true);
  }
  folderPane.focus();
  toFolder({ kind: 'reveal', path });
}

// A file from the tree (and the search results): shown in the current tab of the pane (when it is already open there:
// that tab). Ctrl: the other pane, the active pane staying the one it was (so a next Ctrl+click goes to that other pane
// again, as the dimmed frame shows); Shift: a new tab. A draft, a changed file or a pinned tab is never replaced (a new
// tab instead).
async function openFromTree(path, { ctrlKey, shiftKey }) {
  const was = state.activePane, pane = ctrlKey ? otherPane() : panes[was], tab = pane.active;
  quietSwitch = !!ctrlKey;
  try {
    const result = shiftKey || !tab || tab.pinned || tab.doc.draft || tab.doc.dirty || pane.tabs.some(t => samePath(t.doc.path, path))
      ? await openFile(path, { pane }) : await navigate(tab, path);
    if (ctrlKey) setActivePane(was);
    return result;
  } finally { quietSwitch = false; }
}
// `open`: the folders to open again (a restored session: the tree as it was); `cursor`: the row selected; `top`: the
// scroll position.
async function openFolder(path, open = [], { cursor = null, top = 0 } = {}) {
  treeOpen = open.filter(dir => typeof dir === 'string');
  treeTop = top;
  git = new Map();   // no colours of the previous folder meanwhile
  state.root = path;
  loadGitLater(path);
  noteOpened('folders', path);
  sendFolderHead();
  toFolder({ kind: 'root', root: path, parent: parentOf(path), open: treeOpen, top, cursor });
  sendFolderMarks();
  syncWatch();
  saveSession();
}

function showSort() {
  sendFolderHead();
}

// The Folder pane's head: the folder's name, the sort, the filters (known file types, hidden ones), the sizes shown.
function folderHead() {
  return { kind: 'head', title: state.root ? nameOf(state.root) || state.root : 'No folder open',
    sort: treeSort(), desc: !!setting('sortDesc'), known: document.body.dataset.tree === 'known',
    hidden: !!setting('treeHidden'), size: !!setting('treeSize') };
}
function sendFolderHead() {
  toFolder(folderHead());
}

// ---------- The Folder pane's page (docs/plans/executed/PLAN-docking.md 3.3, 3.5) ----------
// In a frame in its view in a dock area (docks.js), or floating in a window of its own (panechannel.js).
const folderPane = paneChannel({ id: 'folder', page: 'folder.html', title: 'Folder', view: () => $('.mm-folder-view'),
  state: () => folderPaneState(), receive: (m, from) => fromFolder(m, from),
  onFloat: () => setDockFloating('folder', true), onDock: () => setDockFloating('folder', false) });
const toFolder = msg => folderPane.send(msg);

// What it shows, for a page that starts showing it.
function folderPaneState() {
  const name = state.root ? nameOf(state.root) || state.root : '';
  return new Map([['look', paneLook()], ['title', { kind: 'title', text: `Folder: ${name}` }],
    ['head', folderHead()],
    ...(state.root ? [['root', { kind: 'root', root: state.root, parent: parentOf(state.root), open: treeOpen, top: treeTop, cursor: null }]] : []),
    ['marks', { kind: 'marks', active: activeTab()?.doc.path ?? null, fresh: [...freshPaths] }]]);
}

function focusFolder() {
  if (folderPane.focus()) toFolder({ kind: 'focus' });
}

// From the Folder pane's page: its frame, or (`from` 'float') its window of its own.
async function fromFolder(m, from) {
  switch (m.kind) {
    case 'list': return toFolder({ kind: 'listed', id: m.id, items: await listItems(m.path).catch(() => []) });
    case 'state': treeOpen = m.open; treeTop = m.top; return saveSession();
    case 'open':
      await openFromTree(m.path, m);
      if (m.keep) focusFolder();   // Enter: keep walking the tree
      return;
    case 'up': return goUp();
    case 'rename':
      await renameFile(m.path, m.folder);
      return focusFolder();
    case 'escape':   // its menu open (docked: here, the focus still in the folder): that closes first, the focus staying
      if (!ui.treeMenu.hidden) { closeMenus(); return hideMenus(); }   // with its Copy name items, when open
      return focusPane(panes[state.activePane]);
    case 'sort': keepLayout('sort', m.value); sendFolderHead(); return refreshTree();   // the head: its View menu's check
    case 'cmd': return commands[m.name]?.();
    case 'drag': draggedPathIsImage = IMAGE_FILE.test(m.path); return;
    case 'dragStart': return startFolderDrag(m.path);
    case 'dragMove': return folderDragFrom(m);
    case 'dragEnd': return folderDragFrom(m, m.drop);
    case 'notListed': return toast(`${nameOf(m.path)} is not listed in the folder pane.`);
    case 'menu': {
      folderMenuSubject = true;
      contextAt = null;
      host('cursorAt').then(at => contextAt = at).catch(() => {});   // the right-click's place (Delete... asks near it)
      if (!folderPane.floating) {
        const r = folderPane.frame.getBoundingClientRect();
        return openTreeMenu(m, r.left + m.x, r.top + m.y);
      }
      // Floating: the menu is drawn by its page, its items as the window's menu has them now.
      openTreeMenu(m, 0, 0, false);
      ui.treeMenu.hidden = true;
      if (m.dir || m.base) await host('hasBackups', { path: m.path }).then(has => { ui.treeMenu.querySelector('[data-cmd=treeDeleteBackups]').hidden = !has || m.up || m.gone; }).catch(() => {});
      return folderPane.menuThere(ui.treeMenu, m.x, m.y);
    }
  }
}

// ---------- Drag and drop ----------
// Where a drag over this pane lands: with only one pane, its far half opens the second one.
function dropTarget(pane, e) {
  const types = e.dataTransfer.types;
  if (!types.includes(TAB_TYPE) && !types.includes(PATH_TYPE) && !types.includes('Files')) return null;
  return dropPaneAt(pane, e.clientX, e.clientY);
}
function dropPaneAt(pane, x, y) {
  if (!bothShown()) {
    const r = pane.el.getBoundingClientRect();
    const far = state.orient === 'v' ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
    if (far) return panes[1 - pane.index];   // the second pane, or the hidden one
  }
  return pane;
}

// A file dragged from the docked Folder pane (folder-pane.js: it starts there; the moves over its frame come from it,
// those over the rest of the window come here): the editor pane under it lights up as for a drop (its far half: the
// second pane); let go there, the file opens there. An image over a Markdown editor: a link at that point (as a drop,
// onEditorDrop), no pane marked. Esc: nothing opens.
let folderDrag = null;
function startFolderDrag(path) {
  endFolderDrag();
  const move = e => { if (e.buttons & 1) folderDragAt(e.clientX, e.clientY, false); else endFolderDrag(); };
  const up = e => { folderDragAt(e.clientX, e.clientY, true, e.shiftKey); endFolderDrag(); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endFolderDrag(); } };
  folderDrag = { path, off: () => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('keydown', key, true); } };
  addEventListener('pointermove', move, true);
  addEventListener('pointerup', up, true);
  addEventListener('keydown', key, true);
  document.body.style.cursor = 'copy';
}
function endFolderDrag() {
  if (!folderDrag) return;
  folderDrag.off();
  folderDrag = null;
  document.body.style.cursor = '';
  hideDrops();
  toFolder({ kind: 'dragDone' });
}
// From the Folder pane's page: a point in its frame.
function folderDragFrom(m, drop) {
  if (!folderDrag) return;
  if (drop === undefined) {
    const r = folderPane.frame.getBoundingClientRect();
    return folderDragAt(r.left + m.x, r.top + m.y, false);
  }
  if (drop) { const r = folderPane.frame.getBoundingClientRect(); folderDragAt(r.left + m.x, r.top + m.y, true, m.shift); }
  endFolderDrag();
}
function folderDragAt(x, y, drop, shift = false) {
  hideDrops();
  const path = folderDrag?.path;
  if (!path) return;
  const pane = panes.find(p => { const b = p.el.getBoundingClientRect(); return b.width && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; });
  if (!pane) return;
  const editor = pane.cm && document.elementFromPoint(x, y)?.closest('.CodeMirror');
  if (editor && IMAGE_FILE.test(path)) {
    if (!drop) return;
    pane.cm.focus();
    pane.cm.setCursor(pane.cm.coordsChar({ left: x, top: y }));
    return insertImages(pane, [], [path], shift);
  }
  const target = dropPaneAt(pane, x, y);
  if (drop) return openFile(path, { pane: target }).catch(e => toast(e.message));
  pane.dropEl.hidden = false;
  pane.dropEl.dataset.half = target === pane ? '' : state.orient;
}

function hideDrops() {
  for (const pane of panes) {
    pane.dropEl.hidden = true;
    for (const row of [pane.tabsEl, pane.pinnedEl]) row.classList.remove('mm-insert-end');
    for (const el of pane.stackEl.querySelectorAll('.mm-insert, .mm-insert-group')) el.classList.remove('mm-insert', 'mm-insert-group');
  }
}

// The tab being dragged inside this window, for dropping it between other tabs.
let draggedTab = null;

// Where a tab dropped lands in the pane's tab bar: before the first tab of the row it is over whose middle is right of x
// (with the tabs on several rows the row counts first: above a tab's row, or on it left of its middle); { index in
// pane.tabs, el to mark (none: the row's end), row, group: on the group of pinned tabs, pinned: what it becomes (null:
// as it is) }. Pinned tabs (setting pinnedTabs): on their own row or the group pinned, on the other row unpinned.
function stripAt(pane, e) {
  const mode = pinnedTabsMode(), x = e.clientX, y = e.clientY, afterPinned = pane.tabs.findLastIndex(t => t.pinned) + 1;
  const group = e.target.closest('.mm-tab-group');
  if (group) return { index: afterPinned, el: group, row: pane.tabsEl, group: true, pinned: true };
  const inPinned = !!e.target.closest('.mm-tabs-pinned'), row = inPinned ? pane.pinnedEl : pane.tabsEl;
  const els = [...row.querySelectorAll('.mm-tab[data-tab]')];
  const el = els.find(t => { const r = t.getBoundingClientRect(); return y < r.top || (y <= r.bottom && x < r.left + r.width / 2); }) ?? null;
  const tab = el && pane.tabs.find(t => t.id === +el.dataset.tab);
  const index = tab ? pane.tabs.indexOf(tab) : inPinned ? afterPinned : pane.tabs.length;
  return { index, el, row, group: false, pinned: mode === 'regular' ? null : mode === 'row' ? inPinned : false };
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
      if (!folderPane.floating) setSidebar(true);
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
    path: doc.path, draft: doc.draft, text: docText(doc), eol: doc.eol, savedEol: doc.savedEol, mixed: doc.mixed, savedMixed: doc.savedMixed, encoding: doc.encoding,
    dirty: whole && doc.dirty, draftChanged: doc.draftChanged, draftName: doc.draftName ?? null,
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
    doc.savedEol = p.savedEol ?? p.eol;
    doc.mixed = !!p.mixed;
    doc.savedMixed = !!p.savedMixed;
    doc.encoding = p.encoding;
    doc.savedText = p.dirty ? undefined : p.text;   // with unsaved edits the saved text is not known here
    if (p.bookmarks) {
      if (doc.marks) setMarks(doc, p.bookmarks); else doc.bmList = p.bookmarks;
    }
    doc.dirty = !!p.dirty;
    doc.draftChanged = !!p.draftChanged;
    if (p.draft) doc.draftName = p.draftName ?? null;
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
// The panel is the Search pane's page (search.html, search-pane.js; docs/plans/executed/PLAN-docking.md 3.3): it has the
// fields, switches and results; this page searches, replaces and keeps what they show (searchPage). searchUi and
// replaceUi (searchreplace.js) stand for its fields here: what is set on them goes to its page.
const searchPage = { values: { find: '', with: '' }, scope: 'selection', status: '', replace: false, html: '' };
const searchField = name => ({
  get value() { return searchPage.values[name]; },
  set value(v) { searchPage.values[name] = v; toSearch({ kind: 'text', key: 'text:' + name, field: name, value: v }); },
  focus() { if (searchPane.focus()) toSearch({ kind: 'focus', field: name }); },
  select() { toSearch({ kind: 'focus', field: name, select: true }); },
});
const searchUi = {
  input: searchField('find'),
  scope: { get value() { return searchPage.scope; }, set value(v) { searchPage.scope = v; toSearch({ kind: 'scope', value: v }); } },
  status: { get textContent() { return searchPage.status; }, set textContent(v) { searchPage.status = v; toSearch({ kind: 'status', text: v }); } },
};
const searchOptions = { case: false, word: false, regex: false, known: false };   // known: known file types only
let searchRun = 0, searchHits = [];
let searchGroups = [];   // the results: per file { path, draft, matches, skip }; a match replaced has done: { old, new }
let lastSearch = null;   // the search the results are of: { text, options, scope, source, regex }

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

// The replacement as typed, with its codes read (docs/plans/executed/PLAN-find-bar-replace.md 3.4): ^p a line break, ^t a
// tab, ^^ a caret; other ^ codes stay as typed. With a regular expression \n and \t instead ($1, $& are the
// replace's own). A line break is \n: the editor has one line end, the file's, which every line gets on save.
function replacementText(text, regex) {
  if (regex) return text.replace(/\\([nt\\])/g, (_, c) => c === 'n' ? '\n' : c === 't' ? '\t' : '\\');
  return text.replace(/\^([pt^])/gi, (_, c) => ({ p: '\n', t: '\t', '^': '^' })[c.toLowerCase()]);
}

// The ? window of the find bar (and the Search panel): every code (SEARCH_CODE_HELP, palette.js) below `anchor`.
// Esc or a click outside closes it; the focus goes back to `back`.
function showSearchCodes(anchor, back) {
  document.querySelector('.mm-codes')?.remove();
  const el = document.createElement('div');
  el.className = 'mm-codes';
  el.tabIndex = -1;
  el.innerHTML = SEARCH_CODE_HELP.map(([group, codes]) => `<div class="mm-codes-group">${escapeHtml(group)}</div>` +
    codes.map(([code, what, example]) => `<div class="mm-codes-row"><code>${escapeHtml(code)}</code><span>${escapeHtml(what)}` +
      `<small>${escapeHtml(example)}</small></span></div>`).join('')).join('');
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  el.style.left = Math.max(4, Math.min(r.right - el.offsetWidth, innerWidth - el.offsetWidth - 4)) + 'px';
  el.style.top = Math.min(r.bottom + 2, innerHeight - el.offsetHeight - 4) + 'px';
  const close = () => {
    el.remove();
    removeEventListener('mousedown', outside, true);
    back?.focus();
  };
  const outside = e => { if (!el.contains(e.target)) close(); };
  addEventListener('mousedown', outside, true);
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  el.focus();
}

// Matches in a text, with lines and columns as CodeMirror counts them; s / e: where in the text. parts: only within
// these [start, end] of the text (In selection, searchreplace.js).
function searchText(text, regex, parts = [[0, text.length]]) {
  const starts = [0];
  for (let i = 0; i < text.length; i++)
    if (text[i] === '\n' || (text[i] === '\r' && text[i + 1] !== '\n')) starts.push(i + 1);
  const at = index => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1; }
    return { line: lo, col: index - starts[lo] };
  };
  const matches = [];
  for (const [start, stop] of parts) for (const m of text.slice(start, stop).matchAll(regex)) {
    if (!m[0].length) continue;
    const s = start + m.index, e = s + m[0].length, from = at(s), to = at(e);
    const end = from.line + 1 < starts.length ? starts[from.line + 1] : text.length;
    matches.push({ s, e, line: from.line, col: from.col, endLine: to.line, endCol: to.col,
      text: text.slice(starts[from.line], end).replace(/[\r\n]+$/, '') });
    if (matches.length >= 2000) return matches;
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
  const knownOnly = !!searchOptions.known;   // the Known switch (Find references sets it)
  const folder = scope === 'folder' ? searchFolder() : null;
  if (scope === 'folder' && !folder) return searchUi.status.textContent = 'No folder: open a folder or a file first.';

  // In selection (searchreplace.js): the active editor's selection, marked; the one there was while it is the same.
  const within = scope === 'selection' ? await takeSearchScope() : clearSearchScope();
  if (scope === 'selection' && !within) return searchUi.status.textContent = 'Nothing selected: select the text to search in first.';
  lastSearch = { text, options: { ...searchOptions }, scope, source, regex };

  // Open documents are searched here, so unsaved edits count.
  let docsHere = scope === 'selection' ? [within.doc] : scope === 'file' ? [activeDoc()].filter(Boolean) : [...docs];
  if (folder) docsHere = docsHere.filter(d => d.path && d.path.toLowerCase().startsWith(folder.toLowerCase().replace(/\\$/, '') + '\\') &&
    (!knownOnly || knownFile(d.path)));
  // A PDF: its pages' texts (pdffind.js), read-only (no Replace).
  const groups = [];
  for (const doc of docsHere) {
    const matches = doc.pdf ? await pdfSearchMatches(doc, regex)
      : within ? searchText(docText(doc), regex, scopeRanges(within)) : searchText(docText(doc), regex);
    if (matches.length) groups.push({ path: doc.path, draft: doc.draft, matches, ...(doc.pdf && { skip: 'a PDF is read-only', pdf: true }) });
  }
  if (run !== searchRun) return;   // a newer search started meanwhile (a PDF read)
  let truncated = false;
  if (folder) {
    // While it runs the floating Search panel stays with this window (plan 22; panechannel.js), its bar says so.
    holdPane('search', 'searching');
    try {
      const found = await host('search', { root: folder, pattern: source, ignoreCase: !searchOptions.case,
        extensions: knownOnly ? Object.keys(packExtensions) : null,
        skip: docsHere.map(d => d.path) });
      groups.push(...found.files);
      truncated = found.truncated;
    } catch (e) {
      if (run === searchRun) searchUi.status.textContent = e.message;
      return;
    } finally {
      if (run === searchRun) holdPane('search');   // a newer search lets go when it is done
    }
  }
  if (run !== searchRun) return;   // a newer search started meanwhile
  groups.sort((a, b) => (a.path || '').toLowerCase() < (b.path || '').toLowerCase() ? -1 : 1);
  showSearchResults(groups, truncated, folder);
}

function showSearchResults(groups, truncated, folder) {
  searchGroups = groups;
  const total = groups.reduce((n, g) => n + g.matches.length, 0);
  searchUi.status.textContent = !total ? 'No matches.' :
    `${total} match${total === 1 ? '' : 'es'} in ${groups.length} file${groups.length === 1 ? '' : 's'}` +
    (truncated ? ' (stopped at 2000)' : '') + (folder ? ` - ${folder}` : '') +
    (lastSearch?.scope === 'selection' ? ' (in the selection)' : '');
  searchAt = null;   // F3 starts again from the cursor (plan 47)
  drawSearchResults();
  if (total) f3Take('search');   // a search run: F3 goes through its results
}

// The results as searchGroups has them now. A replaced match (searchreplace.js) shows its old text crossed out and the
// new text; a file skipped (read-only) says why. With the replace row shown: a Replace button per file and per match.
function drawSearchResults() {
  searchHits = [];
  const parts = [], rep = '<button class="mm-result-rep" title="Replace">Replace</button>';
  for (const [g, group] of searchGroups.entries()) {
    const head = document.createElement('div');
    head.className = 'mm-result-file';
    head.dataset.group = g;
    head.title = (group.path || `Draft ${group.draft}`) + (group.skip ? ` - skipped: ${group.skip}` : '');
    const live = group.matches.filter(m => !m.done).length;
    head.innerHTML = `<span class="mm-result-name">${escapeHtml(group.path ? nameOf(group.path) : findDraft(group.draft)?.draftName || group.draft)}</span>` +
      `<span class="mm-result-dir">${escapeHtml(group.path && !samePath(dirOf(group.path), state.root) ? relativePath(dirOf(group.path)) : '')}</span>` +
      `<span class="mm-result-count">${live}</span>` + (live && !group.skip ? rep : '');
    const list = document.createElement('div');
    list.className = 'mm-result-list';
    for (const m of group.matches) {
      const row = document.createElement('div');
      row.className = 'mm-result' + (m.done ? ' mm-done' : '') + (group.skip && !group.pdf ? ' mm-skip' : '');   // a PDF: read-only, not a warning
      row.dataset.hit = searchHits.push({ ...m, path: group.path, draft: group.draft, group: g }) - 1;
      const end = m.endLine === m.line ? m.endCol : m.text.length;
      // Long lines: start a little before the match.
      const from = Math.max(0, m.col - 30);
      const found = m.done ? `<del>${escapeHtml(m.done.old)}</del><ins>${escapeHtml(m.done.new)}</ins>` : `<mark>${escapeHtml(m.text.slice(m.col, end))}</mark>`;
      row.innerHTML = `<span class="mm-result-line">${m.page ? 'p. ' + m.page : m.line + 1}</span><span class="mm-result-text">` +
        (from ? '...' : '') + escapeHtml(m.text.slice(from, m.col)) + found + escapeHtml(m.text.slice(end, end + 200)) + '</span>' +
        (m.done || group.skip ? '' : rep);
      list.append(row);
    }
    parts.push(head, list);
  }
  const box = document.createElement('div');
  box.append(...parts);
  searchPage.html = box.innerHTML;
  toSearch({ kind: 'results', html: searchPage.html });
  if (searchAt != null) toSearch({ kind: 'current', hit: searchAt, quiet: true });   // still marked (plan 47)
  showF3();
}

// A match clicked in the results: there in the window, selected (and in the preview's view): in the pane's tab of its
// file, else a new one. `here` (Alt+click): in the active tab instead, as a link is followed (back returns to its line),
// unless that tab is pinned or its document has unsaved changes. Ctrl+click and Shift+click as in the Folder pane
// (openFromTree): the other pane, a new tab.
async function goToSearchHit(hit, here, { ctrlKey, shiftKey } = {}) {
  if (hit.page) {   // a PDF's: shown there as the find bar shows a match (pdffind.js)
    const pdf = await openFile(hit.path);
    if (pdf?.pdf) pdfSend(pdf, { kind: 'findShow', page: hit.page, from: hit.s, to: hit.e });
    return;
  }
  let tab, how = 'found';
  const active = activeTab();
  if (here && !hit.draft && active?.doc.path && !active.pinned && !samePath(active.doc.path, hit.path) && !active.doc.dirty && !active.doc.pdf) {
    const cm = paneOf(active).cm, at = cm?.getCursor();
    remember(active, active.doc.path, true);
    const step = navHistory.back.at(-1);
    if (at && step?.tab === active.id) step.cursor = { line: at.line, ch: at.ch };   // back: this line again (go)
    if (!await navigate(active, hit.path)) return;
    tab = paneOf(active).active;
    how = 'quiet';   // the way back is the step above, not where this file's cursor was
  } else if (!hit.draft && (ctrlKey || shiftKey)) {
    const pane = ctrlKey ? otherPane() : panes[state.activePane], was = pane.active, wasDoc = was?.doc;
    await openFromTree(hit.path, { ctrlKey, shiftKey });
    tab = pane.active;
    if (!tab || !samePath(tab.doc.path, hit.path)) return;
    if (tab === was && tab.doc !== wasDoc) how = 'quiet';   // the tab showed another file: back is the step kept
  } else if (hit.draft) {
    const doc = findDraft(hit.draft);
    if (!doc) return toast('That draft is closed.');
    tab = tabsOf(doc).find(t => paneOf(t).index === state.activePane) ?? tabsOf(doc)[0];
    await activate(paneOf(tab), tab);
  } else tab = await openFile(hit.path);
  const pane = paneOf(tab);
  if (tab.mode !== 'edit') setPreviewLine(pane, Math.max(0, hit.line - 3));
  if (tab.mode !== 'preview' && pane.cm) {
    pane.placed = tab.mode === 'split';
    asFound(pane, () => pane.cm.setSelection({ line: hit.line, ch: hit.col }, { line: hit.endLine, ch: hit.endCol }), how);   // places.js
    revealFound(pane.cm, { line: hit.line, ch: 0 }, { line: hit.endLine, ch: hit.endCol });
  }
}

// ---------- F3: the search used last (docs/plans/executed/PLAN-f3-follows-the-last-search.md) ----------
// F3 and Shift+F3 go to the find bar ('find') or the Search pane ('search'): the one used last (typed in, run, a match or
// result chosen, its F3 tag clicked). The Search pane only with results; with the find bar closed and results there,
// the Search pane. Each shows an F3 tag, lit on the one F3 goes to. A press going to the other one than the press
// before flashes that one once. searchAt: the result chosen last (clicked or stepped to), an index of searchHits.
const f3 = { holder: 'find', last: null };
let searchAt = null;
const searchSteppable = () => searchHits.some(h => !h.done);
function f3Target() {
  if (!searchSteppable()) return 'find';
  const bar = panes[state.activePane]?.find;
  return f3.holder === 'search' || !bar || bar.el.hidden ? 'search' : 'find';
}
function f3Take(holder) {
  f3.holder = holder;
  showF3();
}
function showF3() {
  const to = f3Target();
  for (const p of panes) p.find?.el.querySelector('.mm-find-f3')?.classList.toggle('mm-on', to === 'find');
  toSearch({ kind: 'f3', on: to === 'search', shown: searchSteppable() });
}
function f3Step(dir) {
  const to = f3Target();
  if (f3.last && f3.last !== to) {   // F3 went elsewhere the press before: this one flashes once
    if (to === 'search') searchPane.send({ kind: 'flash', once: true });
    else {
      const el = panes[state.activePane]?.find?.el;
      el?.classList.remove('mm-find-flash');
      void el?.offsetWidth;
      el?.classList.add('mm-find-flash');
      setTimeout(() => el?.classList.remove('mm-find-flash'), 400);
    }
  }
  f3.last = to;
  if (to === 'search') return searchStep(dir);
  return findKey(dir > 0 ? 'next' : 'prev');
}

// The next or previous result: after the one chosen last; none chosen yet, from the cursor in the active file when that
// file has results, else the first (the last). Replaced ones are passed. At the end: as the find bar (findWrap).
async function searchStep(dir) {
  const live = searchHits.map((h, i) => [h, i]).filter(([h]) => !h.done);
  if (!live.length) return;
  let k;
  if (searchAt != null) k = dir > 0 ? live.findIndex(([, i]) => i > searchAt) : live.findLastIndex(([, i]) => i < searchAt);
  else {
    const tab = activeTab(), doc = tab?.doc, at = tab && !doc.pdf ? paneOf(tab).cm?.getCursor() : null;
    const mine = ([h]) => doc && (h.path ? samePath(h.path, doc.path) : h.draft === doc.draft);
    const after = ([h]) => h.line > at.line || h.line === at.line && h.col >= at.ch;
    if (at && live.some(mine)) k = dir > 0 ? live.findIndex(x => mine(x) && after(x)) : live.findLastIndex(x => mine(x) && !after(x));
    else k = dir > 0 ? 0 : live.length - 1;
  }
  if (k < 0) {
    if ((setting('findWrap') || 'end') === 'end') return toast(dir > 0 ? 'No more results below.' : 'No more results above.', true);
    k = dir > 0 ? 0 : live.length - 1;
  }
  const [hit, i] = live[k];
  searchAt = i;
  toSearch({ kind: 'current', hit: i });
  await goToSearchHit(hit);
}

// ---------- The Search pane's page (docs/plans/executed/PLAN-docking.md 3.3, 3.5) ----------
// In a frame in its view in a dock area (docks.js), or floating in a window of its own (panechannel.js).
const searchPane = paneChannel({ id: 'search', page: 'search.html', title: 'Search', view: () => $('.mm-search-view'),
  state: () => searchPaneState(), receive: m => fromSearch(m),
  onFloat: () => setDockFloating('search', true), onDock: () => setDockFloating('search', false) });
const toSearch = msg => searchPane.send(msg);

// A tool docked (Characters: chars, the window's; chars:0, chars:1, an editor pane's own; Highlights: hls, hls:0,
// hls:1): its frame with its page, made the first time it is shown. Its name tells the host which tool it is and where
// it works (ToolFrame.cs).
function toolFrame(id) {
  const d = dockPanes.get(id);
  let frame = d.view.querySelector('iframe');
  if (!frame) {
    frame = Object.assign(document.createElement('iframe'), { className: 'mm-pane-frame', title: d.title, name: 'tool:' + id });
    frame.src = PANE_ORIGIN + '/' + d.page;
    d.view.append(frame);
  }
  return frame;
}
const charsFrame = (id = 'chars') => toolFrame(id);

// A tool of a window or of LexPen (Settings, ...): its page docked in a frame in the window's dock areas (not at an
// editor pane), or floating in its window of its own (`open` / `close` to the host); floating the first time, and a
// new window does not open that one of its own accord.
function registerToolPane(id, title, page, open, close) {
  const view = Object.assign(document.createElement('div'), { className: 'mm-tool-view' });
  $('.mm-dock-hold').append(view);
  registerDockPane(id, { title, page, view, home: 'right', startState: 'floating', floatsOnCall: true,
    focus: () => toolFrame(id).focus(),
    sync: () => { if (dockShown(dockModel(), id)) toolFrame(id); },
    channel: { get floating() { return dockModel().state[id] === 'floating'; },
      float: () => { setDockFloating(id, true); host(open); },
      back: () => { host(close); setDockFloating(id, false); } } });
}

// A tool opened from its menu item, as it was last (docs/plans/executed/PLAN-docking.md 3.7a): the active editor pane's own
// when it has one (not closed); else the window's: its window of its own (`open` to the host), or docked in this
// window (shown, its area opened). The editor pane whose own it is, null: the window's docked, undefined: floating.
function openToolPane(kind, open, args = {}) {
  const own = `${kind}:${state.activePane}`;
  if (dockPanes.has(own) && !dockHidden(dockModel(), own)) {
    showDockPane(own);   // docks.js
    toolFrame(own);
    return state.activePane;
  }
  if (dockModel().state[kind] === 'floating') { host(open, args); return undefined; }
  showDockPane(kind);
  toolFrame(kind);
  return null;
}
// The host asks for a tool as it was last (Manage theme sets from the Settings page, ...).
events.openToolPane = ({ kind, open }) => openToolPane(kind, open);
// A docked tool's Esc (its page's close): the keys back to the document.
events.toolEscape = ({ pane } = {}) => {
  const to = panes[pane ?? state.activePane];
  setActivePane(to.index);   // an editor pane's own: that pane, also when the other was active
  focusPane(to);
};

// The panes of the dock areas (docks.js), registered at the start (once this file has run: their definitions use what
// it defines further on).
function registerDockPanes() {
  // The panes of the dock areas (docks.js): Folder and Search, tabbed in the left area by default.
  registerDockPane('folder', { title: 'Folder', view: $('.mm-folder-view'), channel: folderPane, focus: () => focusFolder() });
  registerDockPane('search', { title: 'Search', view: $('.mm-search-view'), channel: searchPane, focus: () => searchUi.input.focus() });
  // Each editor pane's outline: at a side of its own editor pane (at the right by default); on or off as its own
  // setting (outline, outline2), no tab and no room for a document of a language without an outline. Floating it is
  // the window's floating outline (floatOutline), which serves the active document.
  for (const pane of panes) registerDockPane(`outline:${pane.index}`, { title: 'Outline', view: pane.outlineNav, scope: 'pane', pane: pane.index,
    home: `${pane.index}.right`, hidden: () => !outlineOn(pane), setHidden: on => setSetting(outlineKey(pane), !on),
    available: () => hasOutline(pane.active?.doc), focus: () => focusOutline(pane), kind: 'outline',
    // Moved to the window's place: the window's outline serves its document there, its own goes.
    // Moved to the other editor pane: that pane's own shows, this one goes.
    leave: (m, other) => { if (other === 'outline:w') winOutlineWish = { pane }; setSetting(outlineKey(pane), false); },
    channel: { floating: false, float: opts => floatOutline(pane, opts), back() {} } });
  // Characters and Highlights (7b): its own page (charpicker.html, highlights.html) docked in a frame named tool:<id>
  // (it asks the host itself: ToolFrame.cs), working on this window; or floating in its own window (CharPickerForm,
  // HighlightsForm: one for LexPen, working on the window last worked in). Floating the first time (3.4a); opened from
  // its menu item in its last state (3.7a: openToolPane). Moved to an editor pane it is that pane's own (chars:0,
  // hls:1, ...), working on that pane's document; one moved away from its editor pane is the window's again.
  for (const [kind, title, page, open, close] of [['chars', 'Characters', 'charpicker.html', 'openCharPicker', 'closeCharPicker'],
    ['hls', 'Highlights', 'highlights.html', 'openHighlights', 'closeHighlights']]) {
    const view = () => { const v = Object.assign(document.createElement('div'), { className: 'mm-tool-view' }); $('.mm-dock-hold').append(v); return v; };
    registerDockPane(kind, { title, page, view: kind === 'chars' ? $('.mm-chars-view') : view(), home: 'right', startState: 'floating', kind, floatsOnCall: true,
      focus: () => toolFrame(kind).focus(),
      leave: m => { if (m.state[kind] === 'floating') host(close); m.state[kind] = 'hidden'; },
      sync: () => { if (dockShown(dockModel(), kind)) toolFrame(kind); },
      channel: { get floating() { return dockModel().state[kind] === 'floating'; },
        float: () => { setDockFloating(kind, true); host(open, { code: null }); },
        back: () => { host(close); setDockFloating(kind, false); } } });
    for (const pane of panes) {
      const id = `${kind}:${pane.index}`;
      registerDockPane(id, { title, page, view: view(), scope: 'pane', pane: pane.index, home: `${pane.index}.right`, startHidden: true, kind,
        focus: () => toolFrame(id).focus(),
        leave: m => { m.state[id] = 'hidden'; },
        sync: () => { if (dockShown(dockModel(), id)) toolFrame(id); },
        // Floating: the window's (one for LexPen, working on the window last worked in); this one goes.
        channel: { floating: false, back() {}, float: () => {
          const m = dockModel();
          m.state[id] = 'hidden';
          m.state[kind] = 'floating';
          saveDocks(m);
          host(open, { code: null });
        } } });
    }
  }
  // Settings (7b): the window's (its "this window" rows and the global ones), docked in its dock areas (not at an
  // editor pane) or floating in its window of its own (SettingsForm, one per window); floating the first time.
  registerToolPane('settings', 'Settings', 'settings.html', 'openSettings', 'closeSettings');
  // Manage projects (7b): LexPen's, docked in a window's dock areas or floating in its window (ProjectsForm).
  registerToolPane('projects', 'Manage projects', 'projects.html', 'openProjects', 'closeProjects');
  // The Macros window (7b; macros.js): LexPen's, a page of its own (macros.html) docked in the window's dock areas or
  // floating in a window of its own; floating the first time; not reopened by a new window of its own accord.
  registerDockPane('macros', { title: 'Macros', view: $('.mm-macros-view'), home: 'right', startState: 'floating', floatsOnCall: true,
    focus: () => macrosPane.focus(),
    sync: () => { if (dockShown(dockModel(), 'macros') && !macrosPane.frame) macrosPane.send(macroWindowState()); },
    channel: { get floating() { return macrosPane.floating; }, float: opts => macrosPane.float(opts),
      back: () => { macroWindow.back = true; macrosPane.back(); } } });
  // Messages (stage 11): the window's, a page of its own docked in its dock areas or floating; floating the first
  // time; not reopened by a new window of its own accord.
  registerDockPane('messages', { title: 'Messages', view: $('.mm-messages-view'), home: 'right', startState: 'floating', floatsOnCall: true,
    focus: () => messagesPane.focus(),
    sync: () => { if (dockShown(dockModel(), 'messages') && !messagesPane.frame) messagesPane.send(messagesState()); },
    channel: { get floating() { return messagesPane.floating; }, float: opts => messagesPane.float(opts),
      back: () => { messagesPane.toDock = true; messagesPane.back(); } } });
  // F1, Keyboard shortcuts and commands (palette.js): a page of its own, floating the first time, docked or floating
  // after that as it was left; not reopened at the start (its window closed by hand, it stays floating).
  registerDockPane('commands', { title: 'Commands', view: $('.mm-commands-view'), home: 'right', startState: 'floating', floatsOnCall: true,
    focus: () => commandsChannel().focus(),
    sync: () => { if (dockShown(dockModel(), 'commands') && !commandsChannel().frame) commandsChannel().send(renderPalette()); },
    channel: { get floating() { return commandsChannel().floating; }, float: opts => commandsChannel().float(opts),
      back: () => { commandsChannel().toDock = true; commandsChannel().back(); } } });
  // Clipboards (stage 12): LexPen's, docked in the window's dock areas or floating; hidden at first. Floating, its window
  // opens by its action, and at the start when it was open as the window closed (sessionData: clipsOpen).
  registerDockPane('clips', { title: 'Clipboards', view: $('.mm-clips-view'), home: 'right', startHidden: true, floatsOnCall: true,
    focus: () => clipsPane.focus(),
    sync: () => { if (dockShown(dockModel(), 'clips') && !clipsPane.frame) clipsPane.send(clipsState()); },
    channel: { get floating() { return clipsPane.floating; }, float: opts => clipsPane.float(opts),
      back: () => { clipsPane.toDock = true; clipsPane.back(); } } });
  // Step by step (stage 13; macros.js): at the bottom of the macro's editor pane, or the window's.
  registerStepPanes();
  // Bookmarks (stage 10; bookmarkspane.js): the window's (the active document) and each editor pane's own.
  registerBookmarksPanes();
  // Columns (plan 29; columnspane.js): how the active document is read as CSV.
  registerColumnsPane();
  // Sort (plan 3; sort.js): the sort at hand and the stored sorts, for the active document.
  registerSortPane();
  // Manage theme sets (7b): LexPen's, as Manage projects (ThemeSetsForm).
  registerToolPane('themesets', 'Theme sets', 'themesets.html', 'openThemeSetsWindow', 'closeThemeSets');
  // The window's outline: in one of the window's dock areas (at the right, the first time it is docked) or floating;
  // hidden at first. Moved to an editor pane it is that pane's own (outline:0, outline:1).
  registerDockPane('outline:w', { title: 'Outline', view: winOutlineNav, kind: 'outline', home: 'right', startHidden: true, hostId: FLOATING_OUTLINE,
    focus: () => { winOutlineFrame?.focus(); if (winOutline) toFloating({ kind: 'focus' }); },
    leave: m => { m.state['outline:w'] = 'hidden'; },
    sync: () => syncWinOutline(),
    channel: { get floating() { return !!winOutline && !winOutline.docked; },
      float: ({ atCursor = false } = {}) => { winOutlineWish = { atCursor }; setDockFloating('outline:w', true); },
      back: () => setDockFloating('outline:w', false) } });
}

function searchPaneState() {
  return new Map([['look', paneLook()], ['title', { kind: 'title', text: 'Search' }],
    ['text:find', { kind: 'text', key: 'text:find', field: 'find', value: searchPage.values.find }],
    ['text:with', { kind: 'text', key: 'text:with', field: 'with', value: searchPage.values.with }],
    ['options', { kind: 'options', options: { ...searchOptions } }], ['scope', { kind: 'scope', value: searchPage.scope }],
    ['replace', { kind: 'replace', on: searchPage.replace }], ['status', { kind: 'status', text: searchPage.status }],
    ['results', { kind: 'results', html: searchPage.html }], ['history', { kind: 'history', lists: findHistory }], ['f3', { kind: 'f3', on: f3Target() === 'search', shown: searchSteppable() }]]);
}

// From the Search pane's page.
function fromSearch(m) {
  switch (m.kind) {
    case 'input': searchPage.values[m.field] = m.value; return;
    case 'run': return runSearch();
    case 'options':   // a switch, or an entry of the history with its switches
      Object.assign(searchOptions, m.options);
      return m.run && runSearch();
    case 'scope': searchPage.scope = m.value; keepLayout('searchScope', m.value); return runSearch();
    case 'goto':   // a result clicked: F3 goes on from it (plan 47)
      if (!searchHits[m.hit]) return;
      searchAt = m.hit;
      f3Take('search');
      return goToSearchHit(searchHits[m.hit], m.here, m);
    case 'f3': return f3Take('search');   // its F3 tag clicked
    case 'step': f3Take('search'); return searchStep(m.dir);   // its Previous / Next
    case 'replaceFile': return replaceFile(m.group);   // searchreplace.js
    case 'replaceMatch': return searchHits[m.hit] && replaceMatch(searchHits[m.hit]);
    case 'replaceAll': return replaceAllResults();
    case 'preview': return replaceGroups(searchGroups.filter(g => !g.skip), true, 'Replace all');
    case 'toggleReplace':
      showReplace(replaceUi.row.hidden);
      return (replaceUi.row.hidden ? searchUi.input : replaceUi.with).focus();
    case 'codes': {   // the ? window, drawn here below its button (floating: at the top of this window)
      const r = searchPane.floating ? { left: 8, right: 320, top: 40, bottom: 40 } : searchPane.frame.getBoundingClientRect();
      const at = searchPane.floating ? r : { left: r.left + m.left, right: r.left + m.right, top: r.top + m.top, bottom: r.top + m.bottom };
      return showSearchCodes({ getBoundingClientRect: () => at }, replaceUi.with);
    }
    case 'clearHistory': return host('findHistoryClear', { kind: m.which }).catch(() => {});
    case 'escape': return escapeSearch();
  }
}

// Esc in the search (unless a find bar is open: that closes first): the sidebar as before the search, back to the file.
function escapeSearch() {
  const finding = panes.find(p => p.find && !p.find.el.hidden);   // closed first, the focus staying in the search
  if (finding) return closeFind(panes[state.activePane].find?.el.hidden === false ? panes[state.activePane] : finding, false);
  const back = searchReturn;
  searchReturn = null;
  clearSearchScope();   // searchreplace.js: the selection's marks go
  if (!searchPane.floating) dockRestore('search', back);   // docks.js: its area as before the search
  focusPane(panes[state.activePane]);
}

// The Folder or the Search pane in front of its group (docks.js); its area as it is.
function setSideView(view) {
  activateDockPane(view);
}

// Ctrl+Shift+F: the search, filled with the editor's selection when that is one line.
let searchReturn = null;   // the Search pane's area as it was before the search opened: Esc goes back to it
function startSearch() {
  if (!dockPaneVisible('search')) searchReturn = dockSnapshot('search');   // docks.js
  showDockPane('search');   // floating: its window is where it is
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
// ---------- Fonts (Options > Settings: Editor view > Font and colours, App) ----------
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
  lookToPanes();   // the panes' pages: the same fonts
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

// Each editor pane's outline at its right is on or off for that pane alone (its button in the tab strip, or
// outline.toggle on the active pane), kept in the layout: `outline` for the first pane, `outline2` for the second.
const outlineKey = pane => pane.index ? 'outline2' : 'outline';
const outlineOn = pane => !!setting(outlineKey(pane));
const toggleOutline = pane => setSetting(outlineKey(pane), !outlineOn(pane));

// The window's outline (outline:w; docs/plans/executed/PLAN-docking.md 3.9): docked in one of the window's dock areas (a frame in its
// view, winOutlineNav) or floating (a window of its own, PaneForm.cs); null: neither. { pane: the editor pane whose
// document it serves, docked, queue: what waits until its page is ready, runs: its floating menu's items }. It serves
// the active document when that pane has no outline of its own; else it keeps showing the last one it served. Where it
// is: the docks' state of outline:w (docks.js); syncWinOutline makes it so.
let winOutline = null;
const winOutlineNav = Object.assign(document.createElement('nav'), { className: 'mm-outline' });
let winOutlineFrame = null, winOutlineReady = false, winOutlineClosing = false;
let winOutlineWish = null;   // { pane: to serve, atCursor: its floating window at the cursor }, for the next sync
let outlineWantedSent = null;   // reportOutlineWanted (7.3)
const outlineServed = pane => outlineOn(pane) || winOutline?.pane === pane;

// A pane's outline turned on or off, or the floating one moved: every pane shows what it serves now.
function applyOutlines() {
  for (const pane of panes) {
    if (typeof setupGutter === 'function') setupGutter(pane);   // the outline's column in the gutter, or not
    pane.outlineFor = null;
    showOutline(pane);
  }
  renderDocks();   // docks.js: an editor pane's outline in its area, or not
  reportOutlineWanted();
}

function showOutline(pane) {
  const doc = pane.active?.doc;
  if (winOutline && winOutline.pane !== pane && pane.index === state.activePane && !outlineOn(pane)) {
    const was = winOutline.pane;   // the window's outline takes the active document
    winOutline.pane = pane;
    pane.outlineFor = null;
    if (typeof setupGutter === 'function') { setupGutter(was); setupGutter(pane); }
  }
  const has = hasOutline(doc);
  pane.el.querySelector('.mm-pane-outline').disabled = !has;   // a language without an outline: greyed out
  pane.el.toggleAttribute('data-outline-on', outlineOn(pane));
  pane.el.toggleAttribute('data-no-outline', !(outlineOn(pane) && has));
  const place = `${outlineOn(pane)},${has}`;   // its dock area shows it or not (docks.js: its tab, its room)
  if (place !== pane.outlinePlace) { pane.outlinePlace = place; if (typeof renderDocks === 'function' && dockPanes.size) renderDocks(); }
  if (!outlineServed(pane)) return;
  if (!has) {
    // A pane's own column is hidden; the window's one stays open, empty (it may serve another document next).
    pane.outlineFor = null;
    pane.outlineRows = [];
    if (winOutline?.pane === pane) {
      toFloating(outlineTitle(pane));
      toFloating({ kind: 'rows', rows: [] });
    }
    return;
  }
  const headings = outlineOf(doc) ?? [];
  if (pane.outlineFor === doc && pane.outlineVersion === doc.version) return markOutline(pane);
  pane.outlineFor = doc;
  pane.outlineVersion = doc.version;
  // Groups (a pack's tag groups): a header per group with entries, or all together in line order (outlineMerged);
  // a bullet in the group's colour (outlineBullets). The rows go to the outline's page (outline-pane.js).
  const groups = headings.groups, merged = !groups || setting('outlineMerged'), bullets = groups && setting('outlineBullets') !== false;
  const folded = outlineFolded(doc);
  const item = h => {
    const level = merged ? h.mergedLevel ?? h.level : h.level;   // indent: auto (languages.js)
    return { t: 'item', line: h.line, ch: h.ch ?? 0, level, pad: 8 + (level - 1) * 12 + (groups && !merged ? 10 : 0),
      group: h.group, text: h.text, title: groups ? `${h.text} (${groups[h.group].name})` : h.text,
      colour: bullets ? groups[h.group].colour : null, hidden: !merged && folded.has(groups[h.group].name) };
  };
  const rows = !headings.length ? [{ t: 'none', text: doc.pdf ? 'No bookmarks' : doc.language ? 'Nothing found' : 'No headings' }]
    : merged ? [...headings].sort((a, b) => a.line - b.line).map(item)
    : groups.flatMap((g, gi) => {
      const own = headings.filter(h => h.group === gi);
      if (!own.length) return [];                             // a group without entries is left out
      return [{ t: 'group', gi, label: `${g.name} (${own.length})`, folded: folded.has(g.name), colour: bullets ? g.colour : null }, ...own.map(item)];
    });
  pane.outlineRows = rows;
  pane.outlineCurrent = undefined;
  toOutline(pane, outlineTitle(pane));
  toOutline(pane, { kind: 'rows', rows });
  paintOutlineGutter(pane, headings);
  markOutline(pane);
}

// While the outline is open: every entry's bullet in the gutter on its line, in its group's colour (gutter.js
// adds the column).
function paintOutlineGutter(pane, headings) {
  const cm = pane.cm;
  if (!cm || typeof OUTLINE_GUTTER === 'undefined' || pane.active?.doc.pdf) return;   // a PDF has no editor of its own
  cm.clearGutter(OUTLINE_GUTTER);
  if (!outlineServed(pane)) return;
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
function toggleOutlineGroup(pane, gi, fold) {
  const doc = pane.active?.doc, name = outlineOf(doc)?.groups?.[gi]?.name, head = pane.outlineRows.find(r => r.t === 'group' && r.gi === gi);
  if (name === undefined || !head) return;
  fold ??= !head.folded;
  setOutlineFolded(doc, name, fold);
  head.folded = fold;
  for (const r of pane.outlineRows) if (r.t === 'item' && r.group === gi) r.hidden = fold;
  toOutline(pane, { kind: 'fold', gi, fold });
}

// The outline's right-click menu: its two settings, and floating in a window of its own or (`from` 'float': the
// floating one's menu) back at the editor pane it serves. `from` 'win': the window's outline docked in a dock area.
function outlineMenuItems(pane, from = 'frame') {
  return [
    { label: 'Groups together, by line', checked: !!setting('outlineMerged'), run: () => setSetting('outlineMerged', !setting('outlineMerged')) },
    { label: 'Bullet in the group\'s colour', checked: setting('outlineBullets') !== false, run: () => setSetting('outlineBullets', setting('outlineBullets') === false) },
    '-',
    from === 'float' ? { label: 'Back in the window', run: () => outlineBack() }
      : from === 'win' ? { label: 'Float in a window of its own', run: () => setDockFloating('outline:w', true) }
      : { label: 'Float in a window of its own', run: () => floatOutline(pane) },
  ];
}

let outlineTimer = 0;
function scheduleOutline() {
  clearTimeout(outlineTimer);
  outlineTimer = setTimeout(() => panes.forEach(showOutline), 300);
}

// The heading the pane is at: the last one at or above the cursor's line (the editor shown), else the top line of
// the preview.
function markOutline(pane) {
  if (!outlineServed(pane) || !pane.outlineRows.length) return;
  cancelAnimationFrame(pane.markFrame);
  pane.markFrame = requestAnimationFrame(() => {
    const tab = pane.active;
    if (!tab) return;
    const line = tab.doc.pdf ? pdfOutlineLine(tab) : tab.mode !== 'preview' && pane.cm ? pane.cm.getCursor().line : previewLine(pane);
    // The last entry at or above the line, of all groups (in groups the list is not in line order).
    let current = null;
    for (const r of pane.outlineRows)
      if (r.t === 'item' && r.line <= line + 0.5 && (!current || r.line >= current.line)) current = r;
    if (current?.hidden) toggleOutlineGroup(pane, current.group, false);   // in a folded group: the group opens
    const at = current?.line ?? null;
    if (at === pane.outlineCurrent) return;
    pane.outlineCurrent = at;
    toOutline(pane, { kind: 'current', line: at });
  });
}

// ---------- The outline's page (docs/plans/executed/PLAN-docking.md 3.3, 3.5) ----------
// Each editor pane's outline is a page of its own (outline.html) in a frame from the panes' site, so it runs in a
// process of its own; made the first time the outline shows. Until it says it is ready, the last message of each kind
// waits. Its theme and fonts are this page's (lookToPanes).
const PANE_ORIGIN = 'https://lexpen-panes.example';

function outlineFrame(pane) {
  if (pane.outlineFrame) return pane.outlineFrame;
  const frame = document.createElement('iframe');
  frame.className = 'mm-outline-frame';
  frame.title = 'Outline';
  frame.src = PANE_ORIGIN + '/outline.html?pane=' + pane.index;   // which pane's, for a look from outside (the tests)
  pane.outlineQueue = new Map();
  pane.outlineFrameReady = false;
  pane.outlineFrame = frame;
  pane.outlineNav.append(frame);
  return frame;
}

// To where the pane's outline is shown: its own (when on), and the window's (when that serves the pane).
function toOutline(pane, msg) {
  if (outlineOn(pane)) toDocked(pane, msg);
  if (winOutline?.pane === pane) toFloating(msg);
}
function toDocked(pane, msg) {
  outlineFrame(pane);
  if (pane.outlineQueue) return void pane.outlineQueue.set(msg.kind, msg);
  pane.outlineFrame.contentWindow.postMessage({ toPane: msg }, PANE_ORIGIN);
}
function toFloating(msg) {   // the window's outline: its frame in a dock area, or its window of its own (through the host)
  if (!winOutline.docked && !winOutline.owner) return;   // the floating outline serves another window now (7.3)
  if (winOutline.queue) return void winOutline.queue.set(msg.kind, msg);
  if (winOutline.docked) winOutlineFrame.contentWindow.postMessage({ toPane: msg }, PANE_ORIGIN);
  else host('paneSend', { pane: FLOATING_OUTLINE, msg });
}

const FLOATING_OUTLINE = 'outline';   // the floating outline's name for the host (its window's place is kept by it)
const outlineTitle = pane => ({ kind: 'title', text: `Outline: ${pane.active ? docName(pane.active.doc) : ''}` });

// What the outline shows, for a page that starts showing it.
function outlineState(pane) {
  return new Map([['look', paneLook()], ['title', outlineTitle(pane)], ['rows', { kind: 'rows', rows: pane.outlineRows }],
    ['current', { kind: 'current', line: pane.outlineCurrent ?? null }]]);
}

// An editor pane's outline floats (PaneForm.cs): its own goes and the window's outline floats and serves its document
// (`atCursor`: its window at the cursor, dropped outside the window).
function floatOutline(pane, { atCursor = false } = {}) {
  winOutlineWish = { pane, atCursor };
  setDockFloating('outline:w', true);   // docks.js; then syncWinOutline
  if (outlineOn(pane)) setSetting(outlineKey(pane), false);
  else applyOutlines();
}

// Back in the window (the floating one's menu): its window closes and the pane it served gets its own outline.
function outlineBack() {
  if (!winOutline) return;
  const pane = winOutline.pane;
  hideDockPane('outline:w');
  if (!outlineOn(pane)) setSetting(outlineKey(pane), true);
  else applyOutlines();
}

// The window's outline as the docks have it (docks.js, after each change): docked (its frame in its view, made once),
// floating (its window), or neither.
function syncWinOutline() {
  const m = dockModel(), st = m.state['outline:w'];
  const want = st === 'hidden' ? null : st === 'floating' ? 'float' : 'dock';
  const now = !winOutline ? null : winOutline.docked ? 'dock' : 'float';
  const wish = winOutlineWish;
  winOutlineWish = null;
  if (want === now) {
    if (wish?.pane && winOutline && winOutline.pane !== wish.pane) { winOutline.pane = wish.pane; applyOutlines(); }
    return;
  }
  const serves = wish?.pane ?? winOutline?.pane ?? panes[state.activePane];
  if (now === 'float' && winOutline.owner) {   // its window closes, or (7.3) moves on to another LexPen window
    winOutlineClosing = true;
    host('paneDock', { pane: FLOATING_OUTLINE }).then(r => { if (r !== 'closed') winOutlineClosing = false; });
  }
  winOutline = null;
  if (want === 'float') {
    // One for LexPen (7.3): a new window (its page says when it is ready), or the open one, now this window's.
    const mine = winOutline = { pane: serves, docked: false, owner: true, queue: new Map() };
    host('paneFloat', { pane: FLOATING_OUTLINE, page: 'outline.html', atCursor: !!wish?.atCursor })
      .then(r => { if (r !== 'created' && winOutline === mine) flushFloating(); });
  } else if (want === 'dock') {
    if (!winOutlineFrame) {
      winOutlineFrame = Object.assign(document.createElement('iframe'), { className: 'mm-outline-frame', title: 'Outline' });
      winOutlineFrame.src = PANE_ORIGIN + '/outline.html?pane=w';
      winOutlineNav.append(winOutlineFrame);
    }
    winOutline = { pane: serves, docked: true, queue: winOutlineReady ? null : new Map() };
    if (winOutlineReady) for (const msg of outlineState(serves).values()) toFloating(msg);
  }
  applyOutlines();
}

// Its window closed by hand (or by Back in the window, or moved into a dock area): the panes' own outlines stay as
// they are.
events.paneClosed = ({ pane: id }) => {
  if (paneChannels.has(id)) return void paneChannels.get(id).docked();   // back in its view (panechannel.js)
  if (id !== FLOATING_OUTLINE) return;
  if (winOutlineClosing) return void (winOutlineClosing = false);   // closed here (syncWinOutline)
  if (winOutline && !winOutline.docked) hideDockPane('outline:w');   // also when it served another window (7.3)
};

// The one floating outline for LexPen (3.9, 7.3; AppHost): this window now serves it (it was activated, or the window
// it served let it go), or another window does. What it shows is sent whole when this window takes it.
function flushFloating() {
  const waiting = new Map([...outlineState(winOutline.pane), ...(winOutline.queue ?? [])]);
  winOutline.queue = null;
  for (const msg of waiting.values()) toFloating(msg);
}
events.outlineServe = () => {
  if (!winOutline) return setDockFloating('outline:w', true);   // hidden here: floating now (syncWinOutline asks for it)
  if (winOutline.docked) return;
  winOutline.owner = true;
  applyOutlines();   // the active document, when its editor pane has no outline of its own
  flushFloating();
};
events.outlineRelease = () => { if (winOutline && !winOutline.docked) winOutline.owner = false; };
// Whether the floating outline may serve this window now: its own outline not docked in its dock areas, and its active
// editor pane without an outline of its own. Told to the host when it changes (outlineWantedSent: the last told).
function reportOutlineWanted() {
  if (typeof dockModel !== 'function' || !dockPanes.has('outline:w')) return;
  const st = dockModel().state['outline:w'], pane = panes[state.activePane];
  const wants = (st === 'hidden' || st === 'floating') && !!pane && !outlineOn(pane);
  if (wants === outlineWantedSent) return;
  outlineWantedSent = wants;
  host('outlineWanted', { wants });
}
// A floating panel that follows the focus (docs/plans/executed/PLAN-floating-panel-scope.md 3.2; panechannel.js) serves this
// window now, or another one. Characters and Highlights (windows of their own): floating here now (also when hidden
// here); the picker hears the character at this window's cursor.
events.paneServe = ({ pane: id }) => {
  if (id === 'chars' || id === 'hls') {
    if (dockModel().state[id] !== 'floating') setDockFloating(id, true);
    if (id === 'chars') updateStatus();   // tells the picker the character after the cursor (charpicker.js)
    return;
  }
  (paneChannels.get(id) ?? (id === 'commands' ? commandsChannel() : null))?.serve();   // palette.js: made on first use
};
events.paneRelease = ({ pane: id }) => paneChannels.get(id)?.release();
events.fromPane = ({ pane: id, msg }) => {
  if (paneChannels.has(id)) return void paneChannels.get(id).receive(msg, 'float');
  if (id === FLOATING_OUTLINE && winOutline && !winOutline.docked) fromOutline(winOutline.pane, msg, 'float');
};

// This page's theme colours, fonts and day / night, for the panes' pages.
function paneLook() {
  const root = document.documentElement;
  // With the editor's scroll bar width (on the body here): their scroll bars as wide (app.css).
  return { kind: 'look', css: `${root.style.cssText} --mm-overview-w: ${document.body.style.getPropertyValue('--mm-overview-w') || '20px'};`, theme: root.dataset.theme ?? null, mode: root.dataset.mode ?? null };
}
function lookToPanes() {
  for (const pane of panes) if (pane.outlineFrame) toDocked(pane, paneLook());
  if (winOutline) toFloating(paneLook());
  for (const ch of paneChannels.values()) if (ch.frame || ch.floating) ch.send(paneLook());
}

addEventListener('message', e => {
  if (e.origin !== PANE_ORIGIN || !e.data?.fromPane) return;
  if (winOutlineFrame && winOutlineFrame.contentWindow === e.source) {   // the window's outline, docked
    if (e.data.fromPane.kind === 'ready') winOutlineReady = true;
    return void (winOutline?.docked && fromOutline(winOutline.pane, e.data.fromPane, 'win'));
  }
  const pane = panes.find(p => p.outlineFrame && p.outlineFrame.contentWindow === e.source);
  if (pane) fromOutline(pane, e.data.fromPane, 'frame');
});

// From the outline's page: its frame, or (`from` 'float') its window of its own.
function fromOutline(pane, m, from) {
  switch (m.kind) {
    case 'ready': {
      // Everything it shows, every time: a frame loads again when its element moves in the page.
      if (from === 'float' || from === 'win') return flushFloating();
      pane.outlineFrameReady = true;
      const waiting = new Map([...outlineState(pane), ...(pane.outlineQueue ?? [])]);
      pane.outlineQueue = null;
      for (const msg of waiting.values()) toDocked(pane, msg);
      return;
    }
    case 'activate':   // a press in its page: as a press here, it closes the window's menus
      closeMenus();
      hideMenus();
      return setActivePane(pane.index);
    case 'click':
      if (pane.active?.doc.pdf) return pdfOutlineGo(pane.active, m);   // a PDF's bookmark: its place (pdfview.js)
      if (pane.sneakEnded) { pane.sneakEnded = false; return; }   // the release of a sneak preview
      return goToLine(pane, m.line, true, true);   // placed as a find; the cursor stays (a double-click moves it)
    case 'group': return toggleOutlineGroup(pane, m.gi);   // a group's header: fold or unfold
    case 'dblclick': {   // the cursor on the entry's own text in its line, in the editor
      if (!pane.cm || pane.active?.mode === 'preview') return;
      pane.cm.setCursor(m.line, Math.min(m.ch, pane.cm.getLine(m.line)?.length ?? 0));
      return pane.cm.focus();
    }
    case 'down': pane.sneakEnded = false; return pane.active?.doc.pdf ? undefined : startSneak(pane, m);   // a PDF: no sneak preview
    case 'move': return sneakTo(pane, m);
    case 'up': return endSneak(pane);
    case 'menu': {   // docked: shown here, over everything, at the place in the frame; floating: drawn by the pane itself
      const items = outlineMenuItems(pane, from);
      if (from === 'float') {
        winOutline.runs = items.map(i => i.run);
        return toFloating({ kind: 'menu', x: m.x, y: m.y, items: items.map((i, n) => i === '-' ? '-' : { label: i.label, checked: !!i.checked, id: n }) });
      }
      const r = (from === 'win' ? winOutlineFrame : pane.outlineFrame).getBoundingClientRect();
      return openContextMenu(items.map(i => i === '-' ? '-' : { ...i, plain: true }), r.left + m.x, r.top + m.y);
    }
    case 'menuPick': return winOutline?.runs?.[m.id]?.();
    case 'enter':   // placed as a find; the focus stays in the outline
      goToLine(pane, m.line, false, true);
      if (from === 'frame') pane.outlineFrame.focus();
      else if (from === 'win') winOutlineFrame.focus();
      return;
    case 'key':   // a key the outline does not use: this window's (keys.js), as if pressed here
      return document.dispatchEvent(new KeyboardEvent('keydown', { key: m.key, code: m.code, ctrlKey: m.ctrlKey,
        shiftKey: m.shiftKey, altKey: m.altKey, metaKey: m.metaKey, bubbles: true, cancelable: true }));
  }
}

// A place jumped to (a find, a search result, a compare difference, a bookmark, Go to line) into view, after the cursor
// went there. Settings: revealInView (stay: the view stays, unless the place is within revealLines of an edge;
// center), revealOutOfView (keep: revealLines from the edge it comes in at, the top going up, the bottom going down;
// center) and revealLines. Never so many lines that the place itself would fall out of view.
function revealFound(cm, from, to = from) {
  // Measured again after each scroll: a line not drawn yet has an estimated height (with wrapping, from its length),
  // and once the lines there are drawn the place can be lines away from where the estimate put it.
  let tall = false;
  for (let i = 0; i < 4; i++) {
    const info = cm.getScrollInfo(), view = info.clientHeight;
    const start = cm.charCoords(from, 'local'), top = start.top;
    tall = cm.charCoords(to, 'local').bottom - top > view;   // taller than the view: its start
    const bottom = tall ? start.bottom : cm.charCoords(to, 'local').bottom;
    const y = revealTop(info.top, view, top, bottom, cm.defaultTextHeight());
    if (y == null || Math.abs(Math.max(0, y) - info.top) < 1) break;
    cm.scrollTo(null, Math.max(0, y));
  }
  revealSideways(cm, from, tall ? from : to);   // up or down it is in view by now
}

// Sideways: the start of the place at least scrollMargin columns from the left and the right edge (sideMargin,
// virtual.js); the whole place in view when it fits within those margins, else from its start at the left margin.
// A place over several lines counts from its start. Without wrapping only.
function revealSideways(cm, from, to) {
  if (cm.getOption('lineWrapping')) return;
  const left = cm.charCoords(from, 'window').left;
  const right = from.line === to.line ? cm.charCoords(to, 'window').left : left;
  const span = visibleSpan(cm), margin = sideMargin(cm, span);
  if (right - left <= span.right - span.left - 2 * margin) revealX(cm, left, right);
  else cm.scrollTo(Math.max(0, cm.getScrollInfo().left + left - span.left - margin), null);
  // The cursor's own reveal for this move (drawVirtual, queued when the selection was set) would measure the cursor
  // before this scroll and pull the view back: this move's sideways scroll is this one (revealX skips while set).
  cm.state.mmFoundReveal = true;
  queueMicrotask(() => cm.state.mmFoundReveal = false);   // after the ones already queued
}

// The same for a place jumped to in the preview (a find, a highlight, the outline): the ranges from `first` to `last`.
// A line is the line height where the place starts, on screen: the computed one is without the preview zoom, the box
// with it.
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

// Where a place jumped to scrolls to, as the settings say (revealFound): the new top, or null when the view stays. All
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

// The tab bars of the dock areas at the setting dockTabIntensity (app.css --dock-*): above 100% the text further from
// its background and the backgrounds and lines further from the text (a dark theme: the text brighter, the rest
// darker); below, the text closer to its background. 100%: the theme's own (the variables unset). Again when the
// theme changes (applyLook).
const DOCK_TAB_HEAD_BG = 'color-mix(in srgb, var(--accent) 18%, var(--bg-bar))';
function applyDockTabs() {
  const percent = setting('dockTabIntensity'), root = document.documentElement.style;
  const vars = { '--dock-head-bg': [DOCK_TAB_HEAD_BG, 'var(--fg)'], '--dock-head-top': ['color-mix(in srgb, var(--accent) 60%, var(--border))', 'var(--fg)'],
    '--dock-head-line': ['var(--border)', 'var(--fg)'], '--dock-tab-on-bg': ['var(--bg)', 'var(--fg)'], '--dock-tab-on-line': ['var(--accent)', 'var(--fg)'],
    '--dock-tab-fg': ['color-mix(in srgb, var(--fg) 80%, var(--bg))', DOCK_TAB_HEAD_BG], '--dock-tab-on-fg': ['var(--fg)', 'var(--bg)'] };
  const texts = new Set(['--dock-tab-fg', '--dock-tab-on-fg']);
  for (const [name, [css, from]] of Object.entries(vars))
    if (!Number.isFinite(percent) || percent === 100 || percent < 100 && !texts.has(name)) root.removeProperty(name);
    else root.setProperty(name, atIntensity(css, percent, document.body, from));
}

// A colour (any CSS, theme variables too) moved along the line from the background (or `from`) through it: 0% the
// background, 100% the colour, beyond further away (each channel clamped, up to 200%), as an rgb() for a CSS variable.
function atIntensity(css, percent, where = document.body, from = 'var(--bg)') {
  const probe = document.createElement('div');
  where.append(probe);   // the colours and background of `where` (the preview may have a theme of its own)
  const rgb = value => {
    probe.style.color = '';
    probe.style.color = value;
    const s = getComputedStyle(probe).color, n = s.match(/[\d.]+/g).slice(0, 3).map(Number);
    return s.startsWith('color(') ? n.map(c => c * 255) : n;   // a color-mix(): color(srgb r g b), 0 to 1
  };
  const colour = rgb(css), bg = rgb(from);
  probe.remove();
  const k = (Number.isFinite(percent) ? Math.min(200, Math.max(0, percent)) : 100) / 100;
  return `rgb(${colour.map((c, i) => Math.round(Math.min(255, Math.max(0, bg[i] + (c - bg[i]) * k)))).join(', ')})`;
}

// Puts the source line at the top of the pane: preview, editor or both. The cursor stays where it is (a click in
// the outline; a double-click moves it). `focus`: the editor gets the keys again.
// `found` (a click in the outline): placed as a place jumped to is, by the settings of Editor > Jump to a line
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
// entry under the pointer as it moves along the outline); on release it goes back to where it was. The outline's
// page (outline-pane.js) sends the press, the moves and the release: `item` is { line, text } of the entry.
const SNEAK_DELAY = 400;
function startSneak(pane, item) {
  if (item.line == null || item.button !== 0) return;
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
  if (!pane.sneak || item?.line == null || item.line === pane.sneak.line) return;
  pane.sneak.line = item.line;
  toOutline(pane, { kind: 'sneak', line: item.line });
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
  badge.textContent = `Sneak preview: line ${pane.sneak.line + 1}, ${item.text} (release to go back)`;
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
  if (pane.outlineFrame) toOutline(pane, { kind: 'sneak', line: null });
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

// The preview's place in its editor pane (docs/plans/executed/PLAN-docking.md 3.4c): at the right (the default), the left,
// above or below the text (above and below the full width of the pane, the splitter setting the height). Per editor
// pane, kept in the window's layout also while the second pane is closed (previewPlace, previewPlace2).
const previewPlaceKey = pane => pane.index ? 'previewPlace2' : 'previewPlace';
const previewPlace = pane => ['left', 'top', 'bottom'].includes(setting(previewPlaceKey(pane))) ? setting(previewPlaceKey(pane)) : 'right';
const setPreviewPlace = (pane, place) => setSetting(previewPlaceKey(pane), place);
function applyPreviewPlace() {
  for (const pane of panes) pane.el.dataset.previewPlace = previewPlace(pane);
  relayout();
}

// The splitter's right-click: the places for its own editor pane.
function previewPlaceMenu(e, pane) {
  e.preventDefault();
  openContextMenu(PREVIEW_PLACES.map(([place, title]) => ({ label: title, checked: previewPlace(pane) === place, plain: true,
    run: () => setPreviewPlace(pane, place) })), e.clientX, e.clientY);
}

function resizeSplit(e) {
  const edge = e.target;
  edge.setPointerCapture(e.pointerId);
  const box = edge.parentElement.getBoundingClientRect(), place = edge.closest('.mm-pane').dataset.previewPlace;
  // The editor's share, measured from its own side: the left (preview at the right), the right, the top, the bottom.
  const at = ev => place === 'left' ? (box.right - ev.clientX) / box.width : place === 'top' ? (box.bottom - ev.clientY) / box.height
    : place === 'bottom' ? (ev.clientY - box.top) / box.height : (ev.clientX - box.left) / box.width;
  const share = ev => Math.round(Math.max(0.1, Math.min(0.9, at(ev))) * 1000) / 1000;
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
  if (tab.csv) return tab.lines = csvLineMap(tab, base);
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
  csvDraw(pane);
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
    tree: state.root ? { open: treeOpen, top: treeTop } : undefined,   // the open folders, the scroll
    activePane: before ? before.activePane : state.activePane,
    hidden: before ? before.hidden : state.hidden,
    ...((before ? before.sync : state.sync) && { sync: true, syncGap: before ? 0 : Math.round((state.syncGap ?? 0) * 100) / 100 }),
    ...(c.compare && { compare: c.compare }), ...(c.folders && { folderCompare: c.folders }),
    ...(clipsPane.floating && { clipsOpen: true }),   // the Clipboards window open: open again at the start
    panes: panes.map((pane, i) => ({   // a compare's saved text (doc.temp) is not kept
      active: kept(pane).indexOf(before ? before.active[i] : pane.active),
      tabs: kept(pane).map(tab => ({
        path: tab.doc.path, draft: tab.doc.draft, mode: c.modes?.get(tab) ?? tab.mode,
        top: pane.active === tab && !pane.el.hidden ? pane.previewEl.scrollTop : tab.previewTop,
        ...(tab.pinned && { pinned: true }), ...(tab.readOnly && { readOnly: true }), ...(tab.hex && { hex: true }), ...(tab.hexChosen && { hexChosen: true }),
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
    return findDraft(id) ?? (saved && Object.assign(makeDoc({ draft: id, text: saved.text }), { draftName: saved.name || null }));
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
      tab.hex ||= !!t.hex;
      tab.hexChosen = !!t.hexChosen;
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
      const answer = await host('closePrompt', { dirty: dirty.map(d => d.path), drafts: drafts.map(docName) });
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
    drafts: drafts.filter(d => docText(d).trim()).map(d => ({ id: d.draft, title: d.draftName || draftTitle(d) })),
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
    '-', { label: 'Manage theme sets...', plain: true, run: () => openToolPane('themesets', 'openThemeSetsWindow') },
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
  const empty = () => panes.every(p => !p.tabs.length);   // no documents here: this window goes when another opens
  const projectItem = p => ({
    label: p.display + (p.mine ? '   (this window)' : ''), plain: true, checked: p.open, sub: [
      { label: 'Open project', plain: true, title: 'All its windows', run: () => host('project', { kind: 'open', project: p.id, empty: empty() }) },
      ...(p.windows.length ? ['-'] : []),
      ...p.windows.map((w, i) => ({
        label: `Window ${i + 1}: ${w.folder ?? '(no folder)'}, ${tabs(w.tabs)}${w.mine ? '   (this window)' : ''}`,
        plain: true, checked: w.open, run: () => host('project', { kind: 'window', key: w.key, empty: empty() }),
      })),
      '-',
      { label: 'New window in this project', plain: true, run: () => host('project', { kind: 'newWindow', project: p.id }) },
      ...(p.open ? [] : [{ label: 'Delete project...', plain: true, run: async () => {
        if (await host('confirm', { text: `Delete the project "${p.display}"? Its files stay; unsaved new documents come back in a window.` }))
          host('project', { kind: 'delete', project: p.id });
      } }]),
    ],
  });
  // Manage, New, Rename, Move this window to, then the projects (docs/plans/executed/PLAN-menu-structure.md: Window > Projects).
  return [
    { label: '&Manage projects...', title: 'All projects in a window: open, close, merge, rename, delete', run: () => openToolPane('projects', 'openProjects') },
    { label: '&New project...', title: 'A new empty window in a new project', run: () => ask('New project', name => host('project', { kind: 'new', name })) },
    { label: '&Rename this project...', run: () => renameProject() },
    { label: '&Move this window to', move: true, sub: [
      ...list.filter(p => !p.mine).map(p => ({ label: p.display, plain: true, run: () => host('project', { kind: 'move', project: p.id }) })),
      ...(list.some(p => !p.mine) ? ['-'] : []),
      { label: 'New project...', plain: true, run: () => ask('Move this window to a new project', name => host('project', { kind: 'move', name })) },
    ] }, '-',
    ...list.map(projectItem),
  ];
}

async function renameProject() {
  const name = await askName('Name of this project', state.project?.name ?? '');
  if (name !== null) host('project', { kind: 'rename', name });
}

// Rename draft (the tab menu, F1): a name for a draft not saved as a file yet, shown in its tab (still italic) and
// offered by Save as. An extension a language pack knows switches the draft to that language. Empty: the id again.
async function renameDraft(doc) {
  if (!doc?.draft) return toast('Only a draft (a new document not saved as a file yet) can be renamed here.', true);
  const name = await askName('Name of this draft (with an extension: its language)', doc.draftName ?? '', doc.draft);
  if (name === null) return;
  if (/[\\/:*?"<>|]/.test(name)) return toast('A name cannot hold \\ / : * ? " < > |', true);
  doc.draftName = name || null;
  host('draftName', { draft: doc.draft, name });
  writeDraft(doc);   // kept with its name, also while still empty
  const language = packExtensions[name.match(/(\.[^.]+)$/)?.[1].toLowerCase()];
  if (language) await setLanguage(doc, language);
  refreshTabs();
  showDocName();
  updateStatus();
}

// Rename (docs/plans/executed/PLAN-rename.md): a file or folder in its folder, from the folder pane (F2, right-click)
// or the tab menu. The name box selects the name without its extension, as Explorer does. The host renames it and
// tells every window (events.renamed); a refusal comes back as its message.
async function renameFile(path, folder = false) {
  if (!path) return;
  const old = nameOf(path), dot = folder ? -1 : old.lastIndexOf('.');
  const name = await askName(folder ? 'New name of the folder' : 'New name of the file', old, '', [0, dot > 0 ? dot : old.length]);
  if (name === null || name === old) return;
  try { await host('rename', { path, name }); }
  catch (e) { toast(e.message); }
}

// A file or folder renamed (renameFile, in this window or another): the documents in it get the new path and stay as
// they are (unsaved edits, undo, cursor, the edit lock); a new extension gives its language unless one was chosen.
// The folder pane follows: its root, its open folders, the selected row.
events.renamed = async ({ from, to }) => {
  const renamed = path => !path ? null : samePath(path, from) ? to
    : path.toLowerCase().startsWith(from.toLowerCase() + '\\') ? to + path.slice(from.length) : null;
  for (const doc of docs) {
    const path = renamed(doc.path);
    if (!path) continue;
    doc.path = path;
    const language = doc.languageChosen ? doc.language : codeLang(path, docText(doc));
    if (language !== doc.language) {
      doc.language = language;
      doc.outline = null;
      doc.headingsVersion = -1;
    }
    for (const tab of tabsOf(doc)) tab.stale = true;
  }
  treeOpen = treeOpen.map(dir => renamed(dir) ?? dir);
  const root = renamed(state.root);
  if (root) {
    state.root = root;
    sendFolderHead();
    syncWatch();
  }
  if (state.root) {
    await loadGit(state.root);
    toFolder({ kind: 'renamed', from, to, root });   // its open folders and cursor follow; it reads the tree again
  }
  syncWatchFiles();
  refreshTabs();
  showDocName();
  updateStatus();
  await showAll();
  saveSession();
};

// Delete... in the folder pane's right-click menu: the host asks (in LexPen's own window, near the row: contextAt) and
// puts what was chosen in the Recycle Bin; the folder pane and the open documents see them gone as any file deleted
// outside LexPen.
async function deleteEntry(path) {
  if (!path) return;
  try {
    const left = await host('delete', { path, at: contextAt });
    if (!left) return;
    if (left.length) toast(`Not deleted (in use, or no rights): ${left.map(nameOf).join(', ')}`);
    refreshTree();
  }
  catch (e) { toast(e.message); }
}

// Asks a name: the text, or null for Cancel / Esc.
// `placeholder`: the hint in the empty field (a project name: a number when left empty).
// select: the part of the value selected, [from, to] (from == to: only the caret there); default all of it.
// lines: a text that may have line breaks (a ribbon button's label): Shift+Enter makes one, Enter is OK.
function askName(title, value, placeholder = 'Empty: a number', select = [0, value.length], lines = false) {
  const dialog = $('.mm-name-dialog'), one = dialog.querySelector('.mm-name-input'), more = dialog.querySelector('.mm-name-text');
  const input = lines ? more : one;
  one.hidden = lines;
  more.hidden = !lines;
  dialog.querySelector('.mm-name-label').textContent = title + (lines ? ' (Shift+Enter: a new line)' : '');
  input.placeholder = placeholder;
  input.value = value;
  dialog.returnValue = '';
  dialog.showModal();
  input.setSelectionRange(...select);
  return new Promise(resolve => {
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok' ? input.value.trim() : null);
      focusPane(panes[state.activePane]);
    }, { once: true });
  });
}
$('.mm-name-dialog .mm-name-cancel').addEventListener('click', () => $('.mm-name-dialog').close('cancel'));
$('.mm-name-dialog .mm-name-text').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('.mm-name-dialog').close('ok'); }   // Shift+Enter: the line break
});

// A dialog of this page (a name asked, Customize, ...) under one of LexPen's floating windows (F1 and the other panes
// in a window of their own: owned by this window, so always above it) moves out from under it: to the place in the
// window they cover least, nearest to where it was. Back where it was when it closes.
const showModalPlain = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
  showModalPlain.call(this);
  avoidToolWindows(this);
};
async function avoidToolWindows(dialog) {
  const px = devicePixelRatio || 1;
  const rects = (await host('toolWindowRects').catch(() => [])).map(r => ({ l: r.x / px, t: r.y / px, r: (r.x + r.w) / px, b: (r.y + r.h) / px }));
  if (!rects.length || !dialog.open) return;
  const box = dialog.getBoundingClientRect(), w = box.width, h = box.height, m = 8;
  // The part of the dialog at x, y that the windows cover (they may overlap each other: an upper bound is enough).
  const covered = (x, y) => rects.reduce((a, r) => a + Math.max(0, Math.min(x + w, r.r) - Math.max(x, r.l)) * Math.max(0, Math.min(y + h, r.b) - Math.max(y, r.t)), 0);
  let best = [box.left, box.top], bestArea = covered(box.left, box.top), bestDist = 0;
  if (!bestArea) return;
  for (let y = m; y + h <= innerHeight - m; y += 8)
    for (let x = m; x + w <= innerWidth - m; x += 8) {
      const area = covered(x, y), dist = Math.hypot(x - box.left, y - box.top);
      if (area < bestArea || area === bestArea && dist < bestDist) [best, bestArea, bestDist] = [[x, y], area, dist];
    }
  const free = best;
  if (free[0] === box.left && free[1] === box.top) return;
  const was = dialog.style.cssText;
  Object.assign(dialog.style, { margin: '0', inset: `${Math.round(free[1])}px auto auto ${Math.round(free[0])}px` });
  dialog.addEventListener('close', () => { dialog.style.cssText = was; }, { once: true });
}

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
  if (typeof pdfTellAll === 'function') requestAnimationFrame(pdfTellAll);   // a PDF follows the preview's colours (pdfview.js)
  for (const pane of panes) {
    themePane(pane.editorEl, look.editor);
    themePane(pane.previewEl, look.preview);
    if (typeof scheduleOverview === 'function') scheduleOverview(pane);   // the overviews draw in the pane's colours
  }
  applyHighlight();   // after the editor's own theme: its colour is measured from its background
  applyInlineCode();   // after the editor's and the preview's own themes: the box is measured from their background
  applyDockTabs();
  if (typeof applyPreviewHighlight === 'function') applyPreviewHighlight();   // highlights.js: the same for the highlights
  if (!before) state.theme = root.dataset.theme = look.mode;   // at start, before anything is shown
  else if (look.mode !== state.theme) applyTheme(look.mode);   // the mode: tab colour rules, diagrams
  lookToPanes();   // the panes' pages: the same colours
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
  refreshTree(false);   // known file types (knownFile) may have changed
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
    showFolderView();
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

// A compare from Explorer in this window (the project for comparing, docs/plans/executed/PLAN-compare-project.md): as
// starting one here, a compare already running ends first; the files of the old one stay as tabs.
events.compare = async ({ left, right, folders }) => {
  if (folders) startFolderCompare(left, right); else await startCompare({ path: left }, { path: right });
};

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
  // The docking too (docs/plans/executed/PLAN-docking.md 3.12): the shipped one, this window's windows of their own closed.
  for (const kind of await host('toolWindowsOpen').catch(() => [])) host('closeToolWindow', { kind });
  layoutOwn = { ...layout };
  mergeLayout();
  applySettings();
  layoutChanged();
  await showAll();
  saveSession();
};

events.open = async ({ folder, files, edit }) => {
  if (folder) {
    await openFolder(folder);
    if (!folderPane.floating) setSidebar(true);
  }
  for (const path of files || []) await (edit ? editFile(path) : goToOrOpen(path)).catch(e => toast(e.message));
};

// Edit in LexPen: the file in the editor, whatever its language opens in; a tab it has already in the preview only gets
// the editor (in split view it has one).
async function editFile(path, last = false) {
  const tab = await goToOrOpen(path, { mode: 'edit', last });
  // A kind that is not text (a PDF) has no editor: as View in LexPen (its tab is always its preview).
  if (tab?.doc.pdf) { if (!!tab.readOnly !== !!setting('viewReadOnly')) await setReadOnly(tab, !!setting('viewReadOnly')); return tab; }
  if (tab?.mode === 'preview') {
    tab.mode = 'edit';
    await showActive(paneOf(tab));
    focusPane(paneOf(tab));
  }
  return tab;
}

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
let contextAt = null;          // where it was right-clicked, on the screen (host cursorAt): Delete... asks near it
// The folder pane marks the row right-clicked (folder-pane.js, menuSubject) until a click or key here outside a menu,
// or this window is activated again (after a question such as Delete...'s).
let folderMenuSubject = false;
function folderMenuDone() {
  if (!folderMenuSubject) return;
  folderMenuSubject = false;
  toFolder({ kind: 'menuDone' });
}
events.windowActivated = folderMenuDone;
for (const type of ['pointerdown', 'keydown'])
  addEventListener(type, e => { if (!e.target.closest?.('.mm-menu')) folderMenuDone(); }, true);

// A right-click menu takes the keys while it is open (Up / Down, Home / End, Enter, Right on Copy name, Esc), the
// focus going back where it was after (`keys` false: a menu drawn by the floating pane, this one only filled). Its
// item marked is the one the pointer moves over, or the keys go to; none as it opens. Not :hover: the page keeps the
// pointer's last place over a menu, so a menu opened elsewhere showed the item that is now at that place.
let contextFrom = null;   // what had the focus as the menu opened
function showMenu(menu, e, remember, keys = true) {
  e.preventDefault();
  hideMenus();
  remember();
  menu.hidden = false;
  menu.style.left = Math.min(e.clientX, innerWidth - menu.offsetWidth - 4) + 'px';
  menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 4) + 'px';
  menu.querySelector('button.mm-sel')?.classList.remove('mm-sel');
  if (!keys) return;
  contextFrom = document.activeElement;
  menu.tabIndex = -1;
  menu.focus({ preventScroll: true });
}
function hideMenus() {
  const had = document.activeElement?.closest?.('.mm-context');
  for (const menu of document.querySelectorAll('.mm-context')) menu.hidden = true;   // the folder compare's too (compare.js)
  if (had) contextMenuDone();
}
// Closed: the focus back where it was, unless its item put it elsewhere (Rename...'s field).
function contextMenuDone() {
  const from = contextFrom;
  contextFrom = null;
  if (document.activeElement !== document.body && !document.activeElement?.closest('.mm-context')) return;
  if (from === folderPane.frame) focusFolder();
  else from?.focus?.({ preventScroll: true });
}
function markMenuItem(menu, button, byMouse) {
  const old = menu.querySelector('button.mm-sel');
  if (old === button) return;
  old?.classList.remove('mm-sel');
  button?.classList.add('mm-sel');
  // By the pointer: Copy name's items open beside it; another item closes them.
  if (!byMouse) return;
  if (button?.classList.contains('mm-copy-name')) copyNameFlyout(button);
  else if (menuBar.fromContext) closeMenus();
}
// Its pointer and focus handling, for each right-click menu of this page (the folder compare's: compare.js).
function contextMenuBehaviour(menu) {
  menu.addEventListener('mousemove', e => {
    const b = e.target.closest('button');
    if (b) markMenuItem(menu, b.disabled ? null : b, true);
  });
  menu.addEventListener('mouseleave', () => { if (!menuBar.fromContext) markMenuItem(menu, null); });
  // The focus gone elsewhere (another pane, docked or floating; another program): it closes, the focus staying there.
  // Once the focus has settled: Esc in Copy name's items, a click on an item, keep it in the menu or close it anyway.
  menu.addEventListener('focusout', () => setTimeout(() => {
    if (menu.hidden || document.hasFocus() && menu.contains(document.activeElement)) return;
    contextFrom = null;
    if (menuBar.fromContext) closeMenus();
    hideMenus();
    folderMenuDone();
  }));
}
for (const menu of [ui.treeMenu, ui.tabMenu, ui.stripMenu, ui.dividerMenu]) contextMenuBehaviour(menu);
addEventListener('keydown', e => {
  const menu = document.activeElement?.closest?.('.mm-context');
  if (!menu || menu.hidden || e.defaultPrevented || ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  e.preventDefault();
  e.stopPropagation();
  const items = [...menu.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled);
  const at = items.indexOf(menu.querySelector('button.mm-sel')), sel = items[at];
  switch (e.key) {
    case 'ArrowDown': return markMenuItem(menu, items[(at + 1) % items.length]);
    case 'ArrowUp': return markMenuItem(menu, items[at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length]);
    case 'Home': return markMenuItem(menu, items[0]);
    case 'End': return markMenuItem(menu, items.at(-1));
    case 'ArrowRight': case 'Enter': case ' ':
      if (sel?.classList.contains('mm-copy-name')) return copyNameFlyout(sel, true);
      if (!sel || e.key === 'ArrowRight') return;
      sel.click();
      return contextMenuDone();
    case 'Escape': return hideMenus();
  }
}, true);

// Right-click on a tree row: copy its path, absolute or relative to the open folder.
// The click that brings a window that was not in front back (setting ignoreActivationClick): it only brings the
// window to the front. After the window lost the focus, the next press that comes with the focus back (before it, or
// just after it) goes no further: its press, release and click are stopped before anything sees them (on the window,
// in the capture phase). The title bar is Windows' own and works at once.
// A double (or triple) click to bring the window back: every press, release, click and dblclick until Windows'
// double-click time has passed after the last of them is stopped as well, wherever it lands, so it does not act as a
// single click or as a double click (the outline and the preview act on dblclick); a click after that acts at once.
// With the setting logActivationClicks (off; for checking it), each one stopped is in View > Messages.
const activation = { away: false, back: 0, until: 0, double: 500 };
host('doubleClickTime').then(ms => { if (ms > 0) activation.double = ms; }).catch(() => {});
addEventListener('blur', () => { activation.away = true; });
addEventListener('focus', () => { activation.back = performance.now(); });
addEventListener('keydown', () => { activation.away = false; activation.until = 0; }, true);   // back by the keys (Alt+Tab): not a click
// A floating pane window of this window (PaneForm.cs) got the focus, or lost it to this window: going there and back is
// not coming back from elsewhere, so the click back here acts. It lost the focus to another program: that is away.
events.paneWindowFocus = ({ id, active, toOwner }) => {
  activation.away = !active && !toOwner;
  if (id === 'sort' && typeof sortFocused === 'function') sortFocused(active);   // its key lines (sort.js)
  paneWindowActive = active;   // the document's dimmed frame and steady cursor while it has the focus (placeFocusRing)
  placeFocusRing();
};
const activationEating = () => performance.now() < activation.until;
addEventListener('pointerdown', e => {
  const now = performance.now();
  const first = activation.away && (!document.hasFocus() || now - activation.back < 500);
  activation.away = false;
  if ((!first && !activationEating()) || setting('ignoreActivationClick') === false) return;
  if (first && setting('logActivationClicks')) logMessage('A click that brought the window to the front was ignored (Options > Settings, App)', true);
  activation.until = now + activation.double;
  e.preventDefault();   // no mousedown, mouseup after it
  e.stopImmediatePropagation();
}, true);
for (const type of ['mousedown', 'mouseup', 'pointerup', 'click', 'dblclick', 'auxclick', 'contextmenu'])
  addEventListener(type, e => {
    if (!activationEating()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (type === 'pointerup') activation.until = performance.now() + activation.double;   // a next press may follow
  }, true);

// The right-click menu of a row in the Folder pane's page (`row`: its path and kind, as its page sends them), at x, y
// in this page.
function openTreeMenu(row, x, y, keys = true) {
  showMenu(ui.treeMenu, { clientX: x, clientY: y, preventDefault() {} }, () => {
    contextPath = row.path;
    contextKind = row.dir || row.base ? 'folders' : 'files';
    favouriteItem(ui.treeMenu, contextPath, contextKind);   // favourites.js
    ui.treeMenu.querySelector('[data-cmd=treeRename]').hidden = row.up || row.gone;
    ui.treeMenu.querySelector('[data-cmd=treeDelete]').hidden = row.up || row.gone || row.base;
    ui.treeMenu.querySelector('[data-cmd=treePrint]').hidden = row.up || row.gone || contextKind !== 'files';
    ui.treeMenu.querySelector('[data-cmd=treeSetRoot]').hidden = contextKind !== 'folders' || samePath(contextPath, state.root);
    // The compare (compare.js): a file with the file in the editor or a picked one; a folder with a picked folder.
    const active = activeDoc()?.path, file = contextKind === 'files';
    ui.treeMenu.querySelector('[data-cmd=treeCompareActive]').hidden = !file || !active || samePath(active, contextPath);
    ui.treeMenu.querySelector('[data-cmd=treeCompareWith]').hidden = !file;
    ui.treeMenu.querySelector('[data-cmd=treeCompareFolder]').hidden = file;
    leftSideItems(ui.treeMenu, 'tree', contextPath, !file);   // compare.js: the left side to compare
    gitCompareItems(ui.treeMenu, 'tree', row.up ? null : contextPath, file && !!findDoc(contextPath)?.dirty);
    // The backups LexPen made (plan 33): a file's own (it has the dot); a folder's, asked of the host (below it too).
    const one = ui.treeMenu.querySelector('[data-cmd=treeDeleteBackup]'), all = ui.treeMenu.querySelector('[data-cmd=treeDeleteBackups]');
    one.hidden = !file || !row.backup;
    one.textContent = `Delete ${nameOf(contextPath)}.bak`;
    // A CSV's definition next to it (plan 29): its file deleted, LexPen keeps the definition (csvview.js).
    const cols = ui.treeMenu.querySelector('[data-cmd=treeDeleteColumns]');
    cols.hidden = !file || !row.columns;
    // Said as what stays, not as a file most do not know: LexPen keeps the settings, only the file goes.
    cols.textContent = `Keep column settings of ${nameOf(contextPath)} in LexPen only`;
    cols.title = `Deletes ${nameOf(contextPath)}-metadata.json next to it (Recycle Bin); LexPen keeps the settings`;
    all.hidden = true;
    const asked = contextPath;
    if (!file && !row.up && !row.gone)
      host('hasBackups', { path: asked }).then(has => { if (contextPath === asked) all.hidden = !has; }).catch(() => {});
    const path = contextPath;
    copyNameFor = () => copyNameItems(path, !file);
  }, keys);
}
document.addEventListener('contextmenu', e => {
  if (!e.target.closest('.mm-tabs, .mm-divider, .mm-fcmp')) hideMenus();   // those open their own menu
});

// The backups LexPen made (plan 33, Backups.cs): a file's own (no question), or a folder's after the question (here,
// or with its subfolders). To the Recycle Bin; the folder pane shows them gone.
async function deleteBackups(path, folder = false) {
  let subfolders = false;
  if (folder) {
    const how = await host('askBackups', { path });
    if (!how) return;
    subfolders = how === 'all';
  }
  const { deleted, left } = await host('deleteBackups', { path, subfolders });
  const said = [deleted ? `${deleted} .bak file${deleted === 1 ? '' : 's'} deleted (Recycle Bin)` : 'No .bak files deleted',
    left.length && `not deleted: ${left.map(nameOf).join(', ')}`].filter(Boolean);
  toast(said.join('; ') + '.', !left.length);
  await refreshTree(false);
}

function relativePath(path) {
  if (!state.root) return path;
  const base = state.root.replace(/\\$/, '') + '\\';   // the root may be a drive, "D:\"
  return path.toLowerCase().startsWith(base.toLowerCase()) ? path.slice(base.length) : path;
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  toast('Copied ' + text, true);
}

// Copy name to Windows clipboard (plan 37, action file.copy): a part of a file's or folder's path. name: without its
// last extension; nameExt: with it; dir: its folder (a drive or a share with its \); full: all of it; relDir and
// relFull: as dir and full, relative to the folder pane's root (outside it: as they are; in the root itself, relDir
// is empty). A folder as a file; a drive (D:\) is its own name.
function pathPart(path, part, root = state.root) {
  const full = path.length > 3 ? path.replace(/\\$/, '') : path;
  const cut = full.lastIndexOf('\\');
  let dir = cut < 0 ? '' : full.slice(0, cut);
  if (/^[A-Za-z]:$/.test(dir) || /^\\\\[^\\]*$/.test(dir)) dir += '\\';   // D:\a.md -> D:\, \\server\a.md -> \\server\
  const nameExt = full.slice(cut + 1) || full, dot = nameExt.lastIndexOf('.');
  const base = root ? root.replace(/\\$/, '') + '\\' : null;
  const inRoot = !!base && full.toLowerCase().startsWith(base.toLowerCase());
  const relFull = inRoot ? full.slice(base.length) : full;
  const relDir = inRoot ? relFull.slice(0, Math.max(0, relFull.lastIndexOf('\\'))) : dir;
  return { name: dot > 0 ? nameExt.slice(0, dot) : nameExt, nameExt, dir, full, relDir, relFull }[part];
}

async function copyName(part, path) {
  if (!path) return;
  const text = pathPart(path, part);
  if (text) return copyText(text);
  await navigator.clipboard.writeText('');
  toast(`Copied an empty path: ${nameOf(path)} is in the root of the folder pane`, true);
}

// Its six items, for the active document (no path) or for `path` (a file or a folder).
function copyNameItems(path, folder) {
  const [w, W] = folder ? ['folder', 'Folder'] : ['file', 'File'];
  const item = (label, part) => path === undefined ? [label, 'file.copy', part] : [label, 'file.copy', part, path];
  return [item(`&${W}name`, 'name'), item(`${W}name.&ext`, 'nameExt'), '-', item('&Path', 'dir'), item(`Path &and ${w}name.ext`, 'full'), '-',
    item('&Relative path', 'relDir'), item(`Relative path a&nd ${w}name.ext`, 'relFull')];
}

// The Copy name item of a right-click menu (the folder pane's, a tab's): its items beside it, as a submenu of the menu
// bar (menus.js), on hover or click. A choice there closes the right-click menu too.
let copyNameFor = null;   // menu -> () => its items, as the menu was opened
// By the pointer (markMenuItem) or the keys (`select`: its first item marked, the keys there).
function copyNameFlyout(button, select = false) {
  if (button.disabled) return;
  const r = button.getBoundingClientRect();
  closeMenus();
  menuBar.fromContext = true;
  openMenuLevel(copyNameFor(), r.right - 2, r.top - 5, select, false, button.parentElement.getBoundingClientRect().left);
}
for (const menu of [ui.treeMenu, ui.tabMenu]) {
  const button = menu.querySelector('.mm-copy-name');
  button.menuItems = () => copyNameFor();   // the floating folder pane draws them itself (panechannel.js menuThere)
  button.addEventListener('click', () => copyNameFlyout(button));
}

// Tree filter: all files, or the known file types only (knownFile: a language pack has the extension; folders always
// stay).
function setKnownOnly(on) {
  document.body.dataset.tree = on ? 'known' : 'all';
  keepLayout('tree', on ? 'known' : 'all');
  sendFolderHead();   // its page hides the other file types (app.css, body[data-tree=known])
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
  setPinned(tab, !tab.pinned);
}
// Pinned or not; pinned tabs stand first in their pane's order, the others after them, each part in its order (a tab
// pinned goes after the pinned ones, one unpinned before the others unless it was dropped among them: stripAt).
function setPinned(tab, on) {
  const pane = paneOf(tab);
  tab.pinned = on;
  if (pane) pane.tabs.splice(0, pane.tabs.length, ...pane.tabs.filter(t => t.pinned), ...pane.tabs.filter(t => !t.pinned));
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
  if ((changed('csvMaxWidth') || changed('csvStickyHeader')) && 'csvMaxWidth' in was)
    for (const tab of allTabs()) if (tab.doc.language === 'csv') { tab.doc.csv = null; if (paneOf(tab)?.active === tab) render(tab); else tab.stale = true; }
  if (changed('previewColourMaxSize') && 'previewColourMaxSize' in was)   // the code previews coloured again, or not
    for (const tab of allTabs()) if (tab.doc.language) { if (paneOf(tab)?.active === tab && tab.mode !== 'edit') render(tab); else tab.stale = true; }
  if (['csvStripes', 'csvStripeColour', 'csvStripeIntensity'].some(changed)) applyCsvStripes(now);   // a CSV's alternate rows
  if (changed('pdfThreshold') && 'pdfThreshold' in was && typeof pdfTellAll === 'function') pdfTellAll();   // pdfview.js
  if (changed('previewWrap')) document.body.toggleAttribute('data-preview-nowrap', now.previewWrap === false);
  if (changed('showBackupFiles') && 'showBackupFiles' in was) refreshTree(false);
  if (changed('tabBar')) applyTabBar(now.tabBar);
  if (changed('pinnedTabs')) refreshTabs();   // plan 49
  if (['commandBar', 'ribbonGroupNames', 'ribbonLabelWidth', 'altOpens', 'ribbonShow', 'ribbonRow'].some(changed) && typeof renderRibbon === 'function') renderRibbon();
  if (['hexBytesPerLine', 'hexGroup'].some(changed) && typeof hexRedrawAll === 'function') hexRedrawAll();
  if (changed('dockTabBar')) document.body.dataset.dockTabBar = now.dockTabBar;
  if (changed('previewPlace') || changed('previewPlace2')) applyPreviewPlace();
  if (changed('dockTabIntensity')) applyDockTabs();
  if (changed('scrollTogether')) { takeDistance(); layout(); }
  if ((changed('outlineMerged') || changed('outlineBullets')) && 'outlineMerged' in was)
    for (const pane of panes) { pane.outlineFor = null; showOutline(pane); }   // the outline drawn again
  if (changed('findMark') || changed('findGutter')) {   // app.css: how matches look; boxes and line numbers: find.js
    document.body.dataset.findMark = now.findMark || 'background';
    if (typeof refreshMarks === 'function') for (const pane of panes) if (pane.find?.marked) refreshMarks(pane);
  }
  if (changed('gutter.occurrences') && 'gutter.occurrences' in was && typeof paintOccGutter === 'function')
    for (const pane of panes) paintOccGutter(pane);   // occurrences.js: the line numbers
  if (changed('occurrences.bar') && 'occurrences.bar' in was && typeof applyOccBarSetting === 'function')
    for (const pane of panes) applyOccBarSetting(pane);   // occurrences.js: shown or closed now
  if (changed('occurrences.mark') || changed('occurrences.first')) {   // app.css: how occurrences look; occurrences.js
    document.body.dataset.occMark = now['occurrences.mark'] || 'background';
    document.body.dataset.occFirst = now['occurrences.first'] || 'underline';
    if (typeof refreshOccurrences === 'function') for (const pane of panes) refreshOccurrences(pane);
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
  if (['sortPreviewLines', 'sortPreviewWarn'].some(n => changed(n) && n in was) && typeof sortSend === 'function') sortSend();   // sort.js
  if (['highlightStyle', 'highlightColour', 'highlightIntensity'].some(changed)) applyHighlight();
  if (changed('inlineCodeIntensity')) applyInlineCode();
  if (['previewHighlightStyle', 'previewHighlightColour', 'previewHighlightIntensity'].some(changed) && typeof applyPreviewHighlight === 'function') applyPreviewHighlight();
  // compare.js, loaded after this file: at the start the settings can be here before it is.
  if (['compareWhitespace', 'compareCase', 'compareStrip', 'compareStep'].some(changed) && typeof onCompareSettings === 'function') onCompareSettings();
  if (['overviewWidth', 'overview.find', 'overview.changes', 'overview.git', 'overview.bookmarks', 'overview.highlights', 'overview.occurrences'].some(changed) && typeof schedulePreviewOverviews === 'function')
    schedulePreviewOverviews();   // the preview's scroll bar
  if (['overview', 'overviewWidth', 'overview.find', 'overview.changes', 'overview.git', 'overview.bookmarks', 'overview.occurrences', 'gutter.changes', 'gutter.git', 'gutter.highlights'].some(changed)
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
  if (changed('tree')) setKnownOnly(now.tree === 'known' || now.tree === 'md');   // md: the markdown filter before
  if (changed('outline') || changed('outline2')) applyOutlines();
  if (changed('editShare')) setSplit(now.editShare || null);
  // The layout of before the dock areas: its sideView the left group's pane in front, once (docks has its own then).
  if (changed('sideView') && !layoutOwn.docks && 'sideView' in layoutOwn) setSideView(now.sideView === 'search' ? 'search' : 'folder');
  if (changed('docks')) renderDocks();
  if (changed('searchScope') && ['file', 'open', 'folder'].includes(now.searchScope)) searchUi.scope.value = now.searchScope;
  if (changed('sort') || changed('sortDesc')) { showSort(); if ('sort' in was) refreshTree(); }
  if (changed('treeHidden') && 'treeHidden' in was) { sendFolderHead(); refreshTree(); }
  if (changed('treeSize')) sendFolderHead();
  if (changed('orient') || changed('ratio')) {
    state.orient = now.orient === 'h' ? 'h' : 'v';
    state.ratio = +now.ratio || 50;
    if ('orient' in was) { layout(); relayout(); }
  }
  if (changed('sidebar') && 'sidebar' in was && state.root) setSidebar(!!now.sidebar);
}

// A width of the layout in px (0: the standard one, app.css).
function layoutWidth(property, px, el = document.body) {
  if (px > 0) el.style.setProperty(property, px + 'px');
  else el.style.removeProperty(property);
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
  if (ls.tree) values.tree = ls.tree === 'md' || ls.tree === 'known' ? 'known' : 'all';
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

// The left dock area open or closed (the layout's `sidebar`, as before the dock areas).
function setSidebar(visible) {
  document.body.dataset.sidebar = visible ? 'on' : 'off';
  keepLayout('sidebar', visible);
  renderDocks();
}

async function openRecent(list, path, missing) {
  if (missing) {
    host('recentRemove', { path });
    return toast(`${path} no longer exists; removed from the list.`, true);
  }
  if (list === 'folders') {
    await openFolder(path);
    if (!folderPane.floating) setSidebar(true);
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
    if (!folderPane.floating) setSidebar(true);   // floating: its own window shows it
  },
  newFile,
  save: () => activeDoc() && saveDoc(activeDoc()).then(refocus),
  saveAs: () => activeDoc() && saveDoc(activeDoc(), true).then(refocus),
  sidebar: () => setSidebar(document.body.dataset.sidebar === 'off'),
  refresh: refreshTree,
  knownOnly: () => setKnownOnly(document.body.dataset.tree !== 'known'),
  hiddenFiles() { keepLayout('treeHidden', !setting('treeHidden')); sendFolderHead(); refreshTree(); },
  fileSizes() { keepLayout('treeSize', !setting('treeSize')); sendFolderHead(); },
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
  outline: () => toggleOutline(panes[state.activePane]),
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
  tabShowInTree: () => menuTab && showInTree(menuTab.doc.path),
  tabRename: () => menuTab && renameFile(menuTab.doc.path),
  tabRenameDraft: () => menuTab && renameDraft(menuTab.doc),
  tabClose: () => menuTab && closeTab(menuTab),
  // The compare (compare.js): this tab on the left.
  async tabCompareWith() {
    const tab = menuTab, [path] = await host('pickFile', { one: true }) ?? [];
    if (tab && path) startCompare({ tab }, { path });
  },
  tabCompareOther: () => menuTab && startCompare({ tab: menuTab }, { tab: panes[1 - menuPaneIndex].active }),
  tabCompareSaved: () => menuTab && startCompare({ saved: menuTab.doc }, { tab: menuTab }),
  tabCompareLeft: () => menuTab?.doc.path && selectLeftSide(menuTab.doc.path),
  // Compare with git (compare.js): the last commit, or a version picked from a menu where the tab menu was.
  tabCompareGit: () => menuTab?.doc.path && startGitCompare(menuTab.doc.path),
  tabCompareGitVersion: () => menuTab?.doc.path && gitVersionMenu(menuTab.doc.path, false, parseInt(ui.tabMenu.style.left), parseInt(ui.tabMenu.style.top)),
  tabCompareTo: () => menuTab && compareToLeftSide({ tab: menuTab }, false),
  tabCloseOthers: () => menuTab && closeTabs(paneOf(menuTab).tabs.filter(t => t !== menuTab)),
  tabCloseRight: () => menuTab && closeTabs(paneOf(menuTab).tabs.slice(paneOf(menuTab).tabs.indexOf(menuTab) + 1)),
  tabCloseLeft: () => menuTab && closeTabs(paneOf(menuTab).tabs.slice(0, paneOf(menuTab).tabs.indexOf(menuTab))),   // pinned ones stay
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
  treeDeleteBackup: () => deleteBackups(contextPath),
  treeDeleteBackups: () => deleteBackups(contextPath, true),
  treeDeleteColumns: () => csvDeleteBeside(contextPath),
  favouriteToggle: () => toggleFavourite(activeDoc()?.path),
  tabFavourite: () => menuTab && toggleFavourite(menuTab.doc.path),
  treeFavourite: () => toggleFavourite(contextPath, contextKind),
  treeRename: () => renameFile(contextPath, contextKind === 'folders'),
  treePrint: async () => { await loadScript('printsource.js'); await printPath(contextPath); },   // without opening it in a tab
  treeDelete: () => deleteEntry(contextPath),
  // The folder becomes the tree's root; its subfolders that were open stay open.
  treeSetRoot: () => {
    const under = contextPath.replace(/\\$/, '').toLowerCase() + '\\';
    return openFolder(contextPath, treeOpen.filter(dir => dir.toLowerCase().startsWith(under)));
  },
  treeCompareActive: () => activeTab() && startCompare({ tab: activeTab() }, { path: contextPath }),
  async treeCompareWith() {
    const left = contextPath, [right] = await host('pickFile', { one: true, at: left }) ?? [];
    if (right) startCompare({ path: left }, { path: right });
  },
  treeCompareLeft: () => selectLeftSide(contextPath),
  treeCompareGit: () => contextKind === 'folders' ? startFolderCompare(contextPath, contextPath, { rev: 'HEAD', label: 'HEAD' }) : startGitCompare(contextPath),
  treeCompareGitVersion: () => gitVersionMenu(contextPath, contextKind === 'folders', parseInt(ui.treeMenu.style.left), parseInt(ui.treeMenu.style.top)),
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
  else if (button?.dataset.pinnedTabs) setSetting('pinnedTabs', button.dataset.pinnedTabs);   // the tab menus' Pinned tabs choice
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
  // After every script of the page has run: the ones after this file add actions the keys name (macros.js), and
  // served from the exe they come in one by one, while this runs on.
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  registerDockPanes();
  initDocks();   // docks.js: the panes in their dock areas
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
  loadRibbon();   // ribbon.js: shown as the window's layout says (commandBar)
  host('settingDefs', { defs: settingDefs() });   // the rows of the settings window
  Object.assign(clips, await host('clipState').catch(() => ({})));   // the Windows clipboard busy elsewhere: no previews
  await loadFindHistory();   // history.js
  toSearch({ kind: 'history', lists: findHistory });
  buildMenuBar();
  showKeys();
  state.win = start.id;
  setRole(start);
  setProject(start.project);
  setTabColours(start.tabColours);
  const session = start.restore;
  const root = start.folder ?? session?.root ?? null;

  document.body.dataset.sidebar = setting('sidebar') ? 'on' : 'off';
  renderDocks();
  // The tree as it was: its open folders and scroll position (when it is the session's folder).
  const tree = root && session?.root === root && session.tree && typeof session.tree === 'object' ? session.tree : null;
  if (root) await openFolder(root, Array.isArray(tree?.open) ? tree.open : [], { top: Number.isFinite(tree?.top) ? tree.top : 0 }).catch(() => {});
  if (start.restore !== undefined || start.drafts) await restore(session, start.drafts || []);
  // The panes that floated when the window closed float again (docs/plans/executed/PLAN-docking.md 3.13); not Characters (its
  // window is one for LexPen; floating says only how Insert character opens it).
  for (const [id, p] of dockPanes) if (dockModel().state[id] === 'floating' && !p.floatsOnCall) p.channel.float();
  // Clipboards: its window only when it was open as the window closed (closed by hand it stays floating, not open).
  if (session?.clipsOpen && dockModel().state.clips === 'floating') openClipboardsPane().catch(() => {});
  // View in LexPen (docs/plans/executed/PLAN-view-window.md): the files in the preview, the folder in the Folder pane.
  // A window of a project opened again for them (it was closed): the files after its tabs as they were.
  const reopened = start.restore !== undefined && start.restore !== null;
  for (const path of start.files) await (start.view ? viewFile(path, reopened) : start.edit ? editFile(path, reopened) : goToOrOpen(path, { last: reopened })).catch(e => toast(e.message));
  if (start.view && start.folder) showFolderView();
  syncWatch();
  syncWatchFiles();
  await showAll();
  // The keys act on the file shown last right away.
  if (panes[state.activePane].active) focusPane(panes[state.activePane]);
  started = true;
  host('layoutShown', { layout: windowLayout() });   // what it shows from the start (another window may take it: Use layout of...)
  // --compare (compare.js): two files side by side, or two folders in the folder pane.
  if (start.compare) {
    const { left, right, folders } = start.compare;
    if (folders) startFolderCompare(left, right); else await startCompare({ path: left }, { path: right });
  } else if (session) await restoreCompare(session.compare, session.folderCompare);   // the compare it was in
  if (gitWaiting) loadGitLater(gitWaiting);
  saveSession();
  host('layoutShown', { layout: windowLayout() });   // for this window's settings window
})());
